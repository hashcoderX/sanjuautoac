<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\Department;

class DepartmentSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        Department::create([
            'tenant_id' => 1,
            'branch_id' => 1,
            'name' => 'Operations',
            'description' => 'Operations Department',
            'is_active' => true,
        ]);

        Department::create([
            'tenant_id' => 1,
            'branch_id' => 1,
            'name' => 'Logistics',
            'description' => 'Logistics and Transportation Department',
            'is_active' => true,
        ]);
    }
}
