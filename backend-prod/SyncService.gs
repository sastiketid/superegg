// ==========================================
// SINKRON DATABASE (VPS) <-> SPREADSHEET
// ==========================================
// Sejak migrasi, database Postgres di VPS = sumber data utama. Spreadsheet jadi cerminan:
// - DB -> Sheet : API VPS memanggil syncDariDb untuk tiap perubahan (snapshot baris penuh,
//                 jadi aman diulang), sekalian upload foto ke Drive seperti dulu.
// - Sheet -> DB : edit manual di MASTER_WARUNG ditangkap onEdit (simple trigger, tanpa izin
//                 tambahan) ke sheet antrian tersembunyi, lalu ditarik API lewat ambilEditSheet.
//                 Hapus/pindah baris manual TIDAK ikut tersinkron -- stop toko lewat aplikasi.
// Semua aksi di sini wajib bawa data.secret === SYNC_SECRET (Secret.gs, tidak masuk git).

const SHEET_NAME_ANTRIAN = "_SINKRON";
const COL_ENDCUST_ID = 7;  // G - ID DB (ditambah saat migrasi)
const COL_HUTANG_ID = 8;   // H - ID DB (ditambah saat migrasi)

function cekSecretSinkron(data) {
  return typeof SYNC_SECRET === 'string' && SYNC_SECRET.length >= 16 && data && data.secret === SYNC_SECRET;
}

// ---------- konversi baris MASTER_WARUNG <-> objek toko ----------

function isoAtauKosong(v) {
  return v instanceof Date && !isNaN(v) ? v.toISOString() : "";
}

function barisMasterKeToko(r) {
  return {
    id: String(r[COL_MASTER_ID - 1] || "").trim(),
    nama: String(r[COL_MASTER_NAMA - 1] || "").trim(),
    pemilik: String(r[COL_MASTER_PEMILIK - 1] || ""),
    hp: String(r[COL_MASTER_HP - 1] || ""),
    latlong: String(r[COL_MASTER_LATLONG - 1] || ""),
    riwayatTerjual: Number(r[COL_MASTER_RIWAYAT_TERJUAL - 1]) || 0,
    stok: Number(r[COL_MASTER_STOK_SEKARANG - 1]) || 0,
    kirimTerakhir: isoAtauKosong(r[COL_MASTER_KIRIM_TERAKHIR - 1]),
    setoranTerakhir: Number(r[COL_MASTER_SETORAN_TERAKHIR - 1]) || 0,
    riwayatSetoran: Number(r[COL_MASTER_RIWAYAT_SETORAN - 1]) || 0,
    riwayatSisa: Number(r[COL_MASTER_RIWAYAT_SISA - 1]) || 0,
    sisaTerakhir: Number(r[COL_MASTER_SISA_TERAKHIR - 1]) || 0,
    keterangan: String(r[COL_MASTER_KETERANGAN - 1] || ""),
    fotoTerakhir: String(r[COL_MASTER_FOTO_TERAKHIR - 1] || ""),
    folderFoto: String(r[COL_MASTER_FOLDER_FOTO - 1] || ""),
    jadwal: String(r[COL_MASTER_JADWAL - 1] || ""),
    totalKirim: Number(r[COL_MASTER_TOTAL_KIRIM - 1]) || 0
  };
}

// Kolom B..Q (A = formula No, R = ID ditulis terpisah)
function tokoKeBarisMaster(t) {
  return [
    t.nama, t.pemilik, t.hp, t.latlong,
    t.riwayatTerjual, t.stok, t.kirimTerakhir ? new Date(t.kirimTerakhir) : "",
    t.setoranTerakhir, t.riwayatSetoran, t.riwayatSisa, t.sisaTerakhir,
    t.keterangan, t.fotoTerakhir, t.folderFoto, t.jadwal, t.totalKirim
  ];
}

// Tulis nilai ke baris ber-ID tertentu; kalau ID belum ada, tambah baris baru. Idempoten.
// kolomTeks: kolom yang wajib teks polos (No HP) -- tanpa ini Sheets mengubah "0896..." jadi angka
// 896... (nol di depan hilang). Formatnya dipasang SEBELUM nilai ditulis.
function tulisBarisById(sheet, kolomId, id, kolomAwal, nilai, kolomTeks) {
  let row = cariBarisById(sheet, kolomId, id);
  if (row === -1) {
    row = sheet.getLastRow() + 1;
    sheet.getRange(row, kolomId).setValue(id);
  }
  (kolomTeks || []).forEach(k => sheet.getRange(row, k).setNumberFormat('@'));
  sheet.getRange(row, kolomAwal, 1, nilai.length).setValues([nilai]);
  return row;
}

function uploadFotoToko(t, fotoBase64, namaFile, folderUrlSheet) {
  const folder = ambilOrBuatFolderToko(DRIVE_FOLDER_ID_BUKTI_V2, t.nama, folderUrlSheet || t.folderFoto);
  const file = uploadFotoBase64(folder, fotoBase64, namaFile);
  return { fotoTerakhir: file.getUrl(), folderFoto: folderUrlSheet || t.folderFoto || folder.getUrl() };
}

// ---------- DB -> Sheet ----------

function syncDariDbInternal(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const isi = data.isi;

  if (data.jenis === 'toko' || data.jenis === 'tokoStop') {
    const master = ss.getSheetByName(SHEET_NAME_MASTER);
    const row = cariBarisById(master, COL_MASTER_ID, isi.id);
    const folderSheet = row === -1 ? "" : String(master.getRange(row, COL_MASTER_FOLDER_FOTO).getValue() || "");
    const hasil = {};
    if (data.foto) Object.assign(hasil, uploadFotoToko(isi, data.foto, data.namaFile, folderSheet));
    else if (folderSheet) hasil.folderFoto = folderSheet;
    const t = Object.assign({}, isi, hasil);

    if (data.jenis === 'toko') {
      tulisBarisById(master, COL_MASTER_ID, t.id, COL_MASTER_NAMA, tokoKeBarisMaster(t), [COL_MASTER_HP]);
      // Toko aktif tidak boleh tersisa di arsip stop (mis. setelah DB di-restore / toko diaktifkan lagi).
      const stop = ss.getSheetByName(SHEET_NAME_WARUNG_STOP);
      const barisStop = cariBarisById(stop, COL_STOP_ID, t.id);
      if (barisStop !== -1) stop.deleteRow(barisStop);
    } else {
      const stop = ss.getSheetByName(SHEET_NAME_WARUNG_STOP);
      const barisStop = tulisBarisById(stop, COL_STOP_ID, t.id, COL_STOP_NAMA, [
        t.nama, t.pemilik, t.hp, t.latlong, t.riwayatTerjual, t.riwayatSetoran, t.riwayatSisa, t.folderFoto, t.totalKirim
      ], [COL_STOP_HP]);
      // Samakan format angka dengan MASTER_WARUNG (sebagian sel WARUNG_STOP berformat tanggal -> 0 tampil 1899).
      stop.getRange(barisStop, COL_STOP_RIWAYAT_TERJUAL).setNumberFormat('0" butir"');
      stop.getRange(barisStop, COL_STOP_RIWAYAT_SETORAN).setNumberFormat('"Rp"#,##0');
      stop.getRange(barisStop, COL_STOP_RIWAYAT_SISA).setNumberFormat('0" butir"');
      stop.getRange(barisStop, COL_STOP_TOTAL_KIRIM).setNumberFormat('0"x Pengiriman"');
      if (row !== -1) master.deleteRow(row);
    }
    return Object.assign({ success: true }, hasil);
  }

  if (data.jenis === 'endCustomer') {
    const sheet = ss.getSheetByName(SHEET_NAME_END_CUSTOMER);
    let foto = isi.foto || "";
    if (data.foto && !foto) {
      const folder = ambilOrBuatFolderBersama(DRIVE_FOLDER_ID_BUKTI_V2, "END_CUSTOMER");
      foto = uploadFotoBase64(folder, data.foto, data.namaFile).getUrl();
    }
    tulisBarisById(sheet, COL_ENDCUST_ID, isi.id, COL_ENDCUST_NAMA, [isi.nama, isi.sales, isi.hp, isi.jumlah, foto], [COL_ENDCUST_HP]);
    return { success: true, foto: foto };
  }

  if (data.jenis === 'hutang') {
    const sheet = ambilSheetHutang();
    tulisBarisById(sheet, COL_HUTANG_ID, isi.id, 1, [
      new Date(isi.tanggal), isi.nama, isi.tipe, isi.jumlah, isi.keterangan, isi.sales, isi.storeId
    ]);
    return { success: true };
  }

  // Hapus baris ber-ID tertentu (dipakai penyelarasan sheet setelah DB di-restore, mis. baris uji).
  if (data.jenis === 'hapus') {
    const peta = {
      MASTER: [SHEET_NAME_MASTER, COL_MASTER_ID], STOP: [SHEET_NAME_WARUNG_STOP, COL_STOP_ID],
      END_CUSTOMER: [SHEET_NAME_END_CUSTOMER, COL_ENDCUST_ID], HUTANG: [SHEET_NAME_HUTANG, COL_HUTANG_ID]
    };
    const target = peta[isi.sheet];
    if (!target || !isi.id) return { success: false, message: "Target hapus tidak valid." };
    const sheet = ss.getSheetByName(target[0]);
    let dihapus = 0, row;
    while ((row = cariBarisById(sheet, target[1], isi.id)) !== -1) { sheet.deleteRow(row); dihapus++; }
    return { success: true, dihapus: dihapus };
  }

  return { success: false, message: "Jenis sinkron tidak dikenal: " + data.jenis };
}

// ---------- Sheet -> DB (edit manual) ----------

function ambilSheetAntrian() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME_ANTRIAN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_ANTRIAN);
    sheet.hideSheet();
  }
  return sheet;
}

// Simple trigger: jalan otomatis tiap user mengedit sheet (bukan edit dari script, jadi tidak
// memantul balik saat syncDariDb menulis). Baris tanpa ID langsung diberi ID baru.
function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME_MASTER) return;
  const r1 = Math.max(2, e.range.getRow());
  const r2 = e.range.getLastRow();
  if (r2 < r1) return;
  const n = r2 - r1 + 1;

  const nama = sheet.getRange(r1, COL_MASTER_NAMA, n, 1).getValues();
  const idRange = sheet.getRange(r1, COL_MASTER_ID, n, 1);
  const ids = idRange.getValues();
  const antrian = [];
  let adaIdBaru = false;
  for (let i = 0; i < n; i++) {
    if (String(nama[i][0] || "").trim() === "") continue;
    if (String(ids[i][0] || "").trim() === "") { ids[i][0] = Utilities.getUuid(); adaIdBaru = true; }
    antrian.push([ids[i][0]]);
  }
  if (adaIdBaru) idRange.setValues(ids);
  if (antrian.length === 0) return;
  const q = ambilSheetAntrian();
  q.getRange(q.getLastRow() + 1, 1, antrian.length, 1).setValues(antrian);
}

// Trigger onEdit INSTALLABLE (dipasang sekali lewat pasangTriggerKirimEdit): kirim baris yang
// diedit langsung ke API VPS supaya masuk DB dalam hitungan detik. Simple trigger onEdit di atas
// tetap mencatat antrian _SINKRON sebagai cadangan (ditarik API tiap 20 detik) -- jadi kalau push
// gagal, edit tetap sampai. Baris yang belum punya ID dilewati di sini (ID-nya diberi onEdit,
// lalu ikut tarikan berkala).
function kirimEditKeApi(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME_MASTER) return;
  const r1 = Math.max(2, e.range.getRow());
  const r2 = e.range.getLastRow();
  if (r2 < r1) return;
  const toko = sheet.getRange(r1, 1, r2 - r1 + 1, COL_MASTER_ID).getValues()
    .map(barisMasterKeToko).filter(t => t.id && t.nama);
  if (toko.length === 0) return;
  const res = UrlFetchApp.fetch(API_PUSH_EDIT_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-sync-secret': SYNC_SECRET },
    payload: JSON.stringify({ toko: toko })
  });
  if (res.getResponseCode() !== 200) console.warn('Push edit gagal ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
}

// JALANKAN SEKALI dari editor Apps Script (pilih fungsi ini -> Run -> izinkan akses).
// Aman diulang: trigger lama dengan nama yang sama dihapus dulu.
function pasangTriggerKirimEdit() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'kirimEditKeApi')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('kirimEditKeApi').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  const res = UrlFetchApp.fetch(API_PUSH_EDIT_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-sync-secret': SYNC_SECRET }, payload: JSON.stringify({ toko: [] })
  });
  Logger.log('Trigger terpasang. Tes koneksi API: HTTP ' + res.getResponseCode() + ' ' + res.getContentText());
}

// Kembalikan baris terbaru dari toko yang diedit manual. Antrian TIDAK dihapus di sini: balasan
// web app GAS kadang hilang di jalan (redirect echo Google 404), dan kalau antrian sudah terhapus,
// editnya hilang selamanya. API memanggil ackEditSheet setelah datanya tersimpan di DB; kalau
// ack tidak sampai, tarikan berikutnya mengembalikan data yang sama (upsert, aman diulang).
function ambilEditSheetInternal() {
  const q = ambilSheetAntrian();
  const jumlah = q.getLastRow();
  if (jumlah < 1) return { success: true, data: [], jumlahAntrian: 0 };
  const ids = [...new Set(q.getRange(1, 1, jumlah, 1).getValues().map(r => String(r[0]).trim()).filter(Boolean))];

  const master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_MASTER);
  const data = [];
  ids.forEach(id => {
    const row = cariBarisById(master, COL_MASTER_ID, id);
    if (row === -1) return; // baris sudah dihapus/dipindah manual -- diabaikan
    data.push(barisMasterKeToko(master.getRange(row, 1, 1, COL_MASTER_ID).getValues()[0]));
  });
  return { success: true, data: data, jumlahAntrian: jumlah };
}

// Buang N baris teratas antrian (yang sudah dibaca & disimpan API). Edit yang masuk sesudah
// tarikan ada di bawahnya, jadi tidak ikut terbuang.
function ackEditSheetInternal(data) {
  const q = ambilSheetAntrian();
  const n = Math.min(Number(data.jumlah) || 0, q.getLastRow());
  if (n > 0) q.getRange(1, 1, n, 1).deleteCells(SpreadsheetApp.Dimension.ROWS);
  return { success: true, dihapus: n };
}

// ---------- Ekspor penuh (impor awal ke DB) ----------

// Baris tanpa ID diberi ID dulu (kolom ID tersembunyi), supaya sinkron berikutnya bisa
// mencocokkan baris yang sama. Antrian edit dikosongkan karena data penuh sudah terkirim.
function isiIdKosong(sheet, kolomNama, kolomId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const nilai = sheet.getRange(1, 1, lastRow, Math.max(sheet.getLastColumn(), kolomId)).getValues();
  if (String(nilai[0][kolomId - 1] || "").trim() === "") sheet.getRange(1, kolomId).setValue("ID");
  const baris = nilai.slice(1);
  let berubah = false;
  baris.forEach(r => {
    if (String(r[kolomNama - 1] || "").trim() !== "" && String(r[kolomId - 1] || "").trim() === "") {
      r[kolomId - 1] = Utilities.getUuid();
      berubah = true;
    }
  });
  if (berubah) sheet.getRange(2, kolomId, baris.length, 1).setValues(baris.map(r => [r[kolomId - 1]]));
  return baris.filter(r => String(r[kolomNama - 1] || "").trim() !== "");
}

function eksporSemuaInternal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const master = isiIdKosong(ss.getSheetByName(SHEET_NAME_MASTER), COL_MASTER_NAMA, COL_MASTER_ID).map(barisMasterKeToko);

  const stop = isiIdKosong(ss.getSheetByName(SHEET_NAME_WARUNG_STOP), COL_STOP_NAMA, COL_STOP_ID).map(r => ({
    id: String(r[COL_STOP_ID - 1]).trim(),
    nama: String(r[COL_STOP_NAMA - 1]).trim(),
    pemilik: String(r[COL_STOP_PEMILIK - 1] || ""),
    hp: String(r[COL_STOP_HP - 1] || ""),
    latlong: String(r[COL_STOP_LATLONG - 1] || ""),
    riwayatTerjual: Number(r[COL_STOP_RIWAYAT_TERJUAL - 1]) || 0,
    riwayatSetoran: Number(r[COL_STOP_RIWAYAT_SETORAN - 1]) || 0,
    riwayatSisa: Number(r[COL_STOP_RIWAYAT_SISA - 1]) || 0,
    folderFoto: String(r[COL_STOP_FOLDER_FOTO - 1] || ""),
    totalKirim: Number(r[COL_STOP_TOTAL_KIRIM - 1]) || 0
  }));

  const endCustomer = isiIdKosong(ss.getSheetByName(SHEET_NAME_END_CUSTOMER), COL_ENDCUST_NAMA, COL_ENDCUST_ID).map(r => ({
    id: String(r[COL_ENDCUST_ID - 1]).trim(),
    nama: String(r[COL_ENDCUST_NAMA - 1]).trim(),
    sales: String(r[COL_ENDCUST_SALES - 1] || ""),
    hp: String(r[COL_ENDCUST_HP - 1] || ""),
    jumlah: Number(r[COL_ENDCUST_JUMLAH - 1]) || 0,
    foto: String(r[COL_ENDCUST_FOTO - 1] || "")
  }));

  const hutang = isiIdKosong(ambilSheetHutang(), 2, COL_HUTANG_ID).map(r => ({
    id: String(r[COL_HUTANG_ID - 1]).trim(),
    tanggal: isoAtauKosong(r[0]),
    nama: String(r[1]).trim(),
    tipe: String(r[2]).trim() === "Bayar" ? "Bayar" : "Hutang",
    jumlah: Number(r[3]) || 0,
    keterangan: String(r[4] || ""),
    sales: String(r[5] || ""),
    storeId: String(r[6] || "")
  }));

  const q = ambilSheetAntrian();
  if (q.getLastRow() > 0) q.getRange(1, 1, q.getLastRow(), 1).deleteCells(SpreadsheetApp.Dimension.ROWS);

  return { success: true, data: { master: master, stop: stop, endCustomer: endCustomer, hutang: hutang } };
}
