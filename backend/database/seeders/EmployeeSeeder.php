<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\Employee;

class EmployeeSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        Employee::create([
            'tenant_id' => 1,
            'branch_id' => 1,
            'employee_code' => 'EMP001',
            'first_name' => 'John',
            'last_name' => 'Doe',
            'email' => 'john.doe@company.com',
            'mobile' => '+94123456789',
            'nic_passport' => '123456789V',
            'address' => '123 Main Street, Colombo',
            'date_of_birth' => '1985-05-15',
            'gender' => 'male',
            'department_id' => 1,
            'designation_id' => 1,
            'join_date' => '2023-01-15',
            'basic_salary' => 45000.00,
            'employee_type' => 'full_time',
            'status' => 'active',
        ]);

        Employee::create([
            'tenant_id' => 1,
            'branch_id' => 1,
            'employee_code' => 'EMP002',
            'first_name' => 'Jane',
            'last_name' => 'Smith',
            'email' => 'jane.smith@company.com',
            'mobile' => '+94123456791',
            'nic_passport' => '987654321V',
            'address' => '456 Oak Avenue, Kandy',
            'date_of_birth' => '1988-08-20',
            'gender' => 'female',
            'department_id' => 1,
            'designation_id' => 1,
            'join_date' => '2023-02-20',
            'basic_salary' => 42000.00,
            'employee_type' => 'full_time',
            'status' => 'active',
        ]);

        Employee::create([
            'tenant_id' => 1,
            'branch_id' => 1,
            'employee_code' => 'EMP003',
            'first_name' => 'Mike',
            'last_name' => 'Johnson',
            'email' => 'mike.johnson@company.com',
            'mobile' => '+94123456793',
            'nic_passport' => '456789123V',
            'address' => '789 Pine Road, Galle',
            'date_of_birth' => '1982-12-10',
            'gender' => 'male',
            'department_id' => 1,
            'designation_id' => 1,
            'join_date' => '2023-03-10',
            'basic_salary' => 48000.00,
            'employee_type' => 'full_time',
            'status' => 'active',
        ]);
    }
}
