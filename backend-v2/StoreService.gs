// ==========================================
// SERVICE: DAFTAR & DETAIL TOKO (untuk form Laporan Satuan)
// ==========================================

function getDaftarTokoAktifInternal() {
  // Tidak difilter per-sales (data toko sifatnya global, sales manapun bisa lapor toko manapun).
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_MASTER);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, COL_MASTER_ID).getValues();
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const nama = String(data[i][COL_MASTER_NAMA - 1] || "").trim();
    const id = String(data[i][COL_MASTER_ID - 1] || "").trim();
    if (nama !== "" && id !== "") {
      result.push({ id: id, nama: nama });
    }
  }
  result.sort((a, b) => a.nama.localeCompare(b.nama));
  return result;
}

function getDetailTokoInternal(storeId) {
  // Sengaja tidak dicache: kolom G (stok) & M (keterangan) berubah tiap laporan masuk.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_MASTER);
  if (!sheet) return { success: false, message: "Sheet MASTER_WARUNG tidak ditemukan." };

  const row = cariBarisById(sheet, COL_MASTER_ID, storeId);
  if (row === -1) return { success: false, message: "Toko tidak ditemukan." };

  const rowValues = sheet.getRange(row, 1, 1, COL_MASTER_ID).getValues()[0];
  return {
    success: true,
    data: {
      nama: rowValues[COL_MASTER_NAMA - 1],
      pemilik: rowValues[COL_MASTER_PEMILIK - 1],
      telurDiWarung: Number(rowValues[COL_MASTER_STOK_SEKARANG - 1]) || 0,
      keteranganTerakhir: rowValues[COL_MASTER_KETERANGAN - 1] || ""
    }
  };
}
