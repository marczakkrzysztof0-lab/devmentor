# D12 — Product defaults from the E01/E02 specs are confirmed for 1.0: PLN, both lengths required, configurable commission, platform pays refund fees, guest requests, 3-hour notice, manual disputes
- Date, owner: 2026-10-19, Krzysztof Marczak; source: Krzysztof Marczak, chat 2026-10-19 („Potwierdzam wszystkie decyzje ⚠ ze specyfikacji lekcji 05 tak, jak są zapisane”); specs `.ai/specs/2026-10-19-*.md`; summary `.ai/analysis/2026-10-19-lekcja-05-oddanie.md`
- Context: the eight E01/E02 specs were written in autonomous mode and marked their product calls ⚠ for the owner. Several answer open brief questions (Q01, Q02, Q05) or the epic #8 question.
- Decision:
  1. One platform currency, PLN, stored per mentor page (answers Q02 for 1.0).
  2. A mentor must price and offer both 25- and 50-minute sessions (epic #8 question).
  3. The price the mentor enters is what the mentee pays; commission is a configuration value (`PLATFORM_COMMISSION_BPS`) snapshotted on each payment. The rate itself is not set by this record (Q01 stays open for real payments).
  4. The platform bears Stripe fees on refunds; the mentee always gets the full amount (R09, R11).
  5. Disputes/chargebacks are only recorded; disputes and refunds that fail for 24 h are handled by hand in the Stripe dashboard (Q05: manual handling decided; the named operator is still open).
  6. Developers request sessions as guests through a private request link `/r/{token}`; no mentee account in 1.0.
  7. The earliest bookable slot is 3 hours ahead (`MIN_NOTICE_MINUTES = 180`).
  8. Mentor sign-in links are issued by founders (command), optionally emailed through the transactional email adapter.
  9. Hosting and the job scheduler (`/api/internal/jobs` every 5 min) are chosen together; the specs stay host-agnostic.
  10. Persistence: PostgreSQL with `pg` and `node-pg-migrate`, plain SQL migrations, no ORM.
- Consequences, and what would make us revisit it: the specs' ⚠ markers are confirmed; implementation can start with #23. Revisit 7 if the pilot's booking-to-start time shows the urgent need is not served (A01); revisit 1 and 3 before opening real payments.
- Required path to change: a superseding record by Krzysztof Marczak.
- Origin: agent recommendations in the specs, confirmed by the owner on 2026-10-19.
- Supersedes: none
- Status: active
