import { AttendanceRecord, LeaveRequest, ESSProfile, UserChecklist, User, Role } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';

const ATTENDANCE_KEY = 'bytechsol_attendance';
const LEAVES_KEY = 'bytechsol_leaves';
const ESS_KEY = 'bytechsol_ess';
const CHECKLISTS_KEY = 'bytechsol_checklists';
const USERS_KEY = 'bytechsol_users';

const safeJsonParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const loadLocal = <T>(key: string, fallback: T): T =>
  safeJsonParse<T>(localStorage.getItem(key), fallback);

const saveLocal = <T>(key: string, data: T) => {
  localStorage.setItem(key, JSON.stringify(data));
};

const pickValue = <T>(row: Record<string, any>, keys: string[], fallback: T): T => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return fallback;
};

const mapUserFromDb = (row: Record<string, any>): User => ({
  id: String(pickValue(row, ['id'], '')),
  name: String(pickValue(row, ['name'], '')),
  firstName: pickValue(row, ['first_name', 'firstName'], undefined),
  lastName: pickValue(row, ['last_name', 'lastName'], undefined),
  dob: pickValue(row, ['dob'], undefined),
  phone: pickValue(row, ['phone'], undefined),
  email: String(pickValue(row, ['email'], '')),
  role: pickValue(row, ['role'], Role.EMPLOYEE) as Role,
  employeeId: String(pickValue(row, ['employee_id', 'employeeId'], '')),
  password: pickValue(row, ['password'], undefined),
  salary: pickValue(row, ['salary'], undefined),
  basicSalary: pickValue(row, ['basic_salary', 'basicSalary'], undefined),
  allowances: pickValue(row, ['allowances'], undefined),
  salaryHidden: pickValue(row, ['salary_hidden', 'salaryHidden'], undefined),
  pin: pickValue(row, ['pin_code', 'pin', 'pinCode'], undefined),
  profileImage: pickValue(row, ['profile_image', 'profileImage'], undefined),
  workMode: pickValue(row, ['work_mode', 'workMode'], undefined),
  grade: pickValue(row, ['grade'], undefined),
  teamLead: pickValue(row, ['team_lead', 'teamLead'], undefined),
  position: pickValue(row, ['position'], undefined)
});

const mapUserToDb = (user: User) => ({
  id: user.id,
  name: user.name,
  first_name: user.firstName ?? null,
  last_name: user.lastName ?? null,
  dob: user.dob ?? null,
  phone: user.phone ?? null,
  email: user.email,
  role: user.role,
  employee_id: user.employeeId,
  password: user.password ?? null,
  salary: user.salary ?? null,
  basic_salary: user.basicSalary ?? null,
  allowances: user.allowances ?? null,
  salary_hidden: user.salaryHidden ?? null,
  pin_code: user.pin ?? null,
  profile_image: user.profileImage ?? null,
  work_mode: user.workMode ?? null,
  grade: user.grade ?? null,
  team_lead: user.teamLead ?? null,
  position: user.position ?? null
});

const mapAttendanceFromDb = (row: Record<string, any>): AttendanceRecord => ({
  id: String(pickValue(row, ['id'], '')),
  userId: String(pickValue(row, ['user_id', 'userId'], '')),
  userName: String(pickValue(row, ['user_name', 'userName'], '')),
  date: String(pickValue(row, ['date'], '')),
  checkIn: String(pickValue(row, ['check_in', 'checkIn'], '')),
  checkOut: pickValue(row, ['check_out', 'checkOut'], undefined),
  totalHours: pickValue(row, ['total_hours', 'totalHours'], undefined),
  status: pickValue(row, ['status'], undefined),
  overtimeHours: pickValue(row, ['overtime_hours', 'overtimeHours'], undefined)
});

const mapAttendanceToDb = (record: AttendanceRecord) => ({
  id: record.id,
  user_id: record.userId,
  user_name: record.userName,
  date: record.date,
  check_in: record.checkIn,
  check_out: record.checkOut ?? null,
  total_hours: Number.isFinite(Number(record.totalHours)) ? Number(record.totalHours) : null,
  status: record.status ?? null,
  overtime_hours: Number.isFinite(Number(record.overtimeHours)) ? Number(record.overtimeHours) : null
});

const mapLeaveFromDb = (row: Record<string, any>): LeaveRequest => ({
  id: String(pickValue(row, ['id'], '')),
  userId: String(pickValue(row, ['user_id', 'userId'], '')),
  userName: String(pickValue(row, ['user_name', 'userName'], '')),
  startDate: String(pickValue(row, ['start_date', 'startDate'], '')),
  endDate: String(pickValue(row, ['end_date', 'endDate'], '')),
  reason: String(pickValue(row, ['reason'], '')),
  status: pickValue(row, ['status'], 'Pending'),
  submittedAt: String(pickValue(row, ['submitted_at', 'submittedAt'], '')),
  isPaid: pickValue(row, ['is_paid', 'isPaid'], undefined)
});

const mapLeaveToDb = (leave: LeaveRequest) => ({
  id: leave.id,
  user_id: leave.userId,
  user_name: leave.userName,
  start_date: leave.startDate,
  end_date: leave.endDate,
  reason: leave.reason,
  status: leave.status,
  submitted_at: leave.submittedAt,
  is_paid: leave.isPaid ?? null
});

const mapEssFromDb = (row: Record<string, any>): ESSProfile => ({
  userId: String(pickValue(row, ['user_id', 'userId'], '')),
  emergencyContactName: String(pickValue(row, ['emergency_contact_name', 'emergencyContactName'], '')),
  emergencyContactPhone: String(pickValue(row, ['emergency_contact_phone', 'emergencyContactPhone'], '')),
  emergencyContactRelation: String(pickValue(row, ['emergency_contact_relation', 'emergencyContactRelation'], ''))
});

const mapEssToDb = (profile: ESSProfile) => ({
  user_id: profile.userId,
  emergency_contact_name: profile.emergencyContactName,
  emergency_contact_phone: profile.emergencyContactPhone,
  emergency_contact_relation: profile.emergencyContactRelation
});

const parseChecklistItems = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const mapChecklistFromDb = (row: Record<string, any>): UserChecklist => ({
  userId: String(pickValue(row, ['user_id', 'userId'], '')),
  type: pickValue(row, ['type'], 'Onboarding'),
  items: parseChecklistItems(pickValue(row, ['items'], []))
});

const mapChecklistToDb = (checklist: UserChecklist) => ({
  user_id: checklist.userId,
  type: checklist.type,
  items: checklist.items
});

const logSupabaseError = (scope: string, error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[supabase] ${scope} failed`, error);
};

export const loadRecords = async (): Promise<AttendanceRecord[]> => {
  const local = loadLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []);
  if (!isSupabaseConfigured || !supabase) return local;
  const { data, error } = await supabase.from('attendance_records').select('*');
  if (error || !data) {
    logSupabaseError('loadRecords', error);
    return local;
  }
  const mapped = data.map(mapAttendanceFromDb);
  saveLocal(ATTENDANCE_KEY, mapped);
  return mapped;
};

export const saveRecords = async (records: AttendanceRecord[]) => {
  saveLocal(ATTENDANCE_KEY, records);
  if (!isSupabaseConfigured || !supabase) return;
  const payload = records
    .map(mapAttendanceToDb)
    .filter(
      record =>
        record.id &&
        record.user_id &&
        record.user_name &&
        record.date &&
        record.check_in
    );
  if (payload.length === 0) return;
  const { error } = await supabase.from('attendance_records').upsert(payload, { onConflict: 'id' });
  if (error) {
    logSupabaseError('saveRecords', error);
  }
};

export const loadLeaves = async (): Promise<LeaveRequest[]> => {
  const local = loadLocal<LeaveRequest[]>(LEAVES_KEY, []);
  if (!isSupabaseConfigured || !supabase) return local;
  const { data, error } = await supabase.from('leave_requests').select('*');
  if (error || !data) {
    logSupabaseError('loadLeaves', error);
    return local;
  }
  const mapped = data.map(mapLeaveFromDb);
  saveLocal(LEAVES_KEY, mapped);
  return mapped;
};

export const saveLeaves = async (leaves: LeaveRequest[]) => {
  saveLocal(LEAVES_KEY, leaves);
  if (!isSupabaseConfigured || !supabase) return;
  const payload = leaves.map(mapLeaveToDb);
  const { error } = await supabase.from('leave_requests').upsert(payload, { onConflict: 'id' });
  if (error) {
    logSupabaseError('saveLeaves', error);
  }
};

export const loadESSProfiles = async (): Promise<ESSProfile[]> => {
  const local = loadLocal<ESSProfile[]>(ESS_KEY, []);
  if (!isSupabaseConfigured || !supabase) return local;
  const { data, error } = await supabase.from('ess_profiles').select('*');
  if (error || !data) {
    logSupabaseError('loadESSProfiles', error);
    return local;
  }
  const mapped = data.map(mapEssFromDb);
  saveLocal(ESS_KEY, mapped);
  return mapped;
};

export const saveESSProfiles = async (profiles: ESSProfile[]) => {
  saveLocal(ESS_KEY, profiles);
  if (!isSupabaseConfigured || !supabase) return;
  const payload = profiles.map(mapEssToDb);
  const { error } = await supabase.from('ess_profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    logSupabaseError('saveESSProfiles', error);
  }
};

export const loadChecklists = async (): Promise<UserChecklist[]> => {
  const local = loadLocal<UserChecklist[]>(CHECKLISTS_KEY, []);
  if (!isSupabaseConfigured || !supabase) return local;
  const { data, error } = await supabase.from('checklists').select('*');
  if (error || !data) {
    logSupabaseError('loadChecklists', error);
    return local;
  }
  const mapped = data.map(mapChecklistFromDb);
  saveLocal(CHECKLISTS_KEY, mapped);
  return mapped;
};

export const saveChecklists = async (checklists: UserChecklist[]) => {
  saveLocal(CHECKLISTS_KEY, checklists);
  if (!isSupabaseConfigured || !supabase) return;
  const payload = checklists.map(mapChecklistToDb);
  const { error } = await supabase.from('checklists').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    logSupabaseError('saveChecklists', error);
  }
};

export const loadUsers = async (): Promise<User[]> => {
  const local = loadLocal<User[]>(USERS_KEY, []);
  if (!isSupabaseConfigured || !supabase) return local;
  const { data, error } = await supabase.from('users').select('*');
  if (error || !data) {
    logSupabaseError('loadUsers', error);
    return local;
  }
  const mapped = data.map(mapUserFromDb);
  saveLocal(USERS_KEY, mapped);
  return mapped;
};

export const saveUsers = async (users: User[]) => {
  saveLocal(USERS_KEY, users);
  if (!isSupabaseConfigured || !supabase) return;
  const payload = users.map(mapUserToDb);
  const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
  if (error) {
    logSupabaseError('saveUsers', error);
  }
};

export const updateCredentialsByEmployeeId = async (
  employeeId: string,
  password?: string,
  pin?: string | null
) => {
  if (!isSupabaseConfigured || !supabase) return;
  const updates: Record<string, string | null> = {};
  if (typeof password === 'string') {
    updates.password = password;
  }
  if (pin !== undefined) {
    updates.pin_code = pin;
  }
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('employee_id', employeeId);
  if (error) {
    logSupabaseError('updateCredentialsByEmployeeId', error);
  }
};

export const fetchRecordsRemote = async (): Promise<AttendanceRecord[]> => {
  if (!isSupabaseConfigured || !supabase) {
    return loadLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []);
  }
  const { data, error } = await supabase.from('attendance_records').select('*');
  if (error || !data) {
    logSupabaseError('fetchRecordsRemote', error);
    return loadLocal<AttendanceRecord[]>(ATTENDANCE_KEY, []);
  }
  const mapped = data.map(mapAttendanceFromDb);
  saveLocal(ATTENDANCE_KEY, mapped);
  return mapped;
};

export const fetchLeavesRemote = async (): Promise<LeaveRequest[]> => {
  if (!isSupabaseConfigured || !supabase) {
    return loadLocal<LeaveRequest[]>(LEAVES_KEY, []);
  }
  const { data, error } = await supabase.from('leave_requests').select('*');
  if (error || !data) {
    logSupabaseError('fetchLeavesRemote', error);
    return loadLocal<LeaveRequest[]>(LEAVES_KEY, []);
  }
  const mapped = data.map(mapLeaveFromDb);
  saveLocal(LEAVES_KEY, mapped);
  return mapped;
};

export const fetchEssProfilesRemote = async (): Promise<ESSProfile[]> => {
  if (!isSupabaseConfigured || !supabase) {
    return loadLocal<ESSProfile[]>(ESS_KEY, []);
  }
  const { data, error } = await supabase.from('ess_profiles').select('*');
  if (error || !data) {
    logSupabaseError('fetchEssProfilesRemote', error);
    return loadLocal<ESSProfile[]>(ESS_KEY, []);
  }
  const mapped = data.map(mapEssFromDb);
  saveLocal(ESS_KEY, mapped);
  return mapped;
};

export const fetchChecklistsRemote = async (): Promise<UserChecklist[]> => {
  if (!isSupabaseConfigured || !supabase) {
    return loadLocal<UserChecklist[]>(CHECKLISTS_KEY, []);
  }
  const { data, error } = await supabase.from('checklists').select('*');
  if (error || !data) {
    logSupabaseError('fetchChecklistsRemote', error);
    return loadLocal<UserChecklist[]>(CHECKLISTS_KEY, []);
  }
  const mapped = data.map(mapChecklistFromDb);
  saveLocal(CHECKLISTS_KEY, mapped);
  return mapped;
};

export const fetchUsersRemote = async (): Promise<User[]> => {
  if (!isSupabaseConfigured || !supabase) {
    return loadLocal<User[]>(USERS_KEY, []);
  }
  const { data, error } = await supabase.from('users').select('*');
  if (error || !data) {
    logSupabaseError('fetchUsersRemote', error);
    return loadLocal<User[]>(USERS_KEY, []);
  }
  const mapped = data.map(mapUserFromDb);
  saveLocal(USERS_KEY, mapped);
  return mapped;
};

export const subscribeToTableChanges = (table: string, onChange: () => void) => {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase
    .channel(`realtime:${table}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

export const deleteUserData = async (userId: string) => {
  if (!isSupabaseConfigured || !supabase) return;
  const tasks = [
    supabase.from('attendance_records').delete().eq('user_id', userId),
    supabase.from('leave_requests').delete().eq('user_id', userId),
    supabase.from('ess_profiles').delete().eq('user_id', userId),
    supabase.from('checklists').delete().eq('user_id', userId),
    supabase.from('users').delete().eq('id', userId)
  ];
  await Promise.all(tasks);
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

  const weeklyRecords = records
    .filter(r => r.userId === userId && new Date(r.date) >= startOfWeek);
  const overtimeFromRecords = weeklyRecords.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
  if (overtimeFromRecords > 0) {
    return overtimeFromRecords;
  }
  const weeklyHours = weeklyRecords
    .reduce((sum, r) => sum + (r.totalHours || 0), 0);

  return Math.max(0, weeklyHours - 40);
};
