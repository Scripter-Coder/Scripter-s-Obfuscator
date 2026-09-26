local env=getfenv(0)
for k,v in pairs(env) do print(k) end
print("---")
print("print in env:", env.print)
x=123
print("x via env:", env.x, x)
print("getfenv(1).x", getfenv(1).x)
