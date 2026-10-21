import { longProductionDowntimeMinutes, type Section, type WorkOrder } from "@sugi-cmms/shared";

export type ProductionSection = "all" | "conversion" | "roll-making";
export const productionSectionLabels: Record<ProductionSection, string> = { all: "ALL", conversion: "CONVERSION", "roll-making": "ROLL MAKING" };
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function productionSection(order: WorkOrder, sections: Section[]): ProductionSection | "other" {
  const section = sections.find((item) => item.id === order.sectionId);
  const name = normalize(section?.name || order.location || "");
  if (name === "conversion") return "conversion";
  if (name === "rollmaking") return "roll-making";
  return "other";
}

export function filterProductionSection(orders: WorkOrder[], sections: Section[], filter: ProductionSection) {
  return filter === "all" ? orders : orders.filter((order) => productionSection(order, sections) === filter);
}

export function isActiveProductionOrder(order: WorkOrder) {
  return !["closed", "cancelled"].includes(order.status);
}

export function productionAttentionReasons(order: WorkOrder, now: Date): string[] {
  if (!isActiveProductionOrder(order)) return [];
  const reasons: string[] = [];
  if (order.priority === "critical") reasons.push("Critical priority");
  if (order.status === "returned") reasons.push("Repair returned");
  if (order.status === "resolved") reasons.push("Verify completed repair");
  if (order.status === "pending_material") reasons.push("Waiting for material");
  if (order.status === "on_hold") reasons.push("Work on hold");
  if (order.dueDate && Date.parse(`${order.dueDate.slice(0, 10)}T23:59:59+08:00`) < now.getTime()) reasons.push("Past due date");
  if (!order.assignedToId && order.status !== "resolved") reasons.push("Awaiting assignment");
  if (!order.productionDowntimeReason?.trim() && now.getTime() - Date.parse(order.createdAt) >= longProductionDowntimeMinutes * 60_000) reasons.push("Downtime reason needed");
  return reasons;
}

export function productionDashboardSummary(orders: WorkOrder[], sections: Section[], now: Date) {
  const production = orders.filter((order) => order.responsibleDepartment === "Production");
  const active = production.filter(isActiveProductionOrder);
  const closed = production.filter((order) => order.status === "closed").length;
  const cancelled = production.filter((order) => order.status === "cancelled").length;
  const attention = active.map((order) => ({ order, reasons: productionAttentionReasons(order, now) }))
    .filter((item) => item.reasons.length)
    .sort((a, b) => Number(b.order.priority === "critical") - Number(a.order.priority === "critical") ||
      Number(b.order.status === "returned") - Number(a.order.status === "returned") || Date.parse(a.order.createdAt) - Date.parse(b.order.createdAt));
  const today = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.parse(`${today}T00:00:00+08:00`) - (6 - index) * 86400_000);
    const key = new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    const onDay = (value: string | null) => value && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 10) === key;
    return { key, label: date.toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short" }),
      resolved: production.filter((order) => onDay(order.resolvedAt)).length,
      closed: production.filter((order) => onDay(order.closedAt)).length };
  });
  return { production, active, closed, cancelled, attention, trend,
    awaitingVerification: production.filter((order) => order.status === "resolved").length,
    closureRate: production.length - cancelled ? Math.round(closed / (production.length - cancelled) * 100) : 0,
    otherActive: active.filter((order) => productionSection(order, sections) === "other").length };
}
