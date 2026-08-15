<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::disableForeignKeyConstraints();

        // Depends on outlets.outlet_id
        Schema::dropIfExists('stock_transfers');

        // Outlet POS domain tables
        Schema::dropIfExists('outlet_sale_items');
        Schema::dropIfExists('outlet_sales');
        Schema::dropIfExists('outlet_cash_drawer_sessions');
        Schema::dropIfExists('outlet_cash_drawers');
        Schema::dropIfExists('outlet_loyalty_customers');
        Schema::dropIfExists('outlets');

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // Irreversible cleanup migration; outlet module tables are intentionally removed.
    }
};
