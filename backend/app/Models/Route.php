<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Route extends Model
{
    protected $fillable = [
        'name',
        'origin',
        'destination',
        'distance_km',
        'estimated_duration_hours',
        'status',
        'route_type',
        'toll_charges',
        'fuel_estimate_liters',
        'description',
        'waypoints'
    ];

    protected $casts = [
        'distance_km' => 'decimal:2',
        'estimated_duration_hours' => 'decimal:2',
        'toll_charges' => 'decimal:2',
        'fuel_estimate_liters' => 'decimal:2',
        'waypoints' => 'array',
    ];
}
