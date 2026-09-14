-- Wave 1 QA fixtures: 2 schools + role accounts (REQ-IAM-009)
-- Applied by backend/tests helpers; also runnable manually after 010.

INSERT INTO schools (code, name, region, status)
VALUES ('QSCB', '군산기계공업고등학교', '전북', 'active')
ON CONFLICT (code) DO NOTHING;

-- Passwords are set in tests via bcrypt. This file only guarantees school B exists.
