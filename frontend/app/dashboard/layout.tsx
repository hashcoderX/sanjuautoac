'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';

const MODULE_PATH_PREFIXES: Record<string, string[]> = {
  hrm: ['/dashboard/hrm'],
  'hrm-employees': ['/dashboard/hrm/employees'],
  'hrm-departments': ['/dashboard/hrm/departments'],
  'hrm-designations': ['/dashboard/hrm/designations'],
  'hrm-attendance': ['/dashboard/hrm/attendance'],
  'hrm-leaves': ['/dashboard/hrm/leaves'],
  'hrm-roles': ['/dashboard/hrm/roles'],
  'hrm-payroll': ['/dashboard/hrm/payroll'],
  'hrm-candidates': ['/dashboard/hrm/candidates'],
  reports: ['/dashboard/reports'],
  settings: ['/dashboard/company-settings'],
  'company-settings': ['/dashboard/company-settings'],
  'user-management': ['/dashboard/hrm/roles'],
  'system-settings': ['/dashboard/system-settings'],
  'security-settings': ['/dashboard/security-settings'],
  'backup-restore': ['/dashboard/backup-restore'],
  purchasing: ['/dashboard/purchasing'],
  'job-cards': ['/dashboard/job-cards'],
  invoicing: ['/dashboard/invoicing'],
  stock: ['/dashboard/stock'],
  accounts: ['/dashboard/accounts'],
};

function resolveModuleKeysByPath(pathname: string): string[] {
  const keys: string[] = [];

  for (const [moduleKey, prefixes] of Object.entries(MODULE_PATH_PREFIXES)) {
    for (const prefix of prefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        keys.push(moduleKey);
        break;
      }
    }
  }

  return keys;
}

function isSuperAdminUser(userData: any): boolean {
  const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
  const roleNames = [
    String(userData?.role || ''),
    ...(Array.isArray(userData?.roles)
      ? userData.roles.map((role: any) => String(role?.name || role || ''))
      : []),
  ]
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);

  const roleBlob = roleNames.join(' ');
  return !employeeId || roleBlob.includes('super admin') || roleBlob.includes('superadmin');
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    const verifyVisibility = async () => {
      if (pathname === '/dashboard' || pathname === '/dashboard/login') {
        setReady(true);
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        router.replace('/dashboard/login');
        return;
      }

      const moduleKeys = resolveModuleKeysByPath(pathname);
      if (moduleKeys.length === 0) {
        setReady(true);
        return;
      }

      try {
        const [userRes, visibilityRes] = await Promise.all([
          axios.get(`${API_URL}/api/user`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/api/feature-visibility`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const superAdmin = isSuperAdminUser(userRes.data || {});
        const hiddenModules = Array.isArray(visibilityRes.data?.hidden_modules)
          ? visibilityRes.data.hidden_modules.map((key: unknown) => String(key || '').trim()).filter(Boolean)
          : [];

        if (!superAdmin && moduleKeys.some((moduleKey) => hiddenModules.includes(moduleKey))) {
          router.replace('/dashboard');
          return;
        }

        setReady(true);
      } catch (error) {
        console.error('Failed to validate dashboard module visibility:', error);
        router.replace('/dashboard');
      }
    };

    setReady(false);
    void verifyVisibility();
  }, [pathname, router, API_URL]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}
