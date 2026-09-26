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
local v87a1cb={130,73,141,201,244,235,3,127,62,226,133,205,208,212,134,60,93,8,203,152,208,84,198,233,219,122,8,227,68,165,241,83,189,237,197,195,68,133,252,44,147,71,17,31,120,54,154,118,120,42,250,111,179,203,209,81,182,174,86,203,162,209,191,11,133,3,4,186,251,41,214,140,209,95,120,59,90,246,120,167,250,239,51,128,28,17,57,46,22,12,34,83,48,237,56,196,68,58,251,169,22,76,145,144,115,187,17,115,115,167,241,112,51,192,220,81,57,46,93,204,34,214,58,244,150,190,173,225,237,139,20,138,130,80,115,160,81,243,115,39,241,240,190,5,156,138,188,171,157,140,157,22,58,116,105,190,45,97,232,64,153,73,20,16,78,32,145,124,115,60,244,112,190,197,219,74,188,171,96,193,93,214,177,241,105,59,32,225,232,0,147,7,2,63,76,182,34,118,116}
local ce50f29={}
local r436d87={{0,2},{2,5},{7,57},{64,27},{91,42},{133,27},{160,39}}
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
 local src={55,217,220,64,251,26,148,109,162,196,32,120,39,51,153,97,133,107,192,40,193,186,22,200,219,46,57,75,211,188,6,167,169,12,198,225,92,53,111,249,234,60,78,187,90,33,69,195,163,223,210,125,202,128,146,5,207,250,231,72,178,87,88,181,115,141,8,218,18,162,145,219,138,147,248,21,180,99,66,126,25,17,101,180,35,152,102,144,27,253,69,133,194,69,253,27,144,102,152,43,26,101,18,25,106,66,99,224,2,246,147,138,220,145,161,18,65,206,141,115,180,88,87,178,210,136,250,207,7,146,128,202,238,186,223,163,192,68,33,90,83,235,60,234,250,105,53,93,122,0,12,169,165,6,188,211,191,133,79,219,202,22,187,193,42,234,10,133,99,153,50,39,85,4,56,162,109,148,28,251,4,196,217,55,237,7,121,76,117,171,242,63,130,206,78,16,46,168,131,186,81,70,169,71,66,189,198,173,52,30,86,213,237,74,254,54,12,91,137,17,62,74,237,152,203,23,52,175,70,189,84,155,203,70,82,149,84,168,46,227,172,232,227,131,252,11,123,99,36,7,236,175,98,220,64,146,129,148,109,86,162,42,120,21,125,153,97,135,6,230,40,36,130,22,200,205,252,31,75,49,236,6,167,3,158,198,225,123,239,105,249,68,52,229,239,177,197,68,195,227,157,124,117,126,250,146,5,165,32,134,110,72,66,88,181,55,149,8,218,124,209,145,221,44,64,248,190,60,62,66,125,230,174,101,26,117,135,102,144,227,94,69,228,6,21,253,27,153,166,152,43,60,191,17,25,127,131,99,224,190,248,147,156,221,189,161,18,218,242,152,115,181,28,79,178,110,232,138,207,5,52,83,202,117,160,130,163,195,187,158,90,239,202,139,234,249,227,245,93,225,36,92,169,167,172,46,211,75,67,140,219,200,20,122,193,40,125,204,133,97,153,218,39,120,162,101,162,109,40,18,251,64,241,247,55,236,173,235,76,123,101,130,63,227,9,74,16,46,51,155,186,82,185,41,71,84,22,211,173,52,235,92,241,237,176,235,24,137,190,191,24,254,108,55,241,86,227,174,173,135,161,146,71,150,105,133,186,131,135,153,16,78,130,57,63,242,5,219,76,121,173,126,55,217,128,131,251,28,107,198,162,56,54,190,39,50,217,35,133,10,201,159,193,187,238,107,219,79,253,27,211,188,172,53,169,12,224,59,93,53,124,77,234,60,229,239,90,50,68,252,163,223,124,143,223,128,146,12,15,250,134,50,113,87,88,160,199,141,8,198,212,161,145,242,93,147,248,10,154,99,66,247,217,17,101,163,205,152,102,212,3,253,69,198,190,69,253,181,152,102,152,25,85,101,17,54,170,66,99,104,227,248,147,114,126,145,161,171,60,8,141,55,173,88,87,219,243,134,250,46,1,146,128,33,145,124,223,227,129,68,33,169,13,229,60,92,76,105,53,228,7,198,12,160,103,6,188,83,158,31,79,117,192,22,187,29,117,230,10,133,137,153,50,121,103,42,56,94,103,148,28,212,29,220,217,157,126,7,121,204,174,11,242,145,235,232,78,251,202,168,131,149,133,70,150,236,0,189,135,81,62,23,86,220,195,74,254,253,191,91,137,68,61,74,237,95,94,23,52,136,130,189,84,9,215,70,82,149,52,168,46,236,68,232,227,134,20,11,123,212,194,7,236,89,169,220,64,26,24,148,109,144,119,42,120,39,218,153,97,219,21,230,40,119,14,22,200,57,31,31,75,230,59,6,167,143,214,198,225,169,175,105,249,54,97,229,239,20,96,68,195,8,139,124,117,203,128,223,5,207,228,134,69,178,87,88,46,181,141,8,216,30,161,145,85,215,147,248,212,58,99,66,135,12,17,101,28,226,152,102,182,193,253,69,27,79,69,253,62,149,102,152,101,91,101,17,252,68,66,99,246,13,248,147,132,125,145,161,27,26,8,141,29,197,88,87,167,218,134,250,253,74,146,128,125,184,124,223,43,158,68,33,208,47,229,60,199,215,105,53,84,33,198,12,41,114,6,188,50,79,31,79,48,44,22,187,118,229,230,10,49,27,153,50,155,118,42,56,27,139,148,28,253,137,220,217,107,47,7,121,234,168,11,242,164,37,232,78,80,108,168,131,73,176,70,150,205,148,189,135,128,26,23,86,105,86,74,254,62,83,91,137,182,246,74,237,195,25,23,52,237,197,189,84,236,194,70,82,187,131,181,46,16,76,232,203,63,242,11,103,138,121,7,91,250,217,220,200,166,28,148,209,172,56,42,86,162,50,153,203,23,10,230,73,231,187,22,102,211,79,31,87,21,188,6,136,126,12,198,74,9,53,105,1,73,60,229,192,7,33,68,91,24,223,124,27,186,128,146,16,123,250,134,245,170,87,88,181,155,141,8,132,13,161,145,37,41,147,248,147,206,99,66,72,158,17,101,56,113,152,102,111,176,253,69,127,34,69,253,85,209,102,152,216,248,101,17,229,119,66,99,26,171,248,147,191,90,145,161,52,0,8,141,113,116,88,87,174,168,134,250,129,68,146,128,148,106,124,223,41,3,68,33,119,193,229,60,236,48,105,53,52,124,198,12,86,12,6,188,211,75,31,81,219,233,22,187,193,5,200,10,133,249,34,50,39,90,112,56,162,195,156,28,251,101,217,217,55,238,11,121,76,37,20,242,63,27,75,78,16,151,78,131,186,22,94,150,71,8,126,135,173,54,214,86,241,223,5,254,24,118,228,137,24,74,48,237,241,220,215,52,173,170,147,84,71,14,253,82,186,234,53,46,16,76,41,227,63,46,86,123,76,206,202,236,55,114,136,64,251,118,78,109,162,21,4,120,39,170,34,97,133,86,37,40,193,174,162,200,219,212,7,75,211,252,68,167,169,184,188,225,93,205,202,249,234,17,203,239,90,34,68,236,163,201,124,116,202,128,140,5,253,250,134,110,159,121,88,181,235,54,8,218,48,251,145,221,136,82,248,190,60,62,66,125,174,220,101,26,128,204,102,144,13,78,69,228,234,229,253,27,153,166,152,43,56,63,17,25,219,145,99,224,155,253,147,138,223,157,161,18,132,23,141,115,63,152,87,178,65,219,250,207,65,138,128,202,83,166,223,163,214,240,33,90,243,35,60,234,214,190,53,93,206,113,12,169,95,165,188,211,69,191,79,219,80,173,187,193,65,123,10,133,149,3,50,39,227,236,56,162,66,67,28,251,30,195,217,55,134,221,121,76,153,91,242,63,73,122,78,16,174,125,131,186,80,135,150,71,207,123,135,173,116,85,86,241,101,23,254,24,159,232,137,24,28,26,237,241,252,133,52,173,165,231,84,71,105,237,82,186,24,110,46,16,97,63,227,63,89,95,123,76,129,164,236,55,35,201,64,251,88,140,109,162,58,42,118,39,27,153,97,149,10,221,40,193,187,175,46,219,79,91,83,211,188,90,100,169,12,39,229,93,53,181,164,234,60,26,80,90,33,204,158,163,223,246,181,202,128,156,165,207,250,99,88,178,87,54,197,115,141,174,9,18,161,10,197,138,147,182,255,224,99,202,32,25,17,211,175,43,152,73,205,27,253,221,95,228,69,147,107,144,102,54,35,26,101,138,223,125,66,97,236,190,248,39,240,221,145,203,200,218,8,111,35,181,88,253,32,110,134,155,233,5,146,127,97,117,124,250,166,195,68,35,86,239,229,217,211,249,105,95,135,225,198,33,135,167,6,186,26,75,31,38,70,200,22,68,106,40,230,145,67,97,153,48,43,120,42,147,246,109,148,10,72,64,220,59,103,236,7,225,247,123,11,155,162,227,232,232,195,46,168,24,162,82,70,105,248,84,189,116,79,52,23,60,43,237,74,28,72,137,91,35,138,254,74,207,171,86,23,203,6,135,189,113,66,150,70,18,248,131,168,203,41,78,232,27,156,242,11,117,236,121,7,116,140,217,220,33,221,28,148,108,162,113,42,120,49,50,213,97,133,10,203,6,193,187,35,79,219,79,113,59,211,188,19,19,169,12,218,39,93,53,39,184,234,60,109,178,90,33,242,118,163,223,81,91,202,128,214,29,207,250,160,180,178,87,246,189,115,141,45,223,18,161,110,98,138,147,166,161,224,99,190,119,25,17,135,74,43,152,34,136,27,253,25,39,228,69,255,218,144,102,189,46,26,101,81,91,125,66,235,189,190,248,249,80,221,145,175,178,218,8,21,200,181,88,117,232,110,134,5,100,5,146,165,207,117,124,240,116,195,68,14,237,239,229,138,95,249,105,207,72,225,198,166,59,167,6,210,163,75,31,187,65,200,22,32,7,40,230,189,72,97,153,153,115,120,42,82,120,109,148,254,171,64,220,60,1,236,7,24,106,123,11,231,139,227,232,82,214,46,168,205,251,82,70,200,88,84,189,123,167,52,23,172,228,237,74,186,0,137,91,224,133,254,74,239,48,86,23,232,240,135,189,26,6,150,70,161,88,131,168,56,163,78,232,237,159,242,11,78,203,121,7,176,244,217,220,230,40,28,148,246,100,56,42,122,43,50,153,63,154,10,230,66,27,187,22,50,206,79,31,77,26,188,6,198,143,12,198,30,246,53,105,203,165,60,229,88,151,33,68,48,65,223,124,195,127,128,146,11,111,250,134,42,170,87,88,220,238,141,8,216,211,161,145,221,138,147,226,190,216,99,66,125,52,63,101,26,179,35,102,144,61,39,69,228,241,241,253,27,181,99,152,43,84,36,17,25,35,93,99,224,70,91,147,138,63,193,161,18,220,193,141,115,220,197,87,178,145,45,250,207,217,207,128,202,194,177,223,163,38,125,33,90,23,70,60,234,3,124,53,93,165,222,12,169,198,32,188,211,191,133,79,219,83,14,187,193,104,164,10,133,63,134,50,39,206,159,56,162,212,114,28,251,216,103,217,55,141,33,121,76,221,216,242,63,63,181,78,16,153,101,131,186,183,127,150,71,168,183,135,173,27,74,86,241,117,241,254,24,171,1,137,24,235,254,237,241,189,243,52,173,199,255,84,71,101,164,82,186,127,162,46,16,97,181,227,63,199,140,123,76,249,210,236,55,56,216,64,251,57,145,109,162,120,104,120,39,153,205,97,133,28,85,40,193,150,56,200,219,122,152,75,211,224,197,167,169,162,206,225,93,7,38,249,234,62,233,239,90,149,62,195,163,181,166,117,202,128,146,5,211,250,165,110,178,87,68,115,115,141,72,152,18,161,207,194,138,147,146,100,224,99,108,248,25,17,253,161,43,152,230,69,27,253,235,236,228,69,207,84,144,102,103,148,26,101,186,77,125,66,155,67,190,248,105,159,221,145,229,10,218,8,209,176,181,88,249,186,110,134,17,43,5,146,55,7,117,124,129,188,195,68,75,128,239,229,17,196,249,105,0,218,225,198,42,115,167,6,18,219,75,31,147,134,200,22,12,12,40,230,190,255,97,153,132,146,120,42,21,140,109,148,41,124,64,220,184,17,236,7,134,231,123,11,215,58,227,232,249,221,46,168,40,238,82,70,151,71,89,189,135,185,52,52,86,241,237,120,177,24,137,91,97,24,254,185,15,241,86,161,129,173,135,95,4,71,150,64,155,186,131,193,179,16,78,23,72,63,242,57,52,76,121,40,59,55,217,130,95,251,28,40,99,162,56,5,37,39,50,51,243,133,10,102,253,193,187,176,27,219,79,58,78,211,188,41,112,169,12,233,86,93,53,227,57,234,60,200,193,90,33,0,219,163,223,90,175,202,128,109,174,207,250,154,168,178,87,90,185,115,141,86,197,18,161,135,110,138,147,215,227,224,99,68,180,25,17,4,60,43,152,115,36,27,253,89,34,228,69,189,89,144,102,107,201,26,101}
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
   if f87a1cb>0 then local caller=G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller.code; i0f2943=caller.pc; b6d87a1=caller.base; kcbe50f=caller.top; se50f29=caller.s; t436d87=caller.sp; ya1cbe5=caller.sc; a87a1cb=caller.va; L29436d=caller.lk; Fa1cbe5=caller; if caller.nRet==1 then t436d87=t436d87+1; se50f29[t436d87]=a[1] elseif caller.nRet==-1 then local r=P29436d(u9436d8(a)); t436d87=t436d87+1; se50f29[t436d87]=r else for j=1,#a do t436d87=t436d87+1; se50f29[t436d87]=a[j] end end else return u9436d8(a) end
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
     local caller=G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller.code; i0f2943=caller.pc; b6d87a1=caller.base; kcbe50f=caller.top; se50f29=caller.s; t436d87=caller.sp; ya1cbe5=caller.sc; a87a1cb=caller.va; L29436d=caller.lk; Fa1cbe5=caller
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
     local caller=G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller.code; i0f2943=caller.pc; b6d87a1=caller.base; kcbe50f=caller.top; se50f29=caller.s; t436d87=caller.sp; ya1cbe5=caller.sc; a87a1cb=caller.va; L29436d=caller.lk; Fa1cbe5=caller
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