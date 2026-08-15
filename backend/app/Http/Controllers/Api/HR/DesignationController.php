<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Designation;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DesignationController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->input('tenant_id');
        $branchId = $request->input('branch_id');

        $query = Designation::query();

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        $designations = $query->paginate(15);

        return response()->json($designations);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'salary_range_min' => 'nullable|numeric|min:0',
            'salary_range_max' => 'nullable|numeric|min:0',
            'is_active' => 'boolean',
        ]);

        // Set default values for required fields
        $designationData = [
            'tenant_id' => 1, // Default tenant
            'branch_id' => 1, // Default branch
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'salary_range_min' => $validated['salary_range_min'] ?? null,
            'salary_range_max' => $validated['salary_range_max'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
        ];

        $designation = Designation::create($designationData);

        return response()->json($designation, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Designation $designation): JsonResponse
    {
        return response()->json($designation);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Designation $designation): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'salary_range_min' => 'nullable|numeric|min:0',
            'salary_range_max' => 'nullable|numeric|min:0',
            'is_active' => 'boolean',
        ]);

        $designation->update($validated);

        return response()->json($designation);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Designation $designation): JsonResponse
    {
        $designation->delete();

        return response()->json(['message' => 'Designation deleted successfully']);
    }
}
