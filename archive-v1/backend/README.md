# Backend Super Eggo (Google Apps Script)

Hasil pemisahan `code.gs.md` (satu file, 564 baris) menjadi service per fitur.
`code.gs.md` di root tetap dibiarkan apa adanya sebagai referensi/backup.

## Struktur file

| File | Isi |
|---|---|
| `Config.gs` | GID sheet, folder ID Drive, cache key & TTL — satu sumber kebenaran |
| `Gateway.gs` | `doPost` (router aksi) + `respondJSON` |
| `Utils.gs` | `getSheetByGid`, `appendPengirimanAman`, `appendMasterAman` |
| `SalesService.gs` | `getSalesListInternal` |
| `StoreService.gs` | `getStoresBySalesInternal` |
| `MapService.gs` | `getMapDataInternal` |
| `RoutingService.gs` | `getRoutingDataInternal` |
| `LaporanService.gs` | `submitLaporanInternal` |
| `TitikBaruService.gs` | `submitTitikBaruInternal` |
| `EndCustomerService.gs` | `submitEndCustomerInternal` |
| `SyncTools.gs` | `sinkronisasiFotoLama` (alat maintenance manual) |

Semua fungsi disalin persis dari `code.gs.md` — hanya literal GID sheet,
folder ID Drive, cache key/TTL, dan teks barang statis yang diganti jadi
konstanta dari `Config.gs`. Tidak ada perubahan logika.

Google Apps Script itu single global scope: file boleh dipecah sebanyak
apapun, tidak perlu `require`/`import`, semua fungsi & konstanta otomatis
saling terlihat selama berada di project GAS yang sama.

## Cara pakai sekarang (manual, belum pakai clasp)

1. Buka project Apps Script yang terhubung ke spreadsheet Super Eggo.
2. Hapus isi `Code.gs` bawaan (atau file lama yang isinya kode monolitik).
3. Buat file script baru per baris tabel di atas (nama boleh sama persis),
   copy-paste isi masing-masing file dari folder `backend/` ke situ.
4. Deploy ulang sebagai Web App (versi baru) agar perubahan aktif.

## Nanti kalau sudah pakai clasp

Tinggal `clasp clone <scriptId>` lalu ganti isi `.gs` hasil clone dengan
file-file di `backend/` ini (rename tanpa folder, taruh sejajar
`appsscript.json` sesuai kebutuhan clasp), lalu `clasp push`.
