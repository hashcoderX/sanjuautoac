<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\LeaveType;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class LeaveTypeController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = LeaveType::query()->orderBy('name');

        if ($request->filled('is_active')) {
            $isActiveRaw = filter_var($request->query('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            $query->where('is_active', $isActiveRaw ?? $request->boolean('is_active'));
        }

        $perPageRaw = $request->query('per_page', 15);
        if (is_string($perPageRaw) && strtolower($perPageRaw) === 'all') {
            return response()->json($query->get());
        }

        $perPage = max(1, min((int) $perPageRaw, 1000));
        return response()->json($query->paginate($perPage));
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:50|unique:leave_types,code',
            'description' => 'nullable|string',
            'max_days_per_year' => 'required|integer|min:0',
            'requires_documentation' => 'boolean',
            'is_active' => 'boolean',
        ]);

        $leaveType = LeaveType::create($validated);
        return response()->json($leaveType, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(LeaveType $leaveType): JsonResponse
    {
        return response()->json($leaveType);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, LeaveType $leaveType): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:50|unique:leave_types,code,' . $leaveType->id,
            'description' => 'nullable|string',
            'max_days_per_year' => 'required|integer|min:0',
            'requires_documentation' => 'boolean',
            'is_active' => 'boolean',
        ]);

        $leaveType->update($validated);
        return response()->json($leaveType);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(LeaveType $leaveType): JsonResponse
    {
        $leaveType->delete();
        return response()->json(['message' => 'Leave type deleted successfully']);
    }
}
