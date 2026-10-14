// ==========================================
// SERVICE: CATATAN HUTANG (sheet HUTANG, model buku kas)
// ==========================================
// Tiap baris = satu kejadian: 'Hutang' (nambah utang) atau 'Bayar' (cicil/lunas).
// Saldo per nama = total Hutang - total Bayar, dihitung di frontend -- tidak ada kolom
// saldo/status yang perlu dijaga sinkron. Sheet dibuat otomatis kalau belum ada.
//
// payload submitHutang:
// { nama: string, tipe: 'Hutang' | 'Bayar', jumlah: number, keterangan: string,
//   sales: string, storeId: string (opsional, kalau nama = toko di MASTER_WARUNG) }

const SHEET_NAME_HUTANG = "HUTANG";
const HEADER_HUTANG = ["Tanggal", "Nama", "Tipe", "Jumlah", "Keterangan", "Sales", "ID Toko"];

function ambilSheetHutang() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME_HUTANG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_HUTANG);
    sheet.getRange(1, 1, 1, HEADER_HUTANG.length).setValues([HEADER_HUTANG]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getHutangInternal() {
  const sheet = ambilSheetHutang();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet.getRange(2, 1, lastRow - 1, HEADER_HUTANG.length).getValues()
    .filter(r => String(r[1] || "").trim() !== "")
    .map(r => ({
      tanggal: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      nama: String(r[1]).trim(),
      tipe: String(r[2]).trim() === "Bayar" ? "Bayar" : "Hutang",
      jumlah: Number(r[3]) || 0,
      keterangan: String(r[4] || ""),
      sales: String(r[5] || ""),
      storeId: String(r[6] || "")
    }));
}

function submitHutangInternal(data) {
  const nama = String(data.nama || "").trim();
  const jumlah = Number(data.jumlah) || 0;
  if (!nama) return { success: false, message: "Nama wajib diisi." };
  if (data.tipe !== 'Hutang' && data.tipe !== 'Bayar') return { success: false, message: "Tipe harus 'Hutang' atau 'Bayar'." };
  if (jumlah <= 0) return { success: false, message: "Jumlah harus lebih dari 0." };

  const sheet = ambilSheetHutang();
  sheet.appendRow([new Date(), nama, data.tipe, jumlah, data.keterangan || "", data.sales || "", data.storeId || ""]);

  const label = data.tipe === 'Bayar' ? 'Pembayaran' : 'Hutang';
  return { success: true, message: `${label} ${nama} berhasil dicatat.` };
}
