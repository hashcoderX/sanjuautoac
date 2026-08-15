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
        Schema::table('leaves', function (Blueprint $table) {
            // Section Head Approval
            $table->boolean('section_head_approved')->default(false);
            $table->unsignedBigInteger('section_head_approved_by')->nullable();
            $table->timestamp('section_head_approved_at')->nullable();
            $table->text('section_head_notes')->nullable();
            
            // HR Approval
            $table->boolean('hr_approved')->default(false);
            $table->unsignedBigInteger('hr_approved_by')->nullable();
            $table->timestamp('hr_approved_at')->nullable();
            $table->text('hr_notes')->nullable();
            
            // Update status enum to include intermediate states
            $table->enum('status', ['pending', 'section_head_approved', 'approved', 'rejected'])->default('pending')->change();
            
            // Foreign keys
            $table->foreign('section_head_approved_by')->references('id')->on('employees');
            $table->foreign('hr_approved_by')->references('id')->on('employees');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('leaves', function (Blueprint $table) {
            $table->dropForeign(['section_head_approved_by']);
            $table->dropForeign(['hr_approved_by']);
            
            $table->dropColumn([
                'section_head_approved',
                'section_head_approved_by',
                'section_head_approved_at',
                'section_head_notes',
                'hr_approved',
                'hr_approved_by',
                'hr_approved_at',
                'hr_notes'
            ]);
            
            // Revert status enum
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending')->change();
        });
    }
};
