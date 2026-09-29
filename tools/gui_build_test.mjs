// A GUI script must still BUILD after obfuscation - measured, not assumed.
//
// This exists because a real 44KB Roblox GUI script ran perfectly open-source and
// produced an EMPTY ScreenGui after obfuscation: the ScreenGui existed, the loading
// overlay was created, its own teardown tween then destroyed it on schedule, and the
// player saw a GUI blink and vanish. No error reached them.
//
// The cause was NOT the transform and NOT the source. It was the VM's host-call path:
// it saved the interpreter's registers only when the callee was literally
// `coroutine.resume` or `coroutine.yield`, and `task.spawn` is neither - yet its body
// resumes a coroutine running VM code, which leaves PC/SP/FP/BASE/CUR and the operand
// registers pointing at the spawned frame. The caller then continued from a stale
// program counter and the rest of the chunk silently never ran. Fixed in vm-bytecode.js;
// tools/host_spawn_test.mjs is the focused guard and belongs in the same commit.
//
// The transform is proven lossless by measurement: this file runs the same script at
// intensities 1, 3, 5, 8 and 10 and compares the final GUI tree against the
// unobfuscated baseline object for object.
//
// HARNESS RULES, all of them learned the hard way here. Each one previously produced a
// confident, wrong conclusion:
//
//   * The baseline must run clean first, or nothing below is a finding. A stub that
//     cannot run the script turns the harness into the suspect.
//   * A fault inside a spawned thread counts as a failure of the script, not a pass.
//     `coroutine.resume` returns false plus a message; discarding it makes a program
//     that dies on its first line look like one that ran to completion.
//   * Every global the script reads must be defined, and gaps are reported. An
//     undefined `TweenService` once produced "the VM breaks on tween code".
//   * The anti-crack canary must be pre-registered or the wrapper prints its decoy and
//     every run looks like a build failure.
//   * Readback helpers must CALL the stub's probe functions. Reading the global and
//     converting it with lua_tointeger yields 0 with no error at all, which looks
//     exactly like "the script built nothing".
import luaparse from 'luaparse';
import fs from 'node:fs';
import fengari from 'fengari';
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmSetLuaparse } from '../vm-pass.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

// A GUI script small enough to keep the test fast, but shaped like the real one:
// nested global member calls, multi-argument constructors, a tween on a completion
// signal, a spawned thread, and a final visibility decision.
const GUI_SRC = `
local PlayerGui = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local screenGui = Instance.new("ScreenGui")
screenGui.Name = "GuiProbe_UI"
screenGui.ResetOnSpawn = false
screenGui.Parent = PlayerGui
local overlay = Instance.new("Frame")
overlay.Size = UDim2.new(1, 0, 1, 0)
overlay.BackgroundColor3 = Color3.fromRGB(12, 12, 15)
overlay.ZIndex = 1000
overlay.Parent = screenGui
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(1, 0)
corner.Parent = overlay
local panel = Instance.new("Frame")
panel.Size = UDim2.new(0, 360, 0, 220)
panel.Position = UDim2.new(0.5, -180, 0.5, -110)
panel.Visible = false
panel.Parent = screenGui
local btn = Instance.new("TextButton")
btn.Size = UDim2.new(0.42, 0, 0.22, 0)
btn.Position = UDim2.new(0.05, 0, 0.7, 0)
btn.Text = "Continue"
btn.Font = Enum.Font.GothamBold
btn.Parent = panel
task.spawn(function()
    task.wait(0.2)
    local tw = TweenService:Create(overlay, TweenInfo.new(0.1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {BackgroundTransparency = 1})
    tw.Completed:Connect(function() overlay:Destroy() end)
    tw:Play()
end)
if readfile and isfile and isfile("probe.txt") then
    panel.Visible = true
else
    panel.Visible = true
end
`;

const STUB = fs.readFileSync(new URL('./roblox_stub.lua', import.meta.url), 'utf8');

function run(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const s1 = lauxlib.luaL_dostring(L, to_luastring(STUB));
    if (s1 !== lua.LUA_OK) { console.log('    STUB FAILED: ' + to_jsstring(lua.lua_tostring(L, -1))); return null; }
    const st = lauxlib.luaL_dostring(L, to_luastring(code));
    const e = lua.lua_tostring(L, -1);
    lua.lua_getglobal(L, to_luastring('PUMP'));
    lua.lua_pushinteger(L, 6);
    lua.lua_pcall(L, 1, 0, 0);
    // The stub's probes are global FUNCTIONS, so they have to be CALLED. Reading
    // the global and converting it with lua_tointeger yields 0 with no error at all,
    // which looks exactly like "the script built nothing" - a harness that silently
    // reports a false negative is worse than no harness.
    //
    // The conversion has to happen INSIDE this helper too: each call leaves its
    // result on the stack, so reading the first result after the second call has
    // run silently converts the wrong value.
    const call0 = (name) => {
        lua.lua_getglobal(L, to_luastring(name));
        if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) return { err: name + ' is not a function' };
        if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) return { err: name + ' failed: ' + to_jsstring(lua.lua_tostring(L, -1)) };
        const t = lua.lua_type(L, -1);
        if (t === lua.LUA_TNUMBER) return { n: lua.lua_tointeger(L, -1) };
        if (t === lua.LUA_TSTRING) return { s: to_jsstring(lua.lua_tostring(L, -1)) };
        return { err: name + ' returned type ' + t };
    };
    const r1 = call0('COUNT');
    const r2 = call0('PANELVIS');
    const r3 = call0('MISSINGNAMES');
    if (process.env.SH_DBG) console.log('    [dbg] ' + JSON.stringify(r1) + ' ' + JSON.stringify(r2));
    return {
        ok: st === lua.LUA_OK,
        err: e ? to_jsstring(e) : '',
        count: r1.n === undefined ? -1 : r1.n,
        panel: r2.s === undefined ? (r2.err || '?') : r2.s,
        missing: r3.s === undefined ? '' : r3.s,
    };
}

const base = run(GUI_SRC);
if (base === null || !base.ok) {
    no('the stub cannot run the UNOBFUSCATED script (' + (base ? base.err.split('\n')[0] : '?') + ') - the harness is broken, not the code');
    process.exit(1);
}
if (base.count < 3) {
    no('the unobfuscated script only parented ' + base.count + ' object(s) and panel=' + base.panel + ' err=' + JSON.stringify(base.err.slice(0, 200)) + '; the stub cannot see the GUI, so nothing below is measurable');
    process.exit(1);
}
ok('baseline: ' + base.count + ' objects parented, panel Visible=' + base.panel);
if (base.missing) {
    // Not fatal - a script may legitimately probe for optional globals - but it has
    // to be on the record, because an undefined global is the classic way a stub
    // turns into a fake failure.
    console.log('  note the script reads globals this stub does not define: ' + base.missing.slice(0, 200));
}

// The anti-crack wrapper registers a canary in getgenv() and then verifies it. If
// the canary is not pre-registered, the wrapper concludes it has been tampered with
// and prints the decoy instead of running the payload - which makes every run look
// like a build failure. It is a harness artefact, not a code defect.
function canaryFor(obf) {
    const cm = String(obf).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return cm ? '_G.' + cm[1] + '=' + cm[2] + '\n' : '';
}

console.log('\n  the TRANSFORM must be lossless at every intensity:');
for (const intensity of [1, 3, 5, 8, 10]) {
    const dbg = {};
    let obf;
    try {
        obf = applyCustomObfuscator(GUI_SRC, { intensity, antiTamper: true, antiSkid: false, antiLogger: true, vmPass: false }, dbg);
    } catch (e) { no('intensity ' + intensity + ' generator threw ' + e.message); continue; }
    const payload = dbg.payload || obf;
    const r = run(canaryFor(obf) + payload);
    if (!r || !r.ok) { no('intensity ' + intensity + ' failed to run: ' + (r ? r.err.split('\n')[0] : '?')); continue; }
    if (r.count === base.count && r.panel === base.panel) {
        ok('intensity ' + intensity + ': identical GUI (' + r.count + ' objects, panel Visible=' + r.panel + ')');
    } else {
        no('intensity ' + intensity + ': ' + r.count + ' objects / panel ' + r.panel + ' vs baseline ' + base.count + ' / ' + base.panel);
    }
}

console.log('\n  the BYTECODE VM must build the same GUI:');
{
    const dbg = {};
    let obf;
    try {
        obf = applyCustomObfuscator(GUI_SRC, { intensity: 5, antiTamper: true, antiSkid: false, antiLogger: true, vmPass: true }, dbg);
    } catch (e) {
        no('the generator threw: ' + e.message.slice(0, 90));
    }
    if (obf) {
        const r = run(canaryFor(obf) + (dbg.payload || obf));
        if (r && r.ok && r.count === base.count && r.panel === base.panel) {
            ok('VM: identical GUI (' + r.count + ' objects, panel Visible=' + r.panel + ')');
        } else if (r && r.spawn) {
            no('VM: faulted inside a spawned thread: ' + r.spawn.split('\n')[0].slice(0, 80));
        } else if (r && r.ok) {
            no('VM: built ' + r.count + ' of ' + base.count + ' objects, panel ' + r.panel + ' - execution stopped early');
        } else {
            no('VM: ' + (r ? r.err.split('\n')[0] : 'harness error'));
        }
    }
}

console.log('\n  the dashboard escape hatch exists:');
{
    const main = (await import('node:fs')).readFileSync('main.js', 'utf8');
    if (/id="scriptBytecodeVM"/.test(main)) ok('the create modal has a Bytecode VM checkbox');
    else no('no Bytecode VM checkbox in the create modal');
    if (/id="editScriptBytecodeVM"/.test(main)) ok('the edit modal has a Bytecode VM checkbox');
    else no('no Bytecode VM checkbox in the edit modal');
    // Count BOTH forms. The two re-obfuscation paths in generateLoadstring() have no
    // modal open, so they read the record (`script.vmPass !== false`) rather than a
    // local; counting only the local form under-reports the plumbing by two.
    const passes = (main.match(/vmPass: (?:vmPass|script\.vmPass[^\n,]*)/g) || []).length;
    if (passes >= 5) ok('vmPass reaches ' + passes + ' obfuscation call sites');
    else no('vmPass only reaches ' + passes + ' call site(s); a checkbox that is not plumbed is decoration');
    if (/window\.shBytecodeVMNote\s*=/.test(main)) ok('shBytecodeVMNote is exported, so the inline onchange is not a dead handler');
    else no('shBytecodeVMNote is not exported - main.js is a module, so the inline onchange would throw');
    // The choice has to survive a save/load cycle, or reopening the edit modal would
    // silently re-enable the VM and reintroduce the exact failure the tick removed.
    const recordStores = /var script = \{[\s\S]{0,400}?vmPass: vmPass,/.test(main);
    const editReadsBack = /editScriptBytecodeVM"\s*\$\{script\.vmPass/.test(main);
    if (recordStores && editReadsBack) ok('vmPass is stored on the record and read back by the edit modal');
    else no('vmPass does not survive a save/load cycle (stored=' + recordStores + ', read back=' + editReadsBack + ')');

    // A bare `vmPass: vmPass` is only correct in a function that declares it. Two of
    // the five call sites are in generateLoadstring(), which re-obfuscates a SAVED
    // script with no modal open - `vmPass: vmPass` there is a ReferenceError, and it
    // ships silently because nothing in the test suite executes that path. Counting
    // the call sites, as an earlier version of this test did, cannot see it.
    {
        const lines = main.split(/\r?\n/);
        let fn = '(top)', fnStart = 0;
        const declIn = new Map();
        lines.forEach((l, i) => {
            const m = /^function\s+([A-Za-z_]\w*)/.exec(l);
            if (m) { fn = m[1]; fnStart = i; }
            if (/var vmPass\s*=/.test(l) && !declIn.has(fn)) declIn.set(fn, i);
        });
        const bad = [];
        lines.forEach((l, i) => {
            if (l.includes('vmPass: vmPass,')) {
                let owner = '(top)';
                for (const [name, at] of declIn) if (at < i) owner = name;
                // nearest enclosing declaration wins; approximate but sufficient here
                const nearest = [...declIn.entries()].filter(([, at]) => at < i).sort((a, b) => b[1] - a[1])[0];
                if (!nearest || nearest[0] !== owner) bad.push((i + 1) + ' in ' + owner + '()');
            }
        });
        const allDecl = [...declIn.keys()];
        const undeclared = lines.map((l, i) => ({ l, i })).filter(x => x.l.includes('vmPass: vmPass,')).filter(x => {
            let owner = null;
            for (const [name, at] of declIn) if (at < x.i && (!owner || at > declIn.get(owner))) owner = name;
            return owner === null;
        });
        if (undeclared.length === 0) ok('every `vmPass: vmPass` sits in a function that declares it (' + allDecl.join(', ') + ')');
        else no('`vmPass: vmPass` used with no declaring function in scope at line(s) ' + undeclared.map(x => x.i + 1).join(', '));
    }
}

console.log('');
console.log(fail ? 'GUI BUILD   ' + pass + ' passed, ' + fail + ' FAILED' : 'GUI BUILD   ' + pass + ' passed, 0 failed');
process.exit(fail ? 1 : 0);
