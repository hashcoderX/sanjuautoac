'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type DashboardModule = {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  path?: string;
  comingSoon?: boolean;
};

type TrialState = {
  status?: 'active' | 'upgrade_required' | 'blocked' | 'exempt' | string;
  message?: string | null;
  trial_end_at?: string | null;
  lock_at?: string | null;
  days_until_lock?: number | null;
};

export default function Dashboard() {
  const [token, setToken] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('');
  const [companyName, setCompanyName] = useState('Servio');
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [superAdminUnlocked, setSuperAdminUnlocked] = useState(false);
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [trial, setTrial] = useState<TrialState | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  const [showFixAuthModal, setShowFixAuthModal] = useState(false);
  const [fixAuthEmail, setFixAuthEmail] = useState('');
  const [fixAuthPassword, setFixAuthPassword] = useState('');
  const [fixAuthError, setFixAuthError] = useState('');
  const [fixAuthLoading, setFixAuthLoading] = useState(false);
  const [fixAuthMode, setFixAuthMode] = useState<'unlock-edit' | 'fix-widgets' | 'edit-widgets'>('unlock-edit');
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const canEditWidgets = canManageFeatureVisibility || isSuperAdminUser || superAdminUnlocked;
  const showWidgetCloseButtons = canEditWidgets && !widgetsFixed;

  useEffect(() => {
    const stored = localStorage.getItem('widgets_fixed_global');
    setWidgetsFixed(stored === '1');

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'widgets_fixed_global') {
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
      router.push('/');
    } else {
      setToken(storedToken);
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const fetchCompanyName = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const rows = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        const name = String(rows[0]?.name || '').trim();
        if (name) {
          setCompanyName(name);
        }
      } catch (error) {
        if (handleAuthFailure(error)) return;
        console.error('Error fetching company name:', error);
      }
    };

    fetchCompanyName();
  }, [token, API_URL]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  const handleAuthFailure = (error: unknown): boolean => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem('token');
      router.push('/');
      return true;
    }

    if (axios.isAxiosError(error) && error.response?.status === 403 && error.response?.data?.code === 'trial_expired') {
      localStorage.removeItem('token');
      alert(error.response?.data?.message || 'Trial period ended. Please buy Pro version to continue.');
      router.push('/dashboard/login?reason=trial_expired');
      return true;
    }

    return false;
  };

  const applyWidgetsFixed = (nextValue: boolean) => {
    setWidgetsFixed(nextValue);
    localStorage.setItem('widgets_fixed_global', nextValue ? '1' : '0');
    window.dispatchEvent(new CustomEvent('widgets-fixed-changed', { detail: { fixed: nextValue } }));
  };

  const openFixAuthModal = (mode: 'unlock-edit' | 'fix-widgets' | 'edit-widgets') => {
    setFixAuthMode(mode);
    setFixAuthEmail('');
    setFixAuthPassword('');
    setFixAuthError('');
    setShowFixAuthModal(true);
  };

  const closeFixAuthModal = () => {
    if (fixAuthLoading) return;
    setShowFixAuthModal(false);
    setFixAuthEmail('');
    setFixAuthPassword('');
    setFixAuthError('');
  };

  const handleFixWidgetButtonClick = () => {
    if (widgetsFixed && canEditWidgets) {
      openFixAuthModal('edit-widgets');
      return;
    }

    if (canEditWidgets) {
      openFixAuthModal('fix-widgets');
      return;
    }

    openFixAuthModal('unlock-edit');
  };

  const confirmFixWidgets = async (event: FormEvent) => {
    event.preventDefault();

    if (!token || fixAuthLoading) {
      return;
    }

    try {
      setFixAuthLoading(true);
      setFixAuthError('');

      await axios.post(
        `${API_URL}/api/feature-visibility/verify-super-admin`,
        {
          email: fixAuthEmail.trim(),
          password: fixAuthPassword,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuperAdminUnlocked(true);
      if (fixAuthMode === 'fix-widgets') {
        applyWidgetsFixed(true);
      } else {
        applyWidgetsFixed(false);
      }
      setShowFixAuthModal(false);
      setFixAuthEmail('');
      setFixAuthPassword('');
      setFixAuthError('');
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Super Admin credentials are invalid.';
      setFixAuthError(message);
    } finally {
      setFixAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;

    const fetchUserAccess = async () => {
      try {
        const userRes = await axios.get(`${API_URL}/api/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
        const trialInfo = (userData?.trial || null) as TrialState | null;
        setTrial(trialInfo);

        if (trialInfo?.status === 'blocked') {
          localStorage.removeItem('token');
          router.push('/dashboard/login?reason=trial_expired');
          return;
        }

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
        const superAdminUser = !employeeId || roleBlob.includes('super admin') || roleBlob.includes('superadmin');

        const visibilityRes = await axios.get(`${API_URL}/api/feature-visibility`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const hiddenModuleList = Array.isArray(visibilityRes.data?.hidden_modules)
          ? visibilityRes.data.hidden_modules
              .map((moduleId: unknown) => String(moduleId || '').trim())
              .filter(Boolean)
          : [];

        const displayName = [String(userData?.first_name || ''), String(userData?.last_name || '')]
          .map((part) => part.trim())
          .filter(Boolean)
          .join(' ')
          || String(userData?.name || '').trim()
          || String(userData?.username || '').trim()
          || 'Logged User';

        const displayEmail = String(userData?.email || '').trim();
        const displayRole = String(userData?.role || '').trim()
          || (Array.isArray(userData?.roles) && userData.roles.length > 0
            ? String(userData.roles[0]?.name || '').trim()
            : 'User');

        setCanManageFeatureVisibility(Boolean(visibilityRes.data?.can_manage));
        setIsSuperAdminUser(superAdminUser);
        setHiddenModules(Array.from(new Set(hiddenModuleList)));
        setUserName(displayName);
        setUserEmail(displayEmail);
        setUserRole(displayRole);
      } catch (error) {
        if (handleAuthFailure(error)) return;
        console.error('Error fetching dashboard access profile:', error);
        setCanManageFeatureVisibility(false);
        setIsSuperAdminUser(false);
        setHiddenModules([]);
        setUserName('');
        setUserEmail('');
        setUserRole('');
      } finally {
        setAccessReady(true);
      }
    };

    fetchUserAccess();
  }, [token, router]);

  const modules: DashboardModule[] = [
    {
      id: 'hrm',
      name: 'HRM (Human Resource Management)',
      icon: '👥',
      color: 'from-red-500 to-pink-500',
      bgColor: 'from-red-50 to-pink-50',
      path: '/dashboard/hrm',
    },
    {
      id: 'reports',
      name: 'Reports',
      icon: '📈',
      color: 'from-rose-500 to-red-500',
      bgColor: 'from-rose-50 to-red-50',
      path: '/dashboard/reports',
    },
    {
      id: 'settings',
      name: 'Settings & System Configuration',
      icon: '⚙️',
      color: 'from-slate-500 to-gray-500',
      bgColor: 'from-slate-50 to-gray-50',
      path: '/dashboard/company-settings',
    },
    {
      id: 'purchasing',
      name: 'Purchasing',
      icon: '🛒',
      color: 'from-cyan-500 to-blue-500',
      bgColor: 'from-cyan-50 to-blue-50',
      path: '/dashboard/purchasing',
    },
    {
      id: 'job-cards',
      name: 'Job Cards',
      icon: '🔧',
      color: 'from-indigo-500 to-violet-500',
      bgColor: 'from-indigo-50 to-violet-50',
      path: '/dashboard/job-cards',
    },
    {
      id: 'invoicing',
      name: 'Invoicing',
      icon: '🧾',
      color: 'from-teal-500 to-cyan-500',
      bgColor: 'from-teal-50 to-cyan-50',
      path: '/dashboard/invoicing',
    },
    {
      id: 'stock',
      name: 'Manage Stock',
      icon: '📦',
      color: 'from-orange-500 to-red-500',
      bgColor: 'from-orange-50 to-red-50',
      path: '/dashboard/stock',
    },
    {
      id: 'accounts',
      name: 'Accounts',
      icon: '💼',
      color: 'from-emerald-500 to-cyan-500',
      bgColor: 'from-emerald-50 to-cyan-50',
      path: '/dashboard/accounts',
    },
  ];

  const handleFeatureVisibilityToggle = async (moduleId: string, nextHiddenState: boolean) => {
    if (!canEditWidgets) {
      return;
    }

    try {
      const response = await axios.put(
        `${API_URL}/api/feature-visibility`,
        {
          module_key: moduleId,
          hidden: nextHiddenState,
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
      console.error('Unable to update feature visibility:', error);
      alert('Unable to update feature visibility. Please try again.');
    }
  };

  const visibleModules = modules.filter((module) => {
    return !hiddenModules.includes(module.id);
  });

  const settingsModules = [
    { id: 'company-settings', icon: '🏢', title: 'Company Settings', desc: 'Manage company profile for invoices and documents', color: 'from-blue-500 to-cyan-500', path: '/dashboard/company-settings' },
    { id: 'user-management', icon: '👥', title: 'User Management', desc: 'Manage users and permissions', color: 'from-green-500 to-emerald-500', path: '/dashboard/hrm/roles' },
    { id: 'system-settings', icon: '⚙️', title: 'System Settings', desc: 'Configure system preferences', color: 'from-purple-500 to-indigo-500', path: '/dashboard/system-settings' },
    { id: 'security-settings', icon: '🔒', title: 'Security Settings', desc: 'Manage security configurations', color: 'from-red-500 to-pink-500', path: '/dashboard/security-settings' },
    { id: 'backup-restore', icon: '💾', title: 'Backup & Restore', desc: 'Manage data backups', color: 'from-teal-500 to-green-500', path: '/dashboard/backup-restore' },
  ];

  const visibleSettingsModules = settingsModules.filter((setting) => {
    return !hiddenModules.includes(setting.id);
  });


  const handleModuleClick = (module: DashboardModule) => {
    if (module.path) {
      router.push(module.path);
      return;
    }

    if (module.comingSoon) {
      alert(`${module.name} module coming soon!`);
    }
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {/* Modern Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:h-16 h-auto py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <div className="flex-shrink-0 flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">SO</span>
                </div>
                <h1 className="text-gray-900 text-lg sm:text-xl font-bold bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent">
                  {companyName}
                </h1>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-3 sm:space-x-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>System Online</span>
              </div>
              <div className="hidden lg:flex items-center gap-3 rounded-full border border-white/70 bg-white/70 px-3 py-1.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-xs font-bold text-white">
                  {(userName || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 text-left">
                  <p className="max-w-[180px] truncate text-sm font-semibold text-gray-900">{userName || 'Logged User'}</p>
                  <p className="max-w-[180px] truncate text-xs text-gray-500">{userEmail || userRole || 'User'}</p>
                </div>
                <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pink-700">
                  {userRole || 'User'}
                </span>
              </div>
              {canEditWidgets ? (
                <button
                  onClick={handleFixWidgetButtonClick}
                  className="bg-gradient-to-r from-slate-500 to-gray-600 hover:from-slate-600 hover:to-gray-700 text-white px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  {widgetsFixed ? 'Edit Widgets' : 'Fix Widgets'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFixWidgetButtonClick}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-full text-sm font-semibold transition-colors"
                  title="Preview only. Super Admin access is required to edit widgets."
                >
                  Edit Widgets (Preview)
                </button>
              )}
              <button
                onClick={handleLogout}
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          {trial?.status === 'upgrade_required' && (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 shadow-sm">
              <p className="font-semibold">Free trial ended. Please buy Pro version.</p>
              <p className="mt-1 text-amber-800">
                Access will be blocked automatically on {trial.lock_at || 'the lock date'}
                {typeof trial.days_until_lock === 'number' ? ` (${trial.days_until_lock} day(s) left)` : ''}.
              </p>
            </div>
          )}

          <div className="inline-block p-1 bg-gradient-to-r from-red-500 to-pink-500 rounded-full mb-6">
            <div className="bg-white rounded-full p-4">
              <span className="text-4xl">🚀</span>
            </div>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Welcome to <span className="bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent">Servio</span>
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed px-1">
            Transform your business operations with our comprehensive management suite.
            Streamline processes, boost productivity, and drive growth with intelligent automation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center mt-6 gap-2 sm:space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>All Systems Operational</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Real-time Updates</span>
            </div>
          </div>
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-16">
          {visibleModules.map((module, index) => (
            <div
              key={index}
              onClick={() => handleModuleClick(module)}
              className={`group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer border border-white/20 overflow-hidden transform hover:-translate-y-2 hover:scale-105 ${
                module.name === 'HRM (Human Resource Management)' ? 'ring-2 ring-red-500/50' : ''
              }`}
            >
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleFeatureVisibilityToggle(module.id, true);
                  }}
                  className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-xs font-semibold shadow hover:bg-rose-200"
                  title="Hide module"
                  aria-label="Hide module"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}

              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${module.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

              {/* Content */}
              <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 bg-gradient-to-r ${module.color} rounded-xl flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {module.icon}
                  </div>
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                    {module.name}
                  </h3>
                  <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                    {module.name === 'HRM (Human Resource Management)'
                      ? 'Manage your workforce efficiently'
                      : module.name === 'Manage Stock'
                      ? 'Monitor and manage inventory levels'
                      : module.name === 'Purchasing'
                      ? 'Track procurement, suppliers, and GRN flow'
                      : module.name === 'Accounts'
                      ? 'Handle company books, cash accounts and balances'
                      : 'Access comprehensive management tools'
                    }
                  </p>
                </div>

                {/* Hover Effect Line */}
                <div className="absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r from-red-500 to-pink-500 group-hover:w-full transition-all duration-500"></div>
              </div>

              {/* Floating Particles Effect */}
              <div className="absolute top-4 right-4 w-2 h-2 bg-white/30 rounded-full opacity-0 group-hover:opacity-100 animate-ping"></div>
              <div className="absolute top-8 right-6 w-1 h-1 bg-white/20 rounded-full opacity-0 group-hover:opacity-100 animate-ping animation-delay-300"></div>
            </div>
          ))}
        </div>

        {visibleModules.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-8">
            No feature modules are currently visible. Contact an administrator to enable module widgets.
          </div>
        )}

        {/* Settings & Configuration Section */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-pink-500 p-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Settings & System Configuration</h3>
                  <p className="text-white/80">Configure and customize your system preferences</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleSettingsModules.map((setting, index) => {
                  return (
                  <div
                    key={index}
                    onClick={() => {
                      if (setting.path) {
                        router.push(setting.path);
                        return;
                      }

                      
                    }}
                    className="group relative bg-white/50 hover:bg-white/80 rounded-xl p-4 border border-white/30 hover:border-white/50 transition-all duration-300 cursor-pointer transform hover:scale-105"
                  >
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleFeatureVisibilityToggle(setting.id, true);
                        }}
                        className="absolute top-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                        title="Disable widget"
                        aria-label="Disable widget"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    )}

                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 bg-gradient-to-r ${setting.color} rounded-lg flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                        {setting.icon}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                          {setting.title}
                        </h4>
                        <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                          {setting.desc}
                        </p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                );})}
              </div>
            </div>
          </div>
      </main>

      {showFixAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-white/60 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-600 to-gray-700 px-6 py-4 text-white">
              <h3 className="text-lg font-bold">Super Admin Verification</h3>
              <p className="text-sm text-white/80">
                {fixAuthMode === 'fix-widgets'
                  ? 'Enter Super Admin credentials to fix widget layout.'
                  : fixAuthMode === 'edit-widgets'
                  ? 'Enter Super Admin credentials to enable widget editing mode.'
                  : 'Enter Super Admin credentials to enable widget editing.'}
              </p>
            </div>

            <form onSubmit={confirmFixWidgets} className="p-6 space-y-4">
              <div>
                <label htmlFor="fix-auth-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="fix-auth-email"
                  type="email"
                  value={fixAuthEmail}
                  onChange={(event) => setFixAuthEmail(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="superadmin@example.com"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="fix-auth-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="fix-auth-password"
                  type="password"
                  value={fixAuthPassword}
                  onChange={(event) => setFixAuthPassword(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="Enter password"
                  required
                />
              </div>

              {fixAuthError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {fixAuthError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeFixAuthModal}
                  disabled={fixAuthLoading}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={fixAuthLoading}
                  className="rounded-lg bg-gradient-to-r from-slate-600 to-gray-700 px-4 py-2 text-sm font-semibold text-white hover:from-slate-700 hover:to-gray-800 disabled:opacity-60"
                >
                  {fixAuthLoading
                    ? 'Verifying...'
                    : fixAuthMode === 'fix-widgets'
                    ? 'Verify & Fix Widgets'
                    : fixAuthMode === 'edit-widgets'
                    ? 'Verify & Edit Widgets'
                    : 'Verify & Enable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}