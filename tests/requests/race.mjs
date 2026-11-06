// Pomocniki testów wyścigów przejść zapytania na dwóch połączeniach (to nie jest plik testowy).
//
// Wzorzec: połączenie A otwiera transakcję i wykonuje przejście (wiersz zablokowany), B startuje drugie przejście,
// które czeka na blokadę; po commicie A PostgreSQL ponownie sprawdza `WHERE` B. Moment „B czeka” rozpoznajemy po
// `pg_blocking_pids()`: jakieś połączenie jest blokowane właśnie przez proces transakcji A (pliki testów biegną
// równolegle na tej samej bazie, więc ogólne „ktoś czeka na blokadę” nie wystarcza).
import assert from "node:assert/strict";

/**
 * Otwiera transakcję na osobnym kliencie puli. `run(tx)` wykonuje się w niej; zwraca `{ result, commit, rollback }`.
 * @template T
 * @param {import("pg").Pool} pool
 * @param {(tx: import("pg").PoolClient) => Promise<T>} run
 */
export async function holdTransaction(pool, run) {
  const client = await pool.connect();
  const { rows } = await client.query("select pg_backend_pid() as pid");
  await client.query("BEGIN");
  try {
    const result = await run(client);
    return {
      result,
      /** Proces bazy trzymający transakcję (dla `waitUntilBlocked`). */
      pid: /** @type {number} */ (rows[0].pid),
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
 * Czeka, aż jakieś połączenie zacznie czekać na blokadę trzymaną przez transakcję `held` (max `timeoutMs`), i sprawdza,
 * że to się stało, a obietnica drugiego przejścia jeszcze się nie rozstrzygnęła.
 * @param {import("pg").Pool} pool
 * @param {Promise<unknown>} pending
 * @param {{ pid: number }} held  wynik `holdTransaction`
 */
export async function waitUntilBlocked(pool, pending, held, timeoutMs = 5000) {
  let settled = false;
  pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  let blocked = false;
  const deadline = Date.now() + timeoutMs;
  while (!blocked && Date.now() < deadline) {
    const { rows } = await pool.query("select count(*)::int as n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))", [held.pid]);
    blocked = rows[0].n > 0;
    if (!blocked) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(settled, false, "drugie przejście powinno czekać na blokadę wiersza");
  assert.equal(blocked, true, "nie zaobserwowano czekania na blokadę transakcji A");
}
