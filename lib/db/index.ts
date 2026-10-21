// Dostęp do bazy dla kodu aplikacji Next.js — wyłącznie po stronie serwera.
// `server-only` obsługuje sam Next.js (pakiet z npm nie jest potrzebny, data-security.md):
// import tego modułu z komponentu klienckiego kończy się błędem kompilacji.
// `pg` jest na domyślnej liście `serverExternalPackages` Next.js — next.config.ts bez zmian.
import "server-only";

export {
  closePool,
  CONNECTION_TIMEOUT_MS,
  createPool,
  getPool,
  MISSING_DATABASE_URL_MESSAGE,
  withTransaction,
} from "./pool.mjs";
export type { Queryable } from "./pool.mjs";
