import React from 'react';
import { AppNotification } from '../types';
import { AppIcon } from './AppIcon';

interface ToastStackProps {
  notifications: AppNotification[];
}

export const ToastStack: React.FC<ToastStackProps> = ({ notifications }) => {
  if (notifications.length === 0) return null;

  const getIconName = (type: AppNotification['type']) => {
    if (type === 'new_deal') return 'live';
    if (type === 'ending_soon') return 'ending';
    return 'percent';
  };

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-[120] pointer-events-none">
      <div className="space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="rounded-2xl border border-indigo-100 bg-white/95 backdrop-blur-md shadow-xl shadow-slate-200 px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-100">
                <AppIcon name={getIconName(notification.type)} size={16} />
              </div>
              <p className="pt-1 text-sm font-semibold text-slate-800">{notification.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
