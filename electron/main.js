const { app, BrowserWindow, shell } = require("electron")
const path = require("path")
const { spawn } = require("child_process")
const http = require("http")

const PORT = 3000
let nextProcess = null
let mainWindow = null

function getResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments)
  }
  return path.join(__dirname, "..", ...segments)
}

function waitForServer(url, retries = 30, delay = 1000) {
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
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: "production",
    // Store DB in user data dir so it survives app updates
    DATA_DIR: app.getPath("userData"),
  }

  nextProcess = spawn(process.execPath, [serverJs], {
    env,
    cwd: path.dirname(serverJs),
    stdio: "pipe",
  })

  nextProcess.stdout.on("data", (d) => process.stdout.write(d))
  nextProcess.stderr.on("data", (d) => process.stderr.write(d))
  nextProcess.on("error", (err) => console.error("Next.js process error:", err))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Money Management",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  })

  mainWindow.loadURL(`http://localhost:${PORT}`)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.on("closed", () => { mainWindow = null })
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    startNextServer()
    try {
      await waitForServer(`http://localhost:${PORT}`)
    } catch {
      console.error("Failed to start Next.js server")
    }
  }
  createWindow()

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
