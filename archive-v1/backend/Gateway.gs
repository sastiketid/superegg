// GERBANG UTAMA API (Menerima Request dengan Sistem Antrean & Manajemen Cache)
function doPost(e) {
  // Inisialisasi Lock Service untuk mencegah Race Condition
  const lock = LockService.getScriptLock();

  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const payload = requestData.data;

    let result;

    // Blok Aksi Ambil Data (Read Operations) -> Tidak Perlu Lock, Menggunakan Cache jika ada
    if (action === 'getSalesList') {
      result = getSalesListInternal();
    } else if (action === 'getStoresBySales') {
      result = getStoresBySalesInternal(payload.salesName);
    } else if (action === 'getMapData') {
      result = getMapDataInternal();
    } else if (action === 'getRoutingData') {
      result = getRoutingDataInternal(payload);
    }

    // Blok Aksi Kirim Data (Write Operations) -> Wajib Masuk Antrean Lock demi Keamanan Data
    else if (action === 'submitLaporan' || action === 'submitTitikBaru' || action === 'submitEndCustomer') {
      // Mencoba mendapatkan kunci selama maksimal 30 detik
      const hasLock = lock.tryLock(30000);
      if (!hasLock) {
        return respondJSON({ success: false, message: "Server sedang sibuk menangani antrean sales lain. Silakan coba klik kirim kembali." });
      }

      // Eksekusi penulisan data sesuai aksi
      if (action === 'submitLaporan') result = submitLaporanInternal(payload);
      else if (action === 'submitTitikBaru') result = submitTitikBaruInternal(payload);
      else if (action === 'submitEndCustomer') result = submitEndCustomerInternal(payload);

      // JIKA INPUT SUKSES -> Hapus Cache Lama agar pembacaan berikutnya langsung memperbarui data (Invalidate Cache)
      if (result && result.success) {
        const cache = CacheService.getScriptCache();
        cache.remove(CACHE_KEY_MAP_DATA);
        cache.remove(CACHE_KEY_SALES_LIST);
        // Hapus juga cache rute & cache daftar toko sales spesifik jika ada
        if (payload.sales) {
          cache.remove(CACHE_PREFIX_ROUTING + String(payload.sales).toLowerCase().trim());
          cache.remove(CACHE_PREFIX_STORES + String(payload.sales).toLowerCase().trim());
        }
        if (payload.pic) {
          cache.remove(CACHE_PREFIX_ROUTING + String(payload.pic).toLowerCase().trim());
          cache.remove(CACHE_PREFIX_STORES + String(payload.pic).toLowerCase().trim());
        }
      }
    } else {
      return respondJSON({ success: false, message: "Action API tidak dikenal." });
    }

    return respondJSON(result);
  } catch (error) {
    return respondJSON({ success: false, message: "Gagal memproses API: " + error.toString() });
  } finally {
    // Memastikan kunci dilepas dalam kondisi sukses maupun error agar skrip tidak stuck
    lock.releaseLock();
  }
}

function respondJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
