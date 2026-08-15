<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobCard extends Model
{
    protected $fillable = [
        'job_card_number',
        'customer_name',
        'customer_phone',
        'customer_email',
        'vehicle_no',
        'chassis_no',
        'brand',
        'model',
        'problem_description',
        'accessories_received',
        'inspection_review',
        'inspection_reviewed_at',
        'inspected_by_employee_id',
        'priority',
        'status',
        'assigned_employee_id',
        'received_date',
        'promised_date',
        'estimated_cost',
        'advance_amount',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'received_date' => 'date',
        'promised_date' => 'date',
        'estimated_cost' => 'decimal:2',
        'advance_amount' => 'decimal:2',
        'inspection_reviewed_at' => 'datetime',
    ];

    public function assignedEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'assigned_employee_id');
    }

    public function inspectedByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'inspected_by_employee_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(JobCardDocument::class);
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function (JobCard $jobCard) {
            if (empty($jobCard->job_card_number)) {
                $jobCard->job_card_number = static::generateJobCardNumber();
            }
        });
    }

    public static function generateJobCardNumber(): string
    {
        $year = date('Y');
        $prefix = "JC{$year}";

        $last = static::where('job_card_number', 'like', "{$prefix}%")
            ->orderByDesc('job_card_number')
            ->first();

        $next = 1;
        if ($last) {
            $next = (int) substr($last->job_card_number, -4) + 1;
        }

        return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }
}
