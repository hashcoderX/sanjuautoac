<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Department;
use App\Models\Designation;
use App\Models\Employee;
use App\Models\SaasJoinRequest;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class SaasJoinRequestController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'business_name' => 'required|string|max:255',
            'business_address' => 'required|string|max:1200',
            'country' => 'required|string|max:120',
            'currency' => 'required|string|max:10',
            'contact_number' => 'required|string|max:40',
            'admin_name' => 'required|string|max:255',
            'admin_email' => 'required|string|email|max:255|unique:saas_join_requests,admin_email|unique:users,email|unique:companies,email',
            'admin_password' => 'required|string|min:8|confirmed',
        ]);

        $businessSlug = Str::slug((string) $payload['business_name'], '_');
        $databaseName = $this->buildDatabaseName($businessSlug ?: 'business');
        $databaseUser = $this->buildDatabaseUser($businessSlug ?: 'business');
        $databasePassword = $this->generateStrongDatabasePassword();
        $databaseHost = env('DB_HOST', '127.0.0.1');
        $databasePort = (int) env('DB_PORT', 3306);
        $backupNamespace = 'backup_' . ($businessSlug ?: 'business') . '_' . now()->format('YmdHis');

        $databaseProvisionStatus = 'provisioned';

        try {
            $this->provisionTenantDatabase($databaseName, $databaseUser, $databasePassword);
        } catch (\Throwable $exception) {
            $databaseProvisionStatus = 'provision_pending';
        }

        $requestRecord = DB::transaction(function () use ($payload, $databaseName, $databaseUser, $databasePassword, $databaseHost, $databasePort, $backupNamespace, $databaseProvisionStatus) {
            $country = trim($payload['country']);
            $currency = strtoupper(trim($payload['currency']));

            $company = Company::create([
                'name' => $payload['business_name'],
                'email' => $payload['admin_email'],
                'address' => $payload['business_address'],
                'phone' => $payload['contact_number'],
                'country' => $country,
                'currency' => $currency,
            ]);

            $department = Department::create([
                'tenant_id' => $company->id,
                'branch_id' => $company->id,
                'name' => 'Administration',
                'description' => 'Tenant administration department',
                'is_active' => true,
            ]);

            $designation = Designation::create([
                'tenant_id' => $company->id,
                'branch_id' => $company->id,
                'name' => 'Tenant Admin',
                'description' => 'Primary tenant administrator',
                'salary_range_min' => 0,
                'salary_range_max' => 0,
                'is_active' => true,
            ]);

            $nameParts = preg_split('/\s+/', trim((string) $payload['admin_name'])) ?: [];
            $firstName = $nameParts[0] ?? 'Admin';
            $lastName = count($nameParts) > 1 ? implode(' ', array_slice($nameParts, 1)) : 'User';

            $employee = Employee::create([
                'tenant_id' => $company->id,
                'branch_id' => $company->id,
                'employee_code' => 'EMP-' . strtoupper(Str::random(8)),
                'first_name' => $firstName,
                'last_name' => $lastName,
                'email' => $payload['admin_email'],
                'mobile' => $payload['contact_number'],
                'nic_passport' => 'SAAS-' . strtoupper(Str::random(12)),
                'address' => $payload['business_address'],
                'date_of_birth' => now()->subYears(30)->toDateString(),
                'gender' => 'other',
                'department_id' => $department->id,
                'designation_id' => $designation->id,
                'join_date' => now()->toDateString(),
                'basic_salary' => 0,
                'employee_type' => 'full_time',
                'status' => 'active',
            ]);

            $user = User::create([
                'name' => $payload['admin_name'],
                'email' => $payload['admin_email'],
                'password' => $payload['admin_password'],
                'role' => 'tenant_admin',
                'employee_id' => $employee->id,
                'branch_id' => $company->id,
            ]);

            $requestRecord = SaasJoinRequest::create([
                'business_name' => $payload['business_name'],
                'business_address' => $payload['business_address'],
                'country' => $country,
                'currency' => $currency,
                'contact_number' => $payload['contact_number'],
                'admin_name' => $payload['admin_name'],
                'admin_email' => $payload['admin_email'],
                'admin_password' => Hash::make($payload['admin_password']),
                'provision_status' => $databaseProvisionStatus,
                'database_name' => $databaseName,
                'database_user' => $databaseUser,
                'database_password_encrypted' => Crypt::encryptString($databasePassword),
                'database_host' => $databaseHost,
                'database_port' => $databasePort,
                'backup_namespace' => $backupNamespace,
                'dedicated_database' => true,
                'separate_backup' => true,
                'meta' => [
                    'requested_at' => now()->toIso8601String(),
                    'saas_policy' => 'dedicated_database_and_separate_backup',
                    'database_provisioned' => $databaseProvisionStatus === 'provisioned',
                    'created_user_id' => $user->id,
                    'created_employee_id' => $employee->id,
                    'created_company_id' => $company->id,
                ],
            ]);

            return $requestRecord;
        });

        return response()->json([
            'message' => $requestRecord->provision_status === 'provisioned'
                ? 'Registration completed. Dedicated tenant database and credentials were generated successfully.'
                : 'Registration received. Tenant database provisioning is pending and will be completed shortly.',
            'request_id' => $requestRecord->id,
            'provision_status' => $requestRecord->provision_status,
        ], 201);
    }

    private function buildDatabaseName(string $businessSlug): string
    {
        $base = preg_replace('/[^a-z0-9_]/', '', strtolower($businessSlug)) ?: 'business';
        $base = trim($base, '_');
        $base = substr($base, 0, 40);

        return 'tenant_' . $base . '_' . Str::lower(Str::random(6));
    }

    private function buildDatabaseUser(string $businessSlug): string
    {
        $base = preg_replace('/[^a-z0-9_]/', '', strtolower($businessSlug)) ?: 'tenant';
        $base = trim($base, '_');
        $base = substr($base, 0, 24);

        return 'u_' . $base . '_' . Str::lower(Str::random(5));
    }

    private function generateStrongDatabasePassword(): string
    {
        return 'Db#' . Str::random(10) . '!x9';
    }

    private function provisionTenantDatabase(string $databaseName, string $databaseUser, string $databasePassword): void
    {
        $host = env('DB_HOST', '%');
        if (in_array($host, ['127.0.0.1', 'localhost'], true)) {
            $host = '%';
        }

        $escapedDb = str_replace('`', '``', $databaseName);
        $escapedUser = str_replace("'", "''", $databaseUser);
        $escapedHost = str_replace("'", "''", $host);
        $escapedPassword = str_replace("'", "''", $databasePassword);

        try {
            DB::statement("CREATE DATABASE IF NOT EXISTS `{$escapedDb}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            DB::statement("CREATE USER IF NOT EXISTS '{$escapedUser}'@'{$escapedHost}' IDENTIFIED BY '{$escapedPassword}'");
            DB::statement("GRANT ALL PRIVILEGES ON `{$escapedDb}`.* TO '{$escapedUser}'@'{$escapedHost}'");
            DB::statement('FLUSH PRIVILEGES');
        } catch (QueryException $exception) {
            throw $exception;
        }
    }
}
