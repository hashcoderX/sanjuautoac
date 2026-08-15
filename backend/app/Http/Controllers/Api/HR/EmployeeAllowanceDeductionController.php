<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\EmployeeAllowanceDeduction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class EmployeeAllowanceDeductionController extends Controller
{
    /**
     * Display a listing of allowances and deductions for a specific employee.
     */
    public function index(Request $request, $employee): JsonResponse
    {
        // Get allowances and deductions for the specific employee
        $allowancesDeductions = EmployeeAllowanceDeduction::where('employee_id', $employee)
            ->where('is_active', true)
            ->orderBy('type')
            ->orderBy('name')
            ->get();

        return response()->json($allowancesDeductions);
    }

    /**
     * Store a newly created allowance or deduction.
     */
    public function store(Request $request, $employee): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
            'type' => 'required|in:allowance,deduction',
            'amount_type' => 'required|in:fixed,percentage',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $allowanceDeduction = EmployeeAllowanceDeduction::create([
            'employee_id' => $employee,
            'name' => $request->name,
            'amount' => $request->amount,
            'type' => $request->type,
            'amount_type' => $request->amount_type,
        ]);

        return response()->json($allowanceDeduction->load('employee'), 201);
    }

    /**
     * Display the specified allowance or deduction.
     */
    public function show(EmployeeAllowanceDeduction $allowanceDeduction): JsonResponse
    {
        return response()->json($allowanceDeduction->load('employee'));
    }

    /**
     * Update the specified allowance or deduction.
     */
    public function update(Request $request, EmployeeAllowanceDeduction $allowanceDeduction): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'amount' => 'sometimes|required|numeric|min:0',
            'type' => 'sometimes|required|in:allowance,deduction',
            'amount_type' => 'sometimes|required|in:fixed,percentage',
            'is_active' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $allowanceDeduction->update($request->all());

        return response()->json($allowanceDeduction->load('employee'));
    }

    /**
     * Remove the specified allowance or deduction.
     */
    public function destroy(EmployeeAllowanceDeduction $allowanceDeduction): JsonResponse
    {
        $allowanceDeduction->delete();

        return response()->json(['message' => 'Allowance/Deduction deleted successfully']);
    }
}
