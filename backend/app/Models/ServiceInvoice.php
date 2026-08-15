<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceInvoice extends Model
{
    protected $fillable = [
        'document_type',
        'document_number',
        'document_date',
        'status',
        'customer_name',
        'customer_phone',
        'customer_email',
        'vehicle_no',
        'brand',
        'model',
        'chassis_no',
        'subtotal',
        'discount_amount',
        'tax_amount',
        'total_amount',
        'service_customer_id',
        'payment_timing',
        'payment_status',
        'payment_type',
        'payment_reference',
        'paid_amount',
        'balance_amount',
        'paid_at',
        'notes',
        'valid_until',
        'due_date',
        'source_document_id',
        'created_by',
    ];

    protected $casts = [
        'document_date' => 'date',
        'valid_until' => 'date',
        'due_date' => 'date',
        'subtotal' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'balance_amount' => 'decimal:2',
        'paid_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(ServiceInvoiceItem::class)->orderBy('sort_order');
    }

    public function serviceCustomer(): BelongsTo
    {
        return $this->belongsTo(ServiceCustomer::class);
    }

    public function sourceDocument(): BelongsTo
    {
        return $this->belongsTo(self::class, 'source_document_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function (ServiceInvoice $invoice) {
            if (empty($invoice->document_number)) {
                $invoice->document_number = static::generateDocumentNumber($invoice->document_type);
            }
        });
    }

    public static function generateDocumentNumber(string $type): string
    {
        $year = date('Y');
        $prefix = $type === 'invoice' ? "SINV{$year}" : "SQT{$year}";

        $last = static::where('document_number', 'like', "{$prefix}%")
            ->orderByDesc('document_number')
            ->first();

        $next = 1;
        if ($last) {
            $next = (int) substr($last->document_number, -4) + 1;
        }

        return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }
}
