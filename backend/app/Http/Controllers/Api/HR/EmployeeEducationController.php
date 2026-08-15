<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeEducation;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class EmployeeEducationController extends Controller
{
    public function index(Employee $employee): JsonResponse
    {
        return response()->json($employee->educations()->latest()->get());
    }

    public function store(Request $request, Employee $employee): JsonResponse
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

        $edu = $employee->educations()->create(array_merge($validated, [
            'branch_id' => $employee->branch_id,
        ]));
        return response()->json($edu, 201);
    }

    public function update(Request $request, Employee $employee, EmployeeEducation $education): JsonResponse
    {
        if ($education->employee_id !== $employee->id) {
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

    public function destroy(Employee $employee, EmployeeEducation $education): JsonResponse
    {
        if ($education->employee_id !== $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $education->delete();
        return response()->json(['message' => 'Education removed']);
    }
}