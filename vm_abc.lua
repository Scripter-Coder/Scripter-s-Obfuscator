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
local v87a1cb={130,73,137,60,88,117,41,87,124,146,193,245,211,24,4,245,14,21,184,173,155,161,141,228,36,11,95,18,215,16,110,114,206,16,98,82,87,112,195,233,28,14,22,14,131,143,233,23,83,187,137,94,228,154,30,204,185,167,109,58,181,4,148,106,108,252,125,177,110,186,155,203,32,206,67,202,105,215,147,190,201,158,100,213,67,140,130,167,237,49,181,196,169,106,233,231,253,49,238,58,153,129,150,133,4,10,238,146,108,62,118,69,228,21,131,204,194,39,106,177,53,143,41,17,105,231,122,52,110,58,27,203,173,211,254,103,144,4,86,252,192,83,121,208,67,11,15,90,234,177,62,207,41,81,226,231,250,180,227,181,32,134,45,147,123,103,208,207,22,129,115,69,249,144,8,203,207,154,103,52,190,15,174,156,98,234,71,180,99,181,160,198,45,214,251,103,21,143,75,251,221,86,16,234,174,253,37,95}
local ce50f29={}
local r436d87={{0,2},{2,8},{10,6},{16,57},{73,27},{100,42},{142,27},{169,39}}
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
local b6d87a1={}
do
 local src={55,217,220,64,251,26,148,109,162,196,32,120,39,51,153,97,133,107,192,40,193,186,22,200,219,46,57,75,211,188,6,167,169,12,198,225,92,53,111,249,234,60,78,187,90,33,69,195,163,223,210,125,202,128,146,5,207,250,231,72,178,87,88,181,115,141,8,218,18,162,145,219,138,147,248,21,180,99,66,126,25,17,101,180,35,152,102,144,27,253,69,133,194,69,253,27,144,102,152,43,26,101,18,25,101,66,99,224,2,246,147,138,220,145,161,18,65,206,141,115,180,88,87,178,210,136,250,207,7,146,128,202,238,186,223,163,192,68,33,90,83,235,60,234,250,105,53,93,122,0,12,169,165,6,188,211,191,133,79,219,202,22,187,193,42,234,10,133,99,153,50,39,85,4,56,162,109,148,28,251,4,196,217,55,237,7,121,76,89,81,242,63,224,232,78,16,79,142,131,186,82,70,150,71,87,189,184,173,34,23,23,241,236,69,254,80,137,91,137,146,62,74,237,223,211,23,52,164,71,189,84,46,11,70,82,184,66,168,46,204,19,232,227,16,37,11,123,191,155,7,236,139,215,220,64,212,65,148,109,58,131,42,120,78,175,153,97,113,144,230,40,243,244,22,200,217,67,31,75,54,133,6,167,191,191,198,225,191,101,105,249,64,174,229,239,124,251,68,195,13,215,124,117,33,100,146,5,143,184,134,110,6,45,88,181,25,87,8,218,232,180,145,221,206,139,248,190,142,19,66,125,191,194,101,26,247,197,102,144,228,66,69,228,186,90,253,27,104,197,152,43,248,53,17,25,116,130,99,224,152,34,147,138,223,80,161,18,49,236,141,115,183,84,87,178,65,49,250,207,143,82,128,202,143,105,223,163,135,92,33,90,129,149,60,234,95,186,53,93,61,155,12,169,88,185,188,211,100,168,79,219,66,214,187,193,202,182,10,133,203,11,50,39,36,233,56,162,111,85,28,251,219,26,217,55,236,239,121,76,243,86,242,63,95,230,78,16,3,134,131,186,248,212,150,71,58,205,135,173,213,19,86,241,118,82,254,24,118,228,137,24,85,30,237,241,170,29,52,173,125,168,84,71,115,112,82,186,165,114,46,16,186,114,227,63,238,205,123,76,86,208,236,55,246,107,64,251,29,148,96,162,56,43,120,1,50,153,97,122,161,230,40,221,125,22,200,155,13,31,75,252,11,6,167,81,175,198,225,191,101,105,249,64,174,229,239,124,251,68,195,182,107,124,117,214,70,146,5,129,187,134,110,65,181,88,181,143,135,8,218,232,180,145,221,131,83,248,190,188,160,66,125,12,165,101,26,55,94,102,144,52,42,69,228,80,63,253,27,26,166,152,43,163,131,17,25,57,90,99,224,156,162,147,138,115,153,161,18,232,71,141,115,154,143,87,178,230,219,250,207,253,49,128,202,204,154,223,163,135,92,33,90,134,120,60,234,24,109,53,93,10,34,12,169,231,68,188,211,184,253,79,219,126,163,187,193,145,0,10,133,98,153,21,39,86,42,49,162,109,144,28,177,64,220,217,203,230,7,121,99,38,11,242,149,113,232,78,144,251,168,131,20,90,70,150,172,176,189,135,130,227,23,86,90,185,74,254,228,131,91,137,53,208,74,237,20,96,23,52,241,68,189,84,233,158,70,82,159,134,168,46,94,15,232,227,16,69,11,123,176,115,7,236,142,63,220,64,99,167,148,109,204,72,42,120,198,54,153,97,183,69,230,40,193,83,22,200,133,80,31,75,101,9,6,167,75,92,198,225,104,178,105,249,204,230,229,239,174,187,68,195,127,130,124,117,132,193,146,5,100,174,134,110,216,141,88,181,137,152,8,218,184,51,145,221,10,70,248,190,78,107,66,125,130,215,101,26,41,148,102,144,147,160,69,228,142,159,253,27,106,115,152,43,28,172,17,25,91,152,99,224,65,83,147,138,248,148,161,18,148,73,141,115,80,97,87,178,120,53,250,207,11,50,128,202,124,188,223,163,173,52,33,90,250,81,60,234,203,38,53,93,86,11,12,169,47,91,188,211,193,223,79,219,229,56,187,193,33,38,10,133,225,76,50,39,153,46,56,162,134,112,28,251,247,17,217,55,88,125,121,76,199,5,242,63,90,14,78,16,40,97,131,186,14,133,150,71,242,110,135,173,175,209,86,241,173,8,254,24,122,185,137,24,116,138,237,241,123,57,52,173,132,189,115,71,184,70,75,186,130,180,46,80,78,232,227,195,248,11,123,98,252,7,236,115,193,220,64,154,58,148,109,160,249,42,120,59,244,153,97,50,199,230,40,73,230,22,200,103,65,31,75,253,57,6,167,3,158,198,225,60,19,105,249,68,52,229,239,70,231,68,195,140,8,124,117,97,212,146,5,55,89,134,110,157,10,88,181,235,54,8,218,124,209,145,221,159,39,248,190,123,123,66,125,25,249,101,26,117,135,102,144,227,94,69,228,201,107,253,27,165,225,152,43,56,63,17,25,130,233,99,224,37,62,147,138,147,208,161,18,41,234,141,115,73,82,87,178,148,147,250,207,48,21,128,202,83,166,223,163,193,133,33,90,243,35,60,234,183,40,53,93,191,217,12,169,45,198,188,211,102,49,79,219,206,223,187,193,65,123,10,133,158,50,50,39,93,47,56,162,218,89,28,251,30,195,217,55,250,180,121,76,86,37,242,63,123,83,78,16,12,242,131,186,252,78,150,71,113,184,135,173,54,27,86,241,179,85,254,24,113,248,137,24,71,172,237,241,18,15,52,173,219,126,84,71,148,135,82,186,177,231,46,16,177,87,227,63,70,113,123,76,120,7,161,55,216,196,64,209,28,148,109,160,249,42,120,251,111,153,97,50,199,230,40,106,239,22,200,177,149,31,75,254,146,6,167,49,183,198,225,1,246,105,249,255,136,229,239,193,57,68,195,227,157,124,117,126,250,146,5,55,89,134,110,159,121,88,181,55,149,8,218,48,251,145,221,126,9,248,190,123,123,66,125,25,249,101,26,4,47,102,144,231,247,69,228,201,107,253,27,8,221,152,43,56,63,17,25,127,131,99,224,98,165,147,138,106,92,161,18,113,92,141,115,163,235,87,178,96,38,250,207,12,82,128,202,87,38,223,163,101,151,33,90,202,224,60,234,251,101,53,93,191,217,12,169,45,198,188,211,100,66,79,219,140,14,187,193,14,60,10,133,116,45,50,39,100,236,56,162,110,148,23,251,98,220,196,55,236,29,121,101,123,11,242,203,121,232,78,139,232,168,131,149,133,70,150,25,75,189,135,199,238,23,86,19,189,74,254,178,27,91,137,152,43,74,237,243,151,23,52,54,65,189,84,7,212,70,82,50,222,168,46,6,253,232,227,221,162,11,123,230,235,7,236,21,131,220,64,4,183,148,109,57,254,42,120,8,229,153,97,46,94,230,40,57,24,22,200,33,90,31,75,151,164,6,167,245,207,198,225,251,230,105,249,113,36,229,239,117,246,68,195,8,139,124,117,50,35,146,5,118,28,134,110,246,79,88,181,47,78,8,218,243,165,145,221,86,206,248,190,31,220,66,125,145,76,101,26,161,88,102,144,21,93,69,228,1,115,253,27,254,22,152,43,188,182,17,25,125,66,98,237,190,191,147,138,221,39,20,18,218,39,208,115,181,192,236,178,110,232,138,207,5,60,136,202,117,231,25,163,195,70,45,90,239,81,70,234,249,3,239,93,225,36,92,169,167,172,46,211,75,126,105,219,200,233,16,193,40,195,15,133,97,155,62,39,120,207,1,162,109,254,198,251,64,241,247,55,236,1,176,76,123,98,111,63,227,23,229,16,46,51,69,186,82,68,154,71,84,22,211,173,52,1,229,241,237,168,174,24,137,195,50,24,254,35,112,241,86,177,231,173,135,38,76,71,150,185,237,186,131,91,204,16,78,130,57,63,242,233,43,76,121,173,126,55,217,254,26,251,28,107,198,162,56,15,125,39,50,217,35,133,10,3,17,193,187,238,107,219,79,17,235,211,188,158,28,169,12,167,199,93,53,150,82,234,60,126,41,90,33,243,14,163,223,244,40,202,128,248,223,207,250,171,64,178,87,109,50,115,141,102,170,18,161,132,105,138,147,228,120,224,99,12,60,25,17,237,71,43,152,208,37,27,253,104,202,228,69,185,3,144,102,190,241,26,101,191,17,125,66,70,229,190,248,108,53,221,145,255,13,218,8,113,121,181,88,181,226,110,134,190,215,5,146,220,9,117,124,221,98,195,68,4,95,239,229,124,168,249,105,55,93,235,198,41,169,167,17,188,239,75,31,79,36,99,22,187,228,45,230,10,170,182,153,50,8,207,42,56,20,216,148,28,1,85,220,217,157,126,7,121,34,11,11,242,203,121,232,78,139,232,168,131,13,159,70,150,236,0,189,135,199,238,23,86,19,189,74,254,253,191,91,137,121,216,74,237,228,226,23,52,177,65,189,84,9,215,70,82,228,156,168,46,236,68,232,227,197,231,11,123,8,97,7,236,94,68,220,64,249,221,148,109,126,101,42,120,105,115,153,97,118,232,230,40,215,8,22,200,213,239,31,75,230,59,6,167,245,207,198,225,251,230,105,249,113,250,229,239,88,45,68,195,253,192,124,117,160,90,146,5,53,239,134,110,180,158,88,181,18,171,8,218,237,10,145,221,184,220,248,190,87,174,66,125,234,243,101,26,157,45,102,144,21,93,69,228,160,93,253,27,249,251,152,43,24,164,17,25,150,166,99,224,190,16,147,138,56,168,161,18,176,210,141,115,152,118,87,178,246,61,250,207,35,72,128,202,96,200,223,163,230,65,33,90,161,164,60,234,167,118,53,93,224,198,25,169,167,10,188,241,75,31,79,36,99,22,187,29,117,230,10,50,172,153,50,194,65,42,56,90,206,148,28,1,85,220,217,115,244,7,121,45,93,11,242,203,121,232,78,139,54,168,131,250,16,70,150,25,75,189,135,27,129,23,86,72,11,74,254,128,50,91,137,121,216,74,237,87,133,23,52,113,218,189,84,240,91,70,82,95,186,168,46,236,68,232,227,16,175,11,123,212,194,7,236,21,131,220,64,238,168,148,109,73,220,42,120,103,112,153,97,118,232,230,40,61,177,22,200,244,18,31,75,230,59,6,167,41,217,198,225,188,49,105,249,207,57,229,239,89,33,95,195,225,223,65,117,202,129,146,78,207,250,134,192,186,87,88,135,60,141,8,216,30,161,145,105,240,147,248,212,58,99,66,135,12,17,101,47,172,152,102,178,65,253,69,66,55,69,253,7,86,102,152,107,88,101,17,71,98,66,99,138,100,248,147,164,88,145,161,138,97,8,141,243,96,88,87,28,102,134,250,253,74,146,128,53,202,124,223,8,151,68,33,162,76,229,60,16,236,105,53,25,249,198,12,245,100,6,188,125,67,31,79,48,44,22,187,118,229,230,10,219,126,153,50,77,162,42,56,143,67,148,28,206,199,220,217,17,54,7,121,226,115,11,242,227,190,232,78,167,227,168,131,14,40,70,150,241,225,189,135,128,26,23,86,196,106,74,254,121,175,91,137,231,85,74,237,212,83,23,52,26,74,189,84,236,194,70,82,12,54,168,46,63,19,232,227,167,73,11,123,45,95,7,236,34,109,220,64,201,83,148,109,162,208,42,120,212,208,153,97,51,191,230,40,35,235,22,200,221,134,31,75,186,33,6,167,86,167,198,225,111,122,105,249,197,235,229,239,4,62,68,195,31,209,124,117,229,221,146,5,101,104,134,110,50,130,88,181,213,94,8,218,55,164,145,221,165,68,248,190,207,212,66,125,147,209,101,26,6,182,102,144,95,229,69,228,194,159,253,27,111,205,152,43,6,163,17,25,127,78,99,224,188,248,129,138,192,145,160,27,218,43,141,115,181,77,227,178,110,154,60,207,5,210,194,202,117,143,61,163,195,248,47,90,239,31,41,234,249,92,178,93,225,175,145,169,167,249,23,211,75,58,74,219,200,161,118,193,40,77,94,133,97,47,135,39,120,147,222,162,109,161,155,251,64,178,169,55,236,161,170,76,123,23,52,63,227,234,66,16,46,246,156,186,82,250,152,71,84,144,169,173,52,34,209,241,237,36,142,24,137,253,90,24,254,111,232,241,86,87,118,173,135,22,0,71,150,44,136,186,131,134,171,16,78,13,213,63,242,87,184,76,121,18,88,55,217,0,29,251,28,148,133,162,56,40,120,13,50,172,97,132,30,230,55,193,187,22,221,111,79,31,110,214,188,6,167,65,12,198,206,234,53,105,69,228,60,229,225,250,33,68,246,36,223,124,87,144,128,146,16,123,250,134,178,239,87,88,245,49,141,8,245,165,161,145,107,63,147,248,176,64,99,66,57,1,17,101,60,241,152,102,113,31,253,69,127,34,69,253,25,156,102,152,206,35,101,17,165,115,66,99,238,30,248,147,191,90,145,161,123,71,8,141,102,1,88,87,128,33,134,250,120,200,146,128,66,40,124,223,31,205,68,33,227,9,229,60,223,126,105,53}
 for i=1,#src do
  local a=src[(i)] local _junkcbe=0 local b=((i*i*46+i*24+232)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b6d87a1[i]=r
 end
end
local Kcbe50f={}
do
 local rp=1
 while rp<=#b6d87a1 do
  local np=b6d87a1[rp] + b6d87a1[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b6d87a1[rp] + b6d87a1[rp+1]*256 rp=rp+2 end
  local va=(b6d87a1[rp]==1) rp=rp+1
  local mr=b6d87a1[rp] + b6d87a1[rp+1]*256 rp=rp+2
  local nc=b6d87a1[rp] + b6d87a1[rp+1]*256 + b6d87a1[rp+2]*65536 + b6d87a1[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b6d87a1[rp] + b6d87a1[rp+1]*256 + b6d87a1[rp+2]*65536 + b6d87a1[rp+3]*16777216
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
 local h50f294={}
 h50f294[0x7ab4]=function()
   se50f29[t436d87]=se50f29[t436d87][3]
 end
 h50f294[0x5d2f]=function()
   ya1cbe5[#ya1cbe5+1]={}
 end
 h50f294[0x54ab]=function()
   local id=w6d87a1.c[i0f2943] local b=nil i0f2943=i0f2943+1
   for i=#L29436d,1,-1 do b=L29436d[i][id] if b then break end end
   t436d87=t436d87+1 se50f29[t436d87]=b and b[1]
 end
 h50f294[0xc69b]=function()
   local id=w6d87a1.c[i0f2943] local v=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1 i0f2943=i0f2943+1
   local cell={v}
   e0f2943[b6d87a1+id]=cell
   ya1cbe5[#ya1cbe5][id]=cell
 end
 h50f294[0x2e2d]=function()
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
     if je50f29._instr then print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(Fa1cbe5.chunk or 0), tostring(f.proto or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(t436d87+1), tostring(-1))) end
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
 h50f294[0x1f5e]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a + b
 end
 h50f294[0x706e]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a >= b
 end
 h50f294[0xda6a]=function()
   local id=w6d87a1.c[i0f2943] local v=se50f29[t436d87] t436d87=t436d87-1 i0f2943=i0f2943+1
   local cell=e0f2943[b6d87a1+id]
   if cell then cell[1]=v else e0f2943[b6d87a1+id]={v} end
   -- keep SC in sync for upvalue capture (live cell)
   local top=ya1cbe5[#ya1cbe5] if top then top[id]=e0f2943[b6d87a1+id] end
 end
 h50f294[0x5a22]=function()
   g87a1cb[da1cbe5(w6d87a1.c[i0f2943])]=se50f29[t436d87] t436d87=t436d87-1 i0f2943=i0f2943+1
 end
 h50f294[0x5d88]=function()
   i0f2943=w6d87a1.c[i0f2943]
 end
 h50f294[0x9d69]=function()
   -- CLOSE Fa1cbe5 (no-op, cells live via L29436d)
 end
 h50f294[0xa3f8]=function()
   se50f29[t436d87]=se50f29[t436d87][2]
 end
 h50f294[0x2661]=function()
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   if f87a1cb>0 then
     if je50f29._instr then print(string.format("RETURN %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(Fa1cbe5.chunk or 0), tostring(G29436d[f87a1cb].code and G29436d[f87a1cb].code.maxReg or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(G29436d[f87a1cb].retDest or 0), tostring(G29436d[f87a1cb].nRet or 0))) end
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
 h50f294[0xb415]=function()
   ya1cbe5[#ya1cbe5]=nil
 end
 h50f294[0xabff]=function()
   local _n=(se50f29[t436d87]==nil) se50f29[t436d87]=nil t436d87=t436d87-1 if _n then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 end
 end
 h50f294[0xb5b6]=function()
   t436d87=t436d87+1 se50f29[t436d87]={}
 end
 h50f294[0x4f32]=function()
   if not a87a1cb then local t={n=0} t["m7a1cbe50f2"]=true a87a1cb=t end
   t436d87=t436d87+1 se50f29[t436d87]=a87a1cb
 end
 h50f294[0xc61c]=function()
   se50f29[t436d87]=-se50f29[t436d87]
 end
 h50f294[0xc35c]=function()
   local ix=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   se50f29[t436d87]=se50f29[t436d87][ix]
 end
 h50f294[0x8735]=function()
   t436d87=t436d87+1 se50f29[t436d87]=se50f29[t436d87-1]
 end
 h50f294[0xbfff]=function()
   local k=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local p=se50f29[t436d87] t436d87=t436d87-1
   local a={} for j=1,k do a[j]=se50f29[t436d87-k+j] end t436d87=t436d87-k
   for j=1,p.n do a[k+j]=p[j] end
   if f87a1cb>0 then local caller=G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller.code; i0f2943=caller.pc; b6d87a1=caller.base; kcbe50f=caller.top; se50f29=caller.s; t436d87=caller.sp; ya1cbe5=caller.sc; a87a1cb=caller.va; L29436d=caller.lk; Fa1cbe5=caller; if caller.nRet==1 then t436d87=t436d87+1; se50f29[t436d87]=a[1] elseif caller.nRet==-1 then local r=P29436d(u9436d8(a)); t436d87=t436d87+1; se50f29[t436d87]=r else for j=1,#a do t436d87=t436d87+1; se50f29[t436d87]=a[j] end end else return u9436d8(a) end
 end
 h50f294[0xb72f]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a ~= b
 end
 h50f294[0xe2f3]=function()
   t436d87=t436d87+1 se50f29[t436d87]=nil
 end
 h50f294[0x8ae]=function()
   error("TAILCALL via HAND")
 end
 h50f294[0x39e5]=function()
   local p=se50f29[t436d87] t436d87=t436d87-1 local t=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 h50f294[0xb316]=function()
   se50f29[t436d87]=#se50f29[t436d87]
 end
 h50f294[0x50e2]=function()
   local _v=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1 if _v then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 end
 end
 h50f294[0xc02]=function()
   local id=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local cell=e0f2943[b6d87a1+id]
   t436d87=t436d87+1 se50f29[t436d87]=cell and cell[1]
 end
 h50f294[0x4e1]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a > b
 end
 h50f294[0xe4eb]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a .. b
 end
 h50f294[0x5ddc]=function()
   local v=se50f29[t436d87] local k=se50f29[t436d87-1] local t=se50f29[t436d87-2] t[k]=v t436d87=t436d87-3
 end
 h50f294[0x414e]=function()
   se50f29[t436d87]=not se50f29[t436d87]
 end
 h50f294[0x189b]=function()
   se50f29[t436d87]=se50f29[t436d87][1]
 end
 h50f294[0x9af4]=function()
   t436d87=t436d87+1 se50f29[t436d87]=g87a1cb[da1cbe5(w6d87a1.c[i0f2943])] i0f2943=i0f2943+1
 end
 h50f294[0xd3a6]=function()
   se50f29[t436d87],se50f29[t436d87-1]=se50f29[t436d87-1],se50f29[t436d87]
 end
 h50f294[0xcdb7]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a ^ b
 end
 h50f294[0x15fa]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a * b
 end
 h50f294[0x4240]=function()
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local pt=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1
   for j=1,n do t436d87=t436d87+1 se50f29[t436d87]=pt[j] end
 end
 h50f294[0x852e]=function()
   t436d87=t436d87+1 se50f29[t436d87]=false
 end
 h50f294[0x92aa]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a - b
 end
 h50f294[0xc08a]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a == b
 end
 h50f294[0xbb98]=function()
   t436d87=t436d87+1 se50f29[t436d87]=true
 end
 h50f294[0xafc]=function()
   local ix=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local n=m0f2943[ix]
   if not n then n=tonumber(da1cbe5(ix)) m0f2943[ix]=n end
   t436d87=t436d87+1 se50f29[t436d87]=n
 end
 h50f294[0x36e5]=function()
   local _v=se50f29[t436d87] se50f29[t436d87]=nil t436d87=t436d87-1 if not _v then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 end
 end
 h50f294[0xd580]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a % b
 end
 h50f294[0x1844]=function()
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
     if je50f29._instr then print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(Fa1cbe5.chunk or 0), tostring(f.proto or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(t436d87+1), tostring(1))) end
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
 h50f294[0xe6b9]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a <= b
 end
 h50f294[0xc906]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a < b
 end
 h50f294[0xa00e]=function()
   se50f29[t436d87]=nil t436d87=t436d87-1
 end
 h50f294[0xe800]=function()
   local k=se50f29[t436d87] t436d87=t436d87-1 local t=se50f29[t436d87] se50f29[t436d87]=t[k]
 end
 h50f294[0xc102]=function()
   local b=se50f29[t436d87] local a=se50f29[t436d87-1] t436d87=t436d87-1
   se50f29[t436d87]=a / b
 end
 h50f294[0xd72f]=function()
   if se50f29[t436d87] then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 se50f29[t436d87]=nil t436d87=t436d87-1 end
 end
 h50f294[0x525]=function()
   t436d87=t436d87+1 se50f29[t436d87]=da1cbe5(w6d87a1.c[i0f2943]) i0f2943=i0f2943+1
 end
 h50f294[0xebc]=function()
   local ci=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local links={}
   for i=1,#L29436d do links[#links+1]=L29436d[i] end
   for i=1,#ya1cbe5 do links[#links+1]=ya1cbe5[i] end
   local vmf={isVM=true, proto=ci, env=links, maxReg=Kcbe50f[ci].maxReg}
   setmetatable(vmf,{__call=function(_, ...) return R6d87a1(vmf.proto, vmf.env, ...) end})
   je50f29[vmf]=true
   t436d87=t436d87+1 se50f29[t436d87]=vmf
 end
 h50f294[0xda26]=function()
   if not se50f29[t436d87] then i0f2943=w6d87a1.c[i0f2943] else i0f2943=i0f2943+1 se50f29[t436d87]=nil t436d87=t436d87-1 end
 end
 h50f294[0xc009]=function()
   local id=w6d87a1.c[i0f2943] local v=se50f29[t436d87] t436d87=t436d87-1 i0f2943=i0f2943+1
   local b=nil for i=#L29436d,1,-1 do b=L29436d[i][id] if b then break end end
   if b then b[1]=v end
 end
 h50f294[64348]=function()
  local k=se50f29[t436d87] t436d87=t436d87-1 local t=se50f29[t436d87] se50f29[t436d87]=t[k]
 end
 h50f294[62726]=function()
  local t=se50f29[t436d87] se50f29[t436d87]=t
 end
 h50f294[60912]=function()
  local k=se50f29[t436d87] t436d87=t436d87-1 local t=se50f29[t436d87] se50f29[t436d87]=t[k]
 end
 h50f294[62850]=function()
  local t=se50f29[t436d87] se50f29[t436d87]=t
 end
 h50f294[64348]=function()
  local k=se50f29[t436d87] t436d87=t436d87-1 local t=se50f29[t436d87] se50f29[t436d87]=t[k]
 end
 while true do
  local ocbe50f=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
  if ocbe50f==9825 then
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   if f87a1cb>0 then
     if je50f29._instr then print(string.format("RETURN %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(Fa1cbe5.chunk or 0), tostring(G29436d[f87a1cb].code and G29436d[f87a1cb].code.maxReg or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(G29436d[f87a1cb].retDest or 0), tostring(G29436d[f87a1cb].nRet or 0))) end
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
  if ocbe50f==49151 then
   if je50f29._instr and f87a1cb>0 then print(string.format("RETURN RETP %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(Fa1cbe5.chunk or 0), tostring(G29436d[f87a1cb].code and G29436d[f87a1cb].code.maxReg or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(G29436d[f87a1cb].retDest or 0), tostring(G29436d[f87a1cb].nRet or 0))) end
   local k=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local p=se50f29[t436d87] t436d87=t436d87-1
   local a={} for j=1,k do a[j]=se50f29[t436d87-k+j] end t436d87=t436d87-k
   for j=1,p.n do a[k+j]=p[j] end
   if f87a1cb>0 then local caller=G29436d[f87a1cb]; f87a1cb=f87a1cb-1; w6d87a1=caller.code; i0f2943=caller.pc; b6d87a1=caller.base; kcbe50f=caller.top; se50f29=caller.s; t436d87=caller.sp; ya1cbe5=caller.sc; a87a1cb=caller.va; L29436d=caller.lk; Fa1cbe5=caller; if caller.nRet==1 then t436d87=t436d87+1; se50f29[t436d87]=a[1] elseif caller.nRet==-1 then local r=P29436d(u9436d8(a)); t436d87=t436d87+1; se50f29[t436d87]=r else for j=1,#a do t436d87=t436d87+1; se50f29[t436d87]=a[j] end end else return u9436d8(a) end
  end
  if ocbe50f==2222 then
   local n=w6d87a1.c[i0f2943] i0f2943=i0f2943+1
   local f=se50f29[t436d87-n]
   local a={} for j=1,n do a[j]=se50f29[t436d87-n+j] end t436d87=t436d87-n-1
   local la=#a if la>0 and q9436d8(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end
   if f and (je50f29[f] or (type(f)=="table" and f.isVM)) then
     if je50f29._instr then print(string.format("TAILCALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(Fa1cbe5.chunk or 0), tostring(f.proto or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(-1), tostring(-1))) end
     local calleeProto3=f.proto local calleeChunk3=Kcbe50f[calleeProto3] for i3=b6d87a1,kcbe50f do e0f2943[i3]=nil end local newBASE3=b6d87a1 b6d87a1=newBASE3 kcbe50f=b6d87a1+(calleeChunk3.maxReg or 32) se50f29={} t436d87=0 ya1cbe5={{}} L29436d=f.env w6d87a1=calleeChunk3 i0f2943=1 local ps3=w6d87a1.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} e0f2943[b6d87a1+id3]=cell3 ya1cbe5[1][id3]=cell3 end if w6d87a1.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then a87a1cb=P29436d(u9436d8(vaArgs3)) else local t3={n=0} t3["m7a1cbe50f2"]=true a87a1cb=t3 end else a87a1cb=nil end Fa1cbe5={chunk=calleeProto3, pc=i0f2943, base=b6d87a1, top=kcbe50f, ret=nil, nRet=0, vararg=a87a1cb, upenv=L29436d, caller=Fa1cbe5.caller}
   else return f(u9436d8(a)) end
  end
  local _fn=h50f294[ocbe50f]
  if _fn then _fn() else error("bad opcode "..tostring(ocbe50f),0) end
 end
end
do
 local ok,err=pcall(R6d87a1,4,{})
 if not ok then error(err,0) end
end