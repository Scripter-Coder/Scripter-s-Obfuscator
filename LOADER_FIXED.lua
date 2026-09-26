-- paste this into your executor
local u="https://scripterhub-stats.dubovikstanislav51.workers.dev/sh/ScripterHub0451244272"
local b
if request then local ok,r=pcall(function() return request({Url=u,Method='GET'}) end) if ok and type(r)=='table' and type(r.Body)=='string' and r.Body~='' then b=r.Body end end
if not b and game and game.HttpGet then local ok2,r2=pcall(function() return game:HttpGet(u,true) end) if ok2 and type(r2)=='string' and r2~='' then b=r2 end end
if not b then print('[ScripterHub] Could not reach the script. No usable HTTP function.') return end
local LS=loadstring or load
local f=LS and LS(b)
if not f then print('[ScripterHub] Could not compile the loader.') return end
f()
