import pathlib, re
p = pathlib.Path('vm-bytecode.js')
t = p.read_text(encoding='utf-8')
old = """    L.push(' while true do');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');

    // shuffled handler order per build
    var order = OP_NAMES.slice();
    for (var i = order.length - 1; i > 0; i--) {
        var j = rnd(i + 1); var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    for (var h = 0; h < order.length; h++) {
        var name = order[h];
        var oc = OPCODES[name];
        L.push('  if ' + OP + '==' + oc + ' then');
        switch (name) {"""
new = """    var HAND = nm('h');
    L.push(' local ' + HAND + '={}');
    // shuffled handler order per build - ANTI-PYTHON: table dispatch, no \"if OP==\" chain
    var order = OP_NAMES.slice();
    for (var i = order.length - 1; i > 0; i--) {
        var j = rnd(i + 1); var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    for (var h = 0; h < order.length; h++) {
        var name = order[h];
        var oc = OPCODES[name];
        L.push(' ' + HAND + '[' + oc + ']=function()');
        switch (name) {"""
if old not in t:
    print('old not found')
    # debug: find snippet
    import difflib
    print(t[ t.find("L.push(' while true do'"): t.find("L.push(' while true do'")+500])
else:
    t2 = t.replace(old, new)
    # also need to replace the closing part: after switch, the old has L.push('  end'); } and dead handlers with if, and final L.push(' end'); L.push('end');
    # Find the dead handler block and final
    old2 = """        L.push('  end');
    }
    // ---- DEAD HANDLER BLOCKS: never-firing opcode guards with
    // realistic bodies. They add noise to the handler chain so an
    // analyst cannot map "if o==X" -> real opcode count.
    var nDead = rndInt(3, 8);
    for (var dh = 0; dh < nDead; dh++) {
        var deadVal = rndInt(60001, 65000); // outside the real opcode range
        // body: plausible stack ops touching the same names
        var bodyKind = rnd(4);
        L.push('  if ' + OP + '==' + deadVal + ' then');
        if (bodyKind === 0) {
            L.push('   local t=' + S + '[' + SP + '] ' + S + '[' + SP + ']=t');
        } else if (bodyKind === 1) {
            L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + D + '(' + CODE + '.c[' + PC + ']) ' + PC + '=' + PC + '+1');
        } else if (bodyKind === 2) {
            L.push('   local k=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 local t=' + S + '[' + SP + '] ' + S + '[' + SP + ']=t[k]');
        } else {
            L.push('   ' + PC + '=' + CODE + '.c[' + PC + ']');
        }
        L.push('  end');
    }
    L.push(' end');
    L.push('end');"""
    new2 = """        L.push(' end');
    }
    // ---- DEAD HANDLER BLOCKS: table dispatch decoys
    var nDead = rndInt(3, 8);
    for (var dh = 0; dh < nDead; dh++) {
        var deadVal = rndInt(60001, 65000);
        var bodyKind = rnd(4);
        L.push(' ' + HAND + '[' + deadVal + ']=function()');
        if (bodyKind === 0) {
            L.push('  local t=' + S + '[' + SP + '] ' + S + '[' + SP + ']=t');
        } else if (bodyKind === 1) {
            L.push('  ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + D + '(' + CODE + '.c[' + PC + ']) ' + PC + '=' + PC + '+1');
        } else if (bodyKind === 2) {
            L.push('  local k=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 local t=' + S + '[' + SP + '] ' + S + '[' + SP + ']=t[k]');
        } else {
            L.push('  ' + PC + '=' + CODE + '.c[' + PC + ']');
        }
        L.push(' end');
    }
    L.push(' while true do');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('  local _fn=' + HAND + '[' + OP + ']');
    L.push('  if _fn then _fn() else error("bad opcode "..tostring(' + OP + '),0) end');
    L.push(' end');
    L.push('end');"""
    if old2 not in t2:
        print('old2 not found')
    else:
        t2 = t2.replace(old2, new2)
        p.write_text(t2, encoding='utf-8')
        print('patched')
