import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { loadTsModule } from "./support/load-ts-module.mjs";

const order = { id: "one", number: "WO-1", machineName: "Waterjet", location: "Conversion", issueDescription: "Motor stopped", status: "open", updatedAt: "2026-10-21T04:00:00Z" };
const detail = { ...order, priority: "high", type: "maintenance", createdAt: "2026-10-21T03:00:00Z", workDate: "2026-10-21", reportedByName: "Reporter", resolvedAt: null, closedAt: null, area: "Waterjet", attachments: [{ id: "photo", mimeType: "image/png", kind: "issue", originalName: "before.png", url: "/uploads/before.png" }], activities: [{ id: "activity", action: "created", message: "Motor issue reported", createdAt: "2026-10-21T03:00:00Z" }] };
function nodes(element, predicate) { if (!React.isValidElement(element)) return []; return [...(predicate(element) ? [element] : []), ...React.Children.toArray(element.props.children).flatMap((child) => nodes(child, predicate))]; }

function setup({ initialId = "", fetch = async () => detail } = {}) {
  const states = [];
  const dependencies = [];
  let cursor = 0;
  let effectCursor = 0;
  let effects = [];
  let closed = false;
  const hooks = { ...React, useRef: () => ({ current: null }),
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }]; },
    useEffect(callback, deps) {
      const index = effectCursor++;
      const changed = !dependencies[index] || deps.some((value, at) => value !== dependencies[index][at]);
      dependencies[index] = deps;
      // Skip only the native dialog lifecycle; exercise the real data-loading effect.
      if (changed && deps.length) effects.push(callback);
    }
  };
  const { ProductionOrderExplorer } = loadTsModule(new URL("../src/components/ProductionOrderExplorer.tsx", import.meta.url), { react: hooks, "../api/client": { api: { workOrder: fetch }, mediaUrl: (url) => url } });
  const props = { selection: { title: "All orders", ids: ["one", "two"], initialId }, orders: [order, { ...order, id: "two", number: "WO-2", machineName: "Lathe" }], now: "2026-10-21T04:00:00Z", onClose() { closed = true; } };
  return { states, get closed() { return closed; }, render() { cursor = 0; effectCursor = 0; return ProductionOrderExplorer(props); }, async flush() { const pending = effects; effects = []; pending.forEach((effect) => effect()); await new Promise(setImmediate); } };
}

test("explorer search narrows the list and selecting an order loads actual details, photos and updates", async () => {
  const env = setup();
  let tree = env.render();
  nodes(tree, (node) => node.type === "input")[0].props.onChange({ target: { value: "Lathe" } });
  tree = env.render();
  const list = nodes(tree, (node) => node.props.className === "production-tv-explorer-list")[0];
  assert.equal(nodes(list, (node) => node.type === "button").length, 1);
  assert.ok(nodes(list, (node) => node.type === "strong" && node.props.children === "WO-2").length);
  nodes(list, (node) => node.type === "button")[0].props.onClick();
  env.render();
  await env.flush();
  tree = env.render();
  assert.ok(nodes(tree, (node) => node.props.className === "production-tv-order-detail").length);
  const photo = nodes(tree, (node) => String(node.props["aria-label"] || "").startsWith("Enlarge issue photo"))[0];
  assert.ok(photo);
  photo.props.onClick();
  tree = env.render();
  const enlarged = nodes(tree, (node) => node.props["aria-label"] === "Close enlarged photo")[0];
  assert.ok(enlarged);
  enlarged.props.onClick();
  assert.equal(nodes(env.render(), (node) => node.props["aria-label"] === "Close enlarged photo").length, 0);
  assert.ok(nodes(tree, (node) => node.type === "span" && node.props.children === "Motor issue reported").length);
});

test("detail failures have a working retry and Escape closes the explorer", async () => {
  let requests = 0;
  const env = setup({ initialId: "one", fetch: async () => { if (requests++ === 0) throw new Error("Network unavailable"); return detail; } });
  env.render();
  await env.flush();
  let tree = env.render();
  assert.ok(nodes(tree, (node) => node.props.role === "alert").length);
  nodes(tree, (node) => node.type === "button" && node.props.children === "Retry")[0].props.onClick();
  env.render();
  await env.flush();
  tree = env.render();
  assert.equal(nodes(tree, (node) => node.props.role === "alert").length, 0);
  assert.ok(nodes(tree, (node) => node.props.className === "production-tv-order-detail").length);
  let prevented = false;
  tree.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(env.closed, true);
});
