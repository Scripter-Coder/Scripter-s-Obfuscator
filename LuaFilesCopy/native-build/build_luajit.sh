#!/bin/sh
export PATH="/c/MinGW/bin:/usr/bin:$PATH"
cd "/c/Users/Ryzen 9 5900x/Downloads/Lua Files/native-build/LuaJIT-2.1" || exit 1
mingw32-make
ls -l src/luajit.exe src/lua51.dll 2>/dev/null
./src/luajit.exe -v
