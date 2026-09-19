<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SensorCalibration extends Model
{
    protected $fillable = ['sensor_id', 'offset', 'scale', 'effective_at'];

    protected function casts(): array
    {
        return [
            'offset' => 'decimal:4',
            'scale' => 'decimal:6',
            'effective_at' => 'datetime',
        ];
    }

    public function sensor(): BelongsTo
    {
        return $this->belongsTo(Sensor::class);
    }
}
