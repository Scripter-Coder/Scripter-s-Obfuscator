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
say("game.HttpGet", (type(game) == "table") and type(game.HttpGet) or "NO game.HttpGet")

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

if not body and type(game) == "table" and game.HttpGet then
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
    if type(game) == "table" and game.HttpGet then
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

say("VERDICT", "delivery OK - the gate is working")
dump()
print("if VERDICT is 'delivery OK' but the script still fails, the fault is in")
print("decrypting or running the payload, not in the gate.")
