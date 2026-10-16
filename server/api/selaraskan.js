'use strict';
// Selaraskan spreadsheet dengan DB (DB = acuan). Dipakai setelah DB di-restore dari backup:
//   docker compose exec -T api node selaraskan.js --cek   -> cuma tampilkan rencana
//   docker compose exec -T api node selaraskan.js         -> antrikan perbaikan ke outbox (dikirim loop sinkron)
// Cakupan: MASTER_WARUNG, WARUNG_STOP, END_CUSTOMER, HUTANG. Baris yang tidak ada di DB dihapus,
// baris yang beda/hilang ditulis ulang dari DB. Catatan: eksporSemua mengosongkan antrian edit manual.

const { pool, panggilGas, keSnapshot, num } = require('./lib');

const teks = v => String(v ?? '').trim();
const sama = (a, b, angka, huruf) => angka.every(k => num(a[k]) === num(b[k])) && huruf.every(k => teks(a[k]) === teks(b[k]));
const KOLOM_MASTER = [['riwayatTerjual', 'stok', 'setoranTerakhir', 'riwayatSetoran', 'riwayatSisa', 'sisaTerakhir', 'totalKirim'],
  ['nama', 'pemilik', 'hp', 'latlong', 'keterangan', 'fotoTerakhir', 'folderFoto', 'jadwal']];
const KOLOM_STOP = [['riwayatTerjual', 'riwayatSetoran', 'riwayatSisa', 'totalKirim'], ['nama', 'pemilik', 'hp', 'latlong', 'folderFoto']];

async function gasRetry(action) {
  for (let i = 0; i < 6; i++) {
    try { const r = await panggilGas(action); if (r.success) return r; } catch (e) { /* coba lagi */ }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`${action} gagal 6x`);
}

async function main() {
  const cekSaja = process.argv.includes('--cek');
  const { data: sheet } = await gasRetry('eksporSemua');
  const { rows: toko } = await pool.query('select * from toko');
  const { rows: ec } = await pool.query('select * from end_customer');
  const { rows: hu } = await pool.query('select * from hutang');
  const dbToko = Object.fromEntries(toko.map(t => [t.id, t]));
  const rencana = []; // [jenis, isi, keterangan]
  const hapus = (sh, id, nama) => rencana.push(['hapus', { sheet: sh, id }, `hapus ${nama} dari ${sh}`]);

  // MASTER_WARUNG
  const idMaster = new Set(sheet.master.map(t => t.id));
  for (const t of sheet.master) {
    const d = dbToko[t.id];
    if (!d) hapus('MASTER', t.id, t.nama);
    else if (!d.aktif) rencana.push(['tokoStop', keSnapshot(d), `${d.nama}: pindah ke WARUNG_STOP`]);
    else if (!sama(t, keSnapshot(d), ...KOLOM_MASTER)) rencana.push(['toko', keSnapshot(d), `${d.nama}: tulis ulang dari DB`]);
  }
  for (const d of toko) if (d.aktif && !idMaster.has(d.id)) rencana.push(['toko', keSnapshot(d), `${d.nama}: kembalikan ke MASTER_WARUNG`]);

  // WARUNG_STOP
  const idStop = new Set(sheet.stop.map(s => s.id));
  for (const s of sheet.stop) {
    const d = dbToko[s.id];
    if (!d) hapus('STOP', s.id, s.nama);
    else if (d.aktif) hapus('STOP', s.id, s.nama); // toko aktif tidak boleh ada di arsip stop
    else if (!idMaster.has(s.id) && !sama(s, keSnapshot(d), ...KOLOM_STOP)) rencana.push(['tokoStop', keSnapshot(d), `${d.nama}: tulis ulang di WARUNG_STOP`]);
  }
  for (const d of toko) if (!d.aktif && !idStop.has(d.id) && !idMaster.has(d.id)) rencana.push(['tokoStop', keSnapshot(d), `${d.nama}: kembalikan ke WARUNG_STOP`]);

  // END_CUSTOMER
  const dbEc = Object.fromEntries(ec.map(e => [e.id, e]));
  for (const e of sheet.endCustomer) if (!dbEc[e.id]) hapus('END_CUSTOMER', e.id, e.nama);
  const idEcSheet = Object.fromEntries(sheet.endCustomer.map(e => [e.id, e]));
  for (const e of ec) {
    const isi = { id: e.id, nama: e.nama, sales: e.sales, hp: e.hp, jumlah: e.jumlah, foto: e.foto };
    const s = idEcSheet[e.id];
    if (!s || !sama(s, isi, ['jumlah'], ['nama', 'sales', 'hp', 'foto'])) rencana.push(['endCustomer', isi, `end user ${e.nama}: tulis ulang`]);
  }

  // HUTANG
  const dbHu = Object.fromEntries(hu.map(h => [h.id, h]));
  for (const h of sheet.hutang) if (!dbHu[h.id]) hapus('HUTANG', h.id, `${h.nama} ${h.tipe} ${h.jumlah}`);
  const idHuSheet = Object.fromEntries(sheet.hutang.map(h => [h.id, h]));
  for (const h of hu) {
    const isi = { id: h.id, tanggal: h.tanggal.toISOString(), nama: h.nama, tipe: h.tipe, jumlah: h.jumlah, keterangan: h.keterangan, sales: h.sales, storeId: h.toko_id };
    const s = idHuSheet[h.id];
    if (!s || !sama(s, isi, ['jumlah'], ['nama', 'tipe', 'keterangan', 'sales', 'storeId'])) rencana.push(['hutang', isi, `hutang ${h.nama}: tulis ulang`]);
  }

  console.log(`Sheet: ${sheet.master.length} master, ${sheet.stop.length} stop, ${sheet.endCustomer.length} end user, ${sheet.hutang.length} hutang`);
  console.log(`DB   : ${toko.filter(t => t.aktif).length} aktif, ${toko.filter(t => !t.aktif).length} stop, ${ec.length} end user, ${hu.length} hutang`);
  console.log(rencana.length ? `${rencana.length} perbaikan:\n- ` + rencana.map(r => r[2]).join('\n- ') : 'Sheet sudah sama dengan DB.');
  if (cekSaja || !rencana.length) return;
  for (const [jenis, isi] of rencana) await pool.query('insert into outbox (jenis, isi) values ($1, $2)', [jenis, isi]);
  console.log(`${rencana.length} perbaikan diantrikan; loop sinkron mengirimnya ke sheet berurutan.`);
}

main().then(() => pool.end()).catch(e => { console.error('GAGAL:', e.message); pool.end(); process.exit(1); });
