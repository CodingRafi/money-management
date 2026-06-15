// Licence system bypassed — all users treated as active
export async function canEdit(_userId: string): Promise<boolean> { return true }
export async function requireActiveLicence(_userId: string): Promise<void> { }
export async function requirePermission(_userId: string, _codename: string): Promise<void> { }
