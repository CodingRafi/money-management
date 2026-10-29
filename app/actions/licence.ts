"use server"

// Lisensi kini dikelola Super Admin di /super-admin; klaim kode tidak dipakai lagi.
export async function claimLicence(_prev: unknown, _formData: FormData): Promise<{ success?: boolean; error?: string }> {
  return { error: "Lisensi dikelola oleh admin. Hubungi pengelola aplikasi." }
}
