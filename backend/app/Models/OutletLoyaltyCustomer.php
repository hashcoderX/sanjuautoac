<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OutletLoyaltyCustomer extends Model
{
    protected $fillable = [
        'outlet_id',
        'customer_code',
        'name',
        'phone',
        'email',
        'birthday',
        'points_balance',
        'total_visits',
        'total_spent',
        'status',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'birthday' => 'date',
        'points_balance' => 'decimal:2',
        'total_spent' => 'decimal:2',
        'total_visits' => 'integer',
    ];

    public function outlet(): BelongsTo
    {
        return $this->belongsTo(Outlet::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(OutletSale::class, 'loyalty_customer_id');
    }
}
