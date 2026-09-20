# JAWABAN.md

## A — Device Management

**Apa yang terjadi pada data historis saat device di-decommission?**
Kami memakai soft delete (`deleted_at`) sekaligus menandai statusnya `decommissioned`, sehingga baris `sensor_reading` dan `device_heartbeat` tetap tersimpan. Data historis adalah fakta pengukuran yang masih dibutuhkan untuk agregat dan audit, jadi menghapusnya akan merugikan. Middleware `device.auth` menolak kredensial device yang sudah di-decommission, sehingga tidak ada data baru yang masuk, tetapi histori lama tetap bisa di-query. Alternatif hard delete plus arsip akan memutus relasi FK dan membuat chart lama tidak bisa direproduksi. Konsekuensinya tabel terus membesar, dan itu kami tangani lewat kebijakan retensi.

**Bagaimana membedakan "device mati" dengan "device hidup tapi jaringan putus"?**
Dari sisi server keduanya tidak bisa dibedakan — sama-sama terlihat sebagai "tidak ada payload lebih dari X menit" (`is_online=false`). Petunjuk tambahan hanya bisa datang dari data lain: `uptime_s` pada heartbeat yang terus bertambah menandakan device masih hidup, sementara `rssi` dan `battery_v` terakhir memberi gambaran apakah masalahnya di baterai atau di sinyal. Karena itu kami menamai statusnya `offline` dengan jujur, bukan `dead`, sebab kita memang tidak tahu penyebabnya.

**Bagaimana secret device disimpan?**
Setiap device memegang `api_key` acak yang dikirim firmware sebagai Bearer; yang tersimpan di database hanya hash sha256-nya (`api_key_hash`), sehingga bocornya database tidak langsung membuka kunci mentah. Kunci hanya ditampilkan sekali saat create/rotate, bisa dirotasi kapan saja, dan middleware `device.auth` menolak kredensial device yang sudah decommission.

## B — Sensor Management

**Sensor suhu dipindah dari device A ke B pada 1 Juni; bagaimana data sebelum 1 Juni tetap terhubung ke A?**
`sensor_reading.sensor_id` diisi saat ingest lewat `sensorIdAt(device_time)`, yang mengambil pemasangan yang berlaku pada `device_time` tersebut, bukan pemasangan yang berlaku hari ini. Baris sebelum 1 Juni menunjuk pemasangan di device A (yang `removed_at`-nya sudah terisi), sedangkan baris sesudahnya menunjuk device B. Riwayat `sensor_installation` bersifat append-only, sehingga join berbasis waktu selalu bisa merekonstruksi posisi sensor yang benar. Pendekatan ini memisahkan identitas fisik sensor dari device yang memakainya, jadi satu sensor bisa berpindah tanpa merusak histori.

**Kalau nilai kalibrasi diubah hari ini, apakah data lama ikut berubah?**
Tidak. Nilai `value` dihitung sekali saat ingest memakai kalibrasi yang `effective_at`-nya ≤ `device_time`, lalu disimpan berdampingan dengan `raw_value` yang tidak boleh berubah. Kalibrasi baru hanya berlaku untuk `device_time` setelahnya. Konsekuensinya, koreksi untuk kalibrasi lama harus dilakukan lewat backfill yang eksplisit, tetapi sebagai imbalannya histori tidak pernah berubah diam-diam — sesuai §B.3.

## C — ERD & skala

**Tabel mana yang tumbuh paling cepat, dan berapa barisnya per tahun?**
`sensor_reading` adalah yang tercepat karena satu baris hanya menampung satu pembacaan dari satu sensor. Hitungannya: 50 device × 7 sensor = 350 pembacaan/menit; 350 × 60 = 21.000/jam; 21.000 × 24 = 504.000/hari; dan 504.000 × 365 ≈ **184 juta baris/tahun**. Tabel lain seperti device, pemasangan, kalibrasi, dan heartbeat hanya tumbuh dalam orde satuan sampai ribuan.

**Strategi menghadapi pertumbuhan itu?**
Saya memilih hypertable TimescaleDB di atas `sensor_readings(device_time)`, dilengkapi kompresi setelah 7 hari, retensi 365 hari, dan continuous aggregate `1h`/`1d`. Konsekuensinya, kita terikat pada satu image database dan agregat diperbarui dengan jeda sekitar 2 jam. Sebagai gantinya, kita mendapat partisi waktu otomatis, query rentang yang cepat, dan data yang datang terlambat ikut terkoreksi saat refresh. Migrasinya dibuat defensif: kalau ekstensi Timescale tidak ada, aplikasi tetap berjalan di Postgres biasa, hanya tanpa hypertable dan cagg.

**Sebaiknya pembacaan disimpan dalam format wide atau narrow?**
Saya memilih narrow, yaitu satu baris per sensor. Format wide (satu baris per payload dengan satu kolom per sensor) memaksa `ALTER TABLE` setiap kali ada tipe sensor baru, menyimpan NULL untuk sensor error yang tidak ikut terkirim, dan tidak bisa menangani kasus "dua sensor suhu dalam satu device". Narrow memang lebih boros baris (±184 juta/tahun), tetapi skemanya stabil, dedup per `(device,time,sensor_type)` jadi presisi, dan query per tipe terbantu index komposit. Untuk data seperti ini, trade-off tersebut sepadan.

## D — Alur data

**Idempotensi?**
Kuncinya adalah unique `(device_id, device_time, sensor_type_id)` yang dikombinasikan dengan `insertOrIgnore` (`ON CONFLICT DO NOTHING`). Kalau payload yang sama dikirim ulang, tidak ada baris baru yang masuk dan pengiriman itu tercatat sebagai `duplicates`. `seq` sengaja tidak dipakai sebagai kunci karena di-reset setiap device restart. Kombinasi device + waktu + tipe tetap stabil meskipun `seq` berputar ulang.

**Bagaimana memperlakukan data yang terlambat dan tidak berurutan?**
Batch 180 record diproses seperti data biasa; yang menjadi acuan adalah `device_time`, bukan urutan kedatangan, dan `received_at` mencatat seberapa terlambat datanya. Agregat jam yang sudah terlanjur dihitung akan diperbaiki otomatis oleh kebijakan refresh continuous aggregate. Untuk Postgres biasa, cadangannya adalah `reading_aggregate` yang dihitung ulang (upsert). Jadi keterlambatan tidak merusak urutan logis deret waktu.

**Backpressure?**
Pada skala 50 device per menit hanya ada sekitar 6 penulisan per detik, jadi bulk `insertOrIgnore` per payload tanpa antrean sudah lebih dari cukup dan broker belum diperlukan. Kalau laju naik 10×, langkah berikutnya adalah memperbesar batching, memakai `COPY`, dan menambah worker pool atau Redis Stream. Ingestion tetap bisa membalas 207 lebih dulu sementara agregasi dikerjakan asinkron.

**Penanda waktu dan clock drift?**
Acuan deret waktu adalah `device_time`, yaitu jam internal device dalam UTC epoch. `received_at` (jam server) hanya dipakai untuk mendiagnosis drift dan keterlambatan. `ts` dari masa depan tetap diterima apa adanya agar urutan fisik data tidak terpotong; selisih besar antara `received_at` dan `device_time` kami perlakukan sebagai sinyal drift, bukan alasan penolakan.

**Timezone?**
Semua kolom `timestamptz` disimpan dalam UTC. Konversi ke WIB (Asia/Jakarta) hanya dilakukan di lapisan presentasi: `formatWib` di frontend, sedangkan respons API memakai ISO dengan offset. Backend tidak pernah menyimpan waktu lokal.

**Apa yang terjadi kalau DB down saat payload masuk?**
Request akan gagal dengan 500 atau connection error, lalu device — yang menyimpan buffer sampai menerima ACK — akan mengirim ulang, sehingga tidak ada data yang hilang selama buffer firmware masih cukup. Karena tidak memakai broker, memang tidak ada penampungan di sisi server; ini pilihan sadar yang konsekuensinya sudah kami pertimbangkan untuk skala ini. Pilihan ini juga tercatat di README.

## E — API

**Bagaimana mencegah response meledak saat rentang 1 tahun diminta?**
Server memaksa interval naik: `raw` hanya boleh ≤24 jam, `1m` ≤7 hari, `1h` ≤90 hari, dan selebihnya `1d`. Selain itu ada batas 5000 titik yang akan membalas 422 bila terlewati, dan agregasinya dihitung di database (cagg), bukan di browser. Klien selalu diberi tahu interval yang benar-benar dipakai lewat `interval_applied` di top-level.

**Apakah autentikasi device dan user dashboard memakai mekanisme yang sama?**
Tidak, keduanya berbeda. Device memakai Bearer `api_key` berumur panjang, yang tersimpan hanya hash sha256-nya, dengan rate limit per device dan tanpa scope. User dashboard memakai token Sanctum yang punya masa kedaluwarsa dan permission. Pemisahan ini penting karena masa berlaku, risiko, dan pola penyalahgunaan keduanya tidak sama — kunci device yang bocor tidak boleh ikut membuka akses dashboard.

**Bagaimana rate limiting untuk endpoint ingestion?**
Kuncinya per device yang terautentikasi (60/menit), dengan cadangan per IP kalau device belum terautentikasi. Responsnya 429 `{"message": "Too many ingestion requests."}`. Pembatasan per device tetap adil meskipun banyak device berbagi satu IP lewat NAT, sedangkan pembatasan per IP justru bisa menghukum pengguna lain yang tidak bersalah.

## G — Frontend

**Berapa titik data yang wajar dirender dalam satu chart?**
Sekitar 1500–3000 titik per garis; di atas itu browser mulai melambat dan mata sudah tidak bisa membedakan detailnya. Rentang 1 tahun dipaksa server ke interval `1d` (±365 titik). Kalau masih melewati batas, klien diminta mempersempit rentang atau menaikkan interval.

**Bagaimana Anda menampilkan gap data saat device offline 3 jam?**
Untuk suhu, kelembapan, dan angin kami memakai garis putus (null), bukan nol atau interpolasi; untuk hujan, bar-nya absen. Nol akan memalsukan hasil pengukuran, sedangkan interpolasi berarti mengarang data. Garis putus menunjukkan "tidak tahu" secara jujur.

## Esai (Bagian 5)

1. **Kenapa time-series sebaiknya append-only, bukan di-UPDATE?** UPDATE menimpa fakta historis sehingga sulit diaudit, memicu perebutan kunci pada baris yang paling sering ditulis, dan merusak partisi waktu beserta agregat yang sudah terhitung. Dengan pola append-only, data baru hanya ditambahkan di akhir sehingga pengiriman ulang tidak menggandakan data. Riwayat perubahan pun tetap rapi dan bisa ditelusuri. Selain itu, kompresi dan retensi per partisi bisa berjalan tanpa perlu memindahkan baris lama. Karena itu, koreksi data sebaiknya dilakukan dengan menulis baris koreksi baru atau menjadwalkan perhitungan ulang, bukan menimpa data aslinya.
2. **Apa itu hypertable dan continuous aggregate?** Hypertable mempartisi data secara otomatis per waktu, sehingga penulisan dan query rentang tetap cepat. Continuous aggregate menyimpan hasil ringkasan (rollup) dan memperbaruinya bertahap, termasuk saat ada data yang datang terlambat. Kalau hanya memakai PostgreSQL biasa, efek serupa bisa dicapai dengan partisi range manual. Perhitungan ulangnya dilakukan cron yang meng-upsert `reading_aggregate`. Saat batch terlambat tiba, bucket lama dihitung ulang agar angkanya tetap benar.
3. **Rata-rata arah angin vs rata-rata suhu.** Rata-rata suhu boleh aritmetik karena skalanya linear, tetapi sudut arah mata angin bersifat melingkar sehingga tidak bisa dirata-rata begitu saja. Contohnya, rata-rata 350° dan 10° bukan 180°, melainkan sekitar 0°. Cara yang benar adalah vector-mean: ubah setiap sudut ke komponen sin dan cos, ratakan keduanya, lalu hitung `atan2`. Hasilnya adalah arah vektor gabungan yang benar, dan pendekatan ini otomatis menangani pembungkusan di sekitar 0°/360°.
4. **Satu-per-satu vs bulk insert/batching.** 350 insert/menit berarti sekitar 6 query per detik, masing-masing dengan bolak-balik jaringan sendiri. Bulk insert/batching menggabungkan semuanya menjadi beberapa kali bolak-balik saja dalam satu transaksi. Selisih throughput-nya bisa 10–50 kali lipat dengan latensi yang jauh lebih stabil. Penyebabnya, biaya parsing, fsync, dan jaringan dibagi rata ke banyak baris. Karena itu batching hampir selalu menang pada beban tinggi.
5. **Index apa yang dibuat di `sensor_reading`, dan kenapa urutan kolomnya penting?** Ada unique `(device_id, device_time, sensor_type_id)` untuk dedup sekaligus mempercepat penulisan. Untuk query deret waktu per sensor, dipakai komposit `(device_id, sensor_type_id, device_time)`. Urutan kolomnya penting: kolom yang selalu difilter dengan `=` (`device`, `type`) diletakkan di depan, sedangkan rentang (`time`) di belakang. Dengan begitu B-tree menyaring device dan tipe lebih dulu sebelum memindai rentang waktu, sehingga jumlah baris yang dipindai jauh lebih sedikit.
6. **Bagaimana mendeteksi sensor yang "macet"?** Nilai yang macet tetap lolos validasi rentang karena angkanya memang "valid", hanya perilakunya yang tidak wajar. Karena itu deteksinya butuh jendela waktu, bukan satu titik data. Kami memakai agregat bergulir (varians/min-max per jam) dan aturan "nilai identik selama N jam berturut-turut", lalu menandainya `suspect`. Datanya tidak dibuang, hanya diberi flag untuk diperiksa lebih lanjut.
7. **Alert curah hujan >20 mm/jam ditaruh di lapisan mana?** Logikanya kami letakkan di worker terjadwal yang membaca agregat `1h`. Posisi ini dekat dengan data, idempoten, dan aman diulang saat retry. Menaruhnya di firmware tidak konsisten antar device, sedangkan di controller ingest akan memperlambat penulisan dan berisiko terduplikasi setiap kali request di-retry. Aturannya disimpan sebagai konfigurasi supaya bisa diubah tanpa deploy ulang.
8. **Risiko keamanan endpoint ingestion dan mitigasinya.** Endpoint ingestion menghadapi setidaknya tiga risiko: pemalsuan identitas device (misalnya kunci bocor), replay/flood, dan payload berbahaya. Mitigasinya adalah secret acak yang disimpan sebagai hash dan bisa dirotasi, koneksi TLS, rate limit per device, serta validasi skema yang ketat. Batch dibatasi 500 item, dan setiap request dicatat `request_id`-nya. Secret tidak pernah ditulis ke log dan hanya ditampilkan sekali saat dibuat, sehingga dampak satu kunci yang bocor tetap terbatas.
