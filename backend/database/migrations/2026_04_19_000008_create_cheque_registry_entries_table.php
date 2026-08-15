<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('cheque_registry_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->foreignId('company_cheque_account_id')->nullable()->constrained('company_cheque_accounts')->nullOnDelete();
            $table->foreignId('distribution_payment_id')->nullable()->constrained('distribution_payments')->nullOnDelete();
            $table->enum('direction', ['received', 'issued']);
            $table->enum('lifecycle_status', ['registered', 'deposited', 'cleared', 'bounced', 'issued'])->default('registered');
            $table->enum('source_module', ['manual', 'distribution', 'supplier_payment'])->default('manual');
            $table->string('cheque_no', 100);
            $table->date('cheque_date')->nullable();
            $table->date('deposit_date')->nullable();
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('bank_name')->nullable();
            $table->string('account_no', 100)->nullable();
            $table->string('counterparty_name')->nullable();
            $table->string('reference_no', 100)->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['direction', 'lifecycle_status']);
            $table->index(['source_module']);
            $table->index(['cheque_no']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cheque_registry_entries');
    }
};
