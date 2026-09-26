x=10
print(_G.x)
print(getfenv and 'has getfenv' or 'no getfenv')
print(rawget(_G,'x'))
_G['a']=1
