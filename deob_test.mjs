import fs from 'fs';
const txt=fs.readFileSync('C:/Users/Ryzen 9 5900x/Desktop/Special Website/ScripterHub Website/Obfuscator-s Website/test_luraph_fetch.lua','utf8');
// Actually we have the content from fetch, we can directly deob
const encHex = "42 65 d8 d3 72 dd db 88 db 4e 3d 31 91".split(' ').map(x=>parseInt(x,16));
const keyHex="3217b1bd06f5f9fcbe3d4913b844f929";
const key=[];
for(let i=0;i<keyHex.length;i+=2) key.push(parseInt(keyHex.substr(i,2),16));
// From file: _enc = buffer.fromstring(table.concat({"\x42\x65\xd8\xd3\x72\xdd\xdb\x88\xdb\x4e\x3d\x31\x91"}))
// That's 13 bytes: 0x42,0x65,0xd8,0xd3,0x72,0xdd,0xdb,0x88,0xdb,0x4e,0x3d,0x31,0x91
const enc=[0x42,0x65,0xd8,0xd3,0x72,0xdd,0xdb,0x88,0xdb,0x4e,0x3d,0x31,0x91];
console.log('enc',enc);
console.log('key',key);
const dec=enc.map((b,i)=> b ^ key[i % key.length]);
console.log('dec',dec);
console.log('src', Buffer.from(dec).toString('utf8'));
