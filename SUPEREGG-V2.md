Sekarang saya ingin refractor fitur dan cara input data:
1. Sheet utama yang dipakai adalah MASTER_WARUNG
2. Sheet warung stop sekarang pakai sheet WARUNG_STOP - Jika warung di stop, data toko tersebut dipindah dari MASTER_WARUNG ke WARUNG_STOP sebagai arsip
3. Semua pembelian end user sekarang masuk ke sheet END_CUSTOMER


Cara penggunaan (Fitur laporan satuan yang jadi basis untuk laporan lainnya juga):
1. Toko dipilih, setelah dipilih, akan ada detail toko, baris pertama [Nama Toko] - [Pemilik] - [Telur di Warung Ini], Baris kedua [Keterangan Terakir]
2. Sisa Telur - Dalam Butir - mengisi kolom L
3. Total Setoran - Otomatis ada angka (bisa diganti manual juga) (Telur diwarung ini - Sisa telur) * 3500 - Mengisi kolom I Riwayat Setoran
4. Status - /Restock/Stop - tidak mengisi kolom apapun, untuk validator apakah stop atau tidak
5. Jumlah Restock - Dalam butir - mengisi kolom G
6. Keterangan - Jika ini diisi, akan mengganti keterangan lama (ada preview keterangan lama yang hanya tampilan (format Keterangan sebelumnya : .....), ketika ada input tampilan ini otomatis hilang, jadi tidak perlu dihapus)

Fitur buat jalur sama seperti sebelumnya, dengan cara laporan baru ini. Tambahan untuk buat jalur adalah saya ingin agar ada jalur biru di jalan betulan, bukan hanya garis yang menghubungkan antar titik satu dengan titik lainnya


Logika isi tiap kolom
### A. Sheet: MASTER_WARUNG
* **Kolom A** - No - Angka/Nomor : Tidak perlu diinput jika ada toko baru, sudah pakai rumus
* **Kolom B** - Nama Warung - Teks : Sesuai Input Sales
* **Kolom C** - Pemilik - Teks : Sesuai Input Sales
* **Kolom D** - No HP - Teks : Sesuai Input Sales
* **Kolom E** - Latitude/Longitude - Teks : Sesuai Input Sales
* **Kolom F** - Riwayat Telur Terjual - Angka/Nomor : Telur dikolom ini akan selalu berubah dengan cara (Value saat ini + Telur di warung) namun hanya berubah ketika telur di warung tertimpa data baru
* **Kolom G** - Telur di Warung (Saat ini) - Angka/Nomor : Sesuai input sales, menimpa data lama, namun sebelum ditimpa, data lama di kolom ini dijumlahkan dulu dengan kolom riwayat telur terjual, hasilnya ditimpakan ke riwayat telur terjual dulu, baru diisi sesuai input sales
* **Kolom H** - Pengiriman Terakhir - Tanggal/Waktu : Selalu ditimpa dengan data baru saat laporan dilakukan
* **Kolom I** - Setoran Terakir - Angka/Nomor : selalu ditimpa dengan input sales, namun sebelum ditimpa, angka di kolom ini dijumlahkan dengan kolom riwayat setoran, hasilnya ditimpa ke kolom riwayat setoran, baru kolom ini diisi sesuai input sales
* **Kolom J** - Riwayat Setoran - Angka/Nomor : Selalu terupdate dengan cara (value lama + setoran terakhir) namun hanya berubah ketika telur di warung tertimpa data baru
* **Kolom K** - Riwayat Sisa Telur - Angka/Nomor : Selalu terupdate dengan cara (value lama + sisa telur terakhir) namun hanya berubah ketika sisa telur terakhir tertimpa data baru
* **Kolom L** - Sisa Telur Terakhir - Angka/Nomor : selalu ditimpa dengan input sales, namun sebelum ditimpa, angka di kolom ini dijumlahkan dengan kolom riwayat sisa telur, hasilnya ditimpa ke kolom riwayat sisa telur, baru kolom ini diisi sesuai input sales
* **Kolom M** - Keterangan Terakhir - Teks : hanya tertimpa ketika ada input user, jika tidak data akan selalu sama
* **Kolom N** - Link Foto Pengiriman Terakhir - Link Drive satuan foto terakhir - Selalu ditimpa dengan link foto terbaru sesuai input user
* **Kolom O** - Riwayat Foto Pengiriman - Link Drive Folder untuk toko tersebut - berisi seluruh foto pengiriman terakhir [Format foto: Nomor - Timestamp - nama toko]
* **Kolom P** - Jadwal Kirim - Teks(Hari) - Jika kosong, akan diisi otomatis sesuai dengan input pertama kali, tidak bisa ditimpa dengan laporan baru hanya bisa diganti lewat manajemen jadwal atau edit spreadsheet manual


Untuk buka titik baru, otomatis tambahkan data di master warung, formulir sama seperti yang lama

backend sekarang pakai gas dulu, jika logic ini sudah fungsional, nanti akan saya minta untuk geser ke supabase