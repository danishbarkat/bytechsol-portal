import { AttendanceRecord, LeaveRequest, User, WorkFromHomeRequest } from '../types';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || '';
const ADMIN_API_SECRET = import.meta.env.VITE_ADMIN_API_SECRET || '';

const adminRequest = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  if (!ADMIN_API_URL) {
    throw new Error('Admin API URL not configured');
  }
  const payload = ADMIN_API_SECRET ? { ...body, adminSecret: ADMIN_API_SECRET } : body;
  const res = await fetch(`${ADMIN_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ADMIN_API_SECRET ? { Authorization: `Bearer ${ADMIN_API_SECRET}` } : {})
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Admin API error (${res.status})`);
  }
  return res.json();
};

export const adminUpsertAttendanceRecord = (record: AttendanceRecord) =>
  adminRequest('/attendance/upsert', { record });

export const adminDeleteAttendanceRecord = (recordId: string) =>
  adminRequest('/attendance/delete', { id: recordId });

export const adminFetchLeaves = () =>
  adminRequest<{ data: LeaveRequest[] }>('/leaves/list', {});

export const adminUpsertLeave = (leave: LeaveRequest) =>
  adminRequest('/leaves/upsert', { leave });

export const adminFetchWfhRequests = () =>
  adminRequest<{ data: WorkFromHomeRequest[] }>('/wfh/list', {});

export const adminUpsertWfhRequest = (request: WorkFromHomeRequest) =>
  adminRequest('/wfh/upsert', { request });

export const adminUpsertUser = (user: User) =>
  adminRequest('/users/upsert', { user });

export const adminDeleteUser = (userId: string) =>
  adminRequest('/users/delete', { userId });
