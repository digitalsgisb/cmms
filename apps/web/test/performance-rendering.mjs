import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/pages/PerformancePage.tsx", import.meta.url), "utf8");
const placeholder = () => null;
const components = new Proxy({}, { get: () => placeholder });

function renderPage(focus, pageSource = source) {
  const params = new URLSearchParams({ focus, period: "monthly", month: "2026-10" });
  const hooks = {
    ...React,
    useState: (initial) => [typeof initial === "function" ? initial() : initial === true ? false : initial, () => {}],
    useEffect: () => {}, useCallback: (callback) => callback, useMemo: (callback) => callback()
  };
  const mocks = {
    react: hooks, "lucide-react": components, recharts: components,
    "react-router-dom": { Link: placeholder, useNavigate: () => () => {}, useSearchParams: () => [params, () => {}] },
    "@sugi-cmms/shared": { workOrderStatusLabels: {} },
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

test("regression check detects the original conflicting header/content keys", () => {
  const oldSource = source.replace('key={`hero-${focus}`}', "key={focus}").replace('key={`content-${focus}`}', "key={focus}");
  assert.throws(() => assertUniqueSiblingKeys(renderPage("all", oldSource)), /Duplicate sibling key/);
});
