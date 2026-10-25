'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import axios from 'axios';

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

export default function HRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;

  const navigation = [
    { id: 'hrm-employees', name: 'Employees', href: '/dashboard/hrm/employees', icon: '👥' },
    { id: 'hrm-departments', name: 'Departments', href: '/dashboard/hrm/departments', icon: '🏢' },
    { id: 'hrm-designations', name: 'Designations', href: '/dashboard/hrm/designations', icon: '📋' },
    { id: 'hrm-attendance', name: 'Attendance', href: '/dashboard/hrm/attendance', icon: '📅' },
    { id: 'hrm-leaves', name: 'Leaves', href: '/dashboard/hrm/leaves', icon: '🏖️' },
    { id: 'hrm-candidates', name: 'Candidates', href: '/dashboard/hrm/candidates', icon: '🎯' },
    { id: 'hrm-payroll', name: 'Payroll', href: '/dashboard/hrm/payroll', icon: '💰' },
    { id: 'hrm-roles', name: 'Roles', href: '/dashboard/hrm/roles', icon: '🔐' },
  ];

  const fetchAccessProfile = async (authToken: string) => {
    try {
      const visibilityRes = await axios.get(`${API_URL}/api/feature-visibility`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const hiddenModuleList = Array.isArray(visibilityRes.data?.hidden_modules)
        ? visibilityRes.data.hidden_modules
            .map((moduleId: unknown) => String(moduleId || '').trim())
            .filter(Boolean)
        : [];

      setCanManageFeatureVisibility(Boolean(visibilityRes.data?.can_manage));
      setHiddenModules(Array.from(new Set(hiddenModuleList)));
    } catch (error) {
      console.error('Error loading HRM navigation access profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleNavWidgetVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating HRM navigation visibility:', error);
    }
  };

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

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setToken('');
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
      return;
    }

    setToken(storedToken);
    void fetchAccessProfile(storedToken);
  }, [API_URL, pathname]);

  useEffect(() => {
    const refreshVisibility = async () => {
      if (!token) {
        setHiddenModules([]);
        return;
      }

      try {
        const visibilityRes = await axios.get(`${API_URL}/api/feature-visibility`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const hiddenModuleList = Array.isArray(visibilityRes.data?.hidden_modules)
          ? visibilityRes.data.hidden_modules
              .map((moduleId: unknown) => String(moduleId || '').trim())
              .filter(Boolean)
          : [];

        setHiddenModules(Array.from(new Set(hiddenModuleList)));
      } catch (error) {
        console.error('Error loading HRM navigation visibility:', error);
      }
    };

    void refreshVisibility();
  }, [API_URL, pathname, token]);

  const visibleNavigation = useMemo(
    () => navigation.filter((item) => !hiddenModules.includes(item.id)),
    [navigation, hiddenModules]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HRM Navigation */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center py-4 gap-3 sm:gap-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-8 gap-2 sm:gap-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Human Resources</h1>
              <nav className="flex space-x-3 sm:space-x-6 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
                {visibleNavigation.map((item) => (
                  <div key={item.id} className="relative flex items-center">
                    <Link
                      href={item.href}
                      className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        showWidgetCloseButtons ? 'pr-8' : 'pr-3'
                      } ${
                        pathname === item.href
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <span className="mr-2">{item.icon}</span>
                      {item.name}
                    </Link>

                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        aria-label={`Hide ${item.name}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleNavWidgetVisibilityToggle(item.id, true);
                        }}
                        className="absolute right-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-red-500 hover:bg-red-100 hover:text-red-700"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
              </nav>
            </div>
            <div className="flex justify-end">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}