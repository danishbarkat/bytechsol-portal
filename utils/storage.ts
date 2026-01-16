
import { AttendanceRecord, LeaveRequest, ESSProfile, UserChecklist, User } from '../types';

const ATTENDANCE_KEY = 'bytechsol_attendance';
const LEAVES_KEY = 'bytechsol_leaves';
const ESS_KEY = 'bytechsol_ess';
const CHECKLISTS_KEY = 'bytechsol_checklists';
const USERS_KEY = 'bytechsol_users';

export const saveRecords = (records: AttendanceRecord[]) => {
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(records));
};

export const loadRecords = (): AttendanceRecord[] => {
  const data = localStorage.getItem(ATTENDANCE_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveLeaves = (leaves: LeaveRequest[]) => {
  localStorage.setItem(LEAVES_KEY, JSON.stringify(leaves));
};

export const loadLeaves = (): LeaveRequest[] => {
  const data = localStorage.getItem(LEAVES_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveESSProfiles = (profiles: ESSProfile[]) => {
  localStorage.setItem(ESS_KEY, JSON.stringify(profiles));
};

export const loadESSProfiles = (): ESSProfile[] => {
  const data = localStorage.getItem(ESS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveChecklists = (checklists: UserChecklist[]) => {
  localStorage.setItem(CHECKLISTS_KEY, JSON.stringify(checklists));
};

export const loadChecklists = (): UserChecklist[] => {
  const data = localStorage.getItem(CHECKLISTS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveUsers = (users: User[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const loadUsers = (): User[] => {
  const data = localStorage.getItem(USERS_KEY);
  return data ? JSON.parse(data) : [];
};

export const formatDuration = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

export const calculateWeeklyOvertime = (userId: string, records: AttendanceRecord[]): number => {
  // Simple logic: sum hours for the current week and return anything over 40
  const now = new Date();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
  startOfWeek.setHours(0, 0, 0, 0);

  const weeklyHours = records
    .filter(r => r.userId === userId && new Date(r.date) >= startOfWeek)
    .reduce((sum, r) => sum + (r.totalHours || 0), 0);

  return Math.max(0, weeklyHours - 40);
};
