-- Hapus sistem device fingerprint, ganti dengan session management bawaan Better Auth

DROP TABLE IF EXISTS devices;
ALTER TABLE licences DROP COLUMN IF EXISTS max_devices;
