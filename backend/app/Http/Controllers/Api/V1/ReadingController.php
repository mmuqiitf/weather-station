<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\ListReadingsRequest;
use App\Http\Requests\ReadingSummaryRequest;
use App\Http\Resources\ReadingLatestResource;
use App\Http\Resources\ReadingPointResource;
use App\Http\Resources\ReadingSeriesResource;
use App\Http\Resources\ReadingSummaryResource;
use App\Models\SensorReading;
use App\Models\SensorType;
use App\Support\ApiErrorCode;
use App\Support\DeviceLookup;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ReadingController extends Controller
{
    public const MAX_POINTS = 5000;

    public function latest(string $id): ReadingLatestResource
    {
        $device = DeviceLookup::findOrFail($id);

        $sensors = SensorReading::query()
            ->where('device_id', $device->id)
            ->whereIn('id', fn ($q) => $q->selectRaw('MAX(id)')
                ->from('sensor_readings')->where('device_id', $device->id)->groupBy('sensor_type_id'))
            ->with('sensorType')->get();

        return new ReadingLatestResource($device, $sensors);
    }

    public function index(ListReadingsRequest $request): AnonymousResourceCollection|ReadingSeriesResource
    {
        $validated = $request->validated();

        $device = DeviceLookup::findOrFail($validated['device_id']);

        $from = isset($validated['from']) ? new \DateTimeImmutable($validated['from']) : new \DateTimeImmutable('-24 hours');
        $to = isset($validated['to']) ? new \DateTimeImmutable($validated['to']) : new \DateTimeImmutable('now');
        $rangeHours = max(1, ($to->getTimestamp() - $from->getTimestamp()) / 3600);

        $requested = $validated['interval'] ?? 'raw';
        $interval = self::coerceInterval($requested, $rangeHours);
        $agg = $validated['agg'] ?? 'avg';

        $maxPoints = (int) config('api.readings.max_points', self::MAX_POINTS);

        $query = SensorReading::query()->where('device_id', $device->id)
            ->whereBetween('device_time', [$from->format('Y-m-d H:i:s'), $to->format('Y-m-d H:i:s')])
            ->orderBy('device_time')->orderBy('id');

        if (! empty($validated['sensor_type'])) {
            $typeId = SensorType::where('code', $validated['sensor_type'])->value('id');

            if ($typeId === null) {
                throw new ApiException(ApiErrorCode::UnknownSensorType, 'Unknown sensor_type.');
            }

            $query->where('sensor_type_id', $typeId);
        }

        // Forced aggregation guard: raw over a long range would explode the response.
        if ($interval === 'raw') {
            $perPage = min($request->perPage((int) config('api.readings.raw_per_page', 1000)), $maxPoints);
            $paginator = $query->with('sensorType')->paginate($perPage);

            return ReadingPointResource::collection($paginator)->additional([
                'interval_requested' => $requested, 'interval_applied' => $interval, 'agg' => $agg,
            ]);
        }

        $points = self::aggregated($query, $interval, $agg, $validated['sensor_type'] ?? null, $maxPoints);

        if (count($points) > $maxPoints) {
            throw new ApiException(
                ApiErrorCode::TooManyPoints,
                'Too many points ('.count($points).', max '.$maxPoints.'); narrow the range or use a coarser interval.',
            );
        }

        return new ReadingSeriesResource($points, $requested, $interval, $agg);
    }

    public function summary(ReadingSummaryRequest $request): ReadingSummaryResource
    {
        $validated = $request->validated();

        $device = DeviceLookup::findOrFail($validated['device_id']);

        $from = $validated['from'] ?? date('Y-m-d H:i:s', strtotime('-24 hours'));
        $to = $validated['to'] ?? date('Y-m-d H:i:s');

        $base = SensorReading::query()->where('device_id', $device->id)
            ->whereBetween('device_time', [$from, $to]);

        $tempId = SensorType::where('code', 'temp_air')->value('id');
        $rainId = SensorType::where('code', 'rain_counter')->value('id');
        $windId = SensorType::where('code', 'wind_speed')->value('id');

        $temp = $tempId ? (clone $base)->where('sensor_type_id', $tempId)
            ->selectRaw('MIN(value) AS mn, MAX(value) AS mx, AVG(value) AS av')->first() : null;
        $rain = $rainId ? (float) (clone $base)->where('sensor_type_id', $rainId)->sum('mm_delta') : 0.0;
        $windMax = $windId ? (clone $base)->where('sensor_type_id', $windId)->max('value') : null;

        return new ReadingSummaryResource([
            'device_id' => $device->device_id,
            'from' => $from, 'to' => $to,
            'temp_min' => $temp?->mn !== null ? (float) $temp->mn : null,
            'temp_max' => $temp?->mx !== null ? (float) $temp->mx : null,
            'temp_avg' => $temp?->av !== null ? (float) $temp->av : null,
            'rain_total_mm' => round($rain, 2),
            'wind_max' => $windMax !== null ? (float) $windMax : null,
        ]);
    }

    private static function coerceInterval(string $requested, float $rangeHours): string
    {
        // Server-coerced intervals prevent response explosion on long ranges (§E).
        if ($rangeHours <= 24) {
            return $requested === 'raw' ? 'raw' : $requested;
        }

        if ($rangeHours <= 24 * 7) {
            return in_array($requested, ['raw'], true) ? '1m' : ($requested === '1m' ? '1m' : $requested);
        }

        if ($rangeHours <= 24 * 90) {
            return in_array($requested, ['raw', '1m'], true) ? '1h' : $requested;
        }

        return in_array($requested, ['raw', '1m', '1h'], true) ? '1d' : $requested;
    }

    /** @return array<int, array<string, mixed>> */
    private static function aggregated(mixed $query, string $interval, string $agg, ?string $sensorType, int $maxPoints): array
    {
        $bucket = match ($interval) {
            '1m' => "date_trunc('minute', device_time)",
            '1h' => "date_trunc('hour', device_time)",
            default => "date_trunc('day', device_time)",
        };

        $valueExpr = match ($agg) {
            'min' => 'MIN(value)', 'max' => 'MAX(value)', 'sum' => 'SUM(COALESCE(mm_delta, value))',
            default => 'AVG(value)',
        };

        // Wind direction uses vector mean, not arithmetic mean (essay Q3).
        $isWindDir = $sensorType === 'wind_dir' && $agg === 'avg';

        $rows = (clone $query)
            // Drop the inherited orderBy(device_time): grouping by bucket makes
            // the raw column illegal in ORDER BY (Postgres 42803).
            ->reorder()
            ->selectRaw("{$bucket} AS bucket, sensor_type_id, ".($isWindDir
                ? 'AVG(SIN(RADIANS(value))) AS s, AVG(COS(RADIANS(value))) AS c, COUNT(*) AS n'
                : "{$valueExpr} AS v, COUNT(*) AS n"))
            ->groupByRaw('1, 2')->orderBy('bucket')->orderBy('sensor_type_id')->limit($maxPoints + 1)->get();

        $types = SensorType::whereIn('id', $rows->pluck('sensor_type_id'))->pluck('code', 'id');

        return $rows->map(fn ($r) => [
            't' => (new \DateTimeImmutable($r->bucket))->format(DATE_ATOM),
            'sensor_type' => $types[$r->sensor_type_id] ?? (string) $r->sensor_type_id,
            'v' => $isWindDir
                ? (float) ((rad2deg(atan2((float) $r->s, (float) $r->c)) + 360) % 360)
                : (float) $r->v,
            'n' => (int) $r->n,
        ])->all();
    }
}
