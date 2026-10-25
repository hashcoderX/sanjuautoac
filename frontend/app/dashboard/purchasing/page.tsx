'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useRouter } from 'next/navigation';

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

export default function PurchasingPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierCount, setSupplierCount] = useState(0);
  const [grnCount, setGrnCount] = useState(0);
  const [postPaymentGrnCount, setPostPaymentGrnCount] = useState(0);
  const router = useRouter();

  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;
  const isElementVisible = (key: string) => !hiddenModules.includes(key);

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

  const fetchAccessProfile = async (authToken: string) => {
    try {
      const [userRes, visibilityRes] = await Promise.all([
        axios.get(`${API_URL}/api/user`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        axios.get(`${API_URL}/api/feature-visibility`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
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
      console.error('Error fetching purchasing visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handlePurchasingVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating purchasing widget visibility:', error);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
    fetchAccessProfile(storedToken);
  }, [router]);

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
    if (!token) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const [suppliersRes, grnRes, postPaymentGrnRes] = await Promise.all([
          axios.get(`${API_URL}/api/stock/suppliers`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { per_page: 1000 },
          }),
          axios.get(`${API_URL}/api/purchasing/grn`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { per_page: 1, page: 1 },
          }),
          axios.get(`${API_URL}/api/purchasing/grn`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { per_page: 1, page: 1, payment_timing: 'post_payment' },
          }),
        ]);

        const suppliers = suppliersRes.data?.success
          ? (suppliersRes.data?.data?.data || suppliersRes.data?.data || [])
          : [];
        const grnPayload = grnRes.data?.success ? grnRes.data.data : grnRes.data;
        const postPaymentPayload = postPaymentGrnRes.data?.success
          ? postPaymentGrnRes.data.data
          : postPaymentGrnRes.data;

        setSupplierCount(suppliers.length);
        setGrnCount(Number(grnPayload?.total) || 0);
        setPostPaymentGrnCount(Number(postPaymentPayload?.total) || 0);
      } catch (error) {
        console.error('Error loading purchasing stats:', error);
        setSupplierCount(0);
        setGrnCount(0);
        setPostPaymentGrnCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [token]);

  if (!token || loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isElementVisible('purchasing-el-hero') && (
        <div className="bg-white shadow rounded-lg relative">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handlePurchasingVisibilityToggle('purchasing-el-hero', true); }}
              className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide purchasing header"
              aria-label="Hide purchasing header"
            >
              x
            </button>
          )}
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Purchasing Dashboard</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Fresh purchasing workspace built with the Manage Stock style.
            </p>
          </div>
        </div>
      )}

      {isElementVisible('purchasing-sec-stats') && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {isElementVisible('purchasing-el-stat-suppliers') && (
            <div className="bg-white overflow-hidden shadow rounded-lg relative">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePurchasingVisibilityToggle('purchasing-el-stat-suppliers', true); }}
                  className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                  title="Hide suppliers stat"
                  aria-label="Hide suppliers stat"
                >
                  x
                </button>
              )}
              <div className="p-5">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-cyan-500 rounded-md flex items-center justify-center text-white text-sm font-bold">🚚</div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Suppliers</p>
                    <p className="text-lg font-medium text-gray-900">{supplierCount}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {isElementVisible('purchasing-el-stat-total-grns') && (
            <div className="bg-white overflow-hidden shadow rounded-lg relative">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePurchasingVisibilityToggle('purchasing-el-stat-total-grns', true); }}
                  className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                  title="Hide total GRNs stat"
                  aria-label="Hide total GRNs stat"
                >
                  x
                </button>
              )}
              <div className="p-5">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center text-white text-sm font-bold">📥</div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Total GRNs</p>
                    <p className="text-lg font-medium text-gray-900">{grnCount}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {isElementVisible('purchasing-el-stat-post-payment-grns') && (
            <div className="bg-white overflow-hidden shadow rounded-lg relative">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePurchasingVisibilityToggle('purchasing-el-stat-post-payment-grns', true); }}
                  className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                  title="Hide post-payment GRNs stat"
                  aria-label="Hide post-payment GRNs stat"
                >
                  x
                </button>
              )}
              <div className="p-5">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-emerald-500 rounded-md flex items-center justify-center text-white text-sm font-bold">💳</div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Post-Payment GRNs</p>
                    <p className="text-lg font-medium text-gray-900">{postPaymentGrnCount}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isElementVisible('purchasing-sec-quick-actions') && (
        <div className="bg-white shadow rounded-lg relative">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handlePurchasingVisibilityToggle('purchasing-sec-quick-actions', true); }}
              className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide quick actions"
              aria-label="Hide quick actions"
            >
              x
            </button>
          )}
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {isElementVisible('purchasing-el-action-direct-grn') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handlePurchasingVisibilityToggle('purchasing-el-action-direct-grn', true); }}
                      className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                      title="Hide direct GRN action"
                      aria-label="Hide direct GRN action"
                    >
                      x
                    </button>
                  )}
                  <Link
                    href="/dashboard/purchasing/grn"
                    className="relative block w-full bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg p-4 text-center transition-colors"
                  >
                    <div className="flex items-center justify-center">
                      <span className="text-2xl mr-2">📥</span>
                      <span className="text-sm font-medium text-cyan-900">Direct GRN</span>
                    </div>
                  </Link>
                </div>
              )}
              {isElementVisible('purchasing-el-action-manage-suppliers') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handlePurchasingVisibilityToggle('purchasing-el-action-manage-suppliers', true); }}
                      className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                      title="Hide manage suppliers action"
                      aria-label="Hide manage suppliers action"
                    >
                      x
                    </button>
                  )}
                  <Link
                    href="/dashboard/stock/suppliers"
                    className="relative block w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 text-center transition-colors"
                  >
                    <div className="flex items-center justify-center">
                      <span className="text-2xl mr-2">🚚</span>
                      <span className="text-sm font-medium text-blue-900">Manage Suppliers</span>
                    </div>
                  </Link>
                </div>
              )}
              {isElementVisible('purchasing-el-action-grn-payments') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handlePurchasingVisibilityToggle('purchasing-el-action-grn-payments', true); }}
                      className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                      title="Hide GRN payments action"
                      aria-label="Hide GRN payments action"
                    >
                      x
                    </button>
                  )}
                  <Link
                    href="/dashboard/accounts/grn-payments"
                    className="relative block w-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg p-4 text-center transition-colors"
                  >
                    <div className="flex items-center justify-center">
                      <span className="text-2xl mr-2">💳</span>
                      <span className="text-sm font-medium text-emerald-900">GRN Payments</span>
                    </div>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
