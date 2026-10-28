-- Brand typo repair: 'JJOB' → 'JJOBB' in seeded display names (018 / test-accounts / demo-seed).
-- Login emails (@jjob.com) and website URLs are intentionally unchanged.
-- Idempotent.

UPDATE users
SET name = regexp_replace(name, 'JJOB(?!B)', 'JJOBB', 'g')
WHERE name ~ 'JJOB(?!B)';

UPDATE company_profiles
SET company_name = regexp_replace(company_name, 'JJOB(?!B)', 'JJOBB', 'g')
WHERE company_name ~ 'JJOB(?!B)';

UPDATE education_programs
SET instructor = regexp_replace(instructor, 'JJOB(?!B)', 'JJOBB', 'g')
WHERE instructor ~ 'JJOB(?!B)';
