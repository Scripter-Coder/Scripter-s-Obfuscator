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

local function writeFile(filename, data)
    if type(_WRITEFILE) ~= "function" then
        return false
    end
    local ok = pcall(function()
        _WRITEFILE(filename, tostring(data))
    end)
    return ok == true
end

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
local function deleteAll4Files()
    -- It says how many of them it actually removed. A "forget" button that
    -- silently does nothing is worse than no button at all: the visitor
    -- presses it, the key is still there next time, and nothing explains
    -- why.
    local gone = 0
    if deleteFile(KEY_FILE) then gone = gone + 1 end
    if deleteFile(HWID_FILE) then gone = gone + 1 end
    if deleteFile(EXPIRY_FILE) then gone = gone + 1 end
    if deleteFile(TIMESTAMP_FILE) then gone = gone + 1 end
    return gone
end

-- ============ TIME FORMATTING FUNCTION ============
local function formatTimeLeft(expiryTimestamp, hasKey)
    -- FOUR STATES, AND THE DIFFERENCE MATTERS:
    --
    --   NOKEY     there is no key at all. The counters show "-", NOT infinity.
    --              Infinity means "this key never expires", and showing it
    --              when there is no key at all is a lie - the card used to
    --              show "Days: inf" on a fresh install, which reads like a
    --              lifetime key that was already earned.
    --   LIFETIME  the key never expires. The counters show infinity, which is
    --              what infinity is for.
    --   ACTIVE    the key has time left.
    --   EXPIRED   the time is up.
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

-- ============ CREATE MAIN GUI ============
local screenGui = Instance.new("ScreenGui")
screenGui.Name = "ScripterHub"
screenGui.Parent = game.CoreGui
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

-- Main Frame (Big UI)
local mainFrame = Instance.new("Frame")
mainFrame.Parent = screenGui
mainFrame.BackgroundColor3 = Color3.fromRGB(20, 20, 25)
mainFrame.BorderSizePixel = 0
mainFrame.Position = UDim2.new(0.5, -350, 0.5, -250)
mainFrame.Size = UDim2.new(0, 700, 0, 550)
mainFrame.Active = true
mainFrame.Draggable = true

local mainCorner = Instance.new("UICorner")
mainCorner.CornerRadius = UDim.new(0, 12)
mainCorner.Parent = mainFrame

-- Title Bar
local titleBar = Instance.new("Frame")
titleBar.Parent = mainFrame
titleBar.BackgroundColor3 = Color3.fromRGB(30, 30, 35)
titleBar.BorderSizePixel = 0
titleBar.Size = UDim2.new(1, 0, 0, 50)

local titleCorner = Instance.new("UICorner")
titleCorner.CornerRadius = UDim.new(0, 12)
titleCorner.Parent = titleBar

local titleLabel = Instance.new("TextLabel")
titleLabel.Parent = titleBar
titleLabel.BackgroundTransparency = 1
titleLabel.Position = UDim2.new(0, 15, 0, 0)
titleLabel.Size = UDim2.new(0.8, 0, 1, 0)
titleLabel.Font = Enum.Font.GothamBold
titleLabel.Text = "SCRIPTER HUB"
titleLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
titleLabel.TextSize = 22
titleLabel.TextXAlignment = Enum.TextXAlignment.Left

-- Close Button
local closeBtn = Instance.new("TextButton")
closeBtn.Parent = titleBar
closeBtn.BackgroundColor3 = Color3.fromRGB(200, 60, 60)
closeBtn.BorderSizePixel = 0
closeBtn.Position = UDim2.new(1, -45, 0, 10)
closeBtn.Size = UDim2.new(0, 35, 0, 30)
closeBtn.Font = Enum.Font.GothamBold
closeBtn.Text = "\226\156\149"
closeBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
closeBtn.TextSize = 18

local closeCorner = Instance.new("UICorner")
closeCorner.CornerRadius = UDim.new(0, 6)
closeCorner.Parent = closeBtn

closeBtn.MouseButton1Click:Connect(function()
    stopCountdown()
    screenGui:Destroy()
    _G.ScripterHub_UILoaded = nil
end)

-- ============ TAB BUTTONS ============
local tabButtonsFrame = Instance.new("Frame")
tabButtonsFrame.Parent = mainFrame
tabButtonsFrame.BackgroundColor3 = Color3.fromRGB(25, 25, 30)
tabButtonsFrame.BorderSizePixel = 0
tabButtonsFrame.Position = UDim2.new(0, 0, 0, 50)
tabButtonsFrame.Size = UDim2.new(1, 0, 0, 45)

local welcomeTabBtn = Instance.new("TextButton")
welcomeTabBtn.Parent = tabButtonsFrame
welcomeTabBtn.BackgroundColor3 = Color3.fromRGB(40, 100, 200)
welcomeTabBtn.BorderSizePixel = 0
welcomeTabBtn.Position = UDim2.new(0, 10, 0, 5)
welcomeTabBtn.Size = UDim2.new(0, 120, 0, 35)
welcomeTabBtn.Font = Enum.Font.GothamBold
welcomeTabBtn.Text = "\240\159\143\160 Welcome"
welcomeTabBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
welcomeTabBtn.TextSize = 14

local welcomeCorner = Instance.new("UICorner")
welcomeCorner.CornerRadius = UDim.new(0, 6)
welcomeCorner.Parent = welcomeTabBtn

local linksTabBtn = Instance.new("TextButton")
linksTabBtn.Parent = tabButtonsFrame
linksTabBtn.BackgroundColor3 = Color3.fromRGB(35, 35, 40)
linksTabBtn.BorderSizePixel = 0
linksTabBtn.Position = UDim2.new(0, 140, 0, 5)
linksTabBtn.Size = UDim2.new(0, 120, 0, 35)
linksTabBtn.Font = Enum.Font.GothamBold
linksTabBtn.Text = "\240\159\148\151 Links"
linksTabBtn.TextColor3 = Color3.fromRGB(200, 200, 200)
linksTabBtn.TextSize = 14

local linksCorner = Instance.new("UICorner")
linksCorner.CornerRadius = UDim.new(0, 6)
linksCorner.Parent = linksTabBtn

-- ============ CONTENT CONTAINERS ============
local welcomeContent = Instance.new("ScrollingFrame")
welcomeContent.Parent = mainFrame
welcomeContent.BackgroundColor3 = Color3.fromRGB(20, 20, 25)
welcomeContent.BorderSizePixel = 0
welcomeContent.Position = UDim2.new(0, 10, 0, 105)
welcomeContent.Size = UDim2.new(1, -20, 1, -115)
welcomeContent.CanvasSize = UDim2.new(0, 0, 0, 0)
welcomeContent.ScrollBarThickness = 6
welcomeContent.Visible = true

local linksContent = Instance.new("ScrollingFrame")
linksContent.Parent = mainFrame
linksContent.BackgroundColor3 = Color3.fromRGB(20, 20, 25)
linksContent.BorderSizePixel = 0
linksContent.Position = UDim2.new(0, 10, 0, 105)
linksContent.Size = UDim2.new(1, -20, 1, -115)
linksContent.CanvasSize = UDim2.new(0, 0, 0, 0)
linksContent.ScrollBarThickness = 6
linksContent.Visible = false

local welcomeLayout = Instance.new("UIListLayout")
welcomeLayout.Parent = welcomeContent
welcomeLayout.SortOrder = Enum.SortOrder.LayoutOrder
welcomeLayout.Padding = UDim.new(0, 12)

local linksLayout = Instance.new("UIListLayout")
linksLayout.Parent = linksContent
linksLayout.SortOrder = Enum.SortOrder.LayoutOrder
linksLayout.Padding = UDim.new(0, 12)

local function updateCanvas(frame, layout)
    frame.CanvasSize = UDim2.new(0, 0, 0, layout.AbsoluteContentSize.Y + 20)
end

welcomeLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
    updateCanvas(welcomeContent, welcomeLayout)
end)

linksLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
    updateCanvas(linksContent, linksLayout)
end)

welcomeTabBtn.MouseButton1Click:Connect(function()
    welcomeContent.Visible = true
    linksContent.Visible = false
    welcomeTabBtn.BackgroundColor3 = Color3.fromRGB(40, 100, 200)
    welcomeTabBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    linksTabBtn.BackgroundColor3 = Color3.fromRGB(35, 35, 40)
    linksTabBtn.TextColor3 = Color3.fromRGB(200, 200, 200)
end)

linksTabBtn.MouseButton1Click:Connect(function()
    welcomeContent.Visible = false
    linksContent.Visible = true
    linksTabBtn.BackgroundColor3 = Color3.fromRGB(40, 100, 200)
    linksTabBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    welcomeTabBtn.BackgroundColor3 = Color3.fromRGB(35, 35, 40)
    welcomeTabBtn.TextColor3 = Color3.fromRGB(200, 200, 200)
end)

-- ============ HELPER FUNCTIONS ============
local function createLabel(parent, text, textSize, textColor)
    local label = Instance.new("TextLabel")
    label.Parent = parent
    label.BackgroundTransparency = 1
    label.Size = UDim2.new(1, -20, 0, 30)
    label.Font = Enum.Font.GothamBold
    label.Text = text
    label.TextColor3 = textColor or Color3.fromRGB(255, 255, 255)
    label.TextSize = textSize or 16
    label.TextXAlignment = Enum.TextXAlignment.Left
    return label
end

local function createCountdownTimer(parent)
    local frame = Instance.new("Frame")
    frame.Parent = parent
    frame.BackgroundColor3 = Color3.fromRGB(30, 30, 35)
    frame.BorderSizePixel = 0
    frame.Size = UDim2.new(1, -20, 0, 120)

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 8)
    corner.Parent = frame

    local titleLabel = Instance.new("TextLabel")
    titleLabel.Parent = frame
    titleLabel.BackgroundTransparency = 1
    titleLabel.Position = UDim2.new(0, 12, 0, 8)
    titleLabel.Size = UDim2.new(1, -24, 0, 25)
    titleLabel.Font = Enum.Font.GothamBold
    titleLabel.Text = "\226\143\176 TIME STATUS"
    titleLabel.TextColor3 = Color3.fromRGB(100, 200, 255)
    titleLabel.TextSize = 16
    titleLabel.TextXAlignment = Enum.TextXAlignment.Left

    local statusLabel = Instance.new("TextLabel")
    statusLabel.Parent = frame
    statusLabel.BackgroundTransparency = 1
    statusLabel.Position = UDim2.new(0, 12, 0, 35)
    statusLabel.Size = UDim2.new(1, -24, 0, 20)
    statusLabel.Font = Enum.Font.GothamBold
    statusLabel.Text = "Status: Checking..."
    statusLabel.TextColor3 = Color3.fromRGB(255, 200, 100)
    statusLabel.TextSize = 13
    statusLabel.TextXAlignment = Enum.TextXAlignment.Left

    local daysLabel = Instance.new("TextLabel")
    daysLabel.Parent = frame
    daysLabel.BackgroundTransparency = 1
    daysLabel.Position = UDim2.new(0, 12, 0, 58)
    daysLabel.Size = UDim2.new(0.5, -6, 0, 20)
    daysLabel.Font = Enum.Font.GothamBold
    daysLabel.Text = "Days: 0"
    daysLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    daysLabel.TextSize = 14
    daysLabel.TextXAlignment = Enum.TextXAlignment.Left

    local hoursLabel = Instance.new("TextLabel")
    hoursLabel.Parent = frame
    hoursLabel.BackgroundTransparency = 1
    hoursLabel.Position = UDim2.new(0.5, 6, 0, 58)
    hoursLabel.Size = UDim2.new(0.5, -6, 0, 20)
    hoursLabel.Font = Enum.Font.GothamBold
    hoursLabel.Text = "Hours: 0"
    hoursLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    hoursLabel.TextSize = 14
    hoursLabel.TextXAlignment = Enum.TextXAlignment.Left

    local minutesLabel = Instance.new("TextLabel")
    minutesLabel.Parent = frame
    minutesLabel.BackgroundTransparency = 1
    minutesLabel.Position = UDim2.new(0, 12, 0, 82)
    minutesLabel.Size = UDim2.new(0.5, -6, 0, 20)
    minutesLabel.Font = Enum.Font.GothamBold
    minutesLabel.Text = "Minutes: 0"
    minutesLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    minutesLabel.TextSize = 14
    minutesLabel.TextXAlignment = Enum.TextXAlignment.Left

    local secondsLabel = Instance.new("TextLabel")
    secondsLabel.Parent = frame
    secondsLabel.BackgroundTransparency = 1
    secondsLabel.Position = UDim2.new(0.5, 6, 0, 82)
    secondsLabel.Size = UDim2.new(0.5, -6, 0, 20)
    secondsLabel.Font = Enum.Font.GothamBold
    secondsLabel.Text = "Seconds: 0"
    secondsLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    secondsLabel.TextSize = 14
    secondsLabel.TextXAlignment = Enum.TextXAlignment.Left

    return {
        frame = frame,
        statusLabel = statusLabel,
        daysLabel = daysLabel,
        hoursLabel = hoursLabel,
        minutesLabel = minutesLabel,
        secondsLabel = secondsLabel
    }
end

local function updateCountdownDisplay(countdownElements, expiry, hasKey)
    local status, days, hours, minutes, seconds = formatTimeLeft(expiry, hasKey)

    if status == "NOKEY" then
        countdownElements.statusLabel.Text = "Status: No key on this device yet"
        countdownElements.statusLabel.TextColor3 = Color3.fromRGB(150, 150, 180)
        countdownElements.daysLabel.Text = "Days: -"
        countdownElements.hoursLabel.Text = "Hours: -"
        countdownElements.minutesLabel.Text = "Minutes: -"
        countdownElements.secondsLabel.Text = "Seconds: -"
    elseif status == "LIFETIME" then
        countdownElements.statusLabel.Text = "Status: \240\159\140\159 LIFETIME ACCESS (Never Expires)"
        countdownElements.statusLabel.TextColor3 = Color3.fromRGB(100, 255, 100)
        countdownElements.daysLabel.Text = "Days: \226\136\158"
        countdownElements.hoursLabel.Text = "Hours: \226\136\158"
        countdownElements.minutesLabel.Text = "Minutes: \226\136\158"
        countdownElements.secondsLabel.Text = "Seconds: \226\136\158"
    elseif status == "EXPIRED" then
        countdownElements.statusLabel.Text = "Status: \226\157\140 EXPIRED"
        countdownElements.statusLabel.TextColor3 = Color3.fromRGB(255, 100, 100)
        countdownElements.daysLabel.Text = "Days: 0"
        countdownElements.hoursLabel.Text = "Hours: 0"
        countdownElements.minutesLabel.Text = "Minutes: 0"
        countdownElements.secondsLabel.Text = "Seconds: 0"
    else
        countdownElements.statusLabel.Text = "Status: \226\156\133 ACTIVE"
        countdownElements.statusLabel.TextColor3 = Color3.fromRGB(100, 255, 100)
        countdownElements.daysLabel.Text = "Days: " .. days
        countdownElements.hoursLabel.Text = "Hours: " .. hours
        countdownElements.minutesLabel.Text = "Minutes: " .. minutes
        countdownElements.secondsLabel.Text = "Seconds: " .. seconds
    end
end

local function createParagraph(parent, title, content)
    local frame = Instance.new("Frame")
    frame.Parent = parent
    frame.BackgroundColor3 = Color3.fromRGB(30, 30, 35)
    frame.BorderSizePixel = 0
    frame.Size = UDim2.new(1, -20, 0, 70)

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 8)
    corner.Parent = frame

    local titleLabel = Instance.new("TextLabel")
    titleLabel.Parent = frame
    titleLabel.BackgroundTransparency = 1
    titleLabel.Position = UDim2.new(0, 12, 0, 8)
    titleLabel.Size = UDim2.new(1, -24, 0, 20)
    titleLabel.Font = Enum.Font.GothamBold
    titleLabel.Text = title
    titleLabel.TextColor3 = Color3.fromRGB(255, 200, 100)
    titleLabel.TextSize = 14
    titleLabel.TextXAlignment = Enum.TextXAlignment.Left

    local contentLabel = Instance.new("TextLabel")
    contentLabel.Parent = frame
    contentLabel.BackgroundTransparency = 1
    contentLabel.Position = UDim2.new(0, 12, 0, 30)
    contentLabel.Size = UDim2.new(1, -24, 0, 35)
    contentLabel.Font = Enum.Font.Gotham
    contentLabel.Text = content
    contentLabel.TextColor3 = Color3.fromRGB(180, 180, 180)
    contentLabel.TextSize = 12
    contentLabel.TextXAlignment = Enum.TextXAlignment.Left
    contentLabel.TextWrapped = true

    return frame
end

local function createButton(parent, text, textColor, bgColor, callback)
    local button = Instance.new("TextButton")
    button.Parent = parent
    button.BackgroundColor3 = bgColor or Color3.fromRGB(40, 100, 200)
    button.BorderSizePixel = 0
    button.Size = UDim2.new(1, -20, 0, 45)
    button.Font = Enum.Font.GothamBold
    button.Text = text
    button.TextColor3 = textColor or Color3.fromRGB(255, 255, 255)
    button.TextSize = 14

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 8)
    corner.Parent = button

    local originalColor = bgColor or Color3.fromRGB(40, 100, 200)
    local hoverColor = Color3.fromRGB(
        math.min(originalColor.R * 255 + 20, 255),
        math.min(originalColor.G * 255 + 20, 255),
        math.min(originalColor.B * 255 + 20, 255)
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

local function createTextboxWithButton(parent, placeholder, buttonText, callback)
    local frame = Instance.new("Frame")
    frame.Parent = parent
    frame.BackgroundColor3 = Color3.fromRGB(30, 30, 35)
    frame.BorderSizePixel = 0
    frame.Size = UDim2.new(1, -20, 0, 50)

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 8)
    corner.Parent = frame

    local textbox = Instance.new("TextBox")
    textbox.Parent = frame
    textbox.BackgroundColor3 = Color3.fromRGB(40, 40, 45)
    textbox.BorderSizePixel = 0
    textbox.Position = UDim2.new(0, 10, 0, 8)
    textbox.Size = UDim2.new(1, -85, 0, 34)
    textbox.Font = Enum.Font.Gotham
    textbox.PlaceholderText = placeholder
    textbox.Text = ""
    textbox.TextColor3 = Color3.fromRGB(255, 255, 255)
    textbox.TextSize = 14
    textbox.ClearTextOnFocus = false

    local textboxCorner = Instance.new("UICorner")
    textboxCorner.CornerRadius = UDim.new(0, 6)
    textboxCorner.Parent = textbox

    local submitBtn = Instance.new("TextButton")
    submitBtn.Parent = frame
    submitBtn.BackgroundColor3 = Color3.fromRGB(40, 100, 200)
    submitBtn.BorderSizePixel = 0
    submitBtn.Position = UDim2.new(1, -70, 0, 8)
    submitBtn.Size = UDim2.new(0, 60, 0, 34)
    submitBtn.Font = Enum.Font.GothamBold
    submitBtn.Text = buttonText or "Submit"
    submitBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    submitBtn.TextSize = 13

    local btnCorner = Instance.new("UICorner")
    btnCorner.CornerRadius = UDim.new(0, 6)
    btnCorner.Parent = submitBtn

    submitBtn.MouseEnter:Connect(function()
        submitBtn.BackgroundColor3 = Color3.fromRGB(60, 120, 220)
    end)
    submitBtn.MouseLeave:Connect(function()
        submitBtn.BackgroundColor3 = Color3.fromRGB(40, 100, 200)
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

local function createStatusLabel(parent, initialText)
    local frame = Instance.new("Frame")
    frame.Parent = parent
    frame.BackgroundColor3 = Color3.fromRGB(25, 25, 30)
    frame.BorderSizePixel = 0
    frame.Size = UDim2.new(1, -20, 0, 40)

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 8)
    corner.Parent = frame

    local label = Instance.new("TextLabel")
    label.Parent = frame
    label.BackgroundTransparency = 1
    label.Size = UDim2.new(1, 0, 1, 0)
    label.Font = Enum.Font.Gotham
    label.Text = initialText
    label.TextColor3 = Color3.fromRGB(255, 200, 100)
    label.TextSize = 13
    label.TextWrapped = true

    local function setText(newText)
        label.Text = newText
        if string.find(newText, "\226\156\133") then
            label.TextColor3 = Color3.fromRGB(100, 255, 100)
        elseif string.find(newText, "\226\157\140") or string.find(newText, "Expired") then
            label.TextColor3 = Color3.fromRGB(255, 100, 100)
        elseif string.find(newText, "\226\154\160\239\184\143") then
            label.TextColor3 = Color3.fromRGB(255, 200, 100)
        else
            label.TextColor3 = Color3.fromRGB(100, 200, 255)
        end
    end

    return { label = label, setText = setText }
end

-- ============ BUILD WELCOME TAB ============
createLabel(welcomeContent, "Hello " .. playerName .. "!", 18, Color3.fromRGB(100, 200, 255))

local countdownElements = createCountdownTimer(welcomeContent)
local status = createStatusLabel(welcomeContent, "\226\154\160\239\184\143 No key found | Enter your key below")

-- Update status based on saved key
if isWhitelisted then
    status.setText("\226\156\133 Whitelisted User! LIFETIME access granted")
    updateCountdownDisplay(countdownElements, nil, true)
elseif keyVerified then
    if keyExpiry and keyExpiry > 0 then
        if os.time() > keyExpiry then
            status.setText("\226\157\140 Key Expired! Get a new key from Links tab")
            updateCountdownDisplay(countdownElements, 0, true)
            keyVerified = false
        else
            updateCountdownDisplay(countdownElements, keyExpiry, true)
            local daysLeft = math.floor((keyExpiry - os.time()) / 86400)
            status.setText("\226\156\133 Key Active! " .. daysLeft .. " days remaining")
        end
    else
        updateCountdownDisplay(countdownElements, nil, true)
        status.setText("\226\156\133 Key Active! LIFETIME access granted")
    end
end

-- NO KEY? THEN THE COUNTERS SHOW "-", NOT INFINITY.
if not isWhitelisted and not keyVerified then
    updateCountdownDisplay(countdownElements, nil, false)
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
                status.setText("\226\157\140 Key Expired! Get a new key from Links tab")
                updateCountdownDisplay(countdownElements, 0, true)
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
local keyInput = createTextboxWithButton(welcomeContent, "Enter your key here...", "\226\156\147 Verify", function(value)
    if keyVerified then
        status.setText("\226\156\133 Already verified! You can load scripts.")
        return
    end

    if not value or value == "" then
        status.setText("\226\157\140 Key cannot be blank!")
        return
    end

    status.setText("\240\159\148\132 Validating key with the server...")

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
            status.setText("\226\156\133 Key Active! " .. daysLeft .. " days remaining")
        else
            updateCountdownDisplay(countdownElements, nil, true)
            status.setText("\226\156\133 Key Active! LIFETIME access granted")
        end
    else
        if validation.code == "EXPIRED" then
            status.setText("\226\157\140 Key Expired! Get a new key from Links tab")
            updateCountdownDisplay(countdownElements, 0, true)
        elseif validation.code == "HWID" then
            status.setText("\240\159\148\146 HWID Locked! This key is on another machine.")
        elseif validation.code == "BANNED" then
            status.setText("\240\159\154\171 Key Blacklisted!")
        elseif validation.code == "INVALID" then
            status.setText("\226\157\140 Invalid Key! Get a valid key from Links tab")
        else
            status.setText("\226\154\160\239\184\143 " .. tostring(validation.message or "Unknown error. Contact @scripter_0"))
        end
    end
end)

-- Pre-fill textbox if key exists
if keyVerified and not isWhitelisted then
    local savedKeyFile = readFile(KEY_FILE)
    if savedKeyFile and keyInput and keyInput.textbox then
        keyInput.textbox.Text = savedKeyFile
    end
end

createParagraph(welcomeContent, "\240\159\146\142 LIFETIME KEY OFFER", "If you want to have a key for Lifetime access, you can pay $20 for it. In order to buy, DM me on Discord: @scripter_0")

-- ============ DROPDOWN ============
local dropdownFrame = Instance.new("Frame")
dropdownFrame.Parent = welcomeContent
dropdownFrame.BackgroundColor3 = Color3.fromRGB(30, 30, 35)
dropdownFrame.BorderSizePixel = 0
dropdownFrame.Size = UDim2.new(1, -20, 0, 50)
dropdownFrame.ClipsDescendants = true

local dropdownCorner = Instance.new("UICorner")
dropdownCorner.CornerRadius = UDim.new(0, 8)
dropdownCorner.Parent = dropdownFrame

local selectedBtn = Instance.new("TextButton")
selectedBtn.Parent = dropdownFrame
selectedBtn.BackgroundColor3 = Color3.fromRGB(40, 40, 45)
selectedBtn.BorderSizePixel = 0
selectedBtn.Position = UDim2.new(0, 10, 0, 8)
selectedBtn.Size = UDim2.new(1, -20, 0, 34)
selectedBtn.Font = Enum.Font.GothamBold
selectedBtn.Text = "\240\159\142\174 Slap Battles"
selectedBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
selectedBtn.TextSize = 14
selectedBtn.TextXAlignment = Enum.TextXAlignment.Left

local selectedCorner = Instance.new("UICorner")
selectedCorner.CornerRadius = UDim.new(0, 6)
selectedCorner.Parent = selectedBtn

local arrowLabel = Instance.new("TextLabel")
arrowLabel.Parent = selectedBtn
arrowLabel.BackgroundTransparency = 1
arrowLabel.Position = UDim2.new(1, -30, 0, 0)
arrowLabel.Size = UDim2.new(0, 25, 1, 0)
arrowLabel.Font = Enum.Font.GothamBold
arrowLabel.Text = "\226\150\188"
arrowLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
arrowLabel.TextSize = 16
arrowLabel.TextXAlignment = Enum.TextXAlignment.Center

local dropdownItemsFrame = Instance.new("Frame")
dropdownItemsFrame.Parent = dropdownFrame
dropdownItemsFrame.BackgroundColor3 = Color3.fromRGB(35, 35, 40)
dropdownItemsFrame.BorderSizePixel = 0
dropdownItemsFrame.Position = UDim2.new(0, 10, 0, 45)
dropdownItemsFrame.Size = UDim2.new(1, -20, 0, 0)
dropdownItemsFrame.Visible = false
dropdownItemsFrame.ClipsDescendants = true

local dropdownItemsCorner = Instance.new("UICorner")
dropdownItemsCorner.CornerRadius = UDim.new(0, 6)
dropdownItemsCorner.Parent = dropdownItemsFrame

local dropdownItemsLayout = Instance.new("UIListLayout")
dropdownItemsLayout.Parent = dropdownItemsFrame
dropdownItemsLayout.SortOrder = Enum.SortOrder.LayoutOrder
dropdownItemsLayout.Padding = UDim.new(0, 2)

-- ============ SCRIPT BUTTONS CONTAINER ============
local scriptButtonsContainer = Instance.new("Frame")
scriptButtonsContainer.Parent = welcomeContent
scriptButtonsContainer.BackgroundTransparency = 1
scriptButtonsContainer.Size = UDim2.new(1, 0, 0, 55)

local scriptButtonsLayout = Instance.new("UIListLayout")
scriptButtonsLayout.Parent = scriptButtonsContainer
scriptButtonsLayout.FillDirection = Enum.FillDirection.Horizontal
scriptButtonsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
scriptButtonsLayout.VerticalAlignment = Enum.VerticalAlignment.Center
scriptButtonsLayout.Padding = UDim.new(0, 15)

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
        btn.Size = UDim2.new(0, 250, 0, 45)
        btn.Font = Enum.Font.GothamBold
        btn.Text = "\240\159\154\128 LOAD " .. script.name
        btn.TextColor3 = Color3.fromRGB(255, 255, 255)
        btn.TextSize = 14

        local corner = Instance.new("UICorner")
        corner.CornerRadius = UDim.new(0, 8)
        corner.Parent = btn

        local originalColor = script.color
        local hoverColor = Color3.fromRGB(
            math.min(originalColor.R * 255 + 20, 255),
            math.min(originalColor.G * 255 + 20, 255),
            math.min(originalColor.B * 255 + 20, 255)
        )

        btn.MouseEnter:Connect(function()
            btn.BackgroundColor3 = hoverColor
        end)

        btn.MouseLeave:Connect(function()
            btn.BackgroundColor3 = originalColor
        end)

        btn.MouseButton1Click:Connect(function()
            if not keyVerified and not isWhitelisted then
                status.setText("\226\157\140 Please enter a valid key first!")
                return
            end
            if keyExpiry and keyExpiry > 0 and os.time() > keyExpiry then
                status.setText("\226\157\140 Your key has expired! Get a new key from Links tab")
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
    optBtn.BackgroundColor3 = Color3.fromRGB(45, 45, 50)
    optBtn.BorderSizePixel = 0
    optBtn.Size = UDim2.new(1, 0, 0, 32)
    optBtn.Font = Enum.Font.Gotham
    optBtn.Text = "\240\159\142\174 " .. option
    optBtn.TextColor3 = Color3.fromRGB(220, 220, 220)
    optBtn.TextSize = 13
    optBtn.TextXAlignment = Enum.TextXAlignment.Left

    local optCorner = Instance.new("UICorner")
    optCorner.CornerRadius = UDim.new(0, 4)
    optCorner.Parent = optBtn

    optBtn.MouseEnter:Connect(function()
        optBtn.BackgroundColor3 = Color3.fromRGB(55, 55, 60)
    end)
    optBtn.MouseLeave:Connect(function()
        optBtn.BackgroundColor3 = Color3.fromRGB(45, 45, 50)
    end)

    optBtn.MouseButton1Click:Connect(function()
        selectedBtn.Text = "\240\159\142\174 " .. option
        currentGame = option
        dropdownVisible = false
        dropdownItemsFrame.Visible = false
        arrowLabel.Text = "\226\150\188"
        dropdownFrame.Size = UDim2.new(1, -20, 0, 50)
        status.setText("\240\159\142\174 Selected: " .. option)
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

-- Clear the saved key. It does not revoke the key - the server still has it -
-- it only forgets it on this machine.
createButton(welcomeContent, "\240\159\148\147 FORGET THE SAVED KEY", Color3.fromRGB(255, 255, 255), Color3.fromRGB(90, 90, 130), function()
    local gone = deleteAll4Files()
    keyVerified = false
    keyExpiry = nil
    actualExpiry = nil
    stopCountdown()
    updateCountdownDisplay(countdownElements, nil, false)
    if gone == 4 then
        status.setText("\240\159\148\147 The saved key was forgotten. Enter it again to load scripts.")
    elseif gone == 0 then
        status.setText("\226\154\160\239\184\143 This executor cannot delete files, so the key will still be here next time. Use DESTROY GUI and clear the executor's file list instead.")
    else
        status.setText("\226\154\160\239\184\143 Only " .. gone .. " of the 4 files could be removed - this executor may not allow deleting them.")
    end
end)

-- IS THE WORKER THERE AT ALL?
--
-- "The card says it cannot reach the key server" and "the card says the KEY
-- is invalid" look the same from the outside, and only one of them is the
-- card's fault. This asks the worker for nothing - it just says hello - and
-- shows the answer, or what the last attempt said.
createButton(welcomeContent, "\240\159\147\186 TEST THE CONNECTION", Color3.fromRGB(255, 255, 255), Color3.fromRGB(60, 60, 90), function()
    status.setText("\240\159\147\166 Asking the key server...")
    local body = httpGet(API_URL .. "/sh/ping")
    if body then
        status.setText("\226\156\133 Server reached: " .. tostring(body):sub(1, 60))
    else
        status.setText("\226\157\140 No answer. Tried: " .. tostring(LAST_HTTP_ERROR):sub(1, 120))
    end
end)

-- Destroy GUI button
createButton(welcomeContent, "\240\159\151\145\239\184\143 DESTROY GUI", Color3.fromRGB(255, 255, 255), Color3.fromRGB(100, 100, 100), function()
    stopCountdown()
    screenGui:Destroy()
    _G.ScripterHub_UILoaded = nil
end)

-- ============ BUILD LINKS TAB ============
createLabel(linksContent, "\240\159\147\139 GET YOUR KEY HERE", 16, Color3.fromRGB(100, 200, 255))

for _, link in ipairs(AD_LINKS) do
    createButton(linksContent, link.text, Color3.fromRGB(255, 255, 255), link.color, function()
        setclipboard(link.url)
        status.setText("\240\159\147\139 Link copied! Finish the checkpoint, then paste your key in the Welcome tab.")
    end)
end

local spacer = Instance.new("Frame")
spacer.Parent = linksContent
spacer.BackgroundTransparency = 1
spacer.Size = UDim2.new(1, 0, 0, 10)

createLabel(linksContent, "\240\159\147\177 SOCIAL LINKS", 16, Color3.fromRGB(100, 200, 255))

for _, link in ipairs(SOCIAL_LINKS) do
    createButton(linksContent, link.text, Color3.fromRGB(255, 255, 255), link.color, function()
        setclipboard(link.url)
        status.setText("\240\159\147\139 Link copied!")
    end)
end
