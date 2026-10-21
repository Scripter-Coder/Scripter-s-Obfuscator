// Make a Lua file PURE ASCII without losing a single emoji.
//
// WHY
//
// A .lua file is served as "text/x-lua" with NO charset, and a client that
// decodes the response with the charset it GUESSED - and the guess for an
// unknown text type is usually Latin-1 - turns every emoji into "a-oe..."
// garbage. The same happens when a file is copied through a chat window or
// saved by an editor that guessed the wrong encoding.
//
// A Lua string is a BYTE string, so the same emoji can be written as decimal
// byte escapes:
//
//     "\240\159\143\160"      -- a house
//
// and Roblox renders the bytes as UTF-8 exactly as before. The source is then
// pure ASCII, so NOTHING can mangle it.
//
// THE ESCAPES HAVE TO ROUND-TRIP, and that is the part worth keeping.
//
// The first attempt walked the file with src[i], which is a CODE UNIT index,
// and an emoji outside the BMP is TWO of them. Worse: ch.codePointAt(0) does
// NOT help either, because on a LONE surrogate it returns the surrogate
// itself (0xD83D), and that encodes to the replacement character. So every
// emoji became two replacement characters - the file was still "pure ASCII"
// (so the check was happy) and the card would have shown NOTHING where the
// emoji were.
//
// The one that works is src.codePointAt(i): on the WHOLE string, it combines
// the pair.
//
// Run: node tools/ascii_escape_lua.mjs <file.lua> [...]
//      node tools/ascii_escape_lua.mjs --check <file.lua>   (report only)

import fs from 'node:fs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const files = args.filter(a => a !== '--check');
if (!files.length) { console.log('usage: node tools/ascii_escape_lua.mjs [--check] <file.lua> ...'); process.exit(1); }

function esc(ch) {
    return [...Buffer.from(ch, 'utf8')].map(b => '\\' + b.toString(10)).join('');
}

// Walk the file, and escape the non-ascii characters that are inside string
// literals. The comments are left alone.
function escapeLua(src) {
    let out = '';
    let i = 0;
    let inString = false, quote = '', inLineComment = false, inBlockComment = false, blockLevel = 0;
    let escaped = 0, commentNonAscii = 0;
    while (i < src.length) {
        const ch = src[i];
        const next = src[i + 1] || '';
        if (inLineComment) {
            out += ch;
            if (ch === '\n') inLineComment = false;
            i++; continue;
        }
        if (inBlockComment) {
            out += ch;
            if (ch === '-' && next === '[') { blockLevel++; out += next; i += 2; continue; }
            if (ch === ']' && next === ']') {
                blockLevel--; out += next; i += 2;
                if (blockLevel === 0) inBlockComment = false;
                continue;
            }
            if (ch.codePointAt(0) > 127) commentNonAscii++;
            i++; continue;
        }
        if (inString) {
            if (ch === '\\') { out += ch + (next || ''); i += 2; continue; }
            if (ch === quote) { inString = false; out += ch; i++; continue; }
            // THE WHOLE CHARACTER, through the WHOLE string.
            const cp = src.codePointAt(i);
            if (cp > 127) {
                const whole = String.fromCodePoint(cp);
                out += esc(whole);
                escaped++;
                i += whole.length;
                continue;
            }
            out += ch; i++; continue;
        }
        if (ch === '-' && next === '-') {
            if (src[i + 2] === '[' && src[i + 3] === '[') {
                inBlockComment = true; blockLevel = 1; out += '--[['; i += 4; continue;
            }
            inLineComment = true; out += '--'; i += 2; continue;
        }
        if (ch === '"' || ch === "'") { inString = true; quote = ch; out += ch; i++; continue; }
        out += ch; i++;
    }
    return { out: out, escaped: escaped, commentNonAscii: commentNonAscii };
}

let bad = 0;
for (const path of files) {
    const raw = fs.readFileSync(path, 'utf8');
    const crlf = raw.indexOf('\r\n') !== -1;
    const src = crlf ? raw.replace(/\r\n/g, '\n') : raw;
    const before = [...src].filter(c => c.codePointAt(0) > 127);
    const { out, escaped, commentNonAscii } = escapeLua(src);

    // THE CHECK: the escapes have to decode back to what they came from.
    // The decode is BYTES FIRST: a Lua escape is one byte, so the escapes go
    // back to bytes (latin1) and the BYTES are then read as UTF-8.
    const asBytes = out.replace(/\\(\d{1,3})/g, (m, n) => String.fromCharCode(Number(n)));
    const decoded = Buffer.from(asBytes, 'latin1').toString('utf8');
    const after = [...decoded].filter(c => c.codePointAt(0) > 127);
    const lost = before.filter(e => after.indexOf(e) === -1);
    const replacement = after.filter(c => c.codePointAt(0) === 0xFFFD);

    const pure = ![...out].some(c => c.codePointAt(0) > 127);
    console.log(path);
    console.log('   characters escaped      : ' + escaped);
    console.log('   non-ascii before/after  : ' + before.length + ' / ' + after.length);
    console.log('   lost                    : ' + (lost.length ? lost.join('') : 'none'));
    console.log('   replacement characters  : ' + replacement.length);
    console.log('   non-ascii in comments    : ' + commentNonAscii);
    console.log('   pure ascii              : ' + pure);
    if (lost.length || replacement.length || !pure) { bad++; continue; }
    if (checkOnly) continue;
    fs.writeFileSync(path, crlf ? out.replace(/\n/g, '\r\n') : out, 'utf8');
    console.log('   written');
}

process.exit(bad ? 1 : 0);
