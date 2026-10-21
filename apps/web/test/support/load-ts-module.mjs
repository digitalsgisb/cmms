import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as shared from "@sugi-cmms/shared";

export function loadTsModule(url, mocks = {}) {
  const require = createRequire(url);
  const source = readFileSync(url, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, console, Date, URLSearchParams,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "@sugi-cmms/shared") return shared;
      if (name.startsWith(".")) {
        const dependency = [".ts", ".tsx"].map((extension) => new URL(name + extension, url)).find(existsSync);
        if (dependency) return loadTsModule(dependency, mocks);
      }
      return require(name);
    }
  });
  return exports;
}
