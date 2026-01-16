
export enum Role {
  SUPERADMIN = 'SUPERADMIN',
  CEO = 'CEO',
  HR = 'HR',
  EMPLOYEE = 'EMPLOYEE'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  employeeId: string;
  password?: string;
  salary?: number;
  position?: string;
}

export type CheckInStatus = 'Early' | 'On-Time' | 'Late';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  totalHours?: number;
  status?: CheckInStatus;
  overtimeHours?: number;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
}

export interface ESSProfile {
  userId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface UserChecklist {
  userId: string;
  type: 'Onboarding' | 'Offboarding';
  items: ChecklistItem[];
}
