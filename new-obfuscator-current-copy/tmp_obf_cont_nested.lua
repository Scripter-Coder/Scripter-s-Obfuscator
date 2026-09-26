-- baf7a3719a1199e6 | DO NOT EDIT
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
local v7a1cbe={32,97,199,197,230,160,28,24,77,71,161,211,228,34,226,103,16,213,37,21,37,205,240,110,10,217,200,67,97,155,189,128,168,77,170,235,136,241,141,209,248,87,179,33,225,210,78,141,51,138,117,238,96,96,83,214,92,90,132,243,26,187,233,74,111,188,40,128,116,153,23,50,253,100,63,254,20,90,55,92,106,58,168,171,185,246,234,147,60,103,39,105,170,95,75,83,127,76,145,165,160,211,150,133,203,129,27,78,82,204,132,253,178,199,159,232,110,69,221,51,127,160,192,127,36,152,199,37,238,118,229,192,50,168,182,197,40,162,123,84,29,138,210,154,109,183,93,181,3,226,117}
local c50f294={}
local r36d87a={{0,1},{1,1},{2,1},{3,1},{4,1},{5,1},{6,1},{7,1},{8,1},{9,5},{14,1},{15,51},{66,47},{113,38}}
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
 local src={75,89,18,14,123,48,139,244,50,153,155,73,155,153,66,229,91,48,123,120,18,89,75,134,91,25,173,238,214,107,166,248,205,84,54,180,241,207,88,226,17,225,17,225,99,138,92,160,39,197,62,86,39,151,178,164,177,251,189,33,61,246,95,11,88,136,147,77,165,172,94,133,255,103,187,210,131,180,175,78,161,152,58,94,32,19,87,79,219,32,11,64,141,191,81,131,108,245,46,115,82,194,157,17,233,38,163,235,158,28,64,211,209,164,111,233,252,195,53,145,69,121,141,70,177,193,124,89,137,160,253,36,225,22,26,186,30,30,196,72,148,184,10,33,245,233,221,117,193,177,76,249,169,16,77,49,195,252,224,10,212,132,15,69,28,158,203,215,246,79,35,141,194,146,13,75,133,108,137,87,191,216,156,127,240,219,70,70,19,117,130,95,232,161,85,168,180,100,186,207,183,185,182,76,172,165,73,79,221,40,110,77,246,61,42,216,139,228,120,186,151,39,93,13,131,247,212,52,109,99,226,80,225,97,135,132,154,241,190,38,84,29,140,122,62,214,236,188,25,43,227,53,153,18,113,73,150,139,145,4,153,155,72,71,204,66,145,155,48,123,113,206,12,75,227,58,25,173,236,82,11,166,140,51,13,54,190,130,207,88,135,51,99,17,226,191,223,92,212,231,197,62,93,83,71,178,120,236,251,189,42,225,163,95,110,32,136,147,73,192,220,94,182,176,103,187,186,172,206,175,85,143,193,58,130,46,19,87,70,137,162,11,156,234,25,81,137,4,245,46,13,85,123,157,35,176,154,163,203,172,186,64,15,223,164,111,224,102,0,53,77,26,121,141,76,109,148,124,221,237,160,253,10,192,189,26,196,21,30,196,26,202,237,10,253,168,233,221,124,226,81,76,141,90,240,77,53,132,180,224,111,165,132,15,64,122,36,203,163,225,246,35,157,61,46,13,46,41,57,137,81,175,216,156,11,252,142,70,87,1,117,130,58,116,11,85,175,82,217,186,187,119,185,182,94,158,3,73,147,187,40,110,95,49,132,42,189,4,88,120,178,75,114,93,62,204,247,212,92,86,54,226,17,234,97,135,88,35,91,190,54,178,160,140,166,98,214,236,173,43,141,227,75,84,18,113,123,68,58,145,66,153,155,72,155,153,66,145,148,48,123,113,81,121,75,227,255,250,173,236,142,79,166,140,47,242,54,190,43,180,88,135,224,215,17,226,68,208,92,212,58,229,62,93,224,46,178,120,56,101,189,42,225,163,95,110,244,22,147,73,192,220,94,182,17,21,187,186,39,148,175,85,201,54,58,130,107,210,87,70,114,182,11,156,190,5,81,137,95,179,46,13,70,33,157,35,147,184,163,203,132,5,64,15,164,224,111,224,1,221,53,77,252,211,141,76,101,34,124,221,29,111,253,10,166,215,26,196,202,253,196,26,12,161,10,253,162,233,255,124,236,177,76,193,121,16,77,213,112,252,224,144,24,132,15,136,102,158,203,251,2,79,35,189,77,146,13,250,22,108,137,57,17,216,156,185,6,219,70,166,144,117,130,230,205,161,85,143,229,100,186,97,28,185,182,121,246,165,73,143,244,40,110,39,93,61,42,161,135,228,120,114,230,39,93,222,118,247,212,128,20,99,226,37,36,97,135,159,118,241,190,183,98,29,140,210,187,214,236,190,211,43,227,207,57,18,113,42,62,139,145,1,185,155,72,216,185,66,145,87,101,123,113,237,229,75,227,247,135,173,236,54,216,166,140,7,77,54,190,169,235,88,135,152,204,17,226,143,32,92,212,180,229,62,93,234,183,178,120,2,70,189,42,73,242,95,110,209,165,147,73,185,208,94,182,126,123,187,186,68,59,175,85,129,220,58,130,102,217,87,70,43,22,11,156,234,25,81,137,24,37,46,13,70,33,157,35,86,68,163,203,251,108,64,15,154,101,111,224,59,223,53,77,55,35,141,76,215,123,124,221,201,241,253,10,100,136,26,196,102,181,196,26,222,194,10,253,84,91,221,124,219,168,76,141,7,208,77,53,62,226,224,111,193,244,15,64,68,186,203,163,250,26,35,157,186,57,13,46,57,114,137,81,198,88,156,11,212,20,70,87,118,5,130,58,39,231,85,175,6,66,186,187,15,94,182,94,108,212,73,147,137,40,83,95,246,116,42,189,251,208,189,178,151,218,67,62,197,215,144,92,138,81,68,17,225,114,77,88,207,127,130,54,84,175,170,166,107,27,204,173,25,214,253,75,89,147,71,123,48,86,72,66,153,187,12,155,153,98,213,139,48,201,87,18,89,85,34,43,25,197,66,214,107,110,246,29,84,194,113,241,207,234,161,97,225,11,251,99,138,111,146,247,197,71,221,39,151,245,48,228,251,51,22,61,246,146,78,40,136,91,51,165,172,121,236,185,103,97,193,100,180,99,75,161,152,66,41,117,19,187,236,219,32,43,205,216,191,47,73,108,245,70,234,146,194,248,83,79,38,28,141,158,28,128,126,132,164,141,214,252,195,29,35,16,121,243,140,177,193,9,10,233,160,53,112,184,22,57,36,30,30,176,171,22,184,77,181,160,233,184,12,193,177,184,63,121,16,10,125,195,252,195,143,164,132,61,66,28,158,23,246,38,79,150,178,194,146,45,127,245,108,187,247,191,216,174,173,32,219,187,73,19,117,69,38,152,161,252,57,180,100,206,191,103,185,66,145,172,165,171,165,136,40,224,99,246,61,30,120,251,228,91,82,151,39,36,190,197,247,160,140,138,99,4,172,225,97,175,54,207,241,121,143,84,29,68,220,107,214,171,229,25,43,203,37,89,18,216,237,48,139,145,66,153,176,72,155,153,235,7,139,48,143,195,18,89,88,41,43,25,92,111,214,107,25,202,29,84,103,176,241,207,167,59,97,225,220,194,99,138,163,104,247,197,91,45,39,151,224,250,228,251,115,29,61,246,146,78,40,136,137,80,165,172,158,199,185,103,117,141,100,180,140,181,161,152,187,180,117,19,75,58,219,32,190,179,216,191,145,248,108,245,227,45,146,194,7,224,79,38,131,143,158,28,18,141,132,164,76,0,252,195,128,98,16,121,74,245,177,193,101,191,233,160,175,136,184,22,40,98,30,30,48,168,22,184,42,172,160,233,1,226,193,177,205,187,121,16,145,96,195,252,60,241,164,132,17,129,28,158,163,13,38,79,254,68,194,146,191,8,245,108,101,251,191,216,92,122,32,219,68,87,13,117,203,58,152,236,85,175,180,16,190,187,103,119,129,94,172,209,77,147,136,27,40,95,246,221,153,189,251,35,193,178,151,250,132,62,197,27,126,92,138,214,205,17,225,149,53,88,207,54,162,54,84,99,76,166,107,202,144,173,25,115,199,75,89,119,1,123,48,242,17,66,153,168,14,155,153,92,80,139,48,30,1,18,89,254,204,43,25,159,238,214,107,106,146,29,84,194,12,241,207,33,7,97,225,49,109,99,138,124,91,247,197,45,1,39,151,114,9,228,251,109,159,61,246,152,215,40,136,99,127,165,172,225,240,185,103,103,36,100,180,143,17,161,152,160,65,117,19,166,197,219,32,143,252,216,191,189,35,108,245,218,194,146,194,77,150,79,38,214,28,158,28,52,11,132,164,79,111,252,195,114,5,16,121,249,253,177,193,166,166,233,160,207,172,184,22,210,190,30,30,108,104,22,184,250,203,160,233,141,47,193,177,28,222,121,16,229,71,195,252,17,236,164,132,105,250,28,158,41,149,38,79,11,243,194,146,195,25,245,108,107,103,191,216,81,43,32,219,56,151,19,117,76,13,152,161,103,9,180,100,110,88,103,185,73,226,172,165,132,179,136,40,178,193,246,61,13,231,251,228,88,246,151,39,41,238,197,247,125,202,138,99,0,39,225,97,242,143,207,241,114,40,84,29,65,134,107,214,188,254,25,43,62,146,89,18,113,123,48,180,145,66,153,79,171,155,153,42,63,139,48,56,81,18,89,35,4,43,25,44,218,214,107,148,42,29,84,183,136,241,207,144,253,97,225,121,76,99,138,130,180,247,197,30,25,39,151,84,197,228,251,157,123,61,246,222,88,40,136,59,59,165,172,130,227,185,103,18,44,100,180,199,178,161,152,41,72,117,19,99,131,219,32,133,160,216,191,3,11,108,245,61,81,146,194,105,236,79,38,109,252,158,28,3,47,132,164,115,156,252,195,38,17,16,121,221,31,177,193,180,167,233,160,137,218,184,22,110,117,30,30,123,92,22,184,245,65,160,233,165,215,193,177,80,241,121,16,133,79,195,252,40,21,164,132,123,68,28,158,58,32,38,79,123,185,194,146,178,104,245,108,78,77,191,216,188,90,32,219,238,37,19,117,156,251,152,161,146,179,180,100,92,6,103,185,149,190,172,165,171,165,136,40,36,69,246,61,176,126,251,228,184,195,151,39,137,221,197,247,19,229,138,99,214,212,225,97,71,41,207,241,100,77,84,29,248,118,107,214,29,46,25,43,195,196,89,18,98,177,48,139,229,70,153,155}
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