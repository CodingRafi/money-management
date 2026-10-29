import { NextResponse, type NextRequest } from "next/server"

// Meneruskan pathname ke Server Component (layout) agar route guard role `child`
// dijalankan di server, bukan hanya di client.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set("x-pathname", request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\..*).*)"],
}
