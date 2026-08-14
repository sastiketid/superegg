// ==========================================
// HELPER BERSAMA (SUPEREGG V2)
// ==========================================

function cariBarisById(sheet, kolomId, id) {
  // TextFinder: cari exact match di satu kolom, hindari scan manual baris demi baris.
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const range = sheet.getRange(2, kolomId, lastRow - 1, 1);
  const match = range.createTextFinder(String(id)).matchEntireCell(true).findNext();
  return match ? match.getRow() : -1;
}

function buatIdBaru() {
  // Utilities.getUuid() sudah bawaan GAS, tidak perlu bikin generator sendiri.
  return Utilities.getUuid();
}

function ekstrakDriveId(url) {
  // ID Drive selalu berupa runtutan alfanumerik/-_ sepanjang 25+ karakter di dalam URL.
  const match = String(url).match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

function ambilOrBuatFolderToko(folderIndukId, namaToko, folderUrlLama) {
  if (folderUrlLama) {
    const folderId = ekstrakDriveId(folderUrlLama);
    if (folderId) return DriveApp.getFolderById(folderId);
  }
  const folderInduk = DriveApp.getFolderById(folderIndukId);
  return folderInduk.createFolder(namaToko);
}

// Beda dengan ambilOrBuatFolderToko: dipakai untuk SATU folder bersama yang dipakai berulang
// tanpa ada kolom sheet yang nyimpen URL-nya (mis. folder foto Pembeli End User) -- cari dulu
// berdasar nama sebelum bikin baru, supaya tidak numpuk folder duplikat tiap kali dipanggil.
function ambilOrBuatFolderBersama(folderIndukId, namaFolder) {
  const folderInduk = DriveApp.getFolderById(folderIndukId);
  const existing = folderInduk.getFoldersByName(namaFolder);
  if (existing.hasNext()) return existing.next();
  return folderInduk.createFolder(namaFolder);
}

function uploadFotoBase64(folder, fotoBase64, fileName) {
  const contentType = fotoBase64.substring(5, fotoBase64.indexOf(';'));
  const bytes = Utilities.base64Decode(fotoBase64.split(',')[1]);
  return folder.createFile(Utilities.newBlob(bytes, contentType, fileName));
}

function namaHariIni() {
  return HARI_INDONESIA[new Date().getDay()];
}

// Kolom Lat/Long biasanya diisi manual, sebagian pakai format lokal Indonesia (koma sebagai
// pemisah desimal, mis. "-7,532869591, 110,8192042"), sebagian pakai titik standar
// ("-7.53, 110.83") -- regex ini menangani dua-duanya. Return null kalau format tidak dikenali.
function parseLatLong(raw) {
  const match = String(raw || '').trim().match(/^(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!match) return null;
  const lat = parseFloat(match[1].replace(',', '.'));
  const lng = parseFloat(match[2].replace(',', '.'));
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat: lat, lng: lng };
}
