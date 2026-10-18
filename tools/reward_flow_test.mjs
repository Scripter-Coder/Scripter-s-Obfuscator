// Behavioural tests for the REWARD PAGE (reward.html).
//
// The previous version of this file tested the previous reward page, and found
// five real bugs by executing it: a Start button that went to about:blank,
// provider settings discarded from the share link, an "earned" key that was
// never reported anywhere, a blacklist held in localStorage, and - worst - a
// reward that paid out on demand because the config was an unsigned base64 blob
// in the URL and `?done=<n>` was accepted as proof of completion.
//
// All five moved to the worker. These checks assert the page no longer does any
// of that work itself, and that it fails legibly rather than silently.
//
// Run: node tools/reward_flow_test.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const rewardHtml = readFileSync(new URL('reward.html', ROOT), 'utf8');
const rewardsSrc = readFileSync(new URL('rewards.js', ROOT), 'utf8');
const checkpointHtml = readFileSync(new URL('checkpoint.html', ROOT), 'utf8');

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

function extractScript(html, label) {
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!m) throw new Error('no inline script in ' + label);
    return m[1];
}

function makeLocation(made, search, pathname) {
    let href = 'https://sh.test' + pathname + search;
    return {
        search, pathname, origin: 'https://sh.test',
        get href() { return href; },
        set href(v) { made.navigatedTo = v; href = v; },
        replace(v) { made.navigatedTo = v; href = v; }
    };
}

// Drive reward.html the way a browser would, and record every network call and
// every navigation.
function loadPage({ search, worker, endpoints }) {
    const made = { navigatedTo: null, elements: {}, clicks: {}, posts: [], gets: [], live: [] };
    const store = {};
    function el(id) {
        if (!made.elements[id]) {
            made.elements[id] = {
                id, value: '', checked: false, disabled: false, textContent: '', className: '', style: {},
                _onclick: null, _attrs: {}, _parent: null,
                setAttribute(k, v) { this._attrs[k] = String(v); },
                _children: [],
                getAttribute(k) { return this._attrs[k] != null ? this._attrs[k] : null; },
                remove() { if (this._parent) this._parent.removeChild(this); },
                appendChild(c) { c._parent = this; return c; },
                removeChild(c) { const j = this._children.indexOf(c); if (j > -1) this._children.splice(j, 1); },
                classList: { _s: new Set(), add(x) { this._s.add(x); }, remove(x) { this._s.delete(x); }, contains(x) { return this._s.has(x); } },
                get innerHTML() { return this._html; },
                set innerHTML(v) { this._html = String(v); present = new Set(String(v).match(/id="([a-zA-Z0-9_]+)"/g) || []);
                    for (const m of String(v).matchAll(/id="([a-zA-Z0-9_]+)"/g)) present.add(m[1]);
                    if (!/id="app"/.test(String(v))) { present.add('app'); }
                    if (!/id="notif"/.test(String(v))) { present.add('notif'); }
                    for (const m of String(v).matchAll(/id="app"/g)) present.add('app');
                },
                get onclick() { return this._onclick; },
                set onclick(f) { this._onclick = f; made.clicks[id] = f; },
                closest() { return { remove() { delete made.elements[id]; } }; }
            };
        }
        return made.elements[id];
    }
    // Ids actually present in the last innerHTML written. Anything else is
    // absent, which is what getElementById has to say.
    let present = new Set(['app', 'notif']);

    const sb = {
        console,
        // Models a REAL popup: a handle whose `location` can be assigned, and whose
        // `close()` is observable.
        //
        // The stub used to return `{closed: false}` - an object with no
        // `location`, so the new synchronous-placeholder code wrote the real ad
        // URL into nothing and the ad silently never opened. The old code
        // passed only because it called window.open(target) directly.
        //
        // A popup handle is exactly the thing that has to be modelled properly:
        // this is the difference between "opens the ad" and "does nothing".
        open: (u) => {
            made.opened = u;
            return {
                closed: false,
                close() { this.closed = true; made.closed = u; },
                get location() { return made.popupLocation; },
                set location(v) { made.popupLocation = v; made.navigatedTo = v; },
                focus() { }
            };
        },
        atob: (x) => Buffer.from(x, 'base64').toString('binary'),
        btoa: (x) => Buffer.from(x, 'binary').toString('base64'),
        escape, unescape, decodeURIComponent, encodeURIComponent, URLSearchParams,
        Math, Date, JSON, parseInt, parseFloat, isNaN, String, Number, Object, Array,
        setTimeout: () => 0, clearTimeout: () => {},
        // Intervals are tracked live. `setInterval: () => 0` made polling
        // invisible: startPolling() saw a falsy timer, so its `if (pollTimer)
        // return` guard never held, and clearInterval(0) could never be observed
        // - the one thing the ban screen actually needs to get right.
        setInterval: (fn, ms) => { made.live.push({ fn, ms, on: true }); return made.live.length; },
        clearInterval: (h) => { if (made.live[h - 1]) made.live[h - 1].on = false; },
        navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', language: 'en-US', languages: ['en-US'], hardwareConcurrency: 8, maxTouchPoints: 0 },
        screen: { width: 1920, height: 1080, colorDepth: 24 },
        location: makeLocation(made, search, '/reward.html'),
        history: { replaceState() {} },
        localStorage: {
            _d: store,
            getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
            setItem(k, v) { this._d[k] = String(v); }
        },
        fetch: (url, opts) => {
            const u = String(url);
            const method = (opts && opts.method) || 'GET';
            (method === 'POST' ? made.posts : made.gets).push({ url: u, body: opts && opts.body });
            const handler = endpoints[u.replace(worker, '').split('?')[0]];
            if (!handler) return Promise.resolve({ ok: false, json: () => Promise.resolve({ ok: false, error: 'no route' }) });
            const body = opts && opts.body ? JSON.parse(opts.body) : {};
            const q = {};
            u.split('?')[1] && u.split('?')[1].split('&').forEach(pair => { const kv = pair.split('='); q[kv[0]] = decodeURIComponent(kv[1] || ''); });
            return Promise.resolve({ ok: true, json: () => Promise.resolve(handler(body, q)) });
        }
    };
    sb.window = sb;
    sb.globalThis = sb;
    sb.window.outerWidth = 1440;
    sb.window.outerHeight = 900;
    sb.document = {
        getElementById: (id) => (present.has(id) ? el(id) : null),
        createElement: () => el('dyn'),
        querySelector: (sel) => {
            if (String(sel).includes('data-sh-endpoint')) return { getAttribute: () => worker };
            return { remove() {}, style: {} };
        },
        body: {
            _children: [],
            appendChild(c) { this._children.push(c); return c; },
            removeChild(c) { const j = this._children.indexOf(c); if (j > -1) this._children.splice(j, 1); },
            contains(c) { return this._children.indexOf(c) > -1; }
        }
    };
    // The ban overlay lives on <body>, not in #app, so the lookup has to
    // walk body children by their id property. Returning only #app-registered
    // ids made the overlay unreachable to every assertion below.
    const realGet = sb.document.getElementById;
    sb.document.getElementById = (id) => {
        for (const c of sb.document.body._children) if (c.id === id) return c;
        return realGet(id);
    };
    vm.createContext(sb);
    sb.__live = made.live;
    vm.runInContext(extractScript(rewardHtml, 'reward.html'), sb, { filename: 'reward.html' });
    return { sb, made };
}

// Read the endpoint out of the shipped HTML, exactly as the browser would.
const realEndpoint = (/data-sh-endpoint="([^"]+)"/.exec(rewardHtml) || [])[1] || '';
const W = realEndpoint || 'https://worker.test';
// A FIXED number of microtask hops is a race, not a synchronisation point.
//
// This was three setImmediate hops, which happened to be enough for the promise
// chains as they stood. Adding a .catch() to onStart added one more hop, and the
// test then failed intermittently - roughly 1 run in 3 - because the assertion
// ran while the chain was still settling. A test that passes 2 times out of 3
// is worse than one that fails loudly: it trains you to re-run until green.
//
// So this drains the microtask QUEUE until it is actually empty, however many
// hops the code under test needs. Deterministic, and it cannot go stale the
// next time a promise chain gains a link.
const tick = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(() => setImmediate(r)))));

// True when the progress poll has been disarmed. Scoped to the 4000ms timer on
// purpose: the ban screen runs its OWN 1s countdown that is meant to stay alive
// for the whole ban, so asserting "no live intervals" would fail on correct code.
const stopPolled = (sb) => sb.__live.filter(i => i.ms === 4000).every(i => !i.on);

// ---------------------------------------------------------------------------
console.log('the page takes its config from the worker, not from the URL');
// ---------------------------------------------------------------------------
{
    let posted = 0;
    const { made } = loadPage({
        search: '?rid=rwTEST1',
        worker: W,
        endpoints: {
            '/sh/reward/pub': () => { posted++; return { ok: true, public: { rid: 'rwTEST1', name: 'Ad Key', keyDurationH: 6, maxKeys: 1, total: 2, steps: [{ i: 0, name: 'A', provider: 'linkvertise' }, { i: 1, name: 'B', provider: 'lootlabs' }] } }; },
            '/sh/reward/state': () => ({ ok: true, sid: 's1', done: 0, total: 2, doneList: [], keys: [], complete: false }),
            '/sh/reward/start': () => ({ ok: true, sid: 's1', step: { i: 0, name: 'A', provider: 'linkvertise', target: 'https://direct-link.net/a', verifyUrl: W + '/sh/cp/linkvertise?t=abc', ready: true }, done: 0, total: 2, doneList: [], complete: false })
        }
    });
    await tick();
    check('it asks the worker for the reward', posted === 1, 'pub calls = ' + posted);
    check('it never reads a config out of the URL', !/get\('r'\)/.test(rewardHtml),
        'a base64 config in the URL is what made the reward editable by whoever held it');
}

// ---------------------------------------------------------------------------
console.log('a tampered URL cannot complete anything');
// ---------------------------------------------------------------------------
{
    // The old flow honoured ?done=<n> from the query string. Nothing may now.
    const { made } = loadPage({
        search: '?rid=rwTEST1&done=0',
        worker: W,
        endpoints: {
            '/sh/reward/pub': () => ({ ok: true, public: { rid: 'rwTEST1', name: 'X', keyDurationH: 1, maxKeys: 1, total: 2, steps: [{ i: 0, name: 'A', provider: 'test' }, { i: 1, name: 'B', provider: 'test' }] } }),
            '/sh/reward/state': () => ({ ok: true, sid: 's1', done: 0, total: 2, doneList: [], keys: [], complete: false }),
            '/sh/reward/start': () => ({ ok: true, sid: 's1', step: { i: 0, name: 'A', provider: 'test', target: 'https://e/a', verifyUrl: W + '/sh/cp/test?t=abc', ready: true }, done: 0, total: 2, doneList: [], complete: false })
        }
    });
    await tick();
    check('progress still comes from the worker, not from the query string',
        String(made.elements.app.innerHTML).indexOf('Progress: 0/2') !== -1,
        'the page shows ' + (/Progress: \d+\/\d+/.exec(String(made.elements.app.innerHTML)) || ['(none)'])[0]);
    check('no key button is enabled', /id="claimBtn"[^>]*disabled/.test(String(made.elements.app.innerHTML)),
        'a tampered ?done must not unlock a key');
}

// ---------------------------------------------------------------------------
console.log('a reward with no checkpoints explains itself instead of going blank');
// ---------------------------------------------------------------------------
{
    // This was "the Start button just leads me to about:blank". A reward with
    // zero checkpoints fell through `(cfg.cps[next] && ...) || 'about:blank'`.
    const { made } = loadPage({
        search: '?rid=rwEMPTY',
        worker: W,
        endpoints: {
            '/sh/reward/pub': () => ({ ok: true, public: { rid: 'rwEMPTY', name: 'Empty', keyDurationH: 1, maxKeys: 1, total: 0, steps: [] } })
        }
    });
    await tick();
    const html = String(made.elements.app.innerHTML);
    check('it explains the reward is empty', /no checkpoints/i.test(html), html.slice(0, 200));
    check('and offers no Start button at all', !made.clicks.startBtn);
    check('and certainly does not navigate to about:blank', !made.navigatedTo);
}

// ---------------------------------------------------------------------------
console.log('the Start button goes to the ad link the worker chose');
// ---------------------------------------------------------------------------
{
    const { made } = loadPage({
        search: '?rid=rwTEST1',
        worker: W,
        endpoints: {
            '/sh/reward/pub': () => ({ ok: true, public: { rid: 'rwTEST1', name: 'X', keyDurationH: 1, maxKeys: 1, total: 1, steps: [{ i: 0, name: 'A', provider: 'linkvertise' }] } }),
            '/sh/reward/state': () => ({ ok: true, sid: 's1', done: 0, total: 1, doneList: [], keys: [], complete: false }),
            '/sh/reward/start': () => ({ ok: true, sid: 's1', step: { i: 0, name: 'A', provider: 'linkvertise', target: 'https://direct-link.net/a', verifyUrl: W + '/sh/cp/linkvertise?t=abc', ready: true }, done: 0, total: 1, doneList: [], complete: false })
        }
    });
    await tick();
    const btn = made.clicks.startBtn;
    check('there is a Start button', typeof btn === 'function', 'html = ' + String(made.elements.app.innerHTML).slice(0, 140));
    if (btn) {
        btn(); await tick();
        check('Start asks the worker where to send the visitor',
            made.posts.some(p => p.url.indexOf('/sh/reward/start') !== -1),
            'posts = ' + JSON.stringify(made.posts.map(p => p.url)));
        // The ad URL is reached either by opening it directly, or by opening a
        // placeholder during the click and pointing it at the target once the
        // worker answers. Both are correct; what matters is that the real URL
        // is where the visitor ends up, and THIS page is not navigated away.
        check('Start opens the ad link rather than navigating this page away',
            made.navigatedTo === 'https://direct-link.net/a' || made.opened === 'https://direct-link.net/a',
            'opened = ' + JSON.stringify(made.opened) + ' popup went to = ' + JSON.stringify(made.navigatedTo));
        check('Start never navigates to about:blank', made.navigatedTo !== 'about:blank',
            'navigated to ' + JSON.stringify(made.navigatedTo));
        check('and it leaves this page in place', made.closed !== 'https://direct-link.net/a',
            'the placeholder was left open instead of being pointed at the ad');
        check('and there is a separate Verify step', typeof made.clicks.verifyBtn === 'function',
            'Verify is what asks the worker whether the ad counted');
    }
}

// ---------------------------------------------------------------------------
console.log('the blacklist is shown, not hidden');
// ---------------------------------------------------------------------------
{
    const { made, sb } = loadPage({
        search: '?rid=rwTEST1',
        worker: W,
        endpoints: {
            // ROUNDED UP TO THE NEXT MINUTE, then two hours added.
            //
            // shBanLeft renders "N hours M minutes" by flooring the remaining
            // milliseconds to whole minutes. With a plain `Date.now() + 2h` the
            // remainder is however far into the current minute the test started,
            // so the moment a second ticked over it dropped below a full minute
            // and the text became "1 hours 59 minutes" - failing roughly 1 run
            // in 3, with a message pointing at the ban screen rather than the
            // clock.
            //
            // CEIL, not floor. Rounding the current time DOWN and adding 2h
            // leaves a remainder slightly UNDER two hours, which floors to
            // "1 hours 59 minutes" every single run - strictly worse. Rounding
            // up leaves a remainder between 2h00m00s and 2h00m59s, which always
            // reads "2 hours 0 minutes".
            //
            // The product is correct and was not changed: flooring is the right
            // way to report a deadline, and under-stating by up to a minute is
            // the safe direction.
            '/sh/reward/pub': () => ({
                ok: true, blacklisted: true,
                until: (Math.ceil(Date.now() / 60000) * 60000) + 2 * 3600e3,
                strikes: 1, reason: 'checkpoint 1 via linkvertise: no-click-id',
                public: { rid: 'rwTEST1', name: 'X', keyDurationH: 1, maxKeys: 1, total: 1, steps: [] }
            })
        }
    });
    await tick();
    // The ban is a sibling of #app on <body>, not markup written into #app. It
    // used to be an in-flow card rendered ABOVE the progress and key sections,
    // so a long page still showed earned keys underneath "you are banned".
    const ov = sb.document.getElementById('shBanOverlay');
    const html = String(ov ? ov.innerHTML : made.elements.app.innerHTML);
    check('the ban is a full-screen overlay, not a card in the page flow',
        !!ov && /position:fixed/.test(String(ov.style.cssText || '')), 'overlay=' + !!ov);
    check('the visitor is told they are banned', /Temporarily Blacklisted/.test(html), html.slice(0, 200));
    check('and that it is the reward session that is paused', /temporarily paused/i.test(html));
    check('and how long is left', /2 hours 0 minutes/.test(html), html.slice(0, 240));
    check('and what not to do', /do not bypass/i.test(html));
    // The stored reason is an internal enum. Printing it tells a bypasser which
    // check tripped and how to dodge the next one, so it is mapped to a sentence.
    check('but does not leak the internal reason code', !/no-click-id/.test(html), html.slice(0, 240));
    check('and states the reason in plain language', /bypassing the ad steps/.test(html));
    check('no Start button is offered while banned', !made.clicks.startBtn);
    check('and it stops asking the worker for progress', stopPolled(sb),
        'poll still armed');
}

// ---------------------------------------------------------------------------
console.log('the earned key comes from the server');
// ---------------------------------------------------------------------------
{
    let claim = 0;
    const { made } = loadPage({
        search: '?rid=rwTEST1',
        worker: W,
        endpoints: {
            '/sh/reward/pub': () => ({ ok: true, public: { rid: 'rwTEST1', name: 'X', keyDurationH: 6, maxKeys: 1, total: 1, steps: [{ i: 0, name: 'A', provider: 'test' }] } }),
            '/sh/reward/state': () => ({ ok: true, sid: 's1', done: 1, total: 1, doneList: [0],
                keys: claim ? [{ key: 'REALKEY', expires: Date.now() + 6 * 3600e3 }] : [], complete: true }),
            '/sh/reward/start': () => ({ ok: true, complete: true, done: 1, total: 1, keys: [], doneList: [0] }),
            '/sh/reward/claim': () => { claim++; return { ok: true, key: 'REALKEY', keys: [{ key: 'REALKEY', expires: Date.now() + 6 * 3600e3 }], maxed: false }; }
        }
    });
    await tick();
    const btn = made.clicks.claimBtn;
    check('a key button is offered once the worker says it is complete', typeof btn === 'function');
    if (btn) {
        btn(); await tick();
        check('the key is claimed from the worker, never generated here', claim === 1, 'claims = ' + claim);
        check('and the server key is what gets rendered', /REALKEY/.test(String(made.elements.app.innerHTML)),
            'a locally generated key is not a license - /sh/auth would answer invalid');
    }
    const body = extractScript(rewardHtml, 'reward.html')
        .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    check('the page never mints a key itself', !/Math\.random/.test(body),
        'a 25-char Math.random() string is not a 192-char CSPRNG license');
}

// ---------------------------------------------------------------------------
console.log('the reward page can actually reach the worker');
// ---------------------------------------------------------------------------
// Reported as: every reward link renders "This page is not connected to the
// reward server."
//
// The page resolved the worker address from a <script data-sh-endpoint> tag or
// a ?w= parameter. NOTHING emitted the tag and rewardLink emitted no ?w=, so
// the resolver returned '' and every page took the "not connected" branch.
//
// It went unnoticed because this suite STUBBED querySelector to return the tag
// from the harness. The harness invented the exact thing that was missing from
// the product. So the checks below must run against the real HTML, with no
// stub, and must assert the tag exists in the file.
//
// The link is also served from GitHub Pages at a different origin from the
// worker, so a relative or origin-relative resolution could never have worked -
// the address has to be carried in the page or the query string.
{
    check('reward.html carries the endpoint in the file',
        /<script\s+data-sh-endpoint="https:\/\/[^"]+"/.test(rewardHtml),
        'the page cannot know the worker address at all without it');

    const tag = (/data-sh-endpoint="([^"]+)"/.exec(rewardHtml) || [])[1] || '';
    check('and it is an absolute https URL', /^https:\/\//.test(tag), 'got ' + JSON.stringify(tag));
    check('the page prefers the tag over the query string',
        /querySelector\('script\[data-sh-endpoint\]'\)/.test(extractScript(rewardHtml, 'reward.html')));
    // The source spells the character class, so the pattern has to escape the
    // brackets: /[?&]w=/ does NOT match the text "[?&]w=" - it looks for a bare
    // '?' or '&' followed by "w=", and the literal characters are "[?&]w=".
    check('and still honours ?w= as an override',
        /\[&\]w=/.test(extractScript(rewardHtml, 'reward.html')) ||
        /\[?&\]w=/.test(extractScript(rewardHtml, 'reward.html')));
}

console.log('a reward link generated by the panel carries the endpoint too');
{
    // Extract rewardLink and check it as a whole. Ordering matters: the endpoint
    // is read into a local BEFORE ?rid= is appended, so a "rid then endpoint"
    // pattern can never match however correct the code is. Two earlier versions
    // of this assertion failed for exactly that reason, and for "." not crossing
    // a newline.
    const rewardLinkFn = (() => {
        const i = rewardsSrc.indexOf('function rewardLink(r)');
        return i < 0 ? '' : rewardsSrc.slice(i, i + 700);
    })();
    check('rewardLink reads the endpoint', /SH_STATS_ENDPOINT/.test(rewardLinkFn),
        'found: ' + JSON.stringify(rewardLinkFn.slice(0, 80)));
    check('rewardLink appends ?rid= AND ?w=', /\?rid=/.test(rewardLinkFn) && /&w=/.test(rewardLinkFn),
        'so links made after a worker move work without the owner re-copying them');
    check('and the panel knows the endpoint', /SH_STATS_ENDPOINT/.test(rewardsSrc));
}

console.log('the "not connected" message is reachable only when it is true');
{
    // It should be an accurate diagnostic, not a dead end. If it ever fires on
    // a normal link, the message has to say what to do about it.
    const src = extractScript(rewardHtml, 'reward.html');
    check('it names the cause', /not connected to the reward server/.test(src));
    check('and tells the operator what to check',
        /SH_STATS_ENDPOINT|data-sh-endpoint/.test(src),
        'otherwise it reads as "the feature is broken" rather than "this build is missing an address"');
}

console.log();
console.log('REWARD FLOW   ' + (fails ? fails + ' FAILED' : 'all checks passed'));console.log('a link with no reward id is refused legibly');
// ---------------------------------------------------------------------------
{
    const { made } = loadPage({ search: '', worker: W, endpoints: {} });
    await tick();
    const html = String(made.elements.app.innerHTML);
    check('it explains what is wrong', /incomplete|not valid|no reward/i.test(html), html.slice(0, 160));
    check('and points at the owner', /owner/i.test(html));
}

// ---------------------------------------------------------------------------
console.log('checkpoint.html no longer implements its own flow');
// ---------------------------------------------------------------------------
{
    // It used to be a second, fully client-side verification page: it counted
    // seconds in the visitor's own browser and wrote the ban to localStorage.
    // Nothing links to it any more, and leaving it would leave a bypassable
    // verification page sitting in the repo for anyone who finds the URL.
    const src = extractScript(checkpointHtml, 'checkpoint.html');
    check('it no longer writes a localStorage blacklist', !/sh_blacklist/.test(src));
    check('it no longer counts down and self-verifies', !/Verify Checkpoint/.test(src));
    check('it points the visitor at the real reward page', /reward\.html|rid=/.test(checkpointHtml),
        'a redirect stub, not a second implementation');
}

console.log();
console.log('progress advances without the visitor reloading the page');
// ---------------------------------------------------------------------------
// The reported bug: a checkpoint was completed on the WORKER, after the provider
// callback sent the visitor away. Nothing re-read progress on their return, so
// the page still said "0/1" and the visitor concluded the checkpoint had not
// counted. It had. Polling is what closes that gap.
{
    let done = 0;
    const { made, sb } = loadPage({
        search: '?rid=rwTEST1',
        worker: W,
        endpoints: {
            '/sh/reward/pub': () => ({ ok: true, public: { rid: 'rwTEST1', name: 'X', keyDurationH: 1, maxKeys: 1, total: 1, steps: [{ i: 0, name: 'A', provider: 'linkvertise' }] } }),
            '/sh/reward/state': () => ({ ok: true, sid: 's1', done, total: 1, doneList: [], keys: [], complete: done >= 1 })
        }
    });
    await tick();
    let html = String(made.elements.app.innerHTML);
    check('the page starts showing no progress', /Progress: 0\/1/.test(html), html.slice(0, 160));
    const stateCalls = made.gets.filter(g => /\/sh\/reward\/state/.test(g.url)).length;

    // The checkpoint completes on the worker while this tab sits idle - exactly
    // what happens while the visitor is on the provider's page.
    done = 1;
    const poll = sb.__live.find(i => i.ms === 4000 && i.on);
    check('a progress poll is armed while work is outstanding', !!poll);
    if (poll) { poll.fn(); }
    await tick();

    html = String(made.elements.app.innerHTML);
    check('the poll re-asks the worker on its own',
        made.gets.filter(g => /\/sh\/reward\/state/.test(g.url)).length > stateCalls);
    check('and the visitor now sees the checkpoint counted', /Progress: 1\/1/.test(html), html.slice(0, 200));
    check('and is told the reward is complete', /All checkpoints complete/.test(html));
    check('and the poll is disarmed now there is nothing left to watch', stopPolled(sb),
        'poll still armed after completion');
}

console.log();
console.log('REWARD FLOW   ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);