# 🔍 Architectural Review: Data store and first schema migration

**Verdict: revise.** The database direction fits the repository’s existing PostgreSQL setup, and the schema is a reasonable foundation. Before implementation, clarify the test database cleanup boundary and how the invitation email is tied to the mentor it creates.

## ⚠️ Decision needed

- **Q1—persistence tooling:** The spec flags `pg` and `node-pg-migrate` for owner confirmation, but does not say whether implementation waits for that decision. Confirm the choice before later stories depend on it; the spec’s plain-SQL rationale supports it.

## 🔍 Findings

- **High: disposable-schema cleanup can delete unrelated data.** Q7 says each test run drops leftover schemas matching `test_%` in the database named by `DATABASE_URL`. That could remove a developer’s or another tool’s schema with the same prefix. Add an ownership marker or a dedicated test database, and restrict cleanup to schemas the test harness created.
- **High: invitation acceptance does not enforce the invited identity.** `invitations.email` and `mentors.email` are separate, but the model defines no invariant requiring them to match when an invitation is accepted. If #14 accepts a valid token without checking this, it could attach the invitation to a mentor with a different email. Specify the acceptance invariant and test the mismatch case.
- **Medium: the rollback safety rule is only a convention.** The spec says `db:rollback` must not undo migration 0001 after pilot data exists, yet exposes a general rollback command and only relies on the PR body to warn against it. Clarify how the operational guard works once real data exists, or narrow the command’s documented use to disposable databases.
- **Medium: acceptance criteria focus on schema mechanics, not the contract later stories need.** The plan tests constraints and up/down migration, but does not define observable guarantees for token expiry, revocation, or invitation acceptance. Those behaviors may belong to #14, but the boundary should be explicit so #14 cannot treat the tables as flat CRUD. Add the invitation lifecycle invariants owned by this spec, and point the remaining acceptance behavior to #14.
- **Low: context repeats implementation detail beyond what later agents need.** The spec gives extended rationales for rejected tools, restates decisions in “Data Model,” “Risks,” and “Decisions in play,” and lists several future tables by story. Trim repetition and keep only constraints that affect this migration or its consumers.

## Review limits

- No other `.ai/specs/2026-10-19-*.md` files were present, so cross-spec consistency could not be assessed.
- Reviewed against the product brief, decision records, repository setup scripts, CI workflow, compatibility policy, and spec-writing review heuristics.