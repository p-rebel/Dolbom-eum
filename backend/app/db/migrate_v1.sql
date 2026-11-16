-- Add the applicant role while retaining existing account IDs and foreign keys.
CREATE TABLE demo_accounts_v2 (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('TOWN', 'DISTRICT', 'APPLICANT')),
    district_code   TEXT,
    town_code       TEXT,
    CHECK (
        (role = 'TOWN' AND district_code IS NOT NULL AND town_code IS NOT NULL)
        OR (role = 'DISTRICT' AND district_code IS NOT NULL AND town_code IS NULL)
        OR (role = 'APPLICANT' AND district_code IS NULL AND town_code IS NULL)
    )
) STRICT;
INSERT INTO demo_accounts_v2 SELECT id, username, display_name, password_hash, role, district_code, town_code FROM demo_accounts;
DROP TABLE demo_accounts;
ALTER TABLE demo_accounts_v2 RENAME TO demo_accounts;
