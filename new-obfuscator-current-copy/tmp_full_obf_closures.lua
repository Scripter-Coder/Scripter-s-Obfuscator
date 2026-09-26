-- 8b3c9bd096e75495 | DO NOT EDIT
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
local v7a1cbe={36,35,12,134,190,221,28,153,220,64,184,35,102,199,31,61,20,63,219,227,119,167,252,82,130,187,236,241,219,109,251,124,188,7,10,233,52,227,235,191,204,233,149,119,251,198,174,99,41,70,107,106,44,212,93,250,72,6,232,233,238,93,155,2,149,184,84,20,240,39,181,142,3,48,45,170,144,118,53,48,138,62,116,93,167,218,34,77,96,221,21,91,74,181,209,189,209,136,59,63,76,33,118,95,173,87,201,238,142,24,24,123,38,113,153,148,62,127,131,193,13,84,188,213,32,52,153,211,30,98,67,108,90,244,214,19,36,118,181,104,15,70,178,94}
local c50f294={}
local r36d87a={{0,1},{1,5},{6,2},{8,51},{59,47},{106,38}}
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
 local src={74,89,17,113,123,57,139,145,66,69,206,72,155,154,66,145,139,196,180,113,18,91,75,227,43,245,7,236,214,31,23,140,29,85,54,190,241,187,233,135,97,225,17,226,99,139,92,214,247,197,56,93,39,151,128,122,228,251,188,42,61,246,43,223,40,136,146,73,165,172,42,7,185,103,187,186,100,180,175,85,161,129,58,130,117,33,85,70,219,34,11,156,216,203,129,137,108,244,46,13,146,30,200,35,79,39,163,203,158,121,48,15,132,165,111,224,252,132,125,77,16,120,141,76,177,181,172,221,233,164,253,10,184,140,217,196,30,28,196,26,22,100,95,253,160,237,221,124,193,212,60,141,121,19,77,53,195,85,118,111,164,133,15,64,28,217,131,163,38,78,35,157,194,244,183,46,245,24,56,81,191,216,156,11,32,219,70,87,12,117,130,58,219,129,85,175,96,135,186,187,63,157,182,94,158,3,73,147,82,83,110,95,119,11,42,189,220,190,120,178,90,7,93,62,2,78,212,92,86,253,226,17,61,52,135,88,19,111,190,54,49,109,140,166,195,164,236,173,90,11,227,75,49,188,113,123,46,74,145,66,48,13,72,155,255,248,145,139,3,61,113,18,141,168,227,43,197,51,236,214,113,191,140,29,116,114,190,241,50,70,135,97,13,187,226,99,94,191,212,247,49,241,93,39,137,115,120,228,47,94,42,61,236,70,110,40,138,147,107,165,129,94,182,245,103,187,186,132,7,175,85,94,36,58,130,189,105,87,70,131,4,11,156,248,48,81,137,184,22,46,13,250,108,157,35,253,0,163,203,111,159,64,15,88,241,111,224,220,146,53,77,202,2,141,76,150,155,124,221,245,220,253,10,192,189,26,196,2,98,196,26,214,201,10,253,64,90,221,124,29,47,76,141,77,213,77,53,4,69,224,111,37,178,15,64,104,78,203,163,53,133,35,157,70,242,13,46,164,98,137,81,252,248,156,11,99,251,70,87,207,32,130,58,103,29,85,175,104,250,186,187,135,10,182,94,182,188,73,147,208,12,110,95,15,16,42,189,23,78,120,178,212,7,93,62,8,215,212,92,108,222,226,17,149,101,135,88,54,220,190,54,72,97,140,166,172,202,236,173,57,164,227,75,121,86,113,123,35,65,145,66,105,173,72,155,171,228,145,139,68,171,113,18,141,168,227,43,0,207,236,214,14,214,140,29,74,247,190,241,8,68,135,97,198,75,226,99,236,230,212,247,229,111,93,39,75,44,120,228,131,22,42,61,62,37,110,40,124,33,73,165,182,71,182,185,25,123,186,100,73,177,85,161,253,74,130,117,75,115,70,219,252,94,156,216,199,250,137,108,57,48,13,146,187,29,35,79,210,108,203,158,121,48,15,132,27,41,224,252,113,19,77,16,17,106,76,177,1,13,221,233,161,253,55,184,22,83,196,30,30,240,223,22,184,247,227,160,233,253,56,193,177,126,43,121,16,94,255,195,252,110,83,164,132,189,102,28,158,6,131,38,79,222,131,194,146,140,24,245,108,84,136,191,216,188,79,32,219,102,19,19,117,48,28,152,161,75,110,180,100,210,21,103,185,126,36,172,165,189,92,136,40,220,121,246,61,48,164,251,228,75,244,151,39,36,190,197,247,147,20,138,99,108,45,225,97,74,120,207,241,118,76,84,29,171,252,107,214,54,214,25,43,47,85,89,18,9,208,48,139,125,232,153,155,104,202,153,66,239,75,48,123,25,245,89,75,134,91,25,173,83,144,107,166,76,108,84,54,92,199,207,88,175,15,225,17,156,163,138,92,161,32,197,62,149,93,151,178,91,4,251,189,94,140,246,95,41,96,136,147,44,213,172,94,66,11,103,187,253,44,180,175,118,65,152,58,176,119,19,87,154,142,32,11,41,247,191,81,169,61,245,46,63,52,194,157,17,233,38,163,54,128,28,64,200,152,164,111,73,106,195,53,57,20,121,141,184,126,193,124,63,223,160,253,132,132,22,26,240,219,30,196,57,246,184,10,132,32,233,221,8,17,177,76,107,196,16,77,29,173,252,224,168,29,132,15,136,102,158,203,228,110,79,35,181,172,146,13,135,99,108,137,81,191,216,183,11,32,219,239,193,19,117,118,136,152,161,70,101,180,100,75,56,103,185,9,24,172,165,24,157,136,40,145,227,246,61,231,157,251,228,135,14,151,39,56,78,197,247,134,222,138,99,44,38,225,97,74,120,207,241,164,47,84,29,76,215,107,214,34,154,25,43,192,171,89,18,240,77,48,139,141,62,153,155,253,180,153,66,81,250,48,123,188,50,89,75,121,232,25,173,204,146,107,166,222,159,84,54,157,17,207,88,50,78,225,17,37,218,138,92,205,149,197,62,15,165,151,178,74,66,251,189,222,143,246,95,78,121,136,147,149,59,172,94,55,143,103,187,102,49,180,175,137,63,152,58,156,180,19,87,46,117,32,11,65,1,191,81,59,74,245,46,225,56,194,157,227,62,38,163,201,158,2,64,70,132,164,34,224,252,195,65,73,16,121,67,123,177,193,8,217,233,160,206,76,184,22,250,119,30,30,3,163,22,184,215,36,160,233,49,214,193,177,249,162,121,16,185,135,195,252,39,115,164,132,113,128,28,158,215,223,38,79,123,185,194,146,104,94,245,108,240,209,191,216,175,77,32,219,88,150,19,117,231,74,152,161,224,128,180,100,136,185,103,185,122,64,172,165,189,33,136,40,23,223,246,61,10,50,251,228,88,61,151,39,78,98,197,247,20,45,138,99,50,164,225,97,64,225,207,241,78,0,84,29,51,224,107,214,48,51,25,43,195,15,89,18,235,184,48,139,96,193,153,155,204,251,153,66,125,33,48,123,133,221,89,75,51,158,25,173,153,1,107,166,248,25,84,54,158,126,207,88,192,41,225,17,150,210,138,92,14,140,197,62,111,129,151,178,176,158,251,189,130,79,246,95,158,30,136,147,25,246,172,94,230,234,103,187,18,22,180,175,164,34,152,58,228,207,19,87,164,237,32,11,180,182,191,81,71,91,245,46,239,164,194,157,238,111,38,163,181,94,28,64,193,179,164,111,210,90,195,53,153,243,121,141,179,13,193,124,16,201,160,253,214,38,22,26,227,68,30,196,58,82,184,10,137,112,233,221,213,87,177,76,111,79,16,77,64,20,252,224,163,186,132,15,141,60,158,203,243,117,79,35,64,27,146,13,46,245,108,182,81,191,216,72,232,32,219,46,249,19,117,193,26,152,161,61,72,180,100,59,141,103,185,132,248,172,165,200,165,136,40,166,37,246,61,66,19,251,228,166,210,151,39,125,122,197,247,50,225,138,99,194,64,225,97,6,110,207,241,22,68,84,29,80,243,107,214,69,59,25,43,139,172,89,18,98,177,48,139,165,135,153,155,198,167,153,66,195,9,48,123,98,78,89,75,23,228,25,173,34,225,107,166,207,61,84,54,162,141,207,88,148,61,225,17,178,48,138,92,28,141,197,62,41,247,151,178,12,85,251,189,149,123,246,95,145,148,136,147,49,14,172,94,170,197,103,187,114,30,180,175,157,219,152,58,246,113,19,87,183,88,32,11,196,252,191,81,54,42,245,46,202,142,194,157,3,30,38,163,99,236,28,64,17,69,164,111,39,224,195,53,171,173,121,141,111,81,193,124,63,223,160,253,64,162,22,26,94,221,30,196,218,103,184,10,41,67,233,221,187,120,177,76,185,188,16,77,245,178,252,224,181,223,132,15,52,204,158,203,82,165,79,35,189,77,146,13,61,63,108,137,37,187,216,156}
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
 local ok,err=pcall(Rd87a1c,3,{})
 if not ok then error(err,0) end
end