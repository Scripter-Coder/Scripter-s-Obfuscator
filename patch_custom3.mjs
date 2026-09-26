import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\custom-obfuscator.js';
let s = fs.readFileSync(p, 'utf8');
const oldPayload = "    var payload = buildSecurityWrapper(options, meta) + vmCode;";
const newPayload = "    var payload;\n    if (selectedTarget === 'luau') {\n        payload = vmCode;\n    } else {\n        payload = buildSecurityWrapper(options, meta) + vmCode;\n    }";
if(s.includes(oldPayload)){
  s = s.replace(oldPayload, newPayload);
  console.log('patched payload');
} else {
  console.log('oldPayload not found');
  console.log(s.slice(s.indexOf('var payload'), s.indexOf('var payload')+200));
}
fs.writeFileSync(p, s, 'utf8');
console.log('done');
