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
local v87a1cb={130,45,1,110,41,55,46,228,15,77,40,18,173,87,239,235,168,131,242,23,157,23,191,190,66,229,173,144,25,38,252,208,168,46,152,16,201,166,201,91,58,168,196,36,197,241,19,61,141,37,35,228,250,252,12,86,231,145,31,248,123,26,182,46,88,80,137,173,2,158,167,47,132,36,133,236,83,61,205,56,35,228,122,251,201,22,108,209,95,243,249,208,37,174,29,155,201,45,194,94,167,47,196,191,202,236,156,176,10,184,164,239,250,251,137,86,236,17,144,243,123,145,51,243,199,241,176,190,224,220,145,57,25,191,10,235,92,176,202,184,164,239,127,230,201,153,105,212,80,243,192,81,179,243,124,241,48,190,101,161,44,210,217,63,207,235,28,43,138,63,41,239,255,230,2,89,233,148,21,238,128,17,188,246,252,244,53,62,229,219,106,188,75,128,225,221,219,49}
local ce50f29={}
local r436d87={{0,1},{1,5},{6,57},{63,27},{90,42},{132,27},{159,39}}
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
 local src={55,217,220,65,251,17,148,109,162,196,32,120,39,51,153,97,133,145,32,40,193,186,22,200,219,187,133,75,211,190,6,167,169,14,202,225,93,52,105,249,234,120,253,239,90,32,68,195,163,209,220,117,202,225,180,5,207,250,134,110,178,84,88,138,115,155,8,155,18,161,158,221,194,147,248,190,106,163,66,125,55,148,101,26,34,88,102,144,114,96,69,228,230,132,253,27,76,59,152,43,53,178,17,25,142,160,99,224,2,246,147,138,242,204,161,18,66,179,141,115,220,197,87,178,154,28,250,207,55,221,128,202,119,112,223,163,38,125,33,90,249,86,60,234,27,57,53,93,75,84,12,169,129,220,188,211,229,23,79,219,35,242,187,193,104,164,10,133,213,227,50,39,18,240,56,162,151,129,28,251,4,196,217,55,130,119,121,76,221,216,242,63,63,181,78,16,209,23,131,186,12,89,150,71,172,30,135,173,214,71,86,241,228,138,254,24,175,129,137,24,252,139,237,241,189,243,52,173,133,177,84,71,185,241,82,186,9,104,46,16,180,253,227,63,182,19,123,76,23,119,236,55,127,15,64,251,192,201,109,162,199,149,120,39,29,46,97,133,128,38,40,193,89,70,200,219,229,141,75,211,224,197,167,169,14,7,225,93,174,175,249,234,60,13,239,90,169,25,195,163,99,114,117,202,173,188,5,207,80,20,110,178,57,40,181,115,108,12,218,18,58,137,221,138,108,71,190,224,200,22,125,25,237,111,26,43,98,115,144,27,24,115,228,228,99,39,27,144,146,2,43,26,121,215,25,125,109,180,224,190,215,36,138,221,144,161,31,218,9,140,115,147,88,87,178,145,45,250,207,25,84,128,202,53,62,223,163,236,243,33,90,23,70,60,234,27,57,53,93,75,84,12,169,129,220,188,211,94,171,79,219,212,208,187,193,102,167,10,133,146,123,50,39,132,32,56,162,151,129,28,251,73,28,217,55,176,196,121,76,110,191,242,63,255,46,78,16,1,127,131,186,230,60,150,71,222,125,135,173,141,241,86,241,169,82,254,24,171,1,137,24,80,66,237,241,100,88,52,173,168,106,84,71,30,27,82,186,123,11,46,16,247,14,227,63,182,19,123,76,16,154,236,55,56,216,64,251,247,112,109,162,120,104,120,39,193,123,97,133,188,83,40,193,2,240,200,219,76,31,108,211,146,6,174,169,13,194,225,23,53,105,249,22,54,229,239,117,124,68,195,9,77,124,117,74,85,146,5,97,242,134,110,89,179,88,181,92,90,8,218,185,245,145,221,118,153,248,190,205,77,66,125,252,39,101,26,119,91,102,144,181,245,69,228,193,64,253,27,222,39,152,43,53,210,17,25,129,72,99,224,7,30,147,138,69,42,161,18,180,120,141,115,84,92,87,178,92,201,250,207,5,122,128,202,43,99,223,163,117,241,33,90,13,181,60,234,204,238,53,93,199,28,12,169,83,156,188,211,151,66,79,219,134,87,187,193,131,178,10,133,11,67,50,39,130,63,56,162,199,6,28,251,192,9,217,55,66,15,121,76,224,205,242,63,225,228,78,16,166,245,131,186,56,156,150,71,174,168,135,173,50,222,86,241,203,144,254,24,118,240,137,24,219,79,237,241,24,86,52,173,98,132,84,71,128,245,82,186,141,8,46,16,71,40,227,63,156,123,123,76,108,179,236,55,235,147,64,251,171,89,109,162,176,119,120,39,184,89,97,133,39,200,40,193,178,214,200,219,207,202,75,211,93,2,167,169,231,34,225,93,130,164,249,234,136,159,239,90,157,74,195,163,102,154,117,202,134,91,5,207,166,69,110,178,241,139,181,115,22,206,218,18,225,211,221,138,96,26,190,224,233,130,125,25,60,75,26,43,155,102,183,27,211,69,253,228,69,225,27,208,102,152,43,230,111,17,25,83,199,99,224,250,224,147,138,188,183,161,18,216,201,141,115,169,158,87,178,217,75,250,207,141,207,128,202,201,114,223,163,237,193,33,90,69,119,60,234,152,79,53,93,79,206,12,169,187,192,188,211,100,200,79,219,99,66,187,193,208,69,10,133,78,196,50,39,224,145,56,162,3,228,28,251,85,104,217,55,119,31,121,76,123,227,242,63,189,247,78,16,214,11,131,186,127,104,150,71,97,58,135,173,22,77,86,241,18,225,254,24,18,157,137,24,176,11,237,241,165,245,52,173,123,183,84,71,108,83,82,186,182,47,46,16,104,50,227,63,240,202,123,76,101,193,236,55,151,157,64,251,66,139,109,162,178,234,120,39,31,183,97,133,12,47,40,193,210,139,200,219,176,180,75,211,153,3,167,169,187,11,225,93,107,118,249,234,42,86,239,90,12,106,195,163,71,199,117,202,162,200,5,207,84,142,110,178,114,93,181,115,143,4,218,18,255,142,221,138,107,91,190,224,218,164,125,25,85,125,26,43,196,165,144,27,255,132,228,228,119,178,27,144,153,39,43,26,209,107,25,125,67,99,173,190,249,139,138,247,145,161,18,216,201,141,115,105,5,87,178,217,75,250,207,174,198,128,202,31,166,223,163,238,106,33,90,119,94,60,234,165,170,53,93,244,114,12,169,60,30,188,211,11,93,79,219,124,108,187,193,208,69,10,133,76,183,50,39,60,50,56,162,79,206,28,251,180,70,217,55,119,31,121,76,123,227,242,63,204,95,78,16,210,162,131,186,127,104,150,71,204,6,135,173,22,77,86,241,239,139,254,24,85,6,137,24,73,135,237,241,253,67,52,173,145,14,84,71,152,230,82,186,138,104,46,16,108,178,227,63,84,216,123,76,92,2,236,55,219,208,64,251,66,139,109,162,178,234,120,39,29,196,97,133,78,254,40,193,157,204,200,219,90,171,75,211,160,192,167,169,15,198,234,93,23,105,228,234,61,255,239,115,33,68,195,87,69,124,117,81,70,146,5,224,45,134,110,236,72,88,181,25,87,8,218,240,241,145,221,32,1,248,190,96,182,66,125,27,208,101,26,176,94,102,144,91,191,69,228,108,24,253,27,134,213,152,43,248,53,17,25,215,208,99,224,156,162,147,138,34,58,161,18,65,206,141,115,154,143,87,178,197,210,250,207,253,49,128,202,143,105,223,163,135,92,33,90,179,38,60,234,95,186,53,93,122,222,12,169,136,209,188,211,224,75,79,219,48,181,187,193,145,0,10,133,37,129,50,39,36,233,56,162,140,144,28,251,156,129,217,55,19,184,121,76,243,86,242,63,105,40,78,16,32,8,131,186,183,112,150,71,58,205,135,173,146,196,86,241,237,74,255,21,137,28,137,24,254,252,88,241,86,56,105,173,135,37,239,71,150,40,34,186,131,6,38,16,78,115,37,63,242,9,119,76,121,179,150,55,217,182,154,251,28,118,61,162,56,128,234,39,50,248,71,133,10,25,131,193,187,51,205,219,79,29,71,211,188,227,158,169,12,172,59,93,53,68,215,234,60,227,38,90,33,45,94,163,223,131,222,202,128,9,195,207,250,132,98,178,87,243,225,115,141,30,105,18,161,115,141,138,147,96,5,224,99,43,224,25,17,195,201,43,152,253,136,27,253,186,91,228,69,14,249,144,102,242,241,26,101,243,73,125,66,201,114,190,248,177,208,221,145,94,185,218,8,168,118,181,88,23,240,110,134,31,246,5,146,120,105,117,124,209,3,195,68,185,225,239,229,93,204,249,105,202,246,225,198,151,111,167,6,11,30,75,31,199,134,200,22,209,27,40,230,39,171,97,153,7,160,120,42,86,210,109,148,9,79,64,220,197,241,236,7,55,13,123,11,122,98,227,232,248,165,46,168,174,148,82,70,210,95,84,189,161,119,52,23,248,249,237,74,219,29,137,91,118,167,254,74,179,238,86,23,200,167,135,189,182,23,150,70,22,162,131,168,114,211,78,232,225,254,242,11,94,73,121,7,172,117,217,220,66,251,22,148,72,162,56,61,120,27,50,153,97,122,161,230,40,228,190,22,200,244,152,31,75,252,11,6,167,31,185,198,225,167,32,105,249,64,174,229,239,52,81,68,195,87,69,124,117,81,70,146,5,120,55,134,110,25,3,88,181,25,87,8,218,240,241,145,221,111,165,248,190,129,69,66,125,12,165,101,26,55,94,102,144,85,188,69,228,186,90,253,27,108,108,152,43,224,112,17,25,57,90,99,224,215,101,147,138,223,80,161,18,6,85,141,115,251,25,87,178,157,100,250,207,19,33,128,202,123,220,223,163,246,195,33,90,179,38,60,234,95,186,53,93,122,0,12,169,165,10,188,211,21,0,79,219,162,204,187,193,210,243,10,133,103,80,50,39,25,12,56,162,146,63,28,251,114,147,217,55,91,202,121,76,136,233,242,63,85,93,78,16,32,8,131,186,22,94,150,71,61,32,135,173,54,214,86,241,6,174,254,24,137,179,137,24,27,115,237,241,60,205,52,173,170,147,84,71,14,253,82,186,165,114,46,16,91,92,227,63,215,14,123,76,55,70,236,55,135,195,64,251,29,148,120,162,56,38,120,5,50,153,97,122,161,230,40,29,230,22,200,108,130,31,75,54,133,6,167,81,175,198,225,167,32,105,249,174,36,229,239,59,7,68,195,87,69,124,117,81,152,146,5,143,184,134,110,236,72,88,181,197,56,8,218,171,71,145,221,18,40,248,190,129,69,66,125,191,194,101,26,247,197,102,144,172,48,69,228,1,124,253,27,108,108,152,43,53,56,17,25,229,249,99,224,156,162,147,138,200,37,161,18,49,236,141,115,245,26,87,178,157,100,250,207,249,152,128,202,90,33,223,163,246,195,33,90,111,48,60,234,24,109,53,93,196,195,12,169,164,6,167,211,9,31,114,219,201,23,187,138,40,230,10,43,105,153,50,21,55,42,56,160,97,148,28,79,58,220,217,93,54,7,121,182,110,11,242,10,100,232,78,50,116,168,131,28,129,70,150,91,146,189,135,237,118,23,86,175,242,74,254,114,83,91,137,54,123,74,237,105,237,23,52,45,82,189,84,233,158,70,82,136,204,168,46,239,241,232,227,148,166,11,123,180,218,7,236,205,204,220,64,191,4,148,109,254,251,42,120,137,58,153,97,110,238,230,40,118,118,22,200,133,80,31,75,185,102,6,167,132,34,198,225,104,178,105,249,204,230,229,239,244,41,68,195,127,130,124,117,125,77,146,5,123,128,134,110,4,226,88,181,94,163,8,218,39,38,145,221,235,181,248,190,31,200,66,125,60,20,101,26,156,85,102,144,176,169,69,228,82,240,253,27,191,59,152,43,130,222,17,25,28,100,99,224,171,76,147,138,239,222,161,18,218,224,141,115,70,186,87,178,216,51,250,207,231,194,128,202,115,181,223,163,170,217,33,90,16,78,60,234,203,38,53,93,206,17,12,169,249,25,188,211,247,17,79,219,231,75,187,193,130,116,10,133,225,76,50,39,222,249,56,162,72,145,28,251,111,11,217,55,195,176,121,76,241,203,242,63,206,198,78,16,106,176,131,186,116,156,150,71,171,22,135,173,40,209,86,241,239,70,254,24,139,91,155,24,227,74,237,248,86,52,52,173,135,168,224,71,150,90,148,186,131,232,108,16,78,27,1,63,242,183,117,76,121,253,249,55,217,233,199,251,28,253,240,162,56,213,211,39,50,188,100,133,10,81,229,193,187,189,156,219,79,169,254,211,188,191,65,169,12,243,102,93,53,7,137,234,60,67,60,90,33,88,5,163,223,126,121,202,128,204,26,207,250,58,96,178,87,117,155,115,141,61,93,18,161,255,173,138,147,94,109,224,99,103,120,25,17,37,88,43,152,205,196,27,253,47,62,228,69,211,158,144,102,125,29,26,101,77,218,125,66,118,84,190,248,79,215,221,145,161,250,218,8,143,115,159,88,98,178,111,146,250,208,5,146,128,223,193,124,223,134,198,68,33,90,7,229,60,197,78,105,53,225,239,198,12,167,7,6,188,230,204,31,79,249,146,22,187,212,156,230,10,89,60,153,50,103,58,42,56,141,218,148,28,77,245,220,217,57,76,7,121,8,99,11,242,25,57,232,78,241,42,168,131,33,148,70,150,69,88,189,135,72,13,23,86,77,227,74,254,22,41,91,137,45,121,74,237,152,203,23,52,184,51,189,84,117,217,70,82,13,78,168,46,152,19,232,227,131,252,11,123,245,159,7,236,2,94,220,64}
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
  elseif ocbe50f==49151 then
   if je50f29._instr and f87a1cb>0 then print(string.format("RETURN RETP %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(Fa1cbe5.chunk or 0), tostring(G29436d[f87a1cb].code and G29436d[f87a1cb].code.maxReg or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(G29436d[f87a1cb].retDest or 0), tostring(G29436d[f87a1cb].nRet or 0))) end
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
     if je50f29._instr then print(string.format("TAILCALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(Fa1cbe5.chunk or 0), tostring(f.proto or 0), tostring(f87a1cb), tostring(w6d87a1.maxReg or 0), tostring(i0f2943), tostring(b6d87a1), tostring(kcbe50f), tostring(-1), tostring(-1))) end
     local calleeProto3=f.proto local calleeChunk3=Kcbe50f[calleeProto3] for i3=b6d87a1,kcbe50f do e0f2943[i3]=nil end local newBASE3=b6d87a1 b6d87a1=newBASE3 kcbe50f=b6d87a1+(calleeChunk3.maxReg or 32) se50f29={} t436d87=0 ya1cbe5={{}} L29436d=f.env w6d87a1=calleeChunk3 i0f2943=1 local ps3=w6d87a1.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} e0f2943[b6d87a1+id3]=cell3 ya1cbe5[1][id3]=cell3 end if w6d87a1.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then a87a1cb=P29436d(u9436d8(vaArgs3)) else local t3={n=0} t3["m7a1cbe50f2"]=true a87a1cb=t3 end else a87a1cb=nil end Fa1cbe5={chunk=calleeProto3, pc=i0f2943, base=b6d87a1, top=kcbe50f, ret=nil, nRet=0, vararg=a87a1cb, upenv=L29436d, caller=Fa1cbe5.caller}
   else return f(u9436d8(a)) end
  else
   local _fn=h50f294[ocbe50f]
   if _fn then _fn() else error("bad opcode "..tostring(ocbe50f),0) end
  end
 end
end
do
 local ok,err=pcall(R6d87a1,1,{})
 if not ok then error(err,0) end
end