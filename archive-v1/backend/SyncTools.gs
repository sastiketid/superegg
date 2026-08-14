// ==========================================
// ALAT SINKRONISASI DATA LAMA
// ==========================================

function sinkronisasiFotoLama() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByGid(ss, SHEET_GID_PENGIRIMAN);
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID_BUKTI);
  const files = folder.getFiles();
  const data = sheet.getDataRange().getValues();

  let countBerhasil = 0;

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    const fileUrl = file.getUrl();

    let parts = fileName.replace('.jpg', '').replace('.jpeg', '').replace('.png', '').split('_');

    if (parts.length >= 4) {
      let salesName = parts[1].toLowerCase();
      let timeString = parts[2];
      let tokoName = parts.slice(3).join('_').toLowerCase();

      let fileD = -1, fileM = -1, fileY = -1;
      let fileTimeMatches = timeString.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);

      if (fileTimeMatches) {
         fileD = parseInt(fileTimeMatches[1], 10);
         fileM = parseInt(fileTimeMatches[2], 10);
         fileY = parseInt(fileTimeMatches[3], 10);
      }

      for (let i = 1; i < data.length; i++) {
        let rowDate = new Date(data[i][0]);
        let rowToko = String(data[i][2]).toLowerCase();
        let rowSales = String(data[i][5]).toLowerCase();
        let rowLink = String(data[i][15] || "");

        if (isNaN(rowDate.getTime())) continue;

        let sheetD = rowDate.getDate();
        let sheetM = rowDate.getMonth() + 1;
        let sheetY = rowDate.getFullYear();

        let isDateMatch = (fileD === sheetD && fileM === sheetM && fileY === sheetY);

        if (isDateMatch && rowToko.includes(tokoName) && rowSales === salesName && rowLink === "") {
          sheet.getRange(i + 1, 16).setValue(fileUrl);
          data[i][15] = fileUrl;
          countBerhasil++;
          break;
        }
      }
    }
  }
  Logger.log("Sinkronisasi selesai! Berhasil menyambungkan " + countBerhasil + " foto lama.");
}
