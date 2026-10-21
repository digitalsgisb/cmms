import { ArrowLeft, Maximize, Minimize, Pause, Play, RefreshCw, Tv } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { plantLabels, workOrderStatusLabels, type Section, type WorkOrder, type WorkOrderStatus } from "@sugi-cmms/shared";
import { selectedPlant } from "../api/client";
import { filterProductionSection, isActiveProductionOrder, productionDashboardSummary } from "../utils/productionDashboard";
import { formatDuration } from "../utils/format";

type Props = { workOrders: WorkOrder[]; sections: Section[]; now: string; lastUpdated: string | null; loadError: string; onBack: () => void; onRefresh: () => Promise<void> };
const tablePageSize = 4;

export function ProductionTvDashboard({ workOrders, sections, now, lastUpdated, loadError, onBack, onRefresh }: Props) {
  const boardRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [displayError, setDisplayError] = useState("");
  const [rotating, setRotating] = useState(true);
  const [allStatuses, setAllStatuses] = useState(false);
  const [attentionStep, setAttentionStep] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const date = new Date(now);
  const summary = useMemo(() => productionDashboardSummary(workOrders, sections, new Date(now)), [workOrders, sections, now]);
  const records = allStatuses ? summary.production : summary.active;
  const stale = lastUpdated && date.getTime() - Date.parse(lastUpdated) > 45_000;
  const plant = selectedPlant();
  const attentionPages = Math.max(1, Math.ceil(summary.attention.length / 3));
  const attentionPage = attentionStep % attentionPages;
  const peak = Math.max(1, ...summary.trend.flatMap((day) => [day.resolved, day.closed]));

  useEffect(() => {
    const listener = () => setFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setAttentionStep((step) => step + 1), 12_000);
    return () => window.clearInterval(timer);
  }, [rotating]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boardRef.current?.requestFullscreen();
      setDisplayError("");
    } catch { setDisplayError("Fullscreen is unavailable in this browser. Use the browser fullscreen control to display on a TV."); }
  }
  async function refresh() {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  }

  return <main className="production-tv" ref={boardRef}>
    <header className="production-tv-header">
      <div className="production-tv-brand"><img src="/brand/sugi_logo_white.png" alt="Sugihara Grand" /><div><p>PRODUCTION CONTROL · {plant === "all" ? "All plants" : plantLabels[plant]}</p><h1>Work Order Live Dashboard</h1></div></div>
      <div className="production-tv-clock"><strong>{date.toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour12: false })}</strong><span>{date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", year: "numeric" })} · MYT</span></div>
    </header>
    <div className="production-tv-toolbar">
      <div className={`production-tv-connection ${loadError || stale ? "is-stale" : ""}`} role="status"><i />{!lastUpdated ? loadError ? "Connection interrupted" : "Loading live work orders…" : loadError || stale ? "Updates delayed · showing last available data" : "Live · refreshes every 10 seconds"}<span>{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour12: false })}` : ""}</span></div>
      <div className="production-tv-controls"><button type="button" onClick={onBack}><ArrowLeft size={16} />Account</button><button type="button" disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={16} />{refreshing ? "Refreshing…" : "Refresh"}</button><button type="button" aria-pressed={!rotating} onClick={() => setRotating(!rotating)}>{rotating ? <Pause size={16} /> : <Play size={16} />}{rotating ? "Pause pages" : "Rotate pages"}</button><button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}{fullscreen ? "Exit fullscreen" : "Fullscreen"}</button></div>
    </div>
    {loadError || displayError ? <p className="production-tv-warning" role="alert">{loadError || displayError}</p> : null}
    <section className="production-tv-metrics" aria-label="Production work order totals">
      {[
        ["Total work orders", summary.production.length, "All time · includes cancelled", ""],
        ["Active work orders", summary.active.length, "Open through verification", "blue"],
        ["Need attention", summary.attention.length, "See action queue below", "amber"],
        ["Resolved · verify", summary.awaitingVerification, "Repair done · awaiting closure", "teal"],
        ["Closed", summary.closed, "Verified and completed", "green"],
        ["Closure rate", `${summary.closureRate}%`, "Closed / total excluding cancelled", ""]
      ].map(([label, value, help, tone]) => <article key={label} className={`production-tv-metric ${tone}`}><span>{label}</span><strong>{lastUpdated ? value : "—"}</strong><small>{help}</small></article>)}
    </section>
    <div className="production-tv-table-heading"><h2><Tv size={20} />Section work orders</h2><div role="group" aria-label="Table status scope"><button type="button" aria-pressed={!allStatuses} onClick={() => setAllStatuses(false)}>Active only</button><button type="button" aria-pressed={allStatuses} onClick={() => setAllStatuses(true)}>All statuses</button></div><span>{rotating ? "Pages rotate every 12 seconds" : "Page rotation paused"}</span></div>
    <section className="production-tv-tables" aria-label="Production section tables">
      <SectionTable title="Conversion" orders={filterProductionSection(records, sections, "conversion")} now={now} rotating={rotating} loading={!lastUpdated} />
      <SectionTable title="Roll Making" orders={filterProductionSection(records, sections, "roll-making")} now={now} rotating={rotating} loading={!lastUpdated} />
    </section>
    {summary.otherActive ? <p className="production-tv-warning">{summary.otherActive} active production order(s) belong to other or unassigned sections. They are included in totals and the attention queue.</p> : null}
    <section className="production-tv-analysis">
      <article className="production-tv-chart"><div className="production-tv-panel-heading"><div><h2>Resolved vs closed</h2><p>Latest completions per order · last 7 days · MYT</p></div><div className="production-tv-legend"><span>Resolved <b>{summary.trend.reduce((total, day) => total + day.resolved, 0)}</b></span><span>Closed <b>{summary.trend.reduce((total, day) => total + day.closed, 0)}</b></span></div></div>
        <div className="production-tv-bars" role="img" aria-label={summary.trend.map((day) => `${day.label}: ${day.resolved} resolved, ${day.closed} closed`).join("; ")}>
          {summary.trend.map((day) => <div className="production-tv-day" key={day.key}><div className="production-tv-bar-pair"><div><b>{day.resolved}</b><i style={{ height: `${day.resolved / peak * 80}%` }} /></div><div><b>{day.closed}</b><i style={{ height: `${day.closed / peak * 80}%` }} /></div></div><span>{day.label}</span></div>)}
        </div><p className="production-tv-footnote">Resolved = repair completed. Closed = verified by requester. An order can appear in both series on different dates.</p>
      </article>
      <article className="production-tv-attention"><div className="production-tv-panel-heading"><div><h2>Needs attention <b>{summary.attention.length}</b></h2><p>Critical and returned jobs first, then oldest requests</p></div><button type="button" disabled={attentionPages === 1} onClick={() => setAttentionStep((step) => step + 1)}>Next {attentionPage + 1}/{attentionPages}</button></div>
        {summary.attention.slice(attentionPage * 3, attentionPage * 3 + 3).map(({ order, reasons }) => <div className="production-tv-attention-row" key={order.id}><div><strong>{order.number}</strong><span>{order.machineName || order.assetName} · {order.location}</span></div><p>{reasons.join(" · ")}</p></div>)}
        {!summary.attention.length ? <p className="production-tv-empty">{lastUpdated ? "No work orders currently need attention." : "Loading attention queue…"}</p> : null}
      </article>
    </section>
    <footer className="production-tv-footer"><span>Current status breakdown · all production orders</span><div>{(Object.keys(workOrderStatusLabels) as WorkOrderStatus[]).map((status) => <span key={status}>{workOrderStatusLabels[status]} <b>{summary.production.filter((order) => order.status === status).length}</b></span>)}</div></footer>
  </main>;
}

function SectionTable({ title, orders, now, rotating, loading }: { title: string; orders: WorkOrder[]; now: string; rotating: boolean; loading: boolean }) {
  const [step, setStep] = useState(0);
  const pages = Math.max(1, Math.ceil(orders.length / tablePageSize));
  const page = step % pages;
  const sorted = [...orders].sort((a, b) => Number(isActiveProductionOrder(b)) - Number(isActiveProductionOrder(a)) || Number(b.priority === "critical") - Number(a.priority === "critical") || Date.parse(a.createdAt) - Date.parse(b.createdAt));
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setStep((value) => value + 1), 12_000);
    return () => window.clearInterval(timer);
  }, [rotating]);
  return <article className="production-tv-table-panel"><header><h3>{title}</h3><strong>{orders.length} orders</strong></header><div className="production-tv-table-scroll"><table><thead><tr><th>Work order / issue</th><th>Machine / area</th><th>Status</th><th>Elapsed</th></tr></thead><tbody>
    {sorted.slice(page * tablePageSize, page * tablePageSize + tablePageSize).map((order) => <tr key={order.id}><td><strong>{order.number}</strong><span className="production-tv-issue" title={order.issueDescription || order.title}>{order.issueDescription || order.title}</span></td><td><strong>{order.machineName || order.assetName || "Not specified"}</strong><span>{order.area}</span></td><td><span className={`production-tv-status status-${order.status}`}>{workOrderStatusLabels[order.status]}</span>{order.priority === "critical" ? <small className="production-tv-critical">CRITICAL</small> : null}</td><td>{formatDuration(order.createdAt, order.closedAt || (order.status === "cancelled" ? order.updatedAt : now))}</td></tr>)}
    {!orders.length ? <tr><td colSpan={4} className="production-tv-empty">{loading ? "Loading work orders…" : "No matching work orders"}</td></tr> : null}
  </tbody></table></div><footer><span>Showing {orders.length ? page * tablePageSize + 1 : 0}–{Math.min((page + 1) * tablePageSize, orders.length)} of {orders.length}</span><div><button type="button" aria-label={`Previous ${title} page`} disabled={pages === 1} onClick={() => setStep((value) => (value % pages + pages - 1) % pages)}>‹</button><span>{page + 1} / {pages}</span><button type="button" aria-label={`Next ${title} page`} disabled={pages === 1} onClick={() => setStep((value) => value + 1)}>›</button></div></footer></article>;
}
