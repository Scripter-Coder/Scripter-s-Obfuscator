// Every inline handler in index.html must name something that actually exists.
//
// THE BUG
//
//     <script type="module" src="./main.js"></script>
//
// A module's top-level declarations are NOT properties of `window`. An inline
//     onclick="uploadCustomBackground()"
// resolves in global scope, so it throws
//
//     Uncaught ReferenceError: uploadCustomBackground is not defined
//
// and the button silently does nothing. No request, no error, no feedback. That
// was the whole of the reported "background changer doesn't work, does nothing",
// and it also explains "I didn't move the custom background" - the code that moves
// it was never reachable. Eight handlers were dead this way, including
// showPage('home') on the navbar brand.
//
// main.js exports ~110 names explicitly, so this is a list that has to be
// complete and nothing but a diff can tell you when it is not.
//
// TWO TRAPS THIS TEST FELL INTO, both kept as guards:
//
// 1. "Exported" is not "defined". Collecting only the left-hand side of
//    `window.X = X;` makes a name look reachable when no such binding exists.
//    Doing that to openCreateRewardUI produced
//    `ReferenceError: showPage is not defined` at BUNDLE-IMPORT time, which
//    broke the entire site to fix one dead link. So each export is checked
//    against a real declaration.
//
// 2. Not every global comes from main.js. Two other sources reach global scope
//    legitimately, and a main.js-only test calls both of them dead:
//
//      * index.html's own inline CLASSIC <script> blocks - a classic script is
//        not a module, so its functions really are on window. shImgErr is
//        defined there and has always worked.
//      * other scripts index.html loads, which may publish to window themselves.
//        rewards.js does, and openCreateRewardUI comes from it - in a file that
//        index.html was not loading at all.
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const main = fs.readFileSync('main.js', 'utf8');

let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// ---- is a name a real declaration in this text? ----
const isDeclared = (src, name) => new RegExp(
  '(^|\\n)\\s*(async\\s+)?function\\s+' + name + '\\s*\\(|' +      // function decl
  '(^|\\n)\\s*(const|let|var)\\s+' + name + '\\s*=|' +             // binding
  '(^|\\n)\\s*' + name + '\\s*=\\s*(async\\s+)?function'            // fn expression
).test(src);

// ---- exports from main.js: defined, or a problem ----
// A literal on the right is a value, not a binding: `window.currentUser = null`
// is how a module publishes a variable it already declared, and `null` is not
// expected to be declared anywhere.
const LITERALS = new Set(['null', 'true', 'false', 'undefined', 'NaN', 'Infinity']);

const exported = new Set();
const bogus = new Map();
for (const m of main.matchAll(/^\s*window\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/gm)) {
  const name = m[1], target = m[2];
  if (LITERALS.has(target)) { exported.add(name); continue; }
  if (isDeclared(main, target)) exported.add(name);
  else if (!bogus.has(name)) bogus.set(name, target);
}

if (bogus.size > 0) {
  no('main.js exports ' + bogus.size + ' name(s) with no declaration - each throws at import and breaks the whole bundle:');
  for (const [name, target] of bogus) console.log('         window.' + name + ' = ' + target + ';   // "' + target + '" is not defined');
} else {
  ok('every name main.js exports is a real declaration (' + exported.size + ' of them)');
}

// ---- globals from elsewhere ----
const elsewhere = new Set();
for (const blk of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  for (const m of blk[1].matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) elsewhere.add(m[1]);
  for (const m of blk[1].matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) elsewhere.add(m[1]);
  for (const m of blk[1].matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) elsewhere.add(m[1]);
}

const sideScripts = [];
for (const m of html.matchAll(/<script[^>]*\bsrc="\.?\/?([^"]+)"/gi)) {
  const f = m[1].replace(/^\.\//, '');
  if (f === 'main.js' || !fs.existsSync(f)) continue;
  sideScripts.push(f);
  const s = fs.readFileSync(f, 'utf8');
  for (const w of s.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) elsewhere.add(w[1]);
}
if (sideScripts.length) ok('other loaded scripts: ' + sideScripts.join(', '));
else ok('index.html loads no other local script');

// ---- every inline handler must resolve ----
const NATIVE = new Set([
  'if', 'for', 'while', 'return', 'typeof', 'confirm', 'alert', 'prompt', 'event',
  'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'JSON', 'encodeURIComponent',
  'decodeURIComponent', 'setTimeout', 'setInterval', 'Date', 'Math', 'Object', 'Array',
  'this', 'function', 'new', 'catch', 'void', 'delete', 'await', 'null', 'true', 'false',
]);

const called = new Map();
for (const m of html.matchAll(/\bon(?:click|change|input|submit|error|load)\s*=\s*"([^"]*)"/gi)) {
  const attr = m[0];
  for (const c of attr.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const n = c[1];
    if (!called.has(n)) called.set(n, attr.trim().slice(0, 88));
  }
}

const missing = [...called.entries()].filter(([n]) =>
  !NATIVE.has(n) && !exported.has(n) && !elsewhere.has(n));

if (missing.length === 0) {
  ok('all ' + called.size + ' inline handlers resolve to a real function');
} else {
  no(missing.length + ' inline handler(s) name something that does not exist:');
  for (const [n, attr] of missing) console.log('         ' + n + '\n           in ' + attr);
}

// ---- and the module assumption, which is the cause ----
if (/<script\s+type="module"\s+src="\.\/main\.js"/.test(html)) {
  ok('main.js is a module, so the export list is what makes inline handlers work');
} else {
  no('main.js is not a module - if that changes, the export list may no longer be needed');
}

// ---- a module cannot serve an inline handler on its own ----
{
  const modLoaded = [...html.matchAll(/<script\s+type="module"\s+src="\.?\/?([^"]+)"/gi)].map(m => m[1]);
  const dead = modLoaded.filter(f => {
    if (!fs.existsSync(f)) return false;
    const s = fs.readFileSync(f, 'utf8');
    // a module that defines an inline-called function but never puts it on window
    for (const [n] of called) {
      if (NATIVE.has(n)) continue;
      if (isDeclared(s, n) && !new RegExp('window\\.' + n + '\\s*=').test(s)) return true;
    }
    return false;
  });
  if (dead.length === 0) {
    ok('no loaded module relies on its exports being global');
  } else {
    no(dead.join(', ') + ' defines an inline-called function without publishing it to window - the button cannot work');
  }
}

console.log('');
console.log(fail ? 'INLINE HANDLERS   ' + missing.length + ' unreachable, ' + bogus.size + ' bogus exports'
                   : 'INLINE HANDLERS   all ' + called.size + ' handlers reachable');
process.exit(fail ? 1 : 0);
