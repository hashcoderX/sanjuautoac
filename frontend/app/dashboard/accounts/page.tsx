'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import { createApiClient } from '../../../lib/apiClient';

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

interface CompanyAccountEntry {
  id: number;
  bank_name?: string;
  account_no?: string;
  current_balance?: number;
}

interface CompanyProfile {
  id: number;
  name: string;
  currency?: string;
  current_cash_balance?: number;
  current_bank_balance?: number;
  current_cheque_balance?: number;
  bank_accounts?: CompanyAccountEntry[];
  cheque_accounts?: CompanyAccountEntry[];
}

export default function AccountsPage() {
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyBalancesLoading, setCompanyBalancesLoading] = useState(false);
  const [companyBalances, setCompanyBalances] = useState<CompanyProfile[]>([]);
  const [pettyBalance, setPettyBalance] = useState(0);
  const [grnPayableBalance, setGrnPayableBalance] = useState(0);

  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);
  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;

  const isElementVisible = (key: string) => !hiddenModules.includes(key);
  const isColumnVisible = (key: string) => !hiddenModules.includes(key);

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

  const fetchVisibilityProfile = async (authToken: string) => {
    try {
      const [userRes, visibilityRes] = await Promise.all([
        api.get('/user'),
        api.get('/feature-visibility'),
      ]);

      const superAdmin = isSuperAdminUser(userRes.data || {});
      const hiddenModuleList = Array.isArray(visibilityRes.data?.hidden_modules)
        ? visibilityRes.data.hidden_modules
            .map((moduleId: unknown) => String(moduleId || '').trim())
            .filter(Boolean)
        : [];

      setCanManageFeatureVisibility(superAdmin && Boolean(visibilityRes.data?.can_manage));
      setHiddenModules(Array.from(new Set(hiddenModuleList)));
    } catch (error) {
      console.error('Error fetching accounts visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleAccountsVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
    if (!token || !canManageFeatureVisibility) {
      return;
    }

    try {
      const response = await api.put('/feature-visibility', {
        module_key: moduleKey,
        hidden,
      });

      const nextHiddenModules = Array.isArray(response.data?.hidden_modules)
        ? response.data.hidden_modules
            .map((item: unknown) => String(item || '').trim())
            .filter(Boolean)
        : [];

      setHiddenModules(Array.from(new Set(nextHiddenModules)));
    } catch (error) {
      console.error('Error updating accounts widget visibility:', error);
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

  const calcBalanceFromRows = (rows: any[]) => {
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((sum, row) => {
      const amount = Number(row?.amount || 0);
      const type = String(row?.type || '');
      return type === 'in' ? sum + amount : sum - amount;
    }, 0);
  };

  const fetchLedgerBalance = async (endpoint: string) => {
    try {
      const res = await api.get(endpoint, { params: { per_page: 500 } });
      const payload = res.data;
      const rows = Array.isArray(payload)
        ? payload
        : (payload?.data?.data || payload?.data || []);
      return calcBalanceFromRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(`Failed to load ${endpoint}:`, error);
      return 0;
    }
  };

  useEffect(() => {
    if (!token) return;

    fetchVisibilityProfile(token);

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

    const loadAccountsDashboard = async () => {
      try {
        setCompanyBalancesLoading(true);
        const [pettyCashBalance, grnRes, companiesRes] = await Promise.all([
          fetchLedgerBalance('/petty-cash-transactions'),
          api.get('/purchasing/grn', { params: { per_page: 1000, page: 1 } }),
          api.get('/companies'),
        ]);

        setPettyBalance(pettyCashBalance);

        const grnPayload = grnRes.data?.success ? grnRes.data.data : grnRes.data;
        const grnRows = Array.isArray(grnPayload) ? grnPayload : (grnPayload?.data || []);

        const grnPayable = (Array.isArray(grnRows) ? grnRows : []).reduce((sum: number, grn: any) => {
          if (String(grn?.payment_timing || 'post_payment') !== 'post_payment') {
            return sum;
          }
          const net = Number(grn?.net_amount || 0);
          const paid = Number(grn?.paid_amount || 0);
          const balance = Math.max(net - paid, 0);
          return sum + balance;
        }, 0);
        setGrnPayableBalance(grnPayable);

        const rows = Array.isArray(companiesRes.data) ? companiesRes.data : (companiesRes.data?.data || []);
        setCompanyBalances(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }
        console.error('Error loading company balances:', error);
        setPettyBalance(0);
        setGrnPayableBalance(0);
        setCompanyBalances([]);
      } finally {
        setCompanyBalancesLoading(false);
        setLoading(false);
      }
    };

    loadAccountsDashboard();

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('widgets-fixed-changed', handleWidgetFixChanged as EventListener);
    };
  }, [token]);

  const companySummary = useMemo(() => {
    const totalCash = companyBalances.reduce((sum, company) => sum + Number(company.current_cash_balance || 0), 0);
    const totalBank = companyBalances.reduce((sum, company) => sum + Number(company.current_bank_balance || 0), 0);
    const totalCheque = companyBalances.reduce((sum, company) => sum + Number(company.current_cheque_balance || 0), 0);

    return {
      totalCash,
      totalBank,
      totalCheque,
      grandTotal: totalCash + totalBank + totalCheque,
    };
  }, [companyBalances]);

  const money = (value: number) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const renderAccountBalances = (accounts: CompanyAccountEntry[] | undefined, tone: 'bank' | 'cheque') => {
    if (!accounts || accounts.length === 0) {
      return <span className="text-xs text-gray-400">No accounts</span>;
    }

    return (
      <div className="space-y-2">
        {accounts.map((account) => (
          <div key={account.id} className="rounded-lg border border-gray-100 bg-gray-50/70 px-2 py-1.5">
            <p className="text-xs font-semibold text-gray-800 truncate">
              {account.bank_name || (tone === 'bank' ? 'Bank Account' : 'Cheque Account')}
            </p>
            <p className="text-[11px] text-gray-500 truncate">A/C: {account.account_no || '-'}</p>
            <p className={`text-xs font-bold ${tone === 'bank' ? 'text-sky-700' : 'text-violet-700'}`}>
              {money(Number(account.current_balance || 0))}
            </p>
          </div>
        ))}
      </div>
    );
  };

  const modules = [
    {
      key: 'accounts-el-card-grn-payment-control',
      title: 'GRN Payment Control',
      icon: '🧮',
      href: '/dashboard/accounts/grn-payments',
      desc: 'Settle GRN net amounts and track unpaid or partial supplier payments.',
      balance: grnPayableBalance,
      color: 'from-rose-500 to-pink-500',
    },
    {
      key: 'accounts-el-card-company-main-account',
      title: 'Company Main Account',
      icon: '🏦',
      href: '/dashboard/accounts/main-account',
      desc: 'Live company balances (cash, bank, and cheque) from profile accounting data.',
      balance: companySummary.grandTotal,
      color: 'from-emerald-500 to-teal-500',
    },
    {
      key: 'accounts-el-card-cash-book',
      title: 'Cashbook',
      icon: '📒',
      href: '/dashboard/accounts/cash-book',
      desc: 'Track all cash-in and cash-out transactions with clear movement marks.',
      balance: companySummary.totalCash,
      color: 'from-cyan-500 to-blue-500',
    },
    {
      key: 'accounts-el-card-cheque-registry',
      title: 'Cheque Registry',
      icon: '🧾',
      href: '/dashboard/accounts/cheque-registry',
      desc: 'Register received cheques, deposit, track distribution cheques, and issue supplier cheques.',
      balance: companySummary.totalCheque,
      color: 'from-fuchsia-500 to-rose-500',
    },
    
    {
      key: 'accounts-el-card-petty-cash',
      title: 'Petty Cash Account',
      icon: '🧾',
      href: '/dashboard/accounts/petty-cash',
      desc: 'Small expense accounting and petty cash replenishment.',
      balance: pettyBalance,
      color: 'from-amber-500 to-orange-500',
    },
  ];

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {isElementVisible('accounts-el-navbar') && (
        <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handleAccountsVisibilityToggle('accounts-el-navbar', true); }}
                className="absolute -right-2 -top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                title="Hide top bar"
                aria-label="Hide top bar"
              >
                x
              </button>
            )}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              {isElementVisible('accounts-el-link-back') && (
                <Link href="/dashboard" className="flex items-center space-x-2 text-gray-700 hover:text-emerald-600">
                  <span>←</span>
                  <span className="font-medium text-sm sm:text-base">Back to Dashboard</span>
                </Link>
              )}
            </div>
            {isElementVisible('accounts-el-status-active') && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span>Accounts Active</span>
              </div>
            )}
          </div>
        </div>
      </nav>
      )}

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        {isElementVisible('accounts-sec-hero') && (
          <div className="relative text-center">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleAccountsVisibilityToggle('accounts-sec-hero', true); }}
              className="absolute right-0 top-0 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide hero section"
              aria-label="Hide hero section"
            >
              x
            </button>
          )}
          {isElementVisible('accounts-el-hero-icon') && (
            <div className="inline-block p-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full mb-4">
              <div className="bg-white rounded-full p-4 text-4xl">💼</div>
            </div>
          )}
          {isElementVisible('accounts-el-hero-title') && (
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">Accounts Management</h1>
          )}
          {isElementVisible('accounts-el-hero-description') && (
            <p className="text-sm sm:text-base md:text-lg text-gray-600 mt-2 px-2">Manage company account books, GRN payments, and petty cash.</p>
          )}
          {isElementVisible('accounts-el-live-badge') && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              Live backend table data
            </div>
          )}
        </div>
        )}

        {isElementVisible('accounts-sec-modules') && (
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleAccountsVisibilityToggle('accounts-sec-modules', true); }}
              className="absolute -right-2 -top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide module cards"
              aria-label="Hide module cards"
            >
              x
            </button>
          )}
          {modules.map((module) => (
            isElementVisible(module.key) ? (
              <Link
                key={module.title}
                href={module.href}
                className="group relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl border border-white/30 p-6 transition-all hover:-translate-y-1"
              >
                {showWidgetCloseButtons && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void handleAccountsVisibilityToggle(module.key, true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleAccountsVisibilityToggle(module.key, true);
                      }
                    }}
                    className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                    title={`Hide ${module.title}`}
                    aria-label={`Hide ${module.title}`}
                  >
                    x
                  </span>
                )}
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${module.color} text-white text-2xl flex items-center justify-center`}>{module.icon}</div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{module.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{module.desc}</p>
              </Link>
            ) : null
          ))}
        </div>
        )}

        {isElementVisible('accounts-sec-company-balance-board') && (
          <section className="relative rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleAccountsVisibilityToggle('accounts-sec-company-balance-board', true); }}
              className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide company balance board"
              aria-label="Hide company balance board"
            >
              x
            </button>
          )}
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-cyan-50">
            {isElementVisible('accounts-el-board-title') && (
              <h2 className="text-base font-semibold text-gray-900">Company Balance Board</h2>
            )}
            {isElementVisible('accounts-el-board-description') && (
              <p className="text-xs text-gray-600 mt-1">All company cash, bank account, and cheque account balances.</p>
            )}
          </div>

          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-4 gap-3 border-b border-gray-100 bg-white/70">
            {isElementVisible('accounts-el-stat-total-cash') && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">Total Cash</p>
                <p className="text-lg font-bold text-emerald-800">{money(companySummary.totalCash)}</p>
              </div>
            )}
            {isElementVisible('accounts-el-stat-total-bank') && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-sky-700 font-semibold">Total Bank</p>
                <p className="text-lg font-bold text-sky-800">{money(companySummary.totalBank)}</p>
              </div>
            )}
            {isElementVisible('accounts-el-stat-total-cheque') && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-violet-700 font-semibold">Total Cheque</p>
                <p className="text-lg font-bold text-violet-800">{money(companySummary.totalCheque)}</p>
              </div>
            )}
            {isElementVisible('accounts-el-stat-grand-total') && (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-cyan-700 font-semibold">Grand Total</p>
                <p className="text-lg font-bold text-cyan-800">{money(companySummary.grandTotal)}</p>
              </div>
            )}
          </div>

          {companyBalancesLoading ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">Loading company balances...</div>
          ) : companyBalances.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">No company balance records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {isColumnVisible('accounts-col-company') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Company</th>}
                    {isColumnVisible('accounts-col-cash-balance') && <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Cash Balance</th>}
                    {isColumnVisible('accounts-col-bank-balance') && <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Bank Balance</th>}
                    {isColumnVisible('accounts-col-cheque-balance') && <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Cheque Balance</th>}
                    {isColumnVisible('accounts-col-total') && <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Total</th>}
                    {isColumnVisible('accounts-col-bank-account-balances') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Bank Account Balances</th>}
                    {isColumnVisible('accounts-col-cheque-account-balances') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cheque Account Balances</th>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {companyBalances.map((company, idx) => {
                    const cash = Number(company.current_cash_balance || 0);
                    const bank = Number(company.current_bank_balance || 0);
                    const cheque = Number(company.current_cheque_balance || 0);
                    const rowTotal = cash + bank + cheque;

                    return (
                      <tr key={company.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        {isColumnVisible('accounts-col-company') && <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{company.name}</td>}
                        {isColumnVisible('accounts-col-cash-balance') && <td className="px-4 py-3 text-sm text-right text-emerald-700 font-semibold">{money(cash)}</td>}
                        {isColumnVisible('accounts-col-bank-balance') && <td className="px-4 py-3 text-sm text-right text-sky-700 font-semibold">{money(bank)}</td>}
                        {isColumnVisible('accounts-col-cheque-balance') && <td className="px-4 py-3 text-sm text-right text-violet-700 font-semibold">{money(cheque)}</td>}
                        {isColumnVisible('accounts-col-total') && <td className="px-4 py-3 text-sm text-right text-cyan-700 font-bold">{money(rowTotal)}</td>}
                        {isColumnVisible('accounts-col-bank-account-balances') && <td className="px-4 py-3 align-top">{renderAccountBalances(company.bank_accounts, 'bank')}</td>}
                        {isColumnVisible('accounts-col-cheque-account-balances') && <td className="px-4 py-3 align-top">{renderAccountBalances(company.cheque_accounts, 'cheque')}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}
      </main>
    </div>
  );
}
