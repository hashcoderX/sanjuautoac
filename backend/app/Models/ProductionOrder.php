<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'production_plan_id',
        'batch_no',
        'product_id',
        'bom_id',
        'production_quantity',
        'produced_quantity',
        'wastage_quantity',
        'batch_size',
        'multiplier',
        'machine_name',
        'workstation_name',
        'worker_name',
        'status',
        'material_requirements',
        'actual_material_consumption',
        'started_at',
        'completed_at',
        'cancelled_at',
        'notes',
    ];

    protected $casts = [
        'production_quantity' => 'decimal:3',
        'produced_quantity' => 'decimal:3',
        'wastage_quantity' => 'decimal:3',
        'batch_size' => 'decimal:3',
        'multiplier' => 'decimal:4',
        'material_requirements' => 'array',
        'actual_material_consumption' => 'array',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(ProductionPlan::class, 'production_plan_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function bom(): BelongsTo
    {
        return $this->belongsTo(BomHeader::class, 'bom_id');
    }
}
