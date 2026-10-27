import { downtimeWindow, plantLabels, type WorkOrder, type WorkOrderStatus, type WeeklyReliabilityAnalysis, type MachineReliability, type LocationReliability } from "@sugi-cmms/shared";

export type ReliabilityOrder = Pick<WorkOrder, "id" | "number" | "plantId" | "type" | "responsibleDepartment" | "machineId" | "machineName" | "sectionId" | "location" | "area" | "issueCategoryName" | "priority" | "dueDate" | "createdAt" | "assignedToId" | "status">;
export type ReliabilityEvent = { workOrderId: string; status: WorkOrderStatus | null; action: string; createdAt: string };
const day = 86_400_000;
const normal = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const label = (value: string, fallback: string) => value.trim().replace(/\s+/g, " ") || fallback;
const unknown = (value: string) => !normal(value) || /^(others?|unknown|unspecified|unassigned|n\/?a|none|not applicable|-)$/i.test(normal(value));
const repairOpen = (status: string) => !["resolved", "closed", "cancelled"].includes(status);
const round = (value: number) => Math.round(value * 10) / 10;
const machineKey = (o: ReliabilityOrder) => unknown(o.machineName) && !o.machineId ? null : JSON.stringify([o.plantId, o.responsibleDepartment, o.machineId || [o.sectionId || normal(o.location), normal(o.area), normal(o.machineName)]]);
const locationKey = (o: ReliabilityOrder) => JSON.stringify([o.plantId, o.responsibleDepartment, o.sectionId || normal(o.location), normal(o.area)]);
const where = (o: { plant: keyof typeof plantLabels; section: string; area: string }) => `${plantLabels[o.plant]} · ${o.section} / ${o.area}`;

/** Counts distinct corrective/maintenance requests, not proven physical failures.
 * All inputs are plant-scoped by the caller. No operating hours are inferred. */
export function buildWeeklyReliability(records: ReliabilityOrder[], events: ReliabilityEvent[], start: number, end: number, asOf: number): WeeklyReliabilityAnalysis {
  const lookback = end - 30 * day;
  const timelines = new Map<string, ReliabilityEvent[]>();
  for (const event of events) {
    const list = timelines.get(event.workOrderId) || []; list.push(event); timelines.set(event.workOrderId, list);
  }
  const history = (o: ReliabilityOrder, cutoff: number) => (timelines.get(o.id) || []).filter((e) => Date.parse(e.createdAt) < cutoff);
  const state = (o: ReliabilityOrder, cutoff: number): WorkOrderStatus => history(o, cutoff).filter((e) => e.status).at(-1)?.status || "open";
  const inPeriod = (o: ReliabilityOrder, from: number, to: number) => Date.parse(o.createdAt) >= from && Date.parse(o.createdAt) < to && state(o, to) !== "cancelled";
  const maintenance = records.filter((o) => o.type === "maintenance");
  const weekly = maintenance.filter((o) => inPeriod(o, start, end));
  const previous = maintenance.filter((o) => inPeriod(o, start - 7 * day, start));
  const recent = maintenance.filter((o) => inPeriod(o, lookback, end));
  const weeklyIds = new Set(weekly.map((o) => o.id));
  const previousIds = new Set(previous.map((o) => o.id));
  const recentIds = new Set(recent.map((o) => o.id));
  const machineGroups = new Map<string, MachineReliability>();
  const locationGroups = new Map<string, LocationReliability>();
  const machineIssues = new Map<string, Map<string, { category: string; count: number }>>();
  const issues = new Map<string, { category: string; weekReports: number; reports30d: number }>();
  for (const o of maintenance.filter((o) => Date.parse(o.createdAt) < end)) {
    const key = machineKey(o);
    const locKey = locationKey(o);
    const list = history(o, end);
    const resolution = list.filter((e) => e.action === "resolved" && Date.parse(e.createdAt) >= start).at(-1);
    const acknowledgement = list.find((e) => e.action === "acknowledged");
    const minutes = resolution ? downtimeWindow({ status: "resolved", acknowledgedAt: acknowledgement?.createdAt, resolvedAt: resolution.createdAt, updatedAt: resolution.createdAt }).minutes : null;
    const returned = list.some((e) => e.action === "returned" && Date.parse(e.createdAt) >= start);
    const backlog = repairOpen(state(o, end));
    const period = weeklyIds.has(o.id); const prior = previousIds.has(o.id); const last30 = recentIds.has(o.id);
    if (!period && !prior && !last30 && !backlog && minutes === null && !returned) continue;
    const location = locationGroups.get(locKey) || { key: locKey, plant: o.plantId, department: o.responsibleDepartment, section: label(o.location, "Unspecified section"), area: label(o.area, "Unspecified area"), weekReports: 0, previousWeekReports: 0, reports30d: 0, repairBacklog: 0, downtimeMinutes: 0 };
    location.weekReports += Number(period); location.previousWeekReports += Number(prior); location.reports30d += Number(last30); location.repairBacklog += Number(backlog); location.downtimeMinutes += minutes ?? 0;
    locationGroups.set(locKey, location);
    if (key) {
      const machine = machineGroups.get(key) || { key, plant: o.plantId, department: o.responsibleDepartment, machine: label(o.machineName, "Named equipment ID"), section: location.section, area: location.area, weekReports: 0, previousWeekReports: 0, reports30d: 0, repairBacklog: 0, returnedThisWeek: 0, downtimeMinutes: 0, downtimeSamples: 0, repeatedIssue: null, repeatedIssueReports: 0 };
      machine.weekReports += Number(period); machine.previousWeekReports += Number(prior); machine.reports30d += Number(last30); machine.repairBacklog += Number(backlog); machine.returnedThisWeek += Number(returned); machine.downtimeMinutes += minutes ?? 0; machine.downtimeSamples += Number(minutes !== null);
      machineGroups.set(key, machine);
      if (last30 && !unknown(o.issueCategoryName)) {
        const categories = machineIssues.get(key) || new Map<string, { category: string; count: number }>();
        const catKey = normal(o.issueCategoryName); const category = categories.get(catKey) || { category: label(o.issueCategoryName, "Uncategorised"), count: 0 }; category.count++;
        categories.set(catKey, category); machineIssues.set(key, categories);
      }
    }
    if (period || last30) {
      const catKey = normal(o.issueCategoryName) || "uncategorised";
      const category = issues.get(catKey) || { category: label(o.issueCategoryName, "Uncategorised"), weekReports: 0, reports30d: 0 };
      category.weekReports += Number(period); category.reports30d += Number(last30); issues.set(catKey, category);
    }
  }
  for (const machine of machineGroups.values()) {
    machine.downtimeMinutes = round(machine.downtimeMinutes);
    const repeated = [...(machineIssues.get(machine.key)?.values() || [])].sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))[0];
    if (repeated && repeated.count >= 2) { machine.repeatedIssue = repeated.category; machine.repeatedIssueReports = repeated.count; }
  }
  // Volume rank is independent of the existing downtime rank. Keep plants,
  // departments and fallback locations distinct even when names match.
  const machines = [...machineGroups.values()].sort((a, b) => b.reports30d - a.reports30d || b.weekReports - a.weekReports || b.repairBacklog - a.repairBacklog || a.key.localeCompare(b.key));
  const locations = [...locationGroups.values()].sort((a, b) => b.weekReports - a.weekReports || b.reports30d - a.reports30d || b.repairBacklog - a.repairBacklog || a.key.localeCompare(b.key));
  const issueList = [...issues.values()].sort((a, b) => b.reports30d - a.reports30d || b.weekReports - a.weekReports || a.category.localeCompare(b.category));
  const liveCutoff = asOf + 1;
  const liveOrders = records.filter((o) => Date.parse(o.createdAt) <= asOf);
  const liveOpen = liveOrders.filter((o) => repairOpen(state(o, liveCutoff)));
  const ageDays = (o: ReliabilityOrder) => Math.max(0, Math.floor((asOf - Date.parse(o.createdAt)) / day));
  const liveLocations = new Map<string, WeeklyReliabilityAnalysis["live"]["locations"][number]>();
  for (const o of liveOpen.filter((o) => o.type === "maintenance")) {
    const key = locationKey(o); const item = liveLocations.get(key) || { plant: o.plantId, department: o.responsibleDepartment, section: label(o.location, "Unspecified section"), area: label(o.area, "Unspecified area"), backlog: 0, critical: 0, oldestOpenDays: 0 };
    item.backlog++; item.critical += Number(o.priority === "critical"); item.oldestOpenDays = Math.max(item.oldestOpenDays, ageDays(o)); liveLocations.set(key, item);
  }
  const live = {
    asOf: new Date(asOf).toISOString(), repairBacklog: liveOpen.length, maintenanceBacklog: liveOpen.filter((o) => o.type === "maintenance").length,
    awaitingVerification: liveOrders.filter((o) => state(o, liveCutoff) === "resolved").length,
    critical: liveOpen.filter((o) => o.priority === "critical").length,
    overdue: liveOpen.filter((o) => {
      if (!o.dueDate) return false;
      const due = /^\d{4}-\d{2}-\d{2}$/.test(o.dueDate) ? Date.parse(`${o.dueDate}T00:00:00+08:00`) + day : Date.parse(o.dueDate);
      return Number.isFinite(due) && due <= asOf;
    }).length,
    pendingMaterial: liveOpen.filter((o) => state(o, liveCutoff) === "pending_material").length,
    onHold: liveOpen.filter((o) => state(o, liveCutoff) === "on_hold").length,
    oldestOpenDays: Math.max(0, ...liveOpen.map(ageDays)),
    locations: [...liveLocations.values()].sort((a, b) => b.backlog - a.backlog || b.critical - a.critical || where(a).localeCompare(where(b))).slice(0, 5)
  };
  const findings: string[] = [];
  const recommendedActions: string[] = [];
  const top = machines.find((m) => m.reports30d > 0);
  if (top) {
    findings.push(`${top.machine} (${where(top)}) recorded ${top.reports30d} maintenance reports in the 30-day window, including ${top.weekReports} this week versus ${top.previousWeekReports} the previous week.${top.repeatedIssue ? ` The category “${top.repeatedIssue}” appeared on ${top.repeatedIssueReports} distinct reports.` : ""}`);
    if (top.reports30d >= 2) recommendedActions.push(`Review the repair history and inspect ${top.machine} (${where(top)}) for recurring ${top.repeatedIssue || "reported"} issues before deciding corrective work.`);
  }
  const hotspot = locations.find((l) => l.weekReports > 0);
  if (hotspot) {
    findings.push(`${where(hotspot)} had the highest weekly maintenance-report volume: ${hotspot.weekReports} reports versus ${hotspot.previousWeekReports} the previous week, with ${hotspot.repairBacklog} repairs outstanding at the weekly cutoff.`);
    recommendedActions.push(`Review the reporting-week incidents, maintenance coverage and current repair status for ${where(hotspot)}.`);
  }
  const downtimeTop = [...machineGroups.values()].filter((m) => m.downtimeSamples > 0).sort((a, b) => b.downtimeMinutes - a.downtimeMinutes || a.key.localeCompare(b.key))[0];
  if (downtimeTop) findings.push(`${downtimeTop.machine} (${where(downtimeTop)}) had the largest summed acknowledgement-to-resolution duration this week: ${round(downtimeTop.downtimeMinutes / 60)} hours across ${downtimeTop.downtimeSamples} measured work orders. This is elapsed job time, not unique production loss.`);
  if (!weekly.length) findings.push("No non-cancelled maintenance requests were created during the reporting week; carried-over repair work is still included in the backlog.");
  findings.push(`At the live snapshot, ${live.repairBacklog} work orders across all work types awaited repair (${live.maintenanceBacklog} maintenance jobs), including ${live.critical} critical and ${live.overdue} overdue jobs. ${live.pendingMaterial} awaited materials and ${live.awaitingVerification} awaited verification.`);
  if (live.locations[0]) {
    const l = live.locations[0];
    findings.push(`The largest live maintenance backlog was at ${where(l)}: ${l.backlog} jobs, with the oldest open for ${l.oldestOpenDays} days.`);
  }
  if (live.pendingMaterial) recommendedActions.push("Confirm purchasing owners and material delivery dates for the live material-blocked repairs.");
  if (live.critical || live.overdue) recommendedActions.push("Assign owners and recovery dates to the live critical and overdue backlog.");
  const unidentified = recent.filter((o) => !machineKey(o)).length;
  const missingLocation = recent.filter((o) => unknown(o.location) && unknown(o.area)).length;
  if (unidentified || missingLocation) {
    findings.push(`Data coverage: ${unidentified} maintenance reports lacked identifiable equipment and ${missingLocation} lacked a usable section/area in the 30-day window.`);
    recommendedActions.push("Complete missing equipment and section/area details so repeat-report analysis can identify the correct machine and place.");
  }
  return { lookbackStart: new Date(lookback).toISOString(), lookbackEnd: new Date(end).toISOString(), maintenanceReportsThisWeek: weekly.length, maintenanceReportsPreviousWeek: previous.length, maintenanceReports30d: recent.length,
    repeatMachines30d: machines.filter((m) => m.reports30d >= 2).length, unidentifiedMachineReports30d: unidentified, missingLocationReports30d: missingLocation,
    machines: machines.filter((m) => m.reports30d || m.weekReports || m.previousWeekReports || m.repairBacklog).slice(0, 5),
    locations: locations.filter((l) => l.reports30d || l.weekReports || l.previousWeekReports || l.repairBacklog).slice(0, 5).map((l) => ({ ...l, downtimeMinutes: round(l.downtimeMinutes) })),
    issues: issueList.slice(0, 5), findings, recommendedActions, live };
}
