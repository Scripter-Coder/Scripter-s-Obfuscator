local realG = _G
_G = {}
setmetatable(_G, {__index=realG, __newindex=realG})
-- Now try to write to _G
print(pcall(function() _G.test=1 end))
print(_G.test)
-- Now define getgenv
_G.getgenv = function() return _G end
print("getgenv", getgenv)
