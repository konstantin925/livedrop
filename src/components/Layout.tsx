import React from 'react';
import { AppNotification, UserRole, View } from '../types';
import { AppIcon } from './AppIcon';
import brandBoltLogo from '../assets/logo-bolt.svg';

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
  isDropModeHighlighted?: boolean;
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
  isDropModeHighlighted = false,
}) => {
  const mainContentStyle: React.CSSProperties = {
    paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px) + 2.5rem)',
  };

  const bottomNavStyle: React.CSSProperties = {
    bottom: 'max(env(safe-area-inset-bottom, 0px), 0px)',
    paddingBottom: 'calc(0.55rem + env(safe-area-inset-bottom, 0px))',
  };

  const getNotificationIcon = (type: AppNotification['type']) => {
    if (type === 'new_deal') return 'live' as const;
    if (type === 'ending_soon') return 'ending' as const;
    if (type === 'share') return 'share' as const;
    return 'percent' as const;
  };

  return (
    <div className="relative isolate mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-x-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_20%,rgba(241,245,249,0.9))] text-slate-900 shadow-[0_22px_58px_rgba(15,23,42,0.11)] sm:border-x sm:border-slate-200/70">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-2.5 border-b border-white/70 bg-white/88 px-3.5 py-3 pt-5 backdrop-blur-xl max-[359px]:gap-2 max-[359px]:px-3 max-[359px]:pt-4">
        <div className="min-w-0 flex flex-1 flex-col items-start justify-center">
          <div className="flex items-center leading-none">
            <div className="min-w-0 flex items-baseline gap-0.5 leading-none">
              <h1 className="text-[1.34rem] font-black tracking-[-0.055em] text-slate-800 max-[359px]:text-[1.18rem] min-[390px]:text-[1.42rem]">LIVE</h1>
              <h1 className="text-[1.34rem] font-black tracking-[-0.055em] text-indigo-600 max-[359px]:text-[1.18rem] min-[390px]:text-[1.42rem]">DROP</h1>
            </div>
            <span className="-ml-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12),rgba(99,102,241,0)_72%)] max-[359px]:h-10 max-[359px]:w-10 min-[390px]:h-12 min-[390px]:w-12">
              <img
                src={brandBoltLogo}
                alt="LiveDrop logo"
                className="h-9 w-9 object-contain max-[359px]:h-8 max-[359px]:w-8 min-[390px]:h-10 min-[390px]:w-10"
              />
            </span>
          </div>
          <p className="-mt-0.5 text-[0.55rem] font-semibold leading-none tracking-[0.14em] text-slate-400 max-[359px]:text-[0.5rem] min-[390px]:text-[0.6rem]">
            don&apos;t miss the drop
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 max-[359px]:gap-0.5">
          {isAuthenticated ? (
            <div className="hidden items-center gap-2 rounded-full border border-slate-200/80 bg-white/92 py-1.5 pl-2 pr-3 shadow-sm shadow-slate-200/35 sm:flex">
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
              className="hidden h-10 items-center rounded-full bg-indigo-600 px-3.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-indigo-100/70 sm:inline-flex"
            >
              Sign In
            </button>
          )}
          <button onClick={onToggleNotifications} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/92 text-slate-500 shadow-sm shadow-slate-200/30 transition-colors hover:bg-slate-50 max-[359px]:h-9 max-[359px]:w-9">
            <AppIcon name="bell" size={18} />
            {unreadNotificationCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-black text-white shadow-[0_8px_18px_rgba(79,70,229,0.28)]">
                {unreadNotificationCount}
              </span>
            ) : null}
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/92 text-slate-500 shadow-sm shadow-slate-200/30 max-[359px]:h-9 max-[359px]:w-9">
            <AppIcon name="pin" size={18} />
          </div>
          {isAuthenticated ? (
            <button onClick={onSignOut} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/92 text-slate-500 shadow-sm shadow-slate-200/30 max-[359px]:h-9 max-[359px]:w-9 sm:hidden">
              <AppIcon name="logout" size={18} />
            </button>
          ) : (
            <button onClick={onOpenAuth} className="inline-flex h-10 items-center justify-center rounded-full bg-indigo-600 px-3 text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-indigo-100/70 max-[359px]:h-9 max-[359px]:px-2.5 sm:hidden">
              <span className="hidden min-[380px]:inline">Sign In</span>
              <span className="min-[380px]:hidden">Sign</span>
            </button>
          )}
        </div>
      </header>

      {notificationsOpen ? (
        <div className="absolute left-2.5 right-2.5 top-[76px] z-[90] max-[359px]:left-2 max-[359px]:right-2 max-[359px]:top-[70px]">
          <div className="max-h-[50vh] overflow-y-auto rounded-[1.75rem] border border-slate-100/90 bg-white/98 p-3.5 shadow-[0_20px_48px_rgba(15,23,42,0.16)]">
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
      <main className="flex-1 overflow-y-auto px-3.5 py-3 max-[359px]:px-2.5" style={mainContentStyle}>
        {children}
      </main>

      {/* Navigation */}
      <nav
        className="fixed left-0 right-0 z-50 mx-auto flex w-full max-w-[430px] items-center justify-between border-t border-white/80 bg-white/94 px-3 pt-1.5 shadow-[0_-8px_26px_rgba(15,23,42,0.06)] backdrop-blur-xl max-[359px]:px-2.5"
        style={bottomNavStyle}
      >
        <NavButton 
          active={currentView === 'live-deals' || currentView === 'deal-detail'} 
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
    className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.1rem] px-1 py-2 transition-all ${active ? 'bg-indigo-50/90 text-indigo-600 shadow-sm shadow-indigo-100/60' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-500'}`}
  >
    {icon}
    {badge ? (
      <span className="absolute -right-0.5 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-black text-white shadow-[0_8px_18px_rgba(79,70,229,0.28)]">
        {badge}
      </span>
    ) : null}
    <span className={`max-w-full truncate text-[7.5px] font-black uppercase tracking-[0.12em] max-[359px]:text-[6.5px] ${active ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</span>
  </button>
);
