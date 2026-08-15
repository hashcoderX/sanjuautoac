<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryItem extends Model
{
    protected $fillable = [
        'name',
        'code',
        'description',
        'type',
        'category',
        'unit',
        'current_stock',
        'minimum_stock',
        'maximum_stock',
        'unit_price',
        'purchase_price',
        'sell_price',
        'supplier_name',
        'supplier_id',
        'location',
        'expiry_date',
        'status',
        'additional_info',
    ];

    protected $casts = [
        'current_stock' => 'decimal:2',
        'minimum_stock' => 'decimal:2',
        'maximum_stock' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'purchase_price' => 'decimal:2',
        'sell_price' => 'decimal:2',
        'expiry_date' => 'date',
        'additional_info' => 'array',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    // Scopes for filtering by type
    public function scopeRawMaterials($query)
    {
        return $query->where('type', 'raw_material');
    }

    public function scopeFinishedGoods($query)
    {
        return $query->where('type', 'finished_good');
    }

    // Check if item is low on stock
    public function isLowStock(): bool
    {
        return $this->current_stock <= $this->minimum_stock;
    }

    // Check if item is out of stock
    public function isOutOfStock(): bool
    {
        return $this->current_stock <= 0;
    }

    // Check if item is overstocked
    public function isOverStocked(): bool
    {
        return $this->maximum_stock && $this->current_stock > $this->maximum_stock;
    }
}
