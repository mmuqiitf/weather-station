# JAWABAN.md

## A — Device Management

**Histori saat decommission?** Soft delete (`deleted_at`) + status `decommissioned`; baris `sensor_reading`/`device_heartbeat` dipertahankan karena data historis adalah fakta pengukuran yang masih dibutuhkan agregat dan audit. Middleware menolak kredensial device yang di-decommission, jadi tak ada data baru, tapi histori tetap bisa di-query. Alternatif hard delete + arsip akan memutus FK dan merusak reproduksibilitas chart lama. Trade-off: tabel tumbuh, diatasi retention policy.

**Mati vs jaringan putus?** Tidak bisa dibedakan dari sisi server — keduanya tampak sebagai "tidak ada payload > X menit" (`is_online=false`). Pembedanya hanya data tambahan: `heartbeat.uptime_s` yang terus naik menandakan device hidup, dan `rssi`/`battery_v` terakhir memberi petunjuk (baterai habis vs sinyal hilang). Karena itu status kami jujur bernama `offline`, bukan `dead`.

## B — Sensor Management

**Pindah sensor 1 Juni tetap terhubung ke A?** `sensor_reading.sensor_id` diisi saat ingest lewat `sensorIdAt(device_time)`: instalasi yang berlaku pada `device_time` itu, bukan instalasi saat ini. Baris sebelum 1 Juni menunjuk instalasi A (yang sudah `removed_at`), baris sesudah menunjuk B. Riwayat `sensor_installation` append-only, jadi query join waktu selalu merekonstruksi penempatan yang benar.

**Kalibrasi diubah hari ini, data lama ikut berubah?** Tidak. `value` terkalibrasi dihitung sekali saat ingest memakai kalibrasi yang `effective_at ≤ device_time`, lalu disimpan berdampingan dengan `raw_value` yang imutabel. Kalibrasi baru hanya berlaku untuk `device_time` sesudahnya. Konsekuensinya: pembetulan kalibrasi lama butuh backfill eksplisit, tapi histori tidak pernah berubah diam-diam — sesuai §B.3.

## C — ERD & skala

**Tabel tercepat + hitungan?** `sensor_reading`: 50 device × 7 sensor × 1/mnt × 60 × 24 × 365 = 50×7=350/mnt; 350×60=21.000/jam; ×24=504.000/hari; ×365=183.960.000 ≈ **184 juta baris/tahun**. Tabel lain (device, instalasi, kalibrasi, heartbeat) tumbuh orde satuan–ribuan.

**Strategi pertumbuhan?** Hypertable TimescaleDB atas `sensor_readings(device_time)` + kompresi setelah 7 hari + retensi 365 hari + continuous aggregate `1h`/`1d`. Trade-off: lock-in satu image dan refresh-lag ±2 jam pada bucket agregat, ditukar partisi waktu otomatis, query rentang cepat, dan late-data sembuh sendiri saat refresh. Migrasi defensif: tanpa ekstensi Timescale, aplikasi tetap jalan di Postgres biasa (tanpa hypertable/cagg).

**Wide vs narrow?** Narrow (satu baris per sensor). Wide (satu baris per payload, kolom per sensor) butuh `ALTER TABLE` tiap tipe baru, menyimpan NULL untuk sensor error yang absen, dan gagal pada jebakan "2 sensor suhu per device". Narrow boros baris (±184 jt/tahun) tapi skema stabil, dedup per `(device,time,sensor_type)` presisi, dan query per-tipe memakai index komposit — harga yang tepat untuk data ini.

## D — Alur data

**Idempotensi?** Kunci unik `(device_id, device_time, sensor_type_id)` + `insertOrIgnore` (`ON CONFLICT DO NOTHING`). Kirim ulang payload identik menghasilkan 0 baris baru dan dihitung `duplicates`. `seq` tidak dipakai sebagai kunci karena reset tiap restart; kombinasi device+waktu+tipe stabil meski `seq` berputar.

**Terlambat & tidak berurutan?** Batch 180 record diproses seperti data biasa (otoritas `device_time`, bukan urutan tiba); `received_at` mencatat keterlambatan. Agregat jam yang sudah terhitung diperbaiki otomatis oleh refresh policy continuous aggregate; fallback Postgres memakai `reading_aggregate` yang di-upsert ulang.

**Backpressure?** 50 device/menit ≈ 6 tulis/detik — bulk `insertOrIgnore` per payload tanpa antrean sudah cukup, sehingga tanpa broker di lingkup ini. Bila laju naik 10×: batching lebih besar, `COPY`, dan worker pool/Redis Stream; ingestion mengembalikan 207 cepat sementara agregat berjalan asinkron.

**Penanda waktu & clock drift?** Acuan series adalah `device_time` (jam device, UTC epoch). `received_at` (jam server) hanya untuk diagnosis drift/keterlambatan. `ts` masa depan diterima apa adanya agar urutan fisik terjaga; selisih besar `received_at−device_time` menjadi sinyal drift, bukan alasan penolakan.

**Timezone?** Seluruh kolom `timestamptz` UTC; konversi ke WIB (Asia/Jakarta) hanya di lapisan presentasi (`formatWib` frontend, format respons memakai ISO dengan offset). Backend tidak pernah menyimpan waktu lokal.

**DB down saat payload masuk?** Request gagal (500/connection error) dan device — yang mem-buffer hingga dapat ACK — mengirim ulang; tidak ada data hilang selama buffer firmware cukup. Tanpa broker, tidak ada penampungan sisi server; itu trade-off sadar untuk skala ini, didokumentasikan di README.

## E — API

**Cegah response meledak 1 tahun?** Koersi interval oleh server (raw≤24 jam, 1m≤7 hari, 1h≤90 hari, selebihnya 1d) + cap 5000 titik (422 `range_too_large` bila lewat) + agregasi di DB (cagg), bukan di browser. Klien diberi tahu lewat `meta.interval_applied`.

**Auth device vs user?** Berbeda. Device: Bearer `api_key` jangka panjang, hash sha256 tersimpan, rate limit per-device, tanpa scope. User dashboard: sesi/token Sanctum (produksi) dengan expiry dan permission. Dipisah karena siklus hidup, permukaan risiko, dan pola penyalahgunaan keduanya berbeda.

**Rate limiting ingestion?** Kunci per authenticated device (60/menit), fallback per IP bila belum terautentikasi; respons 429 `{code: rate_limited}` dengan envelope standar. Per-device adil di belakang NAT bersama; per-IP akan menghukum tetangga yang tidak bersalah.

## G — Frontend

**Titik wajar per chart?** ±1500–3000 titik garis; di atas itu browser melambat dan mata tak membedakan. Rentang 1 tahun dipaksa ke interval `1d` (±365 titik) oleh koersi server; bila masih lewat cap, minta rentang lebih sempit atau interval lebih kasar.

**Gap offline 3 jam?** Garis putus (null, bukan nol/interpolasi) untuk suhu/kelembapan/angin, dan bar hujan absen (bukan nol). Nol memalsukan pengukuran, interpolasi mengarang data; garis putus jujur menunjukkan "tidak tahu".

## Esai (Bagian 5)

1. **Append-only time-series.** UPDATE merusak fakta historis, menimbulkan lock contention pada baris panas, dan mematahkan partisi waktu serta agregat yang sudah dihitung. Append-only membuat ingest idempoten, audit jelas, dan kompresi/retensi partisi dapat berjalan tanpa migrasi baris.
2. **Hypertable & continuous aggregate.** Hypertable mempartisi otomatis per waktu sehingga insert/query rentang tetap cepat. Continuous aggregate mematerialkan rollup yang di-refresh bertahap termasuk koreksi late-data. Di Postgres biasa: partisi range manual + cron yang meng-upsert `reading_aggregate` dan menangani kembali bucket lama saat batch terlambat tiba.
3. **Rata-rata arah angin.** Suhu rata-rata aritmetik valid karena linear; sudut sirkular tidak (350° & 10° → 180° salah, seharusnya ~0°). Cara benar vector-mean: rata-ratakan sin dan cos sudut, lalu `atan2`, yang memberi arah resultan vektor.
4. **Satu-per-satu vs bulk.** 350 insert/menit = ~6 query/detik plus round-trip; bulk menggabung jadi segelintir round-trip dengan satu transaksi. Bedanya orde 10–50× throughput dan latensi jauh lebih stabil karena biaya parse, fsync, dan jaringan diamortisasi.
5. **Index sensor_reading.** Unik `(device_id, device_time, sensor_type_id)` untuk dedup + tulis; komposit `(device_id, sensor_type_id, device_time)` untuk query series per sensor. Urutan penting: kolom equality dulu (`device`, `type`), rentang (`time`) terakhir, agar B-tree memangkas partisi tepat sebelum memindai waktu.
6. **Sensor macet.** Agregat rolling (varians/min-max per jam) + aturan "nilai identik N jam berturut-turut" menandai `suspect`.12899ptetap lolos validasi rentang karena nilainya "valid" tapi perilakunya tidak; deteksi perilaku butuh jendela waktu, bukan satu titik.
7. **Alert hujan >20 mm/jam.** Di worker terjadwal yang membaca agregat `1h` (dekat data, idempoten, bisa replay), bukan di firmware (tak konsisten) atau di controller ingest (memperlambat tulis dan duplikat saat retry). Aturan tersimpan sebagai konfigurasi agar bisa diubah tanpa deploy.
8. **Risiko ingestion terbuka.** Spoofing device (kunci bocor), replay/flood, dan payload berbahaya. Mitigasi: secret acak + hash + rotasi, TLS, rate limit per-device, validasi skema ketat, batas batch 500, logging `request_id`, dan secret tak pernah di-log atau dikembalikan kecuali saat dibuat.
