const TELEGRAM_API = "https://api.telegram.org/bot";

export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("Telegram send error:", error);
    return false;
  }
}

export async function sendReminder(
  chatId: string,
  overdueMinutes: number,
): Promise<boolean> {
  const emoji = overdueMinutes > 30 ? "\u{1F6A8}" : "\u23F0";
  const message = `${emoji} <b>Medication Reminder</b>\n\nYour dose was due ${overdueMinutes} minutes ago. Don't forget to take it!\n\nReply /take when done.`;
  return sendTelegramMessage(chatId, message);
}

export async function sendDoseConfirmation(
  chatId: string,
  nextDoseTime: string,
): Promise<boolean> {
  const message = `\u2705 <b>Dose logged!</b>\n\nNext dose: ${nextDoseTime}`;
  return sendTelegramMessage(chatId, message);
}

export async function sendStatus(
  chatId: string,
  lastDoseAgo: string,
  nextDoseIn: string,
  dosesToday: number,
  maxDosesToday: number,
): Promise<boolean> {
  const message = `\u{1F4CA} <b>Status</b>\n\nLast dose: ${lastDoseAgo}\nNext dose: ${nextDoseIn}\nDoses today: ${dosesToday}/${maxDosesToday}`;
  return sendTelegramMessage(chatId, message);
}
