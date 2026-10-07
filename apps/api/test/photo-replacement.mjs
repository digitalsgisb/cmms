import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";

const root = path.resolve("tmp", `photo-replacement-${Date.now()}`);
process.env.CMMS_DATA_DIR = root;
process.env.CMMS_UPLOADS_DIR = path.join(root, "uploads");
process.env.NODE_ENV = "test";
for (const key of Object.keys(process.env)) {
  if (/^(WORK_ORDER_|SPARE_|VAPID_)/.test(key)) delete process.env[key];
}
const password = "Photo-test-only-123!";
process.env.ADMIN_PASSWORD = password;
const m = await import("../dist/db.js");
const { plantContext } = await import("../dist/plant-context.js");
const inPlant = (fn, plant = "port-klang") => plantContext.run({ plant }, fn);
m.migrate();
inPlant(() => m.seed());
const admin = m.listUsers().find((user) => user.role === "admin");
const createUser = (role, suffix, department = "Maintenance", plantAccess = "port-klang") => inPlant(() => m.createUser({
  actorId: admin.id, username: `photo-${suffix}`, name: `Photo ${suffix}`, role,
  department, title: role, password, plantAccess
}));
const requester = createUser("requester", "requester", "Production");
const technician = createUser("technician", "technician");
const kaizen = createUser("technician", "kaizen", "Kaizen");
const otherPlant = createUser("technician", "other-plant", "Maintenance", "sendayan");
const executive = createUser("executive", "executive");
// Developer accounts follow the same fixture approach as work-order-management.mjs.
inPlant(() => m.db.prepare(`INSERT INTO users (id, username, name, role, department, title, active, plantAccess)
  VALUES ('photo-developer', 'photo-developer', 'Photo Developer', 'developer', 'IT', 'Developer', 1, 'both')`).run());
const developer = m.getUser("photo-developer");
const createOrder = () => inPlant(() => m.createWorkOrder(m.validateCreateWorkOrderInput({
  requesterId: requester.id, type: "maintenance", title: "Photo correction", issueDescription: "Repair fixture", responsibleDepartment: "Production"
})));
const order = createOrder();
const anotherOrder = createOrder();
const directory = path.join(process.env.CMMS_UPLOADS_DIR, "work-orders", order.id);
mkdirSync(directory, { recursive: true });
const photo = (kind) => {
  const filename = `${kind}.png`;
  writeFileSync(path.join(directory, filename), "original image");
  return inPlant(() => m.addAttachment({ workOrderId: order.id, uploadedBy: requester.id, filename,
    originalName: filename, mimeType: "image/png", size: 14, url: `/uploads/work-orders/${order.id}/${filename}`, kind }));
};
const before = photo("before"), issue = photo("issue"), after = photo("after"), progress = photo("progress");
const initial = inPlant(() => m.getWorkOrderDetail(order.id));
assert.throws(() => inPlant(() => m.getReplaceableAttachment(order.id, before.id, requester.id)), /Technician access/i);
assert.throws(() => inPlant(() => m.getReplaceableAttachment(order.id, before.id, kaizen.id)), /access/i);
assert.throws(() => inPlant(() => m.getReplaceableAttachment(order.id, before.id, otherPlant.id)), /access/i);
assert.throws(() => inPlant(() => m.getReplaceableAttachment(order.id, before.id, admin.id), "sendayan"), /not found/i);
assert.equal(inPlant(() => m.getReplaceableAttachment(order.id, before.id, developer.id)).id, before.id);

const session = (user) => m.createAuthSession(user.username, password);
const techSession = session(technician), requesterSession = session(requester), adminSession = session(admin), executiveSession = session(executive);
const kaizenSession = session(kaizen), otherPlantSession = session(otherPlant);
const port = 3398;
const server = spawn(process.execPath, [path.resolve("apps/api/dist/server.js")], {
  env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
server.stdout.on("data", (data) => { logs += data; });
server.stderr.on("data", (data) => { logs += data; });
const base = `http://localhost:${port}`;
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/WQAAAAASUVORK5CYII=", "base64");
async function replace(attachment, auth = techSession, options = {}) {
  const body = new FormData();
  if (!options.empty) body.append("attachment", new Blob([options.data || image], { type: options.type || "image/png" }), options.name || "corrected.png");
  if (options.spoof) body.append("uploadedBy", admin.id);
  return fetch(`${base}/api/work-orders/${options.orderId || order.id}/attachments/${attachment.id}`, {
    method: "PUT", body, headers: { ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}), "X-CMMS-Plant": options.plant || "port-klang" }
  });
}
async function changeStatus(auth, actorId, status, maintenanceActualMinutes) {
  const response = await fetch(`${base}/api/work-orders/${order.id}/status`, {
    method: "PATCH", headers: { Authorization: `Bearer ${auth.token}`, "X-CMMS-Plant": "port-klang", "Content-Type": "application/json" },
    body: JSON.stringify({ actorId, status, note: "Repair verified", maintenanceActualMinutes })
  });
  assert.equal(response.status, 200, await response.clone().text());
}
async function editEvent(auth, actor, overrides = {}, plant = "port-klang") {
  return fetch(`${base}/api/work-orders/${order.id}`, {
    method: "PATCH", headers: {
      Authorization: `Bearer ${auth.token}`, "X-CMMS-Plant": plant, "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile"
    },
    body: JSON.stringify({ ...initial, actorId: actor.id, issueDescription: "Corrected event from mobile", ...overrides })
  });
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, logs);
  assert.equal((await replace(before, null)).status, 401);
  assert.equal((await replace(before, requesterSession)).status, 403);
  assert.equal((await replace(before, kaizenSession)).status, 403);
  assert.equal((await replace(before, otherPlantSession, { plant: "sendayan" })).status, 404);
  assert.equal((await replace(before, adminSession, { plant: "all" })).status, 400);
  assert.equal((await replace(before, techSession, { orderId: anotherOrder.id })).status, 400);
  assert.equal((await replace({ id: "missing" })).status, 400);
  assert.equal((await replace(progress)).status, 400);
  assert.equal((await replace(before, techSession, { empty: true })).status, 400);
  assert.equal((await replace(before, techSession, { type: "text/plain" })).status, 400);
  assert.equal((await replace(before, techSession, { data: Buffer.alloc(8 * 1024 * 1024 + 1) })).status, 400);
  assert.equal(readFileSync(path.join(directory, before.filename), "utf8"), "original image");
  assert.equal(readdirSync(directory).length, 4);
  assert.equal(inPlant(() => m.getWorkOrderDetail(order.id)).activities.filter((a) => a.action === "attachment_replaced").length, 0);

  const response = await replace(before, techSession, { spoof: true });
  assert.equal(response.status, 200, await response.clone().text());
  const corrected = await response.json();
  assert.equal(corrected.id, before.id);
  assert.equal(corrected.kind, "before");
  assert.equal(corrected.uploadedBy, technician.id);
  assert.equal(corrected.createdAt, before.createdAt);
  assert.notEqual(corrected.url, before.url);
  assert(!existsSync(path.join(directory, before.filename)));
  assert.deepEqual(readFileSync(path.join(directory, corrected.filename)), image);
  assert.equal((await replace(issue, executiveSession)).status, 200);
  const claim = await fetch(`${base}/api/work-orders/${order.id}/claim`, {
    method: "PATCH", headers: { Authorization: `Bearer ${techSession.token}`, "X-CMMS-Plant": "port-klang", "Content-Type": "application/json" },
    body: JSON.stringify({ actorId: technician.id })
  });
  assert.equal(claim.status, 200, await claim.clone().text());
  await changeStatus(techSession, technician.id, "in_progress");
  await changeStatus(techSession, technician.id, "resolved", 10);
  assert.equal((await replace(after)).status, 200);
  await changeStatus(executiveSession, executive.id, "closed");
  const closed = inPlant(() => m.getWorkOrderDetail(order.id));
  assert.equal((await replace(after, adminSession)).status, 200);
  const final = inPlant(() => m.getWorkOrderDetail(order.id));
  assert.equal(final.status, "closed");
  assert.equal(final.closedAt, closed.closedAt);
  assert.equal(final.resolvedAt, closed.resolvedAt);
  assert.equal(final.maintenanceActualMinutes, 10);
  assert.equal(final.attachments.length, initial.attachments.length);
  assert.equal(final.attachments.find((item) => item.id === issue.id).kind, "issue");
  const history = final.activities.filter((activity) => activity.action === "attachment_replaced");
  assert.equal(history.length, 4);
  assert(history.some((activity) => activity.actorId === technician.id && /before.png.*corrected.png/.test(activity.message)));
  assert.equal(readdirSync(directory).length, 4);
  const forbiddenEdit = await editEvent(requesterSession, requester);
  assert.equal(forbiddenEdit.status, 400);
  assert.match((await forbiddenEdit.json()).error, /Technician access or above/i);
  assert.equal((await editEvent(kaizenSession, kaizen)).status, 403);
  assert.equal((await editEvent(otherPlantSession, otherPlant, {}, "sendayan")).status, 404);
  assert.equal((await editEvent(techSession, technician, { type: "kaizen" })).status, 400);
  const eventResponse = await editEvent(techSession, technician, {
    assignedToId: final.assignedToId, supportingTechnicianIds: final.supportingTechnicianIds,
    completionNote: final.completionNote, productionDowntimeReason: final.productionDowntimeReason
  });
  assert.equal(eventResponse.status, 200, await eventResponse.clone().text());
  const edited = await eventResponse.json();
  assert.equal(edited.issueDescription, "Corrected event from mobile");
  assert.equal(edited.number, final.number);
  assert.equal(edited.status, "closed");
  assert.equal(edited.closedAt, final.closedAt);
  assert.equal(edited.resolvedAt, final.resolvedAt);
  assert.equal(edited.maintenanceActualMinutes, 10);
  assert(inPlant(() => m.getWorkOrderDetail(order.id)).activities.some((a) => a.action === "edited" && a.actorId === technician.id));
  console.log("PASS: photo replacement and mobile-client event editing, roles, plant/team isolation, validation, file cleanup, audit history, and completed events.");
} finally {
  server.kill();
  await once(server, "exit");
  m.db.close();
}
