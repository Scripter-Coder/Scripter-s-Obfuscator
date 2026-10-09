--[[
    json_demo.lua  -  show what JSON encoding actually produces, in the console

    WHAT THIS IS FOR
    An executor may return nil from game:GetService("HttpService"), which makes the
    normal call die with:

        attempt to index nil with 'JSONEncode'

    This script reports whether that affects YOU, installs a fallback encoder if it
    does, then prints the encoded form of a spread of values so you can see the output
    rather than guess at it.

    HOW TO RUN
    Paste the whole file into your executor and run it. Output goes to the dev console.

    NOTE ON SCOPE
    It only fixes ENCODING. Web requests are deliberately not faked - if your script
    calls HttpService:RequestAsync on an executor with no HttpService, that still fails,
    which is honest rather than silently wrong.
]]

------------------------------------------------------------------ encoder (fallback)
local function esc(s)
    s = s:gsub("\\", "\\\\"):gsub('"', '\\"')
        :gsub("\b", "\\b"):gsub("\f", "\\f"):gsub("\n", "\\n")
        :gsub("\r", "\\r"):gsub("\t", "\\t")
    return (s:gsub("[%z\1-\31\127]", function(c)
        return string.format("\\u%04x", string.byte(c))
    end))
end

local function enc(v)
    local t = type(v)
    if t == "nil"    then return "null" end
    if t == "boolean" then return tostring(v) end
    if t == "number" then
        if v ~= v then return "null" end                        -- NaN
        if v == math.huge or v == -math.huge then return "null" end
        if v == math.floor(v) and math.abs(v) < 1e15 then
            return string.format("%d", v)
        end
        return string.format("%.14g", v)
    end
    if t == "string"  then return '"' .. esc(v) .. '"' end
    if t ~= "table"   then return "null" end

    local count, max = 0, 0
    for k in pairs(v) do
        count = count + 1
        if type(k) ~= "number" or k % 1 ~= 0 or k < 1 then max = -1 break end
        if k > max then max = k end
    end

    local out, n = {}, 0
    if max == count and count > 0 then                 -- array
        for i = 1, count do
            n = n + 1; out[n] = enc(v[i])
        end
        return "[" .. table.concat(out, ",") .. "]"
    end

    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for i = 1, #keys do
        out[i] = '"' .. esc(tostring(keys[i])) .. '":' .. enc(v[keys[i]])
    end
    return "{" .. table.concat(out, ",") .. "}"
end

------------------------------------------------------------------ environment check
local function p(...) print("[json] " .. table.concat({ ... }, " ")) end

p("=== JSON support on this executor ===")

local nativeOK, svc = pcall(function() return game:GetService("HttpService") end)
local hasNative = nativeOK and type(svc) == "table" and type(svc.JSONEncode) == "function"

p("game:GetService('HttpService') returned: " .. (nativeOK and type(svc) or "error"))
if hasNative then
    p("native JSONEncode: AVAILABLE (this script will use it, unchanged)")
else
    p("native JSONEncode: MISSING - this is the cause of")
    p("    'attempt to index nil with JSONEncode'")
    p("installing a fallback encoder...")
end

-- One encoder either way: the real service when it exists, the fallback when it does not.
local JSON = { encode = hasNative and function(v) return svc:JSONEncode(v) end or enc }

-- So the original failing call keeps working. You cannot attach a method to nil, so
-- GetService itself has to be wrapped, for this one name only.
if not hasNative then
    pcall(function()
        local realGet = game.GetService
        if type(realGet) == "function" then
            game.GetService = function(self, name)
                if name == "HttpService" then return { JSONEncode = function(_, v) return enc(v) end } end
                return realGet(self, name)
            end
        end
    end)
end

------------------------------------------------------------------ the outputs
p("")
p("=== encoded output ===")

local samples = {
    { "string",        "hello" },
    { "quote inside",  'say "hi"' },
    { "backslash",     "C:\\path\\to" },
    { "newline+tab",   "line1\nline2\tend" },
    { "control char",  "a" .. string.char(1) .. "b" },
    { "unicode",       "caf\195\169 \226\130\172" },
    { "whole number",  42 },
    { "negative",      -7 },
    { "float",         3.14159 },
    { "boolean true",  true },
    { "boolean false", false },
    { "empty string",  "" },
    { "empty table",   {} },
    { "flat object",   { name = "hub", id = 12345 } },
    { "array",         { 1, 2, 3 } },
    { "mixed array",   { "a", 2, true } },
    { "nested",        { user = { id = 1, tags = { "x", "y" } } } },
    { "array of obj",  { { a = 1 }, { a = 2 } } },
}

for _, s in ipairs(samples) do
    local label, value = s[1], s[2]
    local ok, out = pcall(function() return JSON.encode(value) end)
    if ok then
        print(string.format("[json] %-14s -> %s", label, out))
    else
        print(string.format("[json] %-14s -> ERROR: %s", label, tostring(out)))
    end
end

------------------------------------------------------------------ the reported shape
p("")
p("=== the exact call that was failing ===")
local ok, res = pcall(function()
    return game:GetService("HttpService"):JSONEncode({ scriptId = "ScripterHub123", ok = true })
end)
if ok then
    p("game:GetService('HttpService'):JSONEncode({...}) -> " .. res)
    p("RESULT: working")
else
    p("still failing: " .. tostring(res))
end

------------------------------------------------------------------ round trip check
p("")
p("=== sanity ===")
local okE, enc1 = pcall(function() return JSON.encode({ id = "abc", n = 3 }) end)
if okE then
    p("stable output (same input twice gives the same string): " ..
      tostring(enc1 == JSON.encode({ id = "abc", n = 3 })))
end
p("done")