// Dijalankan setelah electron-rebuild pada standalone/node_modules.
// Copy binary yang sudah benar (Electron ABI) ke lokasi hashed di standalone/.next/node_modules/
const { unlinkSync, copyFileSync, readdirSync, statSync, existsSync } = require("fs")
const path = require("path")

// Source: hasil rebuild Electron di dalam standalone (bukan root node_modules)
const srcBinary = path.join(
  ".next", "standalone", "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"
)

if (!existsSync(srcBinary)) {
  console.error("ERROR: better_sqlite3.node tidak ditemukan di", srcBinary)
  console.error("Pastikan electron-rebuild sudah selesai dengan benar.")
  process.exit(1)
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

// Hanya update hashed copies di standalone/.next/node_modules/ (bukan src itu sendiri)
const hashDir = path.join(".next", "standalone", ".next", "node_modules")
if (!existsSync(hashDir)) {
  console.log("Tidak ada hashed node_modules, selesai.")
  process.exit(0)
}

const targets = findAll(hashDir, "better_sqlite3.node")
for (const t of targets) {
  try { unlinkSync(t) } catch { /* tidak ada */ }
  copyFileSync(srcBinary, t)
  console.log("✓ Updated:", t)
}
console.log(`Done — updated ${targets.length} file(s)`)
