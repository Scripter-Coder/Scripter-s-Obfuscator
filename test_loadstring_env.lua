local f = loadstring or load
local chunk = f("print('inside', getfenv(0)==_G); print('inside _G', _G); print('inside getfenv', getfenv(0)); RESULT=5; print('inside set RESULT', RESULT, getfenv(0).RESULT)")
print("before", RESULT, getfenv(0).RESULT, _G.RESULT)
chunk()
print("after", RESULT, getfenv(0).RESULT, _G.RESULT)
