/**
 * Returns true if the deal expires in less than 15 minutes.
 */
export function isUrgent(expiresAt: number): boolean {
  const now = Date.now();
  const diff = expiresAt - now;
  return diff > 0 && diff < 15 * 60 * 1000;
}

/**
 * Formats a timestamp into a readable date and time.
 */
export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(timestamp));
}
