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
        Schema::table('employees', function (Blueprint $table) {
            $table->string('tin')->nullable()->after('etf_employer_contribution');
            $table->boolean('tax_applicable')->default(false)->after('tin');
            $table->boolean('tax_relief_eligible')->default(false)->after('tax_applicable');
            $table->decimal('apit_tax_amount', 10, 2)->default(0)->after('tax_relief_eligible');
            $table->decimal('apit_tax_rate', 5, 2)->default(0)->after('apit_tax_amount');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'tin',
                'tax_applicable',
                'tax_relief_eligible',
                'apit_tax_amount',
                'apit_tax_rate',
            ]);
        });
    }
};
