'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';

type PaperSize = 'a4' | 'letter' | 'continuous' | 'a5';

interface CompanyProfile {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  currency?: string;
}

interface DocumentItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface JobCardBrief {
  job_card_number?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  vehicle_no?: string;
  brand?: string;
  model?: string;
  chassis_no?: string;
  problem_description?: string;
  assigned_employee?: { first_name?: string; last_name?: string };
}

interface JobCardDocument {
  id: number;
  document_type: 'quotation' | 'invoice';
  document_number: string;
  document_date: string;
  valid_until?: string | null;
  due_date?: string | null;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount?: number;
  balance_amount?: number;
  payment_status?: string;
  payment_type?: string | null;
  payment_reference?: string | null;
  notes?: string | null;
  items?: DocumentItem[];
  job_card?: JobCardBrief;
}

const PAPER_OPTIONS: { value: PaperSize; label: string }[] = [
  { value: 'continuous', label: 'Dot matrix (9.5″ × 11″)' },
  { value: 'a4', label: 'A4 (210 × 297 mm)' },
  { value: 'letter', label: 'Letter (8.5″ × 11″)' },
  { value: 'a5', label: 'A5 (148 × 210 mm)' },
];

const PAGE_SIZE_CSS: Record<PaperSize, string> = {
  a4: 'A4 portrait',
  letter: 'letter portrait',
  continuous: '9.5in 11in',
  a5: 'A5 portrait',
};

const amount = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const money = (value: number, currency = 'LKR') => `${currency} ${amount(value)}`;

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const PROFILE_DATA_KEY = 'company_profile_data';
const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

export default function JobCardDocumentPrintPage() {
  const params = useParams();
  const id = params?.id as string;
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<JobCardDocument | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>('continuous');
  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;

  const isColumnVisible = (key: string) => !hiddenModules.includes(key);
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

  const fetchAccessProfile = useCallback(async (authToken: string) => {
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
      console.error('Error fetching print visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  }, [API_URL]);

  const handlePrintVisibilityToggle = useCallback(async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating print widget visibility:', error);
    }
  }, [API_URL, canManageFeatureVisibility, token]);

  useEffect(() => {
    const saved = localStorage.getItem('job_card_print_paper') as PaperSize | null;
    if (saved && PAPER_OPTIONS.some((o) => o.value === saved)) {
      setPaperSize(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('job_card_print_paper', paperSize);
  }, [paperSize]);

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
    const token = localStorage.getItem('token');
    if (!token || !id) {
      setLoading(false);
      return;
    }

    setToken(token);
    fetchAccessProfile(token);

    const loadCompany = async () => {
      try {
        const cached = localStorage.getItem(PROFILE_DATA_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as CompanyProfile;
          if (parsed?.name) {
            setCompany(parsed);
            return;
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const res = await axios.get(`${API_URL}/api/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const rows = Array.isArray(res.data) ? res.data : res.data?.data || [];
        if (rows[0]) setCompany(rows[0] as CompanyProfile);
      } catch (error) {
        console.error('Company profile load failed:', error);
      }
    };

    const loadDoc = axios
      .get(`${API_URL}/api/job-card-documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setDoc(res.data?.data || null))
      .catch(console.error);

    Promise.all([loadCompany(), loadDoc]).finally(() => setLoading(false));
  }, [API_URL, fetchAccessProfile, id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const isQuotation = doc?.document_type === 'quotation';
  const title = isQuotation ? 'Quotation' : 'Invoice';
  const currency = company?.currency || 'LKR';
  const job = doc?.job_card || {};
  const technician = job.assigned_employee
    ? `${job.assigned_employee.first_name || ''} ${job.assigned_employee.last_name || ''}`.trim()
    : '';

  const pageStyle = useMemo(
    () => `
      @page {
        size: ${PAGE_SIZE_CSS[paperSize]};
        margin: ${paperSize === 'continuous' ? '6mm 5mm' : paperSize === 'a5' ? '8mm' : '12mm'};
      }
    `,
    [paperSize]
  );

  if (loading) {
    return (
      <div className="print-root flex min-h-screen items-center justify-center bg-slate-200">
        <p style={{ fontFamily: 'system-ui' }}>Loading report…</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="print-root flex min-h-screen items-center justify-center bg-slate-200">
        <p style={{ fontFamily: 'system-ui', color: '#b91c1c' }}>Document not found.</p>
      </div>
    );
  }

  const items = doc.items || [];

  return (
    <div className="print-root" data-paper={paperSize}>
      <style dangerouslySetInnerHTML={{ __html: pageStyle }} />

      <div className="print-toolbar">
        {isElementVisible('job-cards-doc-print-el-toolbar-paper') && (
          <label className="widget-block">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-el-toolbar-paper', true); }}
                className="widget-close-btn"
                title="Hide paper selector"
                aria-label="Hide paper selector"
              >
                x
              </button>
            )}
            Paper
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              aria-label="Paper size"
            >
              {PAPER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {isElementVisible('job-cards-doc-print-el-btn-print') && (
          <div className="widget-block">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-el-btn-print', true); }}
                className="widget-close-btn"
                title="Hide print button"
                aria-label="Hide print button"
              >
                x
              </button>
            )}
            <button type="button" className="primary" onClick={handlePrint}>
              Print report
            </button>
          </div>
        )}
        {isElementVisible('job-cards-doc-print-el-btn-close') && (
          <div className="widget-block">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-el-btn-close', true); }}
                className="widget-close-btn"
                title="Hide close button"
                aria-label="Hide close button"
              >
                x
              </button>
            )}
            <button type="button" onClick={() => window.close()}>
              Close
            </button>
          </div>
        )}
      </div>

      <div className="print-sheet-wrap">
        <article className="print-sheet" aria-label={`${title} ${doc.document_number}`}>
          {isElementVisible('job-cards-doc-print-sec-company') && (
            <div className="widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-company', true); }}
                  className="widget-close-btn"
                  title="Hide company section"
                  aria-label="Hide company section"
                >
                  x
                </button>
              )}
              <h1 className="rpt-company-name">{company?.name || 'Service Centre'}</h1>
              <p className="rpt-company-meta">
                {[company?.address, company?.phone, company?.email, company?.website]
                  .filter(Boolean)
                  .join('  |  ')}
              </p>

              <hr className="rpt-rule-double" />

              <h2 className="rpt-title">{title}</h2>

              <hr className="rpt-rule" />
            </div>
          )}

          {isElementVisible('job-cards-doc-print-sec-meta') && (
            <div className="widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-meta', true); }}
                  className="widget-close-btn"
                  title="Hide metadata section"
                  aria-label="Hide metadata section"
                >
                  x
                </button>
              )}
              <div className="rpt-doc-meta">
                <div>
                  <span className="label">No: </span>
                  {doc.document_number}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="label">Date: </span>
                  {fmtDate(doc.document_date)}
                </div>
                <div>
                  <span className="label">Job card: </span>
                  {job.job_card_number || '—'}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {isQuotation && doc.valid_until ? (
                    <>
                      <span className="label">Valid until: </span>
                      {fmtDate(doc.valid_until)}
                    </>
                  ) : !isQuotation && doc.due_date ? (
                    <>
                      <span className="label">Due date: </span>
                      {fmtDate(doc.due_date)}
                    </>
                  ) : (
                    <>
                      <span className="label">Status: </span>
                      {doc.status}
                    </>
                  )}
                </div>
              </div>

              <hr className="rpt-rule" />
            </div>
          )}

          {isElementVisible('job-cards-doc-print-sec-customer-vehicle') && (
            <div className="widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-customer-vehicle', true); }}
                  className="widget-close-btn"
                  title="Hide customer and vehicle section"
                  aria-label="Hide customer and vehicle section"
                >
                  x
                </button>
              )}
              <div className="rpt-two-col">
                <div>
                  <div className="rpt-block-title">Customer</div>
                  <div>{job.customer_name || '—'}</div>
                  <div>Tel: {job.customer_phone || '—'}</div>
                  {job.customer_email && <div>{job.customer_email}</div>}
                </div>
                <div>
                  <div className="rpt-block-title">Vehicle</div>
                  {job.vehicle_no && <div>Reg: {job.vehicle_no}</div>}
                  <div>{[job.brand, job.model].filter(Boolean).join(' ') || '—'}</div>
                  {job.chassis_no && <div>Chassis: {job.chassis_no}</div>}
                  {technician && <div>Technician: {technician}</div>}
                </div>
              </div>

              <hr className="rpt-rule" />
            </div>
          )}

          {isElementVisible('job-cards-doc-print-sec-items') && (
            <div className="widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-items', true); }}
                  className="widget-close-btn"
                  title="Hide items section"
                  aria-label="Hide items section"
                >
                  x
                </button>
              )}
              <table className="rpt-items">
            <thead>
              <tr>
                {isColumnVisible('job-cards-doc-print-col-index') && (
                  <th className="center" style={{ width: '2.5em' }}>
                    #
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-col-index', true); }}
                        className="widget-close-btn"
                        title="Hide # column"
                        aria-label="Hide # column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('job-cards-doc-print-col-description') && (
                  <th>
                    Description
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-col-description', true); }}
                        className="widget-close-btn"
                        title="Hide description column"
                        aria-label="Hide description column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('job-cards-doc-print-col-qty') && (
                  <th className="num" style={{ width: '4.5em' }}>
                    Qty
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-col-qty', true); }}
                        className="widget-close-btn"
                        title="Hide qty column"
                        aria-label="Hide qty column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('job-cards-doc-print-col-rate') && (
                  <th className="num" style={{ width: '6.5em' }}>
                    Rate
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-col-rate', true); }}
                        className="widget-close-btn"
                        title="Hide rate column"
                        aria-label="Hide rate column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('job-cards-doc-print-col-amount') && (
                  <th className="num" style={{ width: '7em' }}>
                    Amount
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-col-amount', true); }}
                        className="widget-close-btn"
                        title="Hide amount column"
                        aria-label="Hide amount column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max([
                      'job-cards-doc-print-col-index',
                      'job-cards-doc-print-col-description',
                      'job-cards-doc-print-col-qty',
                      'job-cards-doc-print-col-rate',
                      'job-cards-doc-print-col-amount',
                    ].filter((key) => isColumnVisible(key)).length, 1)}
                    className="center"
                  >
                    No line items
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id}>
                    {isColumnVisible('job-cards-doc-print-col-index') && <td className="center">{index + 1}</td>}
                    {isColumnVisible('job-cards-doc-print-col-description') && <td>{item.description}</td>}
                    {isColumnVisible('job-cards-doc-print-col-qty') && <td className="num">{Number(item.quantity).toFixed(2)}</td>}
                    {isColumnVisible('job-cards-doc-print-col-rate') && <td className="num">{amount(Number(item.unit_price))}</td>}
                    {isColumnVisible('job-cards-doc-print-col-amount') && <td className="num">{amount(Number(item.line_total))}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
            </div>
          )}

          {isElementVisible('job-cards-doc-print-sec-totals') && (
            <div className="widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-totals', true); }}
                  className="widget-close-btn"
                  title="Hide totals section"
                  aria-label="Hide totals section"
                >
                  x
                </button>
              )}
              <div className="rpt-totals">
              <div className="row">
                <span>Subtotal</span>
                <span>{money(Number(doc.subtotal), currency)}</span>
              </div>
              {Number(doc.discount_amount) > 0 && (
                <div className="row">
                  <span>Discount</span>
                  <span>- {money(Number(doc.discount_amount), currency)}</span>
                </div>
              )}
              {Number(doc.tax_amount) > 0 && (
                <div className="row">
                  <span>Tax</span>
                  <span>{money(Number(doc.tax_amount), currency)}</span>
                </div>
              )}
              <div className="row">
                <span>TOTAL</span>
                <span>{money(Number(doc.total_amount), currency)}</span>
              </div>
              {!isQuotation && (
                <>
                  <div className="row">
                    <span>Paid</span>
                    <span>{money(Number(doc.paid_amount || 0), currency)}</span>
                  </div>
                  {Number(doc.balance_amount) > 0 && (
                    <div className="row">
                      <span>Balance due</span>
                      <span>{money(Number(doc.balance_amount), currency)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            </div>
          )}

          {!isQuotation && Number(doc.paid_amount) > 0 && isElementVisible('job-cards-doc-print-sec-payment') && (
            <div className="rpt-notes widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-payment', true); }}
                  className="widget-close-btn"
                  title="Hide payment section"
                  aria-label="Hide payment section"
                >
                  x
                </button>
              )}
              <div className="title">Payment</div>
              <div>
                {doc.payment_type ? `Type: ${doc.payment_type.replace(/_/g, ' ')}` : ''}
                {doc.payment_reference ? ` · Ref: ${doc.payment_reference}` : ''}
                {doc.payment_status ? ` · Status: ${doc.payment_status}` : ''}
              </div>
            </div>
          )}

          {job.problem_description && isElementVisible('job-cards-doc-print-sec-reported-issue') && (
            <div className="rpt-notes widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-reported-issue', true); }}
                  className="widget-close-btn"
                  title="Hide reported issue section"
                  aria-label="Hide reported issue section"
                >
                  x
                </button>
              )}
              <div className="title">Reported issue</div>
              <div>{job.problem_description}</div>
            </div>
          )}

          {doc.notes && isElementVisible('job-cards-doc-print-sec-remarks') && (
            <div className="rpt-notes widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-remarks', true); }}
                  className="widget-close-btn"
                  title="Hide remarks section"
                  aria-label="Hide remarks section"
                >
                  x
                </button>
              )}
              <div className="title">Remarks</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{doc.notes}</div>
            </div>
          )}

          {isQuotation && isElementVisible('job-cards-doc-print-sec-terms') && (
            <div className="rpt-terms widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-terms', true); }}
                  className="widget-close-btn"
                  title="Hide terms section"
                  aria-label="Hide terms section"
                >
                  x
                </button>
              )}
              <div className="title">Terms &amp; conditions</div>
              <ul>
                <li>This quotation is not a tax invoice until accepted and invoiced.</li>
                <li>Prices are in {currency} unless stated otherwise.</li>
                {doc.valid_until && (
                  <li>Offer valid until {fmtDate(doc.valid_until)}.</li>
                )}
                <li>Parts availability and final cost may vary after inspection.</li>
                <li>Payment due on completion unless agreed in writing.</li>
              </ul>
            </div>
          )}

          {isElementVisible('job-cards-doc-print-sec-signatures') && (
            <div className="rpt-signatures widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-sec-signatures', true); }}
                  className="widget-close-btn"
                  title="Hide signatures"
                  aria-label="Hide signatures"
                >
                  x
                </button>
              )}
              <div>
                <div className="rpt-sign-line">Customer signature</div>
              </div>
              <div>
                <div className="rpt-sign-line">Authorized signature</div>
              </div>
            </div>
          )}

          {isElementVisible('job-cards-doc-print-el-footer') && (
            <p className="rpt-footer widget-block">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handlePrintVisibilityToggle('job-cards-doc-print-el-footer', true); }}
                  className="widget-close-btn"
                  title="Hide footer"
                  aria-label="Hide footer"
                >
                  x
                </button>
              )}
              Thank you for your business
            </p>
          )}
        </article>
      </div>
    </div>
  );
}
