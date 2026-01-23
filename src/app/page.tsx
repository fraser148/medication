"use client";

import { useCallback, useEffect, useState } from "react";

interface DoseData {
  lastDose: {
    timestamp: number;
    timeAgo: string;
    formatted: string;
  } | null;
  nextDose: {
    timestamp: number;
    formatted: string;
    timeUntil: string;
  };
  nextNextDose: {
    timestamp: number;
    formatted: string;
  };
  dosesToday: number;
  overdueMinutes: number;
  isOverdue: boolean;
}

export default function Home() {
  const [data, setData] = useState<DoseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);
  const [justTook, setJustTook] = useState(false);
  const [showBackdateModal, setShowBackdateModal] = useState(false);
  const [backdateTime, setBackdateTime] = useState("");
  const [backdateError, setBackdateError] = useState<string | null>(null);
  const [backdating, setBackdating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dose");
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Failed to fetch:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleTakeDose = async () => {
    setTaking(true);
    try {
      const res = await fetch("/api/dose", { method: "POST" });
      if (res.ok) {
        setJustTook(true);
        setTimeout(() => setJustTook(false), 2000);
        await fetchData();
      }
    } catch (error) {
      console.error("Failed to log dose:", error);
    } finally {
      setTaking(false);
    }
  };

  const openBackdateModal = () => {
    // Default to current time
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    setBackdateTime(`${hours}:${minutes}`);
    setBackdateError(null);
    setShowBackdateModal(true);
  };

  const handleBackdate = async () => {
    if (!backdateTime) {
      setBackdateError("Please select a time");
      return;
    }

    const [hours, minutes] = backdateTime.split(":").map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    // If time is in the future, assume yesterday (midnight crossing)
    if (target > now) {
      target.setDate(target.getDate() - 1);
    }

    const timestamp = target.getTime();
    const fourHoursAgo = now.getTime() - 4 * 60 * 60 * 1000;

    // Client-side validation
    if (timestamp < fourHoursAgo) {
      setBackdateError("Cannot backdate more than 4 hours");
      return;
    }

    setBackdating(true);
    setBackdateError(null);

    try {
      const res = await fetch("/api/dose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp }),
      });

      if (!res.ok) {
        const data = await res.json();
        setBackdateError(data.error || "Failed to log dose");
        return;
      }

      setShowBackdateModal(false);
      setJustTook(true);
      setTimeout(() => setJustTook(false), 2000);
      await fetchData();
    } catch (error) {
      console.error("Failed to backdate dose:", error);
      setBackdateError("Failed to log dose");
    } finally {
      setBackdating(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">
            Loading...
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              aria-hidden="true"
              className="w-6 h-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-slate-600 dark:text-slate-300 font-medium">
            Failed to load data
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
            Please check your connection
          </p>
        </div>
      </main>
    );
  }

  const getStatusStyle = () => {
    if (justTook)
      return {
        bg: "bg-gradient-to-r from-emerald-500 to-green-500",
        card: "ring-2 ring-emerald-200 dark:ring-emerald-800",
        glow: "shadow-emerald-200/50 dark:shadow-emerald-900/30",
      };
    if (data.overdueMinutes > 30)
      return {
        bg: "bg-gradient-to-r from-red-500 to-rose-500",
        card: "ring-2 ring-red-200 dark:ring-red-800",
        glow: "shadow-red-200/50 dark:shadow-red-900/30",
      };
    if (data.overdueMinutes > 0)
      return {
        bg: "bg-gradient-to-r from-amber-500 to-yellow-500",
        card: "ring-2 ring-amber-200 dark:ring-amber-800",
        glow: "shadow-amber-200/50 dark:shadow-amber-900/30",
      };
    return {
      bg: "bg-gradient-to-r from-blue-500 to-indigo-500",
      card: "ring-1 ring-slate-200 dark:ring-slate-700",
      glow: "shadow-slate-200/50 dark:shadow-slate-900/30",
    };
  };

  const status = getStatusStyle();

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-sm">
        {/* Last dose */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
              {data.lastDose
                ? `Last: ${data.lastDose.formatted} (${data.lastDose.timeAgo})`
                : "No doses logged yet"}
            </p>
          </div>
        </div>

        {/* Main card */}
        <div
          className={`rounded-3xl shadow-xl ${status.glow} overflow-hidden bg-white dark:bg-slate-800 ${status.card} transition-all duration-300`}
        >
          {/* Status bar */}
          <div
            className={`${status.bg} text-white text-center py-3 text-sm font-semibold tracking-wide`}
          >
            {justTook ? (
              <span className="inline-flex items-center gap-1.5">
                <svg
                  aria-hidden="true"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Dose logged!
              </span>
            ) : data.isOverdue && data.lastDose ? (
              <span className="inline-flex items-center gap-1.5">
                <svg
                  aria-hidden="true"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {data.overdueMinutes}m overdue
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <svg
                  aria-hidden="true"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {data.dosesToday}/5 doses today
              </span>
            )}
          </div>

          {/* Next dose */}
          <div className="px-8 pt-8 pb-6 text-center">
            {data.lastDose ? (
              <>
                <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">
                  Next Dose
                </p>
                <p className="text-5xl font-bold text-slate-800 dark:text-white mb-1 tabular-nums tracking-tight">
                  {data.nextDose.formatted}
                </p>
                <p
                  className={`text-base font-medium ${
                    data.isOverdue
                      ? "text-red-500 dark:text-red-400"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {data.nextDose.timeUntil}
                </p>
              </>
            ) : (
              <>
                <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">
                  Welcome
                </p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white mb-1">
                  Ready when you are
                </p>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="mx-8 border-t border-slate-100 dark:border-slate-700" />

          {/* Take button */}
          <div className="p-6">
            <button
              type="button"
              onClick={handleTakeDose}
              disabled={taking}
              className={`w-full py-4 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2
                ${
                  taking
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-[0.98]"
                }`}
            >
              {taking ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-500 border-t-transparent rounded-full animate-spin" />
                  Logging...
                </>
              ) : (
                <>
                  <svg
                    aria-hidden="true"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {data.lastDose ? "Take Dose" : "Take First Dose"}
                </>
              )}
            </button>
            <div className="text-center mt-3">
              <button
                type="button"
                onClick={openBackdateModal}
                className="text-slate-400 text-xs hover:text-slate-600 dark:hover:text-slate-300 underline"
              >
                {data.lastDose ? "Forgot to log a dose?" : "Log time of first dose"}
              </button>
            </div>
          </div>
        </div>

        {/* After that */}
        <div className="text-center mt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
            <p className="text-slate-400 dark:text-slate-500 text-xs font-medium">
              Then: {data.nextNextDose.formatted}
            </p>
          </div>
        </div>

        {/* Setup hint */}
        <div className="text-center mt-10">
          <p className="text-slate-300 dark:text-slate-600 text-xs">
            Set up Telegram reminders: message the bot{" "}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-mono text-[10px]">
              /start
            </code>
          </p>
        </div>
      </div>

      {/* Backdate Modal */}
      {showBackdateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
            onClick={() => setShowBackdateModal(false)}
            aria-label="Close modal"
          />

          {/* Modal */}
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-xs">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
              Log Past Dose
            </h2>

            <div className="mb-4">
              <label
                htmlFor="backdate-time"
                className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2"
              >
                What time did you take it?
              </label>
              <input
                id="backdate-time"
                type="time"
                value={backdateTime}
                onChange={(e) => setBackdateTime(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                Up to 4 hours ago
              </p>
            </div>

            {backdateError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                {backdateError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowBackdateModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBackdate}
                disabled={backdating}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-medium hover:from-emerald-600 hover:to-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {backdating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Logging...
                  </>
                ) : (
                  "Log Dose"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
