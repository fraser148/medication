// Dynamic dose scheduling based on wake-up time
const SLEEP_GAP_HOURS = 6; // Gap indicating sleep
const DOSES_PER_DAY = 5;
const DEFAULT_WAKE_HOUR = 8; // Default assumed wake time if no first dose today
const WAKE_START_HOUR = 9;
const WAKE_END_HOUR = 23;
const WAKE_DURATION_MINS = (WAKE_END_HOUR - WAKE_START_HOUR) * 60; // 840
const INTERVAL_MINS = WAKE_DURATION_MINS / (DOSES_PER_DAY - 1); // 210

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
 * Fixed interval between doses (210 minutes = 3h 30m)
 */
const INTERVAL_MS = INTERVAL_MINS * 60 * 1000;

/**
 * Check if a given time falls within sleep hours (11pm to 9am)
 */
function isInSleepHours(date: Date): boolean {
  const hour = date.getHours();
  // Sleep hours: 11pm (23) to 9am (exclusive)
  return hour >= WAKE_END_HOUR || hour < WAKE_START_HOUR;
}

/**
 * Get the next wake time (9am) from a given date
 */
function getNextWakeTime(fromDate: Date): Date {
  const result = new Date(fromDate);
  result.setHours(WAKE_START_HOUR, 0, 0, 0);

  // If we're past wake time today, it's tomorrow's wake time
  if (result <= fromDate) {
    result.setDate(result.getDate() + 1);
  }

  return result;
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
  maxDosesToday: number = DOSES_PER_DAY,
): Date {
  // If no doses ever, take now
  if (!lastDoseTimestamp) {
    return new Date();
  }

  // If this would be first dose of day (6+ hour gap), take now
  if (isFirstDoseOfDay(lastDoseTimestamp)) {
    return new Date();
  }

  // If already taken max doses today, next is tomorrow morning
  if (dosesToday.length >= maxDosesToday) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(WAKE_START_HOUR, 0, 0, 0);
    return tomorrow;
  }

  // Calculate next dose using fixed interval
  const nextDose = new Date(lastDoseTimestamp + INTERVAL_MS);

  // If next dose falls in sleep hours, push to next wake time
  if (isInSleepHours(nextDose)) {
    return getNextWakeTime(nextDose);
  }

  return nextDose;
}

export function calculateNextTwoDoses(
  lastDoseTimestamp: number | null,
  dosesToday: number[] = [],
  maxDosesToday: number = DOSES_PER_DAY,
): {
  next: Date;
  nextNext: Date;
} {
  const next = calculateNextDoseTime(
    lastDoseTimestamp,
    dosesToday,
    maxDosesToday,
  );

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

  const nextNext = calculateNextDoseTime(
    nextTime,
    simulatedDosesToday,
    maxDosesToday,
  );

  return { next, nextNext };
}

export function isDoseOverdue(
  lastDoseTimestamp: number | null,
  dosesToday: number[] = [],
  maxDosesToday: number = DOSES_PER_DAY,
): boolean {
  if (!lastDoseTimestamp) return true;

  const nextDueTime = calculateNextDoseTime(
    lastDoseTimestamp,
    dosesToday,
    maxDosesToday,
  );
  return new Date() > nextDueTime;
}

export function getOverdueMinutes(
  lastDoseTimestamp: number | null,
  dosesToday: number[] = [],
  maxDosesToday: number = DOSES_PER_DAY,
): number {
  if (!lastDoseTimestamp) return 999; // Very overdue if never taken

  const nextDueTime = calculateNextDoseTime(
    lastDoseTimestamp,
    dosesToday,
    maxDosesToday,
  );
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

function sameDay(timestamp1: number, timestamp2: number): boolean {
  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function calculateFirstDayMax(firstDoseTimestamp: number): number {
  const firstDoseDate = new Date(firstDoseTimestamp);
  const minutesFromMidnight =
    firstDoseDate.getHours() * 60 + firstDoseDate.getMinutes();

  const wakeStartMins = WAKE_START_HOUR * 60; // 540
  const wakeEndMins = WAKE_END_HOUR * 60; // 1380

  // Too late in the day
  if (minutesFromMidnight >= wakeEndMins) {
    return 1;
  }

  // Before or at wake time - full doses
  if (minutesFromMidnight <= wakeStartMins) {
    return DOSES_PER_DAY;
  }

  // Calculate missed slots using ceil (if past a slot time, it's missed)
  const minutesSinceWake = minutesFromMidnight - wakeStartMins;
  const slotsMissed = Math.ceil(minutesSinceWake / INTERVAL_MINS);

  const dosesRemaining = DOSES_PER_DAY - slotsMissed;

  return Math.max(1, dosesRemaining);
}

export function getMaxDosesForToday(
  dosesToday: number[],
  firstDoseEver: number | null,
): number {
  // No doses ever - return default (will recalculate after first dose)
  if (firstDoseEver === null) {
    return DOSES_PER_DAY;
  }

  // No doses today but have historical doses - it's a new day, full count
  if (dosesToday.length === 0) {
    return DOSES_PER_DAY;
  }

  // Check if today is THE first day ever
  const firstDoseToday = dosesToday[0];
  if (sameDay(firstDoseToday, firstDoseEver)) {
    // This is day 1 - calculate reduced max
    return calculateFirstDayMax(firstDoseEver);
  }

  // Normal day
  return DOSES_PER_DAY;
}
