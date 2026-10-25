<?php

namespace App\Http\Controllers;

use App\Models\MainCashTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class MainCashTransactionController extends Controller
{
    private function tenantContext(Request $request): array
    {
        $user = $request->user();
        $tenantId = (int) $request->input(
            'tenant_id',
            $request->attributes->get('tenant_id')
                ?? $user?->employee?->tenant_id
                ?? $user?->branch_id
                ?? 0
        );
        $branchId = (int) $request->input(
            'branch_id',
            $request->attributes->get('branch_id')
                ?? $user?->employee?->branch_id
                ?? $user?->branch_id
                ?? 0
        );

        return [$tenantId, $branchId];
    }

    public function index(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);
        $query = MainCashTransaction::query();

        if ($tenantId > 0) {
            $query->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('search')) {
            $term = $request->input('search');
            $query->where(function ($q) use ($term) {
                $q->where('reference', 'like', "%{$term}%")
                    ->orWhere('note', 'like', "%{$term}%");
            });
        }

        $transactions = $query
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 100));

        return response()->json([
            'success' => true,
            'data' => $transactions,
            'message' => 'Main cash transactions retrieved successfully',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);
        if ($tenantId <= 0 || $branchId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Tenant context is missing.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'date' => 'required|date',
            'type' => 'required|in:in,out',
            'amount' => 'required|numeric|gt:0',
            'reference' => 'nullable|string|max:100',
            'note' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        $transaction = MainCashTransaction::create([
            'tenant_id' => $tenantId,
            'branch_id' => $branchId,
            'date' => $payload['date'],
            'type' => $payload['type'],
            'amount' => $payload['amount'],
            'reference' => $payload['reference'] ?? null,
            'note' => $payload['note'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'data' => $transaction,
            'message' => 'Main cash transaction recorded successfully',
        ], 201);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);

        $query = MainCashTransaction::query();
        if ($tenantId > 0) {
            $query->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        $transaction = $query->find($id);

        if (!$transaction) {
            return response()->json([
                'success' => false,
                'message' => 'Main cash transaction not found',
            ], 404);
        }

        $transaction->delete();

        return response()->json([
            'success' => true,
            'message' => 'Main cash transaction deleted successfully',
        ]);
    }
}
