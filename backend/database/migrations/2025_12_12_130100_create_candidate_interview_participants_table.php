<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('candidate_interview_participants')) {
            Schema::create('candidate_interview_participants', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('candidate_interview_id');
                $table->unsignedBigInteger('employee_id');
                $table->timestamps();

                $table->unique(['candidate_interview_id', 'employee_id'], 'cip_interview_employee_unique');
                $table->foreign('candidate_interview_id', 'cip_interview_fk')->references('id')->on('candidate_interviews')->onDelete('cascade');
                $table->foreign('employee_id', 'cip_employee_fk')->references('id')->on('employees')->onDelete('cascade');
            });
        } else {
            Schema::table('candidate_interview_participants', function (Blueprint $table) {
                // Ensure constraints exist with shorter names
                $table->unique(['candidate_interview_id', 'employee_id'], 'cip_interview_employee_unique');
                $table->foreign('candidate_interview_id', 'cip_interview_fk')->references('id')->on('candidate_interviews')->onDelete('cascade');
                $table->foreign('employee_id', 'cip_employee_fk')->references('id')->on('employees')->onDelete('cascade');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_interview_participants');
    }
};
