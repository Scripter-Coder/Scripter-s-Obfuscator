import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\custom-obfuscator.js';
let s = fs.readFileSync(p, 'utf8');
// Patch all occurrences of "(getgenv and getgenv()) or _G" to include getfenv for Luau
// For Luau, we want: (getgenv and getgenv()) or (getfenv and getfenv(0) or _G) or _G
// But to keep it simple and not break other targets, we can change the string to use getfenv as fallback
// The watermark and canary are generated as JS strings that become Lua code
// We need to make the Lua code Luau-safe
// Replace "(getgenv and getgenv()) or _G" with "(getgenv and getgenv()) or (getfenv and getfenv(0) or _G) or _G"
// But that is redundant; simpler: "(getgenv and getgenv()) or (getfenv and getfenv(0)) or _G"
const old1 = "(getgenv and getgenv()) or _G";
const new1 = "(getgenv and getgenv()) or (getfenv and getfenv(0)) or _G";
let count=0;
while(s.includes(old1)){
  s = s.replace(old1, new1);
  count++;
}
console.log('replaced', count, 'occurrences of getgenv or _G');
// Also need to handle the case where it's "local g=(getgenv and getgenv()) or _G" - same pattern, already handled
// The VM's E is already patched, but the outer loader also needs fixing
// Also need to ensure the canary check doesn't fail due to frozen _G
// The canary check is "return g." + canaryName + "==" + magic
// That just reads, not writes, so it's fine
// The write is "g."+canaryName+"="+magic and "g."+canaryName+"=nil"
// Those writes will now go to getfenv(0) which is writable for Luau
fs.writeFileSync(p, s, 'utf8');
console.log('patched custom-obfuscator', s.length);
