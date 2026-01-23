import { type NextRequest, NextResponse } from "next/server";
import {
  getDosesToday,
  getLastDose,
  getLastReminderTime,
  getTelegramChatId,
  setLastReminderTime,
} from "@/lib/redis";
import { getOverdueMinutes } from "@/lib/schedule";
import { sendReminder } from "@/lib/telegram";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const chatId = await getTelegramChatId();
    if (!chatId) {
      return NextResponse.json({ message: "No chat ID configured" });
    }

    const lastDoseTimestamp = await getLastDose();
    const dosesToday = await getDosesToday();
    const overdueMinutes = getOverdueMinutes(lastDoseTimestamp, dosesToday);

    // Only send reminder if overdue by more than 15 minutes
    if (overdueMinutes < 15) {
      return NextResponse.json({
        message: "Not overdue enough",
        overdueMinutes,
      });
    }

    // Check if we sent a reminder recently (within 30 min)
    const lastReminderTime = await getLastReminderTime();
    const now = Date.now();
    if (lastReminderTime && now - lastReminderTime < 30 * 60 * 1000) {
      return NextResponse.json({ message: "Reminder sent recently" });
    }

    // Send reminder
    const sent = await sendReminder(chatId, overdueMinutes);
    if (sent) {
      await setLastReminderTime(now);
    }

    return NextResponse.json({
      message: sent ? "Reminder sent" : "Failed to send reminder",
      overdueMinutes,
    });
  } catch (error) {
    console.error("Cron reminder error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
