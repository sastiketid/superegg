'use strict';
// Helper bersama server.js & import.js: koneksi DB, panggilan ke GAS, konversi baris.

const { Pool, types } = require('pg');
types.setTypeParser(20, Number); // bigint -> Number (nilai di sini jauh di bawah 2^53)

const pool = new Pool({ max: 5 }); // PGHOST/PGUSER/PGPASSWORD/PGDATABASE dari env

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const num = v => Math.round(Number(v) || 0);

// Nama hari WIB (server berjalan UTC).
function hariIniJakarta() {
  return HARI[new Date(Date.now() + 7 * 3600e3).getUTCDay()];
}

// Sama dengan parseLatLong di Utils.gs: terima "-7.5, 110.8" maupun "-7,5, 110,8".
function parseLatLong(raw) {
  const m = String(raw || '').trim().match(/^(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.'));
  const lng = parseFloat(m[2].replace(',', '.'));
  return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
}

// Baris tabel toko -> objek toko format SyncService.gs
function keSnapshot(r) {
  return {
    id: r.id, nama: r.nama, pemilik: r.pemilik, hp: r.hp, latlong: r.latlong,
    riwayatTerjual: r.riwayat_terjual, stok: r.stok,
    kirimTerakhir: r.kirim_terakhir ? r.kirim_terakhir.toISOString() : '',
    setoranTerakhir: r.setoran_terakhir, riwayatSetoran: r.riwayat_setoran,
    riwayatSisa: r.riwayat_sisa, sisaTerakhir: r.sisa_terakhir, keterangan: r.keterangan,
    fotoTerakhir: r.foto_terakhir, folderFoto: r.folder_foto, jadwal: r.jadwal, totalKirim: r.total_kirim
  };
}

// Objek toko (dari sheet) -> insert/update penuh. aktif=true karena asalnya MASTER_WARUNG.
async function upsertTokoDariSheet(db, t, aktif = true) {
  await db.query(`
    insert into toko (id, nama, pemilik, hp, latlong, riwayat_terjual, stok, kirim_terakhir, setoran_terakhir,
      riwayat_setoran, riwayat_sisa, sisa_terakhir, keterangan, foto_terakhir, folder_foto, jadwal, total_kirim, aktif, diperbarui)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())
    on conflict (id) do update set nama=excluded.nama, pemilik=excluded.pemilik, hp=excluded.hp, latlong=excluded.latlong,
      riwayat_terjual=excluded.riwayat_terjual, stok=excluded.stok, kirim_terakhir=excluded.kirim_terakhir,
      setoran_terakhir=excluded.setoran_terakhir, riwayat_setoran=excluded.riwayat_setoran, riwayat_sisa=excluded.riwayat_sisa,
      sisa_terakhir=excluded.sisa_terakhir, keterangan=excluded.keterangan, foto_terakhir=excluded.foto_terakhir,
      folder_foto=excluded.folder_foto, jadwal=excluded.jadwal, total_kirim=excluded.total_kirim, aktif=excluded.aktif, diperbarui=now()`,
  [t.id, String(t.nama || '').trim(), t.pemilik || '', t.hp || '', t.latlong || '', num(t.riwayatTerjual), num(t.stok),
    t.kirimTerakhir || null, num(t.setoranTerakhir), num(t.riwayatSetoran), num(t.riwayatSisa), num(t.sisaTerakhir),
    t.keterangan || '', t.fotoTerakhir || '', t.folderFoto || '', t.jadwal || '', num(t.totalKirim), aktif]);
}

const teksPolos = html => String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
const jeda = ms => new Promise(r => setTimeout(r, ms));

// Hasil eksekusi GAS diambil lewat URL echo. URL ini kadang 404 sesaat ("file tidak bisa dibuka"),
// padahal skripnya sudah jalan -- coba ulang GET-nya, JANGAN eksekusi ulang skripnya.
async function ambilEchoGas(url) {
  let terakhir = '';
  for (let i = 1; i <= 4; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const teks = await res.text();
    try { return JSON.parse(teks); } catch (e) { terakhir = `HTTP ${res.status}: ${teksPolos(teks)}`; }
    await jeda(1500 * i);
  }
  throw new Error(`Balasan GAS hilang di echo: ${terakhir}`);
}

// POST ke web app GAS dengan redirect diikuti manual. Google membalas 302 ke URL echo (hasil);
// sesekali 302 ke host GAS lain -- auto-follow fetch mengubahnya jadi GET sehingga doPost tidak
// pernah jalan ("fungsi skrip tidak ditemukan: doGet"), jadi di sini di-POST ulang.
async function panggilGas(action, data = {}) {
  const body = JSON.stringify({ action, data: { ...data, secret: process.env.SYNC_SECRET } });
  let url = process.env.GAS_SYNC_URL;
  for (let lompat = 0; lompat < 3; lompat++) {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      redirect: 'manual', signal: AbortSignal.timeout(90000)
    });
    const lokasi = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && lokasi) {
      if (lokasi.includes('/macros/echo')) return ambilEchoGas(lokasi);
      url = lokasi;
      continue;
    }
    const teks = await res.text();
    try { return JSON.parse(teks); } catch (e) { throw new Error(`GAS bukan JSON (HTTP ${res.status}): ${teksPolos(teks)}`); }
  }
  throw new Error('GAS: terlalu banyak redirect');
}

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const hasil = await fn(c);
    await c.query('commit');
    return hasil;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

module.exports = { pool, num, hariIniJakarta, parseLatLong, keSnapshot, upsertTokoDariSheet, panggilGas, tx };
