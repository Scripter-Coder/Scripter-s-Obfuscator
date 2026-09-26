// src/transform/source-ops.js — shared single-pass source rewriting for the
// transforms that also have to rewrite VM(NONE) native source.
//
// Every transform records `edits` (replacements) and `inserts` as absolute
// offsets into the ORIGINAL parse source, plus the `fnStart` base offset of
// the function they belong to. Applying two transforms sequentially would
// invalidate the second one's offsets, so all operations are merged and applied
// in one descending pass over the original coordinates.

function toOps(result) {
  if (!result || !result.changed || typeof result.fnStart !== 'number') return [];
  const base = result.fnStart;
  const edits = (result.edits || []).map((edit) => ({ pos: edit.start - base, end: edit.end - base, text: edit.text }));
  const inserts = (result.inserts || []).map((insert) => ({ pos: insert.position - base, end: insert.position - base, text: insert.text }));
  return edits.concat(inserts);
}

/**
 * Applies the recorded operations of one or more transforms to a single
 * function's source slice.
 *
 * `absorb` handles native CONTROL_FLOW flattening. CONTROL_FLOW renders branch
 * bodies itself, having already applied the other transforms to that text, so
 * the other transforms' operations inside those regions must not be applied a
 * second time -- their offsets no longer line up with the flattened text.
 *
 * `absorb` may be:
 *   - an array of regions       -> applies to every result (legacy form)
 *   - { regions, keep }         -> applies to every result EXCEPT `keep`, which
 *                                  is the transform that produced the regions
 *                                  and whose own edits must survive. Without
 *                                  `keep` the flattening edits absorb themselves
 *                                  and the transform silently does nothing.
 */
export function applySourceOps(slice, results, label, absorb) {
  const resultsArr = Array.isArray(results) ? results : [results];
  let regions = null;
  let keep = null;
  if (Array.isArray(absorb)) regions = absorb;
  else if (absorb && Array.isArray(absorb.regions)) { regions = absorb.regions; keep = absorb.keep || null; }
  let ops = resultsArr.flatMap((result) => {
    const mine = toOps(result);
    if (!regions || !regions.length || result === keep) return mine;
    return mine.filter((op) => !regions.some((rg) => op.pos >= rg.start && op.end <= rg.end));
  });
  if (!ops.length) return slice;
  let out = String(slice);
  for (const op of ops.sort((a, b) => (b.pos - a.pos) || (b.end - a.end))) {
    if (op.pos < 0 || op.end < op.pos || op.end > out.length) {
      throw new Error((label || 'source transform') + ' edit is outside the function');
    }
    out = out.slice(0, op.pos) + op.text + out.slice(op.end);
  }
  return out;
}
