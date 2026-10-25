<?php

namespace App\Http\Controllers;

use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\RawMaterial;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    private ?bool $rawMaterialsTableExists = null;

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

    private const CSV_FIELD_ALIASES = [
        'name' => ['name', 'item_name', 'product_name', 'part_name', 'description'],
        'code' => ['code', 'item_code', 'sku', 'part_number', 'part_no', 'partno'],
        'description' => ['description', 'details', 'item_description'],
        'type' => ['type', 'item_type', 'product_type'],
        'category' => ['category', 'item_category', 'group'],
        'unit' => ['unit', 'uom', 'unit_of_measure', 'measure'],
        'current_stock' => ['current_stock', 'stock', 'qty', 'quantity', 'opening_stock'],
        'minimum_stock' => ['minimum_stock', 'min_stock', 'reorder_level'],
        'maximum_stock' => ['maximum_stock', 'max_stock'],
        'document_price' => ['document_price', 'doc_price', 'price', 'amount', 'dealer_price', 'mrp', 'rate'],
        'unit_price' => ['unit_price', 'cost'],
        'purchase_price' => ['purchase_price', 'cost_price', 'buy_price'],
        'sell_price' => ['sell_price', 'selling_price', 'retail_price'],
        'supplier_name' => ['supplier_name', 'supplier', 'vendor', 'vendor_name'],
        'location' => ['location', 'warehouse', 'store_location'],
        'expiry_date' => ['expiry_date', 'expiry', 'exp_date'],
        'status' => ['status'],
    ];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);
        $query = InventoryItem::with('supplier');

        if ($tenantId > 0) {
            $query->where('tenant_id', $tenantId);
        }
        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        // Filter by type (raw_material or finished_good)
        if ($request->has('type') && !empty($request->type)) {
            $query->where('type', $request->type);
        }

        // Search functionality
        if ($request->has('search') && !empty($request->search)) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%")
                  ->orWhere('category', 'like', "%{$search}%");
            });
        }

        // Status filter
        if ($request->has('status') && !empty($request->status)) {
            $query->where('status', $request->status);
        }

        // Low stock filter
        if ($request->has('low_stock') && $request->low_stock == 'true') {
            $query->whereRaw('current_stock <= minimum_stock');
        }

        // Out of stock filter
        if ($request->has('out_of_stock') && $request->out_of_stock == 'true') {
            $query->where('current_stock', '<=', 0);
        }

        // Pagination
        $perPage = $request->get('per_page', 15);
        $items = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $items,
            'message' => 'Inventory items retrieved successfully'
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
            'code' => [
                'required',
                'string',
                'max:100',
                Rule::unique('inventory_items', 'code')->where(function ($query) use ($tenantId) {
                    return $query->where('tenant_id', $tenantId);
                }),
            ],
            'description' => 'nullable|string',
            'type' => 'required|in:raw_material,finished_good',
            'category' => 'nullable|string|max:100',
            'unit' => 'required|string|max:50',
            'current_stock' => 'required|numeric|min:0',
            'minimum_stock' => 'required|numeric|min:0',
            'maximum_stock' => 'nullable|numeric|min:0',
            'unit_price' => 'required|numeric|min:0',
            'supplier_name' => 'nullable|string|max:255',
            'supplier_id' => [
                'nullable',
                Rule::exists('suppliers', 'id')->where(function ($query) use ($tenantId, $branchId) {
                    return $query->where('tenant_id', $tenantId)->where('branch_id', $branchId);
                }),
            ],
            'location' => 'nullable|string|max:255',
            'expiry_date' => 'nullable|date|after:today',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $item = InventoryItem::create([
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'name' => $request->name,
                'code' => $request->code,
                'description' => $request->description,
                'type' => $request->type,
                'category' => $request->category,
                'unit' => $request->unit,
                'current_stock' => $request->current_stock,
                'minimum_stock' => $request->minimum_stock,
                'maximum_stock' => $request->maximum_stock,
                'unit_price' => $request->unit_price,
                'supplier_name' => $request->supplier_name,
                'supplier_id' => $request->supplier_id,
                'location' => $request->location,
                'expiry_date' => $request->expiry_date,
                'status' => $request->status ?? 'active',
                'additional_info' => $request->additional_info,
            ]);

            $this->syncProductionReferences($item);

            return response()->json([
                'success' => true,
                'data' => $item->load('supplier'),
                'message' => 'Inventory item created successfully'
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create inventory item',
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

            $itemQuery = InventoryItem::with('supplier');
            if ($tenantId > 0) {
                $itemQuery->where('tenant_id', $tenantId);
            }
            if ($branchId > 0) {
                $itemQuery->where('branch_id', $branchId);
            }

            $item = $itemQuery->findOrFail($id);

            return response()->json([
                'success' => true,
                'data' => $item,
                'message' => 'Inventory item retrieved successfully'
            ]);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory item not found'
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
            'code' => [
                'required',
                'string',
                'max:100',
                Rule::unique('inventory_items', 'code')
                    ->ignore($id)
                    ->where(function ($query) use ($tenantId) {
                        return $query->where('tenant_id', $tenantId);
                    }),
            ],
            'description' => 'nullable|string',
            'type' => 'required|in:raw_material,finished_good',
            'category' => 'nullable|string|max:100',
            'unit' => 'required|string|max:50',
            'current_stock' => 'required|numeric|min:0',
            'minimum_stock' => 'required|numeric|min:0',
            'maximum_stock' => 'nullable|numeric|min:0',
            'unit_price' => 'required|numeric|min:0',
            'supplier_name' => 'nullable|string|max:255',
            'supplier_id' => [
                'nullable',
                Rule::exists('suppliers', 'id')->where(function ($query) use ($tenantId, $branchId) {
                    return $query->where('tenant_id', $tenantId)->where('branch_id', $branchId);
                }),
            ],
            'location' => 'nullable|string|max:255',
            'expiry_date' => 'nullable|date',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $itemQuery = InventoryItem::query();
            if ($tenantId > 0) {
                $itemQuery->where('tenant_id', $tenantId);
            }
            if ($branchId > 0) {
                $itemQuery->where('branch_id', $branchId);
            }

            $item = $itemQuery->findOrFail($id);
            $originalCode = $item->code;

            $item->update([
                'name' => $request->name,
                'code' => $request->code,
                'description' => $request->description,
                'type' => $request->type,
                'category' => $request->category,
                'unit' => $request->unit,
                'current_stock' => $request->current_stock,
                'minimum_stock' => $request->minimum_stock,
                'maximum_stock' => $request->maximum_stock,
                'unit_price' => $request->unit_price,
                'supplier_name' => $request->supplier_name,
                'supplier_id' => $request->supplier_id,
                'location' => $request->location,
                'expiry_date' => $request->expiry_date,
                'status' => $request->status ?? $item->status,
                'additional_info' => $request->additional_info,
            ]);

            $this->syncProductionReferences($item, $originalCode);

            return response()->json([
                'success' => true,
                'data' => $item->load('supplier'),
                'message' => 'Inventory item updated successfully'
            ]);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory item not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update inventory item',
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

            $itemQuery = InventoryItem::query();
            if ($tenantId > 0) {
                $itemQuery->where('tenant_id', $tenantId);
            }
            if ($branchId > 0) {
                $itemQuery->where('branch_id', $branchId);
            }

            $item = $itemQuery->findOrFail($id);

            if ($this->rawMaterialsTableExists()) {
                RawMaterial::where('inventory_item_id', $item->id)->delete();
            }

            Product::where('code', $item->code)->delete();

            $item->delete();

            return response()->json([
                'success' => true,
                'message' => 'Inventory item deleted successfully'
            ]);

        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory item not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete inventory item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function importCsv(Request $request): JsonResponse
    {
        [$tenantId, $branchId] = $this->tenantContext($request);
        if ($tenantId <= 0 || $branchId <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Tenant context is missing.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:csv,txt|max:10240',
            'default_type' => 'nullable|in:raw_material,finished_good',
            'supplier_id' => [
                'nullable',
                Rule::exists('suppliers', 'id')->where(function ($query) use ($tenantId, $branchId) {
                    return $query->where('tenant_id', $tenantId)->where('branch_id', $branchId);
                }),
            ],
            'use_discount' => 'nullable',
            'discount_mode' => 'nullable|in:none,amount,percent',
            'discount_value' => 'nullable|numeric|min:0',
            'use_profit' => 'nullable',
            'profit_mode' => 'nullable|in:none,amount,percent',
            'profit_value' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $file = $request->file('file');
        if (!$file || !$file->isValid()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid upload file.',
            ], 422);
        }

        $handle = fopen($file->getRealPath(), 'r');
        if (!$handle) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to read uploaded CSV file.',
            ], 422);
        }

        try {
            $firstRow = fgetcsv($handle);
            if (!$firstRow || count(array_filter($firstRow, fn ($value) => trim((string) $value) !== '')) === 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'CSV file is empty.',
                ], 422);
            }
            $firstRow = $this->sanitizeCsvRow($firstRow);

            $normalizedFirstRow = array_map(fn ($value) => $this->normalizeHeader($value), $firstRow);
            $fieldIndexMap = $this->resolveFieldIndexMap($normalizedFirstRow);
            $hasHeaderRow = isset($fieldIndexMap['code']) || isset($fieldIndexMap['name']) || isset($fieldIndexMap['document_price']);

            if (!$hasHeaderRow) {
                // Attachment-like format: col1=code, col2=name, col3=price
                $fieldIndexMap = [
                    'code' => 0,
                    'name' => 1,
                    'document_price' => 2,
                    'current_stock' => 3,
                ];
            }

            $defaultType = (string) ($request->input('default_type') ?: 'finished_good');
            $selectedSupplier = null;
            if ($request->filled('supplier_id')) {
                $selectedSupplier = Supplier::query()
                    ->where('tenant_id', $tenantId)
                    ->where('branch_id', $branchId)
                    ->find((int) $request->input('supplier_id'));
            }

            $discountMode = strtolower(trim((string) ($request->input('discount_mode') ?: 'none')));
            if (!in_array($discountMode, ['none', 'amount', 'percent'], true)) {
                $discountMode = 'none';
            }

            $profitMode = strtolower(trim((string) ($request->input('profit_mode') ?: 'none')));
            if (!in_array($profitMode, ['none', 'amount', 'percent'], true)) {
                $profitMode = 'none';
            }

            $importOptions = [
                'supplier_id' => $selectedSupplier?->id,
                'supplier_name' => $selectedSupplier?->name,
                'use_discount' => filter_var($request->input('use_discount', false), FILTER_VALIDATE_BOOLEAN),
                'discount_mode' => $discountMode,
                'discount_value' => max(0, (float) ($request->input('discount_value') ?? 0)),
                'use_profit' => filter_var($request->input('use_profit', false), FILTER_VALIDATE_BOOLEAN),
                'profit_mode' => $profitMode,
                'profit_value' => max(0, (float) ($request->input('profit_value') ?? 0)),
            ];

            $rowNumber = 1;
            $created = 0;
            $updated = 0;
            $skipped = 0;
            $errors = [];

            if (!$hasHeaderRow) {
                $rowNumber++;
                if (!$this->isCsvRowEmpty($firstRow)) {
                    $rawPayload = $this->extractCsvPayload($firstRow, $fieldIndexMap);
                    $normalized = $this->normalizeInventoryCsvPayload($rawPayload, $defaultType, $importOptions);
                    $normalized['tenant_id'] = $tenantId;
                    $normalized['branch_id'] = $branchId;

                    $payloadValidator = Validator::make($normalized, [
                        'name' => 'required|string|max:255',
                        'code' => 'required|string|max:100',
                        'description' => 'nullable|string',
                        'type' => 'required|in:raw_material,finished_good',
                        'category' => 'nullable|string|max:100',
                        'unit' => 'required|string|max:50',
                        'current_stock' => 'required|numeric|min:0',
                        'minimum_stock' => 'required|numeric|min:0',
                        'maximum_stock' => 'nullable|numeric|min:0',
                        'unit_price' => 'required|numeric|min:0',
                        'purchase_price' => 'nullable|numeric|min:0',
                        'sell_price' => 'nullable|numeric|min:0',
                        'supplier_name' => 'nullable|string|max:255',
                        'location' => 'nullable|string|max:255',
                        'expiry_date' => 'nullable|date',
                        'status' => 'required|in:active,inactive',
                    ]);

                    if ($payloadValidator->fails()) {
                        $errors[] = [
                            'row' => $rowNumber,
                            'message' => $payloadValidator->errors()->first(),
                        ];
                    } else {
                        try {
                            $existing = InventoryItem::where('tenant_id', $tenantId)
                                ->where('code', $normalized['code'])
                                ->first();
                            if ($existing) {
                                $originalCode = $existing->code;
                                $existing->update($normalized);
                                $this->syncProductionReferences($existing->fresh(), $originalCode);
                                $updated++;
                            } else {
                                $item = InventoryItem::create($normalized);
                                $this->syncProductionReferences($item);
                                $created++;
                            }
                        } catch (\Throwable $e) {
                            $errors[] = [
                                'row' => $rowNumber,
                                'message' => 'Row could not be imported. Please check text encoding and column values.',
                            ];
                            Log::warning('Inventory CSV row import failed', [
                                'row' => $rowNumber,
                                'code' => $normalized['code'] ?? null,
                                'error' => $this->sanitizeForJson((string) $e->getMessage()),
                            ]);
                        }
                    }
                } else {
                    $skipped++;
                }
            }

            while (($row = fgetcsv($handle)) !== false) {
                $rowNumber++;
                $row = $this->sanitizeCsvRow($row);
                if ($this->isCsvRowEmpty($row)) {
                    $skipped++;
                    continue;
                }

                $rawPayload = $this->extractCsvPayload($row, $fieldIndexMap);
                $normalized = $this->normalizeInventoryCsvPayload($rawPayload, $defaultType, $importOptions);
                $normalized['tenant_id'] = $tenantId;
                $normalized['branch_id'] = $branchId;

                $payloadValidator = Validator::make($normalized, [
                    'name' => 'required|string|max:255',
                    'code' => 'required|string|max:100',
                    'description' => 'nullable|string',
                    'type' => 'required|in:raw_material,finished_good',
                    'category' => 'nullable|string|max:100',
                    'unit' => 'required|string|max:50',
                    'current_stock' => 'required|numeric|min:0',
                    'minimum_stock' => 'required|numeric|min:0',
                    'maximum_stock' => 'nullable|numeric|min:0',
                    'unit_price' => 'required|numeric|min:0',
                    'purchase_price' => 'nullable|numeric|min:0',
                    'sell_price' => 'nullable|numeric|min:0',
                    'supplier_name' => 'nullable|string|max:255',
                    'location' => 'nullable|string|max:255',
                    'expiry_date' => 'nullable|date',
                    'status' => 'required|in:active,inactive',
                ]);

                if ($payloadValidator->fails()) {
                    $errors[] = [
                        'row' => $rowNumber,
                        'message' => $payloadValidator->errors()->first(),
                    ];
                    continue;
                }

                try {
                    $existing = InventoryItem::where('tenant_id', $tenantId)
                        ->where('code', $normalized['code'])
                        ->first();
                    if ($existing) {
                        $originalCode = $existing->code;
                        $existing->update($normalized);
                        $this->syncProductionReferences($existing->fresh(), $originalCode);
                        $updated++;
                    } else {
                        $item = InventoryItem::create($normalized);
                        $this->syncProductionReferences($item);
                        $created++;
                    }
                } catch (\Throwable $e) {
                    $errors[] = [
                        'row' => $rowNumber,
                        'message' => 'Row could not be imported. Please check text encoding and column values.',
                    ];
                    Log::warning('Inventory CSV row import failed', [
                        'row' => $rowNumber,
                        'code' => $normalized['code'] ?? null,
                        'error' => $this->sanitizeForJson((string) $e->getMessage()),
                    ]);
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Inventory CSV import completed.',
                'data' => [
                    'created' => $created,
                    'updated' => $updated,
                    'skipped' => $skipped,
                    'failed' => count($errors),
                    'pricing_rule' => $importOptions,
                    'errors' => array_slice($errors, 0, 100),
                ],
            ]);
        } catch (\Throwable $e) {
            Log::error('Inventory CSV import failed', [
                'row' => $rowNumber ?? null,
                'error' => $this->sanitizeForJson((string) $e->getMessage()),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Inventory CSV import failed. Please ensure the file is UTF-8 or standard CSV encoding.',
            ], 500);
        } finally {
            fclose($handle);
        }
    }

    private function normalizeHeader($value): string
    {
        $text = strtolower($this->sanitizeForJson((string) $value));
        $text = preg_replace('/[^a-z0-9]+/', '_', $text);
        return trim((string) $text, '_');
    }

    private function resolveFieldIndexMap(array $normalizedHeaders): array
    {
        $fieldIndexMap = [];
        foreach (self::CSV_FIELD_ALIASES as $field => $aliases) {
            foreach ($aliases as $alias) {
                $index = array_search($alias, $normalizedHeaders, true);
                if ($index !== false) {
                    $fieldIndexMap[$field] = (int) $index;
                    break;
                }
            }
        }

        return $fieldIndexMap;
    }

    private function isCsvRowEmpty(array $row): bool
    {
        foreach ($row as $cell) {
            if (trim((string) $cell) !== '') {
                return false;
            }
        }

        return true;
    }

    private function extractCsvPayload(array $row, array $fieldIndexMap): array
    {
        $payload = [];
        foreach (array_keys(self::CSV_FIELD_ALIASES) as $field) {
            if (!array_key_exists($field, $fieldIndexMap)) {
                continue;
            }

            $payload[$field] = isset($row[$fieldIndexMap[$field]])
                ? $this->sanitizeForJson((string) $row[$fieldIndexMap[$field]])
                : null;
        }

        return $payload;
    }

    private function normalizeInventoryCsvPayload(array $row, string $defaultType, array $options = []): array
    {
        $name = trim((string) ($row['name'] ?? ''));
        $code = strtoupper(trim((string) ($row['code'] ?? '')));

        $status = strtolower(trim((string) ($row['status'] ?? 'active')));
        if (!in_array($status, ['active', 'inactive'], true)) {
            $status = 'active';
        }

        $type = strtolower(trim((string) ($row['type'] ?? $defaultType)));
        if (!in_array($type, ['raw_material', 'finished_good'], true)) {
            $type = $defaultType;
        }

        $documentPrice = $this->csvToNumber($row['document_price'] ?? null);
        if ($documentPrice <= 0) {
            $documentPrice = $this->csvToNumber($row['unit_price'] ?? null);
        }
        if ($documentPrice <= 0) {
            $documentPrice = $this->csvToNumber($row['sell_price'] ?? null);
        }
        if ($documentPrice <= 0) {
            $documentPrice = $this->csvToNumber($row['purchase_price'] ?? null);
        }

        $documentPrice = max(0, $documentPrice);
        $unitPrice = $documentPrice;
        $sellPrice = $documentPrice;
        $purchasePrice = $documentPrice;

        $useDiscount = (bool) ($options['use_discount'] ?? false);
        $discountMode = strtolower(trim((string) ($options['discount_mode'] ?? 'none')));
        $discountValue = max(0, (float) ($options['discount_value'] ?? 0));
        $useProfit = (bool) ($options['use_profit'] ?? false);
        $profitMode = strtolower(trim((string) ($options['profit_mode'] ?? 'none')));
        $profitValue = max(0, (float) ($options['profit_value'] ?? 0));

        if ($useProfit && $documentPrice > 0 && $profitMode !== 'none' && $profitValue > 0) {
            $profitAmount = $profitMode === 'percent'
                ? ($documentPrice * min($profitValue, 10000) / 100)
                : $profitValue;

            $unitPrice = max(0, $documentPrice + $profitAmount);
            $sellPrice = max(0, $documentPrice + $profitAmount);
            $purchasePrice = $documentPrice;
        }

        if (
            !$useProfit
            && $useDiscount
            && $documentPrice > 0
            && $discountMode !== 'none'
            && $discountValue > 0
        ) {
            $discountAmount = $discountMode === 'percent'
                ? ($documentPrice * min($discountValue, 100) / 100)
                : min($discountValue, $documentPrice);
            $purchasePrice = max(0, $documentPrice - $discountAmount);
        }

        $forcedSupplierId = isset($options['supplier_id']) ? (int) $options['supplier_id'] : null;
        $forcedSupplierName = trim((string) ($options['supplier_name'] ?? ''));
        $rowSupplierName = trim((string) ($row['supplier_name'] ?? ''));
        $resolvedSupplierName = $forcedSupplierName !== '' ? $forcedSupplierName : ($rowSupplierName !== '' ? $rowSupplierName : null);

        return [
            'name' => $name,
            'code' => $code,
            'description' => trim((string) ($row['description'] ?? '')) ?: null,
            'type' => $type,
            'category' => trim((string) ($row['category'] ?? '')) ?: null,
            'unit' => trim((string) ($row['unit'] ?? 'pieces')) ?: 'pieces',
            'current_stock' => max(0, $this->csvToNumber($row['current_stock'] ?? null)),
            'minimum_stock' => max(0, $this->csvToNumber($row['minimum_stock'] ?? null)),
            'maximum_stock' => max(0, $this->csvToNumber($row['maximum_stock'] ?? null)),
            'unit_price' => max(0, $unitPrice),
            'purchase_price' => max(0, $purchasePrice),
            'sell_price' => max(0, $sellPrice),
            'supplier_name' => $resolvedSupplierName,
            'supplier_id' => $forcedSupplierId,
            'location' => trim((string) ($row['location'] ?? '')) ?: null,
            'expiry_date' => trim((string) ($row['expiry_date'] ?? '')) ?: null,
            'status' => $status,
            'additional_info' => [
                'import_source' => 'csv',
                'document_price' => $documentPrice,
                'discount_mode' => $discountMode,
                'discount_value' => $discountValue,
                'profit_mode' => $profitMode,
                'profit_value' => $profitValue,
                'pricing_strategy' => $useProfit ? 'profit' : ($useDiscount ? 'discount' : 'none'),
            ],
        ];
    }

    private function csvToNumber($value): float
    {
        $text = $this->sanitizeForJson((string) $value);
        if ($text === '') {
            return 0;
        }

        $normalized = str_replace([',', ' '], '', $text);
        $normalized = preg_replace('/[^0-9.\-]/', '', $normalized);
        $number = (float) $normalized;

        return is_finite($number) ? $number : 0;
    }

    private function sanitizeCsvRow(array $row): array
    {
        return array_map(fn ($cell) => $this->sanitizeForJson((string) $cell), $row);
    }

    private function sanitizeForJson(string $value): string
    {
        $text = str_replace("\0", '', $value);

        if (function_exists('mb_check_encoding') && !mb_check_encoding($text, 'UTF-8')) {
            if (function_exists('mb_convert_encoding')) {
                $converted = @mb_convert_encoding($text, 'UTF-8', 'UTF-8,Windows-1252,ISO-8859-1');
                if (is_string($converted)) {
                    $text = $converted;
                }
            } elseif (function_exists('iconv')) {
                $converted = @iconv('Windows-1252', 'UTF-8//IGNORE', $text);
                if (is_string($converted)) {
                    $text = $converted;
                }
            }
        }

        $text = str_replace("\xC2\xA0", ' ', $text);
        $clean = @preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text);

        return trim($clean ?? $text);
    }

    private function syncProductionReferences(InventoryItem $item, ?string $originalCode = null): void
    {
        if (!$this->rawMaterialsTableExists()) {
            return;
        }

        if ($item->type === 'raw_material') {
            RawMaterial::updateOrCreate(
                ['inventory_item_id' => $item->id],
                ['status' => $item->status]
            );

            $productCleanupQuery = Product::where('code', $item->code);
            if ($originalCode) {
                $productCleanupQuery->orWhere('code', $originalCode);
            }
            $productCleanupQuery->delete();

            return;
        }

        RawMaterial::where('inventory_item_id', $item->id)->delete();

        $product = null;

        if ($originalCode) {
            $product = Product::where('code', $originalCode)->first();
        }

        if (!$product) {
            $product = Product::where('code', $item->code)->first();
        }

        if ($product) {
            $product->update([
                'name' => $item->name,
                'code' => $item->code,
                'unit' => $item->unit ?: 'pcs',
                'description' => $item->description,
                'status' => $item->status ?? 'active',
            ]);

            return;
        }

        Product::create([
            'name' => $item->name,
            'code' => $item->code,
            'unit' => $item->unit ?: 'pcs',
            'standard_batch_size' => 1,
            'description' => $item->description,
            'status' => $item->status ?? 'active',
        ]);
    }

    private function rawMaterialsTableExists(): bool
    {
        if ($this->rawMaterialsTableExists === null) {
            $this->rawMaterialsTableExists = Schema::hasTable('raw_materials');
        }

        return $this->rawMaterialsTableExists;
    }
}
