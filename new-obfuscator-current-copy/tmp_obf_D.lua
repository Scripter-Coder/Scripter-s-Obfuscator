-- 36b845b1f619fc53 | DO NOT EDIT
local _d950207=function(a64c142,b3cfa45,...)
 while true do
  local _sbb84={} local _tabd4=0
  local _yb6c3={{}}
  local _i8fc9=1
  local _w6916=a64c142[b3cfa45]
  local o8f6d06=_w6916.c[_i8fc9]
  if o8f6d06==1 then _sbb84[_tabd4]="x" end
 end
end
local _b37c6={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _rf7df={{1,41}}
local dfbf9cf=function(i) local a=_b37c6[1] local rr=_rf7df[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b37c62={214,17,239,131,189,168} do local rp=1 while rp<=#_b37c62 do local np=_b37c62[rp]+_b37c62[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b37c62[rp]+_b37c62[rp+1]*256 rp=rp+2 end local va=(_b37c62[rp]==1) rp=rp+1 local nc=_b37c62[rp]+_b37c62[rp+1]*256+_b37c62[rp+2]*65536+_b37c62[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b37c62[rp]+_b37c62[rp+1]*256+_b37c62[rp+2]*65536+_b37c62[rp+3]*16777216 rp=rp+4 end end end
end
local gc4acbb=_G
if getfenv then local _le=getfenv(0) if _le then gc4acbb=_le end end
local hgd7a44e={}
if getgenv then gc4acbb=getgenv() end
if not gc4acbb then gc4acbb=_G end
local v531b99={117,109,117,67,183,108,172,56,9,130,22,20,128,172,215,201,158,17,193,228,60,35,92,190,189,243,105,97,254,227,154,203,108,66,7,159,28,61,218,74,177,254,41,154,152,178,218,11,236,64,149,131,141,205,48,208,190,205,141,175,124,105,132,123,211,25,52,183,209,141,137,91,103,27,214,92,26,214,114,35,122,80,100,63,207,32,219,178,14,74,139,184,178,134,211,30,161,121,93,180,4,76,8}
local cf21363={}
local r8655d0={{0,3},{3,5},{8,3},{11,1},{12,1},{13,58},{71,32}}
local ma49d3a={}
local ivbdd4fa=5
local d7f1eb8=function(i)
 local c=cf21363[i] if c then return c end
 local rr=r8655d0[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=ivbdd4fa
 for j=1,ln do
  local p=st+j
  local a=v531b99[p] local b=(207*p+94+715530196*1.0*((p*p)%11))%251+234
  local kb=(b + prev*54)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 cf21363[i]=t return t
end
local u4b926f
if table.unpack then u4b926f=table.unpack else u4b926f=unpack end
if not u4b926f then u4b926f=unpack end
local P5d62f6=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m9a408a3735"]=true
 return t
end
local qfd5a29=function(t) return type(t)=="table" and t["m9a408a3735"]==true end
local b5d2b15={}
do
 local src={39,197,167,195,35,182,140,151,236,123,70,198,68,20,207,202,8,124,49,169,155,184,98,74,106,200,103,76,33,172,64,211,94,100,232,172,174,235,105,224,91,75,185,104,83,122,221,129,97,125,198,110,67,84,170,70,244,250,64,191,126,121,120,2,215,199,242,96,9,233,205,236,10,223,247,76,218,169,118,123,131,71,68,131,251,180,20,116,76,245,219,10,108,15,84,167,96,243,194,215,40,176,240,18,191,65,248,244,47,161,34,19,110,213,124,97,129,221,211,106,104,185,136,91,35,105,235,174,173,232,101,28,81,64,172,111,66,103,200,169,10,98,184,228,67,49,124,181,101,207,20,186,171,70,123,71,255,140,182,87,147,166,197,142,127,148,168,50,250,86,95,47,254,231,229,24,215,81,68,67,154,138,114,166,178,151,116,143,124,120,74,144,213,45,239,61,227,177,109,4,146,14,186,33,71,58,219,85,79,58,208,14,131,14,153,165,27,177,54,249,134,45,162,21,77,120,226,162,145,151,246,247,121,138,222,89,152,81,154,143,132,231,42,109,204,86,137,59,234,148,188,104,194,166,195,11,106,140,158,63,194,70,77,35,197,207,203,34,160,49,34,115,245,98,72,169,138,103,66,49,200,64,16,44,32,232,173,70,127,105,35,176,114,185,104,120,117,221,129,220,211,213,110,34,95,161,47,228,195,65,191,173,21,176,40,180,94,243,96,80,158,15,108,186,197,245,76,112,16,180,251,58,9,71,131,156,139,169,218,21,229,223,10,83,114,233,9,211,34,199,215,224,154,121,126,190,65,203,244,47,156,84,67,110,189,25,97,129,226,7,83,104,112,216,25,35,81,147,174,173,33,247,28,16,168,56,89,66,109,114,106,72,138,44,79,34,241,10,8,203,240,69,144,77,237,184,236,158,192,164,33,195,111,86,37,188,226,248,248,137,66,132,164,42,143,129,36,154,250,135,115,222,69,167,150,246,95,94,141,226,144,222,88,162,116,152,242,54,75,53,101,153,189,107,167,208,32,212,189,219,33,111,167,186,36,127,101,109,113,64,242,239,116,178,88,74,82,4,141,116,189,42,150,114,90,174,115,68,122,149,36,229,200,207,164,95,133,48,248,168,221,179,37,197,180,126,33,182,158,35,236,123,68,85,144,20,224,46,8,124,130,243,79,184,161,10,106,200,212,147,89,172,12,2,28,100,81,127,174,235,99,153,25,75,169,81,83,122,53,21,97,125,54,87,67,84,63,98,244,250,79,199,126,121,136,80,215,199,155,4,9,233,51,33,10,223,185,94,218,169,251,225,131,71,83,88,251,180,107,90,76,245,188,147,108,15,35,122,96,243,78,187,40,176,27,104,191,65,249,244,18,161,118,67,40,213,124,78,129,221,122,144,42,185,75,13,233,105,235,158,233,232,100,212,58,64,172,155,194,103,200,9,209,98,184,65,90,49,124,68,217,207,20,139,242,70,123,46,30,140,182,109,209,166,197,142,221,148,168,226,134,86,95,218,78,231,229,50,177,81,68,13,186,138,114,6,217,151,116,157,219,120,74,38,198,45,239,26,162,177,109,170,76,14,186,111,167,58,219,237,93,58,208,20,107,14,153,173,71,177,54,58,152,45,162,46,26,120,226,143,108,151,246,156,200,138,222,101,111,81,154,104,247,231,42,176,149,86,137,154,190,148,188,124,213,166,195,233,156,140,158,101,23,70,77,191,241,207,203,224,232,49,34,228,123,98,72,39,207,103,66,9,42,64,16,172,126,232,173,48,166,105,35,214,158,185,104,176,67,221,129,170,15,213,110,137,39,161,47}
 for i=1,#src do
  local a=src[(i)] local _junk2a5=0 local b=((i*i*30+i*70+184)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b5d2b15[i]=r
 end
end
local Kb7db29={}
do
 local rp=1
 while rp<=#b5d2b15 do
  local np=b5d2b15[rp] + b5d2b15[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b5d2b15[rp] + b5d2b15[rp+1]*256 rp=rp+2 end
  local va=(b5d2b15[rp]==1) rp=rp+1
  local nc=b5d2b15[rp] + b5d2b15[rp+1]*256 + b5d2b15[rp+2]*65536 + b5d2b15[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b5d2b15[rp] + b5d2b15[rp+1]*256 + b5d2b15[rp+2]*65536 + b5d2b15[rp+3]*16777216
   rp=rp+4
  end
  Kb7db29[#Kb7db29+1]={c=cd,p=ps,v=va}
 end
end
local ow34c147={}
local rg80c8e7={} local frc2b442={} local fpe03523=0 local ba1c2cb0=0 local to1f797f=0 local nb2e3dff=0
local cu13f3ec=nil local dnc06511=false local rs1bce6d={} local vfmb6b38f={} local sch42de32 local ivkf4f94d
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rg80c8e7 st.fr=frc2b442 st.fp=fpe03523 st.ba=ba1c2cb0 st.to=to1f797f st.cu=cu13f3ec st.co=w772d90 st.pc=i066aad st.sp=t4b9459 st.sc=y368aa8 st.lk=La4ea4b st.va=a37995d st.nb=nb2e3dff st.dn=dnc06511 st.rs=rs1bce6d end
local __vms_load_state=function(st) rg80c8e7=st.rg or {} frc2b442=st.fr or {} fpe03523=st.fp or 0 ba1c2cb0=st.ba or 0 to1f797f=st.to or 0 cu13f3ec=st.cu w772d90=st.co i066aad=st.pc or 1 t4b9459=st.sp or 0 y368aa8=st.sc or {{}} La4ea4b=st.lk or {} a37995d=st.va nb2e3dff=st.nb or 0 dnc06511=st.dn or false rs1bce6d=st.rs or {} if fpe03523>0 then local q=frc2b442[fpe03523] if not q or q.owner~=ow34c147 then error("VM_STATE_FRAME_OWNER",0) end if ba1c2cb0~=q.base or to1f797f~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local s11898a=setmetatable({}, {__index=function(_,k) return rg80c8e7[ba1c2cb0+k] end, __newindex=function(_,k,v) rg80c8e7[ba1c2cb0+k]=v end})
local vf4455aa=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivkf4f94d(d,...) end vfmb6b38f[f]=d return f end
local pf046d75 local xfbf5d20 local sf293a4c local lf7d4546 local rt7b5edd
local Rb120b6
Rb120b6=function(x08aaa5,La4ea4b,...)
 frc2b442={} fpe03523=0 nb2e3dff=0 dnc06511=false rs1bce6d={}
 __vms_root_state={}
 pf046d75=function(ci,links,args,retDest,nRet,caller,meta)
  local code=Kb7db29[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nb2e3dff,top=nb2e3dff+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nb2e3dff+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=ow34c147}
  nb2e3dff=nb2e3dff+512
  fpe03523=fpe03523+1 frc2b442[fpe03523]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["m9a408a3735"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sf293a4c=function(f) if not f then return end f.pc=i066aad f.base=ba1c2cb0 f.top=to1f797f f.sp=t4b9459 f.sc=y368aa8 f.lk=La4ea4b f.va=a37995d f.sanext=cu13f3ec.sanext f.sasizes=cu13f3ec.sasizes end
 lf7d4546=function(f) cu13f3ec=f w772d90=Kb7db29[f.chunk] i066aad=f.pc ba1c2cb0=f.base to1f797f=f.top t4b9459=f.sp y368aa8=f.sc La4ea4b=f.lk a37995d=f.va end
 rt7b5edd=function(n,packed)
  local f=frc2b442[fpe03523] local vals={}
  if packed then local p=s11898a[t4b9459] local pn=(p and p.n) or 0 for i=1,n do vals[i]=s11898a[t4b9459-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=s11898a[t4b9459-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sf293a4c(f)
   for i=f.base,f.top do rg80c8e7[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg80c8e7[i]=nil end end
   frc2b442[fpe03523]=nil fpe03523=fpe03523-1
   lf7d4546(caller)
   local q={n=0} q["m9a408a3735"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   t4b9459=meta.dest s11898a[t4b9459]=q
   return
  end
  sf293a4c(f)
  rg80c8e7[f.base]=rg80c8e7[f.base]
  for i=f.base,f.top do rg80c8e7[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg80c8e7[i]=nil end end
  frc2b442[fpe03523]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rs1bce6d=vals dnc06511=true return end
  fpe03523=fpe03523-1 local cf=frc2b442[fpe03523]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf7d4546(cf)
  local d=f.retDest or (t4b9459+1)
  if f.nRet==0 then return end
  t4b9459=d-1
  if f.nRet==1 then t4b9459=d s11898a[t4b9459]=vals[1] else local q={n=#vals} q["m9a408a3735"]=true for i=1,#vals do q[i]=vals[i] end t4b9459=d s11898a[t4b9459]=q end
 end
 pf046d75(x08aaa5,La4ea4b,{...},nil,0,nil)
  local f=frc2b442[fpe03523]
  if not f then error("VM_FRAME_MISSING",0) end
  lf7d4546(f)
 local hbdceec={}
 hbdceec[37833]=function()
   local _mode=w772d90.c[i066aad] i066aad=i066aad+1
   local idx=s11898a[t4b9459] local b=s11898a[t4b9459-1] t4b9459=t4b9459-2
   local f=cu13f3ec local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then t4b9459=t4b9459+1 s11898a[t4b9459]=nil else t4b9459=t4b9459+1 s11898a[t4b9459]=rg80c8e7[b+idx-1] end
 end
 hbdceec[29642]=function()
   s11898a[t4b9459]=s11898a[t4b9459][1]
 end
 hbdceec[56362]=function()
   local b=s11898a[t4b9459] local n=cu13f3ec.sasizes and cu13f3ec.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end s11898a[t4b9459]=n
 end
 hbdceec[48402]=function()
   local ix=w772d90.c[i066aad] i066aad=i066aad+1
   local n=ma49d3a[ix] if not n then n=tonumber(d7f1eb8(ix)) ma49d3a[ix]=n end
   s11898a[t4b9459]=s11898a[t4b9459]+n
 end
 hbdceec[47530]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a - b
 end
 hbdceec[58671]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a ~= b
 end
 hbdceec[22778]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a % b
 end
 hbdceec[4684]=function()
   t4b9459=t4b9459+1 s11898a[t4b9459]=nil
 end
 hbdceec[40450]=function()
   local n=w772d90.c[i066aad] i066aad=i066aad+1
   local f=s11898a[t4b9459-n] local a={} for j=1,n do a[j]=s11898a[t4b9459-n+j] end t4b9459=t4b9459-n-1
   local la=n if la>0 and qfd5a29(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfmb6b38f[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cu13f3ec local base0=ba1c2cb0 local top0=to1f797f local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rg80c8e7[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rg80c8e7[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=ow34c147}
    local cc=Kb7db29[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["m9a408a3735"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    frc2b442[fpe03523]=nf lf7d4546(nf)
   else
    local r=P5d62f6(f(u4b926f(a,1,la))) t4b9459=t4b9459+1 s11898a[t4b9459]=r rt7b5edd(0,true)
   end
 end
 hbdceec[32962]=function()
   t4b9459=t4b9459+1 s11898a[t4b9459]=gc4acbb[d7f1eb8(w772d90.c[i066aad])] i066aad=i066aad+1
 end
 hbdceec[11030]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a ^ b
 end
 hbdceec[30776]=function()
   local _mode=w772d90.c[i066aad] i066aad=i066aad+1
   local v=s11898a[t4b9459] local idx=s11898a[t4b9459-1] local b=s11898a[t4b9459-2] t4b9459=t4b9459-3
   local f=cu13f3ec local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rg80c8e7[b+idx-1]=v
 end
 hbdceec[51732]=function()
 end
 hbdceec[34384]=function()
   local p=s11898a[t4b9459] t4b9459=t4b9459-1 local t=s11898a[t4b9459] s11898a[t4b9459]=nil t4b9459=t4b9459-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 hbdceec[9741]=function()
   local id=w772d90.c[i066aad] local b=nil i066aad=i066aad+1
   for i=#La4ea4b,1,-1 do b=La4ea4b[i][id] if b then break end end
   t4b9459=t4b9459+1 s11898a[t4b9459]=b and b[1]
 end
 hbdceec[17456]=function()
   local k=s11898a[t4b9459] t4b9459=t4b9459-1 local t=s11898a[t4b9459] s11898a[t4b9459]=t[k]
 end
 hbdceec[54735]=function()
   local _v=s11898a[t4b9459] s11898a[t4b9459]=nil t4b9459=t4b9459-1 if not _v then i066aad=w772d90.c[i066aad] else i066aad=i066aad+1 end
 end
 hbdceec[3913]=function()
   s11898a[t4b9459]=#s11898a[t4b9459]
 end
 hbdceec[6146]=function()
   y368aa8[#y368aa8+1]={}
 end
 hbdceec[1869]=function()
   s11898a[t4b9459],s11898a[t4b9459-1]=s11898a[t4b9459-1],s11898a[t4b9459]
 end
 hbdceec[14608]=function()
   local n=w772d90.c[i066aad] i066aad=i066aad+1
   local f=cu13f3ec local b=f.sanext or (ba1c2cb0+256) local lim=ba1c2cb0+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n to1f797f=math.max(to1f797f,ba1c2cb0+255)
   t4b9459=t4b9459+1 s11898a[t4b9459]=b
 end
 hbdceec[33630]=function()
   local ix=w772d90.c[i066aad] i066aad=i066aad+1
   local n=ma49d3a[ix] if not n then n=tonumber(d7f1eb8(ix)) ma49d3a[ix]=n end
   s11898a[t4b9459]=s11898a[t4b9459]*n
 end
 hbdceec[44733]=function()
   local ix=w772d90.c[i066aad] i066aad=i066aad+1
   local n=ma49d3a[ix]
   if not n then n=tonumber(d7f1eb8(ix)) ma49d3a[ix]=n end
   t4b9459=t4b9459+1 s11898a[t4b9459]=n
 end
 hbdceec[25704]=function()
   if not s11898a[t4b9459] then i066aad=w772d90.c[i066aad] else i066aad=i066aad+1 s11898a[t4b9459]=nil t4b9459=t4b9459-1 end
 end
 hbdceec[50091]=function()
   t4b9459=t4b9459+1 s11898a[t4b9459]=s11898a[t4b9459-1]
 end
 hbdceec[32063]=function()
   local _v=s11898a[t4b9459] s11898a[t4b9459]=nil t4b9459=t4b9459-1 if _v then i066aad=w772d90.c[i066aad] else i066aad=i066aad+1 end
 end
 hbdceec[53945]=function()
   local k=w772d90.c[i066aad] i066aad=i066aad+1
   rt7b5edd(k,true)
 end
 hbdceec[28880]=function()
   local n=w772d90.c[i066aad] i066aad=i066aad+1
   local a={} for j=1,n do a[j]=s11898a[t4b9459-n+j] end t4b9459=t4b9459-n-1
   local la=n if la>0 and qfd5a29(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfmb6b38f[f]
   if vd then
    local caller=cu13f3ec local dest=t4b9459+1 sf293a4c(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf046d75(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf7d4546(frc2b442[fpe03523])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],u4b926f(a,3,la)) else ok,rr=pcall(f,u4b926f(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["m9a408a3735"]=true q[1]=ok q[2]=rr t4b9459=t4b9459+1 s11898a[t4b9459]=q
   end
 end
 hbdceec[55741]=function()
   s11898a[t4b9459]=s11898a[t4b9459][3]
 end
 hbdceec[26891]=function()
   local ci=w772d90.c[i066aad] i066aad=i066aad+1
   local links={}
   for i=1,#La4ea4b do links[#links+1]=La4ea4b[i] end
   for i=1,#y368aa8 do links[#links+1]=y368aa8[i] end
   t4b9459=t4b9459+1
   s11898a[t4b9459]=vf4455aa(ci,links)
 end
 hbdceec[3883]=function()
   local n=w772d90.c[i066aad] i066aad=i066aad+1
   local pt=s11898a[t4b9459] s11898a[t4b9459]=nil t4b9459=t4b9459-1
   for j=1,n do t4b9459=t4b9459+1 s11898a[t4b9459]=pt[j] end
 end
 hbdceec[25003]=function()
   local id=w772d90.c[i066aad] local v=s11898a[t4b9459] t4b9459=t4b9459-1 i066aad=i066aad+1
   local b=nil for i=#La4ea4b,1,-1 do b=La4ea4b[i][id] if b then break end end
   if b then b[1]=v end
 end
 hbdceec[7933]=function()
   s11898a[t4b9459]=-s11898a[t4b9459]
 end
 hbdceec[54411]=function()
   local id=w772d90.c[i066aad] local b=nil i066aad=i066aad+1
   for i=#y368aa8,1,-1 do b=y368aa8[i][id] if b then break end end
   t4b9459=t4b9459+1 s11898a[t4b9459]=b and b[1]
 end
 hbdceec[5730]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a + b
 end
 hbdceec[38120]=function()
   i066aad=w772d90.c[i066aad]
 end
 hbdceec[58922]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a .. b
 end
 hbdceec[19772]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a == b
 end
 hbdceec[10952]=function()
   gc4acbb[d7f1eb8(w772d90.c[i066aad])]=s11898a[t4b9459] t4b9459=t4b9459-1 i066aad=i066aad+1
 end
 hbdceec[12176]=function()
   local id=w772d90.c[i066aad] local v=s11898a[t4b9459] t4b9459=t4b9459-1 i066aad=i066aad+1
   local b=nil for i=#y368aa8,1,-1 do b=y368aa8[i][id] if b then break end end
   if b then b[1]=v end
 end
 hbdceec[47571]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a >= b
 end
 hbdceec[2913]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 hbdceec[19870]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a * b
 end
 hbdceec[4185]=function()
   local k=s11898a[t4b9459] t4b9459=t4b9459-1 local t=s11898a[t4b9459] s11898a[t4b9459]=t[k]
 end
 hbdceec[27785]=function()
   local n=w772d90.c[i066aad] i066aad=i066aad+1
   local f=s11898a[t4b9459-n]
   local a={}
   for j=1,n do a[j]=s11898a[t4b9459-n+j] end
   t4b9459=t4b9459-n-1
   local la=n
   if la>0 and qfd5a29(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfmb6b38f[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu13f3ec local dest=t4b9459+1
    sf293a4c(caller)
    local vc=vd or f pf046d75(vc.chunk,vc.links,a,dest,-1,caller)
    lf7d4546(frc2b442[fpe03523])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf293a4c(cu13f3ec) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P5d62f6(f(u4b926f(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf7d4546(cu13f3ec) end
    t4b9459=t4b9459+1
    s11898a[t4b9459]=r
   end
 end
 hbdceec[38790]=function()
   s11898a[t4b9459]=s11898a[t4b9459][2]
 end
 hbdceec[6735]=function()
   if not a37995d then local t={n=0} t["m9a408a3735"]=true a37995d=t end
   t4b9459=t4b9459+1 s11898a[t4b9459]=a37995d
 end
 hbdceec[29387]=function()
   local id=w772d90.c[i066aad] local v=s11898a[t4b9459] s11898a[t4b9459]=nil t4b9459=t4b9459-1 i066aad=i066aad+1
   y368aa8[#y368aa8][id]={v}
 end
 hbdceec[14761]=function()
   s11898a[t4b9459]=nil t4b9459=t4b9459-1
 end
 hbdceec[39267]=function()
   local n=w772d90.c[i066aad] i066aad=i066aad+1
   local a={} for j=1,n do a[j]=s11898a[t4b9459-n+j] end t4b9459=t4b9459-n-1
   local la=n if la>0 and qfd5a29(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfmb6b38f[f]
   if vd then
    local caller=cu13f3ec local dest=t4b9459+1 sf293a4c(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf046d75(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf7d4546(frc2b442[fpe03523])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],u4b926f(a,3,la)) else ok,rr=pcall(f,u4b926f(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["m9a408a3735"]=true q[1]=ok q[2]=rr t4b9459=t4b9459+1 s11898a[t4b9459]=q
   end
 end
 hbdceec[27859]=function()
   t4b9459=t4b9459+1 s11898a[t4b9459]=false
 end
 hbdceec[53683]=function()
   local ix=w772d90.c[i066aad] i066aad=i066aad+1
   local k=d7f1eb8(ix) local v=hgd7a44e[k] if v==nil then v=gc4acbb[k] hgd7a44e[k]=v end
   t4b9459=t4b9459+1 s11898a[t4b9459]=v
 end
 hbdceec[56084]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a > b
 end
 hbdceec[47626]=function()
   local _n=(s11898a[t4b9459]==nil) s11898a[t4b9459]=nil t4b9459=t4b9459-1 if _n then i066aad=w772d90.c[i066aad] else i066aad=i066aad+1 end
 end
 hbdceec[30400]=function()
   t4b9459=t4b9459+1 s11898a[t4b9459]=d7f1eb8(w772d90.c[i066aad]) i066aad=i066aad+1
 end
 hbdceec[30553]=function()
   y368aa8[#y368aa8]=nil
 end
 hbdceec[16231]=function()
   t4b9459=t4b9459+1 s11898a[t4b9459]={}
 end
 hbdceec[48923]=function()
   if s11898a[t4b9459] then i066aad=w772d90.c[i066aad] else i066aad=i066aad+1 s11898a[t4b9459]=nil t4b9459=t4b9459-1 end
 end
 hbdceec[14819]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a <= b
 end
 hbdceec[20598]=function()
   local n=w772d90.c[i066aad] i066aad=i066aad+1
   local f=s11898a[t4b9459-n]
   local a={}
   for j=1,n do a[j]=s11898a[t4b9459-n+j] end
   t4b9459=t4b9459-n-1
   local la=n
   if la>0 and qfd5a29(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfmb6b38f[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu13f3ec local dest=t4b9459+1
    sf293a4c(caller)
    local vc=vd or f pf046d75(vc.chunk,vc.links,a,dest,1,caller)
    lf7d4546(frc2b442[fpe03523])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf293a4c(cu13f3ec) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P5d62f6(f(u4b926f(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf7d4546(cu13f3ec) end
    t4b9459=t4b9459+1
    s11898a[t4b9459]=r[1]
   end
 end
 hbdceec[6832]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a / b
 end
 hbdceec[30734]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a + b
 end
 hbdceec[20153]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a < b
 end
 hbdceec[20799]=function()
   t4b9459=t4b9459+1 s11898a[t4b9459]=true
 end
 hbdceec[40076]=function()
   s11898a[t4b9459]=not s11898a[t4b9459]
 end
 hbdceec[30664]=function()
   local ix=w772d90.c[i066aad] i066aad=i066aad+1
   s11898a[t4b9459]=s11898a[t4b9459][ix]
 end
 hbdceec[25726]=function()
   local v=s11898a[t4b9459] local k=s11898a[t4b9459-1] local t=s11898a[t4b9459-2] t[k]=v t4b9459=t4b9459-3
 end
 hbdceec[3866]=function()
   local b=s11898a[t4b9459] local a=s11898a[t4b9459-1] t4b9459=t4b9459-1
   s11898a[t4b9459]=a * b
 end
 hbdceec[17091]=function()
   local n=w772d90.c[i066aad] i066aad=i066aad+1
   rt7b5edd(n,false)
 end
 hbdceec[64270]=function()
  t4b9459=t4b9459+1 s11898a[t4b9459]=d7f1eb8(w772d90.c[i066aad]) i066aad=i066aad+1
 end
 hbdceec[64576]=function()
  local k=s11898a[t4b9459] t4b9459=t4b9459-1 local t=s11898a[t4b9459] s11898a[t4b9459]=t[k]
 end
 hbdceec[64239]=function()
  local k=s11898a[t4b9459] t4b9459=t4b9459-1 local t=s11898a[t4b9459] s11898a[t4b9459]=t[k]
 end
 hbdceec[64736]=function()
  local t=s11898a[t4b9459] s11898a[t4b9459]=t
 end
 hbdceec[63506]=function()
  local t=s11898a[t4b9459] s11898a[t4b9459]=t
 end
 hbdceec[64666]=function()
  local t=s11898a[t4b9459] s11898a[t4b9459]=t
 end
 hbdceec[62894]=function()
  i066aad=w772d90.c[i066aad]
 end
 hbdceec[64317]=function()
  local k=s11898a[t4b9459] t4b9459=t4b9459-1 local t=s11898a[t4b9459] s11898a[t4b9459]=t[k]
 end
 sch42de32=function(stop)
  while fpe03523>stop and not dnc06511 do
   local f=frc2b442[fpe03523] if not f then error("VM_FRAME_MISSING",0) end
   lf7d4546(f)
   if fpe03523<1 or fpe03523>#frc2b442 or frc2b442[fpe03523]~=cu13f3ec then error("VM_STATE_FP",0) end
   if cu13f3ec.owner~=ow34c147 then error("VM_STATE_FRAME_OWNER",0) end
   if w772d90~=Kb7db29[cu13f3ec.chunk] then error("VM_STATE_CODE",0) end
   if i066aad%1~=0 or i066aad<1 or i066aad>#w772d90.c then error("VM_STATE_PC",0) end
   if ba1c2cb0%1~=0 or to1f797f%1~=0 or ba1c2cb0<0 or to1f797f<ba1c2cb0 or to1f797f>ba1c2cb0+255 then error("VM_STATE_BOUNDS",0) end
   if t4b9459%1~=0 or t4b9459<0 or t4b9459>to1f797f-ba1c2cb0 then error("VM_STATE_SP",0) end
   local o29a04b=w772d90.c[i066aad] i066aad=i066aad+1
   local _fn=hbdceec[o29a04b]
   local _yieldop=(o29a04b==20598 or o29a04b==27785)
   local _ok,_err=true,nil
   if _yieldop and not (cu13f3ec and cu13f3ec.prot) then if _fn then _fn() else error("bad opcode "..tostring(o29a04b),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(o29a04b),0) end end) end
   if not _ok then
    local handled=false local ei=fpe03523
    while ei>stop do
     local ef=frc2b442[ei] local meta=ef and ef.prot
     if meta then
      for k=fpe03523,ei+1,-1 do local z=frc2b442[k] if z then for j=z.base,z.top do rg80c8e7[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rg80c8e7[j]=nil end end end frc2b442[k]=nil end
      fpe03523=ei lf7d4546(frc2b442[fpe03523])
      local bad=frc2b442[fpe03523] local caller=meta.caller frc2b442[fpe03523]=nil fpe03523=fpe03523-1
      for j=bad.base,bad.top do rg80c8e7[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rg80c8e7[j]=nil end end
      if meta.kind=="xpcall" then lf7d4546(caller) local hf=vfmb6b38f[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf046d75(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["m9a408a3735"]=true q[1]=false q[2]=hr t4b9459=meta.dest s11898a[t4b9459]=q end else lf7d4546(caller) local q={n=2} q["m9a408a3735"]=true q[1]=false q[2]=_err t4b9459=meta.dest s11898a[t4b9459]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dnc06511 then sf293a4c(cu13f3ec) end
  end
 end
 ivkf4f94d=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if frc2b442==st.fr and fpe03523>0 then __vms_save_state(st) end __vms_load_state(st)
   if fpe03523==0 then
    pf046d75(d.chunk,d.links,{...},nil,0,nil)
    sch42de32(0)
    local rr=rs1bce6d or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return u4b926f(rr)
   end
   local stop=fpe03523 local caller=frc2b442[fpe03523] sf293a4c(caller)
   pf046d75(d.chunk,d.links,{...},t4b9459+1,0,caller)
   sch42de32(stop)
   local cf=frc2b442[fpe03523] lf7d4546(cf) local rr=cf.lastResult or {} cf.lastResult=nil return u4b926f(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fpe03523 local caller=frc2b442[fpe03523]
  sf293a4c(caller)
  pf046d75(d.chunk,d.links,{...},0,0,caller)
  sch42de32(stop)
  local cf=frc2b442[fpe03523] lf7d4546(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return u4b926f(rr)
 end
 sch42de32(0)
 return u4b926f(rs1bce6d)
end
do
 local ok,err=pcall(Rb120b6,2,{})
 if not ok then error(err,0) end
end