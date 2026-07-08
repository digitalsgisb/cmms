import { AlertTriangle, CheckCircle2, Clock3, Layers3, Plus, Search, Trash2, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MasterData, User, WorkOrder, WorkOrderStatus } from "@sugi-cmms/shared";
import { workOrderStatusLabels, workOrderTypeLabels } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { PriorityBadge, StatusBadge } from "../components/Badges";
import { formatDateTime, formatLiveDuration, userName } from "../utils/format";
import { useCurrentUser } from "../state/UserContext";

const statusOptions: Array<WorkOrderStatus | "all"> = [
  "all",
  "open",
  "acknowledged",
  "in_progress",
  "pending_material",
  "resolved",
  "returned",
  "closed",
  "cancelled"
];

export function WorkOrdersPage() {
  const { users, currentUser } = useCurrentUser();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [masterData, setMasterData] = useState<MasterData>({ sections: [], machines: [], issueCategories: [] });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WorkOrderStatus | "all">("all");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [month, setMonth] = useState("");
  const [sectionId, setSectionId] = useState("all");
  const [machineId, setMachineId] = useState("all");
  const [timerNow, setTimerNow] = useState(() => new Date().toISOString());

  async function loadWorkOrders() {
    setWorkOrders(await api.workOrders());
  }

  useEffect(() => {
    loadWorkOrders().catch(console.error);
    api.masterData().then(setMasterData).catch(console.error);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setTimerNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentUser?.role === "requester") {
      setScope("mine");
    }
  }, [currentUser?.id, currentUser?.role]);

  const filtered = useMemo(() => {
    return workOrders.filter((workOrder) => {
      const matchesStatus = status === "all" || workOrder.status === status;
      const matchesMonth = !month || workOrder.workDate.startsWith(month);
      const matchesSection = sectionId === "all" || workOrder.sectionId === sectionId;
      const matchesMachine =
        machineId === "all" ||
        (machineId === "__others" ? !workOrder.machineId : workOrder.machineId === machineId);
      const matchesScope =
        currentUser?.role === "requester"
          ? workOrder.requesterId === currentUser.id
          : scope === "all" || workOrder.requesterId === currentUser?.id || workOrder.assignedToId === currentUser?.id;
      const searchable = `${workOrder.number} ${workOrder.title} ${workOrder.description} ${workOrder.location} ${workOrder.assetName} ${workOrder.machineName} ${workOrder.reportedByName} ${workOrder.reportedByDepartment} ${workOrder.issueDescription}`.toLowerCase();
      return matchesStatus && matchesMonth && matchesSection && matchesMachine && matchesScope && searchable.includes(search.toLowerCase());
    });
  }, [workOrders, status, month, sectionId, machineId, scope, search, currentUser?.id, currentUser?.role]);

  const filteredMachines = useMemo(() => {
    return masterData.machines.filter((machine) => sectionId === "all" || machine.sectionId === sectionId);
  }, [masterData.machines, sectionId]);

  const counts = useMemo(() => {
    return {
      active: workOrders.filter((workOrder) => !["closed", "cancelled"].includes(workOrder.status)).length,
      new: workOrders.filter((workOrder) => workOrder.status === "open").length,
      moving: workOrders.filter((workOrder) => ["acknowledged", "in_progress", "returned"].includes(workOrder.status)).length,
      waiting: workOrders.filter((workOrder) => ["pending_material", "resolved"].includes(workOrder.status)).length,
      closed: workOrders.filter((workOrder) => workOrder.status === "closed").length
    };
  }, [workOrders]);
  const requesterMode = currentUser?.role === "requester";
  const pendingVerification = requesterMode ? filtered.filter((workOrder) => workOrder.status === "resolved") : [];
  const visibleWorkOrders = requesterMode ? filtered.filter((workOrder) => workOrder.status !== "resolved") : filtered;

  async function removeWorkOrder(workOrder: WorkOrder) {
    if (!currentUser || currentUser.role !== "admin") {
      return;
    }

    const confirmed = window.confirm(`Delete ${workOrder.number}? This permanently removes the work order and uploaded images.`);
    if (!confirmed) {
      return;
    }

    await api.deleteWorkOrder(workOrder.id, { actorId: currentUser.id });
    setWorkOrders((current) => current.filter((item) => item.id !== workOrder.id));
  }

  return (
    <section className="page-stack">
      <div className="page-title-row page-title-clean">
        <div>
          <p className="eyebrow">Flow control</p>
          <h1>Work Orders</h1>
        </div>
        <Link className="primary-action" to="/work-orders/new">
          <Plus size={17} aria-hidden="true" />
          New Work Order
        </Link>
      </div>

      <div className="queue-ribbon">
        <article>
          <Layers3 size={18} aria-hidden="true" />
          <span>Active</span>
          <strong>{counts.active}</strong>
        </article>
        <article>
          <AlertTriangle size={18} aria-hidden="true" />
          <span>New</span>
          <strong>{counts.new}</strong>
        </article>
        <article>
          <Wrench size={18} aria-hidden="true" />
          <span>Moving</span>
          <strong>{counts.moving}</strong>
        </article>
        <article>
          <Clock3 size={18} aria-hidden="true" />
          <span>Waiting</span>
          <strong>{counts.waiting}</strong>
        </article>
        <article>
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>Closed</span>
          <strong>{counts.closed}</strong>
        </article>
      </div>

      <div className="filter-bar">
        <label className="search-input">
          <Search size={17} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search work orders" />
        </label>

        <select value={status} onChange={(event) => setStatus(event.target.value as WorkOrderStatus | "all")}>
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All status" : workOrderStatusLabels[option]}
            </option>
          ))}
        </select>

        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Filter by month" />

        <select value={sectionId} onChange={(event) => {
          setSectionId(event.target.value);
          setMachineId("all");
        }}>
          <option value="all">All sections</option>
          {masterData.sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>

        <select value={machineId} onChange={(event) => setMachineId(event.target.value)}>
          <option value="all">All machines</option>
          <option value="__others">Others</option>
          {filteredMachines.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.name}
            </option>
          ))}
        </select>

        {currentUser?.role === "requester" ? (
          <span className="filter-note">My issued work orders</span>
        ) : (
          <div className="segmented-control">
            <button type="button" className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
              All
            </button>
            <button type="button" className={scope === "mine" ? "active" : ""} onClick={() => setScope("mine")}>
              Mine
            </button>
          </div>
        )}
      </div>

      {requesterMode ? (
        <section className="requester-subsection">
          <div className="subsection-heading">
            <div>
              <h2>Pending Verification</h2>
              <span>{pendingVerification.length} waiting for requester decision</span>
            </div>
          </div>
          {pendingVerification.length > 0 ? (
            <div className="work-order-grid">
              {pendingVerification.map((workOrder) => (
                <WorkOrderCard
                  key={workOrder.id}
                  workOrder={workOrder}
                  users={users}
                  currentUserId={currentUser?.id}
                  timerNow={timerNow}
                  canDelete={currentUser?.role === "admin"}
                  onDelete={removeWorkOrder}
                />
              ))}
            </div>
          ) : (
            <p className="quiet-panel">No resolved work orders waiting for verification.</p>
          )}
        </section>
      ) : null}

      <section className="requester-subsection">
        {requesterMode ? (
          <div className="subsection-heading">
            <div>
              <h2>Other Issued Work Orders</h2>
              <span>{visibleWorkOrders.length} in tracking</span>
            </div>
          </div>
        ) : null}
        <div className="work-order-grid">
          {visibleWorkOrders.map((workOrder) => (
            <WorkOrderCard
              key={workOrder.id}
              workOrder={workOrder}
              users={users}
              currentUserId={currentUser?.id}
              timerNow={timerNow}
              canDelete={currentUser?.role === "admin"}
              onDelete={removeWorkOrder}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

function WorkOrderCard({
  workOrder,
  users,
  currentUserId,
  timerNow,
  canDelete,
  onDelete
}: {
  workOrder: WorkOrder;
  users: User[];
  currentUserId?: string;
  timerNow: string;
  canDelete: boolean;
  onDelete: (workOrder: WorkOrder) => void;
}) {
  const needsVerification = workOrder.status === "resolved" && workOrder.requesterId === currentUserId;
  const timerRunning = !["closed", "cancelled"].includes(workOrder.status);
  const timerEnd = timerRunning ? timerNow : workOrder.updatedAt;
  const timerLabel = timerRunning ? "Open" : workOrder.status === "cancelled" ? "Cancelled" : "Closed";

  return (
    <article className={`work-order-card card-status-${workOrder.status} ${needsVerification ? "needs-verification" : ""}`}>
      <Link to={`/work-orders/${workOrder.id}`}>
        <div className="card-topline">
          <strong>{workOrder.number}</strong>
          <div className="card-status-stack">
            <StatusBadge status={workOrder.status} />
            <span className={`card-live-timer ${timerRunning ? "is-live" : "is-stopped"}`}>
              <Clock3 size={13} aria-hidden="true" />
              {timerLabel} {formatLiveDuration(workOrder.createdAt, timerEnd)}
            </span>
          </div>
        </div>
        {needsVerification ? <span className="verification-chip">Needs verification</span> : null}
        <h2>{workOrder.title}</h2>
        <p>{workOrder.issueDescription || workOrder.description}</p>
        <div className="card-meta">
          <span>{workOrderTypeLabels[workOrder.type]}</span>
          <span>{workOrder.location}</span>
          <span>{workOrder.machineName || workOrder.assetName}</span>
          <span>Shift {workOrder.shiftGroup}</span>
        </div>
        <div className="card-footer">
          <PriorityBadge priority={workOrder.priority} />
          <span>{userName(users, workOrder.assignedToId)}</span>
          <time>{formatDateTime(workOrder.updatedAt)}</time>
        </div>
      </Link>
      {canDelete ? (
        <button className="delete-work-order-button" type="button" onClick={() => onDelete(workOrder)}>
          <Trash2 size={15} aria-hidden="true" />
          Delete {workOrder.number}
        </button>
      ) : null}
    </article>
  );
}
