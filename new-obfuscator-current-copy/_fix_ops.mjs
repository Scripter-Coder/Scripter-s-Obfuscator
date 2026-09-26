import fs from 'fs';
let p='C:/Users/Ryzen 9 5900x/Desktop/Special Website/ScripterHub Website/Obfuscator-s Website/new-obfuscator-current-copy/src/targets/luau.js';
let s=fs.readFileSync(p,'utf8');
s=s.replace(`  const ops = {\n    "+=": "+",\n    "-=": "-",\n    "*=": "*",\n    "/=": "/",\n    "%=": "%",\n    "^=": "^",\n    "//=": "//",\n    "..=": ".."\n  };`, `  const ops = {\n    "+=": "+",\n    "-=": "-",\n    "*=": "*",\n    "//=": "//",\n    "/=": "/",\n    "%=": "%",\n    "^=": "^",\n    "..=": ".."\n  };`);
s=s.replace(`      else if(op=="/=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\\"']*?)\\s*\\/=\\s*([^\\n;]+)/g;\n      else if(op=="%=")`, `      else if(op=="//=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\\"\\\']*?)\\s*\\/\\/=\\s*([^\\n;]+)/g;\n      else if(op=="/=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\\"']*?)\\s*\\/=\\s*([^\\n;]+)/g;\n      else if(op=="%=")`);
fs.writeFileSync(p,s,'utf8');
console.log('fixed ops order');
