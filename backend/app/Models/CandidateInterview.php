<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class CandidateInterview extends Model
{
    protected $fillable = [
        'candidate_id',
        'interview_date',
        'interview_time',
        'interview_notes',
        'score',
        'result',
    ];

    protected $casts = [
        'interview_date' => 'date',
    ];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function interviewers(): BelongsToMany
    {
        return $this->belongsToMany(Employee::class, 'candidate_interview_participants');
    }
}
