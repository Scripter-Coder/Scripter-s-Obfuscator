-- fd1094e28efb390e | DO NOT EDIT
local _de6566d=function(a78280d,b07aa1b,...)
 while true do
  local _sa92f={} local _t8ed4=0
  local _y0ee1={{}}
  local _i577c=1
  local _w8c6c=a78280d[b07aa1b]
  local oa3b5a6=_w8c6c.c[_i577c]
  if oa3b5a6==1 then _sa92f[_t8ed4]="x" end
 end
end
local _b7896={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _r5e76={{1,41}}
local d54770f=function(i) local a=_b7896[1] local rr=_r5e76[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b78962={214,17,239,131,189,168} do local rp=1 while rp<=#_b78962 do local np=_b78962[rp]+_b78962[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b78962[rp]+_b78962[rp+1]*256 rp=rp+2 end local va=(_b78962[rp]==1) rp=rp+1 local nc=_b78962[rp]+_b78962[rp+1]*256+_b78962[rp+2]*65536+_b78962[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b78962[rp]+_b78962[rp+1]*256+_b78962[rp+2]*65536+_b78962[rp+3]*16777216 rp=rp+4 end end end
end
local g5a4b30=_G
if getfenv then local _le=getfenv(0) if _le then g5a4b30=_le end end
local hg7088ad={}
if getgenv then g5a4b30=getgenv() end
if not g5a4b30 then g5a4b30=_G end
local v409adb={23,206,111,172,229,190,207,114,164,184,232,18,130,90,119,232,218,194,102,141,5,169,22,203,119,217,11,127,11,45,88,110,5,79,148,99,35,249,67,76,58,88,200,108,21,249,241,178,16,229,179,36,249,213,61,64,198,38,184,42,155,84,236,244,102,127,115,63,228,102,47,76,54,163,10,229,142,88,205,212,49,96,45,98,216,5,120,58,7,214,167,166,235,57,16,56,116,7,134,58,117,130,145,65,79,166,15,67,218,62,248,97,118,151,10,38,219,163,202,197,177,67,244,61,14,252,63,196,122,69,76,75,22,245,61,103,8,38,21,177,188,14,55,135,114,243,154,127,111,165,201,140,94,217,154,52,93,175,54,171,192,112,75,189,144,203,63,120,10,216,143,50,50,206,96,152,53,253,125,231,48,161,13,158,49,87,207,68,63,198,32,63,61,76,98,117,52,79,146,216,251,240,158,30,116,87,210,130,247,9,103,53,45,138,251,131}
local c971068={}
local r4c5704={{0,3},{3,16},{19,5},{24,16},{40,51},{91,60},{151,41},{192,24}}
local mfe59ae={}
local iv577ab5=126
local d51e050=function(i)
 local c=c971068[i] if c then return c end
 local rr=r4c5704[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=iv577ab5
 for j=1,ln do
  local p=st+j
  local a=v409adb[p] local b=(61*p+51+3484496557*1.0*((p*p)%23))%251+145
  local kb=(b + prev*32)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 c971068[i]=t return t
end
local u41faf5
if table.unpack then u41faf5=table.unpack else u41faf5=unpack end
if not u41faf5 then u41faf5=unpack end
local P347d31=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m89db1c04bd"]=true
 return t
end
local q3a158d=function(t) return type(t)=="table" and t["m89db1c04bd"]==true end
local b91bb67={}
do
 local src={189,157,4,229,88,74,190,27,60,63,197,211,102,124,25,241,164,6,176,227,153,211,148,160,97,237,192,25,241,84,57,215,78,254,245,119,115,245,254,254,188,57,84,240,26,192,237,201,108,148,211,15,216,176,6,217,56,25,124,102,210,197,15,59,185,190,100,127,232,4,14,57,100,141,21,64,40,99,233,213,52,129,159,152,136,231,190,46,41,154,88,34,18,149,11,181,67,216,98,174,188,104,220,11,130,64,2,11,144,96,61,82,230,200,142,102,137,125,36,210,116,122,75,78,167,191,22,214,39,81,149,171,234,43,107,127,250,77,12,94,87,183,83,236,247,110,79,205,228,109,229,83,30,180,115,114,155,72,4,38,101,36,128,241,119,72,209,53,209,180,97,158,120,109,140,124,103,110,191,165,158,183,253,220,34,77,172,46,233,43,6,246,253,81,109,63,94,191,239,191,7,122,111,77,243,125,240,200,49,200,149,128,178,96,231,135,128,64,10,137,150,104,84,252,244,216,21,45,159,149,9,172,146,154,8,94,205,231,109,119,85,129,92,247,37,99,64,241,61,141,76,146,157,4,23,65,74,190,184,59,61,197,211,68,124,25,56,68,95,176,225,61,105,148,215,186,80,192,26,130,64,57,160,102,149,245,115,10,33,254,142,31,67,84,241,156,181,237,161,27,200,211,153,105,114,6,217,156,163,124,102,156,236,63,59,192,106,74,88,34,55,157,189,101,213,61,111,96,202,37,105,57,155,85,171,196,69,205,58,180,195,146,17,49,66,159,48,15,122,244,151,22,205,150,75,123,153,128,71,4,230,178,139,172,136,49,28,26,249,243,240,56,34,7,22,163,198,94,127,6,53,253,53,170,140,233,51,186,234,34,121,75,237,158,12,27,173,103,226,53,28,120,10}
 for i=1,#src do
  local a=src[(i)] local _junkeb8=0 local b=((i*i*65+i*24+96)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b91bb67[i]=r
 end
end
local K1076be={}
do
 local rp=1
 while rp<=#b91bb67 do
  local np=b91bb67[rp] + b91bb67[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b91bb67[rp] + b91bb67[rp+1]*256 rp=rp+2 end
  local va=(b91bb67[rp]==1) rp=rp+1
  local nc=b91bb67[rp] + b91bb67[rp+1]*256 + b91bb67[rp+2]*65536 + b91bb67[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b91bb67[rp] + b91bb67[rp+1]*256 + b91bb67[rp+2]*65536 + b91bb67[rp+3]*16777216
   rp=rp+4
  end
  K1076be[#K1076be+1]={c=cd,p=ps,v=va}
 end
end
local owb41d93={}
local rg532445={} local fr7fc8f9={} local fp8a4dae=0 local baf9618c=0 local to6df200=0 local nb01f4cb=0
local cu3171ce=nil local dncc69b0=false local rs1ca7c5={} local vfm2d387d={} local schf358be local ivkcaa062
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rg532445 st.fr=fr7fc8f9 st.fp=fp8a4dae st.ba=baf9618c st.to=to6df200 st.cu=cu3171ce st.co=w06f075 st.pc=i4344f1 st.sp=tc59a36 st.sc=yb7577d st.lk=L26e72a st.va=acfd933 st.nb=nb01f4cb st.dn=dncc69b0 st.rs=rs1ca7c5 end
local __vms_load_state=function(st) rg532445=st.rg or {} fr7fc8f9=st.fr or {} fp8a4dae=st.fp or 0 baf9618c=st.ba or 0 to6df200=st.to or 0 cu3171ce=st.cu w06f075=st.co i4344f1=st.pc or 1 tc59a36=st.sp or 0 yb7577d=st.sc or {{}} L26e72a=st.lk or {} acfd933=st.va nb01f4cb=st.nb or 0 dncc69b0=st.dn or false rs1ca7c5=st.rs or {} if fp8a4dae>0 then local q=fr7fc8f9[fp8a4dae] if not q or q.owner~=owb41d93 then error("VM_STATE_FRAME_OWNER",0) end if baf9618c~=q.base or to6df200~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local s5cb2ba=setmetatable({}, {__index=function(_,k) return rg532445[baf9618c+k] end, __newindex=function(_,k,v) rg532445[baf9618c+k]=v end})
local vf0b0542=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivkcaa062(d,...) end vfm2d387d[f]=d return f end
local pf5f8f82 local xf05c3eb local sfc0ea9e local lfeb94f5 local rt47a674
local R1d04f1
R1d04f1=function(x2ee615,L26e72a,...)
 fr7fc8f9={} fp8a4dae=0 nb01f4cb=0 dncc69b0=false rs1ca7c5={}
 __vms_root_state={}
 pf5f8f82=function(ci,links,args,retDest,nRet,caller,meta)
  local code=K1076be[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nb01f4cb,top=nb01f4cb+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nb01f4cb+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=owb41d93}
  nb01f4cb=nb01f4cb+512
  fp8a4dae=fp8a4dae+1 fr7fc8f9[fp8a4dae]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["m89db1c04bd"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sfc0ea9e=function(f) if not f then return end f.pc=i4344f1 f.base=baf9618c f.top=to6df200 f.sp=tc59a36 f.sc=yb7577d f.lk=L26e72a f.va=acfd933 f.sanext=cu3171ce.sanext f.sasizes=cu3171ce.sasizes end
 lfeb94f5=function(f) cu3171ce=f w06f075=K1076be[f.chunk] i4344f1=f.pc baf9618c=f.base to6df200=f.top tc59a36=f.sp yb7577d=f.sc L26e72a=f.lk acfd933=f.va end
 rt47a674=function(n,packed)
  local f=fr7fc8f9[fp8a4dae] local vals={}
  if packed then local p=s5cb2ba[tc59a36] local pn=(p and p.n) or 0 for i=1,n do vals[i]=s5cb2ba[tc59a36-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=s5cb2ba[tc59a36-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sfc0ea9e(f)
   for i=f.base,f.top do rg532445[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg532445[i]=nil end end
   fr7fc8f9[fp8a4dae]=nil fp8a4dae=fp8a4dae-1
   lfeb94f5(caller)
   local q={n=0} q["m89db1c04bd"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   tc59a36=meta.dest s5cb2ba[tc59a36]=q
   return
  end
  sfc0ea9e(f)
  rg532445[f.base]=rg532445[f.base]
  for i=f.base,f.top do rg532445[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg532445[i]=nil end end
  fr7fc8f9[fp8a4dae]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rs1ca7c5=vals dncc69b0=true return end
  fp8a4dae=fp8a4dae-1 local cf=fr7fc8f9[fp8a4dae]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lfeb94f5(cf)
  local d=f.retDest or (tc59a36+1)
  if f.nRet==0 then return end
  tc59a36=d-1
  if f.nRet==1 then tc59a36=d s5cb2ba[tc59a36]=vals[1] else local q={n=#vals} q["m89db1c04bd"]=true for i=1,#vals do q[i]=vals[i] end tc59a36=d s5cb2ba[tc59a36]=q end
 end
 pf5f8f82(x2ee615,L26e72a,{...},nil,0,nil)
  local f=fr7fc8f9[fp8a4dae]
  if not f then error("VM_FRAME_MISSING",0) end
  lfeb94f5(f)
 local hb1abc1={}
 hb1abc1[30980]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a - b
 end
 hb1abc1[49271]=function()
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=g5a4b30[d51e050(w06f075.c[i4344f1])] i4344f1=i4344f1+1
 end
 hb1abc1[7510]=function()
   local ix=w06f075.c[i4344f1] i4344f1=i4344f1+1
   s5cb2ba[tc59a36]=s5cb2ba[tc59a36][ix]
 end
 hb1abc1[55036]=function()
   local k=s5cb2ba[tc59a36] tc59a36=tc59a36-1 local t=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=t[k]
 end
 hb1abc1[23756]=function()
   local ci=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local links={}
   for i=1,#L26e72a do links[#links+1]=L26e72a[i] end
   for i=1,#yb7577d do links[#links+1]=yb7577d[i] end
   tc59a36=tc59a36+1
   s5cb2ba[tc59a36]=vf0b0542(ci,links)
 end
 hb1abc1[23068]=function()
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=false
 end
 hb1abc1[8919]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a + b
 end
 hb1abc1[2931]=function()
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=true
 end
 hb1abc1[8128]=function()
   local id=w06f075.c[i4344f1] local b=nil i4344f1=i4344f1+1
   for i=#L26e72a,1,-1 do b=L26e72a[i][id] if b then break end end
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=b and b[1]
 end
 hb1abc1[48332]=function()
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=d51e050(w06f075.c[i4344f1]) i4344f1=i4344f1+1
 end
 hb1abc1[7280]=function()
   local n=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local f=s5cb2ba[tc59a36-n]
   local a={}
   for j=1,n do a[j]=s5cb2ba[tc59a36-n+j] end
   tc59a36=tc59a36-n-1
   local la=n
   if la>0 and q3a158d(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm2d387d[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu3171ce local dest=tc59a36+1
    sfc0ea9e(caller)
    local vc=vd or f pf5f8f82(vc.chunk,vc.links,a,dest,1,caller)
    lfeb94f5(fr7fc8f9[fp8a4dae])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sfc0ea9e(cu3171ce) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P347d31(f(u41faf5(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lfeb94f5(cu3171ce) end
    tc59a36=tc59a36+1
    s5cb2ba[tc59a36]=r[1]
   end
 end
 hb1abc1[5572]=function()
   local id=w06f075.c[i4344f1] local v=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=nil tc59a36=tc59a36-1 i4344f1=i4344f1+1
   yb7577d[#yb7577d][id]={v}
 end
 hb1abc1[54393]=function()
   s5cb2ba[tc59a36]=s5cb2ba[tc59a36][3]
 end
 hb1abc1[6669]=function()
   if not acfd933 then local t={n=0} t["m89db1c04bd"]=true acfd933=t end
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=acfd933
 end
 hb1abc1[40552]=function()
   if not s5cb2ba[tc59a36] then i4344f1=w06f075.c[i4344f1] else i4344f1=i4344f1+1 s5cb2ba[tc59a36]=nil tc59a36=tc59a36-1 end
 end
 hb1abc1[25633]=function()
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]={}
 end
 hb1abc1[1954]=function()
   local ix=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local n=mfe59ae[ix]
   if not n then n=tonumber(d51e050(ix)) mfe59ae[ix]=n end
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=n
 end
 hb1abc1[52442]=function()
   local _mode=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local v=s5cb2ba[tc59a36] local idx=s5cb2ba[tc59a36-1] local b=s5cb2ba[tc59a36-2] tc59a36=tc59a36-3
   local f=cu3171ce local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rg532445[b+idx-1]=v
 end
 hb1abc1[49800]=function()
   local id=w06f075.c[i4344f1] local v=s5cb2ba[tc59a36] tc59a36=tc59a36-1 i4344f1=i4344f1+1
   local b=nil for i=#yb7577d,1,-1 do b=yb7577d[i][id] if b then break end end
   if b then b[1]=v end
 end
 hb1abc1[55695]=function()
   s5cb2ba[tc59a36]=-s5cb2ba[tc59a36]
 end
 hb1abc1[55075]=function()
   local _mode=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local idx=s5cb2ba[tc59a36] local b=s5cb2ba[tc59a36-1] tc59a36=tc59a36-2
   local f=cu3171ce local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then tc59a36=tc59a36+1 s5cb2ba[tc59a36]=nil else tc59a36=tc59a36+1 s5cb2ba[tc59a36]=rg532445[b+idx-1] end
 end
 hb1abc1[10030]=function()
   local n=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local f=cu3171ce local b=f.sanext or (baf9618c+256) local lim=baf9618c+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n to6df200=math.max(to6df200,baf9618c+255)
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=b
 end
 hb1abc1[27739]=function()
   local v=s5cb2ba[tc59a36] local k=s5cb2ba[tc59a36-1] local t=s5cb2ba[tc59a36-2] t[k]=v tc59a36=tc59a36-3
 end
 hb1abc1[34196]=function()
   local p=s5cb2ba[tc59a36] tc59a36=tc59a36-1 local t=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=nil tc59a36=tc59a36-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 hb1abc1[55902]=function()
   s5cb2ba[tc59a36]=not s5cb2ba[tc59a36]
 end
 hb1abc1[10574]=function()
 end
 hb1abc1[12647]=function()
   local b=s5cb2ba[tc59a36] local n=cu3171ce.sasizes and cu3171ce.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end s5cb2ba[tc59a36]=n
 end
 hb1abc1[47501]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a >= b
 end
 hb1abc1[38173]=function()
   s5cb2ba[tc59a36]=#s5cb2ba[tc59a36]
 end
 hb1abc1[5235]=function()
   yb7577d[#yb7577d]=nil
 end
 hb1abc1[45888]=function()
   s5cb2ba[tc59a36]=s5cb2ba[tc59a36][2]
 end
 hb1abc1[58627]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 hb1abc1[33939]=function()
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=s5cb2ba[tc59a36-1]
 end
 hb1abc1[48411]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a == b
 end
 hb1abc1[16824]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a < b
 end
 hb1abc1[42816]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a ^ b
 end
 hb1abc1[43336]=function()
   local n=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local f=s5cb2ba[tc59a36-n]
   local a={}
   for j=1,n do a[j]=s5cb2ba[tc59a36-n+j] end
   tc59a36=tc59a36-n-1
   local la=n
   if la>0 and q3a158d(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm2d387d[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu3171ce local dest=tc59a36+1
    sfc0ea9e(caller)
    local vc=vd or f pf5f8f82(vc.chunk,vc.links,a,dest,-1,caller)
    lfeb94f5(fr7fc8f9[fp8a4dae])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sfc0ea9e(cu3171ce) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P347d31(f(u41faf5(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lfeb94f5(cu3171ce) end
    tc59a36=tc59a36+1
    s5cb2ba[tc59a36]=r
   end
 end
 hb1abc1[6655]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a ~= b
 end
 hb1abc1[42410]=function()
   local _n=(s5cb2ba[tc59a36]==nil) s5cb2ba[tc59a36]=nil tc59a36=tc59a36-1 if _n then i4344f1=w06f075.c[i4344f1] else i4344f1=i4344f1+1 end
 end
 hb1abc1[29137]=function()
   local n=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local a={} for j=1,n do a[j]=s5cb2ba[tc59a36-n+j] end tc59a36=tc59a36-n-1
   local la=n if la>0 and q3a158d(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm2d387d[f]
   if vd then
    local caller=cu3171ce local dest=tc59a36+1 sfc0ea9e(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf5f8f82(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lfeb94f5(fr7fc8f9[fp8a4dae])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],u41faf5(a,3,la)) else ok,rr=pcall(f,u41faf5(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["m89db1c04bd"]=true q[1]=ok q[2]=rr tc59a36=tc59a36+1 s5cb2ba[tc59a36]=q
   end
 end
 hb1abc1[55801]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a * b
 end
 hb1abc1[4981]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a + b
 end
 hb1abc1[41548]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a .. b
 end
 hb1abc1[22604]=function()
   local ix=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local n=mfe59ae[ix] if not n then n=tonumber(d51e050(ix)) mfe59ae[ix]=n end
   s5cb2ba[tc59a36]=s5cb2ba[tc59a36]*n
 end
 hb1abc1[10057]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a % b
 end
 hb1abc1[20423]=function()
   if s5cb2ba[tc59a36] then i4344f1=w06f075.c[i4344f1] else i4344f1=i4344f1+1 s5cb2ba[tc59a36]=nil tc59a36=tc59a36-1 end
 end
 hb1abc1[32201]=function()
   g5a4b30[d51e050(w06f075.c[i4344f1])]=s5cb2ba[tc59a36] tc59a36=tc59a36-1 i4344f1=i4344f1+1
 end
 hb1abc1[22529]=function()
   local id=w06f075.c[i4344f1] local v=s5cb2ba[tc59a36] tc59a36=tc59a36-1 i4344f1=i4344f1+1
   local b=nil for i=#L26e72a,1,-1 do b=L26e72a[i][id] if b then break end end
   if b then b[1]=v end
 end
 hb1abc1[18990]=function()
   local id=w06f075.c[i4344f1] local b=nil i4344f1=i4344f1+1
   for i=#yb7577d,1,-1 do b=yb7577d[i][id] if b then break end end
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=b and b[1]
 end
 hb1abc1[30086]=function()
   yb7577d[#yb7577d+1]={}
 end
 hb1abc1[50156]=function()
   i4344f1=w06f075.c[i4344f1]
 end
 hb1abc1[26181]=function()
   s5cb2ba[tc59a36]=s5cb2ba[tc59a36][1]
 end
 hb1abc1[22941]=function()
   local n=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local a={} for j=1,n do a[j]=s5cb2ba[tc59a36-n+j] end tc59a36=tc59a36-n-1
   local la=n if la>0 and q3a158d(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm2d387d[f]
   if vd then
    local caller=cu3171ce local dest=tc59a36+1 sfc0ea9e(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf5f8f82(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lfeb94f5(fr7fc8f9[fp8a4dae])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],u41faf5(a,3,la)) else ok,rr=pcall(f,u41faf5(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["m89db1c04bd"]=true q[1]=ok q[2]=rr tc59a36=tc59a36+1 s5cb2ba[tc59a36]=q
   end
 end
 hb1abc1[12072]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a > b
 end
 hb1abc1[34452]=function()
   local n=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local f=s5cb2ba[tc59a36-n] local a={} for j=1,n do a[j]=s5cb2ba[tc59a36-n+j] end tc59a36=tc59a36-n-1
   local la=n if la>0 and q3a158d(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfm2d387d[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cu3171ce local base0=baf9618c local top0=to6df200 local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rg532445[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rg532445[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=owb41d93}
    local cc=K1076be[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["m89db1c04bd"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    fr7fc8f9[fp8a4dae]=nf lfeb94f5(nf)
   else
    local r=P347d31(f(u41faf5(a,1,la))) tc59a36=tc59a36+1 s5cb2ba[tc59a36]=r rt47a674(0,true)
   end
 end
 hb1abc1[47976]=function()
   s5cb2ba[tc59a36]=nil tc59a36=tc59a36-1
 end
 hb1abc1[47780]=function()
   s5cb2ba[tc59a36],s5cb2ba[tc59a36-1]=s5cb2ba[tc59a36-1],s5cb2ba[tc59a36]
 end
 hb1abc1[14742]=function()
   local n=w06f075.c[i4344f1] i4344f1=i4344f1+1
   rt47a674(n,false)
 end
 hb1abc1[31423]=function()
   local _v=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=nil tc59a36=tc59a36-1 if not _v then i4344f1=w06f075.c[i4344f1] else i4344f1=i4344f1+1 end
 end
 hb1abc1[57549]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a / b
 end
 hb1abc1[19586]=function()
   local n=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local pt=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=nil tc59a36=tc59a36-1
   for j=1,n do tc59a36=tc59a36+1 s5cb2ba[tc59a36]=pt[j] end
 end
 hb1abc1[38015]=function()
   local k=w06f075.c[i4344f1] i4344f1=i4344f1+1
   rt47a674(k,true)
 end
 hb1abc1[27624]=function()
   local ix=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local n=mfe59ae[ix] if not n then n=tonumber(d51e050(ix)) mfe59ae[ix]=n end
   s5cb2ba[tc59a36]=s5cb2ba[tc59a36]+n
 end
 hb1abc1[56549]=function()
   local _v=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=nil tc59a36=tc59a36-1 if _v then i4344f1=w06f075.c[i4344f1] else i4344f1=i4344f1+1 end
 end
 hb1abc1[13258]=function()
   local k=s5cb2ba[tc59a36] tc59a36=tc59a36-1 local t=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=t[k]
 end
 hb1abc1[45422]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a * b
 end
 hb1abc1[54798]=function()
   local b=s5cb2ba[tc59a36] local a=s5cb2ba[tc59a36-1] tc59a36=tc59a36-1
   s5cb2ba[tc59a36]=a <= b
 end
 hb1abc1[16458]=function()
   local ix=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local k=d51e050(ix) local v=hg7088ad[k] if v==nil then v=g5a4b30[k] hg7088ad[k]=v end
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=v
 end
 hb1abc1[45331]=function()
   tc59a36=tc59a36+1 s5cb2ba[tc59a36]=nil
 end
 hb1abc1[61393]=function()
  local k=s5cb2ba[tc59a36] tc59a36=tc59a36-1 local t=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=t[k]
 end
 hb1abc1[62504]=function()
  local k=s5cb2ba[tc59a36] tc59a36=tc59a36-1 local t=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=t[k]
 end
 hb1abc1[63732]=function()
  i4344f1=w06f075.c[i4344f1]
 end
 hb1abc1[63898]=function()
  local t=s5cb2ba[tc59a36] s5cb2ba[tc59a36]=t
 end
 hb1abc1[61183]=function()
  tc59a36=tc59a36+1 s5cb2ba[tc59a36]=d51e050(w06f075.c[i4344f1]) i4344f1=i4344f1+1
 end
 schf358be=function(stop)
  while fp8a4dae>stop and not dncc69b0 do
   local f=fr7fc8f9[fp8a4dae] if not f then error("VM_FRAME_MISSING",0) end
   lfeb94f5(f)
   if fp8a4dae<1 or fp8a4dae>#fr7fc8f9 or fr7fc8f9[fp8a4dae]~=cu3171ce then error("VM_STATE_FP",0) end
   if cu3171ce.owner~=owb41d93 then error("VM_STATE_FRAME_OWNER",0) end
   if w06f075~=K1076be[cu3171ce.chunk] then error("VM_STATE_CODE",0) end
   if i4344f1%1~=0 or i4344f1<1 or i4344f1>#w06f075.c then error("VM_STATE_PC",0) end
   if baf9618c%1~=0 or to6df200%1~=0 or baf9618c<0 or to6df200<baf9618c or to6df200>baf9618c+255 then error("VM_STATE_BOUNDS",0) end
   if tc59a36%1~=0 or tc59a36<0 or tc59a36>to6df200-baf9618c then error("VM_STATE_SP",0) end
   local oc2f423=w06f075.c[i4344f1] i4344f1=i4344f1+1
   local _fn=hb1abc1[oc2f423]
   local _yieldop=(oc2f423==7280 or oc2f423==43336)
   local _ok,_err=true,nil
   if _yieldop and not (cu3171ce and cu3171ce.prot) then if _fn then _fn() else error("bad opcode "..tostring(oc2f423),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(oc2f423),0) end end) end
   if not _ok then
    local handled=false local ei=fp8a4dae
    while ei>stop do
     local ef=fr7fc8f9[ei] local meta=ef and ef.prot
     if meta then
      for k=fp8a4dae,ei+1,-1 do local z=fr7fc8f9[k] if z then for j=z.base,z.top do rg532445[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rg532445[j]=nil end end end fr7fc8f9[k]=nil end
      fp8a4dae=ei lfeb94f5(fr7fc8f9[fp8a4dae])
      local bad=fr7fc8f9[fp8a4dae] local caller=meta.caller fr7fc8f9[fp8a4dae]=nil fp8a4dae=fp8a4dae-1
      for j=bad.base,bad.top do rg532445[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rg532445[j]=nil end end
      if meta.kind=="xpcall" then lfeb94f5(caller) local hf=vfm2d387d[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf5f8f82(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["m89db1c04bd"]=true q[1]=false q[2]=hr tc59a36=meta.dest s5cb2ba[tc59a36]=q end else lfeb94f5(caller) local q={n=2} q["m89db1c04bd"]=true q[1]=false q[2]=_err tc59a36=meta.dest s5cb2ba[tc59a36]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dncc69b0 then sfc0ea9e(cu3171ce) end
  end
 end
 ivkcaa062=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if fr7fc8f9==st.fr and fp8a4dae>0 then __vms_save_state(st) end __vms_load_state(st)
   if fp8a4dae==0 then
    pf5f8f82(d.chunk,d.links,{...},nil,0,nil)
    schf358be(0)
    local rr=rs1ca7c5 or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return u41faf5(rr)
   end
   local stop=fp8a4dae local caller=fr7fc8f9[fp8a4dae] sfc0ea9e(caller)
   pf5f8f82(d.chunk,d.links,{...},tc59a36+1,0,caller)
   schf358be(stop)
   local cf=fr7fc8f9[fp8a4dae] lfeb94f5(cf) local rr=cf.lastResult or {} cf.lastResult=nil return u41faf5(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fp8a4dae local caller=fr7fc8f9[fp8a4dae]
  sfc0ea9e(caller)
  pf5f8f82(d.chunk,d.links,{...},0,0,caller)
  schf358be(stop)
  local cf=fr7fc8f9[fp8a4dae] lfeb94f5(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return u41faf5(rr)
 end
 schf358be(0)
 return u41faf5(rs1ca7c5)
end
do
 local ok,err=pcall(R1d04f1,1,{})
 if not ok then error(err,0) end
end