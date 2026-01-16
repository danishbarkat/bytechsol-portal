
import React, { useState, useEffect, useCallback } from 'react';
import { User, AttendanceRecord, Role, CheckInStatus, LeaveRequest, ESSProfile, UserChecklist } from './types';
import { MOCK_USERS } from './constants';
import { loadRecords, saveRecords, loadLeaves, saveLeaves, loadESSProfiles, saveESSProfiles, loadChecklists, saveChecklists, loadUsers, saveUsers } from './utils/storage';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [essProfiles, setEssProfiles] = useState<ESSProfile[]>([]);
  const [checklists, setChecklists] = useState<UserChecklist[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isWifiConnected, setIsWifiConnected] = useState(false);

  useEffect(() => {
    setRecords(loadRecords());
    setLeaves(loadLeaves());
    setEssProfiles(loadESSProfiles());
    setChecklists(loadChecklists());

    const storedUsers = loadUsers();
    if (storedUsers.length === 0) {
      setUsers(MOCK_USERS);
      saveUsers(MOCK_USERS);
    } else {
      setUsers(storedUsers);
    }

    const checkWifi = () => {
      const nav = navigator as any;
      const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
      setIsWifiConnected(conn ? (conn.type === 'wifi' || conn.effectiveType === '4g') : true);
    };

    checkWifi();
    window.addEventListener('online', checkWifi);
    return () => window.removeEventListener('online', checkWifi);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const foundUser = users.find(u => u.email === email && u.password === password);
    if (foundUser) {
      setUser(foundUser);
      setError(null);
    } else {
      setError('Invalid identity credentials.');
    }
  };

  const calculateStatus = (checkInTime: Date): CheckInStatus => {
    const hours = checkInTime.getHours();
    const totalMinutes = hours * 60 + checkInTime.getMinutes();
    const targetMinutes = 20 * 60; // 8:00 PM
    const relaxation = 15;
    if (totalMinutes < targetMinutes - relaxation) return 'Early';
    if (totalMinutes <= targetMinutes + relaxation) return 'On-Time';
    return 'Late';
  };

  const handleCheckIn = useCallback(() => {
    if (!user) return;
    const now = new Date();
    const record: AttendanceRecord = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      date: now.toISOString().split('T')[0],
      checkIn: now.toISOString(),
      status: calculateStatus(now)
    };
    const updated = [...records, record];
    setRecords(updated);
    saveRecords(updated);
  }, [user, records]);

  const handleCheckOut = useCallback(() => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const updated = records.map(r => {
      if (r.userId === user.id && r.date === today && !r.checkOut) {
        const checkInTime = new Date(r.checkIn);
        const diff = (new Date().getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
        return { ...r, checkOut: new Date().toISOString(), totalHours: diff };
      }
      return r;
    });
    setRecords(updated);
    saveRecords(updated);
  }, [user, records]);

  const handleLeaveAction = (leaveId: string, action: 'Approved' | 'Rejected') => {
    if (user?.role !== Role.CEO && user?.role !== Role.SUPERADMIN) return;
    const updated = leaves.map(l => l.id === leaveId ? { ...l, status: action } : l);
    setLeaves(updated);
    saveLeaves(updated);
  };

  const handleSubmitLeave = (startDate: string, endDate: string, reason: string) => {
    if (!user) return;
    const newLeave: LeaveRequest = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      startDate,
      endDate,
      reason,
      status: 'Pending',
      submittedAt: new Date().toISOString()
    };
    const updated = [...leaves, newLeave];
    setLeaves(updated);
    saveLeaves(updated);
  };

  const handleUpdateRecord = (updatedRecord: AttendanceRecord) => {
    setRecords(prevRecords => {
      const newRecords = prevRecords.map(r => r.id === updatedRecord.id ? { ...updatedRecord } : r);
      saveRecords(newRecords);
      return newRecords;
    });
  };

  const handleUpdateESS = (profile: ESSProfile) => {
    setEssProfiles(prev => {
      const exists = prev.find(p => p.userId === profile.userId);
      const updated = exists
        ? prev.map(p => p.userId === profile.userId ? profile : p)
        : [...prev, profile];
      saveESSProfiles(updated);
      return updated;
    });
  };

  const handleUpdateChecklist = (checklist: UserChecklist) => {
    setChecklists(prev => {
      const exists = prev.find(c => c.userId === checklist.userId);
      const updated = exists
        ? prev.map(c => c.userId === checklist.userId ? checklist : c)
        : [...prev, checklist];
      saveChecklists(updated);
      return updated;
    });
  };

  const handleAddUser = (newUser: User) => {
    setUsers(prev => {
      const updated = [...prev, newUser];
      saveUsers(updated);
      return updated;
    });
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUsers(prev => {
      const updated = prev.map(u => u.id === updatedUser.id ? updatedUser : u);
      saveUsers(updated);
      return updated;
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100 space-y-10">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 premium-gradient rounded-2xl flex items-center justify-center mb-6 shadow-xl">
                <span className="text-white text-3xl font-black">B</span>
              </div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter">BYTECH<span className="text-blue-600">SOL</span></h1>
              <p className="mt-2 text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em]">Corporate Access Portal</p>
            </div>
            <form className="space-y-6" onSubmit={handleLogin}>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Email Address</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 transition-all" placeholder="Corporate Email" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Security Key</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 transition-all" placeholder="Security Key" />
              </div>
              {error && <p className="text-red-500 text-xs font-bold bg-red-50 p-4 rounded-xl text-center border border-red-100">{error}</p>}
              <button type="submit" className="w-full premium-gradient text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:opacity-90 transition-all">Authorize Login</button>
            </form>

            <div className="pt-6 border-t border-slate-100">
              <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-widest mb-4">Demo Credentials</p>
              <div className="grid grid-cols-2 gap-3 text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-indigo-600 block mb-1">CEO</span>
                  ceo@bytechsol.com<br />ceo123
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-emerald-600 block mb-1">HR Manager</span>
                  hr@bytechsol.com<br />hr123
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-slate-900 block mb-1">Employee</span>
                  john@bytechsol.com<br />user123
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Layout user={user} onLogout={() => setUser(null)}>
      {user.role === Role.EMPLOYEE ? (
        <EmployeeDashboard
          user={user}
          records={records}
          leaves={leaves}
          essProfiles={essProfiles}
          checklists={checklists}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          isWifiConnected={isWifiConnected}
          onSubmitLeave={handleSubmitLeave}
          onUpdateESS={handleUpdateESS}
          onUpdateChecklist={handleUpdateChecklist}
        />
      ) : (
        <AdminDashboard
          user={user}
          users={users}
          records={records}
          leaves={leaves}
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
          onUpdateESS={handleUpdateESS}
        />
      )}
    </Layout>
  );
};

export default App;
