print(_G.print)
x=5
print(_G.x)
print(getfenv(0).x)
_G.y=6
print(y)
