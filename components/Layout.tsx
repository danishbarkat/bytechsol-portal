
import React, { useEffect, useMemo, useState } from 'react';
import logoUrl from '../asset/public/logo.svg';
import { AppNotification } from '../types';
import { APP_CONFIG } from '../constants';
import Icon3D from './Icon3D';
import { supabase, isSupabaseConfigured } from '../utils/supabase';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  onLogout: () => void;
  notifications: AppNotification[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
}

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

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout, notifications, onMarkNotificationRead, onMarkAllNotificationsRead }) => {
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
  const [showNotifications, setShowNotifications] = useState(false);
  const autoOpenedRef = React.useRef(false);
  const unreadCount = notifications.filter(n => !n.read).length;
  const sortedNotifications = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(resolveProfileUrl(user.profileImage || null));
  const [avatarRetried, setAvatarRetried] = useState(false);

  useEffect(() => {
    const tick = () => setCurrentTime(formatter.format(new Date()));
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [formatter]);

  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (unreadCount > 0) {
      setShowNotifications(true);
      autoOpenedRef.current = true;
    }
  }, [unreadCount]);

  useEffect(() => {
    setAvatarUrl(resolveProfileUrl(user.profileImage || null));
    setAvatarRetried(false);
  }, [user.profileImage]);

  const handleAvatarError = async () => {
    if (avatarRetried || !user.profileImage) return;
    setAvatarRetried(true);
    if (!isSupabaseConfigured || !supabase) return;
    const path = extractStoragePath(user.profileImage);
    if (!path) return;
    const { data } = await supabase
      .storage
      .from(APP_CONFIG.PROFILE_IMAGE_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) {
      setAvatarUrl(data.signedUrl);
    }
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-white font-sans">
      {/* Background Decor */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none z-0" style={{ backgroundImage: 'radial-gradient(#2563eb 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      <nav className="bg-white/90 backdrop-blur-xl border-b border-blue-50 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between md:h-24 md:py-0">
            <div className="flex items-center">
              <div className="p-2 bg-white rounded-2xl shadow-lg shadow-blue-500/5 border border-blue-50">
                <img src={logoUrl} alt="BytechSol" className="h-10 w-auto" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 justify-end">
              <div className="text-right border-r border-blue-100 pr-6">
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-0.5">Karachi Time</p>
                <p className="text-sm font-black text-slate-900 tabular-nums">{currentTime}</p>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifications(prev => !prev)}
                  className="relative group transition-all"
                  aria-label="Notifications"
                >
                  <Icon3D icon="Bell" size="md" variant="slate" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shadow-lg border-4 border-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="fixed left-4 right-4 sm:left-auto sm:right-10 top-20 sm:top-24 w-auto sm:w-[400px] max-w-[calc(100vw-2rem)] bg-white border-2 border-blue-50 shadow-2xl rounded-[2rem] overflow-hidden z-50 animate-fade-up">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-blue-50 bg-blue-50/30">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">System Alerts</p>
                      <div className="flex items-center gap-4">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={onMarkAllNotificationsRead}
                            className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowNotifications(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {sortedNotifications.length === 0 ? (
                      <div className="p-10 text-center space-y-3">
                        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                          <svg className="w-8 h-8 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" strokeWidth="2" /></svg>
                        </div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">All caught up</p>
                      </div>
                    ) : (
                      <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {sortedNotifications.map(notification => (
                          <div key={notification.id} className={`px-6 py-5 border-b border-blue-50 transition-colors ${notification.read ? 'bg-white' : 'bg-blue-50/20'}`}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-sm font-black text-slate-900">{notification.title}</p>
                                <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">{notification.message}</p>
                                <div className="flex items-center gap-3 mt-3">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                                    {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {!notification.read && (
                                    <button
                                      type="button"
                                      onClick={() => onMarkNotificationRead(notification.id)}
                                      className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full"
                                    >
                                      Mark read
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden lg:flex flex-col items-end border-r border-blue-100 pr-6">
                <p className="text-sm font-black text-slate-900 tracking-tight">{user.name}</p>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{user.position || user.role}</p>
              </div>
              <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-50 overflow-hidden border-2 border-white shadow-xl">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={user.name} className="w-full h-full object-cover" onError={handleAvatarError} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white">
                    <span className="text-sm font-black uppercase">
                      {(user.name || 'U').split(' ').map((part: string) => part[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={onLogout}
                className="group flex items-center gap-3 pr-6 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-rose-600 transition-all duration-300"
              >
                <Icon3D icon="LogOut" size="sm" variant="rose" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-10 relative z-10">
        {children}
      </main>
      <footer className="bg-white py-12 text-center border-t border-blue-50">
        <div className="max-w-[1600px] mx-auto px-10 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 opacity-30">
            <div className="w-8 h-[2px] bg-blue-600" />
            <div className="w-2 h-2 rounded-full bg-blue-600" />
            <div className="w-8 h-[2px] bg-blue-600" />
          </div>
          <p className="text-[10px] font-black text-slate-400 tracking-[0.4em] uppercase">
            &copy; 2026 BYTECHSOL Systems • v2.0 Premium Edition
          </p>
          <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">
            State-of-the-Art Workforce Management
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
