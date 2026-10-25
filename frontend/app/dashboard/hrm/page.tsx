'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

export default function HRM() {
  const [token, setToken] = useState('');
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [accessReady, setAccessReady] = useState(false);
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [departmentsCount, setDepartmentsCount] = useState(0);
  const [designationsCount, setDesignationsCount] = useState(0);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [todayAttendance, setTodayAttendance] = useState(0);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [candidatesCount, setCandidatesCount] = useState(0);
  const [totalPayrolls, setTotalPayrolls] = useState(0);
  const [pendingPayrolls, setPendingPayrolls] = useState(0);
  const [processedPayrolls, setProcessedPayrolls] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;

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
    if (token) {
      fetchAccessProfile();
      fetchDashboardData();
    }
  }, [token]);

  const fetchAccessProfile = async () => {
    try {
      const visibilityRes = await axios.get(`${API_URL}/api/feature-visibility`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const hiddenModuleList = Array.isArray(visibilityRes.data?.hidden_modules)
        ? visibilityRes.data.hidden_modules
            .map((moduleId: unknown) => String(moduleId || '').trim())
            .filter(Boolean)
        : [];

      setCanManageFeatureVisibility(Boolean(visibilityRes.data?.can_manage));
      setHiddenModules(Array.from(new Set(hiddenModuleList)));
    } catch (error) {
      console.error('Error fetching HRM access profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    } finally {
      setAccessReady(true);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch all employees
      const employeesResponse = await axios.get(`${API_URL}/api/hr/employees`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 } // Get all employees
      });
      const employeesData = employeesResponse.data.data || employeesResponse.data;
      const totalEmployeesCount = Array.isArray(employeesData) ? employeesData.length : 0;
      const activeEmployeesCount = Array.isArray(employeesData) 
        ? employeesData.filter((emp: any) => emp.status === 'active').length
        : 0;
      setTotalEmployees(totalEmployeesCount);
      setActiveEmployees(activeEmployeesCount);

      // Fetch departments count
      const departmentsResponse = await axios.get(`${API_URL}/api/hr/departments`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 } // Get all departments
      });
      const departmentsCount = departmentsResponse.data.total || 
                               (departmentsResponse.data.data ? departmentsResponse.data.data.length : 0);
      setDepartmentsCount(departmentsCount);

      // Fetch designations count
      const designationsResponse = await axios.get(`${API_URL}/api/hr/designations`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 } // Get all designations
      });
      const designationsCount = designationsResponse.data.total || 
                                 (designationsResponse.data.data ? designationsResponse.data.data.length : 0);
      setDesignationsCount(designationsCount);

      // Fetch today's attendance
      const today = new Date().toISOString().split('T')[0];
      const attendanceResponse = await axios.get(`${API_URL}/api/hr/attendance`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { date: today, per_page: 1000 }
      });
      
      const attendanceData = attendanceResponse.data.data || attendanceResponse.data;
      const todayAttendanceCount = Array.isArray(attendanceData) ? attendanceData.length : 0;
      setTodayAttendance(todayAttendanceCount);
      
      // Calculate attendance rate
      if (Array.isArray(attendanceData) && attendanceData.length > 0) {
        const presentCount = attendanceData.filter((record: any) => record.status === 'present').length;
        const totalRecords = attendanceData.length;
        const rate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;
        setAttendanceRate(rate);
      } else {
        setAttendanceRate(0);
      }

      // Fetch pending leaves
      const leavesResponse = await axios.get(`${API_URL}/api/hr/leaves`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { status: 'pending', per_page: 1000 } // Get all pending leaves
      });
      const leavesData = leavesResponse.data.data || leavesResponse.data;
      const pendingLeavesCount = Array.isArray(leavesData) ? leavesData.length : 0;
      setPendingLeaves(pendingLeavesCount);

      // Fetch candidates count
      const candidatesResponse = await axios.get(`${API_URL}/api/hr/candidates`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 }
      });
      const candidatesData = candidatesResponse.data.data || candidatesResponse.data;
      const totalCandidatesCount = Array.isArray(candidatesData) ? candidatesData.length : 0;
      setCandidatesCount(totalCandidatesCount);

      // Fetch payroll statistics
      const payrollsResponse = await axios.get(`${API_URL}/api/hr/payrolls`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 } // Get all payrolls
      });
      const payrollsData = payrollsResponse.data.data || payrollsResponse.data;
      const totalPayrollsCount = Array.isArray(payrollsData) ? payrollsData.length : 0;
      const pendingPayrollsCount = Array.isArray(payrollsData) 
        ? payrollsData.filter((payroll: any) => payroll.status === 'pending').length
        : 0;
      const processedPayrollsCount = Array.isArray(payrollsData) 
        ? payrollsData.filter((payroll: any) => payroll.status === 'processed').length
        : 0;
      setTotalPayrolls(totalPayrollsCount);
      setPendingPayrolls(pendingPayrollsCount);
      setProcessedPayrolls(processedPayrollsCount);
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Set default values if API fails
      setActiveEmployees(0);
      setAttendanceRate(0);
      setDepartmentsCount(0);
      setDesignationsCount(0);
      setTotalEmployees(0);
      setTodayAttendance(0);
      setPendingLeaves(0);
      setCandidatesCount(0);
      setTotalPayrolls(0);
      setPendingPayrolls(0);
      setProcessedPayrolls(0);
    } finally {
      setLoading(false);
    }
  };

  const hrmModules = [
    {
      id: 'hrm-employees',
      name: 'Employees',
      icon: '👥',
      path: '/dashboard/hrm/employees',
      description: 'Manage employee records',
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'from-blue-50 to-cyan-50',
      getStats: () => loading ? '...' : `${totalEmployees} Employees`
    },
    {
      id: 'hrm-departments',
      name: 'Departments',
      icon: '🏢',
      path: '/dashboard/hrm/departments',
      description: 'Manage company departments',
      color: 'from-green-500 to-emerald-500',
      bgColor: 'from-green-50 to-emerald-50',
      getStats: () => loading ? '...' : `${departmentsCount} Departments`
    },
    {
      id: 'hrm-designations',
      name: 'Designations',
      icon: '👔',
      path: '/dashboard/hrm/designations',
      description: 'Manage job positions',
      color: 'from-purple-500 to-indigo-500',
      bgColor: 'from-purple-50 to-indigo-50',
      getStats: () => loading ? '...' : `${designationsCount} Positions`
    },
    {
      id: 'hrm-attendance',
      name: 'Attendance',
      icon: '📅',
      path: '/dashboard/hrm/attendance',
      description: 'Track employee attendance',
      color: 'from-orange-500 to-red-500',
      bgColor: 'from-orange-50 to-red-50',
      getStats: () => loading ? '...' : `${todayAttendance} Marked Today`
    },
    {
      id: 'hrm-leaves',
      name: 'Leaves',
      icon: '🏖️',
      path: '/dashboard/hrm/leaves',
      description: 'Manage leave requests',
      color: 'from-teal-500 to-green-500',
      bgColor: 'from-teal-50 to-green-50',
      getStats: () => loading ? '...' : `${pendingLeaves} Pending Requests`
    },
    {
      id: 'hrm-candidates',
      name: 'Candidates',
      icon: '🎯',
      path: '/dashboard/hrm/candidates',
      description: 'Manage candidate pipeline and interviews',
      color: 'from-pink-500 to-rose-500',
      bgColor: 'from-pink-50 to-rose-50',
      getStats: () => loading ? '...' : `${candidatesCount} Candidates`
    },
    {
      id: 'hrm-roles',
      name: 'Roles & Privileges',
      icon: '🔐',
      path: '/dashboard/hrm/roles',
      description: 'Manage user roles and permissions',
      color: 'from-indigo-500 to-purple-500',
      bgColor: 'from-indigo-50 to-purple-50',
      getStats: () => loading ? '...' : 'Access Control'
    },
    {
      id: 'hrm-payroll',
      name: 'Payroll',
      icon: '💰',
      path: '/dashboard/hrm/payroll',
      description: 'Process payroll and salaries',
      color: 'from-yellow-500 to-orange-500',
      bgColor: 'from-yellow-50 to-orange-50',
      getStats: () => loading ? '...' : `${pendingPayrolls} Pending`
    },
  ];

  const handleFeatureVisibilityToggle = async (moduleId: string, nextHiddenState: boolean) => {
    if (!canManageFeatureVisibility) {
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
      console.error('Unable to update HRM widget visibility:', error);
      alert('Unable to update widget visibility. Please try again.');
    }
  };

  const visibleHrmModules = hrmModules.filter((module) => {
    return !hiddenModules.includes(module.id);
  });

  const quickActions = [
    { id: 'hrm-quick-add-employee', icon: '➕', title: 'Add Employee', desc: 'New hire' },
    { id: 'hrm-quick-view-reports', icon: '📊', title: 'View Reports', desc: 'Analytics' },
    { id: 'hrm-quick-mark-attendance', icon: '📅', title: 'Mark Attendance', desc: 'Daily check-in' },
    { id: 'hrm-quick-process-payroll', icon: '💰', title: 'Process Payroll', desc: 'Monthly run' },
  ];

  const visibleQuickActions = quickActions.filter((action) => !hiddenModules.includes(action.id));

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {/* Modern Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard" className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Dashboard</span>
              </Link>
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-3 sm:space-x-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>HRM System Active</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  HR
                </div>
                <span className="font-medium text-gray-900 text-sm sm:text-base">Human Resources</span>
              </div>
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
          <div className="inline-block p-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full mb-6">
            <div className="bg-white rounded-full p-4">
              <span className="text-4xl">👥</span>
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
            Human Resource <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Management</span>
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed mb-6 px-1">
            Streamline your workforce management with comprehensive HR tools.
            From employee onboarding to payroll processing, manage everything in one place.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:space-x-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {loading ? '...' : activeEmployees}
              </div>
              <div className="text-sm text-gray-500">Active Employees</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {loading ? '...' : `${attendanceRate}%`}
              </div>
              <div className="text-sm text-gray-500">Attendance Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {loading ? '...' : departmentsCount}
              </div>
              <div className="text-sm text-gray-500">Departments</div>
            </div>
          </div>
        </div>

        {/* HRM Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleHrmModules.map((module, index) => (
            <Link
              key={index}
              href={module.path}
              className="group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer border border-white/20 overflow-hidden transform hover:-translate-y-2 hover:scale-105"
            >
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleFeatureVisibilityToggle(module.id, true);
                  }}
                  className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                  title="Disable widget"
                  aria-label="Disable widget"
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
                  <div className="text-right">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {module.getStats()}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                    {module.name}
                  </h3>
                  <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                    {module.description}
                  </p>
                </div>

                {/* Hover Effect Line */}
                <div className="absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 group-hover:w-full transition-all duration-500"></div>
              </div>

              {/* Floating Particles Effect */}
              <div className="absolute top-4 right-4 w-2 h-2 bg-white/30 rounded-full opacity-0 group-hover:opacity-100 animate-ping"></div>
              <div className="absolute top-8 right-6 w-1 h-1 bg-white/20 rounded-full opacity-0 group-hover:opacity-100 animate-ping animation-delay-300"></div>
            </Link>
          ))}
        </div>

        {visibleHrmModules.length === 0 && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No HRM feature widgets are currently visible. Please contact an administrator.
          </div>
        )}

        {/* Quick Actions Section */}
        <div className="mt-12 bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Quick Actions</h3>
                <p className="text-white/80">Frequently used HR operations</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {visibleQuickActions.map((action, index) => (
                <div
                  key={index}
                  className="group relative bg-white/50 hover:bg-white/80 rounded-xl p-4 border border-white/30 hover:border-white/50 transition-all duration-300 cursor-pointer transform hover:scale-105 text-center"
                >
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleFeatureVisibilityToggle(action.id, true);
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

                  <div className="text-2xl mb-2">{action.icon}</div>
                  <h4 className="font-semibold text-gray-900 group-hover:text-gray-800 transition-colors duration-300 text-sm">
                    {action.title}
                  </h4>
                  <p className="text-xs text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                    {action.desc}
                  </p>
                </div>
              ))}
            </div>
            {visibleQuickActions.length === 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                All quick action widgets are currently hidden.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}