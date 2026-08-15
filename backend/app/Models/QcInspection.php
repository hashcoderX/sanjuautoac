<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QcInspection extends Model
{
    use HasFactory;

    protected $fillable = [
        'production_order_id',
        'inspection_date',
        'inspector_name',
        'quality_status',
        'approved_quantity',
        'rejected_quantity',
        'food_safety_checklist',
        'defects_notes',
        'rejection_reason',
        'report_notes',
    ];

    protected $casts = [
        'inspection_date' => 'date',
        'approved_quantity' => 'decimal:3',
        'rejected_quantity' => 'decimal:3',
        'food_safety_checklist' => 'array',
    ];

    public function productionOrder(): BelongsTo
    {
        return $this->belongsTo(ProductionOrder::class, 'production_order_id');
    }
}
