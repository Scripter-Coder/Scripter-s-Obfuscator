print(pcall(function() rawset(_G, "x", 1) end))
print(_G.x)
print(rawget(_G, "x"))
