import React, { useState, useEffect, useRef } from 'react';
import { AttendanceRecord, LeaveRequest, User, ESSProfile, UserChecklist, Role, WorkFromHomeRequest, Task } from '../types';
import TaskBoard from './TaskBoard';
import { formatDuration, calculateWeeklyOvertime, calculateDuration } from '../utils/storage';
import { getLocalDateString, getShiftDateString, getShiftAdjustedMinutes, getLocalTimeMinutes, formatTimeInZone } from '../utils/dates';
import { APP_CONFIG } from '../constants';
import Icon3D from './Icon3D';
import { supabase, isSupabaseConfigured } from '../utils/supabase';

const calculateTotalSalary = (basic?: number, allowances?: number, fallback?: number) => {
  const baseValue = Number(basic) || 0;
  const allowanceValue = Number(allowances) || 0;
  const total = baseValue + allowanceValue;
  return total || (Number(fallback) || 0);
};

const parseDateUtc = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const normalizeName = (value?: string) =>
  (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const isValidDateValue = (value?: string) => {
  if (!value) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime());
};

const CROP_PREVIEW_SIZE = 160;
const CROP_OUTPUT_SIZE = 512;

const normalizeEmployeeId = (value: string): string => {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '');
  const withoutPrefix = cleaned.replace(/^BS-/, '');
  return `BS-${withoutPrefix}`;
};

const getShiftForEmployee = (employeeId?: string) => {
  const normalized = employeeId ? normalizeEmployeeId(employeeId) : '';
  const override = (APP_CONFIG as any).SHIFT_OVERRIDES?.[normalized];
  return {
    start: override?.start || APP_CONFIG.SHIFT_START,
    end: override?.end || APP_CONFIG.SHIFT_END,
    overtimeEnd: override?.overtimeEnd || override?.end || APP_CONFIG.SHIFT_END
  };
};

const extractStoragePath = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const match = trimmed.match(/\/storage\/v1\/object\/(?:public\/)?([^?]+)/);
    if (!match) return null;
    const rawPath = match[1];
    const bucketPrefix = `${APP_CONFIG.PROFILE_IMAGE_BUCKET}/`;
    return rawPath.startsWith(bucketPrefix) ? rawPath.slice(bucketPrefix.length) : rawPath;
  }
  const bucketPrefix = `${APP_CONFIG.PROFILE_IMAGE_BUCKET}/`;
  return trimmed.startsWith(bucketPrefix) ? trimmed.slice(bucketPrefix.length) : trimmed;
};

const resolveProfileUrl = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) return trimmed;
  return `${baseUrl}/storage/v1/object/public/${APP_CONFIG.PROFILE_IMAGE_BUCKET}/${trimmed}`;
};

const getBaseScale = (size: number, width: number, height: number) =>
  size / Math.min(width || 1, height || 1);

const clampOffset = (
  offset: { x: number; y: number },
  size: number,
  width: number,
  height: number,
  zoom: number
) => {
  const baseScale = getBaseScale(size, width, height);
  const scale = baseScale * zoom;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const maxX = Math.max(0, (scaledWidth - size) / 2);
  const maxY = Math.max(0, (scaledHeight - size) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y))
  };
};

const countLeaveDaysInMonth = (leave: LeaveRequest, target: Date) => {
  if (!leave.startDate || !leave.endDate) return 0;
  const monthStart = new Date(Date.UTC(target.getFullYear(), target.getMonth(), 1));
  const monthEnd = new Date(Date.UTC(target.getFullYear(), target.getMonth() + 1, 0));
  const leaveStart = parseDateUtc(leave.startDate);
  const leaveEnd = parseDateUtc(leave.endDate);
  if (leaveEnd < monthStart || leaveStart > monthEnd) return 0;
  const overlapStart = leaveStart > monthStart ? leaveStart : monthStart;
  const overlapEnd = leaveEnd < monthEnd ? leaveEnd : monthEnd;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / dayMs) + 1;
};

const getShiftMetrics = (shiftStart: string, shiftEnd: string) => {
  const [startHour, startMinute] = shiftStart.split(':').map(Number);
  const [endHour, endMinute] = shiftEnd.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const isOvernight = endMinutes <= startMinutes;
  const endMinutesAdjusted = isOvernight ? endMinutes + 24 * 60 : endMinutes;
  const durationMinutes = Math.max(0, endMinutesAdjusted - startMinutes);
  const durationHours = durationMinutes > 0 ? durationMinutes / 60 : 8;
  return { startMinutes, endMinutesRaw: endMinutes, endMinutesAdjusted, durationHours, isOvernight };
};

const calculateMonthlyTax = (grossPay: number) => {
  const salary = Math.max(0, grossPay);
  if (salary <= 50_000) return 0;
  if (salary <= 100_000) return (salary - 50_000) * 0.01;
  return 500 + (salary - 100_000) * 0.05;
};

const formatCurrency = (value: number) => `PKR ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`;

interface EmployeeDashboardProps {
  user: User;
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  wfhRequests: WorkFromHomeRequest[];
  essProfiles: ESSProfile[];
  checklists: UserChecklist[];
  onCheckIn: () => void;
  onCheckOut: () => void;
  onUpdateRecord: (record: AttendanceRecord) => void;
  isWifiConnected: boolean;
  isCheckinOverride?: boolean;
  onSubmitLeave: (start: string, end: string, reason: string) => void;
  onSubmitWfhRequest: (reason: string, startDate: string, endDate: string) => void;
  onUpdateESS: (profile: ESSProfile) => void;
  onUpdateChecklist: (checklist: UserChecklist) => void;
  onUpdateUser: (user: User) => void;
  onCancelLeave: (leaveId: string) => void;
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  onAddTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  users: User[]; // Needed for resolving task assigner names
}

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  user,
  records,
  leaves,
  wfhRequests,
  essProfiles,
  checklists,
  onCheckIn,
  onCheckOut,
  onUpdateRecord,
  isWifiConnected,
  isCheckinOverride = false,
  onSubmitLeave,
  onSubmitWfhRequest,
  onUpdateESS,
  onUpdateChecklist,
  onUpdateUser,

  onCancelLeave,
  tasks,
  onUpdateTask,
  onAddTask,
  onDeleteTask,
  users
}) => {
  const { start: shiftStart, end: shiftEnd } = getShiftForEmployee(user.employeeId);
  const [tab, setTab] = useState<'attendance' | 'leaves' | 'profile' | 'checklists' | 'tasks'>('attendance');
  const buildLeaveTemplate = (employee: User) =>
    `Leave Application\n\nReason:\n\nRegards,\n${employee.name}\nID: ${employee.employeeId}`;
  const [leaveApplication, setLeaveApplication] = useState(buildLeaveTemplate(user));
  const [leaveStartDate, setLeaveStartDate] = useState(() => getLocalDateString(new Date()));
  const [leaveEndDate, setLeaveEndDate] = useState(() => getLocalDateString(new Date()));
  const [wfhReason, setWfhReason] = useState('');
  const [wfhStartDate, setWfhStartDate] = useState(() => getLocalDateString(new Date()));
  const [wfhEndDate, setWfhEndDate] = useState(() => getLocalDateString(new Date()));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [profileName, setProfileName] = useState(user.name || '');
  const [profileEmail, setProfileEmail] = useState(user.email || '');
  const [profilePhone, setProfilePhone] = useState(user.phone || '');
  const [profileImage, setProfileImage] = useState<string | null>(user.profileImage || null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [resolvedProfileImage, setResolvedProfileImage] = useState<string | null>(resolveProfileUrl(user.profileImage || null));
  const [profileImageRetried, setProfileImageRetried] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const isDraggingRef = useRef(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [attendanceDateFilter, setAttendanceDateFilter] = useState('');
  const [attendancePage, setAttendancePage] = useState(1);
  const attendanceDateRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAttendancePage(1);
  }, [attendanceDateFilter, tab]);
  const [attendanceMonthFilter, setAttendanceMonthFilter] = useState(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Smart default: If there are no records for current month, but records exist for previous month, default to previous
    if (records && records.length > 0) {
      const currentMonthHasRecords = records.some(r => {
        const d = r.date || (r.checkIn ? r.checkIn.split('T')[0] : '');
        return d.startsWith(currentMonth);
      });

      if (!currentMonthHasRecords) {
        // Find the most recent month with records
        const sortedDates = records
          .map(r => r.date || (r.checkIn ? r.checkIn.split('T')[0] : ''))
          .filter(d => d)
          .sort((a, b) => b.localeCompare(a));

        if (sortedDates.length > 0) {
          return sortedDates[0].substring(0, 7); // YYYY-MM
        }
      }
    }
    return currentMonth;
  });
  const attendanceMonthRef = useRef<HTMLInputElement | null>(null);
  const [overtimeActive, setOvertimeActive] = useState(false);
  const [overtimeEndsAt, setOvertimeEndsAt] = useState<number | null>(null);
  const [overtimeStartAt, setOvertimeStartAt] = useState<number | null>(null);
  const [overtimeRemainingSec, setOvertimeRemainingSec] = useState(0);
  const [overtimeRecordId, setOvertimeRecordId] = useState<string | null>(null);
  const overtimeTimerRef = useRef<number | null>(null);
  const overtimeIntervalRef = useRef<number | null>(null);
  const overtimeActiveRef = useRef(false);
  const overtimeStartRef = useRef<number | null>(null);
  const overtimeRecordRef = useRef<string | null>(null);
  const resolveRecordDate = (record: AttendanceRecord) => {
    if (record.date) return record.date;
    if (!record.checkIn) return '';
    return getShiftDateString(new Date(record.checkIn), shiftStart, shiftEnd);
  };

  const isSameMonth = (dateStr: string, target: Date) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
  };

  const myProfile = essProfiles.find(p => p.userId === user.id) || {
    userId: user.id,
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: ''
  };

  const [editProfile, setEditProfile] = useState<ESSProfile>(myProfile);

  // Sync with prop changes
  useEffect(() => {
    setEditProfile(myProfile);
  }, [essProfiles, user.id]);

  useEffect(() => {
    setLeaveApplication(buildLeaveTemplate(user));
  }, [user.id, user.name, user.employeeId]);

  useEffect(() => {
    setProfileName(user.name || '');
    setProfileEmail(user.email || '');
    setProfilePhone(user.phone || '');
    setProfileImage(user.profileImage || null);
  }, [user.id, user.name, user.email, user.phone, user.profileImage]);

  useEffect(() => {
    setResolvedProfileImage(resolveProfileUrl(profileImage));
    setProfileImageRetried(false);
  }, [profileImage]);

  useEffect(() => {
    return () => {
      if (cropSource) {
        URL.revokeObjectURL(cropSource);
      }
    };
  }, [cropSource]);

  useEffect(() => {
    if (!cropSource || !cropImageSize.width || !cropImageSize.height) return;
    setCropOffset(prev => clampOffset(prev, CROP_PREVIEW_SIZE, cropImageSize.width, cropImageSize.height, cropZoom));
  }, [cropSource, cropImageSize, cropZoom]);

  const handleESSUpdate = () => {
    onUpdateESS(editProfile);

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleProfileSave = () => {
    const trimmedEmail = profileEmail.trim();
    if (!trimmedEmail) {
      setProfileError('Email is required.');
      return;
    }
    const canEditName = user.role === Role.HR;
    const trimmedName = profileName.trim();
    const resolvedName = canEditName && trimmedName ? trimmedName : user.name;
    const [firstName, ...rest] = resolvedName.split(' ');
    const lastName = rest.join(' ').trim();
    onUpdateUser({
      ...user,
      name: resolvedName,
      firstName: canEditName ? firstName : user.firstName,
      lastName: canEditName ? lastName : user.lastName,
      email: trimmedEmail,
      phone: profilePhone.trim(),
      profileImage: profileImage ?? null
    });
    setProfileError(null);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  const uploadProfileImage = async (file: File) => {
    setProfileUploading(true);
    if (!isSupabaseConfigured || !supabase) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setProfileImage(reader.result);
          setProfileError(null);
          setProfileUploading(false);
        }
      };
      reader.readAsDataURL(file);
      return;
    }
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const fileName = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(APP_CONFIG.PROFILE_IMAGE_BUCKET)
      .upload(fileName, file, { upsert: true, contentType: file.type });
    if (error) {
      setProfileError('Upload failed. Check storage permissions.');
      setProfileUploading(false);
      return;
    }
    const { data } = supabase.storage
      .from(APP_CONFIG.PROFILE_IMAGE_BUCKET)
      .getPublicUrl(fileName);
    if (!data?.publicUrl) {
      setProfileError('Unable to read uploaded image URL.');
      setProfileUploading(false);
      return;
    }
    setProfileImage(data.publicUrl);
    setProfileError(null);
    if (user.employeeId) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_image: data.publicUrl })
        .eq('employee_id', user.employeeId);
      if (updateError) {
        setProfileError('Image saved, but profile update failed.');
      }
    }
    onUpdateUser({ ...user, profileImage: data.publicUrl });
    setProfileUploading(false);
  };

  const handleProfileImageChange = (file?: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setProfileError('Only PNG or JPG images are allowed.');
      return;
    }
    if (file.size > APP_CONFIG.PROFILE_IMAGE_MAX_BYTES) {
      setProfileError('Image must be under 3MB.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setCropImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
      setCropSource(previewUrl);
      setProfileError(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      setProfileError('Unable to read image file.');
    };
    img.src = previewUrl;
  };

  const handleProfileImageError = async () => {
    if (profileImageRetried || !profileImage) return;
    setProfileImageRetried(true);
    if (!isSupabaseConfigured || !supabase) return;
    const path = extractStoragePath(profileImage);
    if (!path) return;
    const { data } = await supabase
      .storage
      .from(APP_CONFIG.PROFILE_IMAGE_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) {
      setResolvedProfileImage(data.signedUrl);
    }
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropSource) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: cropOffset.x,
      offsetY: cropOffset.y
    };
    isDraggingRef.current = true;
    setIsDraggingCrop(true);
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !cropSource) return;
    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    const next = {
      x: dragStartRef.current.offsetX + deltaX,
      y: dragStartRef.current.offsetY + deltaY
    };
    setCropOffset(clampOffset(next, CROP_PREVIEW_SIZE, cropImageSize.width, cropImageSize.height, cropZoom));
  };

  const handleCropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropSource) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    isDraggingRef.current = false;
    setIsDraggingCrop(false);
  };

  const getCropStyle = () => {
    const { width, height } = cropImageSize;
    if (!width || !height) return {};
    const baseScale = getBaseScale(CROP_PREVIEW_SIZE, width, height);
    const scale = baseScale * cropZoom;
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const x = (CROP_PREVIEW_SIZE - scaledWidth) / 2 + cropOffset.x;
    const y = (CROP_PREVIEW_SIZE - scaledHeight) / 2 + cropOffset.y;
    return {
      width: `${scaledWidth}px`,
      height: `${scaledHeight}px`,
      transform: `translate(${x}px, ${y}px)`
    };
  };

  const applyCroppedImage = async () => {
    if (!cropSource) return;
    try {
      const img = new Image();
      img.src = cropSource;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = CROP_OUTPUT_SIZE;
      canvas.height = CROP_OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('ctx');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
      const baseScale = getBaseScale(CROP_OUTPUT_SIZE, img.width, img.height);
      const scale = baseScale * cropZoom;
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const offsetScale = CROP_OUTPUT_SIZE / CROP_PREVIEW_SIZE;
      const scaledOffset = clampOffset(
        { x: cropOffset.x * offsetScale, y: cropOffset.y * offsetScale },
        CROP_OUTPUT_SIZE,
        img.width,
        img.height,
        cropZoom
      );
      const x = (CROP_OUTPUT_SIZE - scaledWidth) / 2 + scaledOffset.x;
      const y = (CROP_OUTPUT_SIZE - scaledHeight) / 2 + scaledOffset.y;
      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('blob');
      const file = new File([blob], `profile_${user.employeeId || user.id}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await uploadProfileImage(file);
      setCropSource(null);
    } catch {
      setProfileError('Unable to apply crop. Try again.');
    }
  };

  const handlePasswordReset = () => {
    const trimmed = passwordInput.trim();
    if (!trimmed) {
      setPasswordError('Enter a new security key.');
      return;
    }
    if (trimmed.length < 6) {
      setPasswordError('Use at least 6 characters.');
      return;
    }
    if (trimmed !== confirmPasswordInput.trim()) {
      setPasswordError('Passwords do not match.');
      return;
    }
    onUpdateUser({ ...user, password: trimmed });
    setPasswordInput('');
    setConfirmPasswordInput('');
    setPasswordError(null);
    setPasswordSuccess(true);
    setTimeout(() => setPasswordSuccess(false), 3000);
  };

  const downloadTaxDoc = (docName: string) => {
    const content = `BYTECHSOL CORPORATE DOCUMENT\n\nDocument: ${docName}\nEmployee: ${user.name}\nID: ${user.employeeId}\nDate: ${new Date().toLocaleDateString()}\n\nThis is a digitally generated tax document for your records.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docName.replace(/\s+/g, '_')}_${user.name.replace(/\s+/g, '_')}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const myChecklist = checklists.find(c => c.userId === user.id) || {
    userId: user.id,
    type: 'Onboarding',
    items: [
      { id: '1', label: 'Upload ID Documents', completed: false },
      { id: '2', label: 'Submit Emergency Details', completed: false },
      { id: '3', label: 'Laptop Provisioning', completed: false },
      { id: '4', label: 'Office Tour', completed: false }
    ]
  } as UserChecklist;

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const formatLiveDuration = (totalSeconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const isAttendanceExempt = APP_CONFIG.ATTENDANCE_EXEMPT_ROLES.includes(user.role) ||
    (user.employeeId && APP_CONFIG.ATTENDANCE_EXEMPT_EMPLOYEE_IDS.includes(normalizeEmployeeId(user.employeeId)));

  const normalizedEmployeeId = user.employeeId ? normalizeEmployeeId(user.employeeId) : '';
  const matchesUser = (userId?: string, userName?: string) => {
    if (userId === user.id) return true;
    if (normalizedEmployeeId && userId) {
      if (normalizeEmployeeId(String(userId)) === normalizedEmployeeId) return true;
    }
    if (userName && user.name) {
      return normalizeName(userName) === normalizeName(user.name);
    }
    return false;
  };
  const matchesUserRecord = (record: AttendanceRecord) =>
    matchesUser(record.userId, record.userName);
  const activeRecord = [...records]
    .reverse()
    .find(r => matchesUserRecord(r) && isValidDateValue(r.checkIn) && !isValidDateValue(r.checkOut));
  const shiftDate = getShiftDateString(currentTime, shiftStart, shiftEnd);
  const hasShiftRecord = records.some(r => matchesUserRecord(r) && r.date === shiftDate);
  const shiftLocked = hasShiftRecord && !activeRecord;
  const myLeaves = leaves
    .filter(l => matchesUser(l.userId, l.userName) && !l.id.startsWith('auto-absence:'))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const myWfhRequests = wfhRequests
    .filter(r => matchesUser(r.userId, r.userName))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const todayStr = getLocalDateString(new Date());
  const isWfhToday = myWfhRequests.some(req =>
    req.status === 'Approved' && req.startDate <= todayStr && req.endDate >= todayStr
  );
  const weeklyOT = calculateWeeklyOvertime(user.id, records);
  const workMode = user.workMode || 'Onsite';
  const canTrack = workMode === 'Remote' || isWifiConnected || isWfhToday || isCheckinOverride;
  const salaryHidden = Boolean(user.salaryHidden);
  const employeeRecords = records.filter(r => {
    if (r.userId === user.id) return true;
    if (r.userId && normalizedEmployeeId) {
      return normalizeEmployeeId(String(r.userId)) === normalizedEmployeeId;
    }
    if (r.userName && user.name) {
      return r.userName.trim().toLowerCase() === user.name.trim().toLowerCase();
    }
    return false;
  });
  const dedupedEmployeeRecords = Array.from(
    employeeRecords.reduce((map: Map<string, AttendanceRecord>, record) => {
      const key = record.date || '';
      if (!key) return map;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, record);
        return map;
      }
      const existingHasOut = Boolean(existing.checkOut);
      const recordHasOut = Boolean(record.checkOut);
      if (recordHasOut && !existingHasOut) {
        map.set(key, record);
        return map;
      }
      if (!recordHasOut && !existingHasOut) {
        const existingTime = new Date(existing.checkIn || 0).getTime();
        const recordTime = new Date(record.checkIn || 0).getTime();
        if (recordTime > existingTime) {
          map.set(key, record);
        }
      }
      return map;
    }, new Map<string, AttendanceRecord>())
      .values()
  ) as AttendanceRecord[];
  const sortedDedupedEmployeeRecords = [...dedupedEmployeeRecords].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  );
  const visibleEmployeeRecords = sortedDedupedEmployeeRecords.filter(r => r.date || r.checkIn);

  const isManager = Boolean(
    (user.employeeId && APP_CONFIG.TASK_MANAGERS_EMPLOYEE_IDS.includes(normalizeEmployeeId(user.employeeId))) ||
    user.role === Role.CEO ||
    user.role === Role.SUPERADMIN
  );

  const filteredEmployeeRecords = attendanceDateFilter
    ? visibleEmployeeRecords.filter(r => resolveRecordDate(r) === attendanceDateFilter)
    : visibleEmployeeRecords;

  const sortedEmployeeRecords = [...filteredEmployeeRecords].sort((a, b) => {
    const aDate = resolveRecordDate(a);
    const bDate = resolveRecordDate(b);
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return (b.checkIn || '').localeCompare(a.checkIn || '');
  });

  const attendanceItemsPerPage = 7;
  const totalAttendancePages = Math.ceil(sortedEmployeeRecords.length / attendanceItemsPerPage);
  const paginatedEmployeeRecords = sortedEmployeeRecords.slice(
    (attendancePage - 1) * attendanceItemsPerPage,
    attendancePage * attendanceItemsPerPage
  );
  const defaultMonthFilter = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}`;
  const effectiveMonthFilter = attendanceMonthFilter || defaultMonthFilter;
  const attendanceMonthRecords = visibleEmployeeRecords.filter(r => resolveRecordDate(r).startsWith(effectiveMonthFilter));
  const sortedMonthRecords = [...attendanceMonthRecords].sort((a, b) => {
    const aDate = resolveRecordDate(a);
    const bDate = resolveRecordDate(b);
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return (b.checkIn || '').localeCompare(a.checkIn || '');
  });
  const monthSummaryLabel = new Date(`${effectiveMonthFilter}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthTotalHours = attendanceMonthRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);
  const monthOvertimeHours = attendanceMonthRecords.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
  const activeSeconds = activeRecord && isValidDateValue(activeRecord.checkIn)
    ? (currentTime.getTime() - new Date(activeRecord.checkIn).getTime()) / 1000
    : 0;
  const lateAllowance = 3;
  const lateCountThisMonth = records.filter(r => matchesUserRecord(r) && r.status === 'Late' && isSameMonth(r.date, currentTime)).length;
  const lateRemaining = Math.max(0, lateAllowance - lateCountThisMonth);
  const monthlySalary = calculateTotalSalary(user.basicSalary, user.allowances, user.salary);
  const dailySalary = monthlySalary ? Math.round(monthlySalary / 30) : null;
  const paidLeavesThisMonth = leaves.filter(
    l =>
      matchesUser(l.userId, l.userName) &&
      !l.id.startsWith('auto-absence:') &&
      (l.isPaid ?? true) &&
      l.status === 'Approved' &&
      isSameMonth(l.startDate, currentTime)
  ).length;
  const paidLeaveRemaining = Math.max(0, 1 - paidLeavesThisMonth);
  const {
    startMinutes: shiftStartMinutes,
    endMinutesRaw,
    endMinutesAdjusted: shiftEndMinutes,
    durationHours: shiftHours,
    isOvernight: isOvernightShift
  } = getShiftMetrics(
    shiftStart,
    shiftEnd
  );
  const overtimeEndValue = (getShiftForEmployee(user.employeeId).overtimeEnd) || shiftEnd;
  const [overtimeEndHour, overtimeEndMinute] = overtimeEndValue.split(':').map(Number);
  const overtimeEndMinutesBase = (Number.isFinite(overtimeEndHour) ? overtimeEndHour : 0) * 60 + (Number.isFinite(overtimeEndMinute) ? overtimeEndMinute : 0);
  const overtimeEndMinutes = (isOvernightShift && overtimeEndMinutesBase < shiftStartMinutes)
    ? overtimeEndMinutesBase + 24 * 60
    : overtimeEndMinutesBase;
  const defaultEarlyCheckoutCutoff = shiftEndMinutes - (APP_CONFIG.CHECKOUT_EARLY_RELAXATION_MINS || 0);
  const earlyCheckoutOverrides = ((APP_CONFIG as any).EARLY_CHECKOUT_OVERRIDES || []) as { employeeId: string; cutoff: string }[];

  const resolveRecordEmployeeId = (record?: AttendanceRecord): string => {
    if (!record) return normalizedEmployeeId;
    if (record.userId === user.id && normalizedEmployeeId) return normalizedEmployeeId;
    if (record.userId) {
      const matchingUser = users.find(u => u.id === record.userId);
      if (matchingUser?.employeeId) return normalizeEmployeeId(matchingUser.employeeId);
      return normalizeEmployeeId(String(record.userId));
    }
    if (record.userName) {
      const matchingByName = users.find(u => u.name && normalizeName(u.name) === normalizeName(record.userName));
      if (matchingByName?.employeeId) return normalizeEmployeeId(matchingByName.employeeId);
    }
    return normalizedEmployeeId;
  };

  const toAdjustedMinutes = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    const base = (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
    return isOvernightShift && base < shiftStartMinutes ? base + 24 * 60 : base;
  };

  const getEarlyCheckoutCutoffMinutes = (record?: AttendanceRecord) => {
    const recordEmployeeId = resolveRecordEmployeeId(record);
    const override = earlyCheckoutOverrides.find(({ employeeId }) =>
      recordEmployeeId && normalizeEmployeeId(employeeId) === recordEmployeeId
    );
    if (override?.cutoff) {
      return toAdjustedMinutes(override.cutoff);
    }
    return defaultEarlyCheckoutCutoff;
  };

  const getOvertimeMinutesForRecord = (record: AttendanceRecord) => {
    if (!record.checkIn || !record.checkOut) {
      return Number.isFinite(record.overtimeHours) ? (record.overtimeHours || 0) * 60 : 0;
    }
    const checkInDate = new Date(record.checkIn);
    const checkOutDate = new Date(record.checkOut);
    const checkInMinutes = getShiftAdjustedMinutes(
      checkInDate,
      shiftStart,
      shiftEnd
    ).currentMinutes;
    const checkOutRawMinutes = getLocalTimeMinutes(checkOutDate);
    const checkOutMinutes = isOvernightShift && checkOutRawMinutes < shiftStartMinutes
      ? checkOutRawMinutes + 24 * 60
      : checkOutRawMinutes;
    const earlyMinutes = Math.max(0, shiftStartMinutes - checkInMinutes);
    const lateMinutes = Math.max(0, checkOutMinutes - overtimeEndMinutes);
    return earlyMinutes + lateMinutes;
  };

  const getEarlyCheckoutMinutesForRecord = (record: AttendanceRecord) => {
    if (!record.checkOut) return 0;
    const earlyCheckoutCutoff = getEarlyCheckoutCutoffMinutes(record);
    const checkOutDate = new Date(record.checkOut);
    const checkOutRawMinutes = getLocalTimeMinutes(checkOutDate);
    const checkOutMinutes = isOvernightShift && checkOutRawMinutes < shiftStartMinutes
      ? checkOutRawMinutes + 24 * 60
      : checkOutRawMinutes;
    if (checkOutMinutes >= earlyCheckoutCutoff) return 0;
    return Math.max(0, earlyCheckoutCutoff - checkOutMinutes);
  };

  const shiftWindowStart = shiftStartMinutes;
  const shiftWindowEnd = endMinutesRaw;
  const nowMinutesRaw = getLocalTimeMinutes(currentTime);
  const inShiftWindow = isOvernightShift
    ? nowMinutesRaw >= shiftWindowStart || nowMinutesRaw < shiftWindowEnd
    : nowMinutesRaw >= shiftWindowStart && nowMinutesRaw < shiftWindowEnd;
  const overtimeWindowAllowed = !inShiftWindow;
  const overtimeTargetRecord = sortedEmployeeRecords.find(r => r.checkOut);
  const overtimeRecord = overtimeRecordId
    ? records.find(r => r.id === overtimeRecordId) || overtimeTargetRecord
    : overtimeTargetRecord;
  const canShowOvertimeToggle = Boolean(overtimeRecord) && !activeRecord;
  const canStartOvertime = Boolean(overtimeRecord) && overtimeWindowAllowed && !activeRecord;

  const clearOvertimeTimers = () => {
    if (overtimeTimerRef.current) {
      window.clearTimeout(overtimeTimerRef.current);
      overtimeTimerRef.current = null;
    }
    if (overtimeIntervalRef.current) {
      window.clearInterval(overtimeIntervalRef.current);
      overtimeIntervalRef.current = null;
    }
  };

  const applyOvertimeMinutes = (record: AttendanceRecord, minutes: number) => {
    if (!record.checkIn || !record.checkOut) return;
    if (minutes <= 0) return;
    const checkInDate = new Date(record.checkIn);
    const checkOutDate = new Date(record.checkOut);
    if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) return;
    const updatedCheckOut = new Date(checkOutDate.getTime() + minutes * 60 * 1000);
    const totalHours = (updatedCheckOut.getTime() - checkInDate.getTime()) / (1000 * 60 * 60);
    const overtimeHours = Math.max(0, totalHours - shiftHours);
    onUpdateRecord({
      ...record,
      checkOut: updatedCheckOut.toISOString(),
      totalHours,
      overtimeHours,
      localUpdatedAt: new Date().toISOString()
    });
  };

  const stopOvertime = (autoStop: boolean) => {
    const active = overtimeActiveRef.current;
    const startAt = overtimeStartRef.current;
    const recordId = overtimeRecordRef.current;
    if (!active || !startAt || !recordId) {
      clearOvertimeTimers();
      setOvertimeActive(false);
      setOvertimeEndsAt(null);
      setOvertimeStartAt(null);
      setOvertimeRemainingSec(0);
      setOvertimeRecordId(null);
      overtimeActiveRef.current = false;
      overtimeStartRef.current = null;
      overtimeRecordRef.current = null;
      return;
    }
    const elapsedMs = Date.now() - startAt;
    const elapsedMinutes = Math.min(15, Math.max(0, Math.round(elapsedMs / 60000)));
    const latestRecord = records.find(r => r.id === recordId) || overtimeRecord;
    if (latestRecord) {
      applyOvertimeMinutes(latestRecord, elapsedMinutes);
    }
    clearOvertimeTimers();
    setOvertimeActive(false);
    setOvertimeEndsAt(null);
    setOvertimeStartAt(null);
    setOvertimeRemainingSec(0);
    setOvertimeRecordId(null);
    overtimeActiveRef.current = false;
    overtimeStartRef.current = null;
    overtimeRecordRef.current = null;
  };

  const startOvertime = () => {
    if (!canStartOvertime || !overtimeRecord) return;
    const startAt = Date.now();
    const endsAt = startAt + 15 * 60 * 1000;
    setOvertimeActive(true);
    setOvertimeStartAt(startAt);
    setOvertimeEndsAt(endsAt);
    setOvertimeRemainingSec(15 * 60);
    setOvertimeRecordId(overtimeRecord.id);
    overtimeActiveRef.current = true;
    overtimeStartRef.current = startAt;
    overtimeRecordRef.current = overtimeRecord.id;
    clearOvertimeTimers();
    overtimeTimerRef.current = window.setTimeout(() => stopOvertime(true), 15 * 60 * 1000);
    overtimeIntervalRef.current = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setOvertimeRemainingSec(remaining);
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (overtimeActiveRef.current) {
        stopOvertime(true);
      }
    };
  }, []);

  useEffect(() => {
    if (!overtimeActiveRef.current) return;
    const recordId = overtimeRecordRef.current;
    if (!recordId) return;
    const stillExists = records.some(r => r.id === recordId);
    if (!stillExists) {
      stopOvertime(true);
    }
  }, [records]);

  const monthLabel = new Date(`${effectiveMonthFilter}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthRecords = attendanceMonthRecords;
  const overtimeMinutesThisMonth = monthRecords.reduce((sum, record) => sum + getOvertimeMinutesForRecord(record), 0);
  const overtimeHoursThisMonth = overtimeMinutesThisMonth / 60;
  const earlyCheckoutMinutesThisMonth = monthRecords.reduce((sum, record) => sum + getEarlyCheckoutMinutesForRecord(record), 0);
  const earlyCheckoutHoursThisMonth = earlyCheckoutMinutesThisMonth / 60;
  const hourlyRate = monthlySalary > 0 ? (monthlySalary / 30) / shiftHours : 0;
  const overtimePay = overtimeHoursThisMonth * hourlyRate;
  const earlyCheckoutDeduction = earlyCheckoutHoursThisMonth * hourlyRate;
  const monthDate = new Date(`${effectiveMonthFilter}-01T00:00:00`);
  const absentDaysThisMonth = leaves
    .filter(l => matchesUser(l.userId, l.userName) && l.id.startsWith('auto-absence:') && l.status === 'Approved' && isSameMonth(l.startDate, monthDate))
    .reduce((sum, leave) => sum + countLeaveDaysInMonth(leave, monthDate), 0);
  const unpaidLeaveDays = leaves
    .filter(l => matchesUser(l.userId, l.userName) && l.status === 'Approved' && l.isPaid === false && isSameMonth(l.startDate, monthDate))
    .reduce((sum, leave) => sum + countLeaveDaysInMonth(leave, monthDate), 0);
  const leaveDeduction = unpaidLeaveDays * (monthlySalary / 30);
  const baseAfterLeave = Math.max(0, monthlySalary - leaveDeduction);
  const taxableSalary = Math.max(0, baseAfterLeave - earlyCheckoutDeduction);
  const monthlyTax = calculateMonthlyTax(taxableSalary);
  const salaryAfterTax = Math.max(0, taxableSalary - monthlyTax);
  const netPay = salaryAfterTax + overtimePay;

  const downloadSalarySlip = () => {
    const monthKey = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}`;
    const slipId = `${user.employeeId}_${monthKey}`;
    const basicPay = Number(user.basicSalary) || (Number(user.salary) || 0);
    const allowancePay = Number(user.allowances) || 0;
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Salary Slip ${slipId}</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; }
            .card { max-width: 700px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; }
            h1 { font-size: 20px; margin: 0 0 6px; text-align: center; }
            .meta { font-size: 12px; text-align: center; color: #64748b; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
            th { text-align: left; background: #f1f5f9; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; color: #64748b; }
            td:last-child { text-align: right; font-weight: 700; }
            .total { font-weight: 800; }
            .summary { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between; align-items: center; }
            .net { font-size: 18px; font-weight: 800; color: #2563eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Salary Slip</h1>
            <div class="meta">Month: ${monthLabel} • Employee: ${user.name} • ID: ${user.employeeId}</div>
            <table>
              <tr><th>Earnings</th><th>Amount</th></tr>
              <tr><td>Basic Salary</td><td>${formatCurrency(basicPay)}</td></tr>
              <tr><td>Allowances</td><td>${formatCurrency(allowancePay)}</td></tr>
              <tr><td>Overtime (${overtimeHoursThisMonth.toFixed(2)} hrs)</td><td>${formatCurrency(overtimePay)}</td></tr>
              <tr><th>Deductions</th><th>Amount</th></tr>
              <tr><td>Unpaid Leave (${unpaidLeaveDays} days)</td><td>- ${formatCurrency(leaveDeduction)}</td></tr>
              <tr><td>Early Checkout (${earlyCheckoutHoursThisMonth.toFixed(2)} hrs)</td><td>- ${formatCurrency(earlyCheckoutDeduction)}</td></tr>
              <tr><td>Absents (auto) (${absentDaysThisMonth} days)</td><td>Included</td></tr>
              <tr><td>Tax (PK progressive)</td><td>- ${formatCurrency(monthlyTax)}</td></tr>
              <tr><td class="total">Taxable Salary</td><td class="total">${formatCurrency(taxableSalary)}</td></tr>
              <tr><td class="total">Salary After Tax</td><td class="total">${formatCurrency(salaryAfterTax)}</td></tr>
              <tr><td class="total">Net Pay (with overtime)</td><td class="total">${formatCurrency(netPay)}</td></tr>
            </table>
            <div class="summary">
              <div>Overtime is not taxed</div>
              <div class="net">${formatCurrency(netPay)}</div>
            </div>
          </div>
        </body>
      </html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Salary_Slip_${slipId}.html`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getDisplayStatus = (record: AttendanceRecord) => {
    if (user.workMode === 'Remote') return 'On-Time';
    if (!record.checkIn) return record.status || 'On-Time';
    const checkInDate = new Date(record.checkIn);
    if (Number.isNaN(checkInDate.getTime())) return record.status || 'On-Time';
    const { currentMinutes, startMinutes } = getShiftAdjustedMinutes(
      checkInDate,
      shiftStart,
      shiftEnd
    );
    const shiftDate = getShiftDateString(checkInDate, shiftStart, shiftEnd);
    const weekday = getWeekdayLabel(shiftDate);
    const isNoLateWindow = user.employeeId && normalizeEmployeeId(user.employeeId) === 'BS-DABA010'
      && ['Mon', 'Tue', 'Wed', 'Thu'].includes(weekday);
    if (isNoLateWindow) return 'On-Time';
    const relaxation = APP_CONFIG.GRACE_PERIOD_MINS;
    if (currentMinutes < startMinutes) return 'Early';
    if (currentMinutes <= startMinutes + relaxation) return 'On-Time';

    const userId = user?.employeeId ? normalizeEmployeeId(user.employeeId) : '';
    const generalExemptIds = (APP_CONFIG as any).LATE_EXEMPT_EMPLOYEE_IDS || [];
    const isGeneralExempt = Boolean(userId) && generalExemptIds.includes(userId);
    const [genCutoffHour, genCutoffMinute] = ((APP_CONFIG as any).LATE_EXEMPT_CUTOFF || "20:00").split(':').map(Number);
    const genCutoffBase = genCutoffHour * 60 + genCutoffMinute;
    const isOvernight = shiftEndMinutes <= shiftStartMinutes;
    const genCutoffAdjusted = isOvernight && genCutoffBase < (shiftEndMinutes || 0) ? genCutoffBase + 24 * 60 : genCutoffBase;

    if (isGeneralExempt && currentMinutes <= genCutoffAdjusted) {
      return 'On-Time';
    }

    return 'Late';
  };

  const getCheckoutStatus = (record: AttendanceRecord) => {
    if (!isValidDateValue(record.checkOut)) return 'Active';
    const earlyCheckoutCutoff = getEarlyCheckoutCutoffMinutes(record);
    const checkOutDate = new Date(record.checkOut);
    const checkOutRawMinutes = getLocalTimeMinutes(checkOutDate);
    const checkOutMinutes = isOvernightShift && checkOutRawMinutes < shiftStartMinutes
      ? checkOutRawMinutes + 24 * 60
      : checkOutRawMinutes;
    if (checkOutMinutes < earlyCheckoutCutoff) return 'Early';
    if (checkOutMinutes > overtimeEndMinutes) return 'Overtime';
    return 'On-Time';
  };

  const toggleChecklistItem = (itemId: string) => {
    const updatedItems = myChecklist.items.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    onUpdateChecklist({ ...myChecklist, items: updatedItems });
  };

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Premium Dashboard Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <Icon3D icon="LayoutDashboard" size="lg" variant="blue" />
          <div className="space-y-1">
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
              System <span className="text-blue-600">Dashboard</span>
            </h1>
            <p className="text-slate-500 font-medium">Welcome back, {user.name}. Here's your status for today.</p>
          </div>
        </div>

        {/* Tab Navigation - Premium Pill Style */}
        <div className="flex items-center p-2 bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 shadow-xl shadow-blue-500/5 w-fit overflow-x-auto no-scrollbar">
          {[
            { id: 'attendance', label: 'Attendance', icon: 'Calendar' },
            { id: 'leaves', label: 'Leaves', icon: 'Plane' },
            { id: 'tasks', label: 'Tasks', icon: 'ListChecks' },
            { id: 'checklists', label: 'Checklist', icon: 'ClipboardCheck' },
            { id: 'profile', label: 'Profile', icon: 'User' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id as any)}
              className={`flex items-center gap-2 pr-6 py-2 rounded-[1.8rem] text-[11px] font-black uppercase tracking-widest transition-all duration-500 whitespace-nowrap ${tab === item.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40 transform scale-105 pl-2'
                : 'text-slate-500 hover:text-blue-600 hover:bg-white pl-2'
                }`}
            >
              <Icon3D
                icon={item.icon as any}
                size="sm"
                variant={tab === item.id ? 'blue' : 'slate'}
                className={tab === item.id ? 'bg-white/20 border-white/20' : ''}
              />
              {item.label}
            </button>
          ))}
        </div>
      </div>


      {/* Dashboard Tabs Content */}
      <div className="relative min-h-[600px]">
        {tab === 'attendance' && (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-4 space-y-8">
                <div className="glass-card rounded-[3rem] p-8 text-center relative overflow-hidden border border-white/40 shadow-2xl animate-scale-in">
                  <div className={`absolute top-0 right-0 px-6 py-2 text-[11px] font-black uppercase tracking-widest ${workMode === 'Remote' ? 'bg-slate-900 text-white' : isWifiConnected ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                    {workMode === 'Remote' ? 'Remote Mode' : isWifiConnected ? 'Network Secure' : 'Access Restricted'}
                  </div>

                  <div className="mt-4">
                    <h1 className="text-5xl font-black text-slate-900 tracking-tighter">
                      {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </h1>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-2">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>

                    {activeRecord && (
                      <div className="mt-6 flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-full border border-emerald-100 w-fit animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Live: {formatDuration(calculateDuration(activeRecord.checkIn, currentTime))}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 my-8">
                    <div className="p-4 bg-blue-50/50 rounded-[2rem] border border-blue-100/50 group hover:bg-blue-600 transition-all duration-500 relative overflow-hidden">
                      <div className="relative z-10">
                        <Icon3D icon="Activity" size="xs" variant="blue" className="mb-2 group-hover:bg-white group-hover:border-white" />
                        <p className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-1 group-hover:text-blue-100 transition-colors">Overtime</p>
                        <p className="text-lg font-black text-blue-600 group-hover:text-white transition-colors">{weeklyOT > 0 ? formatDuration(weeklyOT) : '0h 0m'}</p>
                      </div>
                    </div>
                    <div className="p-4 bg-emerald-50/50 rounded-[2rem] border border-emerald-100/50 group hover:bg-emerald-600 transition-all duration-500 relative overflow-hidden">
                      <div className="relative z-10">
                        <Icon3D icon="Timer" size="xs" variant="emerald" className="mb-2 group-hover:bg-white group-hover:border-white" />
                        <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-1 group-hover:text-emerald-100 transition-colors">Live</p>
                        <p className="text-lg font-black text-emerald-600 group-hover:text-white transition-colors">
                          {activeRecord && !activeRecord.checkOut ? formatLiveDuration(activeSeconds) : 'No Session'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {workMode !== 'Remote' && (
                    <div className="mb-8 p-4 bg-amber-50/50 rounded-[2rem] border border-amber-100/50">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                          <Icon3D icon="History" size="xs" variant="amber" />
                          <p className="text-[11px] font-black text-amber-500 uppercase tracking-widest">Late Allowance</p>
                        </div>
                        <p className="text-sm font-black text-amber-600">{lateRemaining} left</p>
                      </div>
                      <div className="w-full bg-amber-100 h-1 rounded-full mt-4 overflow-hidden">
                        <div
                          className="bg-amber-500 h-full transition-all duration-1000"
                          style={{ width: `${(lateRemaining / lateAllowance) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {!canTrack && !isAttendanceExempt ? (
                    <div className="p-6 bg-rose-50 rounded-[2rem] text-[11px] font-black text-rose-600 uppercase tracking-widest border border-rose-100">
                      Connect to Office Wi-Fi
                    </div>
                  ) : isAttendanceExempt ? (
                    <div className="p-6 bg-slate-50 rounded-[2rem] text-[11px] font-black text-slate-500 uppercase tracking-widest border border-slate-100">
                      Attendance Not Required
                    </div>
                  ) : (
                    <button
                      onClick={activeRecord ? onCheckOut : onCheckIn}
                      disabled={!canTrack || shiftLocked}
                      className={`w-full py-6 rounded-[2rem] font-black text-xl shadow-[0_20px_50px_rgba(37,99,235,0.2)] transition-all duration-500 ${activeRecord
                        ? 'bg-rose-600 text-white hover:bg-rose-700 hover:shadow-rose-500/30'
                        : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/30 disabled:opacity-30'
                        }`}
                    >
                      {activeRecord ? 'Check Out' : shiftLocked ? 'Shift Done' : 'Check In'}
                    </button>
                  )}

                  {canShowOvertimeToggle && (
                    <div className="mt-6 p-5 bg-slate-50/80 rounded-[2.5rem] border border-slate-100 transition-all hover:border-blue-200">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-left">
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">OT Boost</p>
                          <p className="text-[11px] font-bold text-slate-500">15 min max</p>
                        </div>
                        <button
                          type="button"
                          onClick={overtimeActive ? () => stopOvertime(false) : startOvertime}
                          disabled={!canStartOvertime && !overtimeActive}
                          className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-500 ${overtimeActive ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'} disabled:opacity-40`}
                        >
                          {overtimeActive ? 'Stop' : 'Start'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-8">
                <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 h-full overflow-hidden">
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Activity Log</h3>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <label htmlFor="employee-attendance-date" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Filter Date</label>
                        <div className="relative">
                          <input
                            id="employee-attendance-date"
                            type="date"
                            value={attendanceDateFilter}
                            onChange={e => setAttendanceDateFilter(e.target.value)}
                            className="px-4 py-2 pr-10 rounded-xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none text-[11px] font-black text-slate-700 cursor-pointer appearance-none"
                            ref={attendanceDateRef}
                            onClick={() => {
                              attendanceDateRef.current?.showPicker?.();
                              attendanceDateRef.current?.focus();
                            }}
                            onFocus={() => {
                              attendanceDateRef.current?.showPicker?.();
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              attendanceDateRef.current?.showPicker?.();
                              attendanceDateRef.current?.focus();
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-all z-10"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10m-12 8h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                          </button>
                        </div>
                      </div>
                      {attendanceDateFilter && (
                        <button
                          type="button"
                          onClick={() => setAttendanceDateFilter('')}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-all"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left">
                      <thead>
                        <tr className="text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-50">
                          <th className="pb-4">Date</th>
                          <th className="pb-4">Check In</th>
                          <th className="pb-4">Check Out</th>
                          <th className="pb-4 text-right">Hours</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {paginatedEmployeeRecords.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50/50 transition-all">
                            <td className="py-6 font-black text-slate-900">{resolveRecordDate(r)}</td>
                            <td className="py-6">
                              <div className="flex flex-col">
                                <span className="text-xs font-black">{formatTimeInZone(r.checkIn)}</span>
                                <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest w-fit mt-1 ${getDisplayStatus(r) === 'Late' ? 'bg-rose-50 text-rose-600' : getDisplayStatus(r) === 'Early' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{getDisplayStatus(r)}</span>
                              </div>
                            </td>
                            <td className="py-6">
                              <div className="flex flex-col">
                                <span className="text-xs font-black">{isValidDateValue(r.checkOut) ? formatTimeInZone(r.checkOut) : 'Active'}</span>
                                <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest w-fit mt-1 ${getCheckoutStatus(r) === 'Early' ? 'bg-rose-50 text-rose-600' : getCheckoutStatus(r) === 'Overtime' ? 'bg-emerald-50 text-emerald-600' : getCheckoutStatus(r) === 'On-Time' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'}`}>{getCheckoutStatus(r)}</span>
                              </div>
                            </td>
                            <td className="py-6 font-black text-blue-600 text-right">{r.totalHours ? formatDuration(r.totalHours) : 'Active'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalAttendancePages > 1 && (
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-50">
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Page {attendancePage} of {totalAttendancePages}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAttendancePage(p => Math.max(1, p - 1))}
                          disabled={attendancePage === 1}
                          className="px-4 py-2 rounded-xl bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-all font-black"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttendancePage(p => Math.min(totalAttendancePages, p + 1))}
                          disabled={attendancePage === totalAttendancePages}
                          className="px-4 py-2 rounded-xl bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-all font-black"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 mt-6">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8 border-b border-slate-50 pb-6">
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Monthly Analytics</h3>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{monthSummaryLabel}</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-50/50 p-2 rounded-[2rem] border border-slate-100">
                    <div className="flex items-center gap-2 px-4 py-2">
                      <label htmlFor="employee-attendance-month" className="text-[11px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Selected Month</label>
                      <div className="relative">
                        <input
                          id="employee-attendance-month"
                          type="month"
                          value={attendanceMonthFilter}
                          onChange={e => setAttendanceMonthFilter(e.target.value)}
                          className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-[11px] font-black text-slate-700 outline-none focus:border-blue-500 transition-all cursor-pointer appearance-none min-w-[140px]"
                          ref={attendanceMonthRef}
                          onClick={(e) => {
                            (e.target as any).showPicker?.();
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pr-2">
                      <div className="flex flex-col items-center px-6 py-2 bg-white rounded-2xl shadow-sm border border-slate-100">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Hours</span>
                        <span className="text-sm font-black text-slate-900">{formatDuration(monthTotalHours)}</span>
                      </div>
                      <div className="flex flex-col items-center px-6 py-2 bg-emerald-50 rounded-2xl shadow-sm border border-emerald-100">
                        <span className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest mb-1">Overtime</span>
                        <span className="text-sm font-black text-emerald-600">{formatDuration(monthOvertimeHours)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {sortedMonthRecords.length === 0 ? (
                <div className="text-center py-20 bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-slate-300 shadow-sm">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10m-12 8h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  </div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">No analytics for {monthSummaryLabel}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left">
                    <thead>
                      <tr className="text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-50">
                        <th className="pb-4">Date</th>
                        <th className="pb-4">Check In</th>
                        <th className="pb-4">Check Out</th>
                        <th className="pb-4 text-right">Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {sortedMonthRecords.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50/50 transition-all">
                          <td className="py-6 font-black text-slate-900">{resolveRecordDate(r)}</td>
                          <td className="py-6">
                            <div className="flex flex-col">
                              <span className="text-xs font-black">{formatTimeInZone(r.checkIn)}</span>
                              <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest w-fit mt-1 ${getDisplayStatus(r) === 'Late' ? 'bg-rose-50 text-rose-600' : getDisplayStatus(r) === 'Early' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{getDisplayStatus(r)}</span>
                            </div>
                          </td>
                          <td className="py-6">
                            <div className="flex flex-col">
                              <span className="text-xs font-black">{isValidDateValue(r.checkOut) ? formatTimeInZone(r.checkOut) : 'Active'}</span>
                              <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest w-fit mt-1 ${getCheckoutStatus(r) === 'Early' ? 'bg-rose-50 text-rose-600' : getCheckoutStatus(r) === 'Overtime' ? 'bg-emerald-50 text-emerald-600' : getCheckoutStatus(r) === 'On-Time' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'}`}>{getCheckoutStatus(r)}</span>
                            </div>
                          </td>
                          <td className="py-6 font-black text-blue-600 text-right">{r.totalHours ? formatDuration(r.totalHours) : 'Active'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'leaves' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="space-y-8">
              <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 space-y-8">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Apply for Leave</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label htmlFor="leave-start" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Start Date</label>
                      <input
                        id="leave-start"
                        type="date"
                        value={leaveStartDate}
                        onChange={e => setLeaveStartDate(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-[11px] font-black outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="leave-end" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">End Date</label>
                      <input
                        id="leave-end"
                        type="date"
                        value={leaveEndDate}
                        onChange={e => setLeaveEndDate(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-[11px] font-black outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="leave-application" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Leave Application (Template)</label>
                    <textarea id="leave-application" name="leaveApplication" value={leaveApplication} onChange={e => setLeaveApplication(e.target.value)} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none h-40 resize-none" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Paid leave remaining this month: {paidLeaveRemaining}</p>
                    {paidLeaveRemaining === 0 && (
                      <p className="text-[11px] font-black text-amber-600 uppercase tracking-widest">This request will be unpaid</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (!leaveStartDate || !leaveEndDate) return;
                      const safeStart = leaveStartDate <= leaveEndDate ? leaveStartDate : leaveEndDate;
                      const safeEnd = leaveStartDate <= leaveEndDate ? leaveEndDate : leaveStartDate;
                      onSubmitLeave(safeStart, safeEnd, leaveApplication);
                      const todayStr = getLocalDateString(new Date());
                      setLeaveStartDate(todayStr);
                      setLeaveEndDate(todayStr);
                      setLeaveApplication(buildLeaveTemplate(user));
                    }}
                    className="w-full premium-gradient text-white py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl"
                  >
                    Submit Application
                  </button>
                </div>
              </div>

              <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 space-y-6">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Work From Home Request</h3>
                {user.workMode === 'Remote' ? (
                  <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">You are already remote.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label htmlFor="wfh-start" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Start Date</label>
                        <input
                          id="wfh-start"
                          type="date"
                          value={wfhStartDate}
                          onChange={e => setWfhStartDate(e.target.value)}
                          className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-[11px] font-black outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="wfh-end" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">End Date</label>
                        <input
                          id="wfh-end"
                          type="date"
                          value={wfhEndDate}
                          onChange={e => setWfhEndDate(e.target.value)}
                          className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-[11px] font-black outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="wfh-reason" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Reason</label>
                      <textarea
                        id="wfh-reason"
                        name="wfhReason"
                        value={wfhReason}
                        onChange={e => setWfhReason(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none h-24 resize-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = wfhReason.trim();
                        if (!trimmed || !wfhStartDate || !wfhEndDate) return;
                        onSubmitWfhRequest(trimmed, wfhStartDate, wfhEndDate);
                        setWfhReason('');
                      }}
                      className="w-full bg-slate-900 text-white py-4 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all"
                    >
                      Request WFH
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-6 h-[600px] overflow-y-auto pr-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Request Status</h3>
              {myLeaves.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-[3rem] font-black text-slate-400 uppercase text-xs tracking-widest">No requests found</div>
              ) : (
                myLeaves.map(l => (
                  <div key={l.id} className="glass-card rounded-[2rem] p-8 border-l-8 border-blue-500 hover:scale-[1.01] transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{l.startDate} - {l.endDate}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest ${l.status === 'Pending' ? 'bg-amber-50 text-amber-600' : l.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : l.status === 'Cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-600'}`}>{l.status}</span>
                        <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest ${l.isPaid === false ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'}`}>{l.isPaid === false ? 'Unpaid' : 'Paid'}</span>
                        {l.status === 'Pending' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm('Cancel this leave request?')) return;
                              onCancelLeave(l.id);
                            }}
                            className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-slate-800">"{l.reason}"</p>
                    <p className="text-[11px] font-black text-slate-400 uppercase mt-4">Submitted on {new Date(l.submittedAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
              <div className="pt-6 border-t border-slate-100">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4">WFH Requests</h4>
                {myWfhRequests.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-[2rem] font-black text-slate-400 uppercase text-[11px] tracking-widest">No WFH requests</div>
                ) : (
                  myWfhRequests.map(req => (
                    <div key={req.id} className="glass-card rounded-[2rem] p-6 mb-3 border-l-8 border-slate-300">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{req.startDate} → {req.endDate}</span>
                        <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest ${req.status === 'Pending' ? 'bg-amber-50 text-amber-600' : req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{req.status}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-700">"{req.reason}"</p>
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-2">Requested on {new Date(req.submittedAt).toLocaleDateString()}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8 space-y-8">
              <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 space-y-8">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Profile Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1 md:col-span-2">
                      <label htmlFor="profile-photo" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Profile Photo (PNG/JPG)</label>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                          {resolvedProfileImage ? (
                            <img
                              src={resolvedProfileImage}
                              alt="Profile"
                              className="w-full h-full object-cover"
                              onError={handleProfileImageError}
                            />
                          ) : (
                            <span className="text-[11px] font-black text-slate-500 uppercase">No Photo</span>
                          )}
                        </div>
                        <div className="space-y-2">
                          <input
                            id="profile-photo"
                            name="profilePhoto"
                            type="file"
                            accept="image/png,image/jpeg"
                            onChange={e => handleProfileImageChange(e.target.files?.[0] || null)}
                            className="w-full text-xs font-bold text-slate-500"
                          />
                          {profileImage && (
                            <button
                              type="button"
                              onClick={() => setProfileImage(null)}
                              className="text-[11px] font-black uppercase tracking-widest text-rose-600"
                            >
                              Remove Photo
                            </button>
                          )}
                        </div>
                      </div>
                      {cropSource && (
                        <div className="mt-4 p-4 rounded-2xl border border-slate-100 bg-slate-50 space-y-4">
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Adjust Photo</p>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div
                              className="relative rounded-2xl overflow-hidden border border-slate-200 bg-white"
                              style={{ width: `${CROP_PREVIEW_SIZE}px`, height: `${CROP_PREVIEW_SIZE}px`, touchAction: 'none' }}
                              onPointerDown={handleCropPointerDown}
                              onPointerMove={handleCropPointerMove}
                              onPointerUp={handleCropPointerUp}
                              onPointerLeave={handleCropPointerUp}
                            >
                              <img
                                src={cropSource}
                                alt="Crop preview"
                                className={`absolute top-0 left-0 select-none ${isDraggingCrop ? 'cursor-grabbing' : 'cursor-grab'}`}
                                style={getCropStyle()}
                                draggable={false}
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Zoom</label>
                              <input
                                type="range"
                                min="0.7"
                                max="3"
                                step="0.01"
                                value={cropZoom}
                                onChange={e => setCropZoom(Number(e.target.value))}
                                className="w-full"
                              />
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={applyCroppedImage}
                                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest"
                                >
                                  Apply Photo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCropSource(null)}
                                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-500 text-[11px] font-black uppercase tracking-widest"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                          <p className="text-[11px] font-bold text-slate-500">Drag to move. Zoom to fit.</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="profile-name" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Full Name</label>
                      <input
                        id="profile-name"
                        name="name"
                        type="text"
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        disabled={user.role !== Role.HR}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none disabled:opacity-60"
                      />
                      {user.role !== Role.HR && (
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-2">Name changes require HR.</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="profile-email" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Email Address</label>
                      <input
                        id="profile-email"
                        name="email"
                        type="email"
                        value={profileEmail}
                        onChange={e => setProfileEmail(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="profile-phone" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Phone Number</label>
                      <input
                        id="profile-phone"
                        name="phone"
                        type="text"
                        value={profilePhone}
                        onChange={e => setProfilePhone(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none"
                      />
                    </div>
                  </div>
                </div>
                {profileError && (
                  <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest">{profileError}</p>
                )}
                {profileSaved && (
                  <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Profile updated</p>
                )}
                <button
                  onClick={handleProfileSave}
                  disabled={profileUploading}
                  className="w-full premium-gradient text-white py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl disabled:opacity-60"
                >
                  {profileUploading ? 'Uploading Photo...' : 'Save Profile'}
                </button>
              </div>

              <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 space-y-10">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Emergency Contact</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <label htmlFor="ess-emergency-name" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Contact Name</label>
                      <input id="ess-emergency-name" name="emergencyContactName" type="text" value={editProfile.emergencyContactName} onChange={e => setEditProfile({ ...editProfile, emergencyContactName: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="ess-emergency-relation" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Relationship</label>
                      <input id="ess-emergency-relation" name="emergencyContactRelation" type="text" value={editProfile.emergencyContactRelation} onChange={e => setEditProfile({ ...editProfile, emergencyContactRelation: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label htmlFor="ess-emergency-phone" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Phone Number</label>
                      <input id="ess-emergency-phone" name="emergencyContactPhone" type="text" value={editProfile.emergencyContactPhone} onChange={e => setEditProfile({ ...editProfile, emergencyContactPhone: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {saveSuccess && (
                    <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-xs font-bold text-center border border-emerald-100 animate-in fade-in slide-in-from-top-2">
                      Profile updated successfully!
                    </div>
                  )}
                  <button onClick={handleESSUpdate} className="w-full premium-gradient text-white py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl">
                    Save Profile Details
                  </button>
                </div>
              </div>
            </div>
            <div className="lg:col-span-4 space-y-6">
              <div className="rounded-[3rem] p-6 sm:p-8 2xl:p-10 bg-blue-600 text-white shadow-blue-200 shadow-2xl relative overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-white/10 blur-[60px] rounded-full" />
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Monthly Compensation</p>
                    <button
                      type="button"
                      onClick={() => onUpdateUser({ ...user, salaryHidden: !salaryHidden })}
                      className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-all text-white"
                    >
                      {salaryHidden ? 'Show Salary' : 'Hide Salary'}
                    </button>
                  </div>
                  <h2 className="text-4xl font-black mt-2">{salaryHidden ? 'Hidden' : `PKR ${monthlySalary.toLocaleString()}`}</h2>
                  <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest opacity-60">Status</p>
                      <p className="text-[11px] font-bold mt-1">Verified Base</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Salary Slip</h3>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-1">{monthLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateUser({ ...user, salaryHidden: !salaryHidden })}
                      className="text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                    >
                      {salaryHidden ? 'Show' : 'Hide'}
                    </button>
                    {!salaryHidden && (
                      <button
                        type="button"
                        onClick={downloadSalarySlip}
                        className="text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-all"
                      >
                        Download
                      </button>
                    )}
                  </div>
                </div>
                {salaryHidden ? (
                  <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Salary slip hidden</p>
                    <p className="text-[11px] font-bold text-slate-500 mt-2">Use “Show” to view details.</p>
                  </div>
                ) : (
                  <>
                    <div className="mt-6 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-500">Base Salary</span>
                        <span className="font-black text-slate-900">{formatCurrency(monthlySalary)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-500">Unpaid Leaves ({unpaidLeaveDays} days)</span>
                        <span className="font-black text-rose-500">- {formatCurrency(leaveDeduction)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-500">Absents (auto)</span>
                        <span className="font-black text-slate-700">{absentDaysThisMonth} days</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-500">Early Checkout ({earlyCheckoutHoursThisMonth.toFixed(2)} hrs)</span>
                        <span className="font-black text-rose-500">- {formatCurrency(earlyCheckoutDeduction)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-500">Overtime ({overtimeHoursThisMonth.toFixed(2)} hrs)</span>
                        <span className="font-black text-emerald-600">+ {formatCurrency(overtimePay)}</span>
                      </div>
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="font-bold text-slate-600">Taxable Salary</span>
                        <span className="font-black text-slate-900">{formatCurrency(taxableSalary)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-500">Tax (PK progressive)</span>
                        <span className="font-black text-amber-600">- {formatCurrency(monthlyTax)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-600">Salary After Tax</span>
                        <span className="font-black text-slate-900">{formatCurrency(salaryAfterTax)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="font-black text-slate-900">Salary with Overtime</span>
                        <span className="font-black text-blue-600">{formatCurrency(netPay)}</span>
                      </div>
                    </div>
                    <p className="mt-5 text-[11px] font-bold text-slate-400 uppercase text-center">Overtime is not taxed</p>
                  </>
                )}
              </div>

              <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Tax Documents</h3>
                <div className="space-y-3">
                  {['Form 16 - 2024', 'W-2 Statement 2024', 'Tax Projection 2025'].map(doc => (
                    <div
                      key={doc}
                      onClick={() => downloadTaxDoc(doc)}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl group cursor-pointer hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100"
                    >
                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight">{doc}</span>
                      <svg className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-[11px] font-bold text-slate-400 uppercase text-center">Digitized Filing Cabinet v1.0</p>
              </div>

              <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Security Key</h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label htmlFor="profile-password" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">New Password</label>
                    <input
                      id="profile-password"
                      name="newPassword"
                      type="password"
                      value={passwordInput}
                      onChange={e => setPasswordInput(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="profile-password-confirm" className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Confirm Password</label>
                    <input
                      id="profile-password-confirm"
                      name="confirmPassword"
                      type="password"
                      value={confirmPasswordInput}
                      onChange={e => setConfirmPasswordInput(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none"
                    />
                  </div>
                  {passwordError && (
                    <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest">{passwordError}</p>
                  )}
                  {passwordSuccess && (
                    <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Password updated</p>
                  )}
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    className="w-full premium-gradient text-white py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl"
                  >
                    Update Password
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'checklists' && (
          <div className="max-w-3xl mx-auto w-full">
            <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 space-y-10">
              <div className="text-center">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">{myChecklist.type} Checklist</h3>
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Complete these steps for your corporate clearance</p>
              </div>

              <div className="space-y-4">
                {myChecklist.items.map(item => (
                  <div
                    key={item.id}
                    onClick={() => toggleChecklistItem(item.id)}
                    className={`flex items-center space-x-5 p-6 rounded-[2rem] border-2 cursor-pointer transition-all ${item.completed ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${item.completed ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-slate-200'}`}>
                      {item.completed && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                    </div>
                    <span className={`text-xs font-black uppercase tracking-tight ${item.completed ? 'text-emerald-700 line-through' : 'text-slate-700'}`}>{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Progress</span>
                  <p className="text-lg font-black text-slate-900">{Math.round((myChecklist.items.filter(i => i.completed).length / myChecklist.items.length) * 100)}% Complete</p>
                </div>
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(myChecklist.items.filter(i => i.completed).length / myChecklist.items.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'tasks' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <TaskBoard
              tasks={tasks}
              users={users}
              currentUser={user}
              isManager={isManager}
              onAddTask={onAddTask}
              onUpdateTask={onUpdateTask}
              onDeleteTask={onDeleteTask}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeDashboard;
