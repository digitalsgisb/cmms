/** The first acknowledgement starts downtime; verification never extends it.
 * Returned jobs resume the same clock through their next resolution. Historical
 * jobs without an acknowledgement are deliberately left unmeasured. */
export function downtimeWindow(order: {
  status: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  cancelledAt?: string | null;
  updatedAt: string;
}, now = new Date().toISOString()) {
  const start = order.acknowledgedAt || null;
  const finished = ["resolved", "closed"].includes(order.status);
  const end = finished ? order.resolvedAt || ""
    : order.status === "cancelled" ? order.cancelledAt || order.updatedAt : now;
  const valid = Boolean(start && Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) && Date.parse(end) >= Date.parse(start));
  return { start: valid ? start : null, end, running: valid && !finished && order.status !== "cancelled",
    minutes: valid ? (Date.parse(end) - Date.parse(start!)) / 60_000 : null };
}
