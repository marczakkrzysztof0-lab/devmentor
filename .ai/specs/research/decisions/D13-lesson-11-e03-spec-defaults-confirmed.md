# D13 — Product defaults from the E03 specs are confirmed for 1.0: polled text chat in the slot only, kept read-only, no-show settled by any message, no mentor cancellation, manual disputes
- Date, owner: 2026-10-30, Krzysztof Marczak; source: Krzysztof Marczak, chat 2026-10-30 („wyrażam zgodę, leć dalej” → option „Potwierdzić ⚠ E03”); specs `.ai/specs/2026-10-30-live-text-session-chat.md`, `.ai/specs/2026-10-30-no-show-settlement.md`; list `.ai/specs/2026-10-30-e03-decisions-for-review.md`
- Context: the two E03 specs (#20, #21) were written in autonomous mode (lesson 11) and marked their product calls ⚠ for the owner (C1–C8, N1–N6).
- Decision:
  1. The chat is refreshed by polling every 3 s; no WebSocket/SSE (C1).
  2. Posting only inside the slot `[start, end)` by the database clock; no early entry, no grace minutes (C2, N2).
  3. After the slot the chat stays readable by the two parties only — the developer while `/r/{token}` is valid (30 days), the mentor on the request page; settled sessions stay on the mentor's list for 30 days (C3, N6).
  4. Messages cannot be edited or deleted; plain text with whitespace kept, no Markdown, links or attachments, 1–4000 characters (C4, C5).
  5. No reminder email at slot start (C6); no per-IP rate limit in 1.0 (C8).
  6. Messages are kept with the request, no automatic deletion; deletion requests by hand until Q04 names a legal owner (C7).
  7. „Posted during the slot” = at least one stored message of that party, any content (N1).
  8. Settlement job `sessions.settleEnded` every 5 min; developer email on both no-shows, none on a held session, no mentor emails (N2, N3).
  9. No mentor cancellation after acceptance — a mentor who does not post triggers the automatic refund (N4).
  10. No in-app disputes; handled by hand in the Stripe dashboard (N5, consistent with D12 item 5).
- Consequences, and what would make us revisit it: the E03 ⚠ markers are confirmed; #51 and #52 can merge after review and QA. Revisit 1 if polling cost or latency hurts in the pilot; 6 when Q04 is answered; 7 and 10 if the pilot export shows contested `mentee_no_show` outcomes; 5 (reminders) if no-shows are frequent (A01).
- Required path to change: a superseding record by Krzysztof Marczak.
- Origin: agent recommendations in the specs, confirmed by the owner on 2026-10-30.
- Supersedes: none
- Status: active
