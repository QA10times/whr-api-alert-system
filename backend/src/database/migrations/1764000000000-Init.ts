import { MigrationInterface, QueryRunner } from 'typeorm';

/** Schema from the backend design (Schema design section), verbatim. */
export class Init1764000000000 implements MigrationInterface {
  name = 'Init1764000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
CREATE TYPE http_method  AS ENUM ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS');
CREATE TYPE auth_method  AS ENUM ('NONE','BEARER','BASIC','API_KEY','COOKIE','INHERIT');
CREATE TYPE alert_state  AS ENUM ('OK','FAILING','ALERTED');
CREATE TYPE alert_status AS ENUM ('PENDING','SENT','FAILED');

CREATE TABLE platforms (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE platform_environments (
  id               SERIAL PRIMARY KEY,
  platform_id      INT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  key              VARCHAR(50) NOT NULL,
  name             VARCHAR(100) NOT NULL,
  default_base_url VARCHAR(500),
  is_default       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (platform_id, key)
);

CREATE TABLE email_groups (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_email_groups_name ON email_groups (lower(name));

CREATE TABLE email_group_members (
  id          SERIAL PRIMARY KEY,
  group_id    INT NOT NULL REFERENCES email_groups(id) ON DELETE CASCADE,
  email       VARCHAR(254) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_member_group_email ON email_group_members (group_id, lower(email));

CREATE TABLE modules (
  id                 SERIAL PRIMARY KEY,
  environment_id     INT NOT NULL REFERENCES platform_environments(id) ON DELETE RESTRICT,
  name               VARCHAR(150) NOT NULL,
  base_url           VARCHAR(500) NOT NULL,
  auth_method        auth_method NOT NULL DEFAULT 'NONE' CHECK (auth_method <> 'INHERIT'),
  auth_config_enc    TEXT,
  headers            JSONB NOT NULL DEFAULT '{}',
  frequency_minutes  INT NOT NULL DEFAULT 5 CHECK (frequency_minutes BETWEEN 1 AND 1440),
  failure_threshold  INT NOT NULL DEFAULT 5 CHECK (failure_threshold >= 1),
  email_group_id     INT REFERENCES email_groups(id) ON DELETE SET NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (environment_id, name)
);
CREATE INDEX ix_modules_email_group ON modules (email_group_id);

CREATE TABLE apis (
  id                    SERIAL PRIMARY KEY,
  module_id             INT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name                  VARCHAR(150) NOT NULL,
  method                http_method NOT NULL DEFAULT 'GET',
  endpoint              VARCHAR(1000) NOT NULL,
  base_url_override     VARCHAR(500),
  auth_method           auth_method NOT NULL DEFAULT 'INHERIT',
  auth_config_enc       TEXT,
  headers               JSONB NOT NULL DEFAULT '{}',
  body                  JSONB,
  tag_key               VARCHAR(100),
  tag_value             VARCHAR(200),
  count_key             VARCHAR(200),
  data_key              VARCHAR(200),
  frequency_minutes     INT CHECK (frequency_minutes BETWEEN 1 AND 1440),
  timeout_ms            INT NOT NULL DEFAULT 15000,
  sort_order            INT NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  last_status_code      INT,
  last_passed           BOOLEAN,
  last_run_at           TIMESTAMPTZ,
  last_latency_ms       INT,
  consecutive_failures  INT NOT NULL DEFAULT 0,
  first_failed_at       TIMESTAMPTZ,
  last_failure_reason   VARCHAR(300),
  state                 alert_state NOT NULL DEFAULT 'OK',
  next_run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_apis_module_order ON apis (module_id, sort_order);
CREATE INDEX ix_apis_due          ON apis (next_run_at) WHERE is_active;
CREATE INDEX ix_apis_tag          ON apis (tag_key, tag_value);
CREATE INDEX ix_apis_state        ON apis (state) WHERE state <> 'OK';

CREATE TABLE api_runs (
  id               BIGSERIAL PRIMARY KEY,
  api_id           INT NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
  executed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_code      INT,
  latency_ms       INT,
  is_success       BOOLEAN NOT NULL,
  failure_reason   VARCHAR(300),
  count_value      NUMERIC,
  items_count      INT,
  error_message    VARCHAR(1000),
  response_snippet VARCHAR(2000)
);
CREATE INDEX ix_runs_api_time ON api_runs (api_id, executed_at DESC);
CREATE INDEX brin_runs_time   ON api_runs USING BRIN (executed_at);

CREATE TABLE alerts (
  id              BIGSERIAL PRIMARY KEY,
  api_id          INT NOT NULL REFERENCES apis(id) ON DELETE CASCADE,
  email_group_id  INT REFERENCES email_groups(id) ON DELETE SET NULL,
  kind            VARCHAR(20) NOT NULL DEFAULT 'FAILURE',
  status_code     INT,
  failure_reason  VARCHAR(300),
  observed_at     TIMESTAMPTZ NOT NULL,
  first_failed_at TIMESTAMPTZ NOT NULL,
  tag_key         VARCHAR(100),
  tag_value       VARCHAR(200),
  group_name      VARCHAR(100),
  recipients      TEXT[] NOT NULL DEFAULT '{}',
  last_results    JSONB NOT NULL DEFAULT '[]',
  subject         VARCHAR(300) NOT NULL,
  body_text       TEXT NOT NULL,
  status          alert_status NOT NULL DEFAULT 'PENDING',
  attempts        INT NOT NULL DEFAULT 0,
  error_message   VARCHAR(1000),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_alerts_api_time ON alerts (api_id, observed_at DESC);
CREATE INDEX ix_alerts_pending  ON alerts (created_at) WHERE status <> 'SENT';

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_email VARCHAR(254) NOT NULL,
  action      VARCHAR(30)  NOT NULL,
  target_type VARCHAR(10)  NOT NULL,
  target_id   INT NOT NULL,
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_time   ON audit_log (created_at DESC);
CREATE INDEX ix_audit_target ON audit_log (target_type, target_id, created_at DESC);

CREATE TABLE runner_state (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  environment_id  INT REFERENCES platform_environments(id),
  current_api_id  INT REFERENCES apis(id) ON DELETE SET NULL,
  batch_total     INT NOT NULL DEFAULT 0,
  batch_done      INT NOT NULL DEFAULT 0,
  heartbeat_at    TIMESTAMPTZ
);
`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
DROP TABLE IF EXISTS runner_state, audit_log, alerts, api_runs, apis, modules,
  email_group_members, email_groups, platform_environments, platforms CASCADE;
DROP TYPE IF EXISTS alert_status, alert_state, auth_method, http_method;
`);
  }
}
