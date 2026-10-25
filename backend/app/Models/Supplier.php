<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Supplier extends Model
{
    protected $fillable = [
        'tenant_id',
        'branch_id',
        'name',
        'contact_person',
        'email',
        'phone',
        'address',
        'company',
        'status',
        'outstanding_balance',
    ];

    protected $casts = [
        'outstanding_balance' => 'decimal:2',
        'status' => 'string',
    ];
}
