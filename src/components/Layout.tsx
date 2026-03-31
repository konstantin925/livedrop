import React, { useEffect, useState } from 'react';
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
  isAdminSession?: boolean;
  adminLabel?: string;
  desktopSearchQuery?: string;
  onDesktopSearchQueryChange?: (value: string) => void;
  desktopSearchPlaceholder?: string;
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
  isAdminSession = false,
  adminLabel,
  desktopSearchQuery = '',
  onDesktopSearchQueryChange,
  desktopSearchPlaceholder = 'Search deals, stores, and categories',
}) => {
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => setIsDesktopLayout(event.matches);
    setIsDesktopLayout(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

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
    <div
      className={`relative isolate mx-auto flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_20%,rgba(241,245,249,0.9))] text-slate-900 ${
        isDesktopLayout
          ? 'max-w-[1420px] shadow-[0_22px_58px_rgba(15,23,42,0.09)]'
          : 'max-w-[430px] shadow-[0_22px_58px_rgba(15,23,42,0.11)]'
      } sm:border-x sm:border-slate-200/70`}
    >
      {/* Header */}
      {isDesktopLayout ? (
        <header className="sticky top-0 z-50 border-b border-white/70 bg-white/92 px-8 py-4 backdrop-blur-xl">
          <div className="grid w-full grid-cols-[auto_minmax(460px,1fr)_auto] items-center gap-6">
            <div className="min-w-0">
              <div className="flex items-center leading-none">
                <div className="min-w-0 flex items-baseline gap-0.5 leading-none">
                  <h1 className="text-[1.7rem] font-black tracking-[-0.055em] text-slate-800">LIVE</h1>
                  <h1 className="text-[1.7rem] font-black tracking-[-0.055em] text-indigo-600">DROP</h1>
                </div>
                <span className="-ml-0.5 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12),rgba(99,102,241,0)_72%)]">
                  <img
                    src={brandBoltLogo}
                    alt="LiveDrop logo"
                    className="h-11 w-11 object-contain"
                  />
                </span>
              </div>
              <p className="-mt-0.5 text-[0.72rem] font-semibold leading-none tracking-[0.14em] text-slate-400">
                don&apos;t miss the drop
              </p>
            </div>

            <label className="group relative flex h-12 items-center rounded-[1.05rem] border border-slate-200 bg-white px-3 shadow-sm shadow-slate-200/45 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
              <AppIcon name="deal" size={17} className="text-slate-400 group-focus-within:text-indigo-500" />
              <input
                value={desktopSearchQuery}
                onChange={(event) => onDesktopSearchQueryChange?.(event.target.value)}
                placeholder={desktopSearchPlaceholder}
                className="h-full w-full bg-transparent px-2 text-[13px] font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
                type="search"
                aria-label="Search LiveDrop deals"
              />
              {desktopSearchQuery ? (
                <button
                  type="button"
                  onClick={() => onDesktopSearchQueryChange?.('')}
                  className="inline-flex h-8 items-center justify-center rounded-[0.8rem] border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  Clear
                </button>
              ) : null}
            </label>

            <div className="flex shrink-0 items-center gap-2">
              {isAuthenticated ? (
                <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/92 py-1.5 pl-2 pr-3 shadow-sm shadow-slate-200/35">
                  {userAvatarUrl ? (
                    <img src={userAvatarUrl} alt="Profile" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-600">
                      {(userEmail ?? 'U').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="max-w-[170px] truncate text-[10px] font-bold text-slate-600">{userEmail}</span>
                  <button onClick={onSignOut} className="text-slate-400 hover:text-slate-700">
                    <AppIcon name="logout" size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={onOpenAuth}
                  className="inline-flex h-10 items-center rounded-full bg-indigo-600 px-3.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-indigo-100/70"
                >
                  Sign In
                </button>
              )}
              <button onClick={onToggleNotifications} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/92 text-slate-500 shadow-sm shadow-slate-200/30 transition-colors hover:bg-slate-50">
                <AppIcon name="bell" size={18} />
                {unreadNotificationCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-black text-white shadow-[0_8px_18px_rgba(79,70,229,0.28)]">
                    {unreadNotificationCount}
                  </span>
                ) : null}
              </button>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/92 text-slate-500 shadow-sm shadow-slate-200/30">
                <AppIcon name="pin" size={18} />
              </div>
            </div>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-50 flex items-center justify-between gap-2.5 border-b border-white/70 bg-white/88 px-3.5 py-3 pt-5 backdrop-blur-xl max-[359px]:gap-2 max-[359px]:px-3 max-[359px]:pt-4">
        <div className="min-w-0 flex flex-1 flex-col items-start justify-center">
          <div className="flex items-center leading-none">
            <div className="min-w-0 flex items-baseline gap-0.5 leading-none">
              <h1 className={`font-black tracking-[-0.055em] text-slate-800 ${isDesktopLayout ? 'text-[1.7rem]' : 'text-[1.34rem] max-[359px]:text-[1.18rem] min-[390px]:text-[1.42rem]'}`}>LIVE</h1>
              <h1 className={`font-black tracking-[-0.055em] text-indigo-600 ${isDesktopLayout ? 'text-[1.7rem]' : 'text-[1.34rem] max-[359px]:text-[1.18rem] min-[390px]:text-[1.42rem]'}`}>DROP</h1>
            </div>
            <span className={`-ml-0.5 inline-flex shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12),rgba(99,102,241,0)_72%)] ${isDesktopLayout ? 'h-14 w-14' : 'h-11 w-11 max-[359px]:h-10 max-[359px]:w-10 min-[390px]:h-12 min-[390px]:w-12'}`}>
              <img
                src={brandBoltLogo}
                alt="LiveDrop logo"
                className={`object-contain ${isDesktopLayout ? 'h-11 w-11' : 'h-9 w-9 max-[359px]:h-8 max-[359px]:w-8 min-[390px]:h-10 min-[390px]:w-10'}`}
              />
            </span>
          </div>
          <p className={`-mt-0.5 font-semibold leading-none tracking-[0.14em] text-slate-400 ${isDesktopLayout ? 'text-[0.72rem]' : 'text-[0.55rem] max-[359px]:text-[0.5rem] min-[390px]:text-[0.6rem]'}`}>
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
      )}

      {isAdminSession ? (
        <div className={`border-b border-indigo-100/80 bg-indigo-50/85 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700 ${isDesktopLayout ? 'px-8' : 'px-3.5 max-[359px]:px-2.5'}`}>
          {adminLabel ? `Admin: ${adminLabel}` : 'Logged in as Admin'}
        </div>
      ) : null}

      {role !== 'business' ? (
        <div className={`hidden min-[1024px]:block border-b border-slate-100/90 bg-white/88 ${isDesktopLayout ? 'px-8 py-3' : 'px-3.5 py-2.5 max-[359px]:px-2.5'}`}>
          <div className="mx-auto flex w-full max-w-[840px] items-center justify-center">
            <div className={`inline-grid grid-cols-4 items-center gap-1 rounded-[1.2rem] border border-slate-200 bg-white p-1 shadow-[0_8px_22px_rgba(148,163,184,0.18)] ${isDesktopLayout ? 'h-12 w-[640px]' : 'h-11 w-full max-w-[430px]'}`}>
              <button
                type="button"
                onClick={() => onViewChange('live-deals')}
                aria-pressed={currentView === 'live-deals' || currentView === 'deal-detail'}
                className={`inline-flex h-full items-center justify-center gap-2 rounded-[0.95rem] px-4 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                  currentView === 'live-deals' || currentView === 'deal-detail'
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.28)]'
                    : 'text-slate-500 hover:text-indigo-600'
                }`}
              >
                <AppIcon name="home" size={15} />
                <span>Home</span>
              </button>
              <button
                type="button"
                onClick={() => onViewChange('catalog')}
                aria-pressed={currentView === 'catalog'}
                className={`inline-flex h-full items-center justify-center gap-2 rounded-[0.95rem] px-4 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                  currentView === 'catalog'
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.28)]'
                    : 'text-slate-500 hover:text-indigo-600'
                }`}
              >
                <AppIcon name="catalog" size={15} />
                <span>Catalog</span>
              </button>
              <button
                type="button"
                onClick={() => onViewChange('my-claims')}
                aria-pressed={currentView === 'my-claims'}
                className={`inline-flex h-full items-center justify-center gap-2 rounded-[0.95rem] px-4 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                  currentView === 'my-claims'
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.28)]'
                    : 'text-slate-500 hover:text-indigo-600'
                }`}
              >
                <AppIcon name="claims" size={15} />
                <span>Claims</span>
              </button>
              <button
                type="button"
                onClick={() => onViewChange('business-portal')}
                aria-pressed={currentView === 'business-portal'}
                className={`inline-flex h-full items-center justify-center gap-2 rounded-[0.95rem] px-4 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                  currentView === 'business-portal'
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.28)]'
                    : 'text-slate-500 hover:text-indigo-600'
                }`}
              >
                <AppIcon name="portal" size={15} />
                <span>Upgrade</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
      <main className={`flex-1 overflow-y-auto py-3 ${isDesktopLayout ? 'px-8 py-6' : 'px-3.5 max-[359px]:px-2.5'}`} style={mainContentStyle}>
        {children}
      </main>

      {/* Navigation */}
      <nav
        className={`fixed left-0 right-0 z-50 mx-auto flex w-full items-center justify-between border-t border-white/80 bg-white/94 pt-1.5 shadow-[0_-8px_26px_rgba(15,23,42,0.06)] backdrop-blur-xl ${
          isDesktopLayout
            ? 'hidden'
            : 'max-w-[430px] px-3 max-[359px]:px-2.5'
        }`}
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
