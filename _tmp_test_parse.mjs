import luaparse from 'luaparse';
let tests=['x+=1','x-=2','for i=1,10 do if i==5 then continue end print(i) end'];
for(let c of tests){
 try{let ast=luaparse.parse(c,{luaVersion:'5.1'}); console.log('OK '+c+' '+JSON.stringify(ast.body[0]).slice(0,1200));}catch(e){console.log('FAIL '+c+' '+e.message);}
}
