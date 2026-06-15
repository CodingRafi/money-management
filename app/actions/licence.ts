"use server"

// Licence system is bypassed in the desktop version — all users are always active.
export async function claimLicence(_prev: unknown, _formData: FormData): Promise<{ success?: boolean; error?: string }> {
  return { success: true }
}
