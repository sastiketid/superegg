// ==========================================
// KONFIGURASI GLOBAL
// ==========================================
// Semua GID sheet, ID folder Drive, dan cache key terpusat di sini
// supaya migrasi (pindah spreadsheet/folder) cukup ubah satu tempat.

// GID Sheet (Google Sheets tab identifiers)
const SHEET_GID_MASTER = 1772680131;      // Tab Master (data toko/warung)
const SHEET_GID_PENGIRIMAN = 1790905023;  // Tab Pengiriman (data transaksi/tagihan)

// Folder Google Drive tempat upload foto bukti (laporan, titik baru, end customer)
const DRIVE_FOLDER_ID_BUKTI = "1mTW30DulUaMJOXgUzS-RUFJ-vIut71du";

// Nama barang statis yang selalu sama di setiap transaksi
const BARANG_STATIS_DEFAULT = 'TAO001 - Paket Telur Asin Omega 10 Butir (Agen)';

// Cache keys
const CACHE_KEY_MAP_DATA = 'super_eggo_map_cache';
const CACHE_KEY_SALES_LIST = 'super_eggo_sales_list';
const CACHE_PREFIX_STORES = 'stores_cache_';
const CACHE_PREFIX_ROUTING = 'routing_cache_';

// Cache TTL (detik)
const CACHE_TTL_LONG = 1500;   // 25 menit -> sales list & map data
const CACHE_TTL_MEDIUM = 900;  // 15 menit -> stores & routing (filter default)
