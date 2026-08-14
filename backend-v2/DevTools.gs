// ==========================================
// DEV TOOL: SEEDER ID (jalankan manual dari GAS editor saat butuh)
// ==========================================
// Isi kolom ID tersembunyi untuk baris yang sudah ada Nama Warung-nya
// tapi ID-nya masih kosong. Aman dijalankan berkali-kali (idempotent) --
// baris yang sudah punya ID tidak akan ditimpa/diganti.

function seedIdTokoKosong() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let total = 0;
  total += seedIdSheet(ss.getSheetByName(SHEET_NAME_MASTER), COL_MASTER_NAMA, COL_MASTER_ID);
  total += seedIdSheet(ss.getSheetByName(SHEET_NAME_WARUNG_STOP), COL_STOP_NAMA, COL_STOP_ID);
  Logger.log(`Seeder selesai, ${total} baris diisi ID baru.`);
}

function seedIdSheet(sheet, kolomNama, kolomId) {
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const namaValues = sheet.getRange(2, kolomNama, lastRow - 1, 1).getValues();
  const idValues = sheet.getRange(2, kolomId, lastRow - 1, 1).getValues();

  let count = 0;
  for (let i = 0; i < namaValues.length; i++) {
    const namaKosong = String(namaValues[i][0] || "").trim() === "";
    const idKosong = String(idValues[i][0] || "").trim() === "";
    if (!namaKosong && idKosong) {
      sheet.getRange(i + 2, kolomId).setValue(buatIdBaru());
      count++;
    }
  }
  return count;
}
