import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AttendanceRecord, LeaveRequest, Role, User, ESSProfile, UserChecklist, WorkFromHomeRequest, CheckInStatus, Task } from '../types';
import TaskBoard from './TaskBoard';
import { formatDuration, calculateWeeklyOvertime } from '../utils/storage';
import { addDaysToDateString, getLocalDateString, getShiftDateString, getShiftAdjustedMinutes, getLocalTimeMinutes, buildZonedISOString, formatTimeInZone, getWeekdayLabel } from '../utils/dates';
import { APP_CONFIG } from '../constants';
import Icon3D from './Icon3D';
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

const generateTempPin = () => {
  const pin = Math.floor(1000 + Math.random() * 9000);
  return String(pin);
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

const calculateTotalSalary = (basic?: number, allowances?: number, home?: number, travel?: number, internet?: number, fallback?: number) => {
  const baseValue = Number(basic) || 0;
  const allowanceValue = Number(allowances) || 0;
  const homeValue = Number(home) || 0;
  const travelValue = Number(travel) || 0;
  const internetValue = Number(internet) || 0;
  const total = baseValue + allowanceValue + homeValue + travelValue + internetValue;
  return total || (Number(fallback) || 0);
};

const calculateMonthlyTax = (grossPay: number) => {
  const salary = Math.max(0, grossPay);
  if (salary <= 50_000) return 0;
  if (salary <= 100_000) return (salary - 50_000) * 0.01;
  return 500 + (salary - 100_000) * 0.05;
};

const normalizeEmployeeId = (value: string): string => {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '');
  const withoutPrefix = cleaned.replace(/^BS-/, '');
  return `BS-${withoutPrefix}`;
};

const getShiftForEmployee = (employeeId?: string, dateStr?: string) => {
  const normalized = employeeId ? normalizeEmployeeId(employeeId) : '';
  const override = (APP_CONFIG as any).SHIFT_OVERRIDES?.[normalized];
  let end = override?.end || APP_CONFIG.SHIFT_END;
  let overtimeEnd = override?.overtimeEnd || end;

  if (normalized === 'BS-DABA010' && dateStr) {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const day = date.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
      if (day >= 1 && day <= 4) { // Mon-Thu
        end = '02:00';
        overtimeEnd = '02:00';
      } else if (day === 5) { // Fri
        const shiftStart = '01:00';
        const shiftEnd = '05:00';
        return {
          start: shiftStart,
          end: shiftEnd,
          overtimeEnd: shiftEnd
        };
      }
    }
  }

  return {
    start: override?.start || APP_CONFIG.SHIFT_START,
    end,
    overtimeEnd
  };
};

const parseDateUtc = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const countLeaveDaysInMonth = (leave: LeaveRequest, target: Date) => {
  if (!leave.startDate || !leave.endDate) return 0;
  const monthStart = new Date(Date.UTC(target.getFullYear(), target.getMonth(), 1));
  const monthEnd = new Date(Date.UTC(target.getFullYear(), target.getMonth() + 1, 0));
  const leaveStart = parseDateUtc(leave.startDate);
  const leaveEnd = parseDateUtc(leave.endDate);
  if (leaveEnd < monthStart || leaveStart > monthEnd) return 0;
  const overlapStart = leaveStart > monthStart ? leaveStart : monthStart;
  const overlapEnd = leaveEnd < monthEnd ? leaveEnd : monthEnd;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / dayMs) + 1;
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
  const tax = Math.round(calculateMonthlyTax(basicPay));
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
        <div style="text-align:center;font-size:11px;color:#64748b;margin-bottom:2px;">Office 301 4th floor, Business bay, M9, Block 3 A Gulistan-e-Johar, Karachi, 75290</div>
        <div style="text-align:center;font-size:10px;color:#94a3b8;margin-bottom:16px;">NTN: H117501</div>
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
        <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:14px;border-top:1px dashed #e2e8f0;padding-top:10px;">This is a digitally generated document and requires no signature.</div>
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
        <div style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">Compensation Details</div>
          <table style="width:100%;font-size:13px;color:#334155;">
            <tr>
              <td style="padding:4px 0;color:#64748b;width:40%;">Monthly Basic Salary:</td>
              <td style="padding:4px 0;font-weight:700;">${data.salary ? formatCurrency(Number(data.salary)) : 'As per policy'}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;">Commission (on sales):</td>
              <td style="padding:4px 0;font-weight:700;">${data.commission || 'As per policy'}</td>
            </tr>
          </table>
        </div>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          <strong>Roles & Responsibilities:</strong> You shall perform the duties and responsibilities assigned to you by the Management from time to time with utmost sincerity and dedication. You will be expected to maintain the highest standards of professional conduct and contribute to the growth and success of the organization.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          <strong>Probation Period:</strong> You will be on probation for a period of three months. Upon successful completion of the probation period, your employment may be confirmed in writing by the Management.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          <strong>Confidentiality & Non-Disclosure:</strong> You shall maintain strict confidentiality regarding all company information, clients, trade secrets, and internal processes. Any breach of confidentiality will result in immediate termination and potential legal action.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          <strong>Professional Standards:</strong> Your conduct, both within and outside the office, should reflect the values and professional standards of ${company}. You are expected to comply with all company policies and guidelines as communicated during your onboarding and throughout your tenure.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;">
          We look forward to your valuable contribution and wish you a successful career with us. Please retain this letter for your records.
        </p>
        <p style="font-size:13px;line-height:1.7;color:#334155;margin-top:18px;">Sincerely,</p>
        ${signatureBlock}
        <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:14px;border-top:1px dashed #e2e8f0;padding-top:10px;">This is a digitally generated document and requires no signature.</div>
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
      <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:14px;border-top:1px dashed #e2e8f0;padding-top:10px;">This is a digitally generated document and requires no signature.</div>
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
  isCheckinOverride?: boolean;
  onUpdateRecord: (updatedRecord: AttendanceRecord) => void;
  onDeleteRecord: (recordId: string) => void;
  onUpdateChecklist: (checklist: UserChecklist) => void;
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onSubmitLeave: (start: string, end: string, reason: string, leaveType?: LeaveRequest['leaveType'], isPaid?: boolean) => void;
  onWfhAction: (id: string, action: 'Approved' | 'Rejected') => void;
  onUpdateESS: (profile: ESSProfile) => void;
  tasks: Task[];
  onAddTask: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
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
  isCheckinOverride = false,
  onUpdateRecord,
  onDeleteRecord,
  onUpdateChecklist,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onSubmitLeave,
  onWfhAction,
  onUpdateESS,
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask
}) => {
  const [tab, setTab] = useState<'attendance' | 'leaves' | 'personnel' | 'documents' | 'tasks'>('attendance');
  const [selectedEmp, setSelectedEmp] = useState('all');
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [employeeIdSeed, setEmployeeIdSeed] = useState(() => getNextEmployeeSeed(users));

  // Manual Edit States for Records
  const [editDate, setEditDate] = useState('');
  const [editInTime, setEditInTime] = useState('');
  const [editOutTime, setEditOutTime] = useState('');
  const [editOutDate, setEditOutDate] = useState('');
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [newRecordUserId, setNewRecordUserId] = useState('');
  const [newRecordDate, setNewRecordDate] = useState(() => getLocalDateString(new Date()));
  const [newRecordCheckIn, setNewRecordCheckIn] = useState('');
  const [newRecordCheckOut, setNewRecordCheckOut] = useState('');
  const [newRecordOutDate, setNewRecordOutDate] = useState(() => getLocalDateString(new Date()));

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
  const [leaveType, setLeaveType] = useState<'Annual' | 'Sick' | 'Casual' | 'Unpaid'>('Annual');
  const [leavePaid, setLeavePaid] = useState(true);
  const [attendanceDateFilter, setAttendanceDateFilter] = useState('');
  const attendanceDateRef = useRef<HTMLInputElement | null>(null);
  const [attendanceMonthFilter, setAttendanceMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const attendanceMonthRef = useRef<HTMLInputElement | null>(null);
  const [attendancePage, setAttendancePage] = useState(1);
  const attendancePageSize = 15;
  const resolveRecordDate = (record: AttendanceRecord) => {
    const worker = users.find(u => u.id === record.userId);
    const shift = getShiftForEmployee(worker?.employeeId);
    return record.date || getShiftDateString(new Date(record.checkIn), shift.start, shift.end);
  };
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
      deductions: '',
      salary: '',
      commission: ''
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
  const jobPositionOptions = [
    'AI/ML Engineer',
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
    'Software Engineer',
    'Odoo Developer'
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
  const isTimeEditor = (APP_CONFIG as any).TIME_EDIT_EMPLOYEE_IDS?.includes(normalizeEmployeeId(user.employeeId || ''));
  const canEditTime = isSuperadmin || isTimeEditor;
  const canDeleteUsers = isSuperadmin || isCeo;
  const canResetPassword = Boolean(editingUser && editingUser.role !== Role.SUPERADMIN);
  const visibleUsers = isSuperadmin ? users : users.filter(u => u.role !== Role.SUPERADMIN);
  const rosterAvailable = visibleUsers.length > 0;
  const sortedVisibleUsers = [...visibleUsers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const workforceUsers = sortedVisibleUsers;
  const visibleUserIds = new Set(visibleUsers.map(u => u.id));
  const visibleEmployeeIds = new Set(
    visibleUsers
      .map(u => u.employeeId)
      .filter(Boolean)
      .map(id => normalizeEmployeeId(String(id)))
  );
  const isRecordVisible = (record: AttendanceRecord) => {
    if (visibleUserIds.has(record.userId)) return true;
    if (record.userId) {
      return visibleEmployeeIds.has(normalizeEmployeeId(String(record.userId)));
    }
    if (record.userName) {
      return visibleUsers.some(u => u.name.trim().toLowerCase() === record.userName.trim().toLowerCase());
    }
    return false;
  };
  const isLeaveVisible = (leave: LeaveRequest) => {
    if (visibleUserIds.has(leave.userId)) return true;
    if (leave.userId) {
      return visibleEmployeeIds.has(normalizeEmployeeId(String(leave.userId)));
    }
    if (leave.userName) {
      return visibleUsers.some(u => u.name.trim().toLowerCase() === leave.userName.trim().toLowerCase());
    }
    return false;
  };
  const visibleRecords = isSuperadmin || isCeo || !rosterAvailable ? records : records.filter(isRecordVisible);
  const visibleLeaves = isSuperadmin || isCeo || !rosterAvailable ? leaves : leaves.filter(isLeaveVisible);
  const visibleLeaveRequests = visibleLeaves.filter(l => !l.id.startsWith('auto-absence:'));
  const visibleWfh = isSuperadmin || isCeo || !rosterAvailable ? wfhRequests : wfhRequests.filter(r => visibleUserIds.has(r.userId));
  const leaveQuota = (APP_CONFIG as any).LEAVE_QUOTA || { annual: 7, sick: 9, casual: 6, total: 22 };
  const currentYear = new Date().getFullYear();
  const myLeaveUsage = visibleLeaves.reduce<Record<string, number>>((acc, l) => {
    if (l.userId !== user.id) return acc;
    if (l.status !== 'Approved') return acc;
    if (!l.startDate.startsWith(String(currentYear))) return acc;
    const key = (l.leaveType || 'Annual').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const myRemainingByType = {
    annual: Math.max(0, (leaveQuota.annual ?? 0) - (myLeaveUsage['annual'] || 0)),
    sick: Math.max(0, (leaveQuota.sick ?? 0) - (myLeaveUsage['sick'] || 0)),
    casual: Math.max(0, (leaveQuota.casual ?? 0) - (myLeaveUsage['casual'] || 0))
  };
  const selectedRemaining = leaveType === 'Unpaid'
    ? 0
    : leaveType === 'Annual'
      ? myRemainingByType.annual
      : leaveType === 'Sick'
        ? myRemainingByType.sick
        : myRemainingByType.casual;
  const overtimeUsers = rosterAvailable
    ? sortedVisibleUsers
    : Array.from(
      new Map(
        visibleRecords
          .filter(r => r.userId)
          .map(r => [String(r.userId), { id: String(r.userId), name: r.userName || String(r.userId) }])
      ).values()
    );
  const selectedEmployee = sortedVisibleUsers.find(emp => emp.id === selectedEmp) || null;
  const selectedEmployeeId = selectedEmployee?.employeeId ? normalizeEmployeeId(selectedEmployee.employeeId) : '';
  const filteredAttendanceBase = selectedEmp === 'all'
    ? visibleRecords
    : visibleRecords.filter(r => {
      if (r.userId === selectedEmp) return true;
      if (selectedEmployeeId && r.userId) {
        return normalizeEmployeeId(String(r.userId)) === selectedEmployeeId;
      }
      if (selectedEmployee && r.userName) {
        return selectedEmployee.name.trim().toLowerCase() === r.userName.trim().toLowerCase();
      }
      return false;
    });
  const filteredAttendance = attendanceDateFilter
    ? filteredAttendanceBase.filter(r => resolveRecordDate(r) === attendanceDateFilter)
    : filteredAttendanceBase;
  const sortedAttendance = [...filteredAttendance].sort((a, b) => {
    const aDate = resolveRecordDate(a);
    const bDate = resolveRecordDate(b);
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aName = (users.find(u => u.id === a.userId)?.name || a.userName || '').toLowerCase();
    const bName = (users.find(u => u.id === b.userId)?.name || b.userName || '').toLowerCase();
    if (aName !== bName) return aName.localeCompare(bName);
    return b.checkIn.localeCompare(a.checkIn);
  });
  const totalAttendancePages = Math.max(1, Math.ceil(sortedAttendance.length / attendancePageSize));
  const safeAttendancePage = Math.min(attendancePage, totalAttendancePages);
  const attendanceStartIndex = (safeAttendancePage - 1) * attendancePageSize;
  const pagedAttendance = sortedAttendance.slice(attendanceStartIndex, attendanceStartIndex + attendancePageSize);
  const defaultMonthFilter = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const effectiveMonthFilter = attendanceMonthFilter || defaultMonthFilter;
  const monthlyAttendanceBase = selectedEmp === 'all'
    ? []
    : visibleRecords.filter(r => r.userId === selectedEmp);
  const monthlyAttendance = monthlyAttendanceBase.filter(r => resolveRecordDate(r).startsWith(effectiveMonthFilter));
  const sortedMonthlyAttendance = [...monthlyAttendance].sort((a, b) => {
    const aDate = resolveRecordDate(a);
    const bDate = resolveRecordDate(b);
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return b.checkIn.localeCompare(a.checkIn);
  });
  const monthSummaryLabel = new Date(`${effectiveMonthFilter}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthTotalHours = monthlyAttendance.reduce((sum, r) => sum + (r.totalHours || 0), 0);
  const monthOvertimeHours = monthlyAttendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
  const canApprove = user.role === Role.CEO || user.role === Role.SUPERADMIN || user.role === Role.HR;
  const isExecutive = user.role === Role.CEO || user.role === Role.SUPERADMIN;
  const roleOptions = isSuperadmin
    ? Object.values(Role)
    : Object.values(Role).filter(r => r !== Role.SUPERADMIN && (!isHr || r !== Role.CEO));
  const salarySlipSelfOnly = false;
  const documentUsers = salarySlipSelfOnly
    ? [user]
    : sortedVisibleUsers;
  const getShiftMetaForEmployee = (employeeId?: string, dateStr?: string) => {
    const shift = getShiftForEmployee(employeeId, dateStr);
    const [shiftStartHour, shiftStartMinute] = shift.start.split(':').map(Number);
    const [shiftEndHour, shiftEndMinute] = shift.end.split(':').map(Number);
    const shiftStartMinutes = shiftStartHour * 60 + shiftStartMinute;
    const shiftEndMinutes = shiftEndHour * 60 + shiftEndMinute;
    const isOvernightShift = shiftEndMinutes <= shiftStartMinutes;
    const shiftEndAdjusted = isOvernightShift ? shiftEndMinutes + 24 * 60 : shiftEndMinutes;
    const shiftDurationMinutes = Math.max(1, shiftEndAdjusted - shiftStartMinutes);
    const shiftHours = shiftDurationMinutes / 60;
    return { shift, shiftStartMinutes, shiftEndMinutes, shiftEndAdjusted, isOvernightShift, shiftHours };
  };

  const getShiftMetaForRecord = (record: AttendanceRecord) => {
    const worker = users.find(u => u.id === record.userId);
    return getShiftMetaForEmployee(worker?.employeeId, record.date);
  };

  const shiftHours = getShiftMetaForEmployee(user.employeeId, new Date().toISOString()).shiftHours;
  const earlyCheckoutOverrides = ((APP_CONFIG as any).EARLY_CHECKOUT_OVERRIDES || []) as { employeeId: string; cutoff: string }[];

  const getRecordEmployeeId = (record: AttendanceRecord): string => {
    if (record.userId) {
      const matchingUser = users.find(u => u.id === record.userId);
      if (matchingUser?.employeeId) return normalizeEmployeeId(matchingUser.employeeId);
      return normalizeEmployeeId(String(record.userId));
    }
    if (record.userName) {
      const matchingByName = users.find(u => (u.name || '').trim().toLowerCase() === record.userName.trim().toLowerCase());
      if (matchingByName?.employeeId) return normalizeEmployeeId(matchingByName.employeeId);
    }
    return '';
  };

  const getEarlyCheckoutCutoffMinutes = (record: AttendanceRecord) => {
    const { shiftStartMinutes, shiftEndAdjusted, isOvernightShift } = getShiftMetaForRecord(record);
    const toAdjustedMinutes = (time: string) => {
      const [hour, minute] = time.split(':').map(Number);
      const base = (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
      return isOvernightShift && base < shiftStartMinutes ? base + 24 * 60 : base;
    };
    const defaultEarlyCheckoutCutoff = shiftEndAdjusted - (APP_CONFIG.CHECKOUT_EARLY_RELAXATION_MINS || 0);
    const recordEmployeeId = getRecordEmployeeId(record);
    const override = earlyCheckoutOverrides.find(({ employeeId }) =>
      recordEmployeeId && normalizeEmployeeId(employeeId) === recordEmployeeId
    );
    if (override?.cutoff) {
      return toAdjustedMinutes(override.cutoff);
    }
    return defaultEarlyCheckoutCutoff;
  };
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
    setAttendancePage(1);
  }, [selectedEmp, attendanceDateFilter]);

  useEffect(() => {
    if (attendancePage > totalAttendancePages) {
      setAttendancePage(totalAttendancePages);
    }
  }, [attendancePage, totalAttendancePages]);

  useEffect(() => {
    if (!salarySlipSelfOnly) return;
    if (selectedDocUserId !== user.id) {
      handleDocumentUserSelect(user.id);
    }
  }, [salarySlipSelfOnly, selectedDocUserId, user.id, users]);

  const getDisplayStatus = (record: AttendanceRecord) => {
    if (!record.checkIn) return record.status || 'On-Time';
    return calculateCheckInStatus(record);
  };

  const getCheckoutStatus = (record: AttendanceRecord) => {
    if (!record.checkOut) return 'Active';
    const { shift, isOvernightShift, shiftStartMinutes } = getShiftMetaForRecord(record);
    const overtimeEndValue = (shift as any).overtimeEnd || shift.end;
    const [overEndHour, overEndMinute] = overtimeEndValue.split(':').map(Number);
    const overtimeEndMinutesBase = (Number.isFinite(overEndHour) ? overEndHour : 0) * 60 + (Number.isFinite(overEndMinute) ? overEndMinute : 0);
    const overtimeEndAdjusted = (isOvernightShift && overtimeEndMinutesBase < shiftStartMinutes)
      ? overtimeEndMinutesBase + 24 * 60
      : overtimeEndMinutesBase;
    const earlyCheckoutCutoff = getEarlyCheckoutCutoffMinutes(record);
    const checkOutDate = new Date(record.checkOut);
    const checkOutRawMinutes = getLocalTimeMinutes(checkOutDate);
    const checkOutMinutes = isOvernightShift && checkOutRawMinutes < shiftStartMinutes
      ? checkOutRawMinutes + 24 * 60
      : checkOutRawMinutes;
    if (checkOutMinutes < earlyCheckoutCutoff) return 'Early';
    return 'On-Time';
  };

  const getOvertimeMinutesForRecord = (record: AttendanceRecord) => {
    const { shift, isOvernightShift, shiftStartMinutes } = getShiftMetaForRecord(record);
    const overtimeEndValue = (shift as any).overtimeEnd || shift.end;
    const [overEndHour, overEndMinute] = overtimeEndValue.split(':').map(Number);
    const overtimeEndMinutesBase = (Number.isFinite(overEndHour) ? overEndHour : 0) * 60 + (Number.isFinite(overEndMinute) ? overEndMinute : 0);
    const overtimeEndAdjusted = (isOvernightShift && overtimeEndMinutesBase < shiftStartMinutes)
      ? overtimeEndMinutesBase + 24 * 60
      : overtimeEndMinutesBase;
    if (!record.checkIn || !record.checkOut) {
      return Number.isFinite(record.overtimeHours) ? (record.overtimeHours || 0) * 60 : 0;
    }
    const checkInDate = new Date(record.checkIn);
    const checkOutDate = new Date(record.checkOut);
    const checkInMinutes = getShiftAdjustedMinutes(
      checkInDate,
      shift.start,
      shift.end
    ).currentMinutes;
    const checkOutRawMinutes = getLocalTimeMinutes(checkOutDate);
    const checkOutMinutes = isOvernightShift && checkOutRawMinutes < shiftStartMinutes
      ? checkOutRawMinutes + 24 * 60
      : checkOutRawMinutes;
    const earlyMinutes = Math.max(0, shiftStartMinutes - checkInMinutes);
    const lateMinutes = Math.max(0, checkOutMinutes - overtimeEndAdjusted);
    return earlyMinutes + lateMinutes;
  };

  const getEarlyCheckoutMinutesForRecord = (record: AttendanceRecord) => {
    if (!record.checkOut) return 0;
    const { isOvernightShift, shiftStartMinutes } = getShiftMetaForRecord(record);
    const earlyCheckoutCutoff = getEarlyCheckoutCutoffMinutes(record);
    const checkOutDate = new Date(record.checkOut);
    const checkOutRawMinutes = getLocalTimeMinutes(checkOutDate);
    const checkOutMinutes = isOvernightShift && checkOutRawMinutes < shiftStartMinutes
      ? checkOutRawMinutes + 24 * 60
      : checkOutRawMinutes;
    if (checkOutMinutes >= earlyCheckoutCutoff) return 0;
    return Math.max(0, earlyCheckoutCutoff - checkOutMinutes);
  };

  const now = new Date();
  const buildSalarySnapshot = (targetUser: User | null) => {
    if (!targetUser) return null;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const monthlySalary = calculateTotalSalary(targetUser.basicSalary, targetUser.allowances, targetUser.homeAllowance, targetUser.travelAllowance, targetUser.internetAllowance, targetUser.salary);
    const monthRecords = records.filter(r => r.userId === targetUser.id && resolveRecordDate(r).startsWith(monthKey));
    const overtimeMinutesThisMonth = monthRecords.reduce((sum, record) => sum + getOvertimeMinutesForRecord(record), 0);
    const overtimeHoursThisMonth = overtimeMinutesThisMonth / 60;
    const earlyCheckoutMinutesThisMonth = monthRecords.reduce((sum, record) => sum + getEarlyCheckoutMinutesForRecord(record), 0);
    const earlyCheckoutHoursThisMonth = earlyCheckoutMinutesThisMonth / 60;
    const { shiftHours: targetShiftHours } = getShiftMetaForEmployee(targetUser.employeeId, now.toISOString());
    const hourlyRate = monthlySalary > 0 ? (monthlySalary / 30) / targetShiftHours : 0;
    const overtimePay = 0; // User requested no overtime pay
    const earlyCheckoutDeduction = 0; // User requested no deduction for early checkout
    const absentDaysThisMonth = leaves
      .filter(l => l.userId === targetUser.id && l.id.startsWith('auto-absence:') && l.status === 'Approved' && l.startDate.startsWith(monthKey))
      .reduce((sum, leave) => sum + countLeaveDaysInMonth(leave, now), 0);
    const unpaidLeaveDays = leaves
      .filter(l => l.userId === targetUser.id && l.status === 'Approved' && l.isPaid === false)
      .reduce((sum, leave) => sum + countLeaveDaysInMonth(leave, now), 0);
    const leaveDeduction = unpaidLeaveDays * (monthlySalary / 30);
    const taxableSalary = Math.max(0, monthlySalary - leaveDeduction - earlyCheckoutDeduction);
    const monthlyTax = calculateMonthlyTax(targetUser.basicSalary || 0);
    const salaryAfterTax = Math.max(0, taxableSalary - monthlyTax);
    const netPay = salaryAfterTax + overtimePay;
    return {
      monthKey,
      monthLabel,
      monthlySalary,
      overtimeHoursThisMonth,
      overtimePay,
      earlyCheckoutHoursThisMonth,
      earlyCheckoutDeduction,
      absentDaysThisMonth,
      unpaidLeaveDays,
      leaveDeduction,
      taxableSalary,
      monthlyTax,
      salaryAfterTax,
      netPay
    };
  };
  const mySnapshot = buildSalarySnapshot(user);
  const selectedSnapshot = buildSalarySnapshot(selectedDocUserId !== 'manual' ? users.find(u => u.id === selectedDocUserId) || null : null);

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
      basicPay: selectedUser.basicSalary ? String(selectedUser.basicSalary) : '',
      homeAllowance: selectedUser.homeAllowance ? String(selectedUser.homeAllowance) : (selectedUser.allowances ? String(selectedUser.allowances) : ''),
      travelAllowance: selectedUser.travelAllowance ? String(selectedUser.travelAllowance) : '',
      internetAllowance: selectedUser.internetAllowance ? String(selectedUser.internetAllowance) : ''
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
      isSuperadmin || isCeo
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
  const myShift = getShiftForEmployee(user.employeeId);
  const myShiftDate = getShiftDateString(new Date(), myShift.start, myShift.end);
  const hasMyShiftRecord = records.some(r => r.userId === user.id && r.date === myShiftDate);
  const shiftLocked = hasMyShiftRecord && !myRecord;
  const canTrack = isWifiConnected || isCheckinOverride;
  const isSameMonth = (dateStr: string, target: Date) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
  };
  const lateAllowance = 3;
  const lateCountThisMonth = records.filter(
    r => r.userId === user.id && r.status === 'Late' && isSameMonth(resolveRecordDate(r), new Date())
  ).length;
  const lateRemaining = Math.max(0, lateAllowance - lateCountThisMonth);
  const weeklyOT = calculateWeeklyOvertime(user.id, records);

  const startEditingRecord = (r: AttendanceRecord) => {
    const safeTime = (value?: string) => {
      if (!value) return '';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return '';
      return parsed.toTimeString().slice(0, 5);
    };
    setEditingRecord(r);
    const fallbackDate = r.date || getLocalDateString(new Date(r.checkIn));
    setEditDate(fallbackDate);
    setEditInTime(safeTime(r.checkIn));
    setEditOutTime(safeTime(r.checkOut));
    const resolvedOutDate = r.checkOut ? getLocalDateString(new Date(r.checkOut)) : '';
    setEditOutDate(resolvedOutDate || fallbackDate);
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

  const calculateCheckInStatus = (record: AttendanceRecord): CheckInStatus => {
    if (!record.checkIn) return record.status || 'On-Time';
    const worker = users.find(u => u.id === record.userId);
    if (worker?.workMode === 'Remote') return 'On-Time';

    const checkInDate = new Date(record.checkIn);
    if (Number.isNaN(checkInDate.getTime())) return record.status || 'On-Time';

    // Get shift and metrics for the record's date
    const rDate = record.date || getShiftDateString(checkInDate, APP_CONFIG.SHIFT_START, APP_CONFIG.SHIFT_END);
    const shift = getShiftForEmployee(worker?.employeeId, rDate);
    const { currentMinutes, startMinutes } = getShiftAdjustedMinutes(
      checkInDate,
      shift.start,
      shift.end
    );

    const weekday = getWeekdayLabel(rDate);
    const isNoLateWindow =
      worker?.employeeId &&
      normalizeEmployeeId(worker.employeeId) === 'BS-DABA010' &&
      ['Mon', 'Tue', 'Wed', 'Thu'].includes(weekday);
    if (isNoLateWindow) return 'On-Time';
    const isFriday = weekday === 'Fri';
    const exemptIds = APP_CONFIG.FRIDAY_LATE_EXEMPT_EMPLOYEE_IDS.map(id => normalizeEmployeeId(id));
    const workerId = worker?.employeeId ? normalizeEmployeeId(worker.employeeId) : '';
    const isExemptUser = Boolean(workerId) && exemptIds.includes(workerId);

    const { shiftStartMinutes: rStartMinutes, isOvernightShift: rIsOvernight, shiftEndAdjusted: rEndMinutesAdjusted } = getShiftMetaForEmployee(worker?.employeeId, rDate);

    const [cutoffHour, cutoffMinute] = APP_CONFIG.FRIDAY_LATE_EXEMPT_CUTOFF.split(':').map(Number);
    const cutoffBase = cutoffHour * 60 + cutoffMinute;
    const cutoffAdjusted = rIsOvernight && cutoffBase < rStartMinutes ? cutoffBase + 24 * 60 : cutoffBase;

    const generalExemptIds = (APP_CONFIG as any).LATE_EXEMPT_EMPLOYEE_IDS || [];
    const isGeneralExempt = Boolean(workerId) && generalExemptIds.includes(workerId);
    const [genCutoffHour, genCutoffMinute] = ((APP_CONFIG as any).LATE_EXEMPT_CUTOFF || "20:00").split(':').map(Number);
    const genCutoffBase = genCutoffHour * 60 + genCutoffMinute;
    const genCutoffAdjusted = rIsOvernight && genCutoffBase < rStartMinutes ? genCutoffBase + 24 * 60 : genCutoffBase;

    if (isGeneralExempt && currentMinutes <= genCutoffAdjusted) {
      return 'On-Time';
    }

    if (isFriday && isExemptUser && currentMinutes <= cutoffAdjusted) {
      return 'On-Time';
    }
    const relaxation = APP_CONFIG.GRACE_PERIOD_MINS;
    if (currentMinutes < startMinutes) return 'Early';
    if (currentMinutes <= startMinutes + relaxation) return 'On-Time';
    return 'Late';
  };

  const handleEditRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRecord) {
      const updatedCheckIn = buildZonedISOString(editDate, editInTime);
      let resolvedOutDate = editOutDate || editDate;
      if (editOutTime && editInTime && editOutTime < editInTime && resolvedOutDate === editDate) {
        resolvedOutDate = addDaysToDateString(editDate, 1);
      }
      const updatedCheckOut = editOutTime
        ? buildZonedISOString(resolvedOutDate, editOutTime)
        : undefined;
      let totalHours = undefined;
      if (updatedCheckOut) {
        const diff = (new Date(updatedCheckOut).getTime() - new Date(updatedCheckIn).getTime()) / (1000 * 60 * 60);
        totalHours = diff > 0 ? diff : 0;
      }
      const nextStatus = calculateCheckInStatus({ ...editingRecord, checkIn: updatedCheckIn });
      onUpdateRecord({
        ...editingRecord,
        date: editDate,
        checkIn: updatedCheckIn,
        checkOut: updatedCheckOut,
        totalHours,
        status: nextStatus,
        localUpdatedAt: new Date().toISOString()
      });
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

  const downloadSalarySlipForUser = (targetUser: User, snapshot: NonNullable<ReturnType<typeof buildSalarySnapshot>>) => {
    const slipId = `${targetUser.employeeId}_${snapshot.monthKey}`;
    const basicPay = Number(targetUser.basicSalary) || (Number(targetUser.salary) || 0);
    const allowancePay = Number(targetUser.allowances) || 0;
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Salary Slip ${slipId}</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; }
            .card { max-width: 700px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; }
            h1 { font-size: 20px; margin: 0 0 6px; text-align: center; }
            .meta { font-size: 12px; text-align: center; color: #64748b; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
            th { text-align: left; background: #f1f5f9; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; color: #64748b; }
            td:last-child { text-align: right; font-weight: 700; }
            .total { font-weight: 800; }
            .summary { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between; align-items: center; }
            .net { font-size: 18px; font-weight: 800; color: #2563eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Salary Slip</h1>
            <div class="meta">Month: ${snapshot.monthLabel} • Employee: ${targetUser.name} • ID: ${targetUser.employeeId}</div>
            <table>
              <tr><th>Earnings</th><th>Amount</th></tr>
              <tr><td>Basic Salary</td><td>${formatCurrency(basicPay)}</td></tr>
              <tr><td>Allowances</td><td>${formatCurrency(allowancePay)}</td></tr>
              <tr><td>Unpaid Leave (${snapshot.unpaidLeaveDays} days)</td><td>- ${formatCurrency(snapshot.leaveDeduction)}</td></tr>
              <tr><td>Early Checkout (${snapshot.earlyCheckoutHoursThisMonth.toFixed(2)} hrs)</td><td>- ${formatCurrency(snapshot.earlyCheckoutDeduction)}</td></tr>
              <tr><td>Absents (auto) (${snapshot.absentDaysThisMonth} days)</td><td>Included</td></tr>
              <tr><td>Tax (PK progressive)</td><td>- ${formatCurrency(snapshot.monthlyTax)}</td></tr>
              <tr><td class="total">Taxable Salary</td><td class="total">${formatCurrency(snapshot.taxableSalary)}</td></tr>
              <tr><td class="total">Salary After Tax</td><td class="total">${formatCurrency(snapshot.salaryAfterTax)}</td></tr>
              <tr><td class="total">Net Pay</td><td class="total">${formatCurrency(snapshot.netPay)}</td></tr>
            </table>
            <div class="summary">
              <div class="net">${formatCurrency(snapshot.netPay)}</div>
            </div>
          </div>
        </body>
      </html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Salary_Slip_${slipId}.html`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getChecklistProgress = (userId: string) => {
    const checklist = checklists.find(c => c.userId === userId);
    if (!checklist) return 0;
    const completed = checklist.items.filter(i => i.completed).length;
    return Math.round((completed / checklist.items.length) * 100);
  };

  return (
    <div className="space-y-8 animate-fade-up">
      {!isExecutive && (
        <div className="glass-card rounded-[2rem] p-6 border-2 border-white flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-4">
              <div className={`w-3 h-3 rounded-full ${canTrack ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
              <div>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Personal Attendance (HR)</p>
                <p className="font-black text-slate-900">
                  {myRecord
                    ? `Active since ${new Date(myRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : shiftLocked
                      ? 'Shift Completed'
                      : 'Not Checked In'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-blue-50 border border-blue-100">
                <Icon3D icon="Activity" size="xs" variant="blue" />
                <div>
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Weekly OT</p>
                  <p className="text-sm font-black text-blue-600">{weeklyOT > 0 ? formatDuration(weeklyOT) : '0h 0m'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-amber-50 border border-amber-100">
                <Icon3D icon="History" size="xs" variant="amber" />
                <div>
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Late Rem.</p>
                  <p className="text-sm font-black text-amber-600">{lateRemaining} left</p>
                </div>
              </div>
              {user.role === Role.HR && (
                <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <Icon3D icon="Wallet" size="xs" variant="emerald" />
                  <div>
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Net Salary</p>
                    <p className="text-sm font-black text-emerald-700">
                      {mySnapshot ? formatCurrency(mySnapshot.salaryAfterTax) : 'Set Salary'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={myRecord ? onCheckOut : onCheckIn}
            disabled={!canTrack || shiftLocked}
            className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all ${myRecord ? 'bg-rose-600 text-white hover:bg-rose-700' : 'premium-gradient text-white hover:opacity-90 disabled:opacity-30'}`}
          >
            {myRecord ? 'Check Out' : shiftLocked ? 'Shift Done' : 'Check In Now'}
          </button>
        </div>
      )}

      {/* Premium Dashboard Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <Icon3D icon="ShieldCheck" size="lg" variant="blue" />
          <div className="space-y-1">
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
              {user.role} <span className="text-blue-600">Console</span>
            </h1>
            <p className="text-slate-500 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Enterprise Resource Planning & System Administration
            </p>
          </div>
        </div>

        {/* Tab Navigation - Premium Pill Style */}
        <div className="flex items-center p-2 bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 shadow-xl shadow-blue-500/5 w-fit overflow-x-auto no-scrollbar">
          {[
            { id: 'attendance', label: 'Attendance', icon: 'Calendar' },
            { id: 'leaves', label: 'Leaves', icon: 'Plane' },
            { id: 'personnel', label: 'Personnel', icon: 'Users' },
            { id: 'documents', label: 'Docs', icon: 'FileStack' },
            { id: 'tasks', label: 'Tasks', icon: 'ListChecks' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id as any)}
              className={`flex items-center gap-2 pr-6 py-2 rounded-[1.8rem] text-[11px] font-black uppercase tracking-widest transition-all duration-500 whitespace-nowrap ${tab === item.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40 transform scale-105 pl-2'
                : 'text-slate-500 hover:text-blue-600 hover:bg-white pl-2'
                }`}
            >
              <Icon3D
                icon={item.icon as any}
                size="sm"
                variant={tab === item.id ? 'blue' : 'slate'}
                className={tab === item.id ? 'bg-white/20 border-white/20' : ''}
              />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'attendance' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="relative group w-full md:w-auto">
              <select
                id="attendance-employee-filter"
                name="attendanceEmployee"
                aria-label="Select employee"
                value={selectedEmp}
                onChange={e => setSelectedEmp(e.target.value)}
                className="w-full md:w-[280px] bg-white border border-slate-200 rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-widest outline-none focus:border-blue-500 shadow-sm transition-all appearance-none cursor-pointer pr-12"
              >
                <option value="all">Global Roster</option>
                {sortedVisibleUsers.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
              </select>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
              <div className="relative group">
                <input
                  id="admin-attendance-date"
                  type="date"
                  value={attendanceDateFilter}
                  onChange={e => setAttendanceDateFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-2xl px-6 py-4 text-[11px] font-black uppercase tracking-widest outline-none focus:border-blue-500 shadow-sm transition-all appearance-none cursor-pointer pr-12"
                  ref={attendanceDateRef}
                />
                <button
                  type="button"
                  onClick={() => attendanceDateRef.current?.showPicker?.()}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>

              {attendanceDateFilter && (
                <button
                  type="button"
                  onClick={() => setAttendanceDateFilter('')}
                  className="px-6 py-4 rounded-2xl bg-slate-100 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200 transition-all shadow-sm"
                >
                  Clear
                </button>
              )}
            </div>
            {canEditTime && (
              <button
                type="button"
                onClick={() => {
                  setIsAddingRecord(true);
                  setNewRecordUserId('');
                  const today = getLocalDateString(new Date());
                  setNewRecordDate(today);
                  setNewRecordOutDate(today);
                  setNewRecordCheckIn('');
                  setNewRecordCheckOut('');
                }}
                className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all w-full sm:w-auto"
              >
                Add Attendance
              </button>
            )}
            {selectedEmp !== 'all' && (
              <button onClick={() => downloadIndividualReport(selectedEmp)} className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center gap-2 w-full sm:w-auto justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                Download Monthly Sheet
              </button>
            )}
          </div>
          <div className="glass-card rounded-[2.5rem]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="bg-slate-50/50 text-[11px] font-black uppercase tracking-widest text-slate-500">
                    <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Employee</th>
                    <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Date</th>
                    <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Check In</th>
                    <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Check Out</th>
                    <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Duration</th>
                    <th className="px-4 md:px-6 2xl:px-8 py-4 md:py-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pagedAttendance.map(r => {
                    const recordUser = users.find(u => u.id === r.userId);
                    const roleLabel = recordUser?.position || recordUser?.role || 'Employee';
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-all duration-300 group">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black text-xs border-2 border-white shadow-sm ring-1 ring-blue-50">
                              {toInitials(r.userName)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900 text-sm">{r.userName}</span>
                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-0.5">{roleLabel}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-xs font-black text-slate-500 text-center">{resolveRecordDate(r)}</td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-black text-slate-900">{formatTimeInZone(r.checkIn)}</span>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border w-fit mt-1.5 shadow-sm transition-transform group-hover:scale-105 ${getDisplayStatus(r) === 'Late' ? 'border-rose-100 text-rose-600 bg-rose-50' : getDisplayStatus(r) === 'Early' ? 'border-amber-100 text-amber-600 bg-amber-50' : 'border-emerald-100 text-emerald-600 bg-emerald-50'}`}>{getDisplayStatus(r)}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-black text-slate-900">{r.checkOut ? formatTimeInZone(r.checkOut) : <span className="text-emerald-500 animate-pulse">ACTIVE</span>}</span>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border w-fit mt-1.5 shadow-sm transition-transform group-hover:scale-105 ${getCheckoutStatus(r) === 'Early' ? 'border-rose-100 text-rose-600 bg-rose-50' : getCheckoutStatus(r) === 'On-Time' ? 'border-blue-100 text-blue-600 bg-blue-50' : 'border-slate-100 text-slate-500 bg-slate-50'}`}>{getCheckoutStatus(r)}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 font-black text-blue-600 text-center text-sm">{r.totalHours ? formatDuration(r.totalHours) : '--'}</td>
                        <td className="px-8 py-6 text-right">
                          {canEditTime && (
                            <button
                              onClick={() => startEditingRecord(r)}
                              className="px-4 py-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest shadow-sm ring-1 ring-blue-100"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="glass-card rounded-[2.5rem] p-0 overflow-hidden border border-white/40 shadow-2xl shadow-blue-500/5">
            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-end md:justify-between gap-6 bg-slate-50/50">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Employee Monthly Insights</h3>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  {monthSummaryLabel} {selectedEmployee ? `• ${selectedEmployee.name}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="px-4 py-2.5 rounded-2xl bg-white border border-slate-100 shadow-sm flex flex-col items-center min-w-[100px]">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Hours</span>
                  <span className="text-xs font-black text-slate-900">{formatDuration(monthTotalHours)}</span>
                </div>
                <div className="relative">
                  <input
                    id="admin-attendance-month-input"
                    type="month"
                    value={attendanceMonthFilter}
                    onChange={e => setAttendanceMonthFilter(e.target.value)}
                    className="bg-white border border-slate-200 rounded-2xl px-5 py-3 text-[11px] font-black uppercase tracking-widest outline-none focus:border-blue-500 shadow-sm transition-all appearance-none cursor-pointer pr-10"
                    ref={attendanceMonthRef}
                  />
                  <button
                    type="button"
                    onClick={() => attendanceMonthRef.current?.showPicker()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            {selectedEmp === 'all' ? (
              <div className="text-center py-16 px-8 space-y-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Select an employee from the roster to view detailed monthly metrics</p>
              </div>
            ) : sortedMonthlyAttendance.length === 0 ? (
              <div className="text-center py-16 px-8">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No activity recorded for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left">
                  <thead>
                    <tr className="bg-slate-50/80 text-[11px] font-black uppercase tracking-widest text-slate-500">
                      <th className="px-8 py-5">Shift Date</th>
                      <th className="px-8 py-5 text-center">Clock In</th>
                      <th className="px-8 py-5 text-center">Clock Out</th>
                      <th className="px-8 py-5 text-center">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sortedMonthlyAttendance.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-all group">
                        <td className="px-8 py-6 text-xs font-black text-slate-600">{resolveRecordDate(r)}</td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-black text-slate-900">{formatTimeInZone(r.checkIn)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border w-fit mt-1.5 ${getDisplayStatus(r) === 'Late' ? 'border-rose-100 text-rose-600 bg-rose-50' : getDisplayStatus(r) === 'Early' ? 'border-amber-100 text-amber-600 bg-amber-50' : 'border-emerald-100 text-emerald-600 bg-emerald-50'}`}>{getDisplayStatus(r)}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-black text-slate-900">{r.checkOut ? formatTimeInZone(r.checkOut) : <span className="text-emerald-500 animate-pulse">ACTIVE</span>}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border w-fit mt-1.5 ${getCheckoutStatus(r) === 'Early' ? 'border-rose-100 text-rose-600 bg-rose-50' : getCheckoutStatus(r) === 'On-Time' ? 'border-blue-100 text-blue-600 bg-blue-50' : 'border-slate-100 text-slate-500 bg-slate-50'}`}>{getCheckoutStatus(r)}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 font-black text-blue-600 text-center text-sm">{r.totalHours ? formatDuration(r.totalHours) : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="space-y-8">
          {!isExecutive && (
            <div className="glass-card rounded-[2.5rem] p-8">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Apply for Leave (My Request)</h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label htmlFor="admin-leave-start" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Start Date</label>
                  <input id="admin-leave-start" name="leaveStartDate" type="date" value={leaveStartDate} onChange={e => setLeaveStartDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="admin-leave-end" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">End Date</label>
                  <input id="admin-leave-end" name="leaveEndDate" type="date" value={leaveEndDate} onChange={e => setLeaveEndDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Leave Type</label>
                  <select
                    value={leaveType}
                    onChange={e => {
                      const value = e.target.value as 'Annual' | 'Sick' | 'Casual' | 'Unpaid';
                      setLeaveType(value);
                      if (value === 'Unpaid') setLeavePaid(false);
                    }}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800"
                  >
                    <option value="Annual">Annual (remaining {myRemainingByType.annual})</option>
                    <option value="Sick">Sick (remaining {myRemainingByType.sick})</option>
                    <option value="Casual">Casual (remaining {myRemainingByType.casual})</option>
                    <option value="Unpaid">Unpaid</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Leave With Pay?</label>
                  <div className="flex items-center gap-3 bg-slate-50 border-2 border-transparent p-4 rounded-2xl">
                    <input
                      id="admin-leave-paid"
                      type="checkbox"
                      checked={leavePaid}
                      onChange={e => setLeavePaid(e.target.checked)}
                      disabled={leaveType === 'Unpaid'}
                      className="w-4 h-4"
                    />
                    <label htmlFor="admin-leave-paid" className="text-xs font-bold text-slate-600">
                      {leaveType === 'Unpaid' ? 'Unpaid selected' : 'Leave with pay (P/LWP)'}
                    </label>
                  </div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    Remaining {leaveType}: {selectedRemaining}
                  </p>
                  {selectedRemaining === 0 && leaveType !== 'Unpaid' && (
                    <p className="text-[11px] font-black text-amber-600 uppercase tracking-widest">This request will be unpaid</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label htmlFor="admin-leave-reason" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Leave Application</label>
                  <textarea id="admin-leave-reason" name="leaveReason" value={leaveApplication} onChange={e => setLeaveApplication(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 h-24 resize-none" />
                </div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Quota: Annual {leaveQuota.annual ?? 7} • Sick {leaveQuota.sick ?? 9} • Casual {leaveQuota.casual ?? 6} • Total 22
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!leaveStartDate || !leaveEndDate) return;
                  const safeStart = leaveStartDate <= leaveEndDate ? leaveStartDate : leaveEndDate;
                  const safeEnd = leaveStartDate <= leaveEndDate ? leaveEndDate : leaveStartDate;
                  const start = new Date(safeStart);
                  const diffDays = Math.floor((start.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  if (diffDays < 7) {
                    alert('Leave should be applied at least 1 week prior.');
                    return;
                  }
                  const willBePaid = leaveType !== 'Unpaid' && leavePaid && selectedRemaining > 0;
                  onSubmitLeave(safeStart, safeEnd, leaveApplication, leaveType, willBePaid);
                  const today = getLocalDateString(new Date());
                  setLeaveStartDate(today);
                  setLeaveEndDate(today);
                  setLeaveApplication(buildLeaveTemplate(user));
                  setLeavePaid(true);
                }}
                className="mt-6 w-full premium-gradient text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl"
              >
                Submit Leave Request
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            {visibleLeaveRequests.length === 0 ? (
              <div className="glass-card rounded-[2.5rem] p-20 text-center font-black text-slate-300 uppercase tracking-widest border-2 border-dashed border-slate-100 flex flex-col items-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
                  <svg className="w-6 h-6 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                No active leave requests
              </div>
            ) : (
              visibleLeaveRequests.map(l => (
                <div key={l.id} className="glass-card rounded-[2.5rem] p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 border border-white/40 shadow-xl shadow-blue-500/5 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 group animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
                      {toInitials(l.userName)}
                    </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-black text-lg text-slate-900 leading-none">{l.userName}</span>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${l.status === 'Pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' : l.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>{l.status}</span>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm bg-slate-50 text-slate-700 border border-slate-100">{l.leaveType || 'Annual'}</span>
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{l.startDate} → {l.endDate}</p>
                  </div>
                  </div>

                  <div className="flex-1 max-w-md">
                    <p className="text-sm font-medium text-slate-600 leading-relaxed italic border-l-4 border-blue-500/30 pl-4 py-1 bg-slate-50/50 rounded-r-xl">"{l.reason}"</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest border bg-slate-50 text-slate-700 border-slate-100">{l.leaveType || 'Annual'}</span>
                    <span className={`px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest border ${l.isPaid === false ? 'bg-slate-50 text-slate-500 border-slate-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{l.isPaid === false ? 'L/WP (Unpaid)' : 'Leave with Pay'}</span>
                    {l.status === 'Pending' && (
                      <div className="flex gap-2">
                        {canApprove ? (
                          <>
                            <button onClick={() => onLeaveAction(l.id, 'Approved')} className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all">Approve</button>
                            <button onClick={() => onLeaveAction(l.id, 'Rejected')} className="bg-rose-50 text-rose-600 border border-rose-100 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all">Reject</button>
                          </>
                        ) : (
                          <span className="text-[11px] font-black text-slate-400 uppercase italic">Awaiting CEO Action</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="glass-card rounded-[2.5rem] p-0 overflow-hidden border border-white/40 shadow-2xl shadow-blue-500/5 mt-10">
            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Work From Home Requests</h3>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-1">Global Queue</p>
            </div>
            {visibleWfh.length === 0 ? (
              <div className="text-center py-20 px-8 bg-white border-dashed border-2 border-slate-50 m-8 rounded-[2rem] flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m0 0l-7 7-7-7m2 2v10a1 1 0 011 1h3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">All caught up! No active WFH requests.</p>
              </div>
            ) : (
              <div className="p-8 space-y-4">
                {visibleWfh.map(req => (
                  <div key={req.id} className="glass-card rounded-[2.5rem] p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 border border-slate-100 hover:border-blue-200 transition-all duration-500 group">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-black text-sm shadow-sm group-hover:scale-105 transition-transform uppercase">
                        {toInitials(req.userName)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-lg text-slate-900 leading-none">{req.userName}</span>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${req.status === 'Pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' : req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>{req.status}</span>
                        </div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{req.startDate} → {req.endDate}</p>
                      </div>
                    </div>

                    <div className="flex-1 max-w-md">
                      <p className="text-sm font-medium text-slate-600 leading-relaxed italic border-l-4 border-emerald-500/30 pl-4 py-1 bg-slate-50/50 rounded-r-xl">"{req.reason}"</p>
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-2">Submitted on {new Date(req.submittedAt).toLocaleDateString()}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {req.status === 'Pending' && (
                        canApprove ? (
                          <>
                            <button onClick={() => onWfhAction(req.id, 'Approved')} className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all">Approve</button>
                            <button onClick={() => onWfhAction(req.id, 'Rejected')} className="bg-rose-50 text-rose-600 border border-rose-100 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all">Reject</button>
                          </>
                        ) : (
                          <span className="text-[10px] font-black text-slate-300 uppercase italic">Awaiting CEO Action</span>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {tab === 'personnel' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Workforce Directory</h3>
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Manage your global team presence</p>
            </div>
            <button
              onClick={() => { setIsAddingUser(true); setEmployeeIdSeed(getNextEmployeeSeed(users)); setUserForm({ role: Role.EMPLOYEE }); setEssForm({}); }}
              className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center gap-3 shrink-0"
            >
              <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
              </div>
              Onboard New Talent
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {workforceUsers.map(u => {
              const profile = essProfiles.find(p => p.userId === u.id);
              const progress = getChecklistProgress(u.id);
              const totalSalary = calculateTotalSalary(u.basicSalary, u.allowances, u.homeAllowance, u.travelAllowance, u.internetAllowance, u.salary);
              return (
                <div key={u.id} className="glass-card rounded-[3rem] p-8 border border-white/40 shadow-xl shadow-blue-500/5 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 group relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 p-8">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xs font-black shadow-sm border transition-all group-hover:scale-110 ${progress === 100 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                      {progress}%
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 font-black text-xl shadow-inner group-hover:scale-105 transition-transform">
                        {toInitials(u.name)}
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-black text-slate-900 text-lg leading-tight">{u.name}</h3>
                        <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest">{u.position || 'General Staff'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Employee ID</p>
                        <p className="text-xs font-black text-slate-900">{u.employeeId}</p>
                      </div>
                      <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Work Mode</p>
                        <p className="text-xs font-black text-slate-900">{u.workMode || 'Onsite'}</p>
                      </div>
                      <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100 col-span-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Monthly Remuneration</p>
                        <p className="text-xs font-black text-slate-900">PKR {totalSalary.toLocaleString()}</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Document Checklist</p>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{progress === 100 ? 'Verified' : 'Incomplete'}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div className={`h-full transition-all duration-1000 ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex gap-3">
                    <button
                      onClick={() => startEditingUser(u)}
                      className="flex-1 py-4 rounded-2xl bg-white border border-slate-200 text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-95"
                    >
                      Management
                    </button>
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
                        className="w-14 py-4 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center hover:bg-rose-600 hover:text-white transition-all shadow-sm active:scale-95"
                        title="Delete User"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
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
            {(user.role === Role.HR || user.role === Role.CEO) && (
              <div className="glass-card rounded-[3rem] p-0 overflow-hidden border border-white/40 shadow-2xl shadow-blue-500/5">
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                      {user.role === Role.CEO ? 'Employee Salary Analysis' : 'Personal Salary Analysis'}
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                      {(user.role === Role.CEO ? selectedSnapshot?.monthLabel : mySnapshot?.monthLabel) || now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  {(user.role === Role.HR ? Boolean(mySnapshot) : Boolean(selectedSnapshot)) && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetUser = user.role === Role.CEO ? users.find(u => u.id === selectedDocUserId) || null : user;
                        const snapshot = user.role === Role.CEO ? selectedSnapshot : mySnapshot;
                        if (targetUser && snapshot) downloadSalarySlipForUser(targetUser, snapshot);
                      }}
                      className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Extract Slip
                    </button>
                  )}
                </div>

                <div className="p-8">
                  {user.role === Role.CEO && !selectedSnapshot ? (
                    <div className="text-center py-10 space-y-4">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-200">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Awaiting selection from document generator</p>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const snapshot = user.role === Role.CEO ? selectedSnapshot : mySnapshot;
                        if (!snapshot) return null;
                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-1">
                              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Core Remuneration</span>
                                <span className="font-black text-slate-900">{formatCurrency(snapshot.monthlySalary)}</span>
                              </div>

                              <div className="space-y-2 px-2 py-4">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-slate-500">Unpaid Absence ({snapshot.unpaidLeaveDays}d)</span>
                                  <span className="font-black text-rose-500">-{formatCurrency(snapshot.leaveDeduction)}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-slate-500">Early Departure ({snapshot.earlyCheckoutHoursThisMonth.toFixed(1)}h)</span>
                                  <span className="font-black text-rose-500">-{formatCurrency(snapshot.earlyCheckoutDeduction)}</span>
                                </div>
                              </div>

                              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 space-y-2 mt-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Adjusted Taxable</span>
                                  <span className="font-black text-slate-900">{formatCurrency(snapshot.taxableSalary)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Progressive Tax</span>
                                  <span className="font-black text-rose-600">-{formatCurrency(snapshot.monthlyTax)}</span>
                                </div>
                              </div>

                              <div className="p-6 bg-slate-900 rounded-[2rem] shadow-xl shadow-slate-900/10 mt-6 flex flex-col items-center">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Final Net Disbursement</span>
                                <span className="text-2xl font-black text-white">{formatCurrency(snapshot.netPay)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="glass-card rounded-[2.5rem] p-8 space-y-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Document Generator</h3>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-1">HR / CEO / Super Admin</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="doc-type" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Document Type</label>
                <select id="doc-type" name="documentType" value={docType} onChange={e => setDocType(e.target.value as DocumentType)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800">
                  <option value="salary-slip">Salary Slip</option>
                  <option value="offer-letter">Offer Letter</option>
                  <option value="appointment-letter">Appointment Letter</option>
                  <option value="experience-letter">Experience Letter</option>
                </select>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="doc-employee-select" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Select Employee</label>
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
                <div className="space-y-1"><label htmlFor="doc-employee-name" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Employee Name</label><input id="doc-employee-name" name="employeeName" type="text" value={docForm.employeeName} onChange={e => updateDocForm('employeeName', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="doc-employee-id" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Employee ID</label><input id="doc-employee-id" name="employeeId" type="text" value={docForm.employeeId} onChange={e => updateDocForm('employeeId', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1">
                  <label htmlFor="doc-role" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Role / Designation</label>
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
                    <label htmlFor="doc-role-custom" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Custom Role</label>
                    <input id="doc-role-custom" name="roleCustom" type="text" value={docForm.role} onChange={e => updateDocForm('role', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                )}
                <div className="space-y-1"><label htmlFor="doc-issue-date" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Issue Date</label><input id="doc-issue-date" name="issueDate" type="date" value={docForm.issueDate} onChange={e => updateDocForm('issueDate', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="doc-location" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Location</label><input id="doc-location" name="location" type="text" value={docForm.location} onChange={e => updateDocForm('location', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="doc-signatory" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">CEO Designation</label><input id="doc-signatory" name="signatory" type="text" value={docForm.signatory} onChange={e => updateDocForm('signatory', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="doc-ceo-name" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">CEO Name</label><input id="doc-ceo-name" name="ceoName" type="text" value={docForm.ceoName} onChange={e => updateDocForm('ceoName', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
              </div>

              {(docType === 'offer-letter' || docType === 'appointment-letter') && (
                <div className="space-y-1">
                  <label htmlFor="doc-joining-date" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Joining Date</label>
                  <input id="doc-joining-date" name="joiningDate" type="date" value={docForm.startDate} onChange={e => updateDocForm('startDate', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                </div>
              )}

              {docType === 'experience-letter' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="doc-experience-start" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Start Date</label>
                    <input id="doc-experience-start" name="experienceStartDate" type="date" value={docForm.startDate} onChange={e => updateDocForm('startDate', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-experience-end" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">End Date</label>
                    <input id="doc-experience-end" name="experienceEndDate" type="date" value={docForm.endDate} onChange={e => updateDocForm('endDate', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                </div>
              )}
              {docType === 'appointment-letter' && (
                <>
                  <div className="space-y-1">
                    <label htmlFor="doc-salary" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Monthly Basic Salary</label>
                    <input id="doc-salary" name="salary" type="number" value={docForm.salary} onChange={e => updateDocForm('salary', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" placeholder="e.g. 50000" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-commission" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Commission (on sales)</label>
                    <input id="doc-commission" name="commission" type="text" value={docForm.commission} onChange={e => updateDocForm('commission', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" placeholder="e.g. 5% on sales" />
                  </div>
                </>
              )}

              {docType !== 'salary-slip' && (
                <div className="space-y-2">
                  <label htmlFor="doc-signature" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">CEO Signature (PNG/SVG)</label>
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
                    <label htmlFor="doc-working-days" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Working Days</label>
                    <input id="doc-working-days" name="workingDays" type="number" value={docForm.workingDays} onChange={e => updateDocForm('workingDays', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-basic-pay" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Basic Pay</label>
                    <input id="doc-basic-pay" name="basicPay" type="number" value={docForm.basicPay} onChange={e => updateDocForm('basicPay', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-home-allowance" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Home Allowance</label>
                    <input id="doc-home-allowance" name="homeAllowance" type="number" value={docForm.homeAllowance} onChange={e => updateDocForm('homeAllowance', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-travel-allowance" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Travel Allowance</label>
                    <input id="doc-travel-allowance" name="travelAllowance" type="number" value={docForm.travelAllowance} onChange={e => updateDocForm('travelAllowance', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-internet-allowance" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Internet and Phone</label>
                    <input id="doc-internet-allowance" name="internetAllowance" type="number" value={docForm.internetAllowance} onChange={e => updateDocForm('internetAllowance', e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Tax (PK progressive)</label>
                    <div className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent font-black text-slate-800">
                      PKR {docTaxAmount.toLocaleString()}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                      Calculated on total earnings.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="doc-other-deductions" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Other Deductions</label>
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
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Live draft</p>
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

      {tab === 'tasks' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <TaskBoard
            tasks={tasks}
            users={users}
            currentUser={user}
            isManager={true}
            onAddTask={onAddTask}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
          />
        </div>
      )}

      {/* Add Attendance Modal */}
      {isAddingRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase mb-2">Add Attendance</h3>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-8">Super Admin Only</p>
            <form
              onSubmit={e => {
                e.preventDefault();
                const targetUser = users.find(u => u.id === newRecordUserId);
                if (!targetUser || !newRecordDate || !newRecordCheckIn) return;
                const checkInIso = buildZonedISOString(newRecordDate, newRecordCheckIn);
                let resolvedOutDate = newRecordOutDate || newRecordDate;
                if (newRecordCheckOut && newRecordCheckIn && newRecordCheckOut < newRecordCheckIn && resolvedOutDate === newRecordDate) {
                  resolvedOutDate = addDaysToDateString(newRecordDate, 1);
                }
                const checkOutIso = newRecordCheckOut
                  ? buildZonedISOString(resolvedOutDate, newRecordCheckOut)
                  : undefined;
                let totalHours = undefined;
                if (checkOutIso) {
                  const diff = (new Date(checkOutIso).getTime() - new Date(checkInIso).getTime()) / (1000 * 60 * 60);
                  totalHours = diff > 0 ? diff : 0;
                }
                const draftRecord: AttendanceRecord = {
                  id: Math.random().toString(36).substr(2, 9),
                  userId: targetUser.id,
                  userName: targetUser.name,
                  date: newRecordDate,
                  checkIn: checkInIso,
                  checkOut: checkOutIso,
                  totalHours,
                  status: 'On-Time',
                  localUpdatedAt: new Date().toISOString()
                };
                draftRecord.status = calculateCheckInStatus(draftRecord);
                onUpdateRecord(draftRecord);
                setIsAddingRecord(false);
              }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <label htmlFor="add-attendance-user" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Employee</label>
                <select
                  id="add-attendance-user"
                  name="attendanceUser"
                  value={newRecordUserId}
                  onChange={e => setNewRecordUserId(e.target.value)}
                  className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800"
                  required
                >
                  <option value="" disabled>Select employee</option>
                  {sortedVisibleUsers.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.employeeId})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="add-attendance-date" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Shift Date</label>
                <input id="add-attendance-date" name="attendanceDate" type="date" value={newRecordDate} onChange={e => setNewRecordDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" required />
              </div>
              <div className="space-y-1">
                <label htmlFor="add-attendance-out-date" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Check Out Date</label>
                <input id="add-attendance-out-date" name="attendanceOutDate" type="date" value={newRecordOutDate} onChange={e => setNewRecordOutDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="add-attendance-in" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Check In</label>
                  <input id="add-attendance-in" name="attendanceCheckIn" type="time" value={newRecordCheckIn} onChange={e => setNewRecordCheckIn(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" required />
                </div>
                <div className="space-y-1">
                  <label htmlFor="add-attendance-out" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Check Out</label>
                  <input id="add-attendance-out" name="attendanceCheckOut" type="time" value={newRecordCheckOut} onChange={e => setNewRecordCheckOut(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" />
                </div>
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="submit" className="flex-1 premium-gradient text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Create Record</button>
                <button type="button" onClick={() => setIsAddingRecord(false)} className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest">Discard</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase mb-2">Manual Correction</h3>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-8">Record ID: {editingRecord.id}</p>
            <form onSubmit={handleEditRecordSubmit} className="space-y-6">
              <div className="space-y-1"><label htmlFor="manual-edit-date" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Calendar Date</label><input id="manual-edit-date" name="manualDate" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div>
              <div className="space-y-1"><label htmlFor="manual-edit-out-date" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Check Out Date</label><input id="manual-edit-out-date" name="manualOutDate" type="date" value={editOutDate} onChange={e => setEditOutDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label htmlFor="manual-edit-in" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Check In</label><input id="manual-edit-in" name="manualCheckIn" type="time" value={editInTime} onChange={e => setEditInTime(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div><div className="space-y-1"><label htmlFor="manual-edit-out" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Check Out</label><input id="manual-edit-out" name="manualCheckOut" type="time" value={editOutTime} onChange={e => setEditOutTime(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div></div>
              <div className="flex flex-wrap gap-3 pt-4">
                {canEditTime && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingRecord) return;
                      if (!window.confirm('Delete this attendance record?')) return;
                      onDeleteRecord(editingRecord.id);
                      setEditingRecord(null);
                    }}
                    className="px-6 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest border border-rose-100"
                  >
                    Delete Record
                  </button>
                )}
                <button type="submit" className="flex-1 premium-gradient text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Save Overrides</button>
                <button type="button" onClick={() => setEditingRecord(null)} className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest">Discard</button>
              </div>
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
                <div className="space-y-1"><label htmlFor="user-first-name" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">First Name</label><input id="user-first-name" name="firstName" required type="text" value={userForm.firstName || ''} onChange={e => setUserForm({ ...userForm, firstName: e.target.value, name: formatFullName(e.target.value, userForm.lastName) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-last-name" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Last Name</label><input id="user-last-name" name="lastName" required type="text" value={userForm.lastName || ''} onChange={e => setUserForm({ ...userForm, lastName: e.target.value, name: formatFullName(userForm.firstName, e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-dob" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Date of Birth</label><input id="user-dob" name="dob" type="date" value={userForm.dob || ''} onChange={e => setUserForm({ ...userForm, dob: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-phone" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Phone Number</label><input id="user-phone" name="phone" type="tel" value={userForm.phone || ''} onChange={e => setUserForm({ ...userForm, phone: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-email" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Email Address</label><input id="user-email" name="email" required type="email" value={userForm.email || ''} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1">
                  <label htmlFor="user-password" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Security Key (Password)</label>
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
                  <label htmlFor="user-pin" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">4 Digit PIN (HR Only)</label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
                    <button
                      type="button"
                      onClick={() => setUserForm(prev => ({ ...prev, pin: generateTempPin() }))}
                      className="shrink-0 px-4 py-3 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Reset PIN
                    </button>
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-2">Employees can log in with PIN instead of password.</p>
                </div>
                <div className="space-y-1"><label htmlFor="user-employee-id" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Employee ID</label><input id="user-employee-id" name="employeeId" required readOnly type="text" value={formatEmployeeId(userForm.firstName, userForm.lastName, employeeIdSeed)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent outline-none font-bold text-slate-800 text-slate-500" /></div>
                <div className="space-y-1"><label htmlFor="user-basic-salary" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Basic Salary (Monthly)</label><input id="user-basic-salary" name="basicSalary" type="number" value={userForm.basicSalary || ''} onChange={e => setUserForm({ ...userForm, basicSalary: Number(e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-home-allowance" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Home Allowance</label><input id="user-home-allowance" name="homeAllowance" type="number" value={userForm.homeAllowance || ''} onChange={e => setUserForm({ ...userForm, homeAllowance: Number(e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-travel-allowance" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Travel Allowance</label><input id="user-travel-allowance" name="travelAllowance" type="number" value={userForm.travelAllowance || ''} onChange={e => setUserForm({ ...userForm, travelAllowance: Number(e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-internet-allowance" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Internet & Phone</label><input id="user-internet-allowance" name="internetAllowance" type="number" value={userForm.internetAllowance || ''} onChange={e => setUserForm({ ...userForm, internetAllowance: Number(e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label htmlFor="user-allowances" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Other Allowances (Monthly)</label><input id="user-allowances" name="allowances" type="number" value={userForm.allowances || ''} onChange={e => setUserForm({ ...userForm, allowances: Number(e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1">
                  <label htmlFor="user-position" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Job Position</label>
                  <select
                    id="user-position"
                    name="position"
                    required
                    value={userForm.position || ''}
                    onChange={e => setUserForm({ ...userForm, position: e.target.value })}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800"
                  >
                    <option value="" disabled>Select role</option>
                    {jobPositionOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1"><label htmlFor="user-role" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Corporate Role</label><select id="user-role" name="role" required value={userForm.role || Role.EMPLOYEE} onChange={e => setUserForm({ ...userForm, role: e.target.value as Role })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800">{roleOptions.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <div className="space-y-1"><label htmlFor="user-work-mode" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Work Mode</label><select id="user-work-mode" name="workMode" required value={userForm.workMode || 'Onsite'} onChange={e => setUserForm({ ...userForm, workMode: e.target.value as User['workMode'] })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800"><option value="Onsite">Onsite</option><option value="Remote">Remote</option></select></div>
                <div className="space-y-1"><label htmlFor="user-grade" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Employee Grade</label><select id="user-grade" name="grade" value={userForm.grade || ''} onChange={e => setUserForm({ ...userForm, grade: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800"><option value="">Select Grade</option>{gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                <div className="space-y-1"><label htmlFor="user-team-lead" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Team Lead (Reporting To)</label><input id="user-team-lead" name="teamLead" type="text" value={userForm.teamLead || ''} onChange={e => setUserForm({ ...userForm, teamLead: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Emergency Contact Info</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1"><label htmlFor="user-ess-name" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Emergency Contact</label><input id="user-ess-name" name="emergencyContactName" type="text" value={essForm.emergencyContactName || ''} onChange={e => setEssForm({ ...essForm, emergencyContactName: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                  <div className="space-y-1"><label htmlFor="user-ess-phone" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Emergency Phone</label><input id="user-ess-phone" name="emergencyContactPhone" type="text" value={essForm.emergencyContactPhone || ''} onChange={e => setEssForm({ ...essForm, emergencyContactPhone: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                  <div className="space-y-1 md:col-span-2"><label htmlFor="user-ess-relation" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Emergency Relation</label><input id="user-ess-relation" name="emergencyContactRelation" type="text" value={essForm.emergencyContactRelation || ''} onChange={e => setEssForm({ ...essForm, emergencyContactRelation: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
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
