'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Employee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  mobile?: string;
  branch?: { id: number; name: string };
  department?: { id: number; name: string };
  designation?: { id: number; name: string };
}

interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  in_time: string | null;
  out_time: string | null;
  status: 'present' | 'absent' | 'late' | 'half_day';
  work_hours: number | null;
  notes: string | null;
  employee: Employee;
}

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

export default function AttendancePage() {
  type NoticeTone = 'success' | 'error' | 'info';

  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'mark' | 'upload' | 'history'>('mark');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [todayAttendance, setTodayAttendance] = useState<{[key: number]: AttendanceRecord}>({});
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [markingEmployee, setMarkingEmployee] = useState<Employee | null>(null);
  const [markStatus, setMarkStatus] = useState<'present' | 'absent' | 'late' | 'half_day'>('present');
  const [markInTime, setMarkInTime] = useState('');
  const [markNotes, setMarkNotes] = useState('');
  const [showMarkOutModal, setShowMarkOutModal] = useState(false);
  const [markingOutAttendance, setMarkingOutAttendance] = useState<AttendanceRecord | null>(null);
  const [markOutTimeInput, setMarkOutTimeInput] = useState('');
  const [markOutNotes, setMarkOutNotes] = useState('');
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; tone: NoticeTone } | null>(null);
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;

  const isColumnVisible = (key: string) => !hiddenModules.includes(key);
  const isElementVisible = (key: string) => !hiddenModules.includes(key);

  const openNoticeModal = (tone: NoticeTone, title: string, message: string) => {
    setNoticeModal({ tone, title, message });
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
      console.error('Error fetching attendance page visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleAttendanceVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating attendance widget visibility:', error);
      openNoticeModal('error', 'Update Failed', 'Unable to update widget visibility. Please try again.');
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      fetchAccessProfile(storedToken);
      fetchEmployees(storedToken);
      fetchTodayAttendance(storedToken);
    }
  }, [router]);

  const fetchEmployees = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get(`${API_URL}/api/hr/employees`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      const rows = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      setEmployees(rows);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    }
  };

  const fetchTodayAttendance = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(`${API_URL}/api/hr/attendance?date=${today}`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      const attendanceMap: {[key: number]: AttendanceRecord} = {};
      response.data.data.forEach((record: AttendanceRecord) => {
        attendanceMap[record.employee_id] = record;
      });
      setTodayAttendance(attendanceMap);
    } catch (error) {
      console.error('Error fetching today\'s attendance:', error);
    }
  };

  const markAttendance = async (
    employeeId: number,
    status: 'present' | 'absent' | 'late' | 'half_day',
    inTime?: string,
    outTime?: string,
    notes?: string
  ) => {
    if (!token) return;
    setLoading(true);
    try {
      const payload: any = { 
        employee_id: employeeId, 
        status 
      };
      
      if (inTime) payload.in_time = inTime;
      if (outTime) payload.out_time = outTime;
      if (notes) payload.notes = notes;

      await axios.post(
        `${API_URL}/api/hr/attendance/mark`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      openNoticeModal('success', 'Attendance Marked', `Marked ${status} successfully.`);
      // Refresh today's attendance data
      fetchTodayAttendance();
      // Close modal if open
      setShowMarkModal(false);
      resetMarkForm();
    } catch (error: any) {
      console.error('Error marking attendance:', error);
      
      let errorMessage = 'Failed to mark attendance.';
      
      if (error.response?.status === 409) {
        errorMessage = error.response.data?.message || 'Attendance already marked for this employee today.';
      } else if (error.response?.status === 422) {
        errorMessage = 'Validation error: ' + (error.response.data?.errors ? Object.values(error.response.data.errors).flat().join(', ') : error.response.data?.message);
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error: ' + (error.response.data?.message || 'Internal server error');
      } else {
        errorMessage = error.response?.data?.message || error.response?.data?.error || errorMessage;
      }
      
      openNoticeModal('error', 'Attendance Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const openMarkModal = (employee: Employee, status: 'present' | 'absent' | 'late' | 'half_day' = 'present') => {
    setMarkingEmployee(employee);
    setMarkStatus(status);
    setShowMarkModal(true);
  };

  const resetMarkForm = () => {
    setMarkingEmployee(null);
    setMarkStatus('present');
    setMarkInTime('');
    setMarkNotes('');
  };

  const handleMarkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!markingEmployee) return;
    markAttendance(markingEmployee.id, markStatus, markInTime || undefined, undefined, markNotes || undefined);
  };

  const openMarkOutModal = (attendance: AttendanceRecord) => {
    setMarkingOutAttendance(attendance);
    setMarkOutTimeInput('');
    setMarkOutNotes('');
    setShowMarkOutModal(true);
  };

  const markOut = async (attendanceId: number, outTime: string, notes?: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const payload: any = { 
        employee_id: markingOutAttendance?.employee_id,
        out_time: outTime,
        date: markingOutAttendance?.date
          ? String(markingOutAttendance.date).split('T')[0]
          : new Date().toISOString().split('T')[0]
      };
      
      if (notes) payload.notes = notes;

      await axios.post(
        `${API_URL}/api/hr/attendance/mark-out`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      openNoticeModal('success', 'Marked Out', 'Marked out successfully.');
      // Refresh today's attendance data
      fetchTodayAttendance();
      setShowMarkOutModal(false);
    } catch (error: any) {
      console.error('Error marking out:', error);
      if (error.response?.status === 409) {
        openNoticeModal('error', 'Mark Out Error', error.response.data.message || 'Attendance is already marked out.');
      } else if (error.response?.status === 404) {
        openNoticeModal('error', 'Mark Out Error', error.response.data.message || 'Attendance record not found.');
      } else {
        openNoticeModal('error', 'Mark Out Error', 'Failed to mark out.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMarkOutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!markingOutAttendance || !markOutTimeInput) return;
    markOut(markingOutAttendance.id, markOutTimeInput, markOutNotes || undefined);
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      openNoticeModal('info', 'CSV Required', 'Please select a CSV file first.');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append('csv_file', csvFile);

    try {
      const response = await axios.post(
        `${API_URL}/api/hr/attendance/upload-csv`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setUploadResult(response.data);
      openNoticeModal(
        'success',
        'Upload Completed',
        `Upload processed. Created ${response.data.created_records || 0}, Updated ${response.data.updated_records || 0}.`
      );
      fetchTodayAttendance();
    } catch (error: any) {
      console.error('Error uploading CSV:', error);
      openNoticeModal('error', 'Upload Failed', 'Failed to upload CSV: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceHistory = async () => {
    if (!selectedEmployee) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await axios.get(
        `${API_URL}/api/hr/attendance/employee/${selectedEmployee.id}?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAttendanceHistory(response.data.attendance);
    } catch (error) {
      console.error('Error fetching attendance history:', error);
      openNoticeModal('error', 'History Error', 'Failed to fetch attendance history.');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(e => {
    const term = search.toLowerCase();
    return (
      e.first_name.toLowerCase().includes(term) ||
      e.last_name.toLowerCase().includes(term) ||
      e.email.toLowerCase().includes(term) ||
      e.employee_code.toLowerCase().includes(term)
    );
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-rose-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-rose-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <button onClick={() => router.push('/dashboard/hrm')} className="flex items-center space-x-2 text-gray-700 hover:text-orange-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to HRM</span>
              </button>
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                AT
              </div>
              <span className="font-medium text-gray-900 text-sm sm:text-base">Attendance</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        {isElementVisible('hrm-attendance-el-title') && (
          <div className="relative text-center mb-8">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-el-title', true); }}
                className="absolute top-0 right-0 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                title="Hide section"
                aria-label="Hide attendance title section"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
            <div className="inline-block p-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full mb-6">
              <div className="bg-white rounded-full p-4">
                <span className="text-4xl">📅</span>
              </div>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-3">
              Attendance <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Manager</span>
            </h2>
            <p className="text-base sm:text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed px-1">
              Manage employee attendance with quick marking, CSV uploads, and history tracking.
            </p>
          </div>
        )}

        {/* Tabs */}
        {isElementVisible('hrm-attendance-el-tabs') && (
          <div className="relative mb-6 flex justify-center">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-el-tabs', true); }}
                className="absolute -top-2 right-0 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                title="Hide tabs"
                aria-label="Hide tabs section"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
            <div className="bg-white/70 backdrop-blur-sm rounded-full p-1 shadow-lg inline-flex max-w-full overflow-x-auto">
            <button
              onClick={() => setActiveTab('mark')}
              className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                activeTab === 'mark'
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Quick Mark
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                activeTab === 'upload'
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              CSV Upload
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                activeTab === 'history'
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              View History
            </button>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'mark' && (
          <>
            {/* Controls */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                {isElementVisible('hrm-attendance-el-search') && (
                  <div className="relative w-full md:w-80">
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-el-search', true); }}
                        className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                        title="Hide search"
                        aria-label="Hide employee search"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    )}
                    <input
                      type="text"
                      placeholder="Search employees..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full px-4 py-2 rounded-full border border-white/20 bg-white/70 backdrop-blur-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                )}
              </div>
              {isElementVisible('hrm-attendance-el-count') && (
                <div className="relative text-sm text-gray-600">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-el-count', true); }}
                      className="absolute -top-2 -right-7 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide count"
                      aria-label="Hide employee count"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  {loading ? 'Updating attendance...' : `${filteredEmployees.length} employees listed`}
                </div>
              )}
            </div>

            {/* Employees Table */}
            {isElementVisible('hrm-attendance-sec-mark-table') && (
            <div className="relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-sec-mark-table', true); }}
                  className="absolute top-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                  title="Hide section"
                  aria-label="Hide quick mark table section"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/30">
                  <thead className="bg-gradient-to-r from-orange-500 to-red-500 text-white">
                    <tr>
                      {isColumnVisible('hrm-attendance-col-code') && (
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <span>Code</span>
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-col-code', true); }}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                                title="Hide Code column"
                                aria-label="Hide Code column"
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
                      {isColumnVisible('hrm-attendance-col-name') && (
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <span>Name</span>
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-col-name', true); }}
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
                      {isColumnVisible('hrm-attendance-col-email') && (
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <span>Email</span>
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-col-email', true); }}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                                title="Hide Email column"
                                aria-label="Hide Email column"
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
                      {isColumnVisible('hrm-attendance-col-phone') && (
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <span>Phone</span>
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-col-phone', true); }}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                                title="Hide Phone column"
                                aria-label="Hide Phone column"
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
                      {isColumnVisible('hrm-attendance-col-in-time') && (
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <span>In Time</span>
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-col-in-time', true); }}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                                title="Hide In Time column"
                                aria-label="Hide In Time column"
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
                      {isColumnVisible('hrm-attendance-col-out-time') && (
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <span>Out Time</span>
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-col-out-time', true); }}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                                title="Hide Out Time column"
                                aria-label="Hide Out Time column"
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
                      {isColumnVisible('hrm-attendance-col-status') && (
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <span>Today's Status</span>
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-col-status', true); }}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                                title="Hide Status column"
                                aria-label="Hide Status column"
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
                      {isColumnVisible('hrm-attendance-col-actions') && (
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <span>Actions</span>
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-col-actions', true); }}
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
                  <tbody className="bg-white/60 divide-y divide-white/30">
                    {filteredEmployees.map((emp) => {
                      const attendance = todayAttendance[emp.id];
                      const isMarked = !!attendance;
                      
                      return (
                        <tr key={emp.id} className={`hover:bg-white/80 ${
                          isMarked 
                            ? attendance.status === 'present' ? 'bg-green-50/50' :
                              attendance.status === 'absent' ? 'bg-red-50/50' :
                              attendance.status === 'late' ? 'bg-yellow-50/50' :
                              'bg-blue-50/50'
                            : ''
                        }`}>
                          {isColumnVisible('hrm-attendance-col-code') && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.employee_code}</td>
                          )}
                          {isColumnVisible('hrm-attendance-col-name') && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.first_name} {emp.last_name}</td>
                          )}
                          {isColumnVisible('hrm-attendance-col-email') && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{emp.email}</td>
                          )}
                          {isColumnVisible('hrm-attendance-col-phone') && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{emp.phone || emp.mobile || '-'}</td>
                          )}
                          {isColumnVisible('hrm-attendance-col-in-time') && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {isMarked && attendance.in_time ? attendance.in_time : '-'}
                            </td>
                          )}
                          {isColumnVisible('hrm-attendance-col-out-time') && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {isMarked && attendance.out_time ? attendance.out_time : '-'}
                            </td>
                          )}
                          {isColumnVisible('hrm-attendance-col-status') && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {isMarked ? (
                              <div className="flex items-center space-x-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  attendance.status === 'present' ? 'bg-green-100 text-green-800' :
                                  attendance.status === 'absent' ? 'bg-red-100 text-red-800' :
                                  attendance.status === 'late' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {attendance.status.replace('_', ' ').toUpperCase()}
                                </span>
                                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">Not marked</span>
                            )}
                            </td>
                          )}
                          {isColumnVisible('hrm-attendance-col-actions') && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => openMarkModal(emp, 'present')}
                                disabled={isMarked || loading}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                  isMarked 
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                    : 'bg-green-500 text-white hover:bg-green-600'
                                }`}
                              >
                                Present
                              </button>
                              <button
                                onClick={() => openMarkModal(emp, 'absent')}
                                disabled={isMarked || loading}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                  isMarked 
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                    : 'bg-red-500 text-white hover:bg-red-600'
                                }`}
                              >
                                Absent
                              </button>
                              <button
                                onClick={() => openMarkModal(emp, 'late')}
                                disabled={isMarked || loading}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                  isMarked 
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                    : 'bg-yellow-500 text-white hover:bg-yellow-600'
                                }`}
                              >
                                Late
                              </button>
                              <button
                                onClick={() => openMarkModal(emp, 'half_day')}
                                disabled={isMarked || loading}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                  isMarked 
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                    : 'bg-blue-500 text-white hover:bg-blue-600'
                                }`}
                              >
                                Half Day
                              </button>
                              {isMarked && attendance.status === 'present' && !attendance.out_time && (
                                <button
                                  onClick={() => openMarkOutModal(attendance)}
                                  disabled={loading}
                                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors bg-purple-500 text-white hover:bg-purple-600"
                                >
                                  Mark Out
                                </button>
                              )}
                            </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </>
        )}

        {activeTab === 'upload' && isElementVisible('hrm-attendance-sec-upload') && (
          <div className="relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-8">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-sec-upload', true); }}
                className="absolute top-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                title="Hide section"
                aria-label="Hide upload section"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Upload Attendance CSV</h3>
            <p className="text-gray-600 mb-6">
              Upload a CSV from your fingerprint machine. Supported headers include both legacy format and fingerprint format.
            </p>
            <div className="mb-6 p-4 rounded-xl bg-orange-50 border border-orange-200 text-sm text-gray-700">
              <p className="font-semibold text-orange-800 mb-2">Fingerprint sample format:</p>
              <p>Employee_ID, Employee_Name, Date, Check_In, Check_Out, Total_Hours, Status, Device_ID</p>
            </div>
            <div className="mb-6">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              />
            </div>
            <button
              onClick={handleCsvUpload}
              disabled={!csvFile || loading}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-medium hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Uploading...' : 'Upload CSV'}
            </button>
            {uploadResult && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-800">Upload Result</h4>
                <p className="text-green-700">Created {uploadResult.created_records || 0} records</p>
                <p className="text-green-700">Updated {uploadResult.updated_records || 0} records</p>
                {typeof uploadResult.skipped_rows === 'number' && (
                  <p className="text-amber-700">Skipped empty rows: {uploadResult.skipped_rows}</p>
                )}
                {uploadResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-red-700 font-semibold">Errors:</p>
                    <ul className="list-disc list-inside text-red-600">
                      {uploadResult.errors.map((error: string, index: number) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && isElementVisible('hrm-attendance-sec-history') && (
          <div className="relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-8">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handleAttendanceVisibilityToggle('hrm-attendance-sec-history', true); }}
                className="absolute top-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                title="Hide section"
                aria-label="Hide history section"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Attendance History</h3>
            <div className="mb-6 flex flex-col md:flex-row gap-4">
              <select
                value={selectedEmployee?.id || ''}
                onChange={(e) => {
                  const emp = employees.find(emp => emp.id === parseInt(e.target.value));
                  setSelectedEmployee(emp || null);
                }}
                className="px-4 py-2 rounded-full border border-white/20 bg-white/70 backdrop-blur-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employee_code} - {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2 rounded-full border border-white/20 bg-white/70 backdrop-blur-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Start Date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 rounded-full border border-white/20 bg-white/70 backdrop-blur-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="End Date"
              />
              <button
                onClick={fetchAttendanceHistory}
                disabled={!selectedEmployee || loading}
                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-medium hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'View History'}
              </button>
            </div>
            {attendanceHistory.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/30">
                  <thead className="bg-gradient-to-r from-orange-500 to-red-500 text-white">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">In Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Out Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Work Hours</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/60 divide-y divide-white/30">
                    {attendanceHistory.map((record) => (
                      <tr key={record.id} className="hover:bg-white/80">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.in_time || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.out_time || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            record.status === 'present' ? 'bg-green-100 text-green-800' :
                            record.status === 'absent' ? 'bg-red-100 text-red-800' :
                            record.status === 'late' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {record.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.work_hours || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Feedback Modal */}
      {noticeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold ${
                  noticeModal.tone === 'success'
                    ? 'bg-green-500'
                    : noticeModal.tone === 'error'
                      ? 'bg-red-500'
                      : 'bg-orange-500'
                }`}>
                  {noticeModal.tone === 'success' ? '✓' : noticeModal.tone === 'error' ? '!' : 'i'}
                </div>
                <h3 className="text-xl font-bold text-gray-900">{noticeModal.title}</h3>
              </div>
              <p className="text-gray-700 leading-relaxed">{noticeModal.message}</p>
              <div className="flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => setNoticeModal(null)}
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Marking Modal */}
      {showMarkModal && markingEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Mark Attendance for {markingEmployee.first_name} {markingEmployee.last_name}
              </h3>
              <form onSubmit={handleMarkSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={markStatus}
                      onChange={(e) => setMarkStatus(e.target.value as 'present' | 'absent' | 'late' | 'half_day')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="late">Late</option>
                      <option value="half_day">Half Day</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      In Time
                    </label>
                    <input
                      type="time"
                      value={markInTime}
                      onChange={(e) => setMarkInTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={markNotes}
                      onChange={(e) => setMarkNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Add any additional notes..."
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowMarkModal(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Marking...' : 'Mark Attendance'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Mark Out Modal */}
      {showMarkOutModal && markingOutAttendance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Mark Out for {markingOutAttendance.employee.first_name} {markingOutAttendance.employee.last_name}
              </h3>
              <form onSubmit={handleMarkOutSubmit}>
                <div className="space-y-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>In Time:</strong> {markingOutAttendance.in_time || 'Not set'}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Status:</strong> {markingOutAttendance.status.replace('_', ' ').toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Out Time *
                    </label>
                    <input
                      type="time"
                      value={markOutTimeInput}
                      onChange={(e) => setMarkOutTimeInput(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={markOutNotes}
                      onChange={(e) => setMarkOutNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Add any additional notes..."
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowMarkOutModal(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !markOutTimeInput}
                    className="px-6 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Marking Out...' : 'Mark Out'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
