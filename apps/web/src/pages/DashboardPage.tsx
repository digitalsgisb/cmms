import type { AssetDashboardResponse, DashboardSummary, PmDashboardResponse, SpareInventoryResponse, WorkOrder } from "@sugi-cmms/shared";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Factory,
  Package,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Wrench
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { PriorityBadge, StatusBadge } from "../components/Badges";
import { MetricTile } from "../components/MetricTile";
import { useCurrentUser } from "../state/UserContext";
import { formatDateTime, formatLongDisplayDate } from "../utils/format";

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0
  }).format(value);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { currentUser } = useCurrentUser();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [inventory, setInventory] = useState<SpareInventoryResponse | null>(null);
  const [pm, setPm] = useState<PmDashboardResponse | null>(null);
  const [assets, setAssets] = useState<AssetDashboardResponse | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    if (!currentUser) return;
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const [nextSummary, nextWorkOrders, nextInventory, nextPm, nextAssets] = await Promise.all([
        api.dashboardSummary(),
        api.workOrders(),
        api.spareInventory(),
        api.pmDashboard(currentUser.id, year),
        api.assetDashboard()
      ]);
      setSummary(nextSummary);
      setWorkOrders(nextWorkOrders);
      setInventory(nextInventory);
      setPm(nextPm);
      setAssets(nextAssets);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard().catch(console.error);
  }, [currentUser?.id]);

  const activeWorkOrders = useMemo(
    () => workOrders
      .filter((workOrder) => !["closed", "cancelled"].includes(workOrder.status))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [workOrders]
  );
  const visibleWorkOrders = activeWorkOrders.slice(0, 6);
  const criticalOpen = activeWorkOrders.filter((item) => item.priority === "critical").length;
  const standardOrders = workOrders.filter((item) => item.type === "standard_maintenance" && item.status !== "cancelled");
  const kaizenOrders = workOrders.filter((item) => item.type === "kaizen" && item.status !== "cancelled");
  const standardClosure = percent(standardOrders.filter((item) => item.status === "closed").length, standardOrders.length);
  const kaizenClosure = percent(kaizenOrders.filter((item) => item.status === "closed").length, kaizenOrders.length);
  const partsRisk = (inventory?.summary.lowStock ?? 0) + (inventory?.summary.outOfStock ?? 0);
  const pmCompliance = pm?.summary.compliancePercent ?? 0;

  const workflow = [
    { label: "New", value: workOrders.filter((item) => item.status === "open").length, tone: "new" },
    { label: "Acknowledged", value: workOrders.filter((item) => item.status === "acknowledged").length, tone: "acknowledged" },
    { label: "In progress", value: workOrders.filter((item) => item.status === "in_progress").length, tone: "progress" },
    { label: "Waiting parts", value: workOrders.filter((item) => item.status === "pending_material").length, tone: "waiting" },
    { label: "For verification", value: workOrders.filter((item) => item.status === "resolved").length, tone: "verify" }
  ];

  const stockRisks = useMemo(
    () => (inventory?.parts ?? [])
      .filter((item) => item.currentStock <= item.minStock)
      .sort((a, b) => a.currentStock - b.currentStock)
      .slice(0, 4),
    [inventory]
  );

  const pmAttention = useMemo(
    () => (pm?.schedules ?? [])
      .filter((item) => item.overdue || ["scheduled", "in_progress"].includes(item.status))
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.scheduledDate.localeCompare(b.scheduledDate))
      .slice(0, 4),
    [pm]
  );

  const assetAttention = useMemo(
    () => [...(assets?.assets ?? [])]
      .filter((asset) => asset.riskScore >= 75)
      .sort((a, b) => b.riskScore - a.riskScore || a.assetNo - b.assetNo)
      .slice(0, 4),
    [assets]
  );

  return (
    <section className="page-stack dashboard-page dashboard-command-page">
      <div className="dashboard-hero dashboard-command-hero">
        <div className="dashboard-hero-main">
          <p className="hero-eyebrow"><span aria-hidden="true" /> Live maintenance command · {formatLongDisplayDate()}</p>
          <h1>Good day, {currentUser?.name.split(" ")[0] ?? "team"}.</h1>
          <p>Everything that needs attention across work orders, spare parts and preventive maintenance—kept in one readable view.</p>
          <div className="hero-actions">
            <Link className="primary-action" to="/work-orders/new"><Plus size={17} /> New Work Order</Link>
            <Link className="secondary-action" to="/performance"><BarChart3 size={17} /> Open Performance</Link>
          </div>
        </div>
        <div className="dashboard-hero-signals">
          <article><Wrench size={17} /><span>Critical work</span><strong>{criticalOpen}</strong><small>open now</small></article>
          <article><CalendarClock size={17} /><span>PM due</span><strong>{pm?.summary.dueThisWeek ?? 0}</strong><small>this week</small></article>
          <article><Package size={17} /><span>Parts risk</span><strong>{partsRisk}</strong><small>below minimum</small></article>
        </div>
      </div>

      <div className="dashboard-kpi-grid metric-grid" aria-busy={loading}>
        <MetricTile icon={ClipboardList} label="Total active" value={summary?.totalOpen ?? 0} />
        <MetricTile icon={AlertTriangle} label="New requests" value={summary?.newWorkOrders ?? 0} tone="danger" />
        <MetricTile icon={Wrench} label="In progress" value={summary?.inProgress ?? 0} />
        <MetricTile icon={CheckCircle2} label="Closed today" value={summary?.closedToday ?? 0} tone="success" />
        <MetricTile icon={ShieldCheck} label="PM compliance" value={`${pmCompliance}%`} tone={pmCompliance >= 95 ? "success" : undefined} />
        <MetricTile icon={PackageCheck} label="Parts available" value={`${inventory ? percent(inventory.summary.totalParts - inventory.summary.outOfStock, inventory.summary.totalParts) : 0}%`} tone="success" />
      </div>

      <div className="dashboard-command-grid">
        <section className="dashboard-command-card dashboard-flow-card">
          <div className="dashboard-card-heading">
            <div><span>Work order control</span><h2>Maintenance flow</h2><p>Live queue position from request to verification.</p></div>
            <Link to="/work-orders">View all <ArrowRight size={14} /></Link>
          </div>
          <div className="dashboard-flow-grid">
            {workflow.map((item) => <article key={item.label} className={`tone-${item.tone}`}><span>{item.label}</span><strong>{item.value}</strong><i /></article>)}
          </div>
          <div className="dashboard-closure-split">
            <div><span>Standard maintenance closure</span><strong>{standardClosure}%</strong><i><b style={{ width: `${standardClosure}%` }} /></i></div>
            <div><span>KAIZEN closure</span><strong>{kaizenClosure}%</strong><i><b style={{ width: `${kaizenClosure}%` }} /></i></div>
          </div>
        </section>

        <section className="dashboard-command-card dashboard-pm-card">
          <div className="dashboard-card-heading"><div><span>Preventive maintenance</span><h2>PM discipline</h2></div><Link to="/preventive-maintenance"><ArrowRight size={15} /></Link></div>
          <div className="dashboard-pm-overview">
            <div className="dashboard-compliance-ring" style={{ "--dashboard-ring": `${pmCompliance}%` } as React.CSSProperties}><div><strong>{pmCompliance}%</strong><span>compliance</span></div></div>
            <div className="dashboard-pm-stats">
              <span><strong>{pm?.summary.completedThisMonth ?? 0}</strong> completed this month</span>
              <span className={(pm?.summary.overdue ?? 0) > 0 ? "risk" : ""}><strong>{pm?.summary.overdue ?? 0}</strong> overdue schedules</span>
              <span><strong>{pm?.summary.checklistCoveragePercent ?? 0}%</strong> checklist coverage</span>
            </div>
          </div>
        </section>

        <section className="dashboard-command-card dashboard-stock-card">
          <div className="dashboard-card-heading"><div><span>Spare parts</span><h2>Inventory readiness</h2><p>{inventory ? money(inventory.summary.totalValue) : "—"} held in stock.</p></div><Link to="/spare-parts">Inventory <ArrowRight size={14} /></Link></div>
          <div className="dashboard-stock-summary">
            <span><strong>{inventory?.summary.totalParts ?? 0}</strong> active SKUs</span>
            <span className="warning"><strong>{inventory?.summary.lowStock ?? 0}</strong> low stock</span>
            <span className="danger"><strong>{inventory?.summary.outOfStock ?? 0}</strong> stock-outs</span>
          </div>
          <div className="dashboard-risk-list">
            {stockRisks.length > 0 ? stockRisks.map((part) => (
              <div key={part.itemNo}><span><strong>{part.searchName || part.description}</strong><small>{part.itemNo} · {part.category}</small></span><b className={part.currentStock <= 0 ? "danger" : "warning"}>{part.currentStock} {part.uom}</b></div>
            )) : <p className="dashboard-clear-line"><CheckCircle2 size={15} /> All stocked items are above minimum.</p>}
          </div>
        </section>

        <section className="dashboard-command-card dashboard-attention-card">
          <div className="dashboard-card-heading"><div><span>Next actions</span><h2>PM attention queue</h2><p>Recover overdue work first, then protect this week’s plan.</p></div><Sparkles size={18} /></div>
          <div className="dashboard-attention-list">
            {pmAttention.length > 0 ? pmAttention.map((item) => (
              <Link to="/preventive-maintenance/schedule" key={item.id} className={item.overdue ? "overdue" : ""}>
                <i /><span><strong>{item.machineName}</strong><small>{item.technicianName} · {item.scheduledDate}</small></span><b>{item.overdue ? "Overdue" : item.status.replace("_", " ")}</b>
              </Link>
            )) : <p className="dashboard-clear-line"><CheckCircle2 size={15} /> No PM schedules need attention.</p>}
          </div>
        </section>

        <section className="dashboard-command-card dashboard-asset-card">
          <div className="dashboard-card-heading"><div><span>Asset management</span><h2>Production fleet readiness</h2><p>Lifecycle intelligence from the controlled 2026 machine register.</p></div><Link to="/assets">Open assets <ArrowRight size={14} /></Link></div>
          <div className="dashboard-asset-layout">
            <div className="dashboard-asset-score">
              <div className="dashboard-compliance-ring dashboard-asset-ring" style={{ "--dashboard-ring": `${assets?.summary.totalAssets ? Math.round((assets.summary.operational / assets.summary.totalAssets) * 100) : 0}%` } as React.CSSProperties}><div><strong>{assets?.summary.totalAssets ?? 0}</strong><span>assets</span></div></div>
              <span><Factory size={15} /><strong>{assets?.summary.operational ?? 0}</strong> operational</span>
              <span className="risk"><ShieldAlert size={15} /><strong>{assets?.summary.highRisk ?? 0}</strong> high risk</span>
              <span><CalendarClock size={15} /><strong>{assets?.summary.averageAge ?? 0} yrs</strong> average age</span>
            </div>
            <div className="dashboard-asset-attention">
              {assetAttention.map((asset) => (
                <Link to="/assets" key={asset.id}><i>{String(asset.assetNo).padStart(2, "0")}</i><span><strong>{asset.name}</strong><small>{asset.ageYears ?? "?"} years · {asset.condition}</small></span><b>{asset.riskScore}</b></Link>
              ))}
              {assetAttention.length === 0 ? <p className="dashboard-clear-line"><CheckCircle2 size={15} /> No assets are in the high-risk band.</p> : null}
            </div>
          </div>
        </section>
      </div>

      <section className="section-panel dashboard-work-orders dashboard-current-work">
        <div className="section-header">
          <div><span className="dashboard-section-kicker">Current execution</span><h2>Active Work Orders</h2><span>{loading ? "Loading live data..." : `${activeWorkOrders.length} active · ${visibleWorkOrders.length} shown`}</span></div>
          <Link className="section-link" to="/work-orders">View all</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>W/O</th><th>Title</th><th>Status</th><th>Priority</th><th>Section / Machine</th><th>Updated</th></tr></thead>
            <tbody>
              {visibleWorkOrders.map((workOrder) => (
                <tr className="clickable-table-row" key={workOrder.id} role="link" tabIndex={0} onClick={() => navigate(`/work-orders/${workOrder.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/work-orders/${workOrder.id}`); } }}>
                  <td><Link to={`/work-orders/${workOrder.id}`} onClick={(event) => event.stopPropagation()}>{workOrder.number}</Link></td>
                  <td>{workOrder.title}</td><td><StatusBadge status={workOrder.status} /></td><td><PriorityBadge priority={workOrder.priority} /></td>
                  <td>{workOrder.location} / {workOrder.machineName || workOrder.assetName}</td><td>{formatDateTime(workOrder.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleWorkOrders.length === 0 && !loading ? <p className="quiet-line">No active work orders right now.</p> : null}
      </section>
    </section>
  );
}
