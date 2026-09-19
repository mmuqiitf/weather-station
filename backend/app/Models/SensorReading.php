<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SensorReading extends Model
{
    public const QUALITY_OK = 'ok';

    public const QUALITY_OUT_OF_RANGE = 'out_of_range';

    public const QUALITY_SUSPECT = 'suspect';

    protected $fillable = [
        'device_id', 'sensor_type_id', 'sensor_id', 'device_time', 'received_at',
        'raw_value', 'value', 'mm_delta', 'quality',
    ];

    protected function casts(): array
    {
        return [
            'device_time' => 'datetime',
            'received_at' => 'datetime',
            'raw_value' => 'decimal:4',
            'value' => 'decimal:4',
            'mm_delta' => 'decimal:4',
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

    public function sensor(): BelongsTo
    {
        return $this->belongsTo(Sensor::class);
    }
}
