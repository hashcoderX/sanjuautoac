<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JobCardImage extends Model
{
    protected $fillable = [
        'job_card_id',
        'path',
        'original_name',
        'mime_type',
        'size_kb',
    ];

    protected $appends = [
        'image_url',
    ];

    public function jobCard(): BelongsTo
    {
        return $this->belongsTo(JobCard::class);
    }

    public function getImageUrlAttribute(): ?string
    {
        if (!$this->path) {
            return null;
        }

        return asset('storage/' . ltrim((string) $this->path, '/'));
    }
}
