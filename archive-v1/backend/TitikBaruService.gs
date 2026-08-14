// ==========================================
// SERVICE: SUBMIT TITIK BARU (registrasi toko baru)
// ==========================================

function submitTitikBaruInternal(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = getSheetByGid(ss, SHEET_GID_MASTER);
  const pengirimanSheet = getSheetByGid(ss, SHEET_GID_PENGIRIMAN);

  if (!masterSheet || !pengirimanSheet) return { success: false, message: "Tab tidak ditemukan." };

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID_BUKTI);
  const contentType = data.fotoBase64.substring(5, data.fotoBase64.indexOf(';'));
  const bytes = Utilities.base64Decode(data.fotoBase64.split(',')[1]);
  const safeTimestamp = data.timestamp.replace(/[\/\:]/g, '-');
  const fileName = `BUKA-TITIK_${data.pic}_${safeTimestamp}_${data.namaWarung}.jpg`;

  const file = folder.createFile(Utilities.newBlob(bytes, contentType, fileName));
  const fileUrl = file.getUrl();

  const masterData = masterSheet.getDataRange().getValues();
  let lastWrgNum = 0;
  for (let i = 1; i < masterData.length; i++) {
    let idStr = String(masterData[i][0] || "").trim();
    if (idStr.startsWith("WRG")) {
      let numPart = parseInt(idStr.replace("WRG", ""), 10);
      if (!isNaN(numPart) && numPart > lastWrgNum) lastWrgNum = numPart;
    }
  }
  let newWrgId = "WRG" + String(lastWrgNum + 1).padStart(3, '0');

  // Ambil data akurat untuk baris rumus (OPTIMASI: batasi baca ke getLastRow())
  const masterSheetLastRow = masterSheet.getLastRow();
  const colDataM = masterSheetLastRow > 0 ? masterSheet.getRange(1, 1, masterSheetLastRow, 1).getValues() : [];
  let lastRowM = 0;
  for (let i = colDataM.length - 1; i >= 0; i--) { if (colDataM[i][0] !== "") { lastRowM = i + 1; break; } }
  let newRowMasterNum = lastRowM + 1;

  let displayFormula = `=A${newRowMasterNum}&" - "&B${newRowMasterNum}`;
  let displayTeksResult = `${newWrgId} - ${data.namaWarung}`;
  let masterRow = [newWrgId, data.namaWarung, data.pemilik, data.hp, displayFormula, data.lat, data.long, data.pic];
  appendMasterAman(masterSheet, masterRow);

  const pengirimanData = pengirimanSheet.getDataRange().getValues();
  let lastInvoiceNum = 0;
  for (let i = 1; i < pengirimanData.length; i++) {
    let invStr = String(pengirimanData[i][1] || "").trim();
    if (invStr.startsWith("INV")) {
      let numPart = parseInt(invStr.replace("INV", ""), 10);
      if (!isNaN(numPart) && numPart > lastInvoiceNum) lastInvoiceNum = numPart;
    }
  }

  let today = new Date();
  let nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // Kalkulasi H+7
  let newInvoiceId = "INV" + String(lastInvoiceNum + 1).padStart(3, '0');
  let keteranganTeks = data.keterangan ? "TITIK BARU - " + data.keterangan : "TITIK BARU";

  let pengirimanRow = [today, newInvoiceId, displayTeksResult, "", BARANG_STATIS_DEFAULT, data.pic, "", 0, 0, data.jumlahAwal, 0, "", "", "Belum", keteranganTeks, fileUrl, nextWeek];
  appendPengirimanAman(pengirimanSheet, pengirimanRow, "Baru");

  return { success: true, message: "Titik Baru berhasil diregistrasi!" };
}
