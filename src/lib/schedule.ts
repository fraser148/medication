// Dynamic dose scheduling based on wake-up time
const SLEEP_GAP_HOURS = 6; // Gap indicating sleep
const DOSES_PER_DAY = 5;
const DEFAULT_WAKE_HOUR = 8; // Default assumed wake time if no first dose today

/**
 * Check if this would be the first dose of the day (6+ hour gap since last dose)
 */
export function isFirstDoseOfDay(lastDoseTimestamp: number | null): boolean {
  if (!lastDoseTimestamp) return true;
  const hoursSinceLastDose =
    (Date.now() - lastDoseTimestamp) / (1000 * 60 * 60);
  return hoursSinceLastDose >= SLEEP_GAP_HOURS;
}

/**
 * Calculate dynamic interval based on first dose time (wake-up) until midnight
 * Spreads remaining doses evenly across waking hours
 */
export function calculateDynamicInterval(firstDoseTime: number): number {
  const firstDose = new Date(firstDoseTime);
  const midnight = new Date(firstDose);
  midnight.setHours(24, 0, 0, 0); // Next midnight

  const wakingMs = midnight.getTime() - firstDoseTime;
  const intervalMs = wakingMs / (DOSES_PER_DAY - 1); // 4 intervals for 5 doses
  return intervalMs;
}

/**
 * Get the first dose timestamp from today's doses
 */
export function getFirstDoseToday(dosesToday: number[]): number | null {
  if (dosesToday.length === 0) return null;
  return Math.min(...dosesToday);
}

export function calculateNextDoseTime(
  lastDoseTimestamp: number | null,
  dosesToday: number[] = [],
): Date {
  // If no doses ever, take now
  if (!lastDoseTimestamp) {
    return new Date();
  }

  // If this would be first dose of day (6+ hour gap), take now
  if (isFirstDoseOfDay(lastDoseTimestamp)) {
    return new Date();
  }

  // If already taken 5 today, next is tomorrow morning
  if (dosesToday.length >= DOSES_PER_DAY) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(DEFAULT_WAKE_HOUR, 0, 0, 0);
    return tomorrow;
  }

  // Calculate interval from first dose of today
  const firstDoseToday = getFirstDoseToday(dosesToday);
  if (!firstDoseToday) {
    // Edge case: no doses today but last dose was recent (shouldn't happen)
    return new Date();
  }

  const interval = calculateDynamicInterval(firstDoseToday);
  return new Date(lastDoseTimestamp + interval);
}

export function calculateNextTwoDoses(
  lastDoseTimestamp: number | null,
  dosesToday: number[] = [],
): {
  next: Date;
  nextNext: Date;
} {
  const next = calculateNextDoseTime(lastDoseTimestamp, dosesToday);

  // For nextNext, simulate having taken the next dose
  const simulatedDosesToday = [...dosesToday];
  // Only add if it would be today
  const nextTime = next.getTime();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  if (nextTime >= todayStart.getTime() && nextTime <= todayEnd.getTime()) {
    simulatedDosesToday.push(nextTime);
  }

  const nextNext = calculateNextDoseTime(nextTime, simulatedDosesToday);

  return { next, nextNext };
}

export function isDoseOverdue(
  lastDoseTimestamp: number | null,
  dosesToday: number[] = [],
): boolean {
  if (!lastDoseTimestamp) return true;

  const nextDueTime = calculateNextDoseTime(lastDoseTimestamp, dosesToday);
  return new Date() > nextDueTime;
}

export function getOverdueMinutes(
  lastDoseTimestamp: number | null,
  dosesToday: number[] = [],
): number {
  if (!lastDoseTimestamp) return 999; // Very overdue if never taken

  const nextDueTime = calculateNextDoseTime(lastDoseTimestamp, dosesToday);
  const now = new Date();

  if (now <= nextDueTime) return 0;

  return Math.floor((now.getTime() - nextDueTime.getTime()) / 60000);
}

export function formatTimeUntil(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();

  if (diffMs < 0) {
    const overdueMins = Math.abs(Math.floor(diffMs / 60000));
    if (overdueMins < 60) {
      return `${overdueMins}m overdue`;
    }
    const hours = Math.floor(overdueMins / 60);
    const mins = overdueMins % 60;
    return `${hours}h ${mins}m overdue`;
  }

  const totalMins = Math.floor(diffMs / 60000);
  if (totalMins < 60) {
    return `in ${totalMins}m`;
  }
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `in ${hours}h ${mins}m`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}
