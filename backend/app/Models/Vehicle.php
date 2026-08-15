<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Vehicle extends Model
{
    protected $fillable = [
        'registration_number',
        'type',
        'capacity_kg',
        'status',
        'fuel_type',
        'model',
        'year',
        'insurance_expiry',
        'license_expiry',
        'current_location',
        'notes'
    ];

    protected $casts = [
        'capacity_kg' => 'decimal:2',
        'year' => 'integer',
        'insurance_expiry' => 'date',
        'license_expiry' => 'date',
    ];
}
