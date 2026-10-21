import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsModule } from "./support/load-ts-module.mjs";

const { productionSection, filterProductionSection, productionDashboardSummary, productionAttentionReasons } = loadTsModule(new URL("../src/utils/productionDashboard.ts", import.meta.url));
const { ProductionTvDashboard } = loadTsModule(new URL("../src/pages/ProductionTvDashboard.tsx", import.meta.url), { "../api/client": { selectedPlant: () => "sendayan" } });
const sections = [{ id: "cv", name: "Conversion", department: "Production" }, { id: "rm", name: "Roll Making", department: "Production" }];
const now = new Date("2026-10-21T04:00:00Z");
const order = (changes = {}) => ({ id: "order", number: "WO-1", type: "maintenance", responsibleDepartment: "Production", plantId: "sendayan", sectionId: "cv", location: "Conversion", machineName: "Waterjet 7A", area: "Waterjet", issueDescription: "Motor stopped", priority: "medium", status: "open", assignedToId: "tech", dueDate: null, createdAt: "2026-10-21T03:30:00Z", resolvedAt: null, closedAt: null, updatedAt: "2026-10-21T03:30:00Z", ...changes });

test("section filters use master data, support legacy names and keep ALL inclusive", () => {
  const orders = [order(), order({ id: "roll", sectionId: "rm", location: "Old name" }), order({ id: "other", sectionId: null, location: "Workshop" })];
  assert.equal(productionSection(orders[1], sections), "roll-making");
  assert.equal(productionSection(order({ sectionId: null, location: "ROLL-MAKING" }), sections), "roll-making");
  assert.equal(productionSection(order({ sectionId: null, location: "Conversion office" }), sections), "other");
  assert.equal(filterProductionSection(orders, sections, "all").length, 3);
  assert.equal(filterProductionSection(orders, sections, "conversion")[0].id, "order");
  assert.equal(filterProductionSection(orders, sections, "roll-making")[0].id, "roll");
});

test("production totals separate resolved, closed, cancelled and other departments", () => {
  const orders = [order(), order({ status: "resolved" }), order({ status: "closed" }), order({ status: "cancelled" }), order({ responsibleDepartment: "SHE" }), order({ sectionId: null, location: "Other" })];
  const summary = productionDashboardSummary(orders, sections, now);
  assert.equal(summary.production.length, 5);
  assert.equal(summary.active.length, 3);
  assert.equal(summary.closed, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.awaitingVerification, 1);
  assert.equal(summary.closureRate, 25);
  assert.equal(summary.otherActive, 1);
});

test("attention includes blocked, critical, returned and verification jobs but excludes finished orders", () => {
  for (const status of ["returned", "on_hold", "pending_material", "resolved"]) assert.ok(productionAttentionReasons(order({ status }), now).length);
  assert.ok(productionAttentionReasons(order({ priority: "critical" }), now).includes("Critical priority"));
  assert.ok(productionAttentionReasons(order({ assignedToId: null }), now).includes("Awaiting assignment"));
  assert.ok(!productionAttentionReasons(order({ status: "resolved", assignedToId: null }), now).includes("Awaiting assignment"));
  for (const status of ["closed", "cancelled"]) assert.equal(productionAttentionReasons(order({ status, priority: "critical" }), now).length, 0);
  assert.equal(productionAttentionReasons(order(), now).length, 0);
});

test("attention uses end of due day in Malaysia and the existing 60-minute downtime rule", () => {
  assert.ok(!productionAttentionReasons(order({ dueDate: "2026-10-21" }), now).includes("Past due date"));
  assert.ok(productionAttentionReasons(order({ dueDate: "2026-10-20" }), now).includes("Past due date"));
  assert.ok(productionAttentionReasons(order({ createdAt: "2026-10-21T03:00:00Z" }), now).includes("Downtime reason needed"));
  assert.ok(!productionAttentionReasons(order({ createdAt: "2026-10-21T03:00:00Z", productionDowntimeReason: "Waiting on supplier" }), now).includes("Downtime reason needed"));
});

test("attention sorts critical then returned then oldest", () => {
  const orders = [order({ id: "new", assignedToId: null }), order({ id: "old", assignedToId: null, createdAt: "2026-10-20T01:00:00Z" }), order({ id: "returned", status: "returned" }), order({ id: "critical", priority: "critical" })];
  assert.equal(Array.from(productionDashboardSummary(orders, sections, now).attention, ({ order }) => order.id).join(","), "critical,returned,old,new");
});

test("seven-day graph counts actual completion dates in Malaysia rather than issue dates or current status", () => {
  const summary = productionDashboardSummary([
    order({ status: "closed", createdAt: "2026-01-01T00:00:00Z", resolvedAt: "2026-10-20T16:30:00Z", closedAt: "2026-10-21T01:00:00Z" }),
    order({ status: "returned", resolvedAt: "2026-10-20T15:59:00Z" }),
    order({ status: "closed", closedAt: "2026-10-14T12:00:00Z" }),
    order({ responsibleDepartment: "SHE", resolvedAt: "2026-10-21T01:00:00Z" })
  ], sections, now);
  assert.equal(summary.trend.length, 7);
  assert.equal(summary.trend[0].key, "2026-10-15");
  assert.equal(summary.trend[5].resolved, 1);
  assert.equal(summary.trend[6].resolved, 1);
  assert.equal(summary.trend[6].closed, 1);
  assert.equal(summary.trend.reduce((total, day) => total + day.closed, 0), 1);
});

test("empty and cancelled-only datasets never produce invalid rates", () => {
  for (const orders of [[], [order({ status: "cancelled" })]]) {
    const summary = productionDashboardSummary(orders, sections, now);
    assert.equal(summary.closureRate, 0);
    assert.equal(summary.active.length, 0);
    assert.ok(summary.trend.every((day) => day.resolved === 0 && day.closed === 0));
  }
});

test("TV renders two tables, actual metrics, chart and attention with empty, loading and stale states", () => {
  const props = { workOrders: [order({ priority: "critical" }), order({ id: "roll", sectionId: "rm", status: "resolved" })], sections, now: now.toISOString(), lastUpdated: now.toISOString(), loadError: "", onBack() {}, async onRefresh() {} };
  const html = renderToStaticMarkup(React.createElement(ProductionTvDashboard, props));
  assert.equal((html.match(/<table>/g) || []).length, 2);
  for (const text of ["Conversion", "Roll Making", "Resolved vs closed", "Critical priority", "Verify completed repair", "Sendayan", "Fullscreen", "Active only"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("NaN"));
  const stale = renderToStaticMarkup(React.createElement(ProductionTvDashboard, { ...props, lastUpdated: "2026-10-21T03:00:00Z", loadError: "Network unavailable" }));
  assert.ok(stale.includes("Updates delayed"));
  assert.ok(stale.includes("WO-1"), "Retains previous work orders during connection failure");
  const loading = renderToStaticMarkup(React.createElement(ProductionTvDashboard, { ...props, workOrders: [], lastUpdated: null }));
  assert.ok(loading.includes("Loading work orders"));
  const empty = renderToStaticMarkup(React.createElement(ProductionTvDashboard, { ...props, workOrders: [] }));
  assert.ok(empty.includes("No matching work orders"));
  assert.ok(empty.includes("No work orders currently need attention"));
});

test("table pagination reaches every order and changing status scope includes finished jobs", () => {
  let states = [];
  let cursor = 0;
  const hooks = { ...React, useEffect() {}, useMemo: (callback) => callback(), useRef: () => ({ current: null }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    }
  };
  const { ProductionTvDashboard: Board } = loadTsModule(new URL("../src/pages/ProductionTvDashboard.tsx", import.meta.url), { react: hooks, "../api/client": { selectedPlant: () => "sendayan" } });
  function nodes(element, predicate) {
    if (!React.isValidElement(element)) return [];
    return [...(predicate(element) ? [element] : []), ...React.Children.toArray(element.props.children).flatMap((child) => nodes(child, predicate))];
  }
  function render(component, props) { cursor = 0; return component(props); }
  const orders = Array.from({ length: 13 }, (_, index) => order({ id: `order-${index}`, number: `WO-${index}`, status: index === 12 ? "closed" : "open" }));
  const props = { workOrders: orders, sections, now: now.toISOString(), lastUpdated: now.toISOString(), loadError: "", onBack() {}, async onRefresh() {} };
  let board = render(Board, props);
  assert.equal(nodes(board, (node) => node.props.title === "Conversion")[0].props.orders.length, 12);
  nodes(board, (node) => node.type === "button" && node.props.children === "All statuses")[0].props.onClick();
  board = render(Board, props);
  const section = nodes(board, (node) => node.props.title === "Conversion")[0];
  assert.equal(section.props.orders.length, 13);
  states = [];
  const reached = new Set();
  for (let page = 0; page < 4; page++) {
    const table = render(section.type, { ...section.props, rotating: false });
    for (const row of nodes(table, (node) => node.type === "tr" && String(node.key).includes("order-"))) reached.add(String(row.key).match(/order-\d+/)[0]);
    const next = nodes(table, (node) => node.props["aria-label"] === "Next Conversion page")[0];
    assert.equal(next.props.disabled, false);
    next.props.onClick();
  }
  assert.equal(reached.size, 13, "All orders appear across the four pages");
  const wrapped = render(section.type, { ...section.props, rotating: false });
  assert.ok(nodes(wrapped, (node) => node.type === "tr" && String(node.key).includes("order-0")).length, "Next wraps to the first page");
});
