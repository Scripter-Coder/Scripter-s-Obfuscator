// Verify the surface-tint wiring. The previous check was line-based and flagged
// its own multi-line ternary:
//
//     el.style.background = SH_CUSTOM_BG_ACTIVE
//         ? shWithAlpha(...)
//         : theme.card;
//
// The first line carries no tint expression, so a per-line filter reported it as a
// stray write. Checking the FUNCTION BODY instead of the line is the fix, and it
// is the same lesson as the earlier capture bug: comparing source text line by
// line keeps producing wrong answers, because a statement is not a line.
import fs from 'node:fs';

const a = fs.readFileSync('main.js', 'utf8');
let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

function bodyOf(name) {
  const m = new RegExp('^(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'm').exec(a);
  if (!m) return null;
  let d = 0, s = false;
  for (let i = m.index; i < a.length; i++) {
    if (a[i] === '{') { d++; s = true; }
    else if (a[i] === '}') { d--; if (s && d === 0) return a.slice(m.index, i + 1); }
  }
  return null;
}

const writer = bodyOf('shApplySurfaceTints');
if (writer) ok('shApplySurfaceTints is defined once and parses');
else no('shApplySurfaceTints is missing or does not parse');

if (writer) {
  if (/querySelectorAll\('\.plan-card, \.stat-card, \.dashboard-header, \.modal'\)/.test(writer)) ok('it covers all four themed selectors');
  else no('it does not cover the four themed selectors');

  if (/SH_CUSTOM_BG_ACTIVE\s*\?\s*shWithAlpha\(theme\.card, SH_BACKDROP_CARD_ALPHA\)\s*:\s*theme\.card/.test(writer)) {
    ok('it tints when a backdrop is active and restores the opaque colour when not');
  } else {
    no('the tint expression is not the one applyTheme uses');
  }

  if (/el\.style\.borderColor = theme\.primary/.test(writer)) ok('the border colour moved with it');
  else no('the border colour was dropped in the extraction');
}

// both callers
const theme = bodyOf('applyTheme');
const tint = bodyOf('shRefreshCardTint');
if (theme && /shApplySurfaceTints\(theme\)/.test(theme)) ok('applyTheme calls the shared writer');
else no('applyTheme does not call the shared writer');
if (tint && /shApplySurfaceTints/.test(tint)) ok('shRefreshCardTint re-applies it, so panels do not stay opaque');
else no('shRefreshCardTint does not re-apply it - this is the bug that left .stat-card at 0.8');

// no other function writes a surface background inline
{
  const others = [];
  for (const m of a.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const name = m[1];
    if (name === 'shApplySurfaceTints') continue;
    const b = bodyOf(name);
    if (b && /\.plan-card, \.stat-card, \.dashboard-header, \.modal/.test(b)) others.push(name);
  }
  if (others.length === 0) ok('no other function themes those selectors inline');
  else no('these also write those selectors inline: ' + others.join(', '));
}

console.log('');
console.log(fail ? 'SURFACE TINTS     ' + fail + ' FAILED' : 'SURFACE TINTS     all checks passed');
process.exit(fail ? 1 : 0);
