import React from 'react';
import { AppNotification, UserRole, View } from '../types';
import { Zap } from 'lucide-react';
import { AppIcon } from './AppIcon';

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
  const mainContentStyle: React.CSSProperties = {
    paddingBottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px) + 2.5rem)',
  };

  const bottomNavStyle: React.CSSProperties = {
    bottom: 'max(env(safe-area-inset-bottom, 0px), 0.4rem)',
    paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom, 0px))',
  };

  const getNotificationIcon = (type: AppNotification['type']) => {
    if (type === 'new_deal') return 'live' as const;
    if (type === 'ending_soon') return 'ending' as const;
    return 'percent' as const;
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 flex flex-col max-w-[390px] mx-auto shadow-[0_24px_70px_rgba(15,23,42,0.12)] overflow-hidden border-x border-slate-200/80">
      {/* Header */}
      <header className="px-4 py-3 pt-5 flex justify-between items-center border-b border-slate-100/80 bg-white/84 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex flex-col justify-center items-start">
          <div className="flex items-baseline gap-1.5 leading-none">
            <h1 className="text-[1.42rem] font-black tracking-[-0.055em] text-slate-800">LIVE</h1>
            <h1 className="text-[1.42rem] font-black tracking-[-0.055em] text-indigo-600">DROP</h1>
            <Zap size={28} className="text-indigo-600 shrink-0 translate-y-[2px]" fill="currentColor" strokeWidth={1.75} />
          </div>
          <p className="mt-0.5 text-[0.6rem] font-medium tracking-[0.12em] text-slate-400">
            don&apos;t miss the drop
          </p>
        </div>
        <div className="flex items-center gap-1.5">
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
                <AppIcon name="logout" size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="hidden sm:inline-flex rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.14em] px-3 py-2 shadow-lg shadow-indigo-100/70"
            >
              Sign In
            </button>
          )}
          <button onClick={onToggleNotifications} className="relative bg-slate-100/90 hover:bg-slate-100 p-2 rounded-full text-slate-500 transition-colors">
            <AppIcon name="bell" size={18} />
            {unreadNotificationCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center">
                {unreadNotificationCount}
              </span>
            ) : null}
          </button>
          <div className="bg-slate-100/90 p-2 rounded-full text-slate-500">
            <AppIcon name="pin" size={18} />
          </div>
          {isAuthenticated ? (
            <button onClick={onSignOut} className="sm:hidden bg-slate-100/90 p-2 rounded-full text-slate-500">
              <AppIcon name="logout" size={18} />
            </button>
          ) : (
            <button onClick={onOpenAuth} className="sm:hidden bg-indigo-600 px-2.5 py-2 rounded-full text-white text-[10px] font-black uppercase tracking-[0.14em] shadow-lg shadow-indigo-100/70">
              Sign In
            </button>
          )}
        </div>
      </header>

      {notificationsOpen ? (
        <div className="absolute top-[78px] right-3 left-3 z-[90]">
          <div className="rounded-[1.75rem] border border-slate-100 bg-white shadow-2xl shadow-slate-200/70 p-3.5 max-h-[50vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-black uppercase tracking-[0.16em] text-slate-900">Notifications</h2>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {notifications.length}
              </span>
            </div>
            {notifications.length > 0 ? (
              <div className="space-y-2.5">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`rounded-[1.25rem] border px-3.5 py-3 ${notification.read ? 'border-slate-100 bg-slate-50' : 'border-indigo-100 bg-indigo-50/60'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${notification.read ? 'bg-white text-slate-400' : 'bg-white text-indigo-600'}`}>
                        <AppIcon name={getNotificationIcon(notification.type)} size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{notification.message}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                          {new Date(notification.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-slate-50 text-slate-300">
                  <AppIcon name="bell" size={24} />
                </div>
                <p className="text-sm text-slate-400">No notifications yet.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-3 py-2" style={mainContentStyle}>
        {children}
      </main>

      {/* Navigation */}
      <nav
        className="fixed left-0 right-0 max-w-[390px] mx-auto bg-white/94 backdrop-blur-xl border-t border-slate-100 px-4 pt-1.5 flex justify-between items-center z-50"
        style={bottomNavStyle}
      >
        <NavButton 
          active={currentView === 'live-deals'} 
          onClick={() => onViewChange('live-deals')}
          icon={<AppIcon name="play" size={18} className="text-current" />}
          label="Live"
        />
        <NavButton 
          active={currentView === 'catalog'} 
          onClick={() => onViewChange('catalog')}
          icon={<AppIcon name="catalog" size={18} />}
          label="Catalog"
          badge={activeCatalogCount > 0 ? activeCatalogCount : undefined}
        />
        <NavButton 
          active={currentView === 'my-claims'} 
          onClick={() => onViewChange('my-claims')}
          icon={<AppIcon name="claims" size={18} />}
          label="Claims"
        />
        <NavButton 
          active={currentView === 'business-portal'} 
          onClick={() => onViewChange('business-portal')}
          icon={<AppIcon name="portal" size={18} />}
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
    className={`relative flex min-w-[56px] flex-col items-center gap-0.5 rounded-2xl px-1.5 py-0.5 transition-all ${active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-500'}`}
  >
    {icon}
    {badge ? (
      <span className="absolute -top-1 -right-2 min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center">
        {badge}
      </span>
    ) : null}
    <span className={`text-[8px] font-bold uppercase tracking-[0.08em] ${active ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</span>
  </button>
);
