# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
bun dev        # start dev server (Turbopack, outputs to .next/dev)
bun build      # production build (Turbopack)
bun start      # serve production build
eslint .       # lint (next lint is removed in v16 — use eslint CLI directly)
npx next typegen  # generate PageProps/LayoutProps/RouteContext type helpers
```

## Architecture

**Stack:** Next.js 16.2.6 · React 19.2.4 · TypeScript · Tailwind CSS v4

**Router:** App Router only. Pages live under `app/`. The path alias `@/*` maps to the repo root (not `src/`), so `@/app/...`, `@/lib/...`, etc.

**CSS:** Tailwind v4 uses `@import "tailwindcss"` in `app/globals.css` and the `@tailwindcss/postcss` PostCSS plugin — there is no `tailwind.config.js`. Theme variables are declared with `@theme inline { ... }`.

**Bundler:** Turbopack is the default for both `next dev` and `next build`. Do not add a `webpack` config unless you intend to run `next build --webpack`. Turbopack config goes in `next.config.ts` at the top level (`turbopack: { ... }`), not under `experimental`.

## Next.js 16 breaking changes

These are not in typical training data. Violating them causes build errors or silent bugs.

### All dynamic request APIs are async

`cookies()`, `headers()`, `draftMode()`, route `params`, and page `searchParams` are now fully async. Always `await` them:

```tsx
// layout / page / route handler
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
}
```

Run `npx next typegen` to generate `PageProps`, `LayoutProps`, and `RouteContext` helpers for type-safe access.

### middleware → proxy

The `middleware.ts` file is renamed to `proxy.ts`. The exported function must be named `proxy` (not `middleware`). The `edge` runtime is not supported in `proxy`; it runs Node.js only.

### Caching API changes

- `revalidateTag` now requires a second `cacheLife` profile argument: `revalidateTag('tag', 'max')`.
- `updateTag` (new) — Server Actions only; provides read-your-writes semantics by expiring and immediately refreshing data.
- `refresh()` from `next/cache` — refreshes the client router from a Server Action.
- `cacheLife` and `cacheTag` are stable; drop the `unstable_` prefix.

### Partial Prerendering

`experimental.ppr` and `experimental.dynamicIO` are removed. Use `cacheComponents: true` in `next.config.ts` instead.

### Parallel routes

Every `@slot` parallel route must have an explicit `default.js` (or `default.tsx`). Builds fail without it.

### Removed

- `next lint` — use the `eslint` CLI.
- `serverRuntimeConfig` / `publicRuntimeConfig` — use `process.env` (prefix with `NEXT_PUBLIC_` for client exposure).
- `next/legacy/image` — use `next/image`.
- `images.domains` — use `images.remotePatterns`.
- AMP support entirely removed.
- `size` / `First Load JS` removed from `next build` output.
