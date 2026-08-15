<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeAllowanceDeduction extends Model
{
    protected $table = 'employee_allowances_deductions';

    protected $fillable = [
        'employee_id',
        'name',
        'amount',
        'type',
        'amount_type',
        'is_active',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
