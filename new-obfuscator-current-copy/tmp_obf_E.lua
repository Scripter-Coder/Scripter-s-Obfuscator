-- bd0daae010047fca | DO NOT EDIT
local _d34a0b4=function(ad0f47a,b6ac55c,...)
 while true do
  local _s24ff={} local _t2d9a=0
  local _y77e0={{}}
  local _i561a=1
  local _w0863=ad0f47a[b6ac55c]
  local o6720aa=_w0863.c[_i561a]
  if o6720aa==1 then _s24ff[_t2d9a]="x" end
 end
end
local _ba48e={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _rac46={{1,41}}
local d70e7c1=function(i) local a=_ba48e[1] local rr=_rac46[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _ba48e2={214,17,239,131,189,168} do local rp=1 while rp<=#_ba48e2 do local np=_ba48e2[rp]+_ba48e2[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_ba48e2[rp]+_ba48e2[rp+1]*256 rp=rp+2 end local va=(_ba48e2[rp]==1) rp=rp+1 local nc=_ba48e2[rp]+_ba48e2[rp+1]*256+_ba48e2[rp+2]*65536+_ba48e2[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_ba48e2[rp]+_ba48e2[rp+1]*256+_ba48e2[rp+2]*65536+_ba48e2[rp+3]*16777216 rp=rp+4 end end end
end
local g0bcbb1=_G
if getfenv then local _le=getfenv(0) if _le then g0bcbb1=_le end end
local hg33d7b5={}
if getgenv then g0bcbb1=getgenv() end
if not g0bcbb1 then g0bcbb1=_G end
local v297ca1={224,151,75,245,152,206,162,25,26,16,70,173,36,80,86,176,189,217,27,194,104,112,186,139,85,60,18,150,45,10,160,90,79,135,29,74,187,74,179,176,176,156,131,147,164,18,20,170,101,149,6,55,229,30,57,47,98,76,5,189,137,66,50,150,50,212,95,211,199,212,38,16,5,108,149,172,39,37,139,97,45,129,25,103,126,166,221,72,47,197,88,6,246,159,100,120,88,86,210,15,235,200,92,226,61,93,190,96,227,9,121,198,101,1,234,219,119,75,24,25,131,245,173,205,12,141,50,137,17,241,98,206,204,103,98,79,200,41,83,66,145,180,190,73,252,85,27,251,51,97,22,89,26,36,96,10,65,161,201,255,164,64,36,11,78,20,202,161,106,244,121,159,91,74,117,217,215,66,76,70,128,120,202,48,120,199,254,84,144,103,140,151,66,243,87,254,81,234,222,200,58,70,66,137,235,72,191,133,192,210,177,45,114,205,172,56,31,68,145,212,33,146,208,141,119,166,175,85,178,95,90}
local c01daa9={}
local r77c049={{0,1},{1,1},{2,11},{13,11},{24,5},{29,5},{34,37},{71,55},{126,50},{176,55}}
local md68434={}
local iv79f2e8=108
local de4f7b1=function(i)
 local c=c01daa9[i] if c then return c end
 local rr=r77c049[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=iv79f2e8
 for j=1,ln do
  local p=st+j
  local a=v297ca1[p] local b=(225*p+226+3698842504*1.0*((p*p)%18))%251+203
  local kb=(b + prev*78)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 c01daa9[i]=t return t
end
local u33774a
if table.unpack then u33774a=table.unpack else u33774a=unpack end
if not u33774a then u33774a=unpack end
local P0b7c48=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["meaa6a01bd7"]=true
 return t
end
local q19cc5e=function(t) return type(t)=="table" and t["meaa6a01bd7"]==true end
local bef9498={}
do
 local src={32,143,73,68,143,32,242,94,116,37,25,82,211,158,175,148,62,144,190,53,241,246,70,43,11,213,66,238,67,45,178,131,152,244,155,194,184,57,248,6,87,237,206,80,83,31,29,96,235,192,219,228,220,218,23,149,94,109,194,98,72,116,236,163,166,239,28,203,125,227,149,139,200,80,125,74,140,49,29,77,196,134,0,199,117,84,120,228,154,150,125,81,56,81,177,90,74,128,89,247,208,40,193,165,207,68,250,251,71,202,172,202,51,83,201,18,147,93,113,201,108,164,68,249,185,188,16,162,127,107,172,191,185,253,132,85,108,202,12,95,147,18,210,221,51,169,212,212,71,249,250,68,207,108,125,40,208,198,252,128,74,142,109,81,56,103,216,150,154,185,46,84,117,220,142,134,196,78,97,49,140,51,30,80,200,227,204,227,125,148,63,239,166,165,230,116,72,182,31,109,94,151,23,218,232,28,140,192,235,97,29,31,103,246,179,237,87,6,248,57,187,224,195,244,152,39,134,45,233,240,66,213,179,213,70,219,241,115,190,145,227,11,175,158,38,111,25,37,244,119,242,32,44,214,73,143,24,78,20,119,95,156,83,211,126,6,11,168,121,173,55,241,254,125,215,179,136,84,240,233,136,134,130,152,191,143,136,187,100,238,7,87,89,205,245,103,117,130,97,235,187,176,65,232,7,208,149,94,126,30,98,72,15,141,163,166,227,201,93,125,55,202,139,200,176,183,50,140,207,37,77,196,156,176,220,117,62,230,228,154,252,71,101,56,182,27,90,74,73,64,195,208,245,6,165,207,44,162,251,71,251,119,202,51,227,50,18,147,64,55,201,108,217,140,249,185,67,168,162,127,177,204,191,185,83,38,85,108,87,184,95,147,84,9,221,51,213,234,212,71,10,58,68,207,59,8,40,208,137,255,128,74,184,22,81,56,206,181,150,154,247,165,84,117,41,178,134,196,107,87,49,140,152,53,80,200,119,44,227,125,99,99,239,166,254,240,116,72,118,226,109,94,119,107,218,232,78,78,192,235,213,30,31,103,18,101,237,87,86,195,57,187,142,245,244,152,249,217,45,233,200,254,213,179,124,43,246,241,106,233,144,168,24,115,158,211,60,89,37,119,73,228,32,143,82,104,143,32,48,167,119,37,154,48,211,158,35,3,168,144,239,50,241,246,179,235,179,213,231,196,233,45,91,145,152,244,151,194,187,57,126,88,87,237,204,245,71,31,46,97,235,226,219,65,232,127,35,149,94,119,252,98,72,149,101,163,166,30,67,93,125,197,223,139,200,27,10,50,140,236,219,77,196,192,85,220,117,78,71,228,154,53,71,101,56,207,121,90,74,84,33,195,208,212,121,165,207,248,70,251,71,251,119,202,51,194,148,18,147,60,9,201,108,75,46,249,185,88,187,162,127,173,133,191,185,5,60,85,108,32,98,95,147,184,112,221,51,118,16,212,71,253,148,68,207,248,150,40,208,241,139,128,74,255,136,81,56,177,134,150,154,158,252,84,117,167,229,134,196,11,199,49,140,208,98,80,200,108,63,227,125,92,131,226,166,162,214,116,72,98,51,173,94,149,12,251,232,65,144,212,235,97,86,11,103,245,147,186,87,7,190,226,187,136,56,107,152,130,148,102,233,240,41,206,179,215,64,152,241,55,76,168,168,11,12,1,211,83,43,82,119,20,153,59,143,73,111,196,32,242,169,69,37,25,72,242,158,175,51,20,144,190,213,87,246,70,55,26,213,66,85,209,45,178,196,67,244,155,34,25,57,248,86,108,237,206,40,160,31,29,168,87,192,219,194,139,218,23,22,61,109,194,41,92,116,230,157,70,239,131,67,215,227,148,122,8,80,30,62,198,49,28,94,24,134,142,208,63,84,121,240,186,150,216,13,96,81,176,100,170,128,252,253,48,40,193,113,18,68,250,71,251,212,172,76,108,221,210,219,47,95,113,69,100,85,132,147,38,191,16,69,212,162,16,2,139,249,132,165,168,201,113}
 for i=1,#src do
  local a=src[(i)] local _junk44f=0 local b=((i*i*35+i*6+238)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  bef9498[i]=r
 end
end
local Kcc2ae0={}
do
 local rp=1
 while rp<=#bef9498 do
  local np=bef9498[rp] + bef9498[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=bef9498[rp] + bef9498[rp+1]*256 rp=rp+2 end
  local va=(bef9498[rp]==1) rp=rp+1
  local nc=bef9498[rp] + bef9498[rp+1]*256 + bef9498[rp+2]*65536 + bef9498[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=bef9498[rp] + bef9498[rp+1]*256 + bef9498[rp+2]*65536 + bef9498[rp+3]*16777216
   rp=rp+4
  end
  Kcc2ae0[#Kcc2ae0+1]={c=cd,p=ps,v=va}
 end
end
local owb82df9={}
local rg0c72d5={} local fr21bdca={} local fpe2e869=0 local ba56d193=0 local tofe4cf8=0 local nbccaef9=0
local cu4164ba=nil local dn80194d=false local rs6e4957={} local vfm28561a={} local sch8548e0 local ivkcc48a6
local __vms_root_thread=coroutine.running() local __vms_root_state local __vms_cor_states={} local __vms_active_state=nil
local __vms_save_state=function(st) st.rg=rg0c72d5 st.fr=fr21bdca st.fp=fpe2e869 st.ba=ba56d193 st.to=tofe4cf8 st.cu=cu4164ba st.co=wc14da2 st.pc=i2e0c18 st.sp=t790214 st.sc=y8044ae st.lk=L077073 st.va=ac4b538 st.nb=nbccaef9 st.dn=dn80194d st.rs=rs6e4957 end
local __vms_load_state=function(st) rg0c72d5=st.rg or {} fr21bdca=st.fr or {} fpe2e869=st.fp or 0 ba56d193=st.ba or 0 tofe4cf8=st.to or 0 cu4164ba=st.cu wc14da2=st.co i2e0c18=st.pc or 1 t790214=st.sp or 0 y8044ae=st.sc or {{}} L077073=st.lk or {} ac4b538=st.va nbccaef9=st.nb or 0 dn80194d=st.dn or false rs6e4957=st.rs or {} if fpe2e869>0 then local q=fr21bdca[fpe2e869] if not q or q.owner~=owb82df9 then error("VM_STATE_FRAME_OWNER",0) end if ba56d193~=q.base or tofe4cf8~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end
local sf674f2=setmetatable({}, {__index=function(_,k) return rg0c72d5[ba56d193+k] end, __newindex=function(_,k,v) rg0c72d5[ba56d193+k]=v end})
local vfa40aec=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ivkcc48a6(d,...) end vfm28561a[f]=d return f end
local pf7f9707 local xfa7aebd local sf65036b local lf12d2a3 local rt7aa4d7
local R95b1ff
R95b1ff=function(x379e65,L077073,...)
 fr21bdca={} fpe2e869=0 nbccaef9=0 dn80194d=false rs6e4957={}
 __vms_root_state={}
 pf7f9707=function(ci,links,args,retDest,nRet,caller,meta)
  local code=Kcc2ae0[ci] if not code then error("VM_BAD_CHUNK",0) end
  local f={chunk=ci,pc=1,base=nbccaef9,top=nbccaef9+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=nbccaef9+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=owb82df9}
  nbccaef9=nbccaef9+512
  fpe2e869=fpe2e869+1 fr21bdca[fpe2e869]=f
  local ps=code.p local av=args or {}
  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end
  if code.v then local t={n=0} t["meaa6a01bd7"]=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end
 end
 sf65036b=function(f) if not f then return end f.pc=i2e0c18 f.base=ba56d193 f.top=tofe4cf8 f.sp=t790214 f.sc=y8044ae f.lk=L077073 f.va=ac4b538 f.sanext=cu4164ba.sanext f.sasizes=cu4164ba.sasizes end
 lf12d2a3=function(f) cu4164ba=f wc14da2=Kcc2ae0[f.chunk] i2e0c18=f.pc ba56d193=f.base tofe4cf8=f.top t790214=f.sp y8044ae=f.sc L077073=f.lk ac4b538=f.va end
 rt7aa4d7=function(n,packed)
  local f=fr21bdca[fpe2e869] local vals={}
  if packed then local p=sf674f2[t790214] local pn=(p and p.n) or 0 for i=1,n do vals[i]=sf674f2[t790214-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=sf674f2[t790214-n+i] end end
  if f.prot then
   local meta=f.prot local caller=meta.caller
   sf65036b(f)
   for i=f.base,f.top do rg0c72d5[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg0c72d5[i]=nil end end
   fr21bdca[fpe2e869]=nil fpe2e869=fpe2e869-1
   lf12d2a3(caller)
   local q={n=0} q["meaa6a01bd7"]=true
   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end
   t790214=meta.dest sf674f2[t790214]=q
   return
  end
  sf65036b(f)
  rg0c72d5[f.base]=rg0c72d5[f.base]
  for i=f.base,f.top do rg0c72d5[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do rg0c72d5[i]=nil end end
  fr21bdca[fpe2e869]=nil
  local caller=f.caller
  if caller then caller.lastResult=vals end
  if not caller then rs6e4957=vals dn80194d=true return end
  fpe2e869=fpe2e869-1 local cf=fr21bdca[fpe2e869]
  if not cf then error("VM_FRAME_UNDERFLOW",0) end
  lf12d2a3(cf)
  local d=f.retDest or (t790214+1)
  if f.nRet==0 then return end
  t790214=d-1
  if f.nRet==1 then t790214=d sf674f2[t790214]=vals[1] else local q={n=#vals} q["meaa6a01bd7"]=true for i=1,#vals do q[i]=vals[i] end t790214=d sf674f2[t790214]=q end
 end
 pf7f9707(x379e65,L077073,{...},nil,0,nil)
  local f=fr21bdca[fpe2e869]
  if not f then error("VM_FRAME_MISSING",0) end
  lf12d2a3(f)
 local h7817fc={}
 h7817fc[38559]=function()
   local ix=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local n=md68434[ix]
   if not n then n=tonumber(de4f7b1(ix)) md68434[ix]=n end
   t790214=t790214+1 sf674f2[t790214]=n
 end
 h7817fc[38636]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a > b
 end
 h7817fc[38159]=function()
   local k=sf674f2[t790214] t790214=t790214-1 local t=sf674f2[t790214] sf674f2[t790214]=t[k]
 end
 h7817fc[46018]=function()
   local k=sf674f2[t790214] t790214=t790214-1 local t=sf674f2[t790214] sf674f2[t790214]=t[k]
 end
 h7817fc[30806]=function()
   sf674f2[t790214]=sf674f2[t790214][2]
 end
 h7817fc[56788]=function()
   local id=wc14da2.c[i2e0c18] local b=nil i2e0c18=i2e0c18+1
   for i=#y8044ae,1,-1 do b=y8044ae[i][id] if b then break end end
   t790214=t790214+1 sf674f2[t790214]=b and b[1]
 end
 h7817fc[47356]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a + b
 end
 h7817fc[18956]=function()
 end
 h7817fc[16495]=function()
   local n=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local a={} for j=1,n do a[j]=sf674f2[t790214-n+j] end t790214=t790214-n-1
   local la=n if la>0 and q19cc5e(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm28561a[f]
   if vd then
    local caller=cu4164ba local dest=t790214+1 sf65036b(caller)
    local meta={kind="xpcall",caller=caller,dest=dest,handler=a[2]}
    local args={} local first=3 for j=first,la do args[#args+1]=a[j] end
    pf7f9707(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf12d2a3(fr21bdca[fpe2e869])
   else
    local ok,rr
    if true then ok,rr=xpcall(f,a[2],u33774a(a,3,la)) else ok,rr=pcall(f,u33774a(a,1,la)) end
    if true and not ok then rr=a[2](rr) end
    local q={n=2} q["meaa6a01bd7"]=true q[1]=ok q[2]=rr t790214=t790214+1 sf674f2[t790214]=q
   end
 end
 h7817fc[43488]=function()
   local ix=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   sf674f2[t790214]=sf674f2[t790214][ix]
 end
 h7817fc[19209]=function()
   local b=sf674f2[t790214] local n=cu4164ba.sasizes and cu4164ba.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end sf674f2[t790214]=n
 end
 h7817fc[48329]=function()
   t790214=t790214+1 sf674f2[t790214]=g0bcbb1[de4f7b1(wc14da2.c[i2e0c18])] i2e0c18=i2e0c18+1
 end
 h7817fc[34170]=function()
   t790214=t790214+1 sf674f2[t790214]=true
 end
 h7817fc[5097]=function()
   sf674f2[t790214]=sf674f2[t790214][1]
 end
 h7817fc[55084]=function()
   if not sf674f2[t790214] then i2e0c18=wc14da2.c[i2e0c18] else i2e0c18=i2e0c18+1 sf674f2[t790214]=nil t790214=t790214-1 end
 end
 h7817fc[948]=function()
   local _v=sf674f2[t790214] sf674f2[t790214]=nil t790214=t790214-1 if _v then i2e0c18=wc14da2.c[i2e0c18] else i2e0c18=i2e0c18+1 end
 end
 h7817fc[14578]=function()
   sf674f2[t790214],sf674f2[t790214-1]=sf674f2[t790214-1],sf674f2[t790214]
 end
 h7817fc[842]=function()
   local id=wc14da2.c[i2e0c18] local b=nil i2e0c18=i2e0c18+1
   for i=#L077073,1,-1 do b=L077073[i][id] if b then break end end
   t790214=t790214+1 sf674f2[t790214]=b and b[1]
 end
 h7817fc[31970]=function()
   local k=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   rt7aa4d7(k,true)
 end
 h7817fc[15185]=function()
   local n=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local pt=sf674f2[t790214] sf674f2[t790214]=nil t790214=t790214-1
   for j=1,n do t790214=t790214+1 sf674f2[t790214]=pt[j] end
 end
 h7817fc[7054]=function()
   local ci=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local links={}
   for i=1,#L077073 do links[#links+1]=L077073[i] end
   for i=1,#y8044ae do links[#links+1]=y8044ae[i] end
   t790214=t790214+1
   sf674f2[t790214]=vfa40aec(ci,links)
 end
 h7817fc[32003]=function()
   local n=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local f=sf674f2[t790214-n]
   local a={}
   for j=1,n do a[j]=sf674f2[t790214-n+j] end
   t790214=t790214-n-1
   local la=n
   if la>0 and q19cc5e(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm28561a[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu4164ba local dest=t790214+1
    sf65036b(caller)
    local vc=vd or f pf7f9707(vc.chunk,vc.links,a,dest,1,caller)
    lf12d2a3(fr21bdca[fpe2e869])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf65036b(cu4164ba) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P0b7c48(f(u33774a(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf12d2a3(cu4164ba) end
    t790214=t790214+1
    sf674f2[t790214]=r[1]
   end
 end
 h7817fc[49393]=function()
   g0bcbb1[de4f7b1(wc14da2.c[i2e0c18])]=sf674f2[t790214] t790214=t790214-1 i2e0c18=i2e0c18+1
 end
 h7817fc[57406]=function()
   y8044ae[#y8044ae]=nil
 end
 h7817fc[14846]=function()
   local id=wc14da2.c[i2e0c18] local v=sf674f2[t790214] t790214=t790214-1 i2e0c18=i2e0c18+1
   local b=nil for i=#y8044ae,1,-1 do b=y8044ae[i][id] if b then break end end
   if b then b[1]=v end
 end
 h7817fc[7019]=function()
   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC
 end
 h7817fc[56111]=function()
   sf674f2[t790214]=-sf674f2[t790214]
 end
 h7817fc[24276]=function()
   y8044ae[#y8044ae+1]={}
 end
 h7817fc[15112]=function()
   local n=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local f=sf674f2[t790214-n] local a={} for j=1,n do a[j]=sf674f2[t790214-n+j] end t790214=t790214-n-1
   local la=n if la>0 and q19cc5e(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local vd=vfm28561a[f]
   if vd or (type(f)=="table" and f.__vm) then
    local vc=vd or f local old=cu4164ba local base0=ba56d193 local top0=tofe4cf8 local caller0=old.caller local rd=old.retDest local nr=old.nRet
    for i=base0,top0 do rg0c72d5[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do rg0c72d5[i]=nil end end
    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=owb82df9}
    local cc=Kcc2ae0[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t["meaa6a01bd7"]=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end
    fr21bdca[fpe2e869]=nf lf12d2a3(nf)
   else
    local r=P0b7c48(f(u33774a(a,1,la))) t790214=t790214+1 sf674f2[t790214]=r rt7aa4d7(0,true)
   end
 end
 h7817fc[56339]=function()
   local n=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local a={} for j=1,n do a[j]=sf674f2[t790214-n+j] end t790214=t790214-n-1
   local la=n if la>0 and q19cc5e(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end
   local f=a[1]
   local vd=vfm28561a[f]
   if vd then
    local caller=cu4164ba local dest=t790214+1 sf65036b(caller)
    local meta={kind="pcall",caller=caller,dest=dest,handler=nil}
    local args={} local first=1 for j=first,la do args[#args+1]=a[j] end
    pf7f9707(vd.chunk,vd.links,args,dest,-2,caller,meta)
    lf12d2a3(fr21bdca[fpe2e869])
   else
    local ok,rr
    if false then ok,rr=xpcall(f,a[2],u33774a(a,3,la)) else ok,rr=pcall(f,u33774a(a,1,la)) end
    if false and not ok then rr=a[2](rr) end
    local q={n=2} q["meaa6a01bd7"]=true q[1]=ok q[2]=rr t790214=t790214+1 sf674f2[t790214]=q
   end
 end
 h7817fc[14501]=function()
   local p=sf674f2[t790214] t790214=t790214-1 local t=sf674f2[t790214] sf674f2[t790214]=nil t790214=t790214-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 h7817fc[13477]=function()
   local n=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   rt7aa4d7(n,false)
 end
 h7817fc[15605]=function()
   local ix=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local k=de4f7b1(ix) local v=hg33d7b5[k] if v==nil then v=g0bcbb1[k] hg33d7b5[k]=v end
   t790214=t790214+1 sf674f2[t790214]=v
 end
 h7817fc[56134]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a >= b
 end
 h7817fc[44007]=function()
   t790214=t790214+1 sf674f2[t790214]=false
 end
 h7817fc[22365]=function()
   local n=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local f=sf674f2[t790214-n]
   local a={}
   for j=1,n do a[j]=sf674f2[t790214-n+j] end
   t790214=t790214-n-1
   local la=n
   if la>0 and q19cc5e(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat la=fi
   end
   local vd=vfm28561a[f]
   if vd or (type(f)=="table" and f.__vm) then
    local caller=cu4164ba local dest=t790214+1
    sf65036b(caller)
    local vc=vd or f pf7f9707(vc.chunk,vc.links,a,dest,-1,caller)
    lf12d2a3(fr21bdca[fpe2e869])
   else
    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=__vms_root_thread)
    if _co then __vms_save_state(__vms_root_state) end
    if _yt then local _st=__vms_active_state sf65036b(cu4164ba) __vms_save_state(_st) __vms_load_state(__vms_root_state) end
    local r=P0b7c48(f(u33774a(a,1,la)))
    if _yt then local _st=__vms_active_state __vms_load_state(_st) lf12d2a3(cu4164ba) end
    t790214=t790214+1
    sf674f2[t790214]=r
   end
 end
 h7817fc[51614]=function()
   i2e0c18=wc14da2.c[i2e0c18]
 end
 h7817fc[30514]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a * b
 end
 h7817fc[51165]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a == b
 end
 h7817fc[33761]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a * b
 end
 h7817fc[25475]=function()
   local v=sf674f2[t790214] local k=sf674f2[t790214-1] local t=sf674f2[t790214-2] t[k]=v t790214=t790214-3
 end
 h7817fc[15898]=function()
   local _n=(sf674f2[t790214]==nil) sf674f2[t790214]=nil t790214=t790214-1 if _n then i2e0c18=wc14da2.c[i2e0c18] else i2e0c18=i2e0c18+1 end
 end
 h7817fc[40810]=function()
   sf674f2[t790214]=not sf674f2[t790214]
 end
 h7817fc[48184]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a <= b
 end
 h7817fc[22632]=function()
   sf674f2[t790214]=nil t790214=t790214-1
 end
 h7817fc[12989]=function()
   t790214=t790214+1 sf674f2[t790214]={}
 end
 h7817fc[28166]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a < b
 end
 h7817fc[19238]=function()
   sf674f2[t790214]=sf674f2[t790214][3]
 end
 h7817fc[17269]=function()
   t790214=t790214+1 sf674f2[t790214]=nil
 end
 h7817fc[42722]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a + b
 end
 h7817fc[41642]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a - b
 end
 h7817fc[11178]=function()
   local _mode=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local idx=sf674f2[t790214] local b=sf674f2[t790214-1] t790214=t790214-2
   local f=cu4164ba local n=f.sasizes and f.sasizes[b]
   if not n then error("VM_STACKALLOC_HANDLE",0) end
   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then t790214=t790214+1 sf674f2[t790214]=nil else t790214=t790214+1 sf674f2[t790214]=rg0c72d5[b+idx-1] end
 end
 h7817fc[40031]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a / b
 end
 h7817fc[43550]=function()
   local id=wc14da2.c[i2e0c18] local v=sf674f2[t790214] t790214=t790214-1 i2e0c18=i2e0c18+1
   local b=nil for i=#L077073,1,-1 do b=L077073[i][id] if b then break end end
   if b then b[1]=v end
 end
 h7817fc[5725]=function()
   if sf674f2[t790214] then i2e0c18=wc14da2.c[i2e0c18] else i2e0c18=i2e0c18+1 sf674f2[t790214]=nil t790214=t790214-1 end
 end
 h7817fc[30819]=function()
   local id=wc14da2.c[i2e0c18] local v=sf674f2[t790214] sf674f2[t790214]=nil t790214=t790214-1 i2e0c18=i2e0c18+1
   y8044ae[#y8044ae][id]={v}
 end
 h7817fc[2188]=function()
   local ix=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local n=md68434[ix] if not n then n=tonumber(de4f7b1(ix)) md68434[ix]=n end
   sf674f2[t790214]=sf674f2[t790214]+n
 end
 h7817fc[48316]=function()
   sf674f2[t790214]=#sf674f2[t790214]
 end
 h7817fc[40867]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a ~= b
 end
 h7817fc[28075]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a ^ b
 end
 h7817fc[1361]=function()
   local _mode=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local v=sf674f2[t790214] local idx=sf674f2[t790214-1] local b=sf674f2[t790214-2] t790214=t790214-3
   local f=cu4164ba local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)
   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end
   rg0c72d5[b+idx-1]=v
 end
 h7817fc[8475]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a % b
 end
 h7817fc[5195]=function()
   t790214=t790214+1 sf674f2[t790214]=sf674f2[t790214-1]
 end
 h7817fc[27515]=function()
   if not ac4b538 then local t={n=0} t["meaa6a01bd7"]=true ac4b538=t end
   t790214=t790214+1 sf674f2[t790214]=ac4b538
 end
 h7817fc[24454]=function()
   local n=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local f=cu4164ba local b=f.sanext or (ba56d193+256) local lim=ba56d193+512
   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end
   f.sanext=b+n f.sasizes[b]=n tofe4cf8=math.max(tofe4cf8,ba56d193+255)
   t790214=t790214+1 sf674f2[t790214]=b
 end
 h7817fc[13887]=function()
   local b=sf674f2[t790214] local a=sf674f2[t790214-1] t790214=t790214-1
   sf674f2[t790214]=a .. b
 end
 h7817fc[8212]=function()
   local ix=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local n=md68434[ix] if not n then n=tonumber(de4f7b1(ix)) md68434[ix]=n end
   sf674f2[t790214]=sf674f2[t790214]*n
 end
 h7817fc[50416]=function()
   local _v=sf674f2[t790214] sf674f2[t790214]=nil t790214=t790214-1 if not _v then i2e0c18=wc14da2.c[i2e0c18] else i2e0c18=i2e0c18+1 end
 end
 h7817fc[17951]=function()
   t790214=t790214+1 sf674f2[t790214]=de4f7b1(wc14da2.c[i2e0c18]) i2e0c18=i2e0c18+1
 end
 h7817fc[61105]=function()
  local k=sf674f2[t790214] t790214=t790214-1 local t=sf674f2[t790214] sf674f2[t790214]=t[k]
 end
 h7817fc[62522]=function()
  local k=sf674f2[t790214] t790214=t790214-1 local t=sf674f2[t790214] sf674f2[t790214]=t[k]
 end
 h7817fc[60150]=function()
  t790214=t790214+1 sf674f2[t790214]=de4f7b1(wc14da2.c[i2e0c18]) i2e0c18=i2e0c18+1
 end
 sch8548e0=function(stop)
  while fpe2e869>stop and not dn80194d do
   local f=fr21bdca[fpe2e869] if not f then error("VM_FRAME_MISSING",0) end
   lf12d2a3(f)
   if fpe2e869<1 or fpe2e869>#fr21bdca or fr21bdca[fpe2e869]~=cu4164ba then error("VM_STATE_FP",0) end
   if cu4164ba.owner~=owb82df9 then error("VM_STATE_FRAME_OWNER",0) end
   if wc14da2~=Kcc2ae0[cu4164ba.chunk] then error("VM_STATE_CODE",0) end
   if i2e0c18%1~=0 or i2e0c18<1 or i2e0c18>#wc14da2.c then error("VM_STATE_PC",0) end
   if ba56d193%1~=0 or tofe4cf8%1~=0 or ba56d193<0 or tofe4cf8<ba56d193 or tofe4cf8>ba56d193+255 then error("VM_STATE_BOUNDS",0) end
   if t790214%1~=0 or t790214<0 or t790214>tofe4cf8-ba56d193 then error("VM_STATE_SP",0) end
   local o3cb881=wc14da2.c[i2e0c18] i2e0c18=i2e0c18+1
   local _fn=h7817fc[o3cb881]
   local _yieldop=(o3cb881==32003 or o3cb881==22365)
   local _ok,_err=true,nil
   if _yieldop and not (cu4164ba and cu4164ba.prot) then if _fn then _fn() else error("bad opcode "..tostring(o3cb881),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(o3cb881),0) end end) end
   if not _ok then
    local handled=false local ei=fpe2e869
    while ei>stop do
     local ef=fr21bdca[ei] local meta=ef and ef.prot
     if meta then
      for k=fpe2e869,ei+1,-1 do local z=fr21bdca[k] if z then for j=z.base,z.top do rg0c72d5[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do rg0c72d5[j]=nil end end end fr21bdca[k]=nil end
      fpe2e869=ei lf12d2a3(fr21bdca[fpe2e869])
      local bad=fr21bdca[fpe2e869] local caller=meta.caller fr21bdca[fpe2e869]=nil fpe2e869=fpe2e869-1
      for j=bad.base,bad.top do rg0c72d5[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do rg0c72d5[j]=nil end end
      if meta.kind=="xpcall" then lf12d2a3(caller) local hf=vfm28561a[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} pf7f9707(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q["meaa6a01bd7"]=true q[1]=false q[2]=hr t790214=meta.dest sf674f2[t790214]=q end else lf12d2a3(caller) local q={n=2} q["meaa6a01bd7"]=true q[1]=false q[2]=_err t790214=meta.dest sf674f2[t790214]=q end
      handled=true break
     end
     ei=ei-1
    end
    if not handled then error(_err,0) end
   end
   if not dn80194d then sf65036b(cu4164ba) end
  end
 end
 ivkcc48a6=function(d,...)
  local thr=coroutine.running()
  if thr~=__vms_root_thread then
   local st=__vms_cor_states[tostring(thr)]
   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} __vms_cor_states[tostring(thr)]=st end __vms_active_state=st
   if fr21bdca==st.fr and fpe2e869>0 then __vms_save_state(st) end __vms_load_state(st)
   if fpe2e869==0 then
    pf7f9707(d.chunk,d.links,{...},nil,0,nil)
    sch8548e0(0)
    local rr=rs6e4957 or {} __vms_save_state(st) __vms_load_state(__vms_root_state) return u33774a(rr)
   end
   local stop=fpe2e869 local caller=fr21bdca[fpe2e869] sf65036b(caller)
   pf7f9707(d.chunk,d.links,{...},t790214+1,0,caller)
   sch8548e0(stop)
   local cf=fr21bdca[fpe2e869] lf12d2a3(cf) local rr=cf.lastResult or {} cf.lastResult=nil return u33774a(rr)
  end
  __vms_save_state(__vms_root_state)
  local stop=fpe2e869 local caller=fr21bdca[fpe2e869]
  sf65036b(caller)
  pf7f9707(d.chunk,d.links,{...},0,0,caller)
  sch8548e0(stop)
  local cf=fr21bdca[fpe2e869] lf12d2a3(cf)
  local rr=cf.lastResult or {} cf.lastResult=nil return u33774a(rr)
 end
 sch8548e0(0)
 return u33774a(rs6e4957)
end
do
 local ok,err=pcall(R95b1ff,3,{})
 if not ok then error(err,0) end
end