# API.md — Weather Station Platform (`/api/v1`)

Base URL: `http://localhost:8080/api/v1`. All timestamps stored UTC ISO-8601, displayed WIB (Asia/Jakarta) in frontend.
Dokumentasi OpenAPI (Scramble, auto-generated): UI `http://localhost:8080/docs/api`, JSON `http://localhost:8080/docs/api.json`.

## Konvensi umum

Format response mengikuti default Laravel: setiap sukses adalah API Resource tunggal `{data:{…}}`
atau koleksi `{data:[…],links,meta}`. Error selalu `{message,code}` + status yang tepat, plus
`errors` per-field untuk validasi 422 dan `request_id` di setiap error:
`{"message":"…","code":"validation_failed","errors":{"field":["reason"]},"request_id":"…"}`.
`code` berasal dari enum `App\Support\ApiErrorCode` (klien bercabang dari `code`, bukan `message`):
transport (`bad_request|unauthenticated|forbidden|not_found|method_not_allowed|conflict|
token_mismatch|validation_failed|unprocessable_entity|rate_limited|server_error|service_unavailable`)
plus domain (`device_mismatch|illegal_lifecycle_transition|sensor_type_in_use|sensor_mounted|
sensor_attached_elsewhere|unknown_sensor_type|too_many_points`).
Centralized di `bootstrap/app.php` via typed `render()` callbacks (bukan `abort()` tersebar);
domain errors memakai satu `App\Exceptions\ApiException`.
Status: `200|201|204|207|400|401|403|404|409|422|429|500`. `request_id`: UUID per request,
dihormati bila klien mengirim `X-Request-Id` yang valid, disimpan di `Context` (aman untuk Octane,
ikut ke log), dikembalikan di header `X-Request-Id` dan di body setiap error.
Pagination list: paginator default Laravel `?page&per_page` →
`{data, links, meta{current_page,from,last_page,path,per_page,to,total}}`;
kebijakan terpusat di `config/api.php` (`per_page.default/max`) + trait `HasPagination`,
dan setiap sort user selalu diberi tie-breaker `id` agar batas halaman stabil.
Time-series memakai offset untuk `raw` (sumbu `device_time` monotonik dan append-only;
cursor tidak perlu karena bucket deterministik), agregat server-side untuk interval.
Auth ganda: device = `Authorization: Bearer <api_key>` (hash sha256 tersimpan, middleware `device.auth`);
dashboard = `Authorization: Bearer <sanctum_token>` dari `POST /auth/login` (middleware `auth:sanctum`).
Demo login (seeder): `admin@weather.local` / `admin123`.
Rate limit ingestion: 60/menit per device terautentikasi (fallback per IP),
`429 {"message":"Too many ingestion requests.","code":"rate_limited","request_id":"…"}` + header `Retry-After`.

## Auth dashboard

`POST /auth/login` body `{email, password}` → 200 `{data:{token, token_type: "Bearer", user: {id, name, email}}}`.
`token` = Sanctum personal access token, dikirim sebagai `Authorization: Bearer <token>` untuk semua endpoint
management/query. Tanpa token → 401 `{"message":"Unauthenticated.","code":"unauthenticated","request_id":"…"}` (frontend redirect ke `/login`).
`GET /auth/me` → 200 `{data:{id,name,email}}`. `POST /auth/logout` → 200 `{data:{revoked:true}}`.

## Ingestion (device)

`POST /ingest/telemetry` (201 baru, 200 duplikat, 422 validasi, 401 kredensial, 403 device_id≠auth) dan
`POST /ingest/telemetry/batch` (`batch[1..500]`, 207 bila sebagian duplikat/ditolak) serta `POST /ingest/heartbeat` (200 `{received:true}`).

Sukses: `{data:{accepted:1,duplicates:0,rejected:[]}}` (201; duplikat → 200).
Sukses sebagian batch: `{data:{accepted:8,duplicates:2,rejected:[]}}` (207).
Gagal validasi domain (mis. tipe sensor tak dikenal): 422 `{"message":"…","code":"validation_failed","errors":{"payload.0":["Unknown sensor type."]},"request_id":"…"}`
(ValidationException Laravel, per-item batch via `payload.{index}`).
Mismatch device: 403 `code: device_mismatch`. Kredensial salah: 401 `code: unauthenticated`.

## Device management

`POST /devices` body `{device_id, name, location_id?|location{name,latitude,longitude,altitude_m?}}` → 201 `{data: {…, status:"provisioned", api_key_plain:"ws_…(sekali tampil)"}}` (API Resource).
`GET /devices?status&location_id&online=1|0&q&sort=id|device_id|name|status|last_seen_at|created_at&direction=asc|desc&page&per_page` → 200 `{data: [{id,device_id,name,status,is_online,last_seen_at,firmware_version,location{id,…}}], links, meta}` (paginator default; default `sort=id`; `q` = substring `device_id`/`name` case-insensitive; `online=1` hanya terlihat ≤15 mnt, `online=0` basi + belum pernah terlihat).
`GET /devices/{id}` (id numerik atau `device_id`) → 200 `{data}` / 404 `{"message":"Device not found.","code":"not_found","request_id":"…"}`.
`PATCH /devices/{id}` `{name?,location_id?,status?}` — transisi terkontrol `provisioned→active→decommissioned`; ilegal → 422 `code: illegal_lifecycle_transition`.
`DELETE /devices/{id}` → 204, soft delete (histori reading/heartbeat dipertahankan).
`POST /devices/{id}/credentials/rotate` → 200 `{data:{device_id, api_key_plain}}` (hash lama langsung diganti).
`GET /devices/{id}/health` → 200 `{data:{device_id,status,is_online,last_seen_at,firmware_version,battery_v,rssi}}` (`is_online` = ada payload ≤15 mnt).

## Sensor management

`GET /sensor-types?q&unit&in_use=1|0&sort=id|code|unit&direction=asc|desc&page&per_page` → paginator default `{data: [{id,code,unit,min_value,max_value,precision,sensors_count}], …}` (default `sort=code`; `unit` = exact match; `in_use=1` hanya yang dipakai sensor). `POST /sensor-types` `{code,unit,min_value?,max_value?,precision?}` → 201 `{data}`.
`GET /sensor-types/{id}` → 200 `{data}` / 404. `PATCH /sensor-types/{id}` `{code?,unit?,min_value?,max_value?,precision?}` → `{data}` (422 bila `code` duplikat). `DELETE /sensor-types/{id}` → 204 (409 `code: sensor_type_in_use` bila dipakai sensor; 404 bila tak ada).
`GET /sensors?q&sensor_type_id&mounted=1|0&sort=id|serial|sensor_type_id|created_at&direction&page&per_page` → paginator default `{data: [{id,serial,sensor_type_id,sensor_type,current_device_id}], …}` (`q` = substring serial case-insensitive; `mounted=1` hanya yang terpasang). `POST /sensors` `{serial,sensor_type_id}` → 201 `{data}`,
`PATCH /sensors/{id}` `{serial?}` → `{data}`, `DELETE /sensors/{id}` → 204 (409 `code: sensor_mounted` bila masih terpasang).
`POST /devices/{id}/sensors` `{sensor_id,installed_at?}` → 201 `{data}` installation (409 `code: sensor_attached_elsewhere` bila sensor terpasang di device lain; slot tipe sama yang terbuka ditutup otomatis).
`DELETE /devices/{id}/sensors/{sensorId}` → 200 `{data}` installation dengan `removed_at` terisi (404 bila tidak ada instalasi aktif).
`POST /sensors/{id}/calibrations` `{offset?,scale?,effective_at}` → 201; `GET /sensors/{id}/calibrations?page&per_page` → paginator default desc `effective_at`. Nilai mentah tak pernah diubah; koreksi `value = offset + scale*raw` per `effective_at ≤ device_time`.
`GET /locations?page&per_page` → paginator default `{data: [{id,name,latitude,longitude,altitude_m}], …}` urut `name`.

## Query data

`GET /devices/{id}/readings/latest` → 200 `{data:{device_id,is_online,last_seen_at,sensors:[{sensor_type,unit,raw_value,value,quality,device_time}]}}`.
`GET /readings?device_id&sensor_type?&from?&to?&interval=raw|1m|1h|1d&agg=avg|min|max|sum&per_page?` →
raw: paginator default `{data:[{t,sensor_type,v,q}],links,meta}` + kunci top-level `interval_requested,interval_applied,agg`;
agregat: `{data:{points:[{t,sensor_type,v,n}],interval_requested,interval_applied,agg}}`
(`sensor_type` tak dikenal → 422 `code: unknown_sensor_type`; melebihi cap → 422 `code: too_many_points`).
Koersi server anti-ledakan: ≤24 jam boleh `raw`; ≤7 hari minimum `1m`; ≤90 hari minimum `1h`; selebihnya `1d`. Cap 5000 titik (konfigurasi `api.readings.max_points`) → 422 (jumlah vs maksimum disebut di message).
`GET /readings/summary?device_id&from&to` → 200 `{data:{temp_min,temp_max,temp_avg,rain_total_mm (SUM mm_delta),wind_max}}`.
`GET /dashboard/overview` → 200 `{data:{devices:[{id,device_id,name,status,is_online,location,temp_air,humidity,last_seen_at}],counts:{total,online,offline}}}`.
`wind_dir` + `agg=avg` memakai vector-mean (atan2 rata-rata sin/cos), bukan rata-rata aritmetik.

## F.2 Contoh JSON lengkap (dengan catatan per-field)

### 1. Ingestion — sukses

`POST /ingest/telemetry` → `201` (`IngestResultResource`):

```json
{ "data": { "accepted": 1, "duplicates": 0, "rejected": [] } }
```

`accepted` = jumlah payload baru yang tersimpan. `duplicates` = payload yang cocok
kunci unik `(device,time,sensor_type)` sehingga diabaikan (`ON CONFLICT DO NOTHING`).
`rejected` = item batch yang gagal validasi (kosong bila semua valid).
Tracing via header `X-Request-Id` (UUID per request, dihormati bila klien mengirimnya).

### 2. Ingestion — sukses sebagian (batch 10: 8 diterima, 2 duplikat)

`POST /ingest/telemetry/batch` → `207`:

```json
{ "data": { "accepted": 8, "duplicates": 2, "rejected": [] } }
```

Status `207 Multi-Status` menandakan hasil campuran dalam satu batch; klien memakai
`accepted/duplicates/rejected` untuk retry selektif, bukan mengulang seluruh batch.

### 3. Ingestion — gagal validasi

`POST /ingest/telemetry` → `422`:

```json
{
  "message": "Unknown sensor type. (and 1 more error)",
  "code": "validation_failed",
  "errors": { "payload.0": ["Unknown sensor type."] },
  "request_id": "…"
}
```

`message` untuk manusia; `code` untuk mesin; `errors` per-field ala validasi Laravel
(untuk batch: `payload.{index}` = posisi item dalam `batch[]`); `request_id` untuk tracing.

### 4. CRUD device — create / list / detail

`POST /devices` body:

```json
{ "device_id": "WS-GRT-004", "name": "Stasiun Garut 4", "location_id": 1 }
```

`device_id` = identitas fisik unik (contoh `WS-GRT-001`). `name` = nama tampilan.
`location_id` opsional; alternatifnya kirim objek `location{name,latitude,longitude,altitude_m?}`
untuk membuat lokasi sekalian. → `201`:

```json
{
  "data": {
    "id": 4, "device_id": "WS-GRT-004", "name": "Stasiun Garut 4",
    "status": "provisioned", "api_key_plain": "ws_…",
    "location": { "id": 1, "name": "Garut", "latitude": -7.2167, "longitude": 107.9, "altitude_m": 717 }
  }
}
```

`status` awal selalu `provisioned` (transisi terkontrol via PATCH).
`api_key_plain` = secret device, **hanya tampil sekali** — yang tersimpan hanya hash sha256.
`location` = lokasi ter-resolve (atau `null` bila tanpa lokasi).

`GET /devices?status=active&location_id=1&q=garut&page=1&per_page=15` → `200`:

```json
{
  "data": [{ "id": 1, "device_id": "WS-GRT-001", "name": "Stasiun Garut", "status": "active", "is_online": true, "last_seen_at": "2026-09-19T08:00:00Z", "firmware_version": "1.4.2", "location": { "id": 1, "name": "Garut" } }],
  "links": { "first": "…", "last": "…", "prev": null, "next": null },
  "meta": { "current_page": 1, "from": 1, "last_page": 1, "path": "…", "per_page": 15, "to": 3, "total": 3 }
}
```

`status`/`location_id`/`q` = filter persis/substring. `is_online` = ada payload ≤15 menit.
`last_seen_at` = UTC ISO-8601 (frontend konversi ke WIB).

### 5. CRUD sensor + pemasangan + kalibrasi

`POST /sensors` `{ "serial": "SN-TEMP-042", "sensor_type_id": 1 }` → `201`
(`serial` = unit fisik unik; `sensor_type_id` menunjuk `sensor_types`).
`GET /sensors` → paginated `[{id, serial, sensor_type, current_device_id}]`
(`current_device_id` = device tempat sensor terpasang saat ini, atau `null`).
`POST /devices/{id}/sensors` `{ "sensor_id": 7, "installed_at": "2026-06-01T00:00:00Z" }` → `201`
installation (`installed_at` default sekarang; slot tipe sama yang masih terbuka ditutup otomatis;
sensor yang masih terpasang di device lain → `409`).
`DELETE /devices/{id}/sensors/{sensorId}` → `200` installation dengan `removed_at` terisi
(riwayat append-only, tidak dihapus). `POST /sensors/{id}/calibrations`
`{ "offset": 0.5, "scale": 1.0, "effective_at": "2026-09-19T00:00:00Z" }` → `201`;
koreksi `value = offset + scale × raw` berlaku untuk `device_time ≥ effective_at`;
`raw_value` tersimpan tidak pernah berubah.

### 6. Time-series `GET /readings` — efisiensi payload

Dipilih **array-of-objects ringkas** `points: [{t, sensor_type, v, n?/q?}]`
(`t` = bucket/waktu UTC, `v` = nilai, `n` = jumlah sampel agregat, `q` = quality flag untuk raw)
+ kunci top-level `interval_requested, interval_applied, agg`.
Alternatif format kolom terpisah (`{t:[…], v:[…]}`) lebih kecil ~20–30% tetapi memaksa
klien zip/unzip manual dan rapuh saat satu timestamp hilang di satu seri; array-of-objects
tetap ramping setelah koersi interval + cap 5000 titik, dan langsung dimakan Recharts.
Contoh agregat `?device_id=WS-GRT-001&sensor_type=temp_air&interval=1h&agg=avg`
(`ReadingSeriesResource`; `raw` memakai `ReadingPointResource` paginated + kunci yang sama top-level):

```json
{
  "data": {
    "points": [{ "t": "2026-09-19T01:00:00Z", "sensor_type": "temp_air", "v": 24.3, "n": 12 }],
    "interval_requested": "1h", "interval_applied": "1h", "agg": "avg"
  }
}
```

### 7. Format error standar (seluruh API)

```json
{ "message": "…", "code": "validation_failed", "errors": { "name": ["required"] }, "request_id": "…" }
```

Validasi (Form Request): `{"message","code":"validation_failed","errors","request_id"}` per-field, status 422.
Error domain: `{"message","code","request_id"}` (+ `errors` bila relevan) + status yang tepat;
`code` stabil dan machine-readable, transport
(404 → `not_found`, 405 → `method_not_allowed`, 401 → `unauthenticated`, 403 → `forbidden`,
429 → `rate_limited` + header `Retry-After`) maupun domain
(403 device_id ≠ auth → `device_mismatch`, 422 transisi ilegal → `illegal_lifecycle_transition`,
422 `sensor_type` query tak dikenal → `unknown_sensor_type`, 422 cap terlampaui → `too_many_points`,
409 tipe dipakai → `sensor_type_in_use`, 409 sensor terpasang → `sensor_mounted`/`sensor_attached_elsewhere`).
Tanpa token dashboard: 401 `{"message":"Unauthenticated.","code":"unauthenticated","request_id":"…"}`.

## Format error standar

`{"message":"…","code":"validation_failed","errors":{"field":["reason"]},"request_id":"…"}` untuk validasi (422);
`{"message":"…","code":"…","request_id":"…"}` + HTTP status untuk kasus domain. `code` konsisten di seluruh API,
dibangun terpusat oleh typed `render()` callbacks di `bootstrap/app.php` dari enum `App\Support\ApiErrorCode`.

## Kasus F.3 — perlakuan sistem

1. `ts` masa depan (+2 jam): diterima, `device_time`=ts (otoritas series), `received_at` mencatat drift untuk diagnosis; tidak ditolak.
2. `temp_air=-999`: kode error sensor → `quality=suspect`, nilai disimpan (tidak dibuang).
3. `humidity=150` (rentang 0–100): `quality=out_of_range`, disimpan dengan flag; agregat mengikutkan tapi frontend boleh menyembunyikan flag non-ok.
4. `rain_counter` 1043→5 (restart): `mm_delta = new (5×0.2mm)`, bukan minus; restart ganda dalam satu bucket tetap benar karena delta per-baris lalu `SUM`.
5. Payload identik 3×: `unique(device,time,sensor_type)` + `insertOrIgnore` → pertama 201, berikutnya 200 `{"duplicates":1,…}`.
6. `device_id` tak terdaftar: 401 `{"message": "Invalid or missing device credentials.", "code": "unauthenticated"}` (tanpa token valid tak bisa dibedakan dari salah — disengaja).
7. `solar_rad` absen: tidak ada baris (bukan null) — payload jarang = sensor error, bukan nol.
8. Batch 500 record: batas `MAX_BATCH=500` → 422 bila lebih; satu batch = bulk `insertOrIgnore` per payload; 180 record offline 3 jam diproses sekaligus dan cagg memperbaiki bucket lama saat refresh.
