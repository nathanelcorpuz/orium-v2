-- T269 (SPEC.md): username-only signup, no email, for privacy-conscious
-- users. A username-only account is identified purely by `username` being
-- set - normal email accounts leave it null (unique allows unlimited nulls
-- in Postgres, only real usernames must be distinct). The recovery code is
-- never stored in plaintext - only a salted hash, verified at reset time.
-- `pending_recovery_code_ack` mirrors `pending_email_verification`
-- (migration 0053)'s own gate shape: true right after signup until the user
-- has seen and acknowledged their one-time recovery code.
alter table preferences
  add column username text unique,
  add column recovery_code_hash text,
  add column recovery_code_salt text,
  add column pending_recovery_code_ack boolean not null default false;
