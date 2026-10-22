-- ============ SCRIPTER HUB KEY GATE ============
-- Drop this at the TOP of your script, before the main code.
--
-- It is the same shape as the Luarmor gate it replaces:
--
--     if _G.ScripterHub_KeyValid == true then
--         -- already validated, carry on
--     else
--         -- whitelist?  saved key?  validate?  otherwise stop
--     end
--
-- The difference is what it talks to. The Luarmor gate pulled down a
-- LIBRARY and called check_key() on it; this one asks YOUR worker, in PLAIN
-- TEXT - one HttpGet, no JSON, no library, and nothing to break when an
-- executor cannot do JSON:
--
--     SHOK <expiresAtMs> <lifetime>      the key is good
--     SHERR invalid|expired|hwid|banned  it is not
--
-- The hardware id is the Roblox client id - the same one the gate uses, so a
-- key locked to a machine opens on it - and the executor's name is sent as a
-- SECOND id, because the older locks were made with that and they have to
-- keep working.
-- =============================================================================

local SH_WORKER = "https://scripterhub-stats.dubovikstanislav51.workers.dev"

-- THE KEY CARD: the big UI, where the visitor enters a key or earns one.
-- It is loaded when there is no valid key, so the visitor is not left with
-- a script that silently does nothing. Comment it out if you load the card
-- some other way.
local SH_KEYCARD = "https://scripter-coder.github.io/Scripter-s-Obfuscator/scripterhub_keycard.lua"

local player = game.Players.LocalPlayer
local userId = player.UserId
local hwid = game:GetService("RbxAnalyticsService"):GetClientId()

-- The executor's name ("Real", "Solara", ...). It is NOT an id - every
-- machine running that executor answers the same - but it is what the older
-- hardware locks were made with, so it is sent as a second id.
local hwid2 = ""
do
    if type(identifyexecutor) == "function" then
        local ok, v = pcall(identifyexecutor)
        if ok and type(v) == "string" then hwid2 = v end
    end
end

-- 4 separate files, the same names the key card uses, so the two agree.
local KEY_FILE = "ScripterHub_Key_" .. userId .. ".txt"
local HWID_FILE = "ScripterHub_HWID_" .. userId .. ".txt"
local EXPIRY_FILE = "ScripterHub_Expiry_" .. userId .. ".txt"
local TIMESTAMP_FILE = "ScripterHub_Timestamp_" .. userId .. ".txt"

-- ============ FILE FUNCTIONS ============
-- Nothing here assumes the executor has the function: if it cannot write
-- files, the key is still checked - it just is not remembered between runs.
local function readFile(filename)
    if type(readfile) ~= "function" then return nil end
    local success, data = pcall(function()
        return readfile(filename)
    end)
    if success and data and data ~= "" then
        return (tostring(data):gsub("[%s\r\n]", ""))
    end
    return nil
end

local function writeFile(filename, data)
    if type(writefile) ~= "function" then return end
    pcall(function()
        writefile(filename, tostring(data))
    end)
end

-- ============ SAVE ALL 4 FILES ============
local function saveAllKeyData(key, expiry)
    writeFile(KEY_FILE, key)
    writeFile(HWID_FILE, hwid)
    local expiryString = "LIFETIME"
    if expiry and expiry ~= "LIFETIME" then
        expiryString = tostring(expiry)
    end
    writeFile(EXPIRY_FILE, expiryString)
    writeFile(TIMESTAMP_FILE, tostring(os.time()))
end

-- ============ ONE PLAIN-TEXT REQUEST ============
-- The answer is a line of text, so there is no encoder and no decoder, and
-- an executor without HttpService:JSONEncode is fine.
local function plainGet(url)
    if type(game.HttpGet) == "function" then
        local ok, body = pcall(function()
            return game:HttpGet(url)
        end)
        if ok and type(body) == "string" and body ~= "" then return body end
    end
    -- Some executors give request() instead of game:HttpGet.
    if type(request) == "function" then
        local ok, body = pcall(function()
            return request({ Url = url, Method = "GET" })
        end)
        if ok and type(body) == "string" and body ~= "" then return body end
        if ok and type(body) == "table" and type(body.Body) == "string" then return body.Body end
    end
    return nil
end

local function urlEncode(s)
    return (tostring(s):gsub("[^%w%-%._~]", function(c)
        return string.format("%%%02X", string.byte(c))
    end))
end

-- ============ THE WHITELIST ============
-- YOUR list, on YOUR server: the owner saves the url of a file of hardware
-- ids (one per line, in brackets) and the worker fetches it. A machine on
-- the list needs no key at all.
--
--     SHW yes <count>      this machine is on the list
--     SHW no <count>       it is not
local function isWhitelisted()
    local body = plainGet(SH_WORKER .. "/sh/whitelist?h=" .. urlEncode(hwid)
        .. (hwid2 ~= "" and ("&h2=" .. urlEncode(hwid2)) or ""))
    if not body then return false end
    return tostring(body):match("^SHW yes") ~= nil
end

-- ============ CHECK THE KEY ============
-- Returns ok, expirySeconds, code
local function checkKey(key)
    local body = plainGet(SH_WORKER .. "/sh/keycheck?k=" .. urlEncode(key)
        .. "&h=" .. urlEncode(hwid)
        .. (hwid2 ~= "" and ("&h2=" .. urlEncode(hwid2)) or ""))
    if not body then return false, 0, "NETWORK" end
    body = tostring(body):gsub("%s+$", "")

    local expiresMs, lifetime = body:match("^SHOK (%d+) (%d+)")
    if expiresMs then
        local expiry = 0
        if lifetime ~= "1" and tonumber(expiresMs) and tonumber(expiresMs) > 0 then
            expiry = math.floor(tonumber(expiresMs) / 1000)
        end
        return true, expiry, "OK"
    end

    local code = body:match("^SHERR (.+)$")
    if code then return false, 0, code:gsub("%s+$", "") end
    return false, 0, "UNKNOWN"
end

-- ============ THE CHECK ============
if _G.ScripterHub_KeyValid == true then
    print("\226\156\133 Already validated! Loading the script directly...")
    -- Continue to the main script.
else
    print("=== SCRIPTER HUB KEY SYSTEM ===")
    print("Your HWID: " .. tostring(hwid))

    -- 1. THE WHITELIST
    if isWhitelisted() then
        print("\226\156\133 YOU ARE WHITELISTED!")
        _G.ScripterHub_KeyValid = true
        saveAllKeyData("WHITELISTED_" .. tostring(hwid), "LIFETIME")
    else
        -- 2. a key the visitor typed in the card, in this same session
        local env = (getgenv and getgenv()) or _G
        local typed = env.ScripterHubKey
        if type(typed) ~= "string" or typed == "" then typed = nil end

        -- 3. the key saved on this machine
        local savedKey = readFile(KEY_FILE)
        if (not savedKey) or savedKey == "" or savedKey == "PENDING"
            or savedKey == "WHITELISTED_" .. tostring(hwid) then
            savedKey = nil
        end

        local key = typed or savedKey
        if not key then
            print("\226\154\160\239\184\143 No key found!")
            print("\226\154\160\239\184\143 Loading the key card (this happens ONCE)...")
            -- The key card: the big UI, where the key is entered or earned.
            local loaded = pcall(function()
                loadstring(game:HttpGet(SH_KEYCARD))()
            end)
            if not loaded then print("\226\154\160\239\184\143 The key card could not be loaded.") end
            -- STOP HERE - do not continue
            return
        end

        local ok, expiry, code = checkKey(key)
        if ok then
            print("\226\156\133 KEY VALID!")
            _G.ScripterHub_KeyValid = true
            -- 0 means lifetime.
            local expiryString = "LIFETIME"
            if expiry and expiry > 0 then
                expiryString = tostring(expiry)
                print("Key expires on: " .. os.date("%Y-%m-%d %H:%M:%S", expiry))
            end
            saveAllKeyData(key, expiryString)
            -- Hand the key to the environment, so the rest of the script -
            -- and anything it loads - can read it.
            env.ScripterHubKey = key
        else
            print("\226\157\140 Key invalid: " .. tostring(code))
            if code == "EXPIRED" then
                print("\226\157\140 Your key has expired. Get a new one from the key card.")
            elseif code == "HWID" then
                print("\240\159\148\146 This key is locked to a different machine.")
            elseif code == "BANNED" then
                print("\240\159\154\171 This key has been banned.")
            elseif code == "NETWORK" then
                print("\226\154\160\239\184\143 Could not reach the key server.")
            end
            _G.ScripterHub_KeyValid = false
            -- The saved key is NOT removed: it may be a network problem, and a
            -- key that is merely expired is the visitor's to renew.
            -- STOP HERE - do not continue
            return
        end
    end
end

-- =============================================================================
-- YOUR MAIN SCRIPT GOES BELOW
-- =============================================================================
print("========================================")
print("\226\156\133 SCRIPTER HUB - Loading your script...")
print("========================================")
