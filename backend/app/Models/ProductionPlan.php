<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionPlan extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'bom_id',
        'plan_date',
        'shift',
        'target_quantity',
        'batch_count',
        'priority',
        'status',
        'order_number',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'plan_date' => 'date',
        'target_quantity' => 'decimal:3',
        'batch_count' => 'decimal:2',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function bom(): BelongsTo
    {
        return $this->belongsTo(BomHeader::class, 'bom_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
