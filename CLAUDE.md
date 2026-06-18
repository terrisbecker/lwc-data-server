# CLAUDE.md

## Local notes & deferred work

- `.claude/notes/rds-ssl-hardening.md` — deferred task: verify the RDS server cert in
  `src/db.ts` instead of `ssl: { rejectUnauthorized: false }`. Read this before
  touching database SSL/connection config.
