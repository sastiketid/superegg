// Helper bersama, dipakai di semua halaman fitur (index.html memuat file ini sebelum
// script per-halaman -- lihat setiap halaman untuk deklarasi `dropdownData` miliknya).

const KEY_NAMA_SALES_LOGIN = 'superEggoV2_namaSales';
const KEY_RUTE_AKTIF = 'superEggoV2_ruteAktif'; // rute yang sudah dikunci di Manajemen Rute
const KEY_RIWAYAT = 'superEggoV2_riwayat';
const MAKS_RIWAYAT = 90; // riwayat = arsip rekap rute (snapshot ~15 KB/rute)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// ===== RUTE AKTIF (dibaca juga oleh Titik Baru & Pembeli End User saat dibuka dari rute) =====

function ambilRuteAktif() {
  try { return JSON.parse(localStorage.getItem(KEY_RUTE_AKTIF)); } catch (e) { return null; }
}
function simpanRuteAktifKeStorage(rute) {
  localStorage.setItem(KEY_RUTE_AKTIF, JSON.stringify(rute));
}
// true kalau halaman ini dibuka dari dashboard rute (?rute=1) DAN rutenya masih ada
function dibukaDariRute() {
  return new URLSearchParams(location.search).get('rute') === '1' && !!ambilRuteAktif();
}

// ===== RIWAYAT LOKAL (cuma teks, tanpa foto -- localStorage cuma ~5MB) =====

function ambilRiwayat() {
  try { return JSON.parse(localStorage.getItem(KEY_RIWAYAT)) || []; } catch (e) { return []; }
}
function simpanRiwayat(tipe, data) {
  try {
    const list = ambilRiwayat();
    list.unshift({ tipe: tipe, waktu: new Date().toISOString(), data: data });
    localStorage.setItem(KEY_RIWAYAT, JSON.stringify(list.slice(0, MAKS_RIWAYAT)));
  } catch (e) { console.error('Gagal simpan riwayat:', e); }
}

// ===== CACHE DAFTAR (tampil instan saat halaman dibuka, lalu diperbarui dari server) =====
const AKSI_DICACHE = ['getDaftarTokoAktif', 'getTokoUntukRute', 'getTokoNonAktif', 'getHutang'];
function ambilCacheAPI(action) {
  try { return JSON.parse(localStorage.getItem('superEggoV2_cache_' + action)); } catch (e) { return null; }
}

// ===== AUTO-REFRESH DATA (perubahan manual di spreadsheet ikut kebawa tanpa reload) =====
// ponytail: polling tiap interval selama tab terlihat + saat app dibuka lagi -- ganti ke
// realtime (Supabase) setelah migrasi database.
function pantauPerubahan(fn, intervalMs = 60000) {
  setInterval(() => { if (document.visibilityState === 'visible') fn(); }, intervalMs);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fn(); });
}

// ===== HUTANG & TITIPAN DI FORM LAPORAN =====
// Dipakai Laporan Satuan (prefix '') & modal laporan Manajemen Rute (prefix 'rl-'); id elemennya
// sama persis selain prefix. `detail` = hasil getDetailToko ({telurDiWarung, hutang}).
const HARGA_PER_BUTIR = 3500;
const elHutang = (p, id) => document.getElementById(p + id);
const angkaDariRupiah = teks => parseInt(String(teks || '').replace(/[^0-9]/g, ''), 10) || 0;
const teksRupiah = n => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

// Selisih setoran yang diketik terhadap estimasi (telur terjual x harga); 0 kalau setoran >= estimasi.
function hitungKekuranganSetoran(p, detail) {
  const sisa = elHutang(p, 'sisa-telur').value;
  if (sisa === '') return 0;
  const estimasi = Math.max(0, (detail.telurDiWarung || 0) - (parseInt(sisa, 10) || 0)) * HARGA_PER_BUTIR;
  return Math.max(0, estimasi - angkaDariRupiah(elHutang(p, 'total-setoran').value));
}

// Tombol cepat "Isi dengan kekurangan setoran" cuma muncul kalau setoran < estimasi.
function perbaruiKekuranganSetoran(p, detail) {
  const kurang = hitungKekuranganSetoran(p, detail);
  const btn = elHutang(p, 'hutang-kurang-btn');
  btn.classList.toggle('hidden', kurang <= 0);
  btn.textContent = `Isi dengan kekurangan setoran ${teksRupiah(kurang)}`;
}

function isiKekuranganKeHutang(p, detail) {
  const input = elHutang(p, 'hutang-baru');
  input.value = String(hitungKekuranganSetoran(p, detail));
  formatRupiahInput(input);
  const ket = elHutang(p, 'hutang-ket');
  if (!ket.value.trim()) ket.value = 'Kurang bayar setoran';
}

// Reset bagian hutang & info titipan setiap kali form dibuka / detail toko baru datang.
function siapkanHutangLaporan(p, detail) {
  const saldo = detail.hutang || 0;
  elHutang(p, 'detail-hutang-row').classList.toggle('hidden', saldo <= 0);
  elHutang(p, 'detail-hutang').textContent = teksRupiah(saldo);
  elHutang(p, 'bayar-hutang-group').classList.toggle('hidden', saldo <= 0);
  elHutang(p, 'bayar-hutang-sisa').textContent = teksRupiah(saldo);
  ['bayar-hutang', 'hutang-baru', 'hutang-ket'].forEach(id => { elHutang(p, id).value = ''; });
  perbaruiKekuranganSetoran(p, detail);
  perbaruiInfoTitipan(p, detail);
}

// Hutang baru = tagihan di luar tempo telur (bukan uang yang dibawa). Bayar dibatasi sisa hutang
// (server juga menolak kalau lebih).
function ambilHutangLaporan(p, detail) {
  return {
    hutangBaru: angkaDariRupiah(elHutang(p, 'hutang-baru').value),
    hutangKeterangan: elHutang(p, 'hutang-ket').value.trim(),
    bayarHutang: Math.min(angkaDariRupiah(elHutang(p, 'bayar-hutang').value), detail.hutang || 0)
  };
}

// Perubahan titipan = restock - stok lama (Stop -> restock 0). Dipakai rekap rute untuk mencocokkan
// telur keluar dengan uang: (keluar - retur - perubahan titipan) x harga = setoran telur.
function perubahanTitipan(p, detail) {
  const status = elHutang(p, 'status-val').value;
  const isian = elHutang(p, 'jumlah-restock').value;
  if (status === 'Stop') return { stokLama: detail.telurDiWarung || 0, restock: 0, delta: -(detail.telurDiWarung || 0) };
  if (status !== 'Restock' || isian === '') return null;
  const restock = parseInt(isian, 10) || 0;
  return { stokLama: detail.telurDiWarung || 0, restock, delta: restock - (detail.telurDiWarung || 0) };
}

function teksPerubahanTitipan(t, stop) {
  if (!t) return '';
  if (stop) return `Toko stop: titipan ${t.stokLama} butir ditarik`;
  if (t.delta > 0) return `Titipan bertambah +${t.delta} butir (sebelumnya ${t.stokLama} → sekarang ${t.restock}), ditagih kunjungan berikutnya`;
  if (t.delta < 0) return `Titipan berkurang ${t.delta} butir (sebelumnya ${t.stokLama} → sekarang ${t.restock})`;
  return `Titipan tetap ${t.restock} butir`;
}

function perbaruiInfoTitipan(p, detail) {
  const el = elHutang(p, 'info-titipan');
  const t = perubahanTitipan(p, detail);
  el.textContent = teksPerubahanTitipan(t, elHutang(p, 'status-val').value === 'Stop');
  const stop = elHutang(p, 'status-val').value === 'Stop';
  el.className = 'info-titipan' + (!t ? ' hidden' : stop ? '' : t.delta > 0 ? ' tambah' : t.delta < 0 ? ' kurang' : '');
}

function ringkasanHutangLaporan(h, t, stop) {
  return (t ? `<p><strong>Titipan:</strong> ${teksPerubahanTitipan(t, stop)}</p>` : '') +
    (h.bayarHutang ? `<p><strong>Bayar Hutang:</strong> <span style="color:var(--success)">${teksRupiah(h.bayarHutang)}</span></p>` : '') +
    (h.hutangBaru ? `<p><strong>Hutang Baru:</strong> <span style="color:var(--danger)">${teksRupiah(h.hutangBaru)}</span>${h.hutangKeterangan ? ` (${h.hutangKeterangan})` : ''}</p>` : '');
}

// ===== LOKASI HP DI PETA =====
// Titik biru + lingkar akurasi yang terus mengikuti GPS, ditambah tombol "ke lokasi saya" di pojok peta.
// Pane sendiri (z-index di atas pin toko) supaya titik biru tidak tertutup pin. onPosisi dipanggil tiap update.
function pantauLokasiSaya(map, onPosisi) {
  const state = { posisi: null };
  map.createPane('lokasiSaya').style.zIndex = 650;
  let titik = null, lingkar = null;
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(p => {
      const ll = [p.coords.latitude, p.coords.longitude];
      state.posisi = { lat: ll[0], lng: ll[1], akurasi: p.coords.accuracy };
      if (!titik) {
        lingkar = L.circle(ll, { pane: 'lokasiSaya', radius: p.coords.accuracy, color: '#2563EB', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
        titik = L.circleMarker(ll, { pane: 'lokasiSaya', radius: 7, color: '#FFF', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).addTo(map).bindTooltip('Lokasi saya');
      } else {
        titik.setLatLng(ll);
        lingkar.setLatLng(ll).setRadius(p.coords.accuracy);
      }
      if (onPosisi) onPosisi(state.posisi);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }
  const Tombol = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('button', 'btn-lokasi-saya');
      b.type = 'button';
      b.title = 'Ke lokasi saya';
      b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
      L.DomEvent.on(b, 'click', e => {
        L.DomEvent.stop(e);
        if (state.posisi) map.setView([state.posisi.lat, state.posisi.lng], Math.max(map.getZoom(), 16));
        else tampilAlert('warning', 'Lokasi Belum Terbaca', 'Pastikan GPS aktif dan izin lokasi untuk aplikasi ini diberikan.');
      });
      return b;
    }
  });
  new Tombol({ position: 'bottomright' }).addTo(map);
  return state;
}

// Terima "lat, long" (desimal titik/koma) atau link Google Maps (".../@-7.55,110.83,17z", "?q=-7.55,110.83").
function parseKoordinatInput(teks) {
  const s = String(teks || '').trim();
  let m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) m = s.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.')), lng = parseFloat(m[2].replace(',', '.'));
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

// ===== PIN PETA BERNOMOR =====
// SVG + dominant-baseline="central" supaya angka benar-benar di tengah lingkaran (versi div+flex
// sebelumnya meleset karena metrik font & border di luar iconSize). Diameter melebar untuk 3 digit.
function buatIkonNomor(nomor, warna, besar = false) {
  const teks = String(nomor);
  const d = (besar ? 26 : 22) + (teks.length > 2 ? 6 : 0);
  const r = d / 2;
  const fs = teks.length > 2 ? 10 : 11;
  return L.divIcon({
    className: 'pin-nomor',
    html: `<svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}"><circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="${warna}" stroke="#fff" stroke-width="2"/><text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-size="${fs}" font-weight="700" fill="#fff">${teks}</text></svg>`,
    iconSize: [d, d], iconAnchor: [r, r], tooltipAnchor: [0, -r]
  });
}

// Arsitektur buat fitur login yang akan menyusul: siapa pun yang membangun flow login nanti
// tinggal nulis nama sales-nya ke localStorage key KEY_NAMA_SALES_LOGIN begitu login sukses,
// dan semua form yang sudah pakai ambilNamaSalesLogin() otomatis ikut ke-isi -- tidak perlu
// ubah apa pun di form-nya lagi. Sampai fitur login itu ada, key ini tidak pernah ditulis
// siapa pun jadi selalu kosong; field yang pakai ini WAJIB tetap bisa diisi manual sebagai fallback.
function ambilNamaSalesLogin() {
  return localStorage.getItem(KEY_NAMA_SALES_LOGIN) || '';
}

// tipe 'success' tidak butuh konfirmasi tap dari user (bukan hal yang bisa gagal/perlu
// ditindaklanjuti), jadi cukup toast auto-dismiss. error/warning tetap modal dengan tombol
// karena itu butuh perhatian eksplisit sebelum user lanjut.
function tampilAlert(tipe, judul, pesan, aksiSetelahTutup = null) {
  if (tipe === 'success') {
    tampilToast(judul, pesan, aksiSetelahTutup);
    return;
  }

  const modal = document.getElementById('custom-alert');
  const iconBox = document.getElementById('alert-icon');
  document.getElementById('alert-title').textContent = judul;
  document.getElementById('alert-text').textContent = pesan;

  iconBox.className = "modal-icon";
  if (tipe === 'error') { iconBox.classList.add('error'); iconBox.innerHTML = "✖"; }
  else { iconBox.classList.add('warning'); iconBox.innerHTML = "!"; }

  modal.classList.add('show');
  document.getElementById('alert-btn').onclick = function() {
    modal.classList.remove('show');
    if (typeof aksiSetelahTutup === 'function') aksiSetelahTutup();
  };
}
function tutupAlert() { document.getElementById('custom-alert').classList.remove('show'); }

function tampilToast(judul, pesan, aksiSetelahTutup = null) {
  let toast = document.getElementById('toast-sukses');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-sukses';
    toast.className = 'toast-sukses';
    toast.innerHTML = '<span class="toast-icon">✔</span><div><strong id="toast-judul"></strong><p id="toast-pesan"></p></div>';
    document.body.appendChild(toast);
  }
  document.getElementById('toast-judul').textContent = judul;
  document.getElementById('toast-pesan').textContent = pesan;

  clearTimeout(toast._timeoutId);
  toast.classList.remove('show');
  void toast.offsetWidth; // force reflow -- biar animasi masuk ulang kalau toast dipanggil beruntun
  toast.classList.add('show');

  toast._timeoutId = setTimeout(() => {
    toast.classList.remove('show');
    if (typeof aksiSetelahTutup === 'function') aksiSetelahTutup();
  }, 2500);
}

function initCustomDropdown(idPrefix, onSelect) {
  const input = document.getElementById(idPrefix + '-input');
  const hidden = document.getElementById(idPrefix + '-val');
  const list = document.getElementById(idPrefix + '-list');
  if (!input || !hidden || !list) return;

  const render = (query) => {
    list.innerHTML = "";
    let data = dropdownData[idPrefix] || [];
    let filtered = data.filter(d => d.label.toLowerCase().includes(query.toLowerCase()));

    if (filtered.length === 0) {
      list.innerHTML = '<li class="no-result">Tidak ditemukan</li>';
      return;
    }

    filtered.forEach(d => {
      let li = document.createElement('li');
      li.textContent = d.label;
      li.onclick = (e) => {
        e.stopPropagation();
        input.value = d.label;
        hidden.value = d.value;
        list.classList.remove('show');
        if (onSelect) onSelect(d.value, d);
      };
      list.appendChild(li);
    });
  };

  input.addEventListener('focus', () => { render(input.value); list.classList.add('show'); });
  input.addEventListener('click', (e) => { e.stopPropagation(); render(""); list.classList.add('show'); });
  input.addEventListener('input', (e) => {
    hidden.value = "";
    render(e.target.value);
    list.classList.add('show');
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      let data = dropdownData[idPrefix] || [];
      let matched = data.find(d => String(d.value) === String(hidden.value));
      if (matched && input.value !== matched.label) {
        input.value = matched.label;
      } else if (!matched) {
        input.value = "";
      }
    }, 250);
  });
}

document.addEventListener('click', (e) => {
  document.querySelectorAll('.custom-select-list').forEach(list => list.classList.remove('show'));
});

async function jalankanFetchAPI(actionName, payloadData = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/proxy', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName, data: payloadData }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const hasil = await response.json();
    // Satu titik catat riwayat untuk semua form kirim (Laporan, Titik Baru, End User, Hutang).
    if (AKSI_DICACHE.includes(actionName) && Array.isArray(hasil)) {
      try { localStorage.setItem('superEggoV2_cache_' + actionName, JSON.stringify(hasil)); } catch (e) {}
    }
    return hasil;
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Server terlalu lama merespons (lebih dari 30 detik). Cek koneksi internet lalu coba lagi.');
      console.error("API Timeout:", actionName);
      throw timeoutErr;
    }
    console.error("API Error:", err);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatRupiahInput(input) {
  let rawValue = input.value.replace(/[^0-9]/g, ''); if (!rawValue) { input.value = ""; return; }
  input.value = "Rp. " + rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Loading di dalam tombol: label tombol diganti 3 titik berlompatan + tombol dikunci,
// dipakai di semua tombol kirim/submit sebagai ganti overlay layar penuh.
function tampilLoadingTombol(btn) {
  if (!btn || btn.dataset.loadingAsli !== undefined) return; // sudah dalam status loading
  btn.dataset.loadingAsli = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-loading-dots"><span></span><span></span><span></span></span>';
}

function sembunyikanLoadingTombol(btn) {
  if (!btn || btn.dataset.loadingAsli === undefined) return;
  btn.innerHTML = btn.dataset.loadingAsli;
  btn.disabled = false;
  delete btn.dataset.loadingAsli;
}

// Coba bagikan foto lewat Web Share API (buka sheet share bawaan HP, termasuk WhatsApp
// kalau terpasang) -- ini satu-satunya cara dari halaman web buat nyerahkan file gambar
// ke aplikasi lain; wa.me cuma bisa prefill teks, tidak bisa attach gambar sama sekali.
// Sengaja TIDAK ada fallback redirect ke wa.me di sini -- itu bikin tab web WhatsApp kebuka
// tiap kali sheet share ini dibatalkan/di-cancel user (navigator.share() reject AbortError
// juga masuk catch), bukan cuma saat benar-benar tidak didukung. Return true kalau berhasil
// dibagikan lengkap dengan foto, false kalau gagal/dibatalkan/tidak didukung -- pemanggil
// yang menentukan fallback-nya sendiri (biasanya simpanFotoKeDevice).
async function bagikanFotoKeWA(dataUrl, namaFile, teksPesan) {
  try {
    const resBlob = await fetch(dataUrl);
    const blob = await resBlob.blob();
    const file = new File([blob], namaFile, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: teksPesan });
      return true;
    }
  } catch (err) {
    console.error('Gagal share foto:', err);
  }
  return false;
}

function simpanFotoKeDevice(dataUrl, namaFile) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = namaFile;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Kompres canvas foto ke JPEG sekecil mungkin (turunkan kualitas bertahap sampai di bawah
// target ukuran, atau mentok kualitas minimum) -- dipakai semua fitur yang upload foto,
// biar folder Drive nggak cepat penuh.
function hitungUkuranKB(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return (base64.length * 3 / 4) / 1024;
}

function kompresCanvasKeDataUrl(canvas, maxSizeKB = 300, kualitasAwal = 0.7, kualitasMin = 0.3) {
  let kualitas = kualitasAwal;
  let dataUrl = canvas.toDataURL('image/jpeg', kualitas);
  while (hitungUkuranKB(dataUrl) > maxSizeKB && kualitas > kualitasMin) {
    kualitas -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', kualitas);
  }
  return dataUrl;
}

// ===== REKAP RUTE (dipakai Manajemen Rute & arsip rekap di Riwayat) =====
const UKURAN_SEKTOR = 10; // batas maksimal titik per sektor (limit waypoint Google Maps)
const SEKTOR_WARNA = ["#4F46E5", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#0EA5E9"];
const HARI_REKAP = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const BULAN_REKAP = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tandaButir = n => (n > 0 ? '+' : '') + n;
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatRupiah(n) {
  return "Rp " + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function formatTanggalRekap(iso) {
  const d = new Date(iso);
  return `${HARI_REKAP[d.getDay()]}, ${d.getDate()} ${BULAN_REKAP[d.getMonth()]} ${d.getFullYear()}`;
}

// Rumus cek telur (dari pemilik): (telur keluar ke toko - retur - perubahan titipan) x harga = uang telur.
// Perubahan titipan per toko = restock - stok lama (Titik Baru & Aktif Kembali: stok lama 0). Toko STOP
// tidak masuk perubahan titipan: seluruh stok lamanya "ditarik" dan ditambahkan terpisah di rumus.
// Laporan dari sebelum fitur titipan tidak menyimpan stok lama -> cek tidak bisa dihitung untuk rute itu.
function hitungRekapRute(rute) {
  let uangTelur = 0, totalRestock = 0, totalSisaTelur = 0, totalHutangBaru = 0, totalBayarHutang = 0, perubahanTitipan = 0, titipanDitarik = 0;
  let stokLamaLengkap = true;
  const tokoTutup = [], tokoStop = [], titipan = [], hutangBaru = [], bayarHutang = [];
  rute.stops.forEach(s => {
    if (s.status === 'tutup') { tokoTutup.push(s.nama); return; }
    if (s.status !== 'dilapor') return;
    uangTelur += s.setoran || 0;
    totalRestock += s.restock || 0;
    totalSisaTelur += s.sisaTelur || 0;
    const mulaiNol = s.titikBaru || s.aktifKembali;
    const stokLama = mulaiNol ? 0 : s.stokLama;
    if (stokLama === undefined) stokLamaLengkap = false;
    if (s.stopToko) {
      tokoStop.push(stokLama === undefined ? s.nama : `${s.nama} (titipan ${stokLama} butir ditarik)`);
      if (stokLama !== undefined) titipanDitarik += stokLama;
    } else if (stokLama !== undefined) {
      const delta = (s.restock || 0) - stokLama;
      perubahanTitipan += delta;
      if (delta !== 0) titipan.push({ nama: s.nama, stokLama, restock: s.restock || 0, delta,
        ket: s.titikBaru ? 'titik baru' : s.aktifKembali ? 'aktif kembali' : '' });
    }
    if (s.hutangBaru) { totalHutangBaru += s.hutangBaru; hutangBaru.push({ nama: s.nama, jumlah: s.hutangBaru, ket: s.hutangKeterangan || '' }); }
    if (s.bayarHutang) { totalBayarHutang += s.bayarHutang; bayarHutang.push({ nama: s.nama, jumlah: s.bayarHutang }); }
  });
  // End user = jual putus (bukan titipan): telurnya ikut keluar, uangnya terpisah.
  const endUser = rute.endUser || [];
  const totalEndUser = endUser.reduce((n, e) => n + (e.jumlah || 0), 0);
  const uangEndUser = endUser.reduce((n, e) => n + (e.uang || 0), 0);
  const totalSetoran = uangTelur + totalBayarHutang + uangEndUser; // semua uang yang dibawa sales
  const telurKeluar = totalRestock + totalEndUser;
  const telurAwal = rute.stokBawa || 0;
  const uangTelurSeharusnya = stokLamaLengkap ? (totalRestock - totalSisaTelur - perubahanTitipan + titipanDitarik) * HARGA_PER_BUTIR : null;
  return {
    telurAwal, telurKeluar, telurKeluarToko: totalRestock, totalEndUser, totalSisaTelur, sisaTelurBaru: telurAwal - telurKeluar,
    perubahanTitipan, titipanDitarik, titipan, uangTelur, uangTelurSeharusnya, uangEndUser, totalBayarHutang, totalHutangBaru, totalSetoran,
    hutangBaru, bayarHutang, tokoTutup, tokoStop, endUser,
    totalTitikBaru: rute.stops.filter(s => s.titikBaru).length,
    totalAktifKembali: rute.stops.filter(s => s.aktifKembali).length,
    totalTokoDikunjungi: rute.stops.length // jumlah toko yang masuk list sektor rute ini
  };
}

// Daftar rincian per toko -- dipakai rekap web & teks WA, jadi isinya selalu sama.
function daftarRincianRekap(r) {
  const ketTitipan = t => t.ket ? ` (${t.ket})` : '';
  return [
    ['Titipan bertambah', r.titipan.filter(t => t.delta > 0).map(t => `${t.nama} ${t.restock} butir (sebelumnya ${t.stokLama} butir)${ketTitipan(t)}`), ''],
    ['Titipan berkurang', r.titipan.filter(t => t.delta < 0).map(t => `${t.nama} ${t.restock} butir (sebelumnya ${t.stokLama} butir)${ketTitipan(t)}`), ''],
    ['Hutang baru (tagihan)', r.hutangBaru.map(h => `${h.nama} - ${formatRupiah(h.jumlah)}${h.ket ? ` (${h.ket})` : ''}`), 'merah'],
    ['Bayar hutang', r.bayarHutang.map(h => `${h.nama} - ${formatRupiah(h.jumlah)}`), ''],
    ['Pembeli end user', r.endUser.map(e => `${e.nama} - ${e.jumlah} butir - ${formatRupiah(e.uang || 0)}`), ''],
    ['Toko stop', r.tokoStop, ''],
    ['Toko tutup', r.tokoTutup, 'merah']
  ].filter(([, isi]) => isi.length > 0);
}

function teksCekTelur(r, html) {
  if (r.uangTelurSeharusnya === null) return 'Cek telur tidak tersedia: sebagian laporan di rute ini dibuat sebelum fitur titipan.';
  const selisih = r.uangTelur - r.uangTelurSeharusnya;
  const b = (t, kls) => html ? `<b class="${kls || ''}">${t}</b>` : t;
  const ditarik = r.titipanDitarik ? ` + ditarik toko stop ${r.titipanDitarik}` : '';
  return `Cek telur: (keluar toko ${r.telurKeluarToko} - retur ${r.totalSisaTelur} - perubahan titipan ${tandaButir(r.perubahanTitipan)}${ditarik}) x ${formatRupiah(HARGA_PER_BUTIR)} = ${b(formatRupiah(r.uangTelurSeharusnya))}. ` +
    `Uang telur ${b(formatRupiah(r.uangTelur))}, ` +
    (selisih === 0 ? b('cocok', 'ok') : b(`selisih ${selisih > 0 ? '+' : '-'}${formatRupiah(Math.abs(selisih))}`, 'beda'));
}

const ringkasKunjungan = r => `Toko dikunjungi: ${r.totalTokoDikunjungi} (tutup ${r.tokoTutup.length}, stop ${r.tokoStop.length}, titik baru ${r.totalTitikBaru}${r.totalAktifKembali ? `, aktif kembali ${r.totalAktifKembali}` : ''})`;

// Isi rekap (tanpa judul) -- elemen ini juga yang di-screenshot untuk WA.
function htmlRekap(rute) {
  const r = hitungRekapRute(rute);
  const tile = (label, nilai, warna) => `<div class="rekap-tile"><div class="rekap-label">${label}</div><div class="rekap-value"${warna ? ` style="color:${warna};"` : ''}>${nilai}</div></div>`;
  return `<p class="rekap-kunjungan">${ringkasKunjungan(r)}</p>
    <div class="rekap-judul">Telur</div>
    <div class="rekap-grid">
      ${tile('Telur Awal', `${r.telurAwal} btr`)}${tile('Telur Keluar', `${r.telurKeluar} btr`)}
      ${tile('Telur Retur', `${r.totalSisaTelur} btr`)}${tile('Sisa Telur Baru', `${r.sisaTelurBaru} btr`)}
      ${tile('Perubahan Titipan', `${tandaButir(r.perubahanTitipan)} btr`)}${tile('End User', `${r.totalEndUser} btr`)}
    </div>
    <div class="rekap-judul">Uang</div>
    <div class="rekap-grid">
      ${tile('Uang Telur', formatRupiah(r.uangTelur))}${tile('Bayar Hutang', formatRupiah(r.totalBayarHutang), 'var(--success)')}
      ${tile('Uang End User', formatRupiah(r.uangEndUser))}${tile('Hutang Baru (Tagihan)', formatRupiah(r.totalHutangBaru), 'var(--danger)')}
    </div>
    <div class="rekap-total"><span>TOTAL SETORAN<br>(semua uang dibawa)</span><b>${formatRupiah(r.totalSetoran)}</b></div>
    <p class="rekap-cek">${teksCekTelur(r, true)}</p>
    ${daftarRincianRekap(r).map(([judul, isi, kls]) =>
      `<div class="rekap-list ${kls}"><strong>${judul}:</strong>${isi.map((x, i) => `<p>${i + 1}. ${escHtml(x)}</p>`).join('')}</div>`).join('')}`;
}

function teksRekapWA(rute) {
  const r = hitungRekapRute(rute);
  let teks = `*REKAP RUTE - ${formatTanggalRekap(rute.createdAt)}*\n\n`;
  teks += `${ringkasKunjungan(r)}\n\n`;
  teks += `*Telur*\n`;
  teks += `Telur awal: ${r.telurAwal} butir\n`;
  teks += `Telur keluar: ${r.telurKeluar} butir (toko ${r.telurKeluarToko}, end user ${r.totalEndUser})\n`;
  teks += `Retur: ${r.totalSisaTelur} butir\n`;
  teks += `Sisa telur baru: ${r.sisaTelurBaru} butir\n`;
  teks += `Perubahan titipan: ${tandaButir(r.perubahanTitipan)} butir\n\n`;
  teks += `*Uang*\n`;
  teks += `Uang telur: ${formatRupiah(r.uangTelur)}\n`;
  teks += `Bayar hutang: ${formatRupiah(r.totalBayarHutang)}\n`;
  teks += `End user: ${formatRupiah(r.uangEndUser)}\n`;
  teks += `*TOTAL SETORAN: ${formatRupiah(r.totalSetoran)}*\n`;
  teks += `Hutang baru (tagihan): ${formatRupiah(r.totalHutangBaru)}\n\n`;
  teks += `${teksCekTelur(r, false)}\n`;
  daftarRincianRekap(r).forEach(([judul, isi]) => {
    teks += `\n${judul}:\n`;
    isi.forEach((x, i) => { teks += `${i + 1}. ${x}\n`; });
  });
  return teks;
}

// List toko apa adanya saat rute diakhiri (hanya baca): per sektor, bernomor, warna sesuai status.
function htmlListToko(rute) {
  const label = s => s.status === 'tutup' ? '<span class="stop-tutup-label">Tutup</span>'
    : s.stopToko ? '<span class="stop-stop-label">Stop</span>' : s.status === 'belum' ? '<span class="stop-belum-label">Belum</span>' : '';
  const detail = s => {
    if (s.status !== 'dilapor') return '';
    const stokLama = (s.titikBaru || s.aktifKembali) ? 0 : s.stokLama;
    const bagian = [`Setoran ${formatRupiah(s.setoran || 0)}`, `sisa ${s.sisaTelur || 0}`, `restock ${s.restock || 0}`];
    if (s.stopToko && stokLama !== undefined) bagian.push(`titipan ${stokLama} ditarik`);
    else if (stokLama !== undefined && (s.restock || 0) !== stokLama) bagian.push(`titipan ${tandaButir((s.restock || 0) - stokLama)}`);
    if (s.hutangBaru) bagian.push(`hutang ${formatRupiah(s.hutangBaru)}`);
    if (s.bayarHutang) bagian.push(`bayar ${formatRupiah(s.bayarHutang)}`);
    if (s.titikBaru) bagian.push('titik baru');
    if (s.aktifKembali) bagian.push('aktif kembali');
    return `<small class="stop-detail">${bagian.join(' · ')}</small>`;
  };
  let html = '';
  for (let awal = 0; awal < rute.stops.length; awal += UKURAN_SEKTOR) {
    const warna = SEKTOR_WARNA[(awal / UKURAN_SEKTOR) % SEKTOR_WARNA.length];
    const sektor = rute.stops.slice(awal, awal + UKURAN_SEKTOR);
    html += `<div class="sektor-box"><div class="sektor-heading" style="background:${warna};"><span class="sektor-nama">Sektor ${awal / UKURAN_SEKTOR + 1}</span><span class="sektor-count">${sektor.length} toko</span></div><div class="sektor-body">` +
      sektor.map((s, i) => `<div class="route-stop-card status-${s.stopToko ? 'stop' : s.status}" style="cursor:default;">
        <span class="stop-badge" style="background:${warna};">${awal + i + 1}</span>
        <span class="stop-nama">${escHtml(s.nama)}${detail(s)}</span>${label(s)}</div>`).join('') +
      `</div></div>`;
  }
  return html || '<p class="rekap-cek">Tidak ada toko di rute ini.</p>';
}

// Screenshot elemen rekap + teks, lalu bagikan (WA lewat share sheet bawaan). Fallback: simpan gambar
// ke perangkat & salin teks (clipboard dibatasi waktu -- bisa menggantung tanpa resolve).
async function kirimRekapWA(elemen, teks, btn) {
  tampilLoadingTombol(btn);
  try {
    const canvas = await html2canvas(elemen, { backgroundColor: '#ffffff', ignoreElements: (el) => el === btn });
    const dataUrl = kompresCanvasKeDataUrl(canvas, 500);
    const namaFile = `REKAP-RUTE_${Date.now()}.jpg`;
    const dibagikan = await bagikanFotoKeWA(dataUrl, namaFile, teks);
    if (!dibagikan) {
      simpanFotoKeDevice(dataUrl, namaFile);
      await Promise.race([navigator.clipboard.writeText(teks).catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]);
      tampilAlert('success', 'Laporan Disimpan', 'Screenshot rekap disimpan ke perangkat & teks pesan disalin, siap ditempel manual ke WhatsApp.');
    } else {
      tampilAlert('success', 'Berhasil Dibagikan', 'Laporan rekap sudah dibagikan.');
    }
  } catch (err) {
    tampilAlert('error', 'Gagal Membuat Laporan', err.message || 'Terjadi kesalahan saat membuat screenshot rekap.');
  } finally {
    sembunyikanLoadingTombol(btn);
  }
}

// Snapshot rute untuk arsip Riwayat: cuma field yang dipakai rekap & list toko (hemat localStorage).
function snapshotRute(rute) {
  const ambil = ['nama', 'status', 'setoran', 'restock', 'sisaTelur', 'stokLama', 'stopToko', 'titikBaru', 'aktifKembali', 'hutangBaru', 'hutangKeterangan', 'bayarHutang'];
  return {
    createdAt: rute.createdAt, stokBawa: rute.stokBawa || 0, endUser: rute.endUser || [],
    stops: rute.stops.map(s => Object.fromEntries(ambil.filter(k => s[k] !== undefined).map(k => [k, s[k]])))
  };
}
