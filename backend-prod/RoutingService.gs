// ==========================================
// SERVICE: DATA TOKO UNTUK MANAJEMEN RUTE
// ==========================================

function getTokoUntukRuteInternal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_MASTER);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, COL_MASTER_ID).getValues();
  const result = [];

  for (let i = 0; i < data.length; i++) {
    const nama = String(data[i][COL_MASTER_NAMA - 1] || "").trim();
    const id = String(data[i][COL_MASTER_ID - 1] || "").trim();
    if (nama === "" || id === "") continue;

    const koordinat = parseLatLong(data[i][COL_MASTER_LATLONG - 1]);
    if (!koordinat) continue;

    const jadwal = String(data[i][COL_MASTER_JADWAL - 1] || "").trim();
    result.push({ id: id, nama: nama, lat: koordinat.lat, lng: koordinat.lng, jadwal: jadwal });
  }

  result.sort((a, b) => a.nama.localeCompare(b.nama));
  return result;
}
