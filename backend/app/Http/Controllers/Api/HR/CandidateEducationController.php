<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateEducation;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class CandidateEducationController extends Controller
{
    public function index(Candidate $candidate): JsonResponse
    {
        return response()->json($candidate->educations()->latest()->get());
    }

    public function store(Request $request, Candidate $candidate): JsonResponse
    {
        $validated = $request->validate([
            'institution' => 'required|string|max:255',
            'degree' => 'nullable|string|max:255',
            'field_of_study' => 'nullable|string|max:255',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'grade' => 'nullable|string|max:100',
            'description' => 'nullable|string',
        ]);

        $edu = $candidate->educations()->create(array_merge($validated, [
            'branch_id' => $candidate->branch_id,
        ]));
        return response()->json($edu, 201);
    }

    public function update(Request $request, Candidate $candidate, CandidateEducation $education): JsonResponse
    {
        if ($education->candidate_id !== $candidate->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $validated = $request->validate([
            'institution' => 'sometimes|required|string|max:255',
            'degree' => 'nullable|string|max:255',
            'field_of_study' => 'nullable|string|max:255',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'grade' => 'nullable|string|max:100',
            'description' => 'nullable|string',
        ]);

        $education->update($validated);
        return response()->json($education);
    }

    public function destroy(Candidate $candidate, CandidateEducation $education): JsonResponse
    {
        if ($education->candidate_id !== $candidate->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $education->delete();
        return response()->json(['message' => 'Education removed']);
    }
}
