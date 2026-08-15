<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LeaveType extends Model
{
    protected $fillable = [
        'name',
        'code',
        'description',
        'max_days_per_year',
        'requires_documentation',
        'is_active',
    ];

    protected $casts = [
        'requires_documentation' => 'boolean',
        'is_active' => 'boolean',
        'max_days_per_year' => 'integer',
    ];

    public function leaves(): HasMany
    {
        return $this->hasMany(Leave::class, 'leave_type', 'code');
    }
}
