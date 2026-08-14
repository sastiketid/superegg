// ==========================================
// SERVICE: SUBMIT LAPORAN (kunjungan ke toko existing)
// ==========================================

function submitLaporanInternal(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pengirimanSheet = getSheetByGid(ss, SHEET_GID_PENGIRIMAN);
  if (!pengirimanSheet) return { success: false, message: "Tab Pengiriman tidak ditemukan." };

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID_BUKTI);
  const contentType = data.fotoBase64.substring(5, data.fotoBase64.indexOf(';'));
  const bytes = Utilities.base64Decode(data.fotoBase64.split(',')[1]);
  const safeTimestamp = data.timestamp.replace(/[\/\:]/g, '-');
  const fileName = `LAPORAN_${data.sales}_${safeTimestamp}_${data.toko}.jpg`;

  const file = folder.createFile(Utilities.newBlob(bytes, contentType, fileName));
  const fileUrl = file.getUrl();

  const pengirimanData = pengirimanSheet.getDataRange().getValues();
  let targetRowIndex = -1;
  let lastInvoiceNum = 0;

  for (let i = 1; i < pengirimanData.length; i++) {
    let tokoPengiriman = String(pengirimanData[i][2] || "").trim().toLowerCase();
    let picPengiriman = String(pengirimanData[i][5] || "").trim().toLowerCase();
    let statusBayar = String(pengirimanData[i][13] || "").trim().toLowerCase();

    if (statusBayar === 'belum' && picPengiriman === data.sales.toLowerCase() && tokoPengiriman === data.toko.toLowerCase()) {
      targetRowIndex = i + 1;
    }
    let invStr = String(pengirimanData[i][1] || "").trim();
    if (invStr.startsWith("INV")) {
      let numPart = parseInt(invStr.replace("INV", ""), 10);
      if (!isNaN(numPart) && numPart > lastInvoiceNum) lastInvoiceNum = numPart;
    }
  }

  if (targetRowIndex === -1) return { success: false, message: "Data toko tidak ditemukan." };

  let today = new Date();
  let kolomJ = (data.status === 'Restock') ? data.jumlahRestock : "Stop";

  // UPDATE BARIS LAMA (OPTIMASI: kolom H-J dan N-Q sama-sama berdampingan & isinya
  // literal biasa -tanpa rumus-, jadi digabung jadi 2 panggilan setValues() alih-alih
  // 6 panggilan setValue() terpisah. Nilai & kolom tujuan identik dengan sebelumnya.)
  pengirimanSheet.getRange(targetRowIndex, 1).setValue(today); // Timpa tanggal menjadi hari ini
  pengirimanSheet.getRange(targetRowIndex, 8, 1, 3).setValues([[data.sisaTelur, data.setoranClean, kolomJ]]); // H,I,J
  pengirimanSheet.getRange(targetRowIndex, 14, 1, 4).setValues([['Perlu Direview', data.keterangan, fileUrl, 'Sudah dikunjungi']]); // N,O,P,Q

  if (data.status === 'Restock') {
    let nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // Kalkulasi H+7
    let newInvoice = "INV" + String(lastInvoiceNum + 1).padStart(3, '0');

    let newRow = [today, newInvoice, data.toko, "", BARANG_STATIS_DEFAULT, data.sales, "", "", "", "", data.jumlahRestock, "", "", "Belum", "", "", nextWeek];
    appendPengirimanAman(pengirimanSheet, newRow, "Laporan");
  }
  return { success: true, message: "Laporan berhasil masuk ke spreadsheet!" };
}
