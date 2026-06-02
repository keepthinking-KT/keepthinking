// KeepThinking v7.1.0 — JSC Loader
// Handles loading of both .js (source) and .jsc (bytecode) engine files.
// Usage: node loader.js
//   or:  node -r ./loader.js server/server.js

"use strict";

const path = require("path");
const fs = require("fs");

const ENGINE_DIR = __dirname;
const ENGINE_JSC = path.join(ENGINE_DIR, "engine.jsc");
const ENGINE_JS = path.join(ENGINE_DIR, "engine.js");

function loadEngine() {
  // Try JSC first (production mode)
  if (fs.existsSync(ENGINE_JSC)) {
    try {
      // Use V8 cached data via vm.Script (works universally)
      const vm = require("vm");
      const code = fs.readFileSync(ENGINE_JS, "utf8");
      const cachedData = fs.readFileSync(ENGINE_JSC);
      const script = new vm.Script(code, { filename: "engine.js", cachedData });
      const sandbox = {
        module: { exports: {} },
        exports: {},
        require,
        console,
        process,
        Buffer,
        setInterval, clearInterval,
        setTimeout, clearTimeout,
        __dirname: ENGINE_DIR,
        __filename: ENGINE_JS,
      };
      vm.createContext(sandbox);
      script.runInContext(sandbox);
      const e = sandbox.module.exports;
      if (typeof e.getStats === "function") {
        console.log("[keepthinking-loader] engine.jsc loaded successfully (V8 cached data)");
        return e;
      }
    } catch (err) {
      console.log("[keepthinking-loader] engine.jsc load failed:", err.message, "- falling back to engine.js");
    }
  }

  // Fallback: require engine.js directly (development mode)
  if (fs.existsSync(ENGINE_JS)) {
    console.log("[keepthinking-loader] loading engine.js (source mode)");
    return require(ENGINE_JS);
  }

  throw new Error("Cannot find engine.jsc or engine.js in " + ENGINE_DIR);
}

// Export the engine
module.exports = loadEngine();

// If this file is run directly, start the HTTP server
if (require.main === module) {
  console.log("[keepthinking-loader] Starting KeepThinking v7.1.0 server...");
  
  // Install express if needed
  const serverDir = path.join(ENGINE_DIR, "server");
  try {
    require("express");
  } catch (_) {
    console.log("[keepthinking-loader] Installing express...");
    require("child_process").execSync("npm install --prefix " + serverDir, { stdio: "inherit" });
  }

  // Start server
  require(path.join(serverDir, "server.js"));
}
