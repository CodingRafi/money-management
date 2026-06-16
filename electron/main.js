const { app, BrowserWindow, shell, globalShortcut } = require("electron")
const path = require("path")
const fs = require("fs")
const net = require("net")
const { spawn } = require("child_process")
const http = require("http")

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on("error", reject)
  })
}

// Pakai "TOnas" sebagai nama app agar userData = AppData\Roaming\TOnas
app.setName("TOnas")

// File logger — ditulis ke AppData\Roaming\TOnas\tonas.log
let logStream = null
function initLog() {
  const dir = app.getPath("userData")
  fs.mkdirSync(dir, { recursive: true })
  const logPath = path.join(dir, "tonas.log")
  logStream = fs.createWriteStream(logPath, { flags: "a" })
  logStream.write(`\n\n=== START ${new Date().toISOString()} ===\n`)
}
function log(...args) {
  const msg = args.join(" ")
  process.stdout.write(msg + "\n")
  if (logStream) logStream.write(msg + "\n")
}

let PORT = 3000
let nextProcess = null
let mainWindow = null

// Prevent multiple instances — focus existing window instead
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function getResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments)
  }
  return path.join(__dirname, "..", ...segments)
}

function waitForServer(url, retries = 60, delay = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    function check() {
      http.get(url, (res) => {
        if (res.statusCode < 500) resolve()
        else retry()
      }).on("error", retry)
    }
    function retry() {
      if (++attempts >= retries) return reject(new Error("Server did not start in time"))
      setTimeout(check, delay)
    }
    check()
  })
}

function startNextServer() {
  const serverJs = getResourcePath(".next", "standalone", "server.js")
  log("[electron] server.js:", serverJs, "| exists:", fs.existsSync(serverJs))

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",  // kunci: jalankan sebagai Node.js murni, bukan Electron app
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    DATA_DIR: app.getPath("userData"),
  }

  nextProcess = spawn(process.execPath, [serverJs], {
    env,
    cwd: path.dirname(serverJs),
    stdio: "pipe",
  })

  nextProcess.stdout.on("data", (d) => { log("[server]", d.toString().trimEnd()) })
  nextProcess.stderr.on("data", (d) => { log("[server-err]", d.toString().trimEnd()) })
  nextProcess.on("error", (err) => log("[electron] spawn error:", err.message))
  nextProcess.on("exit", (code, signal) => log("[electron] server exited code:", code, "signal:", signal))
}

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(__dirname, "..", "public", "icon.ico")

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "TOnas",
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  })

  mainWindow.loadURL(`http://localhost:${PORT}`)

  mainWindow.webContents.on("did-fail-load", (event, code, desc, url) => {
    log("[electron] Page failed to load:", code, desc, url)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.on("closed", () => { mainWindow = null })
}

app.whenReady().then(async () => {
  initLog()
  log("[electron] app ready, isPackaged:", app.isPackaged)

  if (app.isPackaged) {
    PORT = await getAvailablePort()
    log("[electron] using port:", PORT)
    startNextServer()
    log("[electron] waiting for server on port", PORT)
    try {
      await waitForServer(`http://127.0.0.1:${PORT}`)
      log("[electron] server is ready!")
    } catch (err) {
      log("[electron] waitForServer timeout:", err.message)
    }
  }
  createWindow()

  globalShortcut.register("F12", () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools()
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("will-quit", () => {
  if (nextProcess) {
    nextProcess.kill()
    nextProcess = null
  }
})
