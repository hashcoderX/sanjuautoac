<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\JobCard;
use App\Models\JobCardImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class JobCardController extends Controller
{
    private function tenantContext(Request $request): array
    {
        $tenantId = (int) $request->input('tenant_id', $request->attributes->get('tenant_id') ?? 0);
        $branchId = (int) $request->input('branch_id', $request->attributes->get('branch_id') ?? 0);

        return [$tenantId, $branchId];
    }

    public function index(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);

        $query = JobCard::with([
            'assignedEmployee:id,first_name,last_name,employee_code',
            'inspectedByEmployee:id,first_name,last_name,employee_code',
            'images:id,job_card_id,path,original_name,mime_type,size_kb',
        ]);

        if ($tenantId > 0) {
            $query->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('job_card_number', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('vehicle_no', 'like', "%{$search}%")
                    ->orWhere('chassis_no', 'like', "%{$search}%")
                    ->orWhere('brand', 'like', "%{$search}%")
                    ->orWhere('model', 'like', "%{$search}%")
                    ->orWhere('problem_description', 'like', "%{$search}%")
                    ->orWhere('inspection_review', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        } elseif ($request->boolean('pending_only', true)) {
            $query->whereIn('status', ['pending', 'in_progress', 'on_hold']);
        }

        if ($request->filled('priority')) {
            $query->where('priority', $request->priority);
        }

        $perPage = min(max((int) $request->get('per_page', 15), 1), 100);
        $records = $query->orderByDesc('created_at')->orderByDesc('id')->paginate($perPage);
        $records->getCollection()->transform(function (JobCard $jobCard) {
            $this->appendAssignedEmployees($jobCard);
            return $jobCard;
        });

        return response()->json([
            'success' => true,
            'data' => $records,
            'message' => 'Job cards retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);
        if ($tenantId <= 0 || $branchId <= 0) {
            return response()->json(['success' => false, 'message' => 'Tenant context is missing.'], 422);
        }

        $validated = $request->validate([
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:30',
            'customer_email' => 'nullable|email|max:255',
            'vehicle_no' => 'nullable|string|max:50',
            'chassis_no' => 'nullable|string|max:120',
            'brand' => 'nullable|string|max:120',
            'model' => 'nullable|string|max:120',
            'problem_description' => 'required|string',
            'accessories_received' => 'nullable|string',
            'inspection_review' => 'nullable|string',
            'inspected_by_employee_id' => 'nullable|exists:employees,id',
            'priority' => 'nullable|in:low,normal,high,urgent',
            'status' => 'nullable|in:pending,in_progress,on_hold,completed,delivered,cancelled',
            'assigned_employee_id' => 'nullable|exists:employees,id',
            'assigned_employee_ids' => 'nullable|array',
            'assigned_employee_ids.*' => 'exists:employees,id',
            'received_date' => 'required|date',
            'promised_date' => 'nullable|date|after_or_equal:received_date',
            'estimated_cost' => 'nullable|numeric|min:0',
            'advance_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'images' => 'nullable|array|max:8',
            'images.*' => 'image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $validated = $this->normalizeAssignedTechnicians($validated);
        $validated['priority'] = $validated['priority'] ?? 'normal';
        $validated['status'] = $validated['status'] ?? 'pending';
        $validated['tenant_id'] = $tenantId;
        $validated['branch_id'] = $branchId;
        $validated['created_by'] = $request->user()?->id;
        $validated = $this->applyInspectionReviewMeta($validated);

        $jobCard = JobCard::create($validated);
        $this->storeUploadedImages($request, $jobCard);
        $jobCard->load([
            'assignedEmployee:id,first_name,last_name,employee_code',
            'inspectedByEmployee:id,first_name,last_name,employee_code',
            'images:id,job_card_id,path,original_name,mime_type,size_kb',
        ]);
        $this->appendAssignedEmployees($jobCard);

        return response()->json([
            'success' => true,
            'data' => $jobCard,
            'message' => 'Job card created successfully',
        ], 201);
    }

    public function show(JobCard $jobCard): JsonResponse
    {
        $jobCard->load([
            'assignedEmployee:id,first_name,last_name,employee_code',
            'inspectedByEmployee:id,first_name,last_name,employee_code',
            'creator:id,name,email',
            'images:id,job_card_id,path,original_name,mime_type,size_kb',
        ]);
        $this->appendAssignedEmployees($jobCard);

        return response()->json([
            'success' => true,
            'data' => $jobCard,
            'message' => 'Job card retrieved successfully',
        ]);
    }

    public function update(Request $request, JobCard $jobCard): JsonResponse
    {
        $validated = $request->validate([
            'customer_name' => 'sometimes|required|string|max:255',
            'customer_phone' => 'sometimes|required|string|max:30',
            'customer_email' => 'nullable|email|max:255',
            'vehicle_no' => 'nullable|string|max:50',
            'chassis_no' => 'nullable|string|max:120',
            'brand' => 'nullable|string|max:120',
            'model' => 'nullable|string|max:120',
            'problem_description' => 'sometimes|required|string',
            'accessories_received' => 'nullable|string',
            'inspection_review' => 'nullable|string',
            'inspected_by_employee_id' => 'nullable|exists:employees,id',
            'priority' => 'nullable|in:low,normal,high,urgent',
            'status' => 'nullable|in:pending,in_progress,on_hold,completed,delivered,cancelled',
            'assigned_employee_id' => 'nullable|exists:employees,id',
            'assigned_employee_ids' => 'nullable|array',
            'assigned_employee_ids.*' => 'exists:employees,id',
            'received_date' => 'sometimes|required|date',
            'promised_date' => 'nullable|date',
            'estimated_cost' => 'nullable|numeric|min:0',
            'advance_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'images' => 'nullable|array|max:8',
            'images.*' => 'image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $validated = $this->normalizeAssignedTechnicians($validated);
        $validated = $this->applyInspectionReviewMeta($validated, $jobCard);
        $jobCard->update($validated);
        $this->storeUploadedImages($request, $jobCard);
        $jobCard->load([
            'assignedEmployee:id,first_name,last_name,employee_code',
            'inspectedByEmployee:id,first_name,last_name,employee_code',
            'images:id,job_card_id,path,original_name,mime_type,size_kb',
        ]);
        $this->appendAssignedEmployees($jobCard);

        return response()->json([
            'success' => true,
            'data' => $jobCard,
            'message' => 'Job card updated successfully',
        ]);
    }

    public function destroy(JobCard $jobCard): JsonResponse
    {
        $jobCard->loadMissing('images:id,job_card_id,path');
        foreach ($jobCard->images as $image) {
            if (!empty($image->path)) {
                Storage::disk('public')->delete((string) $image->path);
            }
        }

        $jobCard->delete();

        return response()->json([
            'success' => true,
            'message' => 'Job card deleted successfully',
        ]);
    }

    private function applyInspectionReviewMeta(array $validated, ?JobCard $existing = null): array
    {
        $review = array_key_exists('inspection_review', $validated)
            ? trim((string) ($validated['inspection_review'] ?? ''))
            : null;

        if (array_key_exists('inspection_review', $validated)) {
            $validated['inspection_review'] = $review !== '' ? $review : null;
        }

        if ($review !== null && $review !== '') {
            $validated['inspection_reviewed_at'] = now();
        } elseif (array_key_exists('inspection_review', $validated)) {
            $validated['inspection_reviewed_at'] = null;
            $validated['inspected_by_employee_id'] = null;
        }

        return $validated;
    }

    private function normalizeAssignedTechnicians(array $validated): array
    {
        if (!array_key_exists('assigned_employee_ids', $validated)) {
            return $validated;
        }

        $ids = collect($validated['assigned_employee_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        $validated['assigned_employee_ids'] = $ids;

        if (!array_key_exists('assigned_employee_id', $validated) || !$validated['assigned_employee_id']) {
            $validated['assigned_employee_id'] = $ids[0] ?? null;
        }

        return $validated;
    }

    private function appendAssignedEmployees(JobCard $jobCard): void
    {
        $ids = collect($jobCard->assigned_employee_ids ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        if ($ids->isEmpty() && $jobCard->assigned_employee_id) {
            $ids = collect([(int) $jobCard->assigned_employee_id]);
        }

        $assignedEmployees = $ids->isEmpty()
            ? collect()
            : Employee::query()
                ->whereIn('id', $ids->all())
                ->get(['id', 'first_name', 'last_name', 'employee_code']);

        $ordered = $ids
            ->map(fn ($id) => $assignedEmployees->firstWhere('id', $id))
            ->filter()
            ->values();

        $jobCard->setAttribute('assigned_employees', $ordered);
    }

    private function storeUploadedImages(Request $request, JobCard $jobCard): void
    {
        if (!$request->hasFile('images')) {
            return;
        }

        foreach ((array) $request->file('images') as $uploadedImage) {
            if (!$uploadedImage) {
                continue;
            }

            $path = $uploadedImage->store('job-cards/images', 'public');

            JobCardImage::create([
                'job_card_id' => $jobCard->id,
                'path' => $path,
                'original_name' => $uploadedImage->getClientOriginalName(),
                'mime_type' => $uploadedImage->getClientMimeType(),
                'size_kb' => (int) round($uploadedImage->getSize() / 1024),
            ]);
        }
    }

    public function summary(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);

        $baseQuery = JobCard::query();
        if ($tenantId > 0) {
            $baseQuery->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $baseQuery->where('branch_id', $branchId);
        }

        $pending = (clone $baseQuery)->whereIn('status', ['pending', 'in_progress', 'on_hold'])->count();
        $pendingOnly = (clone $baseQuery)->where('status', 'pending')->count();
        $inProgress = (clone $baseQuery)->where('status', 'in_progress')->count();
        $completedToday = (clone $baseQuery)->where('status', 'completed')
            ->whereDate('updated_at', today())
            ->count();

        return response()->json([
            'success' => true,
            'data' => [
                'active' => $pending,
                'pending' => $pendingOnly,
                'in_progress' => $inProgress,
                'completed_today' => $completedToday,
            ],
        ]);
    }
}
