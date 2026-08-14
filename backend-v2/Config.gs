// ==========================================
// KONFIGURASI GLOBAL (SUPEREGG V2)
// ==========================================
// Backend ini untuk spreadsheet DUPLIKAT/SANDBOX (SUPEREGG V2 PRD),
// terpisah total dari ../backend/ (v1) yang masih melayani spreadsheet produksi.
// Sheet dicari lewat NAMA tab (getSheetByName), bukan GID, karena tab-tab ini
// baru dibuat manual sesuai SHEET.md, GID belum tentu sama di tiap salinan.

const SHEET_NAME_MASTER = "MASTER_WARUNG";
const SHEET_NAME_END_CUSTOMER = "END_CUSTOMER";
const SHEET_NAME_WARUNG_STOP = "WARUNG_STOP";

// Kolom MASTER_WARUNG (1-based, sesuai SHEET.md kolom A-Q + 1 kolom ID tersembunyi)
const COL_MASTER_NO = 1;               // A - formula, jangan ditulis backend
const COL_MASTER_NAMA = 2;             // B
const COL_MASTER_PEMILIK = 3;          // C
const COL_MASTER_HP = 4;               // D
const COL_MASTER_LATLONG = 5;          // E - format teks "lat, lng" (desimal titik)
const COL_MASTER_RIWAYAT_TERJUAL = 6;  // F
const COL_MASTER_STOK_SEKARANG = 7;    // G - "Telur di Warung (Saat ini)"
const COL_MASTER_KIRIM_TERAKHIR = 8;   // H
const COL_MASTER_SETORAN_TERAKHIR = 9; // I
const COL_MASTER_RIWAYAT_SETORAN = 10; // J
const COL_MASTER_RIWAYAT_SISA = 11;    // K
const COL_MASTER_SISA_TERAKHIR = 12;   // L
const COL_MASTER_KETERANGAN = 13;      // M
const COL_MASTER_FOTO_TERAKHIR = 14;   // N - link file foto terbaru
const COL_MASTER_FOLDER_FOTO = 15;     // O - link folder Drive toko ini
const COL_MASTER_JADWAL = 16;          // P - tidak disentuh Laporan Satuan
const COL_MASTER_TOTAL_KIRIM = 17;     // Q - counter, sumber "Nomor" nama file foto
const COL_MASTER_ID = 18;              // R - ID unik tersembunyi (UUID), tidak ada di SHEET.md

// Kolom WARUNG_STOP (1-based, A-K -- J & K ditambah manual di spreadsheet, SHEET.md belum diupdate)
const COL_STOP_NO = 1;                 // A - formula
const COL_STOP_NAMA = 2;               // B
const COL_STOP_PEMILIK = 3;            // C
const COL_STOP_HP = 4;                 // D
const COL_STOP_LATLONG = 5;            // E
const COL_STOP_RIWAYAT_TERJUAL = 6;    // F
const COL_STOP_RIWAYAT_SETORAN = 7;    // G
const COL_STOP_RIWAYAT_SISA = 8;       // H
const COL_STOP_FOLDER_FOTO = 9;        // I
const COL_STOP_TOTAL_KIRIM = 10;       // J - Total Pengiriman (dibawa dari MASTER_WARUNG kolom Q)
const COL_STOP_ID = 11;                // K - ID unik tersembunyi (UUID), sama nilainya dgn asal

// Kolom END_CUSTOMER (1-based, sesuai SHEET.md kolom A-F)
const COL_ENDCUST_NO = 1;              // A - formula
const COL_ENDCUST_NAMA = 2;            // B
const COL_ENDCUST_SALES = 3;           // C
const COL_ENDCUST_HP = 4;              // D
const COL_ENDCUST_JUMLAH = 5;          // E
const COL_ENDCUST_FOTO = 6;            // F - opsional, boleh kosong

// Folder Drive induk (tempat subfolder per-toko dibuat) di spreadsheet sandbox
const DRIVE_FOLDER_ID_BUKTI_V2 = "1fZx4p5EotLELjwrxneShn9HE4x8UR2O0";

const HARGA_PER_BUTIR = 3500;

// Nama hari Indonesia, index sesuai Date.getDay() (0=Minggu ... 6=Sabtu)
const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
