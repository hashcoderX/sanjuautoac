<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Leave extends Model
{
    protected $fillable = [
        'tenant_id',
        'branch_id',
        'employee_id',
        'leave_type',
        'start_date',
        'end_date',
        'days_requested',
        'reason',
        'status',
        'approved_by',
        'approver_notes',
        'approved_at',
        'section_head_approved',
        'section_head_approved_by',
        'section_head_approved_at',
        'section_head_notes',
        'hr_approved',
        'hr_approved_by',
        'hr_approved_at',
        'hr_notes',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'approved_at' => 'date',
        'section_head_approved_at' => 'datetime',
        'hr_approved_at' => 'datetime',
        'section_head_approved' => 'boolean',
        'hr_approved' => 'boolean',
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

    public function approver(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'approved_by');
    }

    public function sectionHeadApprover(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'section_head_approved_by');
    }

    public function hrApprover(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'hr_approved_by');
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class, 'leave_type', 'code');
    }
}
