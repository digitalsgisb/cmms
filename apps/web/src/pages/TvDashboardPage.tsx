import { Clock, MonitorCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkOrder, WorkOrderStatus } from "@sugi-cmms/shared";
import { workOrderStatusLabels } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { PriorityBadge } from "../components/Badges";
import { formatDateTime } from "../utils/format";

const columns: Array<{ title: string; statuses: WorkOrderStatus[]; tone: string }> = [
  { title: "New", statuses: ["open"], tone: "danger" },
  { title: "In Progress", statuses: ["acknowledged", "in_progress", "returned"], tone: "active" },
  { title: "Pending Material", statuses: ["pending_material"], tone: "warning" },
  { title: "Verify", statuses: ["resolved"], tone: "success" }
];

export function TvDashboardPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [now, setNow] = useState(new Date());

  async function loadWorkOrders() {
    setWorkOrders(await api.workOrders());
  }

  useEffect(() => {
    loadWorkOrders().catch(console.error);
    const refresh = window.setInterval(() => loadWorkOrders().catch(console.error), 30000);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, []);

  const activeCount = useMemo(
    () => workOrders.filter((workOrder) => !["closed", "cancelled"].includes(workOrder.status)).length,
    [workOrders]
  );

  return (
    <main className="tv-dashboard">
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
          return (
            <div key={column.title} className={`tv-column tv-${column.tone}`}>
              <div className="tv-column-header">
                <h2>{column.title}</h2>
                <strong>{columnWorkOrders.length}</strong>
              </div>
              <div className="tv-card-list">
                {columnWorkOrders.slice(0, 8).map((workOrder) => (
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
            </div>
          );
        })}
      </section>
    </main>
  );
}
