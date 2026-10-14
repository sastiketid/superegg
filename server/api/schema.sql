-- Skema Super Muncul. Dijalankan tiap API start (idempoten).
-- Nama kolom toko mengikuti MASTER_WARUNG (lihat SHEET.md), aktif=false = WARUNG_STOP.

create table if not exists toko (
  id               text primary key,
  nama             text not null,
  pemilik          text not null default '',
  hp               text not null default '',
  latlong          text not null default '',
  riwayat_terjual  bigint not null default 0,
  stok             bigint not null default 0,
  kirim_terakhir   timestamptz,
  setoran_terakhir bigint not null default 0,
  riwayat_setoran  bigint not null default 0,
  riwayat_sisa     bigint not null default 0,
  sisa_terakhir    bigint not null default 0,
  keterangan       text not null default '',
  foto_terakhir    text not null default '',
  folder_foto      text not null default '',
  jadwal           text not null default '',
  total_kirim      bigint not null default 0,
  aktif            boolean not null default true,
  diperbarui       timestamptz not null default now()
);

-- Log tiap kunjungan (tidak ada di spreadsheet; sheet cuma simpan kumulatif).
create table if not exists laporan (
  id          bigserial primary key,
  toko_id     text not null,
  waktu       timestamptz not null default now(),
  status      text not null,
  sisa_telur  bigint not null default 0,
  setoran     bigint not null default 0,
  restock     bigint not null default 0,
  keterangan  text not null default ''
);

create table if not exists end_customer (
  id      text primary key,
  nama    text not null,
  sales   text not null default '',
  hp      text not null default '',
  jumlah  bigint not null default 0,
  foto    text not null default '',
  dibuat  timestamptz default now()
);

create table if not exists hutang (
  id          text primary key,
  tanggal     timestamptz not null default now(),
  nama        text not null,
  tipe        text not null check (tipe in ('Hutang', 'Bayar')),
  jumlah      bigint not null check (jumlah > 0),
  keterangan  text not null default '',
  sales       text not null default '',
  toko_id     text not null default ''
);

-- Antrian perubahan yang harus dicerminkan ke spreadsheet lewat GAS (diproses berurutan).
create table if not exists outbox (
  id         bigserial primary key,
  jenis      text not null,          -- toko | tokoStop | endCustomer | hutang
  isi        jsonb not null,         -- snapshot baris penuh, jadi aman dikirim ulang
  foto       text,                   -- base64, dikosongkan setelah terkirim
  nama_file  text,
  percobaan  int not null default 0,
  coba_lagi  timestamptz not null default now(),
  error      text,
  gagal      boolean not null default false,
  dibuat     timestamptz not null default now(),
  selesai    timestamptz
);
create index if not exists outbox_pending on outbox (id) where selesai is null and not gagal;
