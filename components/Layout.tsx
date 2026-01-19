
import React, { useEffect, useMemo, useState } from 'react';
import logoUrl from '../asset/public/logo.svg';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const formatter = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }, []);
  const [currentTime, setCurrentTime] = useState(() => formatter.format(new Date()));

  useEffect(() => {
    const tick = () => setCurrentTime(formatter.format(new Date()));
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [formatter]);

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white/70 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
          <div className="flex items-center">
            <img src={logoUrl} alt="BytechSol" className="h-10 w-auto" />
          </div>
            <div className="flex items-center space-x-6">
              <div className="text-right border-r border-slate-200 pr-4 sm:pr-6">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">PKT Time</p>
                <p className="text-sm font-black text-slate-900">{currentTime}</p>
              </div>
              <div className="text-right hidden sm:block border-r border-slate-200 pr-6">
                <p className="text-sm font-bold text-slate-900">{user.name}</p>
                <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">{user.role}</p>
              </div>
              <button
                onClick={onLogout}
                className="group flex items-center space-x-2 px-4 py-2 text-sm font-bold text-slate-600 hover:text-red-600 transition-all duration-300 rounded-full hover:bg-red-50"
              >
                <span>Logout</span>
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 sm:p-8 lg:p-10">
        {children}
      </main>
      <footer className="bg-white/50 py-8 text-center border-t border-slate-100">
        <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">
          &copy; 2025 BYTECHSOL Systems. Powered by BytechSol Pro.
        </p>
      </footer>
    </div>
  );
};

export default Layout;
