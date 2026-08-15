<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobCardDocument extends Model
{
    protected $fillable = [
        'job_card_id',
        'service_customer_id',
        'document_type',
        'document_number',
        'document_date',
        'status',
        'subtotal',
        'discount_amount',
        'tax_amount',
        'total_amount',
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

    public function jobCard(): BelongsTo
    {
        return $this->belongsTo(JobCard::class);
    }

    public function serviceCustomer(): BelongsTo
    {
        return $this->belongsTo(ServiceCustomer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(JobCardDocumentItem::class)->orderBy('sort_order');
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

        static::creating(function (JobCardDocument $document) {
            if (empty($document->document_number)) {
                $document->document_number = static::generateDocumentNumber($document->document_type);
            }
        });
    }

    public static function generateDocumentNumber(string $type): string
    {
        $year = date('Y');
        $prefix = $type === 'invoice' ? "INV{$year}" : "QT{$year}";

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
