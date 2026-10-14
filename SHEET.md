# Dokumentasi Struktur Data Spreadsheet

Dokumen ini berisi informasi mengenai daftar sheet dan detail nama kolom beserta tipe datanya pada spreadsheet ini (kecuali sheet pengiriman).

## 1. Daftar Nama Sheet
Berikut adalah daftar sheet yang tersedia:
* **MASTER_WARUNG**
* **END_CUSTOMER**
* **WARUNG_STOP**
* **HUTANG** (dibuat otomatis oleh backend saat fitur Catatan Hutang pertama kali dipakai)

---

## 2. Detail Kolom per Sheet

### A. Sheet: MASTER_WARUNG
* **Kolom A** - No - Angka/Nomor
* **Kolom B** - Nama Warung - Teks
* **Kolom C** - Pemilik - Teks
* **Kolom D** - No HP - Teks
* **Kolom E** - Latitude/Longitude - Teks
* **Kolom F** - Riwayat Telur Terjual - Angka/Nomor
* **Kolom G** - Telur di Warung (Saat ini) - Angka/Nomor
* **Kolom H** - Pengiriman Terakhir - Tanggal/Waktu
* **Kolom I** - Setoran Terakir - Angka/Nomor
* **Kolom J** - Riwayat Setoran - Angka/Nomor
* **Kolom K** - Riwayat Sisa Telur - Angka/Nomor
* **Kolom L** - Sisa Telur Terakhir - Angka/Nomor
* **Kolom M** - Keterangan Terakhir - Teks
* **Kolom N** - Link Foto Pengiriman Terakhir - Teks
* **Kolom O** - Riwayat Foto Pengiriman - Teks
* **Kolom P** - Jadwal Kirim - Teks/Tanggal
* **Kolom Q** - Total Pengiriman - Angka/Nomor

### B. Sheet: END_CUSTOMER
* **Kolom A** - No - Angka/Nomor
* **Kolom B** - Nama Customer - Teks
* **Kolom C** - Nama Sales - Teks
* **Kolom D** - No HP - Teks
* **Kolom E** - Jumlah Beli - Angka/Nomor
* **Kolom F** - Link Foto - Teks/Kosong

### C. Sheet: WARUNG_STOP
* **Kolom A** - No - Angka/Nomor
* **Kolom B** - Nama Warung - Teks
* **Kolom C** - Pemilik - Teks
* **Kolom D** - No HP - Teks
* **Kolom E** - Latitude/Longitude - Teks
* **Kolom F** - Riwayat Telur - Angka/Nomor
* **Kolom G** - Riwayat Setoran - Angka/Nomor
* **Kolom H** - Riwayat Sisa Telur - Angka/Nomor
* **Kolom I** - Link Folder Foto - Teks

### D. Sheet: HUTANG
Model buku kas: satu baris = satu kejadian. Saldo per nama = total `Hutang` - total `Bayar` (dihitung di aplikasi).
* **Kolom A** - Tanggal - Tanggal/Waktu
* **Kolom B** - Nama (toko atau pembeli) - Teks
* **Kolom C** - Tipe (`Hutang` / `Bayar`) - Teks
* **Kolom D** - Jumlah (Rp) - Angka/Nomor
* **Kolom E** - Keterangan - Teks
* **Kolom F** - Sales - Teks/Kosong
* **Kolom G** - ID Toko (kalau nama cocok dengan toko di MASTER_WARUNG) - Teks/Kosong
