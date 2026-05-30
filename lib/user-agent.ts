export function parseUserAgent(ua: string | null): { browser: string; os: string; isMobile: boolean } {
  if (!ua) return { browser: "Browser tidak diketahui", os: "OS tidak diketahui", isMobile: false }

  let browser = "Browser lain"
  if (ua.includes("Edg/"))                              browser = "Microsoft Edge"
  else if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera"
  else if (ua.includes("Chrome/") && !ua.includes("Chromium")) browser = "Google Chrome"
  else if (ua.includes("Firefox/"))                     browser = "Firefox"
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari"
  else if (ua.includes("Chromium/"))                    browser = "Chromium"

  let os = "OS lain"
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  if (/iPhone|iPad|iPod/.test(ua))       os = "iOS"
  else if (/Android/.test(ua))           os = "Android"
  else if (/Windows NT/.test(ua))        os = "Windows"
  else if (/Mac OS X/.test(ua))          os = "macOS"
  else if (/Linux/.test(ua))             os = "Linux"

  return { browser, os, isMobile }
}
