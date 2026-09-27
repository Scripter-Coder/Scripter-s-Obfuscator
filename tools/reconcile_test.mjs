// Proves the reported bug is fixed: an account that exists ONLY on the device
// must SURVIVE a cloud refresh.
//
// The old code deleted it, silently, on the next boot or Refresh - which is
// exactly "I made an alt account and it disappeared". This runs the real
// reconcile out of the real bundle against a cloud map that does not contain the
// account, and requires it to survive and be marked instead.
//
// It also checks the two cases that used to destroy accounts that WERE on the
// cloud: a partial read, and a cloud record with empty images.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const distDir = path.join(root, 'dist', 'assets');
const bundleName = fs.readdirSync(distDir).find(f => /^main-.*\.js$/.test(f));
if (!bundleName) { console.error('no bundle - run npm run build'); process.exit(1); }
const entryUrl = pathToFileURL(path.join(distDir, bundleName)).href;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

const runner = `
function mkEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [],
    id: '', className: '', innerHTML: '', textContent: '', value: '', checked: false, files: [],
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    appendChild(c){ this.children.push(c); return c; }, insertBefore(c){ this.children.unshift(c); return c; },
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
  getElementById: () => null, getElementsByClassName: () => [], getElementsByTagName: () => [],
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener(){}, removeEventListener(){}, execCommand(){ return true; }
};
g.localStorage = LS; g.sessionStorage = LS;
g.location = { href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:', host: 'localhost', pathname: '/', search: '', hash: '', reload(){}, assign(){}, replace(){} };
Object.defineProperty(g, 'navigator', { value: { userAgent: 'node', language: 'en', clipboard: {} }, configurable: true, writable: true });
g.history = { pushState(){}, replaceState(){} };
g.alert = () => {}; g.confirm = () => true; g.prompt = () => null;
g.requestAnimationFrame = (f) => setTimeout(f, 0); g.cancelAnimationFrame = clearTimeout;
g.getComputedStyle = () => ({ getPropertyValue: () => '' });
g.matchMedia = () => ({ matches: false, addEventListener(){}, addListener(){} });
g.fetch = () => Promise.reject(new Error('offline'));
g.Image = function () { return mkEl('img'); };
g.HTMLElement = function () {}; g.addEventListener = () => {}; g.removeEventListener = () => {};
if (!g.crypto) g.crypto = { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = i & 255; return a; } };
class NoopObserver { constructor(cb){ this.cb = cb; } observe(){} unobserve(){} disconnect(){} takeRecords(){ return []; } }
g.MutationObserver = NoopObserver; g.IntersectionObserver = NoopObserver;
g.ResizeObserver = NoopObserver; g.PerformanceObserver = NoopObserver;
g.CustomEvent = function (t, i) { return { type: t, detail: (i || {}).detail }; };
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

await import(${JSON.stringify(entryUrl)});

const out = [];
// The LIVE map, not a snapshot taken at import time: the users variable is
// reassigned wholesale in a couple of places, so a stale copy would let this
// test pass against a map the app is not using.
const users = g.__shUsersRef();
if (!users || typeof users !== 'object') throw new Error('__shUsersRef did not return the users map');

// --- CASE 1: an account the cloud does not know about must SURVIVE ---
users['alt@test.local'] = { id: 'u_alt', email: 'alt@test.local', username: 'AltUser', plan: 'Basic', password: 'b64' };
users['owner@test.local'] = { id: 'u_owner', email: 'owner@test.local', username: 'Owner', plan: 'God' };
// the cloud knows ONLY the owner
const cloud = { 'owner@test.local': { id: 'u_owner', email: 'owner@test.local', username: 'Owner', plan: 'God' } };

const localOnly = g.shReconcileWithCloud(cloud);
out.push(['CASE1_survived', !!users['alt@test.local']]);
out.push(['CASE1_marked', !!(users['alt@test.local'] && users['alt@test.local'].notOnCloud)]);
out.push(['CASE1_counted', localOnly === 1]);
out.push(['CASE1_owner_untouched', !!users['owner@test.local'] && !users['owner@test.local'].notOnCloud]);

// --- CASE 2: a PARTIAL cloud read must not destroy anyone ---
users['second@test.local'] = { id: 'u2', email: 'second@test.local', username: 'Second', plan: 'Basic' };
g.shReconcileWithCloud({});   // empty response - e.g. a truncated KV value
out.push(['CASE2_alt_still_there', !!users['alt@test.local']]);
out.push(['CASE2_second_survived', !!users['second@test.local']]);

// --- CASE 3: a cloud record must not blank a local image or password ---
users['img@test.local'] = {
  id: 'u3', email: 'img@test.local', username: 'Img', plan: 'Basic',
  password: 'b64secret', profileImage: 'data:image/png;base64,AAA', bannerImage: 'data:image/png;base64,BBB',
  customBackground: 'data:image/png;base64,CCC'
};
g.shReconcileWithCloud({
  'img@test.local': { id: 'u3', email: 'img@test.local', username: 'Img', plan: 'Basic', profileImage: '', bannerImage: '', customBackground: '' }
});
const r = users['img@test.local'];
out.push(['CASE3_password_kept', r.password === 'b64secret']);
out.push(['CASE3_profile_kept', r.profileImage === 'data:image/png;base64,AAA']);
out.push(['CASE3_banner_kept', r.bannerImage === 'data:image/png;base64,BBB']);
out.push(['CASE3_background_kept', r.customBackground === 'data:image/png;base64,CCC']);

// --- CASE 4: the marker clears once the account IS on the cloud ---
users['later@test.local'] = { id: 'u4', email: 'later@test.local', username: 'Later', plan: 'Basic' };
g.shReconcileWithCloud({});
out.push(['CASE4_marked_first', !!users['later@test.local'].notOnCloud]);
g.shReconcileWithCloud({ 'later@test.local': { id: 'u4', email: 'later@test.local', username: 'Later', plan: 'Basic' } });
out.push(['CASE4_cleared_after_sync', !users['later@test.local'].notOnCloud]);

// --- CASE 5: a junk response must not wipe anything ---
users['safe@test.local'] = { id: 'u5', email: 'safe@test.local', username: 'Safe', plan: 'Basic' };
g.shReconcileWithCloud(null);
g.shReconcileWithCloud(undefined);
g.shReconcileWithCloud('not an object');
out.push(['CASE5_survives_junk', !!users['safe@test.local'] && !users['safe@test.local'].notOnCloud]);

console.log(JSON.stringify(out));
`;

const tmp = path.join(process.env.TEMP, '_sh_reconcile_run.mjs');
fs.writeFileSync(tmp, runner);

try {
  let raw2 = '';
  try {
    raw2 = execFileSync('node', [tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
  } catch (e) {
    raw2 = (e.stdout || '') + (e.stderr || '');
  }
  const line = raw2.split(/\r?\n/).find(l => l.startsWith('['));
  if (!line) { no('the runner produced no verdict: ' + raw2.split('\n').slice(0, 4).join(' ')); }
  else {
    for (const [name, val] of JSON.parse(line)) {
      if (val) ok(name.replace(/CASE\d_/, '').replace(/_/g, ' '));
      else no(name.replace(/CASE\d_/, '').replace(/_/g, ' ') + '  <- the account was destroyed');
    }
  }
} finally {
  try { fs.unlinkSync(tmp); } catch (e) {}
}

console.log('');
console.log('RECONCILE   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
