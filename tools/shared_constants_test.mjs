// A constant must be declared where every function that uses it can see it.
//
// THE BUG
//
//     function shPushUser(user) {
//         ...
//         var SH_IMAGE_CAP = 1900000;        // declared INSIDE shPushUser
//         var profileImage = ... <= SH_IMAGE_CAP ...
//
// and ~3300 lines later, in a completely different function:
//
//     function uploadCustomBackground() {
//         compressImageFile(file, 1920, 0.72).then(function (imageData) {
//             if (typeof imageData === 'string' && imageData.length > SH_IMAGE_CAP) {
//
// `var` is function-scoped. That second reference is not the cap - it is nothing,
// and it throws "ReferenceError: SH_IMAGE_CAP is not defined", which rejects the
// promise chain one line before the save. The background painted, compression
// succeeded, and the result was thrown away. The user saw "Failed to save
// background" and a background that vanished on reload.
//
// Stacked on top of a dead button (uploadCustomBackground was never reachable
// from the markup), the feature had two independent faults - which is why
// fixing either one alone changed nothing observable. That is the general lesson:
// when a reported symptom survives a fix, the fix found only half the cause.
//
// WHAT IS CHECKED
//
// That the cap is one module-scope const, and that the OTHER shared limits in
// this file are not in the same trap. `var` declared inside a function and read
// outside it is invisible to the language and to every other test in the repo -
// nothing else here executes the image path.
import fs from 'node:fs';

const main = fs.readFileSync('main.js', 'utf8');
const lines = main.split(/\r?\n/);
const code = lines.filter(l => !/^\s*\/\//.test(l));

let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// ---- the cap is declared exactly once, at the top level ----
{
  const decls = code.filter(l => /SH_IMAGE_CAP\s*=\s*1900000/.test(l));
  if (decls.length === 1 && /^const SH_IMAGE_CAP = 1900000;$/.test(decls[0])) {
    ok('SH_IMAGE_CAP is one top-level const');
  } else {
    no('SH_IMAGE_CAP is declared ' + decls.length + ' time(s): ' + decls.map(s => s.trim()).join(' | '));
  }
}

// ---- and the real users are still there, so the check is not vacuous ----
{
  const uses = code.filter(l => /SH_IMAGE_CAP/.test(l) && !/SH_IMAGE_CAP\s*=\s*1900000/.test(l));
  const inShPush = code.some(l => /function shPushUser/.test(l));
  const inUpload = code.some(l => /function uploadCustomBackground/.test(l));
  if (uses.length >= 3 && inShPush && inUpload) {
    ok('the cap is still read in ' + uses.length + ' places, including both uploaders and shPushUser');
  } else {
    no('expected the cap to be used by shPushUser and uploadCustomBackground, found ' + uses.length + ' uses');
  }
}

// ---- THE GENERAL CHECK: no `var` read outside the function that declares it ----
//
// This is the part that would have caught it. Any `var NAME = <number>;` that is
// indented inside a function, while a bare `NAME` is read somewhere the function
// does not enclose, is a ReferenceError waiting to happen.
{
  // find the innermost function that encloses each line, by brace depth per
  // top-level function. Cheaper and just as effective: for every `var X = <num>`
  // declared at an indent > 0, check whether X is read at an indent <= that of
  // any place outside all enclosing function bodies. Doing that properly needs a
  // scope map, so this uses a targeted version: a numeric `var` declared inside
  // a function, whose name is also used in a DIFFERENT top-level function.
  const topLevelFns = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
    if (m) topLevelFns.push({ name: m[1], start: i });
  }
  for (let i = 0; i < topLevelFns.length; i++) {
    topLevelFns[i].end = (topLevelFns[i + 1] ? topLevelFns[i + 1].start : lines.length);
  }
  const ownerOf = (lineIdx) => {
    for (const f of topLevelFns) if (lineIdx >= f.start && lineIdx < f.end) return f.name;
    return null;
  };

  const suspects = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\//.test(lines[i])) continue;
    const d = /^\s+var\s+([A-Z][A-Z0-9_]{2,})\s*=\s*[-0-9]/.exec(lines[i]);
    if (!d) continue;
    const name = d[1];
    const owner = ownerOf(i);
    if (!owner) continue;                       // already top-level, fine
    // is it read from any OTHER top-level function?
    const others = new Set();
    for (let j = 0; j < lines.length; j++) {
      if (j === i) continue;
      if (/^\s*\/\//.test(lines[j])) continue;
      if (!new RegExp('\\b' + name + '\\b').test(lines[j])) continue;
      // ignore the declaration line and its own RHS
      if (/^\s*var\s+' + name + '\s*=/.test(lines[j])) continue;
      const o = ownerOf(j);
      if (o && o !== owner) others.add(o);
    }
    if (others.size) {
      suspects.push({ name, owner, readIn: [...others].join(', ') });
    }
  }

  if (suspects.length === 0) {
    ok('no function-scoped numeric constant is read from another function');
  } else {
    no(suspects.length + ' function-scoped constant(s) are read outside their function - each throws at runtime:');
    for (const s of suspects) console.log('         ' + s.name + ' declared in ' + s.owner + '() and read in ' + s.readIn);
  }
}

console.log('');
console.log(fail ? 'SHARED CONSTANTS   ' + fail + ' FAILED' : 'SHARED CONSTANTS   all checks passed');
process.exit(fail ? 1 : 0);
