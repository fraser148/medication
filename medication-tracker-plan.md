# Medication Reminder App - Claude Code Implementation Plan

## CRITICAL REQUIREMENTS
- **USE BUN** - Not npm or yarn
- **All services must be FREE TIER**
- **Next.js 14+ with App Router**

---

## Project Overview

Build a medication tracking web app for someone taking anti-viral medication 5 times daily. The app shows dose schedule, allows logging doses, and sends Telegram reminders when doses are overdue.

---

## Step-by-Step Implementation

### Step 1: Project Initialization

```bash
# Create Next.js project with Bun
bunx create-next-app@latest medication-tracker --typescript --tailwind --app --src=false --eslint --no-import-alias

cd medication-tracker

# Install dependencies with Bun
bun add @upstash/redis
```

### Step 2: Environment Variables

Create `.env.local`:

```env
# Upstash Redis (get from https://console.upstash.com)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Telegram Bot (get from @BotFather)
TELEGRAM_BOT_TOKEN=

# Will be set after user messages the bot with /start
TELEGRAM_CHAT_ID=

# Random string to protect cron endpoint
CRON_SECRET=your-random-secret-here
```

Create `.env.example` with the same structure but empty values for documentation.

### Step 3: Redis Client (lib/redis.ts)

```typescript
import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Keys
const DOSES_KEY = 'doses' // Sorted set: score = timestamp, value = timestamp
const SETTINGS_KEY = 'settings'
const LAST_REMINDER_KEY = 'last_reminder_sent'

export async function logDose(timestamp: number): Promise<void> {
  await redis.zadd(DOSES_KEY, { score: timestamp, member: timestamp.toString() })
}

export async function getLastDose(): Promise<number | null> {
  const results = await redis.zrange(DOSES_KEY, -1, -1)
  if (results.length === 0) return null
  return parseInt(results[0] as string)
}

export async function getDosesToday(): Promise<number[]> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)
  
  const results = await redis.zrangebyscore(
    DOSES_KEY,
    startOfDay.getTime(),
    endOfDay.getTime()
  )
  return results.map((r) => parseInt(r as string))
}

export async function getLastReminderTime(): Promise<number | null> {
  const result = await redis.get(LAST_REMINDER_KEY)
  return result ? parseInt(result as string) : null
}

export async function setLastReminderTime(timestamp: number): Promise<void> {
  await redis.set(LAST_REMINDER_KEY, timestamp.toString())
}

export async function saveTelegramChatId(chatId: string): Promise<void> {
  await redis.hset(SETTINGS_KEY, { telegram_chat_id: chatId })
}

export async function getTelegramChatId(): Promise<string | null> {
  const result = await redis.hget(SETTINGS_KEY, 'telegram_chat_id')
  return result as string | null
}
```

### Step 4: Schedule Logic (lib/schedule.ts)

```typescript
// 5 doses per day, spread over ~16 waking hours
// 16 hours * 60 min = 960 min / 5 doses = 192 min between doses (3h 12m)
const DOSE_INTERVAL_MS = 192 * 60 * 1000 // 3 hours 12 minutes in milliseconds
const DOSES_PER_DAY = 5

export function calculateNextDoseTime(lastDoseTimestamp: number | null): Date {
  if (!lastDoseTimestamp) {
    // If no doses logged, suggest taking one now
    return new Date()
  }
  
  const nextDose = new Date(lastDoseTimestamp + DOSE_INTERVAL_MS)
  return nextDose
}

export function calculateNextTwoDoses(lastDoseTimestamp: number | null): {
  next: Date
  nextNext: Date
} {
  const next = calculateNextDoseTime(lastDoseTimestamp)
  const nextNext = new Date(next.getTime() + DOSE_INTERVAL_MS)
  
  return { next, nextNext }
}

export function isDoseOverdue(lastDoseTimestamp: number | null): boolean {
  if (!lastDoseTimestamp) return true
  
  const nextDueTime = calculateNextDoseTime(lastDoseTimestamp)
  return new Date() > nextDueTime
}

export function getOverdueMinutes(lastDoseTimestamp: number | null): number {
  if (!lastDoseTimestamp) return 999 // Very overdue if never taken
  
  const nextDueTime = calculateNextDoseTime(lastDoseTimestamp)
  const now = new Date()
  
  if (now <= nextDueTime) return 0
  
  return Math.floor((now.getTime() - nextDueTime.getTime()) / 60000)
}

export function formatTimeUntil(targetDate: Date): string {
  const now = new Date()
  const diffMs = targetDate.getTime() - now.getTime()
  
  if (diffMs < 0) {
    const overdueMins = Math.abs(Math.floor(diffMs / 60000))
    if (overdueMins < 60) {
      return `${overdueMins}m overdue`
    }
    const hours = Math.floor(overdueMins / 60)
    const mins = overdueMins % 60
    return `${hours}h ${mins}m overdue`
  }
  
  const totalMins = Math.floor(diffMs / 60000)
  if (totalMins < 60) {
    return `in ${totalMins}m`
  }
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  return `in ${hours}h ${mins}m`
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  
  const hours = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`
  }
  
  return `${Math.floor(hours / 24)}d ago`
}
```

### Step 5: Telegram Helper (lib/telegram.ts)

```typescript
const TELEGRAM_API = 'https://api.telegram.org/bot'

export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId) return false

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })
    return response.ok
  } catch (error) {
    console.error('Telegram send error:', error)
    return false
  }
}

export async function sendReminder(chatId: string, overdueMinutes: number): Promise<boolean> {
  const emoji = overdueMinutes > 30 ? '🚨' : '⏰'
  const message = `${emoji} <b>Medication Reminder</b>\n\nYour dose was due ${overdueMinutes} minutes ago. Don't forget to take it!\n\nReply /take when done.`
  return sendTelegramMessage(chatId, message)
}

export async function sendDoseConfirmation(
  chatId: string,
  nextDoseTime: string
): Promise<boolean> {
  const message = `✅ <b>Dose logged!</b>\n\nNext dose: ${nextDoseTime}`
  return sendTelegramMessage(chatId, message)
}

export async function sendStatus(
  chatId: string,
  lastDoseAgo: string,
  nextDoseIn: string,
  dosesToday: number
): Promise<boolean> {
  const message = `📊 <b>Status</b>\n\nLast dose: ${lastDoseAgo}\nNext dose: ${nextDoseIn}\nDoses today: ${dosesToday}/5`
  return sendTelegramMessage(chatId, message)
}
```

### Step 6: API Route - Dose (app/api/dose/route.ts)

```typescript
import { NextResponse } from 'next/server'
import { logDose, getLastDose, getDosesToday, getTelegramChatId } from '@/lib/redis'
import { calculateNextTwoDoses, formatTime, formatTimeAgo, formatTimeUntil, getOverdueMinutes } from '@/lib/schedule'
import { sendDoseConfirmation } from '@/lib/telegram'

export async function GET() {
  try {
    const lastDoseTimestamp = await getLastDose()
    const dosesToday = await getDosesToday()
    const { next, nextNext } = calculateNextTwoDoses(lastDoseTimestamp)
    const overdueMinutes = getOverdueMinutes(lastDoseTimestamp)

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
    })
  } catch (error) {
    console.error('GET /api/dose error:', error)
    return NextResponse.json({ error: 'Failed to fetch dose data' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const now = Date.now()
    await logDose(now)

    const { next } = calculateNextTwoDoses(now)
    
    // Send Telegram confirmation if chat ID is set
    const chatId = await getTelegramChatId()
    if (chatId) {
      await sendDoseConfirmation(chatId, formatTime(next))
    }

    return NextResponse.json({
      success: true,
      loggedAt: now,
      nextDose: {
        timestamp: next.getTime(),
        formatted: formatTime(next),
      },
    })
  } catch (error) {
    console.error('POST /api/dose error:', error)
    return NextResponse.json({ error: 'Failed to log dose' }, { status: 500 })
  }
}
```

### Step 7: API Route - Telegram Webhook (app/api/telegram/webhook/route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { logDose, getLastDose, getDosesToday, saveTelegramChatId, getTelegramChatId } from '@/lib/redis'
import { calculateNextTwoDoses, formatTime, formatTimeAgo, formatTimeUntil } from '@/lib/schedule'
import { sendTelegramMessage, sendDoseConfirmation, sendStatus } from '@/lib/telegram'

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json()
    
    if (!update.message?.text) {
      return NextResponse.json({ ok: true })
    }

    const chatId = update.message.chat.id.toString()
    const text = update.message.text.trim().toLowerCase()

    if (text === '/start') {
      // Save chat ID for future notifications
      await saveTelegramChatId(chatId)
      await sendTelegramMessage(
        chatId,
        '👋 <b>Welcome to Medication Tracker!</b>\n\n' +
        'I\'ll remind you when it\'s time to take your medication.\n\n' +
        '<b>Commands:</b>\n' +
        '/take - Log a dose\n' +
        '/status - Check your schedule\n' +
        '/help - Show this message'
      )
    } else if (text === '/take') {
      const now = Date.now()
      await logDose(now)
      const { next } = calculateNextTwoDoses(now)
      await sendDoseConfirmation(chatId, formatTime(next))
    } else if (text === '/status') {
      const lastDoseTimestamp = await getLastDose()
      const dosesToday = await getDosesToday()
      const { next } = calculateNextTwoDoses(lastDoseTimestamp)
      
      await sendStatus(
        chatId,
        lastDoseTimestamp ? formatTimeAgo(lastDoseTimestamp) : 'Never',
        formatTimeUntil(next),
        dosesToday.length
      )
    } else if (text === '/help') {
      await sendTelegramMessage(
        chatId,
        '💊 <b>Medication Tracker Help</b>\n\n' +
        '/take - Log that you\'ve taken a dose\n' +
        '/status - See last dose and next due time\n' +
        '/help - Show this message\n\n' +
        'I\'ll automatically remind you if you\'re late!'
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true }) // Always return 200 to Telegram
  }
}
```

### Step 8: API Route - Cron Reminder (app/api/cron/remind/route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getLastDose, getLastReminderTime, setLastReminderTime, getTelegramChatId } from '@/lib/redis'
import { getOverdueMinutes } from '@/lib/schedule'
import { sendReminder } from '@/lib/telegram'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const chatId = await getTelegramChatId()
    if (!chatId) {
      return NextResponse.json({ message: 'No chat ID configured' })
    }

    const lastDoseTimestamp = await getLastDose()
    const overdueMinutes = getOverdueMinutes(lastDoseTimestamp)

    // Only send reminder if overdue by more than 15 minutes
    if (overdueMinutes < 15) {
      return NextResponse.json({ message: 'Not overdue enough', overdueMinutes })
    }

    // Check if we sent a reminder recently (within 30 min)
    const lastReminderTime = await getLastReminderTime()
    const now = Date.now()
    if (lastReminderTime && now - lastReminderTime < 30 * 60 * 1000) {
      return NextResponse.json({ message: 'Reminder sent recently' })
    }

    // Send reminder
    const sent = await sendReminder(chatId, overdueMinutes)
    if (sent) {
      await setLastReminderTime(now)
    }

    return NextResponse.json({ 
      message: sent ? 'Reminder sent' : 'Failed to send reminder',
      overdueMinutes 
    })
  } catch (error) {
    console.error('Cron reminder error:', error)
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 })
  }
}
```

### Step 9: Main Page (app/page.tsx)

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'

interface DoseData {
  lastDose: {
    timestamp: number
    timeAgo: string
    formatted: string
  } | null
  nextDose: {
    timestamp: number
    formatted: string
    timeUntil: string
  }
  nextNextDose: {
    timestamp: number
    formatted: string
  }
  dosesToday: number
  overdueMinutes: number
  isOverdue: boolean
}

export default function Home() {
  const [data, setData] = useState<DoseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [taking, setTaking] = useState(false)
  const [justTook, setJustTook] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dose')
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error('Failed to fetch:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [fetchData])

  const handleTakeDose = async () => {
    setTaking(true)
    try {
      const res = await fetch('/api/dose', { method: 'POST' })
      if (res.ok) {
        setJustTook(true)
        setTimeout(() => setJustTook(false), 2000)
        await fetchData()
      }
    } catch (error) {
      console.error('Failed to log dose:', error)
    } finally {
      setTaking(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-red-500">Failed to load data</div>
      </main>
    )
  }

  const getStatusColor = () => {
    if (justTook) return 'bg-green-500'
    if (data.overdueMinutes > 30) return 'bg-red-500'
    if (data.overdueMinutes > 0) return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  const getStatusBgColor = () => {
    if (justTook) return 'bg-green-50'
    if (data.overdueMinutes > 30) return 'bg-red-50'
    if (data.overdueMinutes > 0) return 'bg-yellow-50'
    return 'bg-blue-50'
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm">
        {/* Last dose */}
        <div className="text-center mb-2">
          <p className="text-gray-400 text-sm">
            {data.lastDose
              ? `Last taken: ${data.lastDose.formatted} (${data.lastDose.timeAgo})`
              : 'No doses logged yet'}
          </p>
        </div>

        {/* Main card */}
        <div className={`rounded-2xl shadow-lg overflow-hidden ${getStatusBgColor()}`}>
          {/* Status bar */}
          <div className={`${getStatusColor()} text-white text-center py-2 text-sm font-medium`}>
            {justTook
              ? '✓ Dose logged!'
              : data.isOverdue
              ? `⚠️ ${data.overdueMinutes}m overdue`
              : `${data.dosesToday}/5 doses today`}
          </div>

          {/* Next dose */}
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm uppercase tracking-wide mb-1">
              Next Dose
            </p>
            <p className="text-5xl font-bold text-gray-800 mb-2">
              {data.nextDose.formatted}
            </p>
            <p className={`text-lg ${data.isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
              {data.nextDose.timeUntil}
            </p>
          </div>

          {/* Take button */}
          <div className="px-8 pb-8">
            <button
              onClick={handleTakeDose}
              disabled={taking}
              className={`w-full py-4 rounded-xl text-white font-semibold text-lg transition-all
                ${taking
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 active:scale-98 shadow-md hover:shadow-lg'
                }`}
            >
              {taking ? 'Logging...' : '✓ Take Dose'}
            </button>
          </div>
        </div>

        {/* After that */}
        <div className="text-center mt-4">
          <p className="text-gray-400 text-sm">
            After that: {data.nextNextDose.formatted}
          </p>
        </div>

        {/* Setup hint */}
        <div className="text-center mt-8">
          <p className="text-gray-300 text-xs">
            Set up Telegram for reminders: message the bot /start
          </p>
        </div>
      </div>
    </main>
  )
}
```

### Step 10: Layout & Metadata (app/layout.tsx)

```typescript
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Medication Tracker',
  description: 'Track your medication doses',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3b82f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

### Step 11: PWA Manifest (public/manifest.json)

```json
{
  "name": "Medication Tracker",
  "short_name": "MedTracker",
  "description": "Track your medication doses",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f3f4f6",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Step 12: Vercel Config (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cron/remind",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

### Step 13: README.md

```markdown
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
```

---

## Deployment Steps

```bash
# 1. Initialize and install
bunx create-next-app@latest medication-tracker --typescript --tailwind --app --src=false --eslint --no-import-alias
cd medication-tracker
bun add @upstash/redis

# 2. Create all the files as specified above

# 3. Run locally to test
bun dev

# 4. Deploy to Vercel
vercel

# 5. Set environment variables in Vercel dashboard

# 6. Set Telegram webhook (replace with actual values)
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<APP>.vercel.app/api/telegram/webhook"
```

---

## File Creation Order

1. `lib/redis.ts`
2. `lib/schedule.ts`
3. `lib/telegram.ts`
4. `app/api/dose/route.ts`
5. `app/api/telegram/webhook/route.ts`
6. `app/api/cron/remind/route.ts`
7. `app/page.tsx`
8. `app/layout.tsx` (modify existing)
9. `public/manifest.json`
10. `vercel.json`
11. `.env.local`
12. `.env.example`
13. `README.md`

---

## Free Tier Confirmation

| Service | Free Tier Limit | Expected Usage |
|---------|-----------------|----------------|
| Vercel | 100k invocations/mo | ~5k/mo |
| Upstash Redis | 10k commands/day | ~100/day |
| Vercel Cron | Included | 1 job, 15min |
| Telegram | Unlimited | N/A |

All services remain well within free tier limits.
