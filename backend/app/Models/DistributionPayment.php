<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DistributionPayment extends Model
{
    protected $fillable = [
        'payment_number',
        'distribution_invoice_id',
        'load_id',
        'customer_id',
        'payment_date',
        'cheque_date',
        'amount',
        'payment_method',
        'reference_no',
        'bank_name',
        'status',
        'notes',
        'received_by',
    ];

    protected $casts = [
        'payment_date' => 'date',
        'cheque_date' => 'date',
        'amount' => 'decimal:2',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(DistributionCustomer::class, 'customer_id');
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(DistributionInvoice::class, 'distribution_invoice_id');
    }

    public function assignedLoad(): BelongsTo
    {
        return $this->belongsTo(Load::class, 'load_id');
    }
}
