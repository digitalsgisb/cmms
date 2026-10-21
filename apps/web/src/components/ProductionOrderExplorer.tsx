import { ArrowLeft, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { workOrderStatusLabels, type WorkOrder, type WorkOrderDetail } from "@sugi-cmms/shared";
import { api, mediaUrl } from "../api/client";
import { formatDateTime, formatDuration } from "../utils/format";

export type ProductionOrderSelection = { title: string; ids: string[]; initialId?: string };

export function ProductionOrderExplorer({ selection, orders, now, onClose }: { selection: ProductionOrderSelection; orders: WorkOrder[]; now: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState(selection.initialId || "");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const selected = orders.find((order) => order.id === selectedId);
  const ids = new Set(selection.ids);
  const matches = orders.filter((order) => ids.has(order.id) && `${order.number} ${order.machineName} ${order.issueDescription} ${order.location}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); previousFocus?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setDetail(null); setError(""); setPhoto(null);
    if (selectedId) api.workOrder(selectedId).then((next) => { if (!cancelled) setDetail(next); })
      .catch(() => { if (!cancelled) setError("Could not load work order details. Please retry."); });
    return () => { cancelled = true; };
  }, [selectedId, selected?.updatedAt, retry]);

  return <dialog className="production-tv-explorer" ref={dialogRef} aria-labelledby="production-explorer-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="production-tv-explorer-content"><header><div><p>PRODUCTION WORK ORDERS</p><h2 id="production-explorer-title">{selectedId ? selected?.number || "Work order details" : selection.title}</h2></div><button type="button" aria-label="Close work order explorer" onClick={onClose}><X size={20} /></button></header>
      {selectedId ? <>
        <button className="production-tv-explorer-back" type="button" onClick={() => { if (selection.initialId) onClose(); else setSelectedId(""); }}><ArrowLeft size={16} />{selection.initialId ? "Back to dashboard" : "Back to work orders"}</button>
        {error ? <div className="production-tv-warning" role="alert">{error}<button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div> : null}
        {!detail && !error ? <p className="production-tv-empty" role="status">Loading photos and work order details…</p> : null}
        {detail ? <section className="production-tv-order-detail"><div className="production-tv-detail-top"><span className={`production-tv-status status-${detail.status}`}>{workOrderStatusLabels[detail.status]}</span><span>{detail.priority} priority · {detail.type}</span></div><h3>{detail.machineName || detail.assetName}</h3><p className="production-tv-detail-description">{detail.issueDescription || detail.description}</p>
          <dl>{[["Section / area", `${detail.location} / ${detail.area}`], ["Work order date", detail.workDate || "Not recorded"], ["Reported by", detail.reportedByName || detail.requester?.name], ["Assigned technician", detail.assignedTo?.name || "Unassigned"], ["Created", formatDateTime(detail.createdAt)], ["Elapsed", formatDuration(detail.createdAt, detail.closedAt || (detail.status === "cancelled" ? detail.updatedAt : now))], ["Resolved", detail.resolvedAt ? formatDateTime(detail.resolvedAt) : "Awaiting resolution"], ["Closed", detail.closedAt ? formatDateTime(detail.closedAt) : "Awaiting closure"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {detail.completionNote ? <div className="production-tv-detail-note"><h3>Repair summary</h3><p>{detail.completionNote}</p></div> : null}
          {detail.attachments.length ? <><h3>Work order photos</h3><div className="production-tv-detail-photos">{detail.attachments.filter((item) => item.mimeType.startsWith("image/")).map((item) => <button type="button" key={item.id} onClick={() => setPhoto(photo === item.url ? null : item.url)} aria-label={`Enlarge ${item.kind} photo: ${item.originalName}`}><img src={mediaUrl(item.url)} alt={`${item.kind}: ${item.originalName}`} loading="lazy" /><span>{item.kind === "issue" ? "Before" : item.kind} photo</span></button>)}</div>{photo ? <button className="production-tv-enlarged-photo" type="button" onClick={() => setPhoto(null)} aria-label="Close enlarged photo"><img src={mediaUrl(photo)} alt="Enlarged work order evidence" /><span>Click to close</span></button> : null}</> : null}
          {detail.activities.length ? <><h3>Latest updates</h3><ol className="production-tv-detail-history">{detail.activities.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 8).map((activity) => <li key={activity.id}><strong>{activity.action.replace(/_/g, " ")}</strong><span>{activity.message}</span><time>{formatDateTime(activity.createdAt)}</time></li>)}</ol></> : null}
        </section> : null}
      </> : <><label className="production-tv-explorer-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search work orders, machines or issues" autoFocus /></label><p className="production-tv-explorer-count">{matches.length} work order(s) · select one for photos and details</p><div className="production-tv-explorer-list">{matches.map((order) => <button type="button" key={order.id} onClick={() => setSelectedId(order.id)}><div><strong>{order.number}</strong><span>{order.machineName || order.assetName} · {order.location}</span><p>{order.issueDescription || order.title}</p></div><span className={`production-tv-status status-${order.status}`}>{workOrderStatusLabels[order.status]}</span></button>)}{!matches.length ? <p className="production-tv-empty">No matching work orders.</p> : null}</div></>}
    </div>
  </dialog>;
}
