-- Setup akun: Keluarga Rafi + admin utama Rafi (PostgreSQL)
-- Jalankan SEKALI setelah `npm run migrate`. Idempotent (ON CONFLICT DO NOTHING).
-- Login: username "rafi" — ganti password setelah login pertama.
-- Lalu login sebagai rafi → Pengaturan → Akun → Import → pilih keluarga-rafi-backup.json

BEGIN;

INSERT INTO "user" (id, name, email, username, password_hash, relation, role)
VALUES ('user-rafi', 'Rafi', 'rafi@keluarga-rafi.local', 'rafi', '$2a$10$/H0ZYar884gQYR919waXyurP4EO6TD.c2UJjpTRcYu0hwhozXO6ty', NULL, 'admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO households (id, name) VALUES ('household-rafi', 'Keluarga Rafi')
ON CONFLICT (id) DO NOTHING;

INSERT INTO licenses (id, household_id, plan_type, status, max_members, expires_at)
VALUES ('license-rafi', 'household-rafi', 'lifetime', 'active', 10, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO household_members (household_id, user_id, role, relation)
VALUES ('household-rafi', 'user-rafi', 'admin', NULL)
ON CONFLICT (household_id, user_id) DO NOTHING;

COMMIT;
