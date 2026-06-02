#!/usr/bin/env node
// KeepThinking — Password Setter
// Usage: node password.js --set your-password
//    or: node password.js --check  (reads from stdin)

"use strict";
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const BASE = process.env.KEEPTHINKING_HOME || path.join(process.env.HOME || "/root", ".keepthinking");
const PASS_FILE = path.join(BASE, ".ktpass");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const attempt = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(attempt), Buffer.from(hash));
}

// Main
const args = process.argv.slice(2);
const mode = args[0];

if (mode === "--set" && args[1]) {
  const hashed = hashPassword(args[1]);
  fs.mkdirSync(path.dirname(PASS_FILE), { recursive: true });
  fs.writeFileSync(PASS_FILE, hashed, { mode: 0o600 });
  console.log("✅ 密码已设置");
  console.log(`   存储位置: ${PASS_FILE}`);
} else if (mode === "--check") {
  if (!fs.existsSync(PASS_FILE)) {
    console.log("no-password");
    process.exit(0);
  }
  const stored = fs.readFileSync(PASS_FILE, "utf8").trim();
  // Read password from stdin (pipe)
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", d => input += d);
  process.stdin.on("end", () => {
    const valid = verifyPassword(input.trim(), stored);
    console.log(valid ? "valid" : "invalid");
    process.exit(valid ? 0 : 1);
  });
} else {
  console.log("KeepThinking Password Tool");
  console.log("");
  console.log("  node password.js --set <your-password>   设置密码");
  console.log("  echo '<password>' | node password.js --check   验证密码");
  console.log("");
  console.log(`  密码文件: ${PASS_FILE}`);
}
