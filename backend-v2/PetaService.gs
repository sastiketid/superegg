// ==========================================
// SERVICE: PETA PERSEBARAN TOKO (aktif dari MASTER_WARUNG + non-aktif dari WARUNG_STOP)
// ==========================================
// Toko aktif pakai getTokoUntukRuteInternal() yang sudah ada (RoutingService.gs) --
// bentuk datanya (id, nama, lat, lng) sama persis yang dibutuhkan di sini.

function getTokoNonAktifInternal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_WARUNG_STOP);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, COL_STOP_ID).getValues();
  const result = [];

  for (let i = 0; i < data.length; i++) {
    const nama = String(data[i][COL_STOP_NAMA - 1] || "").trim();
    const id = String(data[i][COL_STOP_ID - 1] || "").trim();
    if (nama === "" || id === "") continue;

    const koordinat = parseLatLong(data[i][COL_STOP_LATLONG - 1]);
    if (!koordinat) continue;

    result.push({ id: id, nama: nama, lat: koordinat.lat, lng: koordinat.lng });
  }

  result.sort((a, b) => a.nama.localeCompare(b.nama));
  return result;
}
