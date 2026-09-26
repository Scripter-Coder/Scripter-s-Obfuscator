print(pcall(function() _G.x=1 end))
print(_G.x)
print(type(_G))
print(getgenv)
