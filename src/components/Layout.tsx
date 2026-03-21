import React from 'react';
import { AppNotification, UserRole, View } from '../types';
import { Ticket, Briefcase, MapPin, Bookmark, Bell, LogOut, Zap } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentView: View;
  onViewChange: (view: View) => void;
  activeCatalogCount?: number;
  notifications?: AppNotification[];
  notificationsOpen?: boolean;
  unreadNotificationCount?: number;
  onToggleNotifications?: () => void;
  role?: UserRole;
  isAuthenticated?: boolean;
  userEmail?: string;
  userAvatarUrl?: string | null;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  onViewChange,
  activeCatalogCount = 0,
  notifications = [],
  notificationsOpen = false,
  unreadNotificationCount = 0,
  onToggleNotifications,
  role = 'customer',
  isAuthenticated = false,
  userEmail,
  userAvatarUrl,
  onOpenAuth,
  onSignOut,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden border-x border-slate-200">
      {/* Header */}
      <header className="p-5 pt-7 flex justify-between items-center border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex flex-col justify-center items-start">
          <div className="flex items-baseline gap-1.5 leading-none">
            <h1 className="text-[1.48rem] font-black tracking-[-0.06em] text-slate-800">LIVE</h1>
            <h1 className="text-[1.48rem] font-black tracking-[-0.06em] text-indigo-600">DROP</h1>
            <Zap size={28} className="text-indigo-600 shrink-0 translate-y-[2px]" fill="currentColor" strokeWidth={1.75} />
          </div>
          <p className="mt-1 text-[0.64rem] font-medium tracking-[0.14em] text-slate-400">
            don&apos;t miss the drop
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-slate-100 pl-2 pr-3 py-1.5">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt="Profile" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-black flex items-center justify-center">
                  {(userEmail ?? 'U').slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="text-[10px] font-bold text-slate-600 max-w-[110px] truncate">{userEmail}</span>
              <button onClick={onSignOut} className="text-slate-400 hover:text-slate-700">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="hidden sm:inline-flex rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-2 shadow-lg shadow-indigo-100"
            >
              Sign In
            </button>
          )}
          <button onClick={onToggleNotifications} className="relative bg-slate-100 p-2 rounded-full text-slate-500">
            <Bell size={18} />
            {unreadNotificationCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center">
                {unreadNotificationCount}
              </span>
            ) : null}
          </button>
          <div className="bg-slate-100 p-2 rounded-full text-slate-500">
            <MapPin size={18} />
          </div>
          {isAuthenticated ? (
            <button onClick={onSignOut} className="sm:hidden bg-slate-100 p-2 rounded-full text-slate-500">
              <LogOut size={18} />
            </button>
          ) : (
            <button onClick={onOpenAuth} className="sm:hidden bg-indigo-600 px-2.5 py-2 rounded-full text-white text-[10px] font-black uppercase tracking-[0.16em]">
              Sign In
            </button>
          )}
        </div>
      </header>

      {notificationsOpen ? (
        <div className="absolute top-[88px] right-4 left-4 z-[90]">
          <div className="rounded-3xl border border-slate-100 bg-white shadow-2xl shadow-slate-200 p-4 max-h-[50vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Notifications</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {notifications.length}
              </span>
            </div>
            {notifications.length > 0 ? (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`rounded-2xl border px-4 py-3 ${notification.read ? 'border-slate-100 bg-slate-50' : 'border-indigo-100 bg-indigo-50/60'}`}
                  >
                    <p className="text-sm font-semibold text-slate-800">{notification.message}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                      {new Date(notification.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-6">No notifications yet.</p>
            )}
          </div>
        </div>
      ) : null}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {children}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-100 px-6 py-4 flex justify-between items-center z-50">
        <NavButton 
          active={currentView === 'live-deals'} 
          onClick={() => onViewChange('live-deals')}
          icon={<Zap size={22} className="text-current" />}
          label="Live"
        />
        <NavButton 
          active={currentView === 'catalog'} 
          onClick={() => onViewChange('catalog')}
          icon={<Bookmark size={24} />}
          label="Catalog"
          badge={activeCatalogCount > 0 ? activeCatalogCount : undefined}
        />
        <NavButton 
          active={currentView === 'my-claims'} 
          onClick={() => onViewChange('my-claims')}
          icon={<Ticket size={24} />}
          label="Claims"
        />
        <NavButton 
          active={currentView === 'business-portal'} 
          onClick={() => onViewChange('business-portal')}
          icon={<Briefcase size={24} />}
          label={role === 'business' ? 'Portal' : 'Upgrade'}
        />
      </nav>
    </div>
  );
};

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon, label, badge }) => (
  <button 
    onClick={onClick}
    className={`relative flex flex-col items-center gap-1 transition-all ${active ? 'text-indigo-600 scale-110' : 'text-slate-400'}`}
  >
    {icon}
    {badge ? (
      <span className="absolute -top-1 -right-2 min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center">
        {badge}
      </span>
    ) : null}
    <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
  </button>
);
