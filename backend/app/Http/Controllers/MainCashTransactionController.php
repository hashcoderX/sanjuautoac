<?php

namespace App\Http\Controllers;

use App\Models\MainCashTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class MainCashTransactionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = MainCashTransaction::query();

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

    public function destroy(string $id): JsonResponse
    {
        $transaction = MainCashTransaction::find($id);

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
