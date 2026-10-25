'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import imageCompression from 'browser-image-compression';

type JobStatus = 'pending' | 'in_progress' | 'on_hold' | 'completed' | 'delivered' | 'cancelled';
type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

interface EmployeeOption {
  id: number;
  first_name: string;
  last_name: string;
  employee_code?: string;
}

interface JobCardRecord {
  id: number;
  job_card_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  vehicle_no?: string | null;
  chassis_no?: string | null;
  brand?: string | null;
  model?: string | null;
  problem_description: string;
  accessories_received?: string | null;
  inspection_review?: string | null;
  inspection_reviewed_at?: string | null;
  inspected_by_employee_id?: number | null;
  inspected_by_employee?: EmployeeOption | null;
  priority: JobPriority;
  status: JobStatus;
  received_date: string;
  promised_date?: string | null;
  estimated_cost?: number | null;
  advance_amount?: number | null;
  notes?: string | null;
  assigned_employee_id?: number | null;
  assigned_employee_ids?: number[] | null;
  assigned_employee?: EmployeeOption | null;
  assigned_employees?: EmployeeOption[];
  images?: JobCardImageRecord[];
  creator?: { id: number; name?: string; email?: string } | null;
  created_at?: string;
}

interface JobCardImageRecord {
  id: number;
  image_url: string;
  original_name?: string | null;
  mime_type?: string | null;
  size_kb?: number | null;
}

type PendingImage = {
  file: File;
  previewUrl: string;
  originalSize: number;
};

interface SummaryStats {
  active: number;
  pending: number;
  in_progress: number;
  completed_today: number;
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-none';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500';

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatFileSize = (bytes: number) => {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

const employeeName = (emp?: EmployeeOption | null) => {
  if (!emp) return '—';
  return [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '—';
};

const statusBadge = (status: JobStatus) => {
  const map: Record<JobStatus, string> = {
    pending: 'bg-amber-500/15 text-amber-800 ring-amber-500/25',
    in_progress: 'bg-sky-500/15 text-sky-800 ring-sky-500/25',
    on_hold: 'bg-slate-500/15 text-slate-700 ring-slate-500/25',
    completed: 'bg-emerald-500/15 text-emerald-800 ring-emerald-500/25',
    delivered: 'bg-violet-500/15 text-violet-800 ring-violet-500/25',
    cancelled: 'bg-rose-500/15 text-rose-800 ring-rose-500/25',
  };
  return map[status] || map.pending;
};

const priorityBadge = (priority: JobPriority) => {
  const map: Record<JobPriority, string> = {
    low: 'text-slate-500',
    normal: 'text-indigo-600',
    high: 'text-orange-600',
    urgent: 'text-rose-600 font-bold',
  };
  return map[priority] || map.normal;
};

const INSPECTION_QUICK_NOTES = [
  'Engine & fluids checked',
  'Brakes & suspension checked',
  'Electrical & battery checked',
  'Tyres & wheels checked',
  'Body & paint inspected',
  'Interior & A/C checked',
  'Road test completed',
  'No immediate issues found',
];

const STATUS_OPTIONS: Array<{ value: JobStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

type ListFilter = 'active' | 'pending' | 'in_progress' | 'on_hold' | 'all';
type DocumentType = 'quotation' | 'invoice';
type ViewDocsTab = 'all' | DocumentType;
type InvoicePaymentTiming = 'credit' | 'pay_now';

const INVOICE_PAYMENT_TYPES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
] as const;

interface JobCardDocumentRecord {
  id: number;
  document_type: DocumentType;
  document_number: string;
  document_date: string;
  status: string;
  total_amount: number;
  paid_amount?: number;
  balance_amount?: number;
  payment_status?: string;
  payment_timing?: InvoicePaymentTiming;
  valid_until?: string | null;
  due_date?: string | null;
  created_at?: string;
}

interface InventoryItem {
  id: number;
  code: string;
  name: string;
  sell_price: number;
  unit_price: number;
  current_stock: number;
  unit?: string;
}

interface DocLineRow {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  inventoryItemId: number | null;
}

const createDocLine = (
  id: number,
  description = '',
  quantity = 1,
  unitPrice = 0,
  inventoryItemId: number | null = null
): DocLineRow => ({
  id,
  description,
  quantity,
  unitPrice,
  inventoryItemId,
});

const resolveInventoryIdFromDescription = (
  description: string,
  items: InventoryItem[]
): number | null => {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const matched = items.find(
    (item) =>
      trimmed.startsWith(`${item.code} –`) ||
      trimmed.startsWith(`${item.code} —`) ||
      trimmed.startsWith(`${item.code} -`)
  );
  return matched?.id ?? null;
};

const docLineTotal = (row: DocLineRow) => {
  const qty = Math.max(Number(row.quantity) || 0, 0);
  const unit = Math.max(Number(row.unitPrice) || 0, 0);
  return Math.round(qty * unit * 100) / 100;
};

const buildDefaultDocLines = (job: JobCardRecord, type: DocumentType): DocLineRow[] => {
  const vehicle = [job.brand, job.model].filter(Boolean).join(' ');
  const desc = vehicle
    ? `Service / repair – ${vehicle}${job.vehicle_no ? ` (${job.vehicle_no})` : ''}`
    : `Service / repair – ${job.job_card_number}`;
  const unitPrice =
    type === 'invoice' ? Number(job.estimated_cost) || 0 : 0;
  return [createDocLine(1, desc, 1, unitPrice)];
};

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

export default function JobCardsPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [records, setRecords] = useState<JobCardRecord[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({ active: 0, pending: 0, in_progress: 0, completed_today: 0 });
  const [listLoading, setListLoading] = useState(true);
  const [listSearch, setListSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [perPage] = useState(15);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewJob, setReviewJob] = useState<JobCardRecord | null>(null);
  const [reviewInspection, setReviewInspection] = useState('');
  const [reviewTechnicianId, setReviewTechnicianId] = useState<number | ''>('');
  const [reviewInspectorId, setReviewInspectorId] = useState<number | ''>('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [docJob, setDocJob] = useState<JobCardRecord | null>(null);
  const [docType, setDocType] = useState<DocumentType>('quotation');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docValidUntil, setDocValidUntil] = useState('');
  const [docDueDate, setDocDueDate] = useState('');
  const [docDiscount, setDocDiscount] = useState('0');
  const [docTax, setDocTax] = useState('0');
  const [docNotes, setDocNotes] = useState('');
  const [docLines, setDocLines] = useState<DocLineRow[]>([createDocLine(1)]);
  const [docSourceId, setDocSourceId] = useState<number | null>(null);
  const [docSaving, setDocSaving] = useState(false);
  const [docPaymentTiming, setDocPaymentTiming] = useState<InvoicePaymentTiming>('pay_now');
  const [docPaidAmount, setDocPaidAmount] = useState('0');
  const [docPaymentType, setDocPaymentType] = useState('cash');
  const [docPaymentReference, setDocPaymentReference] = useState('');
  const [storeItems, setStoreItems] = useState<InventoryItem[]>([]);
  const [docDropdownRowId, setDocDropdownRowId] = useState<number | null>(null);
  const [docDropdownSearch, setDocDropdownSearch] = useState<Record<number, string>>({});
  const [docDropdownHighlight, setDocDropdownHighlight] = useState<number>(-1);
  const [showViewDocsModal, setShowViewDocsModal] = useState(false);
  const [viewDocsJob, setViewDocsJob] = useState<JobCardRecord | null>(null);
  const [showViewJobModal, setShowViewJobModal] = useState(false);
  const [viewJobDetail, setViewJobDetail] = useState<JobCardRecord | null>(null);
  const [viewJobLoading, setViewJobLoading] = useState(false);
  const [viewImagePreview, setViewImagePreview] = useState<JobCardImageRecord | null>(null);
  const [viewDocsList, setViewDocsList] = useState<JobCardDocumentRecord[]>([]);
  const [viewDocsLoading, setViewDocsLoading] = useState(false);
  const [viewDocsTab, setViewDocsTab] = useState<ViewDocsTab>('all');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [formMessageType, setFormMessageType] = useState<'success' | 'error' | ''>('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [chassisNo, setChassisNo] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [accessoriesReceived, setAccessoriesReceived] = useState('');
  const [inspectionReview, setInspectionReview] = useState('');
  const [inspectedByEmployeeId, setInspectedByEmployeeId] = useState<number | ''>('');
  const [priority, setPriority] = useState<JobPriority>('normal');
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<number[]>([]);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [promisedDate, setPromisedDate] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [imageUploadError, setImageUploadError] = useState('');
  const [compressingImages, setCompressingImages] = useState(false);
  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;

  const isColumnVisible = (key: string) => !hiddenModules.includes(key);
  const isElementVisible = (key: string) => !hiddenModules.includes(key);

  const searchInitialized = useRef(false);
  const pendingImagesRef = useRef<PendingImage[]>([]);

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
      console.error('Error fetching job cards visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleJobCardsVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating job cards widget visibility:', error);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchAccessProfile(storedToken);
    }
  }, []);

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
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => {
    return () => {
      pendingImagesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const listParams = useMemo(() => {
    const params: Record<string, string | number | boolean> = {
      page: currentPage,
      per_page: perPage,
    };
    if (listFilter === 'active') {
      params.pending_only = true;
    } else if (listFilter === 'all') {
      params.pending_only = false;
    } else {
      params.pending_only = false;
      params.status = listFilter;
    }
    const term = listSearch.trim();
    if (term) params.search = term;
    return params;
  }, [currentPage, perPage, listFilter, listSearch]);

  const fetchSummary = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/api/job-cards/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setSummary(res.data.data);
    } catch (error) {
      console.error('Error fetching job card summary:', error);
    }
  };

  const fetchRecords = async (page = currentPage) => {
    if (!token) return;
    try {
      setListLoading(true);
      const res = await axios.get(`${API_URL}/api/job-cards`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { ...listParams, page },
      });
      const payload = res.data?.success ? res.data.data : res.data;
      const rows = Array.isArray(payload) ? payload : payload?.data || [];
      setRecords(rows as JobCardRecord[]);
      setLastPage(Number(payload?.last_page) || 1);
      setTotalRecords(Number(payload?.total) || rows.length);
    } catch (error) {
      console.error('Error fetching job cards:', error);
      setRecords([]);
      setLastPage(1);
      setTotalRecords(0);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    const loadEmployees = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/hr/employees`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const rows = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setEmployees(
          rows.map((e: EmployeeOption) => ({
            id: e.id,
            first_name: e.first_name,
            last_name: e.last_name,
            employee_code: e.employee_code,
          }))
        );
      } catch (error) {
        console.error('Error fetching employees:', error);
        setEmployees([]);
      }
    };
    loadEmployees();

    const loadStoreItems = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/stock/inventory`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 },
        });
        const rows = res.data?.success
          ? res.data?.data?.data || res.data?.data || []
          : [];
        setStoreItems(
          (Array.isArray(rows) ? rows : []).map((item: InventoryItem) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            sell_price: 0,
            unit_price: Number(item.unit_price) || 0,
            current_stock: Number(item.current_stock) || 0,
            unit: item.unit || '',
          }))
        );
      } catch (error) {
        console.error('Error fetching store items:', error);
        setStoreItems([]);
      }
    };
    loadStoreItems();
    fetchSummary();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchRecords(currentPage);
  }, [token, currentPage, listFilter]);

  useEffect(() => {
    if (!token) return;
    if (!searchInitialized.current) {
      searchInitialized.current = true;
      return;
    }
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchRecords(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [listSearch]);

  const clearPendingImages = () => {
    setPendingImages((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  };

  const handleSelectImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const MAX_IMAGES = 8;
    const availableSlots = MAX_IMAGES - pendingImages.length;
    if (availableSlots <= 0) {
      setImageUploadError(`You can upload up to ${MAX_IMAGES} images.`);
      return;
    }

    const sourceFiles = Array.from(files).slice(0, availableSlots);
    setImageUploadError('');
    setCompressingImages(true);

    try {
      const compressed = await Promise.all(
        sourceFiles.map(async (file) => {
          const compressedBlob = await imageCompression(file, {
            maxSizeMB: 0.8,
            maxWidthOrHeight: 1600,
            useWebWorker: true,
            initialQuality: 0.8,
          });

          const compressedFile = new File([compressedBlob], file.name, {
            type: compressedBlob.type || file.type,
            lastModified: Date.now(),
          });

          return {
            file: compressedFile,
            previewUrl: URL.createObjectURL(compressedFile),
            originalSize: file.size,
          } as PendingImage;
        })
      );

      setPendingImages((prev) => [...prev, ...compressed]);
      if (sourceFiles.length < Array.from(files).length) {
        setImageUploadError(`Only ${MAX_IMAGES} images are allowed. Extra files were ignored.`);
      }
    } catch (error) {
      console.error('Image compression failed:', error);
      setImageUploadError('Failed to compress one or more images. Please try again.');
    } finally {
      setCompressingImages(false);
    }
  };

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => {
      const target = prev[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const resetForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setVehicleNo('');
    setChassisNo('');
    setBrand('');
    setModel('');
    setProblemDescription('');
    setAccessoriesReceived('');
    setInspectionReview('');
    setInspectedByEmployeeId('');
    setPriority('normal');
    setAssignedEmployeeIds([]);
    setReceivedDate(new Date().toISOString().split('T')[0]);
    setPromisedDate('');
    setEstimatedCost('');
    setAdvanceAmount('');
    setNotes('');
    clearPendingImages();
    setImageUploadError('');
    setFormMessage('');
    setFormMessageType('');
    setEditingJobId(null);
  };

  const handleCloseCreateModal = () => {
    if (saving || compressingImages) return;
    resetForm();
    setShowCreateModal(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const toDateInputValue = (value?: string | null) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
  };

  const handleOpenEdit = (job: JobCardRecord) => {
    resetForm();
    setEditingJobId(job.id);
    setCustomerName(job.customer_name || '');
    setCustomerPhone(job.customer_phone || '');
    setCustomerEmail(job.customer_email || '');
    setVehicleNo(job.vehicle_no || '');
    setChassisNo(job.chassis_no || '');
    setBrand(job.brand || '');
    setModel(job.model || '');
    setProblemDescription(job.problem_description || '');
    setAccessoriesReceived(job.accessories_received || '');
    setInspectionReview(job.inspection_review || '');
    setPriority((job.priority || 'normal') as JobPriority);
    const selectedTechs = Array.isArray(job.assigned_employee_ids) && job.assigned_employee_ids.length > 0
      ? job.assigned_employee_ids
      : (job.assigned_employee_id ? [job.assigned_employee_id] : []);
    setAssignedEmployeeIds(selectedTechs);
    setInspectedByEmployeeId(job.inspected_by_employee_id || selectedTechs[0] || '');
    setReceivedDate(toDateInputValue(job.received_date) || new Date().toISOString().split('T')[0]);
    setPromisedDate(toDateInputValue(job.promised_date));
    setEstimatedCost(job.estimated_cost != null ? String(job.estimated_cost) : '');
    setAdvanceAmount(job.advance_amount != null ? String(job.advance_amount) : '');
    setNotes(job.notes || '');
    setShowCreateModal(true);
  };

  const extractApiError = (error: unknown, fallback = 'Failed to save job card.'): string => {
    if (!axios.isAxiosError(error)) return fallback;
    const data = error.response?.data as { message?: string; errors?: Record<string, string[] | string> };
    if (data?.errors) {
      const messages = Object.entries(data.errors).flatMap(([field, value]) => {
        const parts = Array.isArray(value) ? value : [String(value)];
        return parts.map((msg) => `${field}: ${msg}`);
      });
      if (messages.length) return messages.join(' ');
    }
    return data?.message || fallback;
  };

  const handleSave = async () => {
    if (!token) {
      setFormMessage('Please login again.');
      setFormMessageType('error');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim() || !problemDescription.trim()) {
      setFormMessage('Customer name, phone, and problem description are required.');
      setFormMessageType('error');
      return;
    }
    if (compressingImages) {
      setFormMessage('Please wait until image compression is complete.');
      setFormMessageType('error');
      return;
    }

    try {
      setSaving(true);
      setFormMessage('');

      const formData = new FormData();
      formData.append('customer_name', customerName.trim());
      formData.append('customer_phone', customerPhone.trim());
      formData.append('problem_description', problemDescription.trim());
      formData.append('priority', priority);
      formData.append('status', 'pending');
      formData.append('received_date', receivedDate);

      if (customerEmail.trim()) formData.append('customer_email', customerEmail.trim());
      if (vehicleNo.trim()) formData.append('vehicle_no', vehicleNo.trim().toUpperCase());
      if (chassisNo.trim()) formData.append('chassis_no', chassisNo.trim().toUpperCase());
      if (brand.trim()) formData.append('brand', brand.trim());
      if (model.trim()) formData.append('model', model.trim());
      if (accessoriesReceived.trim()) formData.append('accessories_received', accessoriesReceived.trim());
      if (inspectionReview.trim()) formData.append('inspection_review', inspectionReview.trim());
      if (promisedDate) formData.append('promised_date', promisedDate);
      if (estimatedCost) formData.append('estimated_cost', String(Number(estimatedCost)));
      if (advanceAmount) formData.append('advance_amount', String(Number(advanceAmount)));
      if (notes.trim()) formData.append('notes', notes.trim());

      const inspectorId = inspectionReview.trim() ? inspectedByEmployeeId || assignedEmployeeIds[0] || '' : '';
      if (inspectorId) {
        formData.append('inspected_by_employee_id', String(inspectorId));
      }

      if (assignedEmployeeIds.length > 0) {
        formData.append('assigned_employee_id', String(assignedEmployeeIds[0]));
        assignedEmployeeIds.forEach((id) => {
          formData.append('assigned_employee_ids[]', String(id));
        });
      }

      pendingImages.forEach((item) => {
        formData.append('images[]', item.file);
      });

      const isEditing = Boolean(editingJobId);
      if (isEditing && editingJobId) {
        formData.append('_method', 'PUT');
      }

      await axios.post(
        isEditing && editingJobId
          ? `${API_URL}/api/job-cards/${editingJobId}`
          : `${API_URL}/api/job-cards`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setFormMessage(isEditing ? 'Job card updated successfully.' : 'Job card created successfully.');
      setFormMessageType('success');
      resetForm();
      setShowCreateModal(false);
      setCurrentPage(1);
      await fetchRecords(1);
      await fetchSummary();
    } catch (error) {
      setFormMessage(extractApiError(error));
      setFormMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const appendInspectionNote = (current: string, note: string) => {
    const trimmed = current.trim();
    if (!trimmed) return note;
    if (trimmed.includes(note)) return trimmed;
    return `${trimmed}\n• ${note}`;
  };

  const handleTechnicianChange = async (jobCard: JobCardRecord, employeeId: number | '') => {
    if (!token) return;
    const nextId = employeeId || null;
    if ((jobCard.assigned_employee_id || null) === nextId) return;
    try {
      setUpdatingId(jobCard.id);
      await axios.put(
        `${API_URL}/api/job-cards/${jobCard.id}`,
        { assigned_employee_id: nextId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchRecords(currentPage);
    } catch (error) {
      console.error('Failed to assign technician:', error);
      alert(extractApiError(error, 'Failed to assign technician.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenReview = (job: JobCardRecord) => {
    setReviewJob(job);
    setReviewInspection(job.inspection_review || '');
    setReviewTechnicianId(job.assigned_employee_id || '');
    setReviewInspectorId(job.inspected_by_employee_id || job.assigned_employee_id || '');
    setShowReviewModal(true);
  };

  const handleSaveReview = async () => {
    if (!token || !reviewJob) return;
    if (!reviewInspection.trim()) {
      alert('Please enter an inspection review before saving.');
      return;
    }
    if (!reviewTechnicianId) {
      alert('Please assign a technician for this job.');
      return;
    }
    try {
      setReviewSaving(true);
      await axios.put(
        `${API_URL}/api/job-cards/${reviewJob.id}`,
        {
          inspection_review: reviewInspection.trim(),
          inspected_by_employee_id: reviewInspectorId || reviewTechnicianId,
          assigned_employee_id: reviewTechnicianId,
          status: reviewJob.status === 'pending' ? 'in_progress' : reviewJob.status,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowReviewModal(false);
      setReviewJob(null);
      setFormMessage('Inspection review and technician assignment saved.');
      setFormMessageType('success');
      await fetchRecords(currentPage);
      await fetchSummary();
    } catch (error) {
      alert(extractApiError(error, 'Failed to save inspection review.'));
    } finally {
      setReviewSaving(false);
    }
  };

  const getDocDropdownItems = (rowId: number): InventoryItem[] => {
    const search = (docDropdownSearch[rowId] || '').trim().toLowerCase();
    if (!search) return [];
    return storeItems
      .filter(
        (item) =>
          item.name.toLowerCase().includes(search) ||
          item.code.toLowerCase().includes(search)
      )
      .slice(0, 10);
  };

  const handleDocItemSelect = (rowId: number, item: InventoryItem) => {
    const price = item.unit_price > 0 ? item.unit_price : item.sell_price;
    updateDocLine(rowId, {
      description: `${item.code} – ${item.name}`,
      unitPrice: price,
      inventoryItemId: item.id,
    });
    setDocDropdownSearch((prev) => ({ ...prev, [rowId]: `${item.code} – ${item.name}` }));
    setDocDropdownRowId(null);
    setDocDropdownHighlight(-1);
  };

  const docSubtotal = useMemo(
    () => docLines.reduce((sum, row) => sum + docLineTotal(row), 0),
    [docLines]
  );

  const docTotal = useMemo(() => {
    const discount = Math.min(Math.max(Number(docDiscount) || 0, 0), docSubtotal);
    const tax = Math.max(Number(docTax) || 0, 0);
    return Math.max(docSubtotal - discount + tax, 0);
  }, [docSubtotal, docDiscount, docTax]);

  const docEffectivePaid = useMemo(() => {
    if (docType !== 'invoice' || docPaymentTiming === 'credit') return 0;
    return Math.min(Math.max(Number(docPaidAmount) || 0, 0), docTotal);
  }, [docType, docPaymentTiming, docPaidAmount, docTotal]);

  const docInvoiceBalance = useMemo(
    () => Math.max(docTotal - docEffectivePaid, 0),
    [docTotal, docEffectivePaid]
  );

  const handleOpenDocument = async (job: JobCardRecord, type: DocumentType) => {
    const today = new Date().toISOString().split('T')[0];
    const validDefault = new Date();
    validDefault.setDate(validDefault.getDate() + 14);
    const dueDefault = new Date();
    dueDefault.setDate(dueDefault.getDate() + 7);

    setDocJob(job);
    setDocType(type);
    setDocDate(today);
    setDocValidUntil(validDefault.toISOString().split('T')[0]);
    setDocDueDate(dueDefault.toISOString().split('T')[0]);
    setDocDiscount('0');
    setDocTax('0');
    setDocNotes('');
    setDocSourceId(null);
    setDocDropdownRowId(null);
    setDocDropdownHighlight(-1);
    setDocDropdownSearch({});
    setDocPaymentTiming('pay_now');
    setDocPaymentType('cash');
    setDocPaymentReference('');
    setDocPaidAmount('0');

    if (type === 'invoice' && token) {
      try {
        const res = await axios.get(`${API_URL}/api/job-cards/${job.id}/documents/latest-quotation`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const quotation = res.data?.data;
        if (quotation?.items?.length) {
          setDocSourceId(quotation.id);
          const quotLines = quotation.items.map((item: any, index: number) => {
            const desc = String(item.description || '');
            return createDocLine(
              index + 1,
              desc,
              Number(item.quantity) || 1,
              Number(item.unit_price) || 0,
              item.inventory_item_id
                ? Number(item.inventory_item_id)
                : resolveInventoryIdFromDescription(desc, storeItems)
            );
          });
          setDocLines(quotLines);
          const initSearch: Record<number, string> = {};
          quotLines.forEach((l: DocLineRow) => { initSearch[l.id] = l.description; });
          setDocDropdownSearch(initSearch);
          setDocDiscount(String(quotation.discount_amount || 0));
          setDocTax(String(quotation.tax_amount || 0));
          setDocNotes(quotation.notes ? `From quotation ${quotation.document_number}\n${quotation.notes}` : `From quotation ${quotation.document_number}`);
          setShowDocModal(true);
          return;
        }
      } catch (error) {
        console.error('Could not load quotation for invoice:', error);
      }
    }

    const defaultLines = buildDefaultDocLines(job, type);
    setDocLines(defaultLines);
    const initSearch: Record<number, string> = {};
    defaultLines.forEach((l) => { initSearch[l.id] = l.description; });
    setDocDropdownSearch(initSearch);
    setShowDocModal(true);
  };

  const updateDocLine = (rowId: number, patch: Partial<DocLineRow>) => {
    setDocLines((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
    if (patch.description !== undefined) {
      setDocDropdownSearch((prev) => ({ ...prev, [rowId]: patch.description as string }));
    }
  };

  const addDocLine = () => {
    setDocLines((prev) => {
      const newId = (prev[prev.length - 1]?.id || 0) + 1;
      setDocDropdownSearch((s) => ({ ...s, [newId]: '' }));
      return [...prev, createDocLine(newId)];
    });
  };

  const removeDocLine = (rowId: number) => {
    setDocLines((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId)));
    setDocDropdownSearch((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    if (docDropdownRowId === rowId) setDocDropdownRowId(null);
  };

  const handleSaveDocument = async () => {
    if (!token || !docJob) return;
    const validLines = docLines.filter((row) => row.description.trim());
    if (validLines.length === 0) {
      alert('Add at least one line item with a description.');
      return;
    }

    try {
      setDocSaving(true);
      const payload: Record<string, unknown> = {
        document_type: docType,
        document_date: docDate,
        status: 'draft',
        discount_amount: Number(docDiscount) || 0,
        tax_amount: Number(docTax) || 0,
        notes: docNotes.trim() || null,
        items: validLines.map((row) => ({
          description: row.description.trim(),
          quantity: Number(row.quantity) || 1,
          unit_price: Number(row.unitPrice) || 0,
          inventory_item_id: row.inventoryItemId ?? null,
        })),
      };
      if (docType === 'quotation') {
        payload.valid_until = docValidUntil || null;
      } else {
        payload.due_date = docDueDate || null;
        if (docSourceId) payload.source_document_id = docSourceId;
        payload.payment_timing = docPaymentTiming;
        payload.paid_amount = docPaymentTiming === 'credit' ? 0 : docEffectivePaid;
        if (docPaymentTiming === 'pay_now' && docEffectivePaid > 0) {
          payload.payment_type = docPaymentType;
          payload.payment_reference = docPaymentReference.trim() || null;
        }
      }

      const res = await axios.post(`${API_URL}/api/job-cards/${docJob.id}/documents`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const saved = res.data?.data;
      setShowDocModal(false);
      setDocJob(null);
      let successMsg = `${docType === 'quotation' ? 'Quotation' : 'Invoice'} ${saved?.document_number || ''} created.`;
      if (docType === 'invoice' && Number(saved?.balance_amount) > 0) {
        successMsg += ` Customer outstanding: LKR ${money(Number(saved.balance_amount))}.`;
      }
      setFormMessage(successMsg);
      setFormMessageType('success');

      if (saved?.id) {
        window.open(`/dashboard/job-cards/documents/${saved.id}/print`, '_blank');
      }

      if (docType === 'invoice' && token) {
        try {
          const res = await axios.get(`${API_URL}/api/stock/inventory`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { per_page: 1000 },
          });
          const rows = res.data?.success
            ? res.data?.data?.data || res.data?.data || []
            : [];
          setStoreItems(
            (Array.isArray(rows) ? rows : []).map((item: InventoryItem) => ({
              id: item.id,
              code: item.code,
              name: item.name,
              sell_price: 0,
              unit_price: Number(item.unit_price) || 0,
              current_stock: Number(item.current_stock) || 0,
              unit: item.unit || '',
            }))
          );
        } catch {
          /* stock refresh is best-effort */
        }
      }
    } catch (error) {
      alert(extractApiError(error, `Failed to create ${docType}.`));
    } finally {
      setDocSaving(false);
    }
  };

  const fetchJobDocuments = async (jobId: number) => {
    if (!token) return [];
    const res = await axios.get(`${API_URL}/api/job-cards/${jobId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (res.data?.data || []) as JobCardDocumentRecord[];
  };

  const handleOpenViewDocuments = async (job: JobCardRecord, tab: ViewDocsTab = 'all') => {
    setViewDocsJob(job);
    setViewDocsTab(tab);
    setShowViewDocsModal(true);
    setViewDocsLoading(true);
    setViewDocsList([]);
    try {
      setViewDocsList(await fetchJobDocuments(job.id));
    } catch (error) {
      console.error('Error fetching job card documents:', error);
      alert(extractApiError(error, 'Failed to load documents.'));
    } finally {
      setViewDocsLoading(false);
    }
  };

  const filteredViewDocs = useMemo(() => {
    if (viewDocsTab === 'all') return viewDocsList;
    return viewDocsList.filter((d) => d.document_type === viewDocsTab);
  }, [viewDocsList, viewDocsTab]);

  const viewDocsCounts = useMemo(
    () => ({
      all: viewDocsList.length,
      quotation: viewDocsList.filter((d) => d.document_type === 'quotation').length,
      invoice: viewDocsList.filter((d) => d.document_type === 'invoice').length,
    }),
    [viewDocsList]
  );

  const openDocumentPrint = (docId: number) => {
    window.open(`/dashboard/job-cards/documents/${docId}/print`, '_blank');
  };

  const fmtDocDate = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const fmtDateTime = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleOpenViewJob = async (job: JobCardRecord) => {
    setShowViewJobModal(true);
    setViewJobLoading(true);
    setViewJobDetail(job);

    if (!token) {
      setViewJobLoading(false);
      return;
    }

    try {
      const res = await axios.get(`${API_URL}/api/job-cards/${job.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = res.data?.success ? res.data.data : res.data?.data || res.data;
      if (payload) {
        setViewJobDetail(payload as JobCardRecord);
      }
    } catch (error) {
      console.error('Error loading job card details:', error);
      alert(extractApiError(error, 'Failed to load full job card details.'));
    } finally {
      setViewJobLoading(false);
    }
  };

  const handleStatusChange = async (jobCard: JobCardRecord, newStatus: JobStatus) => {
    if (!token || jobCard.status === newStatus) return;
    try {
      setUpdatingId(jobCard.id);
      await axios.put(
        `${API_URL}/api/job-cards/${jobCard.id}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchRecords(currentPage);
      await fetchSummary();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert(extractApiError(error, 'Failed to update status.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const filterPills: Array<{ value: ListFilter; label: string }> = [
    { value: 'active', label: 'All Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'all', label: 'All Records' },
  ];

  const visibleJobCardColumnCount = [
    'job-cards-col-job-card',
    'job-cards-col-customer',
    'job-cards-col-vehicle',
    'job-cards-col-problem',
    'job-cards-col-technician',
    'job-cards-col-inspection',
    'job-cards-col-received',
    'job-cards-col-est-cost',
    'job-cards-col-status',
    'job-cards-col-actions',
  ].filter((key) => isColumnVisible(key)).length;

  return (
    <div className="space-y-8 pb-10">
      {isElementVisible('job-cards-el-hero') && (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-violet-950 to-purple-900 px-6 py-8 shadow-2xl shadow-indigo-900/30 sm:px-10 sm:py-10">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleJobCardsVisibilityToggle('job-cards-el-hero', true); }}
              className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
              title="Hide section"
              aria-label="Hide hero section"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-indigo-400/15 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-indigo-100 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                Service · Job Cards
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Job Card Management</h1>
              <p className="mt-3 text-sm leading-relaxed text-indigo-100/90 sm:text-base">
                Register vehicle service jobs, track pending work, and assign technicians from one workspace.
              </p>
            </div>
            {isElementVisible('job-cards-el-btn-new') && (
              <div className="relative">
                {showWidgetCloseButtons && (
                  <button
                    type="button"
                    onClick={() => { void handleJobCardsVisibilityToggle('job-cards-el-btn-new', true); }}
                    className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                    title="Hide button"
                    aria-label="Hide new job card button"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-8 py-4 text-base font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/15 text-lg">+</span>
                  New Job Card
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {formMessage && formMessageType === 'success' && !showCreateModal && isElementVisible('job-cards-el-success-message') && (
        <div className="relative flex items-start gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleJobCardsVisibilityToggle('job-cards-el-success-message', true); }}
              className="absolute top-2 right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
              title="Hide message"
              aria-label="Hide success message"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm text-white">✓</span>
          <p className="text-sm font-medium text-emerald-900">{formMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Active Jobs', value: String(summary.active), hint: 'Pending + in progress + on hold', icon: '🔧', accent: 'from-indigo-500 to-violet-600' },
          { label: 'Pending', value: String(summary.pending), hint: 'Awaiting start', icon: '⏳', accent: 'from-amber-500 to-orange-500' },
          { label: 'In Progress', value: String(summary.in_progress), hint: 'Currently working', icon: '⚡', accent: 'from-sky-500 to-blue-600' },
          { label: 'Completed Today', value: String(summary.completed_today), hint: 'Finished today', icon: '✅', accent: 'from-emerald-500 to-teal-600' },
        ].map((card) => {
          const visibilityMap: Record<string, string> = {
            'Active Jobs': 'job-cards-el-stat-active',
            Pending: 'job-cards-el-stat-pending',
            'In Progress': 'job-cards-el-stat-in-progress',
            'Completed Today': 'job-cards-el-stat-completed-today',
          };
          const key = visibilityMap[card.label];
          if (!key || !isElementVisible(key)) return null;

          return (
            <div
              key={card.label}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleJobCardsVisibilityToggle(key, true); }}
                  className="absolute top-2 right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                  title="Hide stat"
                  aria-label={`Hide ${card.label}`}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-xl">{card.icon}</span>
              </div>
            </div>
          );
        })}
      </div>

      {isElementVisible('job-cards-sec-table') && (
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleJobCardsVisibilityToggle('job-cards-sec-table', true); }}
            className="absolute top-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
            title="Hide section"
            aria-label="Hide job cards table section"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
        <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/40 px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Pending Job Cards</h2>
              <p className="mt-1 text-sm text-slate-500">
                {totalRecords} record{totalRecords !== 1 ? 's' : ''} · Page {currentPage} of {lastPage}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {isElementVisible('job-cards-el-search') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleJobCardsVisibilityToggle('job-cards-el-search', true); }}
                      className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide search"
                      aria-label="Hide search"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                  <input
                    type="search"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Search vehicle no, chassis, customer..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-none sm:w-72"
                  />
                </div>
              )}
              {isElementVisible('job-cards-el-filter-pills') && (
                <div className="relative flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleJobCardsVisibilityToggle('job-cards-el-filter-pills', true); }}
                      className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide filters"
                      aria-label="Hide filters"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  {filterPills.map((pill) => (
                    <button
                      key={pill.value}
                      type="button"
                      onClick={() => {
                        setListFilter(pill.value);
                        setCurrentPage(1);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        listFilter === pill.value
                          ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-slate-900 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">
                {isColumnVisible('job-cards-col-job-card') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Job Card</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-job-card', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Job Card column"
                          aria-label="Hide Job Card column"
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
                {isColumnVisible('job-cards-col-customer') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Customer</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-customer', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Customer column"
                          aria-label="Hide Customer column"
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
                {isColumnVisible('job-cards-col-vehicle') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Vehicle</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-vehicle', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Vehicle column"
                          aria-label="Hide Vehicle column"
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
                {isColumnVisible('job-cards-col-problem') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Problem</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-problem', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Problem column"
                          aria-label="Hide Problem column"
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
                {isColumnVisible('job-cards-col-technician') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Technician</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-technician', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Technician column"
                          aria-label="Hide Technician column"
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
                {isColumnVisible('job-cards-col-inspection') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Inspection</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-inspection', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Inspection column"
                          aria-label="Hide Inspection column"
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
                {isColumnVisible('job-cards-col-received') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Received</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-received', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Received column"
                          aria-label="Hide Received column"
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
                {isColumnVisible('job-cards-col-est-cost') && (
                  <th className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span>Est. Cost</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-est-cost', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Est. Cost column"
                          aria-label="Hide Est. Cost column"
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
                {isColumnVisible('job-cards-col-status') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Status</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-status', true); }}
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
                {isColumnVisible('job-cards-col-actions') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <span>Actions</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleJobCardsVisibilityToggle('job-cards-col-actions', true); }}
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
            <tbody className="divide-y divide-slate-100">
              {listLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={Math.max(visibleJobCardColumnCount, 1)} className="px-5 py-4">
                      <div className="h-4 rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(visibleJobCardColumnCount, 1)} className="px-5 py-16 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 text-3xl">
                        🔧
                      </div>
                      <p className="font-semibold text-slate-800">No job cards in this view</p>
                      <p className="mt-1 text-sm text-slate-500">Create a new job card to start tracking work.</p>
                      <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md"
                      >
                        New Job Card
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((job, index) => {
                  const received = job.received_date
                    ? new Date(job.received_date).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  const vehicleLabel = [job.brand, job.model].filter(Boolean).join(' ') || '—';
                  const initial = job.customer_name?.charAt(0)?.toUpperCase() || '?';

                  return (
                    <tr
                      key={job.id}
                      className={`transition-colors hover:bg-indigo-50/40 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      {isColumnVisible('job-cards-col-job-card') && (
                        <td className="px-5 py-4">
                          <p className="font-mono text-sm font-bold text-indigo-700">{job.job_card_number}</p>
                          <p className={`mt-0.5 text-xs font-semibold capitalize ${priorityBadge(job.priority)}`}>
                            {job.priority} priority
                          </p>
                        </td>
                      )}
                      {isColumnVisible('job-cards-col-customer') && (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                              {initial}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-slate-800">{job.customer_name}</p>
                              <p className="text-xs text-slate-500">{job.customer_phone}</p>
                            </div>
                          </div>
                        </td>
                      )}
                      {isColumnVisible('job-cards-col-vehicle') && (
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {job.vehicle_no && (
                            <p className="font-mono text-sm font-bold text-slate-800">{job.vehicle_no}</p>
                          )}
                          <p className={job.vehicle_no ? 'mt-0.5 text-slate-600' : ''}>{vehicleLabel}</p>
                          {job.chassis_no && (
                            <p className="mt-0.5 font-mono text-xs text-slate-400">Chassis: {job.chassis_no}</p>
                          )}
                          {!job.vehicle_no && !job.chassis_no && vehicleLabel === '—' && (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      {isColumnVisible('job-cards-col-problem') && (
                        <td className="max-w-[200px] px-5 py-4">
                          <p className="line-clamp-2 text-sm text-slate-600" title={job.problem_description}>
                            {job.problem_description}
                          </p>
                        </td>
                      )}
                      {isColumnVisible('job-cards-col-technician') && (
                        <td className="px-5 py-4">
                          <select
                            value={job.assigned_employee_id || ''}
                            disabled={updatingId === job.id}
                            onChange={(e) =>
                              handleTechnicianChange(job, e.target.value ? Number(e.target.value) : '')
                            }
                            className="w-full min-w-[130px] rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-6 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                          >
                            <option value="">Assign technician...</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {employeeName(emp)}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {isColumnVisible('job-cards-col-inspection') && (
                        <td className="px-5 py-4">
                          {job.inspection_review ? (
                            <div>
                              <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/25">
                                Reviewed
                              </span>
                              <p className="mt-1 line-clamp-2 text-xs text-slate-600" title={job.inspection_review}>
                                {job.inspection_review}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-amber-700">Pending review</span>
                          )}
                        </td>
                      )}
                      {isColumnVisible('job-cards-col-received') && (
                        <td className="px-5 py-4 text-sm text-slate-600">{received}</td>
                      )}
                      {isColumnVisible('job-cards-col-est-cost') && (
                        <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900">
                          {job.estimated_cost != null ? money(Number(job.estimated_cost)) : '—'}
                        </td>
                      )}
                      {isColumnVisible('job-cards-col-status') && (
                        <td className="px-5 py-4">
                          <select
                            value={job.status}
                            disabled={updatingId === job.id}
                            onChange={(e) => handleStatusChange(job, e.target.value as JobStatus)}
                            className={`rounded-lg border-0 py-1.5 pl-2 pr-7 text-xs font-semibold capitalize ring-1 ring-inset focus:ring-2 focus:ring-indigo-300 ${statusBadge(job.status)}`}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {isColumnVisible('job-cards-col-actions') && (
                        <td className="px-5 py-4">
                          <div className="flex min-w-[148px] flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => { void handleOpenViewJob(job); }}
                              className="whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                            >
                              View Job Card
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(job)}
                              className="whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                            >
                              Edit Job Card
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenReview(job)}
                              className="whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
                            >
                              {job.inspection_review ? 'Edit Review' : 'Add Review'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDocument(job, 'quotation')}
                              className="whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                            >
                              Make Quotation
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDocument(job, 'invoice')}
                              className="whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              Make Invoice
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenViewDocuments(job)}
                              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              View QT / Invoice
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {isElementVisible('job-cards-sec-pagination') && (
        <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-sm text-slate-600">
            Showing <span className="font-semibold text-slate-900">{records.length}</span> of{' '}
            <span className="font-semibold text-slate-900">{totalRecords}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || listLoading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="min-w-[4.5rem] text-center text-sm font-semibold text-slate-700">
              {currentPage} / {lastPage}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(lastPage, p + 1))}
              disabled={currentPage >= lastPage || listLoading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
        )}
      </section>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div className="relative shrink-0 overflow-hidden border-b border-indigo-100/80 bg-gradient-to-r from-indigo-950 via-violet-950 to-purple-900 px-6 py-5 sm:px-8">
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200/80">
                    {editingJobId ? 'Edit job' : 'New job'}
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-white">
                    {editingJobId ? 'Edit Job Card' : 'Create Job Card'}
                  </h3>
                  <p className="mt-1 text-sm text-indigo-100/80">Customer & vehicle details for service tracking</p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white hover:bg-white/20"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-6 bg-gradient-to-b from-slate-50/80 to-white p-5 sm:p-7">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-700">Customer</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={fieldClass} placeholder="Customer name" />
                  </div>
                  <div>
                    <label className={labelClass}>Phone *</label>
                    <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={fieldClass} placeholder="07X XXX XXXX" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Email</label>
                    <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={fieldClass} placeholder="Optional" />
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/50 shadow-sm">
                <div className="flex items-center gap-3 border-b border-indigo-100/80 bg-indigo-950/5 px-5 py-3.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-lg text-white shadow-md">
                    🚗
                  </span>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">Vehicle Details</h4>
                    <p className="text-xs text-slate-500">Registration, chassis, make & model</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Vehicle No</label>
                    <input
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                      className={`${fieldClass} font-mono uppercase tracking-wide`}
                      placeholder="e.g. CAB-1234"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Chassis No</label>
                    <input
                      value={chassisNo}
                      onChange={(e) => setChassisNo(e.target.value.toUpperCase())}
                      className={`${fieldClass} font-mono uppercase tracking-wide`}
                      placeholder="VIN / chassis number"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Brand</label>
                    <input
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. Toyota, Honda"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Model</label>
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. Corolla, Civic"
                    />
                  </div>
                </div>
                {(vehicleNo || chassisNo || brand || model) && (
                  <div className="mx-5 mb-5 rounded-xl border border-indigo-100 bg-white/80 px-4 py-3 text-sm text-slate-700">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Preview</span>
                    <p className="mt-1 font-medium">
                      {[vehicleNo, [brand, model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {chassisNo && <p className="mt-0.5 font-mono text-xs text-slate-500">Chassis: {chassisNo}</p>}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-700">Job Details</h4>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Problem Description *</label>
                    <textarea
                      value={problemDescription}
                      onChange={(e) => setProblemDescription(e.target.value)}
                      rows={3}
                      className={fieldClass}
                      placeholder="Describe the issue reported by customer..."
                    />
                  </div>
                  <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 p-3">
                    <label className={labelClass}>Quick Upload Job Images</label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        void handleSelectImages(e.target.files);
                        e.currentTarget.value = '';
                      }}
                      disabled={compressingImages || saving}
                      className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-fuchsia-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-fuchsia-700 hover:file:bg-fuchsia-200"
                    />
                    <p className="mt-1.5 text-xs text-slate-600">
                      {pendingImages.length > 0
                        ? `${pendingImages.length} image${pendingImages.length > 1 ? 's' : ''} selected. Scroll down to preview/remove.`
                        : 'You can select up to 8 images. Images are auto-compressed before upload.'}
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Accessories Received</label>
                    <input
                      value={accessoriesReceived}
                      onChange={(e) => setAccessoriesReceived(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. keys, spare wheel, jack, tool kit, floor mats, fuel cap"
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                      List items handed over with the vehicle (keys, documents, spare parts, etc.)
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Priority</label>
                      <select value={priority} onChange={(e) => setPriority(e.target.value as JobPriority)} className={fieldClass}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Received Date *</label>
                      <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Promised Date</label>
                      <input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Estimated Cost (LKR)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={estimatedCost}
                        onChange={(e) => setEstimatedCost(e.target.value)}
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Advance (LKR)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(e.target.value)}
                        className={fieldClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Internal Notes</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldClass} placeholder="Optional notes" />
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white to-indigo-50/50 shadow-sm">
                <div className="flex items-center gap-3 border-b border-sky-100/80 bg-sky-950/5 px-5 py-3.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600 text-lg text-white shadow-md">
                    👷
                  </span>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">Assign Technician</h4>
                    <p className="text-xs text-slate-500">Select who will carry out the repair work</p>
                  </div>
                </div>
                <div className="p-5">
                  <label className={labelClass}>Technicians for this job</label>
                  <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
                    {employees.map((emp) => {
                      const checked = assignedEmployeeIds.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                            checked
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setAssignedEmployeeIds((prev) => {
                                if (isChecked) {
                                  const next = Array.from(new Set([...prev, emp.id]));
                                  if (!inspectedByEmployeeId) setInspectedByEmployeeId(next[0] || '');
                                  return next;
                                }

                                const next = prev.filter((id) => id !== emp.id);
                                if (inspectedByEmployeeId === emp.id) {
                                  setInspectedByEmployeeId(next[0] || '');
                                }
                                return next;
                              });
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>
                            {employeeName(emp)}
                            {emp.employee_code ? ` (${emp.employee_code})` : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {assignedEmployeeIds.length > 0 && (
                    <p className="mt-2 text-xs text-slate-600">
                      Selected {assignedEmployeeIds.length} technician{assignedEmployeeIds.length > 1 ? 's' : ''}.
                    </p>
                  )}
                  {assignedEmployeeIds.length === 0 && (
                    <p className="mt-2 text-xs text-amber-700">You can assign now or later from the job list.</p>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50/90 via-white to-pink-50/50 shadow-sm">
                <div className="flex items-center gap-3 border-b border-fuchsia-100/80 bg-fuchsia-950/5 px-5 py-3.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-pink-600 text-lg text-white shadow-md">
                    📸
                  </span>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">Job Images</h4>
                    <p className="text-xs text-slate-500">Upload issue photos. Files are auto-compressed before upload.</p>
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <label className={labelClass}>Upload Images (max 8)</label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        void handleSelectImages(e.target.files);
                        e.currentTarget.value = '';
                      }}
                      disabled={compressingImages || saving}
                      className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-fuchsia-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-fuchsia-700 hover:file:bg-fuchsia-200"
                    />
                    <p className="mt-1.5 text-xs text-slate-500">Each image is compressed to about 0.8MB with max 1600px dimension.</p>
                  </div>

                  {compressingImages && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
                      Compressing images...
                    </div>
                  )}

                  {imageUploadError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                      {imageUploadError}
                    </div>
                  )}

                  {pendingImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {pendingImages.map((item, index) => (
                        <div key={`${item.file.name}-${index}`} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <img src={item.previewUrl} alt={`Upload preview ${index + 1}`} className="h-24 w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePendingImage(index)}
                            className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/75"
                            aria-label="Remove image"
                            title="Remove image"
                          >
                            ×
                          </button>
                          <div className="space-y-0.5 px-2 py-1.5 text-[10px] text-slate-600">
                            <p className="truncate font-medium text-slate-700">{item.file.name}</p>
                            <p>
                              {formatFileSize(item.originalSize)} to {formatFileSize(item.file.size)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50 shadow-sm">
                <div className="flex items-center gap-3 border-b border-emerald-100/80 bg-emerald-950/5 px-5 py-3.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-lg text-white shadow-md">
                    🔍
                  </span>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">Inspection Review</h4>
                    <p className="text-xs text-slate-500">Initial vehicle inspection findings (optional at intake)</p>
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <label className={labelClass}>Inspector</label>
                    <select
                      value={inspectedByEmployeeId}
                      onChange={(e) => setInspectedByEmployeeId(e.target.value ? Number(e.target.value) : '')}
                      className={fieldClass}
                      disabled={!inspectionReview.trim()}
                    >
                      <option value="">Same as assigned technician</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {employeeName(emp)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {INSPECTION_QUICK_NOTES.map((note) => (
                      <button
                        key={note}
                        type="button"
                        onClick={() => setInspectionReview((prev) => appendInspectionNote(prev, note))}
                        className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50"
                      >
                        + {note}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className={labelClass}>Review Notes</label>
                    <textarea
                      value={inspectionReview}
                      onChange={(e) => setInspectionReview(e.target.value)}
                      rows={4}
                      className={fieldClass}
                      placeholder="e.g. Front brake pads worn, engine oil low, battery terminals corroded..."
                    />
                  </div>
                </div>
              </div>

              {formMessage && formMessageType === 'error' && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formMessage}</div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-8">
              <button
                type="button"
                onClick={handleCloseCreateModal}
                disabled={saving || compressingImages}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || compressingImages}
                className="inline-flex min-w-[140px] items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-60"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving...
                  </span>
                ) : (
                  editingJobId ? 'Update Job Card' : 'Save Job Card'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showViewJobModal && viewJobDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div className="shrink-0 border-b border-blue-100 bg-gradient-to-r from-blue-900 to-indigo-900 px-6 py-5 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-blue-200/90">Job Card Details</p>
                  <h3 className="mt-1 text-2xl font-bold text-white">{viewJobDetail.job_card_number}</h3>
                  <p className="mt-1 text-sm text-blue-100/90">
                    {viewJobDetail.customer_name}
                    {viewJobDetail.vehicle_no ? ` · ${viewJobDetail.vehicle_no}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowViewJobModal(false);
                    setViewJobDetail(null);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-5 bg-slate-50/60 p-5 sm:p-7">
              {viewJobLoading && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  Loading full job card details...
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{viewJobDetail.customer_name || '—'}</p>
                  <p className="mt-1 text-sm text-slate-700">Phone: {viewJobDetail.customer_phone || '—'}</p>
                  <p className="mt-1 text-sm text-slate-700">Email: {viewJobDetail.customer_email || '—'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vehicle</p>
                  <p className="mt-2 text-sm text-slate-700">No: {viewJobDetail.vehicle_no || '—'}</p>
                  <p className="mt-1 text-sm text-slate-700">Brand / Model: {[viewJobDetail.brand, viewJobDetail.model].filter(Boolean).join(' / ') || '—'}</p>
                  <p className="mt-1 text-sm text-slate-700">Chassis: {viewJobDetail.chassis_no || '—'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Problem Description</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{viewJobDetail.problem_description || '—'}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Accessories Received</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{viewJobDetail.accessories_received || '—'}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Assignment</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Technicians:{' '}
                    {viewJobDetail.assigned_employees && viewJobDetail.assigned_employees.length > 0
                      ? viewJobDetail.assigned_employees.map((emp) => employeeName(emp)).join(', ')
                      : employeeName(viewJobDetail.assigned_employee)}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">Inspector: {employeeName(viewJobDetail.inspected_by_employee)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status & Priority</p>
                  <p className="mt-2 text-sm text-slate-700">Status: <span className="font-semibold capitalize">{viewJobDetail.status || '—'}</span></p>
                  <p className="mt-1 text-sm text-slate-700">Priority: <span className="font-semibold capitalize">{viewJobDetail.priority || '—'}</span></p>
                  <p className="mt-1 text-sm text-slate-700">Received: {fmtDocDate(viewJobDetail.received_date)}</p>
                  <p className="mt-1 text-sm text-slate-700">Promised: {fmtDocDate(viewJobDetail.promised_date)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Estimated Cost</p>
                  <p className="mt-2 font-bold text-slate-900">LKR {money(Number(viewJobDetail.estimated_cost || 0))}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Advance Amount</p>
                  <p className="mt-2 font-bold text-slate-900">LKR {money(Number(viewJobDetail.advance_amount || 0))}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Created</p>
                  <p className="mt-2 font-medium text-slate-800">{fmtDateTime(viewJobDetail.created_at)}</p>
                  <p className="mt-1 text-xs text-slate-500">By: {viewJobDetail.creator?.name || viewJobDetail.creator?.email || '—'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Inspection Review</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{viewJobDetail.inspection_review || '—'}</p>
                <p className="mt-2 text-xs text-slate-500">Reviewed at: {fmtDateTime(viewJobDetail.inspection_reviewed_at)}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Internal Notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{viewJobDetail.notes || '—'}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Uploaded Images</p>
                {viewJobDetail.images && viewJobDetail.images.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {viewJobDetail.images.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setViewImagePreview(img)}
                        className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <img src={img.image_url} alt={img.original_name || `Job image ${img.id}`} className="h-28 w-full object-cover transition group-hover:scale-105" />
                        <div className="px-2 py-1.5 text-[10px] text-slate-600">
                          <p className="truncate font-medium text-slate-700">{img.original_name || `Image #${img.id}`}</p>
                          <p>{img.size_kb ? `${img.size_kb} KB` : '—'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No images uploaded for this job card.</p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowViewJobModal(false);
                  setViewJobDetail(null);
                  setViewImagePreview(null);
                }}
                className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {viewImagePreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close image preview"
            onClick={() => setViewImagePreview(null)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-2xl font-bold text-white hover:bg-white/20"
          >
            ×
          </button>

          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl">
            <img
              src={viewImagePreview.image_url}
              alt={viewImagePreview.original_name || `Job image ${viewImagePreview.id}`}
              className="max-h-[80vh] w-full object-contain bg-slate-900"
            />
            <div className="flex items-center justify-between gap-3 bg-slate-900/95 px-4 py-3 text-sm text-slate-100">
              <p className="truncate font-medium">{viewImagePreview.original_name || `Image #${viewImagePreview.id}`}</p>
              <button
                type="button"
                onClick={() => setViewImagePreview(null)}
                className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                Close Image
              </button>
            </div>
          </div>
        </div>
      )}

      {showDocModal && docJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div
              className={`shrink-0 border-b px-6 py-5 sm:px-8 ${
                docType === 'quotation'
                  ? 'border-violet-100 bg-gradient-to-r from-violet-900 to-indigo-900'
                  : 'border-emerald-100 bg-gradient-to-r from-emerald-800 to-teal-900'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                    {docType === 'quotation' ? 'Quotation' : 'Invoice'}
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-white">
                    {docType === 'quotation' ? 'Make Quotation' : 'Make Invoice'}
                  </h3>
                  <p className="mt-1 text-sm text-white/80">
                    {docJob.job_card_number} · {docJob.customer_name}
                    {docSourceId && docType === 'invoice' ? ' · from latest quotation' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDocModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-5 p-5 sm:p-7">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Document Date</label>
                  <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={fieldClass} />
                </div>
                {docType === 'quotation' ? (
                  <div>
                    <label className={labelClass}>Valid Until</label>
                    <input
                      type="date"
                      value={docValidUntil}
                      onChange={(e) => setDocValidUntil(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Due Date</label>
                    <input type="date" value={docDueDate} onChange={(e) => setDocDueDate(e.target.value)} className={fieldClass} />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Discount (LKR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={docDiscount}
                    onChange={(e) => setDocDiscount(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Line Items</h4>
                    {docType === 'quotation' && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Enter prices manually — job estimate is not applied to quotations.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addDocLine}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    + Add Line
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left text-xs font-bold uppercase text-slate-500">
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 w-24">Qty</th>
                        <th className="px-3 py-2 w-32">Unit (LKR)</th>
                        <th className="px-3 py-2 w-32 text-right">Total</th>
                        <th className="px-3 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {docLines.map((row) => (
                        <tr key={row.id}>
                          <td className="px-3 py-2 relative">
                            <input
                              value={docDropdownSearch[row.id] ?? row.description}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDocDropdownSearch((prev) => ({ ...prev, [row.id]: val }));
                                updateDocLine(row.id, { description: val, inventoryItemId: null });
                                setDocDropdownRowId(row.id);
                                setDocDropdownHighlight(-1);
                              }}
                              onFocus={() => {
                                setDocDropdownRowId(row.id);
                                setDocDropdownHighlight(-1);
                              }}
                              onBlur={() => {
                                setTimeout(() => setDocDropdownRowId(null), 150);
                              }}
                              onKeyDown={(e) => {
                                const items = getDocDropdownItems(row.id);
                                if (!items.length) return;
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  setDocDropdownHighlight((h) => (h < items.length - 1 ? h + 1 : 0));
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  setDocDropdownHighlight((h) => (h > 0 ? h - 1 : items.length - 1));
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const idx = docDropdownHighlight >= 0 ? docDropdownHighlight : 0;
                                  if (items[idx]) handleDocItemSelect(row.id, items[idx]);
                                } else if (e.key === 'Escape') {
                                  setDocDropdownRowId(null);
                                }
                              }}
                              className={fieldClass}
                              placeholder="Type item name or code…"
                            />
                            {docDropdownRowId === row.id && getDocDropdownItems(row.id).length > 0 && (
                              <div className="absolute left-3 right-3 top-full z-30 mt-1 rounded-xl border border-indigo-100 bg-white shadow-xl max-h-52 overflow-y-auto">
                                {getDocDropdownItems(row.id).map((item, idx) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onMouseDown={() => handleDocItemSelect(row.id, item)}
                                    className={`w-full text-left px-3 py-2 border-b last:border-b-0 transition-colors ${
                                      docDropdownHighlight === idx
                                        ? 'bg-indigo-50 text-indigo-900'
                                        : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="text-sm font-semibold text-slate-800">
                                      {item.code} — {item.name}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      Stock: {item.current_stock} {item.unit}
                                      {item.unit_price > 0 && <span className="ml-2">· Price: LKR {item.unit_price.toFixed(2)}</span>}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={row.quantity}
                              onChange={(e) =>
                                updateDocLine(row.id, { quantity: Number(e.target.value) || 0 })
                              }
                              className={fieldClass}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unitPrice}
                              onChange={(e) =>
                                updateDocLine(row.id, { unitPrice: Number(e.target.value) || 0 })
                              }
                              className={fieldClass}
                              placeholder={docType === 'quotation' ? 'Enter price' : '0.00'}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800">
                            {money(docLineTotal(row))}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeDocLine(row.id)}
                              className="text-rose-600 hover:text-rose-800"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Tax (LKR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={docTax}
                    onChange={(e) => setDocTax(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Summary</p>
                  <p className="mt-2 flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>LKR {money(docSubtotal)}</span>
                  </p>
                  <p className="mt-1 flex justify-between text-lg font-bold text-slate-900">
                    <span>Total</span>
                    <span>LKR {money(docTotal)}</span>
                  </p>
                </div>
              </div>

              {docType === 'invoice' && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
                  <h4 className="text-sm font-bold text-slate-800">Payment</h4>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Credit or unpaid balance is added to the customer&apos;s outstanding by phone number.
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDocPaymentTiming('pay_now');
                        setDocPaidAmount(docTotal > 0 ? docTotal.toFixed(2) : '0');
                      }}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        docPaymentTiming === 'pay_now'
                          ? 'border-emerald-400 bg-white shadow-md ring-2 ring-emerald-200'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="text-lg">💵</span>
                      <p className="mt-2 font-bold text-slate-900">Collect Payment</p>
                      <p className="text-xs text-slate-500">Full or partial — balance goes to outstanding</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDocPaymentTiming('credit');
                        setDocPaidAmount('0');
                      }}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        docPaymentTiming === 'credit'
                          ? 'border-violet-400 bg-white shadow-md ring-2 ring-violet-200'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="text-lg">📒</span>
                      <p className="mt-2 font-bold text-slate-900">Credit</p>
                      <p className="text-xs text-slate-500">Full invoice amount to customer outstanding</p>
                    </button>
                  </div>

                  {docPaymentTiming === 'pay_now' && (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <label className={labelClass}>Payment Type</label>
                        <select
                          value={docPaymentType}
                          onChange={(e) => setDocPaymentType(e.target.value)}
                          className={fieldClass}
                        >
                          {INVOICE_PAYMENT_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Paid Amount (LKR)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={docTotal}
                          value={docPaidAmount}
                          onChange={(e) => setDocPaidAmount(e.target.value)}
                          className={fieldClass}
                        />
                        <button
                          type="button"
                          onClick={() => setDocPaidAmount(docTotal > 0 ? docTotal.toFixed(2) : '0')}
                          className="mt-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                        >
                          Pay full amount
                        </button>
                      </div>
                      <div>
                        <label className={labelClass}>Reference</label>
                        <input
                          value={docPaymentReference}
                          onChange={(e) => setDocPaymentReference(e.target.value)}
                          placeholder="Receipt / transfer ref"
                          className={fieldClass}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Invoice Total', value: `LKR ${money(docTotal)}` },
                      { label: 'Paid Now', value: `LKR ${money(docEffectivePaid)}` },
                      { label: 'To Outstanding', value: `LKR ${money(docInvoiceBalance)}`, highlight: true },
                      {
                        label: 'Status',
                        value:
                          docInvoiceBalance <= 0 && docTotal > 0
                            ? 'Paid'
                            : docEffectivePaid > 0
                              ? 'Partial'
                              : 'Credit',
                      },
                    ].map((tile) => (
                      <div
                        key={tile.label}
                        className={`rounded-xl border px-3 py-3 ${
                          tile.highlight
                            ? 'border-rose-200 bg-rose-50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{tile.label}</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{tile.value}</p>
                      </div>
                    ))}
                  </div>

                  {docInvoiceBalance > 0 && (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                      <span className="font-bold">LKR {money(docInvoiceBalance)}</span> will be added to{' '}
                      <span className="font-bold">{docJob.customer_name}</span> ({docJob.customer_phone}) outstanding.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                  rows={2}
                  className={fieldClass}
                  placeholder="Terms, warranty, payment instructions..."
                />
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-5 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                disabled={docSaving}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDocument}
                disabled={docSaving}
                className={`inline-flex min-w-[160px] items-center justify-center rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-60 ${
                  docType === 'quotation'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600'
                }`}
              >
                {docSaving
                  ? 'Saving...'
                  : docType === 'quotation'
                    ? 'Save Quotation'
                    : 'Save Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showViewDocsModal && viewDocsJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
                    Quotations &amp; Invoices
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-white">{viewDocsJob.job_card_number}</h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {viewDocsJob.customer_name}
                    {viewDocsJob.vehicle_no ? ` · ${viewDocsJob.vehicle_no}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowViewDocsModal(false);
                    setViewDocsJob(null);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex shrink-0 gap-2 border-b border-slate-100 bg-slate-50 px-6 py-3">
              {(
                [
                  { key: 'all' as ViewDocsTab, label: 'All', count: viewDocsCounts.all },
                  { key: 'quotation' as ViewDocsTab, label: 'Quotations', count: viewDocsCounts.quotation },
                  { key: 'invoice' as ViewDocsTab, label: 'Invoices', count: viewDocsCounts.invoice },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setViewDocsTab(tab.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    viewDocsTab === tab.key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                      viewDocsTab === tab.key ? 'bg-white/20' : 'bg-slate-100'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {viewDocsLoading ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading documents…</p>
              ) : filteredViewDocs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                  <p className="text-sm font-medium text-slate-600">
                    No {viewDocsTab === 'all' ? 'documents' : viewDocsTab === 'quotation' ? 'quotations' : 'invoices'}{' '}
                    for this job card yet.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowViewDocsModal(false);
                        handleOpenDocument(viewDocsJob, 'quotation');
                      }}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
                    >
                      Make Quotation
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowViewDocsModal(false);
                        handleOpenDocument(viewDocsJob, 'invoice');
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Make Invoice
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredViewDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              doc.document_type === 'quotation'
                                ? 'bg-violet-500/15 text-violet-800 ring-1 ring-violet-500/25'
                                : 'bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25'
                            }`}
                          >
                            {doc.document_type === 'quotation' ? 'Quotation' : 'Invoice'}
                          </span>
                          <span className="font-mono text-sm font-bold text-slate-900">{doc.document_number}</span>
                          <span className="text-xs capitalize text-slate-500">{doc.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Date: {fmtDocDate(doc.document_date)}
                          {doc.document_type === 'quotation' && doc.valid_until
                            ? ` · Valid until ${fmtDocDate(doc.valid_until)}`
                            : ''}
                          {doc.document_type === 'invoice' && doc.due_date
                            ? ` · Due ${fmtDocDate(doc.due_date)}`
                            : ''}
                          {doc.document_type === 'invoice' && (
                            <>
                              {' · '}
                              Paid LKR {money(Number(doc.paid_amount || 0))}
                              {Number(doc.balance_amount) > 0
                                ? ` · Balance LKR ${money(Number(doc.balance_amount))}`
                                : ''}
                              {doc.payment_status ? ` · ${doc.payment_status}` : ''}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-900">LKR {money(Number(doc.total_amount))}</span>
                        <button
                          type="button"
                          onClick={() => openDocumentPrint(doc.id)}
                          className="whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                        >
                          View / Print
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowViewDocsModal(false);
                  handleOpenDocument(viewDocsJob, 'quotation');
                }}
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100"
              >
                + Quotation
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowViewDocsModal(false);
                  handleOpenDocument(viewDocsJob, 'invoice');
                }}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                + Invoice
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowViewDocsModal(false);
                  setViewDocsJob(null);
                }}
                className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showReviewModal && reviewJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div className="shrink-0 border-b border-emerald-100 bg-gradient-to-r from-emerald-800 to-teal-900 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200/90">Inspection</p>
                  <h3 className="mt-1 text-xl font-bold text-white">{reviewJob.job_card_number}</h3>
                  <p className="mt-1 text-sm text-emerald-100/90">
                    {reviewJob.customer_name}
                    {reviewJob.vehicle_no ? ` · ${reviewJob.vehicle_no}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-5 p-6">
              <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                <label className={labelClass}>Assign technician for work *</label>
                <select
                  value={reviewTechnicianId}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : '';
                    setReviewTechnicianId(id);
                    if (id && !reviewInspectorId) setReviewInspectorId(id);
                  }}
                  className={fieldClass}
                >
                  <option value="">Select technician...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {employeeName(emp)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Inspector</label>
                <select
                  value={reviewInspectorId}
                  onChange={(e) => setReviewInspectorId(e.target.value ? Number(e.target.value) : '')}
                  className={fieldClass}
                >
                  <option value="">Same as technician</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {employeeName(emp)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {INSPECTION_QUICK_NOTES.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => setReviewInspection((prev) => appendInspectionNote(prev, note))}
                    className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  >
                    + {note}
                  </button>
                ))}
              </div>

              <div>
                <label className={labelClass}>Inspection review *</label>
                <textarea
                  value={reviewInspection}
                  onChange={(e) => setReviewInspection(e.target.value)}
                  rows={5}
                  className={fieldClass}
                  placeholder="Document inspection findings, recommended repairs, and parts needed..."
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Reported problem</p>
                <p className="mt-1">{reviewJob.problem_description}</p>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={reviewSaving}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={reviewSaving}
                className="inline-flex min-w-[160px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-60"
              >
                {reviewSaving ? 'Saving...' : 'Save Review & Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
