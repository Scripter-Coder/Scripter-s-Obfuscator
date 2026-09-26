-- 128dc43681f176b3 | DO NOT EDIT
local _dca70bb=function(a69e96d,b231916,...)
 while true do
  local _s15a7={} local _t5bfa=0
  local _y2a6a={{}}
  local _i0098=1
  local _wb164=a69e96d[b231916]
  local od55cbc=_wb164.c[_i0098]
  if od55cbc==1 then _s15a7[_t5bfa]="x" end
 end
end
local _b311a={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _refab={{1,41}}
local dc88e8d=function(i) local a=_b311a[1] local rr=_refab[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b311a2={214,17,239,131,189,168} do local rp=1 while rp<=#_b311a2 do local np=_b311a2[rp]+_b311a2[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b311a2[rp]+_b311a2[rp+1]*256 rp=rp+2 end local va=(_b311a2[rp]==1) rp=rp+1 local nc=_b311a2[rp]+_b311a2[rp+1]*256+_b311a2[rp+2]*65536+_b311a2[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b311a2[rp]+_b311a2[rp+1]*256+_b311a2[rp+2]*65536+_b311a2[rp+3]*16777216 rp=rp+4 end end end
end
local g57c9e9=_G
if getfenv then local _le=getfenv(0) if _le then g57c9e9=_le end end
local hg5d942a={}
if getgenv then g57c9e9=getgenv() end
if not g57c9e9 then g57c9e9=_G end
local vf5f607={95,86,254,158,190,166,221,180,160,24,126,4,67,183,217,57,62,77,41,200,152,151,116,17,181,157,193,43,193,237,157,158,231,104,164,107,17,92,178,85,58,93,164,56,94,43,75,90,68,154,119,232,153,20,63,13,62,152,231,115,28,90,74,17,46,199,176,76,98,216,162,136,17,246,114,120,47,190,35,202,120,206,227,249,114,55,79,186,203,129,44,12,173,120,126,212,21,219,240,181,50,131,32,238,107,236,8,105,104,105,14,118,100,227,150,109,114,162,237,98,215,47,149,52,225,24,122,237,93,5,108,56,179,117,10,227,76,227,179,36,13,143,153,113,169,212,68,12,152,27,163,167,234,87,148,16,251,23,219,31}
local caaa365={}
local r5b02ca={{0,3},{3,16},{19,5},{24,16},{40,53},{93,34},{127,33}}
local m08edf5={}
local iva6c3ec=177
local d7c2031=function(i)
 local c=caaa365[i] if c then return c end
 local rr=r5b02ca[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=iva6c3ec
 for j=1,ln do
  local p=st+j
  local a=vf5f607[p] local b=(106*p+36+1787193629*1.0*((p*p)%31))%251+115
  local kb=(b + prev*71)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 caaa365[i]=t return t
end
local u545ae0
if table.unpack then u545ae0=table.unpack else u545ae0=unpack end
if not u545ae0 then u545ae0=unpack end
local Pabb83f=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m57e78d23f7"]=true
 return t
end
local q560496=function(t) return type(t)=="table" and t["m57e78d23f7"]==true end
local be8d65f={}
do
 local src={225,227,140,218,201,98,157,30,177,51,5,120,148,86,186,229,24,203,198,106,172,151,41,253,216,181,217,167,22,42,224,226,166,236,62,54,200,10,233,215,226,117,235,12,204,55,68,109,157,75,234,145,126,177,231,196,72,110,59,171,192,112,220,227,206,222,212,113,186,52,35,82,14,125,191,133,125,157,178,15,37,146,247,230,174,139,147,25,229,76,129,153,2,192,193,112,159,205,88,153,234,32,65,25,1,101,124,230,191,44,14,15,18,28,237,133,192,186,40,82,41,80,176,113,255,227,143,226,134,4,192,170,226,209,72,196,180,14,34,53,128,218,78,243,37,142,204,13,123,20,161,116,75,185,200,50,41,185,70,66,83,79,22,164,128,58,56,93,165,116,172,104,117,174,119,197,69,103,148,121,181,43,8,127,178,202,201,215,254,10,225,134,124,125,80,135,233,6,17,218,236,37,36,132,112,42,137,128,116,237,69,206,42,178,83,115,197,146,179,106,96,128,106,179,200,10,115,83,239,52,206,69,111,100,128,137,139,105,132,36,198,175,218,17,160,49,135,80,136,235,134,225,52,241,215,201,23,14,127,8,82,188,121,148,25,166,197,119,122,0,104,172,243,157,93,56,135,161,164,22,209,243,66,70,124,95,50,200,192,43,116,161,235,56,13,204,147,24,243,78,121,146,53,34,47,52,196,72,61,132,170,192,204,26,226,143,108,54,113,176,182,76,82,40,241,12,133,237,252,178,14,47,175,247,230,62,148,147,25,15,183,129,153,129,6,193,112,113,161,88,153,134,111,65,25,148,203,124,230,19,122,14,15,33,45,237,133,202,51,40,82,52,195,176,113,242,3,143,226,153,41,192,170,159,50,72,196,176,245,34,53,56,116,78,243,245,241,204,13,63,18,161,116,167,173,200,50,15,150,70,66,186,83,22,164,156,225,56,93,138,87,172,104,131,159,119,197,210,36,148,121,84,128,8,127,144,58,201,215,170,53,225,134,172,2,80,135,188,90,17,218,189,3,36,132,89,6,137,128,236,59,69,206,78,205,83,115,56,163,165,106,245,195,106,254,163,58,115,96,243,254,206,119,38,30,128,5,218,139,132,97,50,79,218,162,128,101,135,47,161,205,134,115,50,140,215,233,13,157,127,125,160,5,121,178,128,186,197,56,215,198,104,120,240,41,93,138,87,217,164,126,88,224,66,14,111,62,50,91,219,233,116,49,20,235,13,94,230,68,243,49,81,234,53,123,62,231,196,216,15,59,170,178,148,220,226,187,199,212,113,248,21,35,82,184,193,191,133,234,131,178,15,4,13,247,230,226,103,147,25,27,105,129,153,223,176,193,112,152,54,88,153,48,214,65,25,231,185,124,230,157,28,14,15,229,184,237,133,29,19,40,82,124,173,176,113,6,225,143,226,91,116,192,170,108,42,72,196,200,25,34,53,165,87,78,243,150,8,204,13,91,109,161,116,218,44,200,50,118,111,70,66,31,27,22,164,75,100,56,93,174,158,172,104,52,174,119,197,173,3,148,121,8,107,8,127,178,202,201,215,213,108,225,134,178,161,80,135,69,138,17,218,105,187,36,132,58,255,137,128,97,68,69,206,80,214,83,115,94,23,179,106,114,5,106,179,194,131,115,83,113,162,206,69,83,70,128,137,190,130,132,36,212,173,218,17,142,85,135,80,188,178,134,225,197,81,215,201,231,184,127,8,89,182,121,148,192,106,197,119,76,207,104,172,188,20,93,56,17,133,164,22,121,95,66,70,236,62,50,250,10,233,116,129,26,235,13,21,136,68,243,177,122,234,53,145,212,231,196,230,109,59,170,199,2,220,226,44,30,212,113,103,235,35,82,3,157,191,133,73,160,178,15,190,183,247,230,107,225,147,25,53,29,129,153,85,225,193,112,44,243,88,153,13,243,65,25,123,83,124,230,12,188,14,15,253,224,237,133,167,16,40,82,3,249,176,113,101,24,143,226,127,62,192,170,79,99,72,196,98,148,34,53,73,139,78,243,218,228,204,13,75,149,161,116,161,137,200,50,76,5,70,66,115,251,22,164,156,225,56,93,35,53,172,104,209,158,119,197,173,3,148,121,210,78,8,127,26,107,201,215,62,1,225,134,199,25,80,135,213,253,17,218,176,87,36,132,58,255,137,128,49,246,69,206,78,205,83,115,189,170,179,106,241,187,106,179,131,85,115,83,130,186,206,69,252,173,128,137,243,73,132,36,101,79,213,17,192,101,187,80,187,228,134,225,227,170,1,201,98,151,221,8,51,18,44,148,86,72,160,119,203,173,88,172,151,115,36,56,181,34,183,22,42,57,253,70,236,75,161,200,10,227,178,161,117,72,205,204,55,26,135,78,75,109,60,34,177,121,23,72,110,183,73,192,125,49,168,143,222,57,59,176,150,107,209,40,160,159,234,237,252,214,187,14,175,89,229,124,180,104,10,65,16,174,49,88,185,180,227,193,185,51,169,129,16,76,65,147,180,87,219,247,175,173,76,178,252,215,79,191,160,26,42,35,150,227,206,212,222,44,161,220,125,224,197,59,110,196,39,231,177,103,97,234,75,47,74,68,55,179,23,235,117,5,40,233,10,169,139,62,236,230,162,224,42,126,214,217,181,59,93,121,151,152,104,216,203,119,141,186,86,148,11,236,51,8,95,242,98,201,189,29,227,225,216,185,187,80,167,10,229,17,238,86,102,36,123,186,57,137,194,62,94,69,42,43,213,83,255,217,163,179,94,218,195,106,94,233,58,115,12,238,254,206,47,237,30,128,31,233,139,132,15,91,79,218,191,230,101,135,195,106,205,134,174,255,140,215,152,209,157,127,74,19,5,121,55,150,186,197,68,237,198,104,68,112,41,93,122,149,217,164,94,169,224,66,180,137,62,50,108,86,233,116,238,105,235,13,166,132,68,243,254,83,234,53,74,195,231,196,110,179,59,170,82,172,220,226,29,15,212,113,84,67,35,82,96,35,191,133,231,94,178,15,144,124,247,230,79,146,147,25,117,9,129,153,51,137,193,112,144,10,88,153,201,147,65,25,251,198,124,230,239,31,14,15,148,42,237,133,31,64,40,82,233,84,176,113,30,28,143,226,182,236,192,170,190,75,72,196,53,142,34,53,149,81,78,243,54,222,204,13,252,32,161,116,186,181,200,50,10,245,70,66,4,255,22,164,34,166,56,93,97,20,172,104,178,198,119,197,176,244,148,121,254,32,8,127,247,243,201,215,201,183,225,134,200,46,80,135,214,128,17,218,13,70,36,132,116,8,137,128,97,68,69,206,222,186,83,115}
 for i=1,#src do
  local a=src[(i)] local _junka43=0 local b=((i*i*81+i*10+130)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  be8d65f[i]=r
 end
end
local K868973={}
do
 local rp=1
 while rp<=#be8d65f do
  local np=be8d65f[rp] + be8d65f[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=be8d65f[rp] + be8d65f[rp+1]*256 rp=rp+2 end
  local va=(be8d65f[rp]==1) rp=rp+1
  local nc=be8d65f[rp] + be8d65f[rp+1]*256 + be8d65f[rp+2]*65536 + be8d65f[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=be8d65f[rp] + be8d65f[rp+1]*256 + be8d65f[rp+2]*65536 + be8d65f[rp+3]*16777216
   rp=rp+4
  end
  K868973[#K868973+1]={c=cd,p=ps,v=va}
 end
end
local ow4fd38c={}
local rgdb9214={} local fr1cf134={} local fpb8adbb=0 local bae62f9a=0 local tod39bf2=0 local nba2a201=0
local cub9c60f=nil local dnc40a25=false local rsbb0567={} local vfm4c0e25={} local sch3335ef local ivk24844c
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rgdb9214 st.fr=fr1cf134 st.fp=fpb8adbb st.ba=bae62f9a st.to=tod39bf2 st.cu=cub9c60f st.co=w26d484 st.pc=icf721c st.sp=te2c88b st.sc=y28b484 st.lk=L1fe050 st.va=a7cb3b8 st.nb=nba2a201 st.dn=dnc40a25 st.rs=rsbb0567 end
local __vms_load_state=function(st) rgdb9214=st.rg or {} fr1cf134=st.fr or {} fpb8adbb=st.fp or 0 bae62f9a=st.ba or 0 tod39bf2=st.to or 0 cub9c60f=st.cu w26d484=st.co icf721c=st.pc or 1 te2c88b=st.sp or 0 y28b484=st.sc or {{}} L1fe050=st.lk or {} a7cb3b8=st.va nba2a201=st.nb or 0 dnc40a25=st.dn or false rsbb0567=st.rs or {} if fpb8adbb>0 then local q=fr1cf134[fpb8adbb] if not q or q.owner~=ow4fd38c then error("VM_STATE_FRAME_OWNER",0) end if bae62f9a~=q.base or tod39bf2~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local s68d5db=setmetatable({}, {__index=function(_,k) return rgdb9214[bae62f9a+k] end, __newindex=function(_,k,v) rgdb9214[bae62f9a+k]=v end})
local vf951547=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivk24844c(d,...) end vfm4c0e25[f]=d return f end
local pf7c9a8f local xfdcb445 local sf36900c local lf37d7b2 local rtcdbd23
local R1a0769
R1a0769=function(xb061f6,L1fe050,...)
 fr1cf134={} fpb8adbb=0 nba2a201=0 dnc40a25=false rsbb0567={}
 __vms_root_state={}
 pf7c9a8f=function(ci,links,args,retDest,nRet,caller,meta)
  local code=K868973[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nba2a201,top=nba2a201+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nba2a201+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=ow4fd38c}
  nba2a201=nba2a201+512
  fpb8adbb=fpb8adbb+1 fr1cf134[fpb8adbb]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["m57e78d23f7"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sf36900c=function(f) if not f then return end f.pc=icf721c f.base=bae62f9a f.top=tod39bf2 f.sp=te2c88b f.sc=y28b484 f.lk=L1fe050 f.va=a7cb3b8 f.sanext=cub9c60f.sanext f.sasizes=cub9c60f.sasizes end
 lf37d7b2=function(f) cub9c60f=f w26d484=K868973[f.chunk] icf721c=f.pc bae62f9a=f.base tod39bf2=f.top te2c88b=f.sp y28b484=f.sc L1fe050=f.lk a7cb3b8=f.va end
 rtcdbd23=function(n,packed)
  local f=fr1cf134[fpb8adbb] local vals={}
  if packed then local p=s68d5db[te2c88b] local pn=(p and p.n) or 0 for i=1,n do vals[i]=s68d5db[te2c88b-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=s68d5db[te2c88b-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sf36900c(f)
   for i=f.base,f.top do rgdb9214[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rgdb9214[i]=nil end end
   fr1cf134[fpb8adbb]=nil fpb8adbb=fpb8adbb-1
   lf37d7b2(caller)
   local q={n=0} q["m57e78d23f7"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   te2c88b=meta.dest s68d5db[te2c88b]=q
   return
  end
  sf36900c(f)
  rgdb9214[f.base]=rgdb9214[f.base]
  for i=f.base,f.top do rgdb9214[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rgdb9214[i]=nil end end
  fr1cf134[fpb8adbb]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rsbb0567=vals dnc40a25=true return end
  fpb8adbb=fpb8adbb-1 local cf=fr1cf134[fpb8adbb]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf37d7b2(cf)
  local d=f.retDest or (te2c88b+1)
  if f.nRet==0 then return end
  te2c88b=d-1
  if f.nRet==1 then te2c88b=d s68d5db[te2c88b]=vals[1] else local q={n=#vals} q["m57e78d23f7"]=true for i=1,#vals do q[i]=vals[i] end te2c88b=d s68d5db[te2c88b]=q end
 end
 pf7c9a8f(xb061f6,L1fe050,{...},nil,0,nil)
  local f=fr1cf134[fpb8adbb]
  if not f then error("VM_FRAME_MISSING",0) end
  lf37d7b2(f)
 local hfb943e={}
 hfb943e[3444]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a <= b
 end
 hfb943e[36697]=function()
   te2c88b=te2c88b+1 s68d5db[te2c88b]=nil
 end
 hfb943e[53651]=function()
   local _v=s68d5db[te2c88b] s68d5db[te2c88b]=nil te2c88b=te2c88b-1 if not _v then icf721c=w26d484.c[icf721c] else icf721c=icf721c+1 end
 end
 hfb943e[37749]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a ^ b
 end
 hfb943e[8258]=function()
   te2c88b=te2c88b+1 s68d5db[te2c88b]=s68d5db[te2c88b-1]
 end
 hfb943e[26098]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a * b
 end
 hfb943e[6783]=function()
   local ix=w26d484.c[icf721c] icf721c=icf721c+1
   local n=m08edf5[ix] if not n then n=tonumber(d7c2031(ix)) m08edf5[ix]=n end
   s68d5db[te2c88b]=s68d5db[te2c88b]*n
 end
 hfb943e[12799]=function()
   local ix=w26d484.c[icf721c] icf721c=icf721c+1
   s68d5db[te2c88b]=s68d5db[te2c88b][ix]
 end
 hfb943e[15199]=function()
   local k=s68d5db[te2c88b] te2c88b=te2c88b-1 local t=s68d5db[te2c88b] s68d5db[te2c88b]=t[k]
 end
 hfb943e[29288]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a + b
 end
 hfb943e[21573]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a < b
 end
 hfb943e[47457]=function()
   local ix=w26d484.c[icf721c] icf721c=icf721c+1
   local n=m08edf5[ix]
   if not n then n=tonumber(d7c2031(ix)) m08edf5[ix]=n end
   te2c88b=te2c88b+1 s68d5db[te2c88b]=n
 end
 hfb943e[29790]=function()
   te2c88b=te2c88b+1 s68d5db[te2c88b]=true
 end
 hfb943e[19181]=function()
   icf721c=w26d484.c[icf721c]
 end
 hfb943e[9605]=function()
   y28b484[#y28b484+1]={}
 end
 hfb943e[30770]=function()
   local ix=w26d484.c[icf721c] icf721c=icf721c+1
   local n=m08edf5[ix] if not n then n=tonumber(d7c2031(ix)) m08edf5[ix]=n end
   s68d5db[te2c88b]=s68d5db[te2c88b]+n
 end
 hfb943e[45905]=function()
   te2c88b=te2c88b+1 s68d5db[te2c88b]=d7c2031(w26d484.c[icf721c]) icf721c=icf721c+1
 end
 hfb943e[50865]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a + b
 end
 hfb943e[33608]=function()
   if s68d5db[te2c88b] then icf721c=w26d484.c[icf721c] else icf721c=icf721c+1 s68d5db[te2c88b]=nil te2c88b=te2c88b-1 end
 end
 hfb943e[58034]=function()
   s68d5db[te2c88b]=#s68d5db[te2c88b]
 end
 hfb943e[12395]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a == b
 end
 hfb943e[32519]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a / b
 end
 hfb943e[46180]=function()
   local k=w26d484.c[icf721c] icf721c=icf721c+1
   rtcdbd23(k,true)
 end
 hfb943e[41482]=function()
 end
 hfb943e[53398]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a .. b
 end
 hfb943e[31281]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a > b
 end
 hfb943e[54756]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a % b
 end
 hfb943e[49315]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a - b
 end
 hfb943e[49113]=function()
   local id=w26d484.c[icf721c] local b=nil icf721c=icf721c+1
   for i=#L1fe050,1,-1 do b=L1fe050[i][id] if b then break end end
   te2c88b=te2c88b+1 s68d5db[te2c88b]=b and b[1]
 end
 hfb943e[54822]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a >= b
 end
 hfb943e[59762]=function()
   if not a7cb3b8 then local t={n=0} t["m57e78d23f7"]=true a7cb3b8=t end
   te2c88b=te2c88b+1 s68d5db[te2c88b]=a7cb3b8
 end
 hfb943e[37226]=function()
   s68d5db[te2c88b]=s68d5db[te2c88b][1]
 end
 hfb943e[31066]=function()
   s68d5db[te2c88b],s68d5db[te2c88b-1]=s68d5db[te2c88b-1],s68d5db[te2c88b]
 end
 hfb943e[15659]=function()
   s68d5db[te2c88b]=s68d5db[te2c88b][2]
 end
 hfb943e[942]=function()
   local n=w26d484.c[icf721c] icf721c=icf721c+1
   local a={} for j=1,n do a[j]=s68d5db[te2c88b-n+j] end te2c88b=te2c88b-n-1
   local la=n if la>0 and q560496(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm4c0e25[f]
   if vd then
    local caller=cub9c60f local dest=te2c88b+1 sf36900c(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf7c9a8f(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf37d7b2(fr1cf134[fpb8adbb])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],u545ae0(a,3,la)) else ok,rr=pcall(f,u545ae0(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["m57e78d23f7"]=true q[1]=ok q[2]=rr te2c88b=te2c88b+1 s68d5db[te2c88b]=q
   end
 end
 hfb943e[45986]=function()
   local n=w26d484.c[icf721c] icf721c=icf721c+1
   local f=s68d5db[te2c88b-n]
   local a={}
   for j=1,n do a[j]=s68d5db[te2c88b-n+j] end
   te2c88b=te2c88b-n-1
   local la=n
   if la>0 and q560496(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm4c0e25[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cub9c60f local dest=te2c88b+1
    sf36900c(caller)
    local vc=vd or f pf7c9a8f(vc.chunk,vc.links,a,dest,-1,caller)
    lf37d7b2(fr1cf134[fpb8adbb])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf36900c(cub9c60f) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=Pabb83f(f(u545ae0(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf37d7b2(cub9c60f) end
    te2c88b=te2c88b+1
    s68d5db[te2c88b]=r
   end
 end
 hfb943e[32215]=function()
   local v=s68d5db[te2c88b] local k=s68d5db[te2c88b-1] local t=s68d5db[te2c88b-2] t[k]=v te2c88b=te2c88b-3
 end
 hfb943e[24976]=function()
   local id=w26d484.c[icf721c] local v=s68d5db[te2c88b] s68d5db[te2c88b]=nil te2c88b=te2c88b-1 icf721c=icf721c+1
   y28b484[#y28b484][id]={v}
 end
 hfb943e[58252]=function()
   local n=w26d484.c[icf721c] icf721c=icf721c+1
   local f=s68d5db[te2c88b-n] local a={} for j=1,n do a[j]=s68d5db[te2c88b-n+j] end te2c88b=te2c88b-n-1
   local la=n if la>0 and q560496(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfm4c0e25[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cub9c60f local base0=bae62f9a local top0=tod39bf2 local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rgdb9214[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rgdb9214[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=ow4fd38c}
    local cc=K868973[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["m57e78d23f7"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    fr1cf134[fpb8adbb]=nf lf37d7b2(nf)
   else
    local r=Pabb83f(f(u545ae0(a,1,la))) te2c88b=te2c88b+1 s68d5db[te2c88b]=r rtcdbd23(0,true)
   end
 end
 hfb943e[45930]=function()
   local id=w26d484.c[icf721c] local v=s68d5db[te2c88b] te2c88b=te2c88b-1 icf721c=icf721c+1
   local b=nil for i=#y28b484,1,-1 do b=y28b484[i][id] if b then break end end
   if b then b[1]=v end
 end
 hfb943e[56614]=function()
   s68d5db[te2c88b]=-s68d5db[te2c88b]
 end
 hfb943e[6320]=function()
   local b=s68d5db[te2c88b] local n=cub9c60f.sasizes and cub9c60f.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end s68d5db[te2c88b]=n
 end
 hfb943e[9779]=function()
   s68d5db[te2c88b]=s68d5db[te2c88b][3]
 end
 hfb943e[38149]=function()
   local ci=w26d484.c[icf721c] icf721c=icf721c+1
   local links={}
   for i=1,#L1fe050 do links[#links+1]=L1fe050[i] end
   for i=1,#y28b484 do links[#links+1]=y28b484[i] end
   te2c88b=te2c88b+1
   s68d5db[te2c88b]=vf951547(ci,links)
 end
 hfb943e[53650]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 hfb943e[13686]=function()
   local id=w26d484.c[icf721c] local b=nil icf721c=icf721c+1
   for i=#y28b484,1,-1 do b=y28b484[i][id] if b then break end end
   te2c88b=te2c88b+1 s68d5db[te2c88b]=b and b[1]
 end
 hfb943e[42830]=function()
   local _v=s68d5db[te2c88b] s68d5db[te2c88b]=nil te2c88b=te2c88b-1 if _v then icf721c=w26d484.c[icf721c] else icf721c=icf721c+1 end
 end
 hfb943e[54174]=function()
   s68d5db[te2c88b]=nil te2c88b=te2c88b-1
 end
 hfb943e[45080]=function()
   s68d5db[te2c88b]=not s68d5db[te2c88b]
 end
 hfb943e[50698]=function()
   y28b484[#y28b484]=nil
 end
 hfb943e[5115]=function()
   local k=s68d5db[te2c88b] te2c88b=te2c88b-1 local t=s68d5db[te2c88b] s68d5db[te2c88b]=t[k]
 end
 hfb943e[17495]=function()
   local ix=w26d484.c[icf721c] icf721c=icf721c+1
   local k=d7c2031(ix) local v=hg5d942a[k] if v==nil then v=g57c9e9[k] hg5d942a[k]=v end
   te2c88b=te2c88b+1 s68d5db[te2c88b]=v
 end
 hfb943e[7247]=function()
   local _mode=w26d484.c[icf721c] icf721c=icf721c+1
   local v=s68d5db[te2c88b] local idx=s68d5db[te2c88b-1] local b=s68d5db[te2c88b-2] te2c88b=te2c88b-3
   local f=cub9c60f local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rgdb9214[b+idx-1]=v
 end
 hfb943e[2439]=function()
   local n=w26d484.c[icf721c] icf721c=icf721c+1
   local pt=s68d5db[te2c88b] s68d5db[te2c88b]=nil te2c88b=te2c88b-1
   for j=1,n do te2c88b=te2c88b+1 s68d5db[te2c88b]=pt[j] end
 end
 hfb943e[59368]=function()
   if not s68d5db[te2c88b] then icf721c=w26d484.c[icf721c] else icf721c=icf721c+1 s68d5db[te2c88b]=nil te2c88b=te2c88b-1 end
 end
 hfb943e[21783]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a * b
 end
 hfb943e[57504]=function()
   te2c88b=te2c88b+1 s68d5db[te2c88b]=g57c9e9[d7c2031(w26d484.c[icf721c])] icf721c=icf721c+1
 end
 hfb943e[28448]=function()
   g57c9e9[d7c2031(w26d484.c[icf721c])]=s68d5db[te2c88b] te2c88b=te2c88b-1 icf721c=icf721c+1
 end
 hfb943e[16338]=function()
   te2c88b=te2c88b+1 s68d5db[te2c88b]={}
 end
 hfb943e[26580]=function()
   te2c88b=te2c88b+1 s68d5db[te2c88b]=false
 end
 hfb943e[43055]=function()
   local id=w26d484.c[icf721c] local v=s68d5db[te2c88b] te2c88b=te2c88b-1 icf721c=icf721c+1
   local b=nil for i=#L1fe050,1,-1 do b=L1fe050[i][id] if b then break end end
   if b then b[1]=v end
 end
 hfb943e[22541]=function()
   local _mode=w26d484.c[icf721c] icf721c=icf721c+1
   local idx=s68d5db[te2c88b] local b=s68d5db[te2c88b-1] te2c88b=te2c88b-2
   local f=cub9c60f local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then te2c88b=te2c88b+1 s68d5db[te2c88b]=nil else te2c88b=te2c88b+1 s68d5db[te2c88b]=rgdb9214[b+idx-1] end
 end
 hfb943e[49866]=function()
   local p=s68d5db[te2c88b] te2c88b=te2c88b-1 local t=s68d5db[te2c88b] s68d5db[te2c88b]=nil te2c88b=te2c88b-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 hfb943e[17315]=function()
   local n=w26d484.c[icf721c] icf721c=icf721c+1
   local f=s68d5db[te2c88b-n]
   local a={}
   for j=1,n do a[j]=s68d5db[te2c88b-n+j] end
   te2c88b=te2c88b-n-1
   local la=n
   if la>0 and q560496(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm4c0e25[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cub9c60f local dest=te2c88b+1
    sf36900c(caller)
    local vc=vd or f pf7c9a8f(vc.chunk,vc.links,a,dest,1,caller)
    lf37d7b2(fr1cf134[fpb8adbb])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf36900c(cub9c60f) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=Pabb83f(f(u545ae0(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf37d7b2(cub9c60f) end
    te2c88b=te2c88b+1
    s68d5db[te2c88b]=r[1]
   end
 end
 hfb943e[6452]=function()
   local n=w26d484.c[icf721c] icf721c=icf721c+1
   local f=cub9c60f local b=f.sanext or (bae62f9a+256) local lim=bae62f9a+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n tod39bf2=math.max(tod39bf2,bae62f9a+255)
   te2c88b=te2c88b+1 s68d5db[te2c88b]=b
 end
 hfb943e[23716]=function()
   local n=w26d484.c[icf721c] icf721c=icf721c+1
   rtcdbd23(n,false)
 end
 hfb943e[26035]=function()
   local n=w26d484.c[icf721c] icf721c=icf721c+1
   local a={} for j=1,n do a[j]=s68d5db[te2c88b-n+j] end te2c88b=te2c88b-n-1
   local la=n if la>0 and q560496(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm4c0e25[f]
   if vd then
    local caller=cub9c60f local dest=te2c88b+1 sf36900c(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf7c9a8f(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf37d7b2(fr1cf134[fpb8adbb])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],u545ae0(a,3,la)) else ok,rr=pcall(f,u545ae0(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["m57e78d23f7"]=true q[1]=ok q[2]=rr te2c88b=te2c88b+1 s68d5db[te2c88b]=q
   end
 end
 hfb943e[48979]=function()
   local b=s68d5db[te2c88b] local a=s68d5db[te2c88b-1] te2c88b=te2c88b-1
   s68d5db[te2c88b]=a ~= b
 end
 hfb943e[51770]=function()
   local _n=(s68d5db[te2c88b]==nil) s68d5db[te2c88b]=nil te2c88b=te2c88b-1 if _n then icf721c=w26d484.c[icf721c] else icf721c=icf721c+1 end
 end
 hfb943e[61837]=function()
  icf721c=w26d484.c[icf721c]
 end
 hfb943e[64016]=function()
  local t=s68d5db[te2c88b] s68d5db[te2c88b]=t
 end
 hfb943e[63280]=function()
  local k=s68d5db[te2c88b] te2c88b=te2c88b-1 local t=s68d5db[te2c88b] s68d5db[te2c88b]=t[k]
 end
 hfb943e[62123]=function()
  local t=s68d5db[te2c88b] s68d5db[te2c88b]=t
 end
 sch3335ef=function(stop)
  while fpb8adbb>stop and not dnc40a25 do
   local f=fr1cf134[fpb8adbb] if not f then error("VM_FRAME_MISSING",0) end
   lf37d7b2(f)
   if fpb8adbb<1 or fpb8adbb>#fr1cf134 or fr1cf134[fpb8adbb]~=cub9c60f then error("VM_STATE_FP",0) end
   if cub9c60f.owner~=ow4fd38c then error("VM_STATE_FRAME_OWNER",0) end
   if w26d484~=K868973[cub9c60f.chunk] then error("VM_STATE_CODE",0) end
   if icf721c%1~=0 or icf721c<1 or icf721c>#w26d484.c then error("VM_STATE_PC",0) end
   if bae62f9a%1~=0 or tod39bf2%1~=0 or bae62f9a<0 or tod39bf2<bae62f9a or tod39bf2>bae62f9a+255 then error("VM_STATE_BOUNDS",0) end
   if te2c88b%1~=0 or te2c88b<0 or te2c88b>tod39bf2-bae62f9a then error("VM_STATE_SP",0) end
   local oa44efc=w26d484.c[icf721c] icf721c=icf721c+1
   local _fn=hfb943e[oa44efc]
   local _yieldop=(oa44efc==17315 or oa44efc==45986)
   local _ok,_err=true,nil
   if _yieldop and not (cub9c60f and cub9c60f.prot) then if _fn then _fn() else error("bad opcode "..tostring(oa44efc),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(oa44efc),0) end end) end
   if not _ok then
    local handled=false local ei=fpb8adbb
    while ei>stop do
     local ef=fr1cf134[ei] local meta=ef and ef.prot
     if meta then
      for k=fpb8adbb,ei+1,-1 do local z=fr1cf134[k] if z then for j=z.base,z.top do rgdb9214[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rgdb9214[j]=nil end end end fr1cf134[k]=nil end
      fpb8adbb=ei lf37d7b2(fr1cf134[fpb8adbb])
      local bad=fr1cf134[fpb8adbb] local caller=meta.caller fr1cf134[fpb8adbb]=nil fpb8adbb=fpb8adbb-1
      for j=bad.base,bad.top do rgdb9214[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rgdb9214[j]=nil end end
      if meta.kind=="xpcall" then lf37d7b2(caller) local hf=vfm4c0e25[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf7c9a8f(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["m57e78d23f7"]=true q[1]=false q[2]=hr te2c88b=meta.dest s68d5db[te2c88b]=q end else lf37d7b2(caller) local q={n=2} q["m57e78d23f7"]=true q[1]=false q[2]=_err te2c88b=meta.dest s68d5db[te2c88b]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dnc40a25 then sf36900c(cub9c60f) end
  end
 end
 ivk24844c=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if fr1cf134==st.fr and fpb8adbb>0 then __vms_save_state(st) end __vms_load_state(st)
   if fpb8adbb==0 then
    pf7c9a8f(d.chunk,d.links,{...},nil,0,nil)
    sch3335ef(0)
    local rr=rsbb0567 or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return u545ae0(rr)
   end
   local stop=fpb8adbb local caller=fr1cf134[fpb8adbb] sf36900c(caller)
   pf7c9a8f(d.chunk,d.links,{...},te2c88b+1,0,caller)
   sch3335ef(stop)
   local cf=fr1cf134[fpb8adbb] lf37d7b2(cf) local rr=cf.lastResult or {} cf.lastResult=nil return u545ae0(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fpb8adbb local caller=fr1cf134[fpb8adbb]
  sf36900c(caller)
  pf7c9a8f(d.chunk,d.links,{...},0,0,caller)
  sch3335ef(stop)
  local cf=fr1cf134[fpb8adbb] lf37d7b2(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return u545ae0(rr)
 end
 sch3335ef(0)
 return u545ae0(rsbb0567)
end
do
 local ok,err=pcall(R1a0769,1,{})
 if not ok then error(err,0) end
end