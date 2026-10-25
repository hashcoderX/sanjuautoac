<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

class FeatureVisibilityController extends Controller
{
    private const VISIBILITY_KEY_PREFIX = 'dashboard_module_visibility_user_';
    private const SUPER_ADMIN_OVERRIDE_TTL_MINUTES = 30;

    private const MODULE_KEYS = [
        'hrm',
        'reports',
        'reports-el-navbar',
        'reports-el-link-back',
        'reports-el-status-ready',
        'reports-el-btn-logout',
        'reports-sec-hero',
        'reports-el-hero-icon',
        'reports-el-hero-title',
        'reports-el-hero-description',
        'reports-el-total-options',
        'reports-sec-categories',
        'reports-sec-category-hrm-reports',
        'reports-sec-category-stock-reports',
        'reports-sec-category-sales-reports',
        'reports-el-card-attendance-report',
        'reports-el-card-employee-registration-report',
        'reports-el-card-cv-list-report',
        'reports-el-card-interview-report',
        'reports-el-card-payroll-report',
        'reports-el-card-department-list-report',
        'reports-el-card-designation-list-report',
        'reports-el-card-full-stock-report',
        'reports-el-card-raw-material-stock-report',
        'reports-el-card-finished-good-stock-report',
        'reports-el-card-full-stock-valuation-report',
        'reports-el-card-sales-and-profit-report',
        'settings',
        'company-settings',
        'user-management',
        'system-settings',
        'security-settings',
        'security-settings-el-navbar',
        'security-settings-el-btn-back',
        'security-settings-sec-hero',
        'security-settings-el-badge-security-level',
        'security-settings-el-badge-lockout',
        'security-settings-el-stat-shield',
        'security-settings-el-stat-two-factor',
        'security-settings-el-stat-session-policy',
        'security-settings-sec-auth-controls',
        'security-settings-el-title-auth',
        'security-settings-el-desc-auth',
        'security-settings-el-control-strong-password',
        'security-settings-el-control-two-factor',
        'security-settings-el-control-lockout',
        'security-settings-el-input-max-failed',
        'security-settings-el-input-session-timeout',
        'security-settings-el-input-password-expiry',
        'security-settings-el-warning-note',
        'security-settings-el-btn-save',
        'security-settings-el-btn-refresh',
        'backup-restore',
        'backup-restore-el-navbar',
        'backup-restore-el-btn-back',
        'backup-restore-sec-hero',
        'backup-restore-el-badge-frequency',
        'backup-restore-el-badge-retention',
        'backup-restore-el-stat-readiness',
        'backup-restore-el-stat-mode',
        'backup-restore-el-stat-storage-security',
        'backup-restore-sec-policy',
        'backup-restore-el-title-policy',
        'backup-restore-el-desc-policy',
        'backup-restore-el-control-auto-backup',
        'backup-restore-el-input-frequency',
        'backup-restore-el-input-retention',
        'backup-restore-el-control-include-files',
        'backup-restore-el-control-encryption',
        'backup-restore-el-control-cloud-sync',
        'backup-restore-el-warning-note',
        'backup-restore-el-btn-save',
        'backup-restore-el-btn-refresh',
        'purchasing',
        'job-cards',
        'invoicing',
        'stock',
        'accounts',
        'accounts-el-navbar',
        'accounts-el-link-back',
        'accounts-el-status-active',
        'accounts-sec-hero',
        'accounts-el-hero-icon',
        'accounts-el-hero-title',
        'accounts-el-hero-description',
        'accounts-el-live-badge',
        'accounts-sec-modules',
        'accounts-el-card-grn-payment-control',
        'accounts-el-card-company-main-account',
        'accounts-el-card-cheque-registry',
        'accounts-el-card-petty-cash',
        'accounts-sec-company-balance-board',
        'accounts-el-board-title',
        'accounts-el-board-description',
        'accounts-el-stat-total-cash',
        'accounts-el-stat-total-bank',
        'accounts-el-stat-total-cheque',
        'accounts-el-stat-grand-total',
        'accounts-col-company',
        'accounts-col-cash-balance',
        'accounts-col-bank-balance',
        'accounts-col-cheque-balance',
        'accounts-col-total',
        'accounts-col-bank-account-balances',
        'accounts-col-cheque-account-balances',
        'hrm-employees',
        'hrm-departments',
        'hrm-designations',
        'hrm-attendance',
        'hrm-leaves',
        'hrm-roles',
        'hrm-payroll',
        'hrm-candidates',
        'hrm-quick-add-employee',
        'hrm-quick-view-reports',
        'hrm-quick-mark-attendance',
        'hrm-quick-process-payroll',
        'hrm-employees-col-code',
        'hrm-employees-col-name',
        'hrm-employees-col-email',
        'hrm-employees-col-department',
        'hrm-employees-col-designation',
        'hrm-employees-col-branch',
        'hrm-employees-col-status',
        'hrm-employees-col-actions',
        'hrm-employees-el-title',
        'hrm-employees-el-stat-total',
        'hrm-employees-el-stat-active',
        'hrm-employees-el-stat-departments',
        'hrm-employees-el-btn-add',
        'hrm-employees-el-filter-search',
        'hrm-employees-el-filter-status',
        'hrm-employees-el-filter-department',
        'hrm-employees-el-filter-designation',
        'hrm-employees-el-filter-branch',
        'hrm-employees-el-btn-reset',
        'hrm-departments-el-title',
        'hrm-departments-el-stat-total',
        'hrm-departments-el-btn-add',
        'hrm-departments-el-filter-search',
        'hrm-departments-el-btn-reset',
        'hrm-departments-col-name',
        'hrm-departments-col-description',
        'hrm-departments-col-created',
        'hrm-departments-col-actions',
        'hrm-departments-sec-table',
        'hrm-designations-el-title',
        'hrm-designations-el-stat-total',
        'hrm-designations-col-name',
        'hrm-designations-col-description',
        'hrm-designations-col-created',
        'hrm-designations-sec-table',
        'hrm-attendance-el-title',
        'hrm-attendance-el-tabs',
        'hrm-attendance-el-search',
        'hrm-attendance-el-count',
        'hrm-attendance-sec-mark-table',
        'hrm-attendance-col-code',
        'hrm-attendance-col-name',
        'hrm-attendance-col-email',
        'hrm-attendance-col-phone',
        'hrm-attendance-col-in-time',
        'hrm-attendance-col-out-time',
        'hrm-attendance-col-status',
        'hrm-attendance-col-actions',
        'hrm-attendance-sec-upload',
        'hrm-attendance-sec-history',
        'hrm-candidates-el-title',
        'hrm-candidates-el-btn-add',
        'hrm-candidates-el-btn-refresh',
        'hrm-candidates-sec-table',
        'hrm-candidates-col-code',
        'hrm-candidates-col-name',
        'hrm-candidates-col-email',
        'hrm-candidates-col-phone',
        'hrm-candidates-col-position',
        'hrm-candidates-col-status',
        'hrm-candidates-col-actions',
        'hrm-leaves-el-title',
        'hrm-leaves-el-stat-pending',
        'hrm-leaves-el-stat-approved',
        'hrm-leaves-el-stat-types',
        'hrm-leaves-el-btn-new',
        'hrm-leaves-el-btn-types',
        'hrm-leaves-sec-requests',
        'hrm-leaves-col-employee',
        'hrm-leaves-col-type',
        'hrm-leaves-col-duration',
        'hrm-leaves-col-status',
        'hrm-leaves-col-section-head',
        'hrm-leaves-col-hr-approval',
        'hrm-leaves-col-actions',
        'hrm-payroll-el-title',
        'hrm-payroll-el-btn-generate',
        'hrm-payroll-el-stat-rows',
        'hrm-payroll-el-stat-net',
        'hrm-payroll-el-stat-pending',
        'hrm-payroll-el-stat-processed-paid',
        'hrm-payroll-sec-filters',
        'hrm-payroll-sec-table',
        'hrm-payroll-col-employee',
        'hrm-payroll-col-month-year',
        'hrm-payroll-col-basic-salary',
        'hrm-payroll-col-allowances',
        'hrm-payroll-col-deductions',
        'hrm-payroll-col-net-salary',
        'hrm-payroll-col-status',
        'hrm-payroll-col-actions',
        'hrm-roles-el-title',
        'hrm-roles-el-btn-add',
        'hrm-roles-sec-table',
        'hrm-roles-col-name',
        'hrm-roles-col-description',
        'hrm-roles-col-permissions',
        'hrm-roles-col-status',
        'hrm-roles-col-actions',
        'invoicing-doc-print-el-toolbar-paper',
        'invoicing-doc-print-el-btn-print',
        'invoicing-doc-print-el-btn-close',
        'invoicing-doc-print-sec-company',
        'invoicing-doc-print-sec-meta',
        'invoicing-doc-print-sec-customer-vehicle',
        'invoicing-doc-print-sec-items',
        'invoicing-doc-print-col-index',
        'invoicing-doc-print-col-description',
        'invoicing-doc-print-col-warranty',
        'invoicing-doc-print-col-qty',
        'invoicing-doc-print-col-rate',
        'invoicing-doc-print-col-amount',
        'invoicing-doc-print-sec-totals',
        'invoicing-doc-print-sec-payment',
        'invoicing-doc-print-sec-remarks',
        'invoicing-doc-print-sec-terms',
        'invoicing-doc-print-sec-signatures',
        'invoicing-doc-print-el-footer',
        'invoicing-el-hero',
        'invoicing-el-btn-new-quotation',
        'invoicing-el-btn-new-invoice',
        'invoicing-el-success-message',
        'invoicing-el-stat-invoices-today',
        'invoicing-el-stat-active-quotations',
        'invoicing-el-stat-unpaid-invoices',
        'invoicing-el-stat-outstanding-total',
        'invoicing-sec-documents',
        'invoicing-el-search',
        'invoicing-el-filter-pills',
        'invoicing-col-doc-no',
        'invoicing-col-type',
        'invoicing-col-customer',
        'invoicing-col-phone',
        'invoicing-col-date',
        'invoicing-col-total',
        'invoicing-col-paid',
        'invoicing-col-balance',
        'invoicing-col-actions',
        'invoicing-sec-pagination',
        'job-cards-el-hero',
        'job-cards-el-btn-new',
        'job-cards-el-success-message',
        'job-cards-el-stat-active',
        'job-cards-el-stat-pending',
        'job-cards-el-stat-in-progress',
        'job-cards-el-stat-completed-today',
        'job-cards-sec-table',
        'job-cards-el-search',
        'job-cards-el-filter-pills',
        'job-cards-col-job-card',
        'job-cards-col-customer',
        'job-cards-col-vehicle',
        'job-cards-col-problem',
        'job-cards-col-technician',
        'job-cards-col-inspection',
        'job-cards-col-received',
        'job-cards-col-est-cost',
        'job-cards-col-status',
        'job-cards-col-actions',
        'job-cards-sec-pagination',
        'job-cards-doc-print-el-toolbar-paper',
        'job-cards-doc-print-el-btn-print',
        'job-cards-doc-print-el-btn-close',
        'job-cards-doc-print-sec-company',
        'job-cards-doc-print-sec-meta',
        'job-cards-doc-print-sec-customer-vehicle',
        'job-cards-doc-print-sec-items',
        'job-cards-doc-print-col-index',
        'job-cards-doc-print-col-description',
        'job-cards-doc-print-col-qty',
        'job-cards-doc-print-col-rate',
        'job-cards-doc-print-col-amount',
        'job-cards-doc-print-sec-totals',
        'job-cards-doc-print-sec-payment',
        'job-cards-doc-print-sec-reported-issue',
        'job-cards-doc-print-sec-remarks',
        'job-cards-doc-print-sec-terms',
        'job-cards-doc-print-sec-signatures',
        'job-cards-doc-print-el-footer',
        'purchasing-el-hero',
        'purchasing-sec-stats',
        'purchasing-el-stat-suppliers',
        'purchasing-el-stat-total-grns',
        'purchasing-el-stat-post-payment-grns',
        'purchasing-sec-quick-actions',
        'purchasing-el-action-direct-grn',
        'purchasing-el-action-manage-suppliers',
        'purchasing-el-action-grn-payments',
        'purchasing-grn-el-hero',
        'purchasing-grn-el-hero-link-hub',
        'purchasing-grn-el-hero-link-payments',
        'purchasing-grn-el-btn-create',
        'purchasing-grn-el-success-message',
        'purchasing-grn-sec-stats',
        'purchasing-grn-el-stat-total-grns',
        'purchasing-grn-el-stat-unpaid',
        'purchasing-grn-el-stat-outstanding',
        'purchasing-grn-el-stat-suppliers',
        'purchasing-grn-sec-ledger',
        'purchasing-grn-el-search',
        'purchasing-grn-el-filter-pills',
        'purchasing-grn-col-grn-no',
        'purchasing-grn-col-date',
        'purchasing-grn-col-supplier',
        'purchasing-grn-col-invoice',
        'purchasing-grn-col-items',
        'purchasing-grn-col-net',
        'purchasing-grn-col-paid',
        'purchasing-grn-col-balance',
        'purchasing-grn-col-status',
        'purchasing-grn-sec-pagination',
        'stock-inventory-el-header',
        'stock-inventory-el-btn-add',
        'stock-inventory-el-header-stat-total-items',
        'stock-inventory-el-header-stat-low-stock',
        'stock-inventory-el-header-stat-healthy-stock',
        'stock-inventory-sec-filters',
        'stock-inventory-el-filter-search',
        'stock-inventory-el-filter-category',
        'stock-inventory-el-filter-supplier',
        'stock-inventory-el-filter-item-status',
        'stock-inventory-el-filter-stock-state',
        'stock-inventory-el-btn-reset-filters',
        'stock-inventory-el-snapshot-head',
        'stock-inventory-el-stat-total-items',
        'stock-inventory-el-stat-low-stock',
        'stock-inventory-el-stat-in-stock',
        'stock-inventory-el-stat-total-value',
        'stock-inventory-sec-table',
        'stock-inventory-col-item',
        'stock-inventory-col-stock-info',
        'stock-inventory-col-batch',
        'stock-inventory-col-price',
        'stock-inventory-col-status',
        'stock-inventory-col-actions',
        'stock-el-header',
        'stock-sec-stats',
        'stock-el-stat-total-items',
        'stock-el-stat-low-stock',
        'stock-el-stat-total-suppliers',
        'stock-el-stat-out-of-stock',
        'stock-sec-quick-actions',
        'stock-el-action-view-inventory',
        'stock-el-action-manage-suppliers',
        'stock-el-action-check-levels',
        'stock-el-action-generate-reports',
        'stock-el-action-transfer-outlets',
        'stock-sec-recent-activity',
        'stock-transfers-el-hero',
        'stock-transfers-el-btn-back',
        'stock-transfers-sec-stats',
        'stock-transfers-el-stat-invoices',
        'stock-transfers-el-stat-transfer-lines',
        'stock-transfers-el-stat-total-quantity',
        'stock-transfers-el-stat-outlets',
        'stock-transfers-el-stat-last-transfer',
        'stock-transfers-sec-new-invoice',
        'stock-transfers-el-title-new-invoice',
        'stock-transfers-el-input-item-search',
        'stock-transfers-el-select-outlet',
        'stock-transfers-el-input-quantity',
        'stock-transfers-el-input-notes',
        'stock-transfers-el-btn-add-line',
        'stock-transfers-sec-line-items-table',
        'stock-transfers-col-line-item',
        'stock-transfers-col-line-code',
        'stock-transfers-col-line-qty',
        'stock-transfers-col-line-unit-price',
        'stock-transfers-col-line-sub-amount',
        'stock-transfers-col-line-action',
        'stock-transfers-el-btn-submit-invoice',
        'stock-transfers-sec-recent-transfers',
        'stock-transfers-el-title-recent-transfers',
        'stock-transfers-el-total-records',
        'stock-transfers-col-recent-ref',
        'stock-transfers-col-recent-date',
        'stock-transfers-col-recent-item',
        'stock-transfers-col-recent-outlet',
        'stock-transfers-col-recent-qty',
        'stock-transfers-col-recent-by',
        'stock-transfers-col-recent-action',
        'stock-transfers-sec-pagination',
        'stock-suppliers-el-header',
        'stock-suppliers-el-btn-add',
        'stock-suppliers-el-stat-total',
        'stock-suppliers-el-stat-active',
        'stock-suppliers-el-stat-inactive',
        'stock-suppliers-sec-table',
        'stock-suppliers-el-title-directory',
        'stock-suppliers-col-supplier',
        'stock-suppliers-col-contact',
        'stock-suppliers-col-status',
        'stock-suppliers-col-outstanding-balance',
        'stock-suppliers-col-actions',
        'stock-suppliers-sec-pagination',
        'stock-levels-el-header',
        'stock-levels-el-stat-total-tracked',
        'stock-levels-el-stat-low-stock',
        'stock-levels-el-stat-healthy',
        'stock-levels-sec-grid',
        'stock-levels-el-card-filter',
        'stock-levels-el-card-threshold',
        'stock-levels-el-card-refresh',
        'stock-levels-sec-table',
        'stock-levels-col-item',
        'stock-levels-col-store',
        'stock-levels-col-current',
        'stock-levels-col-minimum',
        'stock-levels-col-status',
        'stock-levels-sec-pagination',
        'stock-reports-el-header',
        'stock-reports-el-btn-download-csv',
        'stock-reports-el-btn-download-pdf',
        'stock-reports-el-btn-refresh',
        'stock-reports-el-stat-rows',
        'stock-reports-el-stat-out-of-stock',
        'stock-reports-el-stat-low-stock',
        'stock-reports-sec-filters',
        'stock-reports-el-title-filters',
        'stock-reports-el-filter-search',
        'stock-reports-el-filter-store-type',
        'stock-reports-el-filter-item-status',
        'stock-reports-el-filter-stock-state',
        'stock-reports-el-filter-date-from',
        'stock-reports-el-filter-date-to',
        'stock-reports-el-btn-reset-filters',
        'stock-reports-sec-table',
        'stock-reports-el-title-table',
        'stock-reports-el-total-value',
        'stock-reports-col-item',
        'stock-reports-col-type',
        'stock-reports-col-stock',
        'stock-reports-col-price',
        'stock-reports-col-supplier',
        'stock-reports-col-status',
        'stock-reports-col-updated',
        'stock-reports-sec-pagination',
        'stock-reports-el-rows-selector',
        'stock-reports-el-pagination-controls',
        'company-settings-sec-identity',
        'company-settings-sec-active-profile',
        'company-settings-sec-accounting',
        'company-settings-sec-profiles',
        'company-settings-sec-danger-zone',
    ];

    private function isSuperAdminUser($user): bool
    {
        if (!$user) {
            return false;
        }

        if (!$user->employee_id) {
            return true;
        }

        $user->loadMissing('roles');

        $roleNames = $user->roles
            ->pluck('name')
            ->push((string) ($user->role ?? ''))
            ->map(fn ($name) => strtolower(trim((string) $name)))
            ->filter();

        return $roleNames->contains(function ($roleName) {
            return str_contains($roleName, 'super admin')
                || str_contains($roleName, 'superadmin');
        });
    }

    private function superAdminOverrideCacheKey(int $userId): string
    {
        return 'feature_visibility.super_admin_override.' . $userId;
    }

    private function hasSuperAdminOverride($user): bool
    {
        if (!$user || !$user->id) {
            return false;
        }

        return (bool) Cache::get($this->superAdminOverrideCacheKey((int) $user->id), false);
    }

    private function grantSuperAdminOverride($user): void
    {
        if (!$user || !$user->id) {
            return;
        }

        Cache::put(
            $this->superAdminOverrideCacheKey((int) $user->id),
            true,
            now()->addMinutes(self::SUPER_ADMIN_OVERRIDE_TTL_MINUTES)
        );
    }

    private function visibilityKeyForUser($user): ?string
    {
        if (!$user || !$user->id) {
            return null;
        }

        return self::VISIBILITY_KEY_PREFIX . (int) $user->id;
    }

    private function readVisibilityMap($user): array
    {
        $key = $this->visibilityKeyForUser($user);
        if (!$key) {
            return [];
        }

        $setting = SystemSetting::firstOrCreate(
            ['key' => $key],
            ['value' => '{}']
        );

        $decoded = json_decode((string) $setting->value, true);
        if (!is_array($decoded)) {
            return [];
        }

        return $decoded;
    }

    private function writeVisibilityMap($user, array $visibilityMap): void
    {
        $key = $this->visibilityKeyForUser($user);
        if (!$key) {
            return;
        }

        SystemSetting::updateOrCreate(
            ['key' => $key],
            ['value' => json_encode($visibilityMap, JSON_UNESCAPED_SLASHES)]
        );
    }

    private function hiddenModuleKeys(array $visibilityMap): array
    {
        return collect($visibilityMap)
            ->filter(fn ($state) => is_array($state) && !empty($state['hidden']))
            ->keys()
            ->values()
            ->all();
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $visibilityMap = $this->readVisibilityMap($user);

        return response()->json([
            'hidden_modules' => $this->hiddenModuleKeys($visibilityMap),
            'visibility' => $visibilityMap,
            'can_manage' => $this->isSuperAdminUser($user) || $this->hasSuperAdminOverride($user),
        ]);
    }

    public function update(Request $request)
    {
        $user = $request->user();
        if (!$this->isSuperAdminUser($user) && !$this->hasSuperAdminOverride($user)) {
            return response()->json(['message' => 'Only Super Admin can update feature visibility.'], 403);
        }

        $data = $request->validate([
            'module_key' => 'required|string|in:' . implode(',', self::MODULE_KEYS),
            'hidden' => 'required|boolean',
        ]);

        $visibilityMap = $this->readVisibilityMap($user);

        $visibilityMap[$data['module_key']] = [
            'hidden' => (bool) $data['hidden'],
            'updated_by' => $user?->id,
            'updated_at' => now()->toIso8601String(),
        ];

        $this->writeVisibilityMap($user, $visibilityMap);

        return response()->json([
            'message' => 'Feature visibility updated successfully.',
            'hidden_modules' => $this->hiddenModuleKeys($visibilityMap),
            'visibility' => $visibilityMap,
        ]);
    }

    public function employeeVisibility(Request $request, int $employeeId)
    {
        $requestUser = $request->user();
        if (!$this->isSuperAdminUser($requestUser)) {
            return response()->json(['message' => 'Only Super Admin can view employee feature visibility.'], 403);
        }

        $targetUser = User::query()->where('employee_id', $employeeId)->first();
        if (!$targetUser) {
            return response()->json([
                'employee_id' => $employeeId,
                'has_user_account' => false,
                'hidden_modules' => [],
                'visibility' => [],
            ]);
        }

        $visibilityMap = $this->readVisibilityMap($targetUser);

        return response()->json([
            'employee_id' => $employeeId,
            'has_user_account' => true,
            'user_id' => $targetUser->id,
            'hidden_modules' => $this->hiddenModuleKeys($visibilityMap),
            'visibility' => $visibilityMap,
        ]);
    }

    public function employeeUnblock(Request $request, int $employeeId)
    {
        $requestUser = $request->user();
        if (!$this->isSuperAdminUser($requestUser)) {
            return response()->json(['message' => 'Only Super Admin can unblock employee feature visibility.'], 403);
        }

        $targetUser = User::query()->where('employee_id', $employeeId)->first();
        if (!$targetUser) {
            return response()->json(['message' => 'Employee user account not found.'], 404);
        }

        $data = $request->validate([
            'module_key' => 'required|string|in:' . implode(',', self::MODULE_KEYS),
        ]);

        $visibilityMap = $this->readVisibilityMap($targetUser);
        unset($visibilityMap[$data['module_key']]);
        $this->writeVisibilityMap($targetUser, $visibilityMap);

        return response()->json([
            'message' => 'Employee feature unblocked successfully.',
            'employee_id' => $employeeId,
            'user_id' => $targetUser->id,
            'hidden_modules' => $this->hiddenModuleKeys($visibilityMap),
            'visibility' => $visibilityMap,
        ]);
    }

    public function verifySuperAdminCredentials(Request $request)
    {
        $requestUser = $request->user();
        if (!$requestUser) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $data = $request->validate([
            'email' => 'required|string|email',
            'password' => 'required|string',
        ]);

        $candidate = User::where('email', $data['email'])->first();

        if (!$candidate || !Hash::check($data['password'], (string) $candidate->password) || !$this->isSuperAdminUser($candidate)) {
            return response()->json([
                'verified' => false,
                'message' => 'Invalid Super Admin credentials.',
            ], 422);
        }

        $this->grantSuperAdminOverride($requestUser);

        return response()->json([
            'verified' => true,
            'message' => 'Super Admin credentials verified.',
            'user_id' => $candidate->id,
            'override_ttl_minutes' => self::SUPER_ADMIN_OVERRIDE_TTL_MINUTES,
        ]);
    }
}
