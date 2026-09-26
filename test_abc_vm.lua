local _dc78590=function(ac73cc4,bb5d386,...)
 while true do
  local _s144c={} local _teae1=0
  local _y4d52={{}}
  local _i3583=1
  local _wfbd2=ac73cc4[bb5d386]
  local o756035=_wfbd2.c[_i3583]
  if o756035==1 then _s144c[_teae1]="x" end
 end
end
local _bcf2c={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _r9b9e={{1,41}}
local da17fd0=function(i) local a=_bcf2c[1] local rr=_r9b9e[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _bcf2c2={214,17,239,131,189,168} do local rp=1 while rp<=#_bcf2c2 do local np=_bcf2c2[rp]+_bcf2c2[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_bcf2c2[rp]+_bcf2c2[rp+1]*256 rp=rp+2 end local va=(_bcf2c2[rp]==1) rp=rp+1 local nc=_bcf2c2[rp]+_bcf2c2[rp+1]*256+_bcf2c2[rp+2]*65536+_bcf2c2[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_bcf2c2[rp]+_bcf2c2[rp+1]*256+_bcf2c2[rp+2]*65536+_bcf2c2[rp+3]*16777216 rp=rp+4 end end end
end
local gacc091=_G
if string.dump then local _d=string.dump(function() return undefined end) end
if getgenv then gacc091=getgenv() end
if not gacc091 then gacc091=_G end
local v0075ce={239,183,212,34,164,178,64,120,242,236,220,195,65,69,247,31,142,173,186,69,42,123,47,144,80,49,129,255,195,32,135,56,15,28,104,166,236,105,96,253,7,68,119,178,234,157,122,143,39,4,54,126,201,186,91,83,28,59,250,111,88,16,193,145,177,13,214,5,95,125,219,94,44,69,226,191,219,91,249,155,11,202,247,18,131,45,117,248,139,105,17,153,183,253,60,59,89,253,41,49,77,242,165,137,162,39,14,46,229,134,244,103,117,208,16,29,144,51,218,254,229,201,182,5,118,24,192,127,151,145,74,65,246,52,57,91,135,144,80,192,137,172,242,63,221,21,196,128,26,193,95,226,250,234,142,2,110,55,64,228,193,11,224,57,173,31,122,138,235,246,33,146,92,61,207,97,105,243,156,156,76,60,8,85,28,80,200,209,223,232,149,139,247,140,168,200,247,3,53,144,84,147,216,11,46,45,26,255,212,221,151,217,74,75,193,176,6,155,238,106,93,206,226,83,162,93,146,54,57,101,214,219,100,100,95,184,110,101,82,19,110,235,239,122,114,14}
local c099207={}
local ra1fd38={{0,2},{2,8},{10,6},{16,5},{21,6},{27,27},{54,47},{101,34},{135,57},{192,54}}
local m4d752f={}
local ivdc36d3=208
local ddccb8e=function(i)
 local c=c099207[i] if c then return c end
 local rr=ra1fd38[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=ivdc36d3
 for j=1,ln do
  local p=st+j
  local a=v0075ce[p] local b=(186*p+53+1195863279*1.0*((p*p)%14))%251+244
  local kb=(b + prev*51)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 c099207[i]=t return t
end
local u1a291f
if table.unpack then u1a291f=table.unpack else u1a291f=unpack end
if not u1a291f then u1a291f=unpack end
local P8bb6ad=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["mba9be83f6b"]=true
 return t
end
local q623c5a=function(t) return type(t)=="table" and t["mba9be83f6b"]==true end
local bf478a6={}
do
 local src={164,196,139,244,9,189,25,25,187,7,149,139,196,165,43,84,36,39,54,111,209,219,138,220,213,196,46,160,48,98,59,182,216,161,17,35,212,55,63,221,45,31,49,157,208,89,135,86,202,229,133,219,27,200,33,28,185,253,89,227,174,137,11,47,245,103,123,54,147,149,66,137,131,30,91,189,182,242,198,67,94,34,136,183,130,159,156,64,134,115,7,140,131,153,191,140,251,22,206,50,56,224,55,42,221,6,231,116,135,144,241,21,215,67,82,8,248,200,5,77,63,205,10,228,78,123,97,210,232,169,15,23,89,128,15,169,232,210,97,146,78,13,10,205,63,77,5,95,248,159,82,67,215,21,241,121,82,181,231,6,192,42,52,224,189,109,206,22,250,140,191,153,63,80,7,115,134,64,156,159,95,171,136,34,95,65,198,242,189,132,91,30,128,143,66,151,98,247,123,103,241,47,11,137,95,187,232,253,188,28,33,200,13,46,167,229,203,86,132,89,235,55,179,31,156,68,57,55,215,35,17,161,219,182,19,98,126,160,180,117,213,218,138,148,209,111,175,39,34,84,43,124,6,139,244,124,153,25,25,39,4,244,139,109,185,43,84,213,87,175,111,169,97,138,220,158,68,183,160,176,19,59,182,98,200,17,35,91,171,57,221,22,198,179,238,97,95,132,86,228,63,167,16,13,246,33,28,175,122,232,122,102,3,11,47,173,175,123,54,233,40,66,143,141,127,91,63,193,103,198,65,102,174,136,149,224,130,156,64,55,117,7,61,112,128,191,140,123,103,206,50,13,180,52,42,250,138,231,116,56,48,241,21,80,115,82,8,248,200,5,77,149,137,10,228,78,135,97,210,240,228,15,23,187,168,15,169,114,69,97,146,242,115,10,205,228,143,5,95,248,159,82,67,238,153,241,121,43,217,231,6,230,195,52,224,176,159,206,22,123,253,191,153,171,164,7,115,93,142,156,159,64,50,136,34,222,48,198,242,193,170,91,30,24,198,66,151,151,163,123,103,115,31,11,137,140,177,232,253,140,72,33,200,147,242,167,229,239,59,132,89,25,10,179,31,220,28,57,55,226,119,17,161,3,120,59,98,20,181,183,117,80,131,138,218,87,95,175,150,78,77,43,164,61,95,244,9,55,133,25,187,19,185,139,196,127,229,84,36,39,169,111,209,66,29,220,213,81,94,160,48,211,61,182,216,122,223,35,215,199,164,221,45,71,123,238,208,44,166,86,202,221,43,16,27,68,189,28,185,254,232,126,174,204,11,104,245,102,107,54,212,151,66,143,3,111,91,63,89,255,198,65,123,79,136,149,51,32,156,64,144,77,7,61,30,12,191,140,130,71,206,50,54,129,52,42,249,223,231,116,59,238,241,21,158,151,82,8,69,50,5,77,197,25,10,228,226,112,97,210,196,115,15,23,153,223,15,169,178,26,97,146,177,42,10,205,7,148,5,95,236,148,82,67,103,19,241,121,155,248,231,6,107,110,52,224,184,67,206,22,213,86,191,153,154,76,7,115,14,162,156,159,51,42,136,34,150,203,198,242,73,163,91,30,203,91,66,151,31,170,123,103,206,246,11,137,7,62,232,253,195,163,33,200,53,202,167,229,66,251,132,89,18,187,179,31,117,21,57,55,21,118,17,161,98,223,59,98,235,111,183,117,114,224,138,218,137,167,175,150,0,189,43,164,109,207,244,9,61,41,25,187,112,165,139,196,209,9,84,36,163,251,111,209,107,140,220,213,253,85,160,48,211,61,182,216,121,211,35,215,158,125,221,45,58,222,238,208,220,219,86,202,66,155,16,27,64,140,28,185,38,39,122,174,135,106,47,245,174,159,54,147,198,141,143,131,150,246,63,197,114,183,65,94,190,133,149,73,164,69,64,134,212,59,61,26,227,0,140,251,147,145,50,56,81,50,42,194,6,231,116,160,121,223,21,214,67,171,220,96,95,153,64,60,205,209,43,106,146,19,78,234,169,101,14,193,23,79,140,234,210,12,226,106,228,112,114,60,77,78,110,96,8,206,78,214,21,223,163,163,116,98,89,194,42,127,209,56,50,234,3,251,140,231,81,26,61,35,102,134,64,184,138,73,149,113,246,94,65,93,187,197,63,128,208,131,143,218,0,147,54,249,20,245,47,186,16,174,122,33,25,185,28,250,6,27,16,131,12,202,86,62,48,208,238,235,215,45,221,0,81,215,35,104,240,216,182,187,19,48,160,50,42,213,220,156,93,209,111,197,143,36,84,99,112,196,139,165,198,187,25,176,166,9,244,243,127,164,43,253,96,150,175,200,237,218,138,242,15,117,183,217,97,98,59,187,62,161,17,138,147,55,57,255,230,31,179,38,90,89,132,86,202,228,185,16,88,200,33,28,140,169,232,122,31,143,11,47,140,54,123,54,133,169,66,143,115,131,91,63,188,163,198,65,133,237,136,149,145,93,156,64,205,66,7,61,20,248,191,140,150,102,206,50,112,52,52,42,154,206,231,116,33,10,241,21,20,22,82,8,251,22,5,77,53,106,10,228,242,224,97,210,211,207,15,23,244,67,15,169,147,131,97,146,24,120,10,205,106,58,5,95,199,52,82,67,47,193,241,121,18,237,231,6,71,117,52,224,227,252,206,22,115,110,191,153,159,98,7,115,60,41,156,159,112,243,136,34,247,5,198,242,189,132,91,30,24,198,66,151,52,10,123,103,105,34,11,137,184,68,232,253,157,245,33,200,74,223,167,229,238,67,132,89,75,167,179,31,59,227,57,55,87,82,17,161,113,171,59,98,172,173,183,117,251,6,138,218,87,95,175,150,29,50,43,164,253,237,244,9,74,216,25,187,44,153,139,196,38,88,84,36,77,96,111,209,1,69,220,213,36,120,160,48,76,225,182,216,39,33,35,215,69,165,221,45,131,190,238,208,125,145,86,202,156,246,16,27,177,112,28,185,125,153,122,174,81,201,47,245,221,18,54,147,79,128,143,131,31,91,26,197,243,194,65,20,34,136,149,176,75,156,64,215,188,7,61,47,205,191,140,10,215,206,50,13,180,52,42,26,196,231,116,152,160,241,21,78,49,82,8,187,145,5,77,24,216,10,228,7,226,97,210,209,112,15,23,172,103,15,169,57,86,97,146,78,241,10,205,231,130,5,95,153,220,82,67,86,100,241,121,97,33,231,6,148,93,52,224,22,232,206,22,10,77,191,153,179,121,7,115,191,38,156,159,185,8,136,34,52,88,198,242,254,230,91,30,75,5,66,151,106,226,123,103,209,58,11,137,125,254,232,253,123,73,33,200,74,223,167,229,146,158,132,89,169,191,179,31,132,192,57,55,39,190,17,161,67,255,59,98,74,31,183,117,158,237,138,218,137,167,175,150,93,5,43,164,12,1,244,9,104,157,25,187,45,29,139,196,44,201,84,36,19,240,111,209,92,186,220,213,220,243,160,48,226,74,182,216,172,247,35,215,2,109,221,45,230,103,238,208,130,74,86,202,235,198,16,27,121,184,28,185,197,100,122,174,32,79,47,245,252,50,54,147,175,206,143,131,238,198,63,197,199,146,65,94,186,31,149,73,229,35,64,134,212,59,61,26,183,101,140,251,177,242,50,56,25,224,42,194,188,142,116,163,112,86,21,214,234,22,8,96,39,190,77,60,180,91,228,106,171,7,210,234,168,15,20,193,23,10,169,216,210,97,146,124,99,10,205,24,88,5,95,179,140,82,67,248,207,241,121,206,4,231,6,204,75,52,224,53,212,206,22,142,174,191,153,12,186,7,115,33,124,156,159,184,84,136,34,222,48,198,242,108,123,91,30,24,198,66,151,151,163,123,103,163,88,11,137,7,103,232,253,33,139,33,200,62,125,167,229,220,104,132,89,254,52,179,31,246,18,57,55,82,124,17,161,3,121,59,98,20,73,183,117,23,137,138,218,245,122,175,150,131,104,43,164,252,7,244,9,121,76,25,187,210,58,139,196,228,14,84,36,179,194,111,209,176,147,220,213,78,110,160,48,185,244,182,216,16,23,35,215,171,52,221,45,215,57,238,208,209,41,86,202,220,193,16,27,16,227,28,185,127,155,122,174,159,53,47,245,110,220,54,147,229,222,143,131,150,185,63,197,228,65,65,94,139,204,149,73,155,9,64,134,112,7,117,26,213,191,142,251,22,206,50,39,224,52,42,168,31,231,116,218,40,241,21,219,165,82,8,169,187,5,77,231,2,10,228,195,143,97,210,209,112,15,23,104,83,15,169,49,28,97,146,82,104,10,205,24,88,5,95,78,210,82,67,83,74,241,121,97,33,231,6,17,174,52,224,193,230,206,22,225,193,191,153,171,59,7,115,208,55,156,159,213,152,136,34,43,99,198,242,141,235,91,30,27,24,66,151,177,253,123,103,209,58,11,137,214,193,232,253,53,128,33,200,161,121,167,229,66,251,132,89,121,243,179,31,59,90,57,55,212,35,33,161,224,182,127,98,48,176,183,55,213,220,138,212,176,111,175,175,66,84,43,242,179,139,244,129,89,25,25,18,20,244,139,95,237,43,84,149,15,175,111,40,14,138,220,23,32,183,160,62,3,59,182,113,229,17,35,46,227,57,221,20,121,179,238,97,95,132,86,156,146,167,16,217,157,33,28,63,205,232,122,117,71,11,47,92,122,123,54,91,29,66,143,91,220,91,63,141,38,198,65,167,246,136,149,209,237,156,64,6,2,7,61,146,123,191,140,213,204,206,50,28,245,52,42,207,224,231,116,174,159,241,21,150,102,82,8,69,50,5,77,160,192,10,228,168,199,97,210,159,139,15,23,48,214,15,169,91,212,97,146,50,44,10,205,30,134,5,95,68,225,82,67,210,128,241,121,154,18,231,6,212,20,52,224,85,66,206,22,57,217,191,153,23,219,7,115,118,221,156,159,68,115,136,34,134,131,198,242,193,170,91,30,182,219,66,151,64,178,123,103,105,34,11,137,163,156,232,253,72,221,33,200,31,133,167,229,220,209,132,89,72,156,179,31,165,112,57,55,129,84,17,161,3,121,59,98,153,228,183,117,141,20,138,218,145,74,175,150,255,155,43,164,201,109,244,9}
 for i=1,#src do
  local a=src[(i)] local _junkc20=0 local b=((i*i*81+i*40+39)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  bf478a6[i]=r
 end
end
local K447f04={}
do
 local rp=1
 while rp<=#bf478a6 do
  local np=bf478a6[rp] + bf478a6[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=bf478a6[rp] + bf478a6[rp+1]*256 rp=rp+2 end
  local va=(bf478a6[rp]==1) rp=rp+1
  local mr=bf478a6[rp] + bf478a6[rp+1]*256 rp=rp+2
  local nc=bf478a6[rp] + bf478a6[rp+1]*256 + bf478a6[rp+2]*65536 + bf478a6[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=bf478a6[rp] + bf478a6[rp+1]*256 + bf478a6[rp+2]*65536 + bf478a6[rp+3]*16777216
   rp=rp+4
  end
  K447f04[#K447f04+1]={c=cd,p=ps,v=va,maxReg=mr}
 end
end
local R44f407
R44f407=function(x79754a,L72a205,...)
 local wd9be0a=K447f04[x79754a]
 local s66e62a={} local t7f9d72=0
 local y974ace={{}}
 local afa3983=nil
 local i2771fe=1
 local ps=wd9be0a.p
 local eba26cf={} local b3954e9=0 local k747558=wd9be0a.maxReg or 32
 local Gaf455e={} local f5341d3=0
 for i=1,#ps do local cell={select(i,...)} eba26cf[b3954e9+ps[i]]=cell y974ace[1][ps[i]]=cell end
 if wd9be0a.v then afa3983=P8bb6ad(select(#ps+1,...)) end
 local F93e924={chunk=x79754a,pc=i2771fe,base=b3954e9,top=k747558,ret=nil,nRet=0,vararg=afa3983,upenv=L72a205,caller=nil,build=2904502011,reg=eba26cf}
 -- frame pc is alias of i2771fe, base=b3954e9 top=k747558 reg window eba26cf[b3954e9..k747558]
 local jca85e7={}
 local hbd8f95={}
 hbd8f95[0x1da9]=function()
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=false
 end
 hbd8f95[0x5f85]=function()
   local id=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   local cell=eba26cf[b3954e9+id]
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=cell and cell[1]
 end
 hbd8f95[0x55c2]=function()
   if not afa3983 then local t={n=0} t["mba9be83f6b"]=true afa3983=t end
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=afa3983
 end
 hbd8f95[0x5179]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a * b
 end
 hbd8f95[0xe924]=function()
   local ci=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   local links={}
   for i=1,#L72a205 do links[#links+1]=L72a205[i] end
   for i=1,#y974ace do links[#links+1]=y974ace[i] end
   -- Phase 3: VM function as table with isVM marker, not host closure
   local vmf={isVM=true, proto=ci, env=links, maxReg=K447f04[ci].maxReg}
   setmetatable(vmf,{__call=function(_, ...) return R44f407(vmf.proto, vmf.env, ...) end})
   jca85e7[vmf]=true
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=vmf
 end
 hbd8f95[0xbb78]=function()
   gacc091[ddccb8e(wd9be0a.c[i2771fe])]=s66e62a[t7f9d72] t7f9d72=t7f9d72-1 i2771fe=i2771fe+1
 end
 hbd8f95[0xd93b]=function()
   s66e62a[t7f9d72]=nil t7f9d72=t7f9d72-1
 end
 hbd8f95[0xe288]=function()
   local _n=(s66e62a[t7f9d72]==nil) s66e62a[t7f9d72]=nil t7f9d72=t7f9d72-1 if _n then i2771fe=wd9be0a.c[i2771fe] else i2771fe=i2771fe+1 end
 end
 hbd8f95[0x9504]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a > b
 end
 hbd8f95[0x3e16]=function()
   local n=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   local f=s66e62a[t7f9d72-n]
   local a={}
   for j=1,n do a[j]=s66e62a[t7f9d72-n+j] end
   local retDest=t7f9d72-n
   t7f9d72=t7f9d72-n-1
   local la=#a
   if la>0 and q623c5a(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   if jca85e7[f] then
     F93e924.pc=i2771fe; F93e924.base=b3954e9; F93e924.top=k747558; F93e924.code=wd9be0a; F93e924.s=s66e62a; F93e924.sp=t7f9d72; F93e924.sc=y974ace; F93e924.va=afa3983; F93e924.lk=L72a205; F93e924.retDest=retDest; F93e924.nRet=1
     Gaf455e[f5341d3+1]=F93e924; f5341d3=f5341d3+1
     local callee=K447f04[f.proto]
     wd9be0a=callee; i2771fe=1
     b3954e9=k747558+1; k747558=b3954e9+(callee.maxReg or 32)
     s66e62a={}; t7f9d72=0; y974ace={{}}
     for i=1,#callee.p do local c={a[i]} eba26cf[b3954e9+callee.p[i]]=c; y974ace[1][callee.p[i]]=c end
     if callee.v then afa3983=P8bb6ad(select(#callee.p+1, u1a291f(a))) else afa3983=nil end
     L72a205=f.env
     F93e924={chunk=f.proto,pc=i2771fe,base=b3954e9,top=k747558,code=wd9be0a,s=s66e62a,sp=t7f9d72,sc=y974ace,reg=eba26cf,va=afa3983,lk=L72a205,retDest=retDest,nRet=1,caller=Gaf455e[f5341d3]}
     Gaf455e[f5341d3]=F93e924
   else
     local r=P8bb6ad(f(u1a291f(a)))
     t7f9d72=t7f9d72+1
     s66e62a[t7f9d72]=r[1]
   end
 end
 hbd8f95[0xc2d8]=function()
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=true
 end
 hbd8f95[0xc858]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a - b
 end
 hbd8f95[0xcb22]=function()
   error("TAILCALL via HAND")
 end
 hbd8f95[0x9df0]=function()
   local k=s66e62a[t7f9d72] t7f9d72=t7f9d72-1 local t=s66e62a[t7f9d72] s66e62a[t7f9d72]=t[k]
 end
 hbd8f95[0x706d]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a + b
 end
 hbd8f95[0xcf51]=function()
   local n=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   local pt=s66e62a[t7f9d72] s66e62a[t7f9d72]=nil t7f9d72=t7f9d72-1
   for j=1,n do t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=pt[j] end
 end
 hbd8f95[0xe4c9]=function()
   s66e62a[t7f9d72]=not s66e62a[t7f9d72]
 end
 hbd8f95[0x6b1]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a / b
 end
 hbd8f95[0xe60d]=function()
   local _v=s66e62a[t7f9d72] s66e62a[t7f9d72]=nil t7f9d72=t7f9d72-1 if _v then i2771fe=wd9be0a.c[i2771fe] else i2771fe=i2771fe+1 end
 end
 hbd8f95[0xd9c]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a < b
 end
 hbd8f95[0x9c8c]=function()
   local id=wd9be0a.c[i2771fe] local v=s66e62a[t7f9d72] t7f9d72=t7f9d72-1 i2771fe=i2771fe+1
   local b=nil for i=#L72a205,1,-1 do b=L72a205[i][id] if b then break end end
   if b then b[1]=v end
 end
 hbd8f95[0xda2e]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a .. b
 end
 hbd8f95[0x3086]=function()
   s66e62a[t7f9d72]=s66e62a[t7f9d72][2]
 end
 hbd8f95[0x2275]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a ~= b
 end
 hbd8f95[0x4d1a]=function()
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]={}
 end
 hbd8f95[0xd4f9]=function()
   i2771fe=wd9be0a.c[i2771fe]
 end
 hbd8f95[0x8c38]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a >= b
 end
 hbd8f95[0x610e]=function()
   local ix=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   local n=m4d752f[ix]
   if not n then n=tonumber(ddccb8e(ix)) m4d752f[ix]=n end
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=n
 end
 hbd8f95[0x7382]=function()
   local id=wd9be0a.c[i2771fe] local b=nil i2771fe=i2771fe+1
   for i=#L72a205,1,-1 do b=L72a205[i][id] if b then break end end
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=b and b[1]
 end
 hbd8f95[0x499b]=function()
   s66e62a[t7f9d72],s66e62a[t7f9d72-1]=s66e62a[t7f9d72-1],s66e62a[t7f9d72]
 end
 hbd8f95[0xbf7a]=function()
   y974ace[#y974ace+1]={}
 end
 hbd8f95[0x84d3]=function()
   if not s66e62a[t7f9d72] then i2771fe=wd9be0a.c[i2771fe] else i2771fe=i2771fe+1 s66e62a[t7f9d72]=nil t7f9d72=t7f9d72-1 end
 end
 hbd8f95[0x7756]=function()
   local p=s66e62a[t7f9d72] t7f9d72=t7f9d72-1 local t=s66e62a[t7f9d72] s66e62a[t7f9d72]=nil t7f9d72=t7f9d72-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 hbd8f95[0xad88]=function()
   y974ace[#y974ace]=nil
 end
 hbd8f95[0x196a]=function()
   local k=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   local p=s66e62a[t7f9d72] t7f9d72=t7f9d72-1
   local a={} for j=1,k do a[j]=s66e62a[t7f9d72-k+j] end t7f9d72=t7f9d72-k
   for j=1,p.n do a[k+j]=p[j] end
   if f5341d3>0 then local caller=Gaf455e[f5341d3]; f5341d3=f5341d3-1; wd9be0a=caller.code; i2771fe=caller.pc; b3954e9=caller.base; k747558=caller.top; s66e62a=caller.s; t7f9d72=caller.sp; y974ace=caller.sc; afa3983=caller.va; L72a205=caller.lk; F93e924=caller; if caller.nRet==1 then t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=a[1] elseif caller.nRet==-1 then local r=P8bb6ad(u1a291f(a)); t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=r else for j=1,#a do t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=a[j] end end else return u1a291f(a) end
 end
 hbd8f95[0x6d25]=function()
   local n=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   local f=s66e62a[t7f9d72-n]
   local a={}
   for j=1,n do a[j]=s66e62a[t7f9d72-n+j] end
   local retDest=t7f9d72-n
   t7f9d72=t7f9d72-n-1
   local la=#a
   if la>0 and q623c5a(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   if jca85e7[f] then
     F93e924.pc=i2771fe; F93e924.base=b3954e9; F93e924.top=k747558; F93e924.code=wd9be0a; F93e924.s=s66e62a; F93e924.sp=t7f9d72; F93e924.sc=y974ace; F93e924.va=afa3983; F93e924.lk=L72a205; F93e924.retDest=retDest; F93e924.nRet=-1
     Gaf455e[f5341d3+1]=F93e924; f5341d3=f5341d3+1
     local callee=K447f04[f.proto]
     wd9be0a=callee; i2771fe=1
     b3954e9=k747558+1; k747558=b3954e9+(callee.maxReg or 32)
     s66e62a={}; t7f9d72=0; y974ace={{}}
     for i=1,#callee.p do local c={a[i]} eba26cf[b3954e9+callee.p[i]]=c; y974ace[1][callee.p[i]]=c end
     if callee.v then afa3983=P8bb6ad(select(#callee.p+1, u1a291f(a))) else afa3983=nil end
     L72a205=f.env
     F93e924={chunk=f.proto,pc=i2771fe,base=b3954e9,top=k747558,code=wd9be0a,s=s66e62a,sp=t7f9d72,sc=y974ace,reg=eba26cf,va=afa3983,lk=L72a205,retDest=retDest,nRet=-1,caller=Gaf455e[f5341d3]}
     Gaf455e[f5341d3]=F93e924
   else
     local r=P8bb6ad(f(u1a291f(a)))
     t7f9d72=t7f9d72+1
     s66e62a[t7f9d72]=r
   end
 end
 hbd8f95[0x8ac8]=function()
   s66e62a[t7f9d72]=#s66e62a[t7f9d72]
 end
 hbd8f95[0x9c72]=function()
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=nil
 end
 hbd8f95[0x69ba]=function()
   -- CLOSE F93e924 (no-op, cells live via L72a205)
 end
 hbd8f95[0xd448]=function()
   local ix=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   s66e62a[t7f9d72]=s66e62a[t7f9d72][ix]
 end
 hbd8f95[0x3ca7]=function()
   if s66e62a[t7f9d72] then i2771fe=wd9be0a.c[i2771fe] else i2771fe=i2771fe+1 s66e62a[t7f9d72]=nil t7f9d72=t7f9d72-1 end
 end
 hbd8f95[0xc1f1]=function()
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=gacc091[ddccb8e(wd9be0a.c[i2771fe])] i2771fe=i2771fe+1
 end
 hbd8f95[0x7180]=function()
   local _v=s66e62a[t7f9d72] s66e62a[t7f9d72]=nil t7f9d72=t7f9d72-1 if not _v then i2771fe=wd9be0a.c[i2771fe] else i2771fe=i2771fe+1 end
 end
 hbd8f95[0x6639]=function()
   s66e62a[t7f9d72]=-s66e62a[t7f9d72]
 end
 hbd8f95[0x5435]=function()
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=ddccb8e(wd9be0a.c[i2771fe]) i2771fe=i2771fe+1
 end
 hbd8f95[0x99b1]=function()
   local n=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   if f5341d3>0 then
     local retVals={}
     if n==0 then local _=0
     elseif n==1 then retVals[1]=s66e62a[t7f9d72]; t7f9d72=t7f9d72-1
     else for j=1,n do retVals[j]=s66e62a[t7f9d72-n+j] end; t7f9d72=t7f9d72-n end
     local caller=Gaf455e[f5341d3]; f5341d3=f5341d3-1; wd9be0a=caller.code; i2771fe=caller.pc; b3954e9=caller.base; k747558=caller.top; s66e62a=caller.s; t7f9d72=caller.sp; y974ace=caller.sc; afa3983=caller.va; L72a205=caller.lk; F93e924=caller
     if caller.nRet==1 then t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=retVals[1]
     elseif caller.nRet==-1 then local r=P8bb6ad(u1a291f(retVals)); t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=r
     else for j=1,#retVals do t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=retVals[j] end end
   else
     if n==0 then return end
     if n==1 then return s66e62a[t7f9d72] end
     local a={} for j=1,n do a[j]=s66e62a[t7f9d72-n+j] end; return u1a291f(a)
   end
 end
 hbd8f95[0x44a9]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a == b
 end
 hbd8f95[0xcfdb]=function()
   local v=s66e62a[t7f9d72] local k=s66e62a[t7f9d72-1] local t=s66e62a[t7f9d72-2] t[k]=v t7f9d72=t7f9d72-3
 end
 hbd8f95[0x9798]=function()
   local id=wd9be0a.c[i2771fe] local v=s66e62a[t7f9d72] s66e62a[t7f9d72]=nil t7f9d72=t7f9d72-1 i2771fe=i2771fe+1
   local cell={v}
   eba26cf[b3954e9+id]=cell
   y974ace[#y974ace][id]=cell
 end
 hbd8f95[0xcedb]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a ^ b
 end
 hbd8f95[0x1524]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a % b
 end
 hbd8f95[0x2540]=function()
   t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=s66e62a[t7f9d72-1]
 end
 hbd8f95[0x7298]=function()
   s66e62a[t7f9d72]=s66e62a[t7f9d72][1]
 end
 hbd8f95[0x314b]=function()
   local b=s66e62a[t7f9d72] local a=s66e62a[t7f9d72-1] t7f9d72=t7f9d72-1
   s66e62a[t7f9d72]=a <= b
 end
 hbd8f95[0x8716]=function()
   s66e62a[t7f9d72]=s66e62a[t7f9d72][3]
 end
 hbd8f95[0xa709]=function()
   local id=wd9be0a.c[i2771fe] local v=s66e62a[t7f9d72] t7f9d72=t7f9d72-1 i2771fe=i2771fe+1
   local cell=eba26cf[b3954e9+id]
   if cell then cell[1]=v else eba26cf[b3954e9+id]={v} end
   -- keep SC in sync for upvalue capture (live cell)
   local top=y974ace[#y974ace] if top then top[id]=eba26cf[b3954e9+id] end
 end
 hbd8f95[64734]=function()
  local t=s66e62a[t7f9d72] s66e62a[t7f9d72]=t
 end
 hbd8f95[64266]=function()
  i2771fe=wd9be0a.c[i2771fe]
 end
 hbd8f95[63637]=function()
  local t=s66e62a[t7f9d72] s66e62a[t7f9d72]=t
 end
 hbd8f95[64524]=function()
  local t=s66e62a[t7f9d72] s66e62a[t7f9d72]=t
 end
 hbd8f95[61787]=function()
  t7f9d72=t7f9d72+1 s66e62a[t7f9d72]=ddccb8e(wd9be0a.c[i2771fe]) i2771fe=i2771fe+1
 end
-- VM v2 hdr ver=2 build=2904502011 vm=3088847019 profile=BALANCED state=FR|HAND|S|CH|PC|LK|VA|SP|SC|CODE
-- frame layout stride=30 fields=FR,HAND,S,CH,PC,LK,VA,SP,SC,CODE regShuffle=on
 while true do
  local ob9ea5c=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
  if ob9ea5c==39345 then
   local n=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   if f5341d3>0 then
     local retVals={}
     if n==0 then local _=0
     elseif n==1 then retVals[1]=s66e62a[t7f9d72]; t7f9d72=t7f9d72-1
     else for j=1,n do retVals[j]=s66e62a[t7f9d72-n+j] end; t7f9d72=t7f9d72-n end
     local caller=Gaf455e[f5341d3]; f5341d3=f5341d3-1; wd9be0a=caller.code; i2771fe=caller.pc; b3954e9=caller.base; k747558=caller.top; s66e62a=caller.s; t7f9d72=caller.sp; y974ace=caller.sc; afa3983=caller.va; L72a205=caller.lk; F93e924=caller
     if caller.nRet==1 then t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=retVals[1]
     elseif caller.nRet==-1 then local r=P8bb6ad(u1a291f(retVals)); t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=r
     else for j=1,#retVals do t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=retVals[j] end end
   else
     if n==0 then return end
     if n==1 then return s66e62a[t7f9d72] end
     local a={} for j=1,n do a[j]=s66e62a[t7f9d72-n+j] end; return u1a291f(a)
   end
  end
  if ob9ea5c==6506 then
   local k=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   local p=s66e62a[t7f9d72] t7f9d72=t7f9d72-1
   local a={} for j=1,k do a[j]=s66e62a[t7f9d72-k+j] end t7f9d72=t7f9d72-k
   for j=1,p.n do a[k+j]=p[j] end
   if f5341d3>0 then local caller=Gaf455e[f5341d3]; f5341d3=f5341d3-1; wd9be0a=caller.code; i2771fe=caller.pc; b3954e9=caller.base; k747558=caller.top; s66e62a=caller.s; t7f9d72=caller.sp; y974ace=caller.sc; afa3983=caller.va; L72a205=caller.lk; F93e924=caller; if caller.nRet==1 then t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=a[1] elseif caller.nRet==-1 then local r=P8bb6ad(u1a291f(a)); t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=r else for j=1,#a do t7f9d72=t7f9d72+1; s66e62a[t7f9d72]=a[j] end end else return u1a291f(a) end
  end
  if ob9ea5c==52002 then
   local n=wd9be0a.c[i2771fe] i2771fe=i2771fe+1
   local f=s66e62a[t7f9d72-n]
   local a={} for j=1,n do a[j]=s66e62a[t7f9d72-n+j] end t7f9d72=t7f9d72-n-1
   local la=#a if la>0 and q623c5a(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end
   return f(u1a291f(a))
  end
  local _fn=hbd8f95[ob9ea5c]
  if _fn then _fn() else error("bad opcode "..tostring(ob9ea5c),0) end
 end
end
 if ((function() local a=7; local b=14; return (a*b)%7==0 end)()) then end
 if task and task.spawn then task.spawn(function() pcall(R44f407,4,{}) end) end
 for _ci=5,#K447f04 do if pcall(function() return R44f407(_ci,{}) end) then end end
do
 local ok,err=pcall(R44f407,4,{})
 if not ok then error(err,0) end
end