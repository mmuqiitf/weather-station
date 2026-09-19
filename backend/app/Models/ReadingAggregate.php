<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReadingAggregate extends Model
{
    public const INTERVAL_HOUR = '1h';

    public const INTERVAL_DAY = '1d';

    protected $fillable = [
        'device_id', 'sensor_type_id', 'interval', 'bucket',
        'avg_value', 'min_value', 'max_value', 'sum_value', 'sample_count',
    ];

    protected function casts(): array
    {
        return [
            'bucket' => 'datetime',
            'avg_value' => 'decimal:4',
            'min_value' => 'decimal:4',
            'max_value' => 'decimal:4',
            'sum_value' => 'decimal:4',
        ];
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function sensorType(): BelongsTo
    {
        return $this->belongsTo(SensorType::class);
    }
}
