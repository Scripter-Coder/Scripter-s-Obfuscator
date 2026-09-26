-- 1dbdc1620c03f39c | DO NOT EDIT
local _ddabace=function(acd5744,b3e0152,...)
 while true do
  local _sd937={} local _t135f=0
  local _ya723={{}}
  local _ic09f=1
  local _w1b65=acd5744[b3e0152]
  local o36ad80=_w1b65.c[_ic09f]
  if o36ad80==1 then _sd937[_t135f]="x" end
 end
end
local _b7356={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _r9aa9={{1,41}}
local d3dfc33=function(i) local a=_b7356[1] local rr=_r9aa9[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b73562={214,17,239,131,189,168} do local rp=1 while rp<=#_b73562 do local np=_b73562[rp]+_b73562[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b73562[rp]+_b73562[rp+1]*256 rp=rp+2 end local va=(_b73562[rp]==1) rp=rp+1 local nc=_b73562[rp]+_b73562[rp+1]*256+_b73562[rp+2]*65536+_b73562[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b73562[rp]+_b73562[rp+1]*256+_b73562[rp+2]*65536+_b73562[rp+3]*16777216 rp=rp+4 end end end
end
local gc47743=_G
if getfenv then local _le=getfenv(0) if _le then gc47743=_le end end
local hg8e181d={}
if getgenv then gc47743=getgenv() end
if not gc47743 then gc47743=_G end
local vabcc55={111,124,11,56,171,216,171,117,246,209,113,235,71,203,51,29,33,233,132,193,156,131,170,31,24,113,204,97,82,165,235,122,174,48,118,177,0,0,0,83,45,159,130,50,198,102,6,213,111,65,206,195,251,16,92,0,61,172,128,176,110,133,203,119,107,161,247,255,168,61,103,82,195,221,221,28,248,194,28,83,229,33,166,149,145,105,46,203,150,184,83,8,32,63,64,176,89,237,18,151,245,46,184,27,120,206,63,231,143,26,132,14,78,146,205,172}
local ced6626={}
local r82b28a={{0,5},{5,3},{8,3},{11,3},{14,12},{26,3},{29,1},{30,12},{42,3},{45,1},{46,5},{51,3},{54,32},{86,30}}
local ma9c196={}
local iv92975d=247
local dd8a21a=function(i)
 local c=ced6626[i] if c then return c end
 local rr=r82b28a[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=iv92975d
 for j=1,ln do
  local p=st+j
  local a=vabcc55[p] local b=(92*p+58+3080784086*1.0*((p*p)%26))%251+185
  local kb=(b + prev*37)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 ced6626[i]=t return t
end
local u45682b
if table.unpack then u45682b=table.unpack else u45682b=unpack end
if not u45682b then u45682b=unpack end
local P26bfee=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["meafd0590e9"]=true
 return t
end
local q1339f7=function(t) return type(t)=="table" and t["meafd0590e9"]==true end
local bb08cdc={}
do
 local src={104,89,187,146,222,157,208,110,150,41,46,201,91,243,202,27,136,10,174,79,114,95,213,192,38,247,68,78,147,215,241,131,133,250,230,207,55,101,35,80,245,19,158,55,87,4,97,133,220,56,103,15,37,175,176,174,59,110,65,130,66,112,21,187,251,181,44,59,154,66,134,27,222,18,40,99,164,37,13,102,56,123,53,178,15,25,160,158,19,245,83,35,101,30,115,230,250,133,238,57,215,52,253,31,247,38,68,252,95,91,200,174,10,211,126,16,243,147,164,46,41,150,32,96,157,220,148,6,89,106,238,231,88,59,76,153,154,79,115,20,36,166,243,199,236,69,19,22,252,39,57,231,84,76,176,151,234,180,34,56,200,100,117,242,233,87,109,57,82,141,143,196,249,11,137,128,232,199,140,71,31,203,236,136,148,23,10,207,81,161,105,161,81,115,208,210,148,136,230,203,31,224,113,15,232,128,137,80,249,99,185,164,82,137,62,87,233,242,160,255,200,163,250,180,234,151,236,252,84,206,15,128,252,77,19,69,236,15,14,1,36,20,116,79,154,92,150,135,88,231,239,106,89,186,34,123,157,208,123,150,41,46,21,52,243,202,26,211,10,174,231,177,95,213,196,154,247,68,250,52,215,241,94,64,250,230,66,30,101,35,227,82,19,158,164,25,4,97,179,82,56,103,1,37,175,176,191,92,110,65,23,229,112,21,45,181,181,44,197,120,66,134,146,101,18,40,176,175,37,13,102,56,77,53,97,32,25,160,158,156,91,83,35,7,177,73,230,18,214,130,241,7,60,254,68,39,46,194,213,237,10,201,174,144,113,24,202,67,52,165,46,251,13,122,208,44,119,146,186,157,191,237,231,17,110,144,92,240,221,118,20,148,1,159,15,138,159,16,77,144,239,191,206,219,226,182,151,233,239,240,163,12,172,114,242,89,240,55,137,231,15,63,99,89,30,138,128,228,252,29,224,133,105,238,136,249,77,12,115,219,153,104,161,137,213,12,23,190,31,238,203,238,126,29,199,220,233,138,11,61,182,63,141,19,111,55,87,160,167,114,100,14,225,240,180,233,204,182,76,194,188,191,39,255,77,93,69,216,15,189,166,36,50,118,79,154,203,146,59,88,161,156,106,89,106,154,220,157,60,16,150,41,119,39,147,243,254,22,211,10,231,156,91,95,66,140,38,247,236,221,52,215,96,37,133,250,96,96,30,101,9,196,245,19,248,122,25,4,137,102,123,56,147,217,37,175,2,121,18,110,203,190,66,112,19,144,181,181,232,15,112,66,155,153,110,18,177,150,175,37,221,111,56,123,243,35,4,25,225,120,19,245,6,19,101,30,59,193,250,133,168,102,215,52,146,140,247,38,84,167,95,91,61,122,10,211,186,160,243,147,244,133,41,150,190,5,157,220,200,10,89,106,123,149,88,59,12,127,154,79,195,150,36,166,38,78,236,69,17,77,183,39,191,139,84,76,182,38,65,180,240,156,17,100,114,154,111,87,55,79,16,141,63,126,33,11,138,226,173,199,29,121,57,203,238,226,6,23,12,21,139,161,104,9,253,115,12,201,246,136,238,255,118,224,29,165,173,128,138,52,32,99,63,63,3,137,55,166,119,242,114,79,171,163,240,103,225,151,182,228,248,206,191,118,87,77,16,217,207,15,159,243,20,20,118,254,49,92,144,237,105,231,237,246,122,186,146,69,187,208,122,144,149,46,165,194,88,202,24,89,50,174,201,1,239,213,194,18,158,68,254,88,31,241,130,231,85,230,73,192,7,35,83,99,97,158,160,203,159,97,53,151,82,103,13,73,103,176,40,193,101,65,134,170,35,21,44,73,136,44,21,174,32,134,65,178,215,40,176,115,224,13,103,80,253,53,97,172,58,160,158,113,90,83,35,40,123,73,230,112,189,130,241,91,139,254,68,3,242,194,213,213,99,201,174,62,221,24,202,158,201,165,46,191,228,122,208,184,131,146,186,63,176,237,231,207,117,144,92,232,104,118,20,145,36,159,15,123,11,16,77,145,125,191,206,135,71,182,151,233,239,240,163,84,71,114,242,214,142,55,137,203,171,63,99,145,141,138,128,113,225,29,224}
 for i=1,#src do
  local a=src[(i)] local _junke0e=0 local b=((i*i*57+i*63+233)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  bb08cdc[i]=r
 end
end
local Kbeb1e9={}
do
 local rp=1
 while rp<=#bb08cdc do
  local np=bb08cdc[rp] + bb08cdc[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=bb08cdc[rp] + bb08cdc[rp+1]*256 rp=rp+2 end
  local va=(bb08cdc[rp]==1) rp=rp+1
  local nc=bb08cdc[rp] + bb08cdc[rp+1]*256 + bb08cdc[rp+2]*65536 + bb08cdc[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=bb08cdc[rp] + bb08cdc[rp+1]*256 + bb08cdc[rp+2]*65536 + bb08cdc[rp+3]*16777216
   rp=rp+4
  end
  Kbeb1e9[#Kbeb1e9+1]={c=cd,p=ps,v=va}
 end
end
local owfe44fd={}
local rg9825cd={} local fr5869d1={} local fp55ba95=0 local bad36d9d=0 local to12de28=0 local nb733349=0
local cu39206a=nil local dn37e2f2=false local rs5a1b1f={} local vfmf4f590={} local sch98ebf8 local ivk977efe
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rg9825cd st.fr=fr5869d1 st.fp=fp55ba95 st.ba=bad36d9d st.to=to12de28 st.cu=cu39206a st.co=w83f3e3 st.pc=iba419d st.sp=t39cb4f st.sc=yc9c21f st.lk=La9d8d8 st.va=a796ff0 st.nb=nb733349 st.dn=dn37e2f2 st.rs=rs5a1b1f end
local __vms_load_state=function(st) rg9825cd=st.rg or {} fr5869d1=st.fr or {} fp55ba95=st.fp or 0 bad36d9d=st.ba or 0 to12de28=st.to or 0 cu39206a=st.cu w83f3e3=st.co iba419d=st.pc or 1 t39cb4f=st.sp or 0 yc9c21f=st.sc or {{}} La9d8d8=st.lk or {} a796ff0=st.va nb733349=st.nb or 0 dn37e2f2=st.dn or false rs5a1b1f=st.rs or {} if fp55ba95>0 then local q=fr5869d1[fp55ba95] if not q or q.owner~=owfe44fd then error("VM_STATE_FRAME_OWNER",0) end if bad36d9d~=q.base or to12de28~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local se6f5d0=setmetatable({}, {__index=function(_,k) return rg9825cd[bad36d9d+k] end, __newindex=function(_,k,v) rg9825cd[bad36d9d+k]=v end})
local vfda57a2=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivk977efe(d,...) end vfmf4f590[f]=d return f end
local pf1f3855 local xf1de9a4 local sf283b3b local lf0f3ad5 local rt3d881d
local R7f1726
R7f1726=function(xc72ce0,La9d8d8,...)
 fr5869d1={} fp55ba95=0 nb733349=0 dn37e2f2=false rs5a1b1f={}
 __vms_root_state={}
 pf1f3855=function(ci,links,args,retDest,nRet,caller,meta)
  local code=Kbeb1e9[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nb733349,top=nb733349+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nb733349+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=owfe44fd}
  nb733349=nb733349+512
  fp55ba95=fp55ba95+1 fr5869d1[fp55ba95]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["meafd0590e9"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sf283b3b=function(f) if not f then return end f.pc=iba419d f.base=bad36d9d f.top=to12de28 f.sp=t39cb4f f.sc=yc9c21f f.lk=La9d8d8 f.va=a796ff0 f.sanext=cu39206a.sanext f.sasizes=cu39206a.sasizes end
 lf0f3ad5=function(f) cu39206a=f w83f3e3=Kbeb1e9[f.chunk] iba419d=f.pc bad36d9d=f.base to12de28=f.top t39cb4f=f.sp yc9c21f=f.sc La9d8d8=f.lk a796ff0=f.va end
 rt3d881d=function(n,packed)
  local f=fr5869d1[fp55ba95] local vals={}
  if packed then local p=se6f5d0[t39cb4f] local pn=(p and p.n) or 0 for i=1,n do vals[i]=se6f5d0[t39cb4f-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=se6f5d0[t39cb4f-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sf283b3b(f)
   for i=f.base,f.top do rg9825cd[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg9825cd[i]=nil end end
   fr5869d1[fp55ba95]=nil fp55ba95=fp55ba95-1
   lf0f3ad5(caller)
   local q={n=0} q["meafd0590e9"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   t39cb4f=meta.dest se6f5d0[t39cb4f]=q
   return
  end
  sf283b3b(f)
  rg9825cd[f.base]=rg9825cd[f.base]
  for i=f.base,f.top do rg9825cd[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg9825cd[i]=nil end end
  fr5869d1[fp55ba95]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rs5a1b1f=vals dn37e2f2=true return end
  fp55ba95=fp55ba95-1 local cf=fr5869d1[fp55ba95]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf0f3ad5(cf)
  local d=f.retDest or (t39cb4f+1)
  if f.nRet==0 then return end
  t39cb4f=d-1
  if f.nRet==1 then t39cb4f=d se6f5d0[t39cb4f]=vals[1] else local q={n=#vals} q["meafd0590e9"]=true for i=1,#vals do q[i]=vals[i] end t39cb4f=d se6f5d0[t39cb4f]=q end
 end
 pf1f3855(xc72ce0,La9d8d8,{...},nil,0,nil)
  local f=fr5869d1[fp55ba95]
  if not f then error("VM_FRAME_MISSING",0) end
  lf0f3ad5(f)
 local he8af46={}
 he8af46[55910]=function()
   local ci=w83f3e3.c[iba419d] iba419d=iba419d+1
   local links={}
   for i=1,#La9d8d8 do links[#links+1]=La9d8d8[i] end
   for i=1,#yc9c21f do links[#links+1]=yc9c21f[i] end
   t39cb4f=t39cb4f+1
   se6f5d0[t39cb4f]=vfda57a2(ci,links)
 end
 he8af46[43857]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a % b
 end
 he8af46[12373]=function()
 end
 he8af46[42928]=function()
   local id=w83f3e3.c[iba419d] local b=nil iba419d=iba419d+1
   for i=#yc9c21f,1,-1 do b=yc9c21f[i][id] if b then break end end
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=b and b[1]
 end
 he8af46[1543]=function()
   se6f5d0[t39cb4f]=se6f5d0[t39cb4f][2]
 end
 he8af46[49579]=function()
   if not se6f5d0[t39cb4f] then iba419d=w83f3e3.c[iba419d] else iba419d=iba419d+1 se6f5d0[t39cb4f]=nil t39cb4f=t39cb4f-1 end
 end
 he8af46[33461]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 he8af46[20914]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a < b
 end
 he8af46[16825]=function()
   se6f5d0[t39cb4f]=#se6f5d0[t39cb4f]
 end
 he8af46[17094]=function()
   local k=w83f3e3.c[iba419d] iba419d=iba419d+1
   rt3d881d(k,true)
 end
 he8af46[13831]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a ^ b
 end
 he8af46[15116]=function()
   se6f5d0[t39cb4f]=se6f5d0[t39cb4f][3]
 end
 he8af46[3027]=function()
   local n=w83f3e3.c[iba419d] iba419d=iba419d+1
   rt3d881d(n,false)
 end
 he8af46[42712]=function()
   local n=w83f3e3.c[iba419d] iba419d=iba419d+1
   local f=se6f5d0[t39cb4f-n]
   local a={}
   for j=1,n do a[j]=se6f5d0[t39cb4f-n+j] end
   t39cb4f=t39cb4f-n-1
   local la=n
   if la>0 and q1339f7(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfmf4f590[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu39206a local dest=t39cb4f+1
    sf283b3b(caller)
    local vc=vd or f pf1f3855(vc.chunk,vc.links,a,dest,-1,caller)
    lf0f3ad5(fr5869d1[fp55ba95])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf283b3b(cu39206a) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P26bfee(f(u45682b(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf0f3ad5(cu39206a) end
    t39cb4f=t39cb4f+1
    se6f5d0[t39cb4f]=r
   end
 end
 he8af46[23299]=function()
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=se6f5d0[t39cb4f-1]
 end
 he8af46[12758]=function()
   local p=se6f5d0[t39cb4f] t39cb4f=t39cb4f-1 local t=se6f5d0[t39cb4f] se6f5d0[t39cb4f]=nil t39cb4f=t39cb4f-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 he8af46[10630]=function()
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=dd8a21a(w83f3e3.c[iba419d]) iba419d=iba419d+1
 end
 he8af46[51308]=function()
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]={}
 end
 he8af46[29334]=function()
   yc9c21f[#yc9c21f]=nil
 end
 he8af46[54724]=function()
   yc9c21f[#yc9c21f+1]={}
 end
 he8af46[663]=function()
   gc47743[dd8a21a(w83f3e3.c[iba419d])]=se6f5d0[t39cb4f] t39cb4f=t39cb4f-1 iba419d=iba419d+1
 end
 he8af46[59950]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a + b
 end
 he8af46[34408]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a * b
 end
 he8af46[41626]=function()
   iba419d=w83f3e3.c[iba419d]
 end
 he8af46[9881]=function()
   local n=w83f3e3.c[iba419d] iba419d=iba419d+1
   local f=se6f5d0[t39cb4f-n] local a={} for j=1,n do a[j]=se6f5d0[t39cb4f-n+j] end t39cb4f=t39cb4f-n-1
   local la=n if la>0 and q1339f7(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfmf4f590[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cu39206a local base0=bad36d9d local top0=to12de28 local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rg9825cd[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rg9825cd[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=owfe44fd}
    local cc=Kbeb1e9[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["meafd0590e9"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    fr5869d1[fp55ba95]=nf lf0f3ad5(nf)
   else
    local r=P26bfee(f(u45682b(a,1,la))) t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=r rt3d881d(0,true)
   end
 end
 he8af46[6852]=function()
   local ix=w83f3e3.c[iba419d] iba419d=iba419d+1
   local n=ma9c196[ix] if not n then n=tonumber(dd8a21a(ix)) ma9c196[ix]=n end
   se6f5d0[t39cb4f]=se6f5d0[t39cb4f]+n
 end
 he8af46[14474]=function()
   local n=w83f3e3.c[iba419d] iba419d=iba419d+1
   local pt=se6f5d0[t39cb4f] se6f5d0[t39cb4f]=nil t39cb4f=t39cb4f-1
   for j=1,n do t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=pt[j] end
 end
 he8af46[39890]=function()
   local ix=w83f3e3.c[iba419d] iba419d=iba419d+1
   local n=ma9c196[ix]
   if not n then n=tonumber(dd8a21a(ix)) ma9c196[ix]=n end
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=n
 end
 he8af46[8348]=function()
   local id=w83f3e3.c[iba419d] local v=se6f5d0[t39cb4f] t39cb4f=t39cb4f-1 iba419d=iba419d+1
   local b=nil for i=#yc9c21f,1,-1 do b=yc9c21f[i][id] if b then break end end
   if b then b[1]=v end
 end
 he8af46[57122]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a + b
 end
 he8af46[44687]=function()
   local n=w83f3e3.c[iba419d] iba419d=iba419d+1
   local a={} for j=1,n do a[j]=se6f5d0[t39cb4f-n+j] end t39cb4f=t39cb4f-n-1
   local la=n if la>0 and q1339f7(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfmf4f590[f]
   if vd then
    local caller=cu39206a local dest=t39cb4f+1 sf283b3b(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf1f3855(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf0f3ad5(fr5869d1[fp55ba95])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],u45682b(a,3,la)) else ok,rr=pcall(f,u45682b(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["meafd0590e9"]=true q[1]=ok q[2]=rr t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=q
   end
 end
 he8af46[38698]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a / b
 end
 he8af46[24861]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a - b
 end
 he8af46[42897]=function()
   local n=w83f3e3.c[iba419d] iba419d=iba419d+1
   local f=se6f5d0[t39cb4f-n]
   local a={}
   for j=1,n do a[j]=se6f5d0[t39cb4f-n+j] end
   t39cb4f=t39cb4f-n-1
   local la=n
   if la>0 and q1339f7(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfmf4f590[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu39206a local dest=t39cb4f+1
    sf283b3b(caller)
    local vc=vd or f pf1f3855(vc.chunk,vc.links,a,dest,1,caller)
    lf0f3ad5(fr5869d1[fp55ba95])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf283b3b(cu39206a) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P26bfee(f(u45682b(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf0f3ad5(cu39206a) end
    t39cb4f=t39cb4f+1
    se6f5d0[t39cb4f]=r[1]
   end
 end
 he8af46[55615]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a ~= b
 end
 he8af46[21480]=function()
   se6f5d0[t39cb4f],se6f5d0[t39cb4f-1]=se6f5d0[t39cb4f-1],se6f5d0[t39cb4f]
 end
 he8af46[3636]=function()
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=true
 end
 he8af46[40689]=function()
   local id=w83f3e3.c[iba419d] local b=nil iba419d=iba419d+1
   for i=#La9d8d8,1,-1 do b=La9d8d8[i][id] if b then break end end
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=b and b[1]
 end
 he8af46[20119]=function()
   local k=se6f5d0[t39cb4f] t39cb4f=t39cb4f-1 local t=se6f5d0[t39cb4f] se6f5d0[t39cb4f]=t[k]
 end
 he8af46[51396]=function()
   se6f5d0[t39cb4f]=se6f5d0[t39cb4f][1]
 end
 he8af46[9128]=function()
   local _mode=w83f3e3.c[iba419d] iba419d=iba419d+1
   local v=se6f5d0[t39cb4f] local idx=se6f5d0[t39cb4f-1] local b=se6f5d0[t39cb4f-2] t39cb4f=t39cb4f-3
   local f=cu39206a local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rg9825cd[b+idx-1]=v
 end
 he8af46[45146]=function()
   local v=se6f5d0[t39cb4f] local k=se6f5d0[t39cb4f-1] local t=se6f5d0[t39cb4f-2] t[k]=v t39cb4f=t39cb4f-3
 end
 he8af46[37482]=function()
   if se6f5d0[t39cb4f] then iba419d=w83f3e3.c[iba419d] else iba419d=iba419d+1 se6f5d0[t39cb4f]=nil t39cb4f=t39cb4f-1 end
 end
 he8af46[44898]=function()
   local _v=se6f5d0[t39cb4f] se6f5d0[t39cb4f]=nil t39cb4f=t39cb4f-1 if not _v then iba419d=w83f3e3.c[iba419d] else iba419d=iba419d+1 end
 end
 he8af46[48134]=function()
   local id=w83f3e3.c[iba419d] local v=se6f5d0[t39cb4f] se6f5d0[t39cb4f]=nil t39cb4f=t39cb4f-1 iba419d=iba419d+1
   yc9c21f[#yc9c21f][id]={v}
 end
 he8af46[25310]=function()
   local _n=(se6f5d0[t39cb4f]==nil) se6f5d0[t39cb4f]=nil t39cb4f=t39cb4f-1 if _n then iba419d=w83f3e3.c[iba419d] else iba419d=iba419d+1 end
 end
 he8af46[27372]=function()
   local n=w83f3e3.c[iba419d] iba419d=iba419d+1
   local f=cu39206a local b=f.sanext or (bad36d9d+256) local lim=bad36d9d+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n to12de28=math.max(to12de28,bad36d9d+255)
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=b
 end
 he8af46[43953]=function()
   local ix=w83f3e3.c[iba419d] iba419d=iba419d+1
   local k=dd8a21a(ix) local v=hg8e181d[k] if v==nil then v=gc47743[k] hg8e181d[k]=v end
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=v
 end
 he8af46[33369]=function()
   se6f5d0[t39cb4f]=not se6f5d0[t39cb4f]
 end
 he8af46[15868]=function()
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=false
 end
 he8af46[58945]=function()
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=nil
 end
 he8af46[49036]=function()
   local id=w83f3e3.c[iba419d] local v=se6f5d0[t39cb4f] t39cb4f=t39cb4f-1 iba419d=iba419d+1
   local b=nil for i=#La9d8d8,1,-1 do b=La9d8d8[i][id] if b then break end end
   if b then b[1]=v end
 end
 he8af46[23149]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a > b
 end
 he8af46[2256]=function()
   se6f5d0[t39cb4f]=nil t39cb4f=t39cb4f-1
 end
 he8af46[24357]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a * b
 end
 he8af46[54516]=function()
   local k=se6f5d0[t39cb4f] t39cb4f=t39cb4f-1 local t=se6f5d0[t39cb4f] se6f5d0[t39cb4f]=t[k]
 end
 he8af46[10098]=function()
   se6f5d0[t39cb4f]=-se6f5d0[t39cb4f]
 end
 he8af46[27298]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a == b
 end
 he8af46[25387]=function()
   local n=w83f3e3.c[iba419d] iba419d=iba419d+1
   local a={} for j=1,n do a[j]=se6f5d0[t39cb4f-n+j] end t39cb4f=t39cb4f-n-1
   local la=n if la>0 and q1339f7(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfmf4f590[f]
   if vd then
    local caller=cu39206a local dest=t39cb4f+1 sf283b3b(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf1f3855(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf0f3ad5(fr5869d1[fp55ba95])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],u45682b(a,3,la)) else ok,rr=pcall(f,u45682b(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["meafd0590e9"]=true q[1]=ok q[2]=rr t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=q
   end
 end
 he8af46[26932]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a >= b
 end
 he8af46[44200]=function()
   local _v=se6f5d0[t39cb4f] se6f5d0[t39cb4f]=nil t39cb4f=t39cb4f-1 if _v then iba419d=w83f3e3.c[iba419d] else iba419d=iba419d+1 end
 end
 he8af46[17762]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a <= b
 end
 he8af46[28998]=function()
   local ix=w83f3e3.c[iba419d] iba419d=iba419d+1
   se6f5d0[t39cb4f]=se6f5d0[t39cb4f][ix]
 end
 he8af46[5536]=function()
   local b=se6f5d0[t39cb4f] local n=cu39206a.sasizes and cu39206a.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end se6f5d0[t39cb4f]=n
 end
 he8af46[50652]=function()
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=gc47743[dd8a21a(w83f3e3.c[iba419d])] iba419d=iba419d+1
 end
 he8af46[25933]=function()
   local b=se6f5d0[t39cb4f] local a=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-1
   se6f5d0[t39cb4f]=a .. b
 end
 he8af46[9116]=function()
   local ix=w83f3e3.c[iba419d] iba419d=iba419d+1
   local n=ma9c196[ix] if not n then n=tonumber(dd8a21a(ix)) ma9c196[ix]=n end
   se6f5d0[t39cb4f]=se6f5d0[t39cb4f]*n
 end
 he8af46[21833]=function()
   local _mode=w83f3e3.c[iba419d] iba419d=iba419d+1
   local idx=se6f5d0[t39cb4f] local b=se6f5d0[t39cb4f-1] t39cb4f=t39cb4f-2
   local f=cu39206a local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=nil else t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=rg9825cd[b+idx-1] end
 end
 he8af46[55325]=function()
   if not a796ff0 then local t={n=0} t["meafd0590e9"]=true a796ff0=t end
   t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=a796ff0
 end
 he8af46[63491]=function()
  local k=se6f5d0[t39cb4f] t39cb4f=t39cb4f-1 local t=se6f5d0[t39cb4f] se6f5d0[t39cb4f]=t[k]
 end
 he8af46[62953]=function()
  local t=se6f5d0[t39cb4f] se6f5d0[t39cb4f]=t
 end
 he8af46[61312]=function()
  t39cb4f=t39cb4f+1 se6f5d0[t39cb4f]=dd8a21a(w83f3e3.c[iba419d]) iba419d=iba419d+1
 end
 sch98ebf8=function(stop)
  while fp55ba95>stop and not dn37e2f2 do
   local f=fr5869d1[fp55ba95] if not f then error("VM_FRAME_MISSING",0) end
   lf0f3ad5(f)
   if fp55ba95<1 or fp55ba95>#fr5869d1 or fr5869d1[fp55ba95]~=cu39206a then error("VM_STATE_FP",0) end
   if cu39206a.owner~=owfe44fd then error("VM_STATE_FRAME_OWNER",0) end
   if w83f3e3~=Kbeb1e9[cu39206a.chunk] then error("VM_STATE_CODE",0) end
   if iba419d%1~=0 or iba419d<1 or iba419d>#w83f3e3.c then error("VM_STATE_PC",0) end
   if bad36d9d%1~=0 or to12de28%1~=0 or bad36d9d<0 or to12de28<bad36d9d or to12de28>bad36d9d+255 then error("VM_STATE_BOUNDS",0) end
   if t39cb4f%1~=0 or t39cb4f<0 or t39cb4f>to12de28-bad36d9d then error("VM_STATE_SP",0) end
   local o573035=w83f3e3.c[iba419d] iba419d=iba419d+1
   local _fn=he8af46[o573035]
   local _yieldop=(o573035==42897 or o573035==42712)
   local _ok,_err=true,nil
   if _yieldop and not (cu39206a and cu39206a.prot) then if _fn then _fn() else error("bad opcode "..tostring(o573035),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(o573035),0) end end) end
   if not _ok then
    local handled=false local ei=fp55ba95
    while ei>stop do
     local ef=fr5869d1[ei] local meta=ef and ef.prot
     if meta then
      for k=fp55ba95,ei+1,-1 do local z=fr5869d1[k] if z then for j=z.base,z.top do rg9825cd[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rg9825cd[j]=nil end end end fr5869d1[k]=nil end
      fp55ba95=ei lf0f3ad5(fr5869d1[fp55ba95])
      local bad=fr5869d1[fp55ba95] local caller=meta.caller fr5869d1[fp55ba95]=nil fp55ba95=fp55ba95-1
      for j=bad.base,bad.top do rg9825cd[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rg9825cd[j]=nil end end
      if meta.kind=="xpcall" then lf0f3ad5(caller) local hf=vfmf4f590[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf1f3855(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["meafd0590e9"]=true q[1]=false q[2]=hr t39cb4f=meta.dest se6f5d0[t39cb4f]=q end else lf0f3ad5(caller) local q={n=2} q["meafd0590e9"]=true q[1]=false q[2]=_err t39cb4f=meta.dest se6f5d0[t39cb4f]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dn37e2f2 then sf283b3b(cu39206a) end
  end
 end
 ivk977efe=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if fr5869d1==st.fr and fp55ba95>0 then __vms_save_state(st) end __vms_load_state(st)
   if fp55ba95==0 then
    pf1f3855(d.chunk,d.links,{...},nil,0,nil)
    sch98ebf8(0)
    local rr=rs5a1b1f or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return u45682b(rr)
   end
   local stop=fp55ba95 local caller=fr5869d1[fp55ba95] sf283b3b(caller)
   pf1f3855(d.chunk,d.links,{...},t39cb4f+1,0,caller)
   sch98ebf8(stop)
   local cf=fr5869d1[fp55ba95] lf0f3ad5(cf) local rr=cf.lastResult or {} cf.lastResult=nil return u45682b(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fp55ba95 local caller=fr5869d1[fp55ba95]
  sf283b3b(caller)
  pf1f3855(d.chunk,d.links,{...},0,0,caller)
  sch98ebf8(stop)
  local cf=fr5869d1[fp55ba95] lf0f3ad5(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return u45682b(rr)
 end
 sch98ebf8(0)
 return u45682b(rs5a1b1f)
end
do
 local ok,err=pcall(R7f1726,2,{})
 if not ok then error(err,0) end
end