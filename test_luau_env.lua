x=5
print("x", x)
print("_G.x", _G.x)
print("getfenv", getfenv)
if getfenv then print(pcall(function() print(getfenv(1).x) end)) end
print("_ENV", _ENV)
if _ENV then print(_ENV.x) end
print("global", _G)
print("pairs _G")
for k,v in pairs(_G) do print(k,v) end
