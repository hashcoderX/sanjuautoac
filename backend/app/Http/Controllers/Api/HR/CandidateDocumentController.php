<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class CandidateDocumentController extends Controller
{
    public function index(Candidate $candidate): JsonResponse
    {
        return response()->json($candidate->documents()->latest()->get());
    }

    public function store(Request $request, Candidate $candidate): JsonResponse
    {
        $validated = $request->validate([
            'type' => 'required|string',
            'file' => 'required|file|mimes:pdf,doc,docx,jpg,jpeg,png|max:10240',
            'notes' => 'nullable|string',
        ]);

        $path = $request->file('file')->store('candidate_documents', 'public');

        $doc = $candidate->documents()->create([
            'branch_id' => $candidate->branch_id,
            'type' => $validated['type'],
            'file_path' => $path,
            'original_name' => $request->file('file')->getClientOriginalName(),
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json($doc, 201);
    }

    public function destroy(Candidate $candidate, CandidateDocument $document): JsonResponse
    {
        if ($document->candidate_id !== $candidate->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        Storage::disk('public')->delete($document->file_path);
        $document->delete();
        return response()->json(['message' => 'Document deleted']);
    }

    public function download(Candidate $candidate, CandidateDocument $document)
    {
        if ($document->candidate_id !== $candidate->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        return Storage::disk('public')->download($document->file_path, $document->original_name ?: null);
    }
}
