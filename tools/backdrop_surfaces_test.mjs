// Every content surface must respond to the backdrop tint. All of them.
//
// WHY A DEDICATED TEST
//
// The first attempt at making the backdrop visible changed two numbers and looked
// like it had worked. Measured in the browser:
//
//     --card-color                  rgba(20,20,35,0.62)   <- tinted
//     .stat-card (computed)         rgba(20,20,35,0.8)    <- unchanged
//
// Two reasons, and neither was visible in the source at a glance:
//
//   1. NINE rules hard-coded the colour instead of reading var(--card-color), so
//      the variable never reached them.
//   2. applyTheme wrote el.style.background INLINE on .plan-card, .stat-card,
//      .dashboard-header and .modal. An inline style beats both the variable and
//      the stylesheet - so it won, silently, on the largest panels on the page.
//
// Together that is six rules and one inline write the tint could not reach, which
// is why "it works technically but it is in the wrong spot" survived a fix that
// was correct in isolation.
//
// So this checks the whole chain: the constant, the variable, the rules that read
// it, the inline write, AND that the chrome is deliberately excluded.
import fs from 'node:fs';

const main = fs.readFileSync('main.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// content surfaces: the picture shows through these
const CONTENT = ['.plan-card', '.upload-section', '.stat-card', '.user-list-item', '.project-card', '.script-item'];
// chrome: must stay readable over anything
const CHROME = ['.notification', '.dropdown-content'];

const lines = css.split(/\r?\n/);
function ruleBody(sel) {
  const at = lines.findIndex(l => new RegExp('^' + sel.replace('.', '\\.') + '\\s*\\{\\s*$').test(l));
  if (at < 0) return null;
  const out = [];
  for (let i = at + 1; i < lines.length && lines[i].trim() !== '}'; i++) out.push(lines[i]);
  return out.join('\n');
}

// ---- 1. the numbers ----
if (/const SH_BACKDROP_DIM = 0\.42/.test(main)) ok('the dim is 0.42');
else no('the dim is not 0.42');
if (/const SH_BACKDROP_CARD_ALPHA = 0\.62/.test(main)) ok('the card alpha is 0.62');
else no('the card alpha is not 0.62');

// ---- 2. every content surface reads the variable ----
{
  let bad = 0;
  for (const sel of CONTENT) {
    const b = ruleBody(sel);
    if (b === null) { no(sel + ' has no rule'); bad++; continue; }
    if (!/var\(--card-color/.test(b)) { no(sel + ' does not read --card-color, so the tint cannot reach it'); bad++; }
  }
  if (!bad) ok('all ' + CONTENT.length + ' content surfaces read --card-color');
}

// ---- 3. and NO rule anywhere hard-codes a content surface colour ----
{
  // Any rule whose body sets a bare rgba(20,20,35) background is unreachable by
  // the tint, whatever its selector is called. Listing them makes the next one
  // visible instead of mysterious.
  const unreachable = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\//.test(lines[i])) continue;
    if (!/background:\s*rgba\(20,\s*20,\s*35/.test(lines[i])) continue;
    // a var() with a fallback is fine - the variable wins
    if (/var\(--card-color/.test(lines[i])) continue;
    let sel = '?';
    for (let j = i - 1; j >= 0; j--) {
      if (/\{/.test(lines[j])) { sel = lines[j].trim().replace(/\s*\{\s*$/, ''); break; }
    }
    unreachable.push(sel);
  }
  const contentLeft = unreachable.filter(s => CONTENT.includes(s));
  if (contentLeft.length === 0) ok('no content surface hard-codes the card colour any more');
  else no('these still bypass the tint: ' + contentLeft.join(', '));

  if (unreachable.length) console.log('       (chrome that deliberately stays opaque: ' + unreachable.join(', ') + ')');
  else console.log('       no rule hard-codes the card colour');
}

// ---- 4. the inline write agrees with the variable ----
{
  const t = main.slice(main.indexOf('function applyTheme('), main.indexOf('function applyTheme(') + 4000);
  const at = t.indexOf("querySelectorAll('.plan-card, .stat-card, .dashboard-header, .modal')");
  if (at < 0) { no('the inline surface loop is gone'); }
  else {
    const seg = t.slice(at, at + 900);
    if (/el\.style\.background = theme\.card;/.test(seg)) {
      no('applyTheme still writes an opaque INLINE background, which overrides the variable and the stylesheet');
    } else {
      ok('the inline surface write honours the tint');
    }
  }
  // and the two mechanisms must use the same expression, or one will win again
  // The capture stops at the call's OWN closing paren. `[^;]+` ran to the `;` and
  // swallowed it, so the variable read as "... : theme.card)" with a stray paren
  // and looked different from the inline write even though the two are identical.
  const a = /root\.style\.setProperty\('--card-color',\s*(.+?)\);/.exec(t);
  const b = /el\.style\.background = ([^;]+);/.exec(t.slice(at, at + 900));
  if (a && b && a[1].trim() === b[1].trim()) ok('the variable and the inline write use the identical expression');
  else no('the variable and the inline write differ:\n         var: ' + (a ? a[1].trim() : '?') + '\n         inline: ' + (b ? b[1].trim() : '?'));
}

// ---- 5. the chrome is excluded on purpose, and that must stay deliberate ----
{
  let bad = 0;
  for (const sel of CHROME) {
    const b = ruleBody(sel);
    if (b === null) { no(sel + ' has no rule'); bad++; continue; }
    if (/var\(--card-color/.test(b)) { no(sel + ' was put on the tint - a toast or dropdown must stay readable over a photograph'); bad++; }
  }
  if (!bad) ok('chrome stays opaque - a backdrop must not make its own controls unreadable');
}

// ---- 6. it is all restored when the backdrop is removed ----
{
  const paint = main.slice(main.indexOf('function applyCustomBackground('), main.indexOf('function applyCustomBackground(') + 2000);
  const clear = main.slice(main.indexOf('function clearCustomBackground('), main.indexOf('function clearCustomBackground(') + 2500);
  if (/shRefreshCardTint\(\)/.test(paint)) ok('painting re-tints'); else no('painting does not re-tint');
  if (/shRefreshCardTint\(\)/.test(clear)) ok('removing restores the opaque surfaces'); else no('removing leaves the surfaces translucent forever');
}

console.log('');
console.log(fail ? 'BACKDROP SURFACES  ' + fail + ' FAILED' : 'BACKDROP SURFACES  all checks passed');
process.exit(fail ? 1 : 0);
