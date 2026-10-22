// Check the key gate: it parses, it is pure ASCII-able, and its HTTP calls
// really do answer the way it expects.
import fs from 'node:fs';

const PATH = 'scripterhub_keygate.lua';
let src = fs.readFileSync(PATH, 'utf8');

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

console.log('THE GATE PARSES');
{
    const luaparse = (await import('luaparse')).default;
    let ok = true, err = '';
    try { luaparse.parse(src, { luaVersion: '5.1' }); } catch (e) { ok = false; err = e.message; }
    check('the Lua is valid', ok, err);
}

console.log('');
console.log('IT DOES NOT USE JSON, AND IT USES NO LIBRARY');
{
    const code = src.split('\n').filter(l => !/^\s*(--|\/\/|\*|\/\*)/.test(l)).join('\n');
    check('no JSONEncode', code.indexOf('JSONEncode') === -1, 'it encodes JSON');
    check('no JSONDecode', code.indexOf('JSONDecode') === -1, 'it decodes JSON');
    check('no HttpService', code.indexOf('HttpService') === -1, 'it asks for HttpService');
    check('and it does not pull down the luarmor library',
        code.indexOf('sdkapi-public.luarmor.net') === -1, 'it still calls luarmor');
    check('it only ever GETs', code.indexOf('Method="POST"') === -1, 'it posts');
}

console.log('');
console.log('IT TALKS TO THE OWNER\'S OWN WORKER');
{
    check('the worker address is in it',
        src.indexOf('https://scripterhub-stats.dubovikstanislav51.workers.dev') !== -1,
        'the worker address is missing');
    check('and it asks the plain-text key check', /\/sh\/keycheck\?k=/.test(src), 'no keycheck');
    check('and it asks the whitelist', /\/sh\/whitelist\?h=/.test(src), 'no whitelist');
    check('and it sends both hardware ids',
        /&h2=" \.\. urlEncode\(hwid2\)/.test(src), 'the second id is not sent');
    check('and it reads the SHOK answer', /\^SHOK \(%d\+\) \(%d\+\)/.test(src), 'it does not read SHOK');
    check('and the SHERR answer', /\^SHERR \(\.\+\)\$/.test(src), 'it does not read SHERR');
}

console.log('');
console.log('IT WORKS THE WAY THE WORKER ANSWERS');
{
    // The real answers, from the real worker.
    const W = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
    const GUID = '91164E91-D7DC-47AE-81EA-8A506F0BC51F';
    async function ask(q) {
        const res = await fetch(W + q);
        return (await res.text()).trim();
    }
    const wl = await ask('/sh/whitelist?h=' + encodeURIComponent(GUID) + '&h2=Real');
    check('the whitelist answers SHW yes', /^SHW yes/.test(wl), wl);
    check('and the gate reads it', /match\("\^SHW yes"\)/.test(src), 'the gate does not read SHW');

    // A key that is not a key.
    const bad = await ask('/sh/keycheck?k=NOT-A-REAL-KEY&h=' + encodeURIComponent(GUID) + '&h2=Real');
    check('a made-up key answers SHERR invalid', bad === 'SHERR invalid', bad);
    check('and the gate reads the code', src.indexOf('"^SHERR (.+)$"') !== -1, 'the gate does not read SHERR');
}

console.log('');
console.log('THE FAST PATH AND THE STOP');
{
    check('the already-validated path does not return',
        /if _G\.ScripterHub_KeyValid == true then[\s\S]{0,200}?\n\s*else/.test(src) &&
        !/if _G\.ScripterHub_KeyValid == true then[\s\S]{0,120}?return/.test(src),
        'the already-validated path stops the script');
    check('and the no-key path does', /STOP HERE - do not continue\s*\n\s*return/.test(src),
        'the no-key path does not stop the script');
    check('the key is handed to the environment', /env\.ScripterHubKey = key/.test(src),
        'the key is not handed over');
    check('and the key card is loaded when there is no key',
        src.indexOf('SH_KEYCARD') !== -1 && /loadstring\(game:HttpGet\(SH_KEYCARD\)\)/.test(src),
        'the key card is not loaded');
}

console.log('');
console.log(fails === 0 ? 'KEY GATE   all checks passed' : ('KEY GATE   ' + fails + ' FAILED'));
process.exit(fails === 0 ? 0 : 1);
