import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { loadTsModule } from "./support/load-ts-module.mjs";

const order = { id: "one", number: "WO-1", machineName: "Waterjet", location: "Conversion", issueDescription: "Motor stopped", status: "open", updatedAt: "2026-10-21T04:00:00Z" };
const detail = { ...order, priority: "high", type: "maintenance", createdAt: "2026-10-21T03:00:00Z", workDate: "2026-10-21", reportedByName: "Reporter", resolvedAt: null, closedAt: null, area: "Waterjet", attachments: [{ id: "photo", mimeType: "image/png", kind: "issue", originalName: "before.png", url: "/uploads/before.png" }], activities: [{ id: "activity", action: "created", message: "Motor issue reported", createdAt: "2026-10-21T03:00:00Z" }] };
function nodes(element, predicate) { if (!React.isValidElement(element)) return []; return [...(predicate(element) ? [element] : []), ...React.Children.toArray(element.props.children).flatMap((child) => nodes(child, predicate))]; }

function setup({ initialId = "", fetch = async () => detail, currentUser, update, onUpdated, onOpenInApp } = {}) {
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
  const { ProductionOrderExplorer } = loadTsModule(new URL("../src/components/ProductionOrderExplorer.tsx", import.meta.url), { react: hooks, "../api/client": { api: { workOrder: fetch, updateWorkOrderStatus: update }, mediaUrl: (url) => url } });
  const props = { selection: { title: "All orders", ids: ["one", "two"], initialId }, orders: [order, { ...order, id: "two", number: "WO-2", machineName: "Lathe" }], now: "2026-10-21T04:00:00Z", currentUser, onUpdated, onOpenInApp, onClose() { closed = true; } };
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

const productionUser = { id: "production-user", role: "requester", department: "Production" };
const resolved = { ...detail, status: "resolved", responsibleDepartment: "Production", requesterId: "another-requester", productionDowntimeReason: null };

test("production users can verify resolved departmental work, with a required downtime reason and live refresh", async () => {
  const calls = [];
  let refreshed = 0;
  const env = setup({ initialId: "one", currentUser: productionUser, fetch: async () => resolved,
    update: async (id, input) => { calls.push({ id, ...input }); return { ...resolved, status: "closed", productionDowntimeReason: input.productionDowntimeReason }; }, onUpdated: async () => { refreshed++; } });
  env.render(); await env.flush();
  let tree = env.render();
  let close = nodes(tree, (node) => node.props.className === "production-tv-close-order")[0];
  assert.equal(close.props.disabled, true);
  close.props.onClick(); await env.flush();
  assert.equal(calls.length, 0, "Missing reason blocks the request even if the handler is invoked directly");
  tree = env.render();
  nodes(tree, (node) => node.type === "textarea")[0].props.onChange({ target: { value: "Waiting for spare part" } });
  tree = env.render();
  close = nodes(tree, (node) => node.props.className === "production-tv-close-order")[0];
  assert.equal(close.props.disabled, false);
  close.props.onClick(); await env.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "one");
  assert.equal(calls[0].status, "closed");
  assert.equal(calls[0].actorId, productionUser.id);
  assert.equal(calls[0].productionDowntimeReason, "Waiting for spare part");
  assert.equal(refreshed, 1);
  tree = env.render();
  assert.equal(nodes(tree, (node) => node.props.className === "production-tv-close-order").length, 0);
  assert.ok(nodes(tree, (node) => node.props.className === "production-tv-success").length);
});

test("verification controls stay hidden for active jobs, other departments and non-requester roles", async () => {
  for (const [record, user] of [[{ ...resolved, status: "open" }, productionUser], [resolved, { ...productionUser, department: "SHE" }], [resolved, { ...productionUser, role: "technician" }], [resolved, undefined]]) {
    const env = setup({ initialId: "one", currentUser: user, fetch: async () => record });
    env.render(); await env.flush();
    assert.equal(nodes(env.render(), (node) => node.props.className === "production-tv-close-order").length, 0);
  }
});

test("failed closure keeps the popup usable and reports the server error without claiming success", async () => {
  const env = setup({ initialId: "one", currentUser: productionUser, fetch: async () => ({ ...resolved, productionDowntimeReason: "Waiting for spare part" }), update: async () => { throw new Error("This repair was returned. Refresh and review it again."); } });
  env.render(); await env.flush();
  nodes(env.render(), (node) => node.props.className === "production-tv-close-order")[0].props.onClick();
  await env.flush();
  const tree = env.render();
  assert.ok(nodes(tree, (node) => node.props.role === "alert").length);
  assert.equal(nodes(tree, (node) => node.props.className === "production-tv-success").length, 0);
  assert.equal(nodes(tree, (node) => node.props.className === "production-tv-close-order")[0].props.disabled, false);
});

test("Open in app passes the selected order id to the requester-app navigation", async () => {
  let opened;
  const env = setup({ initialId: "one", onOpenInApp: (id) => { opened = id; } });
  const tree = env.render();
  nodes(tree, (node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("Open in app"))[0].props.onClick();
  assert.equal(opened, "one");
});
