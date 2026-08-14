// ==========================================
// SERVICE: LAPORAN SATUAN (basis untuk laporan lainnya)
// ==========================================
//
// payload yang diharapkan:
// {
//   storeId: string (ID tersembunyi hasil getDaftarTokoAktifInternal),
//   sisaTelur: number,
//   totalSetoran: number,           // sudah dihitung/diedit di frontend, backend percaya apa adanya
//   status: 'Restock' | 'Stop',
//   jumlahRestock: number,          // wajib jika status === 'Restock', diabaikan jika 'Stop'
//   keterangan: string,
//   keteranganTouched: boolean,     // true jika user menyentuh field keterangan (termasuk mengosongkannya)
//   salesName: string,              // belum dipersist ke mana pun (session manager menyusul)
//   timestamp: string,
//   fotoBase64: string
// }

function submitLaporanSatuanInternal(data) {
  if (data.status !== 'Restock' && data.status !== 'Stop') {
    return { success: false, message: "Status harus 'Restock' atau 'Stop'." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_NAME_MASTER);
  if (!masterSheet) return { success: false, message: "Sheet MASTER_WARUNG tidak ditemukan." };

  const row = cariBarisById(masterSheet, COL_MASTER_ID, data.storeId);
  if (row === -1) return { success: false, message: "Toko tidak ditemukan (ID tidak cocok)." };

  const rowValues = masterSheet.getRange(row, 1, 1, COL_MASTER_ID).getValues()[0];
  const namaToko = rowValues[COL_MASTER_NAMA - 1];
  const gLama = Number(rowValues[COL_MASTER_STOK_SEKARANG - 1]) || 0;
  const fLama = Number(rowValues[COL_MASTER_RIWAYAT_TERJUAL - 1]) || 0;
  const iLama = Number(rowValues[COL_MASTER_SETORAN_TERAKHIR - 1]) || 0;
  const jLama = Number(rowValues[COL_MASTER_RIWAYAT_SETORAN - 1]) || 0;
  const kLama = Number(rowValues[COL_MASTER_RIWAYAT_SISA - 1]) || 0;
  const lLama = Number(rowValues[COL_MASTER_SISA_TERAKHIR - 1]) || 0;
  const mLama = rowValues[COL_MASTER_KETERANGAN - 1];
  const folderFotoUrlLama = rowValues[COL_MASTER_FOLDER_FOTO - 1];
  const qLama = Number(rowValues[COL_MASTER_TOTAL_KIRIM - 1]) || 0;

  const sisaTelurBaru = Number(data.sisaTelur) || 0;
  const telurTerjualPeriodeIni = gLama - sisaTelurBaru;
  const setoranBaru = Number(data.totalSetoran) || 0;

  const fBaru = fLama + telurTerjualPeriodeIni;
  const jBaru = jLama + iLama;
  const kBaru = kLama + lLama;
  const qBaru = qLama + 1;
  const keteranganBaru = data.keteranganTouched ? data.keterangan : mLama;

  // Foto: masuk ke folder khusus toko ini (dibuat sekali, dipakai terus)
  const folderToko = ambilOrBuatFolderToko(DRIVE_FOLDER_ID_BUKTI_V2, namaToko, folderFotoUrlLama);
  const folderFotoUrlBaru = folderFotoUrlLama || folderToko.getUrl();
  const safeTimestamp = String(data.timestamp).replace(/[\/\:]/g, '-');
  const fileName = `${qBaru} - ${safeTimestamp} - ${namaToko}.jpg`;
  const file = uploadFotoBase64(folderToko, data.fotoBase64, fileName);
  const fotoTerakhirUrl = file.getUrl();

  if (data.status === 'Stop') {
    // "Data final dulu, baru dipindah" -> tidak perlu tulis ke MASTER_WARUNG sama sekali,
    // baris ini langsung dihapus setelah nilai final dipindah ke WARUNG_STOP.
    const stopSheet = ss.getSheetByName(SHEET_NAME_WARUNG_STOP);
    if (!stopSheet) return { success: false, message: "Sheet WARUNG_STOP tidak ditemukan." };

    const targetRow = stopSheet.getLastRow() + 1;
    stopSheet.getRange(targetRow, COL_STOP_NAMA, 1, 4).setValues([[
      namaToko,
      rowValues[COL_MASTER_PEMILIK - 1],
      rowValues[COL_MASTER_HP - 1],
      rowValues[COL_MASTER_LATLONG - 1]
    ]]);
    stopSheet.getRange(targetRow, COL_STOP_RIWAYAT_TERJUAL, 1, 3).setValues([[fBaru, jBaru, kBaru]]);
    stopSheet.getRange(targetRow, COL_STOP_FOLDER_FOTO).setValue(folderFotoUrlBaru);
    stopSheet.getRange(targetRow, COL_STOP_TOTAL_KIRIM).setValue(qBaru);
    stopSheet.getRange(targetRow, COL_STOP_ID).setValue(data.storeId);

    masterSheet.deleteRow(row);
    return { success: true, message: `${namaToko} berhasil di-stop dan dipindah ke arsip.` };
  }

  // Status === 'Restock'
  const gBaru = Number(data.jumlahRestock) || 0;
  masterSheet.getRange(row, COL_MASTER_RIWAYAT_TERJUAL, 1, 10).setValues([[
    fBaru, gBaru, new Date(), setoranBaru, jBaru, kBaru, sisaTelurBaru, keteranganBaru, fotoTerakhirUrl, folderFotoUrlBaru
  ]]);
  masterSheet.getRange(row, COL_MASTER_TOTAL_KIRIM).setValue(qBaru);

  // Jadwal Kirim: cuma diisi otomatis kalau masih kosong (input pertama kali), tidak pernah ditimpa laporan berikutnya.
  const jadwalLama = String(rowValues[COL_MASTER_JADWAL - 1] || "").trim();
  if (jadwalLama === "") {
    masterSheet.getRange(row, COL_MASTER_JADWAL).setValue(namaHariIni());
  }

  return { success: true, message: "Laporan berhasil disimpan." };
}
