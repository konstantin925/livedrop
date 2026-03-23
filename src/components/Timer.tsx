import React, { useState, useEffect, useRef } from 'react';
import { AppIcon } from './AppIcon';

interface TimerProps {
  expiresAt: number;
  onExpire?: () => void;
  className?: string;
}

export const Timer: React.FC<TimerProps> = ({ expiresAt, onExpire, className = "" }) => {
  const safeExpiresAt = Number.isFinite(expiresAt) ? expiresAt : Date.now();
  const [timeLeft, setTimeLeft] = useState<number>(Math.max(0, safeExpiresAt - Date.now()));
  const hasNotifiedExpiryRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    // Update immediately when expiresAt changes
    const initialTime = Math.max(0, safeExpiresAt - Date.now());
    setTimeLeft(initialTime);
    hasNotifiedExpiryRef.current = false;

    if (initialTime <= 0) {
      if (onExpireRef.current && !hasNotifiedExpiryRef.current) {
        hasNotifiedExpiryRef.current = true;
        onExpireRef.current();
      }
      return;
    }

    const interval = setInterval(() => {
      const newTimeLeft = Math.max(0, safeExpiresAt - Date.now());
      setTimeLeft(newTimeLeft);
      
      if (newTimeLeft <= 0 && !hasNotifiedExpiryRef.current) {
        clearInterval(interval);
        hasNotifiedExpiryRef.current = true;
        if (onExpireRef.current) onExpireRef.current();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [safeExpiresAt]);

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  const isUrgent = timeLeft < 5 * 60000; // Less than 5 mins
  const hasEnded = timeLeft <= 0;
  const timerLabel =
    !hasEnded
      ? `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      : 'Ended';

  return (
    <div className={`inline-flex min-w-[70px] max-w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums shadow-sm backdrop-blur-sm ${hasEnded ? 'border-slate-200/80 bg-slate-100/90 text-slate-400 shadow-slate-200/20' : isUrgent ? 'border-rose-200/90 bg-rose-50/95 text-rose-500 shadow-rose-100/60 animate-pulse' : 'border-slate-200/80 bg-white/92 text-indigo-600 shadow-slate-200/35'} ${className}`}>
      <AppIcon name={hasEnded ? 'ending' : 'clock'} size={12} className="shrink-0" />
      <span className="truncate">{timerLabel}</span>
    </div>
  );
};
