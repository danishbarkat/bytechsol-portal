
import { Role } from './types';

export const APP_CONFIG = {
  OFFICE_WIFI_NAME: "Office_Main_5G",
  SHIFT_START: "20:00",
  SHIFT_END: "05:00",
  GRACE_PERIOD_MINS: 15
};

export const MOCK_USERS = [
  { id: '1', name: 'Super Admin', email: 'super@bytechsol.com', password: 'admin123', role: Role.SUPERADMIN, employeeId: 'BS-001' },
  { id: '2', name: 'Zain CEO', email: 'ceo@bytechsol.com', password: 'ceo123', role: Role.CEO, employeeId: 'BS-002' },
  { id: '3', name: 'Sara HR', email: 'hr@bytechsol.com', password: 'hr123', role: Role.HR, employeeId: 'BS-003' },
  { id: '4', name: 'John Dev', email: 'john@bytechsol.com', password: 'user123', role: Role.EMPLOYEE, employeeId: 'BS-101' },
  { id: '5', name: 'Jane Designer', email: 'jane@bytechsol.com', password: 'user123', role: Role.EMPLOYEE, employeeId: 'BS-102' }
];
