import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const express = require("express");
const root = path.resolve("tmp", `weekly-report-${Date.now()}`);
mkdirSync(root, { recursive: true });
process.env.CMMS_DATA_DIR = root;
process.env.CMMS_UPLOADS_DIR = path.join(root, "uploads");
process.env.NODE_ENV = "test";
process.env.ADMIN_PASSWORD = "Report-test-only-password!";
delete process.env.OLLAMA_MODEL;
const m = await import("../dist/db.js");
const r = await import("../dist/weekly-report.js");
const { weeklyAutomationRouter, weeklyManagementRouter } = await import("../dist/weekly-report-routes.js");
const { plantContext } = await import("../dist/plant-context.js");
const { downtimeWindow } = await import("@sugi-cmms/shared");
const inPlant = (plant, fn) => plantContext.run({ plant }, fn);
m.migrate(); r.initializeWeeklyReports();
inPlant("port-klang", () => m.seed());
// Keep fixtures isolated from demonstration work orders.
m.db.prepare("DELETE FROM work_order_activities").run();
m.db.prepare("DELETE FROM work_order_attachments").run();
m.db.prepare("DELETE FROM work_orders").run();
const admin = m.listUsers().find((u) => u.role === "admin");
const adminSession = inPlant("port-klang", () => m.createAuthSession(admin.username, process.env.ADMIN_PASSWORD));
const start = "2026-10-11T16:00:00.000Z"; // Monday 12 Oct, Malaysia.
const cutoff = "2026-10-18T16:00:00.000Z";
const week = "2026-10-12";
function fixture({ plant = "port-klang", name = "Test machine", created = start, events = [], priority = "medium", dueDate = null }) {
  return inPlant(plant, () => {
    const o = m.createWorkOrder(m.validateCreateWorkOrderInput({ requesterId: admin.id, type: "maintenance", machineName: name, area: "Test", location: "Test section", reportedByDepartment: "Production", responsibleDepartment: "Production", issueDescription: "Test issue" }));
    m.db.prepare("DELETE FROM work_order_activities WHERE workOrderId = ?").run(o.id);
    m.db.prepare("UPDATE work_orders SET createdAt = ?, updatedAt = ?, priority = ?, dueDate = ?, status = ? WHERE id = ?").run(created, events.at(-1)?.[1] || created, priority, dueDate, events.at(-1)?.[0] || "open", o.id);
    const actions = { open: "created", acknowledged: "acknowledged", resolved: "resolved", closed: "closed", returned: "returned", pending_material: "pending_material" };
    for (const [status, time] of [["open", created], ...events]) m.db.prepare("INSERT INTO work_order_activities (plantId,id,workOrderId,actorId,action,status,message,createdAt) VALUES (?,?,?,?,?,?,?,?)").run(plant, randomUUID(), o.id, admin.id, actions[status], status, "fixture", time);
    return o;
  });
}
const old = fixture({ name: '<img src=x onerror="alert(1)">', created: "2026-10-01T00:00:00.000Z", priority: "critical", dueDate: "2026-10-17", events: [["acknowledged", "2026-10-02T00:00:00.000Z"], ["closed", "2026-10-20T00:00:00.000Z"]] });
const done = fixture({ events: [["acknowledged", "2026-10-12T00:00:00.000Z"], ["resolved", "2026-10-12T02:00:00.000Z"], ["closed", "2026-10-14T01:00:00.000Z"]] });
fixture({ name: "Awaiting verification", events: [["acknowledged", "2026-10-12T00:00:00.000Z"], ["resolved", "2026-10-13T00:00:00.000Z"]] });
fixture({ name: "Missing acknowledgement", events: [["resolved", "2026-10-13T01:00:00.000Z"]] });
fixture({ name: "Returned repair", events: [["acknowledged", "2026-10-12T00:00:00.000Z"], ["resolved", "2026-10-12T01:00:00.000Z"], ["returned", "2026-10-13T01:00:00.000Z"], ["resolved", "2026-10-13T02:00:00.000Z"]] });
fixture({ name: "At exclusive cutoff", created: cutoff });
fixture({ name: "Due Sunday", dueDate: "2026-10-18" });
fixture({ plant: "sendayan", name: "Sendayan-only", priority: "critical", dueDate: "2026-10-10" });

const f = inPlant("port-klang", () => r.weeklyFacts(week));
assert.equal(f.start, start); assert.equal(f.end, cutoff);
assert.equal(f.current.created, 5); assert.equal(f.current.resolved, 4); assert.equal(f.current.closed, 1);
assert.equal(f.current.backlog, 2); assert.equal(f.current.awaitingVerification, 3);
assert.equal(f.current.critical, 1); assert.equal(f.current.overdue, 1);
assert.equal(f.current.downtimeSamples, 3); assert.equal(f.current.missingAcknowledgement, 1);
assert.equal(f.current.downtimeMinutes, 120 + 1440 + 1560);
assert.equal(f.previous.backlog, 1, "Historical backlog must include the carried-over job");
assert.equal(f.statuses.find((s) => s.status === "open").count, 1);
assert.equal(f.statuses.find((s) => s.status === "acknowledged").count, 1, "Closure after the cutoff must not rewrite history");
assert.equal(f.daily.reduce((a, d) => a + d.resolved, 0), 5, "Daily resolutions count the returned job on both days");
assert.equal(inPlant("all", () => r.weeklyFacts(week)).current.backlog, 3);
assert.equal(inPlant("sendayan", () => r.weeklyFacts(week)).exceptions[0].machine, "Sendayan-only");
assert.equal(r.weeklyPeriod(undefined, Date.parse("2026-10-18T16:05:00Z")).start, Date.parse(start));
assert.throws(() => r.weeklyPeriod("2026-10-13"), /Monday/);
assert.throws(() => r.weeklyPeriod("2026-02-30"), /Monday/);
assert.throws(() => r.weeklyPeriod("2999-01-07"), /completed|Monday/);
assert.equal(inPlant("port-klang", () => m.getWorkOrder(done.id)).acknowledgedAt, "2026-10-12T00:00:00.000Z");
assert.equal(inPlant("port-klang", () => m.listWorkOrders()).find((o) => o.id === done.id).acknowledgedAt, "2026-10-12T00:00:00.000Z");

const timing = { acknowledgedAt: "2026-10-12T00:00:00Z", resolvedAt: "2026-10-12T02:00:00Z", updatedAt: "2026-10-15T00:00:00Z" };
for (const status of ["resolved", "closed"]) assert.equal(downtimeWindow({ ...timing, status }, cutoff).minutes, 120);
assert.equal(downtimeWindow({ ...timing, status: "pending_material" }, "2026-10-12T03:00:00Z").minutes, 180);
assert.equal(downtimeWindow({ ...timing, status: "returned" }, "2026-10-13T00:00:00Z").running, true);
assert.equal(downtimeWindow({ ...timing, status: "cancelled" }, cutoff).end, timing.updatedAt);
assert.equal(downtimeWindow({ ...timing, status: "cancelled", cancelledAt: "2026-10-12T03:00:00Z" }, cutoff).minutes, 180, "Later edits must not extend cancellation timing");
assert.equal(downtimeWindow({ ...timing, status: "closed", resolvedAt: null }).minutes, null, "Missing repair completion must not be replaced with closure time");
assert.equal(downtimeWindow({ status: "open", updatedAt: cutoff }, cutoff).minutes, null);
assert.equal(downtimeWindow({ ...timing, status: "resolved", acknowledgedAt: "invalid" }).minutes, null);

const [saved, duplicate] = await inPlant("port-klang", () => Promise.all([r.generateWeeklyReport(week), r.generateWeeklyReport(week)]));
assert.equal(saved.id, duplicate.id); assert.equal(saved.aiStatus, "disabled");
assert.match(saved.html, /&lt;img/); assert.doesNotMatch(saved.html, /<img|<script|undefined|NaN/);
assert.match(saved.html, /Daily work order activity/); assert.match(saved.html, /Repair backlog ageing/);
assert.match(saved.html, /not unique production downtime/);
writeFileSync(path.join(root, "preview.html"), saved.html);
assert.throws(() => inPlant("sendayan", () => r.readWeeklyReport(saved.id)), /not found/);
assert.equal(inPlant("sendayan", () => r.weeklyReportHistory()).length, 0);
const before = saved.facts.current.backlog;
inPlant("port-klang", () => m.db.prepare("UPDATE work_order_activities SET status = 'closed', action = 'closed' WHERE workOrderId = ? AND action = 'acknowledged'").run(old.id));
assert.equal(inPlant("port-klang", () => r.readWeeklyReport(saved.id)).facts.current.backlog, before, "A saved snapshot must remain stable");
const claim = inPlant("port-klang", () => r.claimWeeklyDelivery(saved.id));
assert.equal(claim.claimed, true);
assert.equal(inPlant("port-klang", () => r.claimWeeklyDelivery(saved.id)).claimed, false);
assert.throws(() => inPlant("port-klang", () => r.completeWeeklyDelivery(saved.id, "wrong", true)), /attempt/);
await assert.rejects(inPlant("port-klang", () => r.generateWeeklyReport(week, true)), /unsent draft/);
inPlant("port-klang", () => r.completeWeeklyDelivery(saved.id, claim.deliveryToken, false));
assert.equal(inPlant("port-klang", () => r.completeWeeklyDelivery(saved.id, claim.deliveryToken, false)).delivery, "failed");
inPlant("port-klang", () => r.resetWeeklyDelivery(saved.id));
const secondClaim = inPlant("port-klang", () => r.claimWeeklyDelivery(saved.id));
assert.notEqual(secondClaim.deliveryToken, claim.deliveryToken);
assert.throws(() => inPlant("port-klang", () => r.completeWeeklyDelivery(saved.id, claim.deliveryToken, true)), /attempt/);
inPlant("port-klang", () => r.completeWeeklyDelivery(saved.id, secondClaim.deliveryToken, true));
assert.equal(inPlant("port-klang", () => r.completeWeeklyDelivery(saved.id, secondClaim.deliveryToken, true)).delivery, "sent");
assert.throws(() => inPlant("port-klang", () => r.resetWeeklyDelivery(saved.id)), /Only failed/);

// Exercise the actual routers through HTTP, including scope and role checks.
process.env.CMMS_REPORT_TOKEN = "test-only-token-with-more-than-thirty-two-characters";
process.env.CMMS_REPORT_PLANTS = "port-klang";
const app = express(); app.use(express.json());
app.use("/integration", weeklyAutomationRouter());
app.use("/management", (req, _res, next) => { req.cmmsUser = { role: req.header("x-test-role") }; plantContext.run({ plant: "port-klang" }, next); }, weeklyManagementRouter());
app.use((e, _req, res, _next) => res.status(400).json({ error: e.message }));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const headers = { "Content-Type": "application/json", "X-CMMS-Report-Token": process.env.CMMS_REPORT_TOKEN };
try {
  assert.equal((await fetch(base + "/integration/weekly", { method: "POST" })).status, 401);
  assert.equal((await fetch(base + "/integration/weekly", { method: "POST", headers: { ...headers, "X-CMMS-Plant": "all" }, body: JSON.stringify({ week }) })).status, 403);
  assert.equal((await fetch(base + "/integration/weekly", { method: "POST", headers, body: JSON.stringify({ week }) })).status, 200);
  assert.equal((await fetch(base + "/integration/anything", { headers })).status, 404);
  assert.equal((await fetch(base + "/management/history", { headers: { "x-test-role": "technician" } })).status, 403);
  assert.equal((await fetch(base + "/management/history", { headers: { "x-test-role": "executive" } })).status, 200);
  assert.equal((await fetch(base + "/management/preview?week=2026-10-13", { headers: { "x-test-role": "executive" } })).status, 400);
} finally { server.close(); }

// Mock the local model: inspect grounding, JSON shape, malformed output and failure.
const originalFetch = globalThis.fetch;
process.env.OLLAMA_MODEL = "test-local-model";
try {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.stream, false); assert.equal(body.keep_alive, "0s");
    assert.doesNotMatch(body.messages[1].content, /onerror|Test issue|reporter/i);
    return { ok: true, json: async () => ({ message: { content: JSON.stringify({ summary: "The maintenance backlog requires continued attention, with resolved repairs awaiting requester verification." }) } }) };
  };
  assert.equal((await r.writeNarrative(f, true)).aiStatus, "generated");
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ message: { content: '{"summary":"There were 999999 failures this week."}' } }) });
  assert.equal((await r.writeNarrative(f, true)).aiStatus, "unavailable");
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.equal((await r.writeNarrative(f, true)).aiStatus, "unavailable");
} finally { globalThis.fetch = originalFetch; }

const workflow = JSON.parse(readFileSync(new URL("../../../docs/n8n-weekly-management-report.json", import.meta.url), "utf8"));
assert.equal(workflow.active, false); assert.equal(workflow.settings.timezone, "Asia/Kuala_Lumpur");
const names = new Set(workflow.nodes.map((n) => n.name));
for (const output of Object.values(workflow.connections)) for (const branch of output.main) for (const edge of branch) assert(names.has(edge.node));
assert.equal(workflow.nodes.find((n) => n.name === "Send management email").onError, "continueErrorOutput");
assert.equal(workflow.nodes.find((n) => n.name === "Send management email").retryOnFail, undefined);
console.log(`Weekly management report checks passed. Preview: ${path.join(root, "preview.html")}`);
m.db.close();
