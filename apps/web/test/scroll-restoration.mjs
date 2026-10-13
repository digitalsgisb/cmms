import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/utils/scrollRestoration.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup({ documentHeight = 2400, mainHeight = 600 } = {}) {
  const listeners = new Map();
  const timers = new Map();
  const observers = [];
  const tables = [{ scrollLeft: 0 }, { scrollLeft: 0 }];
  const main = { scrollLeft: 0, scrollTop: 0, scrollHeight: mainHeight, clientHeight: 600, firstElementChild: {},
    querySelectorAll: () => tables,
    scrollTo({ left, top }) { this.scrollLeft = left; this.scrollTop = top; }
  };
  const scrolling = { scrollHeight: documentHeight, clientHeight: 600 };
  const window = { scrollX: 0, scrollY: 0,
    scrollTo({ left, top }) { this.scrollX = left; this.scrollY = top; },
    addEventListener(event, callback) { listeners.set(event, callback); },
    removeEventListener(event) { listeners.delete(event); },
    setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const exports = {};
  vm.runInNewContext(compiled, { exports, window, document: { getElementById: () => main, documentElement: scrolling, scrollingElement: scrolling }, ResizeObserver: Observer, MutationObserver: Observer });
  return { ...exports, window, main, scrolling, tables, listeners, timers, observers };
}

const position = { windowX: 0, windowY: 900, mainX: 0, mainY: 0, tables: [80, 160] };

test("desktop Back restores vertical and table scroll positions", () => {
  const env = setup();
  let finished = 0;
  env.restorePageScroll(position, () => finished++);
  assert.equal(env.window.scrollY, 900);
  assert.deepEqual(env.tables.map((table) => table.scrollLeft), [80, 160]);
  assert.equal(finished, 1);
  assert.equal(env.timers.size, 0);
  assert.ok(env.observers.every((observer) => observer.disconnected));
});

test("Back waits for async page data rather than restoring into a loading message", () => {
  const env = setup({ documentHeight: 600 });
  env.restorePageScroll(position, () => {});
  assert.equal(env.window.scrollY, 0);
  env.scrolling.scrollHeight = 2400;
  env.observers[1].callback();
  assert.equal(env.window.scrollY, 900);
});

test("mobile Back restores the inner scrolling container after content loads", () => {
  const env = setup({ documentHeight: 600 });
  env.restorePageScroll({ ...position, windowY: 0, mainY: 800 }, () => {});
  assert.equal(env.main.scrollTop, 0);
  env.main.scrollHeight = 1600;
  env.observers[0].callback();
  assert.equal(env.main.scrollTop, 800);
  assert.equal(env.window.scrollY, 0);
});

test("user interaction cancels pending restoration", () => {
  const env = setup({ documentHeight: 600 });
  let finished = 0;
  env.restorePageScroll(position, () => finished++);
  env.listeners.get("wheel")();
  env.scrolling.scrollHeight = 2400;
  env.observers[0].callback();
  assert.equal(env.window.scrollY, 0);
  assert.equal(finished, 1);
  assert.equal(env.listeners.size, 0);
});

test("missing or shorter content eventually releases restoration", () => {
  const env = setup({ documentHeight: 600 });
  let finished = 0;
  env.restorePageScroll(position, () => finished++);
  [...env.timers.values()][0]();
  assert.equal(finished, 1);
  assert.equal(env.timers.size, 0);
});

test("captures window, inner-container, and table positions", () => {
  const env = setup();
  env.window.scrollY = 400;
  env.main.scrollTop = 120;
  env.tables[0].scrollLeft = 90;
  assert.deepEqual(JSON.parse(JSON.stringify(env.readPageScroll())), { windowX: 0, windowY: 400, mainX: 0, mainY: 120, tables: [90, 0] });
});
