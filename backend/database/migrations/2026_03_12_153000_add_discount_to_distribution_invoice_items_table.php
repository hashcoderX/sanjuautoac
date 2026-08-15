<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('distribution_invoice_items', function (Blueprint $table) {
            if (!Schema::hasColumn('distribution_invoice_items', 'discount')) {
                $table->decimal('discount', 12, 2)->default(0)->after('unit_price');
            }
        });
    }

    public function down(): void
    {
        Schema::table('distribution_invoice_items', function (Blueprint $table) {
            if (Schema::hasColumn('distribution_invoice_items', 'discount')) {
                $table->dropColumn('discount');
            }
        });
    }
};
