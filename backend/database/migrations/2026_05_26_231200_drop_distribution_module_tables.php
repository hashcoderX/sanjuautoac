<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::disableForeignKeyConstraints();

        if (Schema::hasTable('cheque_registry_entries') && Schema::hasColumn('cheque_registry_entries', 'distribution_payment_id')) {
            Schema::table('cheque_registry_entries', function (Blueprint $table) {
                $table->dropConstrainedForeignId('distribution_payment_id');
            });
        }

        Schema::dropIfExists('distribution_payments');
        Schema::dropIfExists('distribution_returns');
        Schema::dropIfExists('distribution_invoice_items');
        Schema::dropIfExists('distribution_invoices');
        Schema::dropIfExists('distribution_customers');

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // Irreversible cleanup migration; distribution module tables are intentionally removed.
    }
};
