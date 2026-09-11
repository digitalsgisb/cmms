import { Clock, MonitorCheck, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TvWorkOrder, WorkOrderStatus } from "@sugi-cmms/shared";
import { workOrderStatusLabels } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { PriorityBadge } from "../components/Badges";
import { formatDateTime } from "../utils/format";
import { useLiveRefresh } from "../hooks/useLiveRefresh";

const columns: Array<{ title: string; statuses: WorkOrderStatus[]; tone: string }> = [
  { title: "New", statuses: ["open"], tone: "danger" },
  { title: "In Progress", statuses: ["acknowledged", "in_progress", "returned"], tone: "active" },
  { title: "Pending Material", statuses: ["pending_material"], tone: "warning" },
  { title: "Verify", statuses: ["resolved"], tone: "success" }
];

const rotationIntervalMs = 10_000;

function cardsPerPageForViewport() {
  return Math.max(3, Math.floor((window.innerHeight - 235) / 112));
}

function playWhistle(context: AudioContext) {
  const startedAt = context.currentTime;
  const gain = context.createGain();
  const primary = context.createOscillator();
  const overtone = context.createOscillator();

  primary.type = "sine";
  overtone.type = "sine";
  primary.frequency.setValueAtTime(920, startedAt);
  primary.frequency.exponentialRampToValueAtTime(1480, startedAt + 0.18);
  primary.frequency.exponentialRampToValueAtTime(1120, startedAt + 0.52);
  overtone.frequency.setValueAtTime(1840, startedAt);
  overtone.frequency.exponentialRampToValueAtTime(2960, startedAt + 0.18);
  overtone.frequency.exponentialRampToValueAtTime(2240, startedAt + 0.52);
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.gain.exponentialRampToValueAtTime(0.22, startedAt + 0.035);
  gain.gain.setValueAtTime(0.22, startedAt + 0.34);
  gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.62);

  primary.connect(gain);
  overtone.connect(gain);
  gain.connect(context.destination);
  primary.start(startedAt);
  overtone.start(startedAt);
  primary.stop(startedAt + 0.64);
  overtone.stop(startedAt + 0.64);
}

export function TvDashboardPage() {
  const [loadError, setLoadError] = useState("");
  const [workOrders, setWorkOrders] = useState<TvWorkOrder[]>([]);
  const [now, setNow] = useState(new Date());
  const [rotationStep, setRotationStep] = useState(0);
  const [cardsPerPage, setCardsPerPage] = useState(cardsPerPageForViewport);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [arrivalNotice, setArrivalNotice] = useState("");
  const knownWorkOrderIdsRef = useRef<Set<string> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const arrivalTimerRef = useRef<number | null>(null);

  async function loadWorkOrders() {
    try {
      const nextWorkOrders = await api.tvWorkOrders();
      const knownIds = knownWorkOrderIdsRef.current;
      const arrivals = knownIds ? nextWorkOrders.filter((workOrder) => workOrder.status === "open" && !knownIds.has(workOrder.id)) : [];
      knownWorkOrderIdsRef.current = new Set(nextWorkOrders.map((workOrder) => workOrder.id));
      setWorkOrders(nextWorkOrders);
      setLoadError("");
      if (arrivals.length) {
        setArrivalNotice(arrivals.length === 1 ? `New work order: ${arrivals[0].number}` : `${arrivals.length} new work orders received`);
        if (arrivalTimerRef.current) window.clearTimeout(arrivalTimerRef.current);
        arrivalTimerRef.current = window.setTimeout(() => setArrivalNotice(""), 9000);
        const context = audioContextRef.current;
        if (soundEnabledRef.current && context?.state === "running") playWhistle(context);
      }
    }
    catch { setLoadError("Live updates interrupted. Showing the last available work orders; reconnecting automatically."); }
  }

  async function toggleSound() {
    if (soundEnabledRef.current) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      await audioContextRef.current?.suspend();
      return;
    }
    const context = audioContextRef.current || new AudioContext();
    audioContextRef.current = context;
    await context.resume();
    soundEnabledRef.current = true;
    setSoundEnabled(true);
    playWhistle(context);
  }

  useEffect(() => {
    loadWorkOrders().catch(console.error);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const rotation = window.setInterval(() => setRotationStep((step) => step + 1), rotationIntervalMs);
    const resize = () => setCardsPerPage(cardsPerPageForViewport());
    window.addEventListener("resize", resize);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(rotation);
      window.removeEventListener("resize", resize);
      if (arrivalTimerRef.current) window.clearTimeout(arrivalTimerRef.current);
      void audioContextRef.current?.close();
    };
  }, []);

  useLiveRefresh(["work-orders"], loadWorkOrders, { fallbackMs: 3000 });

  const activeCount = useMemo(
    () => workOrders.filter((workOrder) => !["closed", "cancelled"].includes(workOrder.status)).length,
    [workOrders]
  );

  return (
    <main className="tv-dashboard">
      {loadError ? <div className="ux-load-error" role="status">{loadError}</div> : null}
      {arrivalNotice ? <div className="tv-arrival-notice" role="status" aria-live="assertive"><Volume2 size={22} />{arrivalNotice}</div> : null}
      <header className="tv-header">
        <div className="tv-brand-block">
          <img src="/brand/sugi_mark_white.png" alt="Sugihara Grand Industries" />
          <div>
            <p>Maintenance Department</p>
            <h1>Work Order Board</h1>
          </div>
        </div>
        <div className="tv-status">
          <button className={`tv-sound-toggle${soundEnabled ? " is-enabled" : ""}`} type="button" onClick={() => void toggleSound()} aria-pressed={soundEnabled}>
            {soundEnabled ? <Volume2 size={22} aria-hidden="true" /> : <VolumeX size={22} aria-hidden="true" />}
            {soundEnabled ? "Whistle alerts on" : "Enable whistle alerts"}
          </button>
          <span>
            <MonitorCheck size={22} aria-hidden="true" />
            {activeCount} active
          </span>
          <span>
            <Clock size={22} aria-hidden="true" />
            {now.toLocaleTimeString()}
          </span>
        </div>
      </header>

      <section className="tv-columns">
        {columns.map((column) => {
          const columnWorkOrders = workOrders.filter((workOrder) => column.statuses.includes(workOrder.status));
          const pageCount = Math.max(1, Math.ceil(columnWorkOrders.length / cardsPerPage));
          const currentPage = rotationStep % pageCount;
          const pageStart = currentPage * cardsPerPage;
          const visibleWorkOrders = columnWorkOrders.slice(pageStart, pageStart + cardsPerPage);
          const pageEnd = Math.min(pageStart + cardsPerPage, columnWorkOrders.length);

          return (
            <div key={column.title} className={`tv-column tv-${column.tone}`}>
              <div className="tv-column-header">
                <h2>{column.title}</h2>
                <strong>{columnWorkOrders.length}</strong>
              </div>
              <div
                className={`tv-card-list${pageCount > 1 ? " is-rotating" : ""}`}
                key={`${column.title}-${currentPage}`}
              >
                {visibleWorkOrders.map((workOrder) => (
                  <article className="tv-card" key={workOrder.id}>
                    <div>
                      <strong>{workOrder.number}</strong>
                      <span>{workOrderStatusLabels[workOrder.status]}</span>
                    </div>
                    <h3>{workOrder.title}</h3>
                    <p>{workOrder.location} / {workOrder.machineName || workOrder.assetName}</p>
                    <div>
                      <PriorityBadge priority={workOrder.priority} />
                      <time>{formatDateTime(workOrder.updatedAt)}</time>
                    </div>
                  </article>
                ))}
              </div>
              {pageCount > 1 && (
                <div
                  className="tv-rotation-status"
                  aria-label={`Showing work orders ${pageStart + 1} to ${pageEnd} of ${columnWorkOrders.length}. Page ${currentPage + 1} of ${pageCount}.`}
                >
                  <span>{pageStart + 1}&ndash;{pageEnd} of {columnWorkOrders.length}</span>
                  <span className="tv-rotation-progress" aria-hidden="true">
                    <i key={rotationStep} />
                  </span>
                  <span>Page {currentPage + 1}/{pageCount}</span>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
