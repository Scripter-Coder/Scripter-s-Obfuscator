// Make the reward tests' D1 mock return the SHAPE D1 ACTUALLY RETURNS.
//
// node:sqlite's .all() gives back an array. D1's .all() gives back
//
//     { results: [...], success: true, meta: { changes, ... } }
//
// and the tests were quietly using the more permissive one. A line that did
// .map on the result worked in the test and threw on the deployed worker -
// which is exactly how a key ended up minted and then reported as missing.
// The mock now has the same shape as the runtime, so that cannot happen
// again.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// D1's D1Result.
function d1Result(res) {
    const isRows = Array.isArray(res);
    const results = isRows ? res : [];
    const changes = isRows ? 0 : (res && typeof res.changes === 'number' ? res.changes : 0);
    const lastInsertRowId = (!isRows && res && typeof res.lastInsertRowid === 'number') ? res.lastInsertRowid : 0;
    return {
        results,
        success: true,
        meta: {
            changes,
            rows_read: results.length,
            rows_written: changes,
            last_row_id: lastInsertRowId,
            duration: 0.1,
            served_by: 'test',
            served_by_region: 'TEST',
            served_by_colo: 'TEST'
        }
    };
}

export function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
    return wrap(db);
}

function wrap(db) {
    return {
        prepare(sql) {
            const st = db.prepare(sql);
            return {
                // D1: bind once, then the statement is reusable.
                bind(...params) {
                    return {
                        run: async () => d1Result(st.run(...params)),
                        all: async () => d1Result(st.all(...params)),
                        first: async (col) => {
                            const r = st.get(...params);
                            if (!r) return null;
                            return col ? r[col] : r;
                        }
                    };
                },
                run: async (...params) => d1Result(st.run(...params)),
                all: async (...params) => d1Result(st.all(...params)),
                first: async (col, ...params) => {
                    const r = st.get(...params);
                    if (!r) return null;
                    return col ? r[col] : r;
                }
            };
        },
        exec: async (sql) => db.exec(sql),
        batch: async (stmts) => {
            const out = [];
            for (const s of stmts) out.push(d1Result([]));
            return out;
        }
    };
}
