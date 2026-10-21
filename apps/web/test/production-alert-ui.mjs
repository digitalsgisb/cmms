import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { loadTsModule } from "./support/load-ts-module.mjs";

const start = Date.parse("2026-10-21T04:00:00Z");
const order = { id: "new", number: "WO-1", responsibleDepartment: "Production", status: "open", machineName: "Waterjet", issueDescription: "Motor stopped" };
function nodes(element, predicate) { if (!React.isValidElement(element)) return []; return [...(predicate(element) ? [element] : []), ...React.Children.toArray(element.props.children).flatMap((child) => nodes(child, predicate))]; }
function setup({ blocked = false } = {}) {
  const states = [], refs = [], dependencies = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, effects = [], plays = 0;
  const hooks = { ...React,
    useRef(initial) { const index = refCursor++; return refs[index] ||= { current: initial }; },
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }]; },
    useEffect(callback, deps) { const index = effectCursor++; const changed = !dependencies[index] || deps.some((value, at) => value !== dependencies[index][at]); dependencies[index] = deps; if (changed && deps.length) effects.push(callback); }
  };
  const { ProductionDashboardAlerts } = loadTsModule(new URL("../src/components/ProductionDashboardAlerts.tsx", import.meta.url), { react: hooks });
  return { get plays() { return plays; }, render(orders = [], time = start) { cursor = 0; refCursor = 0; effectCursor = 0; const tree = ProductionDashboardAlerts({ orders, now: new Date(time).toISOString(), ready: true, stale: false, onOpen() {} }); refs[1].current ||= { pause() {}, currentTime: 4, volume: 1, async play() { plays++; if (blocked) throw new Error("Autoplay blocked"); } }; return tree; }, async flush() { const pending = effects; effects = []; pending.forEach((effect) => effect()); await new Promise(setImmediate); } };
}

test("side popups expire at five seconds while alert history remains available", async () => {
  const env = setup();
  env.render(); await env.flush();
  env.render([order]); await env.flush();
  assert.equal(nodes(env.render([order], start + 4999), (node) => node.type === "aside").length, 1);
  let tree = env.render([order], start + 5000);
  assert.equal(nodes(tree, (node) => node.type === "aside").length, 0);
  nodes(tree, (node) => node.props["aria-expanded"] === false)[0].props.onClick();
  tree = env.render([order], start + 10_000);
  assert.equal(nodes(tree, (node) => node.type === "aside").length, 1);
  assert.ok(nodes(tree, (node) => node.props.className?.includes("production-tv-alert-card")).length);
});

test("enabling sound plays a chime, then new orders and 15-minute reminders play audibly", async () => {
  const env = setup();
  let tree = env.render(); await env.flush();
  nodes(tree, (node) => node.type === "button" && node.props.title?.startsWith("Enable sound once"))[0].props.onClick();
  await env.flush();
  assert.equal(env.plays, 1, "User gesture plays the confirmation chime");
  env.render([order]); await env.flush();
  assert.equal(env.plays, 2, "New work order plays one sound");
  env.render([order], start + 15 * 60_000); await env.flush();
  assert.equal(env.plays, 3, "Unresolved reminder plays one sound");
  tree = env.render([order], start + 15 * 60_000);
  nodes(tree, (node) => node.props["aria-label"] === "Mute popup alerts")[0].props.onClick();
  env.render([order, { ...order, id: "muted" }], start + 15 * 60_000 + 1000); await env.flush();
  assert.equal(env.plays, 3, "Muting popups also silences incoming alerts");
});

test("blocked audio stays disabled and shows an actionable error", async () => {
  const env = setup({ blocked: true });
  const tree = env.render(); await env.flush();
  nodes(tree, (node) => node.type === "button" && node.props.title?.startsWith("Enable sound once"))[0].props.onClick();
  await env.flush();
  const updated = env.render();
  assert.ok(nodes(updated, (node) => node.props.role === "status").length);
  assert.equal(nodes(updated, (node) => node.type === "button" && node.props.title?.startsWith("Enable sound once"))[0].props["aria-pressed"], false);
});
