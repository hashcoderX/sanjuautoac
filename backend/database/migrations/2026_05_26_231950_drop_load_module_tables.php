<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::disableForeignKeyConstraints();

        Schema::dropIfExists('load_expenses');
        Schema::dropIfExists('load_items');
        Schema::dropIfExists('loads');
        Schema::dropIfExists('routes');
        Schema::dropIfExists('vehicles');

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // Irreversible cleanup migration; load module tables are intentionally removed.
    }
};
