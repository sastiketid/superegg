// Helper bersama, dipakai di semua halaman fitur (index.html memuat file ini sebelum
// script per-halaman -- lihat setiap halaman untuk deklarasi `dropdownData` miliknya).

const KEY_NAMA_SALES_LOGIN = 'superEggoV2_namaSales';

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
    return await response.json();
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
