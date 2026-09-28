// "Refresh from Cloud" must actually refresh, and must not take forever.
//
// TWO INDEPENDENT FAULTS PRODUCED ONE SYMPTOM
//
// The report was: click Refresh, see "Refreshing...", wait, nothing happens.
//
// FAULT 1 - the response was the entire image library (worker side).
//
//     GET /sh/users  ->  { ok:true, users: { [58 emails]: { ...base64 images... } } }
//
// A user record carries up to three base64 images, and customBackground is a
// full-page backdrop that is routinely 1-2MB of base64. The whole users table is a
// SINGLE KV entry, so there is nowhere to fetch one image on its own: the response
// size is the sum of every image on the site, and the client cannot parse it - let
// alone draw a row - until all of it has arrived. Hence a wait with no end.
//
// Worse, customBackground was the ONE image field the cap did not cover. The cap
// was written three times, field by field, and the third copy missed it:
// sanitizeUserRecord capped all three, publicUser capped two, storageSafeUser
// capped two. So the largest field on the record was the only uncapped one.
//
// FAULT 2 - the client read the response body twice (client side).
//
//     try { text = await res.text(); } catch (e) { text = ''; }
//     clearTimeout(timer);
//     try { text = await res.text(); } catch (e) { text = ''; }   <- again
//
// A Response body is a single-use stream. The second read throws
//
//     TypeError: Failed to execute 'text' on 'Response': body stream already read
//
// and the defensive catch that was there to survive a bad body swallowed it and
// set text back to ''. A 200 carrying a complete users map was therefore parsed as
// an empty body and reported as a failure - on every owner call, which is the
// entire admin surface.
//
// Two faults, one message, and the second one made every attempt to measure the
// first one look like a hang. So both are pinned here.
//
// WHAT IS CHECKED
//
//  1. The worker: the listing omits image fields, the cap covers all three, and
//     there is a paged route to get the pictures back.
//  2. The client: shOwnerApi reads the body exactly once, and has a timeout.
//  3. The client: the merge cannot blank a local image with a missing cloud one -
//     which is what would otherwise happen the moment the listing omits them.
import fs from 'node:fs';

const worker = fs.readFileSync('For Cloudflare/worker.js', 'utf8');
const main = fs.readFileSync('main.js', 'utf8');

// Strip comments with a real scanner, replacing them with spaces so offsets and
// line numbers survive.
//
// A regex is not good enough here, and the reason is worth recording. Both files
// contain this, in an ordinary line comment:
//
//     // fetch parts through the worker proxy (/sh/g/*) - GitHub never exposed.
//
// The `/*` in "/sh/g/*" opens what a regex believes is a block comment, and the
// next `*/` is thousands of lines away - so `replace(/\/\*[\s\S]*?\*\//g, '')`
// silently deletes most of the file. The test then reports on a fragment and
// fails on code that is present, or passes on code that is gone, depending on
// which side of the swallow the match landed.
//
// That is the same class of bug as everything else this file pins: a check that
// cannot see the code it is checking.
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && next === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += (src[i] === '\n' ? '\n' : ' '); i++; }
      out += '  '; i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      // copy the string literal verbatim, comments and all - a "//" inside a URL
      // is data, not a comment
      const quote = c;
      out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === quote) { i++; break; }
        i++;
      }
    } else {
      out += c; i++;
    }
  }
  return out;
}
const cssWorker = stripComments(worker);
const cssMain = stripComments(main);

// The scanner is only trustworthy if it agrees with the source on how much it
// removed. A file that loses 60% of itself to a greedy match is exactly the case
// above, so the ratio is asserted rather than assumed.
for (const [name, raw, stripped] of [['worker.js', worker, cssWorker], ['main.js', main, cssMain]]) {
  const kept = stripped.length / raw.length;
  if (kept < 0.7) {
    console.error('  FAIL the comment stripper deleted too much of ' + name + ' (' + Math.round(kept * 100) + '% left) - the checks below would be reading a fragment');
    process.exit(1);
  }
}

let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// Extract one function's body by counting braces from its opening brace.
//
// The naive alternative - slice to the next "\n}\n" - silently returns the REST OF
// THE FILE on a CRLF checkout, because the line ending is "\r\n" and the pattern
// never matches. A check that then looks for "no showNotification in this
// function" reads six thousand lines of unrelated code, finds some, and reports a
// failure against a function that is correct.
//
// That is how two of the assertions below were failing on code that was right, and
// it is the same lesson as the comment stripper: the measuring instrument has to be
// verified before its verdict is believed.
function functionBody(src, name) {
  const decl = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!decl) return null;
  const open = src.indexOf('{', decl.index);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    } else if (c === '"' || c === "'" || c === '`') {
      // skip a string literal so a brace inside one does not unbalance the count
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) break;
        if (src[i] === '\n' && q !== '`') break;
        i++;
      }
    }
  }
  return null;
}
// And prove the extractor works, by checking it against a function this change is
// NOT responsible for. shMergeCloudUser cannot be the probe: on the pre-fix source
// that function does not exist, and a self-check that fails on unfixed code turns
// every real finding below it into an unreadable early exit.
{
  const probe = functionBody(cssMain, 'shPullCloudUsers');
  if (!probe || !/shOwnerApi/.test(probe) || probe.length < 200) {
    console.error('  FAIL the function extractor cannot read shPullCloudUsers (' + (probe ? probe.length : 0) + ' chars) - the checks below would be reading the wrong text');
    process.exit(1);
  }
}

// ================= WORKER =================
console.log('[W] the listing is not the image library');

{
  // the listing block, isolated
  const at = cssWorker.indexOf("url.pathname === '/sh/users' && request.method === 'GET'");
  const block = at < 0 ? '' : cssWorker.slice(at, cssWorker.indexOf("url.pathname === '/sh/users-delete'", at));

  if (at < 0) no('the GET /sh/users route is gone');
  else {
    if (/delete rec\.profileImage/.test(block) && /delete rec\.bannerImage/.test(block) && /delete rec\.customBackground/.test(block)) {
      ok('GET /sh/users omits profileImage, bannerImage and customBackground');
    } else {
      no('GET /sh/users still returns image payloads - the response is the sum of every image on the site');
    }
    if (!/publicUser\(map\[k\]\)/.test(block)) {
      no('GET /sh/users no longer sanitises each record - passwords would be returned');
    }
    if (/\?images=|get\('images'\)/.test(block)) {
      ok('?images=1 restores the full shape, so the change is reversible rather than a removal');
    } else {
      no('there is no way to ask for the images in one call any more');
    }
    if (/count:/.test(block)) ok('the listing reports a count, so the client can say what it got');
    else no('the listing reports no count');
  }
}

console.log('[W] the pictures are still reachable, in bounded pages');
{
  if (/url\.pathname === '\/sh\/user-images' && request\.method === 'GET'/.test(cssWorker)) {
    ok('GET /sh/user-images exists');
  } else {
    no('GET /sh/user-images is missing - the admin list would show a letter instead of every avatar');
  }
  const at = cssWorker.indexOf("url.pathname === '/sh/user-images'");
  // slice to the NEXT route, not a fixed character count: a magic length silently
  // truncates as soon as the block grows, and a check that stops reading halfway
  // through a block reports on a fragment of it.
  const nextRoute = at < 0 ? -1 : cssWorker.indexOf("url.pathname === '/", at + 10);
  const block = at < 0 ? '' : cssWorker.slice(at, nextRoute < 0 ? cssWorker.length : nextRoute);
  if (/isOwnerSessionOrAccount/.test(block)) {
    ok('/sh/user-images is behind the same owner gate as the listing - same data, same gate');
  } else {
    no('/sh/user-images is NOT owner-gated');
  }
  if (/Math\.min\(50,/.test(block)) {
    ok('?limit is clamped, so the route cannot be asked for the whole image table in one call');
  } else {
    no('?limit is unbounded - this route would be able to reproduce the exact response it exists to avoid');
  }
  if (/offset/.test(block) && /total/.test(block)) {
    ok('the page is offset-addressed and reports a total, so the client can page and stop');
  } else {
    no('the image route is not pageable');
  }
}

console.log('[W] the cap covers every image field, in one list');
{
  if (/const SH_IMAGE_FIELDS = \['profileImage', 'bannerImage', 'customBackground'\]/.test(cssWorker)) {
    ok('SH_IMAGE_FIELDS names all three, including customBackground');
  } else {
    no('there is no single SH_IMAGE_FIELDS list - a field can be capped in one place and missed in another');
  }
  // the drift this replaces: two of the three copy sites missing customBackground
  const drift = [];
  if (!/function capImageFields/.test(cssWorker)) drift.push('no capImageFields helper');
  for (const name of ['publicUser', 'storageSafeUser']) {
    const body = functionBody(cssWorker, name);
    if (body === null) { drift.push(name + ' is missing'); continue; }
    if (!/capImageFields/.test(body)) drift.push(name + ' does not call capImageFields');
  }
  if (drift.length === 0) ok('publicUser and storageSafeUser both go through capImageFields - no hand-written field list left to drift');
  else no('the per-field cap is still duplicated: ' + drift.join('; '));
}

console.log('[W] the oversized-map repair actually makes it smaller');
{
  const fn = functionBody(cssWorker, 'saveUsersMap') || '';
  if (!fn) {
    no('saveUsersMap is gone or unreadable');
  } else {
    const drops = (fn.match(/u\[k\] = ''/g) || []).length;
    if (drops > 0) {
      ok('saveUsersMap has a step that DROPS images outright, not just re-caps them');
    } else {
      no('saveUsersMap only re-caps images. Its second pass was a byte-for-byte repeat of the first, so a map full of under-cap images still overflows the 25MB KV limit and the PUT throws');
    }
    if (/console\.warn/.test(fn)) ok('dropping server-side images is logged, so the loss is not silent');
    else no('server-side image loss would happen with no log line');
  }
}

console.log('[W] a plan change cannot destroy a user image');
{
  const at = cssWorker.indexOf("url.pathname === '/sh/users' && request.method === 'POST'");
  const block = at < 0 ? '' : cssWorker.slice(at, cssWorker.indexOf("url.pathname === '/sh/users-delete'", at));
  if (/storageSafeUser\(\{/.test(block) || /sanitizeUserRecord\(/.test(block)) {
    ok('the owner upsert runs the merged record through a sanitiser - it was the one route into the map that could store an unbounded image');
  } else {
    no('the owner upsert is a bare spread with no sanitiser - the one route into the map that could store an unbounded image');
  }
  if (/SH_IMAGE_FIELDS/.test(block) && /prev\[k\]/.test(block)) {
    ok('the owner upsert takes the image fields from the STORED record, so a plan change cannot blank an avatar');
  } else {
    no('the owner upsert lets the client\'s local copy overwrite the stored images - a plan change on a device without the image would erase it for everyone');
  }
}

// ================= CLIENT =================
console.log('[C] the response body is read once');
{
  const at = cssMain.indexOf('async function shOwnerApi');
  const fn = functionBody(cssMain, 'shOwnerApi') || '';
  if (at < 0) { no('shOwnerApi is gone'); }
  else {
    const reads = (fn.match(/await res\.text\(\)/g) || []).length;
    if (reads === 1) ok('shOwnerApi reads res.text() exactly once - a Response body is a single-use stream');
    else no('shOwnerApi reads res.text() ' + reads + ' times; the second throws "body stream already read" and the catch sets the body to \'\', so a good 200 is read as an empty response');
    const clears = (fn.match(/clearTimeout\(timer\)/g) || []).length;
    if (clears >= 2) ok('the timer is cleared on both the success and the failure path');
    else no('the abort timer is cleared ' + clears + ' time(s) - one of the two paths leaks a timer armed against a finished request');
    if (/AbortController/.test(fn) && /SH_OWNER_TIMEOUT_MS/.test(fn)) {
      ok('there is a real abort, not just an abandoned await - a slow cloud is reported as a failure instead of hanging');
    } else {
      no('there is no abort: a fetch with no timeout is how "Refreshing..." becomes an infinite spinner with no error');
    }
  }
}

console.log('[C] there is exactly ONE merge, and it protects all three image fields');
{
  // The bug this pins was four hand-written merge loops that had drifted: three of
  // them restored profileImage and bannerImage but not customBackground. So the
  // check is not "does each loop protect the fields" - it is "is there only one
  // merge at all". A second copy is the defect.
  const decl = (cssMain.match(/function shMergeCloudUser\s*\(/g) || []).length;
  if (decl === 1) ok('shMergeCloudUser is declared exactly once');
  else no('shMergeCloudUser is declared ' + decl + ' times');

  const fn = functionBody(cssMain, 'shMergeCloudUser') || '';
  let bad = 0;
  for (const f of ['profileImage', 'bannerImage', 'customBackground']) {
    if (new RegExp('!cu\\.' + f + ' && lu\\.' + f).test(fn)) ok('the merge protects ' + f);
    else { no('the merge does not protect ' + f + ' - a listing without images would wipe the local one on every refresh'); bad++; }
  }
  if (!bad && !/if \(lu\.password && !cu\.password\)/.test(fn)) no('the merge no longer re-attaches the local password the cloud never returns');

  // every caller must go through it
  const callers = (cssMain.match(/shMergeCloudUser\(/g) || []).length - 1;   // minus the declaration
  if (callers >= 4) ok('all ' + callers + ' call sites go through the one merge');
  else no('only ' + callers + ' call site(s) use the merge; a hand-written loop is still in place and can drift again');

  // and no hand-written loop is left that assigns a cloud record over a local one
  const strays = [];
  const re = /for \(var (\w+) in cloud\) \{([\s\S]{0,800}?)\n\s{4,}\}/g;
  let m;
  while ((m = re.exec(cssMain)) !== null) {
    const body = m[2];
    if (/users\[\w+\]\s*=/.test(body) && !/shMergeCloudUser/.test(body)) {
      strays.push(m[1]);
    }
  }
  if (strays.length === 0) ok('no cloud-merge loop assigns over users[] on its own any more');
  else no('a hand-written merge loop still assigns over users[] (loop var(s): ' + strays.join(', ') + ') - it is the thing that drifts');

  // the fields are also re-attached in shPullCloudUsers, so a listing record that
  // is inspected before it reaches the merge is not already missing them
  const pull = functionBody(cssMain, 'shPullCloudUsers') || '';
  let bad2 = 0;
  for (const f of ['profileImage', 'bannerImage', 'customBackground']) {
    if (new RegExp('!d\\.users\\[k2\\]\\.' + f).test(pull)) ok('shPullCloudUsers re-attaches ' + f + ' before the merge sees the record');
    else { no('shPullCloudUsers does not re-attach ' + f); bad2++; }
  }
}

console.log('[C] the images are pulled as pages, after the list is drawn');
{
  if (/async function shPullCloudImages/.test(cssMain)) ok('shPullCloudImages exists');
  else no('no shPullCloudImages - omitting the images from the listing would lose every avatar');
  if (/sh\/user-images\?offset=/.test(cssMain)) ok('the client pages the image route by offset');
  else no('the client does not page the image route');
  if (/refreshUsersList[\s\S]{0,2600}shPullCloudImages\(\)/.test(cssMain)) {
    ok('refreshUsersList draws the list and THEN pulls the images, so the panel appears on the first response');
  } else {
    no('refreshUsersList does not kick the image pull after rendering - it would be waiting on the images again');
  }
  if (/elapsed/.test(cssMain) && /performance\.now/.test(cssMain)) {
    ok('the refresh reports how long it took, so a slow call is distinguishable from a stuck one');
  } else {
    no('the refresh reports no elapsed time - "Refreshing..." then silence is indistinguishable from a hang');
  }
  // A failure in the image phase must not be reported as a failed refresh. The
  // check is behavioural rather than a comment match: no notification, no console
  // error, no rethrow inside that function.
  const fn = functionBody(cssMain, 'shPullCloudImages') || '';
  if (/showNotification/.test(fn)) {
    no('shPullCloudImages shows a notification on failure; a refresh that succeeded would be reported as failed, which is worse than a missing avatar');
  } else {
    ok('shPullCloudImages raises no notification - the list succeeded, only avatars are missing');
  }
  if (/console\.(error|warn)/.test(fn)) {
    no('shPullCloudImages writes to the console; a missing avatar is not an error condition');
  } else {
    ok('shPullCloudImages writes nothing to the console either');
  }
  // and the rows still render without images, or stripping them would blank the panel
  if (/user\.profileImage \?/.test(cssMain) || /profileImage \? '<img/.test(cssMain)) {
    ok('renderUsersList falls back to the initial letter when a record has no image');
  } else {
    no('renderUsersList has no fallback for a record with no profileImage - omitting images from the listing would render empty avatars');
  }
}

console.log('');
console.log(fail ? 'CLOUD REFRESH   ' + fail + ' FAILED' : 'CLOUD REFRESH   all checks passed');
process.exit(fail ? 1 : 0);
