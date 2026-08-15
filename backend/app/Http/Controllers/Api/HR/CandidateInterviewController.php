<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateInterview;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class CandidateInterviewController extends Controller
{
    public function index(Candidate $candidate): JsonResponse
    {
        $interviews = $candidate->interviews()->with('interviewers')->orderBy('interview_date')->orderBy('interview_time')->get();
        return response()->json($interviews);
    }

    public function store(Request $request, Candidate $candidate): JsonResponse
    {
        $data = $request->validate([
            'interview_date' => 'required|date|after_or_equal:today',
            'interview_time' => 'required|date_format:H:i',
            'interview_notes' => 'nullable|string',
            'interviewer_ids' => 'nullable|array',
            'interviewer_ids.*' => 'exists:employees,id',
        ]);

        $interview = new CandidateInterview([
            'interview_date' => $data['interview_date'],
            'interview_time' => $data['interview_time'],
            'interview_notes' => $data['interview_notes'] ?? null,
        ]);
        $interview->candidate()->associate($candidate);
        $interview->save();

        if (!empty($data['interviewer_ids'])) {
            $interview->interviewers()->sync($data['interviewer_ids']);
        }

        // Auto-shortlist on first schedule
        if ($candidate->status === 'applied') {
            $candidate->update(['status' => 'shortlisted']);
        }

        return response()->json($interview->load('interviewers'), 201);
    }

    public function update(Request $request, Candidate $candidate, CandidateInterview $interview): JsonResponse
    {
        // Ensure the interview belongs to the candidate
        if ($interview->candidate_id !== $candidate->id) {
            return response()->json(['message' => 'Interview not found for this candidate'], 404);
        }

        $data = $request->validate([
            'interview_date' => 'sometimes|date|after_or_equal:today',
            'interview_time' => 'sometimes|date_format:H:i',
            'interview_notes' => 'nullable|string',
            'score' => 'nullable|numeric|min:0',
            'result' => 'nullable|in:pending,pass,fail',
            'interviewer_ids' => 'nullable|array',
            'interviewer_ids.*' => 'exists:employees,id',
        ]);

        $interview->update($data);

        if (array_key_exists('interviewer_ids', $data)) {
            $interview->interviewers()->sync($data['interviewer_ids'] ?? []);
        }

        return response()->json($interview->load('interviewers'));
    }

    public function upcoming(Request $request): JsonResponse
    {
        $date = $request->query('from', Carbon::today()->toDateString());
        $tenantId = $request->query('tenant_id');
        $branchId = $request->query('branch_id');
        $query = CandidateInterview::query()
            ->with(['candidate', 'interviewers'])
            ->where('interview_date', '>=', $date)
            ->orderBy('interview_date')
            ->orderBy('interview_time');
        if ($tenantId) {
            $query->whereHas('candidate', fn($q) => $q->where('tenant_id', $tenantId));
        }
        if ($branchId) {
            $query->whereHas('candidate', fn($q) => $q->where('branch_id', $branchId));
        }
        return response()->json($query->get());
    }
}
