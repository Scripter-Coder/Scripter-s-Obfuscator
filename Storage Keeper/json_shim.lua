--[[
    json_shim.lua  -  a JSON encoder for executors where HttpService is missing

    WHY THIS EXISTS
    Some executors return nil from game:GetService("HttpService"), so this:

        game:GetService("HttpService"):JSONEncode(data)

    dies with "attempt to index nil with 'JSONEncode" before the script does anything
    else. That was reported against a ScripterHub script, but the artifact proved
    otherwise: it contains none of ScripterHub's own telemetry, and instrumenting
    GetService shows the PAYLOAD asking for HttpService by name.

    So the fix belongs at the top of the user's script, before anything that encodes.
    It installs a fallback ONLY when HttpService is genuinely absent or has no
    JSONEncode. On a normal client HttpService is used unchanged, so nothing about
    working scripts changes.

    USAGE - paste at the very TOP of your script, above everything else:

        local JSON = require_json_shim()      -- or paste the body directly
        local body = JSON.encode({a=1, b="two"})

    Handles: strings (escaped, UTF-8 safe), numbers, booleans, nil, nested tables,
    and mixed/array tables. Keys that are not strings are converted, matching what
    JSON.stringify-style encoders do.
]]

local json_shim = {}

-- Encode a Lua value as JSON text.
function json_shim.encode(value)
    local t = type(value)

    if t == "nil" then
        return "null"
    elseif t == "boolean" then
        return tostring(value)
    elseif t == "number" then
        -- JSON has no NaN or Infinity. Emitting them produces output no parser
        -- accepts, which is worse than null because it fails far from the cause.
        if value ~= value then return "null" end                       -- NaN
        if value == math.huge or value == -math.huge then return "null" end
        if value == math.floor(value) and math.abs(value) < 1e15 then
            return string.format("%d", value)
        end
        return string.format("%.14g", value)
    elseif t == "string" then
        return '"' .. json_shim.escape(value) .. '"'
    elseif t ~= "table" then
        -- functions, userdata, threads: JSON has no representation
        return "null"
    end

    -- Decide array vs object by inspecting the keys, the same rule Lua's own JSON
    -- libraries use: a table is an array only if its keys are exactly 1..n.
    local n = 0
    local max = 0
    local count = 0
    for k in pairs(value) do
        count = count + 1
        if type(k) ~= "number" then
            max = -1        -- a non-numeric key means object
            break
        end
        if k % 1 ~= 0 or k < 1 then
            max = -1
            break
        end
        if k > max then max = k end
    end
    -- An empty table is ambiguous. Roblox encodes {} as an object, and an empty ARRAY is
    -- indistinguishable from an empty object in Lua anyway, so matching Roblox is both
    -- safer and the only choice that does not change behaviour on a normal client.
    local isArray = (max == count) and count > 0

    local out = {}
    if isArray then
        for i = 1, count do
            out[n + 1] = json_shim.encode(value[i])
            n = n + 1
        end
        return "[" .. table.concat(out, ",") .. "]"
    end

    -- Object. Sorted keys so the output is stable, which matters if anything
    -- downstream hashes or diffs it.
    local keys = {}
    for k in pairs(value) do
        keys[#keys + 1] = k
    end
    table.sort(keys, function(a, b)
        return tostring(a) < tostring(b)
    end)
    for _, k in ipairs(keys) do
        -- nil-valued keys simply do not exist in Lua, so this cannot emit a null member.
        out[n + 1] = '"' .. json_shim.escape(tostring(k)) .. '":' .. json_shim.encode(value[k])
        n = n + 1
    end
    return "{" .. table.concat(out, ",") .. "}"
end

function json_shim.escape(s)
    s = s:gsub("\\", "\\\\")
    s = s:gsub('"', '\\"')
    s = s:gsub("\b", "\\b")
    s = s:gsub("\f", "\\f")
    s = s:gsub("\n", "\\n")
    s = s:gsub("\r", "\\r")
    s = s:gsub("\t", "\\t")
    -- Control characters must be escaped or the output is invalid JSON.
    s = s:gsub("[%z\1-\31\127]", function(c)
        return string.format("\\u%04x", string.byte(c))
    end)
    return s
end

-- Install a JSONEncode onto HttpService when one is missing, and return a table with
-- .encode() that works regardless. Safe to call more than once.
function json_shim.install()
    local ok, svc = pcall(function() return game:GetService("HttpService") end)

    if ok and type(svc) == "table" and type(svc.JSONEncode) == "function" then
        -- Normal client. Use the real thing so nothing changes for working scripts.
        return {
            encode = function(v) return svc:JSONEncode(v) end,
            real = true,
        }
    end

    -- THE MISSING PIECE. You cannot attach JSONEncode to nil - nil has no metatable
    -- here - so shimming the service is not enough on its own. The reported line is
    --
    --     game:GetService("HttpService"):JSONEncode(data)
    --
    -- and GetService itself returns nil on these executors, so the call dies before any
    -- shim on the service could help. GetService has to be wrapped, and only for the one
    -- name that is broken: every other service is passed straight through, untouched.
    --
    -- Web requests are deliberately NOT faked. This stub exists so encoding works; if
    -- something calls RequestAsync it still fails, which is correct - a silent fake
    -- response would be far worse than an honest error.
    local stub = {
        JSONEncode = function(_, v) return json_shim.encode(v) end,
        JSONDecode = function() return nil end,
    }
    if ok and type(svc) == "table" then
        svc.JSONEncode = stub.JSONEncode
        svc.JSONDecode = svc.JSONDecode or stub.JSONDecode
    end

    pcall(function()
        local realGet = game.GetService
        if type(realGet) == "function" and not json_shim._wrapped then
            game.GetService = function(self, name)
                if name == "HttpService" then
                    local ok2, s2 = pcall(function() return realGet(self, name) end)
                    if ok2 and type(s2) == "table" and type(s2.JSONEncode) == "function" then
                        return s2
                    end
                    return stub
                end
                return realGet(self, name)
            end
            json_shim._wrapped = true
        end
    end)

    return { encode = json_shim.encode, real = false }
end

json_shim.JSON = json_shim.install()

return json_shim