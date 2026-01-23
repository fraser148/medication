import { type NextRequest, NextResponse } from "next/server";
import {
  getDosesToday,
  getFirstDoseEver,
  getLastDose,
  logDose,
  saveTelegramChatId,
} from "@/lib/redis";
import {
  calculateNextTwoDoses,
  formatTime,
  formatTimeAgo,
  formatTimeUntil,
  getMaxDosesForToday,
} from "@/lib/schedule";
import {
  sendDoseConfirmation,
  sendStatus,
  sendTelegramMessage,
} from "@/lib/telegram";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();

    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = update.message.chat.id.toString();
    const text = update.message.text.trim().toLowerCase();

    if (text === "/start") {
      // Save chat ID for future notifications
      await saveTelegramChatId(chatId);
      await sendTelegramMessage(
        chatId,
        "\u{1F44B} <b>Welcome to Medication Tracker!</b>\n\n" +
          "I'll remind you when it's time to take your medication.\n\n" +
          "<b>Commands:</b>\n" +
          "/take - Log a dose\n" +
          "/status - Check your schedule\n" +
          "/help - Show this message",
      );
    } else if (text === "/take") {
      const now = Date.now();
      await logDose(now);
      // Fetch updated doses today (including the one we just logged)
      const dosesToday = await getDosesToday();
      const { next } = calculateNextTwoDoses(now, dosesToday);
      await sendDoseConfirmation(chatId, formatTime(next));
    } else if (text === "/status") {
      const lastDoseTimestamp = await getLastDose();
      const dosesToday = await getDosesToday();
      const firstDoseEver = await getFirstDoseEver();
      const { next } = calculateNextTwoDoses(lastDoseTimestamp, dosesToday);
      const maxDosesToday = getMaxDosesForToday(dosesToday, firstDoseEver);

      await sendStatus(
        chatId,
        lastDoseTimestamp ? formatTimeAgo(lastDoseTimestamp) : "Never",
        formatTimeUntil(next),
        dosesToday.length,
        maxDosesToday,
      );
    } else if (text === "/help") {
      await sendTelegramMessage(
        chatId,
        "\u{1F48A} <b>Medication Tracker Help</b>\n\n" +
          "/take - Log that you've taken a dose\n" +
          "/status - See last dose and next due time\n" +
          "/help - Show this message\n\n" +
          "I'll automatically remind you if you're late!",
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
