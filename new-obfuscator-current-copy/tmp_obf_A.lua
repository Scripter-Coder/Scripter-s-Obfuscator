-- 3c7e0aa57b028f4b | DO NOT EDIT
local _da78369=function(a0e782a,b1917bb,...)
 while true do
  local _s007d={} local _t8efb=0
  local _y02dd={{}}
  local _idace=1
  local _wb840=a0e782a[b1917bb]
  local of63e20=_wb840.c[_idace]
  if of63e20==1 then _s007d[_t8efb]="x" end
 end
end
local _b4936={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _rca58={{1,41}}
local d86680c=function(i) local a=_b4936[1] local rr=_rca58[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b49362={214,17,239,131,189,168} do local rp=1 while rp<=#_b49362 do local np=_b49362[rp]+_b49362[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b49362[rp]+_b49362[rp+1]*256 rp=rp+2 end local va=(_b49362[rp]==1) rp=rp+1 local nc=_b49362[rp]+_b49362[rp+1]*256+_b49362[rp+2]*65536+_b49362[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b49362[rp]+_b49362[rp+1]*256+_b49362[rp+2]*65536+_b49362[rp+3]*16777216 rp=rp+4 end end end
end
local g05cb54=_G
if getfenv then local _le=getfenv(0) if _le then g05cb54=_le end end
local hg169770={}
if getgenv then g05cb54=getgenv() end
if not g05cb54 then g05cb54=_G end
local vfe056e={137,12,56,236,112,11,97,252,218,151,9,242,125,97,146,210,133,135,150,98,248,52,43,34,58,72,95,227,173,140,180,91,81,41,162,109,137,14,114,106,146,66,152,141,29,179,54,96,165,161,230,165,235,62,35,4,85,64,150,146,139,110,152,5,4,213,42,95,21,106,96,62,183,79,110,189,74,15,124,104,168,40,118,72,137,94,223,2}
local c30d486={}
local r696d30={{0,1},{1,5},{6,1},{7,40},{47,21},{68,20}}
local m924611={}
local iveb4e5d=224
local d6397c5=function(i)
 local c=c30d486[i] if c then return c end
 local rr=r696d30[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=iveb4e5d
 for j=1,ln do
  local p=st+j
  local a=vfe056e[p] local b=(101*p+40+3695665631*1.0*((p*p)%30))%251+248
  local kb=(b + prev*82)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 c30d486[i]=t return t
end
local u2e2a10
if table.unpack then u2e2a10=table.unpack else u2e2a10=unpack end
if not u2e2a10 then u2e2a10=unpack end
local Pc9cd32=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["mad1a0d89c2"]=true
 return t
end
local qb4c8a2=function(t) return type(t)=="table" and t["mad1a0d89c2"]==true end
local b8f4971={}
do
 local src={133,56,65,176,90,106,208,69,155,26,221,250,116,67,104,244,211,229,108,72,124,10,233,247,95,163,228,130,114,186,93,146,247,79,79,164,86,93,186,166,179,228,163,187,40,233,10,52,116,108,229,143,146,104,67,117,251,221,26,27,69,208,106,222,127,65,56,133,45,43,127,44,51,180,68,29,178,110,202,235,175,201,134,45,42,161,150,191,30,242,162,116,139,193,116,83,118,14,7,74,218,207,73,172,188,19,178,166,28,203,234,171,240,6,59,52,71,181,65,12,23,226,124,232,96,141,67,130,39,177,56,114,103,83,5,8,37,110,92,62,92,7,225,78,17,25,102,244,63,164,240,115,230,173,75,101,16,52,188,179,174,52,38,51,202,173,57,177,100,164,119,13,119,25,233,204,8,7,49,88,18,110,230,243,149,83,184,54,150,177,248,9,21,141,147,224,13,226,82,148,126,181,176,111,109,6,249,34,213,203,223,127,187,19,201,16,31,207,75,119,247,14,1,45,82,193,136,204,38,242,97,193,115,161,91,104,62,201,144,122,130,111,141,193,68,142,21,68,127,43,53,208,56,65,213,138,106,208,223,189,26,221,142,164,67,104,115,131,229,108,151,156,10,233,109,177,163,228,56,86,186,93,30,152,79,79,230,136,93,186,130,59,228,163,14,255,233,10,158,209,108,229,89,190,104,67,54,143,221,26,33,77,208,106,66,245,65,56,81,30,43,127,96,38,142,68,168,49,111,130,63,156,201,62,101,39,161,115,216,192,242,38,116,108,193,82,126,102,14,247,48,58,207,31,40,103,19,187,13,200,203,213,116,229,6,109,97,82,181,126,159,23,213,13,206,96,141,93,238,39,177,195,140,103,83,249,63,37,110,205,199,92,7,170,118,17,25,65,65,63,164,42,111,230,173,4,199,16,52,86,0,174,52,166,149,202,173,57,157,100,164,200,112,119,25,235,143,8,7,41,220,18,110,155,184,149,83,118,21,150,177,227,188,21,141,21,89,13,226,30,133,126,181,176,111,109,6,67,238,213,203,13,122,187,19,255,30,31,207,105,148,247,14,73,168,82,193,221,199,38,242,151,71,115,161,136,32,62,201,67,253,130,111,170,5,68,142,201,254,127,43,227,0,56,65,241,107,106,208,115,244,26,221,19,175,67,104,77,26,229,108,27,190,10,233,220,194,163,228,30,40,186,93,166,30,79,79,71,10,93,186,96,176,228,163,80,243,233,10,57,64,108,229,198,185,104,67,183,58,221,26,108,195,208,106,83,184,65,56,212,28,43,127,105,35,142,68,111,35,111,130,88,123,201,62,75,14,161,115,236,10,242,38,253,144,193,82,78,98,14,247,17,235,207,31,201,164,19,187,96,252,203,213,40,192,6,109,220,46,181,126,237,247,226,13,55,234,141,21,255,227,177,150,161,135,83,149,13,180,110,18,233,120,7,8,175,170,25,119,146,22,164,100,22,235,173,202,47,68,52,174,213,181,52,16,178,113,173,230,123,100,132,63,49,56,25,17,95,182,141,92,12,51,169,37,50,150,52,103,209,73,122,39,238,163,90,96,137,181,198,23,157,161,82,71,47,178,180,240,58,69,241,28,190,87,5,188,192,189,230,218,64,209,100,118,57,81,166,139,171,112,233,30,155,112,198,42,9,111,248,175,235,164,5,178,80,197,67,51,46,109,27,45,133,216,28,160,90,125,186,145,168,8,237,251,116,179,98,227,185,167,24,73,124,154,211,40,184,79,242,128,114,242,96,86,165,191,69,165,86,84,162,114,128,13,178,184,40,191,17,124,73,116,176,185,227,57,114,116,251,30,219,168,145,68,99,90,160,52,232,133,45,244,152,46,51,254,164,80,178,61,64,235,175,44,26,9,42,233,78,155,30,227,226,171,139,119,133,57,118,189,35,64,218,70,195,192,188,86,178,190,28,74,242,58,240,130,178,47,71,80,90,157,23,172,24,137,96,248,197,238,39,4,2,209,103,35,117,50,37,177,217,12,92,33,98,95,17,105,151,48,63,133,163,122,230,114,1,66,16,192,212,131,174,150,57,66,202,3,69,122,100,181,251,48,119,87,4,95,8,231,1,12,18,59,120,50,149,34,6,209,150,198,51,238,21,41,136,137,13,24,199,157,126,251,117,47,109,228,104,58,213,90,43,190,187,246,152,192,31,222,30,64,247,144,44,57,82,130,85,171,38,123,194,155,115,227,14,9,62,113,139,235,130,109,178,98,68,153,51,47,77,43,45,133,192,194,160,90,131,193,145,168,132,135,251,116,17,170,227,185,38,173,73,124,72,205,40,184,235,217,128,114,244,111,86,165,110,136,165,86,184,158,114,128,149,194,184,40,161,55,124,73,178,5,185,227,42,55,116,251,61,71,168,145,152,87,90,160,15,45,133,45,187,69,46,51,15,137,80,178,187,177,235,175,156,99,9,42,244,46,155,30,65,242,171,139,33,15,57,118,75,254,64,218,204,120,192,188,205,91,190,28,51,86,58,240,241,45,47,71,173,43,157,23,161,211,137,96,117,150,238,39,196,70,209,103,253,54,50,37,170,64,12,92,185,130,95,17,108,167,48,63,246,166,122,230,114,1,66,16,37,106,131,174,18,122,66,202,232,239,122,100,211,43,48,119,47,96,95,8,163,180,12,18,127,225,50,149,101,22,209,150,15,173,238,21,142,7,137,13,24,199,157,126,181,71,47,40,6,240,58,10,44,28,190,154,212,188,192,243,217,218,64,200,159,118,57,166,187,139,171,116,48,30,155,242,108,42,9,136,30,175,235,129,8,178,80,52,110,51,46,8,63,45,133,192,210,160,90,134,198,145,168,109,201,251,116,82,172,227,185,21,102,73,124,206,187,40,184,214,52,128,114,62,130,86,165,88,37,165,86,165,41,114,128,70,138,184,40,172,3,124,73,125,33,185,227,47,83,116,251,77,32,168,145,200,63,90,160,169,227,133,45,105,11,46,51,216,40,80,178,238,165,235,175,57,133,9,42,240,66,155,30,45,148,171,139,49,233,57,118,254,76,64,218,124,203,192,188,37,202,190,28,59,110,58,240,245,4,47,71,97,77,157,23,33,204,137,96,195,0,238,39,7,65,209,103,38,69,50,37,134,201,12,92,240,72,95,17,245,97,48,63,17,240,122,230,114,45,66,16,129,58,131,174,65,192,66,202,232,239,122,100,94,239,48,119,170,197,95,8,231,1,12,18,150,182,50,149,215,184,209,150,243,83,238,21,224,52,137,13,147,118,157,126,251,117,47,109,228,172,58,213,131,33,190,187,69,167,192,31,17,58,64,247,250,12,57,82,131,175,171,38,183,23,155,115}
 for i=1,#src do
  local a=src[(i)] local _junk55e=0 local b=((i*i*43+i*45+292)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b8f4971[i]=r
 end
end
local K6b99de={}
do
 local rp=1
 while rp<=#b8f4971 do
  local np=b8f4971[rp] + b8f4971[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b8f4971[rp] + b8f4971[rp+1]*256 rp=rp+2 end
  local va=(b8f4971[rp]==1) rp=rp+1
  local nc=b8f4971[rp] + b8f4971[rp+1]*256 + b8f4971[rp+2]*65536 + b8f4971[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b8f4971[rp] + b8f4971[rp+1]*256 + b8f4971[rp+2]*65536 + b8f4971[rp+3]*16777216
   rp=rp+4
  end
  K6b99de[#K6b99de+1]={c=cd,p=ps,v=va}
 end
end
local ow55a7b6={}
local rgb51bd0={} local fr665e47={} local fp3d3a74=0 local ba49bd2d=0 local to242214=0 local nbf2708e=0
local cudb3717=nil local dne23b19=false local rs1fa40d={} local vfmb4fcb8={} local schf283dd local ivkfd2d98
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rgb51bd0 st.fr=fr665e47 st.fp=fp3d3a74 st.ba=ba49bd2d st.to=to242214 st.cu=cudb3717 st.co=we45869 st.pc=i087757 st.sp=te2619f st.sc=ya66076 st.lk=L085fa0 st.va=acd4a11 st.nb=nbf2708e st.dn=dne23b19 st.rs=rs1fa40d end
local __vms_load_state=function(st) rgb51bd0=st.rg or {} fr665e47=st.fr or {} fp3d3a74=st.fp or 0 ba49bd2d=st.ba or 0 to242214=st.to or 0 cudb3717=st.cu we45869=st.co i087757=st.pc or 1 te2619f=st.sp or 0 ya66076=st.sc or {{}} L085fa0=st.lk or {} acd4a11=st.va nbf2708e=st.nb or 0 dne23b19=st.dn or false rs1fa40d=st.rs or {} if fp3d3a74>0 then local q=fr665e47[fp3d3a74] if not q or q.owner~=ow55a7b6 then error("VM_STATE_FRAME_OWNER",0) end if ba49bd2d~=q.base or to242214~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local s108e60=setmetatable({}, {__index=function(_,k) return rgb51bd0[ba49bd2d+k] end, __newindex=function(_,k,v) rgb51bd0[ba49bd2d+k]=v end})
local vf2eee64=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivkfd2d98(d,...) end vfmb4fcb8[f]=d return f end
local pf7c0bcc local xf7fa856 local sffce0c2 local lf38e39b local rt15f72b
local R40a7c3
R40a7c3=function(x0a1109,L085fa0,...)
 fr665e47={} fp3d3a74=0 nbf2708e=0 dne23b19=false rs1fa40d={}
 __vms_root_state={}
 pf7c0bcc=function(ci,links,args,retDest,nRet,caller,meta)
  local code=K6b99de[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nbf2708e,top=nbf2708e+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nbf2708e+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=ow55a7b6}
  nbf2708e=nbf2708e+512
  fp3d3a74=fp3d3a74+1 fr665e47[fp3d3a74]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["mad1a0d89c2"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sffce0c2=function(f) if not f then return end f.pc=i087757 f.base=ba49bd2d f.top=to242214 f.sp=te2619f f.sc=ya66076 f.lk=L085fa0 f.va=acd4a11 f.sanext=cudb3717.sanext f.sasizes=cudb3717.sasizes end
 lf38e39b=function(f) cudb3717=f we45869=K6b99de[f.chunk] i087757=f.pc ba49bd2d=f.base to242214=f.top te2619f=f.sp ya66076=f.sc L085fa0=f.lk acd4a11=f.va end
 rt15f72b=function(n,packed)
  local f=fr665e47[fp3d3a74] local vals={}
  if packed then local p=s108e60[te2619f] local pn=(p and p.n) or 0 for i=1,n do vals[i]=s108e60[te2619f-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=s108e60[te2619f-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sffce0c2(f)
   for i=f.base,f.top do rgb51bd0[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rgb51bd0[i]=nil end end
   fr665e47[fp3d3a74]=nil fp3d3a74=fp3d3a74-1
   lf38e39b(caller)
   local q={n=0} q["mad1a0d89c2"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   te2619f=meta.dest s108e60[te2619f]=q
   return
  end
  sffce0c2(f)
  rgb51bd0[f.base]=rgb51bd0[f.base]
  for i=f.base,f.top do rgb51bd0[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rgb51bd0[i]=nil end end
  fr665e47[fp3d3a74]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rs1fa40d=vals dne23b19=true return end
  fp3d3a74=fp3d3a74-1 local cf=fr665e47[fp3d3a74]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf38e39b(cf)
  local d=f.retDest or (te2619f+1)
  if f.nRet==0 then return end
  te2619f=d-1
  if f.nRet==1 then te2619f=d s108e60[te2619f]=vals[1] else local q={n=#vals} q["mad1a0d89c2"]=true for i=1,#vals do q[i]=vals[i] end te2619f=d s108e60[te2619f]=q end
 end
 pf7c0bcc(x0a1109,L085fa0,{...},nil,0,nil)
  local f=fr665e47[fp3d3a74]
  if not f then error("VM_FRAME_MISSING",0) end
  lf38e39b(f)
 local hfd88a9={}
 hfd88a9[59556]=function()
   local n=we45869.c[i087757] i087757=i087757+1
   local a={} for j=1,n do a[j]=s108e60[te2619f-n+j] end te2619f=te2619f-n-1
   local la=n if la>0 and qb4c8a2(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfmb4fcb8[f]
   if vd then
    local caller=cudb3717 local dest=te2619f+1 sffce0c2(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf7c0bcc(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf38e39b(fr665e47[fp3d3a74])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],u2e2a10(a,3,la)) else ok,rr=pcall(f,u2e2a10(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["mad1a0d89c2"]=true q[1]=ok q[2]=rr te2619f=te2619f+1 s108e60[te2619f]=q
   end
 end
 hfd88a9[4167]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a + b
 end
 hfd88a9[21188]=function()
   local id=we45869.c[i087757] local b=nil i087757=i087757+1
   for i=#ya66076,1,-1 do b=ya66076[i][id] if b then break end end
   te2619f=te2619f+1 s108e60[te2619f]=b and b[1]
 end
 hfd88a9[48112]=function()
   local k=s108e60[te2619f] te2619f=te2619f-1 local t=s108e60[te2619f] s108e60[te2619f]=t[k]
 end
 hfd88a9[54451]=function()
   s108e60[te2619f]=nil te2619f=te2619f-1
 end
 hfd88a9[23167]=function()
   local n=we45869.c[i087757] i087757=i087757+1
   local a={} for j=1,n do a[j]=s108e60[te2619f-n+j] end te2619f=te2619f-n-1
   local la=n if la>0 and qb4c8a2(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfmb4fcb8[f]
   if vd then
    local caller=cudb3717 local dest=te2619f+1 sffce0c2(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf7c0bcc(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf38e39b(fr665e47[fp3d3a74])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],u2e2a10(a,3,la)) else ok,rr=pcall(f,u2e2a10(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["mad1a0d89c2"]=true q[1]=ok q[2]=rr te2619f=te2619f+1 s108e60[te2619f]=q
   end
 end
 hfd88a9[37183]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a % b
 end
 hfd88a9[6998]=function()
   s108e60[te2619f]=s108e60[te2619f][1]
 end
 hfd88a9[52191]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a * b
 end
 hfd88a9[35518]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a <= b
 end
 hfd88a9[5868]=function()
   local ci=we45869.c[i087757] i087757=i087757+1
   local links={}
   for i=1,#L085fa0 do links[#links+1]=L085fa0[i] end
   for i=1,#ya66076 do links[#links+1]=ya66076[i] end
   te2619f=te2619f+1
   s108e60[te2619f]=vf2eee64(ci,links)
 end
 hfd88a9[12625]=function()
   g05cb54[d6397c5(we45869.c[i087757])]=s108e60[te2619f] te2619f=te2619f-1 i087757=i087757+1
 end
 hfd88a9[15688]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a + b
 end
 hfd88a9[57566]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a * b
 end
 hfd88a9[53365]=function()
   local v=s108e60[te2619f] local k=s108e60[te2619f-1] local t=s108e60[te2619f-2] t[k]=v te2619f=te2619f-3
 end
 hfd88a9[53498]=function()
   te2619f=te2619f+1 s108e60[te2619f]=d6397c5(we45869.c[i087757]) i087757=i087757+1
 end
 hfd88a9[12306]=function()
   local _mode=we45869.c[i087757] i087757=i087757+1
   local idx=s108e60[te2619f] local b=s108e60[te2619f-1] te2619f=te2619f-2
   local f=cudb3717 local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then te2619f=te2619f+1 s108e60[te2619f]=nil else te2619f=te2619f+1 s108e60[te2619f]=rgb51bd0[b+idx-1] end
 end
 hfd88a9[57456]=function()
   local _n=(s108e60[te2619f]==nil) s108e60[te2619f]=nil te2619f=te2619f-1 if _n then i087757=we45869.c[i087757] else i087757=i087757+1 end
 end
 hfd88a9[50977]=function()
   local k=s108e60[te2619f] te2619f=te2619f-1 local t=s108e60[te2619f] s108e60[te2619f]=t[k]
 end
 hfd88a9[6153]=function()
   ya66076[#ya66076+1]={}
 end
 hfd88a9[28982]=function()
   local n=we45869.c[i087757] i087757=i087757+1
   local f=s108e60[te2619f-n]
   local a={}
   for j=1,n do a[j]=s108e60[te2619f-n+j] end
   te2619f=te2619f-n-1
   local la=n
   if la>0 and qb4c8a2(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfmb4fcb8[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cudb3717 local dest=te2619f+1
    sffce0c2(caller)
    local vc=vd or f pf7c0bcc(vc.chunk,vc.links,a,dest,1,caller)
    lf38e39b(fr665e47[fp3d3a74])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sffce0c2(cudb3717) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=Pc9cd32(f(u2e2a10(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf38e39b(cudb3717) end
    te2619f=te2619f+1
    s108e60[te2619f]=r[1]
   end
 end
 hfd88a9[23198]=function()
   s108e60[te2619f]=s108e60[te2619f][2]
 end
 hfd88a9[16631]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a == b
 end
 hfd88a9[3436]=function()
   te2619f=te2619f+1 s108e60[te2619f]=nil
 end
 hfd88a9[56457]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a ^ b
 end
 hfd88a9[38069]=function()
   local b=s108e60[te2619f] local n=cudb3717.sasizes and cudb3717.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end s108e60[te2619f]=n
 end
 hfd88a9[10113]=function()
   s108e60[te2619f]=-s108e60[te2619f]
 end
 hfd88a9[2373]=function()
   local _mode=we45869.c[i087757] i087757=i087757+1
   local v=s108e60[te2619f] local idx=s108e60[te2619f-1] local b=s108e60[te2619f-2] te2619f=te2619f-3
   local f=cudb3717 local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rgb51bd0[b+idx-1]=v
 end
 hfd88a9[49746]=function()
   if s108e60[te2619f] then i087757=we45869.c[i087757] else i087757=i087757+1 s108e60[te2619f]=nil te2619f=te2619f-1 end
 end
 hfd88a9[14225]=function()
   local ix=we45869.c[i087757] i087757=i087757+1
   s108e60[te2619f]=s108e60[te2619f][ix]
 end
 hfd88a9[21784]=function()
   te2619f=te2619f+1 s108e60[te2619f]=false
 end
 hfd88a9[4585]=function()
   local n=we45869.c[i087757] i087757=i087757+1
   local f=cudb3717 local b=f.sanext or (ba49bd2d+256) local lim=ba49bd2d+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n to242214=math.max(to242214,ba49bd2d+255)
   te2619f=te2619f+1 s108e60[te2619f]=b
 end
 hfd88a9[52609]=function()
   if not s108e60[te2619f] then i087757=we45869.c[i087757] else i087757=i087757+1 s108e60[te2619f]=nil te2619f=te2619f-1 end
 end
 hfd88a9[33784]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a - b
 end
 hfd88a9[56296]=function()
   te2619f=te2619f+1 s108e60[te2619f]={}
 end
 hfd88a9[10658]=function()
   local _v=s108e60[te2619f] s108e60[te2619f]=nil te2619f=te2619f-1 if _v then i087757=we45869.c[i087757] else i087757=i087757+1 end
 end
 hfd88a9[59359]=function()
   te2619f=te2619f+1 s108e60[te2619f]=g05cb54[d6397c5(we45869.c[i087757])] i087757=i087757+1
 end
 hfd88a9[27174]=function()
   local k=we45869.c[i087757] i087757=i087757+1
   rt15f72b(k,true)
 end
 hfd88a9[39138]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a >= b
 end
 hfd88a9[21613]=function()
   local _v=s108e60[te2619f] s108e60[te2619f]=nil te2619f=te2619f-1 if not _v then i087757=we45869.c[i087757] else i087757=i087757+1 end
 end
 hfd88a9[45791]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a > b
 end
 hfd88a9[14992]=function()
   s108e60[te2619f]=s108e60[te2619f][3]
 end
 hfd88a9[27734]=function()
   s108e60[te2619f]=#s108e60[te2619f]
 end
 hfd88a9[5454]=function()
   local n=we45869.c[i087757] i087757=i087757+1
   local pt=s108e60[te2619f] s108e60[te2619f]=nil te2619f=te2619f-1
   for j=1,n do te2619f=te2619f+1 s108e60[te2619f]=pt[j] end
 end
 hfd88a9[13268]=function()
   local ix=we45869.c[i087757] i087757=i087757+1
   local n=m924611[ix]
   if not n then n=tonumber(d6397c5(ix)) m924611[ix]=n end
   te2619f=te2619f+1 s108e60[te2619f]=n
 end
 hfd88a9[57220]=function()
   local n=we45869.c[i087757] i087757=i087757+1
   rt15f72b(n,false)
 end
 hfd88a9[26371]=function()
   local id=we45869.c[i087757] local v=s108e60[te2619f] te2619f=te2619f-1 i087757=i087757+1
   local b=nil for i=#L085fa0,1,-1 do b=L085fa0[i][id] if b then break end end
   if b then b[1]=v end
 end
 hfd88a9[37880]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a / b
 end
 hfd88a9[27123]=function()
   te2619f=te2619f+1 s108e60[te2619f]=s108e60[te2619f-1]
 end
 hfd88a9[24945]=function()
   ya66076[#ya66076]=nil
 end
 hfd88a9[9445]=function()
   local id=we45869.c[i087757] local v=s108e60[te2619f] te2619f=te2619f-1 i087757=i087757+1
   local b=nil for i=#ya66076,1,-1 do b=ya66076[i][id] if b then break end end
   if b then b[1]=v end
 end
 hfd88a9[41902]=function()
   local p=s108e60[te2619f] te2619f=te2619f-1 local t=s108e60[te2619f] s108e60[te2619f]=nil te2619f=te2619f-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 hfd88a9[2452]=function()
   local id=we45869.c[i087757] local b=nil i087757=i087757+1
   for i=#L085fa0,1,-1 do b=L085fa0[i][id] if b then break end end
   te2619f=te2619f+1 s108e60[te2619f]=b and b[1]
 end
 hfd88a9[9282]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a ~= b
 end
 hfd88a9[29762]=function()
   local n=we45869.c[i087757] i087757=i087757+1
   local f=s108e60[te2619f-n]
   local a={}
   for j=1,n do a[j]=s108e60[te2619f-n+j] end
   te2619f=te2619f-n-1
   local la=n
   if la>0 and qb4c8a2(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfmb4fcb8[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cudb3717 local dest=te2619f+1
    sffce0c2(caller)
    local vc=vd or f pf7c0bcc(vc.chunk,vc.links,a,dest,-1,caller)
    lf38e39b(fr665e47[fp3d3a74])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sffce0c2(cudb3717) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=Pc9cd32(f(u2e2a10(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf38e39b(cudb3717) end
    te2619f=te2619f+1
    s108e60[te2619f]=r
   end
 end
 hfd88a9[2800]=function()
   local ix=we45869.c[i087757] i087757=i087757+1
   local n=m924611[ix] if not n then n=tonumber(d6397c5(ix)) m924611[ix]=n end
   s108e60[te2619f]=s108e60[te2619f]*n
 end
 hfd88a9[23778]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a < b
 end
 hfd88a9[27159]=function()
   local id=we45869.c[i087757] local v=s108e60[te2619f] s108e60[te2619f]=nil te2619f=te2619f-1 i087757=i087757+1
   ya66076[#ya66076][id]={v}
 end
 hfd88a9[24032]=function()
   local b=s108e60[te2619f] local a=s108e60[te2619f-1] te2619f=te2619f-1
   s108e60[te2619f]=a .. b
 end
 hfd88a9[31476]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 hfd88a9[34254]=function()
   if not acd4a11 then local t={n=0} t["mad1a0d89c2"]=true acd4a11=t end
   te2619f=te2619f+1 s108e60[te2619f]=acd4a11
 end
 hfd88a9[55222]=function()
 end
 hfd88a9[5239]=function()
   local ix=we45869.c[i087757] i087757=i087757+1
   local k=d6397c5(ix) local v=hg169770[k] if v==nil then v=g05cb54[k] hg169770[k]=v end
   te2619f=te2619f+1 s108e60[te2619f]=v
 end
 hfd88a9[49603]=function()
   s108e60[te2619f]=not s108e60[te2619f]
 end
 hfd88a9[9400]=function()
   local n=we45869.c[i087757] i087757=i087757+1
   local f=s108e60[te2619f-n] local a={} for j=1,n do a[j]=s108e60[te2619f-n+j] end te2619f=te2619f-n-1
   local la=n if la>0 and qb4c8a2(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfmb4fcb8[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cudb3717 local base0=ba49bd2d local top0=to242214 local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rgb51bd0[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rgb51bd0[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=ow55a7b6}
    local cc=K6b99de[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["mad1a0d89c2"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    fr665e47[fp3d3a74]=nf lf38e39b(nf)
   else
    local r=Pc9cd32(f(u2e2a10(a,1,la))) te2619f=te2619f+1 s108e60[te2619f]=r rt15f72b(0,true)
   end
 end
 hfd88a9[23893]=function()
   i087757=we45869.c[i087757]
 end
 hfd88a9[12878]=function()
   local ix=we45869.c[i087757] i087757=i087757+1
   local n=m924611[ix] if not n then n=tonumber(d6397c5(ix)) m924611[ix]=n end
   s108e60[te2619f]=s108e60[te2619f]+n
 end
 hfd88a9[50193]=function()
   s108e60[te2619f],s108e60[te2619f-1]=s108e60[te2619f-1],s108e60[te2619f]
 end
 hfd88a9[56899]=function()
   te2619f=te2619f+1 s108e60[te2619f]=true
 end
 hfd88a9[62895]=function()
  i087757=we45869.c[i087757]
 end
 hfd88a9[62816]=function()
  local t=s108e60[te2619f] s108e60[te2619f]=t
 end
 hfd88a9[64071]=function()
  local t=s108e60[te2619f] s108e60[te2619f]=t
 end
 hfd88a9[63964]=function()
  local k=s108e60[te2619f] te2619f=te2619f-1 local t=s108e60[te2619f] s108e60[te2619f]=t[k]
 end
 hfd88a9[60031]=function()
  te2619f=te2619f+1 s108e60[te2619f]=d6397c5(we45869.c[i087757]) i087757=i087757+1
 end
 hfd88a9[62341]=function()
  te2619f=te2619f+1 s108e60[te2619f]=d6397c5(we45869.c[i087757]) i087757=i087757+1
 end
 hfd88a9[64790]=function()
  te2619f=te2619f+1 s108e60[te2619f]=d6397c5(we45869.c[i087757]) i087757=i087757+1
 end
 schf283dd=function(stop)
  while fp3d3a74>stop and not dne23b19 do
   local f=fr665e47[fp3d3a74] if not f then error("VM_FRAME_MISSING",0) end
   lf38e39b(f)
   if fp3d3a74<1 or fp3d3a74>#fr665e47 or fr665e47[fp3d3a74]~=cudb3717 then error("VM_STATE_FP",0) end
   if cudb3717.owner~=ow55a7b6 then error("VM_STATE_FRAME_OWNER",0) end
   if we45869~=K6b99de[cudb3717.chunk] then error("VM_STATE_CODE",0) end
   if i087757%1~=0 or i087757<1 or i087757>#we45869.c then error("VM_STATE_PC",0) end
   if ba49bd2d%1~=0 or to242214%1~=0 or ba49bd2d<0 or to242214<ba49bd2d or to242214>ba49bd2d+255 then error("VM_STATE_BOUNDS",0) end
   if te2619f%1~=0 or te2619f<0 or te2619f>to242214-ba49bd2d then error("VM_STATE_SP",0) end
   local ob6caea=we45869.c[i087757] i087757=i087757+1
   local _fn=hfd88a9[ob6caea]
   local _yieldop=(ob6caea==28982 or ob6caea==29762)
   local _ok,_err=true,nil
   if _yieldop and not (cudb3717 and cudb3717.prot) then if _fn then _fn() else error("bad opcode "..tostring(ob6caea),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(ob6caea),0) end end) end
   if not _ok then
    local handled=false local ei=fp3d3a74
    while ei>stop do
     local ef=fr665e47[ei] local meta=ef and ef.prot
     if meta then
      for k=fp3d3a74,ei+1,-1 do local z=fr665e47[k] if z then for j=z.base,z.top do rgb51bd0[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rgb51bd0[j]=nil end end end fr665e47[k]=nil end
      fp3d3a74=ei lf38e39b(fr665e47[fp3d3a74])
      local bad=fr665e47[fp3d3a74] local caller=meta.caller fr665e47[fp3d3a74]=nil fp3d3a74=fp3d3a74-1
      for j=bad.base,bad.top do rgb51bd0[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rgb51bd0[j]=nil end end
      if meta.kind=="xpcall" then lf38e39b(caller) local hf=vfmb4fcb8[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf7c0bcc(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["mad1a0d89c2"]=true q[1]=false q[2]=hr te2619f=meta.dest s108e60[te2619f]=q end else lf38e39b(caller) local q={n=2} q["mad1a0d89c2"]=true q[1]=false q[2]=_err te2619f=meta.dest s108e60[te2619f]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dne23b19 then sffce0c2(cudb3717) end
  end
 end
 ivkfd2d98=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if fr665e47==st.fr and fp3d3a74>0 then __vms_save_state(st) end __vms_load_state(st)
   if fp3d3a74==0 then
    pf7c0bcc(d.chunk,d.links,{...},nil,0,nil)
    schf283dd(0)
    local rr=rs1fa40d or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return u2e2a10(rr)
   end
   local stop=fp3d3a74 local caller=fr665e47[fp3d3a74] sffce0c2(caller)
   pf7c0bcc(d.chunk,d.links,{...},te2619f+1,0,caller)
   schf283dd(stop)
   local cf=fr665e47[fp3d3a74] lf38e39b(cf) local rr=cf.lastResult or {} cf.lastResult=nil return u2e2a10(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fp3d3a74 local caller=fr665e47[fp3d3a74]
  sffce0c2(caller)
  pf7c0bcc(d.chunk,d.links,{...},0,0,caller)
  schf283dd(stop)
  local cf=fr665e47[fp3d3a74] lf38e39b(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return u2e2a10(rr)
 end
 schf283dd(0)
 return u2e2a10(rs1fa40d)
end
do
 local ok,err=pcall(R40a7c3,1,{})
 if not ok then error(err,0) end
end