<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('distribution_customers', function (Blueprint $table) {
            $table->foreignId('route_id')->nullable()->after('address')->constrained('routes')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('distribution_customers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('route_id');
        });
    }
};
