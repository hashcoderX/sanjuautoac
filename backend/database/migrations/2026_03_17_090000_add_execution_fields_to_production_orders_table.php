<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('production_orders', function (Blueprint $table) {
            $table->foreignId('production_plan_id')->nullable()->after('id')->constrained('production_plans')->nullOnDelete();
            $table->string('machine_name')->nullable()->after('multiplier');
            $table->string('workstation_name')->nullable()->after('machine_name');
            $table->string('worker_name')->nullable()->after('workstation_name');
            $table->decimal('produced_quantity', 15, 3)->default(0)->after('production_quantity');
            $table->decimal('wastage_quantity', 15, 3)->default(0)->after('produced_quantity');
            $table->json('actual_material_consumption')->nullable()->after('material_requirements');
            $table->timestamp('cancelled_at')->nullable()->after('completed_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('production_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('production_plan_id');
            $table->dropColumn([
                'machine_name',
                'workstation_name',
                'worker_name',
                'produced_quantity',
                'wastage_quantity',
                'actual_material_consumption',
                'cancelled_at',
            ]);
        });
    }
};
