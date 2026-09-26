import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
old1 = 'print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s"'
new1 = 'print(string.format("CALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s"'
if old1 in t:
    t = t.replace(old1, new1)
    print("fixed CALL format")
else:
    print("CALL format not found")
old2 = 'print(string.format("TAILCALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s"'
new2 = 'print(string.format("TAILCALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s"'
if old2 in t:
    t = t.replace(old2, new2)
    print("fixed TAILCALL")
old3 = 'print(string.format("RETURN %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s"'
new3 = 'print(string.format("RETURN %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s"'
if old3 in t:
    t = t.replace(old3, new3)
    print("fixed RETURN")
# Also fix the RETP one which has same pattern but with RETP
old4 = 'print(string.format("RETURN RETP %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s"'
new4 = 'print(string.format("RETURN RETP %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s"'
if old4 in t:
    t = t.replace(old4, new4)
    print("fixed RETP")

p.write_text(t, encoding='utf-8')
print("saved")
