import { Clock, MonitorCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

const workOrdersPerPage = 8;
const rotationIntervalMs = 10_000;

export function TvDashboardPage() {
  const [loadError, setLoadError] = useState("");
  const [workOrders, setWorkOrders] = useState<TvWorkOrder[]>([]);
  const [now, setNow] = useState(new Date());
  const [rotationStep, setRotationStep] = useState(0);

  async function loadWorkOrders() {
    try { setWorkOrders(await api.tvWorkOrders()); setLoadError(""); }
    catch { setLoadError("Live updates interrupted. Showing the last available work orders; reconnecting automatically."); }
  }

  useEffect(() => {
    loadWorkOrders().catch(console.error);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const rotation = window.setInterval(() => setRotationStep((step) => step + 1), rotationIntervalMs);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(rotation);
    };
  }, []);

  useLiveRefresh(["work-orders"], loadWorkOrders, { fallbackMs: 10000 });

  const activeCount = useMemo(
    () => workOrders.filter((workOrder) => !["closed", "cancelled"].includes(workOrder.status)).length,
    [workOrders]
  );

  return (
    <main className="tv-dashboard">
      {loadError ? <div className="ux-load-error" role="status">{loadError}</div> : null}
      <header className="tv-header">
        <div className="tv-brand-block">
          <img src="/brand/sugi_mark_white.png" alt="Sugihara Grand Industries" />
          <div>
            <p>Maintenance Department</p>
            <h1>Work Order Board</h1>
          </div>
        </div>
        <div className="tv-status">
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
