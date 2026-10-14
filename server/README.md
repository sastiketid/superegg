# Backend Super Muncul (Postgres + Node API di VPS naraya)

```
HP sales ─► Vercel (frontend + /api/proxy) ─x-api-key─► Cloudflare Tunnel ─► 127.0.0.1:8082 api ─► db (Postgres)
                                                                                    │ outbox (urut, retry)
                                                                                    ▼
                                                     GAS deployment "Sinkron DB VPS" ─► Spreadsheet + foto Drive
```

- **Sumber data utama: Postgres.** Spreadsheet = cerminan yang terus terupdate.
- **DB → Sheet:** tiap kiriman masuk tabel `outbox` (snapshot baris penuh + foto base64), dikirim berurutan ke GAS `syncDariDb`, yang menulis baris & upload foto ke Drive seperti dulu. Gagal → dicoba ulang (jeda naik sampai 15 menit, maks 20x).
- **Sheet → DB:** edit manual di `MASTER_WARUNG` ditangkap `onEdit` ke sheet tersembunyi `_SINKRON`, ditarik API tiap 30 detik (dan selalu sebelum mengirim outbox, supaya edit manual tidak tertimpa). **Hapus/pindah baris manual tidak tersinkron** — stop toko lewat aplikasi. Edit manual sheet lain (END_CUSTOMER, HUTANG, WARUNG_STOP) juga tidak ikut.
- Kontrak API = `Gateway.gs` lama (`POST {action, data}`), jadi frontend tidak berubah.

## Batas resource (VPS dipakai bareng produksi naraya)

| Container | RAM limit | CPU | Pemakaian awal |
|---|---|---|---|
| `supermuncul-db-1` (postgres:16-alpine) | 160 MB | 0.5 | ~35 MB |
| `supermuncul-api-1` (node:22-alpine) | 128 MB | 0.5 | ~47 MB |

Project compose, network & volume terpisah dari naraya. Log dibatasi 2×5 MB per container. Port hanya `127.0.0.1:8082`.

## Rahasia (repo ini PUBLIK — jangan pernah di-commit)

- VPS `~/supermuncul/.env` (lihat `.env.example`): `PG_PASSWORD`, `API_KEY`, `GAS_SYNC_URL`, `SYNC_SECRET`, `SYNC_AKTIF`.
- `backend-prod/Secret.gs` (gitignored, ikut `clasp push`): `SYNC_SECRET`, harus sama dengan di `.env`.
- Vercel env (Production): `API_URL`, `API_KEY`.

## Deploy / update API

```bash
tar czf - --exclude node_modules -C server . | ssh naraya-vps 'tar xzf - -C ~/supermuncul'
ssh naraya-vps 'cd ~/supermuncul && docker compose up -d --build'
ssh naraya-vps 'curl -s 127.0.0.1:8082/health'
```

Backend GAS: `cd backend-prod && clasp push -f && clasp deploy -i <ID deployment sinkron, ada di GAS_SYNC_URL .env VPS> -d "..."`
(deployment sinkron; deployment produksi lama `AKfycbw8sb6...` dibiarkan untuk rollback).

## Cutover — SUDAH DILAKUKAN 14 Okt 2026 ±22.15 WIB

Status: produksi memakai API ini. Route `supermuncul-api.imaga.site` → `http://localhost:8082` sudah ada di tunnel `naraya-vps`, env Vercel `API_URL` + `API_KEY` terpasang, `SYNC_AKTIF=1`. Cek setelah cutover: seluruh sheet vs DB identik (119 aktif + 49 stop), kiriman asli pertama (Stop + foto) tersinkron dalam 8 detik.

Langkah di bawah dicatat untuk referensi (mis. memindahkan ke server lain):

1. Cloudflare Zero Trust → Tunnel naraya → Public Hostname baru, mis. `supermuncul-api.imaga.site` → `http://localhost:8082`. Cek: `curl https://supermuncul-api.imaga.site/health`.
2. Vercel: set `API_URL=https://supermuncul-api.imaga.site/` dan `API_KEY` (= `.env` VPS), lalu `vercel --prod --cwd web-prod`.
3. Segera impor ulang data terbaru dari sheet: `docker compose exec -T api node import.js` (menolak jalan kalau sudah ada kiriman asli masuk DB — tanda ada yang lolos di jeda ini).
4. `SYNC_AKTIF=1` di `.env`, lalu `docker compose up -d api`. Cek `/health` → `"sinkron": true`.

**Rollback:** hapus env `API_URL` di Vercel, redeploy → kembali ke GAS lama. Kiriman yang sempat masuk DB sudah tercermin di sheet selama sinkron aktif.

## Operasional

- Status antrian: `curl -s 127.0.0.1:8082/health` → `outboxAntre`, `outboxGagal`.
- Ulangi event gagal: `docker compose exec db psql -U supermuncul -c "update outbox set gagal=false, percobaan=0, coba_lagi=now() where gagal"`.
- Backup manual: `docker compose exec -T db pg_dump -U supermuncul supermuncul | gzip > ~/backups/supermuncul-$(date +%F).sql.gz`.
- `import.js` hanya untuk sebelum cutover; setelahnya DB adalah sumber utama.
