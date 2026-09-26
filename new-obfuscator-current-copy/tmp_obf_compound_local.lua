-- f75626af908713cc | DO NOT EDIT
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
local v7a1cbe={36,98,134,15,184,226,55,117,152,172,148,53,150,141,161,71,16,85,197,181,69,253,112,222,26,233,152,99,129,107,173,96,184,157,154,27,88,209,253,113,232,183,179,129,193,18,222,221,51,58,213,190,64,128,19,54,108,42,76,239,190,71,225,158,19,236,56,96,244,233,119,146,13,4,47,174,52,138,55,172,250,138,88,27,41,86,250,51,172,135,199,153,154,47,155,19,239,60,209,5,128,115,182,101,187,89,191,82,174,244,132,13,246,167,79,152,126,165,141,115,79,0,96,207,196,200,103,133,254,150,5,32,18,24,182,37,88,2,11,20,237,122,114}
local c50f294={}
local r36d87a={{0,1},{1,1},{2,5},{7,51},{58,47},{105,38}}
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
 local src={75,89,18,101,123,48,139,244,50,153,155,73,155,153,66,229,91,48,123,112,18,89,75,63,126,25,173,237,214,107,166,233,109,84,54,188,241,207,88,107,203,225,17,4,222,138,92,213,247,197,62,199,228,151,178,123,228,251,189,246,104,246,95,111,40,136,147,14,237,172,94,183,185,103,187,220,222,180,175,33,16,152,58,130,117,19,87,70,219,32,20,156,216,191,18,169,108,245,250,238,146,194,197,7,79,38,145,109,158,28,154,116,132,164,238,214,252,195,18,23,16,121,64,108,177,193,187,100,233,160,33,148,184,22,198,145,30,30,24,132,22,184,111,141,160,233,117,14,193,177,15,173,121,16,37,155,195,252,254,174,164,132,166,214,28,158,173,25,38,79,16,219,194,146,217,205,245,108,85,207,191,216,134,18,32,219,102,19,19,117,127,36,152,161,185,5,180,100,110,88,103,185,66,145,172,165,87,82,136,40,186,188,246,61,48,164,251,228,122,178,181,39,112,62,197,187,212,92,138,131,81,17,225,158,59,88,207,57,196,54,84,69,168,166,107,246,99,173,25,255,0,75,89,122,223,123,48,57,183,66,153,106,203,155,153,158,196,139,48,91,32,18,89,145,152,43,25,138,182,214,107,186,240,29,84,78,21,241,207,68,251,97,225,209,147,99,138,188,103,247,197,226,195,39,151,134,189,228,251,122,147,61,246,222,88,40,136,231,153,165,172,77,124,185,103,63,218,100,180,254,91,161,152,121,162,117,19,20,102,219,32,215,201,216,191,174,53,108,245,242,147,146,194,125,144,79,38,185,210,158,28,24,43,132,164,150,205,252,195,217,231,16,121,206,108,177,193,177,253,233,160,27,183,184,22,110,192,30,30,61,55,22,184,22,129,160,233,26,96,193,177,108,2,121,16,109,113,195,252,243,165,164,132,255,118,28,158,249,5,38,79,87,77,194,146,217,205,245,108,144,51,191,216,249,123,32,219,88,150,19,117,69,38,152,161,114,245,180,100,220,1,103,185,150,15,172,165,149,13,136,40,22,244,246,61,226,199,251,228,140,0,151,39,71,39,197,247,170,156,138,99,31,15,225,97,226,40,207,241,230,18,84,29,80,243,107,214,148,6,25,43,47,85,89,18,8,251,48,139,101,141,153,155,45,235,153,66,46,205,48,123,195,52,89,75,139,204,25,173,44,167,107,166,141,29,105,54,190,184,207,88,135,85,36,17,226,158,148,92,212,215,129,62,93,21,49,178,120,247,49,189,42,179,202,95,110,154,174,147,73,104,140,94,182,68,121,187,186,229,130,175,85,124,65,58,130,85,87,87,70,251,100,11,156,106,153,81,137,114,52,46,13,250,108,157,35,135,92,163,203,106,211,64,15,54,130,111,224,230,218,53,77,35,63,141,76,200,65,124,221,174,232,253,10,54,42,26,196,211,62,196,26,222,194,10,253,135,179,221,124,27,202,76,141,181,14,77,53,187,87,224,111,72,46,15,64,60,207,203,163,88,143,35,157,170,117,13,46,144,28,137,81,0,158,156,11,224,170,70,87,241,67,130,58,176,207,85,175,202,164,186,187,18,110,182,94,100,223,73,147,171,200,110,95,130,140,42,189,188,172,120,178,242,87,93,62,49,69,212,92,205,43,226,17,194,129,135,88,253,243,190,54,136,72,140,166,222,249,236,173,57,122,227,75,107,180,113,123,2,45,145,66,100,133,72,155,94,94,145,139,153,237,113,18,45,79,227,43,237,98,236,214,137,144,140,29,218,10,190,241,251,157,135,97,194,241,226,99,243,220,212,247,177,238,93,39,113,15,120,228,211,211,42,61,49,230,110,40,64,233,73,165,235,22,182,185,79,213,186,100,29,57,85,161,152,58,130,94,19,87,70,114,182,11,156,44,13,81,137,127,63,46,13,99,65,157,35,240,96,163,203,207,18,64,15,123,24,111,224,49,227,53,77,239,197,141,76,212,177,124,221,187,34,253,10,118,33,26,196,211,62,196,26,12,161,10,253,96,152,221,124,15,134,76,141,90,240,77,53,66,202,224,111,184,248,15,64,169,177,203,163,230,62,35,157,15,178,13,46,111,175,137,81,159,156,156,11,114,89,70,87,48,149,130,58,45,142,85,175,115,221,186,187,126,219,182,94,254,39,73,147,186,142,110,95,2,143,42,189,219,181,120,178,75,185,93,62,68,193,212,92,86,54,226,17,61,255,135,88,209,48,190,54,60,179,140,166,182,15,236,173,171,13,227,75,181,184,113,123,240,250,145,66,155,155,86,155,208,66,145,198,48,123,113,102,93,75,227,229,46,173,236,162,111,166,140,46,18,54,190,17,124,88,135,166,88,17,226,190,83,92,212,27,111,62,93,146,184,178,120,16,73,189,42,250,234,95,110,86,72,147,73,185,208,94,182,225,67,187,186,1,196,175,85,216,24,58,130,70,85,87,70,197,225,11,156,189,207,81,137,217,218,46,13,160,192,157,35,131,56,163,203,106,174,64,15,253,36,111,224,220,76,53,77,48,246,141,76,162,157,124,221,41,209,253,10,104,163,26,196,217,167,196,26,230,142,10,253,31,175,221,124,29,47,76,141,89,84,77,53,89,63,224,111,85,7,15,64,152,254,203,163,202,229,35,157,54,93,13,46,37,217,137,81,202,15,156,11,84,223,70,87,51,250,130,58,223,233,85,175,192,213,186,187,189,194,182,94,158,3,73,147,64,82,110,95,94,79,42,189,11,210,120,178,199,116,93,62,149,164,212,92,34,17,226,17,16,226,135,88,169,75,190,54,182,43,140,166,67,184,236,173,215,28,227,75,187,36,113,123,253,171,145,66,231,91,72,155,87,117,145,139,2,221,113,18,141,168,227,43,230,17,236,214,166,134,140,29,136,168,190,241,232,2,135,97,193,85,226,99,254,140,212,247,108,168,93,39,117,132,120,228,142,106,42,61,58,65,110,40,69,179,73,165,252,13,182,185,186,98,186,100,180,175,85,158,152,58,130,161,240,87,70,179,142,11,156,155,159,81,137,4,18,46,13,19,244,157,35,125,128,163,203,31,42,64,15,76,222,111,224,148,109,53,77,206,25,141,76,145,133,124,221,15,29,253,10,152,71,26,196,159,40,196,26,190,202,10,253,124,188,221,124,104,39,76,141,17,247,77,53,208,54,224,111,144,65,15,64,146,162,203,163,116,205,35,157,209,206,13,46,1,163,137,81,113,239,156,11,99,251,70,87,15,9,130,58,139,253,85,175,228,55,186,187,175,195,182,94,216,117,73,147,252,153,110,95,73,123,42,189,4,88,120,178,239,140,93,62,217,139,212,92,66,25,226,17,41,27,135,88,187,245,190,54,165,158,140,166,51,242,236,173,166,109,227,75,158,14,113,123,16,218,145,66,49,233,72,155,135,131,145,139,247,103,113,18,191,246,227,43,58,77,236,214,137,144,140,29,30,44,190,241,85,155,135,97,33,96,226,99,94,191,212,247,2,135,93,39,163,119,120,228,59,204,42,61,44,36,110,40,252,67,73,165,93,221,182,185,71,52,186,100,167,101,85,161,236,62,130,117}
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