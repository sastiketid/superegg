# Arsip V1 (Super Eggo)

Arsip kode versi 1 (skema GID-based `SELURUH_WARUNG`/`Pengiriman`), digantikan
oleh V2 (skema `MASTER_WARUNG`/`WARUNG_STOP`/`END_CUSTOMER`) pada 2026-08-14.
Disimpan sebagai referensi/backup, bukan lagi dipakai — jangan dihapus.

## Isi

| Path | Apa ini |
|---|---|
| `code.gs.md` | Backend GAS V1 asli, satu file monolitik (564 baris) — sumber kebenaran V1 sebelum dipecah. |
| `backend/` | Hasil pemisahan `code.gs.md` jadi service per fitur (Config.gs, Gateway.gs, SalesService.gs, dst). Tidak pernah benar-benar di-`clasp`-kan/deploy — cuma split referensi, kode yang benar-benar live selalu `code.gs.md`/`Code.js` langsung di GAS editor. |
| `frontend/index.html` | Frontend V1 asli (satu file monolitik, ~88KB) yang dulu jadi isi root `super-eggo/` project Vercel. |
| `frontend/api/proxy.js` | Proxy Vercel V1 (`GAS_API_URL` -> forward ke GAS) yang dipasangkan dengan `index.html` di atas. |
| `frontend/SuperEggo.webp` | Logo yang dipakai `index.html` V1. |

## Kenapa diarsipkan, bukan dihapus

`code.gs.md` root & `index.html` root sudah lama jadi rujukan/backup selama
migrasi V2 dikerjakan (lihat `SUPEREGG-V2.md`, `SHEET.md`). Setelah production
resmi pindah ke V2, keduanya (plus hasil split `backend/`) dipindah ke sini
supaya root repo tidak campur aduk antara kode aktif dan kode lama, tapi
riwayatnya tetap ada kalau suatu saat perlu dicek ulang.

## Apa yang menggantikannya

- Backend production sekarang: `../backend-prod/` (deploy ke GAS project yang
  sama seperti V1 dulu -- deployment ID-nya di-timpa, bukan bikin baru).
- Frontend production sekarang: `../web-prod/` (deploy ke Vercel project baru
  `super-eggo-production` di akun `imagaa`, karena project Vercel V1 yang lama
  ternyata sudah tidak bisa diakses dari akun ini).
- Sandbox pengembangan (tempat V2 pertama kali dibangun & masih dipakai
  testing): `../backend-v2/` + `../web-v2/`.
