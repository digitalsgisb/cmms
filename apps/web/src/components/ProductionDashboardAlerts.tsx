import { Bell, BellOff, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WorkOrder } from "@sugi-cmms/shared";
import { advanceProductionAlerts, emptyProductionAlertState, needsProductionResolution, playProductionAlertSound, productionPopupDuration, type ProductionAlert } from "../utils/productionAlerts";

export function ProductionDashboardAlerts({ orders, now, ready, stale, onOpen }: { orders: WorkOrder[]; now: string; ready: boolean; stale: boolean; onOpen: (title: string, ids: string[]) => void }) {
  const tracker = useRef(emptyProductionAlertState());
  const [alerts, setAlerts] = useState<ProductionAlert[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const soundArmed = useRef(false);
  const popupEnabled = useRef(enabled);
  popupEnabled.current = enabled;
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [soundStarting, setSoundStarting] = useState(false);
  const time = Date.parse(now);

  async function playSound() {
    if (!audioRef.current) return;
    if (!await playProductionAlertSound(audioRef.current)) {
      soundArmed.current = false;
      setSoundEnabled(false);
      setSoundError("Sound was blocked. Select Enable sound to try again.");
    }
  }
  async function toggleSound() {
    if (soundArmed.current) {
      soundArmed.current = false; setSoundEnabled(false); audioRef.current?.pause(); return;
    }
    if (!audioRef.current || soundStarting) return;
    setSoundStarting(true);
    const played = await playProductionAlertSound(audioRef.current);
    soundArmed.current = played; setSoundEnabled(played); setSoundStarting(false);
    setSoundError(played ? "" : "Sound was blocked. Select Enable sound to try again.");
  }
  useEffect(() => () => { soundArmed.current = false; audioRef.current?.pause(); }, []);
  useEffect(() => {
    if (!ready || stale) return;
    const result = advanceProductionAlerts(tracker.current, orders, time);
    tracker.current = result.state;
    if (result.alerts.length) {
      setAlerts((current) => [...result.alerts.reverse(), ...current].slice(0, 30));
      setDismissed((current) => current.slice(-30));
      if (soundArmed.current && popupEnabled.current) void playSound();
    }
  }, [orders, time, ready, stale]);
  const unresolved = new Set(orders.filter(needsProductionResolution).map((order) => order.id));
  const actionable = alerts.filter((alert) => alert.orderIds.some((id) => unresolved.has(id)));
  const visible = expanded ? actionable : enabled ? actionable.filter((alert) => time - alert.createdAt < productionPopupDuration && !dismissed.includes(alert.id)).slice(0, 3) : [];
  return <div className="production-tv-alerts">
    <audio ref={audioRef} src="/sounds/tv-work-order-alert.mp3" preload="auto" />
    <div className="production-tv-alert-controls"><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Bell size={16} />Alerts <b>{actionable.length}</b></button><button type="button" aria-label={enabled ? "Mute popup alerts" : "Enable popup alerts"} aria-pressed={!enabled} onClick={() => setEnabled(!enabled)}>{enabled ? <Bell size={16} /> : <BellOff size={16} />}</button><button type="button" aria-pressed={soundEnabled} disabled={soundStarting} onClick={() => void toggleSound()} title="Enable sound once to allow audible new-order alerts and reminders">{soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{soundStarting ? "Starting…" : soundEnabled ? "Sound on" : "Enable sound"}</button></div>
    {soundError ? <p className="production-tv-sound-error" role="status">{soundError}</p> : null}
    {visible.length || expanded ? <aside className={`production-tv-alert-rail${expanded ? " is-expanded" : ""}`} aria-label="Production notifications">
      {expanded ? <header><div><strong>Resolution alerts</strong><small>Repeat every 15 min while unresolved</small></div><button type="button" aria-label="Close notification panel" onClick={() => setExpanded(false)}><X size={16} /></button></header> : null}
      <div role="log" aria-live="polite" aria-relevant="additions">
        {visible.map((alert) => <article className={`production-tv-alert-card is-${alert.kind}`} key={alert.id}><div><strong>{alert.title}</strong><button type="button" aria-label={`Dismiss ${alert.title}`} onClick={() => { setDismissed((current) => [...current, alert.id]); setAlerts((current) => current.filter((item) => item.id !== alert.id)); }}><X size={14} /></button></div><p>{alert.body}</p><button type="button" onClick={() => { setExpanded(false); setDismissed((current) => [...current, alert.id]); onOpen(alert.title, alert.orderIds.filter((id) => unresolved.has(id))); }}>View work orders →</button></article>)}
        {expanded && !visible.length ? <p className="production-tv-empty">No unresolved alerts. New work orders will appear here.</p> : null}
      </div>
    </aside> : null}
  </div>;
}
