<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payroll extends Model
{
    protected $fillable = [
        'tenant_id',
        'branch_id',
        'employee_id',
        'month_year',
        'basic_salary',
        'earned_basic_salary',
        'allowances',
        'deductions',
        'commission_amount',
        'attendance_deduction_amount',
        'late_hours',
        'late_deduction_amount',
        'epf_employee_amount',
        'epf_employer_amount',
        'etf_employee_amount',
        'etf_employer_amount',
        'gross_salary',
        'apit_tax_amount',
        'net_salary',
        'working_days',
        'present_days',
        'absent_days',
        'overtime_hours',
        'overtime_amount',
        'status',
        'processed_at',
    ];

    protected $casts = [
        'basic_salary' => 'decimal:2',
        'earned_basic_salary' => 'decimal:2',
        'allowances' => 'decimal:2',
        'deductions' => 'decimal:2',
        'commission_amount' => 'decimal:2',
        'attendance_deduction_amount' => 'decimal:2',
        'late_hours' => 'decimal:2',
        'late_deduction_amount' => 'decimal:2',
        'epf_employee_amount' => 'decimal:2',
        'epf_employer_amount' => 'decimal:2',
        'etf_employee_amount' => 'decimal:2',
        'etf_employer_amount' => 'decimal:2',
        'gross_salary' => 'decimal:2',
        'apit_tax_amount' => 'decimal:2',
        'net_salary' => 'decimal:2',
        'overtime_hours' => 'decimal:2',
        'overtime_amount' => 'decimal:2',
        'processed_at' => 'date',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'tenant_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'branch_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
