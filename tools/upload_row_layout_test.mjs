// Custom Background must sit to the RIGHT of Profile Image, Banner Image and
// Theme, in the same row - as the fourth cell of one grid.
//
// THE BUG, AND WHY IT LOOKED LIKE A CSS PROBLEM
//
//     Profile Image | Banner Image | Theme          <- .upload-section
//     Custom Background                          <- NOT in .upload-section
//
// The cause was a misplaced </div>. upload-section was closed immediately after
// the Theme group, so the Custom Background group was a SIBLING of the grid
// instead of a cell inside it. It rendered below the card, full width, on its own
// row - which is exactly what a group in a 3-column grid wrapping to a second row
// looks like.
//
// So the report was "the grid columns are being ignored", and the grid columns
// were correct the whole time. Changing grid-template-columns could never have
// fixed it, because the element was not in the grid. Nothing in the repo could
// tell markup and CSS apart from the outside either, which is why it survived.
//
// WHAT IS CHECKED
//
// 1. The markup: upload-section contains exactly four upload-groups, and the
//    fourth is the Custom Background one. Checked by tracking div depth, so an
//    unbalanced tag cannot pass it.
// 2. The order: Profile, Banner, Theme, Custom Background.
// 3. The CSS: four columns, and the fourth is explicitly pinned so the placement
//    is intent rather than an accident of source order.
// 4. The responsive rule releases that pin - a pinned track 4 in a 2-track grid
//    is a blank column plus an orphan row, i.e. the identical symptom.
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8').split(/\r?\n/);
const css = fs.readFileSync('css/style.css', 'utf8');

let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// ---- 1 & 2: the four groups, in order, all INSIDE upload-section ----
{
  const start = html.findIndex(l => /class="upload-section"/.test(l));
  if (start < 0) {
    no('no .upload-section in index.html');
  } else {
    // walk the subtree by div depth and collect the direct children that are
    // upload-groups. Depth-tracking is the point: it cannot be fooled by a
    // mis-nested </div>, which is the bug.
    let depth = 0;
    const groups = [];      // { depthAtOpen, label }
    let closingDepth = -1;
    for (let i = start; i < html.length; i++) {
      const line = html[i] || '';
      const opens = (line.match(/<div\b/g) || []).length;
      const closes = (line.match(/<\/div>/g) || []).length;
      if (/class="upload-group"/.test(line)) {
        // the label is on one of the next few lines, inside this group
        let label = '';
        for (let j = i; j < Math.min(i + 6, html.length); j++) {
          const m = /<label>([^<]*)<\/label>/.exec(html[j] || '');
          if (m) { label = m[1].trim(); break; }
        }
        // depth is already 1 inside .upload-section, so a direct child sits at 1.
        groups.push({ depth: depth, label: label });
      }
      depth += opens - closes;
      if (depth === 0 && i > start) { closingDepth = i; break; }
    }

    if (groups.length !== 4) {
      no('upload-section holds ' + groups.length + ' upload-group(s), not 4 - a group is outside the grid, which is the reported bug');
    } else {
      ok('upload-section holds exactly 4 upload-groups');
    }

    const offGrid = groups.filter(g => g.depth !== 1);
    if (offGrid.length) {
      no(offGrid.length + ' upload-group(s) are NESTED deeper than a direct child of upload-section, so they are laid out by something else: ' +
        offGrid.map(g => g.label + ' at depth ' + g.depth).join(', '));
    } else {
      ok('all four groups are direct children of upload-section, so the grid lays all of them out');
    }

    const want = ['Profile Image', 'Banner Image', 'Theme', 'Custom Background'];
    const got = groups.map(g => g.label);
    if (JSON.stringify(got) === JSON.stringify(want)) {
      ok('order is Profile Image | Banner Image | Theme | Custom Background');
    } else {
      no('group order is [' + got.join(' | ') + '], expected [' + want.join(' | ') + ']');
    }
    if (got[3] === 'Custom Background') ok('Custom Background is the FOURTH group - the one to the right of Theme');
    else no('the fourth group is "' + got[3] + '", not Custom Background');
  }
}

// ---- 3: the grid places four, and pins the fourth ----
{
  const desktop = /\.upload-section\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  const body = desktop ? desktop[1] : '';
  if (/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/.test(body)) {
    ok('.upload-section is four columns wide (minmax(0,1fr) so a long filename cannot push the fourth track off the card)');
  } else {
    no('.upload-section does not declare four minmax(0,1fr) columns; found: ' + (/grid-template-columns:[^;]*/.exec(body) || ['(none)'])[0]);
  }
  if (/\.upload-section\s+\.upload-group:nth-child\(4\)\s*\{\s*grid-column:\s*4;/.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    ok('the fourth group is pinned to grid-column 4, so the placement is intent and not source order');
  } else {
    no('the fourth group is not pinned to grid-column 4');
  }
}

// ---- 4: the responsive rule must release the pin ----
{
  const media = /@media \(max-width: 768px\)\s*\{([\s\S]*?)\n\}/.exec(css);
  const inner = media ? media[1] : '';
  const stripped = inner.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(stripped)) {
    ok('the 768px rule steps down to two columns');
  } else {
    no('the 768px rule does not step down to two minmax(0,1fr) columns');
  }
  const releases = (stripped.match(/grid-column:\s*auto/g) || []).length;
  if (releases >= 1) {
    ok('the 768px rule releases the explicit column pins (' + releases + 'x grid-column:auto) - a pinned track 4 in a 2-track grid leaves an orphan row');
  } else {
    no('the 768px rule still pins grid-column - Custom Background will land alone on a second row on a tablet');
  }
}

console.log('');
console.log(fail ? 'UPLOAD ROW LAYOUT   ' + fail + ' FAILED' : 'UPLOAD ROW LAYOUT   all checks passed');
process.exit(fail ? 1 : 0);
