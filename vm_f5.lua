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
local v87a1cb={192,49,121,110,41,36,56,192,108,36,21,198,215,149,222,14,127,138,122,134,20,111,47,238,50,213,61,128,41,214,108,96,56,254,72,0,153,22,185,171,170,248,52,20,149,161,99,109,189,149,147,20,202,172,220,198,23,33,79,168,75,106,166,72,26,42,31,227,240,236,161,73,158,6,155,114,1,239,219,72,83,84,138,171,25,6,92,161,15,163,11,106,163,8,87,33,223,227,112,236,33,9,222,77,220,114,108,96,58,8,20,159,202,43,217,198,156,161,64,35,75,97,35,67,151,161,160,238,240,236,33,73,27,141,28,109,134,234,196,70,206,253,177,184,219,67,119,178,128,35,240,97,35,131,108,161,160,238,117,235,90,140,219,77,209,109,70,225,132,25,139,253,49,184,144,201,25,36,69,190,112,97,172,70,236,36,37,238,245,235,154,76,155,16,145,109,11,225,193,89,203,240,58,56,208,67,119,53,207,28,123,82,70,4}
local ce50f29={}
local r436d87={{0,6},{6,5},{11,5},{16,6},{22,57},{79,27},{106,42},{148,27},{175,39}}
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
 local src={54,217,221,64,251,29,148,102,162,56,42,140,189,50,153,96,133,10,230,13,196,187,22,202,219,79,31,75,59,188,6,165,165,12,198,224,93,53,105,87,226,60,229,238,90,33,68,162,133,223,124,117,202,128,146,5,207,250,132,110,188,87,88,181,207,131,8,218,19,161,145,221,17,85,248,190,226,99,66,125,27,29,101,26,41,152,102,144,62,248,69,228,231,69,253,27,212,126,152,43,27,101,17,25,95,24,99,224,186,248,147,138,188,183,161,18,218,8,141,115,182,88,104,178,120,134,187,207,5,155,128,238,117,124,223,141,70,68,33,83,47,229,60,131,100,105,53,95,32,198,12,117,250,6,188,252,156,31,79,40,42,22,187,125,38,230,10,170,60,153,50,191,195,42,56,203,240,148,28,15,218,220,217,5,163,7,121,78,119,11,242,218,218,232,78,6,157,168,131,88,2,70,150,237,198,189,135,139,238,23,86,95,229,74,254,243,109,91,137,88,188,74,237,69,44,23,52,199,93,189,84,189,131,70,82,254,155,168,46,126,62,232,227,153,33,11,123,144,36,7,236,200,102,220,64,165,3,148,109,90,155,42,120,197,98,153,97,140,202,230,40,231,97,22,200,217,142,31,75,211,188,6,177,169,32,198,225,93,207,124,249,234,120,253,239,90,79,52,195,163,121,175,117,202,92,207,5,207,5,57,110,178,120,239,181,115,7,200,218,18,67,193,221,138,57,106,190,224,63,129,125,25,19,164,26,43,3,160,144,27,253,173,228,228,205,160,27,144,218,150,43,26,72,63,25,125,232,241,224,190,150,227,138,221,112,165,18,218,147,149,115,181,167,232,178,110,45,174,207,5,110,138,202,117,134,202,163,195,161,23,90,239,195,230,234,249,157,175,93,225,218,202,169,167,41,107,211,75,48,248,219,200,124,97,193,40,232,170,133,97,51,160,39,120,118,251,162,109,107,183,251,64,192,31,55,236,71,59,76,123,36,69,63,227,16,237,16,46,74,211,186,82,236,4,71,84,155,93,173,52,2,226,241,237,74,254,24,154,91,182,24,254,74,23,228,86,23,61,109,135,189,8,132,150,70,71,14,131,168,50,214,78,232,204,232,242,11,207,54,121,7,102,247,217,220,249,29,28,148,41,186,56,42,90,125,50,153,207,141,10,230,26,142,187,22,231,12,79,31,195,142,188,6,95,10,12,198,88,187,53,105,189,242,60,229,134,199,33,68,34,167,223,124,158,46,128,146,69,141,250,134,157,80,87,88,3,198,141,8,99,244,161,145,212,74,147,248,62,53,99,66,211,17,17,101,198,118,152,102,144,243,253,69,186,251,69,253,231,154,102,152,4,71,101,17,179,239,66,99,96,107,248,147,36,213,145,161,249,62,8,141,92,98,88,87,25,58,134,250,51,15,146,128,231,91,124,223,70,245,68,33,6,44,229,60,68,241,105,53,120,228,198,12,231,230,6,188,252,252,31,79,39,194,22,187,120,206,230,10,29,218,153,50,73,8,42,56,67,105,148,28,201,15,220,217,55,4,7,121,18,100,11,242,137,86,232,78,242,126,168,131,143,213,70,150,97,142,189,135,89,174,23,86,45,176,74,254,86,200,91,137,179,170,74,237,240,86,90,52,173,153,189,127,71,150,70,201,124,131,168,44,28,78,232,107,98,242,11,17,150,121,7,22,34,217,220,70,50,28,148,75,120,56,42,135,140,50,153,68,128,10,230,102,128,187,22,45,226,79,31,93,96,188,6,169,9,12,198,232,157,53,105,151,154,60,229,250,238,33,68,241,236,223,124,194,7,128,146,141,146,250,134,228,114,87,88,152,93,141,8,211,210,161,145,93,95,147,248,95,228,99,66,150,253,17,101,173,230,152,102,36,97,253,69,88,234,69,253,162,118,102,152,45,211,101,17,69,190,66,99,70,109,248,147,17,27,145,161,82,152,8,141,128,87,88,87,56,174,134,250,226,43,146,128,82,206,124,223,133,25,68,33,244,231,229,60,216,182,105,53,29,163,198,12,2,243,6,188,210,75,2,79,219,202,22,147,193,40,230,22,67,97,153,133,234,120,42,176,255,109,148,160,245,64,220,247,178,236,7,211,222,123,11,147,25,227,232,224,24,46,168,159,124,82,70,185,144,84,189,44,249,52,23,174,82,237,74,209,69,137,91,17,163,254,74,131,129,86,23,33,25,135,189,207,95,150,70,82,82,131,168,112,15,78,232,27,156,242,11,86,98,121,7,217,176,217,220,98,161,28,148,146,9,56,42,227,225,50,153,47,196,10,230,219,35,187,22,52,209,79,31,177,198,188,6,146,46,12,198,199,135,53,105,251,43,60,229,243,156,33,68,141,226,223,124,43,213,128,146,143,15,250,134,67,156,87,88,179,186,141,8,179,143,161,145,34,33,147,248,190,224,99,92,125,56,17,101,26,6,182,102,144,131,70,69,228,198,31,253,27,62,110,152,43,63,96,17,25,127,78,99,224,224,231,147,138,37,50,161,18,99,238,141,115,241,64,87,178,50,69,250,207,7,83,128,202,71,51,223,163,60,251,33,90,91,159,60,234,115,169,53,93,204,232,12,169,63,189,188,211,34,130,79,219,202,215,187,193,244,187,10,133,214,84,50,39,211,126,56,162,7,78,28,251,109,242,217,55,116,188,121,76,39,200,242,63,246,92,78,16,181,176,131,186,18,4,150,71,224,199,135,173,204,180,86,241,192,100,254,24,138,91,166,24,232,74,236,241,86,9,52,159,135,189,84,106,184,70,82,34,56,168,46,50,20,232,227,61,51,11,123,144,36,7,236,128,20,220,64,80,72,148,109,180,139,42,120,41,146,153,97,140,202,230,40,227,225,22,200,125,156,31,75,246,185,6,167,171,0,198,225,3,42,105,249,96,252,229,239,117,124,68,195,231,199,124,117,236,90,146,5,218,78,134,110,174,145,88,181,92,90,8,218,61,22,145,221,114,48,248,190,238,195,66,125,129,170,101,26,66,5,102,144,239,103,69,228,127,131,253,27,191,177,152,43,68,122,17,25,23,152,99,224,92,168,147,138,119,3,161,18,90,221,141,115,183,153,87,178,245,64,250,207,69,208,128,202,253,33,223,163,213,247,33,90,13,181,60,234,83,251,53,93,195,156,12,169,88,173,188,211,208,217,79,219,231,193,187,193,131,178,10,133,153,58,50,39,130,63,56,162,41,140,28,251,66,220,215,55,197,7,121,92,123,48,242,63,227,81,168,16,46,236,155,186,82,26,85,71,84,92,131,173,52,203,11,241,237,181,65,24,137,211,212,24,254,192,45,241,86,25,148,173,135,88,98,71,150,40,34,186,131,14,253,16,78,115,251,63,242,69,58,76,121,143,177,55,217,106,245,251,28,187,48,162,56,178,195,39,50,247,17,133,10,72,32,193,187,141,14,219,79,29,71,211,188,178,221,169,12,172,59,93,53,139,169,234,60,79,125,90,33,37,229,163,223,131,222,202,128,183,0,207,250,132,98,178,87,189,140,115,141,98,0,18,161,188,243,138,147,254,119,224,99,43,224,25,17,154,177,43,152,253,86,27,253,71,232,228,69,86,79,144,102,142,152,26,101,243,73,125,66,251,91,190,248,250,23,221,145,7,193,218,8,22,107,181,88,168,13,110,134,9,45,5,146,234,16,117,124,61,243,195,68,139,200,239,229,30,176,249,105,202,246,225,198,41,172,167,6,252,145,75,31,170,226,200,22,67,98,40,230,4,37,97,153,170,156,120,42,89,132,109,148,29,251,9,220,217,33,236,75,121,76,123,38,220,63,227,221,201,16,46,198,243,186,82,83,34,71,84,161,65,173,52,89,23,241,237,194,163,24,137,237,60,24,254,103,195,241,86,83,44,173,135,155,142,71,150,232,90,186,131,141,43,16,78,23,92,63,242,85,100,76,121,251,230,55,217,62,16,251,28,208,117,162,56,118,187,39,50,155,160,133,10,195,45,193,187,86,138,219,79,151,22,211,188,108,125,169,12,200,65,93,53,241,66,234,60,199,181,90,33,187,104,163,223,89,112,202,128,189,210,207,250,169,217,178,87,238,0,115,141,242,207,18,161,59,79,138,147,150,206,224,99,182,231,25,17,254,220,43,152,209,93,27,253,238,176,228,69,151,193,144,102,122,123,26,101,244,47,125,66,2,198,190,248,134,62,221,145,189,212,218,8,195,50,181,88,9,173,110,134,6,197,5,146,122,223,117,124,155,187,195,68,72,199,239,229,62,43,249,105,233,0,225,198,66,232,167,6,79,49,75,31,89,104,200,22,181,97,40,230,63,2,97,153,110,228,120,42,158,113,109,148,135,61,64,220,219,59,236,7,39,83,123,11,152,229,227,232,180,5,46,168,133,115,82,70,247,97,84,189,120,6,52,23,100,190,237,74,73,213,137,91,122,250,254,74,91,68,86,23,58,13,135,189,16,95,150,70,59,39,131,168,44,209,78,232,227,63,242,17,123,116,121,7,236,26,247,220,64,99,167,148,109,132,226,42,120,50,134,153,97,160,15,230,40,143,250,22,200,133,80,31,75,43,31,6,167,75,92,198,225,91,252,105,249,131,161,229,239,165,138,68,195,127,130,124,117,125,77,146,5,42,195,134,110,74,244,88,181,137,152,8,218,86,185,145,221,235,181,248,190,20,249,66,125,130,9,101,26,107,218,102,144,69,226,69,228,82,240,253,27,41,128,152,43,130,222,17,25,28,100,99,224,24,43,147,138,1,204,161,18,109,197,141,115,80,97,87,178,146,140,250,207,42,207,128,202,237,199,223,163,225,30,33,90,250,81,60,234,18,141,53,93,161,132,12,169,84,228,188,211,183,21,79,219,231,75,187,193,29,97,10,133,225,76,50,39,153,46,56,162,72,145,28,251,0,158,217,55,71,83,121,76,109,184,242,63,206,198,78,16,27,47,131,186,14,133,150,71,250,181,135,173,6,88,86,241,239,70,254,24,61,33,137,24,148,144,237,241,86,23,52,177,135,158,84,71,150,90,148,186,131,232,108,16,78,182,252,63,242,97,161,76,121,41,105,55,217,68,251,251,28,20,184,162,56,132,112,39,50,171,46,133,10,25,151,193,187,189,156,219,79,231,232,211,188,252,178,169,12,130,249,93,53,53,58,234,60,75,231,90,33,175,39,163,223,203,184,202,128,204,26,207,250,236,180,178,87,117,155,115,141,61,93,18,161,183,7,138,147,86,182,224,99,158,32,25,17,210,215,43,152,210,234,27,253,243,81,228,69,208,53,144,102,173,172,26,101,112,63,125,66,156,75,190,248,182,143,221,145,22,223,218,8,38,39,181,88,86,178,99,134,250,219,5,177,128,202,117,78,144,163,195,68,201,90,239,22,222,234,249,223,128,93,225,36,92,169,167,0,117,211,75,118,210,219,200,233,16,193,40,212,69,133,97,182,229,39,120,116,39,162,109,40,18,251,64,243,132,55,236,173,235,76,123,139,39,63,227,78,157,16,46,141,134,186,82,105,65,71,84,146,48,173,52,157,150,241,237,103,208,24,137,31,145,24,254,108,55,241,86,232,159,173,135,161,146,71,150,68,94,186,131,246,49,16,78,254,80,63,242,36,38,76,121,1,37,55,217,189,102,251,28,129,217,162,56,54,190,39,50,217,35,133,10,21,202,193,187}
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
   else return f(u9436d8(a)) end
  else
   local _fn=hcbe50f[ocbe50f]
   if _fn then _fn() else error("bad opcode "..tostring(ocbe50f),0) end
  end
 end
end
do
 local ok,err=pcall(R6d87a1,2,{})
 if not ok then error(err,0) end
end