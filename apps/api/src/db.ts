import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  ActivityAction,
  CreateWorkOrderInput,
  DashboardSummary,
  IssueCategory,
  Machine,
  MachineImportResult,
  MachineImportRow,
  MasterData,
  NotificationRecord,
  AssignPmTemplateInput,
  PmChecklistItem,
  PmChecklistResult,
  PmChecklistTemplate,
  PmDashboardResponse,
  PmPlan,
  PmScheduleDetail,
  PmScheduleItem,
  SavePmResultInput,
  SavePmTemplateInput,
  SubmitPmScheduleInput,
  PublicRequesterWorkOrder,
  Section,
  SpareAdjustmentInput,
  SpareImportInput,
  SpareImportResult,
  SpareInventoryResponse,
  SpareIssueInput,
  SparePart,
  SparePartDetail,
  SpareQrLookupResult,
  SpareSyncSettings,
  SpareSupplier,
  SpareSyncResult,
  StockMovement,
  StockMovementDetail,
  StockMovementType,
  StockSyncStatus,
  UpdateSpareSyncSettingsInput,
  UpdateWorkOrderStatusInput,
  User,
  WorkOrder,
  WorkOrderActivity,
  WorkOrderAttachment,
  WorkOrderDetail,
  WorkOrderStatus,
  WorkOrderType
} from "@sugi-cmms/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
export const uploadsRoot = path.resolve(__dirname, "../uploads");

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

if (!existsSync(uploadsRoot)) {
  mkdirSync(uploadsRoot, { recursive: true });
}

export const db = new DatabaseSync(path.join(dataDir, "cmms.sqlite"));

function now() {
  return new Date().toISOString();
}

function row<T>(value: unknown): T {
  return value as T;
}

function rows<T>(value: unknown[]): T[] {
  return value as T[];
}

function boolNumber(value: boolean) {
  return value ? 1 : 0;
}

const userSelectColumns = "id, username, name, role, department, title, avatarUrl";
const publicRequesterId = "u-requester-public";
const defaultSectionIds = {
  conversion: "section-conversion",
  rollMaking: "section-roll-making"
};
const otherIssueCategoryId = "issue-category-other";

function createPasswordRecord(password: string) {
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, passwordSalt, 64).toString("hex");
  return { passwordHash, passwordSalt };
}

function verifyPassword(password: string, passwordSalt: string, passwordHash: string) {
  const expected = Buffer.from(passwordHash, "hex");
  const actual = Buffer.from(scryptSync(password, passwordSalt, 64));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function migrate() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      title TEXT NOT NULL,
      avatarUrl TEXT,
      passwordHash TEXT,
      passwordSalt TEXT
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      assetName TEXT NOT NULL,
      location TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      requesterId TEXT NOT NULL,
      assignedToId TEXT,
      dueDate TEXT,
      completionNote TEXT,
      workDate TEXT NOT NULL,
      shiftGroup TEXT NOT NULL,
      sectionId TEXT,
      machineId TEXT,
      machineName TEXT NOT NULL,
      reportedByName TEXT NOT NULL,
      reportedByDepartment TEXT NOT NULL,
      issueCategoryId TEXT,
      issueDescription TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (requesterId) REFERENCES users(id),
      FOREIGN KEY (assignedToId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      sectionId TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (sectionId) REFERENCES sections(id)
    );

    CREATE TABLE IF NOT EXISTS issue_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS work_order_activities (
      id TEXT PRIMARY KEY,
      workOrderId TEXT NOT NULL,
      actorId TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT,
      message TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (actorId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS work_order_attachments (
      id TEXT PRIMARY KEY,
      workOrderId TEXT NOT NULL,
      uploadedBy TEXT NOT NULL,
      filename TEXT NOT NULL,
      originalName TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      kind TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (uploadedBy) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      workOrderId TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      readAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS spare_parts (
      itemNo TEXT PRIMARY KEY,
      no TEXT,
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      uom TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      partRank TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      stockRank TEXT NOT NULL DEFAULT '',
      minStock REAL NOT NULL DEFAULT 0,
      maxStock REAL NOT NULL DEFAULT 0,
      searchName TEXT NOT NULL DEFAULT '',
      openingStock REAL NOT NULL DEFAULT 0,
      currentStock REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL DEFAULT '',
      supplier1 TEXT NOT NULL DEFAULT '',
      supplier2 TEXT NOT NULL DEFAULT '',
      supplier3 TEXT NOT NULL DEFAULT '',
      leadTime TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spare_suppliers (
      id TEXT PRIMARY KEY,
      no TEXT,
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      pic TEXT NOT NULL DEFAULT '',
      contactNo TEXT NOT NULL DEFAULT '',
      faxNo TEXT NOT NULL DEFAULT '',
      autoDial TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      itemNo TEXT NOT NULL,
      workOrderId TEXT,
      actorId TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      beforeStock REAL NOT NULL,
      afterStock REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      syncStatus TEXT NOT NULL,
      syncError TEXT,
      syncedAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (itemNo) REFERENCES spare_parts(itemNo),
      FOREIGN KEY (workOrderId) REFERENCES work_orders(id),
      FOREIGN KEY (actorId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS spare_sync_attempts (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spare_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pm_checklist_templates (
      id TEXT PRIMARY KEY,
      machineName TEXT NOT NULL,
      title TEXT NOT NULL,
      documentNumber TEXT NOT NULL DEFAULT '',
      revisionNumber TEXT NOT NULL DEFAULT '',
      effectiveDate TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pm_checklist_items (
      id TEXT PRIMARY KEY,
      templateId TEXT NOT NULL,
      sortOrder INTEGER NOT NULL,
      groupName TEXT NOT NULL,
      description TEXT NOT NULL,
      specification TEXT NOT NULL,
      inspectionMethod TEXT NOT NULL,
      frequency TEXT NOT NULL,
      dataType TEXT NOT NULL,
      maintenanceType TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (templateId) REFERENCES pm_checklist_templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pm_plans (
      id TEXT PRIMARY KEY,
      mainMachine TEXT NOT NULL,
      machineName TEXT NOT NULL,
      frequencyLabel TEXT NOT NULL,
      frequencyMonths INTEGER NOT NULL DEFAULT 1,
      occurrencesPerMonth INTEGER NOT NULL DEFAULT 1,
      technicianId TEXT NOT NULL,
      technicianName TEXT NOT NULL,
      templateId TEXT,
      startMonth INTEGER NOT NULL DEFAULT 1,
      weekOfMonth INTEGER NOT NULL DEFAULT 1,
      secondaryWeek INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (technicianId) REFERENCES users(id),
      FOREIGN KEY (templateId) REFERENCES pm_checklist_templates(id)
    );

    CREATE TABLE IF NOT EXISTS pm_schedules (
      id TEXT PRIMARY KEY,
      planId TEXT NOT NULL,
      scheduledDate TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      weekOfMonth INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      startedAt TEXT,
      submittedAt TEXT,
      verifiedAt TEXT,
      verifiedById TEXT,
      remarks TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(planId, year, month, weekOfMonth),
      FOREIGN KEY (planId) REFERENCES pm_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (verifiedById) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS pm_results (
      id TEXT PRIMARY KEY,
      scheduleId TEXT NOT NULL,
      itemId TEXT NOT NULL,
      resultCode TEXT,
      readingValue TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      completedAt TEXT,
      updatedById TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(scheduleId, itemId),
      FOREIGN KEY (scheduleId) REFERENCES pm_schedules(id) ON DELETE CASCADE,
      FOREIGN KEY (itemId) REFERENCES pm_checklist_items(id),
      FOREIGN KEY (updatedById) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
    CREATE INDEX IF NOT EXISTS idx_work_orders_requester ON work_orders(requesterId);
    CREATE INDEX IF NOT EXISTS idx_work_orders_assigned ON work_orders(assignedToId);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, readAt);
    CREATE INDEX IF NOT EXISTS idx_machines_section ON machines(sectionId);
    CREATE INDEX IF NOT EXISTS idx_spare_parts_category ON spare_parts(category);
    CREATE INDEX IF NOT EXISTS idx_spare_parts_search ON spare_parts(searchName);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(itemNo, createdAt);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_sync ON stock_movements(syncStatus, createdAt);
    CREATE INDEX IF NOT EXISTS idx_pm_items_template ON pm_checklist_items(templateId, sortOrder);
    CREATE INDEX IF NOT EXISTS idx_pm_plans_technician ON pm_plans(technicianId, active);
    CREATE INDEX IF NOT EXISTS idx_pm_schedules_date ON pm_schedules(scheduledDate, status);
    CREATE INDEX IF NOT EXISTS idx_pm_results_schedule ON pm_results(scheduleId);
  `);

  const userColumns = rows<{ name: string }>(db.prepare("PRAGMA table_info(users)").all());
  if (!userColumns.some((column) => column.name === "username")) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT");
  }
  if (!userColumns.some((column) => column.name === "avatarUrl")) {
    db.exec("ALTER TABLE users ADD COLUMN avatarUrl TEXT");
  }
  if (!userColumns.some((column) => column.name === "passwordHash")) {
    db.exec("ALTER TABLE users ADD COLUMN passwordHash TEXT");
  }
  if (!userColumns.some((column) => column.name === "passwordSalt")) {
    db.exec("ALTER TABLE users ADD COLUMN passwordSalt TEXT");
  }

  const workOrderColumns = rows<{ name: string }>(db.prepare("PRAGMA table_info(work_orders)").all());
  addWorkOrderColumnIfMissing(workOrderColumns, "workDate", "TEXT");
  addWorkOrderColumnIfMissing(workOrderColumns, "shiftGroup", "TEXT");
  addWorkOrderColumnIfMissing(workOrderColumns, "sectionId", "TEXT");
  addWorkOrderColumnIfMissing(workOrderColumns, "machineId", "TEXT");
  addWorkOrderColumnIfMissing(workOrderColumns, "machineName", "TEXT");
  addWorkOrderColumnIfMissing(workOrderColumns, "reportedByName", "TEXT");
  addWorkOrderColumnIfMissing(workOrderColumns, "reportedByDepartment", "TEXT");
  addWorkOrderColumnIfMissing(workOrderColumns, "issueCategoryId", "TEXT");
  addWorkOrderColumnIfMissing(workOrderColumns, "issueDescription", "TEXT");

  db.prepare("UPDATE work_orders SET workDate = COALESCE(workDate, substr(createdAt, 1, 10)) WHERE workDate IS NULL").run();
  db.prepare("UPDATE work_orders SET shiftGroup = COALESCE(shiftGroup, 'A') WHERE shiftGroup IS NULL").run();
  db.prepare("UPDATE work_orders SET machineName = COALESCE(machineName, assetName, 'Others') WHERE machineName IS NULL").run();
  db.prepare("UPDATE work_orders SET reportedByName = COALESCE(reportedByName, 'Requester') WHERE reportedByName IS NULL").run();
  db.prepare("UPDATE work_orders SET reportedByDepartment = COALESCE(reportedByDepartment, 'Production') WHERE reportedByDepartment IS NULL").run();
  db.prepare("UPDATE work_orders SET issueDescription = COALESCE(issueDescription, description, title) WHERE issueDescription IS NULL").run();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_work_orders_work_date ON work_orders(workDate);
    CREATE INDEX IF NOT EXISTS idx_work_orders_section ON work_orders(sectionId);
    CREATE INDEX IF NOT EXISTS idx_work_orders_machine ON work_orders(machineId, machineName);
  `);
}

function addWorkOrderColumnIfMissing(columns: Array<{ name: string }>, name: string, definition: string) {
  if (!columns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE work_orders ADD COLUMN ${name} ${definition}`);
  }
}

export function seed() {
  const users: Array<User & { password: string }> = [
    { id: "u-requester-1", username: "nurul", name: "Nurul Aina", role: "requester", department: "Production", title: "Production Executive", avatarUrl: null, password: "requester123" },
    { id: "u-requester-2", username: "raj", name: "Raj Kumar", role: "requester", department: "Quality", title: "QA Engineer", avatarUrl: null, password: "requester123" },
    { id: publicRequesterId, username: "public-requester", name: "Requester Kiosk", role: "requester", department: "Shop Floor", title: "Public Requester", avatarUrl: null, password: "requester123" },
    { id: "u-tech-1", username: "hafiz", name: "Hafiz Rahman", role: "technician", department: "Maintenance", title: "Maintenance Technician", avatarUrl: null, password: "tech123" },
    { id: "u-tech-2", username: "kumar", name: "Kumar Velu", role: "technician", department: "Maintenance", title: "Senior Technician", avatarUrl: null, password: "tech123" },
    { id: "u-tech-fauzan", username: "fauzan", name: "Fauzan", role: "technician", department: "Maintenance", title: "Maintenance Technician", avatarUrl: null, password: "tech123" },
    { id: "u-tech-selvem", username: "selvem", name: "Selvem", role: "technician", department: "Maintenance", title: "Maintenance Technician", avatarUrl: null, password: "tech123" },
    { id: "u-tech-mustak", username: "mustak", name: "Mustak", role: "technician", department: "Maintenance", title: "Maintenance Technician", avatarUrl: null, password: "tech123" },
    { id: "u-tech-daryl", username: "daryl", name: "Daryl", role: "technician", department: "Maintenance", title: "Maintenance Technician", avatarUrl: null, password: "tech123" },
    { id: "u-tech-hazwan", username: "hazwan", name: "Hazwan", role: "technician", department: "Maintenance", title: "Maintenance Technician", avatarUrl: null, password: "tech123" },
    { id: "u-tech-ammar", username: "ammar", name: "Ammar", role: "technician", department: "Maintenance", title: "Maintenance Technician", avatarUrl: null, password: "tech123" },
    { id: "u-exec-1", username: "azlan", name: "Azlan Musa", role: "executive", department: "Maintenance", title: "Maintenance Executive", avatarUrl: null, password: "exec123" },
    { id: "u-admin-1", username: "admin", name: "System Admin", role: "admin", department: "IT", title: "Administrator", avatarUrl: null, password: "admin123" }
  ];
  const userCount = row<{ count: number }>(db.prepare("SELECT COUNT(*) as count FROM users").get()).count;
  if (userCount === 0) {
    const insertUser = db.prepare("INSERT INTO users (id, username, name, role, department, title, avatarUrl, passwordHash, passwordSalt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

    for (const user of users) {
      const passwordRecord = createPasswordRecord(user.password);
      insertUser.run(user.id, user.username, user.name, user.role, user.department, user.title, user.avatarUrl, passwordRecord.passwordHash, passwordRecord.passwordSalt);
    }
  } else {
    for (const user of users) {
      const existing = row<{ username: string | null; passwordHash: string | null; passwordSalt: string | null } | undefined>(
        db.prepare("SELECT username, passwordHash, passwordSalt FROM users WHERE id = ?").get(user.id)
      );
      if (!existing) {
        const passwordRecord = createPasswordRecord(user.password);
        db.prepare("INSERT INTO users (id, username, name, role, department, title, avatarUrl, passwordHash, passwordSalt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(user.id, user.username, user.name, user.role, user.department, user.title, user.avatarUrl, passwordRecord.passwordHash, passwordRecord.passwordSalt);
        continue;
      }

      const passwordRecord = !existing.passwordHash || !existing.passwordSalt ? createPasswordRecord(user.password) : null;
      db.prepare(`
        UPDATE users
        SET username = COALESCE(username, ?),
            passwordHash = COALESCE(passwordHash, ?),
            passwordSalt = COALESCE(passwordSalt, ?)
        WHERE id = ?
      `).run(user.username, passwordRecord?.passwordHash || existing.passwordHash, passwordRecord?.passwordSalt || existing.passwordSalt, user.id);
    }
  }

  seedMasterData();
  seedPmData();

  const workOrderCount = row<{ count: number }>(db.prepare("SELECT COUNT(*) as count FROM work_orders").get()).count;
  if (workOrderCount === 0) {
    const first = createWorkOrder({
      type: "standard_maintenance",
      title: "Hydraulic press oil leakage",
      description: "Oil leaking near the left side hydraulic hose. Production can still run slowly but area is slippery.",
      assetName: "Hydraulic Press HP-02",
      location: "Production Line A",
      priority: "high",
      requesterId: "u-requester-1",
      workDate: now().slice(0, 10),
      shiftGroup: "A",
      sectionId: defaultSectionIds.conversion,
      machineName: "Hydraulic Press HP-02",
      reportedByName: "Nurul Aina",
      reportedByDepartment: "Production",
      issueCategoryId: otherIssueCategoryId,
      issueDescription: "Oil leaking near the left side hydraulic hose. Production can still run slowly but area is slippery.",
      dueDate: null
    });

    updateWorkOrderStatus(first.id, {
      status: "acknowledged",
      actorId: "u-tech-1",
      assignedToId: "u-tech-1",
      note: "Acknowledged. I will inspect the hose after current job."
    });

    const second = createWorkOrder({
      type: "kaizen",
      title: "Fabricate tool shadow board",
      description: "Need a shadow board near packing area to reduce time looking for cutter, tape, and caliper.",
      assetName: "Packing workstation",
      location: "Packing Area",
      priority: "medium",
      requesterId: "u-requester-2",
      workDate: now().slice(0, 10),
      shiftGroup: "B",
      sectionId: defaultSectionIds.rollMaking,
      machineName: "Packing workstation",
      reportedByName: "Raj Kumar",
      reportedByDepartment: "Quality",
      issueCategoryId: otherIssueCategoryId,
      issueDescription: "Need a shadow board near packing area to reduce time looking for cutter, tape, and caliper.",
      dueDate: null
    });

    updateWorkOrderStatus(second.id, {
      status: "in_progress",
      actorId: "u-tech-2",
      assignedToId: "u-tech-2",
      note: "Started measuring the wall space and tool layout."
    });

    createWorkOrder({
      type: "standard_maintenance",
      title: "Air leak at compressor drop point",
      description: "Hissing sound from air line near QA bench. Please check fitting.",
      assetName: "Compressed air line",
      location: "QA Bench 2",
      priority: "low",
      requesterId: "u-requester-2",
      workDate: now().slice(0, 10),
      shiftGroup: "A",
      sectionId: defaultSectionIds.conversion,
      machineName: "Compressed air line",
      reportedByName: "Raj Kumar",
      reportedByDepartment: "Quality",
      issueCategoryId: otherIssueCategoryId,
      issueDescription: "Hissing sound from air line near QA bench. Please check fitting.",
      dueDate: null
    });
  }
}

function seedMasterData() {
  const timestamp = now();
  const insertSection = db.prepare("INSERT OR IGNORE INTO sections (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)");
  insertSection.run(defaultSectionIds.conversion, "Conversion", 1, timestamp, timestamp);
  insertSection.run(defaultSectionIds.rollMaking, "Roll Making", 1, timestamp, timestamp);

  const insertMachine = db.prepare("INSERT OR IGNORE INTO machines (id, sectionId, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)");
  insertMachine.run("machine-conversion-1", defaultSectionIds.conversion, "Conversion Line 1", 1, timestamp, timestamp);
  insertMachine.run("machine-conversion-2", defaultSectionIds.conversion, "Conversion Line 2", 1, timestamp, timestamp);
  insertMachine.run("machine-roll-making-1", defaultSectionIds.rollMaking, "Roll Maker 1", 1, timestamp, timestamp);

  db.prepare("INSERT OR IGNORE INTO issue_categories (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)")
    .run(otherIssueCategoryId, "Other", 1, timestamp, timestamp);
}

function seedPmData() {
  const timestamp = now();
  const templateId = "pm-template-forming-6";
  db.prepare(`
    INSERT OR IGNORE INTO pm_checklist_templates (
      id, machineName, title, documentNumber, revisionNumber, effectiveDate, version, active, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    templateId,
    "Hydraulic Forming 6",
    "Preventive & Predictive Maintenance Checklist",
    "FR-MT-002",
    "5",
    "2025-02-03",
    1,
    1,
    timestamp,
    timestamp
  );

  const checklistItems: Array<[string, string, string, string, string, string, string]> = [
    ["Pump & Motor", "Ensure the hydraulic pump and motor are functioning properly.", "Hydraulic pump and motor are functioning properly.", "Visual / Testing", "Monthly", "marking", "preventive"],
    ["Pump & Motor", "Check and ensure oil level is maintained accordingly.", "Oil level should be at high level.", "Visual", "Monthly", "marking", "preventive"],
    ["Pump & Motor", "Check for any oil leakages.", "No leakages.", "Visual", "Monthly", "marking", "predictive"],
    ["Piston Rod", "Inspect and ensure smooth travel of the piston rod.", "Smooth and unrestricted movement of the piston rod.", "Visual", "Monthly", "marking", "preventive"],
    ["Control System", "Check the control circuit and limit switch, including the solenoid valve.", "All fully functional.", "Visual", "Monthly", "marking", "preventive"],
    ["Control System", "Ensure the photo sensor, safety sensor, and pitch roller are functioning properly.", "All fully functional.", "Visual", "Monthly", "marking", "preventive"],
    ["Control System", "Verify air pressure gauge readings.", "5 - 6 Bar", "Visual", "Monthly", "value", "predictive"],
    ["Conveyor Chain", "Check the conveyor chain drive motor and gearbox oil level.", "Good condition.", "Visual", "Monthly", "marking", "preventive"],
    ["Conveyor Chain", "Ensure the grease pump is functioning properly.", "Good condition.", "Visual", "Monthly", "marking", "preventive"],
    ["Conveyor Chain", "Inspect all carpet clamps and springs for damage or broken parts.", "Carpet clamps and springs are intact and functional.", "Visual", "Monthly", "marking", "preventive"],
    ["Conveyor Chain", "Inspect oven mounting and FWD/REV spur gear for proper function.", "Good condition.", "Visual", "Monthly", "marking", "preventive"],
    ["Oven Heater & Thermocouple", "Inspect the heaters for loose connections and ensure they are secured to the frame.", "Heater elements and connections are secure and functional.", "Visual", "Monthly", "marking", "preventive"],
    ["Oven Heater & Thermocouple", "Inspect the control panel for loose connections or damaged wires.", "No loose connections, damaged wires or faulty indicators.", "Visual", "Monthly", "marking", "preventive"],
    ["Oven Heater & Thermocouple", "Inspect heater wire, ceramic insulator and thermocouple wiring arrangement.", "No loose connection and in good condition.", "Visual", "Monthly", "marking", "preventive"],
    ["Lubrication & Safety", "Apply greasing at the bushing and ensure the mould frame is secured to the cylinder lock nut.", "Greased and mould is secure.", "Testing", "Monthly", "marking", "preventive"],
    ["Lubrication & Safety", "Check safety bar and ensure it is functioning properly.", "All fully functional.", "Testing", "Monthly", "marking", "preventive"],
    ["Chiller", "Inspect the high/low-pressure gauge to ensure it is within range.", "Within the green range.", "Visual", "Monthly", "marking", "predictive"],
    ["Chiller", "Check the control panel indicator light functionality.", "No faulty error and fully functional.", "Visual", "Monthly", "marking", "preventive"],
    ["Chiller", "Inspect the copper pipe condition for leaks or damages.", "No gas leaks or broken pipes.", "Visual / Testing", "Monthly", "marking", "predictive"],
    ["Chiller", "Clean condenser coils to ensure efficient heat exchange.", "In good condition and cleaned.", "Visual", "Monthly", "marking", "preventive"],
    ["Chiller", "Compare the set temperature with the actual temperature of the chiller.", "Actual temperature should align with the set point.", "Visual / Testing", "Monthly", "marking", "preventive"],
    ["Bolster", "Check the Bolster L-Bracket screw marking.", "Screw is aligned with the marking.", "Visual", "Monthly", "marking", "preventive"]
  ];
  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO pm_checklist_items (
      id, templateId, sortOrder, groupName, description, specification, inspectionMethod,
      frequency, dataType, maintenanceType, required
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  checklistItems.forEach((item, index) => {
    insertItem.run(`pm-forming-6-item-${index + 1}`, templateId, index + 1, ...item);
  });

  const technicianIds: Record<string, string> = {
    Fauzan: "u-tech-fauzan",
    Selvem: "u-tech-selvem",
    Mustak: "u-tech-mustak",
    Daryl: "u-tech-daryl",
    Hazwan: "u-tech-hazwan",
    Ammar: "u-tech-ammar"
  };
  type SeedPlan = [string, string, string, number, number, string, number, number, number?];
  const plans: SeedPlan[] = [
    ["4 Meter NP", "Bale Opener 1,2", "Every 2 months", 2, 1, "Fauzan", 1, 1],
    ["4 Meter NP", "Pre/Main Breaker", "Every 2 months", 2, 1, "Fauzan", 1, 2],
    ["4 Meter NP", "Mix/Tower Hopper", "Every 2 months", 2, 1, "Fauzan", 1, 1],
    ["4 Meter NP", "Carding", "Twice per month", 1, 2, "Fauzan", 1, 1, 3],
    ["4 Meter NP", "Weave Layer", "Monthly", 1, 1, "Fauzan", 1, 3],
    ["4 Meter NP", "Pre/Reverse/Final", "Monthly", 1, 1, "Fauzan", 1, 1],
    ["Latex", "Latex Dryer and Hot Roller", "Every 2 months", 2, 1, "Selvem", 1, 1],
    ["2 Meter NP", "Bale Opener 1,2", "Every 3 months", 3, 1, "Fauzan", 1, 1],
    ["2 Meter NP", "Main Breaker", "Every 3 months", 3, 1, "Fauzan", 2, 1],
    ["2 Meter NP", "Vertical Breaker", "Every 3 months", 3, 1, "Fauzan", 2, 2],
    ["2 Meter NP", "Chutter", "Every 3 months", 3, 1, "Fauzan", 2, 3],
    ["2 Meter NP", "Carding", "Every 2 months", 2, 1, "Fauzan", 1, 2],
    ["2 Meter NP", "Weave Layer", "Every 2 months", 2, 1, "Fauzan", 1, 3],
    ["2 Meter NP", "Pre / Reverse / Final 1 / Final 2", "Every 2 months", 2, 1, "Fauzan", 1, 4],
    ["Patterning", "Dilo", "Every 2 months", 2, 1, "Mustak", 1, 2],
    ["PE", "PE 1", "Every 2 months", 2, 1, "Daryl", 1, 1],
    ["PE", "PE 2", "Every 2 months", 2, 1, "Daryl", 1, 2],
    ["Hot Press Roller", "Hot Press Roller", "Every 2 months", 2, 1, "Daryl", 1, 1],
    ["Forming", "Hydraulic Forming 4", "Every 6 months", 6, 1, "Selvem", 6, 3],
    ["Forming", "Hydraulic Forming 5", "Every 6 months", 6, 1, "Selvem", 6, 4],
    ["Forming", "Hydraulic Forming 6", "Monthly", 1, 1, "Selvem", 1, 2],
    ["Forming", "Hydraulic Forming 7", "Monthly", 1, 1, "Selvem", 1, 3],
    ["WaterJet", "Waterjet 2", "Every 2 months", 2, 1, "Hazwan", 1, 1],
    ["WaterJet", "Waterjet 3", "Every 2 months", 2, 1, "Hazwan", 1, 2],
    ["WaterJet", "Waterjet 4", "Every 2 months", 2, 1, "Hazwan", 1, 3],
    ["WaterJet", "Waterjet 7", "Every 2 months", 2, 1, "Hazwan", 1, 4],
    ["Intensifier Pump", "Intensifier Pump 30HP", "Every 2 months", 2, 1, "Hazwan", 1, 1],
    ["Intensifier Pump", "Intensifier Pump 60HP", "Every 2 months", 2, 1, "Hazwan", 1, 2],
    ["Intensifier Pump", "Intensifier Pump KMT 50HP (Old)", "Every 2 months", 2, 1, "Hazwan", 1, 3],
    ["Intensifier Pump", "Intensifier Pump KMT 50HP (New jetLine)", "Monthly", 1, 1, "Hazwan", 1, 1],
    ["Intensifier Pump", "Intensifier Pump KMT 50HP (ABB7)", "Monthly", 1, 1, "Hazwan", 1, 2],
    ["Mini Forming", "Mini Hydraulic Forming 1, 2, 3 & Oven 1", "Every 2 months", 2, 1, "Ammar", 1, 2],
    ["Mini Forming", "Mini Hydraulic Forming 4, 5, 6 & Oven 2", "Every 3 months", 3, 1, "Ammar", 1, 1],
    ["Mini Forming", "Mini Hydraulic Forming 7 & Oven 4", "Every 3 months", 3, 1, "Ammar", 2, 2],
    ["Press Cut Machine", "Press Cut Double Feeder", "Every 3 months", 3, 1, "Ammar", 1, 1],
    ["Air Compressor", "Kobelco (AG55A)-75HP", "Every 3 months", 3, 1, "Selvem", 1, 1],
    ["Air Compressor", "Kobelco (SG 1490A - 75)-100HP", "Every 3 months", 3, 1, "Selvem", 1, 2],
    ["Auto Hotmelt Glue", "Auto Hotmelt Glue (2D)(1)", "Every 3 months", 3, 1, "Ammar", 1, 1],
    ["Auto Hotmelt Glue", "Auto Hotmelt Glue (2D)(2)", "Every 3 months", 3, 1, "Ammar", 1, 2],
    ["Auto Hotmelt Glue", "Auto Hotmelt Glue (Cobolt)(1)", "Every 3 months", 3, 1, "Ammar", 1, 3],
    ["Auto Hotmelt Glue", "Auto Hotmelt Glue (Cobolt)(2)", "Every 3 months", 3, 1, "Ammar", 1, 4]
  ];
  const insertPlan = db.prepare(`
    INSERT OR IGNORE INTO pm_plans (
      id, mainMachine, machineName, frequencyLabel, frequencyMonths, occurrencesPerMonth,
      technicianId, technicianName, templateId, startMonth, weekOfMonth, secondaryWeek, active, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  plans.forEach((plan, index) => {
    const [mainMachine, machineName, frequencyLabel, frequencyMonths, occurrencesPerMonth, technicianName, startMonth, weekOfMonth, secondaryWeek] = plan;
    const assignedTemplateId = machineName === "Hydraulic Forming 6" ? templateId : null;
    insertPlan.run(
      `pm-plan-${String(index + 1).padStart(2, "0")}`,
      mainMachine,
      machineName,
      frequencyLabel,
      frequencyMonths,
      occurrencesPerMonth,
      technicianIds[technicianName],
      technicianName,
      assignedTemplateId,
      startMonth,
      weekOfMonth,
      secondaryWeek ?? null,
      timestamp,
      timestamp
    );
  });

  const currentYear = new Date().getFullYear();
  generatePmSchedules(2026);
  if (currentYear !== 2026) {
    generatePmSchedules(currentYear);
  }
  generatePmSchedules(currentYear + 1);
}

function generatePmSchedules(year: number) {
  const timestamp = now();
  const plans = rows<{
    id: string;
    frequencyMonths: number;
    occurrencesPerMonth: number;
    startMonth: number;
    weekOfMonth: number;
    secondaryWeek: number | null;
  }>(db.prepare("SELECT id, frequencyMonths, occurrencesPerMonth, startMonth, weekOfMonth, secondaryWeek FROM pm_plans WHERE active = 1").all());
  const insert = db.prepare(`
    INSERT OR IGNORE INTO pm_schedules (
      id, planId, scheduledDate, year, month, weekOfMonth, status, remarks, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', '', ?, ?)
  `);

  for (const plan of plans) {
    for (let month = plan.startMonth; month <= 12; month += plan.frequencyMonths) {
      const weeks = plan.occurrencesPerMonth > 1 ? [plan.weekOfMonth, plan.secondaryWeek || 3] : [plan.weekOfMonth];
      for (const week of weeks) {
        const day = Math.min(1 + (week - 1) * 7, new Date(Date.UTC(year, month, 0)).getUTCDate());
        const scheduledDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        insert.run(`pm-schedule-${year}-${plan.id}-${month}-${week}`, plan.id, scheduledDate, year, month, week, timestamp, timestamp);
      }
    }
  }
}

export function listUsers(role?: string): User[] {
  if (role) {
    return rows<User>(db.prepare(`SELECT ${userSelectColumns} FROM users WHERE role = ? ORDER BY name`).all(role));
  }

  return rows<User>(db.prepare(`SELECT ${userSelectColumns} FROM users ORDER BY department, role, name`).all());
}

export function getUser(id: string): User {
  const user = db.prepare(`SELECT ${userSelectColumns} FROM users WHERE id = ?`).get(id);
  if (!user) {
    throw new Error("User not found");
  }

  return row<User>(user);
}

export function loginUser(username: string, password: string): User {
  const authUser = row<(User & { passwordHash: string | null; passwordSalt: string | null }) | undefined>(
    db.prepare(`SELECT ${userSelectColumns}, passwordHash, passwordSalt FROM users WHERE lower(username) = lower(?)`).get(username.trim())
  );

  if (!authUser || !authUser.passwordHash || !authUser.passwordSalt || !verifyPassword(password, authUser.passwordSalt, authUser.passwordHash)) {
    throw new Error("Invalid username or password.");
  }

  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...user } = authUser;
  return user;
}

export function updateUserAvatar(id: string, avatarUrl: string): User {
  getUser(id);
  db.prepare("UPDATE users SET avatarUrl = ? WHERE id = ?").run(avatarUrl, id);
  return getUser(id);
}

export function listMaintenanceUsers(): User[] {
  return rows<User>(
    db.prepare(`SELECT ${userSelectColumns} FROM users WHERE role IN ('technician', 'executive') ORDER BY role, name`).all()
  );
}

export function listExecutives(): User[] {
  return rows<User>(db.prepare(`SELECT ${userSelectColumns} FROM users WHERE role = 'executive' ORDER BY name`).all());
}

function normalizeSection(section: Section & { active: number | boolean }): Section {
  return { ...section, active: Boolean(section.active) };
}

type RawSection = Omit<Section, "active"> & { active: number };
type RawMachine = Omit<Machine, "active"> & { active: number };

function normalizeMachine(machine: Machine & { active: number | boolean }): Machine {
  return { ...machine, active: Boolean(machine.active) };
}

function normalizeIssueCategory(issueCategory: IssueCategory & { active: number | boolean }): IssueCategory {
  return { ...issueCategory, active: Boolean(issueCategory.active) };
}

export function listMasterData(): MasterData {
  return {
    sections: rows<Section & { active: number }>(db.prepare("SELECT * FROM sections ORDER BY active DESC, name").all()).map(normalizeSection),
    machines: rows<Machine & { active: number }>(db.prepare("SELECT * FROM machines ORDER BY active DESC, name").all()).map(normalizeMachine),
    issueCategories: rows<IssueCategory & { active: number }>(db.prepare("SELECT * FROM issue_categories ORDER BY active DESC, name").all()).map(normalizeIssueCategory)
  };
}

function getSection(id: string): Section {
  const section = db.prepare("SELECT * FROM sections WHERE id = ?").get(id);
  if (!section) {
    throw new Error("Section not found");
  }

  return normalizeSection(row<Section & { active: number }>(section));
}

function getMachine(id: string): Machine {
  const machine = db.prepare("SELECT * FROM machines WHERE id = ?").get(id);
  if (!machine) {
    throw new Error("Machine not found");
  }

  return normalizeMachine(row<Machine & { active: number }>(machine));
}

function getIssueCategory(id: string): IssueCategory {
  const issueCategory = db.prepare("SELECT * FROM issue_categories WHERE id = ?").get(id);
  if (!issueCategory) {
    throw new Error("Issue category not found");
  }

  return normalizeIssueCategory(row<IssueCategory & { active: number }>(issueCategory));
}

function getOptionalSection(id: string | null): Section | null {
  if (!id) {
    return null;
  }

  const section = db.prepare("SELECT * FROM sections WHERE id = ?").get(id);
  return section ? normalizeSection(row<Section & { active: number }>(section)) : null;
}

function getOptionalMachine(id: string | null): Machine | null {
  if (!id) {
    return null;
  }

  const machine = db.prepare("SELECT * FROM machines WHERE id = ?").get(id);
  return machine ? normalizeMachine(row<Machine & { active: number }>(machine)) : null;
}

function getOptionalIssueCategory(id: string | null): IssueCategory | null {
  if (!id) {
    return null;
  }

  const issueCategory = db.prepare("SELECT * FROM issue_categories WHERE id = ?").get(id);
  return issueCategory ? normalizeIssueCategory(row<IssueCategory & { active: number }>(issueCategory)) : null;
}

function requireAdmin(actorId: string) {
  const actor = getUser(actorId);
  if (actor.role !== "admin") {
    throw new Error("Admin access is required.");
  }

  return actor;
}

function requireSpareActor(actorId: string) {
  const actor = getUser(actorId);
  if (actor.role === "requester") {
    throw new Error("Requester accounts cannot change spare-part stock.");
  }

  return actor;
}

function requireSpareManager(actorId: string) {
  const actor = getUser(actorId);
  if (!["executive", "admin"].includes(actor.role)) {
    throw new Error("Executive or admin access is required.");
  }

  return actor;
}

function requirePmActor(actorId: string) {
  const actor = getUser(actorId);
  if (actor.role === "requester") {
    throw new Error("Requester accounts cannot access preventive maintenance.");
  }
  return actor;
}

function requirePmManager(actorId: string) {
  const actor = requirePmActor(actorId);
  if (!["executive", "admin"].includes(actor.role)) {
    throw new Error("Executive or admin access is required.");
  }
  return actor;
}

type RawPmTemplate = Omit<PmChecklistTemplate, "active" | "items"> & { active: number };
type RawPmItem = Omit<PmChecklistItem, "required"> & { required: number };
type RawPmPlan = Omit<PmPlan, "active"> & { active: number };
type RawPmSchedule = Omit<PmScheduleItem, "overdue">;

function getPmTemplate(templateId: string): PmChecklistTemplate {
  const template = row<RawPmTemplate | undefined>(db.prepare(`
    SELECT t.*, COUNT(i.id) AS itemCount
    FROM pm_checklist_templates t
    LEFT JOIN pm_checklist_items i ON i.templateId = t.id
    WHERE t.id = ?
    GROUP BY t.id
  `).get(templateId));
  if (!template) {
    throw new Error("PM checklist template not found.");
  }
  const items = rows<RawPmItem>(
    db.prepare("SELECT * FROM pm_checklist_items WHERE templateId = ? ORDER BY sortOrder").all(templateId)
  ).map((item) => ({ ...item, required: Boolean(item.required) }));
  return { ...template, active: Boolean(template.active), items };
}

export function listPmTemplates(): PmChecklistTemplate[] {
  const templates = rows<RawPmTemplate>(db.prepare(`
    SELECT t.*, COUNT(i.id) AS itemCount
    FROM pm_checklist_templates t
    LEFT JOIN pm_checklist_items i ON i.templateId = t.id
    GROUP BY t.id
    ORDER BY t.active DESC, t.machineName
  `).all());
  return templates.map((template) => ({
    ...template,
    active: Boolean(template.active),
    items: rows<RawPmItem>(
      db.prepare("SELECT * FROM pm_checklist_items WHERE templateId = ? ORDER BY sortOrder").all(template.id)
    ).map((item) => ({ ...item, required: Boolean(item.required) }))
  }));
}

export function listPmPlans(): PmPlan[] {
  return rows<RawPmPlan>(db.prepare(`
    SELECT id, mainMachine, machineName, frequencyLabel, frequencyMonths, occurrencesPerMonth,
           technicianId, technicianName, templateId, active
    FROM pm_plans
    ORDER BY mainMachine, machineName
  `).all()).map((plan) => ({ ...plan, active: Boolean(plan.active) }));
}

function pmScheduleSelect() {
  return `
    SELECT
      s.id, s.planId, s.scheduledDate, s.year, s.month, s.weekOfMonth, s.status,
      s.startedAt, s.submittedAt, s.verifiedAt, s.remarks,
      p.machineName, p.mainMachine, p.frequencyLabel, p.technicianId, p.technicianName,
      p.templateId, t.title AS templateTitle,
      COUNT(DISTINCT i.id) AS checklistItemCount,
      COUNT(DISTINCT CASE WHEN r.resultCode IS NOT NULL THEN r.itemId END) AS completedItemCount,
      COUNT(DISTINCT CASE WHEN r.resultCode = 'fail' THEN r.itemId END) AS failedItemCount
    FROM pm_schedules s
    JOIN pm_plans p ON p.id = s.planId
    LEFT JOIN pm_checklist_templates t ON t.id = p.templateId
    LEFT JOIN pm_checklist_items i ON i.templateId = p.templateId
    LEFT JOIN pm_results r ON r.scheduleId = s.id AND r.itemId = i.id
  `;
}

function normalizePmSchedule(schedule: RawPmSchedule): PmScheduleItem {
  return {
    ...schedule,
    checklistItemCount: Number(schedule.checklistItemCount || 0),
    completedItemCount: Number(schedule.completedItemCount || 0),
    failedItemCount: Number(schedule.failedItemCount || 0),
    overdue: !["submitted", "verified"].includes(schedule.status) && schedule.scheduledDate < now().slice(0, 10)
  };
}

function listPmSchedules(actorId: string, year: number): PmScheduleItem[] {
  const actor = requirePmActor(actorId);
  const technicianFilter = actor.role === "technician" ? "AND p.technicianId = ?" : "";
  const parameters = actor.role === "technician" ? [year, actor.id] : [year];
  const scheduleRows = rows<RawPmSchedule>(db.prepare(`
    ${pmScheduleSelect()}
    WHERE s.year = ? ${technicianFilter}
    GROUP BY s.id
    ORDER BY s.scheduledDate, p.mainMachine, p.machineName
  `).all(...parameters));
  return scheduleRows.map(normalizePmSchedule);
}

export function getPmDashboard(actorId: string, year = new Date().getFullYear()): PmDashboardResponse {
  const schedules = listPmSchedules(actorId, year);
  const plans = listPmPlans();
  const templates = listPmTemplates();
  const today = now().slice(0, 10);
  const currentMonth = Number(today.slice(5, 7));
  const currentYear = Number(today.slice(0, 4));
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() - day + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const weekStartText = weekStart.toISOString().slice(0, 10);
  const weekEndText = weekEnd.toISOString().slice(0, 10);
  const monthSchedules = year === currentYear ? schedules.filter((item) => item.month === currentMonth) : schedules;
  const completedThisMonth = monthSchedules.filter((item) => ["submitted", "verified"].includes(item.status)).length;
  const coveredPlans = plans.filter((plan) => plan.active && plan.templateId).length;
  const activePlans = plans.filter((plan) => plan.active).length;

  return {
    summary: {
      scheduledThisMonth: monthSchedules.length,
      dueThisWeek: schedules.filter((item) => item.scheduledDate >= weekStartText && item.scheduledDate <= weekEndText).length,
      overdue: schedules.filter((item) => item.overdue).length,
      completedThisMonth,
      compliancePercent: monthSchedules.length ? Math.round((completedThisMonth / monthSchedules.length) * 100) : 100,
      checklistCoveragePercent: activePlans ? Math.round((coveredPlans / activePlans) * 100) : 100
    },
    schedules,
    plans,
    templates
  };
}

function getPmScheduleBase(scheduleId: string): PmScheduleItem {
  const schedule = row<RawPmSchedule | undefined>(db.prepare(`
    ${pmScheduleSelect()}
    WHERE s.id = ?
    GROUP BY s.id
  `).get(scheduleId));
  if (!schedule) {
    throw new Error("PM assignment not found.");
  }
  return normalizePmSchedule(schedule);
}

function requireScheduleAccess(scheduleId: string, actorId: string) {
  const actor = requirePmActor(actorId);
  const schedule = getPmScheduleBase(scheduleId);
  if (actor.role === "technician" && schedule.technicianId !== actor.id) {
    throw new Error("This PM assignment belongs to another technician.");
  }
  return { actor, schedule };
}

export function getPmScheduleDetail(scheduleId: string, actorId: string): PmScheduleDetail {
  const { schedule } = requireScheduleAccess(scheduleId, actorId);
  const verification = row<{ verifiedByName: string | null }>(db.prepare(`
    SELECT u.name AS verifiedByName
    FROM pm_schedules s
    LEFT JOIN users u ON u.id = s.verifiedById
    WHERE s.id = ?
  `).get(scheduleId));
  const template = schedule.templateId ? getPmTemplate(schedule.templateId) : null;
  const storedResults = rows<PmChecklistResult>(db.prepare(`
    SELECT itemId, resultCode, readingValue, note, completedAt
    FROM pm_results WHERE scheduleId = ?
  `).all(scheduleId));
  const resultsByItem = new Map(storedResults.map((result) => [result.itemId, result]));
  const results = (template?.items || []).map((item) => resultsByItem.get(item.id) || ({
    itemId: item.id,
    resultCode: null,
    readingValue: "",
    note: "",
    completedAt: null
  }));
  return { ...schedule, template, results, verifiedByName: verification.verifiedByName };
}

export function startPmSchedule(scheduleId: string, actorId: string): PmScheduleDetail {
  const { schedule } = requireScheduleAccess(scheduleId, actorId);
  if (!schedule.templateId) {
    throw new Error("A checklist must be assigned before this PM can start.");
  }
  if (schedule.status === "scheduled") {
    const timestamp = now();
    db.prepare("UPDATE pm_schedules SET status = 'in_progress', startedAt = ?, updatedAt = ? WHERE id = ?")
      .run(timestamp, timestamp, scheduleId);
  }
  return getPmScheduleDetail(scheduleId, actorId);
}

export function savePmResult(scheduleId: string, input: SavePmResultInput): PmScheduleDetail {
  const { schedule } = requireScheduleAccess(scheduleId, input.actorId);
  if (["submitted", "verified"].includes(schedule.status)) {
    throw new Error("This checklist has already been submitted.");
  }
  if (!schedule.templateId) {
    throw new Error("This machine does not have a checklist yet.");
  }
  const item = row<{ id: string; dataType: string } | undefined>(
    db.prepare("SELECT id, dataType FROM pm_checklist_items WHERE id = ? AND templateId = ?").get(input.itemId, schedule.templateId)
  );
  if (!item) {
    throw new Error("Checklist item not found.");
  }
  const allowedResults = ["pass", "fail", "adjusted", "not_applicable"];
  if (input.resultCode && !allowedResults.includes(input.resultCode)) {
    throw new Error("Invalid checklist result.");
  }
  const timestamp = now();
  db.prepare(`
    INSERT INTO pm_results (
      id, scheduleId, itemId, resultCode, readingValue, note, completedAt, updatedById, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scheduleId, itemId) DO UPDATE SET
      resultCode = excluded.resultCode,
      readingValue = excluded.readingValue,
      note = excluded.note,
      completedAt = excluded.completedAt,
      updatedById = excluded.updatedById,
      updatedAt = excluded.updatedAt
  `).run(
    randomUUID(),
    scheduleId,
    input.itemId,
    input.resultCode,
    input.readingValue?.trim() || "",
    input.note?.trim() || "",
    input.resultCode ? timestamp : null,
    input.actorId,
    timestamp
  );
  db.prepare(`
    UPDATE pm_schedules
    SET status = CASE WHEN status = 'scheduled' THEN 'in_progress' ELSE status END,
        startedAt = COALESCE(startedAt, ?), updatedAt = ?
    WHERE id = ?
  `).run(timestamp, timestamp, scheduleId);
  return getPmScheduleDetail(scheduleId, input.actorId);
}

export function submitPmSchedule(scheduleId: string, input: SubmitPmScheduleInput): PmScheduleDetail {
  const { schedule } = requireScheduleAccess(scheduleId, input.actorId);
  if (!schedule.templateId) {
    throw new Error("This machine does not have a checklist yet.");
  }
  const incomplete = row<{ count: number }>(db.prepare(`
    SELECT COUNT(*) AS count
    FROM pm_checklist_items i
    LEFT JOIN pm_results r ON r.itemId = i.id AND r.scheduleId = ?
    WHERE i.templateId = ? AND i.required = 1
      AND (r.resultCode IS NULL OR (i.dataType = 'value' AND trim(COALESCE(r.readingValue, '')) = ''))
  `).get(scheduleId, schedule.templateId)).count;
  if (incomplete > 0) {
    throw new Error(`${incomplete} required checklist item${incomplete === 1 ? " is" : "s are"} incomplete.`);
  }
  const timestamp = now();
  db.prepare(`
    UPDATE pm_schedules
    SET status = 'submitted', submittedAt = ?, remarks = ?, updatedAt = ?
    WHERE id = ?
  `).run(timestamp, input.remarks?.trim() || "", timestamp, scheduleId);
  return getPmScheduleDetail(scheduleId, input.actorId);
}

export function verifyPmSchedule(scheduleId: string, actorId: string): PmScheduleDetail {
  requirePmManager(actorId);
  const schedule = getPmScheduleBase(scheduleId);
  if (schedule.status !== "submitted") {
    throw new Error("Only a submitted checklist can be verified.");
  }
  const timestamp = now();
  db.prepare(`
    UPDATE pm_schedules
    SET status = 'verified', verifiedAt = ?, verifiedById = ?, updatedAt = ?
    WHERE id = ?
  `).run(timestamp, actorId, timestamp, scheduleId);
  return getPmScheduleDetail(scheduleId, actorId);
}

export function savePmTemplate(templateId: string | null, input: SavePmTemplateInput): PmChecklistTemplate {
  requirePmManager(input.actorId);
  const machineName = input.machineName.trim();
  const title = input.title.trim();
  if (!machineName || !title) {
    throw new Error("Machine name and checklist title are required.");
  }
  if (input.items.length === 0) {
    throw new Error("Add at least one checklist item.");
  }
  const timestamp = now();
  const id = templateId || randomUUID();
  if (templateId) {
    getPmTemplate(templateId);
    db.prepare(`
      UPDATE pm_checklist_templates
      SET machineName = ?, title = ?, documentNumber = ?, revisionNumber = ?, effectiveDate = ?,
          version = version + 1, active = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      machineName,
      title,
      input.documentNumber?.trim() || "",
      input.revisionNumber?.trim() || "",
      input.effectiveDate || "",
      boolNumber(input.active ?? true),
      timestamp,
      id
    );
    db.prepare("DELETE FROM pm_checklist_items WHERE templateId = ?").run(id);
  } else {
    db.prepare(`
      INSERT INTO pm_checklist_templates (
        id, machineName, title, documentNumber, revisionNumber, effectiveDate, version, active, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      machineName,
      title,
      input.documentNumber?.trim() || "",
      input.revisionNumber?.trim() || "",
      input.effectiveDate || "",
      boolNumber(input.active ?? true),
      timestamp,
      timestamp
    );
  }
  const insertItem = db.prepare(`
    INSERT INTO pm_checklist_items (
      id, templateId, sortOrder, groupName, description, specification, inspectionMethod,
      frequency, dataType, maintenanceType, required
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  input.items.forEach((item, index) => {
    if (!item.groupName.trim() || !item.description.trim()) {
      throw new Error(`Checklist item ${index + 1} needs a group and description.`);
    }
    insertItem.run(
      item.id || randomUUID(),
      id,
      index + 1,
      item.groupName.trim(),
      item.description.trim(),
      item.specification.trim(),
      item.inspectionMethod.trim(),
      item.frequency.trim() || "As scheduled",
      item.dataType,
      item.maintenanceType,
      boolNumber(item.required ?? true)
    );
  });
  return getPmTemplate(id);
}

export function assignPmTemplate(planId: string, input: AssignPmTemplateInput): PmPlan {
  requirePmManager(input.actorId);
  if (input.templateId) {
    getPmTemplate(input.templateId);
  }
  const plan = row<RawPmPlan | undefined>(db.prepare(`
    SELECT id, mainMachine, machineName, frequencyLabel, frequencyMonths, occurrencesPerMonth,
           technicianId, technicianName, templateId, active
    FROM pm_plans WHERE id = ?
  `).get(planId));
  if (!plan) {
    throw new Error("PM plan not found.");
  }
  db.prepare("UPDATE pm_plans SET templateId = ?, updatedAt = ? WHERE id = ?").run(input.templateId, now(), planId);
  const updated = row<RawPmPlan>(db.prepare(`
    SELECT id, mainMachine, machineName, frequencyLabel, frequencyMonths, occurrencesPerMonth,
           technicianId, technicianName, templateId, active
    FROM pm_plans WHERE id = ?
  `).get(planId));
  return { ...updated, active: Boolean(updated.active) };
}

export function createSection(input: { actorId: string; name: string; active?: boolean }): Section {
  requireAdmin(input.actorId);
  const id = randomUUID();
  const timestamp = now();
  const name = input.name.trim();
  if (!name) {
    throw new Error("Section name is required.");
  }

  db.prepare("INSERT INTO sections (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)")
    .run(id, name, boolNumber(input.active ?? true), timestamp, timestamp);

  return getSection(id);
}

export function updateSection(id: string, input: { actorId: string; name: string; active?: boolean }): Section {
  requireAdmin(input.actorId);
  getSection(id);
  const name = input.name.trim();
  if (!name) {
    throw new Error("Section name is required.");
  }

  db.prepare("UPDATE sections SET name = ?, active = ?, updatedAt = ? WHERE id = ?").run(name, boolNumber(input.active ?? true), now(), id);
  return getSection(id);
}

export function createMachine(input: { actorId: string; sectionId: string; name: string; active?: boolean }): Machine {
  requireAdmin(input.actorId);
  getSection(input.sectionId);
  const id = randomUUID();
  const timestamp = now();
  const name = input.name.trim();
  if (!name) {
    throw new Error("Machine name is required.");
  }

  db.prepare("INSERT INTO machines (id, sectionId, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, input.sectionId, name, boolNumber(input.active ?? true), timestamp, timestamp);

  return getMachine(id);
}

export function updateMachine(id: string, input: { actorId: string; sectionId: string; name: string; active?: boolean }): Machine {
  requireAdmin(input.actorId);
  getMachine(id);
  getSection(input.sectionId);
  const name = input.name.trim();
  if (!name) {
    throw new Error("Machine name is required.");
  }

  db.prepare("UPDATE machines SET sectionId = ?, name = ?, active = ?, updatedAt = ? WHERE id = ?")
    .run(input.sectionId, name, boolNumber(input.active ?? true), now(), id);
  return getMachine(id);
}

export function importMachines(input: { actorId: string; rows: MachineImportRow[] }): MachineImportResult {
  requireAdmin(input.actorId);
  const errors: string[] = [];
  let importedSections = 0;
  let importedMachines = 0;
  let skippedMachines = 0;

  const getSectionByName = db.prepare("SELECT * FROM sections WHERE lower(name) = lower(?)");
  const insertSection = db.prepare("INSERT INTO sections (id, name, active, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?)");
  const getMachineBySectionName = db.prepare("SELECT * FROM machines WHERE sectionId = ? AND lower(name) = lower(?)");
  const insertMachine = db.prepare("INSERT INTO machines (id, sectionId, name, active, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)");
  const reactivateMachine = db.prepare("UPDATE machines SET active = 1, updatedAt = ? WHERE id = ?");

  for (const [index, rowInput] of input.rows.entries()) {
    const sectionName = rowInput.sectionName.trim();
    const machineName = rowInput.machineName.trim();
    if (!sectionName && !machineName) {
      continue;
    }
    if (!sectionName || !machineName) {
      errors.push(`Row ${index + 1}: section and machine are required.`);
      continue;
    }

    const timestamp = now();
    let section = row<RawSection | undefined>(getSectionByName.get(sectionName));
    if (!section) {
      const sectionId = randomUUID();
      insertSection.run(sectionId, sectionName, timestamp, timestamp);
      importedSections += 1;
      section = row<RawSection | undefined>(getSectionByName.get(sectionName));
    }
    if (!section) {
      errors.push(`Row ${index + 1}: unable to create section.`);
      continue;
    }

    const existingMachine = row<RawMachine | undefined>(getMachineBySectionName.get(section.id, machineName));
    if (existingMachine) {
      if (!existingMachine.active) {
        reactivateMachine.run(timestamp, existingMachine.id);
      }
      skippedMachines += 1;
      continue;
    }

    insertMachine.run(randomUUID(), section.id, machineName, timestamp, timestamp);
    importedMachines += 1;
  }

  return {
    importedSections,
    importedMachines,
    skippedMachines,
    errors,
    masterData: listMasterData()
  };
}

export function createIssueCategory(input: { actorId: string; name: string; active?: boolean }): IssueCategory {
  requireAdmin(input.actorId);
  const id = randomUUID();
  const timestamp = now();
  const name = input.name.trim();
  if (!name) {
    throw new Error("Issue category name is required.");
  }

  db.prepare("INSERT INTO issue_categories (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)")
    .run(id, name, boolNumber(input.active ?? true), timestamp, timestamp);

  return getIssueCategory(id);
}

export function updateIssueCategory(id: string, input: { actorId: string; name: string; active?: boolean }): IssueCategory {
  requireAdmin(input.actorId);
  getIssueCategory(id);
  const name = input.name.trim();
  if (!name) {
    throw new Error("Issue category name is required.");
  }

  db.prepare("UPDATE issue_categories SET name = ?, active = ?, updatedAt = ? WHERE id = ?")
    .run(name, boolNumber(input.active ?? true), now(), id);
  return getIssueCategory(id);
}

type RawSparePart = Omit<SparePart, "active"> & { active: number };
type RawStockMovementDetail = Omit<StockMovementDetail, "syncStatus"> & { syncStatus: StockSyncStatus };
type SheetRecord = Record<string, string>;

function getSpareSetting(key: string) {
  const setting = row<{ value: string } | undefined>(db.prepare("SELECT value FROM spare_settings WHERE key = ?").get(key));
  return setting?.value || "";
}

function setSpareSetting(key: string, value: string) {
  db.prepare(`
    INSERT INTO spare_settings (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `).run(key, value, now());
}

function spareSyncRuntimeSettings() {
  const scriptUrl = getSpareSetting("scriptUrl") || process.env.SPARE_SYNC_SCRIPT_URL || "";
  const token = getSpareSetting("token") || process.env.SPARE_SYNC_TOKEN || "";
  const masterSheetName = getSpareSetting("masterSheetName") || process.env.SPARE_MASTER_SHEET_NAME || "Masterlist";
  const supplierSheetName = getSpareSetting("supplierSheetName") || process.env.SPARE_SUPPLIER_SHEET_NAME || "Supplier";
  const movementSheetName = getSpareSetting("movementSheetName") || process.env.SPARE_MOVEMENT_SHEET_NAME || "Movement Log";

  return {
    scriptUrl,
    token,
    masterSheetName,
    supplierSheetName,
    movementSheetName,
    configured: Boolean(scriptUrl && token)
  };
}

function spareSyncConfigured() {
  return spareSyncRuntimeSettings().configured;
}

function spareSheetNames() {
  const settings = spareSyncRuntimeSettings();
  return {
    master: settings.masterSheetName,
    supplier: settings.supplierSheetName,
    movement: settings.movementSheetName
  };
}

function cleanPasteCell(value = "") {
  return value.replace(/^\ufeff/, "").replace(/^"|"$/g, "").trim();
}

function splitSheetLine(line: string) {
  return (line.includes("\t") ? line.split("\t") : line.split(",")).map(cleanPasteCell);
}

function normalizeHeaderKey(value: string) {
  return cleanPasteCell(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseSheetText(text: string): SheetRecord[] {
  const table = text
    .split(/\r?\n/)
    .map(splitSheetLine)
    .filter((cells) => cells.some((cell) => cell.trim()));

  if (table.length < 2) {
    return [];
  }

  const headers = table[0];
  return table.slice(1).map((cells) => {
    return headers.reduce<SheetRecord>((record, header, index) => {
      const normalizedHeader = normalizeHeaderKey(header || `COLUMN${index + 1}`);
      record[normalizedHeader] = cells[index] || "";
      return record;
    }, {});
  });
}

function recordsFromUnknown(value: unknown): SheetRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  if (value.length === 0) {
    return [];
  }

  if (Array.isArray(value[0])) {
    const [headerRow, ...rowsInput] = value as unknown[][];
    const headers = headerRow.map((cell, index) => normalizeHeaderKey(String(cell || `COLUMN${index + 1}`)));
    return rowsInput.map((cells) => {
      return headers.reduce<SheetRecord>((record, header, index) => {
        record[header] = String(cells[index] ?? "").trim();
        return record;
      }, {});
    });
  }

  return (value as Array<Record<string, unknown>>).map((input) => {
    return Object.entries(input).reduce<SheetRecord>((record, [key, cell]) => {
      record[normalizeHeaderKey(key)] = String(cell ?? "").trim();
      return record;
    }, {});
  });
}

function getSheetValue(record: SheetRecord, aliases: string[]) {
  for (const alias of aliases) {
    const value = record[normalizeHeaderKey(alias)];
    if (value !== undefined) {
      return value.trim();
    }
  }

  return "";
}

function parseSheetNumber(value: string) {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSparePart(part: RawSparePart): SparePart {
  return {
    ...part,
    price: Number(part.price) || 0,
    minStock: Number(part.minStock) || 0,
    maxStock: Number(part.maxStock) || 0,
    openingStock: Number(part.openingStock) || 0,
    currentStock: Number(part.currentStock) || 0,
    active: Boolean(part.active)
  };
}

function normalizeSupplier(supplier: SpareSupplier): SpareSupplier {
  return supplier;
}

function normalizeMovementDetail(movement: RawStockMovementDetail): StockMovementDetail {
  return {
    ...movement,
    quantity: Number(movement.quantity) || 0,
    beforeStock: Number(movement.beforeStock) || 0,
    afterStock: Number(movement.afterStock) || 0
  };
}

function getSparePart(itemNo: string): SparePart {
  const part = db.prepare("SELECT * FROM spare_parts WHERE itemNo = ?").get(itemNo);
  if (!part) {
    throw new Error("Spare part not found.");
  }

  return normalizeSparePart(row<RawSparePart>(part));
}

function getMovementDetail(id: string): StockMovementDetail {
  const movement = db.prepare(`
    SELECT
      sm.*,
      COALESCE(sp.searchName, sp.description, sm.itemNo) as itemSearchName,
      COALESCE(sp.category, '') as itemCategory,
      COALESCE(u.name, sm.actorId) as actorName,
      wo.number as workOrderNumber
    FROM stock_movements sm
    LEFT JOIN spare_parts sp ON sp.itemNo = sm.itemNo
    LEFT JOIN users u ON u.id = sm.actorId
    LEFT JOIN work_orders wo ON wo.id = sm.workOrderId
    WHERE sm.id = ?
  `).get(id);
  if (!movement) {
    throw new Error("Stock movement not found.");
  }

  return normalizeMovementDetail(row<RawStockMovementDetail>(movement));
}

function listMovementDetails(whereClause = "", params: Array<string | number | null> = [], limit = 20): StockMovementDetail[] {
  return rows<RawStockMovementDetail>(
    db.prepare(`
      SELECT
        sm.*,
        COALESCE(sp.searchName, sp.description, sm.itemNo) as itemSearchName,
        COALESCE(sp.category, '') as itemCategory,
        COALESCE(u.name, sm.actorId) as actorName,
        wo.number as workOrderNumber
      FROM stock_movements sm
      LEFT JOIN spare_parts sp ON sp.itemNo = sm.itemNo
      LEFT JOIN users u ON u.id = sm.actorId
      LEFT JOIN work_orders wo ON wo.id = sm.workOrderId
      ${whereClause}
      ORDER BY sm.createdAt DESC
      LIMIT ?
    `).all(...params, limit)
  ).map(normalizeMovementDetail);
}

function inventorySummary(): SpareInventoryResponse["summary"] {
  const summary = row<{
    totalParts: number;
    lowStock: number;
    outOfStock: number;
    totalValue: number;
  }>(db.prepare(`
    SELECT
      COUNT(*) as totalParts,
      SUM(CASE WHEN minStock > 0 AND currentStock <= minStock THEN 1 ELSE 0 END) as lowStock,
      SUM(CASE WHEN currentStock <= 0 THEN 1 ELSE 0 END) as outOfStock,
      SUM(currentStock * price) as totalValue
    FROM spare_parts
  `).get());
  const unsyncedMovements = row<{ count: number }>(
    db.prepare("SELECT COUNT(*) as count FROM stock_movements WHERE syncStatus IN ('pending', 'failed')").get()
  ).count;

  return {
    totalParts: summary.totalParts || 0,
    lowStock: summary.lowStock || 0,
    outOfStock: summary.outOfStock || 0,
    totalValue: summary.totalValue || 0,
    unsyncedMovements: unsyncedMovements || 0
  };
}

export function listSpareInventory(): SpareInventoryResponse {
  const parts = rows<RawSparePart>(
    db.prepare("SELECT * FROM spare_parts ORDER BY category, searchName, itemNo").all()
  ).map(normalizeSparePart);
  const suppliers = rows<SpareSupplier>(
    db.prepare("SELECT * FROM spare_suppliers ORDER BY supplier, category, description").all()
  ).map(normalizeSupplier);

  return {
    parts,
    suppliers,
    recentMovements: listMovementDetails("", [], 12),
    summary: inventorySummary(),
    syncConfigured: spareSyncConfigured()
  };
}

export function getSpareSyncSettings(): SpareSyncSettings {
  const settings = spareSyncRuntimeSettings();
  return {
    scriptUrl: settings.scriptUrl,
    hasToken: Boolean(settings.token),
    masterSheetName: settings.masterSheetName,
    supplierSheetName: settings.supplierSheetName,
    movementSheetName: settings.movementSheetName,
    configured: settings.configured
  };
}

export function updateSpareSyncSettings(input: UpdateSpareSyncSettingsInput): SpareSyncSettings {
  requireSpareManager(input.actorId);
  setSpareSetting("scriptUrl", input.scriptUrl.trim());
  if (input.token !== undefined && input.token.trim()) {
    setSpareSetting("token", input.token.trim());
  }
  setSpareSetting("masterSheetName", input.masterSheetName.trim() || "Masterlist");
  setSpareSetting("supplierSheetName", input.supplierSheetName.trim() || "Supplier");
  setSpareSetting("movementSheetName", input.movementSheetName.trim() || "Movement Log");
  return getSpareSyncSettings();
}

export function getSparePartDetail(itemNo: string): SparePartDetail {
  const part = getSparePart(itemNo);
  const allSuppliers = rows<SpareSupplier>(
    db.prepare("SELECT * FROM spare_suppliers ORDER BY supplier, description").all()
  ).map(normalizeSupplier);
  const supplierNames = new Set(
    [part.supplier, part.supplier1, part.supplier2, part.supplier3]
      .map((value) => value.toLowerCase().trim())
      .filter(Boolean)
  );
  const suppliers = allSuppliers.filter((supplier) => {
    const supplierName = supplier.supplier.toLowerCase().trim();
    return supplierNames.has(supplierName) || (!!part.category && supplier.category.toLowerCase() === part.category.toLowerCase());
  });

  return {
    ...part,
    suppliers,
    movements: listMovementDetails("WHERE sm.itemNo = ?", [part.itemNo], 80)
  };
}

function importSpareRows(actorId: string, masterRows: SheetRecord[], supplierRows: SheetRecord[]): SpareImportResult {
  requireSpareManager(actorId);
  const errors: string[] = [];
  let importedParts = 0;
  let updatedParts = 0;
  let skippedRows = 0;
  let importedSuppliers = 0;
  const seenItemNos = new Map<string, number>();
  const timestamp = now();
  const findPart = db.prepare("SELECT itemNo, currentStock FROM spare_parts WHERE itemNo = ?");
  const upsertPart = db.prepare(`
    INSERT INTO spare_parts (
      itemNo, no, category, description, uom, price, partRank, status, stockRank,
      minStock, maxStock, searchName, openingStock, currentStock, source,
      supplier, supplier1, supplier2, supplier3, leadTime, active, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(itemNo) DO UPDATE SET
      no = excluded.no,
      category = excluded.category,
      description = excluded.description,
      uom = excluded.uom,
      price = excluded.price,
      partRank = excluded.partRank,
      status = excluded.status,
      stockRank = excluded.stockRank,
      minStock = excluded.minStock,
      maxStock = excluded.maxStock,
      searchName = excluded.searchName,
      openingStock = excluded.openingStock,
      source = excluded.source,
      supplier = excluded.supplier,
      supplier1 = excluded.supplier1,
      supplier2 = excluded.supplier2,
      supplier3 = excluded.supplier3,
      leadTime = excluded.leadTime,
      active = excluded.active,
      updatedAt = excluded.updatedAt
  `);

  for (const [index, record] of masterRows.entries()) {
    const itemNo = getSheetValue(record, ["ITEM NO.", "ITEM NO", "ITEMNO", "PART NO", "PART NO."]);
    if (!itemNo) {
      skippedRows += 1;
      if (Object.values(record).some(Boolean)) {
        errors.push(`Master row ${index + 2}: ITEM NO. is required.`);
      }
      continue;
    }

    const normalizedItemNo = itemNo.toLowerCase();
    const firstSeenRow = seenItemNos.get(normalizedItemNo);
    if (firstSeenRow) {
      errors.push(`Master row ${index + 2}: duplicate ITEM NO. ${itemNo}; it updates row ${firstSeenRow}.`);
    } else {
      seenItemNos.set(normalizedItemNo, index + 2);
    }

    const existing = row<{ itemNo: string; currentStock: number } | undefined>(findPart.get(itemNo));
    const openingStock = parseSheetNumber(getSheetValue(record, ["OPENING", "OPENING STOCK"]));
    const currentStockValue = getSheetValue(record, ["CURRENT STOCK", "CURRENTSTOCK", "STOCK"]);
    const importedCurrentStock = currentStockValue ? parseSheetNumber(currentStockValue) : openingStock;
    const status = getSheetValue(record, ["STATUS"]);
    const itemName = getSheetValue(record, ["ITEM NAME", "ITEMNAME", "DESCRIPTION", "ITEM DESCRIPTION", "COLUMN 3", "COLUMN3"]);
    const searchName = getSheetValue(record, ["SEARCH NAME", "SEARCHNAME"]) || itemName;
    const description = itemName || searchName || itemNo;
    const active = !["inactive", "non active", "non-active", "obsolete", "discontinued"].includes(status.toLowerCase());

    upsertPart.run(
      itemNo,
      getSheetValue(record, ["NO", "NO."]),
      getSheetValue(record, ["CATEGORY"]),
      description,
      getSheetValue(record, ["OUM", "UOM", "UNIT"]),
      parseSheetNumber(getSheetValue(record, ["PRICE(RM)", "PRICE RM", "PRICE"])),
      getSheetValue(record, ["PART RANK", "PARTRANK"]),
      status,
      getSheetValue(record, ["STOCK RANK", "STOCKRANK"]),
      parseSheetNumber(getSheetValue(record, ["MIN", "MINIMUM"])),
      parseSheetNumber(getSheetValue(record, ["MAX", "MAXIMUM"])),
      searchName || description,
      openingStock,
      existing ? Number(existing.currentStock) || 0 : importedCurrentStock,
      getSheetValue(record, ["SOURCE"]),
      getSheetValue(record, ["SUPPLIER"]),
      getSheetValue(record, ["SUPPLIER 1", "SUPPLIER1"]),
      getSheetValue(record, ["SUPPLIER 2", "SUPPLIER2"]),
      getSheetValue(record, ["SUPPLIER 3", "SUPPLIER3"]),
      getSheetValue(record, ["LEAD TIME", "LEADTIME"]),
      boolNumber(active),
      timestamp,
      timestamp
    );

    if (existing) {
      updatedParts += 1;
    } else {
      importedParts += 1;
    }
  }

  if (supplierRows.length > 0) {
    db.prepare("DELETE FROM spare_suppliers").run();
    const insertSupplier = db.prepare(`
      INSERT INTO spare_suppliers (
        id, no, category, description, supplier, address, pic, contactNo,
        faxNo, autoDial, email, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [index, record] of supplierRows.entries()) {
      const supplier = getSheetValue(record, ["SUPPLIER"]);
      const description = getSheetValue(record, ["DESCRIPTION"]);
      if (!supplier && !description) {
        skippedRows += 1;
        continue;
      }

      insertSupplier.run(
        randomUUID(),
        getSheetValue(record, ["NO", "NO."]),
        getSheetValue(record, ["CATEGORY"]),
        description,
        supplier,
        getSheetValue(record, ["ADDRESS"]),
        getSheetValue(record, ["P.I.C", "PIC", "PERSON IN CHARGE"]),
        getSheetValue(record, ["CONTACT NO.", "CONTACT NO", "CONTACT"]),
        getSheetValue(record, ["FAKS NO.", "FAX NO.", "FAKS NO", "FAX NO"]),
        getSheetValue(record, ["AUTO DIAL", "AUTODIAL"]),
        getSheetValue(record, ["EMAIL"]),
        timestamp,
        timestamp
      );
      importedSuppliers += 1;

      if (index > 2000) {
        errors.push("Supplier import stopped after 2000 rows.");
        break;
      }
    }
  }

  return {
    importedParts,
    updatedParts,
    skippedRows,
    importedSuppliers,
    errors,
    inventory: listSpareInventory()
  };
}

export function importSpareParts(input: SpareImportInput): SpareImportResult {
  return importSpareRows(input.actorId, parseSheetText(input.masterText), input.supplierText ? parseSheetText(input.supplierText) : []);
}

export function lookupSpareQr(value: string): SpareQrLookupResult {
  const query = normalizeSpareQrValue(value);
  if (!query) {
    throw new Error("QR value is required.");
  }

  const exactPart = row<RawSparePart | undefined>(
    db.prepare("SELECT * FROM spare_parts WHERE lower(itemNo) = lower(?)").get(query)
  );
  if (exactPart) {
    return { query, exact: true, matches: [normalizeSparePart(exactPart)] };
  }

  const like = `%${query.replace(/[%_]/g, "")}%`;
  const matches = rows<RawSparePart>(
    db.prepare(`
      SELECT * FROM spare_parts
      WHERE lower(searchName) = lower(?)
        OR lower(description) = lower(?)
        OR itemNo LIKE ?
        OR searchName LIKE ?
        OR description LIKE ?
        OR supplier LIKE ?
        OR supplier1 LIKE ?
        OR supplier2 LIKE ?
        OR supplier3 LIKE ?
      ORDER BY
        CASE WHEN lower(searchName) = lower(?) OR lower(description) = lower(?) THEN 0 ELSE 1 END,
        category,
        searchName
      LIMIT 25
    `).all(query, query, like, like, like, like, like, like, like, query, query)
  ).map(normalizeSparePart);

  return { query, exact: false, matches };
}

function normalizeSpareQrValue(value: string) {
  const query = value.trim();
  if (!query) {
    return query;
  }

  try {
    const url = new URL(query, "https://cmms.local");
    const segments = url.pathname.split("/").filter(Boolean);
    const spareIndex = segments.indexOf("spare-parts");
    if (spareIndex === -1) {
      return query;
    }

    if (segments[spareIndex + 1] === "issue" && segments[spareIndex + 2]) {
      return decodeURIComponent(segments[spareIndex + 2]);
    }

    const maybeItemNo = segments[spareIndex + 1];
    if (maybeItemNo && !["scanner", "inventory", "setup"].includes(maybeItemNo)) {
      return decodeURIComponent(maybeItemNo);
    }
  } catch {
    return query;
  }

  return query;
}

function movementAfterStock(type: StockMovementType, beforeStock: number, quantity: number) {
  if (type === "issue" || type === "write_off") {
    return beforeStock - quantity;
  }

  return beforeStock + quantity;
}

function createStockMovement(input: {
  itemNo: string;
  workOrderId: string | null;
  actorId: string;
  type: StockMovementType;
  quantity: number;
  note: string;
  source: string;
}): StockMovementDetail {
  const timestamp = now();
  const movementId = randomUUID();
  const syncStatus: StockSyncStatus = spareSyncConfigured() ? "pending" : "disabled";
  let createdMovementId = "";

  db.exec("BEGIN IMMEDIATE");
  try {
    const rawPart = row<RawSparePart | undefined>(
      db.prepare("SELECT * FROM spare_parts WHERE itemNo = ?").get(input.itemNo)
    );
    if (!rawPart) {
      throw new Error("Spare part not found.");
    }
    const part = normalizeSparePart(rawPart);

    const afterStock = movementAfterStock(input.type, part.currentStock, input.quantity);
    if (afterStock < 0) {
      throw new Error(`Insufficient stock for ${part.itemNo}. Current stock is ${part.currentStock}.`);
    }

    db.prepare("UPDATE spare_parts SET currentStock = ?, updatedAt = ? WHERE itemNo = ?")
      .run(afterStock, timestamp, part.itemNo);
    db.prepare(`
      INSERT INTO stock_movements (
        id, itemNo, workOrderId, actorId, type, quantity, beforeStock, afterStock,
        note, source, syncStatus, syncError, syncedAt, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      movementId,
      part.itemNo,
      input.workOrderId,
      input.actorId,
      input.type,
      input.quantity,
      part.currentStock,
      afterStock,
      input.note,
      input.source,
      syncStatus,
      null,
      null,
      timestamp
    );
    createdMovementId = movementId;
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getMovementDetail(createdMovementId);
}

async function callSpareScript<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const settings = spareSyncRuntimeSettings();
  if (!settings.scriptUrl || !settings.token) {
    throw new Error("Apps Script sync is not configured.");
  }

  const response = await fetch(settings.scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      token: settings.token,
      sheetNames: spareSheetNames(),
      ...payload
    })
  });
  const body = await response.json().catch(() => null) as (T & { ok?: boolean; error?: string }) | null;
  if (!response.ok || !body || body.ok === false) {
    throw new Error(body?.error || `Apps Script ${action} failed with ${response.status}.`);
  }

  return body;
}

function recordSyncAttempt(action: string, status: "success" | "failed" | "disabled", message: string) {
  db.prepare("INSERT INTO spare_sync_attempts (id, action, status, message, createdAt) VALUES (?, ?, ?, ?, ?)")
    .run(randomUUID(), action, status, message, now());
}

async function trySyncMovement(movementId: string) {
  if (!spareSyncConfigured()) {
    db.prepare("UPDATE stock_movements SET syncStatus = 'disabled', syncError = NULL WHERE id = ?").run(movementId);
    return false;
  }

  const movement = getMovementDetail(movementId);
  try {
    await callSpareScript("pushMovement", { movement });
    db.prepare("UPDATE stock_movements SET syncStatus = 'synced', syncError = NULL, syncedAt = ? WHERE id = ?")
      .run(now(), movementId);
    recordSyncAttempt("pushMovement", "success", `Synced movement ${movementId}.`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync movement.";
    db.prepare("UPDATE stock_movements SET syncStatus = 'failed', syncError = ? WHERE id = ?").run(message, movementId);
    recordSyncAttempt("pushMovement", "failed", message);
    return false;
  }
}

export async function issueSparePart(itemNo: string, input: SpareIssueInput): Promise<StockMovementDetail> {
  const actor = requireSpareActor(input.actorId);
  if (!["technician", "executive", "admin"].includes(actor.role)) {
    throw new Error("Only maintenance users can issue spare parts.");
  }
  const workOrder = getWorkOrder(input.workOrderId);
  if (["resolved", "closed", "cancelled"].includes(workOrder.status)) {
    throw new Error("Spare parts can only be issued to an active work order.");
  }
  if (!(input.quantity > 0)) {
    throw new Error("Quantity must be greater than zero.");
  }

  const movement = createStockMovement({
    itemNo,
    workOrderId: workOrder.id,
    actorId: actor.id,
    type: "issue",
    quantity: input.quantity,
    note: input.note?.trim() || `Issued to ${workOrder.number}.`,
    source: "qr_issue"
  });
  addActivity(workOrder.id, actor.id, "commented", null, `Issued spare ${movement.itemNo} x ${movement.quantity}.`);
  await trySyncMovement(movement.id);
  return getMovementDetail(movement.id);
}

export async function adjustSparePart(itemNo: string, input: SpareAdjustmentInput): Promise<StockMovementDetail> {
  const actor = requireSpareManager(input.actorId);
  const allowedTypes: Array<Exclude<StockMovementType, "issue">> = ["restock", "correction", "return", "write_off"];
  if (!allowedTypes.includes(input.type)) {
    throw new Error("Invalid adjustment type.");
  }
  if (!input.note.trim()) {
    throw new Error("Adjustment note is required.");
  }
  if (input.type !== "correction" && !(input.quantity > 0)) {
    throw new Error("Quantity must be greater than zero.");
  }
  if (input.type === "correction" && input.quantity === 0) {
    throw new Error("Correction quantity cannot be zero.");
  }

  const movement = createStockMovement({
    itemNo,
    workOrderId: null,
    actorId: actor.id,
    type: input.type,
    quantity: input.quantity,
    note: input.note.trim(),
    source: "manual_adjustment"
  });
  await trySyncMovement(movement.id);
  return getMovementDetail(movement.id);
}

export function listSparePartMovements(itemNo: string): StockMovementDetail[] {
  getSparePart(itemNo);
  return listMovementDetails("WHERE sm.itemNo = ?", [itemNo], 200);
}

export async function pullSparePartsFromSheet(actorId: string): Promise<SpareSyncResult> {
  requireSpareManager(actorId);
  if (!spareSyncConfigured()) {
    recordSyncAttempt("pullMasterData", "disabled", "Apps Script sync is not configured.");
    return {
      configured: false,
      ok: false,
      message: "Apps Script sync is not configured.",
      errors: ["Set SPARE_SYNC_SCRIPT_URL and SPARE_SYNC_TOKEN to enable live sync."]
    };
  }

  try {
    const result = await callSpareScript<{
      masterRows?: unknown;
      masterlist?: unknown;
      parts?: unknown;
      supplierRows?: unknown;
      suppliers?: unknown;
    }>("pullMasterData");
    const importResult = importSpareRows(
      actorId,
      recordsFromUnknown(result.masterRows ?? result.masterlist ?? result.parts),
      recordsFromUnknown(result.supplierRows ?? result.suppliers)
    );
    recordSyncAttempt("pullMasterData", "success", "Pulled spare master data from Apps Script.");
    return {
      configured: true,
      ok: true,
      message: "Spare master data synced from Google Sheet.",
      importedParts: importResult.importedParts,
      updatedParts: importResult.updatedParts,
      importedSuppliers: importResult.importedSuppliers,
      errors: importResult.errors,
      inventory: importResult.inventory
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to pull spare master data.";
    recordSyncAttempt("pullMasterData", "failed", message);
    return {
      configured: true,
      ok: false,
      message,
      errors: [message]
    };
  }
}

export async function retrySpareSync(actorId: string): Promise<SpareSyncResult> {
  requireSpareManager(actorId);
  if (!spareSyncConfigured()) {
    return {
      configured: false,
      ok: false,
      message: "Apps Script sync is not configured.",
      retriedMovements: 0,
      failedMovements: 0,
      errors: ["Set SPARE_SYNC_SCRIPT_URL and SPARE_SYNC_TOKEN to enable retry."]
    };
  }

  const movementIds = rows<{ id: string }>(
    db.prepare("SELECT id FROM stock_movements WHERE syncStatus IN ('pending', 'failed') ORDER BY createdAt ASC").all()
  ).map((movement) => movement.id);
  let retriedMovements = 0;
  let failedMovements = 0;

  for (const movementId of movementIds) {
    const ok = await trySyncMovement(movementId);
    if (ok) {
      retriedMovements += 1;
    } else {
      failedMovements += 1;
    }
  }

  return {
    configured: true,
    ok: failedMovements === 0,
    message: `${retriedMovements} movement sync retries succeeded, ${failedMovements} failed.`,
    retriedMovements,
    failedMovements,
    errors: [],
    inventory: listSpareInventory()
  };
}

export function listWorkOrders(): WorkOrder[] {
  return rows<WorkOrder>(db.prepare("SELECT * FROM work_orders ORDER BY updatedAt DESC").all());
}

export function getWorkOrder(id: string): WorkOrder {
  const workOrder = db.prepare("SELECT * FROM work_orders WHERE id = ?").get(id);
  if (!workOrder) {
    throw new Error("Work order not found");
  }

  return row<WorkOrder>(workOrder);
}

export function getWorkOrderDetail(id: string): WorkOrderDetail {
  const workOrder = getWorkOrder(id);
  const requester = getUser(workOrder.requesterId);
  const assignedTo = workOrder.assignedToId ? getUser(workOrder.assignedToId) : null;
  const section = getOptionalSection(workOrder.sectionId);
  const machine = getOptionalMachine(workOrder.machineId);
  const issueCategory = getOptionalIssueCategory(workOrder.issueCategoryId);
  const activities = rows<WorkOrderActivity>(
    db.prepare("SELECT * FROM work_order_activities WHERE workOrderId = ? ORDER BY createdAt DESC").all(id)
  );
  const attachments = rows<WorkOrderAttachment>(
    db.prepare("SELECT * FROM work_order_attachments WHERE workOrderId = ? ORDER BY createdAt DESC").all(id)
  );

  return { ...workOrder, requester, assignedTo, section, machine, issueCategory, activities, attachments };
}

export function createWorkOrder(input: CreateWorkOrderInput): WorkOrder {
  const id = randomUUID();
  const createdAt = now();
  const number = nextWorkOrderNumber();
  const requester = getUser(input.requesterId);
  const section = input.sectionId ? getSection(input.sectionId) : null;
  const machine = input.machineId ? getMachine(input.machineId) : null;
  const issueCategory = input.issueCategoryId ? getIssueCategory(input.issueCategoryId) : null;
  const machineName = input.machineName?.trim() || machine?.name || input.assetName?.trim() || "Others";
  const sectionName = section?.name || input.location?.trim() || "Unassigned";
  const issueDescription = input.issueDescription?.trim() || input.description?.trim() || input.title?.trim() || "No issue description provided.";
  const title = input.title?.trim() || `${machineName} - ${issueCategory?.name || "Issue"}`;
  const description = input.description?.trim() || issueDescription;
  const workDate = input.workDate || createdAt.slice(0, 10);
  const shiftGroup = input.shiftGroup || "A";
  const reportedByName = input.reportedByName?.trim() || requester.name;
  const reportedByDepartment = input.reportedByDepartment?.trim() || requester.department;

  db.prepare(`
    INSERT INTO work_orders (
      id, number, type, title, description, assetName, location, priority, status,
      requesterId, assignedToId, dueDate, completionNote, workDate, shiftGroup, sectionId,
      machineId, machineName, reportedByName, reportedByDepartment, issueCategoryId,
      issueDescription, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    number,
    input.type,
    title,
    description,
    machineName,
    sectionName,
    input.priority || "medium",
    "open",
    input.requesterId,
    null,
    input.dueDate || null,
    null,
    workDate,
    shiftGroup,
    section?.id || null,
    machine?.id || null,
    machineName,
    reportedByName,
    reportedByDepartment,
    issueCategory?.id || null,
    issueDescription,
    createdAt,
    createdAt
  );

  addActivity(id, input.requesterId, "created", "open", "Work order issued.");
  notifyUsers(
    listMaintenanceUsers().map((user) => user.id),
    id,
    `New work order ${number}`,
    `${title} at ${sectionName}`
  );

  return getWorkOrder(id);
}

function nextWorkOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const count = row<{ count: number }>(
    db.prepare("SELECT COUNT(*) as count FROM work_orders WHERE number LIKE ?").get(`${prefix}%`)
  ).count;

  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export function updateWorkOrderStatus(id: string, input: UpdateWorkOrderStatusInput): WorkOrder {
  const current = getWorkOrder(id);
  const updatedAt = now();
  const assignedToId = input.assignedToId === undefined ? current.assignedToId : input.assignedToId;
  const trimmedNote = input.note.trim();

  if (input.status === "resolved") {
    if (!trimmedNote) {
      throw new Error("Repair or replacement summary is required before resolving.");
    }

    const afterAttachmentCount = row<{ count: number }>(
      db.prepare("SELECT COUNT(*) as count FROM work_order_attachments WHERE workOrderId = ? AND kind = 'after'").get(id)
    ).count;

    if (afterAttachmentCount === 0) {
      throw new Error("At least one completion photo is required before resolving.");
    }
  }

  const completionNote = input.status === "resolved" ? trimmedNote : current.completionNote;

  db.prepare(`
    UPDATE work_orders
    SET status = ?, assignedToId = ?, completionNote = ?, updatedAt = ?
    WHERE id = ?
  `).run(input.status, assignedToId, completionNote, updatedAt, id);

  const action = statusToAction(input.status);
  addActivity(id, input.actorId, action, input.status, trimmedNote || `Status changed to ${input.status}.`);
  notifyForStatusChange(getWorkOrder(id), input.status);

  return getWorkOrder(id);
}

export function claimWorkOrder(id: string, actorId: string, note?: string): WorkOrder {
  const actor = getUser(actorId);
  if (actor.role !== "technician") {
    throw new Error("Only technicians can accept work orders.");
  }

  const current = getWorkOrder(id);
  if (current.status !== "open") {
    if (current.status === "acknowledged" && current.assignedToId === actorId) {
      return current;
    }

    throw new Error(`${current.number} is no longer available to accept.`);
  }

  if (current.assignedToId && current.assignedToId !== actorId) {
    const assignedUser = getUser(current.assignedToId);
    throw new Error(`${current.number} was already assigned to ${assignedUser.name}.`);
  }

  const updatedAt = now();
  db.prepare("UPDATE work_orders SET status = ?, assignedToId = ?, updatedAt = ? WHERE id = ?").run("acknowledged", actorId, updatedAt, id);
  addActivity(id, actorId, "acknowledged", "acknowledged", note?.trim() || `Accepted by ${actor.name}.`);

  const workOrder = getWorkOrder(id);
  notifyUsers([workOrder.requesterId], id, `${workOrder.number} accepted`, `${actor.name} accepted ${workOrder.title}.`);

  return workOrder;
}

export function assignWorkOrder(id: string, assignedToId: string, actorId: string, note?: string): WorkOrder {
  const updatedAt = now();
  db.prepare("UPDATE work_orders SET assignedToId = ?, updatedAt = ? WHERE id = ?").run(assignedToId, updatedAt, id);
  const assignedUser = getUser(assignedToId);
  addActivity(id, actorId, "assigned", null, note?.trim() || `Assigned to ${assignedUser.name}.`);

  const workOrder = getWorkOrder(id);
  notifyUsers([assignedToId, workOrder.requesterId], id, `${workOrder.number} assigned`, `${assignedUser.name} is assigned.`);

  return workOrder;
}

export function addComment(workOrderId: string, actorId: string, message: string): WorkOrderActivity {
  return addActivity(workOrderId, actorId, "commented", null, message.trim());
}

export function addAttachment(input: {
  workOrderId: string;
  uploadedBy: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  kind: WorkOrderAttachment["kind"];
}): WorkOrderAttachment {
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`
    INSERT INTO work_order_attachments (
      id, workOrderId, uploadedBy, filename, originalName, mimeType, size, url, kind, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.workOrderId,
    input.uploadedBy,
    input.filename,
    input.originalName,
    input.mimeType,
    input.size,
    input.url,
    input.kind,
    createdAt
  );

  addActivity(input.workOrderId, input.uploadedBy, "attachment_added", null, `Uploaded ${input.originalName}.`);

  return row<WorkOrderAttachment>(
    db.prepare("SELECT * FROM work_order_attachments WHERE id = ?").get(id)
  );
}

export function listRequesterWorkOrders(): PublicRequesterWorkOrder[] {
  return rows<PublicRequesterWorkOrder>(
    db.prepare(`
      SELECT
        wo.id,
        wo.number,
        wo.type,
        wo.status,
        wo.workDate,
        wo.shiftGroup,
        COALESCE(s.name, wo.location) as sectionName,
        wo.machineName,
        COALESCE(ic.name, 'Other') as issueCategoryName,
        wo.issueDescription,
        wo.reportedByName,
        wo.reportedByDepartment,
        wo.createdAt,
        wo.updatedAt
      FROM work_orders wo
      JOIN users requester ON requester.id = wo.requesterId
      LEFT JOIN sections s ON s.id = wo.sectionId
      LEFT JOIN issue_categories ic ON ic.id = wo.issueCategoryId
      WHERE requester.role = 'requester'
      ORDER BY wo.updatedAt DESC
    `).all()
  );
}

export function publicRequesterIdForUploads() {
  return publicRequesterId;
}

export function deleteWorkOrder(id: string, actorId: string) {
  requireAdmin(actorId);
  const workOrder = getWorkOrder(id);
  db.prepare("DELETE FROM work_orders WHERE id = ?").run(id);

  const workOrderUploadsRoot = path.resolve(uploadsRoot, "work-orders");
  const targetDir = path.resolve(workOrderUploadsRoot, id);
  const uploadsRootPrefix = workOrderUploadsRoot.endsWith(path.sep) ? workOrderUploadsRoot : `${workOrderUploadsRoot}${path.sep}`;
  if (targetDir.startsWith(uploadsRootPrefix) && existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  return workOrder;
}

export function listNotifications(userId: string): NotificationRecord[] {
  return rows<NotificationRecord>(
    db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50").all(userId)
  );
}

export function markNotificationRead(id: string) {
  db.prepare("UPDATE notifications SET readAt = ? WHERE id = ? AND readAt IS NULL").run(now(), id);
}

export function markAllNotificationsRead(userId: string) {
  db.prepare("UPDATE notifications SET readAt = ? WHERE userId = ? AND readAt IS NULL").run(now(), userId);
}

export function dashboardSummary(): DashboardSummary {
  const today = new Date().toISOString().slice(0, 10);
  const summary = row<DashboardSummary>(
    db.prepare(`
      SELECT
        SUM(CASE WHEN status NOT IN ('closed', 'cancelled') THEN 1 ELSE 0 END) as totalOpen,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as newWorkOrders,
        SUM(CASE WHEN status IN ('acknowledged', 'in_progress', 'returned') THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN status = 'pending_material' THEN 1 ELSE 0 END) as pendingMaterial,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolvedWaitingVerification,
        SUM(CASE WHEN status = 'closed' AND substr(updatedAt, 1, 10) = ? THEN 1 ELSE 0 END) as closedToday
      FROM work_orders
    `).get(today)
  );

  return {
    totalOpen: summary.totalOpen || 0,
    newWorkOrders: summary.newWorkOrders || 0,
    inProgress: summary.inProgress || 0,
    pendingMaterial: summary.pendingMaterial || 0,
    resolvedWaitingVerification: summary.resolvedWaitingVerification || 0,
    closedToday: summary.closedToday || 0
  };
}

function addActivity(
  workOrderId: string,
  actorId: string,
  action: ActivityAction,
  status: WorkOrderStatus | null,
  message: string
): WorkOrderActivity {
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`
    INSERT INTO work_order_activities (id, workOrderId, actorId, action, status, message, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, workOrderId, actorId, action, status, message, createdAt);

  return row<WorkOrderActivity>(
    db.prepare("SELECT * FROM work_order_activities WHERE id = ?").get(id)
  );
}

function notifyUsers(userIds: string[], workOrderId: string, title: string, body: string) {
  const uniqueUserIds = [...new Set(userIds)];
  const insert = db.prepare(`
    INSERT INTO notifications (id, userId, workOrderId, title, body, readAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const userId of uniqueUserIds) {
    insert.run(randomUUID(), userId, workOrderId, title, body, null, now());
  }
}

function notifyForStatusChange(workOrder: WorkOrder, status: WorkOrderStatus) {
  if (["acknowledged", "in_progress", "pending_material", "resolved"].includes(status)) {
    notifyUsers(
      [workOrder.requesterId],
      workOrder.id,
      `${workOrder.number} ${status.replace("_", " ")}`,
      `${workOrder.title} is now ${status.replace("_", " ")}.`
    );
    return;
  }

  if (["closed", "returned", "cancelled"].includes(status)) {
    const maintenanceIds = [
      ...listExecutives().map((user) => user.id),
      ...(workOrder.assignedToId ? [workOrder.assignedToId] : listMaintenanceUsers().map((user) => user.id))
    ];
    notifyUsers(
      maintenanceIds,
      workOrder.id,
      `${workOrder.number} ${status.replace("_", " ")}`,
      `${workOrder.title} was ${status.replace("_", " ")} by the requester or system.`
    );
  }
}

function statusToAction(status: WorkOrderStatus): ActivityAction {
  const map: Record<WorkOrderStatus, ActivityAction> = {
    open: "created",
    acknowledged: "acknowledged",
    in_progress: "started",
    pending_material: "pending_material",
    resolved: "resolved",
    closed: "closed",
    returned: "returned",
    cancelled: "cancelled"
  };

  return map[status];
}

function normalizeWorkOrderType(value: unknown): WorkOrderType {
  const type = String(value || "").toLowerCase();
  if (type === "maintenance" || type === "standard_maintenance") {
    return "standard_maintenance";
  }
  if (type === "kaizen") {
    return "kaizen";
  }

  throw new Error("Work order type must be maintenance or kaizen.");
}

export function validateCreateWorkOrderInput(body: Partial<CreateWorkOrderInput>): CreateWorkOrderInput {
  const requiredFields: Array<keyof CreateWorkOrderInput> = [
    "type",
    "requesterId"
  ];

  for (const field of requiredFields) {
    if (!body[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  const type = normalizeWorkOrderType(body.type);
  getUser(body.requesterId as string);
  if (body.sectionId) {
    getSection(String(body.sectionId));
  }
  if (body.machineId) {
    getMachine(String(body.machineId));
  }
  if (body.issueCategoryId) {
    getIssueCategory(String(body.issueCategoryId));
  }

  const issueDescription = body.issueDescription || body.description || body.title;
  if (!issueDescription) {
    throw new Error("Issue description is required.");
  }

  return {
    type,
    title: body.title ? String(body.title) : undefined,
    description: body.description ? String(body.description) : undefined,
    assetName: body.assetName ? String(body.assetName) : undefined,
    location: body.location ? String(body.location) : undefined,
    priority: body.priority || "medium",
    requesterId: String(body.requesterId),
    dueDate: body.dueDate || null,
    workDate: body.workDate || now().slice(0, 10),
    shiftGroup: body.shiftGroup || "A",
    sectionId: body.sectionId ? String(body.sectionId) : null,
    machineId: body.machineId ? String(body.machineId) : null,
    machineName: body.machineName ? String(body.machineName) : undefined,
    reportedByName: body.reportedByName ? String(body.reportedByName) : undefined,
    reportedByDepartment: body.reportedByDepartment ? String(body.reportedByDepartment) : undefined,
    issueCategoryId: body.issueCategoryId ? String(body.issueCategoryId) : null,
    issueDescription: String(issueDescription)
  };
}

export function validateStatusInput(body: Partial<UpdateWorkOrderStatusInput>): UpdateWorkOrderStatusInput {
  if (!body.status || !body.actorId) {
    throw new Error("Status and actorId are required.");
  }

  getUser(body.actorId);

  if (body.assignedToId) {
    getUser(body.assignedToId);
  }

  return {
    status: body.status,
    actorId: body.actorId,
    note: body.note ? String(body.note) : "",
    assignedToId: body.assignedToId
  };
}
