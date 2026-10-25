'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

const toVisibilitySlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

type ReportItem = {
  name: string;
  description: string;
  icon: string;
  path?: string;
  comingSoon?: boolean;
};

type ReportCategory = {
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  reports: ReportItem[];
};

export default function ReportsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [modalMessage, setModalMessage] = useState('');
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;
  const isElementVisible = (key: string) => !hiddenModules.includes(key);

  const categoryVisibilityKey = (categoryName: string) => `reports-sec-category-${toVisibilitySlug(categoryName)}`;
  const reportCardVisibilityKey = (reportName: string) => `reports-el-card-${toVisibilitySlug(reportName)}`;

  const isSuperAdminUser = (userData: any): boolean => {
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
  };

  const fetchVisibilityProfile = async (authToken: string, userData: any) => {
    try {
      const visibilityRes = await axios.get(`${API_URL}/api/feature-visibility`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const hiddenModuleList = Array.isArray(visibilityRes.data?.hidden_modules)
        ? visibilityRes.data.hidden_modules
            .map((moduleId: unknown) => String(moduleId || '').trim())
            .filter(Boolean)
        : [];

      const superAdmin = isSuperAdminUser(userData || {});
      setCanManageFeatureVisibility(superAdmin && Boolean(visibilityRes.data?.can_manage));
      setHiddenModules(Array.from(new Set(hiddenModuleList)));
    } catch (error) {
      console.error('Error fetching reports visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleReportsVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
    if (!token || !canManageFeatureVisibility) {
      return;
    }

    try {
      const response = await axios.put(
        `${API_URL}/api/feature-visibility`,
        {
          module_key: moduleKey,
          hidden,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const nextHiddenModules = Array.isArray(response.data?.hidden_modules)
        ? response.data.hidden_modules
            .map((item: unknown) => String(item || '').trim())
            .filter(Boolean)
        : [];

      setHiddenModules(Array.from(new Set(nextHiddenModules)));
    } catch (error) {
      console.error('Error updating reports widget visibility:', error);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const fetchAccessProfile = async () => {
      try {
        const userRes = await axios.get(`${API_URL}/api/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
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
        await fetchVisibilityProfile(token, userData);
      } catch (error) {
        console.error('Error fetching reports access profile:', error);
      } finally {
        setAccessReady(true);
      }
    };

    fetchAccessProfile();
  }, [token, router]);

  useEffect(() => {
    const stored = localStorage.getItem(GLOBAL_WIDGET_FIX_KEY);
    setWidgetsFixed(stored === '1');

    const handleStorage = (event: StorageEvent) => {
      if (event.key === GLOBAL_WIDGET_FIX_KEY) {
        setWidgetsFixed(event.newValue === '1');
      }
    };

    const handleWidgetFixChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ fixed?: boolean }>;
      setWidgetsFixed(Boolean(customEvent.detail?.fixed));
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('widgets-fixed-changed', handleWidgetFixChanged as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('widgets-fixed-changed', handleWidgetFixChanged as EventListener);
    };
  }, []);

  const categories: ReportCategory[] = useMemo(
    () => [
      {
        name: 'HRM Reports',
        icon: '👥',
        color: 'from-blue-500 to-cyan-500',
        bgColor: 'from-blue-50 to-cyan-50',
        reports: [
          { name: 'Attendance Report', description: 'Attendance logs and daily summaries', icon: '📅', path: '/dashboard/reports/hrm/attendance' },
          { name: 'Employee Registration Report', description: 'Employee onboarding and profile register', icon: '🧾', path: '/dashboard/reports/hrm/employee-registration' },
          { name: 'CV List Report', description: 'Candidate CV list and status overview', icon: '📄', path: '/dashboard/reports/hrm/cv-list' },
          { name: 'Interview Report', description: 'Interview schedules and outcomes', icon: '🎤', path: '/dashboard/reports/hrm/interview' },
          { name: 'Payroll Report', description: 'Salary, deductions, and payroll summary', icon: '💰', path: '/dashboard/reports/hrm/payroll' },
          { name: 'Department List Report', description: 'Department structure and allocations', icon: '🏢', path: '/dashboard/reports/hrm/department-list' },
          { name: 'Designation List Report', description: 'Designation and position mapping', icon: '👔', path: '/dashboard/reports/hrm/designation-list' },
        ],
      },
      {
        name: 'Stock Reports',
        icon: '📦',
        color: 'from-orange-500 to-red-500',
        bgColor: 'from-orange-50 to-red-50',
        reports: [
          { name: 'Full Stock Report', description: 'Overall stock by item and category', icon: '📦', path: '/dashboard/reports/stock/full' },
          { name: 'Raw Material Stock Report', description: 'Raw material quantities and movements', icon: '🧱', path: '/dashboard/reports/stock/raw-material' },
          { name: 'Finished Good Stock Report', description: 'Finished goods availability and trends', icon: '✅', path: '/dashboard/reports/stock/finished-good' },
          { name: 'Full Stock Valuation Report', description: 'Inventory value by product and total', icon: '💹', path: '/dashboard/reports/stock/valuation' },
        ],
      },
      {
        name: 'Sales Reports',
        icon: '🧾',
        color: 'from-emerald-500 to-teal-500',
        bgColor: 'from-emerald-50 to-teal-50',
        reports: [
          {
            name: 'Sales & Profit Report',
            description: 'Sales revenue, estimated cost, and gross profit by transaction',
            icon: '📈',
            path: '/dashboard/reports/sales/profit',
          },
        ],
      },
    ],
    []
  );

  const totalReports = categories.reduce((sum, category) => sum + category.reports.length, 0);

  const handleReportOpen = (report: ReportItem) => {
    if (report.path) {
      router.push(report.path);
      return;
    }

    if (report.comingSoon) {
      setModalMessage(`${report.name} will be implemented next.`);
    }
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {isElementVisible('reports-el-navbar') && (
        <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handleReportsVisibilityToggle('reports-el-navbar', true); }}
                className="absolute -right-2 -top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                title="Hide top bar"
                aria-label="Hide top bar"
              >
                x
              </button>
            )}
            <div className="flex items-center justify-between sm:justify-start">
              {isElementVisible('reports-el-link-back') && (
                <Link href="/dashboard" className="flex items-center space-x-2 text-gray-700 hover:text-rose-600 transition-colors duration-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="font-medium">Back to Dashboard</span>
                </Link>
              )}
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-3 sm:space-x-4">
              {isElementVisible('reports-el-status-ready') && (
                <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Reports Module Ready</span>
                </div>
              )}
              {isElementVisible('reports-el-btn-logout') && (
                <button
                  onClick={() => {
                    localStorage.removeItem('token');
                    router.push('/');
                  }}
                  className="bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
      )}

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {isElementVisible('reports-sec-hero') && (
          <div className="relative text-center mb-10">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleReportsVisibilityToggle('reports-sec-hero', true); }}
              className="absolute right-0 top-0 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide hero section"
              aria-label="Hide hero section"
            >
              x
            </button>
          )}
          {isElementVisible('reports-el-hero-icon') && (
            <div className="inline-block p-1 bg-gradient-to-r from-rose-500 to-orange-500 rounded-full mb-6">
              <div className="bg-white rounded-full p-4">
                <span className="text-4xl">📊</span>
              </div>
            </div>
          )}
          {isElementVisible('reports-el-hero-title') && (
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Reports <span className="bg-gradient-to-r from-rose-600 to-orange-600 bg-clip-text text-transparent">Center</span>
            </h1>
          )}
          {isElementVisible('reports-el-hero-description') && (
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Unified report hub organized by business area. You can provide report topics one-by-one, and each report will be implemented in this module.
            </p>
          )}
          {isElementVisible('reports-el-total-options') && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/80 border border-white/70 px-4 py-2 text-sm text-gray-700 shadow">
              <span className="font-semibold">{totalReports}</span>
              <span>report options configured</span>
            </div>
          )}
        </div>
        )}

        {isElementVisible('reports-sec-categories') && (
          <div className="space-y-8">
          {categories.map((category) => (
            isElementVisible(categoryVisibilityKey(category.name)) ? (
              <section key={category.name} className="relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleReportsVisibilityToggle(categoryVisibilityKey(category.name), true); }}
                  className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                  title={`Hide ${category.name}`}
                  aria-label={`Hide ${category.name}`}
                >
                  x
                </button>
              )}
              <div className={`bg-gradient-to-r ${category.color} p-5`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">{category.icon}</div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{category.name}</h2>
                    <p className="text-white/85 text-sm">{category.reports.length} reports available in this category</p>
                  </div>
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.reports.map((report) => (
                  isElementVisible(reportCardVisibilityKey(report.name)) ? (
                    <button
                      key={report.name}
                      type="button"
                      onClick={() => handleReportOpen(report)}
                      className={`text-left group relative rounded-xl border border-white/40 bg-gradient-to-br ${category.bgColor} p-4 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1`}
                    >
                      {showWidgetCloseButtons && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleReportsVisibilityToggle(reportCardVisibilityKey(report.name), true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleReportsVisibilityToggle(reportCardVisibilityKey(report.name), true);
                            }
                          }}
                          className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                          title={`Hide ${report.name}`}
                          aria-label={`Hide ${report.name}`}
                        >
                          x
                        </span>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xl mb-2">{report.icon}</div>
                          <h3 className="font-semibold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">{report.name}</h3>
                          <p className="mt-1 text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">{report.description}</p>
                        </div>
                        <span className="shrink-0 inline-flex items-center rounded-full bg-white/80 border border-white text-[10px] font-semibold px-2 py-1 text-gray-700">
                          {report.comingSoon ? 'Planned' : 'Live'}
                        </span>
                      </div>
                    </button>
                  ) : null
                ))}
              </div>
            </section>
            ) : null
          ))}
        </div>
        )}
      </main>

      {modalMessage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/30 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Confirmation</h3>
            <p className="mt-2 text-sm text-gray-600">{modalMessage}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setModalMessage('')}
                className="rounded-lg bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:from-rose-600 hover:to-orange-600"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
