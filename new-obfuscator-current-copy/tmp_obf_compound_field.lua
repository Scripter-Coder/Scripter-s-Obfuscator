-- d2d056db863d709f | DO NOT EDIT
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
local v7a1cbe={105,102,142,141,230,227,199,75,22,57,51,157,174,165,17,143,0,125,189,173,205,5,128,246,26,185,40,179,177,203,53,112,120,229,42,251,168,129,117,97,168,143,35,49,209,226,70,229,227,234,205,38,176,176,163,142,84,250,44,131,26,107,145,166,227,148,8,176,124,249,15,226,117,108,103,134,172,250,127,244,234,74,200,251,73,110,186,227,52,47,127,185,26,183,219,227,231,132,161,93,16,99,142,93,43,81,27,118,162,220,60,213,190,159,231,104,166,253,21,195,71,240,240,23,108,248,127,61,70,78,237,176,226,232,62,141,232,82,139,252,5,170,98,42,133,111,101}
local c50f294={}
local r36d87a={{0,1},{1,1},{2,1},{3,1},{4,1},{5,5},{10,1},{11,51},{62,47},{109,38}}
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
 local src={75,89,18,83,123,48,139,95,117,153,155,136,234,153,66,233,32,48,123,112,18,89,75,134,91,25,173,238,214,107,166,149,127,84,54,202,33,207,88,134,97,225,17,62,54,138,92,213,247,197,62,37,140,151,178,123,228,251,189,246,104,246,95,111,40,136,147,49,14,172,94,178,185,103,187,146,10,180,175,48,209,152,58,135,117,19,87,170,113,32,11,133,186,191,81,19,175,245,46,11,146,194,157,255,26,38,163,202,158,28,64,119,47,164,111,231,252,195,53,101,126,121,141,11,249,193,124,220,233,160,253,108,2,22,26,176,175,30,196,26,22,184,10,253,160,233,194,124,193,177,15,173,121,16,153,214,195,252,184,75,164,132,61,230,28,158,17,216,38,79,162,171,194,146,42,116,245,108,68,113,191,216,91,178,32,219,154,201,19,117,94,111,152,161,137,49,180,100,223,203,103,185,30,44,172,165,10,179,136,40,6,241,246,61,52,124,251,228,209,36,151,39,59,132,197,247,231,26,138,99,54,242,225,97,91,198,207,241,164,47,84,29,172,226,107,214,17,179,25,43,15,225,89,18,165,152,48,139,101,141,153,155,86,90,153,66,69,104,48,123,107,11,89,75,225,43,59,173,193,214,107,234,140,29,84,214,13,241,207,167,59,97,225,217,152,99,138,4,240,247,197,30,210,39,151,102,155,228,251,213,132,61,246,237,72,40,136,98,202,165,172,130,227,185,103,155,235,100,180,117,46,161,152,29,216,117,19,75,58,219,32,115,55,216,191,77,245,108,245,238,124,146,194,125,144,79,38,127,85,158,28,116,202,132,164,168,89,252,195,180,123,16,121,249,156,177,193,111,23,233,160,121,106,184,22,75,202,30,30,135,58,22,184,73,221,160,233,1,41,193,177,179,49,121,16,145,171,195,252,0,220,164,132,21,89,28,158,147,135,38,79,218,176,194,146,225,132,245,108,202,113,191,216,81,43,32,219,160,234,19,117,246,62,152,161,172,130,180,100,166,199,103,185,113,66,172,165,105,28,136,40,78,27,246,61,57,119,251,228,136,132,151,39,111,152,197,247,160,140,138,99,54,242,225,97,158,58,207,241,219,70,84,29,146,103,107,214,43,177,25,43,196,17,89,18,23,193,48,139,177,19,153,155,148,5,153,66,233,32,48,123,185,104,89,75,23,153,25,173,246,207,107,166,242,221,84,54,67,239,207,88,226,17,225,17,186,71,138,92,8,162,197,62,37,140,151,178,180,250,251,189,83,189,246,95,154,231,136,147,44,213,172,94,9,255,103,187,8,66,180,175,61,70,152,58,66,4,19,87,71,219,29,11,156,145,191,81,137,88,48,46,13,111,220,157,35,111,98,163,203,172,186,64,15,151,110,111,224,114,255,53,77,162,95,141,76,124,225,124,221,20,190,253,10,57,32,26,196,195,199,196,26,54,252,10,253,128,173,221,124,115,151,76,141,103,209,77,53,171,82,224,111,108,254,15,64,232,81,203,163,148,105,35,157,216,139,13,46,198,42,137,81,198,88,156,11,103,147,70,87,157,73,130,58,85,129,85,175,124,30,186,187,64,227,182,94,118,222,73,147,68,54,110,95,142,150,42,189,23,78,120,178,183,118,93,62,187,55,212,92,226,132,226,17,132,17,135,88,112,183,190,54,148,108,140,166,137,224,236,173,49,69,227,75,39,210,113,123,69,92,145,66,81,225,72,155,186,162,145,139,68,202,113,18,30,3,227,43,124,221,236,214,159,20,140,29,19,126,190,241,236,184,135,97,211,19,226,99,86,9,212,247,112,17,93,39,183,227,120,228,201,27,42,61,196,249,110,40,117,141,73,165,107,66,182,185,206,45,186,100,192,171,85,161,108,245,130,117,241,97,70,219,174,55,156,216,139,148,137,108,214,206,13,146,187,29,35,79,82,115,203,158,250,253,15,132,140,1,224,252,4,140,77,16,177,247,76,177,134,52,221,233,136,147,10,184,191,140,196,30,30,196,26,61,184,10,253,9,127,221,124,53,3,76,141,106,218,77,53,50,127,224,111,27,194,15,64,77,144,203,163,217,243,35,157,15,178,13,46,10,208,137,81,218,168,156,11,114,89,70,87,221,66,130,58,85,129,85,175,174,125,186,187,167,200,182,94,98,146,73,147,171,200,110,95,119,11,42,189,231,152,120,178,34,8,93,62,5,134,212,92,71,67,226,17,123,162,135,88,239,181,190,54,6,159,140,166,72,54,236,173,172,4,227,75,158,171,113,123,41,233,145,66,203,25,72,155,171,228,145,139,196,201,113,18,121,26,227,43,197,51,236,214,234,144,140,29,136,99,190,241,19,198,135,97,255,208,226,99,226,242,212,247,24,231,93,39,37,148,120,228,23,23,42,61,54,46,110,40,138,147,87,165,229,94,182,244,103,187,186,16,176,175,85,111,175,58,130,1,23,87,70,232,102,11,156,56,12,81,137,171,76,46,13,79,27,157,35,163,140,163,203,43,51,64,15,112,22,111,224,59,223,53,77,110,185,141,76,173,189,124,221,177,132,253,10,221,102,26,196,103,158,196,26,37,254,10,253,190,40,221,124,164,193,76,141,204,63,77,53,241,254,224,111,104,154,15,64,232,44,203,163,95,207,35,157,226,29,13,46,213,227,137,81,172,132,156,11,224,170,70,87,195,192,130,58,95,24,85,175,68,82,186,187,216,255,182,94,112,59,73,147,168,108,110,95,108,254,42,189,10,103,120,178,19,71,93,62,41,93,212,92,126,172,226,17,49,212,135,88,186,38,190,54,32,25,140,166,75,89,236,173,94,99,227,75,45,163,113,123,234,240,145,66,171,61,72,155,81,56,145,139,152,9,113,18,169,125,227,43,73,254,236,214,59,245,140,29,252,68,190,241,62,219,135,97,135,171,226,99,104,106,212,247,237,80,93,39,89,133,120,228,25,139,42,61,59,127,110,40,246,83,73,165,98,105,182,185,85,29,186,100,96,76,85,161,103,134,130,117,222,119,70,219,252,149,156,216,152,11,137,108,213,106,13,146,182,77,35,79,143,53,203,158,254,118,15,132,209,184,224,252,15,43,77,16,180,173,76,177,145,47,221,233,125,36,10,184,22,26,196,33,30,196,26,194,91,10,253,200,71,221,124,130,145,76,141,17,247,77,53,66,202,224,111,150,34,15,64,157,168,203,163,238,53,35,157,170,60,13,46,43,12,137,81,159,156,156,11,198,102,70,87,51,36,130,58,25,151,85,175,28,22,186,187,187,236,182,94,5,51,73,147,224,207,110,95,229,247,42,189,207,33,120,178,25,27,93,62,151,117,212,92,153,63,226,17,21,174,135,88,1,198,190,54,23,61,140,166,119,170,236,173,10,119,227,75,9,65,113,123,248,241,145,66,237,75,72,155,237,243,145,139,143,61,113,18,166,247,227,43,97,6,236,214,119,218,140,29,156,76,190,241,7,34,135,97,149,21,226,99,123,223,212,247,157,26,93,39,40,244,120,228,60,161,42,61,214,14,110,40,32,225,73,165,178,159,182,185,160,167,186,100,82,18,85,161,187,218,130,117,241,97,70,219,106,17,156,216,37,146,137,108,53,95,13,146,22,126,35,79,225,26,203,158,40,133,15,132,100,30,224,252,25,78,77,16,13,93,76,177,48,255,221,233,128,114,10,184,5,208,196,30,106,192,26,22}
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
 local ok,err=pcall(Rd87a1c,1,{})
 if not ok then error(err,0) end
end