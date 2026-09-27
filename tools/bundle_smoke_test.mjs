// Runs the BUILT bundle: imports it, then CALLS the entry points it exposes.
//
// The bug this exists for. When the Live Executions Chart was removed, the
// DECLARATION of a variable was deleted and its USE was left behind:
//
//     var ep = document.getElementById('liveChartEndpoint');     <- deleted
//     if (ep && !ep.textContent) ep.textContent = ...;            <- left behind
//
// `ep` became undeclared, so refreshAnalyticsUI() threw a ReferenceError on every
// call. Because updateUIForUser() calls it, and handleSignup() calls
// updateUIForUser() BEFORE mirroring the account to the cloud, a brand new account
// was never created server-side, never got a user token, and could not upload
// anything. It presented as "people cannot do anything", and the existing account
// was unaffected - so it read as a new-user problem rather than a regression.
//
// WHY NOTHING CAUGHT IT:
//   * `node --check` passes. This is a runtime error, not a syntax error.
//   * an IMPORT also passes - refreshAnalyticsUI() is only ever CALLED, never run
//     at import time. Verified: the bundle imported cleanly with the bug present.
//   * no other test ever executed the UI entry points. They were checked for
//     existing and for shape; none were run.
//
// Hence: import, then CALL, and fail on ReferenceError only.
//
// ReferenceError is the right discriminator, and it is not a guess. With a stub
// DOM, getElementById returns null, so these functions will throw TypeError on a
// null property - that is the harness, not the code. But a ReferenceError means
// an identifier was read that does not exist, which in a module bundle can only be
// a real defect: the bundler renames everything it emits, and Node has no implicit
// globals to fall back on.
//
// KNOWN LIMIT, stated rather than hidden: this can only reach functions the module
// exposes. A ReferenceError inside a function that is not exported is still
// invisible to it. The static check below covers the specific name that bit us.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const distDir = path.join(root, 'dist', 'assets');
const bundleName = fs.existsSync(distDir) ? fs.readdirSync(distDir).find(f => /^main-.*\.js$/.test(f)) : null;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

if (!bundleName) {
  no('no built bundle in dist/assets - run `npm run build` first');
  console.log('');
  console.log('BUNDLE SMOKE   ' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

const entryUrl = pathToFileURL(path.join(distDir, bundleName)).href;

// The runner is written out as its own file. It installs a DOM stub and only THEN
// dynamically imports the bundle: a static import would be hoisted above the setup
// and the module body would run against an undefined document, which is the
// classic way this kind of test ends up testing nothing.
const runner = `
function mkEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    style: {}, dataset: {}, children: [], id: '', className: '',
    innerHTML: '', textContent: '', value: '', checked: false, files: [],
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    appendChild(c){ this.children.push(c); return c; },
    insertBefore(c){ this.children.unshift(c); return c; },
    removeChild(){}, remove(){}, setAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }, contains(){ return false; },
    getBoundingClientRect(){ return { top: 0, left: 0, width: 0, height: 0 }; },
    focus(){}, blur(){}, click(){}, scrollIntoView(){}, cloneNode(){ return mkEl(tag); }
  };
}
const store = {};
const LS = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear() { for (const k in store) delete store[k]; }
};
const g = globalThis;
g.window = g;
g.document = {
  body: mkEl('body'), head: mkEl('head'), documentElement: mkEl('html'),
  cookie: '', title: '', readyState: 'complete', hidden: false, visibilityState: 'visible',
  createElement: mkEl, createElementNS: mkEl, createTextNode: (t) => ({ textContent: t }),
  getElementById: () => null, getElementsByClassName: () => [],
  getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [],
  addEventListener(){}, removeEventListener(){}, execCommand(){ return true; }
};
g.localStorage = LS;
g.sessionStorage = LS;
g.location = { href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:', host: 'localhost', pathname: '/', search: '', hash: '', reload(){}, assign(){}, replace(){} };
// navigator is a read-only accessor on globalThis in Node 24, so a plain
// assignment throws and the stub would never finish installing.
Object.defineProperty(g, 'navigator', { value: { userAgent: 'node', language: 'en', clipboard: {}, languages: ['en'] }, configurable: true, writable: true });
g.history = { pushState(){}, replaceState(){} };
g.alert = () => {}; g.confirm = () => true; g.prompt = () => null;
g.requestAnimationFrame = (f) => setTimeout(f, 0);
g.cancelAnimationFrame = clearTimeout;
g.getComputedStyle = () => ({ getPropertyValue: () => '' });
g.matchMedia = () => ({ matches: false, addEventListener(){}, addListener(){} });
g.fetch = () => Promise.reject(new Error('offline in the smoke test'));
g.Image = function () { return mkEl('img'); };
g.HTMLElement = function () {};
g.addEventListener = () => {};
g.removeEventListener = () => {};
if (!g.crypto) g.crypto = { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = i & 255; return a; } };

// Browser globals Node does not provide. Without these the bundle fails on the
// HARNESS rather than on the code, and a harness that fails on itself gets
// deleted instead of fixed - which is how a real check gets lost.
class NoopObserver {
  constructor(cb) { this.cb = cb; }
  observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
}
g.MutationObserver = NoopObserver;
g.IntersectionObserver = NoopObserver;
g.ResizeObserver = NoopObserver;
g.PerformanceObserver = NoopObserver;
g.CustomEvent = function (t, init) { return { type: t, detail: (init || {}).detail }; };
g.Event = function (t) { return { type: t }; };
g.DOMParser = function () { return { parseFromString: () => mkEl('doc') }; };
g.XMLHttpRequest = function () { return { open(){}, send(){}, setRequestHeader(){}, addEventListener(){} }; };
g.Worker = function () { return { postMessage(){}, addEventListener(){}, terminate(){} }; };
g.WebSocket = function () { return { send(){}, close(){}, addEventListener(){} }; };
g.Audio = function () { return { play(){ return Promise.resolve(); }, pause(){} }; };
g.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 };
g.innerWidth = 1920; g.innerHeight = 1080; g.outerWidth = 1920; g.outerHeight = 1080;
g.devicePixelRatio = 1; g.scrollX = 0; g.scrollY = 0; g.pageXOffset = 0; g.pageYOffset = 0;
g.getSelection = () => null;

let threw = null;
try {
  await import(${JSON.stringify(entryUrl)});
} catch (e) {
  threw = e;
}

if (threw) {
  console.log('THREW|' + (threw && threw.name) + '|' + (threw && threw.message));
} else {
  const ENTRY_POINTS = [
    'refreshAnalyticsUI', 'updateUIForUser', 'setAnalyticsValue', 'computeStats',
    'checkPlanLimit', 'loadAnalytics', 'saveAnalytics', 'escapeHtml', 'timeAgo',
    'formatSizeMB', 'findImageInput', 'applyTheme', 'countSince', 'setExecRange',
    'setObfRange', 'switchTab', 'showTabs'
  ];
  const refErrors = [];
  let called = 0;
  for (const name of ENTRY_POINTS) {
    const fn = g[name];
    if (typeof fn !== 'function') continue;
    called++;
    try { fn(); } catch (e) {
      if (e && e.name === 'ReferenceError') refErrors.push(name + ' -> ' + e.message);
    }
  }
  if (refErrors.length) console.log('REFERR|' + refErrors.join(' ;; '));
  else console.log('CLEAN|' + called);
}
`;

const tmp = path.join(process.env.TEMP, '_sh_bundle_smoke_run.mjs');
fs.writeFileSync(tmp, runner);

try {
  let out;
  try {
    out = execFileSync('node', [tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
    if (!/CLEAN|THREW\||REFERR\|/.test(out)) {
      no('the runner itself failed: ' + String(out).split('\n').slice(0, 5).join(' '));
      out = null;
    }
  }

  if (out !== null) {
    const line = out.split(/\r?\n/).find(l => /^CLEAN/.test(l) || l.startsWith('THREW|') || l.startsWith('REFERR|'));
    if (line && line.startsWith('REFERR|')) {
      no('entry points throw a ReferenceError: ' + line.slice(7));
      console.log('       An identifier is being read that does not exist. In a bundle that');
      console.log('       can only be a real defect - the bundler renames what it emits.');
      console.log('       Almost always a DECLARATION deleted while its USE survived.');
    } else if (line && line.startsWith('CLEAN|')) {
      ok('the bundle imports and ' + line.split('|')[1] + ' entry points run with no ReferenceError (' + bundleName + ')');
    } else if (line) {
      const parts = line.split('|');
      const name = parts[1] || '?';
      const message = parts.slice(2).join('|');
      no('the bundle throws while importing: ' + name + ': ' + message);
      console.log('       If the name is a DOM global, it is a gap in THIS harness.');
      console.log('       If it is a project name, its DECLARATION was deleted.');
    } else {
      no('the runner produced no verdict');
    }
  }

  // the specific name that bit us, checked with comments stripped so the fix note
  // - which quotes the broken line verbatim - cannot mask a real occurrence
  const src = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const code = src.split(/\r?\n/).map(l => l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')).join('\n');
  if (/(?<![.\w$])ep(?![\w$])/.test(code)) {
    no('main.js still READS the undeclared identifier named ep');
  } else {
    ok('main.js has no read of ep outside comments');
  }
} finally {
  try { fs.unlinkSync(tmp); } catch (e) {}
}

console.log('');
console.log('BUNDLE SMOKE   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
