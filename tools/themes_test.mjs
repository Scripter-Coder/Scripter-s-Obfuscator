// The theme list is a feature with three ways to be half-wired.
//
// THE THREE THINGS THAT WERE WRONG, AND WHY A STATIC LIST WAS THE PROBLEM
//
//  1. The markup listed the themes TWICE - once as <option> and once as a
//     .color-dot div - and both lists had already drifted from the `themes` object
//     and from each other. There is no way to notice that by reading: both lists
//     look complete. It is only visible as a count, so that is what is checked.
//
//  2. `applyTheme`, `shRefreshCardTint` and the backdrop path each did their own
//     `themes[name] || themes.default`. A custom colour is NOT a key in `themes`,
//     so each of those had to learn about it separately. One resolver, checked.
//
//  3. A theme is stored as a string and synced to the worker, which hard-codes
//     `if (theme.length > 30) theme = 'default'`. Anything longer is silently reset
//     on every sync from every other device - a theme that works on the device that
//     set it and nowhere else. The stored form is checked against that cap.
//
// Also pinned: the button label colour, because the primary button is a
// white-on-gradient inline style and five of the fifteen themes have a light
// primary. Without onPrimary, "yellow" and "white" render white text on white.
import fs from 'node:fs';

const main = fs.readFileSync('main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// the same verifier shape as the other suites: strip comments with a real scanner,
// because /sh/g/* in a line comment opens a fake block comment for a regex
function stripComments(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], next = src[i + 1];
    if (c === '/' && next === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } }
    else if (c === '/' && next === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += (src[i] === '\n' ? '\n' : ' '); i++; }
      out += '  '; i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
    } else { out += c; i++; }
  }
  return out;
}
function functionBody(src, name) {
  const decl = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!decl) return null;
  const open = src.indexOf('{', decl.index);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(open + 1, i); }
    else if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
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
const code = stripComments(main);

if (!functionBody(code, 'shResolveTheme') || !/shThemeFromHex/.test(functionBody(code, 'shResolveTheme'))) {
  console.error('  FAIL the extractor is not reading main.js correctly - the checks below would be measuring the wrong text');
  process.exit(1);
}

// ---- 1. one list, and it is rendered, not written out twice ----
{
  const picker = (functionBody(code, 'shResolveTheme') !== null) ? (() => {
    const m = /const SH_THEME_PICKER = \[([\s\S]*?)\n\];/.exec(code);
    return m ? m[1] : '';
  })() : '';
  const names = [...picker.matchAll(/name:\s*'([a-z]+)'/g)].map(m => m[1]);
  const want = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'brown', 'black', 'white', 'pink', 'amethyst', 'mint', 'gold', 'aqua'];

  if (JSON.stringify(names) === JSON.stringify(want)) {
    ok('SH_THEME_PICKER holds all 15 themes, in order: ' + want.join(', '));
  } else {
    no('SH_THEME_PICKER is [' + names.join(', ') + '], expected [' + want.join(', ') + ']');
  }
  if (!names.includes('default')) ok('"Default" is not offered as its own entry - purple is the same colour and is listed');
  else no('"Default" is still offered as a separate entry; it is the same colour as purple');

  // every offered theme must EXIST as a theme object, or the select offers a
  // no-op row
  const themesBlock = /const themes = \{([\s\S]*?)\n\};/.exec(code);
  const tb = themesBlock ? themesBlock[1] : '';
  const missing = names.filter(n => !new RegExp('(^|[\\s{,])' + n + '\\s*:').test(tb));
  if (!missing.length) ok('every theme in the picker has an entry in the themes object');
  else no('offered with no theme object: ' + missing.join(', ') + ' - selecting one renders the fallback instead');

  // and nothing in the object is unreachable from the picker
  const keys = [...tb.matchAll(/(^|[\s{,])([a-z]+)\s*:\s*\{/g)].map(m => m[2]);
  const orphans = keys.filter(k => !names.includes(k) && k !== 'default');
  if (!orphans.length) ok('no theme object is unreachable from the picker');
  else no('theme(s) with no picker entry: ' + orphans.join(', ') + ' - they are unreachable from the UI');
}

{
  // the two hand-written lists are gone
  if (/<option value="(default|red|blue|purple)"/.test(html)) {
    no('index.html still hand-writes the <option> list; it must be generated or the two lists can drift again');
  } else ok('the <option> list is generated, not hand-written');
  if (/class="color-dot"\s+style="background:\s*#/.test(html)) {
    no('index.html still hand-writes the preview dots; they must be generated for the same reason');
  } else ok('the preview dots are generated, not hand-written');
  if (/id="themeDots"/.test(html) && /id="themeSelect"/.test(html)) ok('both mount points exist for the generated list');
  else no('the generated theme list has no mount points in the markup');
}

// ---- 2. the custom background description is gone ----
{
  const gone = 'A full-page backdrop behind the whole app, separate from your banner. The theme is picked from the image automatically.';
  if (html.indexOf(gone) < 0) ok('the Custom Background description text is removed');
  else no('the Custom Background description text is still in the markup');
}

// ---- 3. one resolver, and no lookup that can miss a custom colour ----
{
  const raw = (functionBody(code, 'shResolveTheme') !== null) ? /themes\[[^\]]*\]/.exec(code) : null;
  const stray = [...code.matchAll(/themes\[[^\]]+\]/g)].map(m => m[0])
    // themes.default / themes[name] inside shResolveTheme itself is the point
    .filter(s => !functionBody(code, 'shResolveTheme').includes(s));
  if (!stray.length) ok('no theme lookup exists outside shResolveTheme, so a custom colour cannot be missed by one of them');
  else no('theme lookup(s) outside shResolveTheme: ' + stray.join(', '));

  const apply = functionBody(code, 'applyTheme') || '';
  if (/shResolveTheme\(themeName\)/.test(apply)) ok('applyTheme resolves through shResolveTheme');
  else no('applyTheme does not use shResolveTheme - a custom colour would render as purple');

  const tint = functionBody(code, 'shRefreshCardTint') || '';
  if (/shResolveTheme\(/.test(tint)) ok('shRefreshCardTint resolves through shResolveTheme');
  else no('shRefreshCardTint looks the theme up itself; the backdrop would be tinted for the wrong theme');
}

// ---- 4. the stored form survives the worker ----
{
  if (/const SH_CUSTOM_THEME_PREFIX = 'custom:'/.test(code)) ok('a custom colour is stored as custom:#rrggbb');
  else no('the custom theme storage form is not defined');

  if (/30/.test(code.match(/SH_CUSTOM_THEME_MAX = (\d+)/)[0])) {
    const cap = parseInt(/SH_CUSTOM_THEME_MAX = (\d+)/.exec(code)[1], 10);
    const worker = fs.readFileSync('For Cloudflare/worker.js', 'utf8');
    const wm = /out\.theme\.length > (\d+)/.exec(worker);
    if (!wm) no('the worker no longer caps the theme length; the client cap cannot be checked against it');
    else if (parseInt(wm[1], 10) === cap) ok('the client restates the worker\'s theme cap (' + cap + ' chars) so it can refuse before being told');
    else no('the client thinks the theme cap is ' + cap + ' and the worker enforces ' + wm[1]);
  } else no('SH_CUSTOM_THEME_MAX is not defined');

  const validate = functionBody(code, 'shValidateThemeName') || '';
  if (/shNormalizeHex/.test(validate)) {
    ok('a custom theme name is validated as a real colour before it is stored, not after');
  } else {
    no('a custom theme name is stored without checking it is a colour - the page would look applied and the record would hold a value the worker resets');
  }
  const change = functionBody(code, 'changeTheme') || '';
  if (/shValidateThemeName/.test(change)) ok('changeTheme refuses an unusable name rather than storing it');
  else no('changeTheme stores whatever it is given; applyTheme falls back to purple, so a bad name looks applied but syncs as something else');
}

// ---- 5. contrast: a light primary must not get white button text ----
{
  const themesBlock = /const themes = \{([\s\S]*?)\n\};/.exec(code);
  const tb = themesBlock ? themesBlock[1] : '';
  const entries = [...tb.matchAll(/([a-z]+)\s*:\s*\{([^}]*)\}/g)];
  let bad = [];
  for (const [, name, body] of entries) {
    for (const f of ['primary', 'secondary', 'bg', 'card', 'text', 'accent', 'onPrimary']) {
      if (!new RegExp(f + '\\s*:').test(body)) bad.push(name + ' has no ' + f);
    }
  }
  if (!bad.length) ok('all ' + entries.length + ' themes define all seven values');
  else no('incomplete theme(s): ' + bad.join('; '));

  // and the field is actually USED - defined and ignored is the same failure as
  // the missing field
  const apply = functionBody(code, 'applyTheme') || '';
  if (/el\.style\.color = theme\.onPrimary/.test(apply)) {
    ok('applyTheme writes onPrimary onto the primary buttons, so a light theme is not white-on-white');
  } else {
    no('onPrimary is defined but never written; white text on a yellow, gold, mint, aqua or white gradient is unreadable');
  }

  // no theme may ship button ink that fails WCAG AA against its own gradient.
  //
  // The measure is the CONTRAST RATIO, not a difference in luminance. That is not a
  // detail: a first version of this check used Math.abs(lp - li) < 0.35 and failed
  // orange and pink, whose dark ink was the better of the two available choices.
  // Contrast is (L1+0.05)/(L2+0.05) - a ratio - which is why a difference threshold
  // disagrees with it exactly in the mid-tones, which is where these colours live.
  // AA for body-size text is 4.5:1, and a button label is body-size text.
  function lum(hex) {
    const m = /#([0-9a-f]{6})/i.exec(hex); if (!m) return null;
    const c = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255)
      .map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) {
    if (a === null || b === null) return null;
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }
  const clashing = [];
  const invisible = [];
  for (const [, name, body] of entries) {
    const p = /primary:\s*'([^']+)'/.exec(body);
    const sec = /secondary:\s*'([^']+)'/.exec(body);
    const ink = /onPrimary:\s*'([^']+)'/.exec(body);
    if (!p || !sec || !ink) continue;
    // The WHOLE gradient, not the two ends. A 135deg linear gradient passes through
    // every blend between primary and secondary, and the label sits wherever it sits
    // - so checking only the ends is how purple, brown and amethyst shipped with an
    // unreadable middle while both ends measured fine.
    const la = lum(p[1]), lb = lum(sec[1]), li = lum(ink[1]);
    let worst = Infinity;
    for (let i = 0; i <= 8; i++) {
      const point = la * (1 - i / 8) + lb * (i / 8);
      worst = Math.min(worst, ratio(point, li));
    }
    if (worst < 4.5) clashing.push(name + ' ' + worst.toFixed(2) + ':1');
    // a gradient the two ends barely differ by is not a gradient: the button reads
    // as a flat block and `secondary` is doing nothing
    if (Math.abs(lb - la) < 0.04) invisible.push(name + ' (sep ' + Math.abs(lb - la).toFixed(3) + ')');
    // and the ink must be the better of the two available, not just an option
    const w = ratio(la, lum('#ffffff')), d = ratio(la, lum('#101014'));
    if (ratio(la, li) < Math.max(w, d) - 0.01) clashing.push(name + ' chose the worse ink');
  }
  if (!clashing.length) ok('every theme clears WCAG AA (4.5:1) for its button label at EVERY point of its gradient');
  else no('button label fails contrast on: ' + clashing.join(', '));
  if (!invisible.length) ok('every gradient is actually visible - the two ends differ enough to read as a gradient');
  else no('gradient too flat to see: ' + invisible.join(', '));

  // and the derived custom theme must clear it too, for ANY colour at all
  const fromHex = functionBody(code, 'shThemeFromHex') || '';
  if (/onPrimary:\s*light\s*\?/.test(fromHex)) {
    ok('a custom colour picks its ink by measured luminance, so an arbitrary colour cannot produce unreadable text');
  } else {
    no('the custom theme does not choose its ink from the colour luminance');
  }
}

// ---- 6. the custom colour path is styled, not a bare input ----
{
  if (/id="customThemeSwatch"/.test(html) && /type="color"/.test(html)) ok('a real colour input is present - it is the only way to get the OS colour wheel');
  else no('there is no <input type=color>; a colourpicker cannot be built from a div');
  if (/onclick="openCustomThemePicker\(\)"/.test(html)) ok('the custom colour control has a visible trigger button');
  else no('nothing opens the custom colour picker');
  if (/btn-custom-theme/.test(css) && /linear-gradient/.test(css)) ok('the trigger is styled in the theme\'s own colours');
  else no('the custom colour trigger is unstyled');
  if (/\.custom-theme-input\s*\{[^}]*opacity:\s*0/.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    ok('the native input is visually hidden but NOT display:none, so the button can still click() it open');
  } else {
    no('the native input is hidden in a way that would stop the button opening it');
  }
  if (/sh-open \.custom-theme-input/.test(css)) ok('the chosen colour is shown as a swatch once the picker has been opened');
  else no('after choosing a colour there is nothing on screen showing which colour is live');
  if (/oninput="shOnCustomThemeInput/.test(html) && /onchange="shCommitCustomTheme\(\)"/.test(html)) {
    ok('a drag previews live and only the close commits - one sync per choice, not one per pixel');
  } else {
    no('the custom colour does not separate preview from commit; a drag would sync to the cloud on every input event');
  }
  const preview = functionBody(code, 'shOnCustomThemeInput') || '';
  if (preview && !/saveUsers|shPushUser/.test(preview)) ok('the live preview saves nothing');
  else no('the live preview writes to storage or the cloud; a colour-wheel drag would flood /sh/user-sync');
}

// ---- 7. the backdrop sampler reads the SHIPPED palette ----
{
  if (/var SH_THEME_RGB = \(function \(\) \{/.test(code)) {
    ok('SH_THEME_RGB is derived from the theme objects, not a second hand-kept copy of the palette');
  } else {
    no('SH_THEME_RGB is a literal list of hexes; it will drift from `themes` and match a backdrop to a colour the site no longer ships');
  }
}

// ---- 8. the removed "dark" name, and the alias, resolve correctly ----
{
  const resolve = functionBody(code, 'shResolveTheme') || '';
  if (/themes\[name\]/.test(resolve) && /SH_THEME_FALLBACK/.test(resolve)) {
    ok('an unknown theme name falls back rather than throwing');
  } else {
    no('shResolveTheme has no fallback for an unknown name; a stale saved theme would break the page');
  }
  if (/themes\.default = themes\.purple/.test(code)) {
    ok('"default" is kept as an alias for purple, so accounts created before this list still render');
  } else {
    no('the "default" alias is gone; every account created before this change would have no theme');
  }
  if (!/resolve\('dark'\)/.test(code)) ok('no code still asks for the removed "dark" name');
  else no('something still resolves the theme to "dark", which no longer exists and would fall back to purple');
}

console.log('');
console.log(fail ? 'THEMES   ' + fail + ' FAILED' : 'THEMES   all checks passed');
process.exit(fail ? 1 : 0);
