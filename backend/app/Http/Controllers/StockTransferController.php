<?php

namespace App\Http\Controllers;

use App\Models\InventoryItem;
use App\Models\StockTransfer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class StockTransferController extends Controller
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
        $perPage = $request->get('per_page', 15);

        $transfersQuery = StockTransfer::with([
            'inventoryItem:id,name,code,unit',
            'outlet:id,name,code',
            'transferredByUser:id,name,email',
        ]);

        if ($tenantId > 0) {
            $transfersQuery->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $transfersQuery->where('branch_id', $branchId);
        }

        $transfers = $transfersQuery->orderByDesc('transferred_at')->paginate($perPage);

        $reportQuery = StockTransfer::query()
            ->selectRaw('COUNT(*) as total_lines')
            ->selectRaw('COUNT(DISTINCT transfer_reference) as total_invoices')
            ->selectRaw('COUNT(DISTINCT outlet_id) as total_outlets')
            ->selectRaw('COUNT(DISTINCT inventory_item_id) as total_items')
            ->selectRaw('COALESCE(SUM(quantity), 0) as total_quantity')
            ->selectRaw('MAX(transferred_at) as last_transfer_at');

        if ($tenantId > 0) {
            $reportQuery->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $reportQuery->where('branch_id', $branchId);
        }

        $report = $reportQuery->first();

        return response()->json([
            'success' => true,
            'data' => $transfers,
            'report' => $report,
            'message' => 'Stock transfers retrieved successfully',
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

        $hasMultipleItems = $request->has('items') && is_array($request->items);

        $validator = Validator::make($request->all(), $hasMultipleItems ? [
            'outlet_id' => 'required|exists:outlets,id',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.inventory_item_id' => 'required|exists:inventory_items,id',
            'items.*.quantity' => 'required|numeric|gt:0',
        ] : [
            'inventory_item_id' => 'required|exists:inventory_items,id',
            'outlet_id' => 'required|exists:outlets,id',
            'quantity' => 'required|numeric|gt:0',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $createdTransfers = DB::transaction(function () use ($request, $hasMultipleItems, $tenantId, $branchId) {
                $transferReference = 'TRF' . now()->format('YmdHis') . strtoupper(substr(md5((string) microtime(true)), 0, 4));
                $lines = $hasMultipleItems
                    ? $request->items
                    : [[
                        'inventory_item_id' => $request->inventory_item_id,
                        'quantity' => $request->quantity,
                    ]];

                $result = [];

                foreach ($lines as $index => $line) {
                    $item = InventoryItem::where('id', $line['inventory_item_id'])
                        ->where('tenant_id', $tenantId)
                        ->where('branch_id', $branchId)
                        ->lockForUpdate()
                        ->firstOrFail();
                    $quantity = (float) $line['quantity'];
                    $currentStock = (float) $item->current_stock;

                    if ($currentStock < $quantity) {
                        throw ValidationException::withMessages([
                            "items.{$index}.quantity" => ["Insufficient stock for {$item->name}"],
                        ]);
                    }

                    $item->current_stock = $currentStock - $quantity;
                    $item->save();

                    $result[] = StockTransfer::create([
                        'tenant_id' => $tenantId,
                        'branch_id' => $branchId,
                        'transfer_reference' => $transferReference,
                        'inventory_item_id' => $item->id,
                        'outlet_id' => $request->outlet_id,
                        'quantity' => $quantity,
                        'notes' => $request->notes,
                        'transferred_by' => $request->user()?->id,
                        'transferred_at' => now(),
                    ]);
                }

                return $result;
            });

            $loadedTransfers = collect($createdTransfers)->map(function ($transfer) {
                return $transfer->load([
                    'inventoryItem:id,name,code,unit',
                    'outlet:id,name,code',
                    'transferredByUser:id,name,email',
                ]);
            })->values();

            return response()->json([
                'success' => true,
                'data' => $hasMultipleItems ? $loadedTransfers : $loadedTransfers->first(),
                'created_count' => $loadedTransfers->count(),
                'transfer_reference' => $loadedTransfers->first()?->transfer_reference,
                'message' => 'Stock transferred successfully',
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'One or more inventory items are unavailable for your tenant scope.',
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to transfer stock',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function detailsByReference(Request $request, string $reference): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);

        $linesQuery = StockTransfer::with([
            'inventoryItem:id,name,code,unit',
            'outlet:id,name,code',
            'transferredByUser:id,name,email',
        ])
            ->where('transfer_reference', $reference);

        if ($tenantId > 0) {
            $linesQuery->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $linesQuery->where('branch_id', $branchId);
        }

        $lines = $linesQuery->orderBy('id')->get();

        if ($lines->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Transfer record not found',
            ], 404);
        }

        $first = $lines->first();

        return response()->json([
            'success' => true,
            'data' => [
                'transfer_reference' => $reference,
                'transferred_at' => $first->transferred_at,
                'notes' => $first->notes,
                'outlet' => $first->outlet,
                'transferred_by_user' => $first->transferredByUser,
                'total_lines' => $lines->count(),
                'total_quantity' => (float) $lines->sum('quantity'),
                'lines' => $lines,
            ],
            'message' => 'Transfer details retrieved successfully',
        ]);
    }
}
