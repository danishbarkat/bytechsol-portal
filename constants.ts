
import { Role, User } from './types';

export const APP_CONFIG = {
  OFFICE_WIFI_NAME: "Office_Main_5G",
  SHIFT_START: "20:00",
  SHIFT_END: "05:00",
  GRACE_PERIOD_MINS: 30,
  OFFICE_ALLOWED_PUBLIC_IPS: ["202.47.33.64"],
  FRIDAY_LATE_EXEMPT_EMPLOYEE_IDS: ["DABA010"],
  FRIDAY_LATE_EXEMPT_CUTOFF: "01:00"
};

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Super Admin', email: 'super@bytechsol.com', password: 'admin123', role: Role.SUPERADMIN, employeeId: 'BS-SUAD001', workMode: 'Onsite', salaryHidden: false },
  { id: '2', name: 'Yasir Bajwa', email: 'yasir@bytechsol.com', password: 'yasir123', role: Role.CEO, employeeId: 'BS-YABA002', workMode: 'Onsite', salaryHidden: false },
  { id: '3', name: 'Tami HR', email: 'tami@bytechsol.com', password: 'tami123', role: Role.HR, employeeId: 'BS-TAHR003', workMode: 'Onsite', salaryHidden: false }
];
