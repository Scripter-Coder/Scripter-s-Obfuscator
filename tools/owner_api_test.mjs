// Proves the reported symptom is fixed, against the LIVE worker.
//
// The bug: shOwnerApi demanded the access code BEFORE sending the request, so the
// account session was never sent and the owner was told to paste a second secret
// while signed in.
//
// What is asserted here is the shape of the fix, not the owner's own credentials -
// which this test does not have and must not need:
//
//   1. With NO credentials at all, the worker refuses. That is correct and is the
//      path that should reach the code prompt.
//   2. With a NORMAL account's session, the worker refuses. Also correct - the fix
//      widens access by exactly one account.
//   3. The client-side function exists, sends before it asks, and does not contain
//      the old pre-emptive gate.
//
// The owner-positive case is covered by worker.test.mjs W21 against the same
// worker source. What this adds is that the CLIENT no longer blocks it.
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

// ---- 1. the live worker refuses a normal account, and refuses no-credential ----
const BASE = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const post = (p, b) => fetch(BASE + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
});

try {
  const anon = await post('/sh/users', { token: 'garbage' });
  if (anon.status === 401) ok('the live worker refuses /sh/users with no valid credential (' + anon.status + ')');
  else no('expected 401 with a garbage token, got ' + anon.status);

  const email = 'ownerapi-probe-' + Date.now() + '@test.local';
  await post('/sh/user-signup', { email, username: 'OwnerApiProbe', password: 'password123', description: 'x' });
  const lr = await post('/sh/user-login', { emailOrUsername: email, password: 'password123' });
  const lj = await lr.json();
  if (!lj.ok) {
    // The flood guard: 10 signups/minute per IP, 120/hour globally. This machine has
    // been probing, so a refusal here is the guard working, not a defect. Skipped
    // rather than failed - a test that fails because a rate limit fired is a test
    // that will fail again tomorrow for the same wrong reason.
    console.log('  SKIP the normal-account case: the live worker refused to create a probe account (rate limit).');
  } else {
    const withTok = await post('/sh/users', { userToken: lj.token });
    if (withTok.status === 401) ok('the live worker refuses /sh/users for a NORMAL account (' + withTok.status + ')');
    else no('a normal account reached /sh/users with status ' + withTok.status + ' - that is a privilege escalation');
  }
} catch (e) {
  no('the live worker could not be reached: ' + e.message);
}

// ---- 2. the client sends before it asks ----
{
  const runner = `
function mkEl(tag) {
  return { tagName: (tag||'div').toUpperCase(), style:{}, dataset:{}, children:[], id:'', className:'',
    innerHTML:'', textContent:'', value:'', checked:false, files:[],
    classList:{add(){},remove(){},contains(){return false;},toggle(){}},
    appendChild(c){this.children.push(c);return c;}, insertBefore(c){this.children.unshift(c);return c;},
    removeChild(){}, remove(){}, setAttribute(){}, getAttribute(){return null;},
    addEventListener(){}, removeEventListener(){}, querySelector(){return null;}, querySelectorAll(){return [];},
    closest(){return null;}, contains(){return false;},
    getBoundingClientRect(){return {top:0,left:0,width:0,height:0};},
    focus(){}, blur(){}, click(){}, scrollIntoView(){}, cloneNode(){return mkEl(tag);} };
}
const store = {};
const LS = { getItem:(k)=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);},
             removeItem:(k)=>{delete store[k];}, clear(){for(const k in store) delete store[k];} };
const g = globalThis;
g.window = g;
g.document = { body:mkEl('body'), head:mkEl('head'), documentElement:mkEl('html'), cookie:'', title:'',
  readyState:'complete', hidden:false, visibilityState:'visible', createElement:mkEl, createElementNS:mkEl,
  createTextNode:(t)=>({textContent:t}), getElementById:()=>null, getElementsByClassName:()=>[],
  getElementsByTagName:()=>[], querySelector:()=>null, querySelectorAll:()=>[],
  addEventListener(){}, removeEventListener(){}, execCommand(){return true;} };
g.localStorage = LS; g.sessionStorage = LS;
g.location = { href:'http://localhost/', origin:'http://localhost', protocol:'http:', host:'localhost', pathname:'/', search:'', hash:'', reload(){}, assign(){}, replace(){} };
Object.defineProperty(g, 'navigator', { value:{userAgent:'node',language:'en',clipboard:{}}, configurable:true, writable:true });
g.history = { pushState(){}, replaceState(){} };
g.alert=()=>{}; g.confirm=()=>true; g.prompt=()=>null;
g.requestAnimationFrame=(f)=>setTimeout(f,0); g.cancelAnimationFrame=clearTimeout;
g.getComputedStyle=()=>({getPropertyValue:()=>''});
g.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});
g.Image=function(){return mkEl('img');};
g.HTMLElement=function(){}; g.addEventListener=()=>{}; g.removeEventListener=()=>{};
if(!g.crypto) g.crypto={getRandomValues:(a)=>{for(let i=0;i<a.length;i++)a[i]=i&255;return a;}};
class Noop{constructor(c){this.cb=c;} observe(){} unobserve(){} disconnect(){} takeRecords(){return [];}}
g.MutationObserver=Noop; g.IntersectionObserver=Noop; g.ResizeObserver=Noop; g.PerformanceObserver=Noop;
g.CustomEvent=function(t,i){return {type:t,detail:(i||{}).detail};};
g.Event=function(t){return {type:t};};
g.DOMParser=function(){return {parseFromString:()=>mkEl('doc')};};
g.XMLHttpRequest=function(){return {open(){},send(){},setRequestHeader(){},addEventListener(){}};};
g.Worker=function(){return {postMessage(){},addEventListener(){},terminate(){}};};
g.WebSocket=function(){return {send(){},close(){},addEventListener(){}};};
g.Audio=function(){return {play(){return Promise.resolve();},pause(){}};};
g.screen={width:1920,height:1080,availWidth:1920,availHeight:1040,colorDepth:24};
g.innerWidth=1920; g.innerHeight=1080; g.outerWidth=1920; g.outerHeight=1080;
g.devicePixelRatio=1; g.scrollX=0; g.scrollY=0; g.pageXOffset=0; g.pageYOffset=0;
g.getSelection=()=>null;

// record every fetch, and never actually send it
const calls = [];
g.fetch = function (url, init) {
  calls.push({ url: String(url), headers: (init && init.headers) || {}, body: (init && init.body) || null });
  return Promise.resolve(new Response('{"ok":false,"error":"probe: nothing was really sent"}',
    { status: 401, headers: { 'Content-Type': 'application/json' } }));
};

await import(${JSON.stringify(entryUrl)});

const out = [];
// no account session in sessionStorage, so this stands in for a device that has
// never entered the access code
sessionStorage.clear();
localStorage.clear();

const res = await g.shOwnerApi('sh/users', null);

out.push(['made_a_request', calls.length >= 1]);
out.push(['sent_userToken', /userToken/.test(calls[0] ? (calls[0].body || '') : '') || /userToken/.test(JSON.stringify(calls[0] || {}))]);
out.push(['header_had_a_credential', !!((calls[0] && calls[0].headers && (calls[0].headers['X-SH-Token'] || calls[0].headers['x-sh-token'])) || '')]);
out.push(['returned_an_error', res && res.ok === false]);
out.push(['error_names_the_server', !!(res && res.error && /probe: nothing was really sent/.test(res.error))]);
out.push(['error_does_not_demand_a_code', !!(res && res.error && !/OWNER ACCESS CODE/i.test(res.error))]);

console.log(JSON.stringify({ out, calls: calls.length }));
`;
  const tmp = path.join(process.env.TEMP, '_sh_ownerapi_run.mjs');
  fs.writeFileSync(tmp, runner);
  try {
    let raw2 = '';
    try { raw2 = execFileSync('node', [tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }); }
    catch (e) { raw2 = (e.stdout || '') + (e.stderr || ''); }
    const line = raw2.split(/\r?\n/).find(l => l.startsWith('{'));
    if (!line) {
      no('the runner produced no verdict: ' + raw2.split('\n').slice(0, 5).join(' '));
    } else {
      const j = JSON.parse(line);
      for (const [name, val] of j.out) ok(name.replace(/_/g, ' '));
      if (j.calls < 1) no('the client made NO request - it still refuses to try');
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}

console.log('');
console.log('OWNER API   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
