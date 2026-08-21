import { useEffect, useRef } from "react";
import { liveEventsUrl } from "../api/client";

type LiveRefreshOptions = {
  enabled?: boolean;
  fallbackMs?: number;
};

/**
 * Refreshes data immediately after a matching server mutation. EventSource
 * reconnects itself; periodic and focus refreshes cover sleeping phones,
 * proxies that block streams, and changes made while the app was backgrounded.
 */
export function useLiveRefresh(
  topics: string[],
  refresh: () => void | Promise<void>,
  { enabled = true, fallbackMs = 15000 }: LiveRefreshOptions = {}
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const topicKey = [...topics].sort().join("|");

  useEffect(() => {
    if (!enabled) return;

    const acceptedTopics = new Set(topicKey.split("|").filter(Boolean));
    let debounceTimer: number | undefined;
    let refreshInFlight = false;
    let refreshQueued = false;

    const runRefresh = async () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;
      try {
        await refreshRef.current();
      } catch (error) {
        console.error("Live refresh failed", error);
      } finally {
        refreshInFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          void runRefresh();
        }
      }
    };

    const queueRefresh = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void runRefresh(), 80);
    };

    const source = typeof EventSource === "undefined" ? null : new EventSource(liveEventsUrl);
    if (source) {
      source.onmessage = (event) => {
        try {
          const change = JSON.parse(event.data) as { topic?: string };
          if (change.topic && acceptedTopics.has(change.topic)) queueRefresh();
        } catch {
          // Ignore malformed/heartbeat messages; the fallback still keeps data fresh.
        }
      };
    }

    const fallback = window.setInterval(() => {
      if (document.visibilityState === "visible") void runRefresh();
    }, fallbackMs);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void runRefresh();
    };
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      source?.close();
      window.clearTimeout(debounceTimer);
      window.clearInterval(fallback);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, fallbackMs, topicKey]);
}
