<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('distribution_customers', function (Blueprint $table) {
            $table->decimal('outstanding', 12, 2)->default(0)->after('address');
        });
    }

    public function down(): void
    {
        Schema::table('distribution_customers', function (Blueprint $table) {
            $table->dropColumn('outstanding');
        });
    }
};
