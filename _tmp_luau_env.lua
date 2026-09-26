print(getfenv)
print(getfenv())
local env=getfenv(0)
for k,v in pairs(env) do print(k,type(v)) end
