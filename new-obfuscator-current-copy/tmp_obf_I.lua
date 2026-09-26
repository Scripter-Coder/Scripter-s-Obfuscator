-- 70f3ccd40f241b45 | DO NOT EDIT
local _d812a27=function(a490210,bdd0789,...)
 while true do
  local _s7710={} local _t04ea=0
  local _y2a0d={{}}
  local _i9c3f=1
  local _w4f83=a490210[bdd0789]
  local of5cf54=_w4f83.c[_i9c3f]
  if of5cf54==1 then _s7710[_t04ea]="x" end
 end
end
local _b084d={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _rdd57={{1,41}}
local d612f04=function(i) local a=_b084d[1] local rr=_rdd57[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b084d2={214,17,239,131,189,168} do local rp=1 while rp<=#_b084d2 do local np=_b084d2[rp]+_b084d2[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b084d2[rp]+_b084d2[rp+1]*256 rp=rp+2 end local va=(_b084d2[rp]==1) rp=rp+1 local nc=_b084d2[rp]+_b084d2[rp+1]*256+_b084d2[rp+2]*65536+_b084d2[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b084d2[rp]+_b084d2[rp+1]*256+_b084d2[rp+2]*65536+_b084d2[rp+3]*16777216 rp=rp+4 end end end
end
local g6ae264=_G
if getfenv then local _le=getfenv(0) if _le then g6ae264=_le end end
local hg975ae9={}
if getgenv then g6ae264=getgenv() end
if not g6ae264 then g6ae264=_G end
local v7fd52a={98,7,237,16,123,84,242,168,94,127,173,95,200,239,252,154,211,61,188,115,195,250,113,142,9,4,237,205,219,189,127,32,176,122,114,147,89,139,44,193,200,227,137,11,70,37,231,147,118,162,53,65,138,15,147,90,148,168,38,113,235,170,222,45,92,213,6,88,190,197,51,180,188,111,16,72,159,98,167,229,11,198,119,87,143,31,61,152,242,14,152,80,255,35,236,237,6,238,69,183,61,151,177,221,22,0,83,84,107,90,139,39,210,244,250,215,9,225,31,39,156,77,166,151,242,157,206,194,187,10,87,215,175,50,138,33,40,85,221,239,124,70,45,162}
local ca0de87={}
local r894adf={{0,9},{9,6},{15,9},{24,5},{29,1},{30,1},{31,9},{40,6},{46,5},{51,9},{60,6},{66,5},{71,39},{110,34}}
local m203475={}
local iv821f89=50
local d3c6e4c=function(i)
 local c=ca0de87[i] if c then return c end
 local rr=r894adf[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=iv821f89
 for j=1,ln do
  local p=st+j
  local a=v7fd52a[p] local b=(36*p+80+3568242507*1.0*((p*p)%12))%251+62
  local kb=(b + prev*65)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 ca0de87[i]=t return t
end
local u68d3d1
if table.unpack then u68d3d1=table.unpack else u68d3d1=unpack end
if not u68d3d1 then u68d3d1=unpack end
local P0be750=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["md280dd42d2"]=true
 return t
end
local qdb130a=function(t) return type(t)=="table" and t["md280dd42d2"]==true end
local bfa5370={}
do
 local src={45,95,159,253,78,184,53,174,127,246,171,109,63,30,11,188,188,38,75,122,191,19,112,41,159,224,122,138,195,151,105,76,55,51,61,20,112,175,241,71,164,21,143,28,46,91,18,122,181,134,117,116,125,150,189,118,187,139,234,93,215,101,252,34,223,36,243,213,197,195,207,233,22,76,173,226,71,181,35,235,93,8,189,131,88,59,150,152,56,83,126,179,248,80,67,227,162,50,234,73,49,244,203,174,160,160,239,193,244,49,118,203,50,162,79,36,80,248,178,124,83,56,62,7,59,88,132,188,8,93,122,133,181,71,234,144,76,22,27,9,195,197,74,128,36,94,167,252,101,215,125,87,139,58,243,189,150,125,3,236,134,165,208,18,91,178,118,26,21,164,68,241,175,123,63,168,51,55,74,105,151,211,55,81,224,89,210,112,19,191,225,56,38,15,5,11,30,63,241,216,246,84,185,53,184,78,172,148,95,45,11,238,230,236,5,187,87,149,244,107,168,35,173,62,222,145,232,146,249,228,214,228,249,33,160,87,222,62,56,80,168,64,224,149,87,39,36,81,230,238,8,45,95,159,156,215,184,53,185,84,246,171,4,170,30,11,2,15,38,75,20,42,19,112,222,89,224,122,55,248,151,105,69,55,51,61,202,8,175,241,67,164,21,143,131,193,91,18,214,165,134,117,51,118,150,189,240,58,139,234,92,75,101,252,34,223,36,243,213,197,195,207,233,22,76,216,226,71,181,216,31,93,8,34,135,88,59,249,94,56,83,75,166,248,80,228,184,162,50,55,50,49,244,48,212,160,160,52,88,244,49,45,14,50,162,192,52,80,248,112,51,83,56,50,166,59,88,46,32,8,93,162,190,181,71,90,150,76,22,245,90,195,197,198,168,36,94,135,65,101,215,148,97,139,58,78,85,150,125,1,180,134,165,149,47,91,178,166,65,21,164,238,225,175,123,46,33,51,55,73,245,151,211,188,169,224,89,250,78,19,191,30,132,38,15,156,153,30,63,46,18,246,84,37,230,184,78,115,155,95,45,116,105,230,236,22,137,87,149,123,210,168,35,91,123,222,145,174,100,249,228,252,218,249,33,68,48,222,62,31,37,168,64,156,18,87,39,16,199,230,238,64,180,95,159,69,94,184,53,173,245,246,171,129,103,30,11,227,152,38,75,196,113,19,112,114,135,224,122,231,105,151,105,172,178,51,61,237,125,175,241,44,49,21,143,191,184,91,18,193,254,134,117,100,220,150,189,137,38,139,234,207,148,101,252,134,186,36,243,193,207,195,207,250,184,76,144,159,192,181,54,245,192,8,188,248,68,59,44,202,253,83,124,165,89,80,177,250,33,50,203,218,173,244,202,79,101,160,174,190,98,49,119,145,247,162,37,176,80,188,179,124,114,56,43,44,135,176,131,188,154,106,192,54,161,77,226,144,251,180,233,207,163,10,213,243,68,145,166,252,166,152,92,234,55,210,242,189,62,109,114,117,37,175,210,18,242,108,28,143,13,187,70,241,142,198,85,61,78,176,73,105,121,12,34,122,147,152,219,112,137,45,126,75,184,220,6,11,241,103,110,171,77,52,187,53,197,124,237,159,156,98,9,238,255,102,5,39,205,7,225,64,187,120,167,62,132,84,82,33,11,34,221,228,147,180,82,145,119,224,167,35,177,202,225,149,250,187,5,236,250,123,9,45,75,149,237,78,184,53,187,19,246,171,110,85,139,11,6,48,60,75,126,67,86,112,219,214,100,122,34,12,113,105,73,87,252,61,85,137,105,241,70,74,202,143,28,243,80,18,210,199,14,117,114,212,72,189,242,153,129,234,92,170,226,252,166,71,174,243,213,229,39,207,233,15,198,144,226,152,83,54,192,98,18,188,131,65,177,44,43,253,237,124,179,173,205,177,37,247,175,203,119,37,254,202,174,69,55,174,202,17,166,119,203,18,70,37,177,234,75,179,124,232,88,43,44,122,83,131,188,123,156,192,54,14,39,226,144,153,99,233,207,80,134,213,243,147,252,166,252,139,8,92,234,67,177,242,189,227,215,114,117,167,155,210,18,122,140,28,143,208,26,70,241,106,193,85,61,155,39,73,105,125,83,34,122,115,26,219,112,5,30,126,75,91,61,6,11,101,35,110,171,139,211,187,53,42,121,237,159,70,167,9,238,78,252,5,39,250,9,225,64,54,39,167,62,153,172,82,33,99,118,221,228,125,160,82,145,101,94,167,35,20,168,225,149,78,173,5,236,79,48,9,45,43,9,237,78,237,168,187,84,139,153,110,63,193,237,6,15,181,8,126,191,176,122,219,89,243,33,34,211,130,66,73,55,137,142,85,123,142,76,70,164,102,78,28,178}
 for i=1,#src do
  local a=src[(i)] local _junkabb=0 local b=((i*i*7+i*29+256)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  bfa5370[i]=r
 end
end
local K1294f9={}
do
 local rp=1
 while rp<=#bfa5370 do
  local np=bfa5370[rp] + bfa5370[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=bfa5370[rp] + bfa5370[rp+1]*256 rp=rp+2 end
  local va=(bfa5370[rp]==1) rp=rp+1
  local nc=bfa5370[rp] + bfa5370[rp+1]*256 + bfa5370[rp+2]*65536 + bfa5370[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=bfa5370[rp] + bfa5370[rp+1]*256 + bfa5370[rp+2]*65536 + bfa5370[rp+3]*16777216
   rp=rp+4
  end
  K1294f9[#K1294f9+1]={c=cd,p=ps,v=va}
 end
end
local ow4bd525={}
local rg96e958={} local fra6c42a={} local fp8841a5=0 local ba52fefa=0 local tod37447=0 local nba814a7=0
local cu7f2d1a=nil local dn8f9ff3=false local rs796bab={} local vfm4c5905={} local sch027d60 local ivk35c7cd
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rg96e958 st.fr=fra6c42a st.fp=fp8841a5 st.ba=ba52fefa st.to=tod37447 st.cu=cu7f2d1a st.co=wb6f7ae st.pc=i36ce47 st.sp=t44a8c3 st.sc=yf5a543 st.lk=L09857f st.va=a6966a9 st.nb=nba814a7 st.dn=dn8f9ff3 st.rs=rs796bab end
local __vms_load_state=function(st) rg96e958=st.rg or {} fra6c42a=st.fr or {} fp8841a5=st.fp or 0 ba52fefa=st.ba or 0 tod37447=st.to or 0 cu7f2d1a=st.cu wb6f7ae=st.co i36ce47=st.pc or 1 t44a8c3=st.sp or 0 yf5a543=st.sc or {{}} L09857f=st.lk or {} a6966a9=st.va nba814a7=st.nb or 0 dn8f9ff3=st.dn or false rs796bab=st.rs or {} if fp8841a5>0 then local q=fra6c42a[fp8841a5] if not q or q.owner~=ow4bd525 then error("VM_STATE_FRAME_OWNER",0) end if ba52fefa~=q.base or tod37447~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local sc0b453=setmetatable({}, {__index=function(_,k) return rg96e958[ba52fefa+k] end, __newindex=function(_,k,v) rg96e958[ba52fefa+k]=v end})
local vf86d31a=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivk35c7cd(d,...) end vfm4c5905[f]=d return f end
local pf179e10 local xf2108e7 local sfffff3e local lf87454e local rtbd9b19
local R6e9f4c
R6e9f4c=function(xd5b73c,L09857f,...)
 fra6c42a={} fp8841a5=0 nba814a7=0 dn8f9ff3=false rs796bab={}
 __vms_root_state={}
 pf179e10=function(ci,links,args,retDest,nRet,caller,meta)
  local code=K1294f9[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nba814a7,top=nba814a7+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nba814a7+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=ow4bd525}
  nba814a7=nba814a7+512
  fp8841a5=fp8841a5+1 fra6c42a[fp8841a5]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["md280dd42d2"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sfffff3e=function(f) if not f then return end f.pc=i36ce47 f.base=ba52fefa f.top=tod37447 f.sp=t44a8c3 f.sc=yf5a543 f.lk=L09857f f.va=a6966a9 f.sanext=cu7f2d1a.sanext f.sasizes=cu7f2d1a.sasizes end
 lf87454e=function(f) cu7f2d1a=f wb6f7ae=K1294f9[f.chunk] i36ce47=f.pc ba52fefa=f.base tod37447=f.top t44a8c3=f.sp yf5a543=f.sc L09857f=f.lk a6966a9=f.va end
 rtbd9b19=function(n,packed)
  local f=fra6c42a[fp8841a5] local vals={}
  if packed then local p=sc0b453[t44a8c3] local pn=(p and p.n) or 0 for i=1,n do vals[i]=sc0b453[t44a8c3-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=sc0b453[t44a8c3-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sfffff3e(f)
   for i=f.base,f.top do rg96e958[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg96e958[i]=nil end end
   fra6c42a[fp8841a5]=nil fp8841a5=fp8841a5-1
   lf87454e(caller)
   local q={n=0} q["md280dd42d2"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   t44a8c3=meta.dest sc0b453[t44a8c3]=q
   return
  end
  sfffff3e(f)
  rg96e958[f.base]=rg96e958[f.base]
  for i=f.base,f.top do rg96e958[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg96e958[i]=nil end end
  fra6c42a[fp8841a5]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rs796bab=vals dn8f9ff3=true return end
  fp8841a5=fp8841a5-1 local cf=fra6c42a[fp8841a5]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf87454e(cf)
  local d=f.retDest or (t44a8c3+1)
  if f.nRet==0 then return end
  t44a8c3=d-1
  if f.nRet==1 then t44a8c3=d sc0b453[t44a8c3]=vals[1] else local q={n=#vals} q["md280dd42d2"]=true for i=1,#vals do q[i]=vals[i] end t44a8c3=d sc0b453[t44a8c3]=q end
 end
 pf179e10(xd5b73c,L09857f,{...},nil,0,nil)
  local f=fra6c42a[fp8841a5]
  if not f then error("VM_FRAME_MISSING",0) end
  lf87454e(f)
 local h873237={}
 h873237[58400]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a <= b
 end
 h873237[5431]=function()
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=nil
 end
 h873237[2580]=function()
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=sc0b453[t44a8c3-1]
 end
 h873237[14226]=function()
   local ix=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local n=m203475[ix] if not n then n=tonumber(d3c6e4c(ix)) m203475[ix]=n end
   sc0b453[t44a8c3]=sc0b453[t44a8c3]+n
 end
 h873237[12925]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a .. b
 end
 h873237[54174]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a ~= b
 end
 h873237[17916]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a + b
 end
 h873237[48417]=function()
   local n=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local f=sc0b453[t44a8c3-n]
   local a={}
   for j=1,n do a[j]=sc0b453[t44a8c3-n+j] end
   t44a8c3=t44a8c3-n-1
   local la=n
   if la>0 and qdb130a(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm4c5905[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu7f2d1a local dest=t44a8c3+1
    sfffff3e(caller)
    local vc=vd or f pf179e10(vc.chunk,vc.links,a,dest,-1,caller)
    lf87454e(fra6c42a[fp8841a5])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sfffff3e(cu7f2d1a) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P0be750(f(u68d3d1(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf87454e(cu7f2d1a) end
    t44a8c3=t44a8c3+1
    sc0b453[t44a8c3]=r
   end
 end
 h873237[50930]=function()
   local k=sc0b453[t44a8c3] t44a8c3=t44a8c3-1 local t=sc0b453[t44a8c3] sc0b453[t44a8c3]=t[k]
 end
 h873237[34277]=function()
   local _v=sc0b453[t44a8c3] sc0b453[t44a8c3]=nil t44a8c3=t44a8c3-1 if _v then i36ce47=wb6f7ae.c[i36ce47] else i36ce47=i36ce47+1 end
 end
 h873237[14507]=function()
   local n=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local f=sc0b453[t44a8c3-n] local a={} for j=1,n do a[j]=sc0b453[t44a8c3-n+j] end t44a8c3=t44a8c3-n-1
   local la=n if la>0 and qdb130a(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfm4c5905[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cu7f2d1a local base0=ba52fefa local top0=tod37447 local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rg96e958[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rg96e958[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=ow4bd525}
    local cc=K1294f9[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["md280dd42d2"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    fra6c42a[fp8841a5]=nf lf87454e(nf)
   else
    local r=P0be750(f(u68d3d1(a,1,la))) t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=r rtbd9b19(0,true)
   end
 end
 h873237[48837]=function()
 end
 h873237[39936]=function()
   sc0b453[t44a8c3]=nil t44a8c3=t44a8c3-1
 end
 h873237[44563]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a + b
 end
 h873237[38172]=function()
   g6ae264[d3c6e4c(wb6f7ae.c[i36ce47])]=sc0b453[t44a8c3] t44a8c3=t44a8c3-1 i36ce47=i36ce47+1
 end
 h873237[23315]=function()
   yf5a543[#yf5a543+1]={}
 end
 h873237[34914]=function()
   local k=sc0b453[t44a8c3] t44a8c3=t44a8c3-1 local t=sc0b453[t44a8c3] sc0b453[t44a8c3]=t[k]
 end
 h873237[53088]=function()
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]={}
 end
 h873237[38250]=function()
   local id=wb6f7ae.c[i36ce47] local v=sc0b453[t44a8c3] sc0b453[t44a8c3]=nil t44a8c3=t44a8c3-1 i36ce47=i36ce47+1
   yf5a543[#yf5a543][id]={v}
 end
 h873237[46010]=function()
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=d3c6e4c(wb6f7ae.c[i36ce47]) i36ce47=i36ce47+1
 end
 h873237[40277]=function()
   sc0b453[t44a8c3]=sc0b453[t44a8c3][2]
 end
 h873237[38885]=function()
   sc0b453[t44a8c3]=-sc0b453[t44a8c3]
 end
 h873237[35784]=function()
   local id=wb6f7ae.c[i36ce47] local b=nil i36ce47=i36ce47+1
   for i=#L09857f,1,-1 do b=L09857f[i][id] if b then break end end
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=b and b[1]
 end
 h873237[50522]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a - b
 end
 h873237[47424]=function()
   local n=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local a={} for j=1,n do a[j]=sc0b453[t44a8c3-n+j] end t44a8c3=t44a8c3-n-1
   local la=n if la>0 and qdb130a(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm4c5905[f]
   if vd then
    local caller=cu7f2d1a local dest=t44a8c3+1 sfffff3e(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf179e10(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf87454e(fra6c42a[fp8841a5])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],u68d3d1(a,3,la)) else ok,rr=pcall(f,u68d3d1(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["md280dd42d2"]=true q[1]=ok q[2]=rr t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=q
   end
 end
 h873237[33759]=function()
   if not a6966a9 then local t={n=0} t["md280dd42d2"]=true a6966a9=t end
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=a6966a9
 end
 h873237[59580]=function()
   local n=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local f=cu7f2d1a local b=f.sanext or (ba52fefa+256) local lim=ba52fefa+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n tod37447=math.max(tod37447,ba52fefa+255)
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=b
 end
 h873237[57326]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a == b
 end
 h873237[52922]=function()
   local b=sc0b453[t44a8c3] local n=cu7f2d1a.sasizes and cu7f2d1a.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end sc0b453[t44a8c3]=n
 end
 h873237[24763]=function()
   sc0b453[t44a8c3]=sc0b453[t44a8c3][1]
 end
 h873237[59912]=function()
   sc0b453[t44a8c3],sc0b453[t44a8c3-1]=sc0b453[t44a8c3-1],sc0b453[t44a8c3]
 end
 h873237[55940]=function()
   local ix=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local k=d3c6e4c(ix) local v=hg975ae9[k] if v==nil then v=g6ae264[k] hg975ae9[k]=v end
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=v
 end
 h873237[37530]=function()
   local ix=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local n=m203475[ix] if not n then n=tonumber(d3c6e4c(ix)) m203475[ix]=n end
   sc0b453[t44a8c3]=sc0b453[t44a8c3]*n
 end
 h873237[34685]=function()
   local id=wb6f7ae.c[i36ce47] local v=sc0b453[t44a8c3] t44a8c3=t44a8c3-1 i36ce47=i36ce47+1
   local b=nil for i=#yf5a543,1,-1 do b=yf5a543[i][id] if b then break end end
   if b then b[1]=v end
 end
 h873237[47813]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a > b
 end
 h873237[43637]=function()
   sc0b453[t44a8c3]=#sc0b453[t44a8c3]
 end
 h873237[7960]=function()
   local _n=(sc0b453[t44a8c3]==nil) sc0b453[t44a8c3]=nil t44a8c3=t44a8c3-1 if _n then i36ce47=wb6f7ae.c[i36ce47] else i36ce47=i36ce47+1 end
 end
 h873237[57001]=function()
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=false
 end
 h873237[29599]=function()
   local id=wb6f7ae.c[i36ce47] local b=nil i36ce47=i36ce47+1
   for i=#yf5a543,1,-1 do b=yf5a543[i][id] if b then break end end
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=b and b[1]
 end
 h873237[50657]=function()
   local _v=sc0b453[t44a8c3] sc0b453[t44a8c3]=nil t44a8c3=t44a8c3-1 if not _v then i36ce47=wb6f7ae.c[i36ce47] else i36ce47=i36ce47+1 end
 end
 h873237[30165]=function()
   sc0b453[t44a8c3]=not sc0b453[t44a8c3]
 end
 h873237[4264]=function()
   local ix=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local n=m203475[ix]
   if not n then n=tonumber(d3c6e4c(ix)) m203475[ix]=n end
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=n
 end
 h873237[1720]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a >= b
 end
 h873237[15905]=function()
   local ci=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local links={}
   for i=1,#L09857f do links[#links+1]=L09857f[i] end
   for i=1,#yf5a543 do links[#links+1]=yf5a543[i] end
   t44a8c3=t44a8c3+1
   sc0b453[t44a8c3]=vf86d31a(ci,links)
 end
 h873237[2881]=function()
   local n=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local f=sc0b453[t44a8c3-n]
   local a={}
   for j=1,n do a[j]=sc0b453[t44a8c3-n+j] end
   t44a8c3=t44a8c3-n-1
   local la=n
   if la>0 and qdb130a(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm4c5905[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu7f2d1a local dest=t44a8c3+1
    sfffff3e(caller)
    local vc=vd or f pf179e10(vc.chunk,vc.links,a,dest,1,caller)
    lf87454e(fra6c42a[fp8841a5])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sfffff3e(cu7f2d1a) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P0be750(f(u68d3d1(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf87454e(cu7f2d1a) end
    t44a8c3=t44a8c3+1
    sc0b453[t44a8c3]=r[1]
   end
 end
 h873237[11029]=function()
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=g6ae264[d3c6e4c(wb6f7ae.c[i36ce47])] i36ce47=i36ce47+1
 end
 h873237[39281]=function()
   local n=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local pt=sc0b453[t44a8c3] sc0b453[t44a8c3]=nil t44a8c3=t44a8c3-1
   for j=1,n do t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=pt[j] end
 end
 h873237[41238]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a * b
 end
 h873237[33002]=function()
   local v=sc0b453[t44a8c3] local k=sc0b453[t44a8c3-1] local t=sc0b453[t44a8c3-2] t[k]=v t44a8c3=t44a8c3-3
 end
 h873237[40109]=function()
   local _mode=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local v=sc0b453[t44a8c3] local idx=sc0b453[t44a8c3-1] local b=sc0b453[t44a8c3-2] t44a8c3=t44a8c3-3
   local f=cu7f2d1a local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rg96e958[b+idx-1]=v
 end
 h873237[6719]=function()
   if sc0b453[t44a8c3] then i36ce47=wb6f7ae.c[i36ce47] else i36ce47=i36ce47+1 sc0b453[t44a8c3]=nil t44a8c3=t44a8c3-1 end
 end
 h873237[1182]=function()
   i36ce47=wb6f7ae.c[i36ce47]
 end
 h873237[15687]=function()
   yf5a543[#yf5a543]=nil
 end
 h873237[49523]=function()
   sc0b453[t44a8c3]=sc0b453[t44a8c3][3]
 end
 h873237[2723]=function()
   local k=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   rtbd9b19(k,true)
 end
 h873237[17299]=function()
   local ix=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   sc0b453[t44a8c3]=sc0b453[t44a8c3][ix]
 end
 h873237[37536]=function()
   local id=wb6f7ae.c[i36ce47] local v=sc0b453[t44a8c3] t44a8c3=t44a8c3-1 i36ce47=i36ce47+1
   local b=nil for i=#L09857f,1,-1 do b=L09857f[i][id] if b then break end end
   if b then b[1]=v end
 end
 h873237[20419]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 h873237[22767]=function()
   local p=sc0b453[t44a8c3] t44a8c3=t44a8c3-1 local t=sc0b453[t44a8c3] sc0b453[t44a8c3]=nil t44a8c3=t44a8c3-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 h873237[40245]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a % b
 end
 h873237[31482]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a / b
 end
 h873237[35353]=function()
   if not sc0b453[t44a8c3] then i36ce47=wb6f7ae.c[i36ce47] else i36ce47=i36ce47+1 sc0b453[t44a8c3]=nil t44a8c3=t44a8c3-1 end
 end
 h873237[38516]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a < b
 end
 h873237[33156]=function()
   local n=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   rtbd9b19(n,false)
 end
 h873237[39241]=function()
   local _mode=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local idx=sc0b453[t44a8c3] local b=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-2
   local f=cu7f2d1a local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=nil else t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=rg96e958[b+idx-1] end
 end
 h873237[59103]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a ^ b
 end
 h873237[7291]=function()
   t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=true
 end
 h873237[33935]=function()
   local n=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local a={} for j=1,n do a[j]=sc0b453[t44a8c3-n+j] end t44a8c3=t44a8c3-n-1
   local la=n if la>0 and qdb130a(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm4c5905[f]
   if vd then
    local caller=cu7f2d1a local dest=t44a8c3+1 sfffff3e(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf179e10(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf87454e(fra6c42a[fp8841a5])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],u68d3d1(a,3,la)) else ok,rr=pcall(f,u68d3d1(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["md280dd42d2"]=true q[1]=ok q[2]=rr t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=q
   end
 end
 h873237[41655]=function()
   local b=sc0b453[t44a8c3] local a=sc0b453[t44a8c3-1] t44a8c3=t44a8c3-1
   sc0b453[t44a8c3]=a * b
 end
 h873237[64908]=function()
  local t=sc0b453[t44a8c3] sc0b453[t44a8c3]=t
 end
 h873237[64043]=function()
  t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=d3c6e4c(wb6f7ae.c[i36ce47]) i36ce47=i36ce47+1
 end
 h873237[64794]=function()
  local t=sc0b453[t44a8c3] sc0b453[t44a8c3]=t
 end
 h873237[62986]=function()
  local t=sc0b453[t44a8c3] sc0b453[t44a8c3]=t
 end
 h873237[62044]=function()
  t44a8c3=t44a8c3+1 sc0b453[t44a8c3]=d3c6e4c(wb6f7ae.c[i36ce47]) i36ce47=i36ce47+1
 end
 h873237[61303]=function()
  local k=sc0b453[t44a8c3] t44a8c3=t44a8c3-1 local t=sc0b453[t44a8c3] sc0b453[t44a8c3]=t[k]
 end
 sch027d60=function(stop)
  while fp8841a5>stop and not dn8f9ff3 do
   local f=fra6c42a[fp8841a5] if not f then error("VM_FRAME_MISSING",0) end
   lf87454e(f)
   if fp8841a5<1 or fp8841a5>#fra6c42a or fra6c42a[fp8841a5]~=cu7f2d1a then error("VM_STATE_FP",0) end
   if cu7f2d1a.owner~=ow4bd525 then error("VM_STATE_FRAME_OWNER",0) end
   if wb6f7ae~=K1294f9[cu7f2d1a.chunk] then error("VM_STATE_CODE",0) end
   if i36ce47%1~=0 or i36ce47<1 or i36ce47>#wb6f7ae.c then error("VM_STATE_PC",0) end
   if ba52fefa%1~=0 or tod37447%1~=0 or ba52fefa<0 or tod37447<ba52fefa or tod37447>ba52fefa+255 then error("VM_STATE_BOUNDS",0) end
   if t44a8c3%1~=0 or t44a8c3<0 or t44a8c3>tod37447-ba52fefa then error("VM_STATE_SP",0) end
   local o93f772=wb6f7ae.c[i36ce47] i36ce47=i36ce47+1
   local _fn=h873237[o93f772]
   local _yieldop=(o93f772==2881 or o93f772==48417)
   local _ok,_err=true,nil
   if _yieldop and not (cu7f2d1a and cu7f2d1a.prot) then if _fn then _fn() else error("bad opcode "..tostring(o93f772),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(o93f772),0) end end) end
   if not _ok then
    local handled=false local ei=fp8841a5
    while ei>stop do
     local ef=fra6c42a[ei] local meta=ef and ef.prot
     if meta then
      for k=fp8841a5,ei+1,-1 do local z=fra6c42a[k] if z then for j=z.base,z.top do rg96e958[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rg96e958[j]=nil end end end fra6c42a[k]=nil end
      fp8841a5=ei lf87454e(fra6c42a[fp8841a5])
      local bad=fra6c42a[fp8841a5] local caller=meta.caller fra6c42a[fp8841a5]=nil fp8841a5=fp8841a5-1
      for j=bad.base,bad.top do rg96e958[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rg96e958[j]=nil end end
      if meta.kind=="xpcall" then lf87454e(caller) local hf=vfm4c5905[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf179e10(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["md280dd42d2"]=true q[1]=false q[2]=hr t44a8c3=meta.dest sc0b453[t44a8c3]=q end else lf87454e(caller) local q={n=2} q["md280dd42d2"]=true q[1]=false q[2]=_err t44a8c3=meta.dest sc0b453[t44a8c3]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dn8f9ff3 then sfffff3e(cu7f2d1a) end
  end
 end
 ivk35c7cd=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if fra6c42a==st.fr and fp8841a5>0 then __vms_save_state(st) end __vms_load_state(st)
   if fp8841a5==0 then
    pf179e10(d.chunk,d.links,{...},nil,0,nil)
    sch027d60(0)
    local rr=rs796bab or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return u68d3d1(rr)
   end
   local stop=fp8841a5 local caller=fra6c42a[fp8841a5] sfffff3e(caller)
   pf179e10(d.chunk,d.links,{...},t44a8c3+1,0,caller)
   sch027d60(stop)
   local cf=fra6c42a[fp8841a5] lf87454e(cf) local rr=cf.lastResult or {} cf.lastResult=nil return u68d3d1(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fp8841a5 local caller=fra6c42a[fp8841a5]
  sfffff3e(caller)
  pf179e10(d.chunk,d.links,{...},0,0,caller)
  sch027d60(stop)
  local cf=fra6c42a[fp8841a5] lf87454e(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return u68d3d1(rr)
 end
 sch027d60(0)
 return u68d3d1(rs796bab)
end
do
 local ok,err=pcall(R6e9f4c,2,{})
 if not ok then error(err,0) end
end