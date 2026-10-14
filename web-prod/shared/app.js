// Helper bersama, dipakai di semua halaman fitur (index.html memuat file ini sebelum
// script per-halaman -- lihat setiap halaman untuk deklarasi `dropdownData` miliknya).

const KEY_NAMA_SALES_LOGIN = 'superEggoV2_namaSales';
const KEY_RUTE_AKTIF = 'superEggoV2_ruteAktif'; // rute yang sudah dikunci di Manajemen Rute
const KEY_RIWAYAT = 'superEggoV2_riwayat';
const MAKS_RIWAYAT = 300;

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

// ===== AUTO-REFRESH DATA (perubahan manual di spreadsheet ikut kebawa tanpa reload) =====
// ponytail: polling tiap interval selama tab terlihat + saat app dibuka lagi -- ganti ke
// realtime (Supabase) setelah migrasi database.
function pantauPerubahan(fn, intervalMs = 60000) {
  setInterval(() => { if (document.visibilityState === 'visible') fn(); }, intervalMs);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fn(); });
}

// ===== HUTANG DI FORM LAPORAN =====
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

function perbaruiKekuranganSetoran(p, detail) {
  const kurang = hitungKekuranganSetoran(p, detail);
  elHutang(p, 'hutang-kurang-box').classList.toggle('hidden', kurang <= 0);
  elHutang(p, 'hutang-kurang-teks').textContent = `Catat kekurangan ${teksRupiah(kurang)} sebagai hutang`;
}

function siapkanHutangLaporan(p, detail) {
  const saldo = detail.hutang || 0;
  elHutang(p, 'detail-hutang-row').classList.toggle('hidden', saldo <= 0);
  elHutang(p, 'detail-hutang').textContent = teksRupiah(saldo);
  elHutang(p, 'bayar-hutang-group').classList.toggle('hidden', saldo <= 0);
  elHutang(p, 'bayar-hutang').value = '';
  elHutang(p, 'hutang-kurang').checked = false;
  perbaruiKekuranganSetoran(p, detail);
}

// Bayar dibatasi sisa hutang (server juga menolak kalau lebih).
function ambilHutangLaporan(p, detail) {
  return {
    hutangBaru: elHutang(p, 'hutang-kurang').checked ? hitungKekuranganSetoran(p, detail) : 0,
    bayarHutang: Math.min(angkaDariRupiah(elHutang(p, 'bayar-hutang').value), detail.hutang || 0)
  };
}

function ringkasanHutangLaporan(h) {
  return (h.hutangBaru ? `<p><strong>Hutang Baru:</strong> <span style="color:var(--danger)">${teksRupiah(h.hutangBaru)}</span></p>` : '') +
    (h.bayarHutang ? `<p><strong>Bayar Hutang:</strong> <span style="color:var(--success)">${teksRupiah(h.bayarHutang)}</span></p>` : '');
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
    if (actionName.startsWith('submit') && hasil && hasil.success) {
      const { fotoBase64, ...ringkas } = payloadData;
      simpanRiwayat(actionName, ringkas);
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
