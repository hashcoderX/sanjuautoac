<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_invoices', function (Blueprint $table) {
            $table->id();
            $table->enum('document_type', ['quotation', 'invoice']);
            $table->string('document_number')->unique();
            $table->date('document_date');
            $table->string('status')->default('draft');
            $table->string('customer_name');
            $table->string('customer_phone', 30);
            $table->string('customer_email')->nullable();
            $table->string('vehicle_no')->nullable();
            $table->string('brand')->nullable();
            $table->string('model')->nullable();
            $table->string('chassis_no')->nullable();
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('discount_amount', 12, 2)->default(0);
            $table->decimal('tax_amount', 12, 2)->default(0);
            $table->decimal('total_amount', 12, 2)->default(0);
            $table->foreignId('service_customer_id')->nullable()->constrained('service_customers')->nullOnDelete();
            $table->enum('payment_timing', ['credit', 'pay_now'])->nullable();
            $table->enum('payment_status', ['unpaid', 'partial', 'paid'])->nullable();
            $table->string('payment_type')->nullable();
            $table->string('payment_reference')->nullable();
            $table->decimal('paid_amount', 12, 2)->default(0);
            $table->decimal('balance_amount', 12, 2)->default(0);
            $table->dateTime('paid_at')->nullable();
            $table->text('notes')->nullable();
            $table->date('valid_until')->nullable();
            $table->date('due_date')->nullable();
            $table->foreignId('source_document_id')->nullable()->constrained('service_invoices')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['document_type', 'document_date']);
            $table->index('customer_phone');
        });

        Schema::create('service_invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_invoice_id')->constrained('service_invoices')->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->nullOnDelete();
            $table->string('description');
            $table->decimal('quantity', 12, 2)->default(1);
            $table->decimal('unit_price', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2)->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_invoice_items');
        Schema::dropIfExists('service_invoices');
    }
};
