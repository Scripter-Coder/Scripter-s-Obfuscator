print(_G)
print(type(_G))
if _G then for k,v in pairs(_G) do print(k) break end end
print(rawget(_G,'print'))
print(getfenv(0) == _G)
print(getfenv(1) == _G)
