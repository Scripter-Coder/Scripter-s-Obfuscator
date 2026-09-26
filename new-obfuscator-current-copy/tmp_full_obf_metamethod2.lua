-- a5f8788efa2110a4 | DO NOT EDIT
local _d87a1cb=function(aa1cbe5,b0f2943,...)
 while true do
  local _se50f={} local _t2943=0
  local _y6d87={{}}
  local _ia1cb=1
  local _we50f=aa1cbe5[b0f2943]
  local o6d87a1=_we50f.c[_ia1cb]
  if o6d87a1==1 then _se50f[_t2943]="x" end
 end
end
local _b2943={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _r6d87={{1,41}}
local dcbe50f=function(i) local a=_b2943[1] local rr=_r6d87[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b29432={214,17,239,131,189,168} do local rp=1 while rp<=#_b29432 do local np=_b29432[rp]+_b29432[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b29432[rp]+_b29432[rp+1]*256 rp=rp+2 end local va=(_b29432[rp]==1) rp=rp+1 local nc=_b29432[rp]+_b29432[rp+1]*256+_b29432[rp+2]*65536+_b29432[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b29432[rp]+_b29432[rp+1]*256+_b29432[rp+2]*65536+_b29432[rp+3]*16777216 rp=rp+4 end end end
end
local g7a1cbe=_G
if getfenv then local _le=getfenv(0) if _le then g7a1cbe=_le end end
local hg29436d={}
if getgenv then g7a1cbe=getgenv() end
if not g7a1cbe then g7a1cbe=_G end
local v7a1cbe={78,77,220,128,137,10,58,9,12,15,20,65,11,33,91,31,18,3,72,33,146,122,16,52,71,218,106,50,155,229,187,196,36,175,26,217,204,83,171,151,68,41,109,31,251,62,134,51,185,110,91,186,84,60,165,26,216,94,152,113,66,5,239,158,101,160,236,4,40,227,45,18,55,8,5,206,56,50,189,96,122,150,108,133,255,122,178,21,80,229,221,139,170,141,65,213,225,184,187,135,244,17,238,103,229,127,33,42,34,240,16,255,2,89,33,204,130,3,151,249,37,164,12,29,200,84,105,163,102,18,179,4,202,204,238,195,204,14,253,168,151,174,226,54,39,145,219,59,25,6,11,71,42,219,139,154,176,48,231,226,245,143,209,95}
local c50f294={}
local r36d87a={{0,7},{7,1},{8,12},{20,5},{25,3},{28,51},{79,47},{126,38}}
local mf29436={}
local iv87a1cb=168
local d1cbe50=function(i)
 local c=c50f294[i] if c then return c end
 local rr=r36d87a[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=iv87a1cb
 for j=1,ln do
  local p=st+j
  local a=v7a1cbe[p] local b=(179*p+157+12345*1.0*((p*p)%19))%251+38
  local kb=(b + prev*57)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 c50f294[i]=t return t
end
local ue50f29
if table.unpack then ue50f29=table.unpack else ue50f29=unpack end
if not ue50f29 then ue50f29=unpack end
local P9436d8=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m436d87a1cb"]=true
 return t
end
local qe50f29=function(t) return type(t)=="table" and t["m436d87a1cb"]==true end
local ba1cbe5={}
do
 local src={73,89,19,113,121,48,139,152,66,153,155,148,206,153,66,147,139,48,123,9,185,89,75,225,43,25,173,207,54,107,166,248,172,84,54,191,241,207,88,243,208,225,17,226,99,138,92,212,247,197,32,93,39,151,124,79,228,251,125,91,61,246,39,197,40,136,146,73,165,172,108,180,185,103,186,186,100,180,182,55,161,152,78,82,117,19,84,70,219,32,145,95,216,191,82,137,108,245,224,58,146,194,65,118,79,38,160,203,158,28,7,71,132,164,109,224,252,195,65,157,16,121,137,76,177,193,230,30,233,160,249,10,184,22,198,145,30,30,192,26,22,184,114,86,160,233,216,124,193,177,100,227,121,16,10,125,195,252,225,111,164,132,105,250,28,158,191,18,38,79,35,157,194,146,13,46,245,115,137,81,191,155,188,11,32,15,165,87,19,45,166,58,152,147,243,175,180,190,193,187,103,56,128,94,172,130,19,147,136,229,78,95,246,250,147,189,251,56,230,178,151,251,8,62,197,43,74,92,138,6,146,17,225,201,245,88,207,178,158,54,84,117,34,166,107,200,45,173,25,130,117,75,89,116,203,123,48,184,215,66,153,79,171,155,153,158,15,139,48,97,104,18,89,107,167,43,25,80,242,214,107,74,38,29,84,226,93,241,207,172,72,97,225,15,35,99,138,136,55,247,197,36,68,39,151,176,120,198,251,144,42,61,186,95,110,40,104,32,73,165,83,226,182,185,175,193,186,100,236,139,85,161,184,181,130,117,199,180,70,219,72,165,156,216,13,119,137,108,4,173,13,146,30,200,35,79,6,242,203,158,198,59,15,132,131,53,224,252,223,73,77,16,1,38,76,177,221,0,221,233,96,140,10,184,246,169,196,30,194,90,26,22,140,207,253,160,46,100,124,193,48,122,141,121,100,157,53,195,239,42,111,164,0,111,64,28,207,197,163,38,12,3,157,194,209,45,46,245,176,220,81,191,39,32,11,32,7,216,87,19,149,49,58,152,187,76,175,180,60,158,187,103,64,155,94,172,73,227,147,136,107,78,95,246,240,10,189,251,2,197,178,151,83,89,62,197,14,249,92,138,127,158,17,225,166,155,88,207,209,49,54,84,61,200,166,107,197,38,173,25,219,213,75,89,32,215,123,48,255,65,66,153,79,171,155,153,91,243,139,48,30,1,18,89,85,34,43,25,106,240,214,107,129,214,29,84,80,4,241,207,120,214,97,225,205,124,99,138,36,127,247,197,246,39,39,151,70,202,228,251,167,51,61,246,33,174,40,136,110,87,165,172,59,198,185,103,227,158,100,180,115,0,161,152,66,41,117,19,155,88,219,32,114,28,216,191,165,70,108,245,75,125,146,194,34,101,79,38,17,237,158,28,40,232,132,164,175,145,252,195,52,77,45,121,141,5,177,193,124,233,44,160,253,247,166,22,26,228,90,30,196,40,176,184,10,238,106,233,221,242,253,177,76,63,95,16,77,248,227,252,224,146,186,132,15,193,42,158,203,126,255,79,35,189,134,146,13,14,177,108,137,227,153,216,156,21,225,219,70,63,189,117,130,242,226,161,85,91,123,100,186,9,65,185,182,68,181,165,73,160,206,40,110,38,118,61,42,250,179,228,120,60,171,39,93,243,229,247,212,148,240,99,226,54,187,97,135,130,180,241,190,250,74,29,140,222,192,214,236,65,179,43,227,107,8,18,113,5,240,139,145,42,126,155,72,254,233,66,145,52,118,123,113,210,40,75,227,201,47,173,236,254,5,166,140,99,148,54,190,132,24,88,135,169,155,17,226,64,106,92,212,131,116,62,93,96,223,178,120,129,139,189,42,201,68,95,110,111,192,147,73,134,76,94,182,139,101,187,186,184,225,175,85,20,183,58,130,85,66,87,70,233,134,11,156,234,25,81,137,145,235,46,13,85,222,157,35,230,176,163,203,234,24,64,15,112,107,111,224,30,245,53,77,158,69,141,76,133,4,124,221,202,64,253,10,193,150,26,196,106,206,196,26,240,5,10,253,136,135,221,124,6,8,76,141,177,106,77,53,132,180,224,111,140,234,15,64,181,8,203,163,38,79,35,182,194,146,13,135,99,108,137,165,13,216,156,24,234,219,70,166,144,117,130,133,222,161,85,254,186,100,186,68,219,185,182,147,140,165,73,108,52,40,110,58,134,61,42,239,121,228,120,124,160,39,93,243,229,247,212,70,147,99,226,209,144,97,135,150,248,241,190,21,180,29,140,39,93,214,236,177,101,43,227,254,118,18,113,187,65,139,145,143,185,155,72,1,90,66,145,171,116,123,113,64,219,75,227,8,249,173,236,99,68,166,140,218,237,54,190,232,173,88,135,51,99,17,226,81,44,92,212,3,119,62,93,7,198,178,120,56,101,189,42,188,192,95,110,244,221,147,73,121,50,94,182,167,166,187,186,12,26,175,85,124,65,58,130,199,53,87,70,55,138,11,156,24,206,81,137,110,245,48,13,219,194,157,110,79,38,163,191,154,28,64,193,179,164,111,148,248,195,53,126,86,121,141,172,2,193,124,26,80,160,253,215,97,22,26,40,180,30,196,175,57,184,10,9,18,233,221,187,221,177,76,243,185,16,77,41,191,252,224,55,128,132,15,37,108,158,203,218,166,79,35,174,132,146,13,48,52,108,137,52,207,216,156,190,15,219,70,101,17,117,130,246,134,161,85,91,6,100,186,194,231,185,182,126,35,165,73,179,7,40,110,76,170,61,42,125,138,228,120,98,34,39,93,249,124,247,212,172,188,99,226,174,167,97,135,132,81,241,190,22,16,29,140,60,168,214,236,92,154,43,227,207,57,18,113,151,154,139,145,182,86,155,72,75,44,66,145,254,231,123,113,102,93,75,227,11,150,173,236,145,35,166,140,105,229,54,190,43,180,88,135,83,71,17,226,171,240,92,212,95,183,62,93,215,161,178,120,180,168,189,42,109,165,95,110,128,250,147,73,84,47,94,182,223,221,187,186,134,130,175,85,137,246,58,130,187,36,87,70,57,22,11,156,21,159,81,137,18,53,46,13,92,245,157,35,125,128,163,203,74,255,64,15,123,24,111,224,49,227,53,77,204,231,141,76,150,155,124,221,201,228,253,10,204,198,26,196,183,136,196,26,244,142,10,253,213,62,221,124,13,175,76,141,180,48,77,53,147,175,224,111,121,93,15,64,28,158,203,156,38,79,35,73,33,146,13,70,91,108,137,18,159,216,156,99,199,219,70,214,37,117,130,8,62,161,85,46,130,100,186,115,29,185,182,54,2,165,73,77,232,40,110,127,178,61,42,91,70,228,120,146,198,39,93,191,243,247,212,244,248,99,226,205,180,97,135,241,89,241,190,94,179,29,140,181,161,214,236,153,220,43,227,197,101,18,113,41,178,139,145,81,197,155,72,111,86,66,145,69,7,123,113,81,121,75,227,55,101,173,236,197,55,166,140,77,7,54,190,57,181,88,135,21,49,17,226,23,59,92,212,72,131,62,93,216,43,178,120,156,80,189,42,33,138,95,110,224,242,147,73,109,214,94,182,205,99,187,186,149,55,175,85,249,188,58,130,202,85,87,70,28,60,11,156,248,238,81,137,196,135,46,13,140,3,157,35,136,58,163,203,120,161,64,15,167,68,111,224,30,245,53,77,90,99,141,76,43,2,124,221,41,209,253,10,108,245,26,196,217,167,196,26,34,125,10,253,96,152,221,124,27,202,76,141,13,192,77,53,50,127,224,111,132,11,15,64,15,84,203,163,82,75,35,157}
 for i=1,#src do
  local a=src[(i)] local _junk0f2=0 local b=((i*i*83+i*16+223)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  ba1cbe5[i]=r
 end
end
local Kbe50f2={}
do
 local rp=1
 while rp<=#ba1cbe5 do
  local np=ba1cbe5[rp] + ba1cbe5[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=ba1cbe5[rp] + ba1cbe5[rp+1]*256 rp=rp+2 end
  local va=(ba1cbe5[rp]==1) rp=rp+1
  local nc=ba1cbe5[rp] + ba1cbe5[rp+1]*256 + ba1cbe5[rp+2]*65536 + ba1cbe5[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=ba1cbe5[rp] + ba1cbe5[rp+1]*256 + ba1cbe5[rp+2]*65536 + ba1cbe5[rp+3]*16777216
   rp=rp+4
  end
  Kbe50f2[#Kbe50f2+1]={c=cd,p=ps,v=va}
 end
end
local ow9436d8={}
local rg36d87a={} local fr1cbe50={} local fpf29436=0 local bad87a1c=0 local tobe50f2=0 local nb50f294=0
local cu7a1cbe=nil local dn1cbe50=false local rsf29436={} local vfm1cbe50={} local schd87a1c local ivkf29436
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rg36d87a st.fr=fr1cbe50 st.fp=fpf29436 st.ba=bad87a1c st.to=tobe50f2 st.cu=cu7a1cbe st.co=wd87a1c st.pc=if29436 st.sp=t36d87a st.sc=y1cbe50 st.lk=L7a1cbe st.va=a50f294 st.nb=nb50f294 st.dn=dn1cbe50 st.rs=rsf29436 end
local __vms_load_state=function(st) rg36d87a=st.rg or {} fr1cbe50=st.fr or {} fpf29436=st.fp or 0 bad87a1c=st.ba or 0 tobe50f2=st.to or 0 cu7a1cbe=st.cu wd87a1c=st.co if29436=st.pc or 1 t36d87a=st.sp or 0 y1cbe50=st.sc or {{}} L7a1cbe=st.lk or {} a50f294=st.va nb50f294=st.nb or 0 dn1cbe50=st.dn or false rsf29436=st.rs or {} if fpf29436>0 then local q=fr1cbe50[fpf29436] if not q or q.owner~=ow9436d8 then error("VM_STATE_FRAME_OWNER",0) end if bad87a1c~=q.base or tobe50f2~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local s50f294=setmetatable({}, {__index=function(_,k) return rg36d87a[bad87a1c+k] end, __newindex=function(_,k,v) rg36d87a[bad87a1c+k]=v end})
local vf36d87a=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivkf29436(d,...) end vfm1cbe50[f]=d return f end
local pfbe50f2 local xf9436d8 local sf7a1cbe local lf50f294 local rt36d87a
local Rd87a1c
Rd87a1c=function(xd87a1c,L7a1cbe,...)
 fr1cbe50={} fpf29436=0 nb50f294=0 dn1cbe50=false rsf29436={}
 __vms_root_state={}
 pfbe50f2=function(ci,links,args,retDest,nRet,caller,meta)
  local code=Kbe50f2[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nb50f294,top=nb50f294+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nb50f294+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=ow9436d8}
  nb50f294=nb50f294+512
  fpf29436=fpf29436+1 fr1cbe50[fpf29436]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["m436d87a1cb"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sf7a1cbe=function(f) if not f then return end f.pc=if29436 f.base=bad87a1c f.top=tobe50f2 f.sp=t36d87a f.sc=y1cbe50 f.lk=L7a1cbe f.va=a50f294 f.sanext=cu7a1cbe.sanext f.sasizes=cu7a1cbe.sasizes end
 lf50f294=function(f) cu7a1cbe=f wd87a1c=Kbe50f2[f.chunk] if29436=f.pc bad87a1c=f.base tobe50f2=f.top t36d87a=f.sp y1cbe50=f.sc L7a1cbe=f.lk a50f294=f.va end
 rt36d87a=function(n,packed)
  local f=fr1cbe50[fpf29436] local vals={}
  if packed then local p=s50f294[t36d87a] local pn=(p and p.n) or 0 for i=1,n do vals[i]=s50f294[t36d87a-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=s50f294[t36d87a-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sf7a1cbe(f)
   for i=f.base,f.top do rg36d87a[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg36d87a[i]=nil end end
   fr1cbe50[fpf29436]=nil fpf29436=fpf29436-1
   lf50f294(caller)
   local q={n=0} q["m436d87a1cb"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   t36d87a=meta.dest s50f294[t36d87a]=q
   return
  end
  sf7a1cbe(f)
  rg36d87a[f.base]=rg36d87a[f.base]
  for i=f.base,f.top do rg36d87a[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg36d87a[i]=nil end end
  fr1cbe50[fpf29436]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rsf29436=vals dn1cbe50=true return end
  fpf29436=fpf29436-1 local cf=fr1cbe50[fpf29436]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf50f294(cf)
  local d=f.retDest or (t36d87a+1)
  if f.nRet==0 then return end
  t36d87a=d-1
  if f.nRet==1 then t36d87a=d s50f294[t36d87a]=vals[1] else local q={n=#vals} q["m436d87a1cb"]=true for i=1,#vals do q[i]=vals[i] end t36d87a=d s50f294[t36d87a]=q end
 end
 pfbe50f2(xd87a1c,L7a1cbe,{...},nil,0,nil)
  local f=fr1cbe50[fpf29436]
  if not f then error("VM_FRAME_MISSING",0) end
  lf50f294(f)
 local h9436d8={}
 h9436d8[28200]=function()
   local k=s50f294[t36d87a] t36d87a=t36d87a-1 local t=s50f294[t36d87a] s50f294[t36d87a]=t[k]
 end
 h9436d8[49278]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a >= b
 end
 h9436d8[53364]=function()
   local id=wd87a1c.c[if29436] local v=s50f294[t36d87a] s50f294[t36d87a]=nil t36d87a=t36d87a-1 if29436=if29436+1
   y1cbe50[#y1cbe50][id]={v}
 end
 h9436d8[31706]=function()
   local n=wd87a1c.c[if29436] if29436=if29436+1
   local a={} for j=1,n do a[j]=s50f294[t36d87a-n+j] end t36d87a=t36d87a-n-1
   local la=n if la>0 and qe50f29(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm1cbe50[f]
   if vd then
    local caller=cu7a1cbe local dest=t36d87a+1 sf7a1cbe(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pfbe50f2(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf50f294(fr1cbe50[fpf29436])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],ue50f29(a,3,la)) else ok,rr=pcall(f,ue50f29(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["m436d87a1cb"]=true q[1]=ok q[2]=rr t36d87a=t36d87a+1 s50f294[t36d87a]=q
   end
 end
 h9436d8[6426]=function()
   local ix=wd87a1c.c[if29436] if29436=if29436+1
   local n=mf29436[ix] if not n then n=tonumber(d1cbe50(ix)) mf29436[ix]=n end
   s50f294[t36d87a]=s50f294[t36d87a]+n
 end
 h9436d8[36640]=function()
   s50f294[t36d87a]=s50f294[t36d87a][3]
 end
 h9436d8[562]=function()
   local ci=wd87a1c.c[if29436] if29436=if29436+1
   local links={}
   for i=1,#L7a1cbe do links[#links+1]=L7a1cbe[i] end
   for i=1,#y1cbe50 do links[#links+1]=y1cbe50[i] end
   t36d87a=t36d87a+1
   s50f294[t36d87a]=vf36d87a(ci,links)
 end
 h9436d8[29120]=function()
   t36d87a=t36d87a+1 s50f294[t36d87a]=s50f294[t36d87a-1]
 end
 h9436d8[14286]=function()
   t36d87a=t36d87a+1 s50f294[t36d87a]={}
 end
 h9436d8[12213]=function()
   s50f294[t36d87a]=not s50f294[t36d87a]
 end
 h9436d8[28773]=function()
   local ix=wd87a1c.c[if29436] if29436=if29436+1
   local n=mf29436[ix]
   if not n then n=tonumber(d1cbe50(ix)) mf29436[ix]=n end
   t36d87a=t36d87a+1 s50f294[t36d87a]=n
 end
 h9436d8[58324]=function()
   s50f294[t36d87a],s50f294[t36d87a-1]=s50f294[t36d87a-1],s50f294[t36d87a]
 end
 h9436d8[53236]=function()
   local id=wd87a1c.c[if29436] local b=nil if29436=if29436+1
   for i=#L7a1cbe,1,-1 do b=L7a1cbe[i][id] if b then break end end
   t36d87a=t36d87a+1 s50f294[t36d87a]=b and b[1]
 end
 h9436d8[20768]=function()
   local n=wd87a1c.c[if29436] if29436=if29436+1
   local f=cu7a1cbe local b=f.sanext or (bad87a1c+256) local lim=bad87a1c+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n tobe50f2=math.max(tobe50f2,bad87a1c+255)
   t36d87a=t36d87a+1 s50f294[t36d87a]=b
 end
 h9436d8[32889]=function()
   local b=s50f294[t36d87a] local n=cu7a1cbe.sasizes and cu7a1cbe.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end s50f294[t36d87a]=n
 end
 h9436d8[23079]=function()
   local n=wd87a1c.c[if29436] if29436=if29436+1
   local f=s50f294[t36d87a-n] local a={} for j=1,n do a[j]=s50f294[t36d87a-n+j] end t36d87a=t36d87a-n-1
   local la=n if la>0 and qe50f29(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfm1cbe50[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cu7a1cbe local base0=bad87a1c local top0=tobe50f2 local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rg36d87a[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rg36d87a[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=ow9436d8}
    local cc=Kbe50f2[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["m436d87a1cb"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    fr1cbe50[fpf29436]=nf lf50f294(nf)
   else
    local r=P9436d8(f(ue50f29(a,1,la))) t36d87a=t36d87a+1 s50f294[t36d87a]=r rt36d87a(0,true)
   end
 end
 h9436d8[45812]=function()
   t36d87a=t36d87a+1 s50f294[t36d87a]=false
 end
 h9436d8[48614]=function()
   local id=wd87a1c.c[if29436] local v=s50f294[t36d87a] t36d87a=t36d87a-1 if29436=if29436+1
   local b=nil for i=#y1cbe50,1,-1 do b=y1cbe50[i][id] if b then break end end
   if b then b[1]=v end
 end
 h9436d8[33362]=function()
   y1cbe50[#y1cbe50+1]={}
 end
 h9436d8[50484]=function()
   local ix=wd87a1c.c[if29436] if29436=if29436+1
   local k=d1cbe50(ix) local v=hg29436d[k] if v==nil then v=g7a1cbe[k] hg29436d[k]=v end
   t36d87a=t36d87a+1 s50f294[t36d87a]=v
 end
 h9436d8[21980]=function()
   local id=wd87a1c.c[if29436] local b=nil if29436=if29436+1
   for i=#y1cbe50,1,-1 do b=y1cbe50[i][id] if b then break end end
   t36d87a=t36d87a+1 s50f294[t36d87a]=b and b[1]
 end
 h9436d8[13953]=function()
   local k=wd87a1c.c[if29436] if29436=if29436+1
   rt36d87a(k,true)
 end
 h9436d8[7367]=function()
   local n=wd87a1c.c[if29436] if29436=if29436+1
   local pt=s50f294[t36d87a] s50f294[t36d87a]=nil t36d87a=t36d87a-1
   for j=1,n do t36d87a=t36d87a+1 s50f294[t36d87a]=pt[j] end
 end
 h9436d8[17440]=function()
   s50f294[t36d87a]=s50f294[t36d87a][2]
 end
 h9436d8[43896]=function()
   t36d87a=t36d87a+1 s50f294[t36d87a]=d1cbe50(wd87a1c.c[if29436]) if29436=if29436+1
 end
 h9436d8[6730]=function()
   if not s50f294[t36d87a] then if29436=wd87a1c.c[if29436] else if29436=if29436+1 s50f294[t36d87a]=nil t36d87a=t36d87a-1 end
 end
 h9436d8[31772]=function()
   g7a1cbe[d1cbe50(wd87a1c.c[if29436])]=s50f294[t36d87a] t36d87a=t36d87a-1 if29436=if29436+1
 end
 h9436d8[18111]=function()
   local ix=wd87a1c.c[if29436] if29436=if29436+1
   local n=mf29436[ix] if not n then n=tonumber(d1cbe50(ix)) mf29436[ix]=n end
   s50f294[t36d87a]=s50f294[t36d87a]*n
 end
 h9436d8[21328]=function()
   t36d87a=t36d87a+1 s50f294[t36d87a]=true
 end
 h9436d8[7933]=function()
   local id=wd87a1c.c[if29436] local v=s50f294[t36d87a] t36d87a=t36d87a-1 if29436=if29436+1
   local b=nil for i=#L7a1cbe,1,-1 do b=L7a1cbe[i][id] if b then break end end
   if b then b[1]=v end
 end
 h9436d8[50074]=function()
   t36d87a=t36d87a+1 s50f294[t36d87a]=g7a1cbe[d1cbe50(wd87a1c.c[if29436])] if29436=if29436+1
 end
 h9436d8[31432]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a == b
 end
 h9436d8[18503]=function()
   local n=wd87a1c.c[if29436] if29436=if29436+1
   local f=s50f294[t36d87a-n]
   local a={}
   for j=1,n do a[j]=s50f294[t36d87a-n+j] end
   t36d87a=t36d87a-n-1
   local la=n
   if la>0 and qe50f29(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm1cbe50[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu7a1cbe local dest=t36d87a+1
    sf7a1cbe(caller)
    local vc=vd or f pfbe50f2(vc.chunk,vc.links,a,dest,1,caller)
    lf50f294(fr1cbe50[fpf29436])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf7a1cbe(cu7a1cbe) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P9436d8(f(ue50f29(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf50f294(cu7a1cbe) end
    t36d87a=t36d87a+1
    s50f294[t36d87a]=r[1]
   end
 end
 h9436d8[15502]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a * b
 end
 h9436d8[45428]=function()
   local n=wd87a1c.c[if29436] if29436=if29436+1
   rt36d87a(n,false)
 end
 h9436d8[29352]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a % b
 end
 h9436d8[8259]=function()
   s50f294[t36d87a]=s50f294[t36d87a][1]
 end
 h9436d8[38569]=function()
   local n=wd87a1c.c[if29436] if29436=if29436+1
   local f=s50f294[t36d87a-n]
   local a={}
   for j=1,n do a[j]=s50f294[t36d87a-n+j] end
   t36d87a=t36d87a-n-1
   local la=n
   if la>0 and qe50f29(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm1cbe50[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu7a1cbe local dest=t36d87a+1
    sf7a1cbe(caller)
    local vc=vd or f pfbe50f2(vc.chunk,vc.links,a,dest,-1,caller)
    lf50f294(fr1cbe50[fpf29436])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf7a1cbe(cu7a1cbe) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P9436d8(f(ue50f29(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf50f294(cu7a1cbe) end
    t36d87a=t36d87a+1
    s50f294[t36d87a]=r
   end
 end
 h9436d8[7884]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a / b
 end
 h9436d8[57379]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a .. b
 end
 h9436d8[25113]=function()
   local v=s50f294[t36d87a] local k=s50f294[t36d87a-1] local t=s50f294[t36d87a-2] t[k]=v t36d87a=t36d87a-3
 end
 h9436d8[46544]=function()
   s50f294[t36d87a]=-s50f294[t36d87a]
 end
 h9436d8[46048]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a * b
 end
 h9436d8[49438]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a ~= b
 end
 h9436d8[1140]=function()
   s50f294[t36d87a]=#s50f294[t36d87a]
 end
 h9436d8[47559]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 h9436d8[43756]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a + b
 end
 h9436d8[9304]=function()
 end
 h9436d8[48383]=function()
   y1cbe50[#y1cbe50]=nil
 end
 h9436d8[14050]=function()
   local k=s50f294[t36d87a] t36d87a=t36d87a-1 local t=s50f294[t36d87a] s50f294[t36d87a]=t[k]
 end
 h9436d8[9906]=function()
   local _mode=wd87a1c.c[if29436] if29436=if29436+1
   local idx=s50f294[t36d87a] local b=s50f294[t36d87a-1] t36d87a=t36d87a-2
   local f=cu7a1cbe local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then t36d87a=t36d87a+1 s50f294[t36d87a]=nil else t36d87a=t36d87a+1 s50f294[t36d87a]=rg36d87a[b+idx-1] end
 end
 h9436d8[51731]=function()
   if s50f294[t36d87a] then if29436=wd87a1c.c[if29436] else if29436=if29436+1 s50f294[t36d87a]=nil t36d87a=t36d87a-1 end
 end
 h9436d8[24798]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a < b
 end
 h9436d8[23571]=function()
   local p=s50f294[t36d87a] t36d87a=t36d87a-1 local t=s50f294[t36d87a] s50f294[t36d87a]=nil t36d87a=t36d87a-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 h9436d8[8397]=function()
   if not a50f294 then local t={n=0} t["m436d87a1cb"]=true a50f294=t end
   t36d87a=t36d87a+1 s50f294[t36d87a]=a50f294
 end
 h9436d8[14064]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a + b
 end
 h9436d8[33777]=function()
   local n=wd87a1c.c[if29436] if29436=if29436+1
   local a={} for j=1,n do a[j]=s50f294[t36d87a-n+j] end t36d87a=t36d87a-n-1
   local la=n if la>0 and qe50f29(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm1cbe50[f]
   if vd then
    local caller=cu7a1cbe local dest=t36d87a+1 sf7a1cbe(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pfbe50f2(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf50f294(fr1cbe50[fpf29436])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],ue50f29(a,3,la)) else ok,rr=pcall(f,ue50f29(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["m436d87a1cb"]=true q[1]=ok q[2]=rr t36d87a=t36d87a+1 s50f294[t36d87a]=q
   end
 end
 h9436d8[55773]=function()
   local _n=(s50f294[t36d87a]==nil) s50f294[t36d87a]=nil t36d87a=t36d87a-1 if _n then if29436=wd87a1c.c[if29436] else if29436=if29436+1 end
 end
 h9436d8[24708]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a <= b
 end
 h9436d8[3665]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a - b
 end
 h9436d8[42546]=function()
   if29436=wd87a1c.c[if29436]
 end
 h9436d8[11769]=function()
   local _mode=wd87a1c.c[if29436] if29436=if29436+1
   local v=s50f294[t36d87a] local idx=s50f294[t36d87a-1] local b=s50f294[t36d87a-2] t36d87a=t36d87a-3
   local f=cu7a1cbe local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rg36d87a[b+idx-1]=v
 end
 h9436d8[47718]=function()
   s50f294[t36d87a]=nil t36d87a=t36d87a-1
 end
 h9436d8[59240]=function()
   local _v=s50f294[t36d87a] s50f294[t36d87a]=nil t36d87a=t36d87a-1 if _v then if29436=wd87a1c.c[if29436] else if29436=if29436+1 end
 end
 h9436d8[22830]=function()
   local _v=s50f294[t36d87a] s50f294[t36d87a]=nil t36d87a=t36d87a-1 if not _v then if29436=wd87a1c.c[if29436] else if29436=if29436+1 end
 end
 h9436d8[44648]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a ^ b
 end
 h9436d8[40668]=function()
   t36d87a=t36d87a+1 s50f294[t36d87a]=nil
 end
 h9436d8[55157]=function()
   local ix=wd87a1c.c[if29436] if29436=if29436+1
   s50f294[t36d87a]=s50f294[t36d87a][ix]
 end
 h9436d8[17971]=function()
   local b=s50f294[t36d87a] local a=s50f294[t36d87a-1] t36d87a=t36d87a-1
   s50f294[t36d87a]=a > b
 end
 h9436d8[62463]=function()
  t36d87a=t36d87a+1 s50f294[t36d87a]=d1cbe50(wd87a1c.c[if29436]) if29436=if29436+1
 end
 h9436d8[64297]=function()
  if29436=wd87a1c.c[if29436]
 end
 h9436d8[63467]=function()
  t36d87a=t36d87a+1 s50f294[t36d87a]=d1cbe50(wd87a1c.c[if29436]) if29436=if29436+1
 end
 h9436d8[61341]=function()
  if29436=wd87a1c.c[if29436]
 end
 h9436d8[63607]=function()
  t36d87a=t36d87a+1 s50f294[t36d87a]=d1cbe50(wd87a1c.c[if29436]) if29436=if29436+1
 end
 h9436d8[63081]=function()
  if29436=wd87a1c.c[if29436]
 end
 h9436d8[61035]=function()
  t36d87a=t36d87a+1 s50f294[t36d87a]=d1cbe50(wd87a1c.c[if29436]) if29436=if29436+1
 end
 h9436d8[60109]=function()
  if29436=wd87a1c.c[if29436]
 end
 schd87a1c=function(stop)
  while fpf29436>stop and not dn1cbe50 do
   local f=fr1cbe50[fpf29436] if not f then error("VM_FRAME_MISSING",0) end
   lf50f294(f)
   if fpf29436<1 or fpf29436>#fr1cbe50 or fr1cbe50[fpf29436]~=cu7a1cbe then error("VM_STATE_FP",0) end
   if cu7a1cbe.owner~=ow9436d8 then error("VM_STATE_FRAME_OWNER",0) end
   if wd87a1c~=Kbe50f2[cu7a1cbe.chunk] then error("VM_STATE_CODE",0) end
   if if29436%1~=0 or if29436<1 or if29436>#wd87a1c.c then error("VM_STATE_PC",0) end
   if bad87a1c%1~=0 or tobe50f2%1~=0 or bad87a1c<0 or tobe50f2<bad87a1c or tobe50f2>bad87a1c+255 then error("VM_STATE_BOUNDS",0) end
   if t36d87a%1~=0 or t36d87a<0 or t36d87a>tobe50f2-bad87a1c then error("VM_STATE_SP",0) end
   local o9436d8=wd87a1c.c[if29436] if29436=if29436+1
   local _fn=h9436d8[o9436d8]
   local _yieldop=(o9436d8==18503 or o9436d8==38569)
   local _ok,_err=true,nil
   if _yieldop and not (cu7a1cbe and cu7a1cbe.prot) then if _fn then _fn() else error("bad opcode "..tostring(o9436d8),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(o9436d8),0) end end) end
   if not _ok then
    local handled=false local ei=fpf29436
    while ei>stop do
     local ef=fr1cbe50[ei] local meta=ef and ef.prot
     if meta then
      for k=fpf29436,ei+1,-1 do local z=fr1cbe50[k] if z then for j=z.base,z.top do rg36d87a[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rg36d87a[j]=nil end end end fr1cbe50[k]=nil end
      fpf29436=ei lf50f294(fr1cbe50[fpf29436])
      local bad=fr1cbe50[fpf29436] local caller=meta.caller fr1cbe50[fpf29436]=nil fpf29436=fpf29436-1
      for j=bad.base,bad.top do rg36d87a[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rg36d87a[j]=nil end end
      if meta.kind=="xpcall" then lf50f294(caller) local hf=vfm1cbe50[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pfbe50f2(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["m436d87a1cb"]=true q[1]=false q[2]=hr t36d87a=meta.dest s50f294[t36d87a]=q end else lf50f294(caller) local q={n=2} q["m436d87a1cb"]=true q[1]=false q[2]=_err t36d87a=meta.dest s50f294[t36d87a]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dn1cbe50 then sf7a1cbe(cu7a1cbe) end
  end
 end
 ivkf29436=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if fr1cbe50==st.fr and fpf29436>0 then __vms_save_state(st) end __vms_load_state(st)
   if fpf29436==0 then
    pfbe50f2(d.chunk,d.links,{...},nil,0,nil)
    schd87a1c(0)
    local rr=rsf29436 or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return ue50f29(rr)
   end
   local stop=fpf29436 local caller=fr1cbe50[fpf29436] sf7a1cbe(caller)
   pfbe50f2(d.chunk,d.links,{...},t36d87a+1,0,caller)
   schd87a1c(stop)
   local cf=fr1cbe50[fpf29436] lf50f294(cf) local rr=cf.lastResult or {} cf.lastResult=nil return ue50f29(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fpf29436 local caller=fr1cbe50[fpf29436]
  sf7a1cbe(caller)
  pfbe50f2(d.chunk,d.links,{...},0,0,caller)
  schd87a1c(stop)
  local cf=fr1cbe50[fpf29436] lf50f294(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return ue50f29(rr)
 end
 schd87a1c(0)
 return ue50f29(rsf29436)
end
do
 local ok,err=pcall(Rd87a1c,2,{})
 if not ok then error(err,0) end
end