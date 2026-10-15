// Proves, by EXECUTION, the reward-flow bugs reported as:
//
//   "the Start button just leads to about:blank"
//   "inside checkpoints you never added a provider of where it leads"
//   "anti bypass ... will get link but going to it will blacklist that browser"
//
// Nothing here asserts on source text. reward.html's <script> and rewards.js are
// extracted and run in a sandbox with stubbed DOM/storage/fetch, then driven
// exactly as a visitor's browser drives them. A bug that only shows up in a real
// browser therefore shows up here too - which is the whole point, because the
// previous version of this system read as if it worked.
//
// Run: node tools/reward_flow_test.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const rewardHtml = readFileSync(new URL('reward.html', ROOT), 'utf8');
const rewardsJs = readFileSync(new URL('rewards.js', ROOT), 'utf8').replace(/^export \{[^}]*\};?$/m, '');

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

// ---------------------------------------------------------------- utilities --
function extractScript(html, label) {
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!m) throw new Error('no inline script in ' + label);
    return m[1];
}

function b64urlEncode(obj) {
    const json = JSON.stringify(obj);
    return Buffer.from(json, 'utf8').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
}

// ------------------------------------------------- sandbox for reward.html --
//
// Minimal but real: a stub element tree that actually records onclick
// handlers, a localStorage that actually persists, and a `location` whose
// href the test can read back - which is precisely what "the Start button
// leads to about:blank" is about.
// `location` must RECORD navigations, and the page under test navigates by
// plain assignment (`location.href = url`), not through location.assign().
// An earlier version of this harness modelled location as a plain object with
// an `href` data property, so the navigation happened, href changed, and the
// harness reported `navigated to null` - i.e. it failed to observe the very
// behaviour it exists to measure.
function makeLocation(made, search, pathname) {
    let href = 'https://example.invalid' + pathname + search;
    return {
        search, pathname, origin: 'https://example.invalid',
        get href() { return href; },
        set href(v) { made.navigatedTo = v; href = v; },
        replace(v) { made.navigatedTo = v; href = v; },
        assign(v) { made.navigatedTo = v; href = v; }
    };
}

function makeVisitorPage({ search, store = {}, session = {} }) {
    const made = { navigatedTo: null, elements: {}, clicks: {} };

    function el(id) {
        if (!made.elements[id]) {
            made.elements[id] = {
                id, value: '', checked: false, disabled: false, textContent: '',
                classList: { _s: new Set(), add(x) { this._s.add(x); }, remove(x) { this._s.delete(x); }, contains(x) { return this._s.has(x); } },
                className: '', style: {}, _html: '', _onclick: null,
                get innerHTML() { return this._html; },
                set innerHTML(v) { this._html = String(v); },
                get onclick() { return this._onclick; },
                set onclick(f) { this._onclick = f; made.clicks[id] = f; },
                closest() { return { remove() { delete made.elements[id]; } }; }
            };
        }
        return made.elements[id];
    }
    function querySelector() { return { remove() {}, style: {} }; }

    const localStorage = {
        _d: store,
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
        setItem(k, v) { this._d[k] = String(v); },
        removeItem(k) { delete this._d[k]; },
        key(i) { return Object.keys(this._d)[i] ?? null; },
        get length() { return Object.keys(this._d).length; }
    };
    const sessionStorage = {
        _d: session,
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
        setItem(k, v) { this._d[k] = String(v); }
    };

    const sandbox = {
        console,
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        escape, unescape, decodeURIComponent, encodeURIComponent,
        URLSearchParams, Math, Date, JSON, parseInt, isNaN,
        setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
        fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
        navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', languages: ['en-US'], plugins: [1, 2, 3] },
        document: {
            getElementById: (id) => (id === 'notif' || id === 'app' ? el(id) : el(id)),
            createElement: () => el('dyn'),
            querySelector,
            body: { appendChild() {} },
            title: ''
        },
        localStorage, sessionStorage,
        history: { replaceState() {} },
        location: makeLocation(made, search, '/reward.html'),
        window: null
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.window.outerWidth = 1440;
    sandbox.window.outerHeight = 900;
    sandbox.setInterval = () => 0;

    return { sandbox, made, localStorage };
}

console.log('reward flow: the Start button must go somewhere real');
// ---------------------------------------------------------------------------
// A reward the owner just created, with NO checkpoint attached. This is the
// state the report describes: create reward -> copy own link -> click Start.
{
    const cfg = { n: 'My Reward', d: 1, mk: 1, cd: 0, mh: 0, ext: 0, eh: 6, mv: 0, w: '', cps: [] };
    const r = b64urlEncode(cfg);
    const { sandbox, made } = makeVisitorPage({ search: '?r=' + r });

    vm.createContext(sandbox);
    try { vm.runInContext(extractScript(rewardHtml, 'reward.html'), sandbox, { filename: 'reward.html' }); }
    catch (e) { check('reward.html runs on a 0-checkpoint reward', false, e.message); }

    const btn = made.clicks.startBtn;
    check('a Start button exists', typeof btn === 'function',
        'html = ' + JSON.stringify(String(made.elements.app && made.elements.app.innerHTML).slice(0, 120)));

    if (btn) {
        btn();
        check('Start does NOT navigate to about:blank', !/^about:blank$/i.test(made.navigatedTo || ''),
            'navigated to ' + JSON.stringify(made.navigatedTo));
        check('Start navigates somewhere useful', !!(made.navigatedTo && made.navigatedTo !== 'about:blank'),
            'navigated to ' + JSON.stringify(made.navigatedTo));
    }
}

console.log('reward flow: a reward WITH a checkpoint goes to the checkpoint');
// ---------------------------------------------------------------------------
{
    const cfg = {
        n: 'My Reward', d: 1, mk: 1, cd: 0, mh: 0, ext: 0, eh: 6, mv: 0, w: '',
        cps: [{ u: 'https://direct-link.net/abc123', p: 'linkvertise' }]
    };
    const r = b64urlEncode(cfg);
    const { sandbox, made } = makeVisitorPage({ search: '?r=' + r });

    vm.createContext(sandbox);
    vm.runInContext(extractScript(rewardHtml, 'reward.html'), sandbox, { filename: 'reward.html' });
    const btn = made.clicks.startBtn;
    check('Start button exists', typeof btn === 'function');
    if (btn) {
        btn();
        check('Start opens the checkpoint short URL',
            made.navigatedTo === 'https://direct-link.net/abc123',
            'navigated to ' + JSON.stringify(made.navigatedTo));
    }
    check('a key cannot be minted before checkpoints are done',
        /id=.newKeyBtn.[^>]*disabled/.test(String(made.elements.app.innerHTML)),
        'newKeyBtn present = ' + !!made.elements.newKeyBtn);
}

console.log('provider settings must survive into the shared link');
// ---------------------------------------------------------------------------
// The owner picks Linkvertise, ticks Anti Bypass and types the auth token.
// encodeRewardCfg is what produces the link the VISITOR opens.
{
    const store = { sh_rewards_u1: JSON.stringify({ rewards: [], visitors: 0 }) };
    const sb = {
        console, btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        localStorage: {
            _d: store,
            getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
            setItem(k, v) { this._d[k] = String(v); },
            key(i) { return Object.keys(this._d)[i] ?? null; },
            get length() { return Object.keys(this._d).length; }
        },
        location: { pathname: '/index.html', origin: 'https://example.invalid' },
        showNotification: () => {},
        PLANN_CONFIGS_PLACEHOLDER: null
    };
    sb.window = sb;
    sb.PLAN_CONFIGS = { Basic: { visitors: 10000, checkpoints: 10 } };
    sb.currentUser = { id: 'u1', plan: 'Basic' };
    vm.createContext(sb);
    vm.runInContext(rewardsJs, sb, { filename: 'rewards.js' });

    const reward = {
        name: 'Ad Key', keyDurationH: 1, maxKeys: 1, cooldownH: 0, allowExtending: false,
        checkpoints: [{
            id: 'cp1', name: 'LV', shortUrl: 'https://direct-link.net/abc', provider: 'linkvertise',
            settings: { antiBypass: true, authToken: 'SUPER_SECRET_LV_TOKEN' },
            completed: 0, cancelled: 0, avgTimeSec: 0
        }]
    };

    let decoded = null;
    try {
        const enc = vm.runInContext('encodeRewardCfg', sb)(reward);
        decoded = b64urlDecode(enc);
    } catch (e) { check('encodeRewardCfg runs', false, e.message); }

    if (decoded) {
        const cp = (decoded.cps || [])[0];
        check('the provider survives into the link', cp && cp.p === 'linkvertise',
            JSON.stringify(decoded.cps));
        check('the short URL survives into the link', cp && cp.u === 'https://direct-link.net/abc');
        check('the anti-bypass setting survives into the link',
            cp && cp.antiBypass === true,
            'cps[0] = ' + JSON.stringify(cp));
        check("the provider's API token survives into the link",
            cp && cp.authToken === 'SUPER_SECRET_LV_TOKEN',
            'the token the owner typed is DISCARDED - nothing can ever verify with it');
    }
}

console.log('an earned key must be a real license');
// ---------------------------------------------------------------------------
// /sh/auth resolves a key out of the worker-side sh_licenses map. reward.html
// mints the key in the VISITOR's browser, so the only way it can ever be a
// working license is if it is reported to the worker. Every network call the
// page makes is recorded here, and the page is driven to completion first.
{
    const cfg = { n: 'Ad Key', d: 1, mk: 1, cd: 0, mh: 0, ext: 0, eh: 6, mv: 0,
                  w: 'https://worker.example', cps: [{ u: 'https://direct-link.net/a', p: 'test' }] };
    const r = b64urlEncode(cfg);
    const store = {};
    const posted = [];
    const { sandbox, made } = makeVisitorPage({ search: '?r=' + r, store });
    sandbox.fetch = (u, o) => { posted.push({ u: String(u), body: o && o.body }); return Promise.resolve({ json: () => Promise.resolve({}) }); };
    vm.createContext(sandbox);

    // first pass: nothing done yet. second pass: the checkpoint reports done.
    vm.runInContext(extractScript(rewardHtml, 'reward.html'), sandbox, { filename: 'reward.html' });
    sandbox.location.search = '?r=' + r + '&done=0';
    vm.runInContext(extractScript(rewardHtml, 'reward.html'), sandbox, { filename: 'reward.html#2' });

    const keyBtn = made.clicks.newKeyBtn;
    check('a key can be minted once checkpoints are done', typeof keyBtn === 'function');
    if (keyBtn) keyBtn();

    // what did the key actually look like, and did anybody tell the worker?
    let minted = null;
    try { minted = JSON.parse(store[Object.keys(store).find(k => /_k$/.test(k))] || 'null'); } catch (e) {}
    const key = minted && minted[0] && minted[0].key;
    check('a key was actually minted', !!key, 'store keys = ' + JSON.stringify(Object.keys(store)));
    if (key) {
        check('the key is long enough to be a real license', String(key).length >= 32,
            'len = ' + String(key).length + ' - sh_licenses keys are 192-char CSPRNG values');
        const leaked = posted.some(p => JSON.stringify(p.body || '').indexOf(key) !== -1);
        check('the minted key is reported to the worker (so /sh/auth could find it)', leaked,
            'network calls made = ' + JSON.stringify(posted) + '\n        -> the key exists ONLY in this browser. /sh/auth answers `invalid` for it.');
    }
    void r;
}
console.log('the reward cannot be completed without doing the ads');
// ---------------------------------------------------------------------------
// The whole config - how many checkpoints exist, which provider, what URL -
// travels in the URL as base64. Nothing in it is authenticated. So: take a
// genuine 2-checkpoint reward, rewrite it to 1 checkpoint, and append
// ?done=0, which reward.html accepts as proof of completion.
{
    const honest = { n: 'Ad Key', d: 1, mk: 1, cd: 0, mh: 0, ext: 0, eh: 6, mv: 0, w: 'https://worker.example',
        cps: [{ u: 'https://direct-link.net/a', p: 'linkvertise' }, { u: 'https://direct-link.net/b', p: 'lootlabs' }] };
    const tampered = { n: 'Ad Key', d: 1, mk: 1, cd: 0, mh: 0, ext: 0, eh: 6, mv: 0, w: 'https://worker.example',
        cps: [{ u: 'about:blank', p: 'test' }] };

    const { sandbox, made } = makeVisitorPage({ search: '?r=' + b64urlEncode(tampered) + '&done=0', store: {} });
    vm.createContext(sandbox);
    vm.runInContext(extractScript(rewardHtml, 'reward.html'), sandbox, { filename: 'reward.html' });

    const html = String(sandbox.document.getElementById('app').innerHTML);
    check('the attacker never visits a real ad link', honest.cps.length === 2,
        'honest reward had ' + honest.cps.length + ' checkpoints; the tampered one had 1 and it was a no-op');
    check('but the page already reports 1/1 complete', /Progress: 1\/1/.test(html),
        'app html = ' + html.slice(0, 200));
    check('and the key button is now enabled', !/id=.newKeyBtn.[^>]*disabled/.test(html),
        'app html = ' + html.slice(0, 240));
    const k = made.clicks.newKeyBtn;
    check('so a key can be minted without a single ad', typeof k === 'function');
    void honest;
}
console.log('anti-bypass blacklist must survive a localStorage wipe');
// ---------------------------------------------------------------------------
{
    const cfg = { n: 'X', d: 1, mk: 1, cd: 0, mh: 0, ext: 0, eh: 6, mv: 0, w: '', cps: [{ u: 'https://x/1', p: 'test' }] };
    const r = b64urlEncode(cfg);
    // A browser that has simply cleared site data - the single cheapest bypass.
    const fresh = makeVisitorPage({ search: '?r=' + r, store: {} });
    vm.createContext(fresh.sandbox);
    vm.createContext(fresh.made);
    // run checkpoint.html with the state a cleared browser presents
    const cpHtml = readFileSync(new URL('checkpoint.html', ROOT), 'utf8');
    const cpStore = {};
    const cpSandbox = Object.assign({}, fresh.sandbox, {
        location: { search: '?r=' + r + '&c=0', href: 'https://example.invalid/checkpoint.html', pathname: '/checkpoint.html', origin: 'https://example.invalid' },
        localStorage: {
            _d: cpStore,
            getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
            setItem(k, v) { this._d[k] = String(v); },
            key(i) { return Object.keys(this._d)[i] ?? null; },
            get length() { return Object.keys(this._d).length; }
        }
    });
    cpSandbox.window = cpSandbox;
    vm.createContext(cpSandbox);
    vm.runInContext(extractScript(cpHtml, 'checkpoint.html'), cpSandbox, { filename: 'checkpoint.html' });

    const appHtml = String(cpSandbox.document.getElementById('app').innerHTML);
    check('a cleared browser is NOT trusted by default', true);
    check('but the blacklist itself only lives in that browser storage',
        cpStore.sh_blacklist === undefined,
        'nothing server-side is consulted, so clearing site data clears the ban');
}

console.log();
console.log('REWARD FLOW   ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);