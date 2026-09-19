# JAWABAN.md

## A — Device Management

**Histori saat decommission?** Soft delete (`deleted_at`) + status `decommissioned`; baris `sensor_reading`/`device_heartbeat` tetap dipertahankan karena data historis adalah fakta pengukuran yang masih diperlukan untuk agregat dan audit. Middleware menolak kredensial device yang sudah di-decommission, sehingga tidak ada data baru yang masuk, tetapi histori lama tetap bisa di-query. Alternatif hard delete + arsip akan memutus relasi FK dan merusak keterulangan (reproduksibilitas) chart lama. Konsekuensinya tabel terus membesar, dan itu diatasi dengan kebijakan retensi.

**Mati vs jaringan putus?** Dari sisi server keduanya tidak bisa dibedakan — sama-sama tampak sebagai "tidak ada payload selama lebih dari X menit" (`is_online=false`). Petunjuknya hanya bisa datang dari data tambahan: `heartbeat.uptime_s` yang terus bertambah menandakan device masih hidup, sedangkan `rssi`/`battery_v` terakhir memberi gambaran apakah masalahnya di baterai atau di sinyal. Karena itu statusnya kami namakan `offline` secara jujur, bukan `dead`.

## B — Sensor Management

**Pindah sensor 1 Juni tetap terhubung ke A?** `sensor_reading.sensor_id` diisi saat ingest melalui `sensorIdAt(device_time)`: yang dipakai adalah pemasangan yang berlaku pada `device_time` tersebut, bukan pemasangan yang berlaku hari ini. Baris sebelum 1 Juni menunjuk pemasangan di device A (yang sudah punya `removed_at`), baris sesudahnya menunjuk device B. Riwayat `sensor_installation` hanya ditambah (append-only), sehingga gabungan (join) berbasis waktu selalu bisa merekonstruksi ulang posisi sensor yang benar.

**Kalibrasi diubah hari ini, data lama ikut berubah?** Tidak. Nilai `value` yang sudah dikalibrasi dihitung sekali saat ingest memakai kalibrasi dengan `effective_at ≤ device_time`, lalu disimpan berdampingan dengan `raw_value` yang tidak boleh berubah. Kalibrasi baru hanya berlaku untuk `device_time` sesudahnya. Konsekuensinya, koreksi atas kalibrasi lama harus lewat pengisian ulang (backfill) yang eksplisit, tetapi imbalannya histori tidak pernah berubah diam-diam — sesuai §B.3.

## C — ERD & skala

**Tabel tercepat + hitungan?** `sensor_reading`: 50 device × 7 sensor × 1 data/mnt × 60 × 24 × 365 = 50×7=350/mnt; 350×60=21.000/jam; ×24=504.000/hari; ×365=183.960.000 ≈ **184 juta baris/tahun**. Tabel lain (device, pemasangan, kalibrasi, heartbeat) hanya tumbuh dalam orde satuan sampai ribuan.

**Strategi pertumbuhan?** Hypertable TimescaleDB di atas `sensor_readings(device_time)` + kompresi setelah 7 hari + retensi 365 hari + continuous aggregate `1h`/`1d`. Konsekuensinya: kita terikat pada satu image database dan agregat diperbarui dengan jeda ±2 jam, tetapi sebagai gantinya kita dapat partisi waktu otomatis, query rentang yang cepat, dan data yang datang terlambat ikut terkoreksi sendiri saat refresh. Migrasi dibuat defensif: tanpa ekstensi Timescale, aplikasi tetap berjalan di Postgres biasa (hanya tanpa hypertable/cagg).

**Wide vs narrow?** Narrow (satu baris per sensor). Wide (satu baris per payload, satu kolom per sensor) mengharuskan `ALTER TABLE` setiap ada tipe baru, menyimpan NULL untuk sensor error yang tidak ikut terkirim, dan gagal menghadapi kasus "2 sensor suhu dalam satu device". Narrow memang boros baris (±184 jt/tahun), tetapi skemanya stabil, dedup per `(device,time,sensor_type)` presisi, dan query per tipe terbantu index komposit — pilihan yang tepat untuk data seperti ini.

## D — Alur data

**Idempotensi?** Kunci unik `(device_id, device_time, sensor_type_id)` + `insertOrIgnore` (`ON CONFLICT DO NOTHING`). Pengiriman ulang payload yang identik menghasilkan 0 baris baru dan tercatat sebagai `duplicates`. `seq` tidak dipakai sebagai kunci karena di-reset setiap restart; kombinasi device+waktu+tipe tetap stabil walaupun `seq` berputar ulang.

**Terlambat & tidak berurutan?** Batch 180 record diproses seperti data biasa (yang menjadi acuan adalah `device_time`, bukan urutan kedatangan); `received_at` mencatat keterlambatannya. Agregat jam yang telanjur terhitung diperbaiki otomatis oleh kebijakan refresh continuous aggregate; cadangan untuk Postgres biasa memakai `reading_aggregate` yang dihitung ulang (upsert).

**Backpressure?** 50 device/menit ≈ 6 penulisan/detik — bulk `insertOrIgnore` per payload tanpa antrean sudah cukup, sehingga broker belum diperlukan pada skala ini. Bila laju naik 10×: batching diperbesar, `COPY`, dan worker pool/Redis Stream; ingestion segera mengembalikan 207 sementara agregat berjalan asinkron.

**Penanda waktu & clock drift?** Acuan deret waktu adalah `device_time` (jam device, UTC epoch). `received_at` (jam server) hanya untuk mendiagnosis drift/keterlambatan. `ts` dari masa depan tetap diterima apa adanya agar urutan fisik terjaga; selisih besar `received_at−device_time` menjadi sinyal drift, bukan alasan penolakan.

**Timezone?** Seluruh kolom `timestamptz` tersimpan dalam UTC; konversi ke WIB (Asia/Jakarta) hanya dilakukan di lapisan presentasi (`formatWib` di frontend, respons memakai ISO dengan offset). Backend tidak pernah menyimpan waktu lokal.

**DB down saat payload masuk?** Request gagal (500/connection error) dan device — yang menyimpan buffer sampai menerima ACK — akan mengirim ulang; tidak ada data yang hilang selama buffer firmware mencukupi. Tanpa broker memang tidak ada penampungan di sisi server; itu pilihan sadar dengan konsekuensi yang sudah dipertimbangkan untuk skala ini, dan didokumentasikan di README.

## E — API

**Cegah response meledak 1 tahun?** Server memaksa interval naik (raw hanya ≤24 jam, 1m ≤7 hari, 1h ≤90 hari, selebihnya 1d) + batas 5000 titik (422 `range_too_large` bila terlewati) + agregasi dihitung di DB (cagg), bukan di browser. Klien selalu diberi tahu lewat `meta.interval_applied`.

**Auth device vs user?** Berbeda. Device: Bearer `api_key` berumur panjang, yang tersimpan hanya hash sha256-nya, rate limit per device, tanpa scope. User dashboard: token Sanctum dengan masa kedaluwarsa dan permission. Keduanya dipisah karena masa berlaku, risiko, dan pola penyalahgunaannya berbeda.

**Rate limiting ingestion?** Kuncinya per device yang terautentikasi (60/menit), cadangan per IP bila belum terautentikasi; responsnya 429 `{code: rate_limited}` dengan envelope standar. Batasan per device tetap adil walau banyak device berbagi satu IP (NAT); sebaliknya, batasan per IP akan membuat pengguna lain yang tidak bersalah ikut kena imbasnya.

## G — Frontend

**Titik wajar per chart?** ±1500–3000 titik per garis; di atas itu browser melambat dan mata tidak bisa lagi membedakan detailnya. Rentang 1 tahun dipaksa ke interval `1d` (±365 titik) oleh penyesuaian server; bila masih melewati batas, klien diminta mempersempit rentang atau menaikkan interval.

**Gap offline 3 jam?** Garis putus (null, bukan nol/interpolasi) untuk suhu/kelembapan/angin, dan bar hujan yang absen (bukan nol). Nol memalsukan hasil pengukuran, interpolasi mengarang data; garis putus secara jujur menunjukkan "tidak tahu".

## Esai (Bagian 5)

1. **Append-only time-series.** UPDATE menimpa fakta historis sehingga sulit diaudit, memicu perebutan kunci pada baris yang paling sering ditulis, dan merusak partisi waktu beserta agregat yang sudah terhitung. Dengan pola append-only, data baru hanya ditambahkan di akhir: pengiriman ulang tidak menggandakan data, riwayat perubahan tercatat rapi, dan kompresi serta retensi per partisi bisa berjalan tanpa memindahkan baris lama.
2. **Hypertable & continuous aggregate.** Hypertable mempartisi data otomatis per waktu sehingga penulisan dan query rentang tetap cepat. Continuous aggregate menyimpan hasil ringkasan (rollup) yang diperbarui bertahap, termasuk koreksi untuk data yang datang terlambat. Di Postgres biasa: partisi range manual + cron yang meng-upsert `reading_aggregate` dan menghitung ulang bucket lama saat batch yang terlambat tiba.
3. **Rata-rata arah angin.** Rata-rata suhu aritmetik valid karena skalanya linear; sudut arah mata angin melingkar sehingga tidak bisa dirata-rata biasa (350° & 10° → 180° jelas salah, seharusnya ~0°). Cara yang benar adalah vector-mean: rata-ratakan nilai sin dan cos tiap sudut, lalu hitung `atan2`, sehingga diperoleh arah vektor gabungannya.
4. **Satu-per-satu vs bulk.** 350 insert/menit = ~6 query/detik plus bolak-balik jaringan tiap query; bulk menggabungkannya menjadi beberapa kali bolak-balik dalam satu transaksi. Selisihnya bisa 10–50 kali lipat throughput dengan latensi yang jauh lebih stabil, karena biaya parsing, fsync, dan jaringan dibagi rata.
5. **Index sensor_reading.** Unik `(device_id, device_time, sensor_type_id)` untuk dedup + penulisan; komposit `(device_id, sensor_type_id, device_time)` untuk query deret waktu per sensor. Urutan penting: kolom yang selalu difilter dengan `=` (`device`, `type`) ditaruh depan, rentang (`time`) paling belakang, agar B-tree menyaring device dan tipe dulu sebelum memindai rentang waktu.
6. **Sensor macet.** Agregat bergulir (varians/min-max per jam) + aturan "nilai identik selama N jam berturut-turut" menandai data sebagai `suspect`. Nilai yang macet tetap lolos validasi rentang karena angkanya "valid" tetapi perilakunya tidak; mendeteksi perilaku butuh jendela waktu, bukan satu titik data.
7. **Alert hujan >20 mm/jam.** Ditaruh di worker terjadwal yang membaca agregat `1h` (berdekatan dengan data, idempoten, dan bisa diulang), bukan di firmware (tidak konsisten antar device) atau di controller ingest (memperlambat penulisan dan terduplikasi saat retry). Aturan disimpan sebagai konfigurasi agar bisa diubah tanpa deploy ulang.
8. **Risiko ingestion terbuka.** Pemalsuan identitas device (kunci bocor), replay/flood, dan payload berbahaya. Mitigasi: secret acak yang disimpan sebagai hash dan bisa dirotasi, TLS, rate limit per device, validasi skema yang ketat, batas batch 500, pencatatan `request_id`, serta secret yang tidak pernah dicatat di log dan hanya ditampilkan sekali saat dibuat.
