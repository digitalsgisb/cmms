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
const workOrdersPerPage = 3;

function playUrgentHorn(context: AudioContext) {
  const startedAt = context.currentTime;
  const masterGain = context.createGain();
  const filter = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const frequencies = [392, 523];

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1500, startedAt);
  filter.Q.setValueAtTime(1.2, startedAt);
  compressor.threshold.setValueAtTime(-18, startedAt);
  compressor.knee.setValueAtTime(10, startedAt);
  compressor.ratio.setValueAtTime(5, startedAt);
  masterGain.gain.setValueAtTime(0.0001, startedAt);

  frequencies.forEach((frequency, burstIndex) => {
    const burstStart = startedAt + burstIndex * 0.47;
    const burstEnd = burstStart + 0.34;
    masterGain.gain.setValueAtTime(0.0001, burstStart);
    masterGain.gain.exponentialRampToValueAtTime(0.24, burstStart + 0.025);
    masterGain.gain.setValueAtTime(0.24, burstEnd - 0.05);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, burstEnd);

    [1, 1.5].forEach((harmonic, harmonicIndex) => {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = harmonicIndex === 0 ? "sawtooth" : "square";
      oscillator.frequency.setValueAtTime(frequency * harmonic, burstStart);
      oscillator.frequency.linearRampToValueAtTime(frequency * harmonic * 0.97, burstEnd);
      voiceGain.gain.setValueAtTime(harmonicIndex === 0 ? 0.7 : 0.16, burstStart);
      oscillator.connect(voiceGain);
      voiceGain.connect(filter);
      oscillator.start(burstStart);
      oscillator.stop(burstEnd + 0.02);
    });
  });

  filter.connect(masterGain);
  masterGain.connect(compressor);
  compressor.connect(context.destination);
}

export function TvDashboardPage() {
  const [loadError, setLoadError] = useState("");
  const [workOrders, setWorkOrders] = useState<TvWorkOrder[]>([]);
  const [now, setNow] = useState(new Date());
  const [rotationStep, setRotationStep] = useState(0);
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
        if (soundEnabledRef.current && context?.state === "running") playUrgentHorn(context);
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
    playUrgentHorn(context);
  }

  useEffect(() => {
    loadWorkOrders().catch(console.error);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const rotation = window.setInterval(() => setRotationStep((step) => step + 1), rotationIntervalMs);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(rotation);
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
            {soundEnabled ? "Horn alerts on" : "Enable horn alerts"}
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
          const pageCount = Math.max(1, Math.ceil(columnWorkOrders.length / workOrdersPerPage));
          const currentPage = rotationStep % pageCount;
          const pageStart = currentPage * workOrdersPerPage;
          const visibleWorkOrders = columnWorkOrders.slice(pageStart, pageStart + workOrdersPerPage);
          const pageEnd = Math.min(pageStart + workOrdersPerPage, columnWorkOrders.length);

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
