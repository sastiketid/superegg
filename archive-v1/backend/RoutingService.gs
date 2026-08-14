// ==========================================
// SERVICE: RUTE KUNJUNGAN (ROUTING)
// ==========================================

function getRoutingDataInternal(payload) {
  const targetSales = String(payload.salesName).trim().toLowerCase();
  const isSemuaSales = (targetSales === 'semua');

  // Jika parameter pencarian standar rute harian biasa, gunakan Cache
  const isDefaultFilter = (!payload.startDate && !payload.endDate);
  const cache = CacheService.getScriptCache();
  const cacheKey = CACHE_PREFIX_ROUTING + targetSales;

  if (isDefaultFilter) {
    const cachedRouting = cache.get(cacheKey);
    if (cachedRouting !== null) {
      return { success: true, data: JSON.parse(cachedRouting) };
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pengirimanSheet = getSheetByGid(ss, SHEET_GID_PENGIRIMAN);
  const masterSheet = getSheetByGid(ss, SHEET_GID_MASTER);

  if (!pengirimanSheet || !masterSheet) return { success: false, message: "Tab tidak ditemukan" };

  const startDate = payload.startDate ? new Date(payload.startDate) : null;
  const endDate = payload.endDate ? new Date(payload.endDate) : null;
  if (endDate) endDate.setHours(23, 59, 59, 999);

  const pengirimanData = pengirimanSheet.getDataRange().getValues();
  const masterData = masterSheet.getDataRange().getValues();

  // PERBAIKAN: 3 peta lookup (bukan cuma teks lengkap "ID - Nama") karena teks di
  // Pengiriman!C bisa basi begitu nama toko diedit di Master, atau baris lama
  // sama sekali tidak punya prefix ID. ID sendiri tidak pernah berubah, jadi
  // itu fallback paling andal; nama polos jadi fallback terakhir.
  const masterCoordsByText = new Map();
  const masterCoordsById = new Map();
  const masterCoordsByName = new Map();
  for (let i = 1; i < masterData.length; i++) {
    let idToko = String(masterData[i][0] || "").trim();
    let namaToko = String(masterData[i][1] || "").trim();
    let displayToko = String(masterData[i][4] || "").trim();
    let lat = parseFloat(masterData[i][5]);
    let lng = parseFloat(masterData[i][6]);
    let coords = { lat: lat, lng: lng };
    if (displayToko !== "") masterCoordsByText.set(displayToko.toLowerCase(), coords);
    if (idToko !== "") masterCoordsById.set(idToko.toLowerCase(), coords);
    if (namaToko !== "") masterCoordsByName.set(namaToko.toLowerCase(), coords);
  }

  function cariKoordinatToko(tokoPengiriman) {
    let key = tokoPengiriman.toLowerCase();
    if (masterCoordsByText.has(key)) return masterCoordsByText.get(key);
    let idPart = key.split(' - ')[0].trim();
    if (masterCoordsById.has(idPart)) return masterCoordsById.get(idPart);
    if (masterCoordsByName.has(key)) return masterCoordsByName.get(key);
    return null;
  }

  const validStores = new Map();
  for (let i = 1; i < pengirimanData.length; i++) {
    let tglTransaksi = new Date(pengirimanData[i][0]);
    let tokoPengiriman = String(pengirimanData[i][2] || "").trim();
    let picPengiriman = String(pengirimanData[i][5] || "").trim().toLowerCase();
    let statusBayar = String(pengirimanData[i][13] || "").trim().toLowerCase();
    let stokLalu = pengirimanData[i][10];

    let isDateValid = true;
    if (startDate && endDate && !isNaN(tglTransaksi.getTime())) {
      if (tglTransaksi < startDate || tglTransaksi > endDate) isDateValid = false;
    }

    // Perubahan di baris ini: mengizinkan tarikan data jika filter "Semua" diaktifkan
    // PERBAIKAN: toko tanpa PIC/Sales terisi tidak boleh masuk rute (khususnya mode "Semua Sales"),
    // karena tidak ada sales valid untuk ditugaskan -> laporan dari toko ini pasti gagal disimpan.
    if (statusBayar === 'belum' && (isSemuaSales || picPengiriman === targetSales) && tokoPengiriman !== "" && picPengiriman !== "" && isDateValid) {
      let coords = cariKoordinatToko(tokoPengiriman);
      if (coords && !isNaN(coords.lat) && !isNaN(coords.lng)) {
        let picAsli = String(pengirimanData[i][5] || "").trim(); // Tarik PIC asli dari kolom F Pengiriman

        validStores.set(tokoPengiriman, {
          nama: tokoPengiriman,
          lat: coords.lat,
          lng: coords.lng,
          stokLalu: stokLalu,
          pic: picAsli // Sisipkan PIC asli ke payload
        });
      }
    }
  }

  let resultArr = Array.from(validStores.values()).sort((a, b) => a.nama.localeCompare(b.nama));
  if (resultArr.length === 0) return { success: false, message: "Tidak ada data tagihan/rute untuk rentang kriteria ini." };

  if (isDefaultFilter) {
    cache.put(cacheKey, JSON.stringify(resultArr), CACHE_TTL_MEDIUM);
  }

  return { success: true, data: resultArr };
}
