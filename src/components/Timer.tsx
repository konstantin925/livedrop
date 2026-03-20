import React, { useState, useEffect } from 'react';

interface TimerProps {
  expiresAt: number;
  onExpire?: () => void;
  className?: string;
}

export const Timer: React.FC<TimerProps> = ({ expiresAt, onExpire, className = "" }) => {
  const [timeLeft, setTimeLeft] = useState<number>(Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    // Update immediately when expiresAt changes
    const initialTime = Math.max(0, expiresAt - Date.now());
    setTimeLeft(initialTime);

    if (initialTime <= 0) return;

    const interval = setInterval(() => {
      const newTimeLeft = Math.max(0, expiresAt - Date.now());
      setTimeLeft(newTimeLeft);
      
      if (newTimeLeft <= 0) {
        clearInterval(interval);
        if (onExpire) onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  const isUrgent = timeLeft < 5 * 60000; // Less than 5 mins

  return (
    <div className={`font-mono font-bold tabular-nums ${isUrgent ? 'text-rose-500 animate-pulse' : 'text-indigo-600'} ${className}`}>
      {timeLeft > 0 ? (
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      ) : (
        "EXPIRED"
      )}
    </div>
  );
};
