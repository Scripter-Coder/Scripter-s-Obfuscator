local ok,res=pcall(function() error("fail") end)
print(ok)
print(res:find("fail") and "found" or "not")