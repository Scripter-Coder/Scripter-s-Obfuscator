OuterVal=123
local f = loadstring("print('inner getfenv', getfenv(0).OuterVal); print('inner _G', _G.OuterVal); OuterVal2=456; print('inner set', OuterVal2, getfenv(0).OuterVal2, _G.OuterVal2)")
print("before", OuterVal, getfenv(0).OuterVal, _G.OuterVal)
f()
print("after", OuterVal, getfenv(0).OuterVal, _G.OuterVal)
print("after2", OuterVal2, getfenv(0).OuterVal2, _G.OuterVal2)
