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
        if (Schema::hasColumn('candidate_documents', 'branch_id')) {
            Schema::table('candidate_documents', function (Blueprint $table) {
                // Check if foreign key exists before dropping
                $foreignKeys = \DB::select("SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'candidate_documents' AND COLUMN_NAME = 'branch_id' AND REFERENCED_TABLE_NAME IS NOT NULL");
                if (count($foreignKeys) > 0) {
                    $table->dropForeign(['branch_id']);
                }
                $table->dropColumn('branch_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('candidate_documents', function (Blueprint $table) {
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->foreign('branch_id')->references('id')->on('companies');
        });
    }
};
