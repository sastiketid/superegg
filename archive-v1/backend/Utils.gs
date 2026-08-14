// ==========================================
// HELPER BERSAMA (dipakai lintas service)
// ==========================================

function getSheetByGid(ss, gid) {
  // OPTIMASI: pakai method native getSheetById() (setara persis dengan loop manual
  // di atas -> sama-sama cari sheet lewat gid, null kalau tak ketemu) tanpa perlu
  // narik daftar semua sheet dulu.
  return ss.getSheetById(gid);
}

// ==========================================
// FUNGSI INJEKSI DATA PRESISI
// ==========================================

function appendPengirimanAman(sheet, rowData, mode = "Laporan") {
  // OPTIMASI: batasi baca ke getLastRow() (metadata cepat) alih-alih seluruh
  // kolom B (bisa ribuan baris kosong terformat) -> hasil scan sama persis, jauh lebih cepat.
  const sheetLastRow = sheet.getLastRow();
  const colData = sheetLastRow > 0 ? sheet.getRange(1, 2, sheetLastRow, 1).getValues() : [];
  let lastRow = 0;
  for (let i = colData.length - 1; i >= 0; i--) {
    if (colData[i][0] !== "") {
      lastRow = i + 1;
      break;
    }
  }
  const targetRow = lastRow + 1;

  // Injeksi Kolom A-K (Indeks 0-10)
  sheet.getRange(targetRow, 1, 1, 11).setValues([rowData.slice(0, 11)]);

  // Injeksi Kolom N-Q (Indeks 13-16) melewati L & M -> panjangnya 4 kolom
  sheet.getRange(targetRow, 14, 1, 4).setValues([rowData.slice(13, 17)]);

  // PERBAIKAN FINAL: Menggunakan .setValue() agar titik koma (;) diterima dengan sempurna
  sheet.getRange(targetRow, 4).setValue('=IF(C' + targetRow + '=""; ""; LEFT(C' + targetRow + '; 6))');
  sheet.getRange(targetRow, 7).setValue('=IFERROR(LEFT(E' + targetRow + '; SEARCH("-"; E' + targetRow + ')-1); "")');

  // Injeksi Rumus Kolom L dan M berdasarkan Mode (juga menggunakan .setValue)
  if (mode === "Laporan") {
    sheet.getRange(targetRow, 12).setValue("=(K" + targetRow + "-H" + targetRow + ")*3500");
    sheet.getRange(targetRow, 13).setValue("=I" + targetRow + "-2720*(K" + targetRow + "-H" + targetRow + ")");
  } else if (mode === "Baru") {
    sheet.getRange(targetRow, 12).setValue("=J" + targetRow + "*3500");
    sheet.getRange(targetRow, 13).setValue("=I" + targetRow + "-(2720*J" + targetRow + ")");
  }
}

// Modifikasi agar bisa menerima parameter warna latar (bgColor)
function appendMasterAman(sheet, rowData, bgColor = null) {
  // OPTIMASI: sama seperti appendPengirimanAman, batasi baca ke getLastRow().
  const sheetLastRow = sheet.getLastRow();
  const colData = sheetLastRow > 0 ? sheet.getRange(1, 1, sheetLastRow, 1).getValues() : [];
  let lastRow = 0;
  for (let i = colData.length - 1; i >= 0; i--) {
    if (colData[i][0] !== "") {
      lastRow = i + 1;
      break;
    }
  }
  const targetRow = lastRow + 1;
  sheet.getRange(targetRow, 1, 1, 8).setValues([rowData]);

  // Jika warna dikirim, blok dari Kolom A sampai H (8 kolom)
  if (bgColor) {
    sheet.getRange(targetRow, 1, 1, 8).setBackground(bgColor);
  }
}
