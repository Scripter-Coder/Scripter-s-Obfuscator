--[[
    ScripterHub loader DIAGNOSTIC
    Paste this into your executor INSTEAD of the loadstring. It walks the exact
    same path the real loader does and reports where it stops, instead of
    failing with one line and no context.

    SET THIS to the loader URL you are actually testing:
]]

local BASE = "https://scripterhub-stats.dubovikstanislav51.workers.dev"
local ID   = "ScripterHub0448100070"   -- <-- change to YOUR id

local out = {}
local function say(k, v) out[#out + 1] = tostring(k) .. ": " .. tostring(v) end
local function head(s) s = tostring(s or "") return #s > 90 and s:sub(1, 90) .. "..." or s end
local function dump()
    print("\n========== ScripterHub DIAGNOSTIC ==========")
    for i = 1, #out do print(out[i]) end
    print("=============================================")
end

-- 0. what does this executor actually give us?
say("executor", (identifyexecutor and identifyexecutor()) or "?")
say("loadstring", type(loadstring))
say("getgenv", type(getgenv))
say("request", type(request))
say("syn.request", (type(syn) == "table") and type(syn.request) or "no syn")
-- `game` and `game.HttpGet` are THREE separate questions, and the old line
-- answered only the first while appearing to answer the third.
--
-- It read `type(game) == "table"`, and in Roblox/Luau typeof(game) is
-- "Instance" so type(game) is "userdata". The `and` short-circuited, the
-- `or` fired, and it printed NO game.HttpGet without ever looking at
-- game.HttpGet. I read that as "this executor has no HttpGet" and designed
-- around it. The user tested with other loadstrings: it works. They were
-- right.
local HAS_GAME = (game ~= nil)
local HTTPGET = HAS_GAME and game.HttpGet or nil
say("typeof(game)", HAS_GAME and (typeof and typeof(game) or "?") or "nil")
say("type(game)", HAS_GAME and type(game) or "nil")
say("game.HttpGet exists", HTTPGET and type(HTTPGET) or "NO")
-- a function can EXIST and still throw, so existence is not the question
if HTTPGET then
    local ok, res = pcall(function() return game:HttpGet(BASE .. "/sh/" .. ID, true) end)
    if ok and type(res) == "string" and res ~= "" then
        say("game.HttpGet works", "YES - returned " .. #res .. " bytes")
    elseif ok then
        say("game.HttpGet works", "called it, got a " .. type(res) .. " back")
    else
        say("game.HttpGet works", "NO - it exists but THROWS: " .. tostring(res))
    end
else
    say("game.HttpGet works", "cannot tell - HttpGet is absent")
end

local G = (getgenv and getgenv()) or _G
say("license set", (type(G.ScripterHubKey) == "string" and G.ScripterHubKey ~= "") and "yes" or "NO")

-- 1. fetch the loader, exactly as the loadstring does
local url = BASE .. "/sh/" .. ID
local body, how

if type(request) == "function" then
    local ok, r = pcall(function() return request({ Url = url, Method = "GET" }) end)
    if ok and type(r) == "table" then
        how = "request"
        body = type(r.Body) == "string" and r.Body or nil
        say("loader status", r.StatusCode or "?")
    else
        say("request failed", ok and "bad shape" or tostring(r))
    end
end

if not body and HTTPGET then
    local ok, r = pcall(function() return game:HttpGet(url, true) end)
    how = "HttpGet"
    body = (ok and type(r) == "string") and r or nil
    say("HttpGet ok", tostring(ok))
end

say("transport", how or "NONE")
say("body length", body and #body or 0)

if not body or #body == 0 then
    say("VERDICT", "loader fetch returned nothing")
    say("", "the id does not exist, or KV is not bound")
    dump()
    return
end

-- 2. is this a browser page, or the executor bootstrap?
say("is HTML page", body:find("<!") and "YES - your User-Agent was not recognised as an executor" or "no")
say("is bootstrap", body:find("/sh/session") and "YES" or "no")

-- 3. mint a session
local function get(u)
    if type(request) == "function" then
        local ok, r = pcall(function() return request({ Url = u, Method = "GET" }) end)
        if ok and type(r) == "table" and type(r.Body) == "string" and r.Body ~= "" then return r.Body end
    end
    if HTTPGET then
        local ok, r = pcall(function() return game:HttpGet(u, true) end)
        if ok and type(r) == "string" and r ~= "" then return r end
    end
    return nil
end

local sess = get(BASE .. "/sh/session?id=" .. ID .. "&k=" .. tostring(G.ScripterHubKey or "") .. "&h=diag")
say("session raw", head(sess))

if not sess then
    say("VERDICT", "could not reach /sh/session")
    dump()
    return
end
if sess:sub(1, 7) == "SHERR " then
    say("VERDICT", "server refused: " .. sess:sub(8))
    dump()
    return
end

local sid, nonce = sess:match("^SHS (%S+) (%S+)")
say("session id", sid or "UNPARSEABLE")
say("nonce", nonce or "UNPARSEABLE")

if not sid then
    say("VERDICT", "session response was not parseable")
    dump()
    return
end

-- 4. spend it
local art = get(BASE .. "/sh/a/" .. ID .. "?s=" .. sid .. "&n=" .. nonce)
say("artifact length", art and #art or 0)
if art then say("artifact head", head(art:sub(1, 24))) end

if not art then
    say("VERDICT", "delivery returned nothing")
    dump()
    return
end
if art:sub(1, 7) == "SHERR " then
    say("VERDICT", "server refused delivery: " .. art:sub(8))
    dump()
    return
end

local tag = art:sub(1, 4)
say("envelope", tag == "SHL\n" and "SHL (keyless)" or (tag == "SHK\n" and "SHK (keyed)" or (tag == "SHG " and "SHG (chain)" or "UNKNOWN")))

if tag == "SHK\n" then
    -- the exact parse the old bootstrap got wrong
    local nl = art:find("\n", 5)
    say("key line ends at", nl or "NOT FOUND")
    say("has key line", nl and "yes" or "NO - this is the bug you hit")
    if nl then
        say("key line", head(art:sub(5, nl - 1)))
        say("cipher length", #art:sub(nl + 1))
    end
end



-- 5. THE STEP THAT WAS MISSING: actually compile what was delivered.

-- Everything above proves the GATE works. This proves whether the PAYLOAD

-- is compilable ON THIS EXECUTOR, which is the only thing that separates

-- "the server sent bytes that are not Lua" from "the bytes are fine and

-- your parser gave up".

--

-- For a keyed build the source is still encrypted here, so a DEC failure is

-- expected and the compile error below is meaningless for SHK. That case is

-- reported as SKIPPED rather than as a payload fault.

local src = art

local tag2 = art:sub(1, 4)

if tag2 == "SHL\n" then

    src = art:sub(5)

elseif tag2 == "SHK\n" then

    local nl = art:find("\n", 5)

    src = nl and art:sub(nl + 1) or ""

end



say("source bytes", #src)

say("source head", head(src:sub(1, 70)))

say("source tail", head(src:sub(-50)))



-- A payload that was cut off mid-transfer still parses as a prefix in many

-- cases, and one that was cut mid-token does not. Both head and tail are

-- printed so a truncation is visible rather than inferred.

if src:sub(-1):match("%s*$") == nil then

    say("ends cleanly", "NO - the last character is not whitespace, which is normal for Lua")

else

    say("ends cleanly", "yes")

end



local LS = loadstring or load

if not LS then

    say("VERDICT", "this executor has NEITHER loadstring NOR load")

elseif tag2 == "SHK\n" then

    say("VERDICT", "SKIPPED - this is a keyed build, so the source is still")

    say("", "encrypted here and only compiles after the local decrypt.")

    say("", "If a KEYED script fails to load, re-run with its license set and")

    say("", "tell me whether the error is about the Special Key instead.")

else

    local fn, err = LS(src)

    if fn then

        say("VERDICT", "the delivered source COMPILES on this executor")

        say("", "so the gate is fine AND the payload is fine. The failure is in")

        say("", "RUNNING the script, not loading it - a different bug entirely.")

    else

        say("VERDICT", "the delivered source does NOT compile on this executor")

        say("compile error", head(err))

        say("size", #src .. " bytes")

        if #src > 500000 then

            say("size verdict", "OVER 500 KB. This is very likely an executor")

            say("", "parser limit, not a syntax error. The fix is a LOWER")

            say("", "obfuscation intensity, or an executor that compiles it.")

        elseif #src < 100 then

            say("size verdict", "under 100 bytes - the delivery was TRUNCATED.")

            say("", "That is a transport problem, not a compile problem.")

        else

            say("size verdict", "a normal size, so this is a real syntax error")

            say("", "in the artifact. The obfuscator produced invalid Lua.")

        end

    end

end



dump()

print("if VERDICT is 'delivery OK' but the script still fails, the fault is in")
print("decrypting or running the payload, not in the gate.")
