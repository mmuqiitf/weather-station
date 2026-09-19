<?php

namespace App\Models;

use Database\Factories\SensorFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sensor extends Model
{
    /** @use HasFactory<SensorFactory> */
    use HasFactory;

    protected $fillable = ['serial', 'sensor_type_id'];

    public function type(): BelongsTo
    {
        return $this->belongsTo(SensorType::class, 'sensor_type_id');
    }

    public function installations(): HasMany
    {
        return $this->hasMany(SensorInstallation::class);
    }

    public function calibrations(): HasMany
    {
        return $this->hasMany(SensorCalibration::class);
    }
}
