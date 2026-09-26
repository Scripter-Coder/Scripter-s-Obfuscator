print(pcall(function() getfenv(0).test=123 end))
print(getfenv(0).test)
print(_G.test)
