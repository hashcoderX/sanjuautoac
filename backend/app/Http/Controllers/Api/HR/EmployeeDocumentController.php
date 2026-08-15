<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class EmployeeDocumentController extends Controller
{
    public function index(Employee $employee): JsonResponse
    {
        return response()->json($employee->documents()->latest()->get());
    }

    public function store(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'type' => 'required|string',
            'file' => 'required|file|mimes:pdf,doc,docx,jpg,jpeg,png|max:10240',
            'notes' => 'nullable|string',
        ]);

        $path = $request->file('file')->store('employee_documents', 'public');

        $doc = $employee->documents()->create([
            'branch_id' => $employee->branch_id,
            'type' => $validated['type'],
            'file_path' => $path,
            'original_name' => $request->file('file')->getClientOriginalName(),
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json($doc, 201);
    }

    public function destroy(Employee $employee, EmployeeDocument $document): JsonResponse
    {
        if ($document->employee_id !== $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        Storage::disk('public')->delete($document->file_path);
        $document->delete();
        return response()->json(['message' => 'Document deleted']);
    }

    public function download(Employee $employee, EmployeeDocument $document)
    {
        if ($document->employee_id !== $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        return Storage::disk('public')->download($document->file_path, $document->original_name ?: null);
    }
}