import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import ts from "typescript";
import * as shared from "@sugi-cmms/shared";
import { loadTsModule } from "./support/load-ts-module.mjs";

const require = createRequire(import.meta.url);
const placeholder = () => null;
const user = { id: "requester", role: "requester", department: "Production", name: "Reporter" };
const photo = { name: "before.png", type: "image/png", size: 100, lastModified: 1 };
const formValues = {
  sectionId: "__other__", customSection: "Section", area: "__other__", customArea: "Area",
  machineId: "__other__", customMachineName: "Machine", placeOrEquipment: "Machine",
  issueCategoryId: "__other__", customIssueCategory: "Issue", reportedByName: "Reporter",
  reportedByDepartment: "Production", issueDescription: "Machine needs repair"
};

function find(element, predicate) {
  if (!React.isValidElement(element)) return;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = find(child, predicate);
    if (found) return found;
  }
}

function load(relativePath, { overrides = {}, currentUser = user, api = {}, onNavigate } = {}) {
  const states = [];
  let stateIndex = 0;
  const hooks = {
    ...React,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = index in overrides ? overrides[index] : typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useEffect() {}, useMemo: (callback) => callback(), useId: () => "photo-picker",
    useRef: (initial) => ({ current: initial })
  };
  const mocks = {
    react: hooks, "lucide-react": new Proxy({}, { get: () => placeholder }),
    "@sugi-cmms/shared": shared,
    "react-router-dom": { Link: placeholder, Navigate: placeholder, useNavigate: () => (path) => onNavigate?.(path), useSearchParams: () => [new URLSearchParams()] },
    "../api/client": { api, mediaUrl: (url) => url },
    "./ProductionTvDashboard": { ProductionTvDashboard: placeholder },
    "../utils/productionDashboard": loadTsModule(new URL("../src/utils/productionDashboard.ts", import.meta.url)),
    "../utils/format": { formatDateTime: (value) => value, formatLiveDuration: () => "", formatMinutes: () => "" },
    "../state/UserContext": { useCurrentUser: () => ({ currentUser, loadingUsers: false }) },
    "../hooks/useLiveRefresh": { useLiveRefresh() {} }
  };
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require: (name) => mocks[name] || (name.startsWith("../components/") ? new Proxy({}, { get: () => placeholder }) : require(name)),
    URLSearchParams, Date, console,
    window: { requestAnimationFrame: (callback) => callback(), setTimeout: (callback) => callback(), scrollTo() {} },
    document: { querySelector: () => null }
  });
  return { exports, states, render(name, props) { stateIndex = 0; return exports[name](props); } };
}

for (const type of ["maintenance", "project", "kaizen", "office"]) {
  for (const route of ["staff", "account", "guest"]) {
    test(`${route} ${type} requires a before photo before creating an order`, async () => {
      let creates = 0;
      let uploads = 0;
      const api = {
        createWorkOrder: async () => { creates++; return { id: "order", number: "WO-1" }; },
        createRequesterWorkOrder: async () => { creates++; return { workOrder: { id: "order" }, tracking: { path: "/tracking?token=test" } }; },
        uploadAttachments: async () => { uploads++; }, uploadRequesterAttachments: async () => { uploads++; },
        workOrders: async () => []
      };
      const staff = route === "staff";
      const values = { ...formValues, type, responsibleDepartment: "Production", workDate: "2026-10-20", shiftGroup: "A" };
      const env = load(staff ? "../src/pages/CreateWorkOrderPage.tsx" : "../src/pages/PublicRequesterPage.tsx", {
        currentUser: route === "guest" ? null : user, api,
        overrides: staff ? { 1: values, 2: true } : { 5: "Production", 7: type, 9: values }
      });
      const submit = () => {
        const page = env.render(staff ? "CreateWorkOrderPage" : "PublicRequesterPage");
        const form = find(page, (node) => staff ? node.type === "form" : Boolean(node.props.onSubmit && node.props.issueFiles));
        assert.ok(form, "Submission form is rendered");
        return form.props.onSubmit({ preventDefault() {} });
      };
      await submit();
      assert.equal(creates, 0, "No order is created without a photo");
      assert.equal(uploads, 0);
      assert.match(env.states[staff ? 4 : 12], /at least one before photo/);
      assert.equal(env.states[staff ? 7 : 13], staff ? true : "before-photos");
      env.states[staff ? 6 : 10] = [photo];
      await submit();
      assert.equal(creates, 1, "Adding a photo allows submission");
      assert.equal(uploads, 1, "Selected before photo is uploaded");
    });
  }
}

test("photo picker clearly marks required photos and shows an accessible error only when empty", () => {
  const env = load("../src/components/MultiPhotoPicker.tsx");
  const props = { files: [], onChange() {}, required: true, invalid: true, label: "Before photos" };
  const picker = env.render("MultiPhotoPicker", props);
  assert.equal(picker.props["aria-invalid"], true);
  assert.match(picker.props.className, /is-invalid/);
  assert.ok(find(picker, (node) => node.props.className === "multi-photo-required"));
  assert.match(find(picker, (node) => node.props.role === "alert").props.children, /cannot submit/);
  const withPhoto = env.render("MultiPhotoPicker", { ...props, files: [photo] });
  assert.equal(withPhoto.props["aria-invalid"], undefined);
  assert.equal(find(withPhoto, (node) => node.props.role === "alert"), undefined);
});

test("rejected files do not satisfy the photo requirement and removing the last photo restores the error", () => {
  const env = load("../src/components/MultiPhotoPicker.tsx");
  let files = [];
  const props = () => ({ files, onChange: (next) => { files = next; }, required: true, invalid: true });
  let picker = env.render("MultiPhotoPicker", props());
  const input = find(picker, (node) => node.type === "input" && node.props.multiple);
  input.props.onChange({ target: { files: [{ ...photo, type: "text/plain" }, { ...photo, size: 9 * 1024 * 1024 }] } });
  assert.equal(files.length, 0);
  input.props.onChange({ target: { files: [photo] } });
  assert.equal(files.length, 1);
  env.states[0] = [{ file: photo, url: "blob:preview" }];
  picker = env.render("MultiPhotoPicker", props());
  find(picker, (node) => node.props["aria-label"] === "Remove before.png").props.onClick();
  assert.equal(files.length, 0);
  picker = env.render("MultiPhotoPicker", props());
  assert.equal(picker.props["aria-invalid"], true);
});

test("Production home section buttons update counts, recent orders and the tracking drilldown", () => {
  const sections = [{ id: "cv", name: "Conversion" }, { id: "rm", name: "Roll Making" }];
  const orders = [
    { id: "cv-open", sectionId: "cv", responsibleDepartment: "Production", status: "open" },
    { id: "cv-closed", sectionId: "cv", responsibleDepartment: "Production", status: "closed" },
    { id: "rm-progress", sectionId: "rm", responsibleDepartment: "Production", status: "in_progress" },
    { id: "she", sectionId: "cv", responsibleDepartment: "SHE", status: "open" }
  ];
  const env = load("../src/pages/PublicRequesterPage.tsx", { overrides: { 0: { sections, machines: [], issueCategories: [] }, 1: orders, 4: "dashboard" } });
  const render = () => env.render("PublicRequesterPage");
  let page = render();
  let dashboard = find(page, (node) => Boolean(node.props.stats));
  assert.equal(dashboard.props.workOrders.length, 3);
  assert.equal(dashboard.props.stats.open, 1);
  find(page, (node) => node.props.value === "all" && Boolean(node.props.onChange)).props.onChange("roll-making");
  page = render();
  dashboard = find(page, (node) => Boolean(node.props.stats));
  assert.equal(dashboard.props.workOrders.length, 1);
  assert.equal(dashboard.props.workOrders[0].id, "rm-progress");
  assert.equal(dashboard.props.stats.open, 0);
  assert.equal(dashboard.props.stats.in_progress, 1);
  dashboard.props.onStatus("in_progress");
  const tracking = find(render(), (node) => Boolean(node.props.onFilter && node.props.onScope));
  assert.equal(tracking.props.workOrders.length, 1);
  assert.equal(tracking.props.workOrders[0].id, "rm-progress");
});

test("Production account opens the TV board and other departments do not have that entry", () => {
  const env = load("../src/pages/PublicRequesterPage.tsx", { overrides: { 4: "account" } });
  const launch = find(env.render("PublicRequesterPage"), (node) => node.props.className === "production-tv-launch");
  assert.ok(launch);
  launch.props.onClick();
  const tv = env.render("PublicRequesterPage");
  assert.ok(tv.props.onBack);
  assert.ok(tv.props.onRefresh);
  tv.props.onBack();
  assert.ok(find(env.render("PublicRequesterPage"), (node) => node.props.className === "production-tv-launch"));
  const other = load("../src/pages/PublicRequesterPage.tsx", { currentUser: { ...user, department: "SHE" }, overrides: { 4: "account" } });
  assert.equal(find(other.render("PublicRequesterPage"), (node) => node.props.className === "production-tv-launch"), undefined);
});

test("TV Open in app navigates to the requester's tracking detail instead of a staff-only route", () => {
  let destination;
  const env = load("../src/pages/PublicRequesterPage.tsx", { overrides: { 4: "production-tv" }, onNavigate: (path) => { destination = path; } });
  const board = env.render("PublicRequesterPage");
  assert.equal(board.props.currentUser.id, user.id);
  board.props.onOpenInApp("target-order");
  const url = new URL(destination, "https://cmms.example");
  assert.equal(url.pathname, "/report-issue");
  assert.equal(url.searchParams.get("view"), "tracking");
  assert.equal(url.searchParams.get("workOrder"), "target-order");
  assert.equal(env.states[4], "tracking");
});
