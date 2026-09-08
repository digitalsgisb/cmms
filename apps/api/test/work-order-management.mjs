import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync } from "node:fs";

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
inPlant(() => m.db.prepare(`
  INSERT INTO users (id, username, name, role, department, title, active, plantAccess)
  VALUES ('wo-developer', 'wo-developer', 'WO Developer', 'developer', 'IT', 'Developer', 1, 'both')
`).run());
const developer = inPlant(() => m.getUser("wo-developer"));

function createUser(role, suffix) {
  return inPlant(() => m.createUser({
    actorId: admin.id,
    username: `wo-${suffix}`,
    password,
    name: `WO ${suffix}`,
    role,
    department: role === "technician" ? "Maintenance" : "Production",
    title: role,
    plantAccess: "port-klang"
  }));
}

const executive = createUser("executive", "executive");
const technician = createUser("technician", "technician");
const requester = createUser("requester", "requester");
const masterData = inPlant(() => m.listMasterData());
const section = masterData.sections[0];
const issueCategory = masterData.issueCategories[0];
assert(section);
assert(issueCategory);

function createOrder(label) {
  return inPlant(() => m.createWorkOrder(m.validateCreateWorkOrderInput({
    requesterId: requester.id,
    type: "maintenance",
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

const disposable = createOrder("Delete permission check");
await assert.rejects(inPlant(() => m.deleteWorkOrder(disposable.id, technician.id)), /Executive or admin/i);
await assert.rejects(inPlant(() => m.deleteWorkOrder(disposable.id, developer.id)), /Executive or admin/i);
await inPlant(() => m.deleteWorkOrder(disposable.id, executive.id));
assert.throws(() => inPlant(() => m.getWorkOrder(disposable.id)), /not found/i);

m.db.close();
console.log("PASS: executive/admin-only work-order management, stable identifiers, and edit history.");
