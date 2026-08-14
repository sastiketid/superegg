// ==========================================
// SERVICE: DATA PETA (MAP)
// ==========================================

function getMapDataInternal() {
  const cache = CacheService.getScriptCache();
  const cacheKey = CACHE_KEY_MAP_DATA;

  // Cek apakah data sudah ada di dalam Cache
  const cachedData = cache.get(cacheKey);
  if (cachedData !== null) {
    return JSON.parse(cachedData); // Langsung kembalikan data dari cache (Sangat Cepat!)
  }

  // Jika cache kosong, ambil langsung dari Spreadsheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByGid(ss, SHEET_GID_MASTER);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  let mapData = [];

  for (let i = 1; i < data.length; i++) {
    let namaWarung = String(data[i][1] || "").trim();
    let lat = parseFloat(data[i][5]);
    let lng = parseFloat(data[i][6]);
    let pic = String(data[i][7] || "").trim();

    if (namaWarung !== "" && !isNaN(lat) && !isNaN(lng)) {
      mapData.push({ nama: namaWarung, lat: lat, lng: lng, pic: pic });
    }
  }

  // Simpan hasil komputasi ke Cache selama 25 menit (1500 detik) untuk pemanggilan berikutnya
  cache.put(cacheKey, JSON.stringify(mapData), CACHE_TTL_LONG);
  return mapData;
}
