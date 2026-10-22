# db — PostgreSQL migrations

- Migrations are plain SQL for `node-pg-migrate`: `migrations/NNNN_<name>.sql` with `-- Up Migration` and `-- Down Migration`. Never edit a merged migration; add the next number.
- Apply: `npm run db:migrate`; undo the last one (local and tests only): `npm run db:rollback`.
- DB tests live in `../tests/db/` and use `describeDb` from `../tests/db/harness.mjs` (disposable `dm_migtest_*` schemas).
- Reference migration + test: `migrations/0004_availability.sql` and `../tests/db/availability-schema.test.mjs`.
