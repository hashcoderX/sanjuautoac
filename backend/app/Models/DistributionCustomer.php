<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DistributionCustomer extends Model
{
    protected $fillable = [
        'shop_name',
        'customer_code',
        'owner_name',
        'phone',
        'email',
        'address',
        'route_id',
        'outstanding',
        'status',
    ];

    protected $casts = [
        'outstanding' => 'decimal:2',
    ];

    public function invoices(): HasMany
    {
        return $this->hasMany(DistributionInvoice::class, 'customer_id');
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class, 'route_id');
    }

    public function returns(): HasMany
    {
        return $this->hasMany(DistributionReturn::class, 'customer_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(DistributionPayment::class, 'customer_id');
    }
}
