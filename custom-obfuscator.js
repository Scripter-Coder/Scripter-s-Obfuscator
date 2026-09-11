// ============================================================
// ScripterHub Custom Obfuscator Engine v3.0
// ------------------------------------------------------------
// A REAL working Lua/Luau obfuscator that runs fully in JS:
//   1. VM PASS: the source is FIRST compiled through a Luarmor-style
//      transform (vm-pass.js) - all strings/numbers move into an
//      encrypted vault, calls route through a proxy dispatcher,
//      member keys are vaulted, locals are morphed. A cracker who
//      peels every encryption layer lands on VM-ified code, NEVER
//      the original source. This is the tier-2 defense.
//   2. SEED-CHAIN LAYERS: N dynamic encryption layers where each
//      byte's key is derived from seed + previous PLAINTEXT byte
//      (cipher feedback) + position, with per-build randomized
//      constants and a decoy-filled slot table. There is no key
//      table to extract, and every build is a different cipher.
//   3. Anti-Tampering: a checksum of the encrypted payload is
//      verified AND used to derive the outer decryption key.
//      Changing a single byte silently destroys the script.
//   4. Environment Logging: collects executor/game/user info and
//      reports it to a webhook and/or a local log file.
//   5. Anti-Skidding: loadstring hook/canary detection, sandbox
//      detection, and an encrypted embedded watermark.
//   6. ANTI-CRACK: one-shot canary + decoy payloads - dumped
//      loadstrings print the troll message instead of the code.
//   Output is unique on every generation => practically
//      impossible to statically deobfuscate.
// ============================================================

import { applyVmPass } from './vm-pass.js';
import { applyBytecodeVm, vmBCSetLuaparse } from './vm-bytecode.js';

// ---------- helpers ----------
function rnd(n) { return Math.floor(Math.random() * n); }
function rndInt(min, max) { return min + rnd(max - min + 1); }
function hex(len) {
    var c = '0123456789abcdef', s = '';
    for (var i = 0; i < len; i++) s += c[rnd(16)];
    return s;
}
function genKey() {
    var len = rndInt(8, 24), k = [];
    for (var i = 0; i < len; i++) k.push(rndInt(1, 255));
    return k;
}
function strToBytes(s) {
    var esc = unescape(encodeURIComponent(s));
    var out = [];
    for (var i = 0; i < esc.length; i++) out.push(esc.charCodeAt(i));
    return out;
}
function checksum(bytes) {
    var sum = 0, xf = 0;
    for (var i = 0; i < bytes.length; i++) {
        sum = (sum + bytes[i]) % 1000000007;
        xf = (xf ^ bytes[i]) & 0xFF;
    }
    return (sum + xf * 31) % 1000000007;
}
function wmChecksum(s) {
    var b = strToBytes(s), sum = 0;
    for (var i = 0; i < b.length; i++) sum = (sum + b[i]) % 1000003;
    return sum;
}
// FNV-style key hash, arithmetic-only (no bit32) so Lua 5.1 doubles stay exact.
// JS and Lua implementations must match byte-for-byte.
function keyHash(s) {
    var a = 0, b = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        a = (a + c * ((i % 7) + 1)) % 1000003;
        b = (b * 31 + c) % 65537;
    }
    return (a * 65537 + b) % 4294967296;
}
function luaEscape(s) {
    var b = strToBytes(s), out = '';
    for (var i = 0; i < b.length; i++) out += '\\' + b[i];
    return out;
}
function makeNames(count) {
    var used = {}, names = [];
    while (names.length < count) {
        var n = '_0x' + hex(4) + hex(2);
        if (!used[n]) { used[n] = 1; names.push(n); }
    }
    return names;
}
function junkLuaLines(count) {
    var lines = [];
    for (var i = 0; i < count; i++) {
        var a = '0x' + hex(4), b = rndInt(2, 999);
        lines.push('local _0x' + hex(6) + '=' + a + ';if ' + a + '==' + (parseInt(a, 16) + b) + ' then _0x' + hex(6) + '=_0x' + hex(6) + '+' + b + ' end');
    }
    return lines.join('\n');
}

// ---------- layer encryption ----------
function encLayer(bytes, key, off, shift) {
    var kl = key.length, out = new Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) {
        out[i] = (((bytes[i] ^ key[(i + off) % kl]) + shift) & 0xFF);
    }
    return out;
}
// No key table ever exists in the output. Each layer emits a table of
// short SEEDS; the key for byte i is derived at runtime as
//   ((seed[j]*C1 + prev*C2 + i*31) % 251 + 5)
// where `prev` is the PLAINTEXT byte decrypted just before (cipher
// feedback). Consequences for crackers:
//   - there is no key to extract; the "key" changes every byte and
//     depends on the data itself
//   - tables contain DECOY seeds (parity-marked via off%2) that produce
//     garbage when peeled, indistinguishable from real ones
//   - every build randomizes C1/C2/IV/walk direction, so each
//     generation is a different algorithm
function encChain(bytes, l) {
    // mirror of the Lua slot-walker: for i=0..C-1, n1 = rev ? C-i : i+1
    // (1-based), q = ((seed[(n1-1)%len]*c1 + prev*c2 + n1*31) % 251) + 5,
    // v = (plain[n1] ^ q) then +sh+(i%3)*ma mod 256; prev = plain[n1].
    var n = bytes.length;
    var out = new Array(n);
    var prev = l.iv & 0xFF;
    for (var i = 0; i < n; i++) {
        var n1 = l.rev ? n - i : i + 1;
        var pb = bytes[n1 - 1];
        var q = ((l.seed[(n1 - 1) % l.seed.length] * l.c1 + prev * l.c2 + n1 * 31) % 251) + 5;
        var v = (pb ^ q) + l.shift + (i % 3) * l.madd;
        out[n1 - 1] = v & 0xFF;
        prev = pb;
    }
    return out;
}
function genChainParams(count) {
    var arr = [];
    for (var i = 0; i < count; i++) {
        var seedLen = rndInt(8, 24);
        var seed = [];
        for (var s = 0; s < seedLen; s++) seed.push(rndInt(29, 251));
        arr.push({
            seed: seed, iv: rndInt(0, 255), c1: rndInt(31, 251), c2: rndInt(2, 97),
            rev: Math.random() < 0.5, off: rndInt(1, 64), // off doubles as decoy parity marker
            shift: rndInt(1, 255), madd: rndInt(0, 97)
        });
    }
    return arr;
}

// ---------- ANTI-CRACK DECOY SYSTEM ----------
// When someone dumps the decrypted string from loadstring / hooks the VM /
// deobfuscates statically, they must not get the real script. We emit a
// DECOY pipeline that looks 100% like the real decryption path (same style,
// same helpers, same names) but produces a troll string instead. The REAL
// path is only reachable through all genuine layer keys + a magic derived
// from the checksum; any patched/dumped path lands on a decoy.
// Decoy output: the configured antiCrackMessage (default "Goodluck Sonion ðŸ’–").
function buildDecoyLayer(seedStr) {
    // deterministic-per-generation decoy key bytes
    var s = seedStr + hex(24);
    var kb = [];
    for (var i = 0; i < s.length; i++) kb.push((s.charCodeAt(i) * (i + 7) + 41) % 251 + 2);
    return kb;
}
function luaEscapeStr(s) {
    var b = strToBytes(s), out = '';
    for (var i = 0; i < b.length; i++) out += '\\' + b[i];
    return out;
}

// ============================================================
// SECURITY WRAPPER (gets encrypted inside the payload)
// ============================================================
function buildSecurityWrapper(options, meta) {
    var antiSkid = options.antiSkid !== false;
    var envLogging = options.envLogging === true;
    var antiLogger = options.antiLogger !== false;
    // ANTI-CRACK: never disabled (protects every script). Custom message optional.
    var antiCrackMsg = String(options.antiCrackMessage || 'Goodluck Sonion ðŸ’–');
    var wm = 'SHv2::' + hex(12) + '::' + meta.name + '::' + meta.owner + '::' + hex(6);
    var wmSum = wmChecksum(wm);
    var n = makeNames(72);
    var parts = [];

    parts.push('--[[' + hex(40) + ' | protected payload | ' + hex(40) + ']]');

    // ---------- ANTI-CRACK DECOY CORE (always on) ----------
    // How a crack works: dump the string handed to loadstring, then run it
    // standalone (or hook loadstring). Defense:
    //   - The LOADER VM (buildLoader) registers a runtime CANARY into genv
    //     right before it calls the decrypted payload. The registration code
    //     is NOT part of the payload string.
    //   - The payload CHECKS the canary. A cracker who dumps the decrypted
    //     string loses the registration context -> canary missing -> they
    //     get the DECOY instead, which prints the anti-crack message
    //     ("Goodluck Sonion ðŸ’–").
    //   - After a pass the canary is DELETED (one-shot), so "run genuine
    //     first, dump later" also lands on the decoy.
    //   - Encrypted decoy payloads + a decoy decryptor identical in shape
    //     to the real loader logic waste the analyst's time.
    // options._canary = { name, magic } is created by applyCustomObfuscator
    // so the loader and the payload share the same values. Self-registration
    // mode (Aegis path, no loader of ours) registers + checks in one chunk.
    var canary = options._canary || { name: '_shc' + hex(10), magic: rndInt(100000, 999999) * 3 + 7 };
    var canaryName = canary.name;
    var magic = canary.magic;
    var selfReg = options._canarySelfReg === true;
    var D1 = n[57], D2 = n[58], D3 = n[59], DX = n[64];
    var TK = n[60], DV1 = n[62], QC = n[69], QV = n[70], GENV1 = n[71];
    var decoyKey1 = buildDecoyLayer(meta.id + 'A');
    var decoyKey2 = buildDecoyLayer(meta.id + 'B');
    var decoyKey3 = buildDecoyLayer(meta.id + 'C');
    function decoyEnc(msg, key) {
        var b = strToBytes(msg), out = [];
        for (var i = 0; i < b.length; i++) out.push((b[i] ^ key[i % key.length]) & 0xFF);
        return out;
    }
    function decoyLuaArr(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i++) s += (i ? ',' : '') + bytes[i];
        return '{' + s + '}';
    }
    // 3 decoy payloads: variations of the troll print + one silent no-op
    var dPayloads = [
        'print(' + JSON.stringify(antiCrackMsg) + ')',
        'warn(' + JSON.stringify(antiCrackMsg) + ') print(' + JSON.stringify(antiCrackMsg) + ')',
        '-- ' + hex(20)
    ];
    parts.push(
        'do',
        // --- decoy data (looks exactly like the real encrypted payload) ---
        ' local ' + D1 + '=' + decoyLuaArr(decoyEnc(dPayloads[0], decoyKey1)),
        ' local ' + D2 + '=' + decoyLuaArr(decoyEnc(dPayloads[1], decoyKey2)),
        ' local ' + D3 + '=' + decoyLuaArr(decoyEnc(dPayloads[2], decoyKey3)),
        ' local ' + TK + '={' + decoyKey1.join(',') + '}',
        // --- decoy decryptor (same shape as the real loader's) ---
        ' local function ' + DX + '(src,k)',
        '  local o={} for i=1,#src do local x=src[i] local y=k[((i-1)%#k)+1]',
        '   local r,p=0,1 for _=1,8 do local a=x%2 local b=y%2 if a~=b then r=r+p end x=(x-a)/2 y=(y-b)/2 p=p*2 end',
        '   o[i]=string.char(r)',
        '  end',
        '  return table.concat(o)',
        ' end',
        ' local function ' + DV1 + '(src,k) return ' + DX + '(src or ' + D1 + ',k or ' + TK + ') end',
        // --- integrity gate: only run the REAL code below when the canary
        //     set by the genuine loader is present. If the string was dumped
        //     and re-run elsewhere, the canary is missing -> decoy fires and
        //     prints the anti-crack message. One-shot: the canary is deleted
        //     on pass so a later re-run of a dump also lands on the decoy.
        (selfReg ? ' local ' + GENV1 + '=(getgenv and getgenv()) or _G ' + GENV1 + '.' + canaryName + '=' + magic : null),
        ' local function ' + QC + '()',
        '  local g=(getgenv and getgenv()) or _G',
        '  return g.' + canaryName + '==' + magic,
        ' end',
        ' local ' + QV + '=' + QC + '()',
        ' if ' + QV + ' then local g=(getgenv and getgenv()) or _G g.' + canaryName + '=nil end',
        ' if not ' + QV + ' then',
        // decoy path: decrypt the (encrypted) decoy payload and run it.
        // EVERY branch is encrypted - the message never appears in plaintext.
        '  pcall(function() local f=loadstring or load local fn=f(' + DV1 + '(nil,nil),"=[sh]") if fn then fn() end end)',
        '  pcall(function() local f=loadstring or load local fn=f(' + DV1 + '(' + D2 + ',' + TK + '),"=[sh]") if fn then fn() end end)',
        '  return',
        ' end',
        'end'
    );

    // ---------- KEY GATE (keys are embedded HASHED - never plaintext) ----------
    // keyMode: 'default' = Roblox Core notifications + popup key card
    //          'custom'  = silent gate, exposes API globals for the user's own GUI
    if (options.keyGate && options.keyGate.keys && options.keyGate.keys.length) {
        var kgSalt = hex(16);
        var keyMode = options.keyGate.mode === 'custom' ? 'custom' : 'default';
        var S = n[31], E = n[32], H = n[33], V = n[34], OKV = n[35], IVK = n[36];
        var FRM = n[37], TTL = n[38], BOX = n[39], BTN = n[40], SGR = n[41], TGT = n[42], T0K = n[43];
        var NT = n[44], CLS = n[45], API = n[46], GENV = n[47];
        var entries = options.keyGate.keys.map(function (k) {
            var exp = k.expires ? Math.floor(k.expires / 1000) : 0;
            return '{' + keyHash(k.key + kgSalt) + ',' + exp + '}';
        });
        parts.push(
            'do',
            ' local ' + S + '="' + kgSalt + '"',
            ' local ' + E + '={' + entries.join(',') + '}',
            ' local function ' + NT + '(t,d)',
            '  pcall(function() game:GetService("StarterGui"):SetCore("SendNotification",{Title="ScripterHub",Text=t,Duration=d or 4,Icon="rbxassetid://7734059095"}) end)',
            ' end',
            // ---- API GLOBALS (Task 16): ScripterHubKeyValid/Incorrect/Expired/Status + WebsiteStatus
            ' local function ' + API + '(st)',
            '  local ' + GENV + '=(getgenv and getgenv()) or _G',
            '  ' + GENV + '.ScripterHubKeyValid=(st=="Valid")',
            '  ' + GENV + '.ScripterHubKeyIncorrect=(st=="Incorrect")',
            '  ' + GENV + '.ScripterHubKeyExpired=(st=="Expired")',
            '  ' + GENV + '.ScripterHubKeyStatus=st',
            '  ' + GENV + '.ScripterHubWebsiteStatus="Online"',
            ' end',
            // ---- classify: "Valid" | "Expired" | "Incorrect"
            ' local function ' + H + '(s)',
            '  local a,b=0,0',
            '  for i=1,#s do',
            '   local c=string.byte(s,i)',
            '   a=(a+c*(((i-1)%7)+1))%1000003',
            '   b=(b*31+c)%65537',
            '  end',
            '  return (a*65537+b)%4294967296',
            ' end',
            ' local function ' + CLS + '(k)',
            '  if type(k)~="string" then return "Incorrect" end',
            '  local hk=' + H + '(k..' + S + ')',
            '  for i=1,#' + E + ' do',
            '   local e=' + E + '[i]',
            '   if e[1]==hk then',
            '    if e[2]==0 or os.time()<=e[2] then return "Valid" end',
            '    return "Expired"',
            '   end',
            '  end',
            '  return "Incorrect"',
            ' end',
            ' local function ' + V + '(k) return ' + CLS + '(k)=="Valid" end',
            ' local ' + OKV + '=false',
            ' local ' + IVK + '=' + CLS + '((getgenv and getgenv().ScripterHubKey) or _G.ScripterHubKey)',
            ' ' + API + '(' + IVK + ')',
            ' if ' + IVK + '=="Valid" then ' + OKV + '=true end',
            keyMode === 'default' ? ' if ' + OKV + ' then ' + NT + '("Key accepted! Loading script...",5) end' : null,
            ' if not ' + OKV + ' then',
            keyMode === 'default' ? '  ' + NT + '("Key required! Set getgenv().ScripterHubKey or use the key card.",6)' : null,
            // interactive key card (executor, DEFAULT mode only): textbox + verify button
            keyMode === 'default' ? '  pcall(function()' : null,
            keyMode === 'default' ? '   local plrs=game:GetService("Players")' : null,
            keyMode === 'default' ? '   local lp=plrs and plrs.LocalPlayer' : null,
            keyMode === 'default' ? '   local pg=lp and lp:FindFirstChild("PlayerGui")' : null,
            keyMode === 'default' ? '   local ' + TGT + '=pg or (gethui and gethui()) or nil' : null,
            keyMode === 'default' ? '   if not ' + TGT + ' then return end' : null,
            keyMode === 'default' ? '   local ' + SGR + '=Instance.new("ScreenGui")' : null,
            keyMode === 'default' ? '   ' + SGR + '.Name="SHKeyGate" ' + SGR + '.ResetOnSpawn=false' : null,
            keyMode === 'default' ? '   local ' + FRM + '=Instance.new("Frame")' : null,
            keyMode === 'default' ? '   ' + FRM + '.Size=UDim2.new(0,360,0,180) ' + FRM + '.Position=UDim2.new(0.5,-180,0.5,-90)' : null,
            keyMode === 'default' ? '   ' + FRM + '.BackgroundColor3=Color3.fromRGB(20,20,35) ' + FRM + '.BorderSizePixel=0' : null,
            keyMode === 'default' ? '   local u1=Instance.new("UICorner") u1.CornerRadius=UDim.new(0,14) u1.Parent=' + FRM : null,
            keyMode === 'default' ? '   local ' + TTL + '=Instance.new("TextLabel")' : null,
            keyMode === 'default' ? '   ' + TTL + '.Size=UDim2.new(1,-24,0,28) ' + TTL + '.Position=UDim2.new(0,12,0,10)' : null,
            keyMode === 'default' ? '   ' + TTL + '.BackgroundTransparency=1 ' + TTL + '.TextColor3=Color3.fromRGB(255,80,80)' : null,
            keyMode === 'default' ? '   ' + TTL + '.Font=Enum.Font.GothamBold ' + TTL + '.TextSize=16' : null,
            keyMode === 'default' ? '   ' + TTL + '.Text="Key Required"' : null,
            keyMode === 'default' ? '   ' + TTL + '.Parent=' + FRM : null,
            keyMode === 'default' ? '   local ' + BOX + '=Instance.new("TextBox")' : null,
            keyMode === 'default' ? '   ' + BOX + '.Size=UDim2.new(1,-24,0,42) ' + BOX + '.Position=UDim2.new(0,12,0,48)' : null,
            keyMode === 'default' ? '   ' + BOX + '.BackgroundColor3=Color3.fromRGB(10,10,20) ' + BOX + '.TextColor3=Color3.fromRGB(255,255,255)' : null,
            keyMode === 'default' ? '   ' + BOX + '.Font=Enum.Font.Gotham ' + BOX + '.TextSize=14 ' + BOX + '.PlaceholderText="Paste your key here..."' : null,
            keyMode === 'default' ? '   ' + BOX + '.Text="" ' + BOX + '.ClearTextOnFocus=false' : null,
            keyMode === 'default' ? '   local u2=Instance.new("UICorner") u2.CornerRadius=UDim.new(0,10) u2.Parent=' + BOX : null,
            keyMode === 'default' ? '   ' + BOX + '.Parent=' + FRM : null,
            keyMode === 'default' ? '   local ' + BTN + '=Instance.new("TextButton")' : null,
            keyMode === 'default' ? '   ' + BTN + '.Size=UDim2.new(1,-24,0,46) ' + BTN + '.Position=UDim2.new(0,12,0,102)' : null,
            keyMode === 'default' ? '   ' + BTN + '.BackgroundColor3=Color3.fromRGB(108,59,255) ' + BTN + '.TextColor3=Color3.fromRGB(255,255,255)' : null,
            keyMode === 'default' ? '   ' + BTN + '.Font=Enum.Font.GothamBold ' + BTN + '.TextSize=15 ' + BTN + '.Text="Verify Key"' : null,
            keyMode === 'default' ? '   local u3=Instance.new("UICorner") u3.CornerRadius=UDim.new(0,10) u3.Parent=' + BTN : null,
            keyMode === 'default' ? '   ' + BTN + '.Parent=' + FRM : null,
            keyMode === 'default' ? '   ' + FRM + '.Parent=' + SGR : null,
            keyMode === 'default' ? '   ' + SGR + '.Parent=' + TGT : null,
            keyMode === 'default' ? '   local function ' + T0K + '()' : null,
            keyMode === 'default' ? '    local st=' + CLS + '(' + BOX + '.Text)' : null,
            keyMode === 'default' ? '    ' + API + '(st)' : null,
            keyMode === 'default' ? '    if st=="Valid" then ' + OKV + '=true pcall(function() ' + SGR + ':Destroy() end) ' + NT + '("Key accepted! Loading script...",5) else ' + TTL + '.Text="Invalid or expired key!" ' + NT + '("Invalid or expired key!",4) end' : null,
            keyMode === 'default' ? '   end' : null,
            keyMode === 'default' ? '   ' + BTN + '.MouseButton1Click:Connect(' + T0K + ')' : null,
            keyMode === 'default' ? '   ' + BOX + '.FocusLost:Connect(function(en) if en then ' + T0K + '() end end)' : null,
            keyMode === 'default' ? '  end)' : null,
            // wait up to 300s for a valid key (default: after popup; custom: poll ScripterHubKey set by user's GUI)
            '  pcall(function()',
            '   if task and task.wait then',
            '    local t0=os.time()',
            '    while not ' + OKV + ' and os.time()-t0<300 do',
            keyMode === 'custom' ? '     local st=' + CLS + '((getgenv and getgenv().ScripterHubKey) or _G.ScripterHubKey) ' + API + '(st) if st=="Valid" then ' + OKV + '=true end' : null,
            '     task.wait(0.1)',
            '    end',
            '   end',
            '  end)',
            '  if not ' + OKV + ' then',
            '   print("[ScripterHub] Valid key required. Set getgenv().ScripterHubKey = \\"YOUR_KEY\\" and re-execute.")',
            '   return',
            '  end',
            ' end',
            'end'
        );
    } else {
        // no key gate - still expose the API globals
        var S2 = n[31], API2 = n[32], GENV2 = n[33];
        parts.push(
            'do',
            ' local ' + GENV2 + '=(getgenv and getgenv()) or _G',
            ' ' + GENV2 + '.ScripterHubKeyValid=true',
            ' ' + GENV2 + '.ScripterHubKeyIncorrect=false',
            ' ' + GENV2 + '.ScripterHubKeyExpired=false',
            ' ' + GENV2 + '.ScripterHubKeyStatus="No Key Required"',
            ' ' + GENV2 + '.ScripterHubWebsiteStatus="Online"',
            'end'
        );
    }

    // ---------- ANTI-LOGGER / ANTI-SPY / ANTI-TAMPER-LOG ----------
    // Detects environment loggers, HTTP spies and tamper/hook loggers.
    // On detection: game:Shutdown() + kick + hard abort of the payload.
    if (antiLogger) {
        // tokens that only exist when a spy/logger/decompiler SCRIPT is loaded.
        // NOTE: 'decompil' REMOVED - executors ship their own legit `decompile`
        // built-in global, which false-killed real executors.
        var tokens = ['spy', 'httplog', 'hooklog', 'reqlog', 'envlog', 'logger', 'oldhttp', 'oldrequest', 'reqspy', 'dumper', 'unluac', 'luadec'];
        // exact-name whitelist of standard executor API globals (never flagged)
        var wlNames = ['decompile', 'identifyexecutor', 'hookfunction', 'hookmetamethod', 'request', 'http_request', 'getgenv', 'getsenv', 'getrenv', 'getreg', 'getgc', 'getconnections', 'getcallingscript', 'getloadedmodules', 'getnilinstances', 'gethui', 'getrawmetatable', 'setreadonly', 'cloneref', 'checkcaller', 'writefile', 'readfile', 'appendfile', 'isfile', 'isfolder', 'makefolder', 'listfiles', 'delfile', 'delfolder', 'setclipboard', 'gethwid', 'fireclickdetector', 'firetouchinterest', 'firesignal', 'loadstring', 'syn', 'http', 'websocket', 'isexecutorclosure'];
        var FLAG = n[15], KILL = n[16], SCAN = n[17], TK = n[18], ENV = n[19];
        var GK = n[20], LK = n[21], TI = n[22], LS = n[23], PG = n[24], CH = n[25], LN = n[26];
        var RS = n[27], WL = n[28];
        parts.push(
            'do',
            ' local ' + FLAG + '=false',
            ' local ' + RS + '=""',
            ' local function ' + KILL + '()',
            // ALWAYS print why - so any trigger is diagnosable in the console
            '  pcall(function() print("[ScripterHub] logger/spy detected: "..' + RS + ') end)',
            '  pcall(function() game:Shutdown() end)',
            '  pcall(function() game:GetService("Players").LocalPlayer:Kick(" ") end)',
            '  error("x",0)',
            ' end',
            ' local function ' + SCAN + '()',
            '  local ' + TK + '={"' + tokens.join('","') + '"}',
            '  local ' + WL + '={' + wlNames.map(function (w) { return '["' + w + '"]=true'; }).join(',') + '}',
            // 1) spy/logger globals in getgenv() (or _G).
            //    Standard executor API globals (whitelist) are never flagged.
            '  pcall(function()',
            '   local ' + ENV + '=(getgenv and getgenv()) or _G',
            '   for ' + GK + ' in pairs(' + ENV + ') do',
            '    local ' + LK + '=string.lower(tostring(' + GK + '))',
            '    if not ' + WL + '[' + LK + '] then',
            '     for ' + TI + '=1,#' + TK + ' do',
            '      if string.find(' + LK + ',' + TK + '[' + TI + '],1,true) then ' + FLAG + '=true ' + RS + '="global:"..tostring(' + GK + ') return end',
            '     end',
            '    end',
            '   end',
            '  end)',
            '  if ' + FLAG + ' then return end',
            // 2) spy GUIs installed in PlayerGui (HTTP Spy tools create named GUIs)
            '  pcall(function()',
            '   local ' + PG + '=game:GetService("Players")',
            '   ' + PG + '=' + PG + ' and ' + PG + '.LocalPlayer and ' + PG + '.LocalPlayer:FindFirstChild("PlayerGui") or nil',
            '   if ' + PG + ' then',
            '    for _,' + CH + ' in ipairs(' + PG + ':GetChildren()) do',
            '     local ' + LN + '=string.lower(tostring(' + CH + '.Name))',
            '     for ' + TI + '=1,#' + TK + ' do',
            '      if string.find(' + LN + ',' + TK + '[' + TI + '],1,true) then ' + FLAG + '=true ' + RS + '="gui:"..tostring(' + CH + '.Name) return end',
            '     end',
            '    end',
            '   end',
            '  end)',
            // NOTE: loadstring hook check REMOVED - many executors legitimately
            // implement loadstring as a Lua wrapper, which false-killed them.
            ' end',
            ' ' + SCAN + '()',
            ' if ' + FLAG + ' then ' + KILL + '() end',
            // 3) keep watching: spies injected AFTER the script starts get caught too
            ' pcall(function()',
            '  if task and task.spawn and task.wait then',
            '   task.spawn(function()',
            '    while true do',
            '     task.wait(' + rndInt(3, 8) + ')',
            '     ' + FLAG + '=false ' + RS + '=""',
            '     ' + SCAN + '()',
            '     if ' + FLAG + ' then ' + KILL + '() end',
            '    end',
            '   end)',
            '  end',
            ' end)',
            'end'
        );
    }

    if (antiSkid) {
        var CANARY = '0x7A69420';
        parts.push(
            'do',
            ' local ' + n[0] + '=true',
            ' local ' + n[1] + '=loadstring or load',
            ' local ' + n[2] + ',' + n[3] + '=pcall(' + n[1] + ',"return ' + CANARY + '")',
            ' if not ' + n[2] + ' or not ' + n[3] + ' then ' + n[0] + '=false',
            ' else local ' + n[4] + ',' + n[5] + '=pcall(' + n[3] + ')',
            '  if not ' + n[4] + ' or ' + n[5] + '~=' + CANARY + ' then ' + n[0] + '=false end',
            ' end',
            ' if not game or not game.GetService or not game:GetService("Players") then ' + n[0] + '=false end',
            ' local ' + n[6] + '="' + luaEscape(wm) + '"',
            ' local ' + n[7] + '=0',
            ' for ' + n[8] + '=1,#' + n[6] + ' do ' + n[7] + '=(' + n[7] + '+string.byte(' + n[6] + ',' + n[8] + '))%1000003 end',
            ' if ' + n[7] + '~=' + wmSum + ' then ' + n[0] + '=false end',
            ' if not ' + n[0] + ' then return end',
            'end'
        );
    }

    if (envLogging) {
        var url = luaEscape(options.webhookUrl || '');
        parts.push(
            'do',
            ' pcall(function()',
            '  local ' + n[9] + '={"ScripterHub Log :: ' + luaEscape(meta.name) + ' [' + luaEscape(meta.id) + ']"}',
            '  pcall(function() local ' + n[10] + '=game:GetService("Players").LocalPlayer ' + n[9] + '[#' + n[9] + '+1]="user="..tostring(' + n[10] + '.Name) ' + n[9] + '[#' + n[9] + '+1]="uid="..tostring(' + n[10] + '.UserId) end)',
            '  pcall(function() ' + n[9] + '[#' + n[9] + '+1]="place="..tostring(game.PlaceId) ' + n[9] + '[#' + n[9] + '+1]="job="..tostring(game.JobId) end)',
            '  pcall(function() ' + n[9] + '[#' + n[9] + '+1]="exec="..(identifyexecutor and identifyexecutor() or ((syn and "Synapse") or "unknown")) end)',
            '  pcall(function() if gethwid then ' + n[9] + '[#' + n[9] + '+1]="hwid="..tostring(gethwid()) end end)',
            '  pcall(function() ' + n[9] + '[#' + n[9] + '+1]="time="..tostring(os.time()) end)',
            '  local ' + n[11] + '=table.concat(' + n[9] + '," | ")',
            '  local ' + n[12] + '="' + url + '"',
            '  if ' + n[12] + '~="" then',
            '   local ' + n[13] + '=syn and syn.request or http_request or request',
            '   if ' + n[13] + ' then',
            '    pcall(' + n[13] + ',{Url=' + n[12] + ',Method="POST",Headers={["Content-Type"]="application/json"},Body=game:GetService("HttpService"):JSONEncode({content=' + n[11] + '})})',
            '   end',
            '  end',
            '  if writefile then',
            '   if isfolder and not isfolder("scripterhub") then pcall(makefolder,"scripterhub") end',
            '   local ' + n[14] + '="scripterhub/' + luaEscape(meta.id) + '.log"',
            '   if appendfile then pcall(appendfile,' + n[14] + ',' + n[11] + '.."\\n") else pcall(writefile,' + n[14] + ',' + n[11] + '.."\\n") end',
            '  end',
            ' end)',
            'end'
        );
    }

    // ---------- EXECUTION STATS BEACON (Cloudflare Worker) ----------
    // Every execution of this script pings the owner's worker so the
    // Live Executions Chart shows REAL data. Silent (pcall'd) + async-safe.
    if (options.statsEndpoint) {
        var beaconUrl = String(options.statsEndpoint).replace(/\/+$/, '');
        var BN1 = n[48], BN2 = n[49], BN3 = n[50];
        parts.push(
            'do',
            ' pcall(function()',
            '  local ' + BN1 + '="' + luaEscape(beaconUrl) + '"',
            '  if ' + BN1 + '~="" then',
            '   local ' + BN2 + '=syn and syn.request or http_request or request',
            '   if ' + BN2 + ' then',
            '    local ' + BN3 + '="unknown"',
            '    pcall(function() if identifyexecutor then ' + BN3 + '=tostring(identifyexecutor()) end end)',
            '    pcall(' + BN2 + ',{Url=' + BN1 + '"/track",Method="POST",Headers={["Content-Type"]="application/json"},Body=game:GetService("HttpService"):JSONEncode({executor=' + BN3 + ',scriptId="' + luaEscape(meta.id) + '",scriptName="' + luaEscape(meta.name) + '",key=tostring((getgenv and getgenv().ScripterHubKey) or "")})})',
            '   end',
            '  end',
            ' end)',
            'end'
        );
    }

    // ---------- SILENT MODE ----------
    if (options.silentMode) {
        parts.push('do local _p=print print=function() end local _w=warn warn=function() end end');
    }

    parts.push('-- ==== ORIGINAL SCRIPT ====');
    return parts.filter(Boolean).join('\n') + '\n';
}

// ============================================================
// LOADER BUILDER
// encrypts `src` with `layerCount` layers and emits a
// self-contained Lua decryption VM.
//
// SPLIT-KEY MODE (options.splitKey = { url }):
// The LAST layer's key is NOT embedded in the file. At runtime the
// loader fetches it from the ScripterHub worker (executor-only route),
// time-unpad'ed with the t0 the response carries. A static peeler
// therefore always misses the final layer key -> the file alone can
// NEVER decrypt, no matter how good the analyst's Python is.
// ============================================================
function buildLoader(src, layerCount, options) {
    options = options || {};
    var bytes = strToBytes(src);

    // apply SEED-CHAIN layers: no key table exists - each byte's key is
    // derived from seed + previous PLAINTEXT byte (cipher feedback) +
    // position, with per-build randomized constants/direction. Every
    // generation emits a different algorithm, so no generic peeler works.
    var layers = genChainParams(layerCount);
    for (var i = 0; i < layerCount; i++) bytes = encChain(bytes, layers[i]);

    var chk = checksum(bytes);
    var mod = chk % 256;

    // START layer = last-encryption layer (peeled first). Its seed is
    // stored XOR (chk % 256); the loader unmasks it before walking.
    var startSeed = layers[layerCount - 1].seed.map(function (b) { return b ^ mod; });

    // ---- SPLIT-KEY: pad the stored START seed with a TIME PAD and export it
    // via options.splitKey (uploaded to the worker, NEVER embedded here).
    // Pad = djb2-style hash chain over t0's digits + byte index:
    //   h = 5381; for each step: h = (h*33 + c) % 2^32   (c = digit or idx)
    // h*33 stays < 2^37 - EXACT in JS doubles and Lua 5.1/5.3/luau doubles,
    // so JS and Lua always regenerate the identical stream. A response is
    // only valid with the exact t0 baked into the file (worker-enforced).
    var split = !!options.splitKey;
    var t0 = 0;
    if (split) {
        t0 = Date.now();
        var tstr = String(t0);
        var h = 5381;
        var padded = startSeed.map(function (b, idx) {
            // mix the next t0 digit (wrapping) + the byte index
            var c1 = tstr.charCodeAt(idx % tstr.length) - 48; // 0-9
            h = (h * 33 + c1 + (idx % 256) * 7) % 4294967296;
            return b ^ (h % 256);
        });
        options.splitKey.paddedKey = padded;
        options.splitKey.t0 = t0;
        options.splitKey.chk = chk;
        options.splitKey.keyLen = startSeed.length;
    }

    // noise stride: junk byte after every S real bytes
    var stride = options.stride || Math.max(3, 25 - layerCount * 2);

    // build escaped payload string with noise
    var payloadStr = '';
    var sinceJunk = 0;
    for (var i = 0; i < bytes.length; i++) {
        payloadStr += '\\' + bytes[i];
        sinceJunk++;
        if (sinceJunk === stride) {
            payloadStr += '\\' + rndInt(0, 255);
            sinceJunk = 0;
        }
    }

    var antiTamper = options.antiTamper !== false;
    var N = makeNames(31);
    var P = N[0], K = N[1], X = N[2], SS = N[3], T = N[4], C = N[5],
        SUM = N[6], XF = N[7], CH = N[8], KK = N[9], L = N[10],
        R = N[11], SRC = N[12], F = N[13], IV = N[14], JL = N[15],
        MI = N[20], FN = N[21];
    var EN = N[22], SD = N[23], PV = N[24], QR = N[25], JW = N[26],
        KX = N[27], VV = N[28], IDX = N[29], N1 = N[30];

    // junk locals/strings for confusion
    var junkStrs = [];
    for (var i = 0; i < layerCount * 3 + 8; i++) junkStrs.push('"' + hex(rndInt(8, 40)) + '"');

    // ---- SLOT LAYOUT: real layer entries + DECOY entries share one table.
    // Real entries form a hidden linked list (each tuple's last field points
    // to the next); decoys are never visited but look identical. A cracker
    // iterating the whole table processes decoys -> garbage.
    var M = layerCount + rndInt(2, layerCount + 3);
    var slotPool = [];
    for (var i = 0; i < M; i++) slotPool.push(i + 1);
    for (var i = slotPool.length - 1; i > 0; i--) {
        var j2 = rnd(i + 1); var tmp = slotPool[i]; slotPool[i] = slotPool[j2]; slotPool[j2] = tmp;
    }
    var slotOf = {};   // encryption-layer index -> table slot
    for (var i = 0; i < layerCount; i++) slotOf[layerCount - 1 - i] = slotPool[i]; // peel order
    var START = slotOf[layerCount - 1];
    var nextOf = {};   // peel chain: layer n-1 -> n-2 -> ... -> 0 -> stop
    for (var e = layerCount - 1; e >= 0; e--) nextOf[e] = e > 0 ? slotOf[e - 1] : 0;

    var keyTableParts = new Array(M);
    for (var li = 0; li < layerCount; li++) {
        var lay = layers[li];
        // START seed stored XOR mod (or zeroed in split mode - worker serves it)
        var sd = (li === layerCount - 1)
            ? (split ? new Array(lay.seed.length).fill(0) : startSeed)
            : lay.seed;
        // flags: parity bit = reverse-walk direction, upper bits = junk
        var flags = (lay.rev ? 1 : 0) + 2 * rndInt(0, 60);
        keyTableParts[slotOf[li] - 1] = '{{' + sd.join(',') + '},' + lay.iv + ',' + lay.c1 + ','
            + lay.c2 + ',' + flags + ',' + lay.shift + ',' + lay.madd + ',' + nextOf[li] + '}';
    }
    // decoys: identical shape, random params; some point INTO the real chain
    // to poison naive "follow every pointer" analysis
    for (var s = 0; s < M; s++) {
        if (keyTableParts[s] === undefined) {
            var ds = []; var dlen = rndInt(5, 11);
            for (var q = 0; q < dlen; q++) ds.push(rndInt(1, 255));
            var dnext = Math.random() < 0.4 ? slotOf[rnd(layerCount)] : 0;
            var dflags = (Math.random() < 0.5 ? 1 : 0) + 2 * rndInt(0, 60);
            keyTableParts[s] = '{{' + ds.join(',') + '},' + rndInt(0, 255) + ',' + rndInt(31, 251) + ','
                + rndInt(2, 97) + ',' + dflags + ',' + rndInt(1, 255) + ',' + rndInt(0, 97) + ',' + dnext + '}';
        }
    }

    var out = [];
    out.push('--[[' + hex(60));
    out.push(' :: ScripterHub Custom Obfuscator v2 :: ' + new Date().toISOString());
    out.push(' :: layers=' + layerCount + ' noise=' + stride + ' ::');
    out.push(' :: Source is fully encrypted. Any modification breaks this script. ::');
    out.push(' ' + hex(60) + ']]');
    out.push('local ' + FN + '=loadstring or load');
    out.push('local ' + X + '=bit32 and bit32.bxor or function(a,b) local r,p=0,1 for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+p end a=(a-x)/2 b=(b-y)/2 p=p*2 end return r end');
    out.push('local ' + P + '="' + payloadStr + '"');
    out.push('local ' + K + '={' + keyTableParts.join(',') + '}');
    out.push('local ' + JL + '={' + junkStrs.join(',') + '}');
    out.push('local ' + L + '=0x' + hex(6));
    out.push('local ' + R + '={}');
    out.push('local ' + T + '={}');
    out.push('local ' + SS + '=' + (stride + 1));
    out.push('local ' + C + '=0');
    out.push('for ' + IV + '=1,#' + P + ' do if (' + IV + '-1)%' + SS + '~=' + SS + '-1 then ' + C + '=' + C + '+1 ' + T + '[' + C + ']=string.byte(' + P + ',' + IV + ') end end');
    out.push('local ' + SUM + '=0 local ' + XF + '=0');
    out.push('for ' + IV + '=1,' + C + ' do ' + SUM + '=' + '(' + SUM + '+' + T + '[' + IV + '])%1000000007 ' + XF + '=' + X + '(' + XF + ',' + T + '[' + IV + ']) end');
    out.push('local ' + CH + '=(' + SUM + '+' + XF + '*31)%1000000007');
    if (antiTamper) {
        out.push('if ' + CH + '~=' + chk + ' then return end');
    }
    if (split) {
        // ---- SPLIT-KEY: fetch the missing START seed from the worker ----
        // The file is missing the final layer's seed entirely, so a
        // static peeler always stops one layer short. The response is
        // time-locked (worker rejects stale t0), so saved responses can't
        // be replayed. Wire format: "SHK <t0> <chk> <padded...>".
        var keyUrl = options.splitKey.url + '/' + options.splitKey.id + '?t=' + t0;
        var SN = makeNames(9);
        var GO = SN[0], RP = SN[1], PT = SN[2], KT = SN[3], KC = SN[4];
        var SD2 = SN[5], PB = SN[6], KK2 = SN[7], HN = SN[8];
        out.push('do');
        out.push(' local ' + GO + '=game and game.HttpGet');
        out.push(' if not ' + GO + ' then return end');
        out.push(' local ok,' + RP + '=pcall(' + GO + ',game,' + JSON.stringify(keyUrl) + ')');
        out.push(' if not ok or type(' + RP + ')~="string" then return end');
        out.push(' if ' + RP + ':sub(1,3)~="SHK" then return end');
        out.push(' local ' + PT + '={}');
        out.push(' for n in ' + RP + ':gmatch("%-?%d+") do ' + PT + '[#' + PT + '+1]=tonumber(n) end');
        out.push(' if #' + PT + '<3 then return end');
        out.push(' local ' + KT + '=' + PT + '[1] local ' + KC + '=' + PT + '[2]');
        out.push(' if ' + KT + '~=' + t0 + ' or ' + KC + '~=' + chk + ' then return end');
        out.push(' local ' + SD2 + '="' + String(t0) + '"');
        out.push(' local ' + PB + '={}');
        out.push(' local ' + HN + '=5381');
        out.push(' for j=3,#' + PT + ' do');
        out.push('  local c=string.byte(' + SD2 + ',((j-3)%#' + SD2 + ')+1)-48');
        out.push('  ' + HN + '=(' + HN + '*33+c+((j-3)%256)*7)%4294967296');
        out.push('  ' + PB + '[#' + PB + '+1]=' + X + '(' + PT + '[j],(' + HN + '%256))');
        out.push(' end');
        // write the fetched seed into the START slot (stored/masked form)
        out.push(' local ' + KK2 + '=' + K + '[' + START + '][1]');
        out.push(' for j=1,#' + PB + ' do ' + KK2 + '[j]=' + PB + '[j] end');
        out.push(' if #' + PB + ' ~= #' + KK2 + ' then return end');
        out.push('end');
    }
    // ---- unmask the START seed (stored XOR chk%256) ----
    out.push('do');
    out.push(' local ' + KK + '=' + K + '[' + START + '][1]');
    out.push(' local ' + MI + '=' + CH + '%256');
    out.push(' for ' + IV + '=1,#' + KK + ' do ' + KK + '[' + IV + ']=' + X + '(' + KK + '[' + IV + '],' + MI + ') end');
    out.push('end');
    // ---- SLOT-CHAIN WALKER: peel layers through the hidden linked list.
    // Only real slots are visited; decoys poison anyone who iterates the
    // whole table. Each byte's key = (seed*C1 + prev*C2 + pos*31) % 251 + 5
    // with cipher feedback - there is no key table to extract.
    out.push('local ' + EN + '=' + START);
    out.push('while ' + EN + '>0 do');
    out.push(' local ' + KX + '=' + K + '[' + EN + ']');
    out.push(' local ' + VV + '=' + KX + '[5]%2==1');
    out.push(' local kk=' + KX + '[1]');
    out.push(' local c1=' + KX + '[3]');
    out.push(' local c2=' + KX + '[4]');
    out.push(' local sh=' + KX + '[6]');
    out.push(' local ma=' + KX + '[7]');
    out.push(' local ' + PV + '=' + KX + '[2]');
    out.push(' local i=0');
    out.push(' while i<' + C + ' do');
    out.push('  local n1');
    out.push('  if ' + VV + ' then n1=' + C + '-i else n1=i+1 end');
    out.push('  local s=kk[((n1-1)%#kk)+1]');
    out.push('  local q=((s*c1+' + PV + '*c2+n1*31)%251)+5');
    out.push('  local v=' + T + '[n1]');
    out.push('  v=(v-sh-(i%3)*ma)%256');
    out.push('  if v<0 then v=v+256 end');
    out.push('  ' + T + '[n1]=' + X + '(v,q)');
    out.push('  ' + PV + '=' + T + '[n1]');
    out.push('  i=i+1');
    out.push(' end');
    out.push(' ' + EN + '=' + KX + '[8]');
    out.push('end');
    out.push('for ' + IV + '=1,' + C + ' do ' + R + '[' + IV + ']=string.char(' + T + '[' + IV + ']) end');
    out.push('local ' + SRC + '=table.concat(' + R + ')');
    out.push(P + '=nil ' + T + '=nil ' + R + '=nil ' + K + '=nil ' + JL + '=nil ' + L + '=nil');
    out.push(junkLuaLines(layerCount + 2));
    // ANTI-CRACK: register the one-shot canary HERE (loader scope) right
    // before compiling the payload. The registration lives in the loader
    // chunk - a dumped payload string does NOT contain it, so re-running a
    // dump lands on the decoy ("Goodluck Sonion 💖").
    if (options._canary) {
        out.push('do local g=(getgenv and getgenv()) or _G g.' + options._canary.name + '=' + options._canary.magic + ' end');
    }
    // SERVER-BOUND VM SEED: deliver the bytecode VM's vault seed into
    // genv right before the payload compiles - the payload reads it at
    // boot. A peeled/dumped stub never sees this write, so its vault
    // stays locked. (Only present in split-key builds.)
    if (options._vmSeedGenv && options._vmSeedValue !== undefined) {
        out.push('do local g=(getgenv and getgenv()) or _G g.' + options._vmSeedGenv + '=' + options._vmSeedValue + ' end');
    }
    out.push('local ' + F + '=' + FN + '(' + SRC + ',"=[sh::' + hex(6) + ']")');
    out.push(SRC + '=nil');
    out.push('if ' + F + ' then ' + F + '() end');

    var result = out.join('\n');

    if (options._debug) {
        result = '--[shdebug:' + JSON.stringify({ stride: stride, chk: chk, layerCount: layerCount, keyLens: layers.map(function (l) { return l.seed.length; }), slots: M, start: START }) + ']\n' + result;
    }
    return result;
}

// ============================================================
// PUBLIC API
// ============================================================
export function applyCustomObfuscator(code, options, debugInfo) {
    options = options || {};
    var intensity = Math.max(1, Math.min(10, parseInt(options.intensity, 10) || 10));
    var meta = {
        id: options.scriptId || ('sh_' + hex(8)),
        name: options.scriptName || 'script',
        owner: options.owner || 'unknown'
    };

    // shared one-shot canary: registered by the loader, checked+deleted by
    // the payload. Dumped payloads miss the registration -> decoy fires.
    options._canary = { name: '_shc' + hex(10), magic: rndInt(100000, 999999) * 3 + 7 };

    // ---- VM PASS (tier 2): VM-ify the USER'S CODE first. The security
    // wrapper stays plain (it gates/aborts before user code runs); the
    // user's actual script becomes vault+proxy code. Anyone who peels all
    // encryption layers lands on VM-ified code, never the original.
    // Tier order: BYTECODE VM (Luraph-style - source dies at compile
    // time, only opcode blob + interpreter ship) -> vm-pass lite (vault
    // + proxies, still lua) -> raw source. Each tier falls back
    // automatically on any unsupported construct.
    // SERVER-BOUND SEED: in split-key mode the bytecode VM's vault seed
    // is NOT embedded - the loader writes it into genv after the worker
    // key fetch, so even a fully peeled stub cannot decrypt constants.
    var splitMode = !!(options.serverKey || options.splitKey);
    var vmCode;
    if (options.vmPass === false) {
        vmCode = code;
    } else if (options.vmTier === 'lite') {
        vmCode = applyVmPass(code);
        if (debugInfo && vmCode !== code) debugInfo.vmApplied = 'lite';
    } else {
        var bc = null;
        var bcOpts = {};
        if (splitMode) {
            // server-bound seed: random value, delivered via genv at runtime
            options._vmSeedGenv = '_shs' + hex(10);
            options._vmSeedValue = rndInt(29, 251);
            bcOpts.seedFromGenv = options._vmSeedGenv;
            bcOpts.seedOverride = options._vmSeedValue;
        }
        try { bc = applyBytecodeVm(code, bcOpts); } catch (e) { bc = null; }
        if (bc) {
            vmCode = bc;
            if (debugInfo) debugInfo.vmApplied = 'bytecode';
        } else {
            options._vmSeedGenv = null;
            vmCode = applyVmPass(code);
            if (debugInfo && vmCode !== code) debugInfo.vmApplied = 'lite';
        }
    }

    var payload = buildSecurityWrapper(options, meta) + vmCode;

    // SPLIT-KEY container: buildLoader fills it with the padded key + t0;
    // the caller uploads it to the worker (/sh/upload -> splitKey) and the
    // loader fetches it at runtime (executor-only, time-locked). When set,
    // the generated file can NOT be decrypted statically - it is missing
    // the final layer key entirely.
    // IMPORTANT: only the LAST buildLoader call may carry the split - the
    // others keep fully embedded keys (each wrap is peeled in sequence, and
    // only the deepest one needs the fetched key).
    var splitContainer = null;
    if (options.serverKey) {
        splitContainer = { url: options.serverKey.keyUrl, id: options.serverKey.scriptRef || 'pending' };
    }
    var willDoubleWrap = intensity >= 8 && options.doubleWrap !== false;

    // layers scale with intensity (1..10 => 1..10 layers)
    // (single wrap: the split goes on this loader; double wrap: on the inner)
    var loaderOpts = options;
    if (willDoubleWrap && splitContainer) {
        // first (inner-payload) loader: fully embedded key, no split
        loaderOpts = { antiTamper: options.antiTamper !== false, stride: options.stride, _debug: options._debug };
    } else if (splitContainer) {
        // single wrap with split: hand the container to buildLoader
        loaderOpts = Object.assign({}, options, { splitKey: splitContainer });
    }
    if (willDoubleWrap && !splitContainer && options.splitKey) splitContainer = options.splitKey;
    var loader = buildLoader(payload, intensity, loaderOpts);

    // double-wrap for max intensity: the whole loader gets
    // encrypted again inside a second shell. The OUTER shell keeps its own
    // fully-embedded key (it wraps everything); in split-key mode the
    // INNER loader carries the fetch so the deepest layer needs the
    // worker key - peeling the outer shell alone still never yields a
    // runnable script.
    if (willDoubleWrap) {
        var innerOpts = {
            antiTamper: options.antiTamper !== false,
            stride: Math.max(5, 20 - intensity),
            splitKey: splitContainer,
            _canary: options._canary,   // the DEEPEST loader registers the canary
            _vmSeedGenv: options._vmSeedGenv,   // ...and delivers the VM seed
            _vmSeedValue: options._vmSeedValue,
            _debug: options._debug
        };
        loader = buildLoader(loader, Math.min(3, intensity), innerOpts);
        if (debugInfo) debugInfo.wrapped = true;
    } else if (splitContainer) {
        options.splitKey = splitContainer;
    }

    if (debugInfo) debugInfo.payload = payload;
    if (splitContainer && splitContainer.paddedKey) {
        debugInfo.splitKey = {
            paddedKey: splitContainer.paddedKey,
            t0: splitContainer.t0,
            chk: splitContainer.chk,
            keyLen: splitContainer.keyLen
        };
    }

    var headerNote = options.splitKey ? 'server-key-split' : 'self-contained';
    return '-- ScripterHub Custom Obfuscator v5 (' + headerNote + ' + key modes + API globals + anti-logger + anti-crack) | ' + new Date().toISOString() + ' | DO NOT EDIT\n' + loader;
}

// Build the security wrapper + source payload without encrypting it.
// Used by the Aegis Obfuscator engine: the wrapper (key gate, anti-logger,
// env logging, watermark...) wraps the source, then Aegis obfuscates the whole thing.
export function buildWrappedPayload(code, options, debugInfo) {
    options = options || {};
    var meta = {
        id: options.scriptId || ('sh_' + hex(8)),
        name: options.scriptName || 'script',
        owner: options.owner || 'unknown'
    };
    // Aegis has no ScripterHub loader VM, so the payload must register the
    // canary itself (self-reg mode) - still catches loadstring dumps.
    options._canary = options._canary || { name: '_shc' + hex(10), magic: rndInt(100000, 999999) * 3 + 7 };
    options._canarySelfReg = true;
    var payload = buildSecurityWrapper(options, meta) + code;
    if (debugInfo) debugInfo.payload = payload;
    return payload;
}

if (typeof window !== 'undefined') window.applyCustomObfuscator = applyCustomObfuscator;
