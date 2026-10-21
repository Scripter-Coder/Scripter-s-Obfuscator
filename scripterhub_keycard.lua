-- ============ SCRIPTER HUB - CUSTOM BIG UI WITH THE 4 FILE KEY SYSTEM ============
-- No external libraries needed.
--
-- NO JSON. Not "we avoid JSON" - JSON is NOT USED AT ALL, because some
-- executors cannot do it. Opiumware and a few others have no
-- HttpService:JSONEncode, so every key system that speaks JSON is dead on
-- them: the script dies on a nil index long before the key is ever checked.
-- Everything here is plain text over HttpGet, and the only parsing is
-- string.match on a line.
--
-- THE SERVER IS YOUR OWN. The key is checked against the ScripterHub worker,
-- which is the same gate the published scripts use:
--
--     GET  <worker>/sh/keycheck?k=<key>&h=<hwid>
--          -> "SHOK <expiresAtMs> <lifetime>"     the key is good
--          -> "SHERR invalid|banned|expired|hwid"  it is not
--
-- The answer never contains the key, and it says nothing about any key other
-- than the one that was asked about.
--
-- THE AD LINKS ARE YOURS. The three buttons on the Links tab copy the URLs
-- you set in AD_LINKS below - change them whenever you want, nothing else
-- depends on them.
-- ===============================================================================

-- PREVENT MULTIPLE EXECUTIONS
if _G.ScripterHub_UILoaded then
    print("UI already loaded, skipping...")
    return
end
_G.ScripterHub_UILoaded = true

-- ============ STORE REFERENCES FOR OBFUSCATION ============
-- Store references to executor functions BEFORE obfuscation to prevent errors
local _READFILE = readfile
local _WRITEFILE = writefile
local _DELFILE = delfile
local _HTTPGET = game.HttpGet
-- =============================================================================

local player = game.Players.LocalPlayer
local playerName = player.Name
local userId = player.UserId
local hwid = game:GetService("RbxAnalyticsService"):GetClientId()
local keyVerified = false
local keyExpiry = nil
local countdownThread = nil
local isWhitelisted = false
local actualExpiry = nil
local currentKey = nil
local currentKeyIsLifetime = false

-- WEBSITE CONFIGURATION
-- The worker that holds the licenses. This is the same address the published
-- scripts are served from.
local API_URL = "https://scripterhub-stats.dubovikstanislav51.workers.dev"

-- THE AD LINKS. Change them whenever you want - the buttons copy these.
-- The key comes back on the reward page, and the visitor types it into the
-- Welcome tab.
local AD_LINKS = {
    { text = "\240\159\148\151 GET KEY FROM LINKVERTISE", color = Color3.fromRGB(200, 100, 50),
      url = "https://vietpolua.cc.cd/checkpoint/linkvertise?script=ScripterHub" },
    { text = "\240\159\146\176 GET KEY FROM LOOTLABS", color = Color3.fromRGB(100, 50, 200),
      url = "https://vietpolua.cc.cd/checkpoint/lootlabs?script=ScripterHub" },
    { text = "\226\154\161 GET KEY FROM WORKINK", color = Color3.fromRGB(0, 128, 0),
      url = "https://vietpolua.cc.cd/checkpoint/workink?script=ScripterHub" },
}

-- SOCIAL LINKS
local SOCIAL_LINKS = {
    { text = "\240\159\147\186 YOUTUBE CHANNEL", color = Color3.fromRGB(255, 0, 0),
      url = "https://www.youtube.com/@Scripter-Coder" },
    { text = "\240\159\146\172 DISCORD SERVER", color = Color3.fromRGB(88, 101, 242),
      url = "https://discord.gg/v5swRqZzBG" },
}

-- 4 SEPARATE FILES
local KEY_FILE = "ScripterHub_Key_" .. userId .. ".txt"
local HWID_FILE = "ScripterHub_HWID_" .. userId .. ".txt"
local EXPIRY_FILE = "ScripterHub_Expiry_" .. userId .. ".txt"
local TIMESTAMP_FILE = "ScripterHub_Timestamp_" .. userId .. ".txt"

-- ============ FILE FUNCTIONS WITH SAFETY CHECKS ============
-- Every executor is a little different, so nothing here assumes a function
-- exists: if the executor has no readfile, the key is simply not remembered
-- between runs, and the card still works for this session.
--
-- The write and delete FUNCTIONS REPORT WHAT THEY DID. The old card called
-- them and said nothing, so a key that could not be deleted looked exactly
-- like a key that had been deleted - and the "forget" button did nothing at
-- all, with no word about why.
local function stopCountdown()
    if countdownThread then
        pcall(function() task.cancel(countdownThread) end)
        countdownThread = nil
    end
end

local function readFile(filename)
    if type(_READFILE) ~= "function" then
        return nil
    end
    local success, data = pcall(function()
        return _READFILE(filename)
    end)
    if success and data and data ~= "" then
        return (tostring(data):gsub("%s+", ""))
    end
    return nil
end

-- returns true when the file was actually written
local function writeFile(filename, data)
    if type(_WRITEFILE) ~= "function" then
        return false
    end
    local ok = pcall(function()
        _WRITEFILE(filename, tostring(data))
    end)
    return ok == true
end

-- returns true when the file was actually deleted
local function deleteFile(filename)
    if type(_DELFILE) ~= "function" then
        return false
    end
    local ok = pcall(function()
        _DELFILE(filename)
    end)
    return ok == true
end

-- ============ URL ENCODING ============
-- The key is alphanumeric, so it never needs it, but the hardware id can
-- contain characters that do.
local function urlEncode(s)
    return (tostring(s):gsub("[^%w%-%._~]", function(c)
        return string.format("%%%02X", string.byte(c))
    end))
end

-- ============ PLAIN TEXT HTTP, WITH EVERY FALLBACK THERE IS ============
-- The card has to work on executors that do not all have the same HTTP
-- function, so it tries them in order and says which one worked:
--
--   1. game:HttpGet   the Roblox one, and the one most executors keep
--   2. request        the http library most executors provide
--   3. syn.request    the old global
--   4. http.request   the http library, by its full name
--   5. httpget        the old global
--
-- IT SAYS WHAT WENT WRONG. "Could not reach the key server" and nothing
-- else is not a diagnosis: it does not say whether the request never left,
-- whether the answer was empty, or whether the executor simply has no HTTP
-- at all. The card keeps the last error and shows it.
local LAST_HTTP_ERROR = ""

local function httpGet(url)
    local tried = {}

    -- 1. game:HttpGet
    if type(_HTTPGET) == "function" then
        local ok, body = pcall(function()
            return _HTTPGET(url)
        end)
        if ok and type(body) == "string" and body ~= "" then return body end
        table.insert(tried, "game:HttpGet=" .. tostring(body))
    else
        table.insert(tried, "game:HttpGet=missing")
    end

    -- 2. request
    if type(request) == "function" then
        local ok, body = pcall(function()
            return request({ Url = url, Method = "GET" })
        end)
        if ok and type(body) == "string" and body ~= "" then return body end
        -- Some executors answer with a table.
        if ok and type(body) == "table" and type(body.Body) == "string" and body.Body ~= "" then
            return body.Body
        end
        table.insert(tried, "request=" .. tostring(body))
    end

    -- 3. syn.request
    if type(syn) == "table" and type(syn.request) == "function" then
        local ok, body = pcall(function()
            return syn.request({ Url = url, Method = "GET" })
        end)
        if ok and type(body) == "string" and body ~= "" then return body end
        if ok and type(body) == "table" and type(body.Body) == "string" and body.Body ~= "" then
            return body.Body
        end
        table.insert(tried, "syn.request=" .. tostring(body))
    end

    -- 4. the http library
    if type(http) == "table" and type(http.request) == "function" then
        local ok, body = pcall(function()
            return http.request(url)
        end)
        if ok and type(body) == "string" and body ~= "" then return body end
        if ok and type(body) == "table" and type(body.Body) == "string" and body.Body ~= "" then
            return body.Body
        end
        table.insert(tried, "http.request=" .. tostring(body))
    end

    -- 5. httpget
    if type(httpget) == "function" then
        local ok, body = pcall(function()
            return httpget(url)
        end)
        if ok and type(body) == "string" and body ~= "" then return body end
        table.insert(tried, "httpget=" .. tostring(body))
    end

    LAST_HTTP_ERROR = table.concat(tried, " | ")
    return nil
end

-- ============ VERIFY A KEY, IN PLAIN TEXT ============
-- The answer is one line:
--   "SHOK <expiresAtMs> <lifetime>"    1 = never expires
--   "SHERR <code>"
local function verifyKey(key)
    if not key or key == "" then
        return { success = false, code = "EMPTY", message = "Key cannot be blank!" }
    end

    local body = httpGet(API_URL .. "/sh/keycheck?k=" .. urlEncode(key) .. "&h=" .. urlEncode(hwid))
    if not body then
        return {
            success = false, code = "NETWORK",
            message = "Could not reach the key server. Tried: " .. tostring(LAST_HTTP_ERROR)
        }
    end

    body = tostring(body):gsub("%s+$", "")

    local expiresMs, lifetime = body:match("^SHOK (%d+) (%d+)")
    if expiresMs then
        local expiresSec = 0
        if lifetime ~= "1" and tonumber(expiresMs) and tonumber(expiresMs) > 0 then
            expiresSec = math.floor(tonumber(expiresMs) / 1000)
        end
        return {
            success = true,
            code = "OK",
            lifetime = lifetime == "1",
            expiry = expiresSec
        }
    end

    local code = body:match("^SHERR (.+)$")
    if code then
        code = code:gsub("%s+$", "")
        local messages = {
            invalid = "Invalid Key! Get a valid key from the Links tab.",
            expired = "Key Expired! Get a new key from the Links tab.",
            hwid = "HWID Locked! This key is on another machine.",
            banned = "Key Blacklisted!",
            killswitch = "The key server is paused. Try again later.",
        }
        return {
            success = false,
            code = code:upper(),
            message = messages[code] or ("Key refused: " .. code)
        }
    end

    return { success = false, code = "UNKNOWN", message = "The key server said something we do not understand." }
end

-- ============ SAVE ALL 4 FILES ============
local function saveAll4Files(key, expiry)
    currentKey = key
    writeFile(KEY_FILE, key)
    writeFile(HWID_FILE, hwid)

    local expiryString = "LIFETIME"
    if expiry and expiry ~= "LIFETIME" and tonumber(expiry) then
        expiryString = tostring(expiry)
    end
    writeFile(EXPIRY_FILE, expiryString)
    writeFile(TIMESTAMP_FILE, tostring(os.time()))
end

-- ============ DELETE ALL 4 FILES ============
-- It says how many of them it actually removed. A "forget" button that
-- silently does nothing is worse than no button at all: the visitor presses
-- it, the key is still there next time, and nothing explains why.
local function deleteAll4Files()
    local gone = 0
    if deleteFile(KEY_FILE) then gone = gone + 1 end
    if deleteFile(HWID_FILE) then gone = gone + 1 end
    if deleteFile(EXPIRY_FILE) then gone = gone + 1 end
    if deleteFile(TIMESTAMP_FILE) then gone = gone + 1 end
    return gone
end

-- ============ TIME FORMATTING FUNCTION ============
-- FOUR STATES, AND THE DIFFERENCE MATTERS:
--
--   NOKEY     there is no key at all. The counters show "-", NOT infinity.
--              Infinity means "this key never expires", and showing it when
--              there is no key at all is a lie - the old card showed
--              "Days: inf" on a fresh install, which reads like a lifetime
--              key that was already earned.
--   LIFETIME  the key never expires. The counters show infinity, which is
--              what infinity is for.
--   ACTIVE    the key has time left.
--   EXPIRED   the time is up.
local function formatTimeLeft(expiryTimestamp, hasKey)
    if not hasKey then
        return "NOKEY", "-", "-", "-", "-"
    end
    if not expiryTimestamp or expiryTimestamp == 0 or expiryTimestamp == "0"
        or expiryTimestamp == "LIFETIME" then
        return "LIFETIME", "\226\136\158", "\226\136\158", "\226\136\158", "\226\136\158"
    end

    local expiryNum = tonumber(expiryTimestamp)
    if not expiryNum then
        return "LIFETIME", "\226\136\158", "\226\136\158", "\226\136\158", "\226\136\158"
    end

    local remaining = expiryNum - os.time()

    if remaining <= 0 then
        return "EXPIRED", "0", "0", "0", "0"
    end

    local days = math.floor(remaining / 86400)
    local hours = math.floor((remaining % 86400) / 3600)
    local minutes = math.floor((remaining % 3600) / 60)
    local seconds = math.floor(remaining % 60)

    return "ACTIVE", tostring(days), tostring(hours), tostring(minutes), tostring(seconds)
end

-- ============ THE KEY THE OBFUSCATOR PUTS IN THE ENVIRONMENT ============
-- The published scripts read getgenv().ScripterHubKey. The old code looked
-- for getgenv().KEY, which is a different name, so a key handed over by the
-- obfuscator was never picked up. Both are read now, and the one the site
-- uses comes first.
local function getProvidedKey()
    local env = (getgenv and getgenv()) or _G
    local k = env.ScripterHubKey
    if (not k or k == "") then k = env.KEY end
    if type(k) ~= "string" or k == "" then return nil end
    return k
end

-- ============ CHECK AND VALIDATE SAVED KEY ============
print("=== SCRIPTER HUB KEY SYSTEM ===")
print("HWID: " .. tostring(hwid))
print("API URL: " .. API_URL)

-- A key handed over in the environment is used as the starting point.
local providedKey = getProvidedKey()
if providedKey then
    print("\240\159\148\145 Key provided in the environment")
    writeFile(KEY_FILE, providedKey)
end

-- WHITELIST (OPTIONAL, OFF BY DEFAULT)
--
-- The old system had a hardware whitelist that granted lifetime access. The
-- ScripterHub worker has no such route, so this is off. Put a url here that
-- answers with the word WHITELISTED for a machine you trust and it will be
-- used; leave it empty and the whitelist does not exist.
local WHITELIST_URL = ""
if WHITELIST_URL ~= "" then
    local body = httpGet(WHITELIST_URL .. urlEncode(hwid))
    if body and tostring(body):find("WHITELISTED") then
        isWhitelisted = true
    end
end

if isWhitelisted then
    keyVerified = true
    keyExpiry = nil
    actualExpiry = nil
    currentKeyIsLifetime = true
    saveAll4Files("WHITELISTED_" .. tostring(hwid), "LIFETIME")
    print("\226\156\133 Whitelisted user!")
else
    local savedKey = readFile(KEY_FILE)
    local savedExpiry = readFile(EXPIRY_FILE)

    if savedKey and savedKey ~= "" and savedKey ~= "WHITELISTED_" .. tostring(hwid) then
        print("Found saved key: " .. savedKey)

        local validation = verifyKey(savedKey)
        print("API validation result: " .. tostring(validation.success))

        if validation.success then
            if validation.lifetime then
                keyVerified = true
                keyExpiry = nil
                actualExpiry = nil
                currentKeyIsLifetime = true
                saveAll4Files(savedKey, "LIFETIME")
                print("\226\156\133 Lifetime key valid!")
            else
                actualExpiry = validation.expiry
                keyExpiry = actualExpiry

                if actualExpiry and actualExpiry > 0 then
                    print("Key expires on: " .. os.date("%Y-%m-%d %H:%M:%S", actualExpiry))
                end

                if actualExpiry and actualExpiry > 0 and os.time() > actualExpiry then
                    keyVerified = false
                    print("\226\157\140 Key is expired!")
                    deleteAll4Files()
                else
                    keyVerified = true
                    saveAll4Files(savedKey, actualExpiry)
                    local daysLeft = math.floor(((actualExpiry or 0) - os.time()) / 86400)
                    print("\226\156\133 Key valid! Expires in " .. tostring(daysLeft) .. " days")
                end
            end
        else
            keyVerified = false
            print("\226\157\140 Saved key invalid: " .. tostring(validation.message))
            deleteAll4Files()
        end
    else
        print("No saved key found")
    end
end

-- ============ THE LOOK ============
-- One place for every colour, so the card reads as one thing.
local C = {
    bg = Color3.fromRGB(14, 15, 22),
    panel = Color3.fromRGB(22, 24, 34),
    panel2 = Color3.fromRGB(28, 30, 42),
    line = Color3.fromRGB(48, 52, 70),
    text = Color3.fromRGB(238, 240, 248),
    dim = Color3.fromRGB(140, 146, 172),
    accent = Color3.fromRGB(124, 92, 255),
    accent2 = Color3.fromRGB(56, 189, 248),
    good = Color3.fromRGB(74, 222, 128),
    warn = Color3.fromRGB(255, 184, 77),
    bad = Color3.fromRGB(255, 99, 110),
    muted = Color3.fromRGB(62, 66, 88),
}

local function round(obj, radius)
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, radius or 10)
    c.Parent = obj
    return c
end

local function stroke(obj, colour, thickness)
    local s = Instance.new("UIStroke")
    s.Color = colour or C.line
    s.Thickness = thickness or 1
    s.Transparency = 0.55
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Parent = obj
    return s
end

local function gradient(obj, a, b, rotation)
    local g = Instance.new("UIGradient")
    g.Color = ColorSequence.new(a, b)
    g.Rotation = rotation or 0
    g.Parent = obj
    return g
end

-- ============ CREATE MAIN GUI ============
local screenGui = Instance.new("ScreenGui")
screenGui.Name = "ScripterHub"
screenGui.Parent = game.CoreGui
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screenGui.ResetOnSpawn = false
screenGui.DisplayOrder = 50

local shadow = Instance.new("Frame")
shadow.Name = "Shadow"
shadow.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
shadow.BackgroundTransparency = 0.55
shadow.BorderSizePixel = 0
shadow.Position = UDim2.new(0.5, -344, 0.5, -244)
shadow.Size = UDim2.new(0, 700, 0, 550)
shadow.ZIndex = 1
shadow.Parent = screenGui
round(shadow, 18)

-- Main Frame (Big UI)
local mainFrame = Instance.new("Frame")
mainFrame.Parent = screenGui
mainFrame.BackgroundColor3 = C.bg
mainFrame.BorderSizePixel = 0
mainFrame.Position = UDim2.new(0.5, -350, 0.5, -250)
mainFrame.Size = UDim2.new(0, 700, 0, 550)
mainFrame.Active = true
mainFrame.Draggable = true
mainFrame.ClipsDescendants = true
mainFrame.ZIndex = 2
round(mainFrame, 16)
stroke(mainFrame, C.line, 1)
gradient(mainFrame, Color3.fromRGB(20, 22, 32), Color3.fromRGB(12, 13, 19), 90)

-- Title Bar
local titleBar = Instance.new("Frame")
titleBar.Parent = mainFrame
titleBar.BackgroundColor3 = Color3.fromRGB(24, 26, 38)
titleBar.BorderSizePixel = 0
titleBar.Size = UDim2.new(1, 0, 0, 56)
titleBar.ZIndex = 3
gradient(titleBar, Color3.fromRGB(38, 30, 74), Color3.fromRGB(18, 20, 30), 0)

local titleBarLine = Instance.new("Frame")
titleBarLine.Parent = titleBar
titleBarLine.BackgroundColor3 = C.accent
titleBarLine.BackgroundTransparency = 0.25
titleBarLine.BorderSizePixel = 0
titleBarLine.Position = UDim2.new(0, 0, 1, -2)
titleBarLine.Size = UDim2.new(1, 0, 0, 2)
titleBarLine.ZIndex = 4

local titleLabel = Instance.new("TextLabel")
titleLabel.Parent = titleBar
titleLabel.BackgroundTransparency = 1
titleLabel.Position = UDim2.new(0, 18, 0, 0)
titleLabel.Size = UDim2.new(0.6, 0, 1, 0)
titleLabel.Font = Enum.Font.GothamBold
titleLabel.Text = "SCRIPTER HUB"
titleLabel.TextColor3 = C.text
titleLabel.TextSize = 20
titleLabel.TextXAlignment = Enum.TextXAlignment.Left
titleLabel.ZIndex = 4

local titleSub = Instance.new("TextLabel")
titleSub.Parent = titleBar
titleSub.BackgroundTransparency = 1
titleSub.Position = UDim2.new(0, 18, 0, 30)
titleSub.Size = UDim2.new(0.6, 0, 0, 18)
titleSub.Font = Enum.Font.Gotham
titleSub.Text = "welcome back, " .. tostring(playerName)
titleSub.TextColor3 = C.dim
titleSub.TextSize = 12
titleSub.TextXAlignment = Enum.TextXAlignment.Left
titleSub.ZIndex = 4

-- THE STATE PILL. It says what the key is, in the corner, and it is the
-- first thing you see.
local statePill = Instance.new("Frame")
statePill.Parent = titleBar
statePill.BackgroundColor3 = C.muted
statePill.BorderSizePixel = 0
statePill.Position = UDim2.new(1, -150, 0, 14)
statePill.Size = UDim2.new(0, 105, 0, 28)
statePill.ZIndex = 4
round(statePill, 14)

local statePillText = Instance.new("TextLabel")
statePillText.Parent = statePill
statePillText.BackgroundTransparency = 1
statePillText.Size = UDim2.new(1, 0, 1, 0)
statePillText.Font = Enum.Font.GothamBold
statePillText.Text = "\226\151\143  NO KEY"
statePillText.TextColor3 = C.dim
statePillText.TextSize = 12
statePillText.ZIndex = 5

-- Close Button
local closeBtn = Instance.new("TextButton")
closeBtn.Parent = titleBar
closeBtn.BackgroundColor3 = C.panel2
closeBtn.BorderSizePixel = 0
closeBtn.Position = UDim2.new(1, -42, 0, 14)
closeBtn.Size = UDim2.new(0, 28, 0, 28)
closeBtn.Font = Enum.Font.GothamBold
closeBtn.Text = "\226\156\149"
closeBtn.TextColor3 = C.dim
closeBtn.TextSize = 14
closeBtn.ZIndex = 5
round(closeBtn, 8)
closeBtn.MouseEnter:Connect(function() closeBtn.TextColor3 = C.text end)
closeBtn.MouseLeave:Connect(function() closeBtn.TextColor3 = C.dim end)

closeBtn.MouseButton1Click:Connect(function()
    stopCountdown()
    screenGui:Destroy()
    _G.ScripterHub_UILoaded = nil
end)

-- ============ TAB BUTTONS ============
local tabButtonsFrame = Instance.new("Frame")
tabButtonsFrame.Parent = mainFrame
tabButtonsFrame.BackgroundColor3 = C.bg
tabButtonsFrame.BackgroundTransparency = 0.4
tabButtonsFrame.BorderSizePixel = 0
tabButtonsFrame.Position = UDim2.new(0, 0, 0, 56)
tabButtonsFrame.Size = UDim2.new(1, 0, 0, 46)
tabButtonsFrame.ZIndex = 3

local function makeTab(text, x)
    local b = Instance.new("TextButton")
    b.Parent = tabButtonsFrame
    b.BackgroundColor3 = C.panel
    b.BackgroundTransparency = 0.6
    b.BorderSizePixel = 0
    b.Position = UDim2.new(0, x, 0, 8)
    b.Size = UDim2.new(0, 130, 0, 30)
    b.Font = Enum.Font.GothamBold
    b.Text = text
    b.TextColor3 = C.dim
    b.TextSize = 13
    b.ZIndex = 4
    round(b, 8)
    return b
end

local welcomeTabBtn = makeTab("\240\159\143\160  WELCOME", 14)
local linksTabBtn = makeTab("\240\159\148\151  LINKS", 154)

-- ============ CONTENT CONTAINERS ============
local function makeContent()
    local f = Instance.new("ScrollingFrame")
    f.Parent = mainFrame
    f.BackgroundTransparency = 1
    f.BorderSizePixel = 0
    f.Position = UDim2.new(0, 16, 0, 114)
    f.Size = UDim2.new(1, -32, 1, -128)
    f.CanvasSize = UDim2.new(0, 0, 0, 0)
    f.ScrollBarThickness = 5
    f.ScrollBarImageColor3 = C.muted
    f.AutomaticCanvasSize = Enum.AutomaticSize.None
    f.ZIndex = 3
    return f
end

local welcomeContent = makeContent()
local linksContent = makeContent()
linksContent.Visible = false

local function makeLayout(parent)
    local l = Instance.new("UIListLayout")
    l.Parent = parent
    l.SortOrder = Enum.SortOrder.LayoutOrder
    l.Padding = UDim.new(0, 12)
    l.HorizontalAlignment = Enum.HorizontalAlignment.Left
    return l
end

local welcomeLayout = makeLayout(welcomeContent)
local linksLayout = makeLayout(linksContent)

local function updateCanvas(frame, layout)
    frame.CanvasSize = UDim2.new(0, 0, 0, layout.AbsoluteContentSize.Y + 20)
end

welcomeLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
    updateCanvas(welcomeContent, welcomeLayout)
end)

linksLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
    updateCanvas(linksContent, linksLayout)
end)

local function selectTab(which)
    welcomeContent.Visible = (which == "welcome")
    linksContent.Visible = (which == "links")
    welcomeTabBtn.BackgroundTransparency = (which == "welcome") and 0 or 0.6
    welcomeTabBtn.TextColor3 = (which == "welcome") and C.text or C.dim
    linksTabBtn.BackgroundTransparency = (which == "links") and 0 or 0.6
    linksTabBtn.TextColor3 = (which == "links") and C.text or C.dim
end

welcomeTabBtn.MouseButton1Click:Connect(function() selectTab("welcome") end)
linksTabBtn.MouseButton1Click:Connect(function() selectTab("links") end)

-- ============ HELPER FUNCTIONS ============
local function createLabel(parent, text, textSize, textColor)
    local label = Instance.new("TextLabel")
    label.Parent = parent
    label.BackgroundTransparency = 1
    label.Size = UDim2.new(1, -20, 0, 26)
    label.Font = Enum.Font.GothamBold
    label.Text = text
    label.TextColor3 = textColor or C.text
    label.TextSize = textSize or 15
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.LayoutOrder = 1
    return label
end

-- A PANEL: the rounded card everything sits on.
local function createPanel(parent, height, order)
    local frame = Instance.new("Frame")
    frame.Parent = parent
    frame.BackgroundColor3 = C.panel
    frame.BorderSizePixel = 0
    frame.Size = UDim2.new(1, -20, 0, height)
    frame.LayoutOrder = order or 10
    frame.ZIndex = 3
    round(frame, 12)
    stroke(frame, C.line, 1)
    return frame
end

-- THE COUNTDOWN. Four panels, a value and a caption, and the value is the
-- thing you look at.
local function createCountdownTimer(parent)
    local frame = createPanel(parent, 128)

    local head = Instance.new("TextLabel")
    head.Parent = frame
    head.BackgroundTransparency = 1
    head.Position = UDim2.new(0, 16, 0, 10)
    head.Size = UDim2.new(1, -32, 0, 22)
    head.Font = Enum.Font.GothamBold
    head.Text = "\226\143\176  TIME LEFT"
    head.TextColor3 = C.accent2
    head.TextSize = 14
    head.TextXAlignment = Enum.TextXAlignment.Left
    head.ZIndex = 4

    local statusLabel = Instance.new("TextLabel")
    statusLabel.Parent = frame
    statusLabel.BackgroundTransparency = 1
    statusLabel.Position = UDim2.new(0, 16, 0, 32)
    statusLabel.Size = UDim2.new(1, -32, 0, 18)
    statusLabel.Font = Enum.Font.Gotham
    statusLabel.Text = "Waiting for a key"
    statusLabel.TextColor3 = C.dim
    statusLabel.TextSize = 12
    statusLabel.TextXAlignment = Enum.TextXAlignment.Left
    statusLabel.ZIndex = 4

    local boxes = {}
    local names = { "DAYS", "HOURS", "MINUTES", "SECONDS" }
    for i = 1, 4 do
        local box = Instance.new("Frame")
        box.Parent = frame
        box.BackgroundColor3 = C.panel2
        box.BorderSizePixel = 0
        box.Position = UDim2.new(0, 14 + (i - 1) * 84, 0, 58)
        box.Size = UDim2.new(0, 78, 0, 56)
        box.ZIndex = 4
        round(box, 10)

        local value = Instance.new("TextLabel")
        value.Parent = box
        value.BackgroundTransparency = 1
        value.Position = UDim2.new(0, 0, 0, 6)
        value.Size = UDim2.new(1, 0, 0, 30)
        value.Font = Enum.Font.GothamBold
        value.Text = "-"
        value.TextColor3 = C.text
        value.TextSize = 22
        value.ZIndex = 5

        local caption = Instance.new("TextLabel")
        caption.Parent = box
        caption.BackgroundTransparency = 1
        caption.Position = UDim2.new(0, 0, 0, 34)
        caption.Size = UDim2.new(1, 0, 0, 16)
        caption.Font = Enum.Font.Gotham
        caption.Text = names[i]
        caption.TextColor3 = C.dim
        caption.TextSize = 10
        caption.ZIndex = 5

        boxes[i] = { value = value, caption = caption }
    end

    return {
        frame = frame,
        statusLabel = statusLabel,
        dayValue = boxes[1].value,
        hourValue = boxes[2].value,
        minuteValue = boxes[3].value,
        secondValue = boxes[4].value,
    }
end

local function updateCountdownDisplay(countdownElements, expiry, hasKey)
    local status, days, hours, minutes, seconds = formatTimeLeft(expiry, hasKey)

    if status == "NOKEY" then
        countdownElements.statusLabel.Text = "No key on this device yet"
        countdownElements.statusLabel.TextColor3 = C.dim
        countdownElements.dayValue.Text = "-"
        countdownElements.hourValue.Text = "-"
        countdownElements.minuteValue.Text = "-"
        countdownElements.secondValue.Text = "-"
        countdownElements.dayValue.TextColor3 = C.dim
        countdownElements.hourValue.TextColor3 = C.dim
        countdownElements.minuteValue.TextColor3 = C.dim
        countdownElements.secondValue.TextColor3 = C.dim
    elseif status == "LIFETIME" then
        countdownElements.statusLabel.Text = "\240\159\140\159  LIFETIME ACCESS - this key never expires"
        countdownElements.statusLabel.TextColor3 = C.good
        countdownElements.dayValue.Text = "\226\136\158"
        countdownElements.hourValue.Text = "\226\136\158"
        countdownElements.minuteValue.Text = "\226\136\158"
        countdownElements.secondValue.Text = "\226\136\158"
        countdownElements.dayValue.TextColor3 = C.good
        countdownElements.hourValue.TextColor3 = C.good
        countdownElements.minuteValue.TextColor3 = C.good
        countdownElements.secondValue.TextColor3 = C.good
    elseif status == "EXPIRED" then
        countdownElements.statusLabel.Text = "\226\157\140  EXPIRED - get a new key from the Links tab"
        countdownElements.statusLabel.TextColor3 = C.bad
        countdownElements.dayValue.Text = "0"
        countdownElements.hourValue.Text = "0"
        countdownElements.minuteValue.Text = "0"
        countdownElements.secondValue.Text = "0"
        countdownElements.dayValue.TextColor3 = C.bad
        countdownElements.hourValue.TextColor3 = C.bad
        countdownElements.minuteValue.TextColor3 = C.bad
        countdownElements.secondValue.TextColor3 = C.bad
    else
        countdownElements.statusLabel.Text = "\226\156\133  ACTIVE"
        countdownElements.statusLabel.TextColor3 = C.good
        countdownElements.dayValue.Text = days
        countdownElements.hourValue.Text = hours
        countdownElements.minuteValue.Text = minutes
        countdownElements.secondValue.Text = seconds
        countdownElements.dayValue.TextColor3 = C.text
        countdownElements.hourValue.TextColor3 = C.text
        countdownElements.minuteValue.Text = C.text
        countdownElements.secondValue.TextColor3 = C.text
    end
end

-- THE STATUS BANNER. It has an accent bar on the left whose colour follows
-- the state, so the state is readable from across the screen.
local function createStatusLabel(parent, initialText)
    local frame = createPanel(parent, 46)
    frame.BackgroundTransparency = 0.15

    local bar = Instance.new("Frame")
    bar.Parent = frame
    bar.BackgroundColor3 = C.warn
    bar.BorderSizePixel = 0
    bar.Position = UDim2.new(0, 0, 0, 8)
    bar.Size = UDim2.new(0, 4, 1, -16)
    bar.ZIndex = 4
    round(bar, 2)

    local label = Instance.new("TextLabel")
    label.Parent = frame
    label.BackgroundTransparency = 1
    label.Position = UDim2.new(0, 16, 0, 0)
    label.Size = UDim2.new(1, -32, 1, 0)
    label.Font = Enum.Font.GothamMedium
    label.Text = initialText
    label.TextColor3 = C.warn
    label.TextSize = 13
    label.TextWrapped = true
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.ZIndex = 4

    local function setText(newText)
        label.Text = newText
        local colour = C.accent2
        if string.find(newText, "\226\156\133") or string.find(newText, "Active") then
            colour = C.good
        elseif string.find(newText, "\226\157\140") or string.find(newText, "Expired") then
            colour = C.bad
        elseif string.find(newText, "\226\154\160\239\184\143") or string.find(newText, "Invalid") then
            colour = C.warn
        end
        label.TextColor3 = colour
        bar.BackgroundColor3 = colour
    end

    return { label = label, setText = setText }
end

-- THE PILL, in the corner. It follows the same states as the banner.
local function setStatePill(text, colour)
    statePillText.Text = "\226\151\143  " .. text
    statePillText.TextColor3 = colour
    statePill.BackgroundColor3 = colour
    statePill.BackgroundTransparency = 0.8
end

local function createParagraph(parent, title, content, order)
    local frame = createPanel(parent, 76, order)
    local titleLabel = Instance.new("TextLabel")
    titleLabel.Parent = frame
    titleLabel.BackgroundTransparency = 1
    titleLabel.Position = UDim2.new(0, 16, 0, 10)
    titleLabel.Size = UDim2.new(1, -32, 0, 20)
    titleLabel.Font = Enum.Font.GothamBold
    titleLabel.Text = title
    titleLabel.TextColor3 = C.warn
    titleLabel.TextSize = 13
    titleLabel.TextXAlignment = Enum.TextXAlignment.Left
    titleLabel.ZIndex = 4

    local contentLabel = Instance.new("TextLabel")
    contentLabel.Parent = frame
    contentLabel.BackgroundTransparency = 1
    contentLabel.Position = UDim2.new(0, 16, 0, 32)
    contentLabel.Size = UDim2.new(1, -32, 0, 38)
    contentLabel.Font = Enum.Font.Gotham
    contentLabel.Text = content
    contentLabel.TextColor3 = C.dim
    contentLabel.TextSize = 12
    contentLabel.TextXAlignment = Enum.TextXAlignment.Left
    contentLabel.TextWrapped = true
    contentLabel.ZIndex = 4

    return frame
end

local function createButton(parent, text, textColor, bgColor, callback, order)
    local button = Instance.new("TextButton")
    button.Parent = parent
    button.BackgroundColor3 = bgColor or C.accent
    button.BorderSizePixel = 0
    button.Size = UDim2.new(1, -20, 0, 44)
    button.Font = Enum.Font.GothamBold
    button.Text = text
    button.TextColor3 = textColor or Color3.fromRGB(255, 255, 255)
    button.TextSize = 13
    button.LayoutOrder = order or 10
    button.ZIndex = 4
    round(button, 10)
    stroke(button, bgColor or C.accent, 1)

    local originalColor = bgColor or C.accent
    local hoverColor = Color3.fromRGB(
        math.min(originalColor.R * 255 + 22, 255),
        math.min(originalColor.G * 255 + 22, 255),
        math.min(originalColor.B * 255 + 22, 255)
    )

    button.MouseEnter:Connect(function()
        button.BackgroundColor3 = hoverColor
    end)

    button.MouseLeave:Connect(function()
        button.BackgroundColor3 = originalColor
    end)

    button.MouseButton1Click:Connect(callback)

    return button
end

-- Function to destroy UI and load hub
local function destroyUIAndLoadHub(hubUrl)
    stopCountdown()
    screenGui:Destroy()
    _G.ScripterHub_UILoaded = nil
    loadstring(game:HttpGet(hubUrl))()
end

-- A ROW OF TWO BUTTONS, for the pairs that belong together.
local function createButtonRow(parent)
    local row = Instance.new("Frame")
    row.Parent = parent
    row.BackgroundTransparency = 1
    row.Size = UDim2.new(1, -20, 0, 44)
    row.LayoutOrder = 10
    row.ZIndex = 3
    local layout = Instance.new("UIListLayout")
    layout.Parent = row
    layout.FillDirection = Enum.FillDirection.Horizontal
    layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
    layout.VerticalAlignment = Enum.VerticalAlignment.Center
    layout.Padding = UDim.new(0, 10)
    return row
end

local function createTextboxWithButton(parent, placeholder, buttonText, callback, order)
    local frame = createPanel(parent, 58, order)

    local textbox = Instance.new("TextBox")
    textbox.Parent = frame
    textbox.BackgroundColor3 = C.panel2
    textbox.BorderSizePixel = 0
    textbox.Position = UDim2.new(0, 12, 0, 11)
    textbox.Size = UDim2.new(1, -110, 0, 36)
    textbox.Font = Enum.Font.Gotham
    textbox.PlaceholderText = placeholder
    textbox.PlaceholderColor3 = C.muted
    textbox.Text = ""
    textbox.TextColor3 = C.text
    textbox.TextSize = 13
    textbox.ClearTextOnFocus = false
    textbox.ZIndex = 4
    round(textbox, 8)
    stroke(textbox, C.line, 1)

    local submitBtn = Instance.new("TextButton")
    submitBtn.Parent = frame
    submitBtn.BackgroundColor3 = C.accent
    submitBtn.BorderSizePixel = 0
    submitBtn.Position = UDim2.new(1, -88, 0, 11)
    submitBtn.Size = UDim2.new(0, 76, 0, 36)
    submitBtn.Font = Enum.Font.GothamBold
    submitBtn.Text = buttonText or "Submit"
    submitBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    submitBtn.TextSize = 13
    submitBtn.ZIndex = 4
    round(submitBtn, 8)
    submitBtn.MouseEnter:Connect(function()
        submitBtn.BackgroundColor3 = Color3.fromRGB(146, 114, 255)
    end)
    submitBtn.MouseLeave:Connect(function()
        submitBtn.BackgroundColor3 = C.accent
    end)

    local function submit()
        callback(textbox.Text)
    end

    submitBtn.MouseButton1Click:Connect(submit)

    textbox.FocusLost:Connect(function(enterPressed)
        if enterPressed then
            submit()
        end
    end)

    return { textbox = textbox, button = submitBtn, frame = frame }
end

-- ============ BUILD WELCOME TAB ============
createLabel(welcomeContent, "\240\159\145\139  HELLO " .. tostring(playerName), 17, C.text).LayoutOrder = 1

local countdownElements = createCountdownTimer(welcomeContent)
countdownElements.frame.LayoutOrder = 2

local status = createStatusLabel(welcomeContent, "\226\154\160\239\184\143  No key found - enter your key below")
status.frame.LayoutOrder = 3

-- Update status based on saved key
if isWhitelisted then
    status.setText("\226\156\133  Whitelisted user - lifetime access granted")
    updateCountdownDisplay(countdownElements, nil, true)
    setStatePill("ACTIVE", C.good)
elseif keyVerified then
    if keyExpiry and keyExpiry > 0 then
        if os.time() > keyExpiry then
            status.setText("\226\157\140  Key expired - get a new key from the Links tab")
            updateCountdownDisplay(countdownElements, 0, true)
            keyVerified = false
            setStatePill("EXPIRED", C.bad)
        else
            updateCountdownDisplay(countdownElements, keyExpiry, true)
            local daysLeft = math.floor((keyExpiry - os.time()) / 86400)
            status.setText("\226\156\133  Key active - " .. daysLeft .. " days remaining")
            setStatePill("ACTIVE", C.good)
        end
    else
        updateCountdownDisplay(countdownElements, nil, true)
        status.setText("\226\156\133  Key active - lifetime access granted")
        setStatePill("ACTIVE", C.good)
    end
else
    -- NO KEY. The counters show "-", not infinity: infinity means "this key
    -- never expires", and there is no key here at all.
    updateCountdownDisplay(countdownElements, nil, false)
    setStatePill("NO KEY", C.dim)
end

-- THE CLOCK.
--
-- The old code connected to RunService.Heartbeat and rewrote four labels on
-- EVERY FRAME - sixty times a second, for a clock that shows seconds. It
-- also meant the label updates ran forever, after the key had expired.
--
-- One thread, once a second, stopped when the key is not a timed one.
local function startCountdown(expiry)
    stopCountdown()
    if not expiry or expiry <= 0 then return end
    countdownThread = task.spawn(function()
        while keyVerified and keyExpiry and os.time() <= keyExpiry do
            updateCountdownDisplay(countdownElements, keyExpiry, true)
            if os.time() > keyExpiry then
                keyVerified = false
                status.setText("\226\157\140  Key expired - get a new key from the Links tab")
                updateCountdownDisplay(countdownElements, 0, true)
                setStatePill("EXPIRED", C.bad)
                break
            end
            task.wait(1)
        end
    end)
end

if keyVerified and keyExpiry and keyExpiry > 0 then
    startCountdown(keyExpiry)
end

-- ============ KEY REDEMPTION TEXTBOX ============
local keyInput = createTextboxWithButton(welcomeContent, "paste your key here...", "\226\156\147  VERIFY", function(value)
    if keyVerified then
        status.setText("\226\156\133  Already verified - you can load your scripts.")
        return
    end

    if not value or value == "" then
        status.setText("\226\157\140  The key cannot be blank.")
        return
    end

    status.setText("\240\159\148\132  Validating the key with the server...")

    local validation = verifyKey(value)
    print("Validation result: " .. tostring(validation.success))

    if validation.success then
        local expiryValue = nil

        if validation.lifetime then
            keyExpiry = nil
            actualExpiry = nil
            currentKeyIsLifetime = true
            print("Lifetime key detected!")
        else
            expiryValue = validation.expiry
            keyExpiry = expiryValue
            actualExpiry = expiryValue
            if expiryValue and expiryValue > 0 then
                print("Key expires on: " .. os.date("%Y-%m-%d %H:%M:%S", expiryValue))
            end
        end

        -- Save to files
        local expiryString = "LIFETIME"
        if expiryValue then
            expiryString = tostring(expiryValue)
        end
        saveAll4Files(value, expiryString)

        -- Hand the key to the environment too, so a script that asks for
        -- getgenv().ScripterHubKey finds it.
        local env = (getgenv and getgenv()) or _G
        env.ScripterHubKey = value

        keyVerified = true

        if expiryValue and expiryValue > 0 then
            startCountdown(expiryValue)
            updateCountdownDisplay(countdownElements, expiryValue, true)
            local daysLeft = math.floor((expiryValue - os.time()) / 86400)
            status.setText("\226\156\133  Key active - " .. daysLeft .. " days remaining")
        else
            updateCountdownDisplay(countdownElements, nil, true)
            status.setText("\226\156\133  Key active - lifetime access granted")
        end
        setStatePill("ACTIVE", C.good)
    else
        if validation.code == "EXPIRED" then
            status.setText("\226\157\140  Key expired - get a new key from the Links tab")
            updateCountdownDisplay(countdownElements, 0, false)
        elseif validation.code == "HWID" then
            status.setText("\240\159\148\146  HWID locked - this key is on another machine.")
        elseif validation.code == "BANNED" then
            status.setText("\240\159\154\171  This key is blacklisted.")
        elseif validation.code == "INVALID" then
            status.setText("\226\157\140  Invalid key - get a valid one from the Links tab.")
        else
            status.setText("\226\154\160\239\184\143  " .. tostring(validation.message or "Unknown error. Contact @scripter_0"))
        end
    end
end, 4)

-- Pre-fill textbox if key exists
if keyVerified and not isWhitelisted then
    local savedKeyFile = readFile(KEY_FILE)
    if savedKeyFile and keyInput and keyInput.textbox then
        keyInput.textbox.Text = savedKeyFile
    end
end

createParagraph(welcomeContent, "\240\159\146\142  LIFETIME KEY OFFER", "If you want a key for lifetime access, you can pay $20 for it. DM me on Discord: @scripter_0", 5)

-- ============ DROPDOWN ============
local dropdownFrame = Instance.new("Frame")
dropdownFrame.Parent = welcomeContent
dropdownFrame.BackgroundColor3 = C.panel
dropdownFrame.BorderSizePixel = 0
dropdownFrame.Size = UDim2.new(1, -20, 0, 50)
dropdownFrame.ClipsDescendants = true
dropdownFrame.LayoutOrder = 6
dropdownFrame.ZIndex = 3
round(dropdownFrame, 12)
stroke(dropdownFrame, C.line, 1)

local selectedBtn = Instance.new("TextButton")
selectedBtn.Parent = dropdownFrame
selectedBtn.BackgroundColor3 = C.panel2
selectedBtn.BorderSizePixel = 0
selectedBtn.Position = UDim2.new(0, 10, 0, 8)
selectedBtn.Size = UDim2.new(1, -20, 0, 34)
selectedBtn.Font = Enum.Font.GothamBold
selectedBtn.Text = "\240\159\142\174  Slap Battles"
selectedBtn.TextColor3 = C.text
selectedBtn.TextSize = 13
selectedBtn.TextXAlignment = Enum.TextXAlignment.Left
selectedBtn.ZIndex = 4
round(selectedBtn, 8)

local arrowLabel = Instance.new("TextLabel")
arrowLabel.Parent = selectedBtn
arrowLabel.BackgroundTransparency = 1
arrowLabel.Position = UDim2.new(1, -30, 0, 0)
arrowLabel.Size = UDim2.new(0, 25, 1, 0)
arrowLabel.Font = Enum.Font.GothamBold
arrowLabel.Text = "\226\150\188"
arrowLabel.TextColor3 = C.dim
arrowLabel.TextSize = 14
arrowLabel.TextXAlignment = Enum.TextXAlignment.Center
arrowLabel.ZIndex = 5

local dropdownItemsFrame = Instance.new("Frame")
dropdownItemsFrame.Parent = dropdownFrame
dropdownItemsFrame.BackgroundColor3 = C.panel2
dropdownItemsFrame.BorderSizePixel = 0
dropdownItemsFrame.Position = UDim2.new(0, 10, 0, 45)
dropdownItemsFrame.Size = UDim2.new(1, -20, 0, 0)
dropdownItemsFrame.Visible = false
dropdownItemsFrame.ClipsDescendants = true
dropdownItemsFrame.ZIndex = 4
round(dropdownItemsFrame, 8)

local dropdownItemsLayout = Instance.new("UIListLayout")
dropdownItemsLayout.Parent = dropdownItemsFrame
dropdownItemsLayout.SortOrder = Enum.SortOrder.LayoutOrder
dropdownItemsLayout.Padding = UDim.new(0, 2)

-- ============ SCRIPT BUTTONS CONTAINER ============
local scriptButtonsContainer = Instance.new("Frame")
scriptButtonsContainer.Parent = welcomeContent
scriptButtonsContainer.BackgroundTransparency = 1
scriptButtonsContainer.Size = UDim2.new(1, 0, 0, 52)
scriptButtonsContainer.LayoutOrder = 7
scriptButtonsContainer.ZIndex = 3

local scriptButtonsLayout = Instance.new("UIListLayout")
scriptButtonsLayout.Parent = scriptButtonsContainer
scriptButtonsLayout.FillDirection = Enum.FillDirection.Horizontal
scriptButtonsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
scriptButtonsLayout.VerticalAlignment = Enum.VerticalAlignment.Center
scriptButtonsLayout.Padding = UDim.new(0, 12)

local currentGame = "Slap Battles"
local dropdownVisible = false
local scriptButtons = {}

-- Function to get script URLs
local function getScriptUrls(gameName)
    if gameName == "Slap Battles" then
        return {
            { name = "Orion", url = "https://raw.githubusercontent.com/Scripter-Coder/Scripter-Coder/refs/heads/main/Slap%20Battles/Slap%20Battles%20Hub%20OP%20Script%20(Orion)/Slap%20Battles%20Hub%20OP%20Script.txt", color = Color3.fromRGB(80, 80, 220) },
            { name = "Fluent", url = "https://raw.githubusercontent.com/Scripter-Coder/Scripter-Coder/refs/heads/main/Slap%20Battles/Slap%20Battles%20Hub%20OP%20Script%20(Fluent)/Slap%20Battles%20Hub%20OP%20Script.txt", color = Color3.fromRGB(220, 80, 80) }
        }
    elseif gameName == "Shoot Noobs And Eat Foods" then
        return {
            { name = "Orion", url = "https://raw.githubusercontent.com/Scripter-Coder/Scripter-Coder/refs/heads/main/Shoot%20And%20Eat%20Noobs/Shoot%20Noobs%20And%20Eat%20Foods%20Hub%20Script%20(Orion%20Version)", color = Color3.fromRGB(80, 80, 220) },
            { name = "Fluent", url = "https://raw.githubusercontent.com/Scripter-Coder/Scripter-Coder/refs/heads/main/Shoot%20And%20Eat%20Noobs/Shoot%20Noobs%20And%20Eat%20Foods%20Hub%20Script%20(Fluent%20Version)", color = Color3.fromRGB(220, 80, 80) }
        }
    end
    return {}
end

-- Function to update script buttons
local function updateScriptButtons(gameName)
    for _, btn in ipairs(scriptButtons) do
        btn:Destroy()
    end
    scriptButtons = {}

    local scripts = getScriptUrls(gameName)
    if #scripts == 0 then return end

    for _, script in ipairs(scripts) do
        local btn = Instance.new("TextButton")
        btn.Parent = scriptButtonsContainer
        btn.BackgroundColor3 = script.color
        btn.BorderSizePixel = 0
        btn.Size = UDim2.new(0, 250, 0, 42)
        btn.Font = Enum.Font.GothamBold
        btn.Text = "\240\159\154\128  LOAD " .. script.name
        btn.TextColor3 = Color3.fromRGB(255, 255, 255)
        btn.TextSize = 13
        btn.ZIndex = 4
        round(btn, 10)
        stroke(btn, script.color, 1)

        local originalColor = script.color
        local hoverColor = Color3.fromRGB(
            math.min(originalColor.R * 255 + 22, 255),
            math.min(originalColor.G * 255 + 22, 255),
            math.min(originalColor.B * 255 + 22, 255)
        )

        btn.MouseEnter:Connect(function()
            btn.BackgroundColor3 = hoverColor
        end)

        btn.MouseLeave:Connect(function()
            btn.BackgroundColor3 = originalColor
        end)

        btn.MouseButton1Click:Connect(function()
            if not keyVerified and not isWhitelisted then
                status.setText("\226\157\140  Enter a valid key first!")
                return
            end
            if keyExpiry and keyExpiry > 0 and os.time() > keyExpiry then
                status.setText("\226\157\140  Your key has expired - get a new key from the Links tab.")
                return
            end
            destroyUIAndLoadHub(script.url)
        end)

        table.insert(scriptButtons, btn)
    end
end

-- Create dropdown options
local options = { "Slap Battles", "Shoot Noobs And Eat Foods" }

for _, option in ipairs(options) do
    local optBtn = Instance.new("TextButton")
    optBtn.Parent = dropdownItemsFrame
    optBtn.BackgroundColor3 = C.panel2
    optBtn.BorderSizePixel = 0
    optBtn.Size = UDim2.new(1, 0, 0, 32)
    optBtn.Font = Enum.Font.Gotham
    optBtn.Text = "\240\159\142\174  " .. option
    optBtn.TextColor3 = C.text
    optBtn.TextSize = 12
    optBtn.TextXAlignment = Enum.TextXAlignment.Left
    optBtn.ZIndex = 5

    optBtn.MouseEnter:Connect(function()
        optBtn.BackgroundColor3 = C.muted
    end)
    optBtn.MouseLeave:Connect(function()
        optBtn.BackgroundColor3 = C.panel2
    end)

    optBtn.MouseButton1Click:Connect(function()
        selectedBtn.Text = "\240\159\142\174  " .. option
        currentGame = option
        dropdownVisible = false
        dropdownItemsFrame.Visible = false
        arrowLabel.Text = "\226\150\188"
        dropdownFrame.Size = UDim2.new(1, -20, 0, 50)
        status.setText("\240\159\142\174  Selected: " .. option)
        updateScriptButtons(option)
    end)
end

-- Toggle dropdown
selectedBtn.MouseButton1Click:Connect(function()
    dropdownVisible = not dropdownVisible
    dropdownItemsFrame.Visible = dropdownVisible
    arrowLabel.Text = dropdownVisible and "\226\150\178" or "\226\150\188"
    if dropdownVisible then
        local totalHeight = #options * 34 + 4
        dropdownFrame.Size = UDim2.new(1, -20, 0, 50 + totalHeight)
        dropdownItemsFrame.Size = UDim2.new(1, -20, 0, totalHeight)
    else
        dropdownFrame.Size = UDim2.new(1, -20, 0, 50)
    end
end)

-- Initialize with default
updateScriptButtons("Slap Battles")

-- ============ THE THREE BUTTONS AT THE BOTTOM ============
-- FORGET THE SAVED KEY, TEST THE CONNECTION, and DESTROY THE GUI, in one
-- row of two and one below.
--
-- THE FORGET BUTTON SAYS WHAT IT DID.
--
-- It used to call the delete functions and say nothing, so a key that could
-- not be deleted - because the executor has no delfile, or because the file
-- is read-only - looked exactly like a key that had been deleted. The
-- visitor pressed it, the key was still there next time, and nothing
-- explained why.
local forgetBtn = nil
local forgetRow = createButtonRow(welcomeContent)
forgetRow.LayoutOrder = 8

forgetBtn = createButton(forgetRow, "\240\159\148\147  FORGET THE SAVED KEY", C.text, C.panel2, function()
    local gone = deleteAll4Files()
    keyVerified = false
    keyExpiry = nil
    actualExpiry = nil
    currentKey = nil
    stopCountdown()
    updateCountdownDisplay(countdownElements, nil, false)
    setStatePill("NO KEY", C.dim)
    if keyInput and keyInput.textbox then
        keyInput.textbox.Text = ""
    end
    if gone == 4 then
        status.setText("\240\159\148\147  The saved key was forgotten. Enter it again to load your scripts.")
    elseif gone == 0 then
        status.setText("\226\154\160\239\184\143  This executor cannot delete files, so the key will still be here next time. "
            .. "Use DESTROY GUI and clear the executor's file list instead.")
    else
        status.setText("\226\154\160\239\184\143  Only " .. gone .. " of the 4 files could be removed - "
            .. "this executor may not allow deleting them.")
    end
end)
forgetBtn.Size = UDim2.new(0, 300, 0, 44)

-- IS THE WORKER THERE AT ALL?
--
-- "The card says it cannot reach the key server" and "the card says the KEY
-- is invalid" look the same from the outside, and only one of them is the
-- card's fault. This asks the worker for nothing - it just says hello - and
-- shows the answer, or what the last attempt said.
local testRow = createButtonRow(welcomeContent)
testRow.LayoutOrder = 9
local testBtn = createButton(testRow, "\240\159\147\186  TEST THE CONNECTION", C.text, C.panel2, function()
    status.setText("\240\159\147\166  Asking the key server...")
    local body = httpGet(API_URL .. "/sh/ping")
    if body then
        status.setText("\226\156\133  Server reached: " .. tostring(body):sub(1, 60))
    else
        status.setText("\226\157\140  No answer. Tried: " .. tostring(LAST_HTTP_ERROR):sub(1, 120))
    end
end)
testBtn.Size = UDim2.new(0, 300, 0, 44)

-- Destroy GUI button
createButton(welcomeContent, "\240\159\151\145\239\184\143  DESTROY GUI", C.dim, C.panel2, function()
    stopCountdown()
    screenGui:Destroy()
    _G.ScripterHub_UILoaded = nil
end, 10)

-- ============ BUILD LINKS TAB ============
createLabel(linksContent, "\240\159\147\139  GET YOUR KEY HERE", 16, C.text).LayoutOrder = 1
createParagraph(linksContent, "HOW IT WORKS", "1. Pick a provider below. 2. Finish the ad. 3. The key appears in your reward page. 4. Paste it in the Welcome tab.", 2)

for i, link in ipairs(AD_LINKS) do
    createButton(linksContent, link.text, Color3.fromRGB(255, 255, 255), link.color, function()
        setclipboard(link.url)
        status.setText("\240\159\147\139  Link copied - finish the checkpoint, then paste your key in the Welcome tab.")
    end, 10 + i)
end

createLabel(linksContent, "\240\159\147\177  SOCIAL LINKS", 16, C.text).LayoutOrder = 20

for i, link in ipairs(SOCIAL_LINKS) do
    createButton(linksContent, link.text, Color3.fromRGB(255, 255, 255), link.color, function()
        setclipboard(link.url)
        status.setText("\240\159\147\139  Link copied!")
    end, 20 + i)
end
