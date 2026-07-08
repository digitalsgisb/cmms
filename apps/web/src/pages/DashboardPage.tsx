import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Package,
  PackageOpen,
  Plus,
  RefreshCw,
  TrendingUp,
  Wrench
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { DashboardSummary, SpareInventoryResponse, WorkOrder } from "@sugi-cmms/shared";
import { workOrderStatusLabels } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { MetricTile } from "../components/MetricTile";
import { PriorityBadge, StatusBadge } from "../components/Badges";
import { formatDateTime, formatLongDisplayDate } from "../utils/format";

export function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [spareSummary, setSpareSummary] = useState<SpareInventoryResponse["summary"] | null>(null);
  const [spareSyncReady, setSpareSyncReady] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [nextSummary, nextWorkOrders, spareInventory] = await Promise.all([api.dashboardSummary(), api.workOrders(), api.spareInventory()]);
      setSummary(nextSummary);
      setWorkOrders(nextWorkOrders);
      setSpareSummary(spareInventory.summary);
      setSpareSyncReady(spareInventory.syncConfigured);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard().catch(console.error);
  }, []);

  const activeWorkOrders = workOrders.filter((workOrder) => !["closed", "cancelled"].includes(workOrder.status)).slice(0, 6);

  return (
    <section className="page-stack dashboard-page">
      <div className="dashboard-hero">
        <div>
          <p className="hero-eyebrow">
            <span aria-hidden="true" />
            Factory Maintenance Control - {formatLongDisplayDate()}
          </p>
          <h1>Maintenance Dashboard</h1>
          <p>Clean overview of the current maintenance workload.</p>
          <div className="hero-actions">
            <Link className="primary-action" to="/work-orders/new">
              <Plus size={17} aria-hidden="true" />
              New Work Order
            </Link>
            <Link className="secondary-action" to="/work-orders">
              <Wrench size={17} aria-hidden="true" />
              Open Work Orders
            </Link>
          </div>
        </div>
      </div>

      <div className="metric-grid">
        <MetricTile icon={ClipboardList} label="Total active" value={summary?.totalOpen ?? 0} />
        <MetricTile icon={AlertTriangle} label="New" value={summary?.newWorkOrders ?? 0} tone="danger" />
        <MetricTile icon={Wrench} label="In progress" value={summary?.inProgress ?? 0} />
        <MetricTile icon={CheckCircle2} label="Closed today" value={summary?.closedToday ?? 0} tone="success" />
      </div>

      <div className="dashboard-modules">
        <section className="section-panel dashboard-work-orders">
          <div className="section-header">
            <div>
              <h2>Active Work Orders</h2>
              <span>{loading ? "Loading..." : `${activeWorkOrders.length} shown`}</span>
            </div>
            <Link className="section-link" to="/work-orders">View all</Link>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>W/O</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Section / Machine</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {activeWorkOrders.map((workOrder) => (
                  <tr
                    className="clickable-table-row"
                    key={workOrder.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`/work-orders/${workOrder.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/work-orders/${workOrder.id}`);
                      }
                    }}
                  >
                    <td>
                      <Link to={`/work-orders/${workOrder.id}`} onClick={(event) => event.stopPropagation()}>{workOrder.number}</Link>
                    </td>
                    <td>{workOrder.title}</td>
                    <td>
                      <StatusBadge status={workOrder.status} />
                    </td>
                    <td>
                      <PriorityBadge priority={workOrder.priority} />
                    </td>
                    <td>{workOrder.location} / {workOrder.machineName || workOrder.assetName}</td>
                    <td>{formatDateTime(workOrder.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeWorkOrders.length === 0 && !loading ? (
            <p className="quiet-line">No active work orders. Status labels available: {Object.values(workOrderStatusLabels).join(", ")}.</p>
          ) : null}
        </section>

        <section className="section-panel module-card spare-monitor-module">
          <div className="module-icon">
            <PackageOpen size={22} aria-hidden="true" />
          </div>
          <div>
            <h2>Spare Part Monitoring</h2>
            <p>{spareSummary ? `${spareSummary.lowStock + spareSummary.outOfStock} parts need attention.` : "Loading inventory status..."}</p>
          </div>
          <div className="spare-monitor-stats">
            <span>
              <Package size={15} aria-hidden="true" />
              <strong>{spareSummary?.totalParts ?? 0}</strong>
              SKUs
            </span>
            <span className={(spareSummary?.lowStock ?? 0) > 0 ? "warn" : ""}>
              <AlertTriangle size={15} aria-hidden="true" />
              <strong>{spareSummary?.lowStock ?? 0}</strong>
              low
            </span>
            <span className={(spareSummary?.outOfStock ?? 0) > 0 ? "danger" : ""}>
              <PackageOpen size={15} aria-hidden="true" />
              <strong>{spareSummary?.outOfStock ?? 0}</strong>
              out
            </span>
          </div>
          <div className="spare-monitor-footer">
            <span className={`module-status ${spareSyncReady ? "ready" : ""}`}>
              <RefreshCw size={13} aria-hidden="true" />
              {spareSyncReady ? "Sheet sync ready" : "Sheet sync off"}
            </span>
            <Link to="/spare-parts">Open</Link>
          </div>
        </section>

        <section className="section-panel module-card calendar-module">
          <div className="module-icon">
            <CalendarDays size={22} aria-hidden="true" />
          </div>
          <div>
            <h2>Preventive Calendar</h2>
            <p>Upcoming PM schedules and inspection windows.</p>
          </div>
          <div className="mini-calendar" aria-hidden="true">
            {["M", "T", "W", "T", "F"].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
        </section>

        <section className="section-panel module-card">
          <div className="module-icon">
            <TrendingUp size={22} aria-hidden="true" />
          </div>
          <div>
            <h2>Performance</h2>
            <p>Completion trend, response time, technician workload.</p>
          </div>
          <div className="mini-bars" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>

        <section className="section-panel module-card">
          <div className="module-icon">
            <Activity size={22} aria-hidden="true" />
          </div>
          <div>
            <h2>Asset Reliability</h2>
            <p>Repeat failures, downtime, and asset health scoring.</p>
          </div>
          <span className="module-status">Next phase</span>
        </section>
      </div>
    </section>
  );
}
