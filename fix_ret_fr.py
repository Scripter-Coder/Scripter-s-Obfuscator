import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
# Fix RET handler in HAND
old = "                L.push('     local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller');"
new = "                L.push('     local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller.fr or caller');"
if old in t:
    t = t.replace(old, new)
    print("fixed RET HAND")
else:
    print("RET HAND not found")
    # try with different spacing
    import re
    for m in re.finditer(r"FR=caller", t):
        print(t[m.start()-200:m.start()+200])

# Fix RETP HAND
old2 = "                L.push('   if ' + FP + '>0 then local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller; if caller.nRet==1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[1] elseif caller.nRet==-1 then local r=' + PK + '(' + UNP + '(a)); ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=r else for j=1,#a do ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[j] end end else return ' + UNP + '(a) end');"
new2 = "                L.push('   if ' + FP + '>0 then local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller.fr or caller; if caller.nRet==1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[1] elseif caller.nRet==-1 then local r=' + PK + '(' + UNP + '(a)); ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=r else for j=1,#a do ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[j] end end else return ' + UNP + '(a) end');"
if old2 in t:
    t = t.replace(old2, new2)
    print("fixed RETP HAND")
else:
    print("RETP HAND not found")

# Fix dispatcher RET
old3 = "    L.push('     local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller');"
# This appears in dispatcher for RET
if old3 in t:
    # Replace with FR=caller.fr
    new3 = "    L.push('     local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller.fr or caller');"
    t = t.replace(old3, new3)
    print("fixed dispatcher RET")
else:
    print("dispatcher RET not found")

# Also need to fix the second occurrence in dispatcher for RETP with FP>0
# The dispatcher RETP has similar but with different variable names: caller_T etc. for TAILCALL native, but for RETP dispatcher it's similar to RET
# Let's do a broader replace for any occurrence of FR=caller where caller is FRAMES[FP]
# Use regex to replace all
import re
pattern = r"FR \+ '=caller'"
# Actually the JS string is " + FR + '=caller'" which becomes Lua "FR=caller"
# In the JS file, the line is L.push('     local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ... ' + FR + '=caller');
# We want to replace the last part " + FR + '=caller'" with " + FR + '=caller.fr or caller'"
# Do a simple string replace for that pattern
old_fr = "' + FR + '=caller'"
new_fr = "' + FR + '=caller.fr or caller'"
# But this will also affect the CALL's FR creation which has FR={chunk=..., caller=FRAMES[FP]} which is correct, not FR=caller
# We should only replace the RET's FR=caller, not the CALL's FR creation
# The RET's lines have "local caller=" and then "FR=caller"
# We'll do targeted replace for the dispatcher and HAND RET
t = t.replace(" + FR + '=caller\');", " + FR + '=caller.fr or caller\');")
print("replaced all FR=caller with FR=caller.fr")

p.write_text(t, encoding='utf-8')
print("saved")
