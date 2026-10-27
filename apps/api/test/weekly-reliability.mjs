import assert from "node:assert/strict";
import { buildWeeklyReliability } from "../dist/weekly-reliability.js";

const start = Date.parse("2026-10-12T00:00:00+08:00");
const end = Date.parse("2026-10-19T00:00:00+08:00");
const asOf = Date.parse("2026-10-21T12:00:00+08:00");
const h = 3_600_000;
const day = 24 * h;
const iso = (n) => new Date(n).toISOString();
const records = []; const events = [];
function add(id, input = {}, states = []) {
  const order = { id, number: id, plantId: "port-klang", type: "maintenance", responsibleDepartment: "Production", machineId: "press-1", machineName: "Press 1", sectionId: null, location: "Line 1", area: "Bay 1", issueCategoryName: "Electrical", priority: "medium", dueDate: null, createdAt: iso(start), assignedToId: null, status: "open", ...input };
  records.push(order);
  events.push({ workOrderId: id, action: "created", status: "open", createdAt: order.createdAt });
  for (const [status, at] of states) events.push({ workOrderId: id, action: status, status, createdAt: iso(at) });
  return order;
}
add("press-first", {}, [["acknowledged", start + h], ["resolved", start + 3 * h], ["closed", start + day]]);
add("press-repeat", { createdAt: iso(start + day) }, [["acknowledged", start + day + h], ["resolved", start + day + 3 * h], ["returned", start + day + 4 * h], ["resolved", start + day + 5 * h], ["closed", start + day + 6 * h]]);
add("press-previous", { createdAt: iso(start - 4 * day) }, [["acknowledged", start - 4 * day + h], ["resolved", start - 4 * day + 2 * h], ["closed", start - 4 * day + 3 * h]]);
add("normalised-first", { machineId: null, machineName: "Press 2", issueCategoryName: "Bearing" });
add("normalised-repeat", { machineId: null, machineName: "  PRESS   2 ", location: " LINE  1 ", area: " bay 1 ", issueCategoryName: " bearing " });
add("other-area", { machineId: null, machineName: "Press 2", area: "Bay 2" });
add("other-plant", { plantId: "sendayan" });
add("other-department", { responsibleDepartment: "SHE", machineId: null, machineName: "Press 2" });
add("unidentified", { machineId: null, machineName: "Others", location: "Others", area: "N/A" });
add("project-excluded", { type: "project" });
add("kaizen-excluded", { type: "kaizen" });
add("office-excluded", { type: "office" });
add("cancelled-excluded", {}, [["cancelled", start + h]]);
add("old-backlog", { machineId: "pump-1", machineName: "Pump 1", createdAt: iso(start - 11 * day) }, [["acknowledged", start - 11 * day + h], ["resolved", end + day], ["closed", end + day + h]]);
add("live-only", { machineId: "fan-1", machineName: "Fan 1", location: "Line 3", area: "Roof", createdAt: iso(end), priority: "critical", dueDate: "2026-10-20" }, [["acknowledged", end + h], ["pending_material", end + 2 * h]]);
add("future-excluded", { createdAt: iso(asOf + day), machineId: "future", machineName: "Future record" });
// Match database timeline ordering, including original insertion order for ties.
events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const analysis = buildWeeklyReliability(records, events, start, end, asOf);
assert.equal(analysis.maintenanceReportsThisWeek, 8);
assert.equal(analysis.maintenanceReportsPreviousWeek, 1);
assert.equal(analysis.maintenanceReports30d, 10);
assert.equal(analysis.repeatMachines30d, 2);
assert.equal(analysis.unidentifiedMachineReports30d, 1);
assert.equal(analysis.missingLocationReports30d, 1);
const press = analysis.machines.find((m) => m.plant === "port-klang" && m.machine === "Press 1");
assert.equal(press.reports30d, 3); assert.equal(press.weekReports, 2); assert.equal(press.previousWeekReports, 1);
assert.equal(press.returnedThisWeek, 1, "A returned repair is separate from new-report frequency");
assert.equal(press.downtimeMinutes, 360); assert.equal(press.downtimeSamples, 2);
assert.equal(press.repeatedIssue, "Electrical"); assert.equal(press.repeatedIssueReports, 3);
const normalised = analysis.machines.find((m) => m.plant === "port-klang" && m.department === "Production" && m.machine === "Press 2" && m.area === "Bay 1");
assert.equal(normalised.reports30d, 2); assert.equal(normalised.repeatedIssueReports, 2);
assert(analysis.machines.some((m) => m.area === "Bay 2" && m.reports30d === 1), "Fallback identity must distinguish different areas");
assert(analysis.machines.some((m) => m.plant === "sendayan" && m.machine === "Press 1" && m.reports30d === 1), "Machine names/IDs must not merge across plants");
const line = analysis.locations.find((l) => l.plant === "port-klang" && l.department === "Production" && l.area === "Bay 1");
assert.equal(line.weekReports, 4); assert.equal(line.previousWeekReports, 1);
assert.equal(line.downtimeMinutes, 360);
assert.equal(analysis.live.asOf, iso(asOf));
assert.equal(analysis.live.critical, 1); assert.equal(analysis.live.overdue, 1); assert.equal(analysis.live.pendingMaterial, 1);
assert(analysis.live.locations.some((l) => l.section === "Line 3" && l.backlog === 1), "Jobs created after the weekly cutoff belong only to the live snapshot");
assert(!analysis.machines.some((m) => m.machine === "Fan 1"), "Live-only machine must not leak into weekly frequency");
assert(analysis.findings.some((f) => f.includes("Press 1") && f.includes("3 maintenance reports")));
assert(analysis.recommendedActions.some((f) => f.includes("Press 1") && f.includes("Electrical")));
assert(analysis.findings.some((f) => f.includes("live snapshot")));

const empty = buildWeeklyReliability([], [], start, end, asOf);
assert.equal(empty.repeatMachines30d, 0); assert.equal(empty.live.oldestOpenDays, 0);
assert.equal(empty.machines.length, 0); assert.equal(empty.locations.length, 0);
assert(empty.findings.some((f) => f.includes("No non-cancelled")));
assert(!JSON.stringify(empty).match(/NaN|Infinity/));

// The final day of a date-only due date is not already overdue.
const dueToday = { ...records[0], id: "due-today", priority: "medium", createdAt: iso(start), dueDate: "2026-10-21" };
assert.equal(buildWeeklyReliability([dueToday], [], start, end, asOf).live.overdue, 0);
// An old backlog still appears even when the reporting week has no requests.
const carried = { ...records[0], id: "carried", createdAt: iso(start - 60 * day) };
const carriedAnalysis = buildWeeklyReliability([carried], [], start, end, asOf);
assert.equal(carriedAnalysis.maintenanceReports30d, 0);
assert.equal(carriedAnalysis.machines[0].repairBacklog, 1);
assert.equal(carriedAnalysis.live.maintenanceBacklog, 1);
console.log("PASS: maintenance repeat reports, location isolation, recurring categories, cancelled/non-maintenance exclusion, historical cutoff, live snapshot, downtime and empty-data coverage.");
