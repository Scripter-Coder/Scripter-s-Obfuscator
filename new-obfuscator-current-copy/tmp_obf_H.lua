-- 3ce15a485a308f84 | DO NOT EDIT
local _d736ad1=function(a7d8df2,be010d9,...)
 while true do
  local _s322b={} local _t1fa1=0
  local _y9206={{}}
  local _id205=1
  local _w89a8=a7d8df2[be010d9]
  local o3a901d=_w89a8.c[_id205]
  if o3a901d==1 then _s322b[_t1fa1]="x" end
 end
end
local _b78dd={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _r79a8={{1,41}}
local d9a513b=function(i) local a=_b78dd[1] local rr=_r79a8[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b78dd2={214,17,239,131,189,168} do local rp=1 while rp<=#_b78dd2 do local np=_b78dd2[rp]+_b78dd2[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b78dd2[rp]+_b78dd2[rp+1]*256 rp=rp+2 end local va=(_b78dd2[rp]==1) rp=rp+1 local nc=_b78dd2[rp]+_b78dd2[rp+1]*256+_b78dd2[rp+2]*65536+_b78dd2[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b78dd2[rp]+_b78dd2[rp+1]*256+_b78dd2[rp+2]*65536+_b78dd2[rp+3]*16777216 rp=rp+4 end end end
end
local g79ffab=_G
if getfenv then local _le=getfenv(0) if _le then g79ffab=_le end end
local hg3dfb7d={}
if getgenv then g79ffab=getgenv() end
if not g79ffab then g79ffab=_G end
local v942a93={25,144,238,211,202,156,132,115,45,29,24,25,251,50,182,34,161,225,85,33,129,55,125,204,189,188,12,98,120,115,72,128,47,14,52,141,210,139,12,192,229,187,216,219,179,168,165,139,83,22,0,97,139,243,24,235,159,11,206,119,227,73,4,3,83,236,19,189,49,48,194,207,116,209,8,168,55,194,53,128,63,109,72,161,49,78,113,135,96,229,37,3,148,114,170,128,164,227,58,237,108,216,77,224,37,30,121,113,154,199,171,247,34,8,98,192,184,49,69,251,16,25,132,69,160,183,11,153,129,116,34,103,147,53,43,141,181,180,211,225,82,224,183,247,204}
local c7addd3={}
local rc7f314={{0,5},{5,5},{10,4},{14,5},{19,5},{24,4},{28,4},{32,5},{37,3},{40,52},{92,53}}
local m7228ae={}
local iv3a21e3=158
local da9e601=function(i)
 local c=c7addd3[i] if c then return c end
 local rr=rc7f314[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=iv3a21e3
 for j=1,ln do
  local p=st+j
  local a=v942a93[p] local b=(78*p+91+3623378013*1.0*((p*p)%7))%251+132
  local kb=(b + prev*15)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 c7addd3[i]=t return t
end
local ue9e8f5
if table.unpack then ue9e8f5=table.unpack else ue9e8f5=unpack end
if not ue9e8f5 then ue9e8f5=unpack end
local P3102b7=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m1ff95c40d0"]=true
 return t
end
local q8723dd=function(t) return type(t)=="table" and t["m1ff95c40d0"]==true end
local beeaed3={}
do
 local src={218,28,117,227,128,50,251,186,87,18,80,168,37,183,106,151,109,43,78,142,232,100,247,131,219,103,111,146,211,52,172,47,83,198,179,41,136,39,132,253,151,77,31,13,23,61,82,221,92,242,246,192,107,118,156,224,68,191,35,218,226,210,223,11,79,175,158,222,129,86,70,84,125,194,208,26,67,248,204,192,206,248,62,205,40,194,124,84,71,86,252,160,48,175,77,11,222,210,189,175,91,191,64,224,157,118,10,192,169,242,94,221,127,61,63,173,31,77,150,253,132,39,139,26,179,198,170,249,172,52,214,147,111,103,26,23,247,100,233,141,78,43,196,238,106,183,139,227,80,18,237,229,251,50,61,54,117,28,83,186,180,203,80,27,189,73,235,176,144,140,140,120,45,153,36,202,143,112,1,53,187,17,91,12,177,119,247,30,113,167,241,108,246,161,138,2,74,101,181,239,99,238,52,43,70,70,107,154,238,99,199,60,101,74,74,104,161,246,6,95,167,113,194,48,119,177,12,126,17,187,134,109,113,167,202,38,153,65,107,164,140,138,33,236,73,220,238,254,203,218,88,218,28,215,181,128,50,25,172,235,18,145,133,37,183,18,240,36,43,235,138,232,100,72,121,123,103,27,113,211,52,84,250,245,198,14,96,225,39,142,69,151,77,8,115,23,61,159,10,92,242,163,196,107,118,103,8,68,191,133,204,226,210,60,66,79,175,141,20,129,86,161,12,125,194,151,119,67,248,212,81,206,248,58,188,40,194,194,134,71,86,169,104,48,175,169,83,222,210,123,99,91,191,167,67,157,118,240,211,169,242,144,233,127,61,137,222,31,77,203,235,132,39,252,26,179,198,108,53,172,52,125,218,111,103,17,13,247,100,77,138,78,43,245,28,106,183,37,170,81,58,235,229,251,110,150,234,117,250,130,185,180,199,123,82,189,170,251,176,144,5,167,216,45,0,86,202,143,167,240,134,187,77,104,12,177,141,177,87,113,63,227,108,246,173,237,75,74,254,51,239,99,88,201,98,70,25,222,154,238,193,176,156,101,169,232,104,161,210,52,249,167,123,239,89,119,214,102,126,17,60,167,109,112,17,25,38,153,203,128,164,140,148,114,236,73,155,74,254,203,132,159,218,28,28,149,128,50,183,182,235,18,74,59,37,183,125,71,36,43,224,196,232,100,150,23,123,103,95,181,211,52,2,83,245,198,75,3,225,39,103,94,151,77,206,40,23,61,212,84,92,242,48,12,107,118,6,79,68,191,185,76,226,210,221,11,98,175,61,200,173,86,70,27,125,194,40,118,230,248,206,110,135,248,67,233,49,194,125,40,248,86,129,194,136,175,79,198,21,210,226,172,137,191,68,123,50,118,107,158,246,242,92,161,192,61,23,65,6,77,151,88,131,39,225,18,250,198,245,194,141,52,211,112,204,103,123,161,79,100,232,48,146,43,36,195,130,183,37,49,255,18,235,152,65,50,128,147,108,28,218,65,11,203,254,168,85,73,236,97,181,140,164,194,188,153,38,27,170,112,109,74,143,17,126,139,144,119,89,93,201,167,249,120,34,161,104,229,92,101,156,60,198,238,154,128,25,70,98,122,57,99,239,80,81,74,75,228,22,246,108,166,27,113,87,152,88,177,12,25,123,187,134,243,163,143,202,6,213,45,216,232,149,144,176,251,55,189,82,24,147,180,185,205,98,117,234,176,20,251,229,138,174,80,170,75,86,106,57,229,4,78,141,87,182,247,171,23,212,111,147,120,189,172,69,172,215,179,188,141,148,132,253,203,91,31,13,158,62,127,221,130,45,169,124,127,162,157,224,37,3,91,19,140,51,222,11,75,109,48,200,123,190,71,84,105,22,40,165,214,145,206,192,87,136,67,165,50,83,125,84,11,5,129,200,211,184,79,11,250,138,226,19,163,0,68,224,189,58,107,124,200,78,92,221,87,157,23,13,200,208,151,253,200,116,225,188,167,18,245,69,49,148,211,147,3,212,123,171,89,114,232,141,78,43,36,6,106,183,37,28,3,18,235,205,91,50,128,218,83,28,218,15,231,203,254,86,127,73,236,252,137,140,164,129,60,153,38,147,158,112,109,218,173,17,126,26,193,119,89,54,205,167,249,138,174,161,104,224,195,101,156,255,120,238,154,8,224,70,98,37,60,99,239,228,172,74,75,239,128,246,108,25,112,113,87,106,202,177,12,132,249,187,134,143,57,143,202,95,128,45,216,185,42,144,176,114,154,189,82,86,242,180,185,116,85,117,234,63,224,251,229,60,143,80,170,55,8,106,57,222,195,78,141,100,211,247,171,186,72,111,147,171,253,172,69,155,39,179,188,251,182,132,253,183,1,31,13,121,220,127,221,145,57,169,124,22,30,157,224,86,0,91,19,71,213,222,11,152,50,48,200,133,148,71,84,49,145,40,165,222,88,206,192,175,68,67,165,134,139,125,84,41,183,129,200,231,50,79,11,31,253,226,19,185,224,68,224,120,71,107,124,37,69,92,221,95,113,23,13,189,18,151,253,28,61,225,188,132,155,245,69,159,137,211,147,101,223,123,171,89,114,232,141,199,40,36,57,125,201,37,170}
 for i=1,#src do
  local a=src[(i)] local _junk025=0 local b=((i*i*14+i*19+181)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  beeaed3[i]=r
 end
end
local K9f92da={}
do
 local rp=1
 while rp<=#beeaed3 do
  local np=beeaed3[rp] + beeaed3[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=beeaed3[rp] + beeaed3[rp+1]*256 rp=rp+2 end
  local va=(beeaed3[rp]==1) rp=rp+1
  local nc=beeaed3[rp] + beeaed3[rp+1]*256 + beeaed3[rp+2]*65536 + beeaed3[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=beeaed3[rp] + beeaed3[rp+1]*256 + beeaed3[rp+2]*65536 + beeaed3[rp+3]*16777216
   rp=rp+4
  end
  K9f92da[#K9f92da+1]={c=cd,p=ps,v=va}
 end
end
local owf580ca={}
local rg934fc3={} local frd34005={} local fpc4ff9d=0 local ba307311=0 local to3c5412=0 local nb042024=0
local cud45c08=nil local dn7abb46=false local rs11441b={} local vfmd53759={} local sched366c local ivkf0b363
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rg934fc3 st.fr=frd34005 st.fp=fpc4ff9d st.ba=ba307311 st.to=to3c5412 st.cu=cud45c08 st.co=w546cc8 st.pc=ic34a87 st.sp=te48924 st.sc=y35d7c8 st.lk=Lcd1df3 st.va=ab033de st.nb=nb042024 st.dn=dn7abb46 st.rs=rs11441b end
local __vms_load_state=function(st) rg934fc3=st.rg or {} frd34005=st.fr or {} fpc4ff9d=st.fp or 0 ba307311=st.ba or 0 to3c5412=st.to or 0 cud45c08=st.cu w546cc8=st.co ic34a87=st.pc or 1 te48924=st.sp or 0 y35d7c8=st.sc or {{}} Lcd1df3=st.lk or {} ab033de=st.va nb042024=st.nb or 0 dn7abb46=st.dn or false rs11441b=st.rs or {} if fpc4ff9d>0 then local q=frd34005[fpc4ff9d] if not q or q.owner~=owf580ca then error("VM_STATE_FRAME_OWNER",0) end if ba307311~=q.base or to3c5412~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local s48b6ed=setmetatable({}, {__index=function(_,k) return rg934fc3[ba307311+k] end, __newindex=function(_,k,v) rg934fc3[ba307311+k]=v end})
local vf835d2f=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivkf0b363(d,...) end vfmd53759[f]=d return f end
local pf7073be local xfd83497 local sf098cdb local lf7cc4fa local rtf52757
local R0dc581
R0dc581=function(x4c20b4,Lcd1df3,...)
 frd34005={} fpc4ff9d=0 nb042024=0 dn7abb46=false rs11441b={}
 __vms_root_state={}
 pf7073be=function(ci,links,args,retDest,nRet,caller,meta)
  local code=K9f92da[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nb042024,top=nb042024+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nb042024+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=owf580ca}
  nb042024=nb042024+512
  fpc4ff9d=fpc4ff9d+1 frd34005[fpc4ff9d]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["m1ff95c40d0"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sf098cdb=function(f) if not f then return end f.pc=ic34a87 f.base=ba307311 f.top=to3c5412 f.sp=te48924 f.sc=y35d7c8 f.lk=Lcd1df3 f.va=ab033de f.sanext=cud45c08.sanext f.sasizes=cud45c08.sasizes end
 lf7cc4fa=function(f) cud45c08=f w546cc8=K9f92da[f.chunk] ic34a87=f.pc ba307311=f.base to3c5412=f.top te48924=f.sp y35d7c8=f.sc Lcd1df3=f.lk ab033de=f.va end
 rtf52757=function(n,packed)
  local f=frd34005[fpc4ff9d] local vals={}
  if packed then local p=s48b6ed[te48924] local pn=(p and p.n) or 0 for i=1,n do vals[i]=s48b6ed[te48924-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=s48b6ed[te48924-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sf098cdb(f)
   for i=f.base,f.top do rg934fc3[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg934fc3[i]=nil end end
   frd34005[fpc4ff9d]=nil fpc4ff9d=fpc4ff9d-1
   lf7cc4fa(caller)
   local q={n=0} q["m1ff95c40d0"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   te48924=meta.dest s48b6ed[te48924]=q
   return
  end
  sf098cdb(f)
  rg934fc3[f.base]=rg934fc3[f.base]
  for i=f.base,f.top do rg934fc3[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg934fc3[i]=nil end end
  frd34005[fpc4ff9d]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rs11441b=vals dn7abb46=true return end
  fpc4ff9d=fpc4ff9d-1 local cf=frd34005[fpc4ff9d]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf7cc4fa(cf)
  local d=f.retDest or (te48924+1)
  if f.nRet==0 then return end
  te48924=d-1
  if f.nRet==1 then te48924=d s48b6ed[te48924]=vals[1] else local q={n=#vals} q["m1ff95c40d0"]=true for i=1,#vals do q[i]=vals[i] end te48924=d s48b6ed[te48924]=q end
 end
 pf7073be(x4c20b4,Lcd1df3,{...},nil,0,nil)
  local f=frd34005[fpc4ff9d]
  if not f then error("VM_FRAME_MISSING",0) end
  lf7cc4fa(f)
 local h52d51c={}
 h52d51c[49144]=function()
   local n=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local pt=s48b6ed[te48924] s48b6ed[te48924]=nil te48924=te48924-1
   for j=1,n do te48924=te48924+1 s48b6ed[te48924]=pt[j] end
 end
 h52d51c[13516]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a == b
 end
 h52d51c[4441]=function()
   if not ab033de then local t={n=0} t["m1ff95c40d0"]=true ab033de=t end
   te48924=te48924+1 s48b6ed[te48924]=ab033de
 end
 h52d51c[41955]=function()
   local ix=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local n=m7228ae[ix] if not n then n=tonumber(da9e601(ix)) m7228ae[ix]=n end
   s48b6ed[te48924]=s48b6ed[te48924]*n
 end
 h52d51c[14760]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a - b
 end
 h52d51c[12773]=function()
   local n=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local f=s48b6ed[te48924-n] local a={} for j=1,n do a[j]=s48b6ed[te48924-n+j] end te48924=te48924-n-1
   local la=n if la>0 and q8723dd(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfmd53759[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cud45c08 local base0=ba307311 local top0=to3c5412 local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rg934fc3[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rg934fc3[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=owf580ca}
    local cc=K9f92da[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["m1ff95c40d0"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    frd34005[fpc4ff9d]=nf lf7cc4fa(nf)
   else
    local r=P3102b7(f(ue9e8f5(a,1,la))) te48924=te48924+1 s48b6ed[te48924]=r rtf52757(0,true)
   end
 end
 h52d51c[55264]=function()
   te48924=te48924+1 s48b6ed[te48924]=s48b6ed[te48924-1]
 end
 h52d51c[41117]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a .. b
 end
 h52d51c[9776]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a * b
 end
 h52d51c[51576]=function()
   local ci=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local links={}
   for i=1,#Lcd1df3 do links[#links+1]=Lcd1df3[i] end
   for i=1,#y35d7c8 do links[#links+1]=y35d7c8[i] end
   te48924=te48924+1
   s48b6ed[te48924]=vf835d2f(ci,links)
 end
 h52d51c[57710]=function()
   local n=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local a={} for j=1,n do a[j]=s48b6ed[te48924-n+j] end te48924=te48924-n-1
   local la=n if la>0 and q8723dd(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfmd53759[f]
   if vd then
    local caller=cud45c08 local dest=te48924+1 sf098cdb(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf7073be(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf7cc4fa(frd34005[fpc4ff9d])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],ue9e8f5(a,3,la)) else ok,rr=pcall(f,ue9e8f5(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["m1ff95c40d0"]=true q[1]=ok q[2]=rr te48924=te48924+1 s48b6ed[te48924]=q
   end
 end
 h52d51c[54174]=function()
   local k=s48b6ed[te48924] te48924=te48924-1 local t=s48b6ed[te48924] s48b6ed[te48924]=t[k]
 end
 h52d51c[48225]=function()
   local id=w546cc8.c[ic34a87] local b=nil ic34a87=ic34a87+1
   for i=#y35d7c8,1,-1 do b=y35d7c8[i][id] if b then break end end
   te48924=te48924+1 s48b6ed[te48924]=b and b[1]
 end
 h52d51c[6928]=function()
   te48924=te48924+1 s48b6ed[te48924]=nil
 end
 h52d51c[6182]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a > b
 end
 h52d51c[28694]=function()
   local n=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local f=s48b6ed[te48924-n]
   local a={}
   for j=1,n do a[j]=s48b6ed[te48924-n+j] end
   te48924=te48924-n-1
   local la=n
   if la>0 and q8723dd(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfmd53759[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cud45c08 local dest=te48924+1
    sf098cdb(caller)
    local vc=vd or f pf7073be(vc.chunk,vc.links,a,dest,-1,caller)
    lf7cc4fa(frd34005[fpc4ff9d])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf098cdb(cud45c08) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P3102b7(f(ue9e8f5(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf7cc4fa(cud45c08) end
    te48924=te48924+1
    s48b6ed[te48924]=r
   end
 end
 h52d51c[44955]=function()
   local v=s48b6ed[te48924] local k=s48b6ed[te48924-1] local t=s48b6ed[te48924-2] t[k]=v te48924=te48924-3
 end
 h52d51c[42602]=function()
   s48b6ed[te48924]=nil te48924=te48924-1
 end
 h52d51c[5806]=function()
   local n=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local a={} for j=1,n do a[j]=s48b6ed[te48924-n+j] end te48924=te48924-n-1
   local la=n if la>0 and q8723dd(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfmd53759[f]
   if vd then
    local caller=cud45c08 local dest=te48924+1 sf098cdb(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf7073be(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf7cc4fa(frd34005[fpc4ff9d])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],ue9e8f5(a,3,la)) else ok,rr=pcall(f,ue9e8f5(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["m1ff95c40d0"]=true q[1]=ok q[2]=rr te48924=te48924+1 s48b6ed[te48924]=q
   end
 end
 h52d51c[22758]=function()
   local n=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local f=cud45c08 local b=f.sanext or (ba307311+256) local lim=ba307311+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n to3c5412=math.max(to3c5412,ba307311+255)
   te48924=te48924+1 s48b6ed[te48924]=b
 end
 h52d51c[45932]=function()
   if not s48b6ed[te48924] then ic34a87=w546cc8.c[ic34a87] else ic34a87=ic34a87+1 s48b6ed[te48924]=nil te48924=te48924-1 end
 end
 h52d51c[34060]=function()
   local _v=s48b6ed[te48924] s48b6ed[te48924]=nil te48924=te48924-1 if not _v then ic34a87=w546cc8.c[ic34a87] else ic34a87=ic34a87+1 end
 end
 h52d51c[49020]=function()
   local p=s48b6ed[te48924] te48924=te48924-1 local t=s48b6ed[te48924] s48b6ed[te48924]=nil te48924=te48924-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 h52d51c[53951]=function()
   local _n=(s48b6ed[te48924]==nil) s48b6ed[te48924]=nil te48924=te48924-1 if _n then ic34a87=w546cc8.c[ic34a87] else ic34a87=ic34a87+1 end
 end
 h52d51c[6808]=function()
   ic34a87=w546cc8.c[ic34a87]
 end
 h52d51c[48435]=function()
   local k=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   rtf52757(k,true)
 end
 h52d51c[24546]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a ~= b
 end
 h52d51c[49668]=function()
   local _mode=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local v=s48b6ed[te48924] local idx=s48b6ed[te48924-1] local b=s48b6ed[te48924-2] te48924=te48924-3
   local f=cud45c08 local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rg934fc3[b+idx-1]=v
 end
 h52d51c[47741]=function()
   local _mode=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local idx=s48b6ed[te48924] local b=s48b6ed[te48924-1] te48924=te48924-2
   local f=cud45c08 local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then te48924=te48924+1 s48b6ed[te48924]=nil else te48924=te48924+1 s48b6ed[te48924]=rg934fc3[b+idx-1] end
 end
 h52d51c[27239]=function()
   local ix=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local k=da9e601(ix) local v=hg3dfb7d[k] if v==nil then v=g79ffab[k] hg3dfb7d[k]=v end
   te48924=te48924+1 s48b6ed[te48924]=v
 end
 h52d51c[59642]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a % b
 end
 h52d51c[24482]=function()
   s48b6ed[te48924]=s48b6ed[te48924][3]
 end
 h52d51c[5724]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a < b
 end
 h52d51c[10755]=function()
   y35d7c8[#y35d7c8]=nil
 end
 h52d51c[35243]=function()
   local ix=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local n=m7228ae[ix]
   if not n then n=tonumber(da9e601(ix)) m7228ae[ix]=n end
   te48924=te48924+1 s48b6ed[te48924]=n
 end
 h52d51c[37146]=function()
   local _v=s48b6ed[te48924] s48b6ed[te48924]=nil te48924=te48924-1 if _v then ic34a87=w546cc8.c[ic34a87] else ic34a87=ic34a87+1 end
 end
 h52d51c[6521]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a * b
 end
 h52d51c[18914]=function()
   if s48b6ed[te48924] then ic34a87=w546cc8.c[ic34a87] else ic34a87=ic34a87+1 s48b6ed[te48924]=nil te48924=te48924-1 end
 end
 h52d51c[47114]=function()
   local ix=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local n=m7228ae[ix] if not n then n=tonumber(da9e601(ix)) m7228ae[ix]=n end
   s48b6ed[te48924]=s48b6ed[te48924]+n
 end
 h52d51c[41000]=function()
   local n=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local f=s48b6ed[te48924-n]
   local a={}
   for j=1,n do a[j]=s48b6ed[te48924-n+j] end
   te48924=te48924-n-1
   local la=n
   if la>0 and q8723dd(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfmd53759[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cud45c08 local dest=te48924+1
    sf098cdb(caller)
    local vc=vd or f pf7073be(vc.chunk,vc.links,a,dest,1,caller)
    lf7cc4fa(frd34005[fpc4ff9d])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf098cdb(cud45c08) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P3102b7(f(ue9e8f5(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf7cc4fa(cud45c08) end
    te48924=te48924+1
    s48b6ed[te48924]=r[1]
   end
 end
 h52d51c[18862]=function()
   te48924=te48924+1 s48b6ed[te48924]=da9e601(w546cc8.c[ic34a87]) ic34a87=ic34a87+1
 end
 h52d51c[52173]=function()
   s48b6ed[te48924]=s48b6ed[te48924][2]
 end
 h52d51c[28825]=function()
   g79ffab[da9e601(w546cc8.c[ic34a87])]=s48b6ed[te48924] te48924=te48924-1 ic34a87=ic34a87+1
 end
 h52d51c[9681]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a ^ b
 end
 h52d51c[26749]=function()
   local id=w546cc8.c[ic34a87] local v=s48b6ed[te48924] s48b6ed[te48924]=nil te48924=te48924-1 ic34a87=ic34a87+1
   y35d7c8[#y35d7c8][id]={v}
 end
 h52d51c[1957]=function()
   y35d7c8[#y35d7c8+1]={}
 end
 h52d51c[42525]=function()
   local id=w546cc8.c[ic34a87] local v=s48b6ed[te48924] te48924=te48924-1 ic34a87=ic34a87+1
   local b=nil for i=#Lcd1df3,1,-1 do b=Lcd1df3[i][id] if b then break end end
   if b then b[1]=v end
 end
 h52d51c[54292]=function()
   s48b6ed[te48924]=#s48b6ed[te48924]
 end
 h52d51c[42451]=function()
   local id=w546cc8.c[ic34a87] local v=s48b6ed[te48924] te48924=te48924-1 ic34a87=ic34a87+1
   local b=nil for i=#y35d7c8,1,-1 do b=y35d7c8[i][id] if b then break end end
   if b then b[1]=v end
 end
 h52d51c[22564]=function()
   local ix=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   s48b6ed[te48924]=s48b6ed[te48924][ix]
 end
 h52d51c[19488]=function()
   te48924=te48924+1 s48b6ed[te48924]=true
 end
 h52d51c[46988]=function()
   s48b6ed[te48924]=not s48b6ed[te48924]
 end
 h52d51c[21324]=function()
   te48924=te48924+1 s48b6ed[te48924]=false
 end
 h52d51c[48223]=function()
   te48924=te48924+1 s48b6ed[te48924]=g79ffab[da9e601(w546cc8.c[ic34a87])] ic34a87=ic34a87+1
 end
 h52d51c[48914]=function()
 end
 h52d51c[6476]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 h52d51c[6115]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a / b
 end
 h52d51c[12225]=function()
   te48924=te48924+1 s48b6ed[te48924]={}
 end
 h52d51c[57310]=function()
   s48b6ed[te48924]=-s48b6ed[te48924]
 end
 h52d51c[27029]=function()
   local n=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   rtf52757(n,false)
 end
 h52d51c[57972]=function()
   s48b6ed[te48924]=s48b6ed[te48924][1]
 end
 h52d51c[56509]=function()
   local k=s48b6ed[te48924] te48924=te48924-1 local t=s48b6ed[te48924] s48b6ed[te48924]=t[k]
 end
 h52d51c[8583]=function()
   local b=s48b6ed[te48924] local n=cud45c08.sasizes and cud45c08.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end s48b6ed[te48924]=n
 end
 h52d51c[21430]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a + b
 end
 h52d51c[905]=function()
   s48b6ed[te48924],s48b6ed[te48924-1]=s48b6ed[te48924-1],s48b6ed[te48924]
 end
 h52d51c[40407]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a <= b
 end
 h52d51c[32617]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a + b
 end
 h52d51c[23863]=function()
   local id=w546cc8.c[ic34a87] local b=nil ic34a87=ic34a87+1
   for i=#Lcd1df3,1,-1 do b=Lcd1df3[i][id] if b then break end end
   te48924=te48924+1 s48b6ed[te48924]=b and b[1]
 end
 h52d51c[32279]=function()
   local b=s48b6ed[te48924] local a=s48b6ed[te48924-1] te48924=te48924-1
   s48b6ed[te48924]=a >= b
 end
 h52d51c[63415]=function()
  local k=s48b6ed[te48924] te48924=te48924-1 local t=s48b6ed[te48924] s48b6ed[te48924]=t[k]
 end
 h52d51c[63167]=function()
  te48924=te48924+1 s48b6ed[te48924]=da9e601(w546cc8.c[ic34a87]) ic34a87=ic34a87+1
 end
 h52d51c[64805]=function()
  te48924=te48924+1 s48b6ed[te48924]=da9e601(w546cc8.c[ic34a87]) ic34a87=ic34a87+1
 end
 h52d51c[60193]=function()
  ic34a87=w546cc8.c[ic34a87]
 end
 h52d51c[64507]=function()
  te48924=te48924+1 s48b6ed[te48924]=da9e601(w546cc8.c[ic34a87]) ic34a87=ic34a87+1
 end
 h52d51c[60003]=function()
  local k=s48b6ed[te48924] te48924=te48924-1 local t=s48b6ed[te48924] s48b6ed[te48924]=t[k]
 end
 h52d51c[61453]=function()
  ic34a87=w546cc8.c[ic34a87]
 end
 sched366c=function(stop)
  while fpc4ff9d>stop and not dn7abb46 do
   local f=frd34005[fpc4ff9d] if not f then error("VM_FRAME_MISSING",0) end
   lf7cc4fa(f)
   if fpc4ff9d<1 or fpc4ff9d>#frd34005 or frd34005[fpc4ff9d]~=cud45c08 then error("VM_STATE_FP",0) end
   if cud45c08.owner~=owf580ca then error("VM_STATE_FRAME_OWNER",0) end
   if w546cc8~=K9f92da[cud45c08.chunk] then error("VM_STATE_CODE",0) end
   if ic34a87%1~=0 or ic34a87<1 or ic34a87>#w546cc8.c then error("VM_STATE_PC",0) end
   if ba307311%1~=0 or to3c5412%1~=0 or ba307311<0 or to3c5412<ba307311 or to3c5412>ba307311+255 then error("VM_STATE_BOUNDS",0) end
   if te48924%1~=0 or te48924<0 or te48924>to3c5412-ba307311 then error("VM_STATE_SP",0) end
   local o8ebb67=w546cc8.c[ic34a87] ic34a87=ic34a87+1
   local _fn=h52d51c[o8ebb67]
   local _yieldop=(o8ebb67==41000 or o8ebb67==28694)
   local _ok,_err=true,nil
   if _yieldop and not (cud45c08 and cud45c08.prot) then if _fn then _fn() else error("bad opcode "..tostring(o8ebb67),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(o8ebb67),0) end end) end
   if not _ok then
    local handled=false local ei=fpc4ff9d
    while ei>stop do
     local ef=frd34005[ei] local meta=ef and ef.prot
     if meta then
      for k=fpc4ff9d,ei+1,-1 do local z=frd34005[k] if z then for j=z.base,z.top do rg934fc3[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rg934fc3[j]=nil end end end frd34005[k]=nil end
      fpc4ff9d=ei lf7cc4fa(frd34005[fpc4ff9d])
      local bad=frd34005[fpc4ff9d] local caller=meta.caller frd34005[fpc4ff9d]=nil fpc4ff9d=fpc4ff9d-1
      for j=bad.base,bad.top do rg934fc3[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rg934fc3[j]=nil end end
      if meta.kind=="xpcall" then lf7cc4fa(caller) local hf=vfmd53759[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf7073be(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["m1ff95c40d0"]=true q[1]=false q[2]=hr te48924=meta.dest s48b6ed[te48924]=q end else lf7cc4fa(caller) local q={n=2} q["m1ff95c40d0"]=true q[1]=false q[2]=_err te48924=meta.dest s48b6ed[te48924]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dn7abb46 then sf098cdb(cud45c08) end
  end
 end
 ivkf0b363=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if frd34005==st.fr and fpc4ff9d>0 then __vms_save_state(st) end __vms_load_state(st)
   if fpc4ff9d==0 then
    pf7073be(d.chunk,d.links,{...},nil,0,nil)
    sched366c(0)
    local rr=rs11441b or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return ue9e8f5(rr)
   end
   local stop=fpc4ff9d local caller=frd34005[fpc4ff9d] sf098cdb(caller)
   pf7073be(d.chunk,d.links,{...},te48924+1,0,caller)
   sched366c(stop)
   local cf=frd34005[fpc4ff9d] lf7cc4fa(cf) local rr=cf.lastResult or {} cf.lastResult=nil return ue9e8f5(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fpc4ff9d local caller=frd34005[fpc4ff9d]
  sf098cdb(caller)
  pf7073be(d.chunk,d.links,{...},0,0,caller)
  sched366c(stop)
  local cf=frd34005[fpc4ff9d] lf7cc4fa(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return ue9e8f5(rr)
 end
 sched366c(0)
 return ue9e8f5(rs11441b)
end
do
 local ok,err=pcall(R0dc581,2,{})
 if not ok then error(err,0) end
end