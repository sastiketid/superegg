// GERBANG UTAMA API V2 (production)
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const payload = requestData.data;

    let result;
    const aksiSinkron = ['syncDariDb', 'ambilEditSheet', 'ackEditSheet', 'eksporSemua'].includes(action);

    if (!aksiSinkron && !AKSI_LANGSUNG_AKTIF) {
      // Aksi aplikasi lama ditutup: semua baca/tulis sekarang lewat API VPS (lihat Config.gs).
      return respondJSON({ success: false, message: "Aplikasi sudah pindah ke server baru. Tutup lalu buka ulang aplikasi." });
    }

    if (action === 'getDaftarTokoAktif') {
      result = getDaftarTokoAktifInternal();
    } else if (action === 'getDetailToko') {
      result = getDetailTokoInternal(payload.storeId);
    } else if (action === 'getTokoUntukRute') {
      result = getTokoUntukRuteInternal();
    } else if (action === 'getTokoNonAktif') {
      result = getTokoNonAktifInternal();
    } else if (aksiSinkron) {
      // Dipanggil API VPS saja (lihat SyncService.gs) -- wajib secret.
      if (!cekSecretSinkron(payload)) return respondJSON({ success: false, message: "Tidak diizinkan." });
      if (!lock.tryLock(25000)) return respondJSON({ success: false, message: "Server sedang sibuk." });
      if (action === 'syncDariDb') result = syncDariDbInternal(payload);
      else if (action === 'ambilEditSheet') result = ambilEditSheetInternal();
      else if (action === 'ackEditSheet') result = ackEditSheetInternal(payload);
      else result = eksporSemuaInternal();
    } else if (action === 'getHutang') {
      result = getHutangInternal();
    } else if (action === 'submitLaporanSatuan' || action === 'submitTitikBaru' || action === 'submitPembeliEndUser' || action === 'submitHutang') {
      const hasLock = lock.tryLock(15000);
      if (!hasLock) {
        return respondJSON({ success: false, message: "Server sedang sibuk. Silakan coba klik kirim kembali." });
      }
      if (action === 'submitLaporanSatuan') result = submitLaporanSatuanInternal(payload);
      else if (action === 'submitTitikBaru') result = submitTitikBaruInternal(payload);
      else if (action === 'submitHutang') result = submitHutangInternal(payload);
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
