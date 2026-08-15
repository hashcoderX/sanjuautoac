'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import './print-report.css';

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
  warranty?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface ServiceInvoiceDoc {
  id: number;
  document_type: 'quotation' | 'invoice';
  document_number: string;
  document_date: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  vehicle_no?: string | null;
  brand?: string | null;
  model?: string | null;
  chassis_no?: string | null;
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

export default function ServiceInvoicePrintPage() {
  const params = useParams();
  const id = params?.id as string;
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<ServiceInvoiceDoc | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>('continuous');

  useEffect(() => {
    const saved = localStorage.getItem('job_card_print_paper') as PaperSize | null;
    if (saved && PAPER_OPTIONS.some((o) => o.value === saved)) setPaperSize(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem('job_card_print_paper', paperSize);
  }, [paperSize]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !id) {
      setLoading(false);
      return;
    }

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
      } catch {
        /* ignore */
      }
    };

    axios
      .get(`${API_URL}/api/service-invoices/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setDoc(res.data?.data || null))
      .catch(console.error);

    loadCompany().finally(() => setLoading(false));
  }, [API_URL, id]);

  const handlePrint = useCallback(() => window.print(), []);

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

  const isQuotation = doc.document_type === 'quotation';
  const title = isQuotation ? 'Quotation' : 'Invoice';
  const currency = company?.currency || 'LKR';
  const items = doc.items || [];
  const hasVehicle = Boolean(doc.vehicle_no || doc.brand || doc.model || doc.chassis_no);
  const showWarrantyColumn = !isQuotation;

  return (
    <div className="print-root" data-paper={paperSize}>
      <style dangerouslySetInnerHTML={{ __html: pageStyle }} />

      <div className="print-toolbar">
        <label>
          Paper
          <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as PaperSize)}>
            {PAPER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" onClick={handlePrint}>
          Print report
        </button>
        <button type="button" onClick={() => window.close()}>
          Close
        </button>
      </div>

      <div className="print-sheet-wrap">
        <article className="print-sheet">
          <h1 className="rpt-company-name">{company?.name || 'Service Centre'}</h1>
          <p className="rpt-company-meta">
            {[company?.address, company?.phone, company?.email, company?.website]
              .filter(Boolean)
              .join('  |  ')}
          </p>

          <hr className="rpt-rule-double" />
          <h2 className="rpt-title">{title}</h2>
          <hr className="rpt-rule" />

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
              <span className="label">Status: </span>
              {doc.status}
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
                <span>—</span>
              )}
            </div>
          </div>

          <hr className="rpt-rule" />

          <div className={hasVehicle ? 'rpt-two-col' : ''}>
            <div>
              <div className="rpt-block-title">Customer</div>
              <div>{doc.customer_name}</div>
              <div>Tel: {doc.customer_phone}</div>
              {doc.customer_email && <div>{doc.customer_email}</div>}
            </div>
            {hasVehicle && (
              <div>
                <div className="rpt-block-title">Vehicle</div>
                {doc.vehicle_no && <div>Reg: {doc.vehicle_no}</div>}
                <div>{[doc.brand, doc.model].filter(Boolean).join(' ') || '—'}</div>
                {doc.chassis_no && <div>Chassis: {doc.chassis_no}</div>}
              </div>
            )}
          </div>

          <hr className="rpt-rule" />

          <table className="rpt-items">
            <thead>
              <tr>
                <th className="center" style={{ width: '2.5em' }}>
                  #
                </th>
                <th>Description</th>
                {showWarrantyColumn && (
                  <th style={{ width: '6em' }}>Warranty</th>
                )}
                <th className="num" style={{ width: '4.5em' }}>
                  Qty
                </th>
                <th className="num" style={{ width: '6.5em' }}>
                  Rate
                </th>
                <th className="num" style={{ width: '7em' }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td className="center">{index + 1}</td>
                  <td>{item.description}</td>
                  {showWarrantyColumn && (
                    <td>{String(item.warranty || '').trim() || '—'}</td>
                  )}
                  <td className="num">{Number(item.quantity).toFixed(2)}</td>
                  <td className="num">{amount(Number(item.unit_price))}</td>
                  <td className="num">{amount(Number(item.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>

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
            <div className="row total">
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

          {!isQuotation && Number(doc.paid_amount) > 0 && (
            <div className="rpt-notes">
              <div className="title">Payment</div>
              <div>
                {doc.payment_type ? `Type: ${doc.payment_type.replace(/_/g, ' ')}` : ''}
                {doc.payment_reference ? ` · Ref: ${doc.payment_reference}` : ''}
                {doc.payment_status ? ` · Status: ${doc.payment_status}` : ''}
              </div>
            </div>
          )}

          {doc.notes && (
            <div className="rpt-notes">
              <div className="title">Remarks</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{doc.notes}</div>
            </div>
          )}

          {isQuotation && (
            <div className="rpt-terms">
              <div className="title">Terms &amp; conditions</div>
              <ul>
                <li>This quotation is not an invoice until accepted.</li>
                <li>Prices are in {currency} unless stated otherwise.</li>
                {doc.valid_until && <li>Offer valid until {fmtDate(doc.valid_until)}.</li>}
              </ul>
            </div>
          )}

          <div className="rpt-signatures">
            <div>
              <div className="rpt-sign-line">Customer signature</div>
            </div>
            <div>
              <div className="rpt-sign-line">Authorized signature</div>
            </div>
          </div>

          <p className="rpt-footer">Thank you for your business</p>
        </article>
      </div>
    </div>
  );
}
