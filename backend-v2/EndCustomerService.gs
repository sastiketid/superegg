// ==========================================
// SERVICE: PEMBELI END USER (END_CUSTOMER)
// ==========================================
//
// payload yang diharapkan:
// {
//   namaCustomer: string, hp: string, jumlahBeli: number,
//   namaSales: string,        // diisi manual atau otomatis dari ambilNamaSalesLogin() di frontend
//   timestamp: string, fotoBase64: string | null   // foto opsional, boleh null
// }

function submitPembeliEndUserInternal(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_END_CUSTOMER);
  if (!sheet) return { success: false, message: "Sheet END_CUSTOMER tidak ditemukan." };

  let fotoUrl = "";
  if (data.fotoBase64) {
    const folder = ambilOrBuatFolderBersama(DRIVE_FOLDER_ID_BUKTI_V2, "END_CUSTOMER");
    const safeTimestamp = String(data.timestamp).replace(/[\/\:]/g, '-');
    const file = uploadFotoBase64(folder, data.fotoBase64, `${safeTimestamp} - ${data.namaCustomer}.jpg`);
    fotoUrl = file.getUrl();
  }

  const targetRow = sheet.getLastRow() + 1;
  sheet.getRange(targetRow, COL_ENDCUST_NAMA, 1, 4).setValues([[
    data.namaCustomer, data.namaSales, data.hp, Number(data.jumlahBeli) || 0
  ]]);
  if (fotoUrl) sheet.getRange(targetRow, COL_ENDCUST_FOTO).setValue(fotoUrl);

  return { success: true, message: `${data.namaCustomer} berhasil disimpan.` };
}
