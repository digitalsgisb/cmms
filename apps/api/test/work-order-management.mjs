import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const root = path.resolve("tmp", `work-order-management-${Date.now()}`);
mkdirSync(root, { recursive: true });
process.env.CMMS_DATA_DIR = root;
process.env.CMMS_UPLOADS_DIR = path.join(root, "uploads");
process.env.NODE_ENV = "test";
process.env.ADMIN_PASSWORD = "Work-order-test-123!";
for (const key of Object.keys(process.env)) {
  if (/^(WORK_ORDER_|SPARE_|VAPID_)/.test(key)) delete process.env[key];
}

const m = await import("../dist/db.js");
const { plantContext } = await import("../dist/plant-context.js");
const inPlant = (fn) => plantContext.run({ plant: "port-klang" }, fn);
const password = "Work-order-test-123!";

m.migrate();
inPlant(() => m.seed());
const admin = m.listUsers().find((user) => user.role === "admin");
assert(admin);
const rememberedSession = inPlant(() => m.createAuthSession(admin.username, password));
assert.equal(rememberedSession.expiresAt, "9999-12-31T23:59:59.999Z");
const rememberedTokenHash = createHash("sha256").update(rememberedSession.token).digest("hex");
inPlant(() => m.db.prepare("UPDATE auth_sessions SET expiresAt = ? WHERE tokenHash = ?")
  .run(new Date(Date.now() + 60 * 60 * 1000).toISOString(), rememberedTokenHash));
inPlant(() => m.seed());
assert.equal(inPlant(() => m.authenticateSession(rememberedSession.token)).id, admin.id);
const renewedSession = inPlant(() => m.db.prepare("SELECT expiresAt FROM auth_sessions WHERE tokenHash = ?").get(rememberedTokenHash));
assert.equal(renewedSession.expiresAt, "9999-12-31T23:59:59.999Z");
inPlant(() => m.db.prepare(`
  INSERT INTO users (id, username, name, role, department, title, active, plantAccess)
  VALUES ('wo-developer', 'wo-developer', 'WO Developer', 'developer', 'IT', 'Developer', 1, 'both')
`).run());
const developer = inPlant(() => m.getUser("wo-developer"));

function createUser(role, suffix, department = role === "technician" ? "Maintenance" : "Production") {
  return inPlant(() => m.createUser({
    actorId: admin.id,
    username: `wo-${suffix}`,
    password,
    name: `WO ${suffix}`,
    role,
    department,
    title: role,
    plantAccess: "port-klang"
  }));
}

const executive = createUser("executive", "executive");
const technician = createUser("technician", "technician");
const supportingTechnician = createUser("technician", "supporting-technician");
const kaizenTechnician = createUser("technician", "kaizen-technician", "Kaizen");
const requester = createUser("requester", "requester");
const secondRequester = createUser("requester", "requester-two", "SHE");
const requesterSession = inPlant(() => m.createAuthSession(requester.username, password));
assert.equal(inPlant(() => m.authenticateSession(requesterSession.token)).id, requester.id);
assert.equal(inPlant(() => m.revokeUserSessions(requester.id, admin.id)), 1);
assert.throws(() => inPlant(() => m.authenticateSession(requesterSession.token)), /expired or invalid/i);
const masterData = inPlant(() => m.listMasterData());
const section = masterData.sections[0];
const issueCategory = masterData.issueCategories[0];
assert(section);
assert(issueCategory);

function createOrder(label, type = "maintenance") {
  return inPlant(() => m.createWorkOrder(m.validateCreateWorkOrderInput({
    requesterId: requester.id,
    type,
    workDate: "2026-09-08",
    shiftGroup: "A",
    sectionId: section.id,
    machineName: label,
    area: "Test area",
    reportedByName: requester.name,
    reportedByDepartment: "Production",
    responsibleDepartment: "Production",
    issueCategoryId: issueCategory.id,
    issueDescription: "Original issue"
  })));
}

const workOrder = createOrder("Original machine");
const updateBody = {
  actorId: executive.id,
  type: "project",
  priority: "high",
  dueDate: "2026-09-30",
  workDate: "2026-09-09",
  shiftGroup: "B",
  sectionId: section.id,
  machineId: null,
  area: "Updated area",
  machineName: "Updated machine",
  reportedByName: "Updated reporter",
  reportedByDepartment: "SHE",
  responsibleDepartment: "SHE",
  issueCategoryId: issueCategory.id,
  issueDescription: "Updated issue"
};

assert.throws(
  () => inPlant(() => m.updateWorkOrder(workOrder.id, m.validateUpdateWorkOrderInput({ ...updateBody, actorId: technician.id }))),
  /Executive or admin/i
);
assert.throws(
  () => inPlant(() => m.updateWorkOrder(workOrder.id, m.validateUpdateWorkOrderInput({ ...updateBody, actorId: developer.id }))),
  /Executive or admin/i
);

const updated = inPlant(() => m.updateWorkOrder(workOrder.id, m.validateUpdateWorkOrderInput(updateBody)));
assert.equal(updated.number, workOrder.number);
assert.equal(updated.machineName, "Updated machine");
assert.equal(updated.issueDescription, "Updated issue");
assert.equal(updated.priority, "high");
assert.equal(updated.responsibleDepartment, "SHE");
assert.equal(updated.shiftGroup, "N/A");
assert.equal(inPlant(() => m.getWorkOrderDetail(workOrder.id)).activities[0].action, "edited");

const timedOrder = createOrder("Requester timer check");
assert.equal(timedOrder.closedAt, null);
const closedTimedOrder = inPlant(() => m.updateWorkOrderStatus(timedOrder.id, {
  actorId: requester.id,
  status: "closed",
  note: "Requester verified the timer test."
}));
assert(closedTimedOrder.closedAt);
assert.equal(inPlant(() => m.listWorkOrders(requester)).find((order) => order.id === timedOrder.id)?.closedAt, closedTimedOrder.closedAt);

const maintenanceOrder = createOrder("Maintenance routing");
const kaizenOrder = createOrder("Kaizen routing", "kaizen");
const projectOrder = createOrder("Shared project", "project");
const customCategoryOrder = inPlant(() => m.createWorkOrder(m.validateCreateWorkOrderInput({
  requesterId: secondRequester.id,
  type: "maintenance",
  workDate: "2026-09-08",
  sectionId: section.id,
  area: "Other area",
  machineName: "Other equipment",
  reportedByName: secondRequester.name,
  reportedByDepartment: "SHE",
  responsibleDepartment: "SHE",
  issueCategoryName: "Access control",
  issueDescription: "Custom category issue"
})));
assert.equal(customCategoryOrder.issueCategoryName, "Access control");
assert(inPlant(() => m.listWorkOrders(requester)).some((order) => order.id === customCategoryOrder.id));
assert.equal(inPlant(() => m.userCanAccessWorkOrder(requester, customCategoryOrder)), true);
const maintenanceVisible = inPlant(() => m.listWorkOrders(technician));
const kaizenVisible = inPlant(() => m.listWorkOrders(kaizenTechnician));
assert(maintenanceVisible.some((order) => order.id === maintenanceOrder.id));
assert(!maintenanceVisible.some((order) => order.id === kaizenOrder.id));
assert(maintenanceVisible.some((order) => order.id === projectOrder.id));
assert(!kaizenVisible.some((order) => order.id === maintenanceOrder.id));
assert(kaizenVisible.some((order) => order.id === kaizenOrder.id));
assert(kaizenVisible.some((order) => order.id === projectOrder.id));
const executiveTeamEdit = inPlant(() => m.updateWorkOrder(maintenanceOrder.id, m.validateUpdateWorkOrderInput({
  actorId: executive.id,
  type: maintenanceOrder.type,
  priority: maintenanceOrder.priority,
  dueDate: maintenanceOrder.dueDate,
  workDate: maintenanceOrder.workDate,
  shiftGroup: maintenanceOrder.shiftGroup,
  sectionId: maintenanceOrder.sectionId,
  machineId: maintenanceOrder.machineId,
  area: maintenanceOrder.area,
  machineName: maintenanceOrder.machineName,
  reportedByName: maintenanceOrder.reportedByName,
  reportedByDepartment: maintenanceOrder.reportedByDepartment,
  responsibleDepartment: maintenanceOrder.responsibleDepartment,
  issueCategoryId: maintenanceOrder.issueCategoryId,
  issueCategoryName: maintenanceOrder.issueCategoryName,
  issueDescription: maintenanceOrder.issueDescription,
  assignedToId: technician.id,
  supportingTechnicianIds: [kaizenTechnician.id],
  productionDowntimeReason: "Executive corrected the brief"
})));
assert.equal(executiveTeamEdit.assignedToId, technician.id);
assert.deepEqual(executiveTeamEdit.supportingTechnicianIds, [kaizenTechnician.id]);
assert.equal(executiveTeamEdit.productionDowntimeReason, "Executive corrected the brief");
assert.equal(inPlant(() => m.getWorkOrderDetail(maintenanceOrder.id)).supportingTechnicians[0]?.id, kaizenTechnician.id);
assert.throws(() => inPlant(() => m.claimWorkOrder(projectOrder.id, technician.id)), /assigned by a coordinator/i);
assert.throws(() => inPlant(() => m.claimWorkOrder(maintenanceOrder.id, kaizenTechnician.id)), /another technician team/i);
assert.throws(() => inPlant(() => m.assignWorkOrder(maintenanceOrder.id, kaizenTechnician.id, executive.id)), /team responsible/i);
assert.equal(inPlant(() => m.claimWorkOrder(kaizenOrder.id, kaizenTechnician.id)).assignedToId, kaizenTechnician.id);

const fairTimingOrder = createOrder("Fair timing workflow");
inPlant(() => m.claimWorkOrder(fairTimingOrder.id, technician.id));
inPlant(() => m.addAttachment({
  workOrderId: fairTimingOrder.id,
  uploadedBy: technician.id,
  filename: "after.jpg",
  originalName: "after.jpg",
  mimeType: "image/jpeg",
  size: 10,
  url: "/test/after.jpg",
  kind: "after"
}));
assert.throws(
  () => inPlant(() => m.updateWorkOrderStatus(fairTimingOrder.id, { actorId: technician.id, status: "resolved", note: "Repair complete", maintenanceActualMinutes: 25 })),
  /Start Repair/i
);
inPlant(() => m.updateWorkOrderStatus(fairTimingOrder.id, { actorId: technician.id, status: "in_progress", note: "Repair started" }));
assert.throws(
  () => inPlant(() => m.updateWorkOrderStatus(fairTimingOrder.id, { actorId: technician.id, status: "resolved", note: "Repair complete" })),
  /maintenance actual time/i
);
assert.throws(
  () => inPlant(() => m.updateWorkOrderStatus(fairTimingOrder.id, { actorId: technician.id, status: "resolved", note: "Repair complete", maintenanceActualMinutes: 25 })),
  /supporting technicians/i
);
const resolvedFairTimingOrder = inPlant(() => m.updateWorkOrderStatus(fairTimingOrder.id, {
  actorId: technician.id,
  status: "resolved",
  note: "Repair complete",
  maintenanceActualMinutes: 25,
  supportingTechnicianIds: [supportingTechnician.id]
}));
assert.equal(resolvedFairTimingOrder.maintenanceActualMinutes, 25);
assert.deepEqual(resolvedFairTimingOrder.supportingTechnicianIds, [supportingTechnician.id]);
assert.equal(inPlant(() => m.getWorkOrderDetail(fairTimingOrder.id)).supportingTechnicians[0]?.id, supportingTechnician.id);
assert(resolvedFairTimingOrder.maintenanceStartedAt);
assert(resolvedFairTimingOrder.resolvedAt);
const extendedDowntimeStart = new Date(Date.parse(resolvedFairTimingOrder.resolvedAt) - 2 * 60 * 60 * 1000).toISOString();
inPlant(() => m.db.prepare("UPDATE work_orders SET createdAt = ? WHERE id = ?").run(extendedDowntimeStart, fairTimingOrder.id));
assert.throws(
  () => inPlant(() => m.updateWorkOrderStatus(fairTimingOrder.id, { actorId: requester.id, status: "closed", note: "Verified" })),
  /choose one reason/i
);
inPlant(() => m.notifyLongRunningWorkOrders());
inPlant(() => m.notifyLongRunningWorkOrders());
const reasonReminders = inPlant(() => m.listNotifications(requester.id)).filter((item) => item.workOrderId === fairTimingOrder.id && /reason pending/i.test(item.title));
assert.equal(reasonReminders.length, 1);
assert.throws(
  () => inPlant(() => m.updateWorkOrderDowntimeReason(fairTimingOrder.id, { actorId: technician.id, reason: "Waiting for technician" })),
  /requester or responsible department/i
);
const reasonUpdatedOrder = inPlant(() => m.updateWorkOrderDowntimeReason(fairTimingOrder.id, {
  actorId: requester.id,
  reason: "Waiting for technician"
}));
assert.equal(reasonUpdatedOrder.productionDowntimeReason, "Waiting for technician");
const closedFairTimingOrder = inPlant(() => m.updateWorkOrderStatus(fairTimingOrder.id, {
  actorId: requester.id,
  status: "closed",
  note: "Verified"
}));
assert.equal(closedFairTimingOrder.productionDowntimeReason, "Waiting for technician");

const disposable = createOrder("Delete permission check");
await assert.rejects(inPlant(() => m.deleteWorkOrder(disposable.id, technician.id)), /Executive or admin/i);
await assert.rejects(inPlant(() => m.deleteWorkOrder(disposable.id, developer.id)), /Executive or admin/i);
await inPlant(() => m.deleteWorkOrder(disposable.id, executive.id));
assert.throws(() => inPlant(() => m.getWorkOrder(disposable.id)), /not found/i);

m.db.close();
console.log("PASS: work-order management, technician-team routing, project assignment rules, stable identifiers, and edit history.");
