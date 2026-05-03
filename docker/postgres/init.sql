CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE roles (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(20) UNIQUE NOT NULL
);
INSERT INTO roles (name) VALUES ('ADMIN'), ('OPERATOR'), ('AUDITOR');


CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);


CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id INT  REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE target_assets (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(100) NOT NULL,
  hostname   VARCHAR(255) NOT NULL,
  port       INT DEFAULT 22,
  db_type    VARCHAR(20) CHECK (db_type IN ('mysql', 'mongodb')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE access_policies (
  id                  SERIAL PRIMARY KEY,
  role_id             INT REFERENCES roles(id) ON DELETE CASCADE,
  asset_id            UUID REFERENCES target_assets(id) ON DELETE CASCADE,
  max_session_seconds INT NOT NULL DEFAULT 1800,
  UNIQUE (role_id, asset_id)
);

CREATE TABLE asset_credentials (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id       UUID UNIQUE REFERENCES target_assets(id) ON DELETE CASCADE,
  encrypted_blob BYTEA NOT NULL,
  iv             BYTEA NOT NULL,
  auth_tag       BYTEA NOT NULL
);

