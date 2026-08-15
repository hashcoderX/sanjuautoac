<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::disableForeignKeyConstraints();

        Schema::dropIfExists('packaging_batches');
        Schema::dropIfExists('qc_inspections');
        Schema::dropIfExists('production_orders');
        Schema::dropIfExists('production_plans');
        Schema::dropIfExists('bom_items');
        Schema::dropIfExists('bom_headers');
        Schema::dropIfExists('raw_materials');
        Schema::dropIfExists('products');

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // Irreversible cleanup migration; production module tables are intentionally removed.
    }
};
