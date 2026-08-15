<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('distribution_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('distribution_payments', 'cheque_date')) {
                $table->date('cheque_date')->nullable()->after('payment_date');
            }
        });
    }

    public function down(): void
    {
        Schema::table('distribution_payments', function (Blueprint $table) {
            if (Schema::hasColumn('distribution_payments', 'cheque_date')) {
                $table->dropColumn('cheque_date');
            }
        });
    }
};
