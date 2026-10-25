<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceCustomer extends Model
{
    protected $fillable = [
        'tenant_id',
        'branch_id',
        'name',
        'phone',
        'email',
        'outstanding_balance',
    ];

    protected $casts = [
        'outstanding_balance' => 'decimal:2',
    ];

    public function jobCardDocuments(): HasMany
    {
        return $this->hasMany(JobCardDocument::class);
    }
}
