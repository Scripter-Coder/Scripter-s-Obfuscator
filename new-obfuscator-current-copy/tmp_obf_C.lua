-- d5abbc17a3da19f9 | DO NOT EDIT
local _da822c6=function(abe96e1,b69506a,...)
 while true do
  local _sc6ea={} local _t13de=0
  local _y5250={{}}
  local _iabe2=1
  local _wd72e=abe96e1[b69506a]
  local o0c4b58=_wd72e.c[_iabe2]
  if o0c4b58==1 then _sc6ea[_t13de]="x" end
 end
end
local _b7bf4={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _r647b={{1,41}}
local def194d=function(i) local a=_b7bf4[1] local rr=_r647b[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b7bf42={214,17,239,131,189,168} do local rp=1 while rp<=#_b7bf42 do local np=_b7bf42[rp]+_b7bf42[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b7bf42[rp]+_b7bf42[rp+1]*256 rp=rp+2 end local va=(_b7bf42[rp]==1) rp=rp+1 local nc=_b7bf42[rp]+_b7bf42[rp+1]*256+_b7bf42[rp+2]*65536+_b7bf42[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b7bf42[rp]+_b7bf42[rp+1]*256+_b7bf42[rp+2]*65536+_b7bf42[rp+3]*16777216 rp=rp+4 end end end
end
local g5836eb=_G
if getfenv then local _le=getfenv(0) if _le then g5836eb=_le end end
local hgf4dadc={}
if getgenv then g5836eb=getgenv() end
if not g5836eb then g5836eb=_G end
local v370290={36,66,72,48,41,243,122,59,224,157,68,94,196,158,222,13,185,173,204,103,4,101,51,242,147,31,23,149,138,43,203,247,110,238,52,225,196,39,201,157,217,77,135,78,103,139,58,49,77,165,91,67,49,30,49,124,47,61,248,223,181,134,173,240,96,129,205,118,62,23,185,44,170,83,0,148,32,181,31,59,66,137,231,113,243,106,199,36,227,67,223,213,129,53,133,170,218,144,59,9,116,218,223,168,116,179,252,129,46,23,44,139,28}
local cb0f6a5={}
local re0811a={{0,3},{3,17},{20,5},{25,17},{42,51},{93,20}}
local m339f87={}
local ivbd25ef=78
local d65228f=function(i)
 local c=cb0f6a5[i] if c then return c end
 local rr=re0811a[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=ivbd25ef
 for j=1,ln do
  local p=st+j
  local a=v370290[p] local b=(193*p+67+1729411522*1.0*((p*p)%5))%251+126
  local kb=(b + prev*65)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 cb0f6a5[i]=t return t
end
local u5be50d
if table.unpack then u5be50d=table.unpack else u5be50d=unpack end
if not u5be50d then u5be50d=unpack end
local P053163=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m730e5a938e"]=true
 return t
end
local q6cd2a7=function(t) return type(t)=="table" and t["m730e5a938e"]==true end
local bfa85b4={}
do
 local src={66,107,55,172,174,94,172,67,242,99,56,170,193,122,209,102,107,163,129,255,33,222,67,211,96,48,23,159,196,143,248,156,52,5,240,135,180,136,250,140,64,34,27,179,236,201,73,44,109,135,137,174,106,87,219,7,204,57,68,237,62,44,141,234,189,51,131,159,83,75,51,66,246,117,12,40,176,177,248,142,124,4,225,9,90,100,137,219,74,214,57,141,76,95,107,252,96,245,76,152,134,162,174,188,190,97,105,248,13,50,91,134,105,21,164,132,215,10,169,63,92,17,45,2,238,42,7,252,151,85,126,178,82,146,30,18,31,225,69,95,249,71,16,56,234,186,149,85,237,68,219,139,7,219,207,246,46,137,63,67,103,73,75,10,178,27,82,78,20,250,201,219,131,240,147,244,9,248,0,174,156,23,91,3,70,67,166,138,253,129,27,3,203,209,190,28,171,56,28,181,157,172,62,142,161,55,72,192,183,207,118,226,223,126,86,133,30,63,224,181,106,18,151,67,200,242,112,45,61,233,189,52,191,242,12,156,88,18,161,130,254,63,128,225,187,126,149,96,138,207,75,67,107,55,177,243,94,172,131,225,99,56,43,218,122,209,48,160,163,129,16,63,222,67,104,149,48,23,50,34,143,248,10,51,5,240,131,180,137,188,20,199,34,170,171,236,201,57,97,40,135,22,11,113,87,81,156,204,57,36,205,62,45,88,173,189,51,12,188,83,75,158,155,246,117,156,94,176,177,228,142,124,4,9,107,90,100,172,10,74,214,133,189,76,95,209,15,96,245,20,26,134,162,74,145,190,97,212,162,13,50,149,64,105,21,34,142,215,10,42,75,92,17,250,32,238,42,169,101,151,85,31,86,82,146,83,207,31,225,105,157,249,71,121,62,234,186,3,154,237,68,253,170,7,219,121,213,46,137,24,7,103,73,185,234,178,27,92,82,20,250,37,183,131,240,68,220,9,248,75,25,156,23,27,50,70,67,0,101,253,129,103,14,203,209,10,72,171,56,161,233,157,172,205,103,161,55,151,67,183,207,20,153,223,126,136,193,30,63,149,129,106,18,51,165,200,242,192,171,61,233,174,230,191,242,129,25,88,18,145,173,254,63,252,220,187,126,167,72,138,207,156,151,107,55,222,219,94,172,141,108,99,56,62,13,122,209,122,113,163,129,183,162,222,67,171,249,48,23,175,250,143,248,194,205,5,240,173,16,136,250,228,149,34,27,108,168,201,73,7,8,135,137,252,44,87,219,113,232,57,68,238,190,45,186,204,132,51,71,39,23,75,225}
 for i=1,#src do
  local a=src[(i)] local _junk33b=0 local b=((i*i*79+i*55+179)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  bfa85b4[i]=r
 end
end
local K58976b={}
do
 local rp=1
 while rp<=#bfa85b4 do
  local np=bfa85b4[rp] + bfa85b4[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=bfa85b4[rp] + bfa85b4[rp+1]*256 rp=rp+2 end
  local va=(bfa85b4[rp]==1) rp=rp+1
  local nc=bfa85b4[rp] + bfa85b4[rp+1]*256 + bfa85b4[rp+2]*65536 + bfa85b4[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=bfa85b4[rp] + bfa85b4[rp+1]*256 + bfa85b4[rp+2]*65536 + bfa85b4[rp+3]*16777216
   rp=rp+4
  end
  K58976b[#K58976b+1]={c=cd,p=ps,v=va}
 end
end
local ow6542b7={}
local rge826b6={} local fr9edb7a={} local fpb88954=0 local bae1085f=0 local to40705e=0 local nb28f539=0
local cufaebaa=nil local dnb3b818=false local rs9ae18e={} local vfm4c4409={} local sche1d0e4 local ivk7ed3f7
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rge826b6 st.fr=fr9edb7a st.fp=fpb88954 st.ba=bae1085f st.to=to40705e st.cu=cufaebaa st.co=w96716c st.pc=ia543ae st.sp=t9b19b1 st.sc=y3b5674 st.lk=L5968c0 st.va=a9e37dd st.nb=nb28f539 st.dn=dnb3b818 st.rs=rs9ae18e end
local __vms_load_state=function(st) rge826b6=st.rg or {} fr9edb7a=st.fr or {} fpb88954=st.fp or 0 bae1085f=st.ba or 0 to40705e=st.to or 0 cufaebaa=st.cu w96716c=st.co ia543ae=st.pc or 1 t9b19b1=st.sp or 0 y3b5674=st.sc or {{}} L5968c0=st.lk or {} a9e37dd=st.va nb28f539=st.nb or 0 dnb3b818=st.dn or false rs9ae18e=st.rs or {} if fpb88954>0 then local q=fr9edb7a[fpb88954] if not q or q.owner~=ow6542b7 then error("VM_STATE_FRAME_OWNER",0) end if bae1085f~=q.base or to40705e~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local sa27a8e=setmetatable({}, {__index=function(_,k) return rge826b6[bae1085f+k] end, __newindex=function(_,k,v) rge826b6[bae1085f+k]=v end})
local vf884857=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivk7ed3f7(d,...) end vfm4c4409[f]=d return f end
local pf1c8aeb local xf13d973 local sf986a70 local lf2586a4 local rtb496c7
local R26dbec
R26dbec=function(x3c46fe,L5968c0,...)
 fr9edb7a={} fpb88954=0 nb28f539=0 dnb3b818=false rs9ae18e={}
 __vms_root_state={}
 pf1c8aeb=function(ci,links,args,retDest,nRet,caller,meta)
  local code=K58976b[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nb28f539,top=nb28f539+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nb28f539+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=ow6542b7}
  nb28f539=nb28f539+512
  fpb88954=fpb88954+1 fr9edb7a[fpb88954]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["m730e5a938e"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sf986a70=function(f) if not f then return end f.pc=ia543ae f.base=bae1085f f.top=to40705e f.sp=t9b19b1 f.sc=y3b5674 f.lk=L5968c0 f.va=a9e37dd f.sanext=cufaebaa.sanext f.sasizes=cufaebaa.sasizes end
 lf2586a4=function(f) cufaebaa=f w96716c=K58976b[f.chunk] ia543ae=f.pc bae1085f=f.base to40705e=f.top t9b19b1=f.sp y3b5674=f.sc L5968c0=f.lk a9e37dd=f.va end
 rtb496c7=function(n,packed)
  local f=fr9edb7a[fpb88954] local vals={}
  if packed then local p=sa27a8e[t9b19b1] local pn=(p and p.n) or 0 for i=1,n do vals[i]=sa27a8e[t9b19b1-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=sa27a8e[t9b19b1-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sf986a70(f)
   for i=f.base,f.top do rge826b6[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rge826b6[i]=nil end end
   fr9edb7a[fpb88954]=nil fpb88954=fpb88954-1
   lf2586a4(caller)
   local q={n=0} q["m730e5a938e"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   t9b19b1=meta.dest sa27a8e[t9b19b1]=q
   return
  end
  sf986a70(f)
  rge826b6[f.base]=rge826b6[f.base]
  for i=f.base,f.top do rge826b6[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rge826b6[i]=nil end end
  fr9edb7a[fpb88954]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rs9ae18e=vals dnb3b818=true return end
  fpb88954=fpb88954-1 local cf=fr9edb7a[fpb88954]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf2586a4(cf)
  local d=f.retDest or (t9b19b1+1)
  if f.nRet==0 then return end
  t9b19b1=d-1
  if f.nRet==1 then t9b19b1=d sa27a8e[t9b19b1]=vals[1] else local q={n=#vals} q["m730e5a938e"]=true for i=1,#vals do q[i]=vals[i] end t9b19b1=d sa27a8e[t9b19b1]=q end
 end
 pf1c8aeb(x3c46fe,L5968c0,{...},nil,0,nil)
  local f=fr9edb7a[fpb88954]
  if not f then error("VM_FRAME_MISSING",0) end
  lf2586a4(f)
 local h30c048={}
 h30c048[29230]=function()
   local ix=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local n=m339f87[ix] if not n then n=tonumber(d65228f(ix)) m339f87[ix]=n end
   sa27a8e[t9b19b1]=sa27a8e[t9b19b1]+n
 end
 h30c048[52373]=function()
   if not a9e37dd then local t={n=0} t["m730e5a938e"]=true a9e37dd=t end
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=a9e37dd
 end
 h30c048[38270]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a % b
 end
 h30c048[17739]=function()
   sa27a8e[t9b19b1]=nil t9b19b1=t9b19b1-1
 end
 h30c048[50142]=function()
   local ix=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local n=m339f87[ix]
   if not n then n=tonumber(d65228f(ix)) m339f87[ix]=n end
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=n
 end
 h30c048[6577]=function()
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=nil
 end
 h30c048[32459]=function()
   local ci=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local links={}
   for i=1,#L5968c0 do links[#links+1]=L5968c0[i] end
   for i=1,#y3b5674 do links[#links+1]=y3b5674[i] end
   t9b19b1=t9b19b1+1
   sa27a8e[t9b19b1]=vf884857(ci,links)
 end
 h30c048[22205]=function()
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=d65228f(w96716c.c[ia543ae]) ia543ae=ia543ae+1
 end
 h30c048[42030]=function()
   local _mode=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local v=sa27a8e[t9b19b1] local idx=sa27a8e[t9b19b1-1] local b=sa27a8e[t9b19b1-2] t9b19b1=t9b19b1-3
   local f=cufaebaa local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rge826b6[b+idx-1]=v
 end
 h30c048[19378]=function()
   sa27a8e[t9b19b1]=#sa27a8e[t9b19b1]
 end
 h30c048[12191]=function()
   local id=w96716c.c[ia543ae] local v=sa27a8e[t9b19b1] t9b19b1=t9b19b1-1 ia543ae=ia543ae+1
   local b=nil for i=#y3b5674,1,-1 do b=y3b5674[i][id] if b then break end end
   if b then b[1]=v end
 end
 h30c048[27279]=function()
   local n=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local a={} for j=1,n do a[j]=sa27a8e[t9b19b1-n+j] end t9b19b1=t9b19b1-n-1
   local la=n if la>0 and q6cd2a7(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm4c4409[f]
   if vd then
    local caller=cufaebaa local dest=t9b19b1+1 sf986a70(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf1c8aeb(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf2586a4(fr9edb7a[fpb88954])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],u5be50d(a,3,la)) else ok,rr=pcall(f,u5be50d(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["m730e5a938e"]=true q[1]=ok q[2]=rr t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=q
   end
 end
 h30c048[508]=function()
   local _v=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=nil t9b19b1=t9b19b1-1 if not _v then ia543ae=w96716c.c[ia543ae] else ia543ae=ia543ae+1 end
 end
 h30c048[24018]=function()
   if not sa27a8e[t9b19b1] then ia543ae=w96716c.c[ia543ae] else ia543ae=ia543ae+1 sa27a8e[t9b19b1]=nil t9b19b1=t9b19b1-1 end
 end
 h30c048[2168]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a == b
 end
 h30c048[49789]=function()
   local k=sa27a8e[t9b19b1] t9b19b1=t9b19b1-1 local t=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=t[k]
 end
 h30c048[58475]=function()
   sa27a8e[t9b19b1]=not sa27a8e[t9b19b1]
 end
 h30c048[8288]=function()
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=false
 end
 h30c048[34083]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a < b
 end
 h30c048[941]=function()
   g5836eb[d65228f(w96716c.c[ia543ae])]=sa27a8e[t9b19b1] t9b19b1=t9b19b1-1 ia543ae=ia543ae+1
 end
 h30c048[33315]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a + b
 end
 h30c048[31390]=function()
   local id=w96716c.c[ia543ae] local v=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=nil t9b19b1=t9b19b1-1 ia543ae=ia543ae+1
   y3b5674[#y3b5674][id]={v}
 end
 h30c048[5926]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a / b
 end
 h30c048[17630]=function()
   local id=w96716c.c[ia543ae] local v=sa27a8e[t9b19b1] t9b19b1=t9b19b1-1 ia543ae=ia543ae+1
   local b=nil for i=#L5968c0,1,-1 do b=L5968c0[i][id] if b then break end end
   if b then b[1]=v end
 end
 h30c048[34709]=function()
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=g5836eb[d65228f(w96716c.c[ia543ae])] ia543ae=ia543ae+1
 end
 h30c048[51603]=function()
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]={}
 end
 h30c048[34712]=function()
   local n=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local f=sa27a8e[t9b19b1-n]
   local a={}
   for j=1,n do a[j]=sa27a8e[t9b19b1-n+j] end
   t9b19b1=t9b19b1-n-1
   local la=n
   if la>0 and q6cd2a7(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm4c4409[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cufaebaa local dest=t9b19b1+1
    sf986a70(caller)
    local vc=vd or f pf1c8aeb(vc.chunk,vc.links,a,dest,1,caller)
    lf2586a4(fr9edb7a[fpb88954])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf986a70(cufaebaa) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P053163(f(u5be50d(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf2586a4(cufaebaa) end
    t9b19b1=t9b19b1+1
    sa27a8e[t9b19b1]=r[1]
   end
 end
 h30c048[33919]=function()
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=sa27a8e[t9b19b1-1]
 end
 h30c048[38180]=function()
   y3b5674[#y3b5674+1]={}
 end
 h30c048[50538]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a <= b
 end
 h30c048[56772]=function()
   local k=sa27a8e[t9b19b1] t9b19b1=t9b19b1-1 local t=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=t[k]
 end
 h30c048[19613]=function()
   local v=sa27a8e[t9b19b1] local k=sa27a8e[t9b19b1-1] local t=sa27a8e[t9b19b1-2] t[k]=v t9b19b1=t9b19b1-3
 end
 h30c048[39818]=function()
   ia543ae=w96716c.c[ia543ae]
 end
 h30c048[6023]=function()
   local ix=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local k=d65228f(ix) local v=hgf4dadc[k] if v==nil then v=g5836eb[k] hgf4dadc[k]=v end
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=v
 end
 h30c048[23091]=function()
   local id=w96716c.c[ia543ae] local b=nil ia543ae=ia543ae+1
   for i=#L5968c0,1,-1 do b=L5968c0[i][id] if b then break end end
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=b and b[1]
 end
 h30c048[33610]=function()
   local _mode=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local idx=sa27a8e[t9b19b1] local b=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-2
   local f=cufaebaa local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=nil else t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=rge826b6[b+idx-1] end
 end
 h30c048[28481]=function()
   local ix=w96716c.c[ia543ae] ia543ae=ia543ae+1
   sa27a8e[t9b19b1]=sa27a8e[t9b19b1][ix]
 end
 h30c048[23824]=function()
   y3b5674[#y3b5674]=nil
 end
 h30c048[9631]=function()
   sa27a8e[t9b19b1]=-sa27a8e[t9b19b1]
 end
 h30c048[53278]=function()
   sa27a8e[t9b19b1]=sa27a8e[t9b19b1][3]
 end
 h30c048[59054]=function()
   local n=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local f=sa27a8e[t9b19b1-n] local a={} for j=1,n do a[j]=sa27a8e[t9b19b1-n+j] end t9b19b1=t9b19b1-n-1
   local la=n if la>0 and q6cd2a7(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfm4c4409[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cufaebaa local base0=bae1085f local top0=to40705e local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rge826b6[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rge826b6[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=ow6542b7}
    local cc=K58976b[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["m730e5a938e"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    fr9edb7a[fpb88954]=nf lf2586a4(nf)
   else
    local r=P053163(f(u5be50d(a,1,la))) t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=r rtb496c7(0,true)
   end
 end
 h30c048[52770]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a ^ b
 end
 h30c048[59339]=function()
   sa27a8e[t9b19b1]=sa27a8e[t9b19b1][2]
 end
 h30c048[54571]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a > b
 end
 h30c048[43896]=function()
   local k=w96716c.c[ia543ae] ia543ae=ia543ae+1
   rtb496c7(k,true)
 end
 h30c048[6392]=function()
   local id=w96716c.c[ia543ae] local b=nil ia543ae=ia543ae+1
   for i=#y3b5674,1,-1 do b=y3b5674[i][id] if b then break end end
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=b and b[1]
 end
 h30c048[55490]=function()
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=true
 end
 h30c048[59010]=function()
   local p=sa27a8e[t9b19b1] t9b19b1=t9b19b1-1 local t=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=nil t9b19b1=t9b19b1-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 h30c048[21232]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a * b
 end
 h30c048[30079]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a * b
 end
 h30c048[34987]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a ~= b
 end
 h30c048[12075]=function()
   local b=sa27a8e[t9b19b1] local n=cufaebaa.sasizes and cufaebaa.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end sa27a8e[t9b19b1]=n
 end
 h30c048[6573]=function()
   local _n=(sa27a8e[t9b19b1]==nil) sa27a8e[t9b19b1]=nil t9b19b1=t9b19b1-1 if _n then ia543ae=w96716c.c[ia543ae] else ia543ae=ia543ae+1 end
 end
 h30c048[18326]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a + b
 end
 h30c048[22601]=function()
 end
 h30c048[15923]=function()
   local n=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local f=cufaebaa local b=f.sanext or (bae1085f+256) local lim=bae1085f+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n to40705e=math.max(to40705e,bae1085f+255)
   t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=b
 end
 h30c048[9334]=function()
   local n=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local pt=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=nil t9b19b1=t9b19b1-1
   for j=1,n do t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=pt[j] end
 end
 h30c048[26308]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 h30c048[27576]=function()
   local n=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local f=sa27a8e[t9b19b1-n]
   local a={}
   for j=1,n do a[j]=sa27a8e[t9b19b1-n+j] end
   t9b19b1=t9b19b1-n-1
   local la=n
   if la>0 and q6cd2a7(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm4c4409[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cufaebaa local dest=t9b19b1+1
    sf986a70(caller)
    local vc=vd or f pf1c8aeb(vc.chunk,vc.links,a,dest,-1,caller)
    lf2586a4(fr9edb7a[fpb88954])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf986a70(cufaebaa) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P053163(f(u5be50d(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf2586a4(cufaebaa) end
    t9b19b1=t9b19b1+1
    sa27a8e[t9b19b1]=r
   end
 end
 h30c048[51451]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a - b
 end
 h30c048[7917]=function()
   sa27a8e[t9b19b1]=sa27a8e[t9b19b1][1]
 end
 h30c048[14630]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a .. b
 end
 h30c048[18402]=function()
   local n=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local a={} for j=1,n do a[j]=sa27a8e[t9b19b1-n+j] end t9b19b1=t9b19b1-n-1
   local la=n if la>0 and q6cd2a7(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm4c4409[f]
   if vd then
    local caller=cufaebaa local dest=t9b19b1+1 sf986a70(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf1c8aeb(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf2586a4(fr9edb7a[fpb88954])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],u5be50d(a,3,la)) else ok,rr=pcall(f,u5be50d(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["m730e5a938e"]=true q[1]=ok q[2]=rr t9b19b1=t9b19b1+1 sa27a8e[t9b19b1]=q
   end
 end
 h30c048[3086]=function()
   if sa27a8e[t9b19b1] then ia543ae=w96716c.c[ia543ae] else ia543ae=ia543ae+1 sa27a8e[t9b19b1]=nil t9b19b1=t9b19b1-1 end
 end
 h30c048[7040]=function()
   local n=w96716c.c[ia543ae] ia543ae=ia543ae+1
   rtb496c7(n,false)
 end
 h30c048[1648]=function()
   local b=sa27a8e[t9b19b1] local a=sa27a8e[t9b19b1-1] t9b19b1=t9b19b1-1
   sa27a8e[t9b19b1]=a >= b
 end
 h30c048[719]=function()
   local ix=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local n=m339f87[ix] if not n then n=tonumber(d65228f(ix)) m339f87[ix]=n end
   sa27a8e[t9b19b1]=sa27a8e[t9b19b1]*n
 end
 h30c048[35184]=function()
   local _v=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=nil t9b19b1=t9b19b1-1 if _v then ia543ae=w96716c.c[ia543ae] else ia543ae=ia543ae+1 end
 end
 h30c048[32771]=function()
   sa27a8e[t9b19b1],sa27a8e[t9b19b1-1]=sa27a8e[t9b19b1-1],sa27a8e[t9b19b1]
 end
 h30c048[64970]=function()
  local k=sa27a8e[t9b19b1] t9b19b1=t9b19b1-1 local t=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=t[k]
 end
 h30c048[61027]=function()
  ia543ae=w96716c.c[ia543ae]
 end
 h30c048[62845]=function()
  local k=sa27a8e[t9b19b1] t9b19b1=t9b19b1-1 local t=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=t[k]
 end
 h30c048[62905]=function()
  local t=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=t
 end
 h30c048[63949]=function()
  ia543ae=w96716c.c[ia543ae]
 end
 h30c048[60162]=function()
  ia543ae=w96716c.c[ia543ae]
 end
 h30c048[60397]=function()
  local k=sa27a8e[t9b19b1] t9b19b1=t9b19b1-1 local t=sa27a8e[t9b19b1] sa27a8e[t9b19b1]=t[k]
 end
 sche1d0e4=function(stop)
  while fpb88954>stop and not dnb3b818 do
   local f=fr9edb7a[fpb88954] if not f then error("VM_FRAME_MISSING",0) end
   lf2586a4(f)
   if fpb88954<1 or fpb88954>#fr9edb7a or fr9edb7a[fpb88954]~=cufaebaa then error("VM_STATE_FP",0) end
   if cufaebaa.owner~=ow6542b7 then error("VM_STATE_FRAME_OWNER",0) end
   if w96716c~=K58976b[cufaebaa.chunk] then error("VM_STATE_CODE",0) end
   if ia543ae%1~=0 or ia543ae<1 or ia543ae>#w96716c.c then error("VM_STATE_PC",0) end
   if bae1085f%1~=0 or to40705e%1~=0 or bae1085f<0 or to40705e<bae1085f or to40705e>bae1085f+255 then error("VM_STATE_BOUNDS",0) end
   if t9b19b1%1~=0 or t9b19b1<0 or t9b19b1>to40705e-bae1085f then error("VM_STATE_SP",0) end
   local o4f2bf1=w96716c.c[ia543ae] ia543ae=ia543ae+1
   local _fn=h30c048[o4f2bf1]
   local _yieldop=(o4f2bf1==34712 or o4f2bf1==27576)
   local _ok,_err=true,nil
   if _yieldop and not (cufaebaa and cufaebaa.prot) then if _fn then _fn() else error("bad opcode "..tostring(o4f2bf1),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(o4f2bf1),0) end end) end
   if not _ok then
    local handled=false local ei=fpb88954
    while ei>stop do
     local ef=fr9edb7a[ei] local meta=ef and ef.prot
     if meta then
      for k=fpb88954,ei+1,-1 do local z=fr9edb7a[k] if z then for j=z.base,z.top do rge826b6[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rge826b6[j]=nil end end end fr9edb7a[k]=nil end
      fpb88954=ei lf2586a4(fr9edb7a[fpb88954])
      local bad=fr9edb7a[fpb88954] local caller=meta.caller fr9edb7a[fpb88954]=nil fpb88954=fpb88954-1
      for j=bad.base,bad.top do rge826b6[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rge826b6[j]=nil end end
      if meta.kind=="xpcall" then lf2586a4(caller) local hf=vfm4c4409[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf1c8aeb(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["m730e5a938e"]=true q[1]=false q[2]=hr t9b19b1=meta.dest sa27a8e[t9b19b1]=q end else lf2586a4(caller) local q={n=2} q["m730e5a938e"]=true q[1]=false q[2]=_err t9b19b1=meta.dest sa27a8e[t9b19b1]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dnb3b818 then sf986a70(cufaebaa) end
  end
 end
 ivk7ed3f7=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if fr9edb7a==st.fr and fpb88954>0 then __vms_save_state(st) end __vms_load_state(st)
   if fpb88954==0 then
    pf1c8aeb(d.chunk,d.links,{...},nil,0,nil)
    sche1d0e4(0)
    local rr=rs9ae18e or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return u5be50d(rr)
   end
   local stop=fpb88954 local caller=fr9edb7a[fpb88954] sf986a70(caller)
   pf1c8aeb(d.chunk,d.links,{...},t9b19b1+1,0,caller)
   sche1d0e4(stop)
   local cf=fr9edb7a[fpb88954] lf2586a4(cf) local rr=cf.lastResult or {} cf.lastResult=nil return u5be50d(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fpb88954 local caller=fr9edb7a[fpb88954]
  sf986a70(caller)
  pf1c8aeb(d.chunk,d.links,{...},0,0,caller)
  sche1d0e4(stop)
  local cf=fr9edb7a[fpb88954] lf2586a4(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return u5be50d(rr)
 end
 sche1d0e4(0)
 return u5be50d(rs9ae18e)
end
do
 local ok,err=pcall(R26dbec,1,{})
 if not ok then error(err,0) end
end