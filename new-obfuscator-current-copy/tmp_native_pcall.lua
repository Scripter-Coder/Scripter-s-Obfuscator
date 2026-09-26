local ok,err=pcall(function() error("fail") end)
print(ok)
print(err:find("fail") and "found" or "not")