import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(timeStr: string): string {
  // Converts "08:00:00" or "08:00" to "08:00 AM"
  const [hourStr, minuteStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12.toString().padStart(2, '0')}:${minuteStr} ${ampm}`;
}

export function formatCurrency(amount: number, currency = 'UGX'): string {
  return `${currency} ${amount.toLocaleString()}`;
}
