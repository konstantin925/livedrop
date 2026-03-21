import React from 'react';
import { AppNotification } from '../types';

interface ToastStackProps {
  notifications: AppNotification[];
}

export const ToastStack: React.FC<ToastStackProps> = ({ notifications }) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-[120] pointer-events-none">
      <div className="space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="rounded-2xl border border-indigo-100 bg-white/95 backdrop-blur-md shadow-xl shadow-slate-200 px-4 py-3"
          >
            <p className="text-sm font-semibold text-slate-800">{notification.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
