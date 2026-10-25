<?php

namespace App\Http\Controllers;

use App\Models\GoodsReceivedNote;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class SupplierController extends Controller
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

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);

        $query = Supplier::query();

        if ($tenantId > 0) {
            $query->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        // Search functionality
        if ($request->has('search') && !empty($request->search)) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('company', 'like', "%{$search}%")
                  ->orWhere('contact_person', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        // Status filter
        if ($request->has('status') && !empty($request->status)) {
            $query->where('status', $request->status);
        }

        // Pagination
        $perPage = $request->get('per_page', 15);
        $suppliers = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $suppliers,
            'message' => 'Suppliers retrieved successfully'
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
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
            'name' => 'required|string|max:255',
            'contact_person' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'company' => 'nullable|string|max:255',
            'status' => 'nullable|in:active,inactive',
            'outstanding_balance' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $supplier = Supplier::create([
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'name' => $request->name,
                'contact_person' => $request->contact_person,
                'email' => $request->email,
                'phone' => $request->phone,
                'address' => $request->address,
                'company' => $request->company,
                'status' => $request->status ?? 'active',
                'outstanding_balance' => $request->outstanding_balance ?? 0,
            ]);

            return response()->json([
                'success' => true,
                'data' => $supplier,
                'message' => 'Supplier created successfully'
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create supplier',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        try {
            [$tenantId, $branchId] = $this->tenantContext($request);
            $supplierQuery = Supplier::query();
            if ($tenantId > 0) {
                $supplierQuery->where('tenant_id', $tenantId);
            }
            if ($branchId > 0) {
                $supplierQuery->where('branch_id', $branchId);
            }

            $supplier = $supplierQuery->findOrFail($id);

            $purchaseHistory = PurchaseOrder::query()
                ->where('supplier_id', $supplier->id)
                ->orderByDesc('order_date')
                ->orderByDesc('id')
                ->get([
                    'id',
                    'order_number',
                    'order_date',
                    'expected_delivery_date',
                    'status',
                    'total_amount',
                    'notes',
                    'created_at',
                ]);

            $paymentHistory = GoodsReceivedNote::query()
                ->whereHas('purchaseOrder', function ($query) use ($supplier) {
                    $query->where('supplier_id', $supplier->id);
                })
                ->with(['purchaseOrder:id,order_number'])
                ->where('paid_amount', '>', 0)
                ->orderByDesc('paid_at')
                ->orderByDesc('id')
                ->get([
                    'id',
                    'grn_number',
                    'purchase_order_id',
                    'received_date',
                    'payment_status',
                    'payment_timing',
                    'payment_type',
                    'payment_reference',
                    'paid_amount',
                    'paid_at',
                    'payment_note',
                    'net_amount',
                ])
                ->map(function (GoodsReceivedNote $grn) {
                    $netAmount = (float) ($grn->net_amount ?? 0);
                    $paidAmount = (float) ($grn->paid_amount ?? 0);

                    return [
                        'id' => $grn->id,
                        'grn_number' => $grn->grn_number,
                        'order_number' => $grn->purchaseOrder?->order_number,
                        'received_date' => $grn->received_date,
                        'payment_status' => $grn->payment_status,
                        'payment_timing' => $grn->payment_timing,
                        'payment_type' => $grn->payment_type,
                        'payment_reference' => $grn->payment_reference,
                        'paid_amount' => $paidAmount,
                        'paid_at' => $grn->paid_at,
                        'payment_note' => $grn->payment_note,
                        'net_amount' => $netAmount,
                        'balance_due' => max(0, round($netAmount - $paidAmount, 2)),
                    ];
                })
                ->values();

            $purchaseTotal = round((float) $purchaseHistory->sum('total_amount'), 2);
            $paymentTotal = round((float) $paymentHistory->sum('paid_amount'), 2);

            return response()->json([
                'success' => true,
                'data' => [
                    ...$supplier->toArray(),
                    'purchase_summary' => [
                        'total_orders' => $purchaseHistory->count(),
                        'total_order_amount' => $purchaseTotal,
                    ],
                    'payment_summary' => [
                        'total_payments' => $paymentHistory->count(),
                        'total_paid_amount' => $paymentTotal,
                    ],
                    'purchase_history' => $purchaseHistory,
                    'payment_history' => $paymentHistory,
                ],
                'message' => 'Supplier retrieved successfully'
            ]);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Supplier not found'
            ], 404);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'contact_person' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'company' => 'nullable|string|max:255',
            'status' => 'nullable|in:active,inactive',
            'outstanding_balance' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $supplierQuery = Supplier::query();
            if ($tenantId > 0) {
                $supplierQuery->where('tenant_id', $tenantId);
            }
            if ($branchId > 0) {
                $supplierQuery->where('branch_id', $branchId);
            }

            $supplier = $supplierQuery->findOrFail($id);

            $supplier->update([
                'name' => $request->name,
                'contact_person' => $request->contact_person,
                'email' => $request->email,
                'phone' => $request->phone,
                'address' => $request->address,
                'company' => $request->company,
                'status' => $request->status ?? $supplier->status,
                'outstanding_balance' => $request->outstanding_balance ?? $supplier->outstanding_balance,
            ]);

            return response()->json([
                'success' => true,
                'data' => $supplier,
                'message' => 'Supplier updated successfully'
            ]);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Supplier not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update supplier',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        try {
            [$tenantId, $branchId] = $this->tenantContext($request);

            $supplierQuery = Supplier::query();
            if ($tenantId > 0) {
                $supplierQuery->where('tenant_id', $tenantId);
            }
            if ($branchId > 0) {
                $supplierQuery->where('branch_id', $branchId);
            }

            $supplier = $supplierQuery->findOrFail($id);
            $supplier->delete();

            return response()->json([
                'success' => true,
                'message' => 'Supplier deleted successfully'
            ]);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Supplier not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete supplier',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
