<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutletSaleItem extends Model
{
    protected $fillable = [
        'outlet_sale_id',
        'inventory_item_id',
        'item_code',
        'item_name',
        'unit',
        'issue_type',
        'discount_amount',
        'quantity',
        'unit_price',
        'line_total',
    ];

    protected $casts = [
        'discount_amount' => 'decimal:2',
        'quantity' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(OutletSale::class, 'outlet_sale_id');
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }
}
