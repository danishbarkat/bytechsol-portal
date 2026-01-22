
import React, { useEffect, useMemo, useState } from 'react';
import logoUrl from '../asset/public/logo.svg';
import { AppNotification } from '../types';
import { APP_CONFIG } from '../constants';
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
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <nav className="bg-white/70 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between md:h-20 md:py-0">
          <div className="flex items-center">
            <img src={logoUrl} alt="BytechSol" className="h-10 w-auto" />
          </div>
            <div className="flex flex-wrap items-center gap-4 justify-end">
              <div className="text-right border-r border-slate-200 pr-4 sm:pr-6">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">PKT Time</p>
                <p className="text-sm font-black text-slate-900">{currentTime}</p>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifications(prev => !prev)}
                  className="relative w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 hover:bg-slate-200 transition-all"
                  aria-label="Notifications"
                >
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 01-6 0" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="fixed left-4 right-4 sm:left-auto sm:right-4 top-16 sm:top-20 w-auto sm:w-96 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notifications</p>
                      <div className="flex items-center gap-3">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={onMarkAllNotificationsRead}
                            className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700"
                          >
                            Mark all read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowNotifications(false)}
                          className="text-slate-400 hover:text-slate-600"
                          aria-label="Close notifications"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {sortedNotifications.length === 0 ? (
                      <div className="p-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">
                        No notifications
                      </div>
                    ) : (
                      <div className="max-h-[60vh] overflow-y-auto">
                        {sortedNotifications.map(notification => (
                          <div key={notification.id} className={`px-4 py-4 border-b border-slate-100 ${notification.read ? 'bg-white' : 'bg-blue-50/40'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-black text-slate-900">{notification.title}</p>
                              <p className="text-[10px] font-bold text-slate-500 mt-1 break-words">{notification.message}</p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 mt-2">
                                  {new Date(notification.createdAt).toLocaleString()}
                                </p>
                              </div>
                              {!notification.read && (
                                <button
                                  type="button"
                                  onClick={() => onMarkNotificationRead(notification.id)}
                                  className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
                                >
                                  Mark read
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right hidden sm:block border-r border-slate-200 pr-6">
                <p className="text-sm font-bold text-slate-900">{user.name}</p>
                <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">{user.position || user.role}</p>
              </div>
              <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={user.name} className="w-full h-full object-cover" onError={handleAvatarError} />
                ) : (
                  <span className="text-[11px] font-black text-slate-400 uppercase">
                    {(user.name || 'U').split(' ').map(part => part[0]).join('').slice(0, 2)}
                  </span>
                )}
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 2xl:p-10">
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
