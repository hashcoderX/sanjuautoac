'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

export default function StockManagement() {
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [lowStockItems, setLowStockItems] = useState(0);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [outOfStockItems, setOutOfStockItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

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
      console.error('Error fetching stock dashboard visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleStockVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating stock dashboard widget visibility:', error);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      fetchAccessProfile(storedToken);
    }
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
    if (token) {
      fetchDashboardData();
    }
  }, [token]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [inventoryResponse, suppliersResponse] = await Promise.all([
        axios.get(`${API_URL}/api/stock/inventory`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 }
        }),
        axios.get(`${API_URL}/api/stock/suppliers`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 }
        })
      ]);

      const inventoryItems = inventoryResponse.data?.success
        ? (inventoryResponse.data?.data?.data || inventoryResponse.data?.data || [])
        : [];

      const suppliers = suppliersResponse.data?.success
        ? (suppliersResponse.data?.data?.data || suppliersResponse.data?.data || [])
        : [];

      const lowStockCount = inventoryItems.filter((item: any) => {
        const currentStock = Number(item.current_stock) || 0;
        const minimumStock = Number(item.minimum_stock) || 0;
        return currentStock <= minimumStock;
      }).length;

      const outOfStockCount = inventoryItems.filter((item: any) => (Number(item.current_stock) || 0) <= 0).length;

      setTotalItems(inventoryItems.length);
      setLowStockItems(lowStockCount);
      setTotalSuppliers(suppliers.length);
      setOutOfStockItems(outOfStockCount);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setTotalItems(0);
      setLowStockItems(0);
      setTotalSuppliers(0);
      setOutOfStockItems(0);
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {isElementVisible('stock-el-header') && (
        <div className="bg-white shadow rounded-lg relative">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleStockVisibilityToggle('stock-el-header', true); }}
            className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
            title="Hide stock header"
            aria-label="Hide stock header"
          >
            x
          </button>
        )}
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Stock Management Dashboard
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Monitor and manage your inventory, suppliers, and stock levels.
          </p>
        </div>
      </div>
      )}

      {/* Stats Cards */}
      {isElementVisible('stock-sec-stats') && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {isElementVisible('stock-el-stat-total-items') && (
          <div className="bg-white overflow-hidden shadow rounded-lg relative">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleStockVisibilityToggle('stock-el-stat-total-items', true); }}
              className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide total items stat"
              aria-label="Hide total items stat"
            >
              x
            </button>
          )}
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-bold">📦</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Items
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {totalItems.toLocaleString()}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        )}

        {isElementVisible('stock-el-stat-low-stock') && (
          <div className="bg-white overflow-hidden shadow rounded-lg relative">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleStockVisibilityToggle('stock-el-stat-low-stock', true); }}
              className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide low stock stat"
              aria-label="Hide low stock stat"
            >
              x
            </button>
          )}
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-bold">⚠️</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Low Stock Items
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {lowStockItems}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        )}

        {isElementVisible('stock-el-stat-total-suppliers') && (
          <div className="bg-white overflow-hidden shadow rounded-lg relative">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleStockVisibilityToggle('stock-el-stat-total-suppliers', true); }}
              className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide total suppliers stat"
              aria-label="Hide total suppliers stat"
            >
              x
            </button>
          )}
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-bold">🚚</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Suppliers
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {totalSuppliers}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        )}

        {isElementVisible('stock-el-stat-out-of-stock') && (
          <div className="bg-white overflow-hidden shadow rounded-lg relative">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleStockVisibilityToggle('stock-el-stat-out-of-stock', true); }}
              className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide out of stock stat"
              aria-label="Hide out of stock stat"
            >
              x
            </button>
          )}
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-gray-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-bold">❌</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Out of Stock
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {outOfStockItems}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      )}

      {/* Quick Actions */}
      {isElementVisible('stock-sec-quick-actions') && (
        <div className="bg-white shadow rounded-lg relative">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleStockVisibilityToggle('stock-sec-quick-actions', true); }}
            className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
            title="Hide quick actions section"
            aria-label="Hide quick actions section"
          >
            x
          </button>
        )}
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {isElementVisible('stock-el-action-view-inventory') && (
              <div className="relative">
                {showWidgetCloseButtons && (
                  <button
                    type="button"
                    onClick={() => { void handleStockVisibilityToggle('stock-el-action-view-inventory', true); }}
                    className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                    title="Hide view inventory action"
                    aria-label="Hide view inventory action"
                  >
                    x
                  </button>
                )}
                <Link
                  href="/dashboard/stock/inventory"
                  className="relative block w-full bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors"
                >
                  <div className="flex items-center justify-center">
                    <span className="text-2xl mr-2">📦</span>
                    <span className="text-sm font-medium text-orange-900">View Inventory</span>
                  </div>
                </Link>
              </div>
            )}

            {isElementVisible('stock-el-action-manage-suppliers') && (
              <div className="relative">
                {showWidgetCloseButtons && (
                  <button
                    type="button"
                    onClick={() => { void handleStockVisibilityToggle('stock-el-action-manage-suppliers', true); }}
                    className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                    title="Hide manage suppliers action"
                    aria-label="Hide manage suppliers action"
                  >
                    x
                  </button>
                )}
                <Link
                  href="/dashboard/stock/suppliers"
                  className="relative block w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                >
                  <div className="flex items-center justify-center">
                    <span className="text-2xl mr-2">🚚</span>
                    <span className="text-sm font-medium text-blue-900">Manage Suppliers</span>
                  </div>
                </Link>
              </div>
            )}

            {isElementVisible('stock-el-action-check-levels') && (
              <div className="relative">
                {showWidgetCloseButtons && (
                  <button
                    type="button"
                    onClick={() => { void handleStockVisibilityToggle('stock-el-action-check-levels', true); }}
                    className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                    title="Hide stock levels action"
                    aria-label="Hide stock levels action"
                  >
                    x
                  </button>
                )}
                <Link
                  href="/dashboard/stock/levels"
                  className="relative block w-full bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
                >
                  <div className="flex items-center justify-center">
                    <span className="text-2xl mr-2">📊</span>
                    <span className="text-sm font-medium text-green-900">Check Stock Levels</span>
                  </div>
                </Link>
              </div>
            )}

            {isElementVisible('stock-el-action-generate-reports') && (
              <div className="relative">
                {showWidgetCloseButtons && (
                  <button
                    type="button"
                    onClick={() => { void handleStockVisibilityToggle('stock-el-action-generate-reports', true); }}
                    className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                    title="Hide reports action"
                    aria-label="Hide reports action"
                  >
                    x
                  </button>
                )}
                <Link
                  href="/dashboard/stock/reports"
                  className="relative block w-full bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
                >
                  <div className="flex items-center justify-center">
                    <span className="text-2xl mr-2">📈</span>
                    <span className="text-sm font-medium text-purple-900">Generate Reports</span>
                  </div>
                </Link>
              </div>
            )}

            {isElementVisible('stock-el-action-transfer-outlets') && (
              <div className="relative">
                {showWidgetCloseButtons && (
                  <button
                    type="button"
                    onClick={() => { void handleStockVisibilityToggle('stock-el-action-transfer-outlets', true); }}
                    className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                    title="Hide transfer action"
                    aria-label="Hide transfer action"
                  >
                    x
                  </button>
                )}
                <Link
                  href="/dashboard/stock/transfers"
                  className="relative block w-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg p-4 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                >
                  <div className="flex items-center justify-center">
                    <span className="text-2xl mr-2">🔄</span>
                    <span className="text-sm font-medium text-indigo-900">Transfer to Outlets</span>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Recent Activity Placeholder */}
      {isElementVisible('stock-sec-recent-activity') && (
        <div className="bg-white shadow rounded-lg relative">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleStockVisibilityToggle('stock-sec-recent-activity', true); }}
            className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
            title="Hide recent activity section"
            aria-label="Hide recent activity section"
          >
            x
          </button>
        )}
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Recent Activity
          </h3>
          <div className="text-center py-8">
            <div className="text-gray-400 text-sm">
              Recent stock activities will appear here
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}