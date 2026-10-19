// Data shapes the product components render. They mirror the specs' DTOs; the app maps
// its server data to them. Money is always in minor units (grosze), times in UTC ISO.

/** Public mentor page DTO — explicit allowlist from spec #16. */
export type MentorPublicPage = {
  displayName: string;
  publicWorkUrl: string;
  description: string;
  price25Minor: number;
  price50Minor: number;
  currency: string;
  slug: string;
};

export type SessionLength = 25 | 50;

/** One offered slot from `listOpenSlots` (#15): a start time that fits this length. */
export type OpenSlot = { startsAt: string; lengthMinutes: SessionLength };

/** Load state of a section whose data comes separately (slots, request list). "offline" = no network (C6). */
export type LoadState = "loading" | "ready" | "error" | "offline";

/** Request states from the #17 state machine plus what the page shows around them (#18, #19). */
export type RequestStatus =
  | "payment_pending"
  | "payment_failed"
  | "late_payment"
  | "awaiting_mentor"
  | "accepted"
  | "declined"
  | "overdue"
  | "lapsed"
  | "cancelled";

/** Refund state on `payments` (#24); null when no refund was requested. */
export type RefundStatus = "requested" | "succeeded" | "failed" | null;

/** A field-error map returned by a server action: field name → message in Polish. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;
