// Copy the Electron-rebuilt better-sqlite3 binary (from root node_modules)
// into all locations inside the Next.js standalone output.
const { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } = require("fs")
const path = require("path")

// Source: rebuilt for Electron's ABI by `electron-rebuild` against root node_modules
const srcBinary = path.join(
  "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"
)

if (!existsSync(srcBinary)) {
  console.error("ERROR: better_sqlite3.node not found at", srcBinary)
  console.error("Run: npx electron-rebuild -f -w better-sqlite3")
  process.exit(1)
}

function copyTo(dest) {
  mkdirSync(path.dirname(dest), { recursive: true })
  // COPYFILE_FICLONE_FORCE not needed; default mode overwrites existing file
  copyFileSync(srcBinary, dest)
}

function findAll(dir, name, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    try {
      if (statSync(full).isDirectory()) findAll(full, name, results)
      else if (entry === name) results.push(full)
    } catch { /* skip */ }
  }
  return results
}

let updated = 0

// 1. Patch standalone/node_modules/better-sqlite3/ (regular require path)
const standaloneNm = path.join(
  ".next", "standalone", "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"
)
copyTo(standaloneNm)
console.log("✓ standalone/node_modules:", standaloneNm)
updated++

// 2. Patch hashed copies in standalone/.next/node_modules/ (Next.js trace output)
const hashDir = path.join(".next", "standalone", ".next", "node_modules")
if (existsSync(hashDir)) {
  // Update any existing better_sqlite3.node files found by the trace
  const targets = findAll(hashDir, "better_sqlite3.node")
  for (const t of targets) {
    copyTo(t)
    console.log("✓ hashed (existing):", t)
    updated++
  }

  // Ensure binary exists in every better-sqlite3-* package dir (even if trace skipped the .node)
  const targetSet = new Set(targets)
  for (const pkg of readdirSync(hashDir).filter(d => d.startsWith("better-sqlite3"))) {
    const dest = path.join(hashDir, pkg, "build", "Release", "better_sqlite3.node")
    if (!targetSet.has(dest)) {
      copyTo(dest)
      console.log("✓ hashed (created):", dest)
      updated++
    }
  }
}

console.log(`Done — updated ${updated} file(s)`)
