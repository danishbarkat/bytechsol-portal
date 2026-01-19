
export enum Role {
  SUPERADMIN = 'SUPERADMIN',
  CEO = 'CEO',
  HR = 'HR',
  EMPLOYEE = 'EMPLOYEE'
}

export interface User {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  phone?: string;
  email: string;
  role: Role;
  employeeId: string;
  password?: string;
  salary?: number;
  basicSalary?: number;
  allowances?: number;
  salaryHidden?: boolean;
  workMode?: 'Onsite' | 'Remote';
  grade?: string;
  teamLead?: string;
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
  isPaid?: boolean;
}

export interface ESSProfile {
  userId: string;
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
