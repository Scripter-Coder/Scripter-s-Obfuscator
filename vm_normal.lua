local _d9436d8=function(a36d87a,b1cbe50,...)
 while true do
  local _s7a1c={} local _tbe50=0
  local _yf294={{}}
  local _i36d8=1
  local _w7a1c=a36d87a[b1cbe50]
  local of29436=_w7a1c.c[_i36d8]
  if of29436==1 then _s7a1c[_tbe50]="x" end
 end
end
local _bbe50={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _rf294={{1,41}}
local dd87a1c=function(i) local a=_bbe50[1] local rr=_rf294[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _bbe502={214,17,239,131,189,168} do local rp=1 while rp<=#_bbe502 do local np=_bbe502[rp]+_bbe502[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_bbe502[rp]+_bbe502[rp+1]*256 rp=rp+2 end local va=(_bbe502[rp]==1) rp=rp+1 local nc=_bbe502[rp]+_bbe502[rp+1]*256+_bbe502[rp+2]*65536+_bbe502[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_bbe502[rp]+_bbe502[rp+1]*256+_bbe502[rp+2]*65536+_bbe502[rp+3]*16777216 rp=rp+4 end end end
end
local g87a1cb=_G
if getgenv then g87a1cb=getgenv() end
if not g87a1cb then g87a1cb=_G end
local v87a1cb={130,73,204,116,171,253,102,134,164,172,211,7,234,90,120,182,95,246,69,42,250,234,168,11,145,148,182,161,150,139,167,17,63,75,83,193,54,123,226,86,201,49,255,181,130,184,44,204,130,148,84,181,89,141,103,211,244,168,32,57,248,39,241,233,153,223,54,252,237,11,148,10,255,53,66,189,44,140,66,209,20,53,153,86,98,147,243,40,160,70,248,167,236,75,86,62,182,124,237,75,212,202,255,50,9,61,167,241,121,17,79,50,89,22,98,211,243,40,171,134,248,152,236,238,20,216,251,35,79,77,218,232,56,28,23,54,167,113,121,209,143,178,28,91,98,104,254,165,43,70,255,88,236,110,211,152,251,35,130,182,133,109,194,178,140,182,39,246,121,154,66,178,92,155,109,232,254,165,46,3,255,24,231,243,147,197,254,163,66,182,197,237,184,153,154,92,152,248,74,88,8}
local ce50f29={}
local r436d87={{0,2},{2,1},{3,1},{4,5},{9,57},{66,27},{93,42},{135,27},{162,39}}
local m0f2943={}
local ivbe50f2=55
local da1cbe5=function(i)
 local c=ce50f29[i] if c then return c end
 local rr=r436d87[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=ivbe50f2
 for j=1,ln do
  local p=st+j
  local a=v87a1cb[p] local b=(47*p+247+123*1.0*((p*p)%15))%251+227
  local kb=(b + prev*38)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 ce50f29[i]=t return t
end
local u9436d8
if table.unpack then u9436d8=table.unpack else u9436d8=unpack end
if not u9436d8 then u9436d8=unpack end
local P29436d=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m7a1cbe50f2"]=true
 return t
end
local q9436d8=function(t) return type(t)=="table" and t["m7a1cbe50f2"]==true end
local b9436d8={}
do
 local src={55,217,220,64,251,26,148,109,162,196,32,120,39,51,153,97,133,107,192,40,193,186,22,200,219,46,57,75,211,188,6,167,169,12,198,225,94,53,102,249,234,60,78,187,90,33,71,195,163,223,56,109,202,128,146,5,207,250,29,168,178,87,89,181,115,141,10,214,18,161,144,221,138,147,4,180,224,99,64,125,25,17,59,5,43,152,7,182,27,253,68,228,228,69,156,61,144,102,152,43,26,101,17,25,125,71,99,239,190,248,147,33,137,145,161,23,218,8,141,55,173,88,87,178,110,134,250,84,195,146,128,206,117,124,223,161,207,68,33,94,239,229,60,22,243,105,53,94,225,198,12,247,184,6,188,178,109,31,79,218,200,22,187,160,14,230,10,133,97,153,50,39,120,42,61,162,122,148,28,251,252,210,217,55,237,7,121,76,224,205,242,63,224,232,78,16,146,166,131,186,80,70,150,71,207,123,135,173,49,23,86,241,81,68,254,24,138,91,137,24,101,140,237,241,84,23,52,173,115,39,84,71,146,70,82,186,129,164,46,16,76,232,227,63,223,37,123,76,121,7,236,55,157,196,64,251,29,148,109,162,54,138,120,39,83,191,97,133,10,230,40,193,184,22,247,219,89,31,10,211,188,15,167,141,12,198,225,115,176,105,249,227,252,229,239,51,188,68,195,161,30,124,117,22,221,146,5,224,45,134,110,65,181,88,181,207,131,8,218,61,252,145,221,18,40,248,190,137,254,66,125,237,139,101,26,25,215,102,144,25,241,69,228,1,124,253,27,134,213,152,43,248,53,17,25,215,208,99,224,152,34,147,138,115,153,161,18,49,236,141,115,245,26,87,178,218,252,250,207,111,72,128,202,143,105,223,163,135,92,33,90,129,149,60,234,95,186,53,93,61,155,12,169,88,185,188,211,21,0,79,219,48,181,187,193,202,182,10,133,104,89,50,39,94,240,56,162,111,85,28,251,64,220,217,33,236,43,121,76,123,241,231,63,227,172,86,16,46,198,243,186,82,224,69,71,84,97,218,173,52,232,233,241,237,101,73,24,137,209,73,24,254,168,189,241,86,189,166,173,135,225,151,71,150,68,147,186,131,51,232,16,78,232,11,63,242,131,38,76,121,187,226,55,217,241,110,251,28,62,255,162,56,68,8,39,50,120,101,133,10,125,48,193,187,233,119,219,79,180,31,211,188,250,173,169,12,60,244,93,53,140,207,234,60,195,53,90,33,176,89,163,223,96,179,202,128,189,210,207,250,169,217,178,87,50,111,115,141,6,122,18,161,59,79,138,147,164,125,224,99,189,214,25,17,121,220,43,152,38,210,27,253,106,83,228,69,5,184,144,102,122,123,26,101,187,139,125,66,69,58,190,248,134,62,221,145,161,18,218,27,141,76,181,88,87,72,123,134,250,198,197,146,128,150,182,124,223,182,119,68,33,70,41,229,60,197,46,105,53,233,155,198,12,35,103,6,188,106,173,31,79,159,208,22,187,227,114,230,10,43,105,153,50,21,55,42,56,141,186,148,28,115,29,220,217,207,79,7,121,245,157,11,242,123,251,232,78,121,179,168,131,91,86,70,150,172,176,189,135,237,118,23,86,2,15,74,254,174,60,91,137,161,24,74,237,248,150,23,52,45,82,189,84,233,158,70,82,102,222,168,46,16,166,232,227,97,237,11,123,176,115,7,236,24,132,220,64,81,142,148,109,34,237,42,120,137,58,153,97,110,238,230,40,238,108,22,200,112,27,31,75,47,182,6,167,132,34,198,225,184,3,105,249,182,255,229,239,244,41,68,195,134,218,124,117,132,193,146,5,224,77,134,110,78,93,88,181,202,107,8,218,138,26,145,221,228,227,248,190,1,103,66,125,43,94,101,26,43,112,102,144,69,226,69,228,82,240,253,27,114,54,152,43,47,226,17,25,91,152,99,224,74,98,147,138,1,204,161,18,148,73,141,115,30,12,87,178,111,134,183,207,5,140,128,225,117,124,223,56,5,68,33,88,227,229,60,98,164,105,53,55,59,198,12,83,178,6,188,213,130,31,79,253,18,22,187,62,131,230,10,160,100,153,50,105,57,42,56,71,84,148,28,237,243,220,217,57,76,7,121,69,187,11,242,81,147,232,78,5,154,168,131,136,29,70,150,240,153,189,135,37,105,23,86,123,45,74,254,53,167,91,137,17,62,74,237,113,131,23,52,76,131,189,84,172,114,70,82,13,78,168,46,164,52,232,227,131,252,11,123,245,159,7,236,49,16,220,64,167,223,148,109,4,235,42,120,188,244,153,97,197,72,230,40,50,89,22,200,81,143,31,75,254,146,6,167,49,183,198,225,123,239,105,249,68,52,229,239,104,110,68,195,227,157,124,117,97,212,146,5,206,250,155,110,178,85,88,157,115,141,8,198,212,161,145,106,71,147,248,54,189,99,66,193,23,17,101,52,174,152,102,58,137,253,69,133,194,69,253,181,152,102,152,55,220,101,17,54,170,66,99,75,234,248,147,114,126,145,161,61,135,8,141,235,14,88,87,220,30,134,250,218,177,146,128,81,109,124,223,163,43,68,33,4,240,229,60,18,90,105,53,112,207,198,12,156,32,6,188,241,17,31,79,36,99,22,187,90,238,230,10,203,32,153,50,212,154,42,56,94,103,148,28,1,85,220,217,2,107,7,121,106,161,11,242,61,34,232,78,12,232,168,131,244,19,70,150,25,75,189,135,39,244,23,86,220,195,74,254,30,64,91,137,113,99,74,237,14,253,23,52,173,135,189,74,71,183,70,82,186,174,134,46,16,214,83,227,63,208,81,123,76,215,15,236,55,252,217,64,251,30,152,109,162,102,53,120,39,202,58,97,133,179,0,40,193,255,14,200,219,19,220,75,211,190,199,167,169,62,137,225,93,202,214,249,234,136,159,239,90,171,132,195,163,242,82,117,202,24,41,5,207,147,27,110,178,85,153,181,115,81,85,218,18,22,92,221,138,56,172,190,224,9,152,125,25,60,75,26,43,0,221,144,27,161,134,228,228,80,73,27,144,253,128,43,26,37,83,25,125,246,25,224,190,0,48,138,221,188,143,18,218,11,141,92,181,78,87,179,110,134,228,207,55,146,128,202,88,82,223,163,91,255,33,90,205,191,60,234,251,168,53,93,61,155,12,169,16,203,188,211,224,75,79,219,222,165,187,193,38,70,10,133,104,89,50,39,90,112,56,162,203,71,28,251,101,217,217,55,238,11,121,76,37,20,242,63,105,40,78,16,1,245,131,186,22,94,150,71,114,103,135,173,33,163,86,241,241,140,254,24,166,140,137,24,209,253,237,241,174,180,52,173,137,29,84,71,14,253,82,186,234,53,46,16,186,114,227,63,105,205,123,76,86,208,236,55,135,195,64,251,118,78,109,162,218,122,120,39,152,11,97,133,138,51,40,193,185,215,200,219,212,217,75,211,252,68,167,169,132,155,225,93,35,218,249,234,222,181,239,90,139,214,195,163,253,38,117,202,127,57,5,207,97,64,110,178,120,143,181,115,38,92,218,18,89,50,221,138,105,237,190,224,39,90,125,25,19,101,20,43,177,102,144,11,253,126,228,228,69,68,253,144,102,220,51,26,101,77,218,125,66,130,228,190,248,79,215,221,145,94,173,218,8,5,46,181,88,221,114,110,134,244,111,5,146,101,252,117,124,177,211,195,68,135,137,239,229,167,242,249,105,123,28,225,198,132,244,167,6,10,102,75,31,96,134,200,22,35,122,40,230,100,245,97,153,156,47,120,42,163,100,109,148,30,247,64,220,109,77,236,7,19,150,123,11,16,111,227,232,228,130,46,168,226,156,82,70,105,236,84,189,162,168,52,23,84,253,237,74,27,33,137,91,227,194,254,74,192,223,86,23,50,100,135,189,61,218,150,70,173,17,131,168,181,214,78,232,225,51,242,11,208,24,121,7,250,132,217,220,162,171,28,148,245,25,56,42,17,186,50,153,199,86,10,230,179,217,187,22,55,100,79,31,184,49,188,6,205,115,12,198,3,13,53,105,83,120,60,229,205,0,33,68,60,8,223,124,80,207,128,146,69,141,250,134,139,139,87,88,77,208,141,8,212,178,161,145,69,49,147,248,223,198,99,66,124,25,88,101,26,61,152,42,144,27,253,104,202,228,69,200,156,144,102,246,91,26,101,4,173,125,66,127,38,190,248,221,203,221,145,41,79,218,8,59,198,181,88,122,156,110,134,190,215,5,146,166,16,117,124,113,171,195,68,4,95,239,229,195,85,249,105,107,66,225,198,240,163,167,6,94,131,75,31,11,195,200,22,231,2,40,230,8,68,97,153,23,34,120,42,120,224,109,148,148,166,64,220,179,237,236,7,119,236,123,11,106,132,227,232,108,74,46,168,124,17,82,70,179,66,84,189,168,122,52,23,121,70,237,74,72,173,137,91,115,13,254,74,71,99,86,23,90,221,135,189,160,221,150,70,201,124,131,168,153,221,78,232,72,107,242,11,17,150,121,7,14,103,217,220,165,205,28,148,12,132,56,42,109,147,50,153,125,67,10,230,102,128,187,22,150,196,79,31,183,217,188,6,93,188,12,198,165,69,53,105,144,119,60,229,237,155,33,68,31,254,223,124,59,139,128,146,246,45,250,134,120,1,87,88,187,211,141,8,239,149,161,145,129,73,147,248,24,51,99,66,230,223,17,101,24,39,152,102,206,4,253,69,142,62,69,253,225,133,102,152,45,211,101,17,120,91,66,99,31,21,248,147,184,146,145,161,165,23,8,141,128,87,88,87,4,219,134,250,193,165,146,128,142,109,124,223,202,94,68,33,88,46,229,60,234,249,105,47,93,217,198,12,169,138,40,188,211,211,164,79,219,238,204,187,193,61,82,10,133,68,156,50,39,54,107,56,162,51,139,28,251,184,127,217,55,14,87,121,76,125,194,242,63,138,117,78,16,209,3,131,186,142,27,150,71,227,112,135,173,209,46,86,241,21,233,254,24,115,78,137,24,186,82,237,241,55,49,52,173,115,39,84,71,13,94,82,186,195,234,46,16,16,247,227,63,68,190,123,76,192,225,236,55,65,103,64,251,125,178,109,162,158,249,120,39,238,196,97,133,189,43,40,193,94,47,200,219,179,21,75,211,147,91,167,169,148,125,225,93,23,51,249,234,41,81,239,90,202,160,195,163,159,62,117,202,115,112,5,207,6,140,110,178,120,5,181,115,184,143,218,18,33,68,221,138,114,252,190,224,70,71,125,25,81,39,26,43,51,50,144,27,235,246,228,228,104,211,27,144,83,31,43,26,57,210,25,125,236,107,224,190,202,220,138,221,147,173,18,218,188,247,115,181,50,141,178,110,134,250,207,25,146,163,202,117,124,195,101,195,68,97,24,239,229,98,245,249,105,95,135,225,198,34,44,167,6,36,104,75,31,207,14,200,22,21,201,40,230,56,202,97,153,205,152,120,42,147,246,109,148,228,88,64,220,35,34,236,7,61,84,123,11,174,252,227,232,224,24,46,168,104,94,82,70,33,138,84,189,217,178,52,23,60,43,237,74,211,54,137,91,188,159,254,74,203,43,86,23,154,165,135,189,136,26,150,70,229,119,131,168,154,106,78,232,85,138,242,11,86,98,121,7,217,176,217,220,33,221,28,148,146,9,56,42,93,34,50,153,214,72,10,230,131,149,187,22,201,219,66,31,75,199,188,37,167,169,12,244,174,93,53,105,17,234,60,22,13,90,33,242,118,163,223,158,37,202,128,148,204,207,250,239,243,178,87,167,30,115,141,58,149,18,161,190,10,138,147,166,161,224,99,254,115,25,17,74,71,43,152,204,2,27,253,197,49,228,69,91,200,144,102,189,46,26,101,62,206,125,66,76,87,190,248,25,74,221,145,140,60,218,8,201,107,181,88,113,104,110,134,5,100,5,146,156,12,117,124,221,175,195,68,127,69,239,229,42,89,249,105,26,0,225,198,10,96,167,6,221,245,75,31,90,111,200,22,167,7,40,230,74,199,97,153,193,197,120,42}
 for i=1,#src do
  local a=src[(i)] local _junk7a1=0 local b=((i*i*46+i*24+232)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b9436d8[i]=r
 end
end
local Kcbe50f={}
do
 local rp=1
 while rp<=#b9436d8 do
  local np=b9436d8[rp] + b9436d8[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b9436d8[rp] + b9436d8[rp+1]*256 rp=rp+2 end
  local va=(b9436d8[rp]==1) rp=rp+1
  local mr=b9436d8[rp] + b9436d8[rp+1]*256 rp=rp+2
  local nc=b9436d8[rp] + b9436d8[rp+1]*256 + b9436d8[rp+2]*65536 + b9436d8[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b9436d8[rp] + b9436d8[rp+1]*256 + b9436d8[rp+2]*65536 + b9436d8[rp+3]*16777216
   rp=rp+4
  end
  Kcbe50f[#Kcbe50f+1]={c=cd,p=ps,v=va,maxReg=mr}
 end
end
local R6d87a1
R6d87a1=function(xe50f29,L29436d,...)
 local w6d87a1=Kcbe50f[xe50f29]
 local se50f29={} local t436d87=0
 local ya1cbe5={{}}
 local a87a1cb=nil
 local i0f2943=1
 local ps=w6d87a1.p
 local e0f2943={} local b6d87a1=0 local kcbe50f=w6d87a1.maxReg or 32
 local G29436d={} local f87a1cb=0
 for i=1,#ps do local cell={select(i,...)} e0f2943[b6d87a1+ps[i]]=cell ya1cbe5[1][ps[i]]=cell end
 if w6d87a1.v then a87a1cb=P29436d(select(#ps+1,...)) end
 local Fa1cbe5={chunk=xe50f29,pc=i0f2943,base=b6d87a1,top=kcbe50f,ret=nil,nRet=0,vararg=a87a1cb,upenv=L29436d,caller=nil,build=578720886,reg=e0f2943}
 -- frame pc is alias of i0f2943, base=b6d87a1 top=kcbe50f reg window e0f2943[b6d87a1..kcbe50f]
 local je50f29={}
 je50f29._instr=true
 local hcbe50f={}
 hcbe50f[0xc102]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a / b
 end
 hcbe50f[0x2e2d]=function()
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local f=se50f29[t436d87-n]
   local a={}
   for j=1,n do a[j]=se50f29[t436d87-n+j] end
   t436d87=t436d87-n-1
   local la=#a
   if la>0 and q9436d8(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   if f and (je50f29[f] or (type(f)=="table" and f.isVM)) then
     if je50f29._instr then print(string.format("CALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Fa1cbe5.chunk or 0), tostring(f.proto or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(t436d87+1), tostring(-1))) end
     f87a1cb=f87a1cb+1
     G29436d[f87a1cb]={code=w6d87a1, pc=i0f2943, base=b6d87a1, top=kcbe50f, s=se50f29, sp=t436d87, sc=ya1cbe5, va=a87a1cb, lk=L29436d, fr=Fa1cbe5, nRet=-1, retDest=t436d87+1}
     local calleeProto2=f.proto
     local calleeChunk2=Kcbe50f[calleeProto2]
     local newBASE=kcbe50f+1
     b6d87a1=newBASE
     kcbe50f=b6d87a1+(calleeChunk2.maxReg or 32)
     se50f29={} t436d87=0
     ya1cbe5={{}}
     a87a1cb=nil
     L29436d=f.env
     w6d87a1=calleeChunk2
     i0f2943=1
     local ps2=w6d87a1.p
     for i2=1,#ps2 do local id2=ps2[i2] local v2=a[i2] local cell2={v2} e0f2943[b6d87a1+id2]=cell2 ya1cbe5[1][id2]=cell2 end
     if w6d87a1.v then
       local vaArgs2={} for i2=#ps2+1,#a do vaArgs2[#vaArgs2+1]=a[i2] end
       if #vaArgs2>0 then a87a1cb=P29436d(u9436d8(vaArgs2)) else local t2={n=0} t2["m7a1cbe50f2"]=true a87a1cb=t2 end
     end
     Fa1cbe5={chunk=calleeProto2, pc=i0f2943, base=b6d87a1, top=kcbe50f, ret=nil, nRet=0, vararg=a87a1cb, upenv=L29436d, caller=G29436d[f87a1cb]}
   else
     local r=P29436d(f(u9436d8(a)))
     t436d87=t436d87+1
     se50f29[t436d87]=r
   end
 end
 hcbe50f[0xbb98]=function()
   t436d87=t436d87+1 se50f29[t436d87]=true
 end
 hcbe50f[0xc61c]=function()
   se50f29[t436d87]=-se50f29[t436d87]
 end
 hcbe50f[0xc009]=function()
   local id=w6d87a1.c[i0f2943] local v=se50f29[t436d87] t436d87=t436d87-1 i0f2943=i0f2943+1
   local b=nil for i=#L29436d,1,-1 do b=L29436d[i][id] if b then break end end
   if b then b[1]=v end
 end
 hcbe50f[0x4f32]=function()
   if not a87a1cb then local t={n=0} t["m7a1cbe50f2"]=true a87a1cb=t end
   t436d87=t436d87+1 se50f29[t436d87]=a87a1cb
 end
 hcbe50f[0x8ae]=function()
   error("TAILCALL via HAND")
 end
 hcbe50f[0x414e]=function()
   se50f29[t436d87]=not se50f29[t436d87]
 end
 hcbe50f[0xc02]=function()
   local id=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local cell=e0f2943[b6d87a1+id]
   t436d87=t436d87+1 se50f29[t436d87]=cell and cell[1]
 end
 hcbe50f[0x5d2f]=function()
   ya1cbe5[#ya1cbe5+1]={}
 end
 hcbe50f[0x852e]=function()
   t436d87=t436d87+1 se50f29[t436d87]=false
 end
 hcbe50f[0xe800]=function()
   local k=se50f29[t436d87] t436d87=t436d87-1 local t=se50f29[t436d87] se50f29[t436d87]=t[k]
 end
 hcbe50f[0xb415]=function()
   ya1cbe5[#ya1cbe5]=nil
 end
 hcbe50f[0x8735]=function()
   t436d87=t436d87+1 se50f29[t436d87]=se50f29[t436d87-1]
 end
 hcbe50f[0x9af4]=function()
   t436d87=t436d87+1 se50f29[t436d87]=g87a1cb[da1cbe5(w6d87a1.c[i0f2943])] i0f2943=i0f2943+1
 end
 hcbe50f[0xe4eb]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a .. b
 end
 hcbe50f[0xafc]=function()
   local ix=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local n=m0f2943[ix]
   if not n then n=tonumber(da1cbe5(ix)) m0f2943[ix]=n end
   t436d87=t436d87+1 se50f29[t436d87]=n
 end
 hcbe50f[0x4240]=function()
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local pt=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1
   for j=1,n do t436d87=t436d87+1 se50f29[t436d87]=pt[j] end
 end
 hcbe50f[0x525]=function()
   t436d87=t436d87+1 se50f29[t436d87]=da1cbe5(w6d87a1.c[i0f2943]) i0f2943=i0f2943+1
 end
 hcbe50f[0xcdb7]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a ^ b
 end
 hcbe50f[0x1844]=function()
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local f=se50f29[t436d87-n]
   local a={}
   for j=1,n do a[j]=se50f29[t436d87-n+j] end
   t436d87=t436d87-n-1
   local la=#a
   if la>0 and q9436d8(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   if f and (je50f29[f] or (type(f)=="table" and f.isVM)) then
     if je50f29._instr then print(string.format("CALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Fa1cbe5.chunk or 0), tostring(f.proto or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(t436d87+1), tostring(1))) end
     f87a1cb=f87a1cb+1
     G29436d[f87a1cb]={code=w6d87a1, pc=i0f2943, base=b6d87a1, top=kcbe50f, s=se50f29, sp=t436d87, sc=ya1cbe5, va=a87a1cb, lk=L29436d, fr=Fa1cbe5, nRet=1, retDest=t436d87+1}
     local calleeProto2=f.proto
     local calleeChunk2=Kcbe50f[calleeProto2]
     local newBASE=kcbe50f+1
     b6d87a1=newBASE
     kcbe50f=b6d87a1+(calleeChunk2.maxReg or 32)
     se50f29={} t436d87=0
     ya1cbe5={{}}
     a87a1cb=nil
     L29436d=f.env
     w6d87a1=calleeChunk2
     i0f2943=1
     local ps2=w6d87a1.p
     for i2=1,#ps2 do local id2=ps2[i2] local v2=a[i2] local cell2={v2} e0f2943[b6d87a1+id2]=cell2 ya1cbe5[1][id2]=cell2 end
     if w6d87a1.v then
       local vaArgs2={} for i2=#ps2+1,#a do vaArgs2[#vaArgs2+1]=a[i2] end
       if #vaArgs2>0 then a87a1cb=P29436d(u9436d8(vaArgs2)) else local t2={n=0} t2["m7a1cbe50f2"]=true a87a1cb=t2 end
     end
     Fa1cbe5={chunk=calleeProto2, pc=i0f2943, base=b6d87a1, top=kcbe50f, ret=nil, nRet=0, vararg=a87a1cb, upenv=L29436d, caller=G29436d[f87a1cb]}
   else
     local r=P29436d(f(u9436d8(a)))
     t436d87=t436d87+1
     se50f29[t436d87]=r[1]
   end
 end
 hcbe50f[0x92aa]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a - b
 end
 hcbe50f[0x9d69]=function()
   -- CLOSE Fa1cbe5 (no-op, cells live via L29436d)
 end
 hcbe50f[0xda26]=function()
   if not se50f29[t436d87] then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 se50f29[t436d87]=nil t436d87=t436d87-1 end
 end
 hcbe50f[0x50e2]=function()
   local _v=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1 if _v then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 end
 end
 hcbe50f[0x4e1]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a > b
 end
 hcbe50f[0xd580]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a % b
 end
 hcbe50f[0x706e]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a >= b
 end
 hcbe50f[0xabff]=function()
   local _n=(se50f29[t436d87]==nil) se50f29[t436d87]=nil t436d87=t436d87-1 if _n then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 end
 end
 hcbe50f[0xebc]=function()
   local ci=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local links={}
   for i=1,#L29436d do links[#links+1]=L29436d[i] end
   for i=1,#ya1cbe5 do links[#links+1]=ya1cbe5[i] end
   local vmf={isVM=true, proto=ci, env=links, maxReg=Kcbe50f[ci].maxReg}
   setmetatable(vmf,{__call=function(_, ...) return R6d87a1(vmf.proto, vmf.env, ...) end})
   je50f29[vmf]=true
   t436d87=t436d87+1 se50f29[t436d87]=vmf
 end
 hcbe50f[0xa3f8]=function()
   se50f29[t436d87]=se50f29[t436d87][2]
 end
 hcbe50f[0xe6b9]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a <= b
 end
 hcbe50f[0xc906]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a < b
 end
 hcbe50f[0xc35c]=function()
   local ix=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   se50f29[t436d87]=se50f29[t436d87][ix]
 end
 hcbe50f[0x15fa]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a * b
 end
 hcbe50f[0xb316]=function()
   se50f29[t436d87]=#se50f29[t436d87]
 end
 hcbe50f[0xa00e]=function()
   se50f29[t436d87]=nil t436d87=t436d87-1
 end
 hcbe50f[0x5ddc]=function()
   local v=se50f29[t436d87] local k=se50f29[t436d87-1] local t=se50f29[t436d87-2] t[k]=v t436d87=t436d87-3
 end
 hcbe50f[0xb5b6]=function()
   t436d87=t436d87+1 se50f29[t436d87]={}
 end
 hcbe50f[0xd72f]=function()
   if se50f29[t436d87] then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 se50f29[t436d87]=nil t436d87=t436d87-1 end
 end
 hcbe50f[0xd3a6]=function()
   se50f29[t436d87],se50f29[t436d87-1]=se50f29[t436d87-1],se50f29[t436d87]
 end
 hcbe50f[0xe2f3]=function()
   t436d87=t436d87+1 se50f29[t436d87]=nil
 end
 hcbe50f[0xbfff]=function()
   local k=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local p=se50f29[t436d87] t436d87=t436d87-1
   local a={} for j=1,k do a[j]=se50f29[t436d87-k+j] end t436d87=t436d87-k
   for j=1,p.n do a[k+j]=p[j] end
   if f87a1cb>0 then local caller=G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller.code; i0f2943=caller.pc; b6d87a1=caller.base; kcbe50f=caller.top; se50f29=caller.s; t436d87=caller.sp; ya1cbe5=caller.sc; a87a1cb=caller.va; L29436d=caller.lk; Fa1cbe5=caller.fr or caller; if caller.nRet==1 then t436d87=t436d87+1; se50f29[t436d87]=a[1] elseif caller.nRet==-1 then local r=P29436d(u9436d8(a)); t436d87=t436d87+1; se50f29[t436d87]=r else for j=1,#a do t436d87=t436d87+1; se50f29[t436d87]=a[j] end end else return u9436d8(a) end
 end
 hcbe50f[0x36e5]=function()
   local _v=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1 if not _v then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 end
 end
 hcbe50f[0x7ab4]=function()
   se50f29[t436d87]=se50f29[t436d87][3]
 end
 hcbe50f[0xc69b]=function()
   local id=w6d87a1.c[i0f2943] local v=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1 i0f2943=i0f2943+1
   local cell={v}
   e0f2943[b6d87a1+id]=cell
   ya1cbe5[#ya1cbe5][id]=cell
 end
 hcbe50f[0x5a22]=function()
   g87a1cb[da1cbe5(w6d87a1.c[i0f2943])]=se50f29[t436d87] t436d87=t436d87-1 i0f2943=i0f2943+1
 end
 hcbe50f[0x5d88]=function()
   i0f2943=w6d87a1.c[i0f2943]
 end
 hcbe50f[0xda6a]=function()
   local id=w6d87a1.c[i0f2943] local v=se50f29[t436d87] t436d87=t436d87-1 i0f2943=i0f2943+1
   local cell=e0f2943[b6d87a1+id]
   if cell then cell[1]=v else e0f2943[b6d87a1+id]={v} end
   -- keep SC in sync for upvalue capture (live cell)
   local top=ya1cbe5[#ya1cbe5] if top then top[id]=e0f2943[b6d87a1+id] end
 end
 hcbe50f[0x54ab]=function()
   local id=w6d87a1.c[i0f2943] local b=nil i0f2943=i0f2943+1
   for i=#L29436d,1,-1 do b=L29436d[i][id] if b then break end end
   t436d87=t436d87+1 se50f29[t436d87]=b and b[1]
 end
 hcbe50f[0xb72f]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a ~= b
 end
 hcbe50f[0x2661]=function()
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   if f87a1cb>0 then
     if je50f29._instr then print(string.format("RETURN %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Fa1cbe5.chunk or 0), tostring(G29436d[f87a1cb].code and G29436d[f87a1cb].code.maxReg or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(G29436d[f87a1cb].retDest or 0), tostring(G29436d[f87a1cb].nRet or 0))) end
     local retVals={}
     if n==0 then local _=0
     elseif n==1 then retVals[1]=se50f29[t436d87]; t436d87=t436d87-1
     else for j=1,n do retVals[j]=se50f29[t436d87-n+j] end; t436d87=t436d87-n end
     local caller=G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller.code; i0f2943=caller.pc; b6d87a1=caller.base; kcbe50f=caller.top; se50f29=caller.s; t436d87=caller.sp; ya1cbe5=caller.sc; a87a1cb=caller.va; L29436d=caller.lk; Fa1cbe5=caller.fr or caller
     if caller.nRet==1 then t436d87=t436d87+1; se50f29[t436d87]=retVals[1]
     elseif caller.nRet==-1 then local r=P29436d(u9436d8(retVals)); t436d87=t436d87+1; se50f29[t436d87]=r
     else for j=1,#retVals do t436d87=t436d87+1; se50f29[t436d87]=retVals[j] end end
   else
     if n==0 then return end
     if n==1 then return se50f29[t436d87] end
     local a={} for j=1,n do a[j]=se50f29[t436d87-n+j] end; return u9436d8(a)
   end
 end
 hcbe50f[0xc08a]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a == b
 end
 hcbe50f[0x39e5]=function()
   local p=se50f29[t436d87] t436d87=t436d87-1 local t=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 hcbe50f[0x189b]=function()
   se50f29[t436d87]=se50f29[t436d87][1]
 end
 hcbe50f[0x1f5e]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a + b
 end
 hcbe50f[62795]=function()
  t436d87=t436d87+1 se50f29[t436d87]=da1cbe5(w6d87a1.c[i0f2943]) i0f2943=i0f2943+1
 end
 hcbe50f[60549]=function()
  i0f2943=w6d87a1.c[i0f2943]
 end
 hcbe50f[62423]=function()
  t436d87=t436d87+1 se50f29[t436d87]=da1cbe5(w6d87a1.c[i0f2943]) i0f2943=i0f2943+1
 end
 hcbe50f[60441]=function()
  i0f2943=w6d87a1.c[i0f2943]
 end
 hcbe50f[64571]=function()
  t436d87=t436d87+1 se50f29[t436d87]=da1cbe5(w6d87a1.c[i0f2943]) i0f2943=i0f2943+1
 end
 hcbe50f[60549]=function()
  i0f2943=w6d87a1.c[i0f2943]
 end
 while true do
  local ocbe50f=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
  if ocbe50f==9825 then
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   if f87a1cb>0 then
     if je50f29._instr then print(string.format("RETURN %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Fa1cbe5.chunk or 0), tostring(G29436d[f87a1cb].code and G29436d[f87a1cb].code.maxReg or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(G29436d[f87a1cb].retDest or 0), tostring(G29436d[f87a1cb].nRet or 0))) end
     local retVals={}
     if n==0 then local _=0
     elseif n==1 then retVals[1]=se50f29[t436d87]; t436d87=t436d87-1
     else for j=1,n do retVals[j]=se50f29[t436d87-n+j] end; t436d87=t436d87-n end
     local caller=G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller.code; i0f2943=caller.pc; b6d87a1=caller.base; kcbe50f=caller.top; se50f29=caller.s; t436d87=caller.sp; ya1cbe5=caller.sc; a87a1cb=caller.va; L29436d=caller.lk; Fa1cbe5=caller.fr or caller
     if caller.nRet==1 then t436d87=t436d87+1; se50f29[t436d87]=retVals[1]
     elseif caller.nRet==-1 then local r=P29436d(u9436d8(retVals)); t436d87=t436d87+1; se50f29[t436d87]=r
     else for j=1,#retVals do t436d87=t436d87+1; se50f29[t436d87]=retVals[j] end end
   else
     if n==0 then return end
     if n==1 then return se50f29[t436d87] end
     local a={} for j=1,n do a[j]=se50f29[t436d87-n+j] end; return u9436d8(a)
   end
  elseif ocbe50f==49151 then
   if je50f29._instr and f87a1cb>0 then print(string.format("RETURN RETP %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Fa1cbe5.chunk or 0), tostring(G29436d[f87a1cb].code and G29436d[f87a1cb].code.maxReg or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(G29436d[f87a1cb].retDest or 0), tostring(G29436d[f87a1cb].nRet or 0))) end
   local k=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local p=se50f29[t436d87] t436d87=t436d87-1
   local a={} for j=1,k do a[j]=se50f29[t436d87-k+j] end t436d87=t436d87-k
   for j=1,p.n do a[k+j]=p[j] end
   if f87a1cb>0 then local caller=G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller.code; i0f2943=caller.pc; b6d87a1=caller.base; kcbe50f=caller.top; se50f29=caller.s; t436d87=caller.sp; ya1cbe5=caller.sc; a87a1cb=caller.va; L29436d=caller.lk; Fa1cbe5=caller; if caller.nRet==1 then t436d87=t436d87+1; se50f29[t436d87]=a[1] elseif caller.nRet==-1 then local r=P29436d(u9436d8(a)); t436d87=t436d87+1; se50f29[t436d87]=r else for j=1,#a do t436d87=t436d87+1; se50f29[t436d87]=a[j] end end else return u9436d8(a) end
  elseif ocbe50f==2222 then
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local f=se50f29[t436d87-n]
   local a={} for j=1,n do a[j]=se50f29[t436d87-n+j] end t436d87=t436d87-n-1
   local la=#a if la>0 and q9436d8(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end
   if f and (je50f29[f] or (type(f)=="table" and f.isVM)) then
     if je50f29._instr then print(string.format("TAILCALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Fa1cbe5.chunk or 0), tostring(f.proto or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(-1), tostring(-1))) end
     local calleeProto3=f.proto local calleeChunk3=Kcbe50f[calleeProto3] for i3=b6d87a1,kcbe50f do e0f2943[i3]=nil end local newBASE3=b6d87a1 b6d87a1=newBASE3 kcbe50f=b6d87a1+(calleeChunk3.maxReg or 32) se50f29={} t436d87=0 ya1cbe5={{}} L29436d=f.env w6d87a1=calleeChunk3 i0f2943=1 local ps3=w6d87a1.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} e0f2943[b6d87a1+id3]=cell3 ya1cbe5[1][id3]=cell3 end if w6d87a1.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then a87a1cb=P29436d(u9436d8(vaArgs3)) else local t3={n=0} t3["m7a1cbe50f2"]=true a87a1cb=t3 end else a87a1cb=nil end Fa1cbe5={chunk=calleeProto3, pc=i0f2943, base=b6d87a1, top=kcbe50f, ret=nil, nRet=0, vararg=a87a1cb, upenv=L29436d, caller=Fa1cbe5.caller}
   else
     if f87a1cb>0 then
       local ret_P = P29436d(f(u9436d8(a)))
       local caller_T = G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller_T.code; i0f2943=caller_T.pc; b6d87a1=caller_T.base; kcbe50f=caller_T.top; se50f29=caller_T.s; t436d87=caller_T.sp; ya1cbe5=caller_T.sc; a87a1cb=caller_T.va; L29436d=caller_T.lk; Fa1cbe5=caller_T
       if caller_T.nRet==1 then t436d87=t436d87+1; se50f29[t436d87]=ret_P[1]
       elseif caller_T.nRet==-1 then t436d87=t436d87+1; se50f29[t436d87]=ret_P
       else for j_T=1,ret_P.n do t436d87=t436d87+1; se50f29[t436d87]=ret_P[j_T] end end
     else return f(u9436d8(a)) end
   end
  else
   local _fn=hcbe50f[ocbe50f]
   if _fn then _fn() else error("bad opcode "..tostring(ocbe50f),0) end
  end
 end
end
do
 local ok,err=pcall(R6d87a1,4,{})
 if not ok then error(err,0) end
end