// CORS preflight: the browser, and only the browser, enforces it.
//
// THE BUG THIS EXISTS FOR
//
//     'Access-Control-Allow-Headers': 'Content-Type',
//
// and the dashboard sends X-SH-Token on every owner call. The browser's preflight
// therefore failed and the request was blocked BEFORE IT LEFT THE PAGE:
//
//     Access to fetch at 'https://<worker>/sh/health' from origin
//     'https://<site>' has been blocked by CORS policy: Request header field
//     x-sh-token is not allowed by Access-Control-Allow-Headers in preflight
//     response.
//
// From inside the app that surfaced as `TypeError: Failed to fetch` - not a 401,
// not a wrong password, not an auth problem. Nothing reached the worker, so the
// worker could not answer, and the client rendered a network failure as "Owner
// sign-in required".
//
// WHY NOTHING CAUGHT IT, which is the part worth remembering: the routes were
// correct, the tokens were correct, and a direct curl of the same URL returned
// 200. Every server-side test passed. Only a real browser enforces preflight, and
// a cross-origin fetch from one is the only thing in this repo that could have
// seen it.
import assert from 'assert';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

const src = fs.readFileSync('For Cloudflare/worker.js', 'utf8');

// the header block
const block = /const CORS_HEADERS = \{([\s\S]*?)\};/.exec(src);
if (!block) { console.error('CORS_HEADERS not found in the worker'); process.exit(1); }
const body = block[1];

// 1. every header the CLIENT actually sends must be allowed
{
  const js = fs.readFileSync('main.js', 'utf8');
  const sent = new Set();
  // collect header names from every fetch headers object literal
  for (const m of js.matchAll(/headers:\s*\{([^}]*)\}/g)) {
    for (const h of m[1].matchAll(/['"]([A-Za-z0-9-]+)['"]\s*:/g)) sent.add(h[1]);
  }
  // and from the diagnostics probes, which build the object separately
  for (const m of js.matchAll(/'X-SH-[A-Za-z-]+'/g)) sent.add(m[0].replace(/'/g, ''));

  const allowed = (/'Access-Control-Allow-Headers':\s*'([^']+)'/.exec(body) || [])[1] || '';
  const allowedSet = new Set(allowed.split(',').map(s => s.trim().toLowerCase()));

  const missing = [...sent].filter(h => !allowedSet.has(h.toLowerCase()));
  if (missing.length === 0) {
    ok('every custom header the client sends is in Access-Control-Allow-Headers');
  } else {
    no('the client sends ' + missing.join(', ') + ' but the worker does not allow it - the browser will block every one of those requests');
  }
  console.log('       client sends: ' + [...sent].join(', '));
  console.log('       worker allows: ' + allowed);
}

// 2. the specific header that broke it
{
  const allowed = (/'Access-Control-Allow-Headers':\s*'([^']+)'/.exec(body) || [])[1] || '';
  if (/x-sh-token/i.test(allowed)) ok('X-SH-Token is allowed');
  else no('X-SH-Token is NOT in Access-Control-Allow-Headers - this is the bug that broke every owner call from a browser');
}

// 3. the preflight must be answered, and answer with those headers
{
  const opt = /if \(request\.method === 'OPTIONS'\) \{[\s\S]{0,200}?\}/.exec(src);
  if (opt && /CORS_HEADERS/.test(opt[0])) ok('OPTIONS is answered with CORS_HEADERS');
  else no('the OPTIONS preflight does not answer with CORS_HEADERS');
}

// 4. methods the client uses must be allowed
{
  const allowed = (/'Access-Control-Allow-Methods':\s*'([^']+)'/.exec(body) || [])[1] || '';
  const need = ['GET', 'POST', 'OPTIONS'];
  const missing = need.filter(m => !new RegExp('\\b' + m + '\\b', 'i').test(allowed));
  if (!missing.length) ok('GET, POST and OPTIONS are all allowed');
  else no('Access-Control-Allow-Methods is missing ' + missing.join(', '));
}

// 5. expose headers, so a cross-origin read can see the status
{
  if (/Access-Control-Expose-Headers/.test(body)) ok('Expose-Headers is set, so the status is readable cross-origin');
  else no('Expose-Headers is missing - a browser cannot read the response status of a cross-origin call');
}

// 6. and a regression guard: a plain Content-Type value would be the old bug
{
  if (/'Access-Control-Allow-Headers':\s*'Content-Type'\s*,?\s*$/m.test(body)) {
    no("Access-Control-Allow-Headers is back to just 'Content-Type'");
  } else {
    ok('the header list is not back to the broken single value');
  }
}

console.log('');
console.log('CORS PREFLIGHT   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
