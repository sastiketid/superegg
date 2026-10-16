'use strict';
// API Super Muncul: kontrak sama persis dengan Gateway.gs lama (POST {action, data}),
// jadi frontend tidak berubah -- cukup /api/proxy di Vercel diarahkan ke sini.
// Postgres = sumber data utama; spreadsheet dicerminkan lewat outbox -> GAS (lihat SyncService.gs).

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool, num, hariIniJakarta, parseLatLong, keSnapshot, upsertTokoDariSheet, panggilGas, tx } = require('./lib');

const API_KEY = process.env.API_KEY || '';
const SYNC_AKTIF = process.env.SYNC_AKTIF === '1';
const MAKS_BODY = 15 * 1024 * 1024;
const byNama = (a, b) => a.nama.localeCompare(b.nama);
const safeTs = ts => String(ts || '').replace(/[\/:]/g, '-');
const fotoValid = f => typeof f === 'string' && /^data:image\/[a-z+]+;base64,/.test(f);
const koordinatValid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const teksLatLong = (lat, lng) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

async function antre(c, jenis, isi, foto = null, namaFile = null) {
  await c.query('insert into outbox (jenis, isi, foto, nama_file) values ($1, $2, $3, $4)', [jenis, isi, foto, namaFile]);
}

// Saldo hutang satu toko. Dicocokkan lewat ID toko ATAU nama (catatan hutang lama/manual
// cuma punya nama) -- sama seperti halaman Catatan Hutang yang mengelompokkan per nama.
async function saldoHutangToko(db, t) {
  const { rows: [r] } = await db.query(`select coalesce(sum(case when tipe = 'Bayar' then -jumlah else jumlah end), 0) as saldo
    from hutang where toko_id = $1 or lower(trim(nama)) = lower(trim($2))`, [t.id, t.nama]);
  return Math.max(0, r.saldo);
}

async function catatHutang(c, h) {
  const { rows: [r] } = await c.query(`insert into hutang (id, nama, tipe, jumlah, keterangan, sales, toko_id)
    values ($1,$2,$3,$4,$5,$6,$7) returning *`,
  [crypto.randomUUID(), h.nama, h.tipe, h.jumlah, h.keterangan || '', h.sales || '', h.storeId || '']);
  await antre(c, 'hutang', { id: r.id, tanggal: r.tanggal.toISOString(), nama: r.nama, tipe: r.tipe, jumlah: r.jumlah, keterangan: r.keterangan, sales: r.sales, storeId: r.toko_id });
}

// ===== AKSI (nama & bentuk respons = Gateway.gs) =====

const aksi = {
  async getDaftarTokoAktif() {
    const { rows } = await pool.query("select id, nama from toko where aktif and nama <> ''");
    return rows.sort(byNama);
  },

  async getDetailToko(d) {
    const { rows: [t] } = await pool.query('select * from toko where id = $1 and aktif', [String(d.storeId || '')]);
    if (!t) return { success: false, message: 'Toko tidak ditemukan.' };
    return { success: true, data: { nama: t.nama, pemilik: t.pemilik, telurDiWarung: t.stok, keteranganTerakhir: t.keterangan, hutang: await saldoHutangToko(pool, t) } };
  },

  async getTokoUntukRute() {
    const { rows } = await pool.query("select id, nama, latlong, jadwal from toko where aktif and nama <> ''");
    return rows.map(r => ({ ...r, k: parseLatLong(r.latlong) })).filter(r => r.k)
      .map(r => ({ id: r.id, nama: r.nama, lat: r.k.lat, lng: r.k.lng, jadwal: r.jadwal.trim() })).sort(byNama);
  },

  async getTokoNonAktif() {
    const { rows } = await pool.query("select id, nama, latlong from toko where not aktif and nama <> ''");
    return rows.map(r => ({ ...r, k: parseLatLong(r.latlong) })).filter(r => r.k)
      .map(r => ({ id: r.id, nama: r.nama, lat: r.k.lat, lng: r.k.lng })).sort(byNama);
  },

  async getHutang() {
    const { rows } = await pool.query('select * from hutang order by tanggal, id');
    return rows.map(h => ({ tanggal: h.tanggal.toISOString(), nama: h.nama, tipe: h.tipe, jumlah: h.jumlah, keterangan: h.keterangan, sales: h.sales, storeId: h.toko_id }));
  },

  async submitLaporanSatuan(d) {
    if (d.status !== 'Restock' && d.status !== 'Stop') return { success: false, message: "Status harus 'Restock' atau 'Stop'." };
    if (!fotoValid(d.fotoBase64)) return { success: false, message: 'Foto laporan wajib ada.' };

    return tx(async c => {
      const { rows: [t] } = await c.query('select * from toko where id = $1 and aktif for update', [String(d.storeId || '')]);
      if (!t) return { success: false, message: 'Toko tidak ditemukan (ID tidak cocok).' };

      // Rumus = LaporanSatuanService.gs (lihat SUPEREGG-V2.md "Logika isi tiap kolom")
      const sisaBaru = num(d.sisaTelur);
      const f = t.riwayat_terjual + (t.stok - sisaBaru);
      const j = t.riwayat_setoran + t.setoran_terakhir;
      const k = t.riwayat_sisa + t.sisa_terakhir;
      const q = t.total_kirim + 1;
      const restock = d.status === 'Restock' ? num(d.jumlahRestock) : 0;
      const keterangan = d.keteranganTouched ? String(d.keterangan || '') : t.keterangan;
      const namaFile = `${q} - ${safeTs(d.timestamp)} - ${t.nama}.jpg`;

      // Hutang dari form laporan: kekurangan setoran (hutang baru) & bayar hutang lama, satu transaksi.
      const hutangBaru = Math.max(0, num(d.hutangBaru));
      const bayarHutang = Math.max(0, num(d.bayarHutang));
      if (bayarHutang > 0) {
        const saldo = await saldoHutangToko(c, t);
        if (bayarHutang > saldo) return { success: false, message: `Bayar hutang (Rp ${bayarHutang.toLocaleString('id-ID')}) melebihi sisa hutang toko (Rp ${saldo.toLocaleString('id-ID')}).` };
      }

      await c.query('insert into laporan (toko_id, status, sisa_telur, setoran, restock, keterangan) values ($1,$2,$3,$4,$5,$6)',
        [t.id, d.status, sisaBaru, num(d.totalSetoran), restock, keterangan]);

      if (d.status === 'Stop') {
        const { rows: [u] } = await c.query(`update toko set aktif=false, riwayat_terjual=$2, riwayat_setoran=$3, riwayat_sisa=$4,
          total_kirim=$5, diperbarui=now() where id=$1 returning *`, [t.id, f, j, k, q]);
        await antre(c, 'tokoStop', keSnapshot(u), d.fotoBase64, namaFile);
      } else {
        const { rows: [u] } = await c.query(`update toko set riwayat_terjual=$2, stok=$3, kirim_terakhir=now(), setoran_terakhir=$4,
          riwayat_setoran=$5, riwayat_sisa=$6, sisa_terakhir=$7, keterangan=$8, total_kirim=$9,
          jadwal = case when trim(jadwal) = '' then $10 else jadwal end, diperbarui=now() where id=$1 returning *`,
        [t.id, f, restock, num(d.totalSetoran), j, k, sisaBaru, keterangan, q, hariIniJakarta()]);
        await antre(c, 'toko', keSnapshot(u), d.fotoBase64, namaFile);
      }

      if (bayarHutang > 0) await catatHutang(c, { nama: t.nama, tipe: 'Bayar', jumlah: bayarHutang, keterangan: 'Dibayar saat laporan', storeId: t.id });
      if (hutangBaru > 0) await catatHutang(c, { nama: t.nama, tipe: 'Hutang', jumlah: hutangBaru, keterangan: String(d.hutangKeterangan || '').trim().slice(0, 200) || 'Dicatat saat laporan', storeId: t.id });

      return { success: true, message: d.status === 'Stop' ? `${t.nama} berhasil di-stop dan dipindah ke arsip.` : 'Laporan berhasil disimpan.' };
    });
  },

  async submitTitikBaru(d) {
    const nama = String(d.namaWarung || '').trim();
    if (!nama) return { success: false, message: 'Nama warung wajib diisi.' };
    if (!fotoValid(d.fotoBase64)) return { success: false, message: 'Foto titik baru wajib ada.' };
    const id = crypto.randomUUID();

    return tx(async c => {
      const { rows: [u] } = await c.query(`insert into toko (id, nama, pemilik, hp, latlong, stok, kirim_terakhir, keterangan, jadwal, total_kirim)
        values ($1,$2,$3,$4,$5,$6, now(),$7,$8,1) returning *`,
      [id, nama, String(d.pemilik || ''), String(d.hp || ''), `${d.lat}, ${d.long}`, num(d.jumlahAwal), String(d.keterangan || ''), hariIniJakarta()]);
      await antre(c, 'toko', keSnapshot(u), d.fotoBase64, `1 - ${safeTs(d.timestamp)} - ${nama}.jpg`);
      return { success: true, message: `${nama} berhasil didaftarkan sebagai titik baru!`, id };
    });
  },

  // Daftar toko stop untuk diaktifkan kembali (termasuk yang koordinatnya kosong -- diisi GPS baru).
  async getTokoStop() {
    const { rows } = await pool.query("select id, nama, pemilik, hp, total_kirim from toko where not aktif and nama <> ''");
    return rows.map(r => ({ id: r.id, nama: r.nama, pemilik: r.pemilik, hp: r.hp, totalKirim: r.total_kirim })).sort(byNama);
  },

  // Toko stop aktif lagi: data lama (riwayat, folder foto, jadwal) tetap, titipan mulai dari drop baru.
  // Sinkron 'toko' menulis ulang baris MASTER_WARUNG & membuang barisnya dari WARUNG_STOP (SyncService.gs).
  async aktifkanToko(d) {
    if (!fotoValid(d.fotoBase64)) return { success: false, message: 'Foto wajib ada.' };
    const lat = Number(d.lat), lng = Number(d.long);
    if (!koordinatValid(lat, lng)) return { success: false, message: 'Lokasi GPS tidak valid.' };

    return tx(async c => {
      const { rows: [t] } = await c.query('select * from toko where id = $1 and not aktif for update', [String(d.storeId || '')]);
      if (!t) return { success: false, message: 'Toko stop tidak ditemukan (mungkin sudah aktif).' };
      const nama = String(d.namaWarung || '').trim() || t.nama;
      const q = t.total_kirim + 1;
      const { rows: [u] } = await c.query(`update toko set aktif=true, nama=$2, pemilik=$3, hp=$4, latlong=$5, stok=$6, kirim_terakhir=now(),
        setoran_terakhir=0, sisa_terakhir=0, keterangan=$7, total_kirim=$8, jadwal = case when trim(jadwal) = '' then $9 else jadwal end,
        diperbarui=now() where id=$1 returning *`,
      [t.id, nama, String(d.pemilik ?? t.pemilik), String(d.hp ?? t.hp), teksLatLong(lat, lng), num(d.jumlahAwal),
        String(d.keterangan || ''), q, hariIniJakarta()]);
      await c.query('insert into laporan (toko_id, status, sisa_telur, setoran, restock, keterangan) values ($1, $2, 0, 0, $3, $4)',
        [t.id, 'Aktif Kembali', num(d.jumlahAwal), u.keterangan]);
      await antre(c, 'toko', keSnapshot(u), d.fotoBase64, `${q} - ${safeTs(d.timestamp)} - ${nama}.jpg`);
      return { success: true, message: `${nama} aktif kembali dan masuk ke daftar toko.`, id: t.id };
    });
  },

  async updateLokasiToko(d) {
    const lat = Number(d.lat), lng = Number(d.lng);
    if (!koordinatValid(lat, lng)) return { success: false, message: 'Koordinat tidak valid.' };
    return tx(async c => {
      const { rows: [u] } = await c.query('update toko set latlong = $2, diperbarui = now() where id = $1 and aktif returning *',
        [String(d.storeId || ''), teksLatLong(lat, lng)]);
      if (!u) return { success: false, message: 'Toko tidak ditemukan.' };
      await antre(c, 'toko', keSnapshot(u));
      return { success: true, message: `Lokasi ${u.nama} diperbarui.` };
    });
  },

  async submitPembeliEndUser(d) {
    const nama = String(d.namaCustomer || '').trim();
    if (!nama) return { success: false, message: 'Nama customer wajib diisi.' };
    const foto = fotoValid(d.fotoBase64) ? d.fotoBase64 : null;

    return tx(async c => {
      const { rows: [e] } = await c.query('insert into end_customer (id, nama, sales, hp, jumlah) values ($1,$2,$3,$4,$5) returning *',
        [crypto.randomUUID(), nama, String(d.namaSales || ''), String(d.hp || ''), num(d.jumlahBeli)]);
      await antre(c, 'endCustomer', { id: e.id, nama: e.nama, sales: e.sales, hp: e.hp, jumlah: e.jumlah, foto: '' }, foto, `${safeTs(d.timestamp)} - ${nama}.jpg`);
      return { success: true, message: `${nama} berhasil disimpan.` };
    });
  },

  async submitHutang(d) {
    const nama = String(d.nama || '').trim();
    const jumlah = num(d.jumlah);
    if (!nama) return { success: false, message: 'Nama wajib diisi.' };
    if (d.tipe !== 'Hutang' && d.tipe !== 'Bayar') return { success: false, message: "Tipe harus 'Hutang' atau 'Bayar'." };
    if (jumlah <= 0) return { success: false, message: 'Jumlah harus lebih dari 0.' };

    return tx(async c => {
      await catatHutang(c, { nama, tipe: d.tipe, jumlah, keterangan: String(d.keterangan || ''), sales: String(d.sales || ''), storeId: String(d.storeId || '') });
      const label = d.tipe === 'Bayar' ? 'Pembayaran' : 'Hutang';
      return { success: true, message: `${label} ${nama} berhasil dicatat.` };
    });
  }
};

// ===== SINKRON KE SPREADSHEET =====
// Satu event dikirim per waktu, urut id. Gagal -> coba lagi dengan jeda bertambah (maks 15 menit);
// setelah 20x ditandai gagal supaya antrian tidak macet selamanya (lihat /health, bisa diulang
// manual: update outbox set gagal=false, percobaan=0 where gagal).

let sinkronJalan = false;
const JEDA_TARIK_EDIT = 20000;
let terakhirTarikEdit = 0;

// Simpan dulu ke DB, baru ack ke GAS supaya antrian dihapus. Kalau ack gagal, tarikan berikutnya
// mengembalikan data yang sama -- upsert penuh, jadi aman diulang.
async function tarikEditSheet() {
  const hasil = await panggilGas('ambilEditSheet');
  if (!hasil.success) throw new Error(hasil.message || 'ambilEditSheet gagal');
  for (const t of hasil.data) if (t.id && t.nama) await upsertTokoDariSheet(pool, t);
  if (hasil.jumlahAntrian) {
    const ack = await panggilGas('ackEditSheet', { jumlah: hasil.jumlahAntrian });
    if (!ack.success) throw new Error(ack.message || 'ackEditSheet gagal');
  }
  if (hasil.data.length) console.log(`Tarik edit sheet: ${hasil.data.length} toko diperbarui`);
}

async function catatGagal(ev, pesan) {
  const percobaan = ev.percobaan + 1;
  const jedaDetik = Math.min(900, 5 * 2 ** percobaan);
  await pool.query(`update outbox set percobaan=$2, error=$3, gagal=$4, coba_lagi=now() + make_interval(secs => $5) where id=$1`,
    [ev.id, percobaan, String(pesan).slice(0, 500), percobaan >= 20, jedaDetik]);
  console.error(`Sinkron outbox #${ev.id} (${ev.jenis}) gagal ke-${percobaan}: ${pesan}`);
}

async function siklusSinkron() {
  if (!SYNC_AKTIF || sinkronJalan) return;
  sinkronJalan = true;
  try {
    const { rows: [ada] } = await pool.query('select 1 from outbox where selesai is null and not gagal limit 1');
    // Tarik edit manual DULU sebelum kirim snapshot, supaya edit pemilik di sheet tidak tertimpa.
    // Kalau tarikan gagal, outbox JANGAN dikirim di siklus ini (snapshot DB bisa lebih lama dari sheet).
    if (ada || Date.now() - terakhirTarikEdit > JEDA_TARIK_EDIT) {
      try { await tarikEditSheet(); terakhirTarikEdit = Date.now(); } catch (e) {
        console.error('Tarik edit sheet gagal:', e.message);
        return;
      }
    }

    for (;;) {
      const { rows: [ev] } = await pool.query('select * from outbox where selesai is null and not gagal order by id limit 1');
      if (!ev || ev.coba_lagi > new Date()) break;

      let hasil;
      try {
        hasil = await panggilGas('syncDariDb', { jenis: ev.jenis, isi: ev.isi, foto: ev.foto, namaFile: ev.nama_file });
      } catch (e) { await catatGagal(ev, e.message); break; }
      if (!hasil.success) { await catatGagal(ev, hasil.message || 'syncDariDb gagal'); break; }

      await tx(async c => {
        await c.query('update outbox set selesai=now(), foto=null, error=null where id=$1', [ev.id]);
        if ((ev.jenis === 'toko' || ev.jenis === 'tokoStop') && (hasil.fotoTerakhir || hasil.folderFoto)) {
          await c.query(`update toko set foto_terakhir = coalesce(nullif($2, ''), foto_terakhir),
            folder_foto = coalesce(nullif($3, ''), folder_foto) where id=$1`, [ev.isi.id, hasil.fotoTerakhir || '', hasil.folderFoto || '']);
        } else if (ev.jenis === 'endCustomer' && hasil.foto) {
          await c.query('update end_customer set foto=$2 where id=$1', [ev.isi.id, hasil.foto]);
        }
      });
    }
  } catch (e) {
    console.error('Siklus sinkron error:', e.message);
  } finally {
    sinkronJalan = false;
  }
}

// ===== HTTP =====

function kirim(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function rahasiaCocok(diberikan, seharusnya) {
  const a = Buffer.from(String(diberikan || ''));
  const b = Buffer.from(String(seharusnya || ''));
  return b.length >= 16 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function bacaJson(req) {
  const potongan = [];
  let ukuran = 0;
  for await (const p of req) {
    ukuran += p.length;
    if (ukuran > MAKS_BODY) throw Object.assign(new Error('Data terlalu besar.'), { status: 413 });
    potongan.push(p);
  }
  try { return JSON.parse(Buffer.concat(potongan).toString('utf8')); } catch (e) {
    throw Object.assign(new Error('Body bukan JSON.'), { status: 400 });
  }
}

// Push dari trigger onEdit (installable) GAS: baris MASTER_WARUNG yang baru diedit, langsung
// masuk DB dalam hitungan detik. Tarikan berkala (ambilEditSheet + ack) tetap jalan sebagai cadangan.
async function terimaEditSheet(req, res) {
  if (!rahasiaCocok(req.headers['x-sync-secret'], process.env.SYNC_SECRET)) return kirim(res, 401, { success: false, message: 'Tidak diizinkan.' });
  const { toko } = await bacaJson(req);
  let n = 0;
  for (const t of Array.isArray(toko) ? toko : []) if (t && t.id && t.nama) { await upsertTokoDariSheet(pool, t); n++; }
  if (n) console.log(`Push edit sheet: ${n} toko diperbarui`);
  kirim(res, 200, { success: true, jumlah: n });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    try {
      const { rows: [s] } = await pool.query(`select count(*) filter (where selesai is null and not gagal)::int as antre,
        count(*) filter (where gagal)::int as gagal from outbox`);
      return kirim(res, 200, { ok: true, sinkron: SYNC_AKTIF, outboxAntre: s.antre, outboxGagal: s.gagal,
        tarikEditTerakhir: terakhirTarikEdit ? new Date(terakhirTarikEdit).toISOString() : null });
    } catch (e) { return kirim(res, 503, { ok: false }); }
  }
  if (req.method !== 'POST') return kirim(res, 405, { success: false, message: 'Metode tidak diizinkan.' });
  if (req.url === '/sheet-edit') {
    return terimaEditSheet(req, res).catch(e => kirim(res, e.status || 500, { success: false, message: e.message }));
  }
  if (!rahasiaCocok(req.headers['x-api-key'], API_KEY)) return kirim(res, 401, { success: false, message: 'Tidak diizinkan.' });

  let action, data;
  try { ({ action, data } = await bacaJson(req)); } catch (e) {
    return kirim(res, e.status || 400, { success: false, message: e.message });
  }
  const fn = Object.prototype.hasOwnProperty.call(aksi, action) ? aksi[action] : null;
  if (!fn) return kirim(res, 200, { success: false, message: 'Action API tidak dikenal.' });

  try {
    const hasil = await fn(data || {});
    kirim(res, 200, hasil);
    if (action.startsWith('submit') || action === 'aktifkanToko' || action === 'updateLokasiToko') setImmediate(siklusSinkron); // langsung cerminkan ke sheet
  } catch (e) {
    console.error(`Aksi ${action} error:`, e);
    kirim(res, 200, { success: false, message: 'Gagal memproses API: ' + e.message });
  }
});

async function mulai() {
  if (API_KEY.length < 16) throw new Error('API_KEY wajib diisi (min 16 karakter).');
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  server.listen(3000, () => console.log(`API Super Muncul jalan di :3000 (sinkron ${SYNC_AKTIF ? 'AKTIF' : 'MATI'})`));
  setInterval(siklusSinkron, 5000);
}

process.on('SIGTERM', () => server.close(() => pool.end().then(() => process.exit(0))));
mulai().catch(e => { console.error(e); process.exit(1); });
