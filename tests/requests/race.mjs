// Pomocniki testów wyścigów przejść zapytania na dwóch połączeniach (to nie jest plik testowy).
//
// Wzorzec: połączenie A otwiera transakcję i wykonuje przejście (wiersz zablokowany), B startuje drugie przejście,
// które czeka na blokadę; po commicie A PostgreSQL ponownie sprawdza `WHERE` B. Moment „B czeka” rozpoznajemy po
// `pg_stat_activity` (wait_event_type = 'Lock' dla zapytania z naszym znacznikiem w `application_name`).
import assert from "node:assert/strict";

/**
 * Otwiera transakcję na osobnym kliencie puli. `run(tx)` wykonuje się w niej; zwraca `{ result, commit, rollback }`.
 * @template T
 * @param {import("pg").Pool} pool
 * @param {(tx: import("pg").PoolClient) => Promise<T>} run
 */
export async function holdTransaction(pool, run) {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    const result = await run(client);
    return {
      result,
      commit: async () => {
        await client.query("COMMIT");
        client.release();
      },
      rollback: async () => {
        await client.query("ROLLBACK");
        client.release();
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    client.release();
    throw error;
  }
}

/**
 * Czeka, aż jakieś połączenie tej bazy zacznie czekać na blokadę wiersza (max `timeoutMs`), i sprawdza, że obietnica
 * drugiego przejścia jeszcze się nie rozstrzygnęła.
 * @param {import("pg").Pool} pool
 * @param {Promise<unknown>} pending
 */
export async function waitUntilBlocked(pool, pending, timeoutMs = 5000) {
  let settled = false;
  pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(
      "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike '%requests%'",
    );
    if (rows[0].n > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(settled, false, "drugie przejście powinno czekać na blokadę wiersza");
}
