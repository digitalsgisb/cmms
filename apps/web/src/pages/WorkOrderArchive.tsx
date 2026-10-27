import type { ArchivedWorkOrder, User } from "@sugi-cmms/shared";
import { useEffect, useState } from "react";
import { api, mediaUrl } from "../api/client";
import { formatDateTime, userName } from "../utils/format";
import { useLiveRefresh } from "../hooks/useLiveRefresh";

export function WorkOrderArchive({ users, onBack }: { users: User[]; onBack: () => void }) {
  const [orders, setOrders] = useState<ArchivedWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [restoring, setRestoring] = useState("");
  async function load() {
    try { setOrders(await api.archivedWorkOrders()); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to load the archive."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useLiveRefresh(["work-orders"], load);
  async function restore(order: ArchivedWorkOrder) {
    if (!window.confirm(`Restore ${order.number} to the work orders list?`)) return;
    setRestoring(order.id);
    try { await api.restoreWorkOrder(order.id); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to restore the work order."); }
    finally { setRestoring(""); }
  }
  const filtered = orders.filter(order => `${order.number} ${order.machineName} ${order.issueDescription} ${order.deletionReason}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="page-stack">
    <div className="page-title-row"><div><p className="eyebrow">Work orders</p><h1>Archive</h1></div><button type="button" className="secondary-action" onClick={onBack}>Back to work orders</button></div>
    <p>Deleted work orders are preserved here with their reason, history and photos. Restore an order to return it to the work orders list.</p>
    <input aria-label="Search archived work orders" placeholder="Search number, machine, issue or deletion reason" value={search} onChange={event => setSearch(event.target.value)} />
    {error ? <p role="alert">{error}</p> : null}
    {loading ? <p>Loading archive...</p> : !filtered.length ? <p>No archived work orders found.</p> : filtered.map(order => <article className="panel" key={order.id}>
      <h2>{order.number} · {order.machineName}</h2>
      <p><strong>Reason for deletion:</strong> {order.deletionReason}</p>
      <p>Archived by {userName(users, order.archivedBy)} · {formatDateTime(order.archivedAt)}</p>
      <details><summary>View work order, history and photos</summary>
        <p>{order.issueDescription}</p>
        <p>Reported by {order.reportedByName} · {order.responsibleDepartment} · {order.location} · {order.area}</p>
        {order.completionNote ? <p>Completion note: {order.completionNote}</p> : null}
        <ul>{order.activities.map(activity => <li key={activity.id}>{formatDateTime(activity.createdAt)} · {userName(users, activity.actorId)} · {activity.message}</li>)}</ul>
        <div className="archive-photos">{order.attachments.map(photo => <a key={photo.id} href={mediaUrl(photo.url)} target="_blank" rel="noreferrer"><img src={mediaUrl(photo.url)} alt={photo.originalName} loading="lazy" /><span>{photo.originalName}</span></a>)}</div>
      </details>
      <button type="button" className="secondary-action" disabled={Boolean(restoring)} onClick={() => void restore(order)}>{restoring === order.id ? "Restoring..." : "Restore work order"}</button>
    </article>)}
  </section>;
}
