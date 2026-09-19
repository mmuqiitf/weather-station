<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeviceHeartbeat extends Model
{
    protected $fillable = [
        'device_id', 'device_time', 'received_at', 'firmware_version',
        'battery_v', 'rssi', 'uptime_s',
    ];

    protected function casts(): array
    {
        return [
            'device_time' => 'datetime',
            'received_at' => 'datetime',
            'battery_v' => 'decimal:2',
        ];
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}
