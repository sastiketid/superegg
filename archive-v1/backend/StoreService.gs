// ==========================================
// SERVICE: DAFTAR TOKO PER SALES
// ==========================================

function getStoresBySalesInternal(salesName) {
  // OPTIMASI: sama pola dengan getRoutingDataInternal -> cache per sales, 15 menit,
  // dihapus saat sales ybs baru saja submit (lihat Gateway.gs). Hasil "Error:..." sengaja tidak dicache.
  const targetSales = String(salesName).trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const cacheKey = CACHE_PREFIX_STORES + targetSales;
  const cached = cache.get(cacheKey);
  if (cached !== null) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pengirimanSheet = getSheetByGid(ss, SHEET_GID_PENGIRIMAN);
  if (!pengirimanSheet) return ["Error: Gagal terhubung ke Tab Pengiriman"];

  const pengirimanData = pengirimanSheet.getDataRange().getValues();
  const validStores = new Map();

  for (let i = 1; i < pengirimanData.length; i++) {
    let tokoPengiriman = String(pengirimanData[i][2] || "").trim();
    let picPengiriman = String(pengirimanData[i][5] || "").trim().toLowerCase();
    let statusBayar = String(pengirimanData[i][13] || "").trim().toLowerCase();
    let stokLalu = pengirimanData[i][10];

    if (statusBayar === 'belum' && picPengiriman === targetSales && tokoPengiriman !== "") {
      validStores.set(tokoPengiriman, { nama: tokoPengiriman, stokLalu: stokLalu });
    }
  }
  if (validStores.size === 0) return ["Error: Tidak ada tagihan 'Belum' untuk Sales ini"];

  const result = Array.from(validStores.values()).sort((a, b) => a.nama.localeCompare(b.nama));
  cache.put(cacheKey, JSON.stringify(result), CACHE_TTL_MEDIUM);
  return result;
}
