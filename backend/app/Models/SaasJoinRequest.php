<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SaasJoinRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'business_name',
        'business_address',
        'country',
        'currency',
        'contact_number',
        'admin_name',
        'admin_email',
        'admin_password',
        'provision_status',
        'database_name',
        'database_user',
        'database_password_encrypted',
        'database_host',
        'database_port',
        'backup_namespace',
        'dedicated_database',
        'separate_backup',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'dedicated_database' => 'boolean',
            'separate_backup' => 'boolean',
            'meta' => 'array',
        ];
    }
}
