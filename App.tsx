
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, AttendanceRecord, Role, CheckInStatus, LeaveRequest, ESSProfile, UserChecklist, WorkFromHomeRequest, AppNotification } from './types';
import { APP_CONFIG, MOCK_USERS } from './constants';
import logoUrl from './asset/public/logo.svg';
import {
  loadRecords,
  saveRecords,
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
  updateCredentialsByEmployeeId
} from './utils/storage';
import { isSupabaseConfigured } from './utils/supabase';
import { getLocalDateString, getShiftAdjustedMinutes, getShiftDateString, getWeekdayLabel, getLocalTimeMinutes, getZonedNowISOString } from './utils/dates';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';

const SAVED_SESSION_KEY = 'bytechsol_saved_session';
const SAVED_LOGIN_KEY = 'bytechsol_saved_login';
const NOTIFICATION_STORAGE_KEY = 'bytechsol_notifications';

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

const normalizeOvertimeRecords = (list: AttendanceRecord[]) => {
  let changed = false;
  const normalized = list.map(record => {
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

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [employeeIdInput, setEmployeeIdInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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
      const { normalized, changed } = normalizeOvertimeRecords(recordsData);
      setRecords(normalized);
      if (changed) {
        void saveRecords(normalized);
      }
      setLeaves(leavesData);
      setEssProfiles(essData);
      setChecklists(checklistData);
      setWfhRequests(wfhData);

      const legacyEmployeeIds = new Set(['BS-ZACE002', 'BS-SAHR003', 'BS-JODE004', 'BS-JADE005']);
      const hasLegacyUsers = usersData.some(u => legacyEmployeeIds.has(u.employeeId));
      if (usersData.length === 0 || hasLegacyUsers) {
        setUsers(MOCK_USERS);
        void saveUsers(MOCK_USERS);
      } else {
        setUsers(usersData);
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
      const existingMap = new Map(prev.map(n => [n.id, n]));
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
      const { normalized, changed } = normalizeOvertimeRecords(data);
      setRecords(normalized);
      if (changed) {
        void saveRecords(normalized);
      }
    };
    const refreshLeaves = async () => {
      const data = await fetchLeavesRemote();
      if (active) setLeaves(data);
    };
    const refreshWfh = async () => {
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
  }, []);

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
      void saveRecords(normalized);
    }
  }, [records, users]);

  const isDateInRange = (date: string, start: string, end: string) => {
    if (!date || !start || !end) return false;
    return date >= start && date <= end;
  };

  const isWfhApprovedForUser = (targetUserId: string, dateStr: string) =>
    wfhRequests.some(req =>
      req.userId === targetUserId &&
      req.status === 'Approved' &&
      isDateInRange(dateStr, req.startDate, req.endDate)
    );

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
    void saveRecords(updated);
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
    void saveRecords(updated);
  }, [user, records]);

  const handleLeaveAction = (leaveId: string, action: 'Approved' | 'Rejected') => {
    if (user?.role !== Role.CEO && user?.role !== Role.SUPERADMIN) return;
    const targetLeave = leaves.find(l => l.id === leaveId);
    const updated = leaves.map(l => l.id === leaveId ? { ...l, status: action } : l);
    setLeaves(updated);
    void saveLeaves(updated);
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
    void saveWfhRequests(updated);
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
    void saveWfhRequests(updated);
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
      (l.isPaid ?? true) &&
      l.status !== 'Cancelled' &&
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
    void saveLeaves(updated);
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
      const newRecords = prevRecords.map(r => r.id === updatedRecord.id ? { ...updatedRecord } : r);
      void saveRecords(newRecords);
      return newRecords;
    });
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
    if (updatedUser.employeeId) {
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
    void deleteUserData(userId);
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
          onUpdateRecord={handleUpdateRecord}
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
