import { applyCustomObfuscator } from "./custom-obfuscator.js";
import luaparse from "luaparse";
import { vmSetLuaparse } from "./vm-pass.js";
import { vmBCSetLuaparse } from "./vm-bytecode.js";
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
const out = applyCustomObfuscator(`print("testing maybe")`, {intensity:22, luraphMode:true, ultra:true, antiTamper:true, antiSkid:true, antiLogger:true, scriptName:"test", scriptId:"test123", owner:"Scripter"});
console.log(out);
