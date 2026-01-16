import React, { useState } from 'react';
import { AttendanceRecord, LeaveRequest, Role, User, ESSProfile, UserChecklist } from '../types';
import { formatDuration, calculateWeeklyOvertime } from '../utils/storage';

interface AdminDashboardProps {
  user: User;
  users: User[];
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  essProfiles: ESSProfile[];
  checklists: UserChecklist[];
  onLeaveAction: (id: string, action: 'Approved' | 'Rejected') => void;
  onCheckIn: () => void;
  onCheckOut: () => void;
  isWifiConnected: boolean;
  onUpdateRecord: (updatedRecord: AttendanceRecord) => void;
  onUpdateChecklist: (checklist: UserChecklist) => void;
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onUpdateESS: (profile: ESSProfile) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user, users, records, leaves, essProfiles, checklists, onLeaveAction, onCheckIn, onCheckOut, isWifiConnected, onUpdateRecord, onUpdateChecklist, onAddUser, onUpdateUser, onUpdateESS
}) => {
  const [tab, setTab] = useState<'attendance' | 'leaves' | 'overtime' | 'personnel'>('attendance');
  const [selectedEmp, setSelectedEmp] = useState('all');
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Manual Edit States for Records
  const [editDate, setEditDate] = useState('');
  const [editInTime, setEditInTime] = useState('');
  const [editOutTime, setEditOutTime] = useState('');

  // User Edit States
  const [userForm, setUserForm] = useState<Partial<User>>({});
  const [essForm, setEssForm] = useState<Partial<ESSProfile>>({});

  const filteredAttendance = selectedEmp === 'all' ? records : records.filter(r => r.userId === selectedEmp);
  const canApprove = user.role === Role.CEO || user.role === Role.SUPERADMIN;
  const isSuperadmin = user.role === Role.SUPERADMIN;
  const isExecutive = user.role === Role.CEO || user.role === Role.SUPERADMIN;

  const today = new Date().toISOString().split('T')[0];
  const myRecord = records.find(r => r.userId === user.id && r.date === today);

  const startEditingRecord = (r: AttendanceRecord) => {
    setEditingRecord(r);
    setEditDate(r.date);
    setEditInTime(new Date(r.checkIn).toTimeString().slice(0, 5));
    setEditOutTime(r.checkOut ? new Date(r.checkOut).toTimeString().slice(0, 5) : '');
  };

  const startEditingUser = (u: User) => {
    setEditingUser(u);
    setUserForm(u);
    const profile = essProfiles.find(p => p.userId === u.id) || { userId: u.id };
    setEssForm(profile);
  };

  const handleEditRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRecord) {
      const updatedCheckIn = new Date(`${editDate}T${editInTime}:00`).toISOString();
      const updatedCheckOut = editOutTime ? new Date(`${editDate}T${editOutTime}:00`).toISOString() : undefined;
      let totalHours = undefined;
      if (updatedCheckOut) {
        const diff = (new Date(updatedCheckOut).getTime() - new Date(updatedCheckIn).getTime()) / (1000 * 60 * 60);
        totalHours = diff > 0 ? diff : 0;
      }
      onUpdateRecord({ ...editingRecord, date: editDate, checkIn: updatedCheckIn, checkOut: updatedCheckOut, totalHours });
      setEditingRecord(null);
    }
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingUser) {
      const newUser: User = {
        id: Math.random().toString(36).substr(2, 9),
        name: userForm.name || '',
        email: userForm.email || '',
        password: userForm.password || '',
        role: userForm.role || Role.EMPLOYEE,
        employeeId: userForm.employeeId || `BS-${Math.floor(Math.random() * 899) + 100}`,
        salary: Number(userForm.salary) || 0,
        position: userForm.position || '',
      };
      onAddUser(newUser);
      setIsAddingUser(false);
    } else if (editingUser) {
      onUpdateUser({ ...editingUser, ...userForm } as User);
      if (essForm.userId) {
        onUpdateESS(essForm as ESSProfile);
      }
      setEditingUser(null);
    }
    setUserForm({});
    setEssForm({});
  };

  const downloadIndividualReport = (userId: string) => {
    const emp = users.find(u => u.id === userId);
    if (!emp) return;
    const empRecords = records.filter(r => r.userId === userId);
    let csv = `Employee: ${emp.name} (${emp.employeeId})\nDate,Check In,Check Out,Total Working Hours\n`;
    empRecords.forEach(r => {
      csv += `${r.date},${new Date(r.checkIn).toLocaleTimeString()},${r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : "N/A"},${r.totalHours ? formatDuration(r.totalHours) : "Active"}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${emp.name}_Attendance_Report.csv`;
    a.click();
  };

  const getChecklistProgress = (userId: string) => {
    const checklist = checklists.find(c => c.userId === userId);
    if (!checklist) return 0;
    const completed = checklist.items.filter(i => i.completed).length;
    return Math.round((completed / checklist.items.length) * 100);
  };

  return (
    <div className="space-y-8">
      {!isExecutive && (
        <div className="glass-card rounded-[2rem] p-6 border-2 border-white flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className={`w-3 h-3 rounded-full ${isWifiConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Personal Attendance (HR)</p>
              <p className="font-black text-slate-900">{myRecord ? `Active since ${new Date(myRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not Checked In'}</p>
            </div>
          </div>
          <button onClick={myRecord && !myRecord.checkOut ? onCheckOut : onCheckIn} disabled={!isWifiConnected || (!!myRecord && !!myRecord.checkOut)} className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all ${myRecord && !myRecord.checkOut ? 'bg-rose-600 text-white hover:bg-rose-700' : 'premium-gradient text-white hover:opacity-90 disabled:opacity-30'}`}>
            {myRecord && !myRecord.checkOut ? 'Check Out' : myRecord?.checkOut ? 'Shift Completed' : 'Check In Now'}
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">{user.role} Console</h1>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Enterprise Resource Planning
          </p>
        </div>
        <div className="flex p-1 bg-slate-100 rounded-2xl overflow-x-auto max-w-full">
          {(['attendance', 'leaves', 'overtime', 'personnel'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${tab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === 'attendance' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="bg-white border-2 border-slate-100 rounded-2xl px-6 py-3 text-xs font-black uppercase outline-none focus:border-blue-500 shadow-sm w-full sm:w-auto">
              <option value="all">Global Roster</option>
              {users.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>)}
            </select>
            {selectedEmp !== 'all' && (
              <button onClick={() => downloadIndividualReport(selectedEmp)} className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center gap-2 w-full sm:w-auto justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                Download Monthly Sheet
              </button>
            )}
          </div>
          <div className="glass-card rounded-[2.5rem] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-8 py-5">Employee</th>
                  <th className="px-8 py-5">Date</th>
                  <th className="px-8 py-5">Arrival</th>
                  <th className="px-8 py-5">Duration</th>
                  <th className="px-8 py-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredAttendance.map(r => (
                  <tr key={r.id} className="hover:bg-blue-50/20 transition-all">
                    <td className="px-8 py-6 font-black text-slate-900">{r.userName}</td>
                    <td className="px-8 py-6 text-xs font-bold text-slate-500">{r.date}</td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-black">{new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border w-fit mt-1 ${r.status === 'Late' ? 'border-rose-100 text-rose-600 bg-rose-50' : 'border-emerald-100 text-emerald-600 bg-emerald-50'}`}>{r.status}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 font-black text-blue-600">{r.totalHours ? formatDuration(r.totalHours) : 'Active'}</td>
                    <td className="px-8 py-6">
                      {isSuperadmin && <button onClick={() => startEditingRecord(r)} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 underline">Manual Edit</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="grid grid-cols-1 gap-6">
          {leaves.length === 0 ? <div className="glass-card rounded-[2rem] p-20 text-center font-black text-slate-300 uppercase tracking-widest">No Leave Records Found</div> : leaves.map(l => (
            <div key={l.id} className="glass-card rounded-[2rem] p-8 flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <span className="font-black text-lg text-slate-900">{l.userName}</span>
                  <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${l.status === 'Pending' ? 'bg-amber-50 text-amber-600' : l.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{l.status}</span>
                </div>
                <p className="text-xs font-bold text-slate-500">{l.startDate} to {l.endDate}</p>
                <p className="text-sm font-medium text-slate-700 italic">"{l.reason}"</p>
              </div>
              {l.status === 'Pending' && (
                <div className="flex space-x-2">
                  {canApprove ? <><button onClick={() => onLeaveAction(l.id, 'Approved')} className="bg-emerald-500 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all">Approve</button><button onClick={() => onLeaveAction(l.id, 'Rejected')} className="bg-rose-500 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-600 transition-all">Reject</button></> : <span className="text-[10px] font-black text-slate-300 uppercase italic">Awaiting CEO Action</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'overtime' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card rounded-[2.5rem] p-8 border-b-4 border-blue-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Weekly OT Pool</p>
              <h2 className="text-4xl font-black text-slate-900">{formatDuration(users.reduce((sum, u) => sum + calculateWeeklyOvertime(u.id, records), 0))}</h2>
            </div>
            <div className="glass-card rounded-[2.5rem] p-8 border-b-4 border-emerald-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Active OT Claims</p>
              <h2 className="text-4xl font-black text-slate-900">{users.filter(u => calculateWeeklyOvertime(u.id, records) > 0).length} Employees</h2>
            </div>
            <div className="glass-card rounded-[2.5rem] p-8 border-b-4 border-amber-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Avg. Weekly OT</p>
              <h2 className="text-4xl font-black text-slate-900">{formatDuration(users.reduce((sum, u) => sum + calculateWeeklyOvertime(u.id, records), 0) / (users.length || 1))}</h2>
            </div>
          </div>
          <div className="glass-card rounded-[2.5rem] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-8 py-5">Employee</th>
                  <th className="px-8 py-5">Total Hours (Week)</th>
                  <th className="px-8 py-5">OT Hours</th>
                  <th className="px-8 py-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => {
                  const ot = calculateWeeklyOvertime(u.id, records);
                  return (
                    <tr key={u.id}>
                      <td className="px-8 py-6 font-black text-slate-900">{u.name}</td>
                      <td className="px-8 py-6 font-bold text-slate-600">{formatDuration(records.filter(r => r.userId === u.id).reduce((sum, r) => sum + (r.totalHours || 0), 0))}</td>
                      <td className="px-8 py-6 font-black text-blue-600">{ot > 0 ? formatDuration(ot) : '--'}</td>
                      <td className="px-8 py-6"><span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${ot > 0 ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>{ot > 0 ? 'OT Eligible' : 'Standard'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'personnel' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center px-4">
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Workforce Directory</h3>
            <button onClick={() => { setIsAddingUser(true); setUserForm({ role: Role.EMPLOYEE }); }} className="bg-blue-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
              Add New Employee
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {users.map(u => {
              const profile = essProfiles.find(p => p.userId === u.id);
              const progress = getChecklistProgress(u.id);
              return (
                <div key={u.id} className="glass-card rounded-[2.5rem] p-8 space-y-6 border border-slate-100 hover:border-blue-200 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-slate-900">{u.name}</h3>
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{u.position || 'Genral Staff'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{u.role}</p>
                        <span className="text-[9px] font-bold text-slate-500">•</span>
                        <span className="text-[9px] font-black text-slate-400">PKR {u.salary?.toLocaleString() || '0'}</span>
                      </div>
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${progress === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>{progress}%</div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-2">Checklist Status</p>
                      <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }}></div></div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl space-y-3">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Financial Hookup</p>
                      {profile ? <div className="space-y-1"><p className="text-[10px] font-bold text-slate-900">{profile.bankName}</p><p className="text-[10px] font-medium text-slate-500">{profile.accountNumber}</p></div> : <p className="text-[10px] font-bold text-slate-300 italic">Profile Pending Update</p>}
                    </div>
                  </div>
                  <button onClick={() => startEditingUser(u)} className="w-full py-4 rounded-xl bg-white border border-slate-100 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">Manage Personnel</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase mb-2">Manual Correction</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">Record ID: {editingRecord.id}</p>
            <form onSubmit={handleEditRecordSubmit} className="space-y-6">
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Calendar Date</label><input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Check In</label><input type="time" value={editInTime} onChange={e => setEditInTime(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div><div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Check Out</label><input type="time" value={editOutTime} onChange={e => setEditOutTime(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold text-slate-800" /></div></div>
              <div className="flex space-x-3 pt-4"><button type="submit" className="flex-1 premium-gradient text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Save Overrides</button><button type="button" onClick={() => setEditingRecord(null)} className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest">Discard</button></div>
            </form>
          </div>
        </div>
      )}

      {/* User Add/Edit Modal */}
      {(isAddingUser || editingUser) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl p-10 shadow-2xl my-8">
            <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8">{isAddingUser ? 'Add New Employee' : 'Edit Employee Details'}</h3>
            <form onSubmit={handleUserSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Full Name</label><input required type="text" value={userForm.name || ''} onChange={e => setUserForm({ ...userForm, name: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Email Address</label><input required type="email" value={userForm.email || ''} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Security Key (Password)</label><input required type="text" value={userForm.password || ''} onChange={e => setUserForm({ ...userForm, password: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Employee ID</label><input required type="text" value={userForm.employeeId || ''} onChange={e => setUserForm({ ...userForm, employeeId: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Base Salary (Monthly)</label><input type="number" value={userForm.salary || ''} onChange={e => setUserForm({ ...userForm, salary: Number(e.target.value) })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Job Position (e.g. Odoo Developer)</label><input type="text" value={userForm.position || ''} onChange={e => setUserForm({ ...userForm, position: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Corporate Role</label><select required value={userForm.role || Role.EMPLOYEE} onChange={e => setUserForm({ ...userForm, role: e.target.value as Role })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800">{Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>

              {!isAddingUser && (
                <div className="pt-8 border-t border-slate-100">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Financial & Profile Info</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Bank Name</label><input type="text" value={essForm.bankName || ''} onChange={e => setEssForm({ ...essForm, bankName: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Account Number</label><input type="text" value={essForm.accountNumber || ''} onChange={e => setEssForm({ ...essForm, accountNumber: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Emergency Contact</label><input type="text" value={essForm.emergencyContactName || ''} onChange={e => setEssForm({ ...essForm, emergencyContactName: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Emergency Phone</label><input type="text" value={essForm.emergencyContactPhone || ''} onChange={e => setEssForm({ ...essForm, emergencyContactPhone: e.target.value })} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800" /></div>
                  </div>
                </div>
              )}

              <div className="flex space-x-4 pt-6">
                <button type="submit" className="flex-1 premium-gradient text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl">Save Changes</button>
                <button type="button" onClick={() => { setIsAddingUser(false); setEditingUser(null); }} className="px-10 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black text-sm uppercase tracking-widest">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
