local _dab1fab=function(a40b00b,bfd79e1,...)
 while true do
  local _s0ca6={} local _tf7ae=0
  local _ycfcc={{}}
  local _i85d9=1
  local _w00c0=a40b00b[bfd79e1]
  local o8e1d1f=_w00c0.c[_i85d9]
  if o8e1d1f==1 then _s0ca6[_tf7ae]="x" end
 end
end
local _bce86={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _rb91e={{1,41}}
local deecf3e=function(i) local a=_bce86[1] local rr=_rb91e[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _bce862={214,17,239,131,189,168} do local rp=1 while rp<=#_bce862 do local np=_bce862[rp]+_bce862[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_bce862[rp]+_bce862[rp+1]*256 rp=rp+2 end local va=(_bce862[rp]==1) rp=rp+1 local nc=_bce862[rp]+_bce862[rp+1]*256+_bce862[rp+2]*65536+_bce862[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_bce862[rp]+_bce862[rp+1]*256+_bce862[rp+2]*65536+_bce862[rp+3]*16777216 rp=rp+4 end end end
end
local g2c0599=_G
if getgenv then g2c0599=getgenv() end
if not g2c0599 then g2c0599=_G end
local ve3fb6e={34,247,55,97,122,92,212,214,185,107,24,68,246,131,194,132,34,129,91,70,128,63,254,110,96,90,109,237,149,45,167,77,247,49,89,44,201,30,112,142,62,55,129,147,43,66,0,243,107,112,145,148,94,205,42,50,25,161,225,63,136,51,163,242,82,153,93,81,58,224,247,53,150,134,66,72,62,222,240,148,224,141,125,164,238,87,220,98,228,169,82,171,75,159}
local cc7b465={}
local rb9c0c3={{0,5},{5,11},{16,3},{19,5},{24,22},{46,18},{64,18},{82,12}}
local m706747={}
local iv19bcaa=206
local d891082=function(i)
 local c=cc7b465[i] if c then return c end
 local rr=rb9c0c3[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local t="" local prev=iv19bcaa
 for j=1,ln do
  local p=st+j
  local a=ve3fb6e[p] local b=(103*p+222+580627900*1.0*((p*p)%30))%251+82
  local kb=(b + prev*76)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 cc7b465[i]=t return t
end
local u8cd9db
if table.unpack then u8cd9db=table.unpack else u8cd9db=unpack end
if not u8cd9db then u8cd9db=unpack end
local P0f76f1=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["me355f82601"]=true
 return t
end
local qbf003c=function(t) return type(t)=="table" and t["me355f82601"]==true end
local b14227e={}
do
 local src={9,46,22,168,42,86,69,130,21,154,144,72,192,250,247,234,178,123,127,68,203,24,35,205,200,204,222,178,75,161,186,227,13,146,178,165,14,159,198,179,93,200,246,114,127,18,71,62,245,115,175,222,2,240,56,58,7,142,216,251,14,72,153,172,132,30,118,176,218,16,111,144,118,30,132,216,161,72,181,193,8,142,7,62,56,240,112,174,175,115,239,63,71,18,68,253,246,200,11,147,198,159,71,74,178,146,184,229,186,161,248,103,222,204,129,92,35,24,72,77,127,123,11,112,247,250,92,206,144,154,155,66,69,86,224,41,22,46,145,25,254,34,85,57,12,50,135,69,49,94,134,205,114,166,137,119,207,15,101,47,77,143,39,136,226,48,13,204,152,232,76,169,106,193,235,141,88,182,136,196,98,199,57,9,136,244,165,105,202,66,237,149,45,167,217,220,167,45,115,120,90,202,55,40,245,168,218,239,199,189,161,215,182,15,34,219,193,116,106,251,232,71,17,60,48,40,201,148,143,213,114,13,15,32,227,157,166,173,230,78,94,68,93,27,50,93,57,4,34,142,208,9,46,106,99,42,86,193,154,103,154,210,5,192,250,188,171,58,123,181,211,203,24,140,214,125,204,34,3,75,161,157,241,53,146,147,32,59,159,113,200,93,200,169,152,155,18,31,75,245,115,189,165,112,240,68,231,7,142,198,94,181,72,139,166,132,30,169,139,111,16,243,67,118,30,6,159,153,72,161,197,216,142,76,34,56,240,112,174,175,116,245,63,71,205,129,231,246,236,141,176,198,162,3,149,178,205,74,150,186,144,140,179,222,78,79,236,35,10,192,70,127}
 for i=1,#src do
  local a=src[(i)] local _junkf98=0 local b=((i*i*95+i*3+158)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b14227e[i]=r
 end
end
local K85d611={}
do
 local rp=1
 while rp<=#b14227e do
  local np=b14227e[rp] + b14227e[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b14227e[rp] + b14227e[rp+1]*256 rp=rp+2 end
  local va=(b14227e[rp]==1) rp=rp+1
  local nc=b14227e[rp] + b14227e[rp+1]*256 + b14227e[rp+2]*65536 + b14227e[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b14227e[rp] + b14227e[rp+1]*256 + b14227e[rp+2]*65536 + b14227e[rp+3]*16777216
   rp=rp+4
  end
  K85d611[#K85d611+1]={c=cd,p=ps,v=va}
 end
end
local R163fa2
R163fa2=function(x477aba,L15ca25,...)
 local wc48f16=K85d611[x477aba]
 local sa71af4={} local t8da5b5=0
 local y1e4597={{}}
 local ab13720=nil
 local i8e7709=1
 local ps=wc48f16.p
 for i=1,#ps do y1e4597[1][ps[i]]={select(i,...)} end
 if wc48f16.v then ab13720=P0f76f1(select(#ps+1,...)) end
 local h9cc8ce={}
 h9cc8ce[59077]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a >= b
 end
 h9cc8ce[58984]=function()
   local _v=sa71af4[t8da5b5] sa71af4[t8da5b5]=nil t8da5b5=t8da5b5-1 if _v then i8e7709=wc48f16.c[i8e7709] else i8e7709=i8e7709+1 end
 end
 h9cc8ce[57212]=function()
   local id=wc48f16.c[i8e7709] local v=sa71af4[t8da5b5] t8da5b5=t8da5b5-1 i8e7709=i8e7709+1
   local b=nil for i=#L15ca25,1,-1 do b=L15ca25[i][id] if b then break end end
   if b then b[1]=v end
 end
 h9cc8ce[7243]=function()
   if not sa71af4[t8da5b5] then i8e7709=wc48f16.c[i8e7709] else i8e7709=i8e7709+1 sa71af4[t8da5b5]=nil t8da5b5=t8da5b5-1 end
 end
 h9cc8ce[29581]=function()
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=nil
 end
 h9cc8ce[12744]=function()
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]={}
 end
 h9cc8ce[54451]=function()
   local p=sa71af4[t8da5b5] t8da5b5=t8da5b5-1 local t=sa71af4[t8da5b5] sa71af4[t8da5b5]=nil t8da5b5=t8da5b5-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 h9cc8ce[26756]=function()
   local _n=(sa71af4[t8da5b5]==nil) sa71af4[t8da5b5]=nil t8da5b5=t8da5b5-1 if _n then i8e7709=wc48f16.c[i8e7709] else i8e7709=i8e7709+1 end
 end
 h9cc8ce[15977]=function()
   local ix=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   sa71af4[t8da5b5]=sa71af4[t8da5b5][ix]
 end
 h9cc8ce[19723]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a .. b
 end
 h9cc8ce[21909]=function()
   sa71af4[t8da5b5]=not sa71af4[t8da5b5]
 end
 h9cc8ce[40273]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a <= b
 end
 h9cc8ce[14453]=function()
   sa71af4[t8da5b5]=nil t8da5b5=t8da5b5-1
 end
 h9cc8ce[53284]=function()
   local n=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   if n==0 then return end
   if n==1 then return sa71af4[t8da5b5] end
   local a={} for j=1,n do a[j]=sa71af4[t8da5b5-n+j] end
   return u8cd9db(a)
 end
 h9cc8ce[2834]=function()
   sa71af4[t8da5b5]=sa71af4[t8da5b5][3]
 end
 h9cc8ce[9046]=function()
   i8e7709=wc48f16.c[i8e7709]
 end
 h9cc8ce[50993]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a ^ b
 end
 h9cc8ce[55676]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a < b
 end
 h9cc8ce[39511]=function()
   local k=sa71af4[t8da5b5] t8da5b5=t8da5b5-1 local t=sa71af4[t8da5b5] sa71af4[t8da5b5]=t[k]
 end
 h9cc8ce[26407]=function()
   local _v=sa71af4[t8da5b5] sa71af4[t8da5b5]=nil t8da5b5=t8da5b5-1 if not _v then i8e7709=wc48f16.c[i8e7709] else i8e7709=i8e7709+1 end
 end
 h9cc8ce[46319]=function()
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=true
 end
 h9cc8ce[30903]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a - b
 end
 h9cc8ce[48024]=function()
   if not ab13720 then local t={n=0} t["me355f82601"]=true ab13720=t end
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=ab13720
 end
 h9cc8ce[12930]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a % b
 end
 h9cc8ce[8212]=function()
   sa71af4[t8da5b5],sa71af4[t8da5b5-1]=sa71af4[t8da5b5-1],sa71af4[t8da5b5]
 end
 h9cc8ce[53916]=function()
   sa71af4[t8da5b5]=sa71af4[t8da5b5][2]
 end
 h9cc8ce[13966]=function()
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=false
 end
 h9cc8ce[44745]=function()
   local k=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   local p=sa71af4[t8da5b5] t8da5b5=t8da5b5-1
   local a={} for j=1,k do a[j]=sa71af4[t8da5b5-k+j] end t8da5b5=t8da5b5-k
   for j=1,p.n do a[k+j]=p[j] end
   return u8cd9db(a)
 end
 h9cc8ce[32607]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a > b
 end
 h9cc8ce[54230]=function()
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=sa71af4[t8da5b5-1]
 end
 h9cc8ce[38522]=function()
   sa71af4[t8da5b5]=sa71af4[t8da5b5][1]
 end
 h9cc8ce[15023]=function()
   local n=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   local f=sa71af4[t8da5b5-n]
   local a={}
   for j=1,n do a[j]=sa71af4[t8da5b5-n+j] end
   t8da5b5=t8da5b5-n-1
   local la=#a
   if la>0 and qbf003c(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   local r=P0f76f1(f(u8cd9db(a)))
   t8da5b5=t8da5b5+1
   sa71af4[t8da5b5]=r
 end
 h9cc8ce[40821]=function()
   sa71af4[t8da5b5]=-sa71af4[t8da5b5]
 end
 h9cc8ce[23815]=function()
   y1e4597[#y1e4597+1]={}
 end
 h9cc8ce[14397]=function()
   local id=wc48f16.c[i8e7709] local v=sa71af4[t8da5b5] t8da5b5=t8da5b5-1 i8e7709=i8e7709+1
   local b=nil for i=#y1e4597,1,-1 do b=y1e4597[i][id] if b then break end end
   if b then b[1]=v end
 end
 h9cc8ce[19522]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a / b
 end
 h9cc8ce[2947]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a == b
 end
 h9cc8ce[5906]=function()
   local n=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   local pt=sa71af4[t8da5b5] sa71af4[t8da5b5]=nil t8da5b5=t8da5b5-1
   for j=1,n do t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=pt[j] end
 end
 h9cc8ce[34909]=function()
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=d891082(wc48f16.c[i8e7709]) i8e7709=i8e7709+1
 end
 h9cc8ce[45308]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a * b
 end
 h9cc8ce[25132]=function()
   local ci=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   local links={}
   for i=1,#L15ca25 do links[#links+1]=L15ca25[i] end
   for i=1,#y1e4597 do links[#links+1]=y1e4597[i] end
   t8da5b5=t8da5b5+1
   sa71af4[t8da5b5]=function(...) return R163fa2(ci,links,...) end
 end
 h9cc8ce[54017]=function()
   sa71af4[t8da5b5]=#sa71af4[t8da5b5]
 end
 h9cc8ce[4362]=function()
   local v=sa71af4[t8da5b5] local k=sa71af4[t8da5b5-1] local t=sa71af4[t8da5b5-2] t[k]=v t8da5b5=t8da5b5-3
 end
 h9cc8ce[6879]=function()
   g2c0599[d891082(wc48f16.c[i8e7709])]=sa71af4[t8da5b5] t8da5b5=t8da5b5-1 i8e7709=i8e7709+1
 end
 h9cc8ce[58517]=function()
   local id=wc48f16.c[i8e7709] local v=sa71af4[t8da5b5] sa71af4[t8da5b5]=nil t8da5b5=t8da5b5-1 i8e7709=i8e7709+1
   y1e4597[#y1e4597][id]={v}
 end
 h9cc8ce[29784]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a + b
 end
 h9cc8ce[38346]=function()
   local id=wc48f16.c[i8e7709] local b=nil i8e7709=i8e7709+1
   for i=#L15ca25,1,-1 do b=L15ca25[i][id] if b then break end end
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=b and b[1]
 end
 h9cc8ce[34716]=function()
   y1e4597[#y1e4597]=nil
 end
 h9cc8ce[13616]=function()
   local ix=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   local n=m706747[ix]
   if not n then n=tonumber(d891082(ix)) m706747[ix]=n end
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=n
 end
 h9cc8ce[16286]=function()
   if sa71af4[t8da5b5] then i8e7709=wc48f16.c[i8e7709] else i8e7709=i8e7709+1 sa71af4[t8da5b5]=nil t8da5b5=t8da5b5-1 end
 end
 h9cc8ce[11369]=function()
   local b=sa71af4[t8da5b5] local a=sa71af4[t8da5b5-1] t8da5b5=t8da5b5-1
   sa71af4[t8da5b5]=a ~= b
 end
 h9cc8ce[47902]=function()
   local id=wc48f16.c[i8e7709] local b=nil i8e7709=i8e7709+1
   for i=#y1e4597,1,-1 do b=y1e4597[i][id] if b then break end end
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=b and b[1]
 end
 h9cc8ce[29296]=function()
   t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=g2c0599[d891082(wc48f16.c[i8e7709])] i8e7709=i8e7709+1
 end
 h9cc8ce[46369]=function()
   local n=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   local f=sa71af4[t8da5b5-n]
   local a={}
   for j=1,n do a[j]=sa71af4[t8da5b5-n+j] end
   t8da5b5=t8da5b5-n-1
   local la=#a
   if la>0 and qbf003c(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   local r=P0f76f1(f(u8cd9db(a)))
   t8da5b5=t8da5b5+1
   sa71af4[t8da5b5]=r[1]
 end
 h9cc8ce[62060]=function()
  i8e7709=wc48f16.c[i8e7709]
 end
 h9cc8ce[64468]=function()
  local t=sa71af4[t8da5b5] sa71af4[t8da5b5]=t
 end
 h9cc8ce[64490]=function()
  t8da5b5=t8da5b5+1 sa71af4[t8da5b5]=d891082(wc48f16.c[i8e7709]) i8e7709=i8e7709+1
 end
 h9cc8ce[64720]=function()
  i8e7709=wc48f16.c[i8e7709]
 end
 h9cc8ce[63716]=function()
  local t=sa71af4[t8da5b5] sa71af4[t8da5b5]=t
 end
 h9cc8ce[61907]=function()
  local t=sa71af4[t8da5b5] sa71af4[t8da5b5]=t
 end
 while true do
  local o7ec6db=wc48f16.c[i8e7709] i8e7709=i8e7709+1
  if o7ec6db==53284 then
   local n=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   if n==0 then return end
   if n==1 then return sa71af4[t8da5b5] end
   local a={} for j=1,n do a[j]=sa71af4[t8da5b5-n+j] end
   return u8cd9db(a)
  end
  if o7ec6db==44745 then
   local k=wc48f16.c[i8e7709] i8e7709=i8e7709+1
   local p=sa71af4[t8da5b5] t8da5b5=t8da5b5-1
   local a={} for j=1,k do a[j]=sa71af4[t8da5b5-k+j] end t8da5b5=t8da5b5-k
   for j=1,p.n do a[k+j]=p[j] end
   return u8cd9db(a)
  end
  local _fn=h9cc8ce[o7ec6db]
  if _fn then _fn() else error("bad opcode "..tostring(o7ec6db),0) end
 end
end
do
 local ok,err=pcall(R163fa2,1,{})
 if not ok then error(err,0) end
end