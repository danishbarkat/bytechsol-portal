
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, AttendanceRecord, Role, CheckInStatus, LeaveRequest, ESSProfile, UserChecklist, WorkFromHomeRequest, AppNotification } from './types';
import { APP_CONFIG, MOCK_USERS } from './constants';
import logoUrl from './asset/public/logo.svg';
import {
  loadRecords,
  saveRecords,
  saveRecordsLocal,
  loadLeaves,
  saveLeaves,
  loadESSProfiles,
  saveESSProfiles,
  loadChecklists,
  saveChecklists,
  loadUsers,
  saveUsers,
  loadWfhRequests,
  saveWfhRequests,
  fetchRecordsRemote,
  fetchLeavesRemote,
  fetchEssProfilesRemote,
  fetchChecklistsRemote,
  fetchUsersRemote,
  subscribeToTableChanges,
  deleteUserData,
  deleteAttendanceRecord,
  upsertAttendanceRecord,
  updateCredentialsByEmployeeId
} from './utils/storage';
import {
  adminUpsertAttendanceRecord,
  adminDeleteAttendanceRecord,
  adminFetchLeaves,
  adminUpsertLeave,
  adminFetchWfhRequests,
  adminUpsertWfhRequest,
  adminUpsertUser,
  adminDeleteUser
} from './utils/adminApi';
import { isSupabaseConfigured } from './utils/supabase';
import { addDaysToDateString, buildZonedISOString, getLocalDateString, getShiftAdjustedMinutes, getShiftDateString, getWeekdayLabel, getLocalTimeMinutes, getZonedNowISOString } from './utils/dates';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';

const SAVED_SESSION_KEY = 'bytechsol_saved_session';
const SAVED_LOGIN_KEY = 'bytechsol_saved_login';
const NOTIFICATION_STORAGE_KEY = 'bytechsol_notifications';
const ATTENDANCE_STORAGE_KEY = 'bytechsol_attendance';
const CACHE_VERSION_KEY = 'bytechsol_cache_version';

const isSameMonth = (dateStr: string, target: Date): boolean => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
};

const normalizeEmployeeId = (value: string): string => {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '');
  const withoutPrefix = cleaned.replace(/^BS-/, '');
  return `BS-${withoutPrefix}`;
};

const normalizeEmail = (value: string | undefined): string =>
  (value || '').trim().toLowerCase();

const extractEmployeeSuffix = (value: string): string | null => {
  const match = normalizeEmployeeId(value).match(/(\d{3})$/);
  return match ? match[1] : null;
};

const computeTotalHours = (checkInIso: string, checkOutIso: string): number => {
  const checkInTime = new Date(checkInIso);
  const checkOutTime = new Date(checkOutIso);
  const diffHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
  if (diffHours >= 0 && diffHours <= 18) return diffHours;
  const checkInMinutes = getLocalTimeMinutes(checkInTime);
  const checkOutMinutes = getLocalTimeMinutes(checkOutTime);
  const adjustedCheckOut = checkOutMinutes < checkInMinutes
    ? checkOutMinutes + 24 * 60
    : checkOutMinutes;
  return Math.max(0, (adjustedCheckOut - checkInMinutes) / 60);
};

const computeOvertimeHours = (checkInIso: string, checkOutIso: string): number => {
  const checkInTime = new Date(checkInIso);
  const checkOutTime = new Date(checkOutIso);
  const [startHour, startMinute] = APP_CONFIG.SHIFT_START.split(':').map(Number);
  const [endHour, endMinute] = APP_CONFIG.SHIFT_END.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const isOvernight = endMinutes <= startMinutes;
  const adjustedEnd = isOvernight ? endMinutes + 24 * 60 : endMinutes;
  const checkInAdjusted = getShiftAdjustedMinutes(
    checkInTime,
    APP_CONFIG.SHIFT_START,
    APP_CONFIG.SHIFT_END
  ).currentMinutes;
  const checkOutMinutes = getLocalTimeMinutes(checkOutTime);
  const adjustedCheckOut = isOvernight && checkOutMinutes < startMinutes
    ? checkOutMinutes + 24 * 60
    : checkOutMinutes;
  const earlyMinutes = Math.max(0, startMinutes - checkInAdjusted);
  const lateMinutes = Math.max(0, adjustedCheckOut - adjustedEnd);
  const overtimeMinutes = earlyMinutes + lateMinutes;
  return overtimeMinutes > 0 ? overtimeMinutes / 60 : 0;
};

const getShiftEndISOString = (shiftDate: string): string => {
  if (!shiftDate) return '';
  const [startHour, startMinute] = APP_CONFIG.SHIFT_START.split(':').map(Number);
  const [endHour, endMinute] = APP_CONFIG.SHIFT_END.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const endDate = endMinutes <= startMinutes ? addDaysToDateString(shiftDate, 1) : shiftDate;
  return buildZonedISOString(endDate, APP_CONFIG.SHIFT_END);
};

const getRecordUserRole = (record: AttendanceRecord, userList: User[]): Role | null => {
  if (userList.length === 0) return null;
  const direct = userList.find(u => u.id === record.userId);
  if (direct) return direct.role;
  const normalizedId = normalizeEmployeeId(String(record.userId || ''));
  const byEmployeeId = userList.find(u => u.employeeId && normalizeEmployeeId(u.employeeId) === normalizedId);
  if (byEmployeeId) return byEmployeeId.role;
  const recordName = (record.userName || '').trim().toLowerCase();
  if (recordName) {
    const byName = userList.find(u => (u.name || '').trim().toLowerCase() === recordName);
    if (byName) return byName.role;
  }
  return null;
};

const isAutoCheckoutExempt = (record: AttendanceRecord, userList: User[]): boolean => {
  const exemptRoles = APP_CONFIG.AUTO_CHECKOUT_EXEMPT_ROLES || [];
  if (exemptRoles.length === 0) return false;
  const role = getRecordUserRole(record, userList);
  if (!role) return true;
  return exemptRoles.includes(role);
};

const autoCheckoutStaleRecords = (list: AttendanceRecord[], userList: User[]) => {
  if (!APP_CONFIG.AUTO_CHECKOUT_ENABLED) {
    return { normalized: list, changed: false };
  }
  const currentShiftDate = getShiftDateString(new Date(), APP_CONFIG.SHIFT_START, APP_CONFIG.SHIFT_END);
  if (!currentShiftDate) {
    return { normalized: list, changed: false };
  }
  const latestOpenByUser = new Map<string, AttendanceRecord>();
  list.forEach(record => {
    if (!record.checkIn || record.checkOut) return;
    if (isAutoCheckoutExempt(record, userList)) return;
    const key = record.userId || record.userName || record.id;
    const existing = latestOpenByUser.get(key);
    if (!existing) {
      latestOpenByUser.set(key, record);
      return;
    }
    const existingTime = new Date(existing.checkIn).getTime();
    const recordTime = new Date(record.checkIn).getTime();
    if (Number.isFinite(recordTime) && (!Number.isFinite(existingTime) || recordTime > existingTime)) {
      latestOpenByUser.set(key, record);
    }
  });

  let changed = false;
  const normalized = list.map(record => {
    if (!record.checkIn || record.checkOut) return record;
    if (isAutoCheckoutExempt(record, userList)) return record;
    const key = record.userId || record.userName || record.id;
    const latestOpen = latestOpenByUser.get(key);
    const recordShiftDate = getShiftDateString(new Date(record.checkIn), APP_CONFIG.SHIFT_START, APP_CONFIG.SHIFT_END);
    if (!recordShiftDate) return record;
    const isSuperseded = latestOpen && latestOpen.id !== record.id;
    const isStale = recordShiftDate < currentShiftDate;
    if (!isSuperseded && !isStale) return record;
    const checkOutIso = getShiftEndISOString(recordShiftDate);
    if (!checkOutIso) return record;
    const totalHours = computeTotalHours(record.checkIn, checkOutIso);
    const overtimeHours = computeOvertimeHours(record.checkIn, checkOutIso);
    changed = true;
    return {
      ...record,
      checkOut: checkOutIso,
      totalHours,
      overtimeHours: overtimeHours > 0 ? overtimeHours : undefined
    };
  });
  return { normalized, changed };
};

const normalizeOvertimeRecords = (list: AttendanceRecord[], userList: User[] = []) => {
  const { normalized: autoNormalized, changed: autoChanged } = autoCheckoutStaleRecords(list, userList);
  let changed = autoChanged;
  const normalized = autoNormalized.map(record => {
    if (!record.checkIn || !record.checkOut) return record;
    const computedOvertime = computeOvertimeHours(record.checkIn, record.checkOut);
    const nextOvertime = computedOvertime > 0 ? computedOvertime : undefined;
    const currentOvertime = Number.isFinite(record.overtimeHours) ? record.overtimeHours : 0;
    const computedTotal = computeTotalHours(record.checkIn, record.checkOut);
    const currentTotal = Number.isFinite(record.totalHours) ? record.totalHours : 0;
    const needsOvertime = Math.abs((nextOvertime ?? 0) - currentOvertime) > 0.01;
    const needsTotal = Math.abs(computedTotal - currentTotal) > 0.01;
    if (needsOvertime || needsTotal) {
      changed = true;
      return { ...record, overtimeHours: nextOvertime, totalHours: computedTotal };
    }
    return record;
  });
  return { normalized, changed };
};

const normalizeRecordUserIds = (list: AttendanceRecord[], userList: User[]) => {
  if (userList.length === 0) return { normalized: list, changed: false };
  let changed = false;
  const normalized = list.map(record => {
    if (!record.userId) return record;
    if (userList.some(u => u.id === record.userId)) return record;
    const normalizedRecordId = normalizeEmployeeId(String(record.userId));
    const byEmployeeId = userList.find(
      u => u.employeeId && normalizeEmployeeId(u.employeeId) === normalizedRecordId
    );
    if (byEmployeeId) {
      changed = true;
      return {
        ...record,
        userId: byEmployeeId.id,
        userName: byEmployeeId.name || record.userName
      };
    }
    const recordName = (record.userName || '').trim().toLowerCase();
    if (recordName) {
      const byName = userList.find(u => (u.name || '').trim().toLowerCase() === recordName);
      if (byName) {
        changed = true;
        return {
          ...record,
          userId: byName.id,
          userName: byName.name || record.userName
        };
      }
    }
    return record;
  });
  return { normalized, changed };
};

const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    ctx.resume?.();
    const now = ctx.currentTime;
    const tones = [
      { freq: 740, dur: 0.12 },
      { freq: 980, dur: 0.12 },
      { freq: 740, dur: 0.16 }
    ];
    let cursor = now;
    tones.forEach(({ freq, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, cursor);
      gain.gain.setValueAtTime(0.0001, cursor);
      gain.gain.exponentialRampToValueAtTime(0.18, cursor + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(cursor);
      osc.stop(cursor + dur);
      cursor += dur + 0.05;
    });
    ctx.onstatechange = () => {
      if (ctx.state === 'closed') return;
      if (ctx.currentTime > now + 0.6) {
        ctx.close();
      }
    };
  } catch {
    // Ignore audio failures.
  }
};

const hasNumber = (value: unknown) => Number.isFinite(Number(value));

const getMissingFields = (target: User, profile?: ESSProfile, options?: { includePin?: boolean }) => {
  const includePin = options?.includePin ?? true;
  const missing: string[] = [];
  if (!target.firstName?.trim()) missing.push('First Name');
  if (!target.lastName?.trim()) missing.push('Last Name');
  if (!target.dob?.trim()) missing.push('Date of Birth');
  if (!target.phone?.trim()) missing.push('Phone Number');
  if (!target.email?.trim()) missing.push('Email Address');
  if (!target.password?.trim()) missing.push('Security Key (Password)');
  if (includePin && target.role !== Role.HR && (!target.pin?.trim() || target.pin.trim().length !== 4)) {
    missing.push('4 Digit PIN');
  }
  if (!target.employeeId?.trim()) missing.push('Employee ID');
  if (!hasNumber(target.basicSalary)) missing.push('Basic Salary');
  if (!hasNumber(target.allowances)) missing.push('Allowances');
  if (!target.position?.trim()) missing.push('Job Position');
  if (!target.role) missing.push('Corporate Role');
  if (!target.workMode) missing.push('Work Mode');
  if (!target.grade?.trim()) missing.push('Employee Grade');
  if (!target.teamLead?.trim()) missing.push('Team Lead');
  if (!profile?.emergencyContactName?.trim()) missing.push('Emergency Contact');
  if (!profile?.emergencyContactPhone?.trim()) missing.push('Emergency Phone');
  if (!profile?.emergencyContactRelation?.trim()) missing.push('Emergency Relation');
  return missing;
};

const ensureCoreUsers = (list: User[]) => {
  let changed = false;
  const merged = [...list];
  const hasRole = (role: Role) => merged.some(u => u.role === role);

  MOCK_USERS.forEach(core => {
    if (hasRole(core.role)) return;
    const coreEmployeeId = normalizeEmployeeId(core.employeeId || '');
    const coreEmail = normalizeEmail(core.email);
    const index = merged.findIndex(u => {
      if (u.id && u.id === core.id) return true;
      if (u.employeeId && normalizeEmployeeId(u.employeeId) === coreEmployeeId) return true;
      if (u.email && normalizeEmail(u.email) === coreEmail) return true;
      return false;
    });
    if (index !== -1) {
      const existing = merged[index];
      const next = { ...existing };
      if (next.role !== core.role) {
        next.role = core.role;
        changed = true;
      }
      if (!next.employeeId && core.employeeId) {
        next.employeeId = core.employeeId;
        changed = true;
      }
      if (!next.email && core.email) {
        next.email = core.email;
        changed = true;
      }
      if (!next.name && core.name) {
        next.name = core.name;
        changed = true;
      }
      if (!next.password && core.password) {
        next.password = core.password;
        changed = true;
      }
      if (!next.workMode && core.workMode) {
        next.workMode = core.workMode;
        changed = true;
      }
      if (next.salaryHidden === undefined && core.salaryHidden !== undefined) {
        next.salaryHidden = core.salaryHidden;
        changed = true;
      }
      merged[index] = next;
      return;
    }
    merged.push(core);
    changed = true;
  });

  return { merged, changed };
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [employeeIdInput, setEmployeeIdInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [requestEmployeeId, setRequestEmployeeId] = useState('');
  const [requestName, setRequestName] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestStartDate, setRequestStartDate] = useState(() => getLocalDateString(new Date()));
  const [requestEndDate, setRequestEndDate] = useState(() => getLocalDateString(new Date()));
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [essProfiles, setEssProfiles] = useState<ESSProfile[]>([]);
  const [checklists, setChecklists] = useState<UserChecklist[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [wfhRequests, setWfhRequests] = useState<WorkFromHomeRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isWifiConnected, setIsWifiConnected] = useState(false);
  const [ipStatus, setIpStatus] = useState<'checking' | 'allowed' | 'blocked'>('checking');
  const [publicIp, setPublicIp] = useState<string | null>(null);
  const remoteLoginIds = (APP_CONFIG.REMOTE_LOGIN_EMPLOYEE_IDS || []).map(normalizeEmployeeId);
  const checkinOverrideIds = (APP_CONFIG.CHECKIN_OVERRIDE_EMPLOYEE_IDS || []).map(normalizeEmployeeId);
  const usersRef = useRef<User[]>([]);

  useEffect(() => {
    const version = APP_CONFIG.CACHE_VERSION || '1';
    const stored = localStorage.getItem(CACHE_VERSION_KEY);
    if (stored !== version) {
      localStorage.removeItem(ATTENDANCE_STORAGE_KEY);
      localStorage.setItem(CACHE_VERSION_KEY, version);
    }
  }, []);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    if (!requestEmployeeId.trim() || requestName.trim()) return;
    const normalizedId = normalizeEmployeeId(requestEmployeeId);
    const targetUser = users.find(u => normalizeEmployeeId(u.employeeId || '') === normalizedId);
    if (targetUser?.name) {
      setRequestName(targetUser.name);
    }
  }, [requestEmployeeId, requestName, users]);
  const addOrUpdateNotification = useCallback((nextNotification: AppNotification, forceUnread = false) => {
    setNotifications(prev => {
      const index = prev.findIndex(n => n.id === nextNotification.id);
      if (index === -1) {
        return [...prev, nextNotification];
      }
      const existing = prev[index];
      const updated = [...prev];
      updated[index] = {
        ...existing,
        ...nextNotification,
        read: forceUnread ? false : existing.read
      };
      return updated;
    });
  }, [user?.id]);

  const markNotificationRead = useCallback((notificationId: string) => {
    setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    if (!user) return;
    setNotifications(prev => prev.map(n => (n.userId === user.id ? { ...n, read: true } : n)));
  }, [user]);

  const prevUnreadRef = useRef(0);
  useEffect(() => {
    if (!user) return;
    const unreadCount = notifications.filter(n => n.userId === user.id && !n.read).length;
    if (unreadCount > prevUnreadRef.current) {
      playNotificationSound();
    }
    prevUnreadRef.current = unreadCount;
  }, [notifications, user]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const [recordsData, leavesData, essData, checklistData, usersData, wfhData] = await Promise.all([
        loadRecords(),
        loadLeaves(),
        loadESSProfiles(),
        loadChecklists(),
        loadUsers(),
        loadWfhRequests()
      ]);
      if (!active) return;
      const { normalized, changed } = normalizeOvertimeRecords(recordsData, usersData);
      setRecords(normalized);
      if (changed) {
        saveRecordsLocal(normalized);
      }
      setLeaves(leavesData);
      setEssProfiles(essData);
      setChecklists(checklistData);
      setWfhRequests(wfhData);

      const legacyEmployeeIds = new Set(['BS-ZACE002', 'BS-SAHR003', 'BS-JODE004', 'BS-JADE005']);
      const hasLegacyUsers = usersData.some(u => legacyEmployeeIds.has(u.employeeId));
      const useMockDefaults = usersData.length === 0 || hasLegacyUsers;
      const baseUsers = useMockDefaults ? MOCK_USERS : usersData;
      const { merged, changed: coreChanged } = ensureCoreUsers(baseUsers);
      setUsers(merged);
      if (useMockDefaults || coreChanged) {
        void saveUsers(merged);
      }
    };
    init();

    const checkWifi = () => {
      const nav = navigator as any;
      const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
      setIsWifiConnected(conn ? (conn.type === 'wifi' || conn.effectiveType === '4g') : true);
    };

    checkWifi();
    window.addEventListener('online', checkWifi);
    return () => {
      active = false;
      window.removeEventListener('online', checkWifi);
    };
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AppNotification[];
      if (Array.isArray(parsed)) {
        setNotifications(parsed);
      }
    } catch {
      localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    if (users.length === 0) return;
    setNotifications(prev => {
      const existingMap = new Map<string, AppNotification>(
        prev.map(n => [n.id, n] as [string, AppNotification])
      );
      const staticNotifications = prev.filter(n => !n.autoGenerated);
      const hrUsers = users.filter(u => u.role === Role.HR);
      const autoNotifications: AppNotification[] = [];
      users
        .filter(u => u.role !== Role.SUPERADMIN)
        .forEach(target => {
          const profile = essProfiles.find(p => p.userId === target.id);
          const missingForEmployee = getMissingFields(target, profile, { includePin: false });
          const missingForHr = getMissingFields(target, profile, { includePin: true });
          if (missingForEmployee.length > 0) {
            const selfId = `profile-incomplete:${target.id}`;
            const existingSelf = existingMap.get(selfId);
            autoNotifications.push({
              id: selfId,
              userId: target.id,
              title: 'Profile incomplete',
              message: `Missing: ${missingForEmployee.join(', ')}`,
              createdAt: existingSelf?.createdAt || new Date().toISOString(),
              read: false,
              autoGenerated: true
            });
          }
          if (missingForHr.length > 0) {
            hrUsers.forEach(hr => {
              if (hr.id === target.id) return;
              const hrId = `hr-incomplete:${hr.id}:${target.id}`;
              const existingHr = existingMap.get(hrId);
              autoNotifications.push({
                id: hrId,
                userId: hr.id,
                title: 'Employee details incomplete',
                message: `${target.name} (${target.employeeId}) missing: ${missingForHr.join(', ')}`,
                createdAt: existingHr?.createdAt || new Date().toISOString(),
                read: false,
                autoGenerated: true
              });
            });
          }
        });
      return [...staticNotifications, ...autoNotifications];
    });
  }, [users, essProfiles]);

  useEffect(() => {
    const raw = localStorage.getItem(SAVED_LOGIN_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { employeeId?: string; rememberMe?: boolean };
      if (typeof parsed.employeeId === 'string') {
        setEmployeeIdInput(parsed.employeeId);
      }
      if (typeof parsed.rememberMe === 'boolean') {
        setRememberMe(parsed.rememberMe);
      }
    } catch {
      localStorage.removeItem(SAVED_LOGIN_KEY);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    const verifyOfficeIp = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
        const data = await response.json();
        if (!isActive) return;
        const currentIp = data?.ip ? String(data.ip) : '';
        setPublicIp(currentIp || null);
        const allowedIps = APP_CONFIG.OFFICE_ALLOWED_PUBLIC_IPS || [];
        if (allowedIps.length === 0) {
          setIpStatus('allowed');
          return;
        }
        setIpStatus(allowedIps.includes(currentIp) ? 'allowed' : 'blocked');
      } catch {
        if (isActive) {
          setIpStatus('blocked');
        }
      }
    };
    verifyOfficeIp();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (user || users.length === 0) return;
    const raw = localStorage.getItem(SAVED_SESSION_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { userId?: string; employeeId?: string };
      const savedUser = users.find(
        u => (parsed.userId && u.id === parsed.userId) || (parsed.employeeId && u.employeeId === parsed.employeeId)
      );
      if (savedUser) {
        setUser(savedUser);
      } else {
        localStorage.removeItem(SAVED_SESSION_KEY);
      }
    } catch {
      localStorage.removeItem(SAVED_SESSION_KEY);
    }
  }, [users, user]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const refreshUsers = async () => {
      const data = await fetchUsersRemote();
      if (active) setUsers(data);
    };
    const refreshRecords = async () => {
      const data = await fetchRecordsRemote();
      if (!active) return;
      const { normalized, changed } = normalizeOvertimeRecords(data, usersRef.current);
      setRecords(normalized);
      if (changed) {
        saveRecordsLocal(normalized);
      }
    };
    const refreshLeaves = async () => {
      if (user?.role === Role.CEO || user?.role === Role.SUPERADMIN) {
        try {
          const response = await adminFetchLeaves();
          if (active) setLeaves(response.data || []);
          return;
        } catch (err) {
          console.error(err);
        }
      }
      const data = await fetchLeavesRemote();
      if (active) setLeaves(data);
    };
    const refreshWfh = async () => {
      if (user?.role === Role.CEO || user?.role === Role.SUPERADMIN) {
        try {
          const response = await adminFetchWfhRequests();
          if (active) setWfhRequests(response.data || []);
          return;
        } catch (err) {
          console.error(err);
        }
      }
      const data = await loadWfhRequests();
      if (active) setWfhRequests(data);
    };
    const refreshEss = async () => {
      const data = await fetchEssProfilesRemote();
      if (active) setEssProfiles(data);
    };
    const refreshChecklists = async () => {
      const data = await fetchChecklistsRemote();
      if (active) setChecklists(data);
    };

    const unsubscribers = [
      subscribeToTableChanges('users', refreshUsers),
      subscribeToTableChanges('attendance_records', refreshRecords),
      subscribeToTableChanges('leave_requests', refreshLeaves),
      subscribeToTableChanges('wfh_requests', refreshWfh),
      subscribeToTableChanges('ess_profiles', refreshEss),
      subscribeToTableChanges('checklists', refreshChecklists)
    ];

    return () => {
      active = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [user?.role]);

  useEffect(() => {
    if (!user || users.length === 0) return;
    const latest = users.find(
      u => u.id === user.id || (u.employeeId && user.employeeId && normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(user.employeeId))
    );
    if (latest && latest !== user) {
      setUser(latest);
    }
  }, [users, user]);

  useEffect(() => {
    if (users.length === 0 || records.length === 0) return;
    const { normalized, changed } = normalizeRecordUserIds(records, users);
    if (changed) {
      setRecords(normalized);
      saveRecordsLocal(normalized);
    }
  }, [records, users]);

  const isDateInRange = (date: string, start: string, end: string) => {
    if (!date || !start || !end) return false;
    return date >= start && date <= end;
  };

  const isWorkingDay = (dateStr: string) => {
    const label = getWeekdayLabel(dateStr);
    const configured = APP_CONFIG.WORKING_DAYS;
    const workingDays = Array.isArray(configured) && configured.length > 0
      ? configured
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    return workingDays.includes(label);
  };

  const isWfhApprovedForUser = (targetUserId: string, dateStr: string) =>
    wfhRequests.some(req =>
      req.userId === targetUserId &&
      req.status === 'Approved' &&
      isDateInRange(dateStr, req.startDate, req.endDate)
    );

  const normalizePersonName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

  const resolveRequestUser = () => {
    const normalizedId = normalizeEmployeeId(requestEmployeeId);
    if (!requestEmployeeId.trim()) {
      return { error: 'Employee ID is required.' };
    }
    const targetUser = users.find(u => normalizeEmployeeId(u.employeeId || '') === normalizedId);
    if (!targetUser) {
      return { error: 'Employee not found.' };
    }
    if (!requestName.trim()) {
      return { error: 'Name is required.' };
    }
    const inputName = normalizePersonName(requestName);
    const storedName = normalizePersonName(targetUser.name || '');
    if (storedName && inputName !== storedName) {
      return { error: 'Name does not match employee ID.' };
    }
    return { user: targetUser };
  };

  const submitRemoteAccessRequest = () => {
    setRequestError(null);
    setRequestFeedback(null);
    const reason = requestReason.trim();
    if (!reason) {
      setRequestError('Reason is required.');
      return;
    }
    const result = resolveRequestUser();
    if ('error' in result) {
      setRequestError(result.error || 'Invalid request.');
      return;
    }
    const targetUser = result.user;
    const safeStart = requestStartDate <= requestEndDate ? requestStartDate : requestEndDate;
    const safeEnd = requestStartDate <= requestEndDate ? requestEndDate : requestStartDate;
    const todayStr = getLocalDateString(new Date());
    if (isWfhApprovedForUser(targetUser.id, todayStr) && safeStart <= todayStr && safeEnd >= todayStr) {
      setRequestFeedback('WFH already approved for today.');
      return;
    }
    const newRequest: WorkFromHomeRequest = {
      id: Math.random().toString(36).substr(2, 9),
      userId: targetUser.id,
      userName: targetUser.name,
      startDate: safeStart,
      endDate: safeEnd,
      reason,
      status: 'Pending',
      submittedAt: new Date().toISOString()
    };
    const updated = [...wfhRequests, newRequest];
    setWfhRequests(updated);
    setRequestSubmitting(true);
    Promise.resolve(adminUpsertWfhRequest(newRequest))
      .catch(err => {
        console.error(err);
        return saveWfhRequests(updated);
      })
      .finally(() => setRequestSubmitting(false));
    setRequestFeedback('WFH access request submitted.');
    setRequestReason('');
  };

  const submitLeaveRequestFromLogin = () => {
    setRequestError(null);
    setRequestFeedback(null);
    const reason = requestReason.trim();
    if (!reason) {
      setRequestError('Reason is required.');
      return;
    }
    const result = resolveRequestUser();
    if ('error' in result) {
      setRequestError(result.error || 'Invalid request.');
      return;
    }
    const targetUser = result.user;
    const safeStart = requestStartDate <= requestEndDate ? requestStartDate : requestEndDate;
    const safeEnd = requestStartDate <= requestEndDate ? requestEndDate : requestStartDate;
    const leaveMonth = new Date(safeStart);
    const paidLeavesThisMonth = leaves.filter(l =>
      l.userId === targetUser.id &&
      !l.id.startsWith('auto-absence:') &&
      (l.isPaid ?? true) &&
      l.status === 'Approved' &&
      isSameMonth(l.startDate, leaveMonth)
    ).length;
    const isPaid = paidLeavesThisMonth < 1;
    const newLeave: LeaveRequest = {
      id: Math.random().toString(36).substr(2, 9),
      userId: targetUser.id,
      userName: targetUser.name,
      startDate: safeStart,
      endDate: safeEnd,
      reason,
      status: 'Pending',
      submittedAt: new Date().toISOString(),
      isPaid
    };
    const updated = [...leaves, newLeave];
    setLeaves(updated);
    setRequestSubmitting(true);
    Promise.resolve(adminUpsertLeave(newLeave))
      .catch(err => {
        console.error(err);
        return saveLeaves(updated);
      })
      .finally(() => setRequestSubmitting(false));
    setRequestFeedback('Leave request submitted.');
    setRequestReason('');
  };

  useEffect(() => {
    if (users.length === 0) return;
    const todayStr = getLocalDateString(new Date());
    const targetDate = addDaysToDateString(todayStr, -1);
    if (!isWorkingDay(targetDate)) return;
    const newLeaves: LeaveRequest[] = [];
    users
      .filter(u => u.role !== Role.SUPERADMIN)
      .forEach(target => {
        const monthKey = targetDate.slice(0, 7);
        const allowance = APP_CONFIG.ABSENCE_ALLOWANCE_PER_MONTH ?? 0;
        const autoAbsenceCount = leaves.filter(l =>
          l.userId === target.id &&
          l.id.startsWith('auto-absence:') &&
          l.startDate.startsWith(monthKey)
        ).length;
        const hasAttendance = records.some(r => r.userId === target.id && r.date === targetDate);
        if (hasAttendance) return;
        const hasLeave = leaves.some(l =>
          l.userId === target.id &&
          l.status !== 'Cancelled' &&
          isDateInRange(targetDate, l.startDate, l.endDate)
        );
        if (hasLeave) return;
        const hasWfh = isWfhApprovedForUser(target.id, targetDate);
        if (hasWfh) return;
        const leaveId = `auto-absence:${target.id}:${targetDate}`;
        if (leaves.some(l => l.id === leaveId)) return;
        newLeaves.push({
          id: leaveId,
          userId: target.id,
          userName: target.name,
          startDate: targetDate,
          endDate: targetDate,
          reason: 'Auto marked absence',
          status: 'Approved',
          submittedAt: new Date().toISOString(),
          isPaid: autoAbsenceCount < allowance
        });
      });
    if (newLeaves.length > 0) {
      const updated = [...leaves, ...newLeaves];
      setLeaves(updated);
      void saveLeaves(updated);
    }
  }, [users, records, leaves, wfhRequests]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedId = normalizeEmployeeId(employeeIdInput);
    const credential = password.trim();
    const isPin = /^\d{4}$/.test(credential);
    const matchedUser = users.find(u => normalizeEmployeeId(u.employeeId || '') === normalizedId);
    const todayStr = getLocalDateString(new Date());
    const isWfhToday = matchedUser ? isWfhApprovedForUser(matchedUser.id, todayStr) : false;
    const isRemoteLoginAllowed = remoteLoginIds.includes(normalizedId) || matchedUser?.workMode === 'Remote' || isWfhToday;
    if (ipStatus === 'blocked' && !isRemoteLoginAllowed) {
      setError('Office Wi-Fi required for this account.');
      return;
    }
    let foundUser = users.find(
      u =>
        normalizeEmployeeId(u.employeeId || '') === normalizedId &&
        (u.password === credential || (isPin && u.pin === credential))
    );
    if (!foundUser) {
      const inputSuffix = extractEmployeeSuffix(normalizedId);
      if (inputSuffix) {
        const suffixMatches = users.filter(
          u =>
            extractEmployeeSuffix(u.employeeId || '') === inputSuffix &&
            (u.password === credential || (isPin && u.pin === credential))
        );
        if (suffixMatches.length === 1) {
          foundUser = suffixMatches[0];
        }
      }
    }
    if (foundUser) {
      setUser(foundUser);
      setError(null);
      if (rememberMe) {
        localStorage.setItem(
          SAVED_SESSION_KEY,
          JSON.stringify({ userId: foundUser.id, employeeId: foundUser.employeeId })
        );
        localStorage.setItem(
          SAVED_LOGIN_KEY,
          JSON.stringify({ employeeId: employeeIdInput, rememberMe: true })
        );
      } else {
        localStorage.removeItem(SAVED_SESSION_KEY);
        localStorage.removeItem(SAVED_LOGIN_KEY);
      }
    } else {
      setError('Invalid identity credentials.');
    }
  };

  const calculateStatus = (checkInTime: Date): CheckInStatus => {
    if (user?.workMode === 'Remote') return 'On-Time';
    const { currentMinutes, startMinutes } = getShiftAdjustedMinutes(
      checkInTime,
      APP_CONFIG.SHIFT_START,
      APP_CONFIG.SHIFT_END
    );
    const shiftDate = getShiftDateString(checkInTime, APP_CONFIG.SHIFT_START, APP_CONFIG.SHIFT_END);
    const isFriday = getWeekdayLabel(shiftDate) === 'Fri';
    const exemptIds = APP_CONFIG.FRIDAY_LATE_EXEMPT_EMPLOYEE_IDS.map(id => normalizeEmployeeId(id));
    const userId = user?.employeeId ? normalizeEmployeeId(user.employeeId) : '';
    const isExemptUser = Boolean(userId) && exemptIds.includes(userId);
    const [startHour, startMinute] = APP_CONFIG.SHIFT_START.split(':').map(Number);
    const [endHour, endMinute] = APP_CONFIG.SHIFT_END.split(':').map(Number);
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    const isOvernight = endTotal <= startTotal;
    const [cutoffHour, cutoffMinute] = APP_CONFIG.FRIDAY_LATE_EXEMPT_CUTOFF.split(':').map(Number);
    const cutoffBase = cutoffHour * 60 + cutoffMinute;
    const cutoffAdjusted = isOvernight && cutoffBase < endTotal ? cutoffBase + 24 * 60 : cutoffBase;
    if (isFriday && isExemptUser && currentMinutes <= cutoffAdjusted) {
      return 'On-Time';
    }
    const relaxation = APP_CONFIG.GRACE_PERIOD_MINS;
    if (currentMinutes < startMinutes) return 'Early';
    if (currentMinutes <= startMinutes + relaxation) return 'On-Time';
    return 'Late';
  };

  const handleCheckIn = useCallback(() => {
    if (!user) return;
    const now = new Date();
    const shiftDate = getShiftDateString(now, APP_CONFIG.SHIFT_START, APP_CONFIG.SHIFT_END);
    const hasShiftRecord = records.some(r => r.userId === user.id && r.date === shiftDate);
    if (hasShiftRecord) {
      return;
    }
    const record: AttendanceRecord = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      date: shiftDate,
      checkIn: getZonedNowISOString(),
      status: calculateStatus(now)
    };
    const updated = [...records, record];
    setRecords(updated);
    saveRecordsLocal(updated);
    void (async () => {
      try {
        await adminUpsertAttendanceRecord(record);
      } catch (err) {
        console.error(err);
        await upsertAttendanceRecord(record);
      }
    })();
  }, [user, records]);

  const handleCheckOut = useCallback(() => {
    if (!user) return;
    const activeRecord = [...records].reverse().find(r => r.userId === user.id && !r.checkOut);
    if (!activeRecord) return;
    const now = new Date();
    const checkOutIso = getZonedNowISOString();
    const checkInTime = new Date(activeRecord.checkIn);
    const diff = (new Date(checkOutIso).getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
    const overtimeHours = computeOvertimeHours(activeRecord.checkIn, checkOutIso);
    const updated = records.map(r =>
      r.id === activeRecord.id
        ? { ...r, checkOut: checkOutIso, totalHours: diff, overtimeHours: overtimeHours > 0 ? overtimeHours : undefined }
        : r
    );
    setRecords(updated);
    saveRecordsLocal(updated);
    const updatedRecord = updated.find(r => r.id === activeRecord.id);
    if (updatedRecord) {
      void (async () => {
        try {
          await adminUpsertAttendanceRecord(updatedRecord);
        } catch (err) {
          console.error(err);
          await upsertAttendanceRecord(updatedRecord);
        }
      })();
    }
  }, [user, records]);

  const handleLeaveAction = (leaveId: string, action: 'Approved' | 'Rejected') => {
    if (user?.role !== Role.CEO && user?.role !== Role.SUPERADMIN) return;
    const targetLeave = leaves.find(l => l.id === leaveId);
    const updated = leaves.map(l => l.id === leaveId ? { ...l, status: action } : l);
    setLeaves(updated);
    if (user?.role === Role.CEO || user?.role === Role.SUPERADMIN) {
      const leaveToUpdate = updated.find(l => l.id === leaveId);
      if (leaveToUpdate) {
        void adminUpsertLeave(leaveToUpdate).catch(console.error);
      }
    } else {
      void saveLeaves(updated);
    }
    if (targetLeave) {
      addOrUpdateNotification({
        id: `leave-status:${leaveId}`,
        userId: targetLeave.userId,
        title: `Leave ${action}`,
        message: `Your leave ${targetLeave.startDate} to ${targetLeave.endDate} was ${action.toLowerCase()}.`,
        createdAt: new Date().toISOString(),
        read: false,
        playSound: true
      }, true);
    }
  };

  const handleSubmitWfhRequest = (reason: string, startDate: string, endDate: string) => {
    if (!user) return;
    const safeStart = startDate <= endDate ? startDate : endDate;
    const safeEnd = startDate <= endDate ? endDate : startDate;
    const newRequest: WorkFromHomeRequest = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      startDate: safeStart,
      endDate: safeEnd,
      reason,
      status: 'Pending',
      submittedAt: new Date().toISOString()
    };
    const updated = [...wfhRequests, newRequest];
    setWfhRequests(updated);
    void (async () => {
      try {
        await adminUpsertWfhRequest(newRequest);
      } catch (err) {
        console.error(err);
        await saveWfhRequests(updated);
      }
    })();
    const ceoUsers = users.filter(u => u.role === Role.CEO);
    ceoUsers.forEach(ceo => {
      addOrUpdateNotification({
        id: `wfh-request:${newRequest.id}:${ceo.id}`,
        userId: ceo.id,
        title: 'WFH request pending',
        message: `${user.name} requested WFH ${safeStart} to ${safeEnd}.`,
        createdAt: new Date().toISOString(),
        read: false,
        playSound: true
      }, true);
    });
  };

  const handleWfhAction = (requestId: string, action: 'Approved' | 'Rejected') => {
    if (user?.role !== Role.CEO && user?.role !== Role.SUPERADMIN) return;
    const updated = wfhRequests.map(req => {
      if (req.id !== requestId) return req;
      return { ...req, status: action };
    });
    setWfhRequests(updated);
    if (user?.role === Role.CEO || user?.role === Role.SUPERADMIN) {
      const requestToUpdate = updated.find(req => req.id === requestId);
      if (requestToUpdate) {
        void adminUpsertWfhRequest(requestToUpdate).catch(console.error);
      }
    } else {
      void saveWfhRequests(updated);
    }
    const targetRequest = wfhRequests.find(req => req.id === requestId);
    if (targetRequest) {
      addOrUpdateNotification({
        id: `wfh-status:${requestId}`,
        userId: targetRequest.userId,
        title: `WFH ${action}`,
        message: `Your WFH ${targetRequest.startDate} to ${targetRequest.endDate} was ${action.toLowerCase()}.`,
        createdAt: new Date().toISOString(),
        read: false,
        playSound: true
      }, true);
    }
  };

  const handleSubmitLeave = (startDate: string, endDate: string, reason: string) => {
    if (!user) return;
    const leaveMonth = new Date(startDate);
    const paidLeavesThisMonth = leaves.filter(l =>
      l.userId === user.id &&
      !l.id.startsWith('auto-absence:') &&
      (l.isPaid ?? true) &&
      l.status === 'Approved' &&
      isSameMonth(l.startDate, leaveMonth)
    ).length;
    const isPaid = paidLeavesThisMonth < 1;
    const newLeave: LeaveRequest = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      startDate,
      endDate,
      reason,
      status: 'Pending',
      submittedAt: new Date().toISOString(),
      isPaid
    };
    const updated = [...leaves, newLeave];
    setLeaves(updated);
    void (async () => {
      try {
        await adminUpsertLeave(newLeave);
      } catch (err) {
        console.error(err);
        await saveLeaves(updated);
      }
    })();
    const ceoUsers = users.filter(u => u.role === Role.CEO);
    ceoUsers.forEach(ceo => {
      addOrUpdateNotification({
        id: `leave-request:${newLeave.id}:${ceo.id}`,
        userId: ceo.id,
        title: 'Leave request pending',
        message: `${user.name} requested leave ${startDate} to ${endDate}.`,
        createdAt: new Date().toISOString(),
        read: false,
        playSound: true
      }, true);
    });
  };

  const handleCancelLeave = (leaveId: string) => {
    setLeaves(prev => {
      const updated = prev.map(l => l.id === leaveId ? { ...l, status: 'Cancelled' } : l);
      void saveLeaves(updated);
      return updated;
    });
  };

  const handleUpdateRecord = (updatedRecord: AttendanceRecord) => {
    setRecords(prevRecords => {
      const exists = prevRecords.some(r => r.id === updatedRecord.id);
      const newRecords = exists
        ? prevRecords.map(r => r.id === updatedRecord.id ? { ...updatedRecord } : r)
        : [...prevRecords, { ...updatedRecord }];
      saveRecordsLocal(newRecords);
      return newRecords;
    });
    if (user?.role === Role.SUPERADMIN) {
      void adminUpsertAttendanceRecord(updatedRecord).catch(console.error);
    } else {
      void upsertAttendanceRecord(updatedRecord);
    }
  };

  const handleDeleteRecord = (recordId: string) => {
    setRecords(prevRecords => {
      const updated = prevRecords.filter(r => r.id !== recordId);
      saveRecordsLocal(updated);
      return updated;
    });
    if (user?.role === Role.SUPERADMIN) {
      void adminDeleteAttendanceRecord(recordId).catch(console.error);
    } else {
      void deleteAttendanceRecord(recordId);
    }
  };

  const handleUpdateESS = (profile: ESSProfile) => {
    setEssProfiles(prev => {
      const exists = prev.find(p => p.userId === profile.userId);
      const updated = exists
        ? prev.map(p => p.userId === profile.userId ? profile : p)
        : [...prev, profile];
      void saveESSProfiles(updated);
      return updated;
    });
  };

  const handleUpdateChecklist = (checklist: UserChecklist) => {
    setChecklists(prev => {
      const exists = prev.find(c => c.userId === checklist.userId);
      const updated = exists
        ? prev.map(c => c.userId === checklist.userId ? checklist : c)
        : [...prev, checklist];
      void saveChecklists(updated);
      return updated;
    });
  };

  const handleAddUser = (newUser: User) => {
    setUsers(prev => {
      const updated = [...prev, newUser];
      void saveUsers(updated);
      return updated;
    });
    if (user?.role === Role.SUPERADMIN) {
      void adminUpsertUser(newUser).catch(console.error);
    }
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUsers(prev => {
      const normalized = normalizeEmployeeId(updatedUser.employeeId || '');
      const updated = prev.map(u =>
        normalizeEmployeeId(u.employeeId || '') === normalized ? { ...u, ...updatedUser } : u
      );
      void saveUsers(updated);
      return updated;
    });
    if (user?.id === updatedUser.id) {
      setUser(updatedUser);
    }
    if (user?.role === Role.SUPERADMIN) {
      void adminUpsertUser(updatedUser).catch(console.error);
    } else if (updatedUser.employeeId) {
      void updateCredentialsByEmployeeId(updatedUser.employeeId, updatedUser.password, updatedUser.pin ?? null);
    }
  };

  const handleDeleteUser = (userId: string) => {
    setUsers(prev => {
      const updated = prev.filter(u => u.id !== userId);
      void saveUsers(updated);
      return updated;
    });
    setRecords(prev => {
      const updated = prev.filter(r => r.userId !== userId);
      void saveRecords(updated);
      return updated;
    });
    setLeaves(prev => {
      const updated = prev.filter(l => l.userId !== userId);
      void saveLeaves(updated);
      return updated;
    });
    setWfhRequests(prev => {
      const updated = prev.filter(r => r.userId !== userId);
      void saveWfhRequests(updated);
      return updated;
    });
    setEssProfiles(prev => {
      const updated = prev.filter(p => p.userId !== userId);
      void saveESSProfiles(updated);
      return updated;
    });
    setChecklists(prev => {
      const updated = prev.filter(c => c.userId !== userId);
      void saveChecklists(updated);
      return updated;
    });
    if (user?.id === userId) {
      localStorage.removeItem(SAVED_SESSION_KEY);
      setUser(null);
    }
    if (user?.role === Role.SUPERADMIN) {
      void adminDeleteUser(userId).catch(console.error);
    } else {
      void deleteUserData(userId);
    }
  };

  if (ipStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100 text-center space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Network Check</p>
          <p className="text-lg font-black text-slate-900">Verifying office connection...</p>
        </div>
      </div>
    );
  }

  if (ipStatus === 'blocked' && user) {
    const todayStr = getLocalDateString(new Date());
    const isWfhToday = isWfhApprovedForUser(user.id, todayStr);
    const isRemoteSessionAllowed = remoteLoginIds.includes(normalizeEmployeeId(user.employeeId || ''))
      || user.workMode === 'Remote'
      || isWfhToday;
    if (!isRemoteSessionAllowed) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100 text-center space-y-3 max-w-md">
            <p className="text-xs font-black uppercase tracking-widest text-rose-400">Access Restricted</p>
            <p className="text-lg font-black text-slate-900">Office Wi-Fi required</p>
            <p className="text-xs font-bold text-slate-500">
              {publicIp ? `Detected IP: ${publicIp}` : 'Unable to verify IP.'}
            </p>
          </div>
        </div>
      );
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100 space-y-10">
            <div className="text-center">
              <img src={logoUrl} alt="BytechSol" className="mx-auto h-14 w-auto mb-4" />
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em]">Corporate Access Portal</p>
            </div>
            {ipStatus === 'blocked' && (
              <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Office Wi-Fi Required</p>
                <p className="text-[10px] font-bold text-amber-600 mt-2">Remote staff can still log in.</p>
              </div>
            )}
            <form className="space-y-6" onSubmit={handleLogin}>
              <div className="space-y-1">
                <label htmlFor="login-employee-id" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Employee ID</label>
                <div className="flex items-center w-full px-4 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus-within:border-blue-500 outline-none font-bold text-slate-800 transition-all">
                  <span className="text-slate-400 font-black mr-2">BS-</span>
                  <input
                    id="login-employee-id"
                    name="employeeId"
                    type="text"
                    required
                    value={employeeIdInput}
                    onChange={e => setEmployeeIdInput(e.target.value)}
                    className="flex-1 bg-transparent outline-none font-bold text-slate-800"
                    placeholder="XXXX001"
                    autoComplete="username"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="login-password" className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Security Key / PIN</label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-6 py-5 pr-20 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 transition-all"
                    placeholder="Security Key or 4-digit PIN"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <input
                  id="login-remember"
                  name="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-200 text-blue-600 focus:ring-blue-500"
                />
                Remember Me
              </label>
              {error && <p className="text-red-500 text-xs font-bold bg-red-50 p-4 rounded-xl text-center border border-red-100">{error}</p>}
              <button type="submit" className="w-full premium-gradient text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:opacity-90 transition-all">Authorize Login</button>
            </form>

            <div className="rounded-[2.5rem] bg-slate-50 border border-slate-100 p-6 space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Emergency Requests</p>
                  <p className="text-[10px] font-bold text-slate-500">Send a WFH access or leave request for today.</p>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="request-start" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Start Date</label>
                      <input
                        id="request-start"
                        type="date"
                        value={requestStartDate}
                        onChange={e => {
                          setRequestStartDate(e.target.value);
                          setRequestError(null);
                          setRequestFeedback(null);
                        }}
                        className="w-full bg-white border-2 border-transparent focus:border-blue-500 p-3 rounded-2xl text-[10px] font-black outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="request-end" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">End Date</label>
                      <input
                        id="request-end"
                        type="date"
                        value={requestEndDate}
                        onChange={e => {
                          setRequestEndDate(e.target.value);
                          setRequestError(null);
                          setRequestFeedback(null);
                        }}
                        className="w-full bg-white border-2 border-transparent focus:border-blue-500 p-3 rounded-2xl text-[10px] font-black outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="request-employee-id" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Employee ID</label>
                    <div className="flex items-center w-full px-4 py-3 rounded-2xl bg-white border-2 border-transparent focus-within:border-blue-500 outline-none font-bold text-slate-800 transition-all">
                      <span className="text-slate-400 font-black mr-2">BS-</span>
                      <input
                        id="request-employee-id"
                        name="requestEmployeeId"
                        type="text"
                        value={requestEmployeeId}
                        onChange={e => {
                          setRequestEmployeeId(e.target.value);
                          setRequestError(null);
                          setRequestFeedback(null);
                        }}
                        className="flex-1 bg-transparent outline-none font-bold text-slate-800"
                        placeholder="XXXX001"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="request-name" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Name</label>
                    <input
                      id="request-name"
                      name="requestName"
                      type="text"
                      value={requestName}
                      onChange={e => {
                        setRequestName(e.target.value);
                        setRequestError(null);
                        setRequestFeedback(null);
                      }}
                      className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 transition-all"
                      placeholder="Employee name"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="request-reason" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Reason</label>
                    <textarea
                      id="request-reason"
                      name="requestReason"
                      value={requestReason}
                      onChange={e => {
                        setRequestReason(e.target.value);
                        setRequestError(null);
                        setRequestFeedback(null);
                      }}
                      className="w-full bg-white border-2 border-transparent focus:border-blue-500 p-3 rounded-2xl text-xs font-bold outline-none h-20 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={submitRemoteAccessRequest}
                      disabled={requestSubmitting}
                      className="w-full bg-slate-900 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all disabled:opacity-60"
                    >
                      Request WFH Access
                    </button>
                    <button
                      type="button"
                      onClick={submitLeaveRequestFromLogin}
                      disabled={requestSubmitting}
                      className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-blue-500 transition-all disabled:opacity-60"
                    >
                      Request Leave
                    </button>
                  </div>
                  {requestError && (
                    <p className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl text-center">
                      {requestError}
                    </p>
                  )}
                  {requestFeedback && (
                    <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl text-center">
                      {requestFeedback}
                    </p>
                  )}
                </div>
              </div>
          </div>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem(SAVED_SESSION_KEY);
    setUser(null);
  };

  const currentUserNotifications = notifications
    .filter(n => n.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const isCheckinOverrideUser = Boolean(
    user?.employeeId && checkinOverrideIds.includes(normalizeEmployeeId(user.employeeId))
  );

  return (
    <Layout
      user={user}
      onLogout={handleLogout}
      notifications={currentUserNotifications}
      onMarkNotificationRead={markNotificationRead}
      onMarkAllNotificationsRead={markAllNotificationsRead}
    >
      {user.role === Role.EMPLOYEE ? (
        <EmployeeDashboard
          user={user}
          records={records}
          leaves={leaves}
          wfhRequests={wfhRequests}
          essProfiles={essProfiles}
          checklists={checklists}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          isWifiConnected={isWifiConnected}
          isCheckinOverride={isCheckinOverrideUser}
          onSubmitLeave={handleSubmitLeave}
          onSubmitWfhRequest={handleSubmitWfhRequest}
          onUpdateESS={handleUpdateESS}
          onUpdateChecklist={handleUpdateChecklist}
          onUpdateUser={handleUpdateUser}
          onCancelLeave={handleCancelLeave}
        />
      ) : (
        <AdminDashboard
          user={user}
          users={users}
          records={records}
          leaves={leaves}
          wfhRequests={wfhRequests}
          essProfiles={essProfiles}
          checklists={checklists}
          onLeaveAction={handleLeaveAction}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          isWifiConnected={isWifiConnected}
          isCheckinOverride={isCheckinOverrideUser}
          onUpdateRecord={handleUpdateRecord}
          onDeleteRecord={handleDeleteRecord}
          onUpdateChecklist={handleUpdateChecklist}
          onAddUser={handleAddUser}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
          onSubmitLeave={handleSubmitLeave}
          onWfhAction={handleWfhAction}
          onUpdateESS={handleUpdateESS}
        />
      )}
    </Layout>
  );
};

export default App;
