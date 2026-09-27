// Clean verification of the two worker auth fixes. Does not edit anything.
//
// THE TWO BUGS
//
// 1. CORS_HEADERS allowed only Content-Type while the dashboard sends
//    X-SH-Token, so the browser's preflight failed and the request was blocked
//    before it left the page. Symptoms: `TypeError: Failed to fetch`.
//
// 2. isOwnerSessionOrAccount(env, url, body) read `request.headers`, and no
//    `request` was in scope - not a parameter, no module-level binding. A GET has
//    no body, so the credential chain fell through to that line and the route
//    returned 500. POSTs that carry the token in the body short-circuited before
//    it, which is why this hid behind bug 1 rather than beside it.
import fs from 'node:fs';

const src = fs.readFileSync('For Cloudflare/worker.js', 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const L = src.split(/\r?\n/);

// line index -> character offset, so a line can be located inside the raw text
const off = [];
{ let p = 0; for (const l of L) { off.push(p); p += l.length + EOL.length; } }

let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// brace-matched body of a function, so the scan cannot run past its end
function fnBody(name) {
  const at = src.indexOf('async function ' + name + '(');
  if (at < 0) return null;
  let depth = 0, started = false;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

// 1. the signature
if (/async function isOwnerSessionOrAccount\(env, url, body, request\) \{/.test(src)) ok('isOwnerSessionOrAccount takes request');
else no('isOwnerSessionOrAccount does not take request - every GET admin route will throw');

// 2. every CALL site (not the definition) passes request
//
// The COUNT is derived, never hard-coded. It was 13, and became 12 when the
// announcement routes were removed - which is the test working, not breaking. A
// hard-coded number here would have failed on a legitimate removal and taught
// everyone to update it without reading why, which is how a real regression gets
// waved through later.
{
  const calls = L.filter(l => !l.includes('async function') && /isOwnerSessionOrAccount\(env,/.test(l));
  const withReq = calls.filter(l => /isOwnerSessionOrAccount\(env, [^)]*, request\)/.test(l));
  if (calls.length > 0 && withReq.length === calls.length) {
    ok('all ' + calls.length + ' call sites pass request');
  } else {
    no('call sites: ' + calls.length + ' total, ' + withReq.length + ' with request');
  }
  // A floor, so removing routes cannot quietly remove the auth check itself.
  if (calls.length >= 8) ok('the owner surface is still substantial (' + calls.length + ' gated routes)');
  else no('only ' + calls.length + ' owner-gated routes remain - did a route get removed by accident?');
}

// 3. isOwnerRequest call sites likewise
{
  const calls = L.filter(l => !l.includes('async function') && /[^A-Za-z]isOwnerRequest\(env,/.test(l));
  const withReq = calls.filter(l => /isOwnerRequest\(env, [^)]*, request\)/.test(l));
  if (calls.length > 0 && withReq.length === calls.length) ok('all ' + calls.length + ' isOwnerRequest call sites pass request');
  else no('isOwnerRequest: ' + calls.length + ' call sites, ' + withReq.length + ' with request');
}

// 4. THE BUG: an unguarded `request.` inside either helper
{
  let bad = 0;
  for (const fn of ['isOwnerSessionOrAccount', 'isOwnerRequest']) {
    const body = fnBody(fn);
    if (!body) { no(fn + ' not found'); bad++; continue; }
    for (const l of body.split(/\r?\n/)) {
      if (/(^|[^.\w'])request\./.test(l) && !/hdr\(|request &&/.test(l)) {
        no(fn + ': unguarded read ->  ' + l.trim());
        bad++;
      }
    }
  }
  if (!bad) ok('no unguarded request.* in either auth helper - a GET cannot throw ReferenceError');
}

// 5. no module-level `request` binding, which would race between concurrent requests
if (/^\s*(let|var|const)\s+request\b/m.test(src)) no('a module-level request binding exists - concurrent requests would read each others tokens');
else ok('no module-level request binding (concurrent-request safe)');

// 6. every call site is inside handleRequest, where `request` is a parameter
{
  const h = src.indexOf('async function handleRequest(');
  if (h < 0) { no('handleRequest is gone'); }
  else {
    const outside = L.map((l, i) => [l, i]).filter(([l]) =>
      !l.includes('async function') && /isOwnerSessionOrAccount\(env,/.test(l) && off[0] !== undefined && 0
    );
    // count call sites whose char offset precedes handleRequest
    let before = 0, total = 0;
    for (let i = 0; i < L.length; i++) {
      if (L[i].includes('async function') || !/isOwnerSessionOrAccount\(env,/.test(L[i])) continue;
      total++;
      if (off[i] < h) before++;
    }
    if (before === 0 && total > 0) ok('all ' + total + ' call sites sit inside handleRequest, where request is a parameter');
    else no(before + ' of ' + total + ' call sites are OUTSIDE handleRequest - request would be undefined there');
    void outside;
  }
}

// 7. the GET credential path that needs no custom header
{
  const body = fnBody('isOwnerSessionOrAccount') || '';
  if (/searchParams\.get\('userToken'\)/.test(body)) ok("a GET may carry ?userToken= - no custom header, so no preflight can reject it");
  else no('no query-string credential path for GETs');
}

// 8. CORS allows the header
if (/Access-Control-Allow-Headers':\s*'Content-Type, X-SH-Token/.test(src)) ok('CORS allows X-SH-Token');
else no('CORS does not allow X-SH-Token');

console.log('');
console.log(fail ? 'WORKER AUTH FIX   ' + fail + ' FAILED' : 'WORKER AUTH FIX   8 checks passed');
process.exit(fail ? 1 : 0);
