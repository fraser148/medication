# Medication Tracker

A simple app to track medication doses with Telegram reminders.

## Setup

### 1. Upstash Redis

1. Go to [Upstash Console](https://console.upstash.com)
2. Create a new Redis database (free tier)
3. Copy the REST URL and Token

### 2. Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token

### 3. Environment Variables

Create `.env.local`:

```env
UPSTASH_REDIS_REST_URL=your-url-here
UPSTASH_REDIS_REST_TOKEN=your-token-here
TELEGRAM_BOT_TOKEN=your-bot-token-here
CRON_SECRET=any-random-string
```

### 4. Deploy to Vercel

```bash
bun install
vercel
```

### 5. Set Telegram Webhook

After deployment, set the webhook:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_URL>/api/telegram/webhook"
```

### 6. Start Using

1. Open the app in your browser
2. Message your Telegram bot `/start` to enable reminders
3. Take your medication and tap the button!

## Commands

- `/start` - Register for reminders
- `/take` - Log a dose via Telegram
- `/status` - Check your schedule
- `/help` - Show help
