'use strict';
// Impor penuh spreadsheet -> Postgres (dipakai saat migrasi / sebelum cutover).
//   node import.js                  -> tolak kalau DB sudah berisi laporan/outbox (data asli)
//   node import.js --buang-data-tes -> kosongkan semua tabel dulu (data uji coba sebelum cutover)
// Setelah cutover JANGAN dijalankan lagi: DB sudah jadi sumber utama.

const { pool, num, upsertTokoDariSheet, panggilGas, tx } = require('./lib');
const fs = require('fs');
const path = require('path');

async function main() {
  const buang = process.argv.includes('--buang-data-tes');
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const { rows: [isi] } = await pool.query('select (select count(*) from laporan)::int as laporan, (select count(*) from outbox)::int as outbox');
  if ((isi.laporan || isi.outbox) && !buang) {
    throw new Error(`DB sudah berisi ${isi.laporan} laporan & ${isi.outbox} outbox. Pakai --buang-data-tes kalau itu data uji coba.`);
  }

  console.log('Mengambil data dari spreadsheet...');
  const hasil = await panggilGas('eksporSemua');
  if (!hasil.success) throw new Error(hasil.message || 'eksporSemua gagal');
  const { master, stop, endCustomer, hutang } = hasil.data;

  await tx(async c => {
    await c.query('truncate toko, laporan, end_customer, hutang, outbox restart identity');
    for (const t of master) await upsertTokoDariSheet(c, t, true);
    let dobel = 0;
    for (const s of stop) {
      // Toko yang (keliru) ada di dua sheet: versi MASTER_WARUNG (aktif) yang dipakai.
      const { rowCount } = await c.query(`insert into toko (id, nama, pemilik, hp, latlong, riwayat_terjual, riwayat_setoran,
        riwayat_sisa, folder_foto, total_kirim, aktif) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false) on conflict (id) do nothing`,
      [s.id, s.nama, s.pemilik, s.hp, s.latlong, num(s.riwayatTerjual), num(s.riwayatSetoran), num(s.riwayatSisa), s.folderFoto, num(s.totalKirim)]);
      dobel += 1 - rowCount;
    }
    for (const e of endCustomer) {
      await c.query('insert into end_customer (id, nama, sales, hp, jumlah, foto, dibuat) values ($1,$2,$3,$4,$5,$6,null) on conflict (id) do nothing',
        [e.id, e.nama, e.sales, e.hp, num(e.jumlah), e.foto]);
    }
    for (const h of hutang) {
      if (num(h.jumlah) <= 0) continue;
      await c.query(`insert into hutang (id, tanggal, nama, tipe, jumlah, keterangan, sales, toko_id)
        values ($1, coalesce($2::timestamptz, now()), $3,$4,$5,$6,$7,$8) on conflict (id) do nothing`,
      [h.id, h.tanggal || null, h.nama, h.tipe, num(h.jumlah), h.keterangan, h.sales, h.storeId]);
    }
    console.log(`Impor selesai: ${master.length} toko aktif, ${stop.length - dobel} toko stop${dobel ? ` (${dobel} dobel dilewati)` : ''}, ${endCustomer.length} end customer, ${hutang.length} hutang.`);
  });
}

main().then(() => pool.end()).catch(e => { console.error('IMPOR GAGAL:', e.message); pool.end(); process.exit(1); });
