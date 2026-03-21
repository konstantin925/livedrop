import React from 'react';
import { AppNotification, UserRole, View } from '../types';
import { Ticket, Briefcase, MapPin, Bookmark, Bell } from 'lucide-react';
import logo from '../assets/livedrop-logo.svg';

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
}) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden border-x border-slate-200">
      {/* Header */}
      <header className="p-6 pt-8 flex justify-between items-center border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img src={logo} alt="LiveDrop icon" className="h-8 w-8 object-contain shrink-0 rounded-xl" />
          <div className="leading-none">
            <h1 className="text-[1.2rem] font-bold tracking-[-0.035em] text-slate-950">LiveDrop</h1>
            <p className="mt-1 text-[9px] text-slate-400 font-semibold uppercase tracking-[0.2em]">DEALS DROP LIVE.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          icon={<img src={logo} alt="" className="h-6 w-6 object-cover object-left" />}
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
