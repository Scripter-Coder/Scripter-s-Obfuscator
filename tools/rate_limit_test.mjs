// Verify the rate limiter, especially the message wording - the whole point of
// the feature is that the user is told HOW LONG to wait, in a unit that reads
// sensibly.
//
// A copy that "looks right" but returns null on the sixth call, or says
// "5400 Seconds", is worse than no limiter.
const SH_RATE = {
  signup:   { max: 5, window: 10 * 60 * 1000 },
  login:    { max: 8, window: 5 * 60 * 1000 },
  project:  { max: 6, window: 60 * 1000 },
  key:      { max: 8, window: 60 * 1000 }
};

// a localStorage stand-in
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

let now = 1_000_000_000_000;
globalThis.Date = class { static now() { return now; } };

// ---- the implementation, copied verbatim from main.js ------------------
const SH_RATE_KEY = 'sh_rate_limits';
function shRateLoad() {
  try { return JSON.parse(localStorage.getItem(SH_RATE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function shRateSave(m) { try { localStorage.setItem(SH_RATE_KEY, JSON.stringify(m)); } catch (e) {} }
function shRateHuman(ms) {
  var s = Math.ceil(ms / 1000);
  if (s < 60) return s + ' Second' + (s === 1 ? '' : 's');
  var mnt = Math.ceil(s / 60);
  if (mnt < 60) return mnt + ' Minute' + (mnt === 1 ? '' : 's');
  var h = Math.ceil(mnt / 60);
  return h + ' Hour' + (h === 1 ? '' : 's');
}
function shRateLimit(action, max, windowMs) {
  var n2 = Date.now();
  var all = shRateLoad();
  var hits = (all[action] || []).filter(function (x) { return n2 - x < windowMs; });
  if (hits.length >= max) {
    var waitMs = windowMs - (n2 - hits[0]);
    return 'You are rate limited. Please wait ' + shRateHuman(waitMs) + ' before retrying.';
  }
  hits.push(n2);
  all[action] = hits;
  shRateSave(all);
  return null;
}
// -----------------------------------------------------------------------

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

// 1. allows exactly `max`, then blocks
{
  const W = SH_RATE.project;
  let allowed = 0, blocked = 0, msg = '';
  for (let i = 0; i < 12; i++) {
    const r = shRateLimit('project', W.max, W.window);
    if (r === null) allowed++; else { blocked++; msg = r; }
    now += 200;                       // a fast human double-clicking
  }
  if (allowed === W.max) ok('exactly ' + W.max + ' attempts allowed (' + allowed + ')');
  else no('allowed ' + allowed + ', expected ' + W.max);

  if (blocked === 12 - W.max) ok('the other ' + blocked + ' were refused');
  else no('refused ' + blocked);

  if (/^You are rate limited\. Please wait \d+ Seconds? before retrying\.$/.test(msg)) {
    ok('the message reads: "' + msg + '"');
  } else {
    no('unexpected message: ' + JSON.stringify(msg));
  }
}

// 2. the window slides: waiting out the oldest hit frees a slot
{
  store[SH_RATE_KEY] = '{}';
  const W = SH_RATE.key;
  for (let i = 0; i < W.max; i++) { shRateLimit('key', W.max, W.window); now += 100; }
  // null = ALLOWED, non-null = blocked. This had the sense inverted, so a
  // correct block was reported as a failure.
  if (shRateLimit('key', W.max, W.window) === null) no('should be blocked immediately after the burst');
  else ok('blocked right after a full burst');

  now += W.window;                      // the oldest hit ages out
  if (shRateLimit('key', W.max, W.window) === null) ok('a slot frees once the window passes');
  else no('still blocked after the window elapsed - the window is not sliding');
}

// 3. per-action isolation
{
  store[SH_RATE_KEY] = '{}';
  const W = SH_RATE.login;
  for (let i = 0; i < W.max; i++) { shRateLimit('login', W.max, W.window); now += 50; }
  if (shRateLimit('login', W.max, W.window) === null) no('login should be blocked');
  else ok('login is blocked after ' + W.max + ' attempts');
  if (shRateLimit('signup', SH_RATE.signup.max, SH_RATE.signup.window) === null) {
    ok('a DIFFERENT action is unaffected - blocking login does not block signup');
  } else {
    no('blocking one action blocked another');
  }
}

// 4. the unit wording
{
  const cases = [
    [1000, '1 Second'], [15000, '15 Seconds'], [59000, '59 Seconds'],
    [60000, '1 Minute'], [125000, '3 Minutes'], [3540000, '59 Minutes'],
    [3600000, '1 Hour'], [7200000, '2 Hours'], [86400000, '24 Hours']
  ];
  let bad = 0;
  for (const [ms, want] of cases) {
    const got = shRateHuman(ms);
    if (got !== want) { console.log('         ' + ms + 'ms -> "' + got + '" expected "' + want + '"'); bad++; }
  }
  if (bad === 0) ok('all ' + cases.length + ' durations read correctly, singular and plural');
  else no(bad + ' duration(s) worded wrong');
}

// 5. it survives storage being unavailable (private mode / quota)
{
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  let threw = false;
  try { for (let i = 0; i < 5; i++) shRateLimit('signup', 2, 60000); }
  catch (e) { threw = true; }
  globalThis.localStorage = real;
  if (!threw) ok('a denied localStorage does not throw - it degrades to no limiting');
  else no('a denied localStorage throws and would break signup entirely');
}

console.log('');
console.log('RATE LIMITER   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
