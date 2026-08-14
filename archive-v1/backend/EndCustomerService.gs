// ==========================================
// SERVICE: SUBMIT END CUSTOMER (pembeli langsung/end user)
// ==========================================

function submitEndCustomerInternal(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = getSheetByGid(ss, SHEET_GID_MASTER);
  const pengirimanSheet = getSheetByGid(ss, SHEET_GID_PENGIRIMAN);

  if (!masterSheet || !pengirimanSheet) return { success: false, message: "Tab tidak ditemukan." };

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID_BUKTI);
  const contentType = data.fotoBase64.substring(5, data.fotoBase64.indexOf(';'));
  const bytes = Utilities.base64Decode(data.fotoBase64.split(',')[1]);
  const safeTimestamp = data.timestamp.replace(/[\/\:]/g, '-');
  const fileName = `EndCustomer_${data.pic}_${safeTimestamp}_${data.namaUser}.jpg`;

  const file = folder.createFile(Utilities.newBlob(bytes, contentType, fileName));
  const fileUrl = file.getUrl();

  const masterData = masterSheet.getDataRange().getValues();
  let lastCstNum = 0;
  for (let i = 1; i < masterData.length; i++) {
    let idStr = String(masterData[i][0] || "").trim();
    if (idStr.startsWith("CST")) {
      let numPart = parseInt(idStr.replace("CST", ""), 10);
      if (!isNaN(numPart) && numPart > lastCstNum) lastCstNum = numPart;
    }
  }
  let newCstId = "CST" + String(lastCstNum + 1).padStart(3, '0');

  // Ambil data akurat untuk baris rumus (OPTIMASI: batasi baca ke getLastRow())
  const masterSheetLastRow = masterSheet.getLastRow();
  const colDataM = masterSheetLastRow > 0 ? masterSheet.getRange(1, 1, masterSheetLastRow, 1).getValues() : [];
  let lastRowM = 0;
  for (let i = colDataM.length - 1; i >= 0; i--) { if (colDataM[i][0] !== "") { lastRowM = i + 1; break; } }
  let newRowMasterNum = lastRowM + 1;

  let formatNamaWarung = "Nama User " + data.namaUser;
  let displayFormula = `=A${newRowMasterNum}&" - "&B${newRowMasterNum}`;
  let displayTeksResult = `${newCstId} - ${formatNamaWarung}`;

  let masterRow = [newCstId, formatNamaWarung, data.namaUser, data.noWa, displayFormula, "-", "-", data.pic];
  // Eksekusi fungsi dengan parameter warna kuning standar ("#FFFF00")
  appendMasterAman(masterSheet, masterRow, "#FFFF00");

  const pengirimanData = pengirimanSheet.getDataRange().getValues();
  let lastInvoiceNum = 0;
  for (let i = 1; i < pengirimanData.length; i++) {
    let invStr = String(pengirimanData[i][1] || "").trim();
    if (invStr.startsWith("INV")) {
      let numPart = parseInt(invStr.replace("INV", ""), 10);
      if (!isNaN(numPart) && numPart > lastInvoiceNum) lastInvoiceNum = numPart;
    }
  }

  let newInvoiceId = "INV" + String(lastInvoiceNum + 1).padStart(3, '0');
  let keteranganTeks = data.keterangan ? "END USER - " + data.keterangan : "END USER";

  let pengirimanRow = [new Date(), newInvoiceId, displayTeksResult, "", BARANG_STATIS_DEFAULT, data.pic, "", 0, data.totalSetoran, data.jumlahBeli, 0, "", "", "Perlu Direview", keteranganTeks, fileUrl, "-"];
  appendPengirimanAman(pengirimanSheet, pengirimanRow, "Baru");

  return { success: true, message: "Transaksi Pembeli End User berhasil direkam!" };
}
