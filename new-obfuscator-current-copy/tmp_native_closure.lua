function makeCounter(): ()->number local c=0 return function():number c+=1 return c end end
local cnt=makeCounter()
print(cnt())
print(cnt())