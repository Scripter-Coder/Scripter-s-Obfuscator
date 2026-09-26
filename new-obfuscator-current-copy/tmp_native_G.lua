local mt={__add=function(a,b) return {val=a.val+b.val} end} local a=setmetatable({val=1},mt) local b=setmetatable({val=2},mt) local c=a+b
print(c.val)