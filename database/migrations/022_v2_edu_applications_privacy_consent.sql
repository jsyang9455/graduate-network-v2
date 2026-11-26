-- Education program applications + signup privacy consent (REQ-PLT / 고졸자 후속관리)
-- 2026-11-27

CREATE TABLE IF NOT EXISTS education_program_applications (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES education_programs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id INTEGER REFERENCES schools(id),
  applicant_name VARCHAR(100) NOT NULL,
  applicant_phone VARCHAR(30) NOT NULL,
  applicant_email VARCHAR(255),
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_edu_apps_program ON education_program_applications(program_id);
CREATE INDEX IF NOT EXISTS idx_edu_apps_user ON education_program_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_edu_apps_school ON education_program_applications(school_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_consent_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_consent_version VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_consent_items JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_consent_name VARCHAR(100);

COMMENT ON COLUMN users.privacy_consent_at IS '고졸자 후속관리 개인정보 동의 시각';
COMMENT ON COLUMN users.privacy_consent_version IS '동의서 버전 (예: kosaf-2026)';
COMMENT ON COLUMN users.privacy_consent_items IS '동의 항목 플래그 JSON';
COMMENT ON COLUMN users.privacy_consent_name IS '동의 시 서명한 성명';

ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS biz_no VARCHAR(20);
