-- A Roblox-shaped stub, shared by tools/gui_build_test.mjs and tools/vm_bisect.mjs.
--
-- It exists so a real script can be RUN and its final GUI tree inspected, rather
-- than eyeballed as text. Two details matter:
--
--   * every property is left ABSENT (assigned nil) so __newindex fires, which is
--     what makes `obj.Visible = true` observable at all;
--   * `Parent` records the child in the parent's _kids, so the tree can be walked.
readfile = function(p) return nil end
isfile = function(p) return false end
Enum = setmetatable({}, {__index = function(t,k) return setmetatable({}, {__index = function(t2,k2) return {__e=k.."."..k2} end}) end})
UDim2 = { new = function(a,b,c,d) return {X={Scale=a,Offset=b}, Y={Scale=c,Offset=d}} end }
UDim  = { new = function(s,o) return {Scale=s, Offset=o} end }
Color3 = { fromRGB = function(r,g,b) return {R=r,G=g,B=b} end }
-- Signals are created on demand. A fixed allow-list of five event names meant any
-- other event - MouseEnter, Heartbeat, Changed, GetPropertyChangedSignal - came back
-- nil, and the resulting "attempt to index a nil value" was indistinguishable from a
-- real defect in the code under test. Anything not in this set still answers nil, so
-- a genuinely missing member is still a nil and not a silent fake.
local EVENTS = {
  MouseEnter=1, MouseLeave=1, MouseMoved=1, MouseButton1Down=1, MouseButton1Up=1, MouseButton1Click=1,
  MouseButton2Down=1, MouseButton2Up=1, MouseButton2Click=1,
  InputBegan=1, InputEnded=1, InputChanged=1, Touched=1,
  Changed=1, Completed=1, Activated=1, Deactivated=1, DragEnter=1, DragLeave=1, DragOver=1,
  FocusLost=1, Focused=1, SelectionGained=1, SelectionLost=1, SelectionChanged=1,
  Heartbeat=1, RenderStepped=1, Stepped=1, PreSimulation=1, PostSimulation=1,
  ChildAdded=1, ChildRemoved=1, DescendantAdded=1, DescendantRemoving=1, AncestryChanged=1,
  NameChanged=1, PropertyChanged=1, BackpackChanged=1, CharacterAdded=1, CharacterRemoving=1,
  PlayerAdded=1, PlayerRemoving=1, Idled=1, WindowFocusReleased=1, WindowTitleChanged=1,
  ButtonsPressed=1, PressingBack=1, Modal=1, MenuOpened=1, MenuClosed=1,
  GetPropertyChangedSignal=1, WaitForChild=1, ServiceUnavailable=1, LoadingFinished=1,
  OnServerEvent=1, OnClientEvent=1, ServerEvent=1, ClientEvent=1, InvokeClient=1,
}
local function mkSignal(o, name)
  o[name] = { Conn = {} }
  o[name].Connect = function(self, f) table.insert(self.Conn, f); return {Disconnect=function() end} end
  o[name].Once = o[name].Connect
  o[name].Fire = function(self, ...) for _,f in ipairs(self.Conn) do pcall(f, ...) end end
  o[name].Wait = function() end
end
local PROPS = {"Name","Size","Position","BackgroundColor3","BackgroundTransparency","ZIndex","Visible",
  "Text","TextColor3","TextSize","TextWrapped","TextTransparency","AnchorPoint","ClipsDescendants",
  "Active","CornerRadius","Thickness","Color","Font","ResetOnSpawn","IgnoreGuiInset"}
local function newInst(class)
  local o = setmetatable({ClassName = class, _kids = {}},
    {__index = function(t, k)
       local v = rawget(t, k)
       if v ~= nil then return v end
       if EVENTS[k] then mkSignal(t, k); return rawget(t, k) end
       -- GetPropertyChangedSignal is callable in Roblox, not a plain table
       if k == "GetPropertyChangedSignal" then
         local fn = function() return { Connect = function() return { Disconnect = function() end } end } end
         rawset(t, k, fn)
         return fn
       end
       return nil
     end,
     __newindex = function(t, k, v)
       if k == "Parent" then
         rawset(t, "Parent", v)
        if v then v._kids = v._kids or {}; table.insert(v._kids, t) end
       else rawset(t, k, v) end
     end})
  for _, p in ipairs(PROPS) do o[p] = nil end
  function o:Destroy() self.Parent = nil end
  function o:FindFirstChild(n) for _,c in ipairs(self._kids) do if c.Name == n then return c end end return nil end
  function o:GetChildren() return self._kids end
  function o:WaitForChild(n) return self:FindFirstChild(n) end
  for _, s in ipairs({"MouseButton1Click","InputBegan","InputChanged"}) do if not rawget(o, s) then mkSignal(o, s) end end
  return o
end
-- Instance.new's SECOND argument is the parent. Dropping it made every
-- `Instance.new("UICorner", someFrame)` build an orphan, so those objects were absent
-- from the tree in the baseline as well as the obfuscated run - the comparison still
-- worked, but the tree was quietly wrong in a way that would have hidden a real
-- difference in exactly the construct now under investigation.
Instance = { new = function(c, parent)
  local inst = newInst(c)
  if parent then inst.Parent = parent end
  return inst
end }
local pg = newInst("PlayerGui")
pg.Name = "PlayerGui"
local lp = newInst("PlayerGui")
lp.Name = "Probe"
lp._kids = { pg }
pg.Parent = lp
local players = newInst("PlayersService")
players.LocalPlayer = lp
local tween = newInst("TweenService")
function tween:Create(o, i, p)
  local t = { props = p, info = i }
  mkSignal(t, "Completed")
  function t:Play() if self.Completed then self.Completed:Fire("Completed") end end
  return t
end
local services = { Players = players, TweenService = tween }
services.ReplicatedStorage = newInst("ReplicatedStorage")
services.Workspace = newInst("Workspace")
services.UserInputService = newInst("UserInputService")
services.RunService = newInst("RunService")
services.HttpService = newInst("HttpService")
services.Debris = newInst("Debris")
services.CollectionService = newInst("CollectionService")
services.GuiService = newInst("GuiService")
services.TextService = newInst("TextService")
services.Lighting = newInst("Lighting")
services.MarketplaceService = newInst("MarketplaceService")
services.ContextActionService = newInst("ContextActionService")
services.SoundService = newInst("SoundService")
services.Team = newInst("Team")
game = newInst("Game")
function game:GetService(n) return services[n] or newInst("Service") end

-- Roblox exposes every service as a GLOBAL as well as through GetService, and real
-- scripts use the bare form (`TweenService:Create(...)`) constantly. A stub that
-- only defines them for GetService makes those lines fail under BOTH plain Lua and
-- the VM, so a harness gap looks exactly like a code defect. An earlier run of this
-- bisect reported "the VM breaks on a tween inside task.spawn" purely because
-- `TweenService` was undefined here.
TweenService = services.TweenService
RunService = services.RunService
UserInputService = services.UserInputService
HttpService = services.HttpService
Debris = services.Debris
CollectionService = services.CollectionService
GuiService = services.GuiService
TextService = services.TextService
Lighting = services.Lighting
MarketplaceService = services.MarketplaceService
ContextActionService = services.ContextActionService
SoundService = services.SoundService
Players = services.Players
Workspace = services.Workspace
ReplicatedStorage = services.ReplicatedStorage
TweenInfo = { new = function(...) return { __tweeninfo = true, args = { ... } } end }
NumberSequence = { new = function(...) return { __numseq = true } end }
ColorSequence = { new = function(...) return { __colseq = true } end }
Random = { new = function() return { NextInteger = function() return 1 end, NextNumber = function() return 0 end } end }
Vector2 = { new = function(x, y) return { X = x, Y = y } end, zero = { X = 0, Y = 0 } }
Vector3 = { new = function(x, y, z) return { X = x, Y = y, Z = z } end, zero = { X = 0, Y = 0, Z = 0 } }
CFrame = { new = function(x, y, z) return { X = x or 0, Y = y or 0, Z = z or 0 } end }
Ray = { new = function() return {} end }
Region3 = { new = function() return {} end }
BrickColor = { new = function() return {} end }
PhysicalProperties = { new = function() return {} end }

-- Record every global the script READS that the stub does not define, instead of
-- silently answering nil. A missing global is the single most common way a stub
-- manufactures a convincing false failure, and it is invisible unless the harness
-- says so out loud.
MISSING = {}
setmetatable(_G, { __index = function(t, k)
  if type(k) == "string" then MISSING[k] = (MISSING[k] or 0) + 1 end
  return nil
end })
function MISSINGNAMES() local o = {} for k in pairs(MISSING) do o[#o + 1] = k end table.sort(o) return table.concat(o, " ") end
function MISSINGCOUNT() local n = 0 for _ in pairs(MISSING) do n = n + 1 end return n end
function RESETMISSING() MISSING = {} end

getgenv = function() return _G end
PENDING = {}
-- game:HttpGet. Real scripts use it at the very top to pull a second stage, and a stub
-- without it fails on line 2 - which means a script used as a CONTROL never runs, and
-- every comparison against it is meaningless. The Clone Kingdom Tycoon script does
-- exactly this, and it is the script that works on the executor.
-- loadstring, as an executor provides it. A script that pulls a second stage with
-- `loadstring(game:HttpGet(...))()` cannot even be READ by a stub that lacks it, so the
-- Clone Kingdom Tycoon script - the one that works on the executor, and therefore the
-- only control this investigation has - could not run at all.
-- `load` here is the real Lua loader, captured before this line rebinds loadstring.
local _real_load = load
loadstring = function(src, chunkname)
  if type(src) ~= "string" then return nil, "bad argument #1 to 'loadstring' (string expected)" end
  return _real_load(src, chunkname and (chunkname:gsub("^[=@]", "") or chunkname) or "stage2")
end
game.HttpGet = function(self, url, binary)
  if type(self) ~= "table" and self ~= game then
    -- called as game:HttpGet(url) -> self is game
  end
  return ""
end
HttpService = services.HttpService
function services.HttpService:GenerateGUID(w) return "00000000-0000-0000-0000-000000000000" end
function services.HttpService:Get(t) return { StatusCode = 200, Body = "{}", Headers = {} } end
function services.HttpService:PostAsync(t) return { Success = true, StatusCode = 200, Body = "{}" } end
function services.HttpService:RequestAsync(t) return { Success = true, StatusCode = 200, Body = "{}" } end
function services.HttpService:JSONEncode(t) return "{}" end
function services.HttpService:JSONDecode(t) return {} end

task = {}
task.wait = function() coroutine.yield() end
-- A failing coroutine is RECORDED, not swallowed. `coroutine.resume` returns false
-- plus a message, and discarding it makes a script that dies on its very first line
-- inside task.spawn look exactly like a script that ran to completion. That is not
-- hypothetical: the delta-debugger minimised a case down to code that referenced five
-- undefined globals, and the "plain" run happily reported success for it.
SPAWN_ERRORS = {}
local function step(co)
  local ok, err = coroutine.resume(co)
  -- Resuming a coroutine that has already run to completion is normal, not a fault.
  -- Recording it made every PUMP after the first look like a crashed script.
  if not ok and not (type(err) == "string" and err:find("cannot resume dead coroutine", 1, true)) then
    SPAWN_ERRORS[#SPAWN_ERRORS + 1] = tostring(err)
  end
  return ok
end
-- Arguments are FORWARDED, as Roblox does. The previous stub took only `f` and
-- dropped the rest, so task.spawn(fn, arg) was never actually tested here.
--
-- The unpack helper is selected with an if, not `table.unpack and ... or ...`:
-- table.unpack(t, 1, 0) returns NO values, so the `or` branch is taken, and `unpack`
-- does not exist in 5.3. Every zero-argument spawn then died with "attempt to call a
-- nil value" - which reads as a VM failure in any test that only checks the outcome.
local _unpack = table.unpack or unpack
task.spawn = function(f, ...)
  local a = table.pack and table.pack(...) or { n = select("#", ...), ... }
  local co = coroutine.create(function() return f(_unpack(a, 1, a.n)) end)
  PENDING[#PENDING + 1] = co
  step(co)
end
task.defer = task.spawn
function PUMP(n) for _, co in ipairs(PENDING) do for _ = 1, n do step(co) end end end
function SPAWNERRORS() return table.concat(SPAWN_ERRORS, " || ") end
function COUNT()
  local n = 0
  local function walk(o) for _,c in ipairs(o._kids or {}) do n = n + 1; walk(c) end end
  walk(pg)
  return n
end
function PANELVIS()
  local function walk(o)
    for _,c in ipairs(o._kids or {}) do
      if c.ClassName == "Frame" and c.Size and c.Size.X and c.Size.X.Offset == 360 then return tostring(c.Visible) end
      local v = walk(c)
      if v then return v end
    end
    return nil
  end
  return walk(pg) or "MISSING"
end
-- Every GuiObject that is Visible, as "Name:ClassName" lines. This is the shape of
-- the reported bug: the ScreenGui existed and NOTHING inside it did, which shows up
-- here as a ScreenGui with no children rather than as an error.
function VISIBLES()
  local o = {}
  local function walk(inst, depth)
    if inst.Visible == true and inst.ClassName ~= "PlayerGui" then
      o[#o + 1] = string.rep("  ", depth) .. tostring(inst.Name) .. ":" .. tostring(inst.ClassName)
    end
    for _,c in ipairs(inst._kids or {}) do walk(c, depth + 1) end
  end
  walk(pg, 0)
  table.sort(o)
  return table.concat(o, " | ")
end
-- The FULL tree, in creation order, one node per line. Counts alone cannot say WHERE
-- a run stopped, and "where it stopped" is the whole question when a build produces
-- 6 of 41 objects.
function TREE()
  local o = {}
  local function walk(inst, path)
    local here = path .. "/" .. tostring(inst.Name or "?") .. ":" .. tostring(inst.ClassName)
    o[#o + 1] = here .. " Visible=" .. tostring(inst.Visible)
    for _,c in ipairs(inst._kids or {}) do walk(c, here) end
  end
  walk(pg, "PG")
  return table.concat(o, "\n")
end
