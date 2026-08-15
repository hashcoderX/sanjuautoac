<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\JobCard;
use App\Models\JobCardDocument;
use App\Models\MainCashTransaction;
use App\Models\ServiceCustomer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class JobCardDocumentController extends Controller
{
    public function index(Request $request, JobCard $jobCard): JsonResponse
    {
        $query = $jobCard->documents()->with(['items', 'serviceCustomer'])->orderByDesc('created_at');

        if ($request->filled('type')) {
            $query->where('document_type', $request->type);
        }

        return response()->json([
            'success' => true,
            'data' => $query->get(),
        ]);
    }

    public function store(Request $request, JobCard $jobCard): JsonResponse
    {
        $validated = $request->validate([
            'document_type' => 'required|in:quotation,invoice',
            'document_date' => 'required|date',
            'status' => 'nullable|string|max:50',
            'discount_amount' => 'nullable|numeric|min:0',
            'tax_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'valid_until' => 'nullable|date',
            'due_date' => 'nullable|date',
            'source_document_id' => 'nullable|exists:job_card_documents,id',
            'items' => 'required|array|min:1',
            'items.*.description' => 'required|string|max:500',
            'items.*.quantity' => 'required|numeric|min:0.01',
            'items.*.unit_price' => 'required|numeric|min:0',
            'items.*.inventory_item_id' => 'nullable|integer|exists:inventory_items,id',
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

        $document = DB::transaction(function () use ($validated, $jobCard, $request) {
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
                $items[$index]['inventory_item_id'] = $this->resolveInventoryItemId($item);
                $subtotal += $lineTotal;
            }

            if ($validated['document_type'] === 'invoice') {
                $this->assertSufficientStock($items);
            }

            $discount = round((float) ($validated['discount_amount'] ?? 0), 2);
            $tax = round((float) ($validated['tax_amount'] ?? 0), 2);
            $total = max(round($subtotal - $discount + $tax, 2), 0);

            $validated['job_card_id'] = $jobCard->id;
            $validated['subtotal'] = $subtotal;
            $validated['discount_amount'] = $discount;
            $validated['tax_amount'] = $tax;
            $validated['total_amount'] = $total;
            $validated['status'] = $validated['status'] ?? 'draft';
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
                $validated['service_customer_id'] = $this->syncServiceCustomerForInvoice(
                    $jobCard,
                    (float) ($paymentMeta['balance_amount'] ?? 0)
                );
            }

            $document = JobCardDocument::create($validated);

            foreach ($items as $item) {
                $document->items()->create([
                    'inventory_item_id' => $item['inventory_item_id'] ?? null,
                    'description' => $item['description'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'line_total' => $item['line_total'],
                    'sort_order' => $item['sort_order'],
                ]);
            }

            if ($validated['document_type'] === 'invoice') {
                $this->deductStock($items);
                $this->recordCashReceipt($validated, $document, $jobCard, $request);
            }

            return $document;
        });

        $document->load([
            'items.inventoryItem',
            'jobCard.assignedEmployee:id,first_name,last_name',
            'serviceCustomer',
        ]);

        return response()->json([
            'success' => true,
            'data' => $document,
            'message' => ucfirst($document->document_type) . ' created successfully',
        ], 201);
    }

    public function show(JobCardDocument $jobCardDocument): JsonResponse
    {
        $jobCardDocument->load([
            'items.inventoryItem',
            'jobCard.assignedEmployee:id,first_name,last_name,employee_code',
            'sourceDocument.items',
            'serviceCustomer',
        ]);

        return response()->json([
            'success' => true,
            'data' => $jobCardDocument,
        ]);
    }

    public function latestQuotation(JobCard $jobCard): JsonResponse
    {
        $quotation = $jobCard->documents()
            ->with('items')
            ->where('document_type', 'quotation')
            ->orderByDesc('created_at')
            ->first();

        return response()->json([
            'success' => true,
            'data' => $quotation,
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $item
     */
    private function resolveInventoryItemId(array $item): ?int
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
                ->where('code', $matches[1])
                ->first();

            return $inventoryItem?->id;
        }

        return null;
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
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

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function assertSufficientStock(array $items): void
    {
        $aggregated = $this->aggregateStockQuantities($items);
        if ($aggregated === []) {
            return;
        }

        $errors = [];

        foreach ($aggregated as $inventoryItemId => $requiredQty) {
            $inventoryItem = InventoryItem::query()->lockForUpdate()->find($inventoryItemId);
            if (!$inventoryItem) {
                $errors[] = "Inventory item #{$inventoryItemId} was not found.";
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

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function deductStock(array $items): void
    {
        foreach ($this->aggregateStockQuantities($items) as $inventoryItemId => $qty) {
            InventoryItem::query()
                ->whereKey($inventoryItemId)
                ->decrement('current_stock', $qty);
        }
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
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

    private function syncServiceCustomerForInvoice(JobCard $jobCard, float $balanceAmount): int
    {
        $customer = ServiceCustomer::query()->firstOrCreate(
            ['phone' => $jobCard->customer_phone],
            [
                'name' => $jobCard->customer_name,
                'email' => $jobCard->customer_email,
            ]
        );

        $customer->name = $jobCard->customer_name;
        if ($jobCard->customer_email) {
            $customer->email = $jobCard->customer_email;
        }

        if ($balanceAmount > 0) {
            $customer->outstanding_balance = round((float) $customer->outstanding_balance + $balanceAmount, 2);
        }

        $customer->save();

        return (int) $customer->id;
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function recordCashReceipt(
        array $validated,
        JobCardDocument $document,
        JobCard $jobCard,
        Request $request
    ): void {
        $paidAmount = (float) ($validated['paid_amount'] ?? 0);
        if ($paidAmount <= 0 || ($validated['payment_type'] ?? '') !== 'cash') {
            return;
        }

        MainCashTransaction::create([
            'date' => $validated['document_date'] ?? now(),
            'type' => 'in',
            'amount' => $paidAmount,
            'reference' => $document->document_number,
            'note' => 'Job card invoice payment ' . $document->document_number
                . ' | ' . $jobCard->customer_name,
            'created_by' => $request->user()?->id,
        ]);
    }
}
