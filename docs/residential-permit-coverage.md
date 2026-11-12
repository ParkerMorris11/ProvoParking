# PP residential permit coverage

The `PP` row in `supabase/schema.sql` describes a City of Provo residential **street** permit. It does not model an individual apartment complex's private parking permit.

The only explicit PP eligibility rules in the checked-in SQL attach to `PP-SAMPLE`, named “Sample residential permit street (900 E).” The verified-lot migration retains legacy samples with `is_sample_data = true`. `eligibleAreas()` excludes these samples, and `eligibleMapFeatures()` links mapped boundaries only to eligible BYU feature IDs.

The checked-in verified section manifest contains 102 sections with categories A, G, Y, and U; it contains no PP section. The city parking snapshot is a separate informational layer, with no PP permit association or verified permit eligibility. A city parking outline is not a verified destination for this permit.

Until real residential zones and eligibility rules are implemented, `js/data/load.js` excludes PP from both the sign-up permit search and the Find permit dropdown. The shared filter uses the permit code, not a database-specific numeric ID. All other permit choices remain available.

Existing database permit rows, account links, sample rules, favorites, and historical sessions are preserved. No migration or production database change is required. On entry, the existing `choosePermit()` logic in `js/main.js` ignores saved/account permit IDs absent from the available choices, so a previously saved PP ID is not auto-selected.

This finding is about coverage implemented in the repository, not a fresh verification of Provo's municipal parking rules or live database contents.
