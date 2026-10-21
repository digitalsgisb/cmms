import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./support/load-ts-module.mjs";

const { advanceProductionAlerts, emptyProductionAlertState, productionReminderInterval, needsProductionResolution } = loadTsModule(new URL("../src/utils/productionAlerts.ts", import.meta.url));
const order = (changes = {}) => ({ id: "one", number: "WO-1", responsibleDepartment: "Production", status: "open", machineName: "Waterjet", issueDescription: "Motor stopped", ...changes });
const start = Date.parse("2026-10-21T04:00:00Z");

test("first snapshot summarizes unresolved work without falsely announcing existing orders as new", () => {
  const result = advanceProductionAlerts(emptyProductionAlertState(), [order(), order({ id: "done", status: "resolved" }), order({ id: "other", responsibleDepartment: "SHE" })], start);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].kind, "reminder");
  assert.equal(result.alerts[0].orderIds.join(","), "one");
  assert.equal(result.state.reminders.one, start + 15 * 60_000);
});

test("reminders occur exactly every 15 minutes without duplicates on repeated polls", () => {
  let result = advanceProductionAlerts(emptyProductionAlertState(), [order()], start);
  result = advanceProductionAlerts(result.state, [order()], start + productionReminderInterval - 1);
  assert.equal(result.alerts.length, 0);
  result = advanceProductionAlerts(result.state, [order()], start + productionReminderInterval);
  assert.equal(result.alerts.length, 1);
  assert.match(result.alerts[0].title, /15-minute/);
  result = advanceProductionAlerts(result.state, [order()], start + productionReminderInterval + 1000);
  assert.equal(result.alerts.length, 0);
  result = advanceProductionAlerts(result.state, [order()], start + productionReminderInterval * 2);
  assert.equal(result.alerts.length, 1);
});

test("new work orders alert immediately and get their own 15-minute deadline", () => {
  let result = advanceProductionAlerts(emptyProductionAlertState(), [], start);
  result = advanceProductionAlerts(result.state, [order()], start + 30_000);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].kind, "new");
  assert.equal(result.state.reminders.one, start + 30_000 + productionReminderInterval);
  result = advanceProductionAlerts(result.state, [order({ status: "in_progress" })], start + 40_000);
  assert.equal(result.alerts.length, 0);
});

test("resolved, closed, cancelled and deleted orders stop reminders", () => {
  for (const status of ["resolved", "closed", "cancelled"]) {
    let result = advanceProductionAlerts(emptyProductionAlertState(), [order()], start);
    result = advanceProductionAlerts(result.state, [order({ status })], start + productionReminderInterval);
    assert.equal(result.alerts.length, 0);
    assert.equal(result.state.reminders.one, undefined);
    assert.equal(needsProductionResolution(order({ status })), false);
  }
  let result = advanceProductionAlerts(emptyProductionAlertState(), [order()], start);
  result = advanceProductionAlerts(result.state, [], start + productionReminderInterval);
  assert.equal(result.alerts.length, 0);
  assert.equal(Object.keys(result.state.reminders).length, 0);
});

test("a returned repair alerts again and restarts its reminder clock", () => {
  let result = advanceProductionAlerts(emptyProductionAlertState(), [order({ status: "resolved" })], start);
  result = advanceProductionAlerts(result.state, [order({ status: "returned" })], start + 10_000);
  assert.equal(result.alerts[0].kind, "returned");
  assert.equal(result.state.reminders.one, start + 10_000 + productionReminderInterval);
});

test("simultaneous unresolved reminders are grouped into a single actionable popup", () => {
  const orders = Array.from({ length: 10 }, (_, index) => order({ id: String(index), number: `WO-${index}` }));
  let result = advanceProductionAlerts(emptyProductionAlertState(), orders, start);
  result = advanceProductionAlerts(result.state, orders, start + productionReminderInterval);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].orderIds.length, 10);
  assert.match(result.alerts[0].body, /7 more/);
});
