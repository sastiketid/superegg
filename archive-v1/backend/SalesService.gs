// ==========================================
// SERVICE: DAFTAR SALES
// ==========================================

function getSalesListInternal() {
  // OPTIMASI: daftar sales jarang berubah, cache 25 menit. Ikut dihapus saat ada write sukses (lihat Gateway.gs).
  const cache = CacheService.getScriptCache();
  const cacheKey = CACHE_KEY_SALES_LIST;
  const cached = cache.get(cacheKey);
  if (cached !== null) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByGid(ss, SHEET_GID_MASTER);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  let uniqueSales = [];
  for (let i = 1; i < data.length; i++) {
    let sales = String(data[i][7] || "").trim();
    if (sales !== "" && sales.toLowerCase() !== "pic sales") uniqueSales.push(sales);
  }
  const result = [...new Set(uniqueSales)].sort();
  cache.put(cacheKey, JSON.stringify(result), CACHE_TTL_LONG);
  return result;
}
