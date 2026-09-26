import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
old = "    var _prof = ({FAST: {cipherRounds:1, decoyVaultRuns:[2,4], decoyChunks:[2,6], useRegShuffle:false}, BALANCED:{cipherRounds:1, decoyVaultRuns:[4,8], decoyChunks:[8,15], useRegShuffle:true}, SECURE:{cipherRounds:2, decoyVaultRuns:[8,12], decoyChunks:[15,20], useRegShuffle:true}})[build.profile||'BALANCED'] || {cipherRounds:1, decoyVaultRuns:[4,8], decoyChunks:[8,15], useRegShuffle:true});"
new = "    var _prof = ({FAST: {cipherRounds:1, decoyVaultRuns:[2,4], decoyChunks:[2,6], useRegShuffle:false}, BALANCED:{cipherRounds:1, decoyVaultRuns:[4,8], decoyChunks:[8,15], useRegShuffle:true}, SECURE:{cipherRounds:2, decoyVaultRuns:[8,12], decoyChunks:[15,20], useRegShuffle:true}})[build.profile||'BALANCED'] || {cipherRounds:1, decoyVaultRuns:[4,8], decoyChunks:[8,15], useRegShuffle:true};"
if old in t:
    t = t.replace(old, new)
    p.write_text(t, encoding='utf-8')
    print("fixed prof")
else:
    print("not found prof")
    idx = t.find("var _prof")
    print(t[idx-100:idx+600])
