'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Department {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

type DialogMode = 'alert' | 'confirm';

type DialogState = {
  open: boolean;
  mode: DialogMode;
  title: string;
  message: string;
  onConfirm?: (() => void | Promise<void>) | null;
};

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

export default function Departments() {
  const [token, setToken] = useState('');
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    mode: 'alert',
    title: '',
    message: '',
    onConfirm: null,
  });
  const router = useRouter();
  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;

  const showAlertDialog = (message: string, title = 'Notice') => {
    setDialog({
      open: true,
      mode: 'alert',
      title,
      message,
      onConfirm: null,
    });
  };

  const showConfirmDialog = (
    message: string,
    onConfirm: () => void | Promise<void>,
    title = 'Confirm Action'
  ) => {
    setDialog({
      open: true,
      mode: 'confirm',
      title,
      message,
      onConfirm,
    });
  };

  const closeDialog = () => {
    setDialog((prev) => ({ ...prev, open: false, onConfirm: null }));
  };

  const handleDialogConfirm = async () => {
    const confirmAction = dialog.onConfirm;
    closeDialog();
    if (confirmAction) {
      await confirmAction();
    }
  };

  const applyWidgetsFixed = (nextValue: boolean) => {
    setWidgetsFixed(nextValue);
    localStorage.setItem(GLOBAL_WIDGET_FIX_KEY, nextValue ? '1' : '0');
    window.dispatchEvent(new CustomEvent('widgets-fixed-changed', { detail: { fixed: nextValue } }));
  };

  const isColumnVisible = (key: string) => !hiddenModules.includes(key);
  const isElementVisible = (key: string) => !hiddenModules.includes(key);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const filteredDepartments = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return departments;

    return departments.filter((department) =>
      department.name?.toLowerCase().includes(keyword) ||
      String(department.description || '').toLowerCase().includes(keyword)
    );
  }, [departments, searchTerm]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredDepartments.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredDepartments.length);
  const paginatedDepartments = filteredDepartments.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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
      console.error('Error fetching department page visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleDepartmentVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating department widget visibility:', error);
      showAlertDialog('Unable to update widget visibility. Please try again.', 'Visibility Update Failed');
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      setApiError(null);
      fetchAccessProfile(storedToken);
      fetchDepartments(storedToken);
    }
  }, [router]);

  const fetchDepartments = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    
    try {
      const response = await axios.get(`${API_URL}/api/hr/departments`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setDepartments(response.data.data || []);
      setCurrentPage(1);
    } catch (error) {
      const err: any = error;
      console.error('Error fetching departments:', err?.response?.status, err?.response?.data || err?.message);
      setApiError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        `Failed to fetch departments (${err?.response?.status || 'network error'})`
      );
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setEditingDepartment(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const departmentData = {
      name,
      description,
    };

    try {
      if (editingDepartment) {
        await axios.put(`${API_URL}/api/hr/departments/${editingDepartment.id}`, departmentData, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
      } else {
        await axios.post(`${API_URL}/api/hr/departments`, departmentData, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
      }
      fetchDepartments();
      setShowForm(false);
      resetForm();
    } catch (error) {
      const err: any = error;
      console.error('Error saving department:', err?.response?.status, err?.response?.data || err?.message);
      showAlertDialog(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Failed to save department. Please try again.',
        'Save Failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (department: Department) => {
    setEditingDepartment(department);
    setName(department.name);
    setDescription(department.description);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    showConfirmDialog(
      'Are you sure you want to delete this department?',
      async () => {
        try {
          await axios.delete(`${API_URL}/api/hr/departments/${id}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          });
          fetchDepartments();
        } catch (error) {
          const err: any = error;
          console.error('Error deleting department:', err?.response?.status, err?.response?.data || err?.message);
          showAlertDialog('Failed to delete department. Please try again.', 'Delete Failed');
        }
      },
      'Delete Department'
    );
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (!token) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {/* Modern Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <button
                onClick={() => router.push('/dashboard/hrm')}
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors duration-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium text-sm sm:text-base">Back to HRM</span>
              </button>
            </div>
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  🏢
                </div>
                <span className="font-medium text-gray-900">Department Management</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
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
        {apiError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3">
            {apiError}
          </div>
        )}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            {isElementVisible('hrm-departments-el-title') && (
              <div className="relative flex items-center space-x-3 mb-4">
                {showWidgetCloseButtons && (
                  <button
                    type="button"
                    onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-el-title', true); }}
                    className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                    title="Hide section"
                    aria-label="Hide title section"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-2xl shadow-lg">
                  🏢
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">Department Management</h2>
                  <p className="text-sm sm:text-base md:text-lg text-gray-600">Organize your company structure with modern controls</p>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-4 sm:space-x-6 sm:gap-0 mt-2 sm:mt-4">
              {isElementVisible('hrm-departments-el-stat-total') && (
                <div className="relative text-center">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-el-stat-total', true); }}
                      className="absolute -top-2 -right-3 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide stat"
                      aria-label="Hide total departments stat"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  <div className="text-xl sm:text-2xl font-bold text-blue-600">{departments.length}</div>
                  <div className="text-sm text-gray-500">Total Departments</div>
                </div>
              )}
            </div>
          </div>
          {isElementVisible('hrm-departments-el-btn-add') && (
            <div className="md:flex-shrink-0 relative">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-el-btn-add', true); }}
                  className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                  title="Hide add button"
                  aria-label="Hide add department button"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="w-full md:w-auto bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Add Department</span>
              </button>
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">🏢</div>
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {editingDepartment ? 'Edit Department' : 'Add New Department'}
                      </h3>
                      <p className="text-white/80">
                        {editingDepartment ? 'Update department information' : 'Create a new department'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowForm(false)}
                    className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Department Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-6 py-3 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                      {loading ? 'Saving...' : (editingDepartment ? 'Update Department' : 'Create Department')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {isElementVisible('hrm-departments-sec-table') && (
        <div className="relative bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 overflow-hidden">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-sec-table', true); }}
              className="absolute top-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
              title="Hide section"
              aria-label="Hide table section"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>Department List</span>
            </h3>
          </div>

          <div className="px-6 py-4 border-b border-gray-200 bg-white/70">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              {isElementVisible('hrm-departments-el-filter-search') && (
                <div className="relative w-full sm:max-w-md">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-el-filter-search', true); }}
                      className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide search"
                      aria-label="Hide search filter"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter by department name or description"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
              )}
              {isElementVisible('hrm-departments-el-btn-reset') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-el-btn-reset', true); }}
                      className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide reset"
                      aria-label="Hide reset button"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  {isColumnVisible('hrm-departments-col-name') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>Name</span>
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-col-name', true); }}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                            title="Hide Name column"
                            aria-label="Hide Name column"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </th>
                  )}
                  {isColumnVisible('hrm-departments-col-description') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>Description</span>
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-col-description', true); }}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                            title="Hide Description column"
                            aria-label="Hide Description column"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </th>
                  )}
                  {isColumnVisible('hrm-departments-col-created') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>Created</span>
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-col-created', true); }}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                            title="Hide Created column"
                            aria-label="Hide Created column"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </th>
                  )}
                  {isColumnVisible('hrm-departments-col-actions') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>Actions</span>
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleDepartmentVisibilityToggle('hrm-departments-col-actions', true); }}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                            title="Hide Actions column"
                            aria-label="Hide Actions column"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedDepartments.map((department) => (
                  <tr key={department.id} className="hover:bg-gray-50 transition-colors duration-200">
                    {isColumnVisible('hrm-departments-col-name') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {department.name}
                      </td>
                    )}
                    {isColumnVisible('hrm-departments-col-description') && (
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {department.description || 'No description'}
                      </td>
                    )}
                    {isColumnVisible('hrm-departments-col-created') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(department.created_at).toLocaleDateString()}
                      </td>
                    )}
                    {isColumnVisible('hrm-departments-col-actions') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleEdit(department)}
                          className="inline-flex items-center px-3 py-1 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors duration-200 mr-2"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(department.id)}
                          className="inline-flex items-center px-3 py-1 rounded-lg text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors duration-200"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 bg-white/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-600">
              Showing {filteredDepartments.length === 0 ? 0 : startIndex + 1} to {endIndex} of {filteredDepartments.length} departments
              {filteredDepartments.length !== departments.length ? ` (filtered from ${departments.length})` : ''}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <span className="text-sm text-gray-700 px-2">
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
        )}

      </main>

      {dialog.open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{dialog.title}</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">{dialog.message}</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
              {dialog.mode === 'confirm' && (
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={dialog.mode === 'confirm' ? () => { void handleDialogConfirm(); } : closeDialog}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:from-blue-700 hover:to-cyan-700"
              >
                {dialog.mode === 'confirm' ? 'Confirm' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}