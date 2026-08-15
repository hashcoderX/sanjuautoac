<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateExperience;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class CandidateExperienceController extends Controller
{
    public function index(Candidate $candidate): JsonResponse
    {
        return response()->json($candidate->experiences()->latest()->get());
    }

    public function store(Request $request, Candidate $candidate): JsonResponse
    {
        $validated = $request->validate([
            'company' => 'required|string|max:255',
            'role' => 'required|string|max:255',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'is_current' => 'boolean',
            'responsibilities' => 'nullable|string',
            'achievements' => 'nullable|string',
        ]);

        $exp = $candidate->experiences()->create(array_merge($validated, [
            'branch_id' => $candidate->branch_id,
        ]));
        return response()->json($exp, 201);
    }

    public function update(Request $request, Candidate $candidate, CandidateExperience $experience): JsonResponse
    {
        if ($experience->candidate_id !== $candidate->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $validated = $request->validate([
            'company' => 'sometimes|required|string|max:255',
            'role' => 'sometimes|required|string|max:255',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'is_current' => 'boolean',
            'responsibilities' => 'nullable|string',
            'achievements' => 'nullable|string',
        ]);

        $experience->update($validated);
        return response()->json($experience);
    }

    public function destroy(Candidate $candidate, CandidateExperience $experience): JsonResponse
    {
        if ($experience->candidate_id !== $candidate->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $experience->delete();
        return response()->json(['message' => 'Experience removed']);
    }
}
