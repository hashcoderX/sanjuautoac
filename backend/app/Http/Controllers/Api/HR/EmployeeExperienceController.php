<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeExperience;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class EmployeeExperienceController extends Controller
{
    public function index(Employee $employee): JsonResponse
    {
        return response()->json($employee->experiences()->latest()->get());
    }

    public function store(Request $request, Employee $employee): JsonResponse
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

        $exp = $employee->experiences()->create(array_merge($validated, [
            'branch_id' => $employee->branch_id,
        ]));
        return response()->json($exp, 201);
    }

    public function update(Request $request, Employee $employee, EmployeeExperience $experience): JsonResponse
    {
        if ($experience->employee_id !== $employee->id) {
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

    public function destroy(Employee $employee, EmployeeExperience $experience): JsonResponse
    {
        if ($experience->employee_id !== $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $experience->delete();
        return response()->json(['message' => 'Experience removed']);
    }
}