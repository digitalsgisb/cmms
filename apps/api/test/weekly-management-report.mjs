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
const emailSettings = await import("../dist/report-email-delivery.js");
const { weeklyAutomationRouter, weeklyManagementRouter } = await import("../dist/weekly-report-routes.js");
const { plantContext } = await import("../dist/plant-context.js");
const { downtimeWindow } = await import("@sugi-cmms/shared");
const inPlant = (plant, fn) => plantContext.run({ plant }, fn);
m.migrate(); r.initializeWeeklyReports(); r.initializeWeeklyReports();
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
    const o = m.createWorkOrder(m.validateCreateWorkOrderInput({ requesterId: admin.id, reportedByName: admin.name, type: "maintenance", machineName: name, area: "Test", location: "Test section", reportedByDepartment: "Production", responsibleDepartment: "Production", issueDescription: "Test issue" }));
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
assert.match(saved.html, /&lt;img/); assert.doesNotMatch(saved.html, /<img src=x|<script|undefined|NaN/);
assert.equal((saved.html.match(/<img /g) || []).length, 1, "Only the trusted company logo may render as an image");
assert.match(saved.html, /alt="Sugihara Grand Industries Sdn\. Bhd\. CMMS logo"/);
assert.match(saved.html, /bgcolor="#000000"/);
for (const [, hex] of saved.html.matchAll(/#([0-9a-f]{6})\b/gi)) {
  assert.equal(hex.slice(0, 2), hex.slice(2, 4), `Email colour must be monochrome: #${hex}`);
  assert.equal(hex.slice(2, 4), hex.slice(4, 6), `Email colour must be monochrome: #${hex}`);
}
assert.equal((saved.html.match(/Open CMMS app/g) || []).length, 2);
assert.match(saved.html, /prefers-color-scheme:dark/);
const originalAppUrl = process.env.APP_PUBLIC_URL;
process.env.APP_PUBLIC_URL = "https://cmms.example.test/portal/?private=do-not-leak#section";
const configuredHtml = r.renderWeeklyEmail(saved);
assert.match(configuredHtml, /href="https:\/\/cmms\.example\.test\/portal\/"/);
assert.match(configuredHtml, /src="https:\/\/cmms\.example\.test\/portal\/brand\/sugi_logo_white\.png"/);
assert.doesNotMatch(configuredHtml, /do-not-leak|#section/);
for (const invalid of ["javascript:alert(1)", "https://user:password@example.test", "not a URL"]) {
  process.env.APP_PUBLIC_URL = invalid;
  const html = r.renderWeeklyEmail(saved);
  assert.match(html, /href="https:\/\/cmms\.sugidigital\.org\/"/);
  assert.doesNotMatch(html, /href="javascript:|user:password/);
}
if (originalAppUrl === undefined) delete process.env.APP_PUBLIC_URL;
else process.env.APP_PUBLIC_URL = originalAppUrl;
assert.match(saved.html, /Daily work order activity/); assert.match(saved.html, /Repair backlog ageing/);
assert.match(saved.html, /not unique production downtime/);
assert.match(saved.html, /Machines with frequent maintenance reports/);
assert.match(saved.html, /Lines, sections and areas with reported issues/);
assert.match(saved.html, /Most reported issue categories/);
assert.match(saved.html, /Live situation when this report was generated/);
assert.match(saved.html, /Management action plan/);
assert.equal(saved.facts.reliability.maintenanceReportsThisWeek, 5);
assert.equal(saved.facts.reliability.live.critical, 0, "Live snapshot must see the critical job's later closure");
assert(!saved.actions.includes("Prioritise the outstanding critical work orders and confirm repair ownership."), "Closed historical critical jobs must not be presented as live action items");
assert(saved.facts.reliability.machines.every((m) => m.plant === "port-klang"));
assert(saved.facts.reliability.live.locations.every((l) => l.plant === "port-klang"));
assert.equal(inPlant("sendayan", () => r.weeklyFacts(week)).reliability.maintenanceReportsThisWeek, 1);
const legacy = { ...saved, facts: { ...saved.facts } }; delete legacy.facts.reliability;
assert.match(r.renderWeeklyEmail(legacy), /older snapshot/);
writeFileSync(path.join(root, "preview.html"), saved.html);
assert.throws(() => inPlant("sendayan", () => r.readWeeklyReport(saved.id)), /not found/);
assert.equal(inPlant("sendayan", () => r.weeklyReportHistory()).length, 0);
const before = saved.facts.current.backlog;
inPlant("port-klang", () => m.db.prepare("UPDATE work_order_activities SET status = 'closed', action = 'closed' WHERE workOrderId = ? AND action = 'acknowledged'").run(old.id));
assert.equal(inPlant("port-klang", () => r.readWeeklyReport(saved.id)).facts.current.backlog, before, "A saved snapshot must remain stable");
assert.deepEqual(inPlant("port-klang", () => emailSettings.reportEmailSettings()).to, []);
assert.throws(() => inPlant("port-klang", () => r.claimWeeklyDelivery(saved.id)), /To recipient/);
assert.equal(inPlant("port-klang", () => r.readWeeklyReport(saved.id)).delivery, "draft");
for (const input of [{ to: ["bad-address"] }, { to: ["boss@example.com\r\nBcc: other@example.com"] }, { to: "boss@example.com" }, { to: Array(21).fill("boss@example.com") }]) {
  assert.throws(() => inPlant("port-klang", () => emailSettings.saveReportEmailSettings(input)), /email|recipients|addresses|line breaks/i);
}
const recipients = inPlant("port-klang", () => emailSettings.saveReportEmailSettings({ to: ["Boss@example.com", "boss@example.com"], cc: ["boss@example.com", "team@example.com"] }));
assert.deepEqual(recipients.to, ["Boss@example.com"]); assert.deepEqual(recipients.cc, ["team@example.com"]);
assert.deepEqual(inPlant("sendayan", () => emailSettings.reportEmailSettings()).to, []);
assert.deepEqual(inPlant("all", () => emailSettings.reportEmailSettings()).to, []);
const claim = inPlant("port-klang", () => r.claimWeeklyDelivery(saved.id));
assert.equal(claim.claimed, true);
assert.equal(claim.email.toEmail, "Boss@example.com"); assert.equal(claim.email.ccEmail, "team@example.com");
assert.match(claim.email.html, /src="cid:cmmsLogo"/);
assert.doesNotMatch(claim.email.html, /src="https?:/);
assert.equal(Buffer.from(claim.email.logo.data, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.equal(inPlant("port-klang", () => r.readWeeklyReport(saved.id)).html, saved.html, "Inline transport must not mutate the saved preview");
inPlant("port-klang", () => emailSettings.saveReportEmailSettings({ to: ["next-boss@example.com"], cc: [] }));
assert.deepEqual(inPlant("port-klang", () => r.readWeeklyReport(saved.id)).deliveryTo, ["Boss@example.com"], "An active delivery freezes the recipient list");
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
let webhookCalls = 0; let dispatch; let webhookStatus = 200;
app.post("/test-webhook", (req, res) => {
  webhookCalls++; dispatch = req.body;
  assert.equal(req.header("x-cmms-webhook-token"), process.env.CMMS_REPORT_WEBHOOK_TOKEN);
  res.status(webhookStatus).json({ accepted: true });
});
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
  const managementHeaders = { "Content-Type": "application/json", "x-test-role": "executive" };
  const currentResponse = await fetch(base + "/management/current", { method: "POST", headers: managementHeaders });
  assert.equal(currentResponse.status, 200);
  const interim = await currentResponse.json();
  assert.equal(interim.facts.periodMode, "week-to-date");
  assert.match(interim.html, /Interim report:|same elapsed period/);
  assert.match(interim.subject, /^CMMS Maintenance Update \| Port Klang \| /);
  assert.doesNotMatch(interim.subject, /As of|\d+:\d+:\d+/);
  assert.equal((await fetch(base + "/management/email-settings", { headers: { "x-test-role": "technician" } })).status, 403);
  assert.equal((await fetch(base + "/management/email-settings", { method: "PUT", headers: { "Content-Type": "application/json", "x-test-role": "technician" }, body: JSON.stringify({ to: ["wrong@example.com"] }) })).status, 403);
  assert.equal((await fetch(base + "/integration/email-settings", { method: "PUT", headers, body: JSON.stringify({ to: ["wrong@example.com"] }) })).status, 404);
  assert.equal((await fetch(base + "/management/email-settings", { method: "PUT", headers: managementHeaders, body: JSON.stringify({ to: ["bad-address"] }) })).status, 400);
  assert.equal((await fetch(base + `/management/${interim.id}/send`, { method: "POST", headers: managementHeaders })).status, 400, "Missing webhook settings must not reserve a draft");
  assert.equal(inPlant("port-klang", () => r.readWeeklyReport(interim.id)).delivery, "draft");
  process.env.CMMS_REPORT_WEBHOOK_URL = base + "/test-webhook";
  process.env.CMMS_REPORT_WEBHOOK_TOKEN = "separate-test-manual-webhook-token-at-least-32-characters";
  inPlant("port-klang", () => emailSettings.saveReportEmailSettings({ to: [], cc: [] }));
  assert.equal((await fetch(base + `/management/${interim.id}/send`, { method: "POST", headers: managementHeaders })).status, 400);
  assert.equal(inPlant("port-klang", () => r.readWeeklyReport(interim.id)).delivery, "draft");
  assert.equal(webhookCalls, 0, "Missing recipients must never contact n8n");
  const savedRecipients = await fetch(base + "/management/email-settings", { method: "PUT", headers: managementHeaders, body: JSON.stringify({ to: ["manual-boss@example.com"], cc: ["manual-team@example.com"] }) });
  assert.equal(savedRecipients.status, 200);
  assert.deepEqual((await (await fetch(base + "/management/email-settings", { headers: managementHeaders })).json()).to, ["manual-boss@example.com"]);
  assert.equal((await fetch(base + `/management/${interim.id}/send`, { method: "POST", headers: { "x-test-role": "technician" } })).status, 403);
  const results = await Promise.all([1, 2].map(() => fetch(base + `/management/${interim.id}/send`, { method: "POST", headers: managementHeaders })));
  assert.deepEqual(results.map(v => v.status).sort(), [200, 400]);
  assert.equal(webhookCalls, 1, "Double click must trigger n8n only once");
  assert.equal(dispatch.reportId, interim.id); assert.equal(dispatch.plant, "port-klang");
  assert.equal(inPlant("port-klang", () => r.readWeeklyReport(interim.id)).delivery, "sending", "Webhook acceptance is not delivery success");
  inPlant("port-klang", () => emailSettings.saveReportEmailSettings({ to: ["changed-after-send@example.com"], cc: [] }));
  const accept = token => fetch(base + `/integration/weekly/${interim.id}/accept-manual`, { method: "POST", headers, body: JSON.stringify({ deliveryToken: token }) });
  assert.equal((await (await accept("wrong-token")).json()).claimed, false);
  const accepted = await (await accept(dispatch.deliveryToken)).json();
  assert.equal(accepted.claimed, true); assert.equal(accepted.html, interim.html);
  assert.equal(accepted.email.toEmail, "manual-boss@example.com", "Manual delivery must use recipients frozen when requested");
  assert.equal(accepted.email.ccEmail, "manual-team@example.com");
  assert.match(accepted.email.html, /src="cid:cmmsLogo"/);
  assert.equal((await (await accept(dispatch.deliveryToken)).json()).claimed, false, "Webhook replays must not send twice");
  assert.throws(() => inPlant("sendayan", () => r.acceptManualDelivery(interim.id, dispatch.deliveryToken)), /not found/);
  const completed = await fetch(base + `/integration/weekly/${interim.id}/delivery`, { method: "POST", headers, body: JSON.stringify({ deliveryToken: dispatch.deliveryToken, sent: true }) });
  assert.equal((await completed.json()).delivery, "sent");
  assert.equal((await fetch(base + `/management/${interim.id}/send`, { method: "POST", headers: managementHeaders })).status, 400);
  const uncertain = await inPlant("port-klang", () => r.generateCurrentReport());
  webhookStatus = 500;
  const uncertainResult = await inPlant("port-klang", () => r.sendReportNow(uncertain.id));
  assert.equal(uncertainResult.delivery, "sending"); assert.match(uncertainResult.deliveryError, /uncertain/);
  const staleToken = dispatch.deliveryToken;
  inPlant("port-klang", () => r.resetWeeklyDelivery(uncertain.id));
  assert.equal(inPlant("port-klang", () => r.acceptManualDelivery(uncertain.id, staleToken)).claimed, false);
} finally { server.close(); }

// Mock the local model: inspect grounding, JSON shape, malformed output and failure.
const originalFetch = globalThis.fetch;
process.env.OLLAMA_MODEL = "test-local-model";
try {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.stream, false); assert.equal(body.keep_alive, "0s");
    assert.doesNotMatch(body.messages[1].content, /Test issue|reporter/i);
    const evidence = JSON.parse(body.messages[1].content);
    assert(evidence.reliability.machines.length > 0);
    assert(evidence.reliability.locations.length > 0);
    assert.equal(evidence.reliability.liveSnapshot.asOf, f.reliability.live.asOf);
    assert.match(body.messages[0].content, /untrusted DATA/);
    return { ok: true, json: async () => ({ message: { content: JSON.stringify({ summary: "The maintenance backlog requires continued attention, with resolved repairs awaiting requester verification." }) } }) };
  };
  assert.equal((await r.writeNarrative(f, true)).aiStatus, "generated");
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ message: { content: '{"summary":"There were 5 new work orders in the reporting week, with recurring equipment reports requiring review."}' } }) });
  assert.equal((await r.writeNarrative(f, true)).aiStatus, "generated", "Grounded numeric commentary should be accepted");
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ message: { content: '{"summary":"There were 999999 failures this week."}' } }) });
  assert.equal((await r.writeNarrative(f, true)).aiStatus, "unavailable");
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.equal((await r.writeNarrative(f, true)).aiStatus, "unavailable");
} finally { globalThis.fetch = originalFetch; }

// The all-work-type downtime chart must also keep identically named equipment
// in different places separate, not undo the new reliability grouping.
const collisionTimes = [["acknowledged", "2026-10-12T00:00:00.000Z"], ["resolved", "2026-10-14T00:00:00.000Z"]];
const collisionA = fixture({ name: "Same equipment name", events: collisionTimes });
const collisionB = fixture({ name: "Same equipment name", events: collisionTimes });
m.db.prepare("UPDATE work_orders SET area = ? WHERE id = ?").run("Area A", collisionA.id);
m.db.prepare("UPDATE work_orders SET area = ? WHERE id = ?").run("Area B", collisionB.id);
const separated = inPlant("port-klang", () => r.weeklyFacts(week)).machines.filter((machine) => machine.machine === "Same equipment name");
assert.equal(separated.length, 2);
assert.deepEqual(new Set(separated.map((machine) => machine.area)), new Set(["Area A", "Area B"]));

fixture({ name: "Prior Thursday excluded from comparison", created: "2026-10-08T00:00:00.000Z" });
fixture({ name: "Future Thursday excluded from interim", created: "2026-10-15T00:00:00.000Z" });
const partial = inPlant("port-klang", () => r.weeklyFacts(undefined, Date.parse("2026-10-14T04:00:00.000Z"), true));
assert.equal(partial.start, start); assert.equal(partial.end, "2026-10-14T04:00:00.000Z");
assert.equal(partial.daily.length, 3, "Interim daily chart must not contain future days");
assert.equal(inPlant("port-klang", () => r.weeklyFacts("2026-10-12", Date.parse("2026-10-14T04:00:00.000Z"), true)).start, start, "Reopening a current report must not validate its Monday as a completed week");
assert.equal(partial.previous.created, 0, "Compare Monday to Wednesday last week, not the full week");
assert.equal(partial.reliability.maintenanceReportsPreviousWeek, 0);
assert(!partial.reliability.machines.some(m => m.machine === "Future Thursday excluded from interim"));
assert.equal((await inPlant("port-klang", () => r.generateWeeklyReport(week))).id, saved.id, "Scheduled snapshots must stay separate from interim reports");
const sameStartId = randomUUID();
m.db.prepare("INSERT INTO weekly_management_reports (id, scope, periodStart, periodEnd, payload, generatedAt) VALUES (?, ?, ?, ?, ?, ?)").run(sameStartId, "sendayan", partial.start, partial.end, JSON.stringify({ ...saved, id: sameStartId, facts: { ...partial, scope: "sendayan" } }), new Date().toISOString());
const laterWeekly = await inPlant("sendayan", () => r.generateWeeklyReport(week));
assert.notEqual(laterWeekly.id, sameStartId, "Interim and completed reports with the same Monday must have separate IDs");
assert.equal(laterWeekly.facts.end, cutoff);

const workflow = JSON.parse(readFileSync(new URL("../../../docs/n8n-weekly-management-report.json", import.meta.url), "utf8"));
assert.equal(workflow.active, false); assert.equal(workflow.settings.timezone, "Asia/Kuala_Lumpur");
const names = new Set(workflow.nodes.map((n) => n.name));
for (const output of Object.values(workflow.connections)) for (const branch of output.main) for (const edge of branch) assert(names.has(edge.node));
assert.equal(workflow.nodes.find((n) => n.name === "Send management email").onError, "continueErrorOutput");
assert.equal(workflow.nodes.find((n) => n.name === "Send management email").retryOnFail, undefined);
const manual = JSON.parse(readFileSync(new URL("../../../docs/n8n-manual-management-report.json", import.meta.url), "utf8"));
const manualNames = new Set(manual.nodes.map(n => n.name));
for (const output of Object.values(manual.connections)) for (const branch of output.main) for (const edge of branch) assert(manualNames.has(edge.node));
assert.equal(manual.nodes.find(n => n.type === "n8n-nodes-base.webhook").parameters.authentication, "headerAuth");
assert.equal(manual.nodes.find(n => n.name === "Send management email").retryOnFail, undefined);
for (const definition of [workflow, manual]) {
  const config = definition.nodes.find(n => n.name === "Report configuration");
  assert(!config.parameters.assignments.assignments.some(a => a.name === "toEmail"), "Recipients must not be hard-coded in n8n");
  const smtp = definition.nodes.find(n => n.name === "Send management email");
  assert.equal(smtp.parameters.toEmail, "={{ $json.toEmail }}");
  assert.equal(smtp.parameters.options.attachments, "cmmsLogo");
  const prepare = definition.nodes.find(n => n.name === "Prepare email with inline logo");
  assert.equal(prepare.onError, "continueErrorOutput");
  const execute = new Function("$input", prepare.parameters.jsCode);
  const [prepared] = execute({ first: () => ({ json: { email: claim.email } }) });
  assert.equal(prepared.json.toEmail, "Boss@example.com");
  assert.match(prepared.json.html, /src="cid:cmmsLogo"/);
  assert.equal(prepared.binary.cmmsLogo.data, claim.email.logo.data);
  assert.equal(prepared.binary.cmmsLogo.mimeType, "image/png");
  assert.throws(() => execute({ first: () => ({ json: {} }) }), /Missing CMMS recipients/);
  assert.equal(definition.connections[prepare.name].main[1][0].node, "Record failed delivery");
}
console.log(`Weekly management report checks passed. Preview: ${path.join(root, "preview.html")}`);
m.db.close();
