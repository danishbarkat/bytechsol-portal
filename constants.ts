
import { Role, User } from './types';

export const APP_CONFIG = {
  OFFICE_WIFI_NAME: "Office_Main_5G",
  SHIFT_START: "20:00",
  SHIFT_END: "05:00",
  GRACE_PERIOD_MINS: 30,
  CHECKOUT_EARLY_RELAXATION_MINS: 30,
  AUTO_CHECKOUT_ENABLED: false,
  AUTO_CHECKOUT_EXEMPT_ROLES: [Role.EMPLOYEE],
  CHECKIN_OVERRIDE_EMPLOYEE_IDS: ["MUUR008"],
  OFFICE_ALLOWED_PUBLIC_IPS: ["202.47.33.64", "72.255.37.120"],
  REMOTE_LOGIN_EMPLOYEE_IDS: ["NOUL014", "MEHA015", "WAUD013"],
  FRIDAY_LATE_EXEMPT_EMPLOYEE_IDS: ["DABA010"],
  FRIDAY_LATE_EXEMPT_CUTOFF: "01:00",
  PROFILE_IMAGE_BUCKET: "avatars",
  PROFILE_IMAGE_MAX_BYTES: 3 * 1024 * 1024
};

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Super Admin', email: 'super@bytechsol.com', password: 'admin123', role: Role.SUPERADMIN, employeeId: 'BS-SUAD001', workMode: 'Onsite', salaryHidden: false },
  { id: '2', name: 'Yasir Bajwa', email: 'yasir@bytechsol.com', password: 'yasir123', role: Role.CEO, employeeId: 'BS-YABA002', workMode: 'Onsite', salaryHidden: false },
  { id: '3', name: 'Tami HR', email: 'tami@bytechsol.com', password: 'tami123', role: Role.HR, employeeId: 'BS-TAHR003', workMode: 'Onsite', salaryHidden: false }
];
