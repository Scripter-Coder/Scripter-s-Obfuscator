import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
# Fix the stripParamTypes second replace: should be /(\)) not /(\\))
# The file has /(\\)) which is wrong (extra \\)
# Replace /(\\)) with /(\))
# In Python string, to represent /(\\)) (which is / ( \ \ ) ) ), we need r'/(\\\\))'?
# Let's just directly check the bytes
# Print the line
import re
m = re.search(r'stripParamTypes.*?replace.*?\n.*?replace.*?\n', s, re.DOTALL)
print(repr(m.group(0)[:500]) if m else 'no match')
# Try to fix by replacing the erroneous pattern
# The erroneous is "(\\\\))" which is "(\\))" in the file's text (with two backslashes)
# The correct is "(\\))" with one backslash? Actually correct is "(\\))" with one backslash before )?
# Let's just replace any occurrence of "(\\\\))" with "(\\))"
# In the file, the erroneous is "/(\\\\))" (with two backslashes)
# We want "/(\\))" (with one backslash)
# In Python, to represent the file's erroneous string, we need to know its repr
# Let's just print the file's stripParamTypes section
idx = s.find('stripParamTypes')
print(repr(s[idx:idx+800]))
