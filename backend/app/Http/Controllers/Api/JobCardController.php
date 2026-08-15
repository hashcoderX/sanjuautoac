<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JobCard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class JobCardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = JobCard::with([
            'assignedEmployee:id,first_name,last_name,employee_code',
            'inspectedByEmployee:id,first_name,last_name,employee_code',
        ]);

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

        return response()->json([
            'success' => true,
            'data' => $records,
            'message' => 'Job cards retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
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
            'received_date' => 'required|date',
            'promised_date' => 'nullable|date|after_or_equal:received_date',
            'estimated_cost' => 'nullable|numeric|min:0',
            'advance_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        $validated['priority'] = $validated['priority'] ?? 'normal';
        $validated['status'] = $validated['status'] ?? 'pending';
        $validated['created_by'] = $request->user()?->id;
        $validated = $this->applyInspectionReviewMeta($validated);

        $jobCard = JobCard::create($validated);
        $jobCard->load([
            'assignedEmployee:id,first_name,last_name,employee_code',
            'inspectedByEmployee:id,first_name,last_name,employee_code',
        ]);

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
        ]);

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
            'received_date' => 'sometimes|required|date',
            'promised_date' => 'nullable|date',
            'estimated_cost' => 'nullable|numeric|min:0',
            'advance_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        $validated = $this->applyInspectionReviewMeta($validated, $jobCard);
        $jobCard->update($validated);
        $jobCard->load([
            'assignedEmployee:id,first_name,last_name,employee_code',
            'inspectedByEmployee:id,first_name,last_name,employee_code',
        ]);

        return response()->json([
            'success' => true,
            'data' => $jobCard,
            'message' => 'Job card updated successfully',
        ]);
    }

    public function destroy(JobCard $jobCard): JsonResponse
    {
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

    public function summary(Request $request): JsonResponse
    {
        $pending = JobCard::whereIn('status', ['pending', 'in_progress', 'on_hold'])->count();
        $pendingOnly = JobCard::where('status', 'pending')->count();
        $inProgress = JobCard::where('status', 'in_progress')->count();
        $completedToday = JobCard::where('status', 'completed')
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
