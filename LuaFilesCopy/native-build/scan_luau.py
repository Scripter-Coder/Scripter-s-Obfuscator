import re, pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Downloads\Lua Files\native-build\luau-windows\luau.exe")
d = p.read_bytes()
print("has 0.709", b"0.709" in d)
print("has 0.640", b"0.640" in d)
print("has 0.650", b"0.650" in d)
print("has 0.619", b"0.619" in d)
print([m.group(0).decode("ascii", "replace") for m in re.finditer(rb"0\.\d{3}", d)][:50])
