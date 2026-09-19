# API.md — Weather Station Platform (`/api/v1`)

Base URL: `http://localhost:8000/api/v1`. All timestamps stored UTC ISO-8601, displayed WIB (Asia/Jakarta) in frontend.

## Konvensi umum

Envelope sukses: `{data, error: null, meta: {request_id}}`. Error: `{data: null, error: {code, message, details}, meta: {request_id}}`.
`code` machine-readable: `device_unauthenticated|device_mismatch|validation_failed|unknown_sensor_type|invalid_value|device_not_found|sensor_not_found|installation_not_found|sensor_attached|sensor_already_attached|invalid_status_transition|range_too_large|rate_limited`.
Status: `200|201|204|207|400|401|403|404|409|422|429|500`. `request_id` UUID di header `X-Request-Id` + `meta`.
Pagination list: offset `?page&per_page` + `meta.pagination{current_page,per_page,total,last_page}`. Time-series memakai offset untuk `raw`, agregat server-side untuk interval (cursor tidak perlu karena bucket deterministik).
Auth ganda: device = `Authorization: Bearer <api_key>` (hash sha256 tersimpan); dashboard/management terbuka di lingkup review (asumsi tercatat di README; produksi = Sanctum, rotasi & scope terpisah).
Rate limit ingestion: 60/menit per device terautentikasi (fallback per IP), `429 {code: rate_limited}`.

## Ingestion (device)

`POST /ingest/telemetry` (201 baru, 200 duplikat, 422 validasi, 401 kredensial, 403 device_id≠auth) dan
`POST /ingest/telemetry/batch` (`batch[1..500]`, 207 bila sebagian duplikat/ditolak) serta `POST /ingest/heartbeat` (200 `{received:true}`).

Sukses: `{"data":{"accepted":1,"duplicates":0,"rejected":[]},"error":null,"meta":{"request_id":"…"}}` (201).
Sukses sebagian batch: `{"data":{"accepted":8,"duplicates":2,"rejected":[]},"error":null,…}` (207).
Gagal validasi: `{"data":null,"error":{"code":"unknown_sensor_type","message":"Payload rejected.","details":[{"index":"0","code":"unknown_sensor_type"}]},…}` (422).

## Device management

`POST /devices` body `{device_id, name, location_id?|location{name,latitude,longitude,altitude_m?}}` → 201 `{…, status:"provisioned", api_key_plain:"ws_…(sekali tampil)"}`.
`GET /devices?status&location_id&q&page&per_page` → 200 paginated `[{id,device_id,name,status,is_online,last_seen_at,firmware_version,location{id,name,latitude,longitude,altitude_m}}]`.
`GET /devices/{id}` (id numerik atau `device_id`) → 200 detail / 404 `{code:device_not_found}`.
`PATCH /devices/{id}` `{name?,location_id?,status?}` — transisi terkontrol `provisioned→active→decommissioned`; ilegal → 422 `{code:invalid_status_transition}`.
`DELETE /devices/{id}` → 204, soft delete (histori reading/heartbeat dipertahankan).
`POST /devices/{id}/credentials/rotate` → 200 `{device_id, api_key_plain}` (hash lama langsung diganti).
`GET /devices/{id}/health` → 200 `{device_id,status,is_online,last_seen_at,firmware_version,battery_v,rssi}` (`is_online` = ada payload ≤15 mnt).

## Sensor management

`GET /sensor-types` → `[{id,code,unit,min_value,max_value,precision}]`. `POST /sensor-types` `{code,unit,min_value?,max_value?,precision?}` → 201.
`GET /sensors` (paginated `[{id,serial,sensor_type,current_device_id}]`), `POST /sensors` `{serial,sensor_type_id}` → 201,
`PATCH /sensors/{id}` `{serial?}`, `DELETE /sensors/{id}` → 204 (409 `{code:sensor_attached}` bila masih terpasang).
`POST /devices/{id}/sensors` `{sensor_id,installed_at?}` → 201 installation (409 `{code:sensor_already_attached}`; slot tipe sama yang terbuka ditutup otomatis).
`DELETE /devices/{id}/sensors/{sensorId}` → 200 installation dengan `removed_at` terisi (404 `{code:installation_not_found}`).
`POST /sensors/{id}/calibrations` `{offset?,scale?,effective_at}` → 201; `GET /sensors/{id}/calibrations` → list desc `effective_at`. Nilai mentah tak pernah diubah; koreksi `value = offset + scale*raw` per `effective_at ≤ device_time`.

## Query data

`GET /devices/{id}/readings/latest` → `{device_id,is_online,last_seen_at,sensors:[{sensor_type,unit,raw_value,value,quality,device_time}]}`.
`GET /readings?device_id&sensor_type?&from?&to?&interval=raw|1m|1h|1d&agg=avg|min|max|sum&per_page?` →
raw: paginated `points:[{t,sensor_type,v,q}]`; agregat: `{points:[{t,sensor_type,v,n}]}` + `meta{interval_requested,interval_applied,agg}`.
Koersi server anti-ledakan: ≤24 jam boleh `raw`; ≤7 hari minimum `1m`; ≤90 hari minimum `1h`; selebihnya `1d`. Cap 5000 titik → 422 `{code:range_too_large}`.
`GET /readings/summary?device_id&from&to` → `{temp_min,temp_max,temp_avg,rain_total_mm (SUM mm_delta),wind_max}`.
`GET /dashboard/overview` → `{devices:[{id,device_id,name,status,is_online,location,temp_air,humidity,last_seen_at}],counts:{total,online,offline}}`.
`wind_dir` + `agg=avg` memakai vector-mean (atan2 rata-rata sin/cos), bukan rata-rata aritmetik.

## Format error standar

`{"data":null,"error":{"code":"validation_failed","message":"…","details":{"field":["reason"]}},"meta":{"request_id":"…"}}`.
Validasi Laravel otomatis memakai `code: validation_failed` dengan `details` per-field; kasus domain memakai code di atas.

## Kasus F.3 — perlakuan sistem

1. `ts` masa depan (+2 jam): diterima, `device_time`=ts (otoritas series), `received_at` mencatat drift untuk diagnosis; tidak ditolak.
2. `temp_air=-999`: kode error sensor → `quality=suspect`, nilai disimpan (tidak dibuang).
3. `humidity=150` (rentang 0–100): `quality=out_of_range`, disimpan dengan flag; agregat mengikutkan tapi frontend boleh menyembunyikan flag non-ok.
4. `rain_counter` 1043→5 (restart): `mm_delta = new (5×0.2mm)`, bukan minus; restart ganda dalam satu bucket tetap benar karena delta per-baris lalu `SUM`.
5. Payload identik 3×: `unique(device,time,sensor_type)` + `insertOrIgnore` → pertama 201, berikutnya 200 `{duplicates:1}`.
6. `device_id` tak terdaftar: 401 `{code:device_unauthenticated}` (tanpa token valid tak bisa dibedakan dari salah — disengaja).
7. `solar_rad` absen: tidak ada baris (bukan null) — payload jarang = sensor error, bukan nol.
8. Batch 500 record: batas `MAX_BATCH=500` → 422 bila lebih; satu batch = bulk `insertOrIgnore` per payload; 180 record offline 3 jam diproses sekaligus dan cagg memperbaiki bucket lama saat refresh.
