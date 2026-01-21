import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AttendanceRecord, LeaveRequest, Role, User, ESSProfile, UserChecklist, WorkFromHomeRequest } from '../types';
import { formatDuration, calculateWeeklyOvertime } from '../utils/storage';
import { addDaysToDateString, getLocalDateString, getShiftDateString, getShiftAdjustedMinutes, getLocalTimeMinutes, buildZonedISOString, formatTimeInZone } from '../utils/dates';
import { APP_CONFIG } from '../constants';
import logoUrl from '../asset/public/logo.svg';

const parseEmployeeSeed = (employeeId?: string) => {
  const match = (employeeId || '').match(/(\d{3})$/);
  return match ? Number(match[1]) : 0;
};

const getNextEmployeeSeed = (list: User[]) => {
  const maxSeed = list.reduce((max, u) => Math.max(max, parseEmployeeSeed(u.employeeId)), 0);
  return maxSeed + 1;
};

const toInitials = (value?: string) => {
  const letters = (value || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  return letters.padEnd(2, 'X').slice(0, 2);
};

const formatEmployeeId = (firstName?: string, lastName?: string, seed?: number) => {
  const safeSeed = Math.max(1, seed ?? 1);
  const suffix = String(safeSeed).padStart(3, '0');
  return `BS-${toInitials(firstName)}${toInitials(lastName)}${suffix}`;
};

const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let value = '';
  for (let i = 0; i < 10; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
};

const normalizePin = (value?: string) => (value || '').replace(/\D/g, '').slice(0, 4);

const splitName = (name?: string) => {
  const parts = (name || '').trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';
  return { firstName, lastName };
};

const formatFullName = (firstName?: string, lastName?: string) =>
  [firstName, lastName].filter(Boolean).join(' ').trim();

const calculateTotalSalary = (basic?: number, allowances?: number, fallback?: number) => {
  const baseValue = Number(basic) || 0;
  const allowanceValue = Number(allowances) || 0;
  const total = baseValue + allowanceValue;
  return total || (Number(fallback) || 0);
};

const calculateMonthlyTax = (grossPay: number) => {
  const salary = Math.max(0, grossPay);
  if (salary <= 50_000) return 0;
  if (salary <= 100_000) return (salary - 50_000) * 0.01;
  return 500 + (salary - 100_000) * 0.05;
};

type DocumentType = 'salary-slip' | 'offer-letter' | 'appointment-letter' | 'experience-letter';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatCurrency = (value: number) => `PKR ${value.toLocaleString()}`;

const numberToWords = (value: number): string => {
  const ones = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
    'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const toWords = (num: number): string => {
    if (num < 20) return ones[num];
    if (num < 100) return `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ''}`;
    if (num < 1000) {
      return `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ` And ${toWords(num % 100)}` : ''}`;
    }
    if (num < 1_000_000) {
      return `${toWords(Math.floor(num / 1000))} Thousand${num % 1000 ? ` ${toWords(num % 1000)}` : ''}`;
    }
    if (num < 1_000_000_000) {
      return `${toWords(Math.floor(num / 1_000_000))} Million${num % 1_000_000 ? ` ${toWords(num % 1_000_000)}` : ''}`;
    }
    return `${toWords(Math.floor(num / 1_000_000_000))} Billion${num % 1_000_000_000 ? ` ${toWords(num % 1_000_000_000)}` : ''}`;
  };

  const normalized = Math.max(0, Math.floor(value));
  return toWords(normalized);
};

const getRoleHighlights = (roleValue: string): string[] => {
  const roleKey = roleValue.toLowerCase();
  if (roleKey.includes('data scientist') || roleKey.includes('data analyst') || roleKey.includes('data')) {
    return [
      'Data Visualization & Reporting: Building dashboards and KPI reports.',
      'Statistical Analysis: Using SQL and Python/R for insights and trends.',
      'Process Optimization: Finding patterns to improve efficiency.',
      'Collaboration: Working with cross-functional teams on data needs.'
    ];
  }
  if (roleKey.includes('web') || roleKey.includes('frontend') || roleKey.includes('backend')) {
    return [
      'Web Development: Building responsive and scalable web applications.',
      'Performance Optimization: Improving load times and reliability.',
      'Code Quality: Maintaining clean, testable, and reusable code.',
      'Collaboration: Coordinating with designers and QA for delivery.'
    ];
  }
  if (roleKey.includes('ui') || roleKey.includes('ux') || roleKey.includes('product design')) {
    return [
      'User Research: Gathering feedback and defining user journeys.',
      'Interface Design: Creating wireframes and high-fidelity designs.',
      'Design Systems: Maintaining consistent visual standards.',
      'Collaboration: Working with developers to implement designs.'
    ];
  }
  if (roleKey.includes('graphic') || roleKey.includes('graphics') || roleKey.includes('visual')) {
    return [
      'Brand Assets: Designing marketing and brand collateral.',
      'Creative Execution: Producing visuals for digital and print.',
      'Campaign Support: Delivering assets for promotions and launches.',
      'Collaboration: Working with marketing and product teams.'
    ];
  }
  if (roleKey.includes('sales') || roleKey.includes('business development')) {
    return [
      'Client Acquisition: Generating leads and closing deals.',
      'Account Management: Maintaining strong client relationships.',
      'Sales Reporting: Tracking pipeline and performance metrics.',
      'Collaboration: Coordinating with delivery teams for success.'
    ];
  }
  if (roleKey.includes('app') || roleKey.includes('mobile') || roleKey.includes('android') || roleKey.includes('ios')) {
    return [
      'App Development: Building mobile applications and features.',
      'Testing & QA: Ensuring stability and smooth user experience.',
      'Performance Optimization: Improving speed and responsiveness.',
      'Collaboration: Working with product and design teams.'
    ];
  }
  return [
    'Core Responsibilities: Executing assigned duties with quality.',
    'Process Improvement: Identifying opportunities for efficiency.',
    'Collaboration: Coordinating with teams to deliver outcomes.',
    'Professional Conduct: Maintaining high standards and values.'
  ];
};

const buildDocumentHtml = (
  type: DocumentType,
  data: Record<string, string>,
  logoSrc: string,
  signatureSrc: string | null,
  showNetPay: boolean
) => {
  const safe = (key: string, fallback = '-') => escapeHtml(data[key] || fallback);
  const safeUpper = (key: string, fallback = '-') =>
    escapeHtml((data[key] || fallback).toUpperCase());
  const issueDate = safe('issueDate', getLocalDateString(new Date()));
  const employeeName = safeUpper('employeeName');
  const employeeId = safe('employeeId');
  const role = safeUpper('role');
  const startDate = safe('startDate');
  const endDate = safe('endDate');
  const location = safe('location', 'Karachi');
  const ceoDesignation = safeUpper('signatory', 'CHIEF EXECUTIVE OFFICER');
  const ceoName = safeUpper('ceoName', 'KAZMI');
  const company = safeUpper('company', 'BYTECHSOL LLC');
  const workingDays = safe('workingDays', '30');
  const hrFooter = 'Human Resources Department';
  const basicPay = Number(data.basicPay || 0);
  const homeAllowance = Number(data.homeAllowance || 0);
  const travelAllowance = Number(data.travelAllowance || 0);
  const internetAllowance = Number(data.internetAllowance || 0);
  const otherDeductions = Number(data.otherDeductions || 0);
  const totalEarnings = basicPay + homeAllowance + travelAllowance + internetAllowance;
  const tax = Math.round(calculateMonthlyTax(totalEarnings));
  const totalDeductions = tax + otherDeductions;
  const netPay = Math.max(0, totalEarnings - totalDeductions);
  const netPayDisplay = showNetPay ? formatCurrency(netPay) : 'Restricted';
  const netPayWords = showNetPay ? `${numberToWords(netPay)} Only` : 'Restricted';

  const header = `
    <div style="position:relative;overflow:hidden;border-radius:16px;background:linear-gradient(120deg,#e0edff 0%,#f8fafc 60%);padding:16px 18px 22px 18px;margin-bottom:6px;">
      <svg viewBox="0 0 600 60" preserveAspectRatio="none" style="position:absolute;left:0;bottom:-1px;width:100%;height:40px;">
        <path d="M0 30C120 60 240 0 360 28C460 50 540 48 600 34V60H0Z" fill="#1e40af" opacity="0.22"></path>
      </svg>
      <div style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="${logoSrc}" alt="BytechSol" style="height:46px;width:auto;" />
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.2em;color:#64748b;">Issue Date</div>
          <div style="font-size:12px;font-weight:700;color:#0f172a;">${issueDate}</div>
        </div>
      </div>
    </div>
  `;

  const footer = `
    <div style="margin-top:32px;position:relative;overflow:hidden;border-radius:14px;background:linear-gradient(120deg,#f8fafc 0%,#e0edff 60%);padding:14px 16px 18px 16px;">
      <svg viewBox="0 0 600 60" preserveAspectRatio="none" style="position:absolute;left:0;top:-1px;width:100%;height:34px;">
        <path d="M0 30C140 0 260 52 360 34C470 20 540 16 600 26V0H0Z" fill="#2563eb" opacity="0.2"></path>
      </svg>
      <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${logoSrc}" alt="BytechSol" style="height:28px;width:auto;" />
        </div>
        <div style="text-align:right;font-size:11px;color:#64748b;">${hrFooter}</div>
      </div>
    </div>
  `;

  const containerStart = `
    <div style="font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#0f172a;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:24px;position:relative;overflow:hidden;page-break-inside:avoid;">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0.1;">
        <img src="${logoSrc}" alt="Watermark" style="width:300px;height:auto;" />
      </div>
      <div style="position:relative;z-index:1;">
      ${header}
  `;
  const containerEnd = `</div></div>`;

  const signatureBlock = `
    <div style="margin-top:8px;">
      ${signatureSrc ? `<img src="${signatureSrc}" alt="CEO Signature" style="height:54px;width:auto;margin-bottom:6px;" />` : ''}
      <div style="font-size:12px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#64748b;">${ceoDesignation}</div>
      <div style="font-size:14px;font-weight:800;color:#0f172a;margin-top:2px;">${ceoName}</div>
    </div>
  `;

  const docHead = `<head><meta charset="utf-8" /><style>@page{size:A4;margin:0;}html,body{width:210mm;height:297mm;margin:0;padding:0;}*{box-sizing:border-box;}</style></head>`;
  const docRootStart = `<div id="doc-root" style="width:210mm;height:297mm;box-sizing:border-box;padding:6mm;margin:0;background:#f8fafc;overflow:hidden;">`;
  const docRootEnd = `</div>`;

  if (type === 'salary-slip') {
    return `
      <!doctype html><html>${docHead}<body style="background:#f8fafc;padding:0;margin:0;">
      ${docRootStart}
      ${containerStart}
        <h1 style="font-size:20px;font-weight:800;margin:24px 0 6px 0;text-align:center;">Payslip</h1>
        <div style="text-align:center;font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px;">${company}</div>
        <div style="text-align:center;font-size:11px;color:#64748b;margin-bottom:16px;">30 N Gould St Ste R Sheridon, WY 82801</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;">
          <tr>
            <td style="padding:6px 0;color:#94a3b8;">Working Days</td>
            <td style="padding:6px 0;font-weight:700;">${workingDays}</td>
            <td style="padding:6px 0;color:#94a3b8;">Employee Name</td>
            <td style="padding:6px 0;font-weight:700;">${employeeName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#94a3b8;">Employee ID</td>
            <td style="padding:6px 0;font-weight:700;">${employeeId}</td>
            <td style="padding:6px 0;color:#94a3b8;">Designation</td>
            <td style="padding:6px 0;font-weight:700;">${role}</td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">
          <tr style="background:#f1f5f9;">
            <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#64748b;">Earnings</th>
            <th style="text-align:right;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#64748b;">Amount</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#64748b;">Deductions</th>
            <th style="text-align:right;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#64748b;">Amount</th>
          </tr>
          <tr>
            <td style="padding:8px 10px;">Basic Pay</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;">${formatCurrency(basicPay)}</td>
            <td style="padding:8px 10px;">Tax (PK progressive)</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;">${formatCurrency(tax)}</td>
          </tr>
          <tr>
            <td style="padding:8px 10px;">Home Allowance</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;">${formatCurrency(homeAllowance)}</td>
            <td style="padding:8px 10px;">Other Deductions</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;">${formatCurrency(otherDeductions)}</td>
          </tr>
          <tr>
            <td style="padding:8px 10px;">Travel Allowance</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;">${formatCurrency(travelAllowance)}</td>
            <td style="padding:8px 10px;"></td>
            <td style="padding:8px 10px;"></td>
          </tr>
          <tr>
            <td style="padding:8px 10px;">Internet and Phone</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;">${formatCurrency(internetAllowance)}</td>
            <td style="padding:8px 10px;"></td>
            <td style="padding:8px 10px;"></td>
          </tr>
          <tr style="border-top:1px solid #e2e8f0;">
            <td style="padding:8px 10px;font-weight:700;">Total Earnings</td>
            <td style="padding:8px 10px;text-align:right;font-weight:800;">${formatCurrency(totalEarnings)}</td>
            <td style="padding:8px 10px;font-weight:700;">Total Deductions</td>
            <td style="padding:8px 10px;text-align:right;font-weight:800;">${formatCurrency(totalDeductions)}</td>
          </tr>
        </table>
        <div style="font-size:11px;color:#64748b;margin-top:10px;">
          Tax is calculated using progressive Pakistan slabs.
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:16px;">
          <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.2em;">Net Pay</div>
          <div style="font-size:18px;font-weight:800;color:#2563eb;">${netPayDisplay}</div>
        </div>
        <div style="text-align:center;font-size:20px;font-weight:800;color:#0f172a;margin-top:12px;">${showNetPay ? formatCurrency(netPay).replace('PKR ', '') : 'Restricted'}</div>
        <div style="text-align:center;font-size:12px;color:#64748b;margin-top:6px;">${netPayWords}</div>
        <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:14px;">This is a system generated payslip. No stamp or signature is required.</div>
        ${footer}
      ${containerEnd}
      ${docRootEnd}
      </body></html>
    `;
  }

  if (type === 'offer-letter') {
    return `
      <!doctype html><html>${docHead}<body style="background:#f8fafc;padding:0;margin:0;">
      ${docRootStart}
      ${containerStart}
        <h1 style="font-size:20px;font-weight:800;margin:24px 0 6px 0;text-align:center;">Offer Letter</h1>
        <div style="text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#94a3b8;margin-bottom:14px;">Subject: Offer of Employment</div>
        <p style="font-size:13px;line-height:1.7;color:#334155;margin-top:16px;">
          Dear ${employeeName},
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          We are pleased to offer you the position of <strong>${role}</strong> at ${company}. Your expected joining date is <strong>${startDate}</strong> at our ${location} office. This offer is based on the discussions held and is subject to completion of any pre-employment requirements and verification of credentials.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          In this role, you will be expected to collaborate with cross-functional teams, maintain high standards of professionalism, and contribute to timely delivery of projects aligned with company goals. Your compensation, benefits, and terms of employment will be governed by company policies and the official appointment documentation.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          Please confirm your acceptance by replying to this letter and submitting any required onboarding documents. Once received, we will proceed with your formal appointment and onboarding schedule.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;margin-top:18px;">Sincerely,</p>
        ${signatureBlock}
        ${footer}
      ${containerEnd}
      ${docRootEnd}
      </body></html>
    `;
  }

  if (type === 'appointment-letter') {
    return `
      <!doctype html><html>${docHead}<body style="background:#f8fafc;padding:0;margin:0;">
      ${docRootStart}
      ${containerStart}
        <h1 style="font-size:20px;font-weight:800;margin:24px 0 6px 0;text-align:center;">Appointment Letter</h1>
        <div style="text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#94a3b8;margin-bottom:14px;">Subject: Appointment Confirmation</div>
        <p style="font-size:13px;line-height:1.7;color:#334155;margin-top:16px;">
          Dear ${employeeName},
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          We are pleased to appoint you as <strong>${role}</strong> at ${company}. Your appointment is effective from <strong>${startDate}</strong> at our ${location} office. You will report to your assigned manager and perform duties as per your job description and departmental requirements.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          You are expected to comply with all company policies, confidentiality standards, and professional conduct guidelines. Your compensation, benefits, and working schedule will be governed by company policies and communicated during onboarding.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          We look forward to your valuable contribution and wish you success in your role. Please retain this letter for your records.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;margin-top:18px;">Sincerely,</p>
        ${signatureBlock}
        ${footer}
      ${containerEnd}
      ${docRootEnd}
      </body></html>
    `;
  }

  return `
    <!doctype html><html>${docHead}<body style="background:#f8fafc;padding:0;margin:0;">
    ${docRootStart}
    ${containerStart}
      <h1 style="font-size:20px;font-weight:800;margin:24px 0 6px 0;text-align:center;">Professional Experience Letter</h1>
      <div style="text-align:center;font-size:12px;color:#64748b;margin-bottom:16px;">Date: ${issueDate} &nbsp;|&nbsp; Location: ${location}, Pakistan</div>
      <div style="text-transform:uppercase;font-size:12px;font-weight:800;letter-spacing:0.3em;color:#0f172a;margin-bottom:14px;text-align:center;">To Whom It May Concern</div>
      <p style="font-size:13px;line-height:1.7;color:#334155;">
        This is to certify that <strong>Mr./Ms. ${employeeName}</strong> was employed with ${company} as a <strong>${role}</strong> from <strong>${startDate}</strong> to <strong>${endDate}</strong>.
      </p>
      <p style="font-size:13px;line-height:1.7;color:#334155;">
        During the tenure, ${employeeName} played a pivotal role in the department. Key responsibilities and contributions included:
      </p>
      <ul style="font-size:13px;line-height:1.7;color:#334155;padding-left:18px;margin:10px 0 14px 0;">
        ${getRoleHighlights(role).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
      <p style="font-size:13px;line-height:1.7;color:#334155;">
        ${employeeName} demonstrated strong analytical thinking, attention to detail, and professional conduct aligned with organizational values. We appreciate the contributions and wish continued success in future endeavors.
      </p>
      <p style="font-size:13px;line-height:1.7;color:#334155;">
        This letter is issued upon request without any legal or financial liability on the company.
      </p>
      <p style="font-size:13px;line-height:1.7;color:#334155;margin-top:18px;">Sincerely,</p>
      ${signatureBlock}
      ${footer}
    ${containerEnd}
    ${docRootEnd}
    </body></html>
  `;
};

interface AdminDashboardProps {
  user: User;
  users: User[];
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  wfhRequests: WorkFromHomeRequest[];
  essProfiles: ESSProfile[];
  checklists: UserChecklist[];
  onLeaveAction: (id: string, action: 'Approved' | 'Rejected') => void;
  onCheckIn: () => void;
  onCheckOut: () => void;
  isWifiConnected: boolean;
  onUpdateRecord: (updatedRecord: AttendanceRecord) => void;
  onUpdateChecklist: (checklist: UserChecklist) => void;
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onSubmitLeave: (start: string, end: string, reason: string) => void;
  onWfhAction: (id: string, action: 'Approved' | 'Rejected') => void;
  onUpdateESS: (profile: ESSProfile) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  users,
  records,
  leaves,
  wfhRequests,
  essProfiles,
  checklists,
  onLeaveAction,
  onCheckIn,
  onCheckOut,
  isWifiConnected,
  onUpdateRecord,
  onUpdateChecklist,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onSubmitLeave,
  onWfhAction,
  onUpdateESS
}) => {
  const [tab, setTab] = useState<'attendance' | 'leaves' | 'overtime' | 'personnel' | 'documents'>('attendance');
  const [selectedEmp, setSelectedEmp] = useState('all');
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [employeeIdSeed, setEmployeeIdSeed] = useState(() => getNextEmployeeSeed(users));

  // Manual Edit States for Records
  const [editDate, setEditDate] = useState('');
  const [editInTime, setEditInTime] = useState('');
  const [editOutTime, setEditOutTime] = useState('');

  // User Edit States
  const [userForm, setUserForm] = useState<Partial<User>>({});
  const [essForm, setEssForm] = useState<Partial<ESSProfile>>({});
  const [docType, setDocType] = useState<DocumentType>('salary-slip');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [selectedDocUserId, setSelectedDocUserId] = useState('manual');
  const previewRef = useRef<HTMLIFrameElement | null>(null);
  const pdfRenderRef = useRef<HTMLDivElement | null>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);
  const buildLeaveTemplate = (employee: User) =>
    `Leave Application\n\nReason:\n\nRegards,\n${employee.name}\nID: ${employee.employeeId}`;
  const [leaveApplication, setLeaveApplication] = useState(buildLeaveTemplate(user));
  const [leaveStartDate, setLeaveStartDate] = useState(() => getLocalDateString(new Date()));
  const [leaveEndDate, setLeaveEndDate] = useState(() => getLocalDateString(new Date()));
  const [attendanceDateFilter, setAttendanceDateFilter] = useState('');
  const [docForm, setDocForm] = useState<Record<string, string>>(() => {
    const now = new Date();
    const today = getLocalDateString(now);
    return {
      employeeName: '',
      employeeId: '',
      role: '',
      issueDate: today,
      workingDays: '30',
      basicPay: '',
      homeAllowance: '',
      travelAllowance: '',
      internetAllowance: '',
      taxRate: '0',
      otherDeductions: '',
      startDate: today,
      endDate: today,
      location: 'Karachi',
      signatory: 'CHIEF EXECUTIVE OFFICER',
      ceoName: 'YASIR BAJWA',
      company: 'BYTECHSOL LLC',
      basicSalary: '',
      allowances: '',
      deductions: ''
    };
  });
  const documentRoleOptions = [
    'Data Scientist',
    'Data Analyst',
    'Business Analyst',
    'Project Manager',
    'Web Developer',
    'Frontend Developer',
    'Backend Developer',
    'UI/UX Designer',
    'Graphics Designer',
    'Sales Executive',
    'Business Development',
    'App Developer',
    'Mobile Developer',
    'Software Engineer'
  ];
  const isOtherDocRole = !documentRoleOptions.includes(docForm.role);
  const gradeOptions = [
    'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10',
    'OG-1', 'OG-2', 'OG-3',
    'AVP', 'VP', 'SVP', 'EVP'
  ];

  const isSuperadmin = user.role === Role.SUPERADMIN;
  const isHr = user.role === Role.HR;
  const isCeo = user.role === Role.CEO;
  const canDeleteUsers = isSuperadmin || isCeo;
  const canResetPassword = Boolean(editingUser && editingUser.role !== Role.SUPERADMIN);
  const visibleUsers = isHr
    ? users.filter(u => u.role !== Role.SUPERADMIN && u.role !== Role.CEO)
    : isCeo
      ? users.filter(u => u.role !== Role.SUPERADMIN)
      : users;
  const workforceUsers = visibleUsers.filter(u => u.role !== Role.SUPERADMIN);
  const visibleUserIds = new Set(visibleUsers.map(u => u.id));
  const visibleRecords = isSuperadmin ? records : records.filter(r => visibleUserIds.has(r.userId));
  const visibleLeaves = isSuperadmin ? leaves : leaves.filter(l => visibleUserIds.has(l.userId));
  const visibleWfh = isSuperadmin ? wfhRequests : wfhRequests.filter(r => visibleUserIds.has(r.userId));
  const filteredAttendanceBase = selectedEmp === 'all' ? visibleRecords : visibleRecords.filter(r => r.userId === selectedEmp);
  const filteredAttendance = attendanceDateFilter
    ? filteredAttendanceBase.filter(r => r.date === attendanceDateFilter)
    : filteredAttendanceBase;
  const canApprove = user.role === Role.CEO || user.role === Role.SUPERADMIN;
  const isExecutive = user.role === Role.CEO || user.role === Role.SUPERADMIN;
  const roleOptions = isSuperadmin
    ? Object.values(Role)
    : Object.values(Role).filter(r => r !== Role.SUPERADMIN && (!isHr || r !== Role.CEO));
  const salarySlipSelfOnly = isHr && docType === 'salary-slip';
  const documentUsers = salarySlipSelfOnly
    ? [user]
    : visibleUsers.filter(u => u.role !== Role.SUPERADMIN);
  const [shiftStartHour, shiftStartMinute] = APP_CONFIG.SHIFT_START.split(':').map(Number);
  const [shiftEndHour, shiftEndMinute] = APP_CONFIG.SHIFT_END.split(':').map(Number);
  const shiftStartMinutes = shiftStartHour * 60 + shiftStartMinute;
  const shiftEndMinutes = shiftEndHour * 60 + shiftEndMinute;
  const isOvernightShift = shiftEndMinutes <= shiftStartMinutes;
  const shiftEndAdjusted = isOvernightShift ? shiftEndMinutes + 24 * 60 : shiftEndMinutes;
  const earlyCheckoutCutoff = shiftEndAdjusted - (APP_CONFIG.CHECKOUT_EARLY_RELAXATION_MINS || 0);
  const docEarningsTotal = (Number(docForm.basicPay) || 0)
    + (Number(docForm.homeAllowance) || 0)
    + (Number(docForm.travelAllowance) || 0)
    + (Number(docForm.internetAllowance) || 0);
  const docTaxAmount = Math.round(calculateMonthlyTax(docEarningsTotal));

  useEffect(() => {
    setLeaveApplication(buildLeaveTemplate(user));
    const today = getLocalDateString(new Date());
    setLeaveStartDate(today);
    setLeaveEndDate(today);
  }, [user.id, user.name, user.employeeId]);

  useEffect(() => {
    if (!salarySlipSelfOnly) return;
    if (selectedDocUserId !== user.id) {
      handleDocumentUserSelect(user.id);
    }
  }, [salarySlipSelfOnly, selectedDocUserId, user.id, users]);

  const getDisplayStatus = (record: AttendanceRecord) => {
    const worker = users.find(u => u.id === record.userId);
    if (worker?.workMode === 'Remote') return record.status || 'On-Time';
    if (!record.checkIn) return record.status || 'On-Time';
    const checkInDate = new Date(record.checkIn);
    const { currentMinutes, startMinutes } = getShiftAdjustedMinutes(
      checkInDate,
      APP_CONFIG.SHIFT_START,
      APP_CONFIG.SHIFT_END
    );
    if (currentMinutes < startMinutes) return 'Early';
    return record.status || 'On-Time';
  };

  const getCheckoutStatus = (record: AttendanceRecord) => {
    if (!record.checkOut) return 'Active';
    const checkOutDate = new Date(record.checkOut);
    const checkOutRawMinutes = getLocalTimeMinutes(checkOutDate);
    const checkOutMinutes = isOvernightShift && checkOutRawMinutes < shiftStartMinutes
      ? checkOutRawMinutes + 24 * 60
      : checkOutRawMinutes;
    if (checkOutMinutes < earlyCheckoutCutoff) return 'Early';
    if (checkOutMinutes > shiftEndAdjusted) return 'Overtime';
    return 'On-Time';
  };

  const handleDocumentUserSelect = (userId: string) => {
    setSelectedDocUserId(userId);
    if (!userId || userId === 'manual') return;
    const selectedUser = users.find(u => u.id === userId);
    if (!selectedUser) return;
    const fallbackName = formatFullName(selectedUser.firstName, selectedUser.lastName) || selectedUser.name || '';
    const roleLabel = selectedUser.position || selectedUser.role || '';
    setDocForm(prev => ({
      ...prev,
      employeeName: selectedUser.name || fallbackName,
      employeeId: selectedUser.employeeId || '',
      role: roleLabel,
      basicPay: selectedUser.basicSalary ? String(selectedUser.basicSalary) : prev.basicPay,
      homeAllowance: selectedUser.allowances ? String(selectedUser.allowances) : prev.homeAllowance
    }));
  };

  useEffect(() => {
    let active = true;
    const loadLogo = async () => {
      try {
        const response = await fetch(logoUrl, { cache: 'no-store' });
        const svg = await response.text();
        if (!active) return;
        const encoded = window.btoa(unescape(encodeURIComponent(svg)));
        setLogoDataUrl(`data:image/svg+xml;base64,${encoded}`);
      } catch {
        if (active) {
          setLogoDataUrl(null);
        }
      }
    };
    loadLogo();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const handleReady = () => {
      if (active) setPdfReady(true);
    };
    const handleFail = () => {
      if (active) setPdfLoadFailed(true);
    };
    const existing = (window as any).html2pdf;
    if (existing) {
      handleReady();
      return () => {
        active = false;
      };
    }
    const scriptId = 'html2pdf-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener('load', handleReady);
    script.addEventListener('error', handleFail);
    return () => {
      active = false;
      script?.removeEventListener('load', handleReady);
      script?.removeEventListener('error', handleFail);
    };
  }, []);

  const documentHtml = useMemo(
    () => buildDocumentHtml(
      docType,
      docForm,
      logoDataUrl || logoUrl,
      signatureDataUrl,
      user.role === Role.CEO
    ),
    [docType, docForm, logoDataUrl, signatureDataUrl, user.role]
  );
  const docRootHtml = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const parsed = new DOMParser().parseFromString(documentHtml, 'text/html');
    const root = parsed.getElementById('doc-root');
    return root ? root.outerHTML : '';
  }, [documentHtml]);

  const openPrintView = (autoPrint = true, titleOverride?: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return null;
    const title = titleOverride || 'document';
    const htmlWithTitle = documentHtml.replace('<head>', `<head><title>${title}</title>`);
    printWindow.document.open();
    printWindow.document.write(htmlWithTitle);
    printWindow.document.close();
    printWindow.document.title = title;
    if (autoPrint) {
      printWindow.addEventListener('load', () => {
        printWindow.focus();
        printWindow.print();
      });
    }
    return printWindow;
  };

  const myRecord = [...records].reverse().find(r => r.userId === user.id && !r.checkOut);
  const myShiftDate = getShiftDateString(new Date(), APP_CONFIG.SHIFT_START, APP_CONFIG.SHIFT_END);
  const hasMyShiftRecord = records.some(r => r.userId === user.id && r.date === myShiftDate);
  const shiftLocked = hasMyShiftRecord && !myRecord;

  const startEditingRecord = (r: AttendanceRecord) => {
    setEditingRecord(r);
    setEditDate(r.date);
    setEditInTime(new Date(r.checkIn).toTimeString().slice(0, 5));
    setEditOutTime(r.checkOut ? new Date(r.checkOut).toTimeString().slice(0, 5) : '');
  };

  const startEditingUser = (u: User) => {
    setEditingUser(u);
    const currentSeed = parseEmployeeSeed(u.employeeId);
    setEmployeeIdSeed(currentSeed > 0 ? currentSeed : getNextEmployeeSeed(users));
    const derived = splitName(u.firstName || u.name);
    const derivedBasic = typeof u.basicSalary === 'number' ? u.basicSalary : (typeof u.salary === 'number' ? u.salary : 0);
    const derivedAllowances = typeof u.allowances === 'number' ? u.allowances : 0;
    setUserForm({
      ...u,
      firstName: u.firstName || derived.firstName,
      lastName: u.lastName || derived.lastName,
      name: formatFullName(u.firstName || derived.firstName, u.lastName || derived.lastName) || u.name,
      basicSalary: derivedBasic,
      allowances: derivedAllowances,
      workMode: u.workMode || 'Onsite',
      grade: u.grade || '',
      teamLead: u.teamLead || ''
    });
    const profile = essProfiles.find(p => p.userId === u.id) || { userId: u.id };
    setEssForm(profile);
  };

  const handleEditRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRecord) {
      const updatedCheckIn = buildZonedISOString(editDate, editInTime);
      const resolvedOutDate = editOutTime && editOutTime < editInTime
        ? addDaysToDateString(editDate, 1)
        : editDate;
      const updatedCheckOut = editOutTime
        ? buildZonedISOString(resolvedOutDate, editOutTime)
        : undefined;
      let totalHours = undefined;
      if (updatedCheckOut) {
        const diff = (new Date(updatedCheckOut).getTime() - new Date(updatedCheckIn).getTime()) / (1000 * 60 * 60);
        totalHours = diff > 0 ? diff : 0;
      }
      onUpdateRecord({ ...editingRecord, date: editDate, checkIn: updatedCheckIn, checkOut: updatedCheckOut, totalHours });
      setEditingRecord(null);
    }
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullName = formatFullName(userForm.firstName, userForm.lastName) || userForm.name || '';
    const computedEmployeeId = formatEmployeeId(userForm.firstName, userForm.lastName, employeeIdSeed);
    const basicSalary = Number(userForm.basicSalary) || 0;
    const allowances = Number(userForm.allowances) || 0;
    const totalSalary = basicSalary + allowances;
    const pin = normalizePin(userForm.pin);
    if (isAddingUser) {
      const newUserId = Math.random().toString(36).substr(2, 9);
      const newUser: User = {
        id: newUserId,
        name: fullName,
        firstName: userForm.firstName,
        lastName: userForm.lastName,
        dob: userForm.dob,
        phone: userForm.phone,
        email: userForm.email || '',
        password: userForm.password || '',
        role: userForm.role || Role.EMPLOYEE,
        employeeId: computedEmployeeId,
        salary: totalSalary,
        basicSalary,
        allowances,
        pin: pin || undefined,
        workMode: userForm.workMode || 'Onsite',
        grade: userForm.grade || '',
        teamLead: userForm.teamLead || '',
        position: userForm.position || '',
      };
      onAddUser(newUser);
      const hasEssData = Boolean(
        essForm.emergencyContactName ||
        essForm.emergencyContactPhone ||
        essForm.emergencyContactRelation
      );
      if (hasEssData) {
        onUpdateESS({
          userId: newUserId,
          emergencyContactName: essForm.emergencyContactName || '',
          emergencyContactPhone: essForm.emergencyContactPhone || '',
          emergencyContactRelation: essForm.emergencyContactRelation || ''
        });
      }
      setIsAddingUser(false);
    } else if (editingUser) {
      onUpdateUser({
        ...editingUser,
        ...userForm,
        name: fullName,
        employeeId: computedEmployeeId,
        salary: totalSalary,
        basicSalary,
        allowances,
        pin: pin || undefined,
        workMode: userForm.workMode || editingUser.workMode || 'Onsite',
        grade: userForm.grade || editingUser.grade || '',
        teamLead: userForm.teamLead || editingUser.teamLead || ''
      } as User);
      if (essForm.userId) {
        onUpdateESS(essForm as ESSProfile);
      }
      setEditingUser(null);
    }
    setUserForm({});
    setEssForm({});
  };

  const closeUserModal = () => {
    setIsAddingUser(false);
    setEditingUser(null);
    setUserForm({});
    setEssForm({});
  };

  const updateDocForm = (field: string, value: string) => {
    setDocForm(prev => ({ ...prev, [field]: value }));
  };

  const downloadDocument = async () => {
    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const fileSafeName = (docForm.employeeName || 'document')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const fileLabel = docType.replace(/-/g, '_');
    const fileBase = `${fileLabel}_${fileSafeName || 'file'}_${timestamp}`;
    const printWindow = openPrintView(true, fileBase);
    if (printWindow) {
      return;
    }
    const html2pdf = (window as any).html2pdf;
    if (!html2pdf) {
      openPrintView(true, fileBase);
      return;
    }
    try {
      const generator = html2pdf;
      const sourceNode = pdfRenderRef.current?.querySelector('#doc-root') as HTMLElement | null;
      if (!sourceNode) {
        openPrintView(true, fileBase);
        return;
      }
      await generator()
        .set({
          margin: [0, 0, 0, 0],
          filename: `${fileBase}.pdf`,
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: sourceNode.scrollWidth,
            windowHeight: sourceNode.scrollHeight,
            scrollX: 0,
            scrollY: 0
          },
          pagebreak: { mode: ['avoid-all'] },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(sourceNode)
        .save();
    } catch {
      openPrintView(true, fileBase);
    }
  };

  const handleSignatureUpload = (file: File | null) => {
    if (!file) {
      setSignatureDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      setSignatureDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const downloadIndividualReport = (userId: string) => {
    const emp = users.find(u => u.id === userId);
    if (!emp) return;
    const empRecords = records.filter(r => r.userId === userId);
    let csv = `Employee: ${emp.name} (${emp.employeeId})\nDate,Check In,Check Out,Total Working Hours\n`;
    empRecords.forEach(r => {
      csv += `${r.date},${new Date(r.checkIn).toLocaleTimeString()},${r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : "N/A"},${r.totalHours ? formatDuration(r.totalHours) : "Active"}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${emp.name}_Attendance_Report.csv`;
    a.click();
  };

  const getChecklistProgress = (userId: string) => {
    const checklist = checklists.find(c => c.userId === userId);
    if (!checklist) return 0;
    const completed = checklist.items.filter(i => i.completed).length;
    return Math.round((completed / checklist.items.length) * 100);
  };

  return (
    <div className="space-y-8">
      {!isExecutive && (
        <div className="glass-card rounded-[2rem] p-6 border-2 border-white flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className={`w-3 h-3 rounded-full ${isWifiConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Personal Attendance (HR)</p>
              <p className="font-black text-slate-900">
                {myRecord
                  ? `Active since ${new Date(myRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : shiftLocked
                    ? 'Shift Completed'
                    : 'Not Checked In'}
              </p>
            </div>
          </div>
          <button
            onClick={myRecord ? onCheckOut : onCheckIn}
            disabled={!isWifiConnected || shiftLocked}
            className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all ${myRecord ? 'bg-rose-600 text-white hover:bg-rose-700' : 'premium-gradient text-white hover:opacity-90 disabled:opacity-30'}`}
          >
            {myRecord ? 'Check Out' : shiftLocked ? 'Shift Done' : 'Check In Now'}
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">{user.role} Console</h1>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Enterprise Resource Planning
          </p>
        </div>
        <div className="flex p-1 bg-slate-100 rounded-2xl overflow-x-auto max-w-full">
          {(['attendance', 'leaves', 'overtime', 'personnel', 'documents'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${tab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === 'attendance' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <select id="attendance-employee-filter" name="attendanceEmployee" aria-label="Select employee" value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="bg-white border-2 border-slate-100 rounded-2xl px-6 py-3 text-xs font-black uppercase outline-none focus:border-blue-500 shadow-sm w-full sm:w-auto">
              <option value="all">Global Roster</option>
              {visibleUsers.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
            </select>
            <div className="flex items-end gap-2 w-full sm:w-auto">
              <div className="space-y-1">
                <label htmlFor="admin-attendance-date" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Filter Date</label>
                <input
                  id="admin-attendance-date"
                  type="date"
                  value={attendanceDateFilter}
                  onChange={e => setAttendanceDateFilter(e.target.value)}
                  className="bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 text-[10px] font-black uppercase outline-none focus:border-blue-500 shadow-sm w-full sm:w-auto"
                />
              </div>
              {attendanceDateFilter && (
                <button
                  type="button"
                  onClick={() => setAttendanceDateFilter('')}
                  className="px-4 py-3 rounded-2xl bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-all"
                >
                  Clear
                </button>
              )}
            </div>
            {selectedEmp !== 'all' && (
              <button onClick={() => downloadIndividualReport(selectedEmp)} className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center gap-2 w-full sm:w-auto justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                Download Monthly Sheet
              </button>
            )}
          </div>
          <div className="glass-card rounded-[2.5rem]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Employee</th>
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Date</th>
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Check In</th>
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Check Out</th>
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Duration</th>
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredAttendance.map(r => {
                  const recordUser = users.find(u => u.id === r.userId);
                  const roleLabel = recordUser?.position || recordUser?.role || 'Employee';
                  return (
                  <tr key={r.id} className="hover:bg-blue-50/20 transition-all">
                    <td className="px-4 md:px-6 2xl:px-8 py-6">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-900">{r.userName}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">{roleLabel}</span>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 2xl:px-8 py-6 text-xs font-bold text-slate-500">{r.date}</td>
                    <td className="px-4 md:px-6 2xl:px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-black">{formatTimeInZone(r.checkIn)}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border w-fit mt-1 ${getDisplayStatus(r) === 'Late' ? 'border-rose-100 text-rose-600 bg-rose-50' : getDisplayStatus(r) === 'Early' ? 'border-amber-100 text-amber-600 bg-amber-50' : 'border-emerald-100 text-emerald-600 bg-emerald-50'}`}>{getDisplayStatus(r)}</span>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 2xl:px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-black">{r.checkOut ? formatTimeInZone(r.checkOut) : 'Active'}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border w-fit mt-1 ${getCheckoutStatus(r) === 'Early' ? 'border-rose-100 text-rose-600 bg-rose-50' : getCheckoutStatus(r) === 'Overtime' ? 'border-emerald-100 text-emerald-600 bg-emerald-50' : getCheckoutStatus(r) === 'On-Time' ? 'border-blue-100 text-blue-600 bg-blue-50' : 'border-slate-100 text-slate-400 bg-slate-50'}`}>{getCheckoutStatus(r)}</span>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 2xl:px-8 py-6 font-black text-blue-600">{r.totalHours ? formatDuration(r.totalHours) : 'Active'}</td>
                    <td className="px-4 md:px-6 2xl:px-8 py-6">
                      {isSuperadmin && <button onClick={() => startEditingRecord(r)} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 underline">Manual Edit</button>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="space-y-8">
          <div className="glass-card rounded-[2.5rem] p-8">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Apply for Leave (My Request)</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-1">
                <label htmlFor="admin-leave-start" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Start Date</label>
                <input id="admin-leave-start" name="leaveStartDate" type="date" value={leaveStartDate} onChange={e => setLeaveStartDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
              </div>
              <div className="space-y-1">
                <label htmlFor="admin-leave-end" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">End Date</label>
                <input id="admin-leave-end" name="leaveEndDate" type="date" value={leaveEndDate} onChange={e => setLeaveEndDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
              </div>
              <div className="space-y-1">
                <label htmlFor="admin-leave-reason" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Leave Application</label>
                <textarea id="admin-leave-reason" name="leaveReason" value={leaveApplication} onChange={e => setLeaveApplication(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 h-24 resize-none" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!leaveStartDate || !leaveEndDate) return;
                onSubmitLeave(leaveStartDate, leaveEndDate, leaveApplication);
                const today = getLocalDateString(new Date());
                setLeaveStartDate(today);
                setLeaveEndDate(today);
                setLeaveApplication(buildLeaveTemplate(user));
              }}
              className="mt-6 w-full premium-gradient text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl"
            >
              Submit Leave Request
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {visibleLeaves.length === 0 ? <div className="glass-card rounded-[2rem] p-20 text-center font-black text-slate-300 uppercase tracking-widest">No Leave Records Found</div> : visibleLeaves.map(l => (
              <div key={l.id} className="glass-card rounded-[2rem] p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-black text-lg text-slate-900">{l.userName}</span>
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${l.status === 'Pending' ? 'bg-amber-50 text-amber-600' : l.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : l.status === 'Cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-600'}`}>{l.status}</span>
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${l.isPaid === false ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'}`}>{l.isPaid === false ? 'Unpaid' : 'Paid'}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-500">{l.startDate} to {l.endDate}</p>
                  <p className="text-sm font-medium text-slate-700 italic">"{l.reason}"</p>
                </div>
                {l.status === 'Pending' && (
                  <div className="flex flex-wrap gap-2">
                    {canApprove ? <><button onClick={() => onLeaveAction(l.id, 'Approved')} className="bg-emerald-500 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all">Approve</button><button onClick={() => onLeaveAction(l.id, 'Rejected')} className="bg-rose-500 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-600 transition-all">Reject</button></> : <span className="text-[10px] font-black text-slate-300 uppercase italic">Awaiting CEO Action</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="glass-card rounded-[2.5rem] p-8">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Work From Home Requests</h3>
            {visibleWfh.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-[2rem] font-black text-slate-300 uppercase tracking-widest text-xs">No WFH Requests</div>
            ) : (
              <div className="space-y-4">
                {visibleWfh.map(req => (
                  <div key={req.id} className="glass-card rounded-[2rem] p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-black text-lg text-slate-900">{req.userName}</span>
                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${req.status === 'Pending' ? 'bg-amber-50 text-amber-600' : req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{req.status}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-500">Requested on {new Date(req.submittedAt).toLocaleDateString()}</p>
                      <p className="text-sm font-medium text-slate-700 italic">"{req.reason}"</p>
                    </div>
                    {req.status === 'Pending' && (
                      <div className="flex flex-wrap gap-2">
                        {canApprove ? (
                          <>
                            <button onClick={() => onWfhAction(req.id, 'Approved')} className="bg-emerald-500 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all">Approve</button>
                            <button onClick={() => onWfhAction(req.id, 'Rejected')} className="bg-rose-500 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-600 transition-all">Reject</button>
                          </>
                        ) : (
                          <span className="text-[10px] font-black text-slate-300 uppercase italic">Awaiting CEO Action</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'overtime' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card rounded-[2.5rem] p-8 border-b-4 border-blue-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Weekly OT Pool</p>
              <h2 className="text-4xl font-black text-slate-900">{formatDuration(visibleUsers.reduce((sum, u) => sum + calculateWeeklyOvertime(u.id, visibleRecords), 0))}</h2>
            </div>
            <div className="glass-card rounded-[2.5rem] p-8 border-b-4 border-emerald-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Active OT Claims</p>
              <h2 className="text-4xl font-black text-slate-900">{visibleUsers.filter(u => calculateWeeklyOvertime(u.id, visibleRecords) > 0).length} Employees</h2>
            </div>
            <div className="glass-card rounded-[2.5rem] p-8 border-b-4 border-amber-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Avg. Weekly OT</p>
              <h2 className="text-4xl font-black text-slate-900">{formatDuration(visibleUsers.reduce((sum, u) => sum + calculateWeeklyOvertime(u.id, visibleRecords), 0) / (visibleUsers.length || 1))}</h2>
            </div>
          </div>
          <div className="glass-card rounded-[2.5rem]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Employee</th>
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Total Hours (Week)</th>
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">OT Hours</th>
                  <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleUsers.map(u => {
                  const ot = calculateWeeklyOvertime(u.id, visibleRecords);
                  return (
                    <tr key={u.id}>
                      <td className="px-4 md:px-6 2xl:px-8 py-6 font-black text-slate-900">{u.name}</td>
                      <td className="px-4 md:px-6 2xl:px-8 py-6 font-bold text-slate-600">{formatDuration(visibleRecords.filter(r => r.userId === u.id).reduce((sum, r) => sum + (r.totalHours || 0), 0))}</td>
                      <td className="px-4 md:px-6 2xl:px-8 py-6 font-black text-blue-600">{ot > 0 ? formatDuration(ot) : '--'}</td>
                      <td className="px-4 md:px-6 2xl:px-8 py-6"><span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${ot > 0 ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>{ot > 0 ? 'OT Eligible' : 'Standard'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'personnel' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-4">
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Workforce Directory</h3>
            <button onClick={() => { setIsAddingUser(true); setEmployeeIdSeed(getNextEmployeeSeed(users)); setUserForm({ role: Role.EMPLOYEE }); setEssForm({}); }} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 w-full sm:w-auto justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
              Add New Employee
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workforceUsers.map(u => {
              const profile = essProfiles.find(p => p.userId === u.id);
              const progress = getChecklistProgress(u.id);
              const totalSalary = calculateTotalSalary(u.basicSalary, u.allowances, u.salary);
              return (
                <div key={u.id} className="glass-card rounded-[2.5rem] p-8 space-y-6 border border-slate-100 hover:border-blue-200 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-slate-900">{u.name}</h3>
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{u.position || 'Genral Staff'}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ID: {u.employeeId}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{u.role}</p>
                        <span className="text-[9px] font-bold text-slate-500">•</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{u.workMode || 'Onsite'}</span>
                        {u.grade && (
                          <>
                            <span className="text-[9px] font-bold text-slate-500">•</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{u.grade}</span>
                          </>
                        )}
                        <span className="text-[9px] font-bold text-slate-500">•</span>
                        <span className="text-[9px] font-black text-slate-400">PKR {totalSalary.toLocaleString()}</span>
                      </div>
                      {u.teamLead && (
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">Team Lead: {u.teamLead}</p>
                      )}
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${progress === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>{progress}%</div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-2">Checklist Status</p>
                      <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }}></div></div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl space-y-3">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Emergency Contact</p>
                      {profile ? (
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-900">{profile.emergencyContactName}</p>
                          <p className="text-[10px] font-medium text-slate-500">{profile.emergencyContactPhone}</p>
                        </div>
                      ) : (
                        <p className="text-[10px] font-bold text-slate-300 italic">Profile Pending Update</p>
                      )}
                    </div>
                  </div>
                  <div className={`grid gap-3 ${canDeleteUsers ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <button onClick={() => startEditingUser(u)} className="w-full py-4 rounded-xl bg-white border border-slate-100 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">Manage Personnel</button>
                    {canDeleteUsers && (
                      <button
                        type="button"
                        onClick={() => {
                          if (u.id === user.id) {
                            alert('You cannot delete your own account.');
                            return;
                          }
                          if (!window.confirm(`Delete ${u.name}? This will remove all related records.`)) return;
                          onDeleteUser(u.id);
                        }}
                        className="w-full py-4 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
                      >
                        Delete User
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <div className="glass-card rounded-[2.5rem] p-8 space-y-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Document Generator</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">HR / CEO / Super Admin</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="doc-type" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Document Type</label>
                <select id="doc-type" name="documentType" value={docType} onChange={e => setDocType(e.target.value as DocumentType)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800">
                  <option value="salary-slip">Salary Slip</option>
                  <option value="offer-letter">Offer Letter</option>
                  <option value="appointment-letter">Appointment Letter</option>
                  <option value="experience-letter">Experience Letter</option>
                </select>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="doc-employee-select" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Select Employee</label>
                  <select
                    id="doc-employee-select"
                    name="documentEmployee"
                    value={selectedDocUserId}
                    onChange={e => handleDocumentUserSelect(e.target.value)}
                    disabled={salarySlipSelfOnly}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 disabled:opacity-60"
                  >
                    {!salarySlipSelfOnly && <option value="manual">Manual Entry</option>}
                    {documentUsers.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.employeeId})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1"><label htmlFor="doc-employee-name" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Employee Name</label><input id="doc-employee-name" name="employeeName" type="text" value={docForm.employeeName} onChange={e => updateDocForm('employeeName', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="doc-employee-id" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Employee ID</label><input id="doc-employee-id" name="employeeId" type="text" value={docForm.employeeId} onChange={e => updateDocForm('employeeId', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1">
                  <label htmlFor="doc-role" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Role / Designation</label>
                  <select
                    id="doc-role"
                    name="role"
                    value={isOtherDocRole ? 'Other' : docForm.role}
                    onChange={e => updateDocForm('role', e.target.value === 'Other' ? '' : e.target.value)}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800"
                  >
                    {documentRoleOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                </div>
                {isOtherDocRole && (
                  <div className="space-y-1">
                    <label htmlFor="doc-role-custom" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Custom Role</label>
                    <input id="doc-role-custom" name="roleCustom" type="text" value={docForm.role} onChange={e => updateDocForm('role', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                )}
                <div className="space-y-1"><label htmlFor="doc-issue-date" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Issue Date</label><input id="doc-issue-date" name="issueDate" type="date" value={docForm.issueDate} onChange={e => updateDocForm('issueDate', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="doc-location" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Location</label><input id="doc-location" name="location" type="text" value={docForm.location} onChange={e => updateDocForm('location', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="doc-signatory" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">CEO Designation</label><input id="doc-signatory" name="signatory" type="text" value={docForm.signatory} onChange={e => updateDocForm('signatory', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="doc-ceo-name" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">CEO Name</label><input id="doc-ceo-name" name="ceoName" type="text" value={docForm.ceoName} onChange={e => updateDocForm('ceoName', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
              </div>

              {(docType === 'offer-letter' || docType === 'appointment-letter') && (
                <div className="space-y-1">
                  <label htmlFor="doc-joining-date" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Joining Date</label>
                  <input id="doc-joining-date" name="joiningDate" type="date" value={docForm.startDate} onChange={e => updateDocForm('startDate', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                </div>
              )}

              {docType === 'experience-letter' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="doc-experience-start" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Start Date</label>
                    <input id="doc-experience-start" name="experienceStartDate" type="date" value={docForm.startDate} onChange={e => updateDocForm('startDate', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-experience-end" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">End Date</label>
                    <input id="doc-experience-end" name="experienceEndDate" type="date" value={docForm.endDate} onChange={e => updateDocForm('endDate', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                </div>
              )}

              {docType !== 'salary-slip' && (
                <div className="space-y-2">
                  <label htmlFor="doc-signature" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">CEO Signature (PNG/SVG)</label>
                  <input id="doc-signature" name="signatureFile" type="file" accept="image/png,image/svg+xml" onChange={e => handleSignatureUpload(e.target.files?.[0] || null)} className="w-full text-xs font-bold text-slate-500" />
                  {signatureDataUrl && (
                    <button type="button" onClick={() => setSignatureDataUrl(null)} className="text-[10px] font-black uppercase tracking-widest text-rose-600">
                      Remove Signature
                    </button>
                  )}
                </div>
              )}

              {docType === 'salary-slip' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label htmlFor="doc-working-days" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Working Days</label>
                    <input id="doc-working-days" name="workingDays" type="number" value={docForm.workingDays} onChange={e => updateDocForm('workingDays', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-basic-pay" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Basic Pay</label>
                    <input id="doc-basic-pay" name="basicPay" type="number" value={docForm.basicPay} onChange={e => updateDocForm('basicPay', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-home-allowance" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Home Allowance</label>
                    <input id="doc-home-allowance" name="homeAllowance" type="number" value={docForm.homeAllowance} onChange={e => updateDocForm('homeAllowance', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-travel-allowance" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Travel Allowance</label>
                    <input id="doc-travel-allowance" name="travelAllowance" type="number" value={docForm.travelAllowance} onChange={e => updateDocForm('travelAllowance', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-internet-allowance" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Internet and Phone</label>
                    <input id="doc-internet-allowance" name="internetAllowance" type="number" value={docForm.internetAllowance} onChange={e => updateDocForm('internetAllowance', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Tax (PK progressive)</label>
                    <div className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent font-black text-slate-800">
                      PKR {docTaxAmount.toLocaleString()}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                      Calculated on total earnings.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-other-deductions" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Other Deductions</label>
                    <input id="doc-other-deductions" name="otherDeductions" type="number" value={docForm.otherDeductions} onChange={e => updateDocForm('otherDeductions', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                </div>
              )}

              <button onClick={downloadDocument} className="w-full premium-gradient text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Print / Save PDF</button>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Save as PDF with the new timestamped filename.</p>
              {!pdfReady && !pdfLoadFailed && (
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Preparing PDF engine...</p>
              )}
              {pdfLoadFailed && (
                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest text-center">PDF engine unavailable. Opening print view instead.</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="glass-card rounded-[2.5rem] p-6">
              <div className="flex items-center justify-between px-2 pb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Preview</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live draft</p>
                </div>
                <button onClick={downloadDocument} className="px-5 py-2 rounded-xl bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200 transition-all">Export PDF</button>
              </div>
              <div className="bg-slate-50 rounded-[2rem] p-4 flex justify-center">
                <div
                  className="w-full max-w-[820px] bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100"
                  style={{ aspectRatio: '210 / 297' }}
                >
                  <iframe ref={previewRef} title="Document Preview" srcDoc={documentHtml} className="w-full h-full border-0 bg-white"></iframe>
                </div>
              </div>
            </div>
            <div ref={pdfRenderRef} aria-hidden="true" className="absolute left-[-9999px] top-0">
              <style>{`
                .pdf-render-scope #doc-root,
                .pdf-render-scope #doc-root * {
                  box-sizing: border-box;
                }
              `}</style>
              <div className="pdf-render-scope" dangerouslySetInnerHTML={{ __html: docRootHtml }} />
            </div>
          </div>
        </div>
      )}

      {/* Manual Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase mb-2">Manual Correction</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">Record ID: {editingRecord.id}</p>
            <form onSubmit={handleEditRecordSubmit} className="space-y-6">
              <div className="space-y-1"><label htmlFor="manual-edit-date" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Calendar Date</label><input id="manual-edit-date" name="manualDate" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label htmlFor="manual-edit-in" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Check In</label><input id="manual-edit-in" name="manualCheckIn" type="time" value={editInTime} onChange={e => setEditInTime(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div><div className="space-y-1"><label htmlFor="manual-edit-out" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Check Out</label><input id="manual-edit-out" name="manualCheckOut" type="time" value={editOutTime} onChange={e => setEditOutTime(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div></div>
              <div className="flex space-x-3 pt-4"><button type="submit" className="flex-1 premium-gradient text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Save Overrides</button><button type="button" onClick={() => setEditingRecord(null)} className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest">Discard</button></div>
            </form>
          </div>
        </div>
      )}

      {/* User Add/Edit Modal */}
      {(isAddingUser || editingUser) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="relative bg-white rounded-[3rem] w-full max-w-2xl p-6 sm:p-8 lg:p-10 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={closeUserModal}
              className="absolute right-5 top-5 text-slate-400 hover:text-slate-600 transition-all"
              aria-label="Close"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8">{isAddingUser ? 'Add New Employee' : 'Edit Employee Details'}</h3>
            <form onSubmit={handleUserSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1"><label htmlFor="user-first-name" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">First Name</label><input id="user-first-name" name="firstName" required type="text" value={userForm.firstName || ''} onChange={e => setUserForm({ ...userForm, firstName: e.target.value, name: formatFullName(e.target.value, userForm.lastName) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-last-name" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Last Name</label><input id="user-last-name" name="lastName" required type="text" value={userForm.lastName || ''} onChange={e => setUserForm({ ...userForm, lastName: e.target.value, name: formatFullName(userForm.firstName, e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-dob" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Date of Birth</label><input id="user-dob" name="dob" type="date" value={userForm.dob || ''} onChange={e => setUserForm({ ...userForm, dob: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-phone" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Phone Number</label><input id="user-phone" name="phone" type="tel" value={userForm.phone || ''} onChange={e => setUserForm({ ...userForm, phone: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-email" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Email Address</label><input id="user-email" name="email" required type="email" value={userForm.email || ''} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1">
                  <label htmlFor="user-password" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Security Key (Password)</label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <input id="user-password" name="password" required type="text" value={userForm.password || ''} onChange={e => setUserForm({ ...userForm, password: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                    {canResetPassword && (
                      <button
                        type="button"
                        onClick={() => setUserForm(prev => ({ ...prev, password: generateTempPassword() }))}
                        className="shrink-0 px-4 py-3 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                      >
                        Reset Password
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="user-pin" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">4 Digit PIN (Optional)</label>
                  <input
                    id="user-pin"
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={userForm.pin || ''}
                    onChange={e => setUserForm({ ...userForm, pin: normalizePin(e.target.value) })}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800"
                  />
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">Employees can log in with PIN instead of password.</p>
                </div>
                <div className="space-y-1"><label htmlFor="user-employee-id" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Employee ID</label><input id="user-employee-id" name="employeeId" required readOnly type="text" value={formatEmployeeId(userForm.firstName, userForm.lastName, employeeIdSeed)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent outline-none font-bold text-slate-800 text-slate-500" /></div>
                <div className="space-y-1"><label htmlFor="user-basic-salary" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Basic Salary (Monthly)</label><input id="user-basic-salary" name="basicSalary" type="number" value={userForm.basicSalary || ''} onChange={e => setUserForm({ ...userForm, basicSalary: Number(e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-allowances" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Allowances (Monthly)</label><input id="user-allowances" name="allowances" type="number" value={userForm.allowances || ''} onChange={e => setUserForm({ ...userForm, allowances: Number(e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-position" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Job Position (e.g. Odoo Developer)</label><input id="user-position" name="position" type="text" value={userForm.position || ''} onChange={e => setUserForm({ ...userForm, position: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-role" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Corporate Role</label><select id="user-role" name="role" required value={userForm.role || Role.EMPLOYEE} onChange={e => setUserForm({ ...userForm, role: e.target.value as Role })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800">{roleOptions.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <div className="space-y-1"><label htmlFor="user-work-mode" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Work Mode</label><select id="user-work-mode" name="workMode" required value={userForm.workMode || 'Onsite'} onChange={e => setUserForm({ ...userForm, workMode: e.target.value as User['workMode'] })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800"><option value="Onsite">Onsite</option><option value="Remote">Remote</option></select></div>
                <div className="space-y-1"><label htmlFor="user-grade" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Employee Grade</label><select id="user-grade" name="grade" value={userForm.grade || ''} onChange={e => setUserForm({ ...userForm, grade: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800"><option value="">Select Grade</option>{gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                <div className="space-y-1"><label htmlFor="user-team-lead" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Team Lead (Reporting To)</label><input id="user-team-lead" name="teamLead" type="text" value={userForm.teamLead || ''} onChange={e => setUserForm({ ...userForm, teamLead: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Emergency Contact Info</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1"><label htmlFor="user-ess-name" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Emergency Contact</label><input id="user-ess-name" name="emergencyContactName" type="text" value={essForm.emergencyContactName || ''} onChange={e => setEssForm({ ...essForm, emergencyContactName: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                  <div className="space-y-1"><label htmlFor="user-ess-phone" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Emergency Phone</label><input id="user-ess-phone" name="emergencyContactPhone" type="text" value={essForm.emergencyContactPhone || ''} onChange={e => setEssForm({ ...essForm, emergencyContactPhone: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                  <div className="space-y-1 md:col-span-2"><label htmlFor="user-ess-relation" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Emergency Relation</label><input id="user-ess-relation" name="emergencyContactRelation" type="text" value={essForm.emergencyContactRelation || ''} onChange={e => setEssForm({ ...essForm, emergencyContactRelation: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <button type="submit" className="flex-1 premium-gradient text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl">Save Changes</button>
                <button type="button" onClick={closeUserModal} className="px-10 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black text-sm uppercase tracking-widest">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
