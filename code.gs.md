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
        cache.remove('super_eggo_map_cache');
        cache.remove('super_eggo_sales_list');
        // Hapus juga cache rute & cache daftar toko sales spesifik jika ada
        if (payload.sales) {
          cache.remove('routing_cache_' + String(payload.sales).toLowerCase().trim());
          cache.remove('stores_cache_' + String(payload.sales).toLowerCase().trim());
        }
        if (payload.pic) {
          cache.remove('routing_cache_' + String(payload.pic).toLowerCase().trim());
          cache.remove('stores_cache_' + String(payload.pic).toLowerCase().trim());
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

// ==========================================
// LOGIKA INTERNAL API
// ==========================================

function getSalesListInternal() {
  // OPTIMASI: daftar sales jarang berubah, cache 25 menit. Ikut dihapus saat ada write sukses (lihat doPost).
  const cache = CacheService.getScriptCache();
  const cacheKey = 'super_eggo_sales_list';
  const cached = cache.get(cacheKey);
  if (cached !== null) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByGid(ss, 1772680131); 
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  let uniqueSales = [];
  for (let i = 1; i < data.length; i++) {
    let sales = String(data[i][7] || "").trim(); 
    if (sales !== "" && sales.toLowerCase() !== "pic sales") uniqueSales.push(sales);
  }
  const result = [...new Set(uniqueSales)].sort();
  cache.put(cacheKey, JSON.stringify(result), 1500);
  return result;
}

function getStoresBySalesInternal(salesName) {
  // OPTIMASI: sama pola dengan getRoutingDataInternal -> cache per sales, 15 menit,
  // dihapus saat sales ybs baru saja submit (lihat doPost). Hasil "Error:..." sengaja tidak dicache.
  const targetSales = String(salesName).trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const cacheKey = 'stores_cache_' + targetSales;
  const cached = cache.get(cacheKey);
  if (cached !== null) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pengirimanSheet = getSheetByGid(ss, 1790905023); 
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
  cache.put(cacheKey, JSON.stringify(result), 900);
  return result;
}

function getMapDataInternal() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'super_eggo_map_cache';
  
  // Cek apakah data sudah ada di dalam Cache
  const cachedData = cache.get(cacheKey);
  if (cachedData !== null) {
    return JSON.parse(cachedData); // Langsung kembalikan data dari cache (Sangat Cepat!)
  }
  
  // Jika cache kosong, ambil langsung dari Spreadsheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByGid(ss, 1772680131); 
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  let mapData = [];
  
  for (let i = 1; i < data.length; i++) {
    let namaWarung = String(data[i][1] || "").trim(); 
    let lat = parseFloat(data[i][5]);                 
    let lng = parseFloat(data[i][6]);                 
    let pic = String(data[i][7] || "").trim();        

    if (namaWarung !== "" && !isNaN(lat) && !isNaN(lng)) {
      mapData.push({ nama: namaWarung, lat: lat, lng: lng, pic: pic });
    }
  }
  
  // Simpan hasil komputasi ke Cache selama 25 menit (1500 detik) untuk pemanggilan berikutnya
  cache.put(cacheKey, JSON.stringify(mapData), 1500);
  return mapData;
}

function submitLaporanInternal(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pengirimanSheet = getSheetByGid(ss, 1790905023); 
  if (!pengirimanSheet) return { success: false, message: "Tab Pengiriman tidak ditemukan." };

  const folder = DriveApp.getFolderById("1mTW30DulUaMJOXgUzS-RUFJ-vIut71du");
  const contentType = data.fotoBase64.substring(5, data.fotoBase64.indexOf(';'));
  const bytes = Utilities.base64Decode(data.fotoBase64.split(',')[1]);
  const safeTimestamp = data.timestamp.replace(/[\/\:]/g, '-'); 
  const fileName = `LAPORAN_${data.sales}_${safeTimestamp}_${data.toko}.jpg`;
  
  const file = folder.createFile(Utilities.newBlob(bytes, contentType, fileName));
  const fileUrl = file.getUrl(); 

  const pengirimanData = pengirimanSheet.getDataRange().getValues();
  let targetRowIndex = -1;
  let lastInvoiceNum = 0; 

  for (let i = 1; i < pengirimanData.length; i++) {
    let tokoPengiriman = String(pengirimanData[i][2] || "").trim().toLowerCase();
    let picPengiriman = String(pengirimanData[i][5] || "").trim().toLowerCase();
    let statusBayar = String(pengirimanData[i][13] || "").trim().toLowerCase();
    
    if (statusBayar === 'belum' && picPengiriman === data.sales.toLowerCase() && tokoPengiriman === data.toko.toLowerCase()) {
      targetRowIndex = i + 1; 
    }
    let invStr = String(pengirimanData[i][1] || "").trim();
    if (invStr.startsWith("INV")) {
      let numPart = parseInt(invStr.replace("INV", ""), 10);
      if (!isNaN(numPart) && numPart > lastInvoiceNum) lastInvoiceNum = numPart;
    }
  }

  if (targetRowIndex === -1) return { success: false, message: "Data toko tidak ditemukan." };

  let today = new Date();
  let kolomJ = (data.status === 'Restock') ? data.jumlahRestock : "Stop";

  // UPDATE BARIS LAMA (OPTIMASI: kolom H-J dan N-Q sama-sama berdampingan & isinya
  // literal biasa -tanpa rumus-, jadi digabung jadi 2 panggilan setValues() alih-alih
  // 6 panggilan setValue() terpisah. Nilai & kolom tujuan identik dengan sebelumnya.)
  pengirimanSheet.getRange(targetRowIndex, 1).setValue(today); // Timpa tanggal menjadi hari ini
  pengirimanSheet.getRange(targetRowIndex, 8, 1, 3).setValues([[data.sisaTelur, data.setoranClean, kolomJ]]); // H,I,J
  pengirimanSheet.getRange(targetRowIndex, 14, 1, 4).setValues([['Perlu Direview', data.keterangan, fileUrl, 'Sudah dikunjungi']]); // N,O,P,Q
  
  if (data.status === 'Restock') {
    let nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // Kalkulasi H+7
    let newInvoice = "INV" + String(lastInvoiceNum + 1).padStart(3, '0');
    let barangStatis = 'TAO001 - Paket Telur Asin Omega 10 Butir (Agen)';
    
    let newRow = [today, newInvoice, data.toko, "", barangStatis, data.sales, "", "", "", "", data.jumlahRestock, "", "", "Belum", "", "", nextWeek];
    appendPengirimanAman(pengirimanSheet, newRow, "Laporan");
  }
  return { success: true, message: "Laporan berhasil masuk ke spreadsheet!" };
}

function submitTitikBaruInternal(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = getSheetByGid(ss, 1772680131);
  const pengirimanSheet = getSheetByGid(ss, 1790905023); 
  
  if (!masterSheet || !pengirimanSheet) return { success: false, message: "Tab tidak ditemukan." };

  const folder = DriveApp.getFolderById("1mTW30DulUaMJOXgUzS-RUFJ-vIut71du");
  const contentType = data.fotoBase64.substring(5, data.fotoBase64.indexOf(';'));
  const bytes = Utilities.base64Decode(data.fotoBase64.split(',')[1]);
  const safeTimestamp = data.timestamp.replace(/[\/\:]/g, '-'); 
  const fileName = `BUKA-TITIK_${data.pic}_${safeTimestamp}_${data.namaWarung}.jpg`;
  
  const file = folder.createFile(Utilities.newBlob(bytes, contentType, fileName));
  const fileUrl = file.getUrl(); 

  const masterData = masterSheet.getDataRange().getValues();
  let lastWrgNum = 0;
  for (let i = 1; i < masterData.length; i++) {
    let idStr = String(masterData[i][0] || "").trim();
    if (idStr.startsWith("WRG")) {
      let numPart = parseInt(idStr.replace("WRG", ""), 10);
      if (!isNaN(numPart) && numPart > lastWrgNum) lastWrgNum = numPart;
    }
  }
  let newWrgId = "WRG" + String(lastWrgNum + 1).padStart(3, '0');
  
  // Ambil data akurat untuk baris rumus (OPTIMASI: batasi baca ke getLastRow())
  const masterSheetLastRow = masterSheet.getLastRow();
  const colDataM = masterSheetLastRow > 0 ? masterSheet.getRange(1, 1, masterSheetLastRow, 1).getValues() : [];
  let lastRowM = 0;
  for (let i = colDataM.length - 1; i >= 0; i--) { if (colDataM[i][0] !== "") { lastRowM = i + 1; break; } }
  let newRowMasterNum = lastRowM + 1;
  
  let displayFormula = `=A${newRowMasterNum}&" - "&B${newRowMasterNum}`;
  let displayTeksResult = `${newWrgId} - ${data.namaWarung}`;
  let masterRow = [newWrgId, data.namaWarung, data.pemilik, data.hp, displayFormula, data.lat, data.long, data.pic];
  appendMasterAman(masterSheet, masterRow);

  const pengirimanData = pengirimanSheet.getDataRange().getValues();
  let lastInvoiceNum = 0;
  for (let i = 1; i < pengirimanData.length; i++) {
    let invStr = String(pengirimanData[i][1] || "").trim();
    if (invStr.startsWith("INV")) {
      let numPart = parseInt(invStr.replace("INV", ""), 10);
      if (!isNaN(numPart) && numPart > lastInvoiceNum) lastInvoiceNum = numPart;
    }
  }
  
  let today = new Date();
  let nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // Kalkulasi H+7
  let newInvoiceId = "INV" + String(lastInvoiceNum + 1).padStart(3, '0');
  let keteranganTeks = data.keterangan ? "TITIK BARU - " + data.keterangan : "TITIK BARU";
  let barangStatis = 'TAO001 - Paket Telur Asin Omega 10 Butir (Agen)';
  
  let pengirimanRow = [today, newInvoiceId, displayTeksResult, "", barangStatis, data.pic, "", 0, 0, data.jumlahAwal, 0, "", "", "Belum", keteranganTeks, fileUrl, nextWeek];
  appendPengirimanAman(pengirimanSheet, pengirimanRow, "Baru");

  return { success: true, message: "Titik Baru berhasil diregistrasi!" };
}

function submitEndCustomerInternal(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = getSheetByGid(ss, 1772680131);
  const pengirimanSheet = getSheetByGid(ss, 1790905023); 
  
  if (!masterSheet || !pengirimanSheet) return { success: false, message: "Tab tidak ditemukan." };

  const folder = DriveApp.getFolderById("1mTW30DulUaMJOXgUzS-RUFJ-vIut71du");
  const contentType = data.fotoBase64.substring(5, data.fotoBase64.indexOf(';'));
  const bytes = Utilities.base64Decode(data.fotoBase64.split(',')[1]);
  const safeTimestamp = data.timestamp.replace(/[\/\:]/g, '-'); 
  const fileName = `EndCustomer_${data.pic}_${safeTimestamp}_${data.namaUser}.jpg`;
  
  const file = folder.createFile(Utilities.newBlob(bytes, contentType, fileName));
  const fileUrl = file.getUrl(); 

  const masterData = masterSheet.getDataRange().getValues();
  let lastCstNum = 0;
  for (let i = 1; i < masterData.length; i++) {
    let idStr = String(masterData[i][0] || "").trim();
    if (idStr.startsWith("CST")) {
      let numPart = parseInt(idStr.replace("CST", ""), 10);
      if (!isNaN(numPart) && numPart > lastCstNum) lastCstNum = numPart;
    }
  }
  let newCstId = "CST" + String(lastCstNum + 1).padStart(3, '0');
  
  // Ambil data akurat untuk baris rumus (OPTIMASI: batasi baca ke getLastRow())
  const masterSheetLastRow = masterSheet.getLastRow();
  const colDataM = masterSheetLastRow > 0 ? masterSheet.getRange(1, 1, masterSheetLastRow, 1).getValues() : [];
  let lastRowM = 0;
  for (let i = colDataM.length - 1; i >= 0; i--) { if (colDataM[i][0] !== "") { lastRowM = i + 1; break; } }
  let newRowMasterNum = lastRowM + 1;
  
  let formatNamaWarung = "Nama User " + data.namaUser; 
  let displayFormula = `=A${newRowMasterNum}&" - "&B${newRowMasterNum}`;
  let displayTeksResult = `${newCstId} - ${formatNamaWarung}`;
  
  let masterRow = [newCstId, formatNamaWarung, data.namaUser, data.noWa, displayFormula, "-", "-", data.pic];
  // Eksekusi fungsi dengan parameter warna kuning standar ("#FFFF00")
  appendMasterAman(masterSheet, masterRow, "#FFFF00");

  const pengirimanData = pengirimanSheet.getDataRange().getValues();
  let lastInvoiceNum = 0;
  for (let i = 1; i < pengirimanData.length; i++) {
    let invStr = String(pengirimanData[i][1] || "").trim();
    if (invStr.startsWith("INV")) {
      let numPart = parseInt(invStr.replace("INV", ""), 10);
      if (!isNaN(numPart) && numPart > lastInvoiceNum) lastInvoiceNum = numPart;
    }
  }
  
  let newInvoiceId = "INV" + String(lastInvoiceNum + 1).padStart(3, '0');
  let keteranganTeks = data.keterangan ? "END USER - " + data.keterangan : "END USER";
  let barangStatis = 'TAO001 - Paket Telur Asin Omega 10 Butir (Agen)';
  
  let pengirimanRow = [new Date(), newInvoiceId, displayTeksResult, "", barangStatis, data.pic, "", 0, data.totalSetoran, data.jumlahBeli, 0, "", "", "Perlu Direview", keteranganTeks, fileUrl, "-"];
  appendPengirimanAman(pengirimanSheet, pengirimanRow, "Baru");

  return { success: true, message: "Transaksi Pembeli End User berhasil direkam!" };
}

// ==========================================
// ALAT SINKRONISASI DATA LAMA 
// ==========================================

function sinkronisasiFotoLama() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetByGid(ss, 1790905023); 
  const folder = DriveApp.getFolderById("1mTW30DulUaMJOXgUzS-RUFJ-vIut71du");
  const files = folder.getFiles();
  const data = sheet.getDataRange().getValues();

  let countBerhasil = 0;

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    const fileUrl = file.getUrl();

    let parts = fileName.replace('.jpg', '').replace('.jpeg', '').replace('.png', '').split('_');
    
    if (parts.length >= 4) {
      let salesName = parts[1].toLowerCase();
      let timeString = parts[2]; 
      let tokoName = parts.slice(3).join('_').toLowerCase(); 

      let fileD = -1, fileM = -1, fileY = -1;
      let fileTimeMatches = timeString.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
      
      if (fileTimeMatches) {
         fileD = parseInt(fileTimeMatches[1], 10);
         fileM = parseInt(fileTimeMatches[2], 10);
         fileY = parseInt(fileTimeMatches[3], 10);
      }

      for (let i = 1; i < data.length; i++) {
        let rowDate = new Date(data[i][0]); 
        let rowToko = String(data[i][2]).toLowerCase();
        let rowSales = String(data[i][5]).toLowerCase();
        let rowLink = String(data[i][15] || ""); 

        if (isNaN(rowDate.getTime())) continue; 
        
        let sheetD = rowDate.getDate();
        let sheetM = rowDate.getMonth() + 1; 
        let sheetY = rowDate.getFullYear();

        let isDateMatch = (fileD === sheetD && fileM === sheetM && fileY === sheetY);
        
        if (isDateMatch && rowToko.includes(tokoName) && rowSales === salesName && rowLink === "") {
          sheet.getRange(i + 1, 16).setValue(fileUrl); 
          data[i][15] = fileUrl; 
          countBerhasil++;
          break; 
        }
      }
    }
  }
  Logger.log("Sinkronisasi selesai! Berhasil menyambungkan " + countBerhasil + " foto lama.");
}
function getRoutingDataInternal(payload) {
  const targetSales = String(payload.salesName).trim().toLowerCase();
  const isSemuaSales = (targetSales === 'semua');
  
  // Jika parameter pencarian standar rute harian biasa, gunakan Cache
  const isDefaultFilter = (!payload.startDate && !payload.endDate);
  const cache = CacheService.getScriptCache();
  const cacheKey = 'routing_cache_' + targetSales;
  
  if (isDefaultFilter) {
    const cachedRouting = cache.get(cacheKey);
    if (cachedRouting !== null) {
      return { success: true, data: JSON.parse(cachedRouting) };
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pengirimanSheet = getSheetByGid(ss, 1790905023);
  const masterSheet = getSheetByGid(ss, 1772680131);
  
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
    cache.put(cacheKey, JSON.stringify(resultArr), 900);
  }
  
  return { success: true, data: resultArr };
}