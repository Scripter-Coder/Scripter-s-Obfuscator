-- 10c557a06f9646c4 | DO NOT EDIT
local _d9fb6fd=function(a002144,b734f76,...)
 while true do
  local _s9074={} local _t4a3c=0
  local _y523a={{}}
  local _i3087=1
  local _wa141=a002144[b734f76]
  local od2ceed=_wa141.c[_i3087]
  if od2ceed==1 then _s9074[_t4a3c]="x" end
 end
end
local _b024d={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _r30d6={{1,41}}
local d09e548=function(i) local a=_b024d[1] local rr=_r30d6[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _b024d2={214,17,239,131,189,168} do local rp=1 while rp<=#_b024d2 do local np=_b024d2[rp]+_b024d2[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_b024d2[rp]+_b024d2[rp+1]*256 rp=rp+2 end local va=(_b024d2[rp]==1) rp=rp+1 local nc=_b024d2[rp]+_b024d2[rp+1]*256+_b024d2[rp+2]*65536+_b024d2[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_b024d2[rp]+_b024d2[rp+1]*256+_b024d2[rp+2]*65536+_b024d2[rp+3]*16777216 rp=rp+4 end end end
end
local gbf7409=_G
if getfenv then local _le=getfenv(0) if _le then gbf7409=_le end end
local hgae1837={}
if getgenv then gbf7409=getgenv() end
if not gbf7409 then gbf7409=_G end
local v4ff59c={126,181,183,37,48,206,232,107,165,150,211,21,70,192,125,169,209,229,7,153,46,41,82,7,136,110,164,29,176,181,187,10,115,95,127,65,15,64,7,167,122,10,45,178,67,67,244,168,158,179,74,22,5,154,103,207,84,2,37,254,34,244,118,115,83,103,234,179,192,86,42,70,235,184,82,145,112,116,224,154,187,212,187,110,208,93,238,171,121,155,115,60,220,54,128,70,180,9,123,194,50,101,32,197,95,51,83,115,132,131,152,77,127,158,241,64,21,32,238,248,143,199,187,244,63,198,91,160,230,156,84,126,237,56,181,172,155,125,185,55}
local cc6413b={}
local rdab7c3={{0,1},{1,1},{2,1},{3,1},{4,5},{9,1},{10,1},{11,38},{49,57},{106,34}}
local m6095c8={}
local ivfdf3e9=17
local d0dcf97=function(i)
 local c=cc6413b[i] if c then return c end
 local rr=rdab7c3[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=ivfdf3e9
 for j=1,ln do
  local p=st+j
  local a=v4ff59c[p] local b=(131*p+155+2399567269*1.0*((p*p)%26))%251+132
  local kb=(b + prev*98)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 cc6413b[i]=t return t
end
local u646e40
if table.unpack then u646e40=table.unpack else u646e40=unpack end
if not u646e40 then u646e40=unpack end
local P2d93be=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m8589b4a0df"]=true
 return t
end
local qe9d594=function(t) return type(t)=="table" and t["m8589b4a0df"]==true end
local b0907fd={}
do
 local src={120,22,239,48,112,19,241,128,116,36,12,83,254,73,54,151,203,130,116,167,29,207,198,24,80,53,49,111,233,170,171,95,251,56,62,239,190,213,224,49,187,139,155,55,245,85,106,190,89,51,77,83,93,37,68,160,71,43,79,86,117,69,110,211,133,115,161,167,75,181,232,41,254,16,72,197,125,122,183,229,131,248,63,192,136,143,214,150,53,58,134,17,227,244,74,95,123,199,34,100,230,174,14,168,137,169,14,90,136,184,34,192,177,219,74,112,41,23,134,174,30,98,214,57,155,193,63,249,246,57,183,15,76,192,72,205,80,96,232,181,194,20,161,115,133,214,90,69,92,179,0,226,71,163,177,49,70,167,159,143,89,191,145,100,128,235,231,230,187,48,20,206,15,132,226,54,114,236,200,197,233,109,20,164,121,253,197,18,29,166,143,71,208,99,32,215,156,52,42,42,124,25,142,46,112,18,160,223,120,31,79,203,148,64,89,105,196,117,26,250,13,190,160,189,101,32,130,12,209,145,7,3,86,27,126,48,234,180,224,88,151,102,195,215,88,44,56,79,45,6,188,78,22,239,117,18,19,241,102,65,36,12,151,170,73,54,108,175,130,116,63,71,207,198,216,77,53,49,206,223,170,171,117,40,56,62,205,233,213,224,76,214,139,155,128,49,85,106,62,65,51,77,51,9,37,68,28,58,43,79,112,153,69,110,11,240,115,161,116,228,181,232,225,0,16,72,53,105,122,183,204,226,248,63,52,156,143,214,116,176,58,134,3,180,244,74,7,196,199,34,109,202,174,14,77,84,169,14,172,147,152,34,225,177,218,96,244,227,23,111,101,46,98,175,215,136,193,131,34,246,57,138,83,125,192,179,33,24,96,87,200,194,20,181,36,133,215,250,10,92,179,236,29,71,163,153,109,70,167,217,124,89,191,217,220,128,235,88,78,187,48,221,252,15,132,226,54,114,236,24,35,233,109,102,135,121,253,117,70,29,166,109,250,208,99,228,245,156,52,208,42,124,25,35,175,112,18,147,123,120,31,127,117,148,64,80,53,196,117,30,76,13,190,205,178,101,32,84,159,209,145,77,164,86,27,95,88,234,180,47,7,151,102,145,25,88,44,187,81,45,6,163,162,22,239,132,162,19,241,143,174,36,12,160,211,73,54,8,97,130,116,107,152,207,198,230,93,53,49,208,0,170,171,153,67,56,62,135,15,199,224,26,187,206,155,234,165,85,106,191,154,246,77,167,151,79,68,163,138,174,79,179,250,243,110,215,125,211,161,20,166,221,232,96,12,71,72,192,148,37,183,57,2,227,63,193,145,247,214,98,112,111,134,23,132,150,74,219,214,165,34,184,247,198,14,169,114,152,14,174,239,213,34,199,37,235,74,244,24,38,134,58,213,167,214,143,112,97,63,248,249,70,183,122,152,233,72,16,252,189,232,181,244,71,161,115,147,73,110,69,137,234,79,43,244,42,68,37,245,46,77,51,255,9,106,85,207,34,155,139,29,134,224,213,81,209,62,56,10,55,171,170,85,183,49,53,182,107,198,207,24,223,116,130,165,82,54,73}
 for i=1,#src do
  local a=src[(i)] local _junk392=0 local b=((i*i*32+i*57+278)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b0907fd[i]=r
 end
end
local Kbd9c51={}
do
 local rp=1
 while rp<=#b0907fd do
  local np=b0907fd[rp] + b0907fd[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b0907fd[rp] + b0907fd[rp+1]*256 rp=rp+2 end
  local va=(b0907fd[rp]==1) rp=rp+1
  local nc=b0907fd[rp] + b0907fd[rp+1]*256 + b0907fd[rp+2]*65536 + b0907fd[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b0907fd[rp] + b0907fd[rp+1]*256 + b0907fd[rp+2]*65536 + b0907fd[rp+3]*16777216
   rp=rp+4
  end
  Kbd9c51[#Kbd9c51+1]={c=cd,p=ps,v=va}
 end
end
local ow5f68ab={}
local rg895381={} local fr070ce3={} local fp2d2122=0 local ba4231d5=0 local to2b3d0e=0 local nb80c560=0
local cu073ad5=nil local dnca63aa=false local rs25e6ea={} local vfm4b747e={} local schcaef1a local ivk2d3705
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rg895381 st.fr=fr070ce3 st.fp=fp2d2122 st.ba=ba4231d5 st.to=to2b3d0e st.cu=cu073ad5 st.co=w375831 st.pc=i53a895 st.sp=t106283 st.sc=y8e964f st.lk=L292b8c st.va=a91e06a st.nb=nb80c560 st.dn=dnca63aa st.rs=rs25e6ea end
local __vms_load_state=function(st) rg895381=st.rg or {} fr070ce3=st.fr or {} fp2d2122=st.fp or 0 ba4231d5=st.ba or 0 to2b3d0e=st.to or 0 cu073ad5=st.cu w375831=st.co i53a895=st.pc or 1 t106283=st.sp or 0 y8e964f=st.sc or {{}} L292b8c=st.lk or {} a91e06a=st.va nb80c560=st.nb or 0 dnca63aa=st.dn or false rs25e6ea=st.rs or {} if fp2d2122>0 then local q=fr070ce3[fp2d2122] if not q or q.owner~=ow5f68ab then error("VM_STATE_FRAME_OWNER",0) end if ba4231d5~=q.base or to2b3d0e~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local s8818ee=setmetatable({}, {__index=function(_,k) return rg895381[ba4231d5+k] end, __newindex=function(_,k,v) rg895381[ba4231d5+k]=v end})
local vf20650c=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivk2d3705(d,...) end vfm4b747e[f]=d return f end
local pf8b9df4 local xfd2c43c local sfeb2ca4 local lf8f7057 local rt932ceb
local Rd95336
Rd95336=function(xa0e5e1,L292b8c,...)
 fr070ce3={} fp2d2122=0 nb80c560=0 dnca63aa=false rs25e6ea={}
 __vms_root_state={}
 pf8b9df4=function(ci,links,args,retDest,nRet,caller,meta)
  local code=Kbd9c51[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nb80c560,top=nb80c560+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nb80c560+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=ow5f68ab}
  nb80c560=nb80c560+512
  fp2d2122=fp2d2122+1 fr070ce3[fp2d2122]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["m8589b4a0df"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sfeb2ca4=function(f) if not f then return end f.pc=i53a895 f.base=ba4231d5 f.top=to2b3d0e f.sp=t106283 f.sc=y8e964f f.lk=L292b8c f.va=a91e06a f.sanext=cu073ad5.sanext f.sasizes=cu073ad5.sasizes end
 lf8f7057=function(f) cu073ad5=f w375831=Kbd9c51[f.chunk] i53a895=f.pc ba4231d5=f.base to2b3d0e=f.top t106283=f.sp y8e964f=f.sc L292b8c=f.lk a91e06a=f.va end
 rt932ceb=function(n,packed)
  local f=fr070ce3[fp2d2122] local vals={}
  if packed then local p=s8818ee[t106283] local pn=(p and p.n) or 0 for i=1,n do vals[i]=s8818ee[t106283-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=s8818ee[t106283-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sfeb2ca4(f)
   for i=f.base,f.top do rg895381[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg895381[i]=nil end end
   fr070ce3[fp2d2122]=nil fp2d2122=fp2d2122-1
   lf8f7057(caller)
   local q={n=0} q["m8589b4a0df"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   t106283=meta.dest s8818ee[t106283]=q
   return
  end
  sfeb2ca4(f)
  rg895381[f.base]=rg895381[f.base]
  for i=f.base,f.top do rg895381[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg895381[i]=nil end end
  fr070ce3[fp2d2122]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rs25e6ea=vals dnca63aa=true return end
  fp2d2122=fp2d2122-1 local cf=fr070ce3[fp2d2122]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf8f7057(cf)
  local d=f.retDest or (t106283+1)
  if f.nRet==0 then return end
  t106283=d-1
  if f.nRet==1 then t106283=d s8818ee[t106283]=vals[1] else local q={n=#vals} q["m8589b4a0df"]=true for i=1,#vals do q[i]=vals[i] end t106283=d s8818ee[t106283]=q end
 end
 pf8b9df4(xa0e5e1,L292b8c,{...},nil,0,nil)
  local f=fr070ce3[fp2d2122]
  if not f then error("VM_FRAME_MISSING",0) end
  lf8f7057(f)
 local h62ea7d={}
 h62ea7d[3804]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a - b
 end
 h62ea7d[27345]=function()
   t106283=t106283+1 s8818ee[t106283]=true
 end
 h62ea7d[9824]=function()
   local ix=w375831.c[i53a895] i53a895=i53a895+1
   local k=d0dcf97(ix) local v=hgae1837[k] if v==nil then v=gbf7409[k] hgae1837[k]=v end
   t106283=t106283+1 s8818ee[t106283]=v
 end
 h62ea7d[26724]=function()
   local _v=s8818ee[t106283] s8818ee[t106283]=nil t106283=t106283-1 if not _v then i53a895=w375831.c[i53a895] else i53a895=i53a895+1 end
 end
 h62ea7d[13349]=function()
   t106283=t106283+1 s8818ee[t106283]=nil
 end
 h62ea7d[30981]=function()
   local b=s8818ee[t106283] local n=cu073ad5.sasizes and cu073ad5.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end s8818ee[t106283]=n
 end
 h62ea7d[56579]=function()
   y8e964f[#y8e964f+1]={}
 end
 h62ea7d[14699]=function()
   local ix=w375831.c[i53a895] i53a895=i53a895+1
   local n=m6095c8[ix] if not n then n=tonumber(d0dcf97(ix)) m6095c8[ix]=n end
   s8818ee[t106283]=s8818ee[t106283]*n
 end
 h62ea7d[48338]=function()
   local _n=(s8818ee[t106283]==nil) s8818ee[t106283]=nil t106283=t106283-1 if _n then i53a895=w375831.c[i53a895] else i53a895=i53a895+1 end
 end
 h62ea7d[55996]=function()
   s8818ee[t106283]=s8818ee[t106283][1]
 end
 h62ea7d[50627]=function()
   s8818ee[t106283]=s8818ee[t106283][2]
 end
 h62ea7d[22997]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a > b
 end
 h62ea7d[13987]=function()
   y8e964f[#y8e964f]=nil
 end
 h62ea7d[40788]=function()
   local n=w375831.c[i53a895] i53a895=i53a895+1
   local f=s8818ee[t106283-n]
   local a={}
   for j=1,n do a[j]=s8818ee[t106283-n+j] end
   t106283=t106283-n-1
   local la=n
   if la>0 and qe9d594(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm4b747e[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu073ad5 local dest=t106283+1
    sfeb2ca4(caller)
    local vc=vd or f pf8b9df4(vc.chunk,vc.links,a,dest,-1,caller)
    lf8f7057(fr070ce3[fp2d2122])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sfeb2ca4(cu073ad5) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P2d93be(f(u646e40(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf8f7057(cu073ad5) end
    t106283=t106283+1
    s8818ee[t106283]=r
   end
 end
 h62ea7d[10557]=function()
   local _mode=w375831.c[i53a895] i53a895=i53a895+1
   local idx=s8818ee[t106283] local b=s8818ee[t106283-1] t106283=t106283-2
   local f=cu073ad5 local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then t106283=t106283+1 s8818ee[t106283]=nil else t106283=t106283+1 s8818ee[t106283]=rg895381[b+idx-1] end
 end
 h62ea7d[56804]=function()
   local id=w375831.c[i53a895] local b=nil i53a895=i53a895+1
   for i=#L292b8c,1,-1 do b=L292b8c[i][id] if b then break end end
   t106283=t106283+1 s8818ee[t106283]=b and b[1]
 end
 h62ea7d[29161]=function()
   local _v=s8818ee[t106283] s8818ee[t106283]=nil t106283=t106283-1 if _v then i53a895=w375831.c[i53a895] else i53a895=i53a895+1 end
 end
 h62ea7d[35251]=function()
   local v=s8818ee[t106283] local k=s8818ee[t106283-1] local t=s8818ee[t106283-2] t[k]=v t106283=t106283-3
 end
 h62ea7d[59837]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a * b
 end
 h62ea7d[3622]=function()
   local p=s8818ee[t106283] t106283=t106283-1 local t=s8818ee[t106283] s8818ee[t106283]=nil t106283=t106283-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 h62ea7d[32527]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a >= b
 end
 h62ea7d[6273]=function()
   s8818ee[t106283],s8818ee[t106283-1]=s8818ee[t106283-1],s8818ee[t106283]
 end
 h62ea7d[45655]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a ^ b
 end
 h62ea7d[2201]=function()
   t106283=t106283+1 s8818ee[t106283]={}
 end
 h62ea7d[21302]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a % b
 end
 h62ea7d[40470]=function()
   local k=w375831.c[i53a895] i53a895=i53a895+1
   rt932ceb(k,true)
 end
 h62ea7d[41208]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a < b
 end
 h62ea7d[50683]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a + b
 end
 h62ea7d[10725]=function()
   local ix=w375831.c[i53a895] i53a895=i53a895+1
   local n=m6095c8[ix]
   if not n then n=tonumber(d0dcf97(ix)) m6095c8[ix]=n end
   t106283=t106283+1 s8818ee[t106283]=n
 end
 h62ea7d[7156]=function()
   t106283=t106283+1 s8818ee[t106283]=d0dcf97(w375831.c[i53a895]) i53a895=i53a895+1
 end
 h62ea7d[38607]=function()
   local n=w375831.c[i53a895] i53a895=i53a895+1
   local a={} for j=1,n do a[j]=s8818ee[t106283-n+j] end t106283=t106283-n-1
   local la=n if la>0 and qe9d594(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm4b747e[f]
   if vd then
    local caller=cu073ad5 local dest=t106283+1 sfeb2ca4(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf8b9df4(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf8f7057(fr070ce3[fp2d2122])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],u646e40(a,3,la)) else ok,rr=pcall(f,u646e40(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["m8589b4a0df"]=true q[1]=ok q[2]=rr t106283=t106283+1 s8818ee[t106283]=q
   end
 end
 h62ea7d[12436]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a + b
 end
 h62ea7d[47331]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a * b
 end
 h62ea7d[28028]=function()
   local n=w375831.c[i53a895] i53a895=i53a895+1
   local pt=s8818ee[t106283] s8818ee[t106283]=nil t106283=t106283-1
   for j=1,n do t106283=t106283+1 s8818ee[t106283]=pt[j] end
 end
 h62ea7d[25191]=function()
   t106283=t106283+1 s8818ee[t106283]=s8818ee[t106283-1]
 end
 h62ea7d[28515]=function()
   local id=w375831.c[i53a895] local v=s8818ee[t106283] t106283=t106283-1 i53a895=i53a895+1
   local b=nil for i=#y8e964f,1,-1 do b=y8e964f[i][id] if b then break end end
   if b then b[1]=v end
 end
 h62ea7d[5046]=function()
   local n=w375831.c[i53a895] i53a895=i53a895+1
   local f=s8818ee[t106283-n]
   local a={}
   for j=1,n do a[j]=s8818ee[t106283-n+j] end
   t106283=t106283-n-1
   local la=n
   if la>0 and qe9d594(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm4b747e[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu073ad5 local dest=t106283+1
    sfeb2ca4(caller)
    local vc=vd or f pf8b9df4(vc.chunk,vc.links,a,dest,1,caller)
    lf8f7057(fr070ce3[fp2d2122])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sfeb2ca4(cu073ad5) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P2d93be(f(u646e40(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf8f7057(cu073ad5) end
    t106283=t106283+1
    s8818ee[t106283]=r[1]
   end
 end
 h62ea7d[21854]=function()
   s8818ee[t106283]=not s8818ee[t106283]
 end
 h62ea7d[30172]=function()
   local id=w375831.c[i53a895] local b=nil i53a895=i53a895+1
   for i=#y8e964f,1,-1 do b=y8e964f[i][id] if b then break end end
   t106283=t106283+1 s8818ee[t106283]=b and b[1]
 end
 h62ea7d[9243]=function()
   s8818ee[t106283]=-s8818ee[t106283]
 end
 h62ea7d[24553]=function()
   local n=w375831.c[i53a895] i53a895=i53a895+1
   local a={} for j=1,n do a[j]=s8818ee[t106283-n+j] end t106283=t106283-n-1
   local la=n if la>0 and qe9d594(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm4b747e[f]
   if vd then
    local caller=cu073ad5 local dest=t106283+1 sfeb2ca4(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf8b9df4(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf8f7057(fr070ce3[fp2d2122])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],u646e40(a,3,la)) else ok,rr=pcall(f,u646e40(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["m8589b4a0df"]=true q[1]=ok q[2]=rr t106283=t106283+1 s8818ee[t106283]=q
   end
 end
 h62ea7d[5365]=function()
   gbf7409[d0dcf97(w375831.c[i53a895])]=s8818ee[t106283] t106283=t106283-1 i53a895=i53a895+1
 end
 h62ea7d[32191]=function()
   local k=s8818ee[t106283] t106283=t106283-1 local t=s8818ee[t106283] s8818ee[t106283]=t[k]
 end
 h62ea7d[22292]=function()
   local id=w375831.c[i53a895] local v=s8818ee[t106283] t106283=t106283-1 i53a895=i53a895+1
   local b=nil for i=#L292b8c,1,-1 do b=L292b8c[i][id] if b then break end end
   if b then b[1]=v end
 end
 h62ea7d[51844]=function()
   local k=s8818ee[t106283] t106283=t106283-1 local t=s8818ee[t106283] s8818ee[t106283]=t[k]
 end
 h62ea7d[12661]=function()
   s8818ee[t106283]=nil t106283=t106283-1
 end
 h62ea7d[45419]=function()
   local id=w375831.c[i53a895] local v=s8818ee[t106283] s8818ee[t106283]=nil t106283=t106283-1 i53a895=i53a895+1
   y8e964f[#y8e964f][id]={v}
 end
 h62ea7d[40422]=function()
   if s8818ee[t106283] then i53a895=w375831.c[i53a895] else i53a895=i53a895+1 s8818ee[t106283]=nil t106283=t106283-1 end
 end
 h62ea7d[37157]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a .. b
 end
 h62ea7d[18653]=function()
   local n=w375831.c[i53a895] i53a895=i53a895+1
   rt932ceb(n,false)
 end
 h62ea7d[56184]=function()
 end
 h62ea7d[15743]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a ~= b
 end
 h62ea7d[36875]=function()
   local ix=w375831.c[i53a895] i53a895=i53a895+1
   local n=m6095c8[ix] if not n then n=tonumber(d0dcf97(ix)) m6095c8[ix]=n end
   s8818ee[t106283]=s8818ee[t106283]+n
 end
 h62ea7d[2705]=function()
   i53a895=w375831.c[i53a895]
 end
 h62ea7d[51535]=function()
   s8818ee[t106283]=#s8818ee[t106283]
 end
 h62ea7d[53910]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a / b
 end
 h62ea7d[30745]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 h62ea7d[23193]=function()
   local ix=w375831.c[i53a895] i53a895=i53a895+1
   s8818ee[t106283]=s8818ee[t106283][ix]
 end
 h62ea7d[20543]=function()
   t106283=t106283+1 s8818ee[t106283]=false
 end
 h62ea7d[20372]=function()
   local ci=w375831.c[i53a895] i53a895=i53a895+1
   local links={}
   for i=1,#L292b8c do links[#links+1]=L292b8c[i] end
   for i=1,#y8e964f do links[#links+1]=y8e964f[i] end
   t106283=t106283+1
   s8818ee[t106283]=vf20650c(ci,links)
 end
 h62ea7d[46758]=function()
   if not a91e06a then local t={n=0} t["m8589b4a0df"]=true a91e06a=t end
   t106283=t106283+1 s8818ee[t106283]=a91e06a
 end
 h62ea7d[40620]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a == b
 end
 h62ea7d[1285]=function()
   s8818ee[t106283]=s8818ee[t106283][3]
 end
 h62ea7d[12795]=function()
   local n=w375831.c[i53a895] i53a895=i53a895+1
   local f=s8818ee[t106283-n] local a={} for j=1,n do a[j]=s8818ee[t106283-n+j] end t106283=t106283-n-1
   local la=n if la>0 and qe9d594(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfm4b747e[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cu073ad5 local base0=ba4231d5 local top0=to2b3d0e local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rg895381[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rg895381[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=ow5f68ab}
    local cc=Kbd9c51[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["m8589b4a0df"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    fr070ce3[fp2d2122]=nf lf8f7057(nf)
   else
    local r=P2d93be(f(u646e40(a,1,la))) t106283=t106283+1 s8818ee[t106283]=r rt932ceb(0,true)
   end
 end
 h62ea7d[39834]=function()
   local b=s8818ee[t106283] local a=s8818ee[t106283-1] t106283=t106283-1
   s8818ee[t106283]=a <= b
 end
 h62ea7d[22218]=function()
   local _mode=w375831.c[i53a895] i53a895=i53a895+1
   local v=s8818ee[t106283] local idx=s8818ee[t106283-1] local b=s8818ee[t106283-2] t106283=t106283-3
   local f=cu073ad5 local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rg895381[b+idx-1]=v
 end
 h62ea7d[34253]=function()
   if not s8818ee[t106283] then i53a895=w375831.c[i53a895] else i53a895=i53a895+1 s8818ee[t106283]=nil t106283=t106283-1 end
 end
 h62ea7d[22649]=function()
   local n=w375831.c[i53a895] i53a895=i53a895+1
   local f=cu073ad5 local b=f.sanext or (ba4231d5+256) local lim=ba4231d5+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n to2b3d0e=math.max(to2b3d0e,ba4231d5+255)
   t106283=t106283+1 s8818ee[t106283]=b
 end
 h62ea7d[58953]=function()
   t106283=t106283+1 s8818ee[t106283]=gbf7409[d0dcf97(w375831.c[i53a895])] i53a895=i53a895+1
 end
 h62ea7d[62427]=function()
  t106283=t106283+1 s8818ee[t106283]=d0dcf97(w375831.c[i53a895]) i53a895=i53a895+1
 end
 h62ea7d[62776]=function()
  local t=s8818ee[t106283] s8818ee[t106283]=t
 end
 h62ea7d[64272]=function()
  t106283=t106283+1 s8818ee[t106283]=d0dcf97(w375831.c[i53a895]) i53a895=i53a895+1
 end
 h62ea7d[62281]=function()
  i53a895=w375831.c[i53a895]
 end
 h62ea7d[63500]=function()
  local t=s8818ee[t106283] s8818ee[t106283]=t
 end
 h62ea7d[62594]=function()
  local t=s8818ee[t106283] s8818ee[t106283]=t
 end
 h62ea7d[62892]=function()
  i53a895=w375831.c[i53a895]
 end
 h62ea7d[62326]=function()
  t106283=t106283+1 s8818ee[t106283]=d0dcf97(w375831.c[i53a895]) i53a895=i53a895+1
 end
 schcaef1a=function(stop)
  while fp2d2122>stop and not dnca63aa do
   local f=fr070ce3[fp2d2122] if not f then error("VM_FRAME_MISSING",0) end
   lf8f7057(f)
   if fp2d2122<1 or fp2d2122>#fr070ce3 or fr070ce3[fp2d2122]~=cu073ad5 then error("VM_STATE_FP",0) end
   if cu073ad5.owner~=ow5f68ab then error("VM_STATE_FRAME_OWNER",0) end
   if w375831~=Kbd9c51[cu073ad5.chunk] then error("VM_STATE_CODE",0) end
   if i53a895%1~=0 or i53a895<1 or i53a895>#w375831.c then error("VM_STATE_PC",0) end
   if ba4231d5%1~=0 or to2b3d0e%1~=0 or ba4231d5<0 or to2b3d0e<ba4231d5 or to2b3d0e>ba4231d5+255 then error("VM_STATE_BOUNDS",0) end
   if t106283%1~=0 or t106283<0 or t106283>to2b3d0e-ba4231d5 then error("VM_STATE_SP",0) end
   local o6dc3b8=w375831.c[i53a895] i53a895=i53a895+1
   local _fn=h62ea7d[o6dc3b8]
   local _yieldop=(o6dc3b8==5046 or o6dc3b8==40788)
   local _ok,_err=true,nil
   if _yieldop and not (cu073ad5 and cu073ad5.prot) then if _fn then _fn() else error("bad opcode "..tostring(o6dc3b8),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(o6dc3b8),0) end end) end
   if not _ok then
    local handled=false local ei=fp2d2122
    while ei>stop do
     local ef=fr070ce3[ei] local meta=ef and ef.prot
     if meta then
      for k=fp2d2122,ei+1,-1 do local z=fr070ce3[k] if z then for j=z.base,z.top do rg895381[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rg895381[j]=nil end end end fr070ce3[k]=nil end
      fp2d2122=ei lf8f7057(fr070ce3[fp2d2122])
      local bad=fr070ce3[fp2d2122] local caller=meta.caller fr070ce3[fp2d2122]=nil fp2d2122=fp2d2122-1
      for j=bad.base,bad.top do rg895381[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rg895381[j]=nil end end
      if meta.kind=="xpcall" then lf8f7057(caller) local hf=vfm4b747e[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf8b9df4(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["m8589b4a0df"]=true q[1]=false q[2]=hr t106283=meta.dest s8818ee[t106283]=q end else lf8f7057(caller) local q={n=2} q["m8589b4a0df"]=true q[1]=false q[2]=_err t106283=meta.dest s8818ee[t106283]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dnca63aa then sfeb2ca4(cu073ad5) end
  end
 end
 ivk2d3705=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if fr070ce3==st.fr and fp2d2122>0 then __vms_save_state(st) end __vms_load_state(st)
   if fp2d2122==0 then
    pf8b9df4(d.chunk,d.links,{...},nil,0,nil)
    schcaef1a(0)
    local rr=rs25e6ea or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return u646e40(rr)
   end
   local stop=fp2d2122 local caller=fr070ce3[fp2d2122] sfeb2ca4(caller)
   pf8b9df4(d.chunk,d.links,{...},t106283+1,0,caller)
   schcaef1a(stop)
   local cf=fr070ce3[fp2d2122] lf8f7057(cf) local rr=cf.lastResult or {} cf.lastResult=nil return u646e40(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fp2d2122 local caller=fr070ce3[fp2d2122]
  sfeb2ca4(caller)
  pf8b9df4(d.chunk,d.links,{...},0,0,caller)
  schcaef1a(stop)
  local cf=fr070ce3[fp2d2122] lf8f7057(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return u646e40(rr)
 end
 schcaef1a(0)
 return u646e40(rs25e6ea)
end
do
 local ok,err=pcall(Rd95336,1,{})
 if not ok then error(err,0) end
end