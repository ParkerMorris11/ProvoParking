// The order these files were applied to Provo Parking production (Supabase migration
// history, checked 2026-11-05), followed by the admin OKR migration. Keep in sync with
// docs/admin-okr.md. schema.sql/policies.sql stand in for the original base schema.
export const PRODUCTION_BASE = [
  'supabase/schema.sql',
  'supabase/policies.sql',
  'supabase/migrations/20261029143325_enable_parking_reference_reads.sql',
  'supabase/migrations/20261029224555_parking_session_persistence.sql',
  'supabase/migrations/20261102040636_account_sign_in.sql',
  'supabase/migrations/20261104155225_verified_byu_lots.sql',
  'supabase/migrations/20261105025053_verified_byu_sections.sql',
  'supabase/migrations/20261105032816_visit_metrics.sql',
];
export const ADMIN_MIGRATION = 'supabase/migrations/20261105040000_admin_okr_tracking.sql';
