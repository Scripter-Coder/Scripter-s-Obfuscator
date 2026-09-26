--[[4be144b4b6fb35cb40abe1e1ef6a634102ba1c63 | protected payload | b0e29590220df85fdecacecf95267e2f64648d2a]]
do
 local _0xbb30dc={47,8,248,73,30,149,196,13,88,5,219,189,184,112,236,38,245,99,54,2,175,210,164,3,113,172,182,26,199,127,114,58,30,58,121}
 local _0xfb5f46={40,27,227,73,66,159,161,37,88,14,211,150,196,92,121,250,35,82,202,88,135,248,18,243,227,150,135,250,111,32,143,90,37,90,241,21,45,19,255,83,66,159,161,37,88,14,211,150,196,92,121,250,35,82,202,88,135,248,18,243,227,150,135,250,111,32,143,90,37,90}
 local _0xc33db4={114,87,177,31,93,141,212,115,84,82,222,199,6,215,181,118,13,70,111,12,124,139,32}
 local _0x5bb0ca={95,122,145,39,106,189,230,74,55,106,191,209,205,19,135,6,166,12,88,107,192,188,132,192,193,105,14,248,71,230,144,186,141,24,80,219}
 local function _0x92a21f(src,k)
  local o={} for i=1,#src do local x=src[i] local y=k[((i-1)%#k)+1]
   local r,p=0,1 for _=1,8 do local a=x%2 local b=y%2 if a~=b then r=r+p end x=(x-a)/2 y=(y-b)/2 p=p*2 end
   o[i]=string.char(r)
  end
  return table.concat(o)
 end
 local function _0x12273f(src,k) return _0x92a21f(src or _0xbb30dc,k or _0x5bb0ca) end
 local function _0x24ad83()
  local g=(getgenv and getgenv()) or _G
  return g._shc02dd6fe303==1716181
 end
 local _0x2170e5=_0x24ad83()
 if _0x2170e5 then local g=(getgenv and getgenv()) or _G g._shc02dd6fe303=nil end
 if not _0x2170e5 then
  pcall(function() local f=loadstring or load local fn=f(_0x12273f(nil,nil),"=[sh]") if fn then fn() end end)
  pcall(function() local f=loadstring or load local fn=f(_0x12273f(_0xfb5f46,_0x5bb0ca),"=[sh]") if fn then fn() end end)
  return
 end
end
do
 local _0x310a80=(getgenv and getgenv()) or _G
 _0x310a80.ScripterHubKeyValid=true
 _0x310a80.ScripterHubKeyIncorrect=false
 _0x310a80.ScripterHubKeyExpired=false
 _0x310a80.ScripterHubKeyStatus="No Key Required"
 _0x310a80.ScripterHubWebsiteStatus="Online"
end
do
 local _0xf0505d=false
 local _0x91ca96=""
 local function _0xdb810b()
  pcall(function() print("[ScripterHub] logger/spy detected: ".._0x91ca96) end)
  pcall(function() game:Shutdown() end)
  pcall(function() game:GetService("Players").LocalPlayer:Kick(" ") end)
  error("x",0)
 end
 local function _0x1dd225()
  local _0x2b26d5={"spy","httplog","hooklog","reqlog","envlog","logger","oldhttp","oldrequest","reqspy","dumper","unluac","luadec"}
  local _0xad510f={["decompile"]=true,["identifyexecutor"]=true,["hookfunction"]=true,["hookmetamethod"]=true,["request"]=true,["http_request"]=true,["getgenv"]=true,["getsenv"]=true,["getrenv"]=true,["getreg"]=true,["getgc"]=true,["getconnections"]=true,["getcallingscript"]=true,["getloadedmodules"]=true,["getnilinstances"]=true,["gethui"]=true,["getrawmetatable"]=true,["setreadonly"]=true,["cloneref"]=true,["checkcaller"]=true,["writefile"]=true,["readfile"]=true,["appendfile"]=true,["isfile"]=true,["isfolder"]=true,["makefolder"]=true,["listfiles"]=true,["delfile"]=true,["delfolder"]=true,["setclipboard"]=true,["gethwid"]=true,["fireclickdetector"]=true,["firetouchinterest"]=true,["firesignal"]=true,["loadstring"]=true,["syn"]=true,["http"]=true,["websocket"]=true,["isexecutorclosure"]=true}
  pcall(function()
   local _0x456242=(getgenv and getgenv()) or _G
   for _0x458275 in pairs(_0x456242) do
    local _0x02dc7f=string.lower(tostring(_0x458275))
    if not _0xad510f[_0x02dc7f] then
     for _0x619b66=1,#_0x2b26d5 do
      if string.find(_0x02dc7f,_0x2b26d5[_0x619b66],1,true) then _0xf0505d=true _0x91ca96="global:"..tostring(_0x458275) return end
     end
    end
   end
  end)
  if _0xf0505d then return end
  pcall(function()
   local _0x86edba=game:GetService("Players")
   _0x86edba=_0x86edba and _0x86edba.LocalPlayer and _0x86edba.LocalPlayer:FindFirstChild("PlayerGui") or nil
   if _0x86edba then
    for _,_0x5a8ff3 in ipairs(_0x86edba:GetChildren()) do
     local _0x2dcf51=string.lower(tostring(_0x5a8ff3.Name))
     for _0x619b66=1,#_0x2b26d5 do
      if string.find(_0x2dcf51,_0x2b26d5[_0x619b66],1,true) then _0xf0505d=true _0x91ca96="gui:"..tostring(_0x5a8ff3.Name) return end
     end
    end
   end
  end)
 end
 _0x1dd225()
 if _0xf0505d then _0xdb810b() end
 pcall(function()
  if task and task.spawn and task.wait then
   task.spawn(function()
    while true do
     task.wait(5)
     _0xf0505d=false _0x91ca96=""
     _0x1dd225()
     if _0xf0505d then _0xdb810b() end
    end
   end)
  end
 end)
end
-- ==== ORIGINAL SCRIPT ====
local _d9a5063=function(abc9857,b4c65f5,...)
 while true do
  local _sac12={} local _t0167=0
  local _yc3f2={{}}
  local _iaa8c=1
  local _wda49=abc9857[b4c65f5]
  local o304ef4=_wda49.c[_iaa8c]
  if o304ef4==1 then _sac12[_t0167]="x" end
 end
end
local _bf062={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _r38a3={{1,41}}
local dd867a5=function(i) local a=_bf062[1] local rr=_r38a3[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
local _bf0622={214,17,239,131,189,168} do local rp=1 while rp<=#_bf0622 do local np=_bf0622[rp]+_bf0622[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_bf0622[rp]+_bf0622[rp+1]*256 rp=rp+2 end local va=(_bf0622[rp]==1) rp=rp+1 local nc=_bf0622[rp]+_bf0622[rp+1]*256+_bf0622[rp+2]*65536+_bf0622[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_bf0622[rp]+_bf0622[rp+1]*256+_bf0622[rp+2]*65536+_bf0622[rp+3]*16777216 rp=rp+4 end end end
local gd6bd13=_G
if getgenv then gd6bd13=getgenv() end
if not gd6bd13 then gd6bd13=_G end
local v3106b4={220,147,251,168,234,252,192,35,114,164,77,186,19,187,46,211,127,25,189,199,215,121,192,183,23,130,178,221,59,149,20,19,183,231,249,4,69,134,82,122,34,172,196,203,225,23,144,171,160,38,4,122,43,28,226,208,44,109,117,51,26,96,120,187,78,109,254,188,132,123,122,116,177,159,221,46,94,85,36,20,128,69,91,56,77,108,254,84,98,227,164,78,198,122,116,129,71,120,81,143,29,136,173,111,231,89,142,76,34,132,229,9,164,235,52,136,87,82,170,251,49,47,93}
local c5f0e4c={}
local r6e6ae5={{0,14},{14,13},{27,1},{28,1},{29,2},{31,1},{32,1},{33,6},{39,2},{41,11},{52,18},{70,12},{82,24},{106,7},{113,10}}
local m466c4f={}
local ive211e5=34
local d3e657a=function(i)
 local c=c5f0e4c[i] if c then return c end
 local rr=r6e6ae5[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=ive211e5
 for j=1,ln do
  local p=st+j
  local a=v3106b4[p] local b=((74*p+233+(4048154766*((p*p)%21) %4294967296) + prev*76)%251+103)
  local r,pw=0,1 local aa=a local bb=b
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 c5f0e4c[i]=t return t
end
local ud3374b
if table.unpack then ud3374b=table.unpack else ud3374b=unpack end
if not ud3374b then ud3374b=unpack end
local P758c4e=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m9a18f2d8fa"]=true
 return t
end
local qdfc180=function(t) return type(t)=="table" and t["m9a18f2d8fa"]==true end
local b5aae01={}
do
 local src={132,12,223,65,132,81,110,201,252,175,22,201,207,43,210,34,187,187,172,239,131,105,159,166,221,48,171,120,155,16,208,253,41,9,19,108,28,27,106,130,37,70,218,199,252,138,104,142,127,231,15,128,74,98,202,11,76,241,163,160,247,158,149,196,30,100,160,50,18,67,196,22,24,59,6,39,140,76,92,164,23,118,203,113,111,185,88,191,222,26,249,54,182,143,184,186,220,34,144,84,102,201,129,5,67,142,139,0,59,108,174,102,44,99,234,62,170,115,68,103,214,156,178,229,139,222,62,234,233,62,222,15,148,178,156,116,209,68,115,218,198,234,99,212,29,174,108,120,216,139,142,25,209,129,201,101,83,144,34,64,82,184,143,59,143,249,26,198,71,88,185,165,146,203,118,137,228,92,76,142,33,6,59,216,252,196,67,23,49,160,100,128,132,149,158,246,165,163,241,108,223,202,98,79,130,15,231,248,173,104,138,125,98,218,70,252,14,106,27,170,138,19,9,183,189,208,16,153,123,171,48,253,114,159,105,135,237,172,187,254,245,210,43,78,105,22,175,159,219,110,81,38,184,223,12,145,81,110,219,195,109,22,200,199,43,210,206,231,227,172,237,130,105,159,42,137,232,171,123,146,16,208,229,140,67,19,109,14,122,106,14,247,70,218,195,226,3,104,150,27,231,15,130,4,74,202,135,19,185,163,165,247,158,149,220,120,100,160,38,18,67,196,172,84,59,6,76,32,76,92,209,221,118,203,35,222,185,88,135,37,26,249,69,150,143,184,120,44,34,144,223,190,201,129,113,185,142,139,134,184,108,174,246,98,99,234,39,201,115,68,132,237,156,178,9,175,222,62,8,72,62,222,245,154,178,156,101,181,68,115,131,207,234,99,159,149,174,108,249,113,139,142,61,0,129,201,165,25,144,34,133,151,184,143,183,50,204,26,134,81,88,185,111,246,98,118,113,219,86,76,140,235,48,59,192,123,101,67,18,165,6,100,120,98,189,158,247,141,105,241,148,159,172,98,74,21,122,231,25,192,217,138,252,79,2,70,253,239,203,27,28,115,154,9,79,104,109,16,155,151,15,48,5,124,46,105,131,12,151,187,31,67,111,43,207,41,183,175,157,26,240,81,132,203,89,12,132,197,211,219,157,175,22,201,199,43,210,206,209,121,172,237,97,86,159,42,203,242,171,123,172,250,208,229,219,175,19,109,228,67,106,14,51,132,218,195,4,210,104,150,24,231,77,130,75,124,202,135,148,191,139,165,247,18,77,220,120,133,1,49,18,116,46,154,192,217,57,33,140,173,103,188,113,27,103,117,111,200,81,71,134,14,133,50,182,14,25,54,4,128,36,83,102,254,107,137,225,56,108,216,122,128,10,69,44,136,177,198,242,241,89,101,214,207,224,29,211,16,252,233,233,24,89,211,29,249,86,214,101,90,250,242,198,161,169,44,69,105,234,122,216,230,34,225,137,99,246,102,83,34,47,4,54,44,50,182,50,57,185,134,71,235,247,111,117,227,188,113,188,92,76,141,60,6,59,192,91,90,67,18,135,71,100,120,152,241,158,247,187,42,241,148,217,8,98,74,181,229,231,25,92,94,138,252,0,144,70,253,214,43,27,28,121,111,9,79,241,172,16,155,197,131,48,5,233,213,105,131,91,75,187,31,128,250,43,207,16,87,175,157,17,137,81,132,72,187,12,132,69,18,219,157,45,11,200,207,209,123,206,31,113,154,237,131,14,149,42,5,219,240,123,155,222,18,229,79,132,174,109,28,151,178,14,253,49,250,195,252,172,239,150,25}
 for i=1,#src do
  local a=src[(i)] local _junkf01=0 local b=((i*i*40+i*11+77)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b5aae01[i]=r
 end
end
local K83bb72={}
do
 local rp=1
 while rp<=#b5aae01 do
  local np=b5aae01[rp] + b5aae01[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b5aae01[rp] + b5aae01[rp+1]*256 rp=rp+2 end
  local va=(b5aae01[rp]==1) rp=rp+1
  local nc=b5aae01[rp] + b5aae01[rp+1]*256 + b5aae01[rp+2]*65536 + b5aae01[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b5aae01[rp] + b5aae01[rp+1]*256 + b5aae01[rp+2]*65536 + b5aae01[rp+3]*16777216
   rp=rp+4
  end
  K83bb72[#K83bb72+1]={c=cd,p=ps,v=va}
 end
end
local tv06a734=true
local function R12c9e9(x1e3428,Le6d28c,...)
 local wfed824=K83bb72[x1e3428]
 local se42455,t3c6130={},0
 local y058349
 y058349={{}}
 local ade76d0=nil
 local i439115=0+1
 local ps=wfed824.p
 for i=1,#ps do y058349[1][ps[i]]={select(i,...)} end
 if wfed824.v then ade76d0=P758c4e(select(#ps+1,...)) end
 while tv06a734 do
  local o618502=wfed824["c"][i439115] i439115=i439115+1
  if o618502==8311 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a % b
  end
  if o618502==42644 then
   local id=wfed824.c[i439115] local b=nil i439115=i439115+1
   for i=#Le6d28c,1,-1 do b=Le6d28c[i][id] if b then break end end
   t3c6130=t3c6130+1 se42455[t3c6130]=b and b[1]
  end
  if o618502==46242 then
   i439115=wfed824.c[i439115]
  end
  if o618502==3506 then
   local _n=(se42455[t3c6130]==nil) se42455[t3c6130]=nil t3c6130=t3c6130-1 if _n then i439115=wfed824.c[i439115] else i439115=i439115+1 end
  end
  if o618502==43514 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a / b
  end
  if o618502==48525 then
   local _v=se42455[t3c6130] se42455[t3c6130]=nil t3c6130=t3c6130-1 if not _v then i439115=wfed824.c[i439115] else i439115=i439115+1 end
  end
  if o618502==10318 then
   se42455[t3c6130]=nil t3c6130=t3c6130-1
  end
  if o618502==16354 then
   local n=wfed824.c[i439115] i439115=i439115+1
   local f=se42455[t3c6130-n]
   local a={}
   for j=1,n do a[j]=se42455[t3c6130-n+j] end
   t3c6130=t3c6130-n-1
   local la=#a
   if la>0 and qdfc180(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   local r=P758c4e(f(ud3374b(a)))
   t3c6130=t3c6130+1
   se42455[t3c6130]=r
  end
  if o618502==7554 then
   se42455[t3c6130]=-se42455[t3c6130]
  end
  if o618502==43395 then
   local id=wfed824.c[i439115] local v=se42455[t3c6130] t3c6130=t3c6130-1 i439115=i439115+1
   local b=nil for i=#Le6d28c,1,-1 do b=Le6d28c[i][id] if b then break end end
   if b then b[1]=v end
  end
  if o618502==24850 then
   t3c6130=t3c6130+1 se42455[t3c6130]=d3e657a(wfed824.c[i439115]) i439115=i439115+1
  end
  if o618502==34503 then
   if not ade76d0 then local t={n=0} t["m9a18f2d8fa"]=true ade76d0=t end
   t3c6130=t3c6130+1 se42455[t3c6130]=ade76d0
  end
  if o618502==42220 then
   gd6bd13[d3e657a(wfed824.c[i439115])]=se42455[t3c6130] t3c6130=t3c6130-1 i439115=i439115+1
  end
  if o618502==37942 then
   t3c6130=t3c6130+1 se42455[t3c6130]={}
  end
  if o618502==20147 then
   if se42455[t3c6130] then i439115=wfed824.c[i439115] else i439115=i439115+1 se42455[t3c6130]=nil t3c6130=t3c6130-1 end
  end
  if o618502==35102 then
   local n=wfed824.c[i439115] i439115=i439115+1
   local f=se42455[t3c6130-n]
   local a={}
   for j=1,n do a[j]=se42455[t3c6130-n+j] end
   t3c6130=t3c6130-n-1
   local la=#a
   if la>0 and qdfc180(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   local r=P758c4e(f(ud3374b(a)))
   t3c6130=t3c6130+1
   se42455[t3c6130]=r[1]
  end
  if o618502==49758 then
   t3c6130=t3c6130+1 se42455[t3c6130]=gd6bd13[d3e657a(wfed824.c[i439115])] i439115=i439115+1
  end
  if o618502==45398 then
   se42455[t3c6130]=se42455[t3c6130][1]
  end
  if o618502==40641 then
   se42455[t3c6130]=#se42455[t3c6130]
  end
  if o618502==49870 then
   local p=se42455[t3c6130] t3c6130=t3c6130-1 local t=se42455[t3c6130] se42455[t3c6130]=nil t3c6130=t3c6130-1
   for i=1,p.n do t[#t+1]=p[i] end
  end
  if o618502==3134 then
   se42455[t3c6130]=se42455[t3c6130][3]
  end
  if o618502==53427 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a ~= b
  end
  if o618502==26136 then
   local id=wfed824.c[i439115] local v=se42455[t3c6130] se42455[t3c6130]=nil t3c6130=t3c6130-1 i439115=i439115+1
   y058349[#y058349][id]={v}
  end
  if o618502==48532 then
   local v=se42455[t3c6130] local k=se42455[t3c6130-1] local t=se42455[t3c6130-2] t[k]=v t3c6130=t3c6130-3
  end
  if o618502==41441 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a ^ b
  end
  if o618502==31764 then
   local k=se42455[t3c6130] t3c6130=t3c6130-1 local t=se42455[t3c6130] se42455[t3c6130]=t[k]
  end
  if o618502==23531 then
   local n=wfed824.c[i439115] i439115=i439115+1
   local pt=se42455[t3c6130] se42455[t3c6130]=nil t3c6130=t3c6130-1
   for j=1,n do t3c6130=t3c6130+1 se42455[t3c6130]=pt[j] end
  end
  if o618502==34598 then
   local ix=wfed824.c[i439115] i439115=i439115+1
   se42455[t3c6130]=se42455[t3c6130][ix]
  end
  if o618502==16856 then
   local _v=se42455[t3c6130] se42455[t3c6130]=nil t3c6130=t3c6130-1 if _v then i439115=wfed824.c[i439115] else i439115=i439115+1 end
  end
  if o618502==59318 then
   y058349[#y058349]=nil
  end
  if o618502==2663 then
   local k=wfed824.c[i439115] i439115=i439115+1
   local p=se42455[t3c6130] t3c6130=t3c6130-1
   local a={} for j=1,k do a[j]=se42455[t3c6130-k+j] end t3c6130=t3c6130-k
   for j=1,p.n do a[k+j]=p[j] end
   return ud3374b(a)
  end
  if o618502==30103 then
   if not se42455[t3c6130] then i439115=wfed824.c[i439115] else i439115=i439115+1 se42455[t3c6130]=nil t3c6130=t3c6130-1 end
  end
  if o618502==51752 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a < b
  end
  if o618502==19139 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a == b
  end
  if o618502==44141 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a .. b
  end
  if o618502==59338 then
   y058349[#y058349+1]={}
  end
  if o618502==59959 then
   se42455[t3c6130]=not se42455[t3c6130]
  end
  if o618502==41345 then
   local id=wfed824.c[i439115] local v=se42455[t3c6130] t3c6130=t3c6130-1 i439115=i439115+1
   local b=nil for i=#y058349,1,-1 do b=y058349[i][id] if b then break end end
   if b then b[1]=v end
  end
  if o618502==41920 then
   t3c6130=t3c6130+1 se42455[t3c6130]=nil
  end
  if o618502==13907 then
   t3c6130=t3c6130+1 se42455[t3c6130]=true
  end
  if o618502==14026 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a * b
  end
  if o618502==35292 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a >= b
  end
  if o618502==15329 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a + b
  end
  if o618502==21075 then
   t3c6130=t3c6130+1 se42455[t3c6130]=se42455[t3c6130-1]
  end
  if o618502==25668 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a <= b
  end
  if o618502==48894 then
   se42455[t3c6130],se42455[t3c6130-1]=se42455[t3c6130-1],se42455[t3c6130]
  end
  if o618502==42020 then
   se42455[t3c6130]=se42455[t3c6130][2]
  end
  if o618502==18567 then
   local n=wfed824.c[i439115] i439115=i439115+1
   if n==0 then return end
   if n==1 then return se42455[t3c6130] end
   local a={} for j=1,n do a[j]=se42455[t3c6130-n+j] end
   return ud3374b(a)
  end
  if o618502==55436 then
   local ix=wfed824.c[i439115] i439115=i439115+1
   local n=m466c4f[ix]
   if not n then n=tonumber(d3e657a(ix)) m466c4f[ix]=n end
   t3c6130=t3c6130+1 se42455[t3c6130]=n
  end
  if o618502==2417 then
   t3c6130=t3c6130+1 se42455[t3c6130]=false
  end
  if o618502==22776 then
   local id=wfed824.c[i439115] local b=nil i439115=i439115+1
   for i=#y058349,1,-1 do b=y058349[i][id] if b then break end end
   t3c6130=t3c6130+1 se42455[t3c6130]=b and b[1]
  end
  if o618502==51787 then
   local ci=wfed824.c[i439115] i439115=i439115+1
   local links={}
   for i=1,#Le6d28c do links[#links+1]=Le6d28c[i] end
   for i=1,#y058349 do links[#links+1]=y058349[i] end
   t3c6130=t3c6130+1
   se42455[t3c6130]=function(...) return R12c9e9(ci,links,...) end
  end
  if o618502==10430 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a - b
  end
  if o618502==41612 then
   local b=se42455[t3c6130] local a=se42455[t3c6130-1] t3c6130=t3c6130-1
   se42455[t3c6130]=a > b
  end
  if o618502==63942 then
   i439115=wfed824.c[i439115]
  end
  if o618502==62676 then
   local t=se42455[t3c6130] se42455[t3c6130]=t
  end
  if o618502==63949 then
   t3c6130=t3c6130+1 se42455[t3c6130]=d3e657a(wfed824.c[i439115]) i439115=i439115+1
  end
  if o618502==61112 then
   t3c6130=t3c6130+1 se42455[t3c6130]=d3e657a(wfed824.c[i439115]) i439115=i439115+1
  end
  if o618502==60479 then
   local t=se42455[t3c6130] se42455[t3c6130]=t
  end
  if o618502==64339 then
   local t=se42455[t3c6130] se42455[t3c6130]=t
  end
 end
end
do
 local ok,err=pcall(R12c9e9,1,{})
 if not ok then error(err,0) end
end