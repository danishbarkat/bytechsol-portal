import React, { useState, useEffect } from 'react';
import { AttendanceRecord, LeaveRequest, User, ESSProfile, UserChecklist, Role } from '../types';
import { formatDuration, calculateWeeklyOvertime } from '../utils/storage';
import { getLocalDateString, getShiftDateString, getShiftAdjustedMinutes } from '../utils/dates';
import { APP_CONFIG } from '../constants';

interface EmployeeDashboardProps {
  user: User;
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  essProfiles: ESSProfile[];
  checklists: UserChecklist[];
  onCheckIn: () => void;
  onCheckOut: () => void;
  isWifiConnected: boolean;
  onSubmitLeave: (start: string, end: string, reason: string) => void;
  onUpdateESS: (profile: ESSProfile) => void;
  onUpdateChecklist: (checklist: UserChecklist) => void;
  onUpdateUser: (user: User) => void;
  onCancelLeave: (leaveId: string) => void;
}

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  user,
  records,
  leaves,
  essProfiles,
  checklists,
  onCheckIn,
  onCheckOut,
  isWifiConnected,
  onSubmitLeave,
  onUpdateESS,
  onUpdateChecklist,
  onUpdateUser,
  onCancelLeave
}) => {
  const [tab, setTab] = useState<'attendance' | 'leaves' | 'profile' | 'checklists'>('attendance');
  const buildLeaveTemplate = (employee: User) =>
    `Leave Application\n\nReason:\n\nRegards,\n${employee.name}\nID: ${employee.employeeId}`;
  const [leaveApplication, setLeaveApplication] = useState(buildLeaveTemplate(user));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [profileName, setProfileName] = useState(user.name || '');
  const [profileEmail, setProfileEmail] = useState(user.email || '');
  const [profilePhone, setProfilePhone] = useState(user.phone || '');
  const [profileImage, setProfileImage] = useState<string | null>(user.profileImage || null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

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
      profileImage: profileImage || undefined
    });
    setProfileError(null);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  const handleProfileImageChange = (file?: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setProfileError('Only PNG or JPG images are allowed.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setProfileError('Image must be under 1MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileImage(reader.result);
        setProfileError(null);
      }
    };
    reader.readAsDataURL(file);
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

  const activeRecord = [...records].reverse().find(r => r.userId === user.id && !r.checkOut);
  const shiftDate = getShiftDateString(currentTime, APP_CONFIG.SHIFT_START, APP_CONFIG.SHIFT_END);
  const hasShiftRecord = records.some(r => r.userId === user.id && r.date === shiftDate);
  const shiftLocked = hasShiftRecord && !activeRecord;
  const myLeaves = leaves.filter(l => l.userId === user.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const weeklyOT = calculateWeeklyOvertime(user.id, records);
  const workMode = user.workMode || 'Onsite';
  const canTrack = workMode === 'Remote' || isWifiConnected;
  const salaryHidden = Boolean(user.salaryHidden);
  const activeSeconds = activeRecord && !activeRecord.checkOut
    ? (currentTime.getTime() - new Date(activeRecord.checkIn).getTime()) / 1000
    : 0;
  const lateAllowance = 3;
  const lateCountThisMonth = records.filter(r => r.userId === user.id && r.status === 'Late' && isSameMonth(r.date, currentTime)).length;
  const lateRemaining = Math.max(0, lateAllowance - lateCountThisMonth);
  const monthlySalary = (Number(user.basicSalary) || 0) + (Number(user.allowances) || 0) || (Number(user.salary) || 0);
  const dailySalary = monthlySalary ? Math.round(monthlySalary / 30) : null;
  const paidLeavesThisMonth = leaves.filter(
    l => l.userId === user.id && (l.isPaid ?? true) && l.status !== 'Cancelled' && isSameMonth(l.startDate, currentTime)
  ).length;
  const paidLeaveRemaining = Math.max(0, 1 - paidLeavesThisMonth);

  const getDisplayStatus = (record: AttendanceRecord) => {
    if (user.workMode === 'Remote') return record.status || 'On-Time';
    if (!record.checkIn) return record.status || 'On-Time';
    const checkInDate = new Date(record.checkIn);
    const { currentMinutes, startMinutes } = getShiftAdjustedMinutes(
      checkInDate,
      APP_CONFIG.SHIFT_START,
      APP_CONFIG.SHIFT_END
    );
    if (currentMinutes < startMinutes) return 'Early';
    return record.status || 'On-Time';
  };

  const toggleChecklistItem = (itemId: string) => {
    const updatedItems = myChecklist.items.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    onUpdateChecklist({ ...myChecklist, items: updatedItems });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">My Workspace</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">{user.position || 'Genral Staff'}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {user.employeeId}</p>
          </div>
          {(user.grade || user.teamLead) && (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
              {user.grade ? `Grade: ${user.grade}` : ''}{user.grade && user.teamLead ? ' • ' : ''}{user.teamLead ? `Team Lead: ${user.teamLead}` : ''}
            </p>
          )}
        </div>
        <div className="flex p-1 bg-slate-100 rounded-2xl overflow-x-auto max-w-full">
          {(['attendance', 'leaves', 'profile', 'checklists'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${tab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4 space-y-8">
            <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 text-center relative overflow-hidden border-2 border-white shadow-2xl">
              <div className={`absolute top-0 right-0 px-5 py-2 text-[9px] font-black uppercase tracking-widest ${workMode === 'Remote' ? 'bg-slate-900 text-white' : isWifiConnected ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                {workMode === 'Remote' ? 'Remote Mode' : isWifiConnected ? 'Network Secure' : 'Access Restricted'}
              </div>
              <h1 className="text-5xl font-black text-slate-900 mt-4">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 mt-2">Local Timezone</p>

              <div className="mb-8 p-6 bg-blue-50/50 rounded-[2rem] border border-blue-100">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Weekly Overtime</p>
                <p className="text-2xl font-black text-blue-600">{weeklyOT > 0 ? formatDuration(weeklyOT) : '0h 0m'}</p>
                <p className="text-[8px] font-bold text-blue-400 uppercase mt-1">Calculated over 40h standard</p>
              </div>

              <div className="mb-8 p-6 bg-emerald-50/60 rounded-[2rem] border border-emerald-100">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Live Session</p>
                {activeRecord && !activeRecord.checkOut ? (
                  <>
                    <p className="text-2xl font-black text-emerald-600">{formatLiveDuration(activeSeconds)}</p>
                    <p className="text-[8px] font-bold text-emerald-500 uppercase mt-1">
                      Started at {new Date(activeRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-bold text-emerald-400 uppercase">No active session</p>
                )}
              </div>

              {workMode === 'Remote' ? (
                <div className="mb-8 p-6 bg-amber-50/60 rounded-[2rem] border border-amber-100">
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Remote Hours</p>
                  <p className="text-sm font-black text-amber-600">Late policy disabled</p>
                  <p className="text-[8px] font-bold text-amber-400 uppercase mt-1">Track 8h daily target</p>
                </div>
              ) : (
                <div className="mb-8 p-6 bg-amber-50/60 rounded-[2rem] border border-amber-100">
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Late Allowance (Monthly)</p>
                  <p className="text-2xl font-black text-amber-600">{lateRemaining} left</p>
                  <p className="text-[8px] font-bold text-amber-400 uppercase mt-1">{lateCountThisMonth}/{lateAllowance} used this month</p>
                  {lateRemaining === 0 && (
                    <p className="text-[9px] font-black text-rose-600 mt-2">
                      1 day salary deduction applied{dailySalary ? ` (~PKR ${dailySalary.toLocaleString()})` : ''}
                    </p>
                  )}
                </div>
              )}

              {!canTrack ? (
                <div className="p-6 bg-rose-50 rounded-[2rem] text-xs font-bold text-rose-600">Connect to Office Wi-Fi</div>
              ) : (
                <button
                  onClick={activeRecord ? onCheckOut : onCheckIn}
                  disabled={!canTrack || shiftLocked}
                  className={`w-full py-6 rounded-[2rem] font-black text-xl shadow-xl transition-all ${activeRecord ? 'bg-rose-600 text-white shadow-rose-200' : 'premium-gradient text-white shadow-blue-200 disabled:opacity-30'}`}
                >
                  {activeRecord ? 'Check Out' : shiftLocked ? 'Shift Done' : 'Check In'}
                </button>
              )}
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 h-full overflow-hidden">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8">Activity Log</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                      <th className="pb-4">Date</th>
                      <th className="pb-4">Status</th>
                      <th className="pb-4 text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {records.filter(r => r.userId === user.id).sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-all">
                        <td className="py-6 font-black text-slate-900">{r.date}</td>
                        <td className="py-6">
                          <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${getDisplayStatus(r) === 'Late' ? 'bg-rose-50 text-rose-600' : getDisplayStatus(r) === 'Early' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{getDisplayStatus(r)}</span>
                        </td>
                        <td className="py-6 font-black text-blue-600 text-right">{r.totalHours ? formatDuration(r.totalHours) : 'Active'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 space-y-8">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Apply for Leave</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="leave-application" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Leave Application (Template)</label>
                <textarea id="leave-application" name="leaveApplication" value={leaveApplication} onChange={e => setLeaveApplication(e.target.value)} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none h-40 resize-none" />
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Paid leave remaining this month: {paidLeaveRemaining}</p>
                {paidLeaveRemaining === 0 && (
                  <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">This request will be unpaid</p>
                )}
              </div>
              <button
                onClick={() => {
                  const todayStr = getLocalDateString(new Date());
                  onSubmitLeave(todayStr, todayStr, leaveApplication);
                  setLeaveApplication(buildLeaveTemplate(user));
                }}
                className="w-full premium-gradient text-white py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl"
              >
                Submit Application
              </button>
            </div>
          </div>
          <div className="space-y-4 h-[600px] overflow-y-auto pr-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Request Status</h3>
            {myLeaves.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 rounded-[3rem] font-black text-slate-300 uppercase text-xs tracking-widest">No requests found</div>
            ) : (
              myLeaves.map(l => (
                <div key={l.id} className="glass-card rounded-[2rem] p-8 border-l-8 border-blue-500 hover:scale-[1.01] transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{l.startDate} - {l.endDate}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${l.status === 'Pending' ? 'bg-amber-50 text-amber-600' : l.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : l.status === 'Cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-600'}`}>{l.status}</span>
                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${l.isPaid === false ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'}`}>{l.isPaid === false ? 'Unpaid' : 'Paid'}</span>
                      {l.status === 'Pending' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm('Cancel this leave request?')) return;
                            onCancelLeave(l.id);
                          }}
                          className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-slate-800">"{l.reason}"</p>
                  <p className="text-[8px] font-black text-slate-300 uppercase mt-4">Submitted on {new Date(l.submittedAt).toLocaleDateString()}</p>
                </div>
              ))
            )}
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
                    <label htmlFor="profile-photo" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Profile Photo (PNG/JPG)</label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                        {profileImage ? (
                          <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-black text-slate-400 uppercase">No Photo</span>
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
                            className="text-[10px] font-black uppercase tracking-widest text-rose-600"
                          >
                            Remove Photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="profile-name" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Full Name</label>
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
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">Name changes require HR.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="profile-email" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Email Address</label>
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
                    <label htmlFor="profile-phone" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Phone Number</label>
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
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{profileError}</p>
              )}
              {profileSaved && (
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Profile updated</p>
              )}
              <button onClick={handleProfileSave} className="w-full premium-gradient text-white py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl">
                Save Profile
              </button>
            </div>

            <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 space-y-10">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Emergency Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label htmlFor="ess-emergency-name" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Contact Name</label>
                    <input id="ess-emergency-name" name="emergencyContactName" type="text" value={editProfile.emergencyContactName} onChange={e => setEditProfile({ ...editProfile, emergencyContactName: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ess-emergency-relation" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Relationship</label>
                    <input id="ess-emergency-relation" name="emergencyContactRelation" type="text" value={editProfile.emergencyContactRelation} onChange={e => setEditProfile({ ...editProfile, emergencyContactRelation: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label htmlFor="ess-emergency-phone" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Phone Number</label>
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
            <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10 bg-blue-600 text-white shadow-blue-200 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Monthly Compensation</p>
                <button
                  type="button"
                  onClick={() => onUpdateUser({ ...user, salaryHidden: !salaryHidden })}
                  className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-all"
                >
                  {salaryHidden ? 'Show Salary' : 'Hide Salary'}
                </button>
              </div>
              <h2 className="text-4xl font-black mt-2">{salaryHidden ? 'Hidden' : `PKR ${monthlySalary.toLocaleString()}`}</h2>
              <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Status</p>
                  <p className="text-[10px] font-bold mt-1">Verified Base</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
              </div>
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
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight">{doc}</span>
                    <svg className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-[8px] font-bold text-slate-300 uppercase text-center">Digitized Filing Cabinet v1.0</p>
            </div>

            <div className="glass-card rounded-[3rem] p-6 sm:p-8 2xl:p-10">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Security Key</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="profile-password" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">New Password</label>
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
                  <label htmlFor="profile-password-confirm" className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Confirm Password</label>
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
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Password updated</p>
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
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Complete these steps for your corporate clearance</p>
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
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progress</span>
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
    </div>
  );
};

export default EmployeeDashboard;
