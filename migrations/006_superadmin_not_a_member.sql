-- Money Management — Super Admin bukan lagi anggota keluarga (Fase Super Admin)
--
-- Aturan baru:
--   * Super Admin = pengelola SaaS. Ia TIDAK boleh menjadi anggota keluarga
--     dan tidak boleh memakai halaman data keluarga (/dashboard, /rekap, ...).
--   * Setiap keluarga harus punya minimal satu akun admin (bukan super_admin).
--
-- Migrasi ini:
--   1. Membuat akun admin pengganti untuk keluarga yang dipegang super_admin.
--      Akun ini belum punya password → Super Admin menetapkannya dari UI
--      (/super-admin/keluarga/<id> → "Atur Password").
--   2. Memindahkan seluruh data milik super_admin ke akun admin pengganti
--      (penting untuk instalasi yang datanya belum kosong).
--   3. Melepas super_admin dari household_members.
--
-- Idempotent: aman dijalankan ulang.

-- ── 1. Susun rencana penggantian ───────────────────────────────────────────

CREATE TEMP TABLE _su_replacement ON COMMIT DROP AS
WITH src AS (
  SELECT m.household_id,
         m.user_id              AS old_user_id,
         h.name                 AS household_name,
         'su-admin-' || m.household_id AS new_id,
         lower(coalesce(nullif(regexp_replace(h.name, '[^A-Za-z0-9]', '', 'g'), ''), 'keluarga'))
           || '_admin'          AS base_username
  FROM household_members m
  JOIN "user" u  ON u.id = m.user_id AND u.role = 'super_admin'
  JOIN households h ON h.id = m.household_id
),
final AS (
  SELECT s.*,
         CASE WHEN EXISTS (SELECT 1 FROM "user" x WHERE LOWER(x.username) = LOWER(s.base_username))
              THEN s.base_username || '_' || substr(md5(s.household_id), 1, 5)
              ELSE s.base_username
         END AS username
  FROM src s
)
SELECT f.household_id, f.old_user_id, f.new_id, f.username, f.household_name
FROM final f
WHERE NOT EXISTS (SELECT 1 FROM "user" x WHERE x.id = f.new_id);

-- ── 2. Buat akun admin pengganti (password belum diatur) ───────────────────

INSERT INTO "user" (id, name, email, username, password_hash, role, relation)
SELECT r.new_id,
       r.household_name || ' - Admin',
       r.new_id || '@members.local',
       r.username,
       NULL,
       'admin',
       'suami'
FROM _su_replacement r
ON CONFLICT (id) DO NOTHING;

-- ── 3. Jadikan admin keluarga ──────────────────────────────────────────────

INSERT INTO household_members (household_id, user_id, role, relation)
SELECT r.household_id, r.new_id, 'admin', 'suami'
FROM _su_replacement r
ON CONFLICT (household_id, user_id) DO NOTHING;

-- ── 4. Pindahkan data milik super_admin ke akun admin pengganti ─────────────
--
-- Hanya kolom kepemilikan (user_id) yang dipindah. Kolom `recorded_by`
-- dibiarkan sebagai jejak audit siapa yang mencatat.

UPDATE expenses          SET user_id = r.new_id FROM _su_replacement r WHERE expenses.user_id          = r.old_user_id;
UPDATE incomes           SET user_id = r.new_id FROM _su_replacement r WHERE incomes.user_id           = r.old_user_id;
UPDATE wallets           SET user_id = r.new_id FROM _su_replacement r WHERE wallets.user_id           = r.old_user_id;
UPDATE transfers         SET user_id = r.new_id FROM _su_replacement r WHERE transfers.user_id         = r.old_user_id;
UPDATE investments       SET user_id = r.new_id FROM _su_replacement r WHERE investments.user_id       = r.old_user_id;
UPDATE investment_goals  SET user_id = r.new_id FROM _su_replacement r WHERE investment_goals.user_id  = r.old_user_id;
UPDATE loans             SET user_id = r.new_id FROM _su_replacement r WHERE loans.user_id             = r.old_user_id;
UPDATE loans_given       SET user_id = r.new_id FROM _su_replacement r WHERE loans_given.user_id       = r.old_user_id;
UPDATE loans_taken       SET user_id = r.new_id FROM _su_replacement r WHERE loans_taken.user_id       = r.old_user_id;
UPDATE budgets           SET user_id = r.new_id FROM _su_replacement r WHERE budgets.user_id           = r.old_user_id;
UPDATE type_allocations  SET user_id = r.new_id FROM _su_replacement r WHERE type_allocations.user_id  = r.old_user_id;
UPDATE category_nominal_budgets SET user_id = r.new_id FROM _su_replacement r WHERE category_nominal_budgets.user_id = r.old_user_id;
UPDATE year_budget_settings      SET user_id = r.new_id FROM _su_replacement r WHERE year_budget_settings.user_id      = r.old_user_id;
UPDATE fundamental_analyses      SET user_id = r.new_id FROM _su_replacement r WHERE fundamental_analyses.user_id      = r.old_user_id;

-- ── 5. Lepaskan super_admin dari keluarga ──────────────────────────────────

DELETE FROM household_members
WHERE user_id IN (SELECT id FROM "user" WHERE role = 'super_admin');

-- ── 6. Jaga-jaga: keluarga tanpa admin sama sekali ─────────────────────────
--
-- Kalau ada keluarga yang kini tidak punya anggota admin (mis. super_admin
-- satu-satunya anggota dan penggantinya gagal dibuat), buat placeholder admin
-- supaya keluarga tidak terlantar. Urut: user dulu, lalu membership (FK).

INSERT INTO "user" (id, name, email, username, password_hash, role, relation)
SELECT h.id, h.name || ' - Admin', 'su-admin-' || h.id || '@members.local',
       lower(coalesce(nullif(regexp_replace(h.name, '[^A-Za-z0-9]', '', 'g'), ''), 'keluarga'))
         || '_admin_' || substr(md5(h.id), 1, 5),
       NULL, 'admin', 'suami'
FROM households h
WHERE NOT EXISTS (
        SELECT 1 FROM household_members m
        JOIN "user" u ON u.id = m.user_id
        WHERE m.household_id = h.id AND m.role = 'admin'
      )
  AND NOT EXISTS (SELECT 1 FROM "user" x WHERE x.id = 'su-admin-' || h.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO household_members (household_id, user_id, role, relation)
SELECT h.id, 'su-admin-' || h.id, 'admin', 'suami'
FROM households h
WHERE NOT EXISTS (
        SELECT 1 FROM household_members m
        JOIN "user" u ON u.id = m.user_id
        WHERE m.household_id = h.id AND m.role = 'admin'
      )
  AND EXISTS (SELECT 1 FROM "user" x WHERE x.id = 'su-admin-' || h.id)
ON CONFLICT (household_id, user_id) DO NOTHING;
