<?php

namespace App\Http\Controllers;

use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\RawMaterial;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class InventoryController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = InventoryItem::with('supplier');

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
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:100|unique:inventory_items,code',
            'description' => 'nullable|string',
            'type' => 'required|in:raw_material,finished_good',
            'category' => 'nullable|string|max:100',
            'unit' => 'required|string|max:50',
            'current_stock' => 'required|numeric|min:0',
            'minimum_stock' => 'required|numeric|min:0',
            'maximum_stock' => 'nullable|numeric|min:0',
            'unit_price' => 'required|numeric|min:0',
            'supplier_name' => 'nullable|string|max:255',
            'supplier_id' => 'nullable|exists:suppliers,id',
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
    public function show(string $id): JsonResponse
    {
        try {
            $item = InventoryItem::with('supplier')->findOrFail($id);

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
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:100|unique:inventory_items,code,' . $id,
            'description' => 'nullable|string',
            'type' => 'required|in:raw_material,finished_good',
            'category' => 'nullable|string|max:100',
            'unit' => 'required|string|max:50',
            'current_stock' => 'required|numeric|min:0',
            'minimum_stock' => 'required|numeric|min:0',
            'maximum_stock' => 'nullable|numeric|min:0',
            'unit_price' => 'required|numeric|min:0',
            'supplier_name' => 'nullable|string|max:255',
            'supplier_id' => 'nullable|exists:suppliers,id',
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
            $item = InventoryItem::findOrFail($id);
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
    public function destroy(string $id): JsonResponse
    {
        try {
            $item = InventoryItem::findOrFail($id);

            RawMaterial::where('inventory_item_id', $item->id)->delete();

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

    private function syncProductionReferences(InventoryItem $item, ?string $originalCode = null): void
    {
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
}
