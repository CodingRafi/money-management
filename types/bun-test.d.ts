// Shim tipe minimal untuk `bun test` (tanpa menambah dependency @types/bun).
declare module "bun:test" {
  export const describe: (name: string, fn: () => void) => void
  export const test: (name: string, fn: () => void | Promise<void>) => void
  export const it: typeof test
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const expect: (actual: any) => any
}
