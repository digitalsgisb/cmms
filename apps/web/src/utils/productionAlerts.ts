import type { WorkOrder, WorkOrderStatus } from "@sugi-cmms/shared";

export const productionReminderInterval = 15 * 60_000;
export const productionPopupDuration = 5_000;

export async function playProductionAlertSound(audio: Pick<HTMLAudioElement, "pause" | "play" | "currentTime" | "volume">) {
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.7;
    await audio.play();
    return true;
  } catch { return false; }
}
export type ProductionAlert = { id: string; title: string; body: string; orderIds: string[]; createdAt: number; kind: "new" | "reminder" | "returned" };
export type ProductionAlertState = { initialized: boolean; statuses: Record<string, WorkOrderStatus>; reminders: Record<string, number> };
export const emptyProductionAlertState = (): ProductionAlertState => ({ initialized: false, statuses: {}, reminders: {} });
export const needsProductionResolution = (order: WorkOrder) => order.responsibleDepartment === "Production" && !["resolved", "closed", "cancelled"].includes(order.status);

/** Pure clock-driven state machine: unaffected by polling frequency or dismissing a popup. */
export function advanceProductionAlerts(previous: ProductionAlertState, orders: WorkOrder[], now: number) {
  const production = orders.filter((order) => order.responsibleDepartment === "Production");
  const next: ProductionAlertState = { initialized: true, statuses: {}, reminders: {} };
  const alerts: ProductionAlert[] = [];
  const overdue: WorkOrder[] = [];
  const unresolved = production.filter(needsProductionResolution);
  function add(kind: ProductionAlert["kind"], title: string, matches: WorkOrder[], body: string) {
    alerts.push({ id: `${kind}-${now}-${matches.map((order) => order.id).join("-")}`, kind, title, body, orderIds: matches.map((order) => order.id), createdAt: now });
  }
  for (const order of production) {
    next.statuses[order.id] = order.status;
    if (!needsProductionResolution(order)) continue;
    const known = previous.statuses[order.id];
    const reopened = known && ["resolved", "closed", "cancelled"].includes(known);
    if (previous.initialized && (!known || reopened || (order.status === "returned" && known !== "returned"))) {
      add(order.status === "returned" || reopened ? "returned" : "new", reopened || order.status === "returned" ? "Repair needs attention again" : "New production work order", [order], `${order.number} · ${order.machineName || order.assetName || order.location} · ${order.issueDescription || order.title}`);
      next.reminders[order.id] = now + productionReminderInterval;
    } else {
      const due = previous.reminders[order.id] ?? now + productionReminderInterval;
      if (now >= due) overdue.push(order);
      next.reminders[order.id] = now >= due ? now + productionReminderInterval : due;
    }
  }
  if (!previous.initialized && unresolved.length) add("reminder", "Work orders need resolution", unresolved, `${unresolved.length} production work order(s) still need repair or resolution. Reminders repeat every 15 minutes until resolved.`);
  if (overdue.length) add("reminder", "15-minute resolution reminder", overdue, `${overdue.length} work order(s) are still unresolved: ${overdue.slice(0, 3).map((order) => order.number).join(", ")}${overdue.length > 3 ? ` and ${overdue.length - 3} more` : ""}.`);
  return { state: next, alerts };
}
