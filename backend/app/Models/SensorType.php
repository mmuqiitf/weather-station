<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SensorType extends Model
{
    protected $fillable = ['code', 'unit', 'min_value', 'max_value', 'precision'];

    protected function casts(): array
    {
        return [
            'min_value' => 'decimal:4',
            'max_value' => 'decimal:4',
        ];
    }

    public function sensors(): HasMany
    {
        return $this->hasMany(Sensor::class);
    }

    public function readings(): HasMany
    {
        return $this->hasMany(SensorReading::class);
    }
}
