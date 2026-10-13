import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import ts from "typescript";
import * as shared from "@sugi-cmms/shared";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/pages/PerformancePage.tsx", import.meta.url), "utf8");
const placeholder = () => null;
const components = new Proxy({}, { get: () => placeholder });

function renderPage(focus, pageSource = source, fixture = {}) {
  const params = new URLSearchParams({ focus, period: "monthly", month: "2026-10", ...fixture.params });
  let arrayState = 0;
  const hooks = {
    ...React,
    useState: (initial) => {
      let value = typeof initial === "function" ? initial() : initial === true ? false : initial;
      if (Array.isArray(initial)) value = arrayState++ === 0 ? fixture.sections || [] : fixture.workOrders || [];
      return [value, () => {}];
    },
    useEffect: () => {}, useCallback: (callback) => callback, useMemo: (callback) => callback()
  };
  const mocks = {
    react: hooks, "lucide-react": components, recharts: components,
    "react-router-dom": { Link: placeholder, useNavigate: () => () => {}, useSearchParams: () => [params, (update) => fixture.onParams?.(update(params))] },
    "@sugi-cmms/shared": shared,
    "../api/client": { api: {} },
    "../state/UserContext": { useCurrentUser: () => ({ currentUser: { id: "test-user" } }) },
    "../hooks/useLiveRefresh": { useLiveRefresh: () => {} }
  };
  const compiled = ts.transpileModule(pageSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => mocks[name] || require(name), Date, URLSearchParams, console });
  return exports.PerformancePage();
}

function assertUniqueSiblingKeys(element) {
  if (!React.isValidElement(element)) return;
  const children = Array.isArray(element.props.children) ? element.props.children.flat(Infinity) : [element.props.children];
  const keys = new Set();
  for (const child of children) {
    if (!React.isValidElement(child)) continue;
    if (child.key !== null) {
      assert.ok(!keys.has(child.key), `Duplicate sibling key: ${child.key}`);
      keys.add(child.key);
    }
    assertUniqueSiblingKeys(child);
  }
}

test("Performance subsection switches produce one header and unique sibling keys", () => {
  for (const focus of ["all", "work-orders", "spares", "pm", "all", "work-orders"]) {
    const page = renderPage(focus);
    assertUniqueSiblingKeys(page);
    const children = page.props.children.filter(React.isValidElement);
    assert.equal(children.filter((child) => child.type === "header").length, 1);
    assert.equal(children.filter((child) => child.props.className === "performance-view-stage").length, 1);
  }
});

function findElements(element, predicate) {
  if (!React.isValidElement(element)) return [];
  const children = Array.isArray(element.props.children) ? element.props.children.flat(Infinity) : [element.props.children];
  return [...(predicate(element) ? [element] : []), ...children.flatMap((child) => findElements(child, predicate))];
}

const departmentOrders = [
  { id: "production-open", number: "WO-PROD-1", responsibleDepartment: "Production", sectionId: "conversion", status: "open" },
  { id: "production-closed", number: "WO-PROD-2", responsibleDepartment: "Production", sectionId: "conversion", status: "closed" },
  { id: "she-open", number: "WO-SHE-1", responsibleDepartment: "SHE", sectionId: "safety", status: "open" }
].map((item) => ({ ...item, createdAt: "2026-10-01T12:00:00", updatedAt: "2026-10-02T12:00:00", closedAt: item.status === "closed" ? "2026-10-02T12:00:00" : null, type: "maintenance", priority: "medium", issueDescription: "Test issue" }));
const departmentSections = [{ id: "conversion", name: "Conversion", department: "Production" }, { id: "safety", name: "Safety", department: "SHE" }];

test("Production is the default department for metrics, sections and outstanding work", () => {
  const page = renderPage("work-orders", source, { workOrders: departmentOrders, sections: departmentSections });
  const select = findElements(page, (element) => element.props.id === "performance-department")[0];
  assert.equal(select.props.value, "Production");
  assert.equal(findElements(page, (element) => element.type === "h1")[0].props.children, "Production Work Orders");
  assert.equal(findElements(page, (element) => element.props.label === "Total work orders")[0].props.value, "2");
  const rows = findElements(page, (element) => element.props.className?.includes("performance-order-row"));
  assert.deepEqual(rows.map((row) => row.key), ["production-closed"]);
  const sections = findElements(page, (element) => element.props.id === "performance-section")[0];
  assert.deepEqual(findElements(sections, (element) => element.type === "option").map((option) => option.props.value), ["all", "conversion"]);
});

test("choosing SHE or All departments updates the work order scope", () => {
  for (const [department, total, expectedRows] of [["SHE", "1", ["she-open"]], ["all", "3", ["production-open", "she-open"]]]) {
    const page = renderPage("work-orders", source, { params: { department, view: "not-closed" }, workOrders: departmentOrders, sections: departmentSections });
    assert.equal(findElements(page, (element) => element.props.label === "Total work orders")[0].props.value, total);
    assert.deepEqual(findElements(page, (element) => element.props.className?.includes("performance-order-row")).map((row) => row.key), expectedRows);
  }
});

test("changing department clears the old section and preserves report month", () => {
  let updated;
  const page = renderPage("work-orders", source, { params: { section: "conversion" }, onParams: (params) => { updated = params; } });
  findElements(page, (element) => element.props.id === "performance-department")[0].props.onChange({ target: { value: "SHE" } });
  assert.equal(updated.get("department"), "SHE");
  assert.equal(updated.get("section"), "all");
  assert.equal(updated.get("month"), "2026-10");
  assert.equal(updated.get("period"), "monthly");
});

const crossMonthOrders = [
  { ...departmentOrders[0], id: "october-work", workDate: "2026-10-01", createdAt: "2026-09-30T12:00:00" },
  { ...departmentOrders[1], id: "september-closed", workDate: "2026-09-25", closedAt: "2026-10-02T12:00:00" },
  { ...departmentOrders[0], id: "september-resolved", workDate: "2026-09-30", status: "resolved", resolvedAt: "2026-10-04T12:00:00" },
  { ...departmentOrders[1], id: "october-closed", workDate: "2026-10-03", closedAt: "2026-11-01T12:00:00" }
];

test("October activity follows closed and resolved dates even for September work orders", () => {
  const page = renderPage("work-orders", source, { params: { view: "all" }, workOrders: crossMonthOrders });
  assert.equal(findElements(page, (element) => element.props.label === "Total work orders")[0].props.value, "3");
  assert.equal(findElements(page, (element) => element.props.label === "WO Closure (Close)")[0].props.value, "33%");
  assert.deepEqual(findElements(page, (element) => element.props.className?.includes("performance-order-row")).map((row) => row.key), ["october-work", "september-closed", "september-resolved"]);
  const chart = findElements(page, (element) => element.props.data?.[0]?.label === "Week 1" && "closeRate" in element.props.data[0])[0];
  assert.equal(chart.props.data.reduce((sum, bucket) => sum + bucket.standard, 0), 3);
  assert.equal(chart.props.data.reduce((sum, bucket) => sum + bucket.closed, 0), 1);
});

test("default October view shows only October closures, and November closures belong to November", () => {
  for (const [month, expected] of [["2026-10", ["september-closed"]], ["2026-11", ["october-closed"]], ["2026-09", []]]) {
    const page = renderPage("work-orders", source, { params: { month }, workOrders: crossMonthOrders });
    assert.deepEqual(findElements(page, (element) => element.props.className?.includes("performance-order-row")).map((row) => row.key), expected);
  }
});

test("year selector includes historical closure years", () => {
  const page = renderPage("work-orders", source, { workOrders: [{ ...departmentOrders[1], closedAt: "2012-09-25T12:00:00" }] });
  const years = findElements(page, (element) => element.props.id === "performance-report-year")[0];
  assert.ok(findElements(years, (element) => element.type === "option").some((option) => option.props.value === 2012));
});

test("older work orders are included only when All dates is explicitly selected", () => {
  const page = renderPage("work-orders", source, { params: { view: "all", range: "all" }, workOrders: crossMonthOrders });
  assert.equal(findElements(page, (element) => element.props.className?.includes("performance-order-row")).length, 4);
  assert.equal(findElements(page, (element) => element.props.label === "Total work orders")[0].props.value, "3");
});

test("Not closed backlog retains older resolved and open orders regardless of selected month", () => {
  const page = renderPage("work-orders", source, { params: { month: "2026-11", view: "not-closed", range: "period" }, workOrders: crossMonthOrders });
  assert.deepEqual(findElements(page, (element) => element.props.className?.includes("performance-order-row")).map((row) => row.key), ["september-resolved", "october-work"]);
  assert.equal(findElements(page, (element) => element.props.id === "performance-order-range")[0].props.value, "all");
});

test("missing closed dates are not replaced with work order or last-updated dates", () => {
  const page = renderPage("work-orders", source, { workOrders: [{ ...departmentOrders[1], closedAt: null }] });
  assert.equal(findElements(page, (element) => element.props.className?.includes("performance-order-row")).length, 0);
});

test("regression check detects the original conflicting header/content keys", () => {
  const oldSource = source.replace('key={`hero-${focus}`}', "key={focus}").replace('key={`content-${focus}`}', "key={focus}");
  assert.throws(() => assertUniqueSiblingKeys(renderPage("all", oldSource)), /Duplicate sibling key/);
});
