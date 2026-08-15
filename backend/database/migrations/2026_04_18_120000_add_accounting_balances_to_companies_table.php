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
        Schema::table('companies', function (Blueprint $table) {
            $table->decimal('current_cash_balance', 15, 2)->default(0)->after('logo_path');
            $table->decimal('current_bank_balance', 15, 2)->default(0)->after('current_cash_balance');
            $table->decimal('current_cheque_balance', 15, 2)->default(0)->after('current_bank_balance');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn([
                'current_cash_balance',
                'current_bank_balance',
                'current_cheque_balance',
            ]);
        });
    }
};
