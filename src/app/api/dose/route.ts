import { NextResponse } from "next/server";
import {
  getDosesToday,
  getLastDose,
  getTelegramChatId,
  logDose,
} from "@/lib/redis";
import {
  calculateNextTwoDoses,
  formatTime,
  formatTimeAgo,
  formatTimeUntil,
  getOverdueMinutes,
} from "@/lib/schedule";
import { sendDoseConfirmation } from "@/lib/telegram";

export async function GET() {
  try {
    const lastDoseTimestamp = await getLastDose();
    const dosesToday = await getDosesToday();
    const { next, nextNext } = calculateNextTwoDoses(
      lastDoseTimestamp,
      dosesToday,
    );
    const overdueMinutes = getOverdueMinutes(lastDoseTimestamp, dosesToday);

    return NextResponse.json({
      lastDose: lastDoseTimestamp
        ? {
            timestamp: lastDoseTimestamp,
            timeAgo: formatTimeAgo(lastDoseTimestamp),
            formatted: formatTime(new Date(lastDoseTimestamp)),
          }
        : null,
      nextDose: {
        timestamp: next.getTime(),
        formatted: formatTime(next),
        timeUntil: formatTimeUntil(next),
      },
      nextNextDose: {
        timestamp: nextNext.getTime(),
        formatted: formatTime(nextNext),
      },
      dosesToday: dosesToday.length,
      overdueMinutes,
      isOverdue: overdueMinutes > 0,
    });
  } catch (error) {
    console.error("GET /api/dose error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dose data" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    let timestamp = Date.now();

    // Parse optional body for backdate
    try {
      const body = await request.json();
      if (body.timestamp) {
        timestamp = body.timestamp;
      }
    } catch {
      // No body = use current time
    }

    // Validate: must be in past, within 4 hours
    const now = Date.now();
    const fourHoursAgo = now - 4 * 60 * 60 * 1000;

    if (timestamp > now + 60000) {
      // Allow 1 minute tolerance for clock drift
      return NextResponse.json(
        { error: "Cannot log future doses" },
        { status: 400 },
      );
    }
    if (timestamp < fourHoursAgo) {
      return NextResponse.json(
        { error: "Cannot backdate more than 4 hours" },
        { status: 400 },
      );
    }

    await logDose(timestamp);

    // Fetch updated doses today (including the one we just logged)
    const dosesToday = await getDosesToday();
    const { next } = calculateNextTwoDoses(timestamp, dosesToday);

    // Send Telegram confirmation if chat ID is set
    const chatId = await getTelegramChatId();
    if (chatId) {
      await sendDoseConfirmation(chatId, formatTime(next));
    }

    return NextResponse.json({
      success: true,
      loggedAt: now,
      nextDose: {
        timestamp: next.getTime(),
        formatted: formatTime(next),
      },
    });
  } catch (error) {
    console.error("POST /api/dose error:", error);
    return NextResponse.json({ error: "Failed to log dose" }, { status: 500 });
  }
}
