import React, { useState, useEffect } from 'react';
import { AttendanceRecord, LeaveRequest, User, ESSProfile, UserChecklist } from '../types';
import { formatDuration, calculateWeeklyOvertime } from '../utils/storage';

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
}

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  user, records, leaves, essProfiles, checklists, onCheckIn, onCheckOut, isWifiConnected, onSubmitLeave, onUpdateESS, onUpdateChecklist
}) => {
  const [tab, setTab] = useState<'attendance' | 'leaves' | 'profile' | 'checklists'>('attendance');
  const [leaveForm, setLeaveForm] = useState({ start: '', end: '', reason: '' });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [saveSuccess, setSaveSuccess] = useState(false);

  const myProfile = essProfiles.find(p => p.userId === user.id) || {
    userId: user.id,
    bankName: '',
    accountNumber: '',
    accountName: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: ''
  };

  const [editProfile, setEditProfile] = useState<ESSProfile>(myProfile);

  // Sync with prop changes
  useEffect(() => {
    setEditProfile(myProfile);
  }, [essProfiles, user.id]);

  const handleESSUpdate = () => {
    onUpdateESS(editProfile);

    // Automatically update checklist if bank name is provided
    if (editProfile.bankName && editProfile.accountNumber) {
      const updatedItems = myChecklist.items.map(item =>
        item.id === '2' ? { ...item, completed: true } : item
      );
      onUpdateChecklist({ ...myChecklist, items: updatedItems });
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
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
      { id: '2', label: 'Submit Bank Details', completed: false },
      { id: '3', label: 'Laptop Provisioning', completed: false },
      { id: '4', label: 'Office Tour', completed: false }
    ]
  } as UserChecklist;

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const today = currentTime.toISOString().split('T')[0];
  const activeRecord = records.find(r => r.userId === user.id && r.date === today);
  const myLeaves = leaves.filter(l => l.userId === user.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const weeklyOT = calculateWeeklyOvertime(user.id, records);

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
          <div className="flex items-center gap-3 mt-1">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">{user.position || 'Genral Staff'}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {user.employeeId}</p>
          </div>
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
            <div className="glass-card rounded-[3rem] p-10 text-center relative overflow-hidden border-2 border-white shadow-2xl">
              <div className={`absolute top-0 right-0 px-5 py-2 text-[9px] font-black uppercase tracking-widest ${isWifiConnected ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                {isWifiConnected ? 'Network Secure' : 'Access Restricted'}
              </div>
              <h1 className="text-5xl font-black text-slate-900 mt-4">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 mt-2">Local Timezone</p>

              <div className="mb-8 p-6 bg-blue-50/50 rounded-[2rem] border border-blue-100">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Weekly Overtime</p>
                <p className="text-2xl font-black text-blue-600">{weeklyOT > 0 ? formatDuration(weeklyOT) : '0h 0m'}</p>
                <p className="text-[8px] font-bold text-blue-400 uppercase mt-1">Calculated over 40h standard</p>
              </div>

              {!isWifiConnected ? (
                <div className="p-6 bg-rose-50 rounded-[2rem] text-xs font-bold text-rose-600">Connect to Office Wi-Fi</div>
              ) : (
                <button onClick={activeRecord && !activeRecord.checkOut ? onCheckOut : onCheckIn} disabled={activeRecord && activeRecord.checkOut ? true : false} className={`w-full py-6 rounded-[2rem] font-black text-xl shadow-xl transition-all ${activeRecord && !activeRecord.checkOut ? 'bg-rose-600 text-white shadow-rose-200' : 'premium-gradient text-white shadow-blue-200 disabled:opacity-30'}`}>
                  {activeRecord && !activeRecord.checkOut ? 'Check Out' : activeRecord?.checkOut ? 'Shift Done' : 'Check In'}
                </button>
              )}
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="glass-card rounded-[3rem] p-10 h-full overflow-hidden">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8">Activity Log</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
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
                          <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${r.status === 'Late' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{r.status}</span>
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
          <div className="glass-card rounded-[3rem] p-10 space-y-8">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Apply for Leave</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Start Date</label>
                  <input type="date" value={leaveForm.start} onChange={e => setLeaveForm({ ...leaveForm, start: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">End Date</label>
                  <input type="date" value={leaveForm.end} onChange={e => setLeaveForm({ ...leaveForm, end: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Reason</label>
                <textarea placeholder="Briefly explain your request..." value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none h-32 resize-none" />
              </div>
              <button onClick={() => { onSubmitLeave(leaveForm.start, leaveForm.end, leaveForm.reason); setLeaveForm({ start: '', end: '', reason: '' }); }} className="w-full premium-gradient text-white py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl">Submit Application</button>
            </div>
          </div>
          <div className="space-y-4 h-[600px] overflow-y-auto pr-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Request Status</h3>
            {myLeaves.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 rounded-[3rem] font-black text-slate-300 uppercase text-xs tracking-widest">No requests found</div>
            ) : (
              myLeaves.map(l => (
                <div key={l.id} className="glass-card rounded-[2rem] p-8 border-l-8 border-blue-500 hover:scale-[1.01] transition-all">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{l.startDate} - {l.endDate}</span>
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${l.status === 'Pending' ? 'bg-amber-50 text-amber-600' : l.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{l.status}</span>
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
            <div className="glass-card rounded-[3rem] p-10 space-y-10">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Financial Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Bank Name</label>
                    <input type="text" value={editProfile.bankName} onChange={e => setEditProfile({ ...editProfile, bankName: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Account Number</label>
                    <input type="text" value={editProfile.accountNumber} onChange={e => setEditProfile({ ...editProfile, accountNumber: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Account Holder Name</label>
                    <input type="text" value={editProfile.accountName} onChange={e => setEditProfile({ ...editProfile, accountName: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Emergency Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Contact Name</label>
                    <input type="text" value={editProfile.emergencyContactName} onChange={e => setEditProfile({ ...editProfile, emergencyContactName: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Relationship</label>
                    <input type="text" value={editProfile.emergencyContactRelation} onChange={e => setEditProfile({ ...editProfile, emergencyContactRelation: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Phone Number</label>
                    <input type="text" value={editProfile.emergencyContactPhone} onChange={e => setEditProfile({ ...editProfile, emergencyContactPhone: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 p-4 rounded-2xl text-xs font-bold outline-none" />
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
            <div className="glass-card rounded-[3rem] p-10 bg-blue-600 text-white shadow-blue-200 shadow-2xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Monthly Compensation</p>
              <h2 className="text-4xl font-black mt-2">PKR {user.salary?.toLocaleString() || '0'}</h2>
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

            <div className="glass-card rounded-[3rem] p-10">
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
          </div>
        </div>
      )}

      {tab === 'checklists' && (
        <div className="max-w-3xl mx-auto w-full">
          <div className="glass-card rounded-[3rem] p-10 space-y-10">
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
