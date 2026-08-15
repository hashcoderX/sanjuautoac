<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\Permission;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        // Create permissions
        $permissions = [
            // User Management
            ['name' => 'view_users', 'description' => 'View users', 'module' => 'User Management'],
            ['name' => 'create_users', 'description' => 'Create users', 'module' => 'User Management'],
            ['name' => 'edit_users', 'description' => 'Edit users', 'module' => 'User Management'],
            ['name' => 'delete_users', 'description' => 'Delete users', 'module' => 'User Management'],

            // Employee Management
            ['name' => 'view_employees', 'description' => 'View employees', 'module' => 'Employee Management'],
            ['name' => 'create_employees', 'description' => 'Create employees', 'module' => 'Employee Management'],
            ['name' => 'edit_employees', 'description' => 'Edit employees', 'module' => 'Employee Management'],
            ['name' => 'delete_employees', 'description' => 'Delete employees', 'module' => 'Employee Management'],

            // Department Management
            ['name' => 'view_departments', 'description' => 'View departments', 'module' => 'Department Management'],
            ['name' => 'create_departments', 'description' => 'Create departments', 'module' => 'Department Management'],
            ['name' => 'edit_departments', 'description' => 'Edit departments', 'module' => 'Department Management'],
            ['name' => 'delete_departments', 'description' => 'Delete departments', 'module' => 'Department Management'],

            // Attendance Management
            ['name' => 'view_attendance', 'description' => 'View attendance records', 'module' => 'Attendance Management'],
            ['name' => 'create_attendance', 'description' => 'Create attendance records', 'module' => 'Attendance Management'],
            ['name' => 'edit_attendance', 'description' => 'Edit attendance records', 'module' => 'Attendance Management'],
            ['name' => 'delete_attendance', 'description' => 'Delete attendance records', 'module' => 'Attendance Management'],

            // Leave Management
            ['name' => 'view_leaves', 'description' => 'View leave requests', 'module' => 'Leave Management'],
            ['name' => 'create_leaves', 'description' => 'Create leave requests', 'module' => 'Leave Management'],
            ['name' => 'approve_leaves', 'description' => 'Approve leave requests', 'module' => 'Leave Management'],
            ['name' => 'reject_leaves', 'description' => 'Reject leave requests', 'module' => 'Leave Management'],

            // Payroll Management
            ['name' => 'view_payrolls', 'description' => 'View payroll records', 'module' => 'Payroll Management'],
            ['name' => 'create_payrolls', 'description' => 'Create payroll records', 'module' => 'Payroll Management'],
            ['name' => 'edit_payrolls', 'description' => 'Edit payroll records', 'module' => 'Payroll Management'],
            ['name' => 'delete_payrolls', 'description' => 'Delete payroll records', 'module' => 'Payroll Management'],

            // Candidate Management
            ['name' => 'view_candidates', 'description' => 'View candidates', 'module' => 'Candidate Management'],
            ['name' => 'create_candidates', 'description' => 'Create candidates', 'module' => 'Candidate Management'],
            ['name' => 'edit_candidates', 'description' => 'Edit candidates', 'module' => 'Candidate Management'],
            ['name' => 'delete_candidates', 'description' => 'Delete candidates', 'module' => 'Candidate Management'],

            // Accounts Management
            ['name' => 'accounts.view_main_account', 'description' => 'View main account', 'module' => 'accounts'],
            ['name' => 'accounts.manage_main_account', 'description' => 'Manage main account transactions', 'module' => 'accounts'],
            ['name' => 'accounts.view_transaction_book', 'description' => 'View transaction book', 'module' => 'accounts'],
            ['name' => 'accounts.manage_transaction_book', 'description' => 'Manage transaction book', 'module' => 'accounts'],
            ['name' => 'accounts.view_petty_cash', 'description' => 'View petty cash', 'module' => 'accounts'],
            ['name' => 'accounts.manage_petty_cash', 'description' => 'Manage petty cash', 'module' => 'accounts'],
            ['name' => 'accounts.view_delivery_cash', 'description' => 'View delivery cash', 'module' => 'accounts'],
            ['name' => 'accounts.manage_delivery_cash', 'description' => 'Manage delivery cash', 'module' => 'accounts'],
            ['name' => 'accounts.approve_outlet_funds', 'description' => 'Approve outlet fund requests', 'module' => 'accounts'],

            // Role Management
            ['name' => 'view_roles', 'description' => 'View roles', 'module' => 'Role Management'],
            ['name' => 'create_roles', 'description' => 'Create roles', 'module' => 'Role Management'],
            ['name' => 'edit_roles', 'description' => 'Edit roles', 'module' => 'Role Management'],
            ['name' => 'delete_roles', 'description' => 'Delete roles', 'module' => 'Role Management'],
            ['name' => 'assign_roles', 'description' => 'Assign roles to users', 'module' => 'Role Management'],

            // Permission Management
            ['name' => 'view_permissions', 'description' => 'View permissions', 'module' => 'Permission Management'],
            ['name' => 'create_permissions', 'description' => 'Create permissions', 'module' => 'Permission Management'],
            ['name' => 'edit_permissions', 'description' => 'Edit permissions', 'module' => 'Permission Management'],
            ['name' => 'delete_permissions', 'description' => 'Delete permissions', 'module' => 'Permission Management'],
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(
                ['name' => $permission['name']],
                $permission
            );
        }

        // Create roles
        $roles = [
            [
                'name' => 'Super Admin',
                'description' => 'Full system access with all permissions',
                'permissions' => Permission::all()->pluck('name')->toArray() // All permissions
            ],
            [
                'name' => 'HR Manager',
                'description' => 'Human Resources management with full HR access',
                'permissions' => [
                    'view_users', 'create_users', 'edit_users',
                    'view_employees', 'create_employees', 'edit_employees', 'delete_employees',
                    'view_departments', 'create_departments', 'edit_departments', 'delete_departments',
                    'view_attendance', 'create_attendance', 'edit_attendance',
                    'view_leaves', 'create_leaves', 'approve_leaves', 'reject_leaves',
                    'view_payrolls', 'create_payrolls', 'edit_payrolls',
                    'view_candidates', 'create_candidates', 'edit_candidates', 'delete_candidates',
                    'view_roles', 'assign_roles'
                ]
            ],
            [
                'name' => 'HR Officer',
                'description' => 'Human Resources officer with limited HR access',
                'permissions' => [
                    'view_users',
                    'view_employees', 'create_employees', 'edit_employees',
                    'view_departments',
                    'view_attendance', 'create_attendance', 'edit_attendance',
                    'view_leaves', 'create_leaves', 'approve_leaves',
                    'view_payrolls',
                    'view_candidates', 'create_candidates', 'edit_candidates'
                ]
            ],
            [
                'name' => 'Department Head',
                'description' => 'Department head with access to department-specific functions',
                'permissions' => [
                    'view_employees',
                    'view_attendance',
                    'view_leaves', 'approve_leaves',
                    'view_payrolls'
                ]
            ],
            [
                'name' => 'Employee',
                'description' => 'Regular employee with basic access',
                'permissions' => [
                    'view_leaves', 'create_leaves'
                ]
            ]
        ];

        foreach ($roles as $roleData) {
            $role = Role::firstOrCreate(
                ['name' => $roleData['name']],
                [
                    'name' => $roleData['name'],
                    'description' => $roleData['description']
                ]
            );

            $permissionIds = Permission::whereIn('name', $roleData['permissions'])->pluck('id');
            $role->permissions()->sync($permissionIds);
        }
    }
}