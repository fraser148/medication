import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL ?? "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
});

// Keys
const DOSES_KEY = "doses"; // Sorted set: score = timestamp, value = timestamp
const SETTINGS_KEY = "settings";
const LAST_REMINDER_KEY = "last_reminder_sent";

export async function logDose(timestamp: number): Promise<void> {
  await redis.zadd(DOSES_KEY, {
    score: timestamp,
    member: timestamp.toString(),
  });
}

export async function getLastDose(): Promise<number | null> {
  const results = await redis.zrange(DOSES_KEY, -1, -1);
  if (results.length === 0) return null;
  return parseInt(results[0] as string, 10);
}

export async function getFirstDoseEver(): Promise<number | null> {
  const results = await redis.zrange(DOSES_KEY, 0, 0);
  if (results.length === 0) return null;
  return parseInt(results[0] as string, 10);
}

export async function getDosesToday(): Promise<number[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const results = await redis.zrange(
    DOSES_KEY,
    startOfDay.getTime(),
    endOfDay.getTime(),
    {
      byScore: true,
    },
  );
  return results.map((r) => parseInt(r as string, 10));
}

export async function getLastReminderTime(): Promise<number | null> {
  const result = await redis.get(LAST_REMINDER_KEY);
  return result ? parseInt(result as string, 10) : null;
}

export async function setLastReminderTime(timestamp: number): Promise<void> {
  await redis.set(LAST_REMINDER_KEY, timestamp.toString());
}

export async function saveTelegramChatId(chatId: string): Promise<void> {
  await redis.hset(SETTINGS_KEY, { telegram_chat_id: chatId });
}

export async function getTelegramChatId(): Promise<string | null> {
  const result = await redis.hget(SETTINGS_KEY, "telegram_chat_id");
  return result as string | null;
}
