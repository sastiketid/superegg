// GERBANG UTAMA API V2 (sandbox) - Laporan Satuan + Buka Titik Baru
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const payload = requestData.data;

    let result;

    if (action === 'getDaftarTokoAktif') {
      result = getDaftarTokoAktifInternal();
    } else if (action === 'getDetailToko') {
      result = getDetailTokoInternal(payload.storeId);
    } else if (action === 'getTokoUntukRute') {
      result = getTokoUntukRuteInternal();
    } else if (action === 'getTokoNonAktif') {
      result = getTokoNonAktifInternal();
    } else if (action === 'submitLaporanSatuan' || action === 'submitTitikBaru' || action === 'submitPembeliEndUser') {
      const hasLock = lock.tryLock(15000);
      if (!hasLock) {
        return respondJSON({ success: false, message: "Server sedang sibuk. Silakan coba klik kirim kembali." });
      }
      if (action === 'submitLaporanSatuan') result = submitLaporanSatuanInternal(payload);
      else if (action === 'submitTitikBaru') result = submitTitikBaruInternal(payload);
      else result = submitPembeliEndUserInternal(payload);
    } else {
      return respondJSON({ success: false, message: "Action API tidak dikenal." });
    }

    return respondJSON(result);
  } catch (error) {
    return respondJSON({ success: false, message: "Gagal memproses API: " + error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function respondJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
