local ps8befba=94 -- Phase 4: proto XOR salt (function ref virtualization)
local _d0bad28=function(af48230,b241419,...)
 while true do
  local _sf737={} local _tcdb6=0
  local _y8fa2={{}}
  local _ia08c=1
  local _w809f=af48230[b241419]
  local o22395d=_w809f.c[_ia08c]
  if o22395d==1 then _sf737[_tcdb6]="x" end
 end
end
local _bd21a={61,180,228,240,112,167,97,11,29,61,151,184,97,225,3,235,54,61,239,80,34,195,49,125,220,27,3,223,193,141,42,83,113,178,202,203,21,53,205,90,66}
local _r8d91={{1,41}}
local d48bb26=function(i) local a=_bd21a[1] local rr=_r8d91[i] local b=(217*i+210+42*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end
if false then
local _bd21a2={214,17,239,131,189,168} do local rp=1 while rp<=#_bd21a2 do local np=_bd21a2[rp]+_bd21a2[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=_bd21a2[rp]+_bd21a2[rp+1]*256 rp=rp+2 end local va=(_bd21a2[rp]==1) rp=rp+1 local nc=_bd21a2[rp]+_bd21a2[rp+1]*256+_bd21a2[rp+2]*65536+_bd21a2[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=_bd21a2[rp]+_bd21a2[rp+1]*256+_bd21a2[rp+2]*65536+_bd21a2[rp+3]*16777216 rp=rp+4 end end end
end
local g41c0f2=_G
if getgenv then g41c0f2=getgenv() end
if not g41c0f2 then g41c0f2=_G end
local v2101bf={238,149,212,114,71,183,106,58,166,89,229,200,146,246,73,144,85,14,232,153,174,183,63,171,82,142,242,177,201,5,71,133,146,242,38,129,152,137,218,57,107,255,68,1,190,111,116,34,250,189,64,147,136,177,55,224,13,88,186,138,243,254,8,5,61,249,128,119,123,206,83,75,136,215,45,42,225,235,222,223,186,143,10,50,161,45,87,34,207,198,219,237,72,185,142,203,218,16,108,186,197,189,252,45,117,186,132,99,7,11,176,45,172,241,37,204,26,10,172,178,161,244,204,144,6,173,105,187,192,110,115,228,115,137,195,190,20,21,177,171,26,90,243,59,78,132,44,250,17,59,229,241,77,180,16,9,88,190,23,222,214,228,32,122,203,181,22,89,49,99,11,127,40,200,197,187,150,237,22,212,151,121,3,170,77,138,246,158,4,216,100,138,172,192,202,158,112,230,128,169,241,21,233,75,199,201,3,192,244,145,104,71,184,238,149,140,24,215,206,116,153,102,143,126,232,136,142,43,173,110,235,252,105,36,226,219,21,155,58,105,4,108,161,164,208,30,81,184,221,92,204,23,167,93,83,136,30,122,109,87,184,103,222,217,112,145,194,150,178,163,129,128,189,77,223,95,245,214,120,184,200,139,91,230,226,238,240,173,125,101,94,41,55,227,5,208,178,54,212,179,172,145,230}
local c97f416={}
local r8e20bb={{0,8},{8,6},{14,60},{74,48},{122,24},{146,37},{183,23},{206,45},{251,52}}
local m95ce6b={}
local ivabfe5b=148
local sa1fa7fb=97
local ss933a7e=23
local sn78ac71=38
local sme1721b=90
local df8d4be=function(i)
 local c=c97f416[i] if c then return c end
 local rr=r8e20bb[i] if not rr then return nil end
 local st=rr[1] local ln=rr[2]
 local _salt = (ln % 2 == 0) and ss933a7e or sn78ac71; if ln < 2 then _salt = sme1721b end
 local t="" local prev=(ivabfe5b + i*_salt)%256
 for j=1,ln do
  local p=st+j
  local a=v2101bf[p] local b=(193*p+159+3371531933*1.0*((p*p)%31))%251+175
  local kb=(b + prev*41)%256
  local r,pw=0,1 local aa=a local bb=kb
  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end
  t=t..string.char(r) prev=r
 end
 c97f416[i]=t return t
end
local ud57cd9
if table.unpack then ud57cd9=table.unpack else ud57cd9=unpack end
if not ud57cd9 then ud57cd9=unpack end
local P2a31ac=function(...)
 local t={n=select("#",...)}
 for i=1,t.n do t[i]=select(i,...) end
 t["m0e41c37918"]=true
 return t
end
local q8dd2af=function(t) return type(t)=="table" and t["m0e41c37918"]==true end
local b91c460={}
do
 local src={14,117,248,156,92,49,48,68,116,202,58,177,86,22,239,232,253,219,60,233,115,112,169,180,174,197,246,73,179,117,37,163,130,127,148,199,27,156,203,181,121,89,85,109,161,243,98,237,147,82,57,55,89,132,244,71,208,122,65,237,32,58,59,7,53,191,57,69,20,19,148,52,184,44,173,181,43,15,187,49,99,183,152,162,101,46,114,127,49,106,136,100,194,112,128,241,34,64,224,159,71,213,242,209,54,57,63,43,234,98,47,173,109,85,124,246,181,18,71,186,199,148,138,209,163,224,117,118,73,246,173,209,180,214,160,85,233,128,88,129,232,239,172,195,177,45,121,82,68,48,248,74,156,248,190,127,190,143,198,50,170,235,98,163,96,22,88,241,219,6,62,56,37,187,21,253,52,63,163,105,13,136,37,24,171,155,148,193,24,120,244,145,75,30,16,91,70,139,236,244,67,193,151,16,207,193,12,111,35,139,70,124,123,31,74,90,153,120,24,252,169,155,171,109,117,136,13,108,166,63,52,38,187,187,37,193,240,6,219,38,184,22,96,241,28,235,170,169,242,143,190,109,188,248,156,93,247,48,68,27,240,45,177,145,77,239,232,96,238,128,233,228,152,214,180,20,149,246,73,212,134,224,163,225,180,148,199,1,80,18,181,195,136,85,109,171,230,98,234,41,9,57,54,136,222,213,71,77,153,64,34,79,10,112,194,2,238,106,49,223,126,46,101,157,163,183,99,4,106,15,43,50,121,44,184,82,127,19,20,246,48,191,53,53,43,58,32,13,130,122,208,40,229,132,79,238,170,88,147,134,247,241,161,181,198,89,121,34,147,134,27,126,178,125,130,102,32,62,179,242,99,196,174,125,96,25,115,30,219,51,253,97,15,23,86,222,29,192,116,172,140,56,92,234,102,117,14,39,215,124,133,116,231,77,198,254,106,227,209,96,38,72,166,159,234,114,69,195,100,102,169,132,104,36,215,115,8,167,207,198,116,244,145,240,78,16,29,21,255,236,110,111,8,151,137,30,33,12,110,189,69,70,29,219,110,74,145,219,186,24,207,58,120,171,215,37,71,13,169,103,63,22,69,115,170,37,236,72,6,219,5,45,22,96,18,131,235,170,230,181,143,190,120,235,248,156,149,142,48,68,19,120,45,177,101,25,239,232,154,139,128,233,26,102,214,180,255,10,246,73,120,79,224,163,173,191,148,199,219,144,18,181,142,2,85,109,27,160,98,234,40,205,57,54,57,26,213,71,39,41,64,34,225,155,112,194,86,118,106,49,157,243,46,101,233,226,183,99,14,128,15,43,121,110,44,184,82,127,19,20,2,100,191,53,3,209,58,32,56,150,122,208,70,26,132,79,44,239,88,147,254,167,241,161,185,155,89,121,14,50,134,27,167,73,125,130,104,145,62,179,242,214,196,174,255,19,25,115,32,54,51,253,8,45,23,86,40,117,192,116,94,230,56,92,252,37,117,14,35,82,124,133,195,148,77,198,247,69,227,209,187,219,72,166,221,93,114,69,101,241,102,169,185,146,36,215,17,44,167,207,162,207,244,145,240,78,16,29,209,10,236,110,103,189,151,137,45,16,12,110,41,75,70,29,141,252,74,145,28,196,24,207,108,234,171,215,225,72,13,169,221,170,52,69,172,183,37,166,241,32,219,209,61,26,96,198,87,50,170,133,198,94,190,14,66,169,156,92,248,38,68,116,122,154,177,86,173,88,232,253,242,33,233,115,111,72,180,174,15,135,73,179,160,156,163,130,126,148,135,27,162,18,141,121,88,72,109,129,241,98,234,215,208,57,54,216,215,213,71,40,156,64,34,190,70,112,194,94,195,106,49,137,240,46,101,172,233,183,99,182,236,15,43,168,218,44,184,64,161,19,20,166,235,191,53,3,209,58,32,202,252,122,208,104,176,132,79,89,9,88,147,35,212,241,161,173,67,89,121,109,129,134,27,47,40,125,130,183,37,62,179,63,104,196,174,58,126,25,115,82,21,51,253,41,78,23,86,208,70,192,116,253,22,56,92,150,239,117,14,96,131,124,133,97,154,77,198,76,152,227,209,176,122,72,166,210,224,114,69,52,63,103,181,13,176,36,215,171,21,15,207,24,160,103,145,74,127,205,29,70,50,202,110,12,21,89,137,151,21,194,110,236,49,23,29,16,129,54,145,244,108,221,207,167,242,212,215,36,191,92,169,102,73,170,69,114,234,235,166,72,216,215,209,227,173,64,198,77,21,163,133,124,236,119,14,117,151,172,92,56,137,98,116,192,218,226,86,23,84,200,253,51,211,157,115,25,29,217,174,196,218,199,179,62,164,43,130,125,245,172,27,134,156,29,121,89,194,62,161,241,71,101,147,88,35,224,79,132,111,240,208,122,11,231,32,58,136,36,53,191,57,69,20,19,206,167,184,44,152,161,43,15,196,70,99,183,56,125,101,46,138,76,49,106,5,100,194,112,167,253,34,64,25,25,71,213,30,0,54,57,175,192,234,98,186,100,109,85,117,247,181,18,181,21,199,148,244,98,163,224,63,124,73,246,173,209,180,214,193,224,233,128,169,178,232,239,141,25,177,45,147,0,68,48,83,32,156,248,207,223,190,143,127,133,178,235,106,198,117,22,227,197,219,64,72,166,37,33,61,69,52,168,53,169,13,80,183,215,171,92,253,207,24,191,174,145,74,145,184,29,70,28,109,110,12,54,204,137,151,173,153,110,236,129,81,29,16,124,131,145,244,14,134,207,167,252,19,215,36,195,200,169,102,16,81,69,114,112,84,166,72,195,27,209,227,232,105,198,77,80,138,133,124,133,169,14,117,51,241,92,56,228,138,116,192,74,9,86,23,229,255,253,51,227,32,115,25,14,39,174,196,1,26,179,62,171,102,130,125,244,26,27,134,117,13,121,89,239,218,161,241,216,59,147,88,28,185,79,132,66,198,208,122,129,131,32,58,6,92,53,191,208,96,20,19,154,127,184,44,42,190,43,15,196,70,99,183,45,119,101,46,216,101,49,106,4,21,194,112,31,175,34,64,77,129,71,213,207,138,54,57,134,159,234,98,235,120,109,85,224,95,181,18,237,103,199,148,182,239,163,224,42,118,73,246,225,33,180,214,117,230,233,128,137,172,232,239,215,64,177,45,32,182,68,48,255,6,156,248,20,101,190,143,16,16,170,235,132,112,96,22,42,103,219,6,66,177,37,187,178,83,52,63,1,17,13,136,75,231,171,155,136,170,24,120,130,15,74,31,240,223,70,139,123,61,12,193,149,137,215,193,70,110,237,159,70,50,16,31,74,102,175,120,24,213,113,155,171,47,194,136,13,134,164,63,52,128,178,187,37,81,19,6,219,49,33,22,96,49,30,235,170,62,233,143,190,101,9,248,156,157,153,48,68,138,201,45,177,76,193,239,232,3,58,128,233,186,175,214,180,101,169,246,73,224,74,224,163,131,178,148,199,52,227,18,181,109,156,85,109,60,44,98,234,88,53,57,54,142,37,213,71,56,198,64,34,71,130,112,194,235,179,106,49,234,26,46,101,127,118,183,99,224,126,15,43,119,114,44,184,155,39,19,20,98,30,191,53,171,15,58,32,153,213,122,208,40,229,132,79,140,104,88,147,80,179,241,161,240,136,89,121,59,186,134,27,126,178,125,130,162,47,62,179,102,147,196,174,61,54,25,115,34,237,51,253,132,122,23,86,44,240,192,116,211,177,56,92,157,248,69,14,190,147,124,188,170,235,77,130,232,22,227,107,10,6,72,88,44,187,114,37,233,63,102,19,220,136,36,99,177,155,167,206,215,120,244,42,106,31,16,9,131,139,236,165,97,193,151,233,74,193,12,134,80,139,70,227,25,31,74,190,54,120,24,14,6,155,171,78,124,136,13,96,208,63,52,204,146,187,37,145,25,6,219,130,151,22,96,24,65,235,170,78,17,143,190,103,10,248,156,70,225,48,68,88,78,45,177,97,70,239,232,252,252,128,233,238,196,214,180,48,184,246,73,68,101,224,163,117,46,148,199,134,91,18,181,18,37,85,109,86,162,98,234,41,137,57,54,142,37,213,71,71,41,64,34,155,26,112,194,26,125,106,49,95,214,46,101,121,141,183,99,255,193,15,43,253,203,44,184,242,125,19,20,250,7,191,53,42,204,58,32,14,206,122,208,159,70,132,79,141,172,88,147,125,49,241,161,62,33,89,121,47,93,134,27,124,180,125,130,57,175,62,179,122,248,196,174,181,25,25,115,82,21,51,253,233,239,45,86,176,62,192,82,68,48,56,198,211,248,117,153,237,143,124,81,100,235,77,124,177,22,227,5,21,6,72,205,89,187,114,254,20,63,102,226,200,136,36,110,141,155,167,224,125,120,244,139,147,31,16,164,96,139,236,167,186,193,151,234,94,193,12,215,202,139,70,195,28,31,74,12,23,120,24,172,110,155,171,64,165,136,13,32,134,63,52,255,163,187,37,114,134,6,219,106,118,22,96,114,87,235,170,206,185,143,190,199,195,248,156,136,246,48,68,117,15,45,177,204,88,239,232,3,58,128,233,228,74,214,180,197,184,246,73,109,50,224,163,173,191,148,199,119,19,18,181,61,209,85,109,26,100,98,234,84,2,57,54,79,132,212,94,208,49,64,34,32,180,216,194,53,190,165,49,20,18,225,101,184,248,121,99,43,196,126,43,99,173,250,184,101,125,103,20,49,222,165,53,194,202,107,32,34,190,115,208,71,66,215,79,54,90,145,147,234,104,230,161,109,220,185,121,181,169,166,27,199,197,179,130,163,197,177,179,73,178,76,174,180,225,72,115,233,183,98,253,232,85,70,86,177,74,120,116,68,49,247,92,156,97,45,14,190,203,244,133,170,206,194,198,96,139,62,209,219,136,224,166,37,101,126,69,52,132,243,169,13,80,183,215,171,1,232,207,24,179,153,145,74,164,48,29,70,22,49,110,12,95,235,137,151,161,209,110,236,129,81,29,16,136,25,145,244,144,164,207,167,115,23,215,36,228,152,169,102,37,226,69,114,136,43,166,72,210,21,209,227,12,182,198,77,21,163,133,124,21,241,14,117,63,198,92,56,31,33,116,192,105,57,86,23,143,53,253,51,138,254,115,25,215,123,174,196,159,54,179,62,211,173,130,125,46,112,27,134,171,147,121,89,112,226,161,241,165,176,147,88,231,58,79,132,182,142,208,122,32,255,32,58,187,179,53,191,33,244,20,19,233,63,184,44,132,109,43,15,152,170,99,183,219,227,101,46,120,104,49,106,95,247,194,112,128,113,34,64,224,159,71,213,231,134,54,57,28,27,234,98,240,161,119,85,88,109,181,38,134,27,199,149,178,130,163,128,227,179,73,236,18,174,180,79,65,115,233,59,19,253,232,84,130,86,177,245,83,116,68,137,30,92,156,67,85,14,190,53,203,133,170,81,28,198,96,51,108,209,219,35,199,166,37,177,101,69,52,199,128,169,13,67,85,215,171,67,52,207,24,143,167,145,74,11,213,29,70,49,189,110,12,246,198,137,151,10,125,110,236,224,58,29,16,231,172,145,244,134,17,207,167,129,114,215,36,31,94,169,102,133,229,69,114,215,176,166,72,152,167,209,227,223,214,198,77,19,76,133,124,228,194,14,117,159,36,92,56,87,252,116,192,243,189,86,23,97,64,253,51,209,39,115,25,250,58,174,196,76,254,179,62,131,106,130,125,3,148,27,134,242,119,121,89,219,197,161,241,149,177,147,88,106,66,79,132,79,8,208,122,139,79,32,58,203,226,53,191,126,244,20,19,149,240,184,44,99,173,43,15}
 for i=1,#src do
  local a=src[(i)] local _junkb6c=0 local b=((i*i*14+i*61+186)%4294967296)%251+4
  local r,pw=0,1
  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end
  b91c460[i]=r
 end
end
local Ka67ca5={}
do
 local rp=1
 while rp<=#b91c460 do
  local np=b91c460[rp] + b91c460[rp+1]*256 rp=rp+2
  local ps={}
  for j=1,np do ps[j]=b91c460[rp] + b91c460[rp+1]*256 rp=rp+2 end
  local va=(b91c460[rp]==1) rp=rp+1
  local mr=b91c460[rp] + b91c460[rp+1]*256 rp=rp+2
  local nc=b91c460[rp] + b91c460[rp+1]*256 + b91c460[rp+2]*65536 + b91c460[rp+3]*16777216 rp=rp+4
  local cd={}
  for j=1,nc do
   cd[j]=b91c460[rp] + b91c460[rp+1]*256 + b91c460[rp+2]*65536 + b91c460[rp+3]*16777216
   rp=rp+4
  end
  Ka67ca5[#Ka67ca5+1]={c=cd,p=ps,v=va,maxReg=mr}
 end
end
local R3a3957
R3a3957=function(xf03dc2,L8b16d3,...)
 local w498abd=Ka67ca5[xf03dc2]
 local s5ed811={} local t0c2c07=0
 local y5d9ce8={{}}
 local ab367a9=nil
 local i85de3d=1
 local ps=w498abd.p
 local ed316c7={} local b8a4087=0 local k103bdf=w498abd.maxReg or 32
 local Gb0debf={} local f649b70=0
 for i=1,#ps do local cell={select(i,...)} ed316c7[b8a4087+ps[i]]=cell y5d9ce8[1][ps[i]]=cell end
 if w498abd.v then ab367a9=P2a31ac(select(#ps+1,...)) end
 local Feca080={chunk=xf03dc2,pc=i85de3d,base=b8a4087,top=k103bdf,ret=nil,nRet=0,vararg=ab367a9,upenv=L8b16d3,caller=nil,build=1869581615,reg=ed316c7}
 -- frame pc is alias of i85de3d, base=b8a4087 top=k103bdf reg window ed316c7[b8a4087..k103bdf]
 local jc99b61={}
 jc99b61._instr=false
 local h1073a5={}
 h1073a5[0xbce8]=function()
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=nil
 end
 h1073a5[0x93d8]=function()
   s5ed811[t0c2c07]=nil t0c2c07=t0c2c07-1
 end
 h1073a5[0xd1ba]=function()
   local p=s5ed811[t0c2c07] t0c2c07=t0c2c07-1 local t=s5ed811[t0c2c07] s5ed811[t0c2c07]=nil t0c2c07=t0c2c07-1
   for i=1,p.n do t[#t+1]=p[i] end
 end
 h1073a5[0xb7ba]=function()
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=df8d4be(w498abd.c[i85de3d]) i85de3d=i85de3d+1
 end
 h1073a5[0xce51]=function()
   local _v=s5ed811[t0c2c07] s5ed811[t0c2c07]=nil t0c2c07=t0c2c07-1 if _v then i85de3d=w498abd.c[i85de3d] else i85de3d=i85de3d+1 end
 end
 h1073a5[0xdd60]=function()
   s5ed811[t0c2c07]=#s5ed811[t0c2c07]
 end
 h1073a5[0xa88e]=function()
   s5ed811[t0c2c07]=s5ed811[t0c2c07][1]
 end
 h1073a5[0xdd9d]=function()
   local k=s5ed811[t0c2c07] t0c2c07=t0c2c07-1 local t=s5ed811[t0c2c07] s5ed811[t0c2c07]=t[k]
 end
 h1073a5[0x8197]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a - b
 end
 h1073a5[0x53f7]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a < b
 end
 h1073a5[0xc963]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a <= b
 end
 h1073a5[0x5ac7]=function()
   local _n=(s5ed811[t0c2c07]==nil) s5ed811[t0c2c07]=nil t0c2c07=t0c2c07-1 if _n then i85de3d=w498abd.c[i85de3d] else i85de3d=i85de3d+1 end
 end
 h1073a5[0x9e76]=function()
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=false
 end
 h1073a5[0xc2e0]=function()
   local ix=w498abd.c[i85de3d] i85de3d=i85de3d+1
   local n=m95ce6b[ix]
   if not n then n=tonumber(df8d4be(ix)) m95ce6b[ix]=n end
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=n
 end
 h1073a5[0x7c6b]=function()
   local id=w498abd.c[i85de3d] local v=s5ed811[t0c2c07] s5ed811[t0c2c07]=nil t0c2c07=t0c2c07-1 i85de3d=i85de3d+1
   local cell={v}
   ed316c7[b8a4087+id]=cell
   y5d9ce8[#y5d9ce8][id]=cell
 end
 h1073a5[0x8f25]=function()
   if not s5ed811[t0c2c07] then i85de3d=w498abd.c[i85de3d] else i85de3d=i85de3d+1 s5ed811[t0c2c07]=nil t0c2c07=t0c2c07-1 end
 end
 h1073a5[0x956c]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a * b
 end
 h1073a5[0x7453]=function()
   local v=s5ed811[t0c2c07] local k=s5ed811[t0c2c07-1] local t=s5ed811[t0c2c07-2] t[k]=v t0c2c07=t0c2c07-3
 end
 h1073a5[0x5bf7]=function()
   if s5ed811[t0c2c07] then i85de3d=w498abd.c[i85de3d] else i85de3d=i85de3d+1 s5ed811[t0c2c07]=nil t0c2c07=t0c2c07-1 end
 end
 h1073a5[0xe39d]=function()
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=true
 end
 h1073a5[0xb867]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a .. b
 end
 h1073a5[0xc22f]=function()
   local _v=s5ed811[t0c2c07] s5ed811[t0c2c07]=nil t0c2c07=t0c2c07-1 if not _v then i85de3d=w498abd.c[i85de3d] else i85de3d=i85de3d+1 end
 end
 h1073a5[0x26b9]=function()
   local k=w498abd.c[i85de3d] i85de3d=i85de3d+1
   local p=s5ed811[t0c2c07] t0c2c07=t0c2c07-1
   local a={} for j=1,k do a[j]=s5ed811[t0c2c07-k+j] end t0c2c07=t0c2c07-k
   for j=1,p.n do a[k+j]=p[j] end
   if f649b70>0 then local caller=Gb0debf[f649b70]; f649b70=f649b70-1; w498abd=caller.code; i85de3d=caller.pc; b8a4087=caller.base; k103bdf=caller.top; s5ed811=caller.s; t0c2c07=caller.sp; y5d9ce8=caller.sc; ab367a9=caller.va; L8b16d3=caller.lk; Feca080=caller.fr or caller; if caller.nRet==1 then t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=a[1] elseif caller.nRet==-1 then local r=P2a31ac(ud57cd9(a)); t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=r else for j=1,#a do t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=a[j] end end else return ud57cd9(a) end
 end
 h1073a5[0x6dcb]=function()
   local n=w498abd.c[i85de3d] i85de3d=i85de3d+1
   local f=s5ed811[t0c2c07-n]
   local a={}
   for j=1,n do a[j]=s5ed811[t0c2c07-n+j] end
   t0c2c07=t0c2c07-n-1
   local la=#a
   if la>0 and q8dd2af(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   if f and jc99b61[f] then
     if jc99b61._instr then print(string.format("CALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Feca080.chunk or 0), tostring(f.proto or 0), tostring(f649b70), tostring(w498abd.maxReg or 0), tostring(i85de3d), tostring(b8a4087), tostring(k103bdf), tostring(t0c2c07+1), tostring(-1))) end
     f649b70=f649b70+1
     Gb0debf[f649b70]={code=w498abd, pc=i85de3d, base=b8a4087, top=k103bdf, s=s5ed811, sp=t0c2c07, sc=y5d9ce8, va=ab367a9, lk=L8b16d3, fr=Feca080, nRet=-1, retDest=t0c2c07+1}
     local calleeProto2=f.proto
     local calleeChunk2=Ka67ca5[calleeProto2]
     if not calleeChunk2 then error("bad proto "..tostring(calleeProto2).." CH="..tostring(#Ka67ca5),0) end
     local newBASE=k103bdf+1
     b8a4087=newBASE
     k103bdf=b8a4087+(calleeChunk2.maxReg or 32)
     s5ed811={} t0c2c07=0
     y5d9ce8={{}}
     ab367a9=nil
     L8b16d3=f.env
     w498abd=calleeChunk2
     i85de3d=1
     local ps2=w498abd.p
     for i2=1,#ps2 do local id2=ps2[i2] local v2=a[i2] local cell2={v2} ed316c7[b8a4087+id2]=cell2 y5d9ce8[1][id2]=cell2 end
     if w498abd.v then
       local vaArgs2={} for i2=#ps2+1,#a do vaArgs2[#vaArgs2+1]=a[i2] end
       if #vaArgs2>0 then ab367a9=P2a31ac(ud57cd9(vaArgs2)) else local t2={n=0} t2["m0e41c37918"]=true ab367a9=t2 end
     end
     Feca080={chunk=calleeProto2, pc=i85de3d, base=b8a4087, top=k103bdf, ret=nil, nRet=0, vararg=ab367a9, upenv=L8b16d3, caller=Gb0debf[f649b70]}
   else
     local r=P2a31ac(f(ud57cd9(a)))
     t0c2c07=t0c2c07+1
     s5ed811[t0c2c07]=r
   end
 end
 h1073a5[0xd91a]=function()
   local n=w498abd.c[i85de3d] i85de3d=i85de3d+1
   if f649b70>0 then
     if jc99b61._instr then print(string.format("RETURN %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Feca080.chunk or 0), tostring(Gb0debf[f649b70].code and Gb0debf[f649b70].code.maxReg or 0), tostring(f649b70), tostring(w498abd.maxReg or 0), tostring(i85de3d), tostring(b8a4087), tostring(k103bdf), tostring(Gb0debf[f649b70].retDest or 0), tostring(Gb0debf[f649b70].nRet or 0))) end
     local retVals={}
     if n==0 then local _=0
     elseif n==1 then retVals[1]=s5ed811[t0c2c07]; t0c2c07=t0c2c07-1
     else for j=1,n do retVals[j]=s5ed811[t0c2c07-n+j] end; t0c2c07=t0c2c07-n end
     local caller=Gb0debf[f649b70]; f649b70=f649b70-1; w498abd=caller.code; i85de3d=caller.pc; b8a4087=caller.base; k103bdf=caller.top; s5ed811=caller.s; t0c2c07=caller.sp; y5d9ce8=caller.sc; ab367a9=caller.va; L8b16d3=caller.lk; Feca080=caller.fr or caller
     if caller.nRet==1 then t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=retVals[1]
     elseif caller.nRet==-1 then local r=P2a31ac(ud57cd9(retVals)); t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=r
     else for j=1,#retVals do t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=retVals[j] end end
   else
     if n==0 then return end
     if n==1 then return s5ed811[t0c2c07] end
     local a={} for j=1,n do a[j]=s5ed811[t0c2c07-n+j] end; return ud57cd9(a)
   end
 end
 h1073a5[0x71cb]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a >= b
 end
 h1073a5[0x16c0]=function()
   s5ed811[t0c2c07]=not s5ed811[t0c2c07]
 end
 h1073a5[0x7c9e]=function()
   s5ed811[t0c2c07]=-s5ed811[t0c2c07]
 end
 h1073a5[0xe6f8]=function()
   s5ed811[t0c2c07]=s5ed811[t0c2c07][3]
 end
 h1073a5[0x6b61]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a % b
 end
 h1073a5[0x20bb]=function()
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]={}
 end
 h1073a5[0x4f9a]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a + b
 end
 h1073a5[0x51ba]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a == b
 end
 h1073a5[0x170a]=function()
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=g41c0f2[df8d4be(w498abd.c[i85de3d])] i85de3d=i85de3d+1
 end
 h1073a5[0xa1c1]=function()
   s5ed811[t0c2c07]=s5ed811[t0c2c07][2]
 end
 h1073a5[0x95bb]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a > b
 end
 h1073a5[0x8e2c]=function()
   local id=w498abd.c[i85de3d] i85de3d=i85de3d+1
   local cell=ed316c7[b8a4087+id]
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=cell and cell[1]
 end
 h1073a5[0x306f]=function()
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=s5ed811[t0c2c07-1]
 end
 h1073a5[0x1ab4]=function()
   y5d9ce8[#y5d9ce8+1]={}
 end
 h1073a5[0xd61a]=function()
   local id=w498abd.c[i85de3d] local v=s5ed811[t0c2c07] t0c2c07=t0c2c07-1 i85de3d=i85de3d+1
   local cell=ed316c7[b8a4087+id]
   if cell then cell[1]=v else ed316c7[b8a4087+id]={v} end
   -- keep SC in sync for upvalue capture (live cell)
   local top=y5d9ce8[#y5d9ce8] if top then top[id]=ed316c7[b8a4087+id] end
 end
 h1073a5[0x5137]=function()
   i85de3d=w498abd.c[i85de3d]
 end
 h1073a5[0xb6c9]=function()
   error("TAILCALL via HAND")
 end
 h1073a5[0xc54b]=function()
   g41c0f2[df8d4be(w498abd.c[i85de3d])]=s5ed811[t0c2c07] t0c2c07=t0c2c07-1 i85de3d=i85de3d+1
 end
 h1073a5[0xced4]=function()
   local id=w498abd.c[i85de3d] local b=nil i85de3d=i85de3d+1
   for i=#L8b16d3,1,-1 do b=L8b16d3[i][id] if b then break end end
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=b and b[1]
 end
 h1073a5[0xcf01]=function()
   s5ed811[t0c2c07],s5ed811[t0c2c07-1]=s5ed811[t0c2c07-1],s5ed811[t0c2c07]
 end
 h1073a5[0x8844]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a / b
 end
 h1073a5[0x5899]=function()
   y5d9ce8[#y5d9ce8]=nil
 end
 h1073a5[0x7f69]=function()
   local n=w498abd.c[i85de3d] i85de3d=i85de3d+1
   local f=s5ed811[t0c2c07-n]
   local a={}
   for j=1,n do a[j]=s5ed811[t0c2c07-n+j] end
   t0c2c07=t0c2c07-n-1
   local la=#a
   if la>0 and q8dd2af(a[la]) then
    local pt=a[la] local flat={} local fi=0
    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end
    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end
    a=flat
   end
   if f and jc99b61[f] then
     if jc99b61._instr then print(string.format("CALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Feca080.chunk or 0), tostring(f.proto or 0), tostring(f649b70), tostring(w498abd.maxReg or 0), tostring(i85de3d), tostring(b8a4087), tostring(k103bdf), tostring(t0c2c07+1), tostring(1))) end
     f649b70=f649b70+1
     Gb0debf[f649b70]={code=w498abd, pc=i85de3d, base=b8a4087, top=k103bdf, s=s5ed811, sp=t0c2c07, sc=y5d9ce8, va=ab367a9, lk=L8b16d3, fr=Feca080, nRet=1, retDest=t0c2c07+1}
     local calleeProto2=f.proto
     local calleeChunk2=Ka67ca5[calleeProto2]
     if not calleeChunk2 then error("bad proto "..tostring(calleeProto2).." CH="..tostring(#Ka67ca5),0) end
     local newBASE=k103bdf+1
     b8a4087=newBASE
     k103bdf=b8a4087+(calleeChunk2.maxReg or 32)
     s5ed811={} t0c2c07=0
     y5d9ce8={{}}
     ab367a9=nil
     L8b16d3=f.env
     w498abd=calleeChunk2
     i85de3d=1
     local ps2=w498abd.p
     for i2=1,#ps2 do local id2=ps2[i2] local v2=a[i2] local cell2={v2} ed316c7[b8a4087+id2]=cell2 y5d9ce8[1][id2]=cell2 end
     if w498abd.v then
       local vaArgs2={} for i2=#ps2+1,#a do vaArgs2[#vaArgs2+1]=a[i2] end
       if #vaArgs2>0 then ab367a9=P2a31ac(ud57cd9(vaArgs2)) else local t2={n=0} t2["m0e41c37918"]=true ab367a9=t2 end
     end
     Feca080={chunk=calleeProto2, pc=i85de3d, base=b8a4087, top=k103bdf, ret=nil, nRet=0, vararg=ab367a9, upenv=L8b16d3, caller=Gb0debf[f649b70]}
   else
     local r=P2a31ac(f(ud57cd9(a)))
     t0c2c07=t0c2c07+1
     s5ed811[t0c2c07]=r[1]
   end
 end
 h1073a5[0xe089]=function()
   local _ci_enc=w498abd.c[i85de3d] i85de3d=i85de3d+1
   local ci=0 local _aa=_ci_enc local _bb=ps8befba local _pw=1 for _=1,8 do local x=_aa%2 local y=_bb%2 if x~=y then ci=ci+_pw end _aa=(_aa-x)/2 _bb=(_bb-y)/2 _pw=_pw*2 end while _aa>0 or _bb>0 do local x=_aa%2 local y=_bb%2 if x~=y then ci=ci+_pw end _aa=(_aa-x)/2 _bb=(_bb-y)/2 _pw=_pw*2 end
   local links={}
   for i=1,#L8b16d3 do links[#links+1]=L8b16d3[i] end
   for i=1,#y5d9ce8 do links[#links+1]=y5d9ce8[i] end
   local vmf={isVM=true, proto=ci, env=links, maxReg=Ka67ca5[ci].maxReg}
   setmetatable(vmf,{__call=function(_, ...) return R3a3957(vmf.proto, vmf.env, ...) end})
   jc99b61[vmf]=true
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=vmf
 end
 h1073a5[0xcde]=function()
   local ix=w498abd.c[i85de3d] i85de3d=i85de3d+1
   s5ed811[t0c2c07]=s5ed811[t0c2c07][ix]
 end
 h1073a5[0x652f]=function()
   local n=w498abd.c[i85de3d] i85de3d=i85de3d+1
   local pt=s5ed811[t0c2c07] s5ed811[t0c2c07]=nil t0c2c07=t0c2c07-1
   for j=1,n do t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=pt[j] end
 end
 h1073a5[0x9fe]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a ^ b
 end
 h1073a5[0xc514]=function()
   -- CLOSE Feca080 (no-op, cells live via L8b16d3)
 end
 h1073a5[0xc0c5]=function()
   if not ab367a9 then local t={n=0} t["m0e41c37918"]=true ab367a9=t end
   t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=ab367a9
 end
 h1073a5[0x5397]=function()
   local id=w498abd.c[i85de3d] local v=s5ed811[t0c2c07] t0c2c07=t0c2c07-1 i85de3d=i85de3d+1
   local b=nil for i=#L8b16d3,1,-1 do b=L8b16d3[i][id] if b then break end end
   if b then b[1]=v end
 end
 h1073a5[0xe33]=function()
   local b=s5ed811[t0c2c07] local a=s5ed811[t0c2c07-1] t0c2c07=t0c2c07-1
   s5ed811[t0c2c07]=a ~= b
 end
 h1073a5[62171]=function()
  local k=s5ed811[t0c2c07] t0c2c07=t0c2c07-1 local t=s5ed811[t0c2c07] s5ed811[t0c2c07]=t[k]
 end
 h1073a5[61955]=function()
  i85de3d=w498abd.c[i85de3d]
 end
 h1073a5[63023]=function()
  t0c2c07=t0c2c07+1 s5ed811[t0c2c07]=df8d4be(w498abd.c[i85de3d]) i85de3d=i85de3d+1
 end
 while true do
  local o37ed6e=w498abd.c[i85de3d] i85de3d=i85de3d+1
  if o37ed6e==55578 then
   local n=w498abd.c[i85de3d] i85de3d=i85de3d+1
   if f649b70>0 then
     if jc99b61._instr then print(string.format("RETURN %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Feca080.chunk or 0), tostring(Gb0debf[f649b70].code and Gb0debf[f649b70].code.maxReg or 0), tostring(f649b70), tostring(w498abd.maxReg or 0), tostring(i85de3d), tostring(b8a4087), tostring(k103bdf), tostring(Gb0debf[f649b70].retDest or 0), tostring(Gb0debf[f649b70].nRet or 0))) end
     local retVals={}
     if n==0 then local _=0
     elseif n==1 then retVals[1]=s5ed811[t0c2c07]; t0c2c07=t0c2c07-1
     else for j=1,n do retVals[j]=s5ed811[t0c2c07-n+j] end; t0c2c07=t0c2c07-n end
     local caller=Gb0debf[f649b70]; f649b70=f649b70-1; w498abd=caller.code; i85de3d=caller.pc; b8a4087=caller.base; k103bdf=caller.top; s5ed811=caller.s; t0c2c07=caller.sp; y5d9ce8=caller.sc; ab367a9=caller.va; L8b16d3=caller.lk; Feca080=caller.fr or caller
     if caller.nRet==1 then t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=retVals[1]
     elseif caller.nRet==-1 then local r=P2a31ac(ud57cd9(retVals)); t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=r
     else for j=1,#retVals do t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=retVals[j] end end
   else
     if n==0 then return end
     if n==1 then return s5ed811[t0c2c07] end
     local a={} for j=1,n do a[j]=s5ed811[t0c2c07-n+j] end; return ud57cd9(a)
   end
  elseif o37ed6e==9913 then
   if jc99b61._instr and f649b70>0 then print(string.format("RETURN RETP %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Feca080.chunk or 0), tostring(Gb0debf[f649b70].code and Gb0debf[f649b70].code.maxReg or 0), tostring(f649b70), tostring(w498abd.maxReg or 0), tostring(i85de3d), tostring(b8a4087), tostring(k103bdf), tostring(Gb0debf[f649b70].retDest or 0), tostring(Gb0debf[f649b70].nRet or 0))) end
   local k=w498abd.c[i85de3d] i85de3d=i85de3d+1
   local p=s5ed811[t0c2c07] t0c2c07=t0c2c07-1
   local a={} for j=1,k do a[j]=s5ed811[t0c2c07-k+j] end t0c2c07=t0c2c07-k
   for j=1,p.n do a[k+j]=p[j] end
   if f649b70>0 then local caller=Gb0debf[f649b70]; f649b70=f649b70-1; w498abd=caller.code; i85de3d=caller.pc; b8a4087=caller.base; k103bdf=caller.top; s5ed811=caller.s; t0c2c07=caller.sp; y5d9ce8=caller.sc; ab367a9=caller.va; L8b16d3=caller.lk; Feca080=caller; if caller.nRet==1 then t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=a[1] elseif caller.nRet==-1 then local r=P2a31ac(ud57cd9(a)); t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=r else for j=1,#a do t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=a[j] end end else return ud57cd9(a) end
  elseif o37ed6e==46793 then
   local n=w498abd.c[i85de3d] i85de3d=i85de3d+1
   local f=s5ed811[t0c2c07-n]
   local a={} for j=1,n do a[j]=s5ed811[t0c2c07-n+j] end t0c2c07=t0c2c07-n-1
   local la=#a if la>0 and q8dd2af(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end
   if f and jc99b61[f] then
     if jc99b61._instr then print(string.format("TAILCALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(Feca080.chunk or 0), tostring(f.proto or 0), tostring(f649b70), tostring(w498abd.maxReg or 0), tostring(i85de3d), tostring(b8a4087), tostring(k103bdf), tostring(-1), tostring(-1))) end
     local calleeProto3=f.proto local calleeChunk3=Ka67ca5[calleeProto3] if not calleeChunk3 then error("bad tail proto "..tostring(calleeProto3),0) end for i3=b8a4087,k103bdf do ed316c7[i3]=nil end local newBASE3=b8a4087 b8a4087=newBASE3 k103bdf=b8a4087+(calleeChunk3.maxReg or 32) s5ed811={} t0c2c07=0 y5d9ce8={{}} L8b16d3=f.env w498abd=calleeChunk3 i85de3d=1 local ps3=w498abd.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} ed316c7[b8a4087+id3]=cell3 y5d9ce8[1][id3]=cell3 end if w498abd.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then ab367a9=P2a31ac(ud57cd9(vaArgs3)) else local t3={n=0} t3["m0e41c37918"]=true ab367a9=t3 end else ab367a9=nil end Feca080={chunk=calleeProto3, pc=i85de3d, base=b8a4087, top=k103bdf, ret=nil, nRet=0, vararg=ab367a9, upenv=L8b16d3, caller=Feca080.caller}
   else
     if f649b70>0 then
       local ret_P = P2a31ac(f(ud57cd9(a)))
       local caller_T = Gb0debf[f649b70]; f649b70=f649b70-1; w498abd=caller_T.code; i85de3d=caller_T.pc; b8a4087=caller_T.base; k103bdf=caller_T.top; s5ed811=caller_T.s; t0c2c07=caller_T.sp; y5d9ce8=caller_T.sc; ab367a9=caller_T.va; L8b16d3=caller_T.lk; Feca080=caller_T
       if caller_T.nRet==1 then t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=ret_P[1]
       elseif caller_T.nRet==-1 then t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=ret_P
       else for j_T=1,ret_P.n do t0c2c07=t0c2c07+1; s5ed811[t0c2c07]=ret_P[j_T] end end
     else return f(ud57cd9(a)) end
   end
  else
   local _fn=h1073a5[o37ed6e]
   if _fn then _fn() else error("bad opcode "..tostring(o37ed6e),0) end
  end
 end
end
do
 local ok,err=pcall(R3a3957,1,{})
 if not ok then error(err,0) end
end