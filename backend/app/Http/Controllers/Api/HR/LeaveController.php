<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\LeaveType;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Carbon\Carbon;

class LeaveController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->input('tenant_id');
        $branchId = $request->input('branch_id');
        $employeeId = $request->input('employee_id');
        $status = $request->input('status');

        $query = Leave::with(['employee', 'approver']);

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        if ($employeeId) {
            $query->where('employee_id', $employeeId);
        }

        if ($status) {
            $query->where('status', $status);
        }

        $leaves = $query->paginate(15);

        return response()->json($leaves);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'leave_type' => 'required|string|max:50',
            'start_date' => 'required|date|after_or_equal:today',
            'end_date' => 'required|date|after_or_equal:start_date',
            'reason' => 'required|string',
        ]);

        $validated['leave_type'] = strtolower(trim((string) $validated['leave_type']));
        $this->ensureLeaveTypeExists($validated['leave_type']);

        if (!LeaveType::where('code', $validated['leave_type'])->exists()) {
            return response()->json([
                'message' => 'The selected leave type is invalid. Please choose a valid leave type.',
                'errors' => [
                    'leave_type' => ['The selected leave type is invalid.'],
                ],
            ], 422);
        }

        $employee = Employee::select(['id', 'tenant_id', 'branch_id'])->find($validated['employee_id']);
        $companyIds = Company::pluck('id')->map(fn ($id) => (int) $id)->values();

        $tenantId = $this->firstValidCompanyId($companyIds, [
            $employee?->tenant_id,
            $request->user()?->employee?->tenant_id,
            $request->user()?->branch_id,
            $companyIds->first(),
        ]);

        $branchId = $this->firstValidCompanyId($companyIds, [
            $employee?->branch_id,
            $request->user()?->branch_id,
            $request->user()?->employee?->branch_id,
            $tenantId,
            $companyIds->first(),
        ]);

        if (!$tenantId || !$branchId) {
            return response()->json([
                'message' => 'Unable to resolve tenant/branch for this leave request. Please configure company/branch details first.',
                'errors' => [
                    'company_context' => ['Missing valid tenant or branch company mapping.'],
                ],
            ], 422);
        }

        $validated['tenant_id'] = $tenantId;
        $validated['branch_id'] = $branchId;

        // Calculate days requested
        $startDate = Carbon::parse($validated['start_date']);
        $endDate = Carbon::parse($validated['end_date']);
        $validated['days_requested'] = $startDate->diffInDays($endDate) + 1;

        $leave = Leave::create($validated);

        return response()->json($leave->load(['employee', 'approver']), 201);
    }

    private function ensureLeaveTypeExists(string $code): void
    {
        $defaults = collect($this->defaultLeaveTypes());
        $matched = $defaults->firstWhere('code', $code);

        if (!$matched) {
            return;
        }

        LeaveType::firstOrCreate(
            ['code' => $matched['code']],
            [
                'name' => $matched['name'],
                'description' => $matched['description'],
                'max_days_per_year' => $matched['max_days_per_year'],
                'requires_documentation' => $matched['requires_documentation'],
                'is_active' => true,
            ]
        );
    }

    private function defaultLeaveTypes(): array
    {
        return [
            ['name' => 'Annual Leave', 'code' => 'annual', 'description' => 'Annual leave', 'max_days_per_year' => 14, 'requires_documentation' => false],
            ['name' => 'Sick Leave', 'code' => 'sick', 'description' => 'Sick leave', 'max_days_per_year' => 14, 'requires_documentation' => true],
            ['name' => 'Casual Leave', 'code' => 'casual', 'description' => 'Casual leave', 'max_days_per_year' => 7, 'requires_documentation' => false],
            ['name' => 'Maternity Leave', 'code' => 'maternity', 'description' => 'Maternity leave', 'max_days_per_year' => 84, 'requires_documentation' => true],
            ['name' => 'Paternity Leave', 'code' => 'paternity', 'description' => 'Paternity leave', 'max_days_per_year' => 7, 'requires_documentation' => false],
            ['name' => 'Unpaid Leave', 'code' => 'unpaid', 'description' => 'Unpaid leave', 'max_days_per_year' => 30, 'requires_documentation' => false],
            ['name' => 'Religious/Festival Leave', 'code' => 'religious_festival', 'description' => 'Religious / festival leave', 'max_days_per_year' => 5, 'requires_documentation' => false],
            ['name' => 'Study Leave', 'code' => 'study', 'description' => 'Study leave', 'max_days_per_year' => 10, 'requires_documentation' => true],
            ['name' => 'Compensatory Leave', 'code' => 'compensatory', 'description' => 'Compensatory leave', 'max_days_per_year' => 5, 'requires_documentation' => false],
            ['name' => 'Medical / Hospitalization Leave', 'code' => 'medical_hospitalization', 'description' => 'Medical / hospitalization leave', 'max_days_per_year' => 30, 'requires_documentation' => true],
        ];
    }

    private function firstValidCompanyId($companyIds, array $candidates): ?int
    {
        $validIds = $companyIds instanceof \Illuminate\Support\Collection
            ? $companyIds
            : collect($companyIds);

        foreach ($candidates as $candidate) {
            $id = (int) ($candidate ?? 0);
            if ($id > 0 && $validIds->contains($id)) {
                return $id;
            }
        }

        return null;
    }

    /**
     * Display the specified resource.
     */
    public function show(Leave $leave): JsonResponse
    {
        return response()->json($leave->load(['employee', 'approver']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Leave $leave): JsonResponse
    {
        // Only allow status updates for approval/rejection
        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'approver_notes' => 'nullable|string',
            'approved_by' => 'required|exists:employees,id',
        ]);

        $validated['approved_at'] = now();

        $leave->update($validated);

        return response()->json($leave->load(['employee', 'approver', 'sectionHeadApprover', 'hrApprover']));
    }

    /**
     * Section Head Approval
     */
    public function sectionHeadApprove(Request $request, Leave $leave): JsonResponse
    {
        $validated = $request->validate([
            'approved' => 'required|boolean',
            'notes' => 'nullable|string',
            'approved_by' => 'nullable|integer',
        ]);

        $requestedApproverId = isset($validated['approved_by']) ? (int) $validated['approved_by'] : null;
        $userApproverId = $request->user()?->employee_id ? (int) $request->user()->employee_id : null;
        $approverEmployeeId = null;

        if ($requestedApproverId && Employee::whereKey($requestedApproverId)->exists()) {
            $approverEmployeeId = $requestedApproverId;
        } elseif ($userApproverId && Employee::whereKey($userApproverId)->exists()) {
            $approverEmployeeId = $userApproverId;
        }

        $updateData = [
            'section_head_approved' => $validated['approved'],
            'section_head_approved_by' => $approverEmployeeId,
            'section_head_approved_at' => now(),
            'section_head_notes' => $validated['notes'] ?? null,
        ];

        if ($validated['approved']) {
            $updateData['status'] = 'section_head_approved';
        } else {
            $updateData['status'] = 'rejected';
        }

        $leave->update($updateData);

        return response()->json($leave->load(['employee', 'sectionHeadApprover']));
    }

    /**
     * HR Approval
     */
    public function hrApprove(Request $request, Leave $leave): JsonResponse
    {
        $validated = $request->validate([
            'approved' => 'required|boolean',
            'notes' => 'nullable|string',
            'approved_by' => 'nullable|integer',
        ]);

        $requestedApproverId = isset($validated['approved_by']) ? (int) $validated['approved_by'] : null;
        $userApproverId = $request->user()?->employee_id ? (int) $request->user()->employee_id : null;
        $approverEmployeeId = null;

        if ($requestedApproverId && Employee::whereKey($requestedApproverId)->exists()) {
            $approverEmployeeId = $requestedApproverId;
        } elseif ($userApproverId && Employee::whereKey($userApproverId)->exists()) {
            $approverEmployeeId = $userApproverId;
        }

        $updateData = [
            'hr_approved' => $validated['approved'],
            'hr_approved_by' => $approverEmployeeId,
            'hr_approved_at' => now(),
            'hr_notes' => $validated['notes'] ?? null,
        ];

        if ($validated['approved']) {
            $updateData['status'] = 'approved';
            $updateData['approved_by'] = $approverEmployeeId;
            $updateData['approved_at'] = now();
            $updateData['approver_notes'] = $validated['notes'] ?? null;
        } else {
            $updateData['status'] = 'rejected';
        }

        $leave->update($updateData);

        return response()->json($leave->load(['employee', 'hrApprover']));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Leave $leave): JsonResponse
    {
        $leave->delete();

        return response()->json(['message' => 'Leave request deleted successfully']);
    }

    /**
     * Get leave balance for an employee
     */
    public function balance(Request $request): JsonResponse
    {
        $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'year' => 'nullable|integer|min:2020|max:' . (date('Y') + 1),
        ]);

        $employeeId = $request->employee_id;
        $year = $request->year ?? date('Y');

        // This is a simplified calculation - in real app, you'd have leave policies
        $annualLeave = 25; // days per year
        $casualLeave = 10; // days per year
        $medicalLeave = 15; // days per year

        $usedAnnual = Leave::where('employee_id', $employeeId)
            ->where('leave_type', 'annual')
            ->where('status', 'approved')
            ->whereYear('start_date', $year)
            ->sum('days_requested');

        $usedCasual = Leave::where('employee_id', $employeeId)
            ->where('leave_type', 'casual')
            ->where('status', 'approved')
            ->whereYear('start_date', $year)
            ->sum('days_requested');

        $usedMedical = Leave::where('employee_id', $employeeId)
            ->where('leave_type', 'medical')
            ->where('status', 'approved')
            ->whereYear('start_date', $year)
            ->sum('days_requested');

        return response()->json([
            'employee_id' => $employeeId,
            'year' => $year,
            'annual' => [
                'total' => $annualLeave,
                'used' => $usedAnnual,
                'remaining' => $annualLeave - $usedAnnual,
            ],
            'casual' => [
                'total' => $casualLeave,
                'used' => $usedCasual,
                'remaining' => $casualLeave - $usedCasual,
            ],
            'medical' => [
                'total' => $medicalLeave,
                'used' => $usedMedical,
                'remaining' => $medicalLeave - $usedMedical,
            ],
        ]);
    }
}
