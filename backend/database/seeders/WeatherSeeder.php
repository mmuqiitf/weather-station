<?php

namespace Database\Seeders;

use App\Models\Device;
use App\Models\Location;
use App\Models\Sensor;
use App\Models\SensorCalibration;
use App\Models\SensorInstallation;
use App\Models\SensorType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class WeatherSeeder extends Seeder
{
    /** Plain-text device keys for local review + simulator. NEVER ship these to production. */
    public const DEVICE_KEYS = [
        'WS-GRT-001' => 'dev-secret-grt-001',
        'WS-BDG-002' => 'dev-secret-bdg-002',
        'WS-BGR-003' => 'dev-secret-bgr-003',
    ];

    private const TYPES = [
        ['code' => 'temp_air', 'unit' => '°C', 'min_value' => -40, 'max_value' => 60, 'precision' => 1],
        ['code' => 'humidity', 'unit' => '%RH', 'min_value' => 0, 'max_value' => 100, 'precision' => 1],
        ['code' => 'pressure', 'unit' => 'hPa', 'min_value' => 300, 'max_value' => 1100, 'precision' => 1],
        ['code' => 'rain_counter', 'unit' => 'tips', 'min_value' => 0, 'max_value' => 99999999, 'precision' => 0],
        ['code' => 'wind_speed', 'unit' => 'm/s', 'min_value' => 0, 'max_value' => 75, 'precision' => 1],
        ['code' => 'wind_dir', 'unit' => '°', 'min_value' => 0, 'max_value' => 359, 'precision' => 0],
        ['code' => 'solar_rad', 'unit' => 'W/m²', 'min_value' => 0, 'max_value' => 2000, 'precision' => 1],
    ];

    public function run(): void
    {
        mt_srand(42);
        $now = CarbonImmutable::now('UTC');
        $start = $now->subDays(7);

        foreach (self::TYPES as $type) {
            SensorType::query()->firstOrCreate(['code' => $type['code']], $type);
        }
        $types = SensorType::all()->keyBy('code');

        $locations = [
            ['name' => 'Garut', 'latitude' => -7.2167, 'longitude' => 107.9000, 'altitude_m' => 717],
            ['name' => 'Bandung', 'latitude' => -6.9175, 'longitude' => 107.6191, 'altitude_m' => 768],
            ['name' => 'Bogor', 'latitude' => -6.5971, 'longitude' => 106.8060, 'altitude_m' => 265],
        ];

        $deviceIds = array_keys(self::DEVICE_KEYS);
        $devices = [];

        foreach ($deviceIds as $i => $deviceId) {
            $location = Location::query()->firstOrCreate(
                ['name' => $locations[$i]['name']], $locations[$i]
            );

            $device = Device::query()->updateOrCreate(['device_id' => $deviceId], [
                'name' => "Stasiun {$locations[$i]['name']}",
                'location_id' => $location->id,
                'status' => Device::STATUS_ACTIVE,
                'api_key_hash' => hash('sha256', self::DEVICE_KEYS[$deviceId]),
                'firmware_version' => '1.4.2',
                'last_seen_at' => $now,
            ]);
            $devices[] = $device;

            foreach ($types as $code => $type) {
                $sensor = Sensor::query()->firstOrCreate(
                    ['serial' => "{$deviceId}-".strtoupper($code)],
                    ['sensor_type_id' => $type->id]
                );

                SensorInstallation::query()->firstOrCreate(
                    ['sensor_id' => $sensor->id, 'device_id' => $device->id],
                    ['installed_at' => $start]
                );

                SensorCalibration::query()->firstOrCreate(
                    ['sensor_id' => $sensor->id, 'effective_at' => $start],
                    ['offset' => 0, 'scale' => 1]
                );
            }
        }

        // 7-day history at 5-min steps (2016 pts/sensor). 1/min density comes from the live simulator.
        $this->command?->info('Seeding 7-day history (~42k readings)…');
        $rainCounters = [];
        $step = 0;

        for ($t = $start; $t->lt($now); $t = $t->addMinutes(5), $step++) {
            $rows = [];
            $hour = $t->hour + $t->minute / 60;

            foreach ($devices as $di => $device) {
                $phase = $di * 1.7;
                $temp = 24 + 5 * sin(($hour - 9) / 24 * 2 * M_PI + $phase) + (mt_rand(-50, 50) / 100);
                $hum = 88 - 18 * sin(($hour - 9) / 24 * 2 * M_PI + $phase) + (mt_rand(-100, 100) / 100);
                $pressure = 1008 + 3 * sin($step / 200 + $phase) + (mt_rand(-20, 20) / 100);
                $windSpeed = max(0, 3 + 2 * sin($step / 50 + $phase) + (mt_rand(-80, 80) / 100));
                $windDir = (int) ((210 + 60 * sin($step / 300 + $phase) + mt_rand(-8, 8) + 360) % 360);
                $solar = $hour > 6 && $hour < 18
                    ? max(0, 800 * sin(($hour - 6) / 12 * M_PI) + mt_rand(-300, 300) / 10)
                    : 0;

                $key = $device->id;
                $prev = $rainCounters[$key] ?? mt_rand(900, 1100);
                // Occasional afternoon shower.
                $tips = ($hour > 14 && $hour < 16 && mt_rand(1, 100) <= 25) ? mt_rand(0, 3) : mt_rand(0, 1);
                $counter = $prev + $tips;
                $rainCounters[$key] = $counter;

                $values = [
                    'temp_air' => round($temp, 1), 'humidity' => round(max(0, min(100, $hum)), 1),
                    'pressure' => round($pressure, 1), 'rain_counter' => $counter,
                    'wind_speed' => round($windSpeed, 1), 'wind_dir' => $windDir,
                    'solar_rad' => round($solar, 1),
                ];

                foreach ($values as $code => $raw) {
                    $type = $types[$code];
                    $sensorId = Sensor::where('serial', "{$device->device_id}-".strtoupper($code))->value('id');
                    $rows[] = [
                        'device_id' => $device->id, 'sensor_type_id' => $type->id, 'sensor_id' => $sensorId,
                        'device_time' => $t->toDateTimeString(), 'received_at' => $t->toDateTimeString(),
                        'raw_value' => $raw, 'value' => $raw,
                        'mm_delta' => $code === 'rain_counter' ? round($tips * 0.2, 4) : null,
                        'quality' => 'ok', 'created_at' => $now->toDateTimeString(), 'updated_at' => $now->toDateTimeString(),
                    ];
                }
            }

            foreach (array_chunk($rows, 1000) as $chunk) {
                DB::table('sensor_readings')->insertOrIgnore($chunk);
            }
        }

        $this->command?->info('WeatherSeeder done: 3 devices, 7 types, 7-day history.');
    }
}
