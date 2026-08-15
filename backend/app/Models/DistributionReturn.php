<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DistributionReturn extends Model
{
    protected $fillable = [
        'return_number',
        'distribution_invoice_id',
        'load_id',
        'customer_id',
        'returned_inventory_item_id',
        'return_date',
        'total_quantity',
        'total_amount',
        'settlement_type',
        'settlement_amount',
        'exchange_inventory_item_id',
        'exchange_quantity',
        'reason',
        'status',
        'notes',
    ];

    protected $casts = [
        'return_date' => 'date',
        'total_quantity' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'settlement_amount' => 'decimal:2',
        'exchange_quantity' => 'decimal:2',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(DistributionCustomer::class, 'customer_id');
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(DistributionInvoice::class, 'distribution_invoice_id');
    }

    public function returnedItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'returned_inventory_item_id');
    }

    public function exchangeItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'exchange_inventory_item_id');
    }

    public function assignedLoad(): BelongsTo
    {
        return $this->belongsTo(Load::class, 'load_id');
    }
}
