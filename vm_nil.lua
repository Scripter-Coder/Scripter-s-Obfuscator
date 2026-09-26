local psf334f4=132 -- Phase 4: proto XOR salt (function ref virtualization)
local _d3431e4=function(afdbb5a,b6b466c,...)
 while true do
  local _s84fd={} local _t2bb3=0
  local _y2b9c={{}}
  local _id84f=1
  local _w638f=afdbb5a[b6b466c]
  local o3c75a2=_w638f.c[_id84f]
  if o3c75a2==1 then _s84fd[_t2bb3]="x" end
 end
end
local _bbbfd={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _rcb2c={{1,41}}
local d51053a=function(i) local a=_bbbfd[1] local rr=_rcb2c[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _bbbfd2={214,17,239,131,189,168} do local rp=1 while rp<=#_bbbfd2 do local np=_bbbfd2[rp]+_bbbfd2[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_bbbfd2[rp]+_bbbfd2[rp+1]*256 rp=rp+2 end local va=(_bbbfd2[rp]==1) rp=rp+1 local nc=_bbbfd2[rp]+_bbbfd2[rp+1]*256+_bbbfd2[rp+2]*65536+_bbbfd2[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_bbbfd2[rp]+_bbbfd2[rp+1]*256+_bbbfd2[rp+2]*65536+_bbbfd2[rp+3]*16777216 rp=rp+4 end end end
end
local g876659=_G
if getgenv then g876659=getgenv() end
if not g876659 then g876659=_G end
local vd022df={181,140,247,226,168,34,204,72,189,193,150,52,205,95,204,189,1,61,171,206,69,71,115,118,10,54,111,2,93,51,164,254,136,250,1,183,251,240,209,2,68,0,239,57,130,108,10,101,42,220,3,97,5,212,144,81,17,192,19,182,40,69,201,134,235,122,128,177,90,5,35,39,236,47,26,198,167,101,10,59,75,40,122,234,50,3,217,135,172,106,121,245,92,132,211,164,66,251,54,171,55,138,11,90,247,123,197,15,218,197,188,189,37,166,143,1,137,139,56,182,251,122,116,2,44,253,195,218,46,116,82,197,203,86,46,115,225,235,69,91,81,164,251,98,140,119,41,172,70,65,157,7,215,160,136,178,37,137,26,61,143,150,191,168,173,234,62,192,105,193,201,149,129,47,167,112,93,137,208,13,91,252,105,33,28,42,255,79,247,42,196,78,56,161,47,145,206,155,15,37,46,244,26,57,92,254,161,19,63,16,147,122,81,70,156,120}
local c1ca353={}
local rcc1924={{0,8},{8,6},{14,36},{50,55},{105,28},{133,40},{173,43}}
local m70d7a5={}
local iv8e42bf=182
local sa5b9dee=104
local sse695c2=34
local snf0d725=62
local sm2ecb11=65
local d55c8d0=function(i)
 local c=c1ca353[i] if c then return c end
 local rr=rcc1924[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local _salt = (ln % 2 == 0) and sse695c2 or snf0d725; if ln < 2 then _salt = sm2ecb11 end
 local t="" local prev=(iv8e42bf + i*_salt)%256
 for j=1,ln do
  local p=st+j
  local a=vd022df[p] local b=(198*p+182+2316722520*1.0*((p*p)%9))%251+246
  local kb=(b + prev*121)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 c1ca353[i]=t return t
end
local u0f4278
if table.unpack then u0f4278=table.unpack else u0f4278=unpack end
if not u0f4278 then u0f4278=unpack end
local P3e50f9=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["mb23eb0520d"]=true
 return t
end
local qadb773=function(t) return type(t)=="table" and t["mb23eb0520d"]==true end
local b1ab8c7={}
do
 local src={245,231,120,163,109,216,212,118,178,192,121,27,201,26,7,141,178,7,133,209,109,38,201,231,245,163,233,207,84,219,236,137,128,20,70,21,126,231,186,110,78,200,225,153,235,223,108,163,95,228,196,71,160,123,246,6,143,4,234,116,56,247,184,180,19,53,88,198,244,221,197,170,34,211,9,96,181,244,26,227,49,192,248,61,109,196,173,100,104,128,52,93,153,83,136,40,221,248,174,192,177,143,166,47,143,14,112,107,71,78,12,121,127,168,117,89,127,41,176,11,220,45,189,138,206,41,156,219,152,13,77,254,45,249,203,243,196,155,32,186,40,10,66,83,155,122,54,185,170,205,247,241,163,214,143,251,221,82,244,215,249,217,48,133,141,96,57,5,100,204,20,82,74,145,188,113,158,187,59,98,243,73,135,37,1,133,165,181,1,154,149,28,192,192,87,80,99,218,230,86,189,44,76,46,238,234,127,211,163,111,132,79,158,209,91,152,241,91,4,179,234,166,122,160,205,25,194,95,249,202,220,235,85,159,200,78,215,148,134,126,126,206,22,128,160,90,115,84,164,97,162,245,19,20,163,109,44,236,118,178,63,4,27,201,20,187,141,178,96,193,209,109,30,250,231,245,195,126,207,84,49,70,137,128,49,228,21,126,203,83,110,78,28,89,153,235,254,29,150,95,195,196,125,160,123,231,6,147,4,234,116,101,99,184,180,46,19,88,198,220,195,197,170,226,50,9,96,109,69,26,227,95,235,248,61,39,54,173,100,121,219,52,93,201,207,136,40,222,239,174,192,78,98,166,47,57,156,112,107,230,43,12,121,113,92,117,89,87,52,176,11,66,54,189,138,202,84,156,219,175,35,77,254,23,109,203,243,63,145,32,186,65,200,66,83,66,153,54,185,159,179,247,241,235,42,143,251,79,159,244,215,219,119,48,133,131,148,57,5,212,179,20,82,142,207,188,113,234,199,59,98,254,106,135,37,160,12,165,181,102,173,216,28,21,248,86,66,227,32,230,86,96,85,253,46,170,49,19,211,198,38,63,79,180,101,65,152,116,170,14,179,6,195,216,160,101,68,2,95,150,145,228,235,153,88,113,78,110,83,61,126,21,238,203,128,137,141,167,84,207,230,30,245,231,174,65,109,209,181,225,178,141,254,216,201,27,218,168,178,118,117,184,109,163,6,92,245,162,183,218,84,115,27,224,128,22,39,130,126,134,206,124,78,200,113,187,235,220,3,48,95,194,233,199,160,122,82,210,179,4,180,97,152,91,250,195,79,132,86,206,211,127,19,72,46,76,104,247,86,230,22,124,80,87,79,177,28,149,47,102,181,165,177,236,37,135,94,202,98,59,145,30,113,188,69,61,82,20,201,210,5,57,142,123,133,48,194,213,215,244,141,233,251,143,15,133,241,247,32,15,185,54,65,97,83,66,54,203,186,32,165,11,243,203,28,70,254,77,139,59,219,156,204,82,138,189,89,25,11,176,85,190,89,117,145,236,121,12,123,114,107,112,117,197,47,166,226,100,192,174,140,238,40,136,135,37,93,33,165,253,100,173,149,193,39,248,87,241,138,26,230,88,104,9,76,156,169,197,127,14,227,88,132,172,166,184,91,216,126,234,4,154,109,238,122,137,14,196,194,147,232,108,220,202,162,225,200,147,75,45,134,252,23,70,22,57,48,49,115,196,237,233,162,57,153,120,163,74,115,212,118,246,162,7,27,235,106,7,141,189,202,212,209,204,202,120,231,169,19,233,207,209,194,49,137,84,174,70,21,60,241,45,110,33,110,225,153,8,206,108,150,177,95,196,101,175,198,238,6,220,162,234,116,249,204,184,180,155,60,88,198,14,101,197,170,95,29,9,96,128,4,26,227,210,85,248,61,88,186,173,100,37,135,52,93,104,249,136,40,109,135,174,192,60,194,166,47,188,137,112,107,183,54,12,121,45,237,117,89,166,165,176,11,68,76,189,138,254,75,156,219,59,52,77,254,15,243,203,243,254,15,32,186,99,233,66,83,73,193,54,185,13,126,247,241,163,214,143,251,41,193,244,215,25,127,48,133,83,101,57,5,101,120,20,82,13,215,188,113,177,255,59,98,245,146,135,37,102,151,165,181,219,110,149,28,241,134,87,80,174,100,230,86,226,11,76,46,22,17,127,211,86,122,132,79,139,102,91,152,142,114,4,179,57,48,122,160,106,120,194,95,150,108,221,237,153,212,200,78,110,141,42,126,21,134,37,128,137,234,178,84,207,50,99,245,231,216,15,109,209,45,181,178,141,151,57,201,27,181,142,178,118,235,15,109,163,253,86,245,162,255,218,84,115,197,229,128,22,155,15,126,134,83,213,78,200,161,147,235,220,233,39,95,194,249,135,160,122,139,49,179,4,83,205,152,91,10,187,79,132,148,184,211,127,114,38,46,76,140,209,86,230,199,249,80,87,247,129,28,149,211,223,181,165,121,35,37,135,117,16,98,59,64,93,113,188,217,39,82,20,204,191,5,57,246,225,133,48,221,132,215,244,236,186,251,143,225,59,241,247,192,106,185,54,144,228,83,66,246,17,186,32,176,152,243,203,95,236,254,77,203,129,219,156,146,198,138,189,39,38,11,176,145,224,89,117,140,81,121,12,27,116,107,112,43,140,47,166,57,192,192,174,17,11,40,136,83,157,93,52,132,142,100,173,215,107,61,248,229,95,227,26,231,86,43,9,77,47,170,227,127,211,198,41,213,79,180,69,99,152,116,215,230,179,6,23,185,160,101,48,174,95,150,209,94,235,153,163,191,78,110,212,69,126,21,191,213,128,137,39,102,84,207,244,29,245,231,196,119,109,209,0,206,178,141,37,106,201,27,181,142,178,118,181,70,109,163,53,153,245,162,183,218,84,115,140,11,128,22,165,7,126,134,212,173,78,200,203,240,235,220,9,161,95,194,118,102,160,122,224,14,179,4,229,200,152,91,56,116,79,132,218,196,211,127,201,53,46,76,20,223,86,230,173,111,80,87,80,224,28,149,67,249,181,165,81,106,37,135,107,58,98,59,115,218,113,188,135,20,82,20,93,201,5,57,14,121,200,48,66,89,214,240,176,74,251,143,189,87,235,247,156,55,241,54,77,162,226,66,203,150,141,32,32,180,251,203,66,170,61,77,54,175,206,156,247,39,104,189,143,32,202,176,244,71,123,117,48,0,200,12,57,100,252,112,20,143,53,166,188,146,210,174,59,208,43,136,135,154,158,52,165,79,252,173,149,121,10,248,87,92,124,26,230,124,9,9,76,215,105,197,127,41,94,88,132,82,11,184,91,148,235,234,4,110,35,238,122,118,135,196,194,221,148,108,220,246,38,225,200,3,16,45,134,214,200,70,22,241,216,49,115,88,80,233,162,227,242,120,163,208,83,212,118,137,46,7,27,5,101,7,141,55,199,212,209,86,0,120,231,1,206,233,207,128,203,49,137,50,21,70,21,254,70,45,110,43,255,225,153,82,101,108,150,31,200,196,101,116,194,238,6,80,22,234,116,181,249,184,180,205,134,88,198,63,55,197,170,114,253,9,96,228,233,26,227,134,181,248,61,153,36,173,100,55,167,52,93,243,101,136,40,62,138,174,192,243,190,166,47,92,28,112,107,201,71,12,121,193,31,117,89,232,42,176,11,32,78,189,138,49,196,156,219,134,232,77,254,81,66,143,243,178,32,33,188,243,239,66,83,254,161,126,185,219,65,210,241,138,210,41,251,11,68,152,215,89,181,3,133,121,246,161,5,107,208,184,82,47,17,48,113,192,236,76,98,40,100,207,37,93,218,56,181,100,146,75,28,61,213,245,80,227,68,243,86,96,40,119,46,170,174,247,211,198,234,135,79,180,65,152,152,116,167,122,179,6,108,120,160,101,230,179,95,150,233,109,235,153,13,128,78,110,0,36,126,21,2,57,128,137,136,202,84,207,84,32,245,231,25,52,109,209,150,1,178,141,60,57,201,27,135,77,178,118,191,89,109,163,101,88,245,162,136,88,84,115,109,56,128,22,121,203,126,134}
 for i=1,#src do
  local a=src[(i)] local _junka30=0 local b=((i*i*77+i*6+158)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b1ab8c7[i]=r
 end
end
local K5d3ded={}
do
 local rp=1
 while rp<=#b1ab8c7 do
  local np=b1ab8c7[rp] + b1ab8c7[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b1ab8c7[rp] + b1ab8c7[rp+1]*256 rp=rp+2 end
  local va=(b1ab8c7[rp]==1) rp=rp+1
  local mr=b1ab8c7[rp] + b1ab8c7[rp+1]*256 rp=rp+2
  local nc=b1ab8c7[rp] + b1ab8c7[rp+1]*256 + b1ab8c7[rp+2]*65536 + b1ab8c7[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b1ab8c7[rp] + b1ab8c7[rp+1]*256 + b1ab8c7[rp+2]*65536 + b1ab8c7[rp+3]*16777216
   rp=rp+4
  end
  K5d3ded[#K5d3ded+1]={c=cd,p=ps,v=va,maxReg=mr}
 end
end
local R47b06e
R47b06e=function(x6b3174,L8dac39,...)
 local w6df905=K5d3ded[x6b3174]
 local sc6b262={} local t14a6b3=0
 local y79bdb7={{}}
 local aa47817=nil
 local iaf4152=1
 local ps=w6df905.p
 local efa09f5={} local b6af641=0 local ka0f97f=w6df905.maxReg or 32
 local G02017f={} local f9891b9=0
 for i=1,#ps do local cell={select(i,...)} efa09f5[b6af641+ps[i]]=cell y79bdb7[1][ps[i]]=cell end
 if w6df905.v then aa47817=P3e50f9(select(#ps+1,...)) end
 local Faf0e64={chunk=x6b3174,pc=iaf4152,base=b6af641,top=ka0f97f,ret=nil,nRet=0,vararg=aa47817,upenv=L8dac39,caller=nil,build=263618791,reg=efa09f5}
 -- frame pc is alias of iaf4152, base=b6af641 top=ka0f97f reg window efa09f5[b6af641..ka0f97f]
 local j5d1348={}
 j5d1348._instr=false
 local ha4c476={}
 ha4c476[0x223b]=function()
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]={}
 end
 ha4c476[0x69a1]=function()
   sc6b262[t14a6b3]=sc6b262[t14a6b3][2]
 end
 ha4c476[0x9dee]=function()
   local id=w6df905.c[iaf4152] local v=sc6b262[t14a6b3] t14a6b3=t14a6b3-1 iaf4152=iaf4152+1
   local cell=efa09f5[b6af641+id]
   if cell then cell[1]=v else efa09f5[b6af641+id]={v} end
   -- keep SC in sync for upvalue capture (live cell)
   local top=y79bdb7[#y79bdb7] if top then top[id]=efa09f5[b6af641+id] end
 end
 ha4c476[0x3b2]=function()
   local id=w6df905.c[iaf4152] local b=nil iaf4152=iaf4152+1
   for i=#L8dac39,1,-1 do b=L8dac39[i][id] if b then break end end
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=b and b[1]
 end
 ha4c476[0x87f]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a .. b
 end
 ha4c476[0x38fd]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a < b
 end
 ha4c476[0xa40]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a - b
 end
 ha4c476[0xb185]=function()
   local n=w6df905.c[iaf4152] iaf4152=iaf4152+1
   local f=sc6b262[t14a6b3-n]
   local a={}
   for j=1,n do a[j]=sc6b262[t14a6b3-n+j] end
   t14a6b3=t14a6b3-n-1
   local la=#a
   if la>0 and qadb773(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   if f and j5d1348[f] then
     if j5d1348._instr then print(string.format("CALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Faf0e64.chunk or 0), tostring(f.proto or 0), tostring(f9891b9), tostring(w6df905.maxReg or 0), tostring(iaf4152), tostring(b6af641), tostring(ka0f97f), tostring(t14a6b3+1), tostring(1))) end
     f9891b9=f9891b9+1
     G02017f[f9891b9]={code=w6df905, pc=iaf4152, base=b6af641, top=ka0f97f, s=sc6b262, sp=t14a6b3, sc=y79bdb7, va=aa47817, lk=L8dac39, fr=Faf0e64, nRet=1, retDest=t14a6b3+1}
     local calleeProto2=f.proto
     local calleeChunk2=K5d3ded[calleeProto2]
     if not calleeChunk2 then error("bad proto "..tostring(calleeProto2).." CH="..tostring(#K5d3ded),0) end
     local newBASE=ka0f97f+1
     b6af641=newBASE
     ka0f97f=b6af641+(calleeChunk2.maxReg or 32)
     sc6b262={} t14a6b3=0
     y79bdb7={{}}
     aa47817=nil
     L8dac39=f.env
     w6df905=calleeChunk2
     iaf4152=1
     local ps2=w6df905.p
     for i2=1,#ps2 do local id2=ps2[i2] local v2=a[i2] local cell2={v2} efa09f5[b6af641+id2]=cell2 y79bdb7[1][id2]=cell2 end
     if w6df905.v then
       local vaArgs2={} for i2=#ps2+1,#a do vaArgs2[#vaArgs2+1]=a[i2] end
       if #vaArgs2>0 then aa47817=P3e50f9(u0f4278(vaArgs2)) else local t2={n=0} t2["mb23eb0520d"]=true aa47817=t2 end
     end
     Faf0e64={chunk=calleeProto2, pc=iaf4152, base=b6af641, top=ka0f97f, ret=nil, nRet=0, vararg=aa47817, upenv=L8dac39, caller=G02017f[f9891b9]}
   else
     local r=P3e50f9(f(u0f4278(a)))
     t14a6b3=t14a6b3+1
     sc6b262[t14a6b3]=r[1]
   end
 end
 ha4c476[0xb9b9]=function()
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=true
 end
 ha4c476[0xc1db]=function()
   local ix=w6df905.c[iaf4152] iaf4152=iaf4152+1
   local n=m70d7a5[ix]
   if not n then n=tonumber(d55c8d0(ix)) m70d7a5[ix]=n end
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=n
 end
 ha4c476[0x98fa]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a + b
 end
 ha4c476[0x7e4d]=function()
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=g876659[d55c8d0(w6df905.c[iaf4152])] iaf4152=iaf4152+1
 end
 ha4c476[0xaca0]=function()
   sc6b262[t14a6b3]=nil t14a6b3=t14a6b3-1
 end
 ha4c476[0xbc0f]=function()
   sc6b262[t14a6b3]=sc6b262[t14a6b3][1]
 end
 ha4c476[0x6cf4]=function()
   sc6b262[t14a6b3]=-sc6b262[t14a6b3]
 end
 ha4c476[0x6b29]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a >= b
 end
 ha4c476[0x82bd]=function()
   local v=sc6b262[t14a6b3] local k=sc6b262[t14a6b3-1] local t=sc6b262[t14a6b3-2] t[k]=v t14a6b3=t14a6b3-3
 end
 ha4c476[0x48ec]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a % b
 end
 ha4c476[0xbf1d]=function()
   sc6b262[t14a6b3]=sc6b262[t14a6b3][3]
 end
 ha4c476[0x2290]=function()
   sc6b262[t14a6b3]=not sc6b262[t14a6b3]
 end
 ha4c476[0xe2d6]=function()
   local _ci_enc=w6df905.c[iaf4152] iaf4152=iaf4152+1
   local ci=0 local _aa=_ci_enc local _bb=psf334f4 local _pw=1 for _=1,8 do local x=_aa%2 local y=_bb%2 if x~=y then ci=ci+_pw end _aa=(_aa-x)/2 _bb=(_bb-y)/2 _pw=_pw*2 end while _aa>0 or _bb>0 do local x=_aa%2 local y=_bb%2 if x~=y then ci=ci+_pw end _aa=(_aa-x)/2 _bb=(_bb-y)/2 _pw=_pw*2 end
   local links={}
   for i=1,#L8dac39 do links[#links+1]=L8dac39[i] end
   for i=1,#y79bdb7 do links[#links+1]=y79bdb7[i] end
   local vmf={isVM=true, proto=ci, env=links, maxReg=K5d3ded[ci].maxReg}
   setmetatable(vmf,{__call=function(_, ...) return R47b06e(vmf.proto, vmf.env, ...) end})
   j5d1348[vmf]=true
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=vmf
 end
 ha4c476[0xc3f9]=function()
   y79bdb7[#y79bdb7+1]={}
 end
 ha4c476[0xa227]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a == b
 end
 ha4c476[0x1516]=function()
   local k=sc6b262[t14a6b3] t14a6b3=t14a6b3-1 local t=sc6b262[t14a6b3] sc6b262[t14a6b3]=t[k]
 end
 ha4c476[0xd4bc]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a / b
 end
 ha4c476[0x25dd]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a ~= b
 end
 ha4c476[0xc080]=function()
   sc6b262[t14a6b3]=#sc6b262[t14a6b3]
 end
 ha4c476[0x2f44]=function()
   local n=w6df905.c[iaf4152] iaf4152=iaf4152+1
   local pt=sc6b262[t14a6b3] sc6b262[t14a6b3]=nil t14a6b3=t14a6b3-1
   for j=1,n do t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=pt[j] end
 end
 ha4c476[0xde3f]=function()
   iaf4152=w6df905.c[iaf4152]
 end
 ha4c476[0x5171]=function()
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=nil
 end
 ha4c476[0x886b]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a > b
 end
 ha4c476[0xa33b]=function()
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=d55c8d0(w6df905.c[iaf4152]) iaf4152=iaf4152+1
 end
 ha4c476[0x3b21]=function()
   if not aa47817 then local t={n=0} t["mb23eb0520d"]=true aa47817=t end
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=aa47817
 end
 ha4c476[0x9f0c]=function()
   sc6b262[t14a6b3],sc6b262[t14a6b3-1]=sc6b262[t14a6b3-1],sc6b262[t14a6b3]
 end
 ha4c476[0x7ecc]=function()
   local id=w6df905.c[iaf4152] local v=sc6b262[t14a6b3] t14a6b3=t14a6b3-1 iaf4152=iaf4152+1
   local b=nil for i=#L8dac39,1,-1 do b=L8dac39[i][id] if b then break end end
   if b then b[1]=v end
 end
 ha4c476[0xc3bf]=function()
   local ix=w6df905.c[iaf4152] iaf4152=iaf4152+1
   sc6b262[t14a6b3]=sc6b262[t14a6b3][ix]
 end
 ha4c476[0xe23d]=function()
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=false
 end
 ha4c476[0x3765]=function()
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=sc6b262[t14a6b3-1]
 end
 ha4c476[0x7742]=function()
   error("TAILCALL via HAND")
 end
 ha4c476[0xb15c]=function()
   local id=w6df905.c[iaf4152] local v=sc6b262[t14a6b3] sc6b262[t14a6b3]=nil t14a6b3=t14a6b3-1 iaf4152=iaf4152+1
   local cell={v}
   efa09f5[b6af641+id]=cell
   y79bdb7[#y79bdb7][id]=cell
 end
 ha4c476[0x80e]=function()
   local _n=(sc6b262[t14a6b3]==nil) sc6b262[t14a6b3]=nil t14a6b3=t14a6b3-1 if _n then iaf4152=w6df905.c[iaf4152] else iaf4152=iaf4152+1 end
 end
 ha4c476[0xbb7e]=function()
   local _v=sc6b262[t14a6b3] sc6b262[t14a6b3]=nil t14a6b3=t14a6b3-1 if not _v then iaf4152=w6df905.c[iaf4152] else iaf4152=iaf4152+1 end
 end
 ha4c476[0x282]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a ^ b
 end
 ha4c476[0x692a]=function()
   local id=w6df905.c[iaf4152] iaf4152=iaf4152+1
   local cell=efa09f5[b6af641+id]
   t14a6b3=t14a6b3+1 sc6b262[t14a6b3]=cell and cell[1]
 end
 ha4c476[0x33c0]=function()
   -- CLOSE Faf0e64 (no-op, cells live via L8dac39)
 end
 ha4c476[0x1add]=function()
   local _v=sc6b262[t14a6b3] sc6b262[t14a6b3]=nil t14a6b3=t14a6b3-1 if _v then iaf4152=w6df905.c[iaf4152] else iaf4152=iaf4152+1 end
 end
 ha4c476[0x8cb7]=function()
   local k=w6df905.c[iaf4152] iaf4152=iaf4152+1
   local p=sc6b262[t14a6b3] t14a6b3=t14a6b3-1
   local a={} for j=1,k do a[j]=sc6b262[t14a6b3-k+j] end t14a6b3=t14a6b3-k
   for j=1,p.n do a[k+j]=p[j] end
   if f9891b9>0 then local caller=G02017f[f9891b9]; f9891b9=f9891b9-1; w6df905=caller.code; iaf4152=caller.pc; b6af641=caller.base; ka0f97f=caller.top; sc6b262=caller.s; t14a6b3=caller.sp; y79bdb7=caller.sc; aa47817=caller.va; L8dac39=caller.lk; Faf0e64=caller.fr or caller; if caller.nRet==1 then t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=a[1] elseif caller.nRet==-1 then local r=P3e50f9(u0f4278(a)); t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=r else for j=1,#a do t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=a[j] end end else return u0f4278(a) end
 end
 ha4c476[0xb8d4]=function()
   if sc6b262[t14a6b3] then iaf4152=w6df905.c[iaf4152] else iaf4152=iaf4152+1 sc6b262[t14a6b3]=nil t14a6b3=t14a6b3-1 end
 end
 ha4c476[0x7122]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a <= b
 end
 ha4c476[0xa22d]=function()
   y79bdb7[#y79bdb7]=nil
 end
 ha4c476[0xfb2]=function()
   local n=w6df905.c[iaf4152] iaf4152=iaf4152+1
   local f=sc6b262[t14a6b3-n]
   local a={}
   for j=1,n do a[j]=sc6b262[t14a6b3-n+j] end
   t14a6b3=t14a6b3-n-1
   local la=#a
   if la>0 and qadb773(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   if f and j5d1348[f] then
     if j5d1348._instr then print(string.format("CALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Faf0e64.chunk or 0), tostring(f.proto or 0), tostring(f9891b9), tostring(w6df905.maxReg or 0), tostring(iaf4152), tostring(b6af641), tostring(ka0f97f), tostring(t14a6b3+1), tostring(-1))) end
     f9891b9=f9891b9+1
     G02017f[f9891b9]={code=w6df905, pc=iaf4152, base=b6af641, top=ka0f97f, s=sc6b262, sp=t14a6b3, sc=y79bdb7, va=aa47817, lk=L8dac39, fr=Faf0e64, nRet=-1, retDest=t14a6b3+1}
     local calleeProto2=f.proto
     local calleeChunk2=K5d3ded[calleeProto2]
     if not calleeChunk2 then error("bad proto "..tostring(calleeProto2).." CH="..tostring(#K5d3ded),0) end
     local newBASE=ka0f97f+1
     b6af641=newBASE
     ka0f97f=b6af641+(calleeChunk2.maxReg or 32)
     sc6b262={} t14a6b3=0
     y79bdb7={{}}
     aa47817=nil
     L8dac39=f.env
     w6df905=calleeChunk2
     iaf4152=1
     local ps2=w6df905.p
     for i2=1,#ps2 do local id2=ps2[i2] local v2=a[i2] local cell2={v2} efa09f5[b6af641+id2]=cell2 y79bdb7[1][id2]=cell2 end
     if w6df905.v then
       local vaArgs2={} for i2=#ps2+1,#a do vaArgs2[#vaArgs2+1]=a[i2] end
       if #vaArgs2>0 then aa47817=P3e50f9(u0f4278(vaArgs2)) else local t2={n=0} t2["mb23eb0520d"]=true aa47817=t2 end
     end
     Faf0e64={chunk=calleeProto2, pc=iaf4152, base=b6af641, top=ka0f97f, ret=nil, nRet=0, vararg=aa47817, upenv=L8dac39, caller=G02017f[f9891b9]}
   else
     local r=P3e50f9(f(u0f4278(a)))
     t14a6b3=t14a6b3+1
     sc6b262[t14a6b3]=r
   end
 end
 ha4c476[0x12e3]=function()
   local b=sc6b262[t14a6b3] local a=sc6b262[t14a6b3-1] t14a6b3=t14a6b3-1
   sc6b262[t14a6b3]=a * b
 end
 ha4c476[0x155e]=function()
   local p=sc6b262[t14a6b3] t14a6b3=t14a6b3-1 local t=sc6b262[t14a6b3] sc6b262[t14a6b3]=nil t14a6b3=t14a6b3-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 ha4c476[0xa66f]=function()
   if not sc6b262[t14a6b3] then iaf4152=w6df905.c[iaf4152] else iaf4152=iaf4152+1 sc6b262[t14a6b3]=nil t14a6b3=t14a6b3-1 end
 end
 ha4c476[0xdda8]=function()
   g876659[d55c8d0(w6df905.c[iaf4152])]=sc6b262[t14a6b3] t14a6b3=t14a6b3-1 iaf4152=iaf4152+1
 end
 ha4c476[0x9761]=function()
   local n=w6df905.c[iaf4152] iaf4152=iaf4152+1
   if f9891b9>0 then
     if j5d1348._instr then print(string.format("RETURN %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Faf0e64.chunk or 0), tostring(G02017f[f9891b9].code and G02017f[f9891b9].code.maxReg or 0), tostring(f9891b9), tostring(w6df905.maxReg or 0), tostring(iaf4152), tostring(b6af641), tostring(ka0f97f), tostring(G02017f[f9891b9].retDest or 0), tostring(G02017f[f9891b9].nRet or 0))) end
     local retVals={}
     if n==0 then local _=0
     elseif n==1 then retVals[1]=sc6b262[t14a6b3]; t14a6b3=t14a6b3-1
     else for j=1,n do retVals[j]=sc6b262[t14a6b3-n+j] end; t14a6b3=t14a6b3-n end
     local caller=G02017f[f9891b9]; f9891b9=f9891b9-1; w6df905=caller.code; iaf4152=caller.pc; b6af641=caller.base; ka0f97f=caller.top; sc6b262=caller.s; t14a6b3=caller.sp; y79bdb7=caller.sc; aa47817=caller.va; L8dac39=caller.lk; Faf0e64=caller.fr or caller
     if caller.nRet==1 then t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=retVals[1]
     elseif caller.nRet==-1 then local r=P3e50f9(u0f4278(retVals)); t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=r
     else for j=1,#retVals do t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=retVals[j] end end
   else
     if n==0 then return end
     if n==1 then return sc6b262[t14a6b3] end
     local a={} for j=1,n do a[j]=sc6b262[t14a6b3-n+j] end; return u0f4278(a)
   end
 end
 ha4c476[61788]=function()
  local t=sc6b262[t14a6b3] sc6b262[t14a6b3]=t
 end
 ha4c476[60625]=function()
  local k=sc6b262[t14a6b3] t14a6b3=t14a6b3-1 local t=sc6b262[t14a6b3] sc6b262[t14a6b3]=t[k]
 end
 ha4c476[61015]=function()
  iaf4152=w6df905.c[iaf4152]
 end
 while true do
  local o0eedfd=w6df905.c[iaf4152] iaf4152=iaf4152+1
  if o0eedfd==38753 then
   local n=w6df905.c[iaf4152] iaf4152=iaf4152+1
   if f9891b9>0 then
     if j5d1348._instr then print(string.format("RETURN %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Faf0e64.chunk or 0), tostring(G02017f[f9891b9].code and G02017f[f9891b9].code.maxReg or 0), tostring(f9891b9), tostring(w6df905.maxReg or 0), tostring(iaf4152), tostring(b6af641), tostring(ka0f97f), tostring(G02017f[f9891b9].retDest or 0), tostring(G02017f[f9891b9].nRet or 0))) end
     local retVals={}
     if n==0 then local _=0
     elseif n==1 then retVals[1]=sc6b262[t14a6b3]; t14a6b3=t14a6b3-1
     else for j=1,n do retVals[j]=sc6b262[t14a6b3-n+j] end; t14a6b3=t14a6b3-n end
     local caller=G02017f[f9891b9]; f9891b9=f9891b9-1; w6df905=caller.code; iaf4152=caller.pc; b6af641=caller.base; ka0f97f=caller.top; sc6b262=caller.s; t14a6b3=caller.sp; y79bdb7=caller.sc; aa47817=caller.va; L8dac39=caller.lk; Faf0e64=caller.fr or caller
     if caller.nRet==1 then t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=retVals[1]
     elseif caller.nRet==-1 then local r=P3e50f9(u0f4278(retVals)); t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=r
     else for j=1,#retVals do t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=retVals[j] end end
   else
     if n==0 then return end
     if n==1 then return sc6b262[t14a6b3] end
     local a={} for j=1,n do a[j]=sc6b262[t14a6b3-n+j] end; return u0f4278(a)
   end
  elseif o0eedfd==36023 then
   if j5d1348._instr and f9891b9>0 then print(string.format("RETURN RETP %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Faf0e64.chunk or 0), tostring(G02017f[f9891b9].code and G02017f[f9891b9].code.maxReg or 0), tostring(f9891b9), tostring(w6df905.maxReg or 0), tostring(iaf4152), tostring(b6af641), tostring(ka0f97f), tostring(G02017f[f9891b9].retDest or 0), tostring(G02017f[f9891b9].nRet or 0))) end
   local k=w6df905.c[iaf4152] iaf4152=iaf4152+1
   local p=sc6b262[t14a6b3] t14a6b3=t14a6b3-1
   local a={} for j=1,k do a[j]=sc6b262[t14a6b3-k+j] end t14a6b3=t14a6b3-k
   for j=1,p.n do a[k+j]=p[j] end
   if f9891b9>0 then local caller=G02017f[f9891b9]; f9891b9=f9891b9-1; w6df905=caller.code; iaf4152=caller.pc; b6af641=caller.base; ka0f97f=caller.top; sc6b262=caller.s; t14a6b3=caller.sp; y79bdb7=caller.sc; aa47817=caller.va; L8dac39=caller.lk; Faf0e64=caller; if caller.nRet==1 then t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=a[1] elseif caller.nRet==-1 then local r=P3e50f9(u0f4278(a)); t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=r else for j=1,#a do t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=a[j] end end else return u0f4278(a) end
  elseif o0eedfd==30530 then
   local n=w6df905.c[iaf4152] iaf4152=iaf4152+1
   local f=sc6b262[t14a6b3-n]
   local a={} for j=1,n do a[j]=sc6b262[t14a6b3-n+j] end t14a6b3=t14a6b3-n-1
   local la=#a if la>0 and qadb773(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end
   if f and j5d1348[f] then
     if j5d1348._instr then print(string.format("TAILCALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Faf0e64.chunk or 0), tostring(f.proto or 0), tostring(f9891b9), tostring(w6df905.maxReg or 0), tostring(iaf4152), tostring(b6af641), tostring(ka0f97f), tostring(-1), tostring(-1))) end
     local calleeProto3=f.proto local calleeChunk3=K5d3ded[calleeProto3] if not calleeChunk3 then error("bad tail proto "..tostring(calleeProto3),0) end for i3=b6af641,ka0f97f do efa09f5[i3]=nil end local newBASE3=b6af641 b6af641=newBASE3 ka0f97f=b6af641+(calleeChunk3.maxReg or 32) sc6b262={} t14a6b3=0 y79bdb7={{}} L8dac39=f.env w6df905=calleeChunk3 iaf4152=1 local ps3=w6df905.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} efa09f5[b6af641+id3]=cell3 y79bdb7[1][id3]=cell3 end if w6df905.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then aa47817=P3e50f9(u0f4278(vaArgs3)) else local t3={n=0} t3["mb23eb0520d"]=true aa47817=t3 end else aa47817=nil end Faf0e64={chunk=calleeProto3, pc=iaf4152, base=b6af641, top=ka0f97f, ret=nil, nRet=0, vararg=aa47817, upenv=L8dac39, caller=Faf0e64.caller}
   else
     if f9891b9>0 then
       local ret_P = P3e50f9(f(u0f4278(a)))
       local caller_T = G02017f[f9891b9]; f9891b9=f9891b9-1; w6df905=caller_T.code; iaf4152=caller_T.pc; b6af641=caller_T.base; ka0f97f=caller_T.top; sc6b262=caller_T.s; t14a6b3=caller_T.sp; y79bdb7=caller_T.sc; aa47817=caller_T.va; L8dac39=caller_T.lk; Faf0e64=caller_T
       if caller_T.nRet==1 then t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=ret_P[1]
       elseif caller_T.nRet==-1 then t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=ret_P
       else for j_T=1,ret_P.n do t14a6b3=t14a6b3+1; sc6b262[t14a6b3]=ret_P[j_T] end end
     else return f(u0f4278(a)) end
   end
  else
   local _fn=ha4c476[o0eedfd]
   if _fn then _fn() else error("bad opcode "..tostring(o0eedfd),0) end
  end
 end
end
do
 local ok,err=pcall(R47b06e,1,{})
 if not ok then error(err,0) end
end