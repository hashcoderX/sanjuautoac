<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\MainCashTransaction;
use App\Models\ServiceCustomer;
use App\Models\ServiceInvoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ServiceInvoiceController extends Controller
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

        $query = ServiceInvoice::with(['serviceCustomer', 'items'])
            ->orderByDesc('created_at');

        if ($tenantId > 0) {
            $query->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        if ($request->filled('type')) {
            $query->where('document_type', $request->type);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('document_number', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('vehicle_no', 'like', "%{$search}%");
            });
        }

        $perPage = min(max((int) $request->input('per_page', 15), 1), 100);
        $paginated = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $paginated,
            'message' => 'Service invoices retrieved successfully',
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);
        $today = now()->toDateString();

        $cacheKey = "service-invoices:summary:{$tenantId}:{$branchId}:{$today}";

        $data = Cache::remember($cacheKey, 30, function () use ($tenantId, $branchId, $today) {
            $baseInvoice = ServiceInvoice::query();
            $baseCustomer = ServiceCustomer::query();

            if ($tenantId > 0) {
                $baseInvoice->where('tenant_id', $tenantId);
                $baseCustomer->where('tenant_id', $tenantId);
            }
            if ($branchId > 0) {
                $baseInvoice->where('branch_id', $branchId);
                $baseCustomer->where('branch_id', $branchId);
            }

            return [
                'invoices_today' => (clone $baseInvoice)->where('document_type', 'invoice')
                    ->whereDate('document_date', $today)
                    ->count(),
                'quotations_active' => (clone $baseInvoice)->where('document_type', 'quotation')->count(),
                'unpaid_invoices' => (clone $baseInvoice)->where('document_type', 'invoice')
                    ->whereIn('payment_status', ['unpaid', 'partial'])
                    ->count(),
                'outstanding_total' => round(
                    (float) (clone $baseCustomer)->sum('outstanding_balance'),
                    2
                ),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function latestQuotation(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);

        $request->validate([
            'customer_phone' => 'required|string|max:30',
        ]);

        $quotationQuery = ServiceInvoice::with('items')
            ->where('document_type', 'quotation')
            ->where('customer_phone', $request->customer_phone)
            ->orderByDesc('created_at');

        if ($tenantId > 0) {
            $quotationQuery->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $quotationQuery->where('branch_id', $branchId);
        }

        $quotation = $quotationQuery->first();

        return response()->json([
            'success' => true,
            'data' => $quotation,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);
        if ($tenantId <= 0 || $branchId <= 0) {
            return response()->json(['success' => false, 'message' => 'Tenant context is missing.'], 422);
        }

        $validated = $request->validate([
            'document_type' => 'required|in:quotation,invoice',
            'document_date' => 'required|date',
            'status' => 'nullable|string|max:50',
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:30',
            'customer_email' => 'nullable|email|max:255',
            'vehicle_no' => 'nullable|string|max:100',
            'brand' => 'nullable|string|max:100',
            'model' => 'nullable|string|max:100',
            'chassis_no' => 'nullable|string|max:100',
            'discount_amount' => 'nullable|numeric|min:0',
            'tax_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'valid_until' => 'nullable|date',
            'due_date' => 'nullable|date',
            'source_document_id' => [
                'nullable',
                Rule::exists('service_invoices', 'id')->where(function ($query) use ($tenantId, $branchId) {
                    return $query->where('tenant_id', $tenantId)->where('branch_id', $branchId);
                }),
            ],
            'items' => 'required|array|min:1',
            'items.*.description' => 'required|string|max:500',
            'items.*.warranty' => 'nullable|string|max:255',
            'items.*.quantity' => 'required|numeric|min:0.01',
            'items.*.unit_price' => 'required|numeric|min:0',
            'items.*.inventory_item_id' => [
                'nullable',
                'integer',
                Rule::exists('inventory_items', 'id')->where(function ($query) use ($tenantId, $branchId) {
                    return $query->where('tenant_id', $tenantId)->where('branch_id', $branchId);
                }),
            ],
            'payment_timing' => 'nullable|in:credit,pay_now',
            'payment_type' => 'nullable|string|max:120',
            'payment_reference' => 'nullable|string|max:255',
            'paid_amount' => 'nullable|numeric|min:0',
        ]);

        if ($request->input('document_type') === 'invoice') {
            $request->validate([
                'payment_timing' => 'required|in:credit,pay_now',
            ]);
        }

        $invoice = DB::transaction(function () use ($validated, $request, $tenantId, $branchId) {
            $items = $validated['items'];
            unset($validated['items']);

            $subtotal = 0;
            foreach ($items as $index => $item) {
                $qty = round((float) $item['quantity'], 2);
                $unit = round((float) $item['unit_price'], 2);
                $lineTotal = round($qty * $unit, 2);
                $items[$index]['quantity'] = $qty;
                $items[$index]['unit_price'] = $unit;
                $items[$index]['line_total'] = $lineTotal;
                $items[$index]['sort_order'] = $index;
                $items[$index]['inventory_item_id'] = $this->resolveInventoryItemId($item, $tenantId, $branchId);
                $subtotal += $lineTotal;
            }

            if ($validated['document_type'] === 'invoice') {
                $this->assertSufficientStock($items, $tenantId, $branchId);
            }

            $discount = round((float) ($validated['discount_amount'] ?? 0), 2);
            $tax = round((float) ($validated['tax_amount'] ?? 0), 2);
            $total = max(round($subtotal - $discount + $tax, 2), 0);

            $validated['subtotal'] = $subtotal;
            $validated['discount_amount'] = $discount;
            $validated['tax_amount'] = $tax;
            $validated['total_amount'] = $total;
            $validated['status'] = $validated['status'] ?? 'draft';
            $validated['tenant_id'] = $tenantId;
            $validated['branch_id'] = $branchId;
            $validated['created_by'] = $request->user()?->id;

            if ($validated['document_type'] === 'quotation') {
                $validated['due_date'] = null;
                unset(
                    $validated['payment_timing'],
                    $validated['payment_type'],
                    $validated['payment_reference'],
                    $validated['paid_amount']
                );
            } else {
                $validated['valid_until'] = null;
                $paymentMeta = $this->resolveInvoicePayment($validated, $total);
                $validated = array_merge($validated, $paymentMeta);
                $validated['service_customer_id'] = $this->syncServiceCustomer(
                    $validated,
                    (float) ($paymentMeta['balance_amount'] ?? 0),
                    $tenantId,
                    $branchId
                );
            }

            $invoice = ServiceInvoice::create($validated);

            foreach ($items as $item) {
                $invoice->items()->create([
                    'inventory_item_id' => $item['inventory_item_id'] ?? null,
                    'description' => $item['description'],
                    'warranty' => isset($item['warranty']) ? trim((string) $item['warranty']) ?: null : null,
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'line_total' => $item['line_total'],
                    'sort_order' => $item['sort_order'],
                ]);
            }

            if ($validated['document_type'] === 'invoice') {
                $this->deductStock($items, $tenantId, $branchId);
                $this->recordCashReceipt($validated, $invoice, $request);
            }

            return $invoice;
        });

        Cache::forget("service-invoices:summary:{$tenantId}:{$branchId}:" . now()->toDateString());

        $invoice->load(['items.inventoryItem', 'serviceCustomer']);

        return response()->json([
            'success' => true,
            'data' => $invoice,
            'message' => ucfirst($invoice->document_type) . ' created successfully',
        ], 201);
    }

    public function show(Request $request, ServiceInvoice $serviceInvoice): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);
        if (($tenantId > 0 && (int) $serviceInvoice->tenant_id !== $tenantId)
            || ($branchId > 0 && (int) $serviceInvoice->branch_id !== $branchId)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized service invoice access.'], 403);
        }

        $serviceInvoice->load(['items.inventoryItem', 'serviceCustomer', 'sourceDocument.items']);

        return response()->json([
            'success' => true,
            'data' => $serviceInvoice,
        ]);
    }

    private function resolveInventoryItemId(array $item, int $tenantId, int $branchId): ?int
    {
        if (!empty($item['inventory_item_id'])) {
            return (int) $item['inventory_item_id'];
        }

        $description = trim((string) ($item['description'] ?? ''));
        if ($description === '') {
            return null;
        }

        if (preg_match('/^([^\s–\-—]+)\s*[–\-—]\s*/u', $description, $matches)) {
            $inventoryItem = InventoryItem::query()
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('code', $matches[1])
                ->first();

            return $inventoryItem?->id;
        }

        return null;
    }

    private function aggregateStockQuantities(array $items): array
    {
        $aggregated = [];

        foreach ($items as $item) {
            $inventoryItemId = $item['inventory_item_id'] ?? null;
            if (!$inventoryItemId) {
                continue;
            }

            $inventoryItemId = (int) $inventoryItemId;
            $qty = (float) ($item['quantity'] ?? 0);
            if ($qty <= 0) {
                continue;
            }

            $aggregated[$inventoryItemId] = ($aggregated[$inventoryItemId] ?? 0) + $qty;
        }

        return $aggregated;
    }

    private function assertSufficientStock(array $items, int $tenantId, int $branchId): void
    {
        $aggregated = $this->aggregateStockQuantities($items);
        if ($aggregated === []) {
            return;
        }

        $errors = [];

        foreach ($aggregated as $inventoryItemId => $requiredQty) {
            $inventoryItem = InventoryItem::query()
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->lockForUpdate()
                ->find($inventoryItemId);
            if (!$inventoryItem) {
                $errors[] = "Inventory item #{$inventoryItemId} was not found in your tenant scope.";
                continue;
            }

            $available = (float) $inventoryItem->current_stock;
            if ($available < $requiredQty) {
                $errors[] = "{$inventoryItem->code} – {$inventoryItem->name}: need {$requiredQty}, only {$available} in stock.";
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages([
                'items' => $errors,
            ]);
        }
    }

    private function deductStock(array $items, int $tenantId, int $branchId): void
    {
        foreach ($this->aggregateStockQuantities($items) as $inventoryItemId => $qty) {
            InventoryItem::query()
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->whereKey($inventoryItemId)
                ->decrement('current_stock', $qty);
        }
    }

    private function resolveInvoicePayment(array $validated, float $total): array
    {
        $timing = (string) ($validated['payment_timing'] ?? 'credit');
        $paidAmount = $timing === 'credit'
            ? 0.0
            : min(max((float) ($validated['paid_amount'] ?? 0), 0), $total);
        $balanceAmount = round(max($total - $paidAmount, 0), 2);

        if ($timing === 'pay_now' && $paidAmount > 0 && empty($validated['payment_type'])) {
            throw ValidationException::withMessages([
                'payment_type' => ['Payment type is required when collecting payment.'],
            ]);
        }

        $paymentStatus = $total <= 0
            ? 'paid'
            : ($paidAmount <= 0
                ? 'unpaid'
                : ($paidAmount >= $total ? 'paid' : 'partial'));

        return [
            'payment_timing' => $timing,
            'payment_status' => $paymentStatus,
            'payment_type' => $timing === 'pay_now' && $paidAmount > 0 ? ($validated['payment_type'] ?? null) : null,
            'payment_reference' => $timing === 'pay_now' && $paidAmount > 0 ? ($validated['payment_reference'] ?? null) : null,
            'paid_amount' => round($paidAmount, 2),
            'balance_amount' => $balanceAmount,
            'paid_at' => $paidAmount > 0 ? now() : null,
        ];
    }

    private function syncServiceCustomer(array $validated, float $balanceAmount, int $tenantId, int $branchId): int
    {
        $customer = ServiceCustomer::query()->firstOrCreate(
            [
                'tenant_id' => $tenantId,
                'phone' => $validated['customer_phone'],
            ],
            [
                'branch_id' => $branchId,
                'name' => $validated['customer_name'],
                'email' => $validated['customer_email'] ?? null,
            ]
        );

        $customer->name = $validated['customer_name'];
        if (!empty($validated['customer_email'])) {
            $customer->email = $validated['customer_email'];
        }

        if ($balanceAmount > 0) {
            $customer->outstanding_balance = round((float) $customer->outstanding_balance + $balanceAmount, 2);
        }

        $customer->save();

        return (int) $customer->id;
    }

    private function recordCashReceipt(array $validated, ServiceInvoice $invoice, Request $request): void
    {
        $paidAmount = (float) ($validated['paid_amount'] ?? 0);
        if ($paidAmount <= 0 || ($validated['payment_type'] ?? '') !== 'cash') {
            return;
        }

        MainCashTransaction::create([
            'tenant_id' => (int) ($validated['tenant_id'] ?? 0),
            'branch_id' => (int) ($validated['branch_id'] ?? 0),
            'date' => $validated['document_date'] ?? now(),
            'type' => 'in',
            'amount' => $paidAmount,
            'reference' => $invoice->document_number,
            'note' => 'Service invoice payment ' . $invoice->document_number
                . ' | ' . $invoice->customer_name,
            'created_by' => $request->user()?->id,
        ]);
    }
}
