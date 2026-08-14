// ==========================================
// SERVICE: BUKA TITIK BARU (registrasi toko baru ke MASTER_WARUNG)
// ==========================================
//
// payload yang diharapkan:
// {
//   namaWarung: string, pemilik: string, hp: string,
//   jumlahAwal: number,   // titipan awal (butir) -> kolom G
//   keterangan: string,   // opsional
//   lat: number, long: number,
//   timestamp: string, fotoBase64: string
// }

function submitTitikBaruInternal(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_NAME_MASTER);
  if (!masterSheet) return { success: false, message: "Sheet MASTER_WARUNG tidak ditemukan." };

  const namaToko = data.namaWarung;
  const latLong = `${data.lat}, ${data.long}`;

  // Titik baru = pengiriman pertama toko ini, jadi folder foto baru & Total Pengiriman mulai dari 1.
  const folderToko = ambilOrBuatFolderToko(DRIVE_FOLDER_ID_BUKTI_V2, namaToko, null);
  const folderFotoUrl = folderToko.getUrl();
  const safeTimestamp = String(data.timestamp).replace(/[\/\:]/g, '-');
  const fileName = `1 - ${safeTimestamp} - ${namaToko}.jpg`;
  const file = uploadFotoBase64(folderToko, data.fotoBase64, fileName);
  const fotoTerakhirUrl = file.getUrl();

  const targetRow = masterSheet.getLastRow() + 1;
  masterSheet.getRange(targetRow, COL_MASTER_NAMA, 1, 15).setValues([[
    namaToko, data.pemilik, data.hp, latLong,
    0, Number(data.jumlahAwal) || 0, new Date(),
    0, 0, 0, 0,
    data.keterangan || "", fotoTerakhirUrl, folderFotoUrl,
    namaHariIni()
  ]]);
  masterSheet.getRange(targetRow, COL_MASTER_TOTAL_KIRIM).setValue(1);
  masterSheet.getRange(targetRow, COL_MASTER_ID).setValue(buatIdBaru());

  return { success: true, message: `${namaToko} berhasil didaftarkan sebagai titik baru!` };
}
