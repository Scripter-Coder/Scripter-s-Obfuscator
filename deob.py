import argparse
import os
import re
import sys
from bisect import bisect_left

P_POW, P_UN, P_MUL, P_ADD, P_CAT, P_CMP, P_AND, P_OR = 1, 2, 3, 4, 5, 6, 7, 8

KEYWORDS = {
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
    'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then',
    'true', 'until', 'while',
}
IDENT_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')

class E:
    __slots__ = ('text', 'prec', 'pack', 'impure')

    def __init__(self, text, prec=0, pack=False, impure=False):
        self.text = text
        self.prec = prec
        self.pack = pack
        self.impure = impure


def bin_(a, op, b, prec, assoc='left'):
    if assoc == 'left':
        l = '(%s)' % a.text if a.prec > prec else a.text
        r = '(%s)' % b.text if b.prec >= prec else b.text
    else:
        l = '(%s)' % a.text if a.prec >= prec else a.text
        r = '(%s)' % b.text if b.prec > prec else b.text
    return E('%s %s %s' % (l, op, r), prec)


def un_(op, a, prec=P_UN, space=True):
    t = '(%s)' % a.text if a.prec > prec else a.text
    return E('%s %s' % (op, t) if space else '%s%s' % (op, t), prec)


def quote(s):
    out = s.replace('\\', '\\\\').replace('"', '\\"')
    out = out.replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
    return '"%s"' % ''.join(c if (32 <= ord(c) < 127 or ord(c) > 127) else '\\%03d' % ord(c) for c in out)


def ident_key(text):
    if text.startswith('"') and text.endswith('"') and len(text) > 2:
        inner = text[1:-1]
        if IDENT_RE.match(inner) and inner not in KEYWORDS:
            return '.' + inner
    return '[%s]' % text


def path(base, key):
    k = ident_key(key)
    if k.startswith('.'):
        return '(%s)%s' % (base, k) if base_has_op(base) else '%s%s' % (base, k)
    return '(%s)%s' % (base, k) if base_has_op(base) else '%s%s' % (base, k)

PREFIX_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$')


def base_has_op(s):
    s = s.strip()
    if PREFIX_RE.match(s) or s.endswith(')') or s.endswith(']'):
        return False
    return True


def strip_parens(s):
    s = s.strip()
    while s.startswith('(') and s.endswith(')'):
        depth = 0
        for i, c in enumerate(s):
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0 and i != len(s) - 1:
                    return s
        s = s[1:-1].strip()
    return s

class VM:

    def __init__(self, path):
        self.text = open(path, encoding='utf-8', errors='ignore').read()
        self.info = []
        self.parse_vm()
        self.parse_strings()
        self.parse_bytecode()
        self.parse_handlers()
        self.decode_all()

    def parse_vm(self):
        t = self.text
        cand = None
        for m in re.finditer(r'(\w+)\s*=\s*function\((\w+),\s*(\w+),\s*\.\.\.\)', t):
            start = m.end()
            end = t.find('\nend\n', start)
            if end == -1:
                continue
            body = t[start:end]
            if 'whiletruedo' in re.sub(r'\s+', '', body):
                cand = (m.group(1), m.group(2), m.group(3), body)
                break
        if not cand:
            raise SystemExit('[!] VM dispatcher not found')
        self.vmfn, self.arg_chunk, self.arg_links, self.vmbody = cand
        b = self.vmbody
        nb = re.sub(r'\s+', '', b)
        nbf = re.sub(r'\s+', '', self.text)

        def g(pat, src=None, group=1):
            m = re.search(pat, src if src is not None else nb)
            return m.group(group) if m else None

        m = re.search(r'local(\w+)=\{\}local(\w+)=0', nb)
        self.v_stack, self.v_top = m.group(1), m.group(2)
        self.v_scopes = g(r'local(\w+)=\{\{\}\}') or 'SCOPES'
        self.v_pc = g(r'local(\w+)=1') or 'PC'
        m = re.search(r'local(\w+)=(\w+)\[%s\]' % self.arg_chunk, nb)
        self.v_chunk, self.t_chunks = m.group(1), m.group(2)
        self.v_op = g(r'local(\w+)=%s\.c\[%s\]' % (self.v_chunk, self.v_pc)) or 'op'
        self.v_global = g(r'local(\w+)=\(getgenvandgetgenv\(\)\)or_G', nbf) \
            or g(r'local(\w+)=getfenv', nbf) or '_G'
        self.v_unpack = g(r'local(\w+)=table\.unpackorunpack', nbf) or 'unpack'
        m = re.search(r'local(\w+)=function\(\.\.\.\)localt=\{n=select\("#",\.\.\.\)\}', nbf)
        self.v_pack = m.group(1) if m else 'PACK'
        self.v_packtag = g(r't\["(\w+)"\]=true', nbf) or 'pack'
        m = re.search(r'local(\w+)=\{\}do\s*localrp=1whilerp<=#(\w+)do', b)
        self.v_bytes = m.group(2) if m else None

    def parse_strings(self):
        t = self.text
        dec = None
        for m in re.finditer(r'local\s+(\w+)=function\(i\)(.*?)\nend', t, re.S):
            if 'table.concat' in m.group(2):
                dec = m
                break
        if not dec:
            raise SystemExit('[!] string decoder not found')
        self.f_getstr = dec.group(1)
        body = dec.group(2)
        nb = re.sub(r'\s+', '', body)
        self.v_blob = re.search(r'locala=(\w+)\[p\]', nb).group(1)
        self.v_ranges = re.search(r'localrr=(\w+)\[i\]', nb).group(1)
        fb = re.search(r'localb=\((\d+)\*p\+(\d+)\+(\w+)\["(\w+)"\]\*\(\(p\*p\)%(\d+)\)\)%(\d+)\+(\d+)', nb)
        if fb:
            self.k_a, self.k_b, self.k_glob, self.k_name, self.k_pmod, self.k_mod, self.k_base = \
                (int(fb.group(1)), int(fb.group(2)), fb.group(3), fb.group(4),
                 int(fb.group(5)), int(fb.group(6)), int(fb.group(7)))
        else:
            self.k_a, self.k_b, self.k_glob, self.k_name = 217, 210, 'G', 'k'
            self.k_pmod, self.k_mod, self.k_base = 23, 251, 160

        self.blob = [int(x) for x in re.search(
            r'local\s+%s=\{([\d,\s]+)\}' % self.v_blob, t).group(1).split(',') if x.strip()]
        inner = re.search(r'local\s+%s=(\{\{.*?\}\})' % self.v_ranges, t, re.S).group(1)
        self.ranges = [tuple(int(x) for x in p) for p in re.findall(r'\{(\d+),(\d+)\}', inner)]
        self.key = self.find_key()
        self.info.append('string key %s = %d (brute-forced over %d strings)'
                         % (self.k_name, self.key, len(self.ranges)))

    def str_at(self, p, key=None):
        k = self.key if key is None else key
        a = self.blob[p - 1]
        b = (self.k_a * p + self.k_b + k * ((p * p) % self.k_pmod)) % self.k_mod + self.k_base
        return a ^ (b & 0xFF)

    def find_key(self):
        best, score = 0, -1
        sample = self.ranges[: min(60, len(self.ranges))]
        for k in range(0, 512):
            ok = tot = 0
            for st, ln in sample:
                for j in range(1, min(ln, 12) + 1):
                    c = self.str_at(st + j, k)
                    tot += 1
                    if 32 <= c < 127 or c in (9, 10, 13):
                        ok += 1
            s = ok / max(tot, 1)
            if s > score:
                best, score = k, s
            if score > 0.995:
                break
        return best

    def decode_strings(self):
        out = {}
        for i, (st, ln) in enumerate(self.ranges, start=1):
            out[i] = ''.join(chr(self.str_at(st + j)) for j in range(1, ln + 1))
        return out

    def parse_bytecode(self):
        t = self.text
        m = re.search(r'locala=(\w+)\[i\]localb=\(\(i\*i\*(\d+)\+i\*(\d+)\+(\d+)\)%(\d+)\)%(\d+)\+(\d+)',
                      re.sub(r'\s+', '', t))
        if m:
            self.v_bytes = m.group(1)
            self.b_a, self.b_b, self.b_c = int(m.group(2)), int(m.group(3)), int(m.group(4))
            self.b_sh = int(m.group(5))
            self.b_mod, self.b_base = int(m.group(6)), int(m.group(7))
        else:
            self.b_a, self.b_b, self.b_c, self.b_sh = 85, 49, 76, 4294967296
            self.b_mod, self.b_base = 251, 4
        m = re.search(r'local\s+%s=\{([\d,\s]+)\}' % self.v_bytes, t)
        src = [int(x) for x in m.group(1).split(',') if x.strip()]
        out = []
        for i in range(1, len(src) + 1):
            b = ((self.b_a * i * i + self.b_b * i + self.b_c) % self.b_sh) % self.b_mod + self.b_base
            out.append(src[i - 1] ^ (b & 0xFF))
        self.stream = out

        m = re.search(r'local(\w+)\[#\w+\+1\]=\{c=(\w+),p=(\w+),v=(\w+)\}', re.sub(r'\s+', '', t))
        self.t_chunks = m.group(1) if m else self.t_chunks
        chunks, rp, n = [], 0, len(self.stream)
        while rp + 2 <= n:
            np = self.stream[rp] + self.stream[rp + 1] * 256
            rp += 2
            if rp + np * 2 > n:
                break
            ps = [self.stream[rp + i * 2] + self.stream[rp + i * 2 + 1] * 256 for i in range(np)]
            rp += np * 2
            if rp >= n:
                break
            va = self.stream[rp] == 1
            rp += 1
            if rp + 4 > n:
                break
            nc = (self.stream[rp] + self.stream[rp + 1] * 256
                  + self.stream[rp + 2] * 65536 + self.stream[rp + 3] * 16777216)
            rp += 4
            if rp + nc * 4 > n:
                break
            cd = []
            for _ in range(nc):
                cd.append(self.stream[rp] + self.stream[rp + 1] * 256
                          + self.stream[rp + 2] * 65536 + self.stream[rp + 3] * 16777216)
                rp += 4
            chunks.append({'c': cd, 'p': ps, 'v': va})
        self.chunks = chunks
        m = re.search(r'pcall\(\s*%s\s*,\s*(\d+)' % self.vmfn, t)
        self.entry = int(m.group(1)) if m else 1

    def parse_handlers(self):
        nb_all = re.sub(r'\s+', '', self.vmbody)
        S, T, P, C = self.v_stack, self.v_top, self.v_pc, self.v_chunk
        SC, L, G = self.v_scopes, self.arg_links, self.v_global
        GS = self.f_getstr
        pats = [
            ('ADD', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+\+\w+$' % (S, T, S, T, T, T, S, T)),
            ('SUB', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+-\w+$' % (S, T, S, T, T, T, S, T)),
            ('MUL', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+\*\w+$' % (S, T, S, T, T, T, S, T)),
            ('DIV', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+/\w+$' % (S, T, S, T, T, T, S, T)),
            ('MOD', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+%%\w+$' % (S, T, S, T, T, T, S, T)),
            ('POW', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+\^\w+$' % (S, T, S, T, T, T, S, T)),
            ('CONCAT', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+\.\.\w+$' % (S, T, S, T, T, T, S, T)),
            ('EQ', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+==\w+$' % (S, T, S, T, T, T, S, T)),
            ('NEQ', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+~=\w+$' % (S, T, S, T, T, T, S, T)),
            ('LT', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+<\w+$' % (S, T, S, T, T, T, S, T)),
            ('GT', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+>\w+$' % (S, T, S, T, T, T, S, T)),
            ('LE', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+<=\w+$' % (S, T, S, T, T, T, S, T)),
            ('GE', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]%s=%s-1%s\[%s\]=\w+>=\w+$' % (S, T, S, T, T, T, S, T)),
            ('LEN', r'^%s\[%s\]=#%s\[%s\]$' % (S, T, S, T)),
            ('NEG', r'^%s\[%s\]=-%s\[%s\]$' % (S, T, S, T)),
            ('NOT', r'^%s\[%s\]=not%s\[%s\]$' % (S, T, S, T)),
            ('NEWTABLE', r'^%s=%s\+1%s\[%s\]=\{\}$' % (T, T, S, T)),
            ('PICK1', r'^%s\[%s\]=%s\[%s\]\[1\]$' % (S, T, S, T)),
            ('PICK2', r'^%s\[%s\]=%s\[%s\]\[2\]$' % (S, T, S, T)),
            ('PICK3', r'^%s\[%s\]=%s\[%s\]\[3\]$' % (S, T, S, T)),
            ('POP', r'^%s\[%s\]=nil%s=%s-1$' % (S, T, T, T)),
            ('PUSHTRUE', r'^%s=%s\+1%s\[%s\]=true$' % (T, T, S, T)),
            ('PUSHFALSE', r'^%s=%s\+1%s\[%s\]=false$' % (T, T, S, T)),
            ('PUSHNIL', r'^%s=%s\+1%s\[%s\]=nil$' % (T, T, S, T)),
            ('DUP', r'^%s=%s\+1%s\[%s\]=%s\[%s-1\]$' % (T, T, S, T, S, T)),
            ('SWAP', r'^%s\[%s\],%s\[%s-1\]=%s\[%s-1\],%s\[%s\]$' % (S, T, S, T, S, T, S, T)),
            ('BLOCKEND', r'^%s\[#%s\]=nil$' % (SC, SC)),
            ('BLOCKSTART', r'^%s\[#%s\+1\]=\{\}$' % (SC, SC)),
            ('JMP', r'^%s=%s\.c\[%s\]$' % (P, C, P)),
            ('SETTABLE', r'^local\w+=%s\[%s\]local\w+=%s\[%s-1\]local\w+=%s\[%s-2\]\w+\[\w+\]=\w+%s=%s-3$'
             % (S, T, S, T, S, T, T, T)),
            ('GETTABLE', r'^local\w+=%s\[%s\]%s=%s-1local\w+=%s\[%s\]%s\[%s\]=\w+\[\w+\]$'
             % (S, T, T, T, S, T, S, T)),
            ('PUSHSTR', r'^%s=%s\+1%s\[%s\]=%s\(%s\.c\[%s\]\)%s=%s\+1$' % (T, T, S, T, GS, C, P, P, P)),
            ('PUSHNUM', r'tonumber\(%s\(' % GS),
            ('GETGLOBAL', r'^%s=%s\+1%s\[%s\]=%s\[%s\(%s\.c\[%s\]\)\]%s=%s\+1$'
             % (T, T, S, T, G, GS, C, P, P, P)),
            ('SETGLOBAL', r'^%s\[%s\(%s\.c\[%s\]\)\]=%s\[%s\]%s=%s-1%s=%s\+1$'
             % (G, GS, C, P, S, T, T, T, P, P)),
            ('DECLARE', r'#%s\]\[\w+\]=\{\w+\}$' % SC),
            ('SETLOCAL', r'for\w+=#%s,1,-1' % SC),
            ('SETUPVAL', r'for\w+=#%s,1,-1' % L),
            ('GETLOCAL', r'for\w+=#%s,1,-1' % SC),
            ('GETUPVAL', r'for\w+=#%s,1,-1' % L),
            ('CLOSURE', r'function\(\.\.\.\)return%s\(' % self.vmfn),
            ('CALL1', r'%s\[%s\]=r\[1\]$' % (S, T)),
            ('CALLM', r'%s\[%s\]=r$' % (S, T)),
            ('UNPACK', r'do%s=%s\+1%s\[%s\]=\w+\[\w+\]' % (T, T, S, T)),
            ('PUSHVARARG', r'a838008'),
            ('RETURN', r'==0thenreturnend'),
            ('RETURNPACK', r'return%s\(' % self.v_unpack),
            ('APPEND', r'\[#\w+\+1\]=\w+\[\w+\]'),
            ('JNIL', r'==nil\)'),
            ('ANDJMP', r'^ifnot%s\[%s\]then%s=%s\.c\[%s\]else' % (S, T, P, C, P)),
            ('ORJMP', r'^if%s\[%s\]then%s=%s\.c\[%s\]else' % (S, T, P, C, P)),
            ('JT', r'if(?!not)\w+then%s=%s\.c\[%s\]' % (P, C, P)),
            ('JF', r'ifnot\w+then%s=%s\.c\[%s\]' % (P, C, P)),
            ('GETIDX', r'%s=%s\+1%s\[%s\]=%s\[%s\]\[\w+\]' % (P, P, S, T, S, T)),
            ('NOP', r'^local\w+=%s\[%s\]%s\[%s\]=\w+$' % (S, T, S, T)),
        ]
        pats = [(n, p[:-1] + r'(?:end)?$' if p.endswith('$') else p) for n, p in pats]
        handlers = []
        for m in re.finditer(r'if\s*%s\s*==\s*(\d+)\s*then' % self.v_op, self.vmbody):
            handlers.append((int(m.group(1)), m.end(), m.start()))
        self.sem, self.opsize = {}, {}
        for idx, (op, pos, start) in enumerate(handlers):
            end = handlers[idx + 1][2] if idx + 1 < len(handlers) else len(self.vmbody)
            body = self.vmbody[pos:end]
            nb = re.sub(r'\s+', '', body)
            if nb.endswith('end'):
                nb = nb[:-3]
            sem = 'NOP'
            for name, pat in pats:
                if re.search(pat, nb):
                    if name in ('SETLOCAL', 'GETLOCAL'):
                        sem = 'SETLOCAL' if re.search(r'\[1\]=\w+(?:end)?$', nb) else \
                              ('GETLOCAL' if re.search(r'and\w+\[1\](?:end)?$', nb) else 'NOP')
                    elif name in ('SETUPVAL', 'GETUPVAL'):
                        sem = 'SETUPVAL' if re.search(r'\[1\]=\w+(?:end)?$', nb) else \
                              ('GETUPVAL' if re.search(r'and\w+\[1\](?:end)?$', nb) else 'NOP')
                    else:
                        sem = name
                    break
            self.sem[op] = sem
            self.opsize[op] = 2 if ('%s.c[%s]' % (C, P)) in nb else 1
        self.unknown = sorted(o for o, s in self.sem.items() if s == 'NOP' and self.opsize[o] == 1)

    def decode_all(self):
        self.strings = self.decode_strings()
        self.info.append('%d strings, %d chunks, entry chunk #%d'
                         % (len(self.strings), len(self.chunks), self.entry))

    def disasm(self):
        out = []
        for ci, ch in enumerate(self.chunks, start=1):
            code = ch['c']
            insts, i = [], 0
            while i < len(code):
                op = code[i]
                sz = self.opsize.get(op, 1)
                arg = code[i + 1] if sz == 2 and i + 1 < len(code) else None
                insts.append((i, op, arg))
                i += sz
            out.append('; === CHUNK %d  params=%s vararg=%s  (%d instr) ==='
                       % (ci, ch['p'], ch['v'], len(insts)))
            for pc, op, arg in insts:
                sem = self.sem.get(op, '?')
                extra = ''
                if sem in ('PUSHSTR', 'GETGLOBAL', 'SETGLOBAL', 'PUSHNUM') and arg is not None:
                    extra = ' ; "%s"' % self.strings.get(arg, '?')
                out.append('%6d  %-10s %-6s %s%s' % (pc, op, sem, '' if arg is None else arg, extra))
        return '\n'.join(out)

class ChunkDec:

    def __init__(self, vm, cid, upvals, indent, master):
        self.vm = vm
        self.master = master
        self.cid = cid
        ch = vm.chunks[cid - 1]
        self.code = ch['c']
        self.params = ch['p']
        self.vararg = ch['v']
        self.upvals = dict(upvals or {})
        self.indent = indent
        self.lines = []
        self.scopes = [{}]
        self.tmpc = 0
        self.used = set()
        self.loops = []
        self.tbuf = []
        self.cur_pc = 0
        self.skip_pcs = set()
        self.const_of = {}
        self.forin_end = None
        self.build_index()

    def build_index(self):
        code, vm = self.code, self.vm
        self.inst, self.pcs = {}, []
        i = 0
        while i < len(code):
            op = code[i]
            sz = vm.opsize.get(op, 1)
            if sz == 2 and i + 1 < len(code):
                self.inst[i] = (op, code[i + 1], 2)
            else:
                self.inst[i] = (op, None, 1)
            self.pcs.append(i)
            i += self.inst[i][2]
        self.jumps = {}
        self.targets = {}
        for pc in self.pcs:
            op, arg, sz = self.inst[pc]
            if arg is None:
                continue
            if self.vm.sem.get(op, 'NOP') in ('JMP', 'JT', 'JF', 'JNIL', 'ANDJMP', 'ORJMP'):
                if arg is not None:
                    tgt = arg - 1
                    if tgt not in self.inst:
                        tgt = len(self.code)
                    self.jumps[pc] = tgt
                    self.targets.setdefault(tgt, []).append(pc)
        self.loop_headers = {t: max(s for s in srcs if s > t)
                             for t, srcs in self.targets.items()
                             if any(s > t for s in srcs)}

    def at(self, pc):
        return self.inst.get(pc)

    def sem(self, pc):
        if pc not in self.inst:
            return '?'
        return self.vm.sem.get(self.inst[pc][0], 'NOP')

    def prev_pc(self, pc):
        i = bisect_left(self.pcs, pc)
        return self.pcs[i - 1] if i > 0 else None

    def is_ret_block(self, pc):
        if pc not in self.inst:
            return False
        if self.sem(pc) == 'RETURN':
            return not self.inst[pc][1]
        return False

    def emit(self, indent, text):
        m = re.match(r'^local (_t\d+) = \{\}$', text)
        if m:
            self.lines.append((indent, text))
            self.tbuf.append([indent, m.group(1), len(self.lines) - 1, []])
            return
        if self.tbuf and self.tbuf[-1][0] == indent:
            name = self.tbuf[-1][1]
            m = re.match(r'^%s(\.[A-Za-z_]\w*|\[[^\]]+\]) = (.+)$' % re.escape(name), text)
            if m:
                key = m.group(1)
                self.tbuf[-1][3].append('%s = %s' % (key[1:] if key[0] == '.' else key, m.group(2)))
                return
        self.flush_tbuf()
        self.lines.append((indent, text))

    def drop_line(self, prefix):
        for i in range(len(self.lines) - 1, -1, -1):
            if self.lines[i] is not None and self.lines[i][1].startswith(prefix):
                self.lines[i] = None
                return

    def flush_tbuf(self):
        while self.tbuf:
            indent, name, idx, entries = self.tbuf.pop()
            if not entries:
                continue
            flat = 'local %s = { %s }' % (name, ', '.join(entries))
            if len(flat) <= 110:
                self.lines[idx] = (indent, flat)
            else:
                self.lines[idx] = (indent, 'local %s = {' % name)
                for e in entries:
                    self.lines.insert(idx + 1, (indent + 1, e + ','))
                    idx += 1
                self.lines.insert(idx + 1, (indent, '}'))

    def tmp(self, tag='v'):
        self.tmpc += 1
        return '_%s%d' % (tag, self.tmpc)

    def name_for(self, tid):
        base = 'v%d' % tid
        nm = base
        k = 2
        while nm in self.used:
            nm = '%s_%d' % (base, k)
            k += 1
        self.used.add(nm)
        return nm

    def declare(self, tid):
        nm = self.name_for(tid)
        self.scopes[-1][tid] = nm
        return nm

    def resolve(self, tid):
        for sc in reversed(self.scopes):
            if tid in sc:
                return sc[tid]
        nm = self.upvals.get(tid)
        if nm:
            return nm
        return 'v%d' % tid

    def materialize(self, indent, e):
        nm = self.tmp('t')
        self.emit(indent, 'local %s = %s' % (nm, e.text))
        self.const_of[nm] = e.text
        return E(nm, 0)

    def pop(self, stack, indent):
        if not stack:
            return E('nil')
        return stack.pop()

    def flush(self, indent, stack):
        while stack:
            e = stack.pop()
            if e.impure:
                self.emit(indent, e.text)

    def run(self):
        for i, pid in enumerate(self.params):
            self.scopes[0][pid] = 'arg%d' % (i + 1)
        stack = []
        self.parse_region(0, len(self.code), 0, stack)
        self.flush(0, stack)
        self.flush_tbuf()
        return [l for l in self.lines if l is not None]

    def parse_region(self, pc0, pc1, indent, stack):
        pc = pc0
        base = len(self.scopes)
        self.skip_decl = None
        while pc < pc1:
            self.cur_pc = pc
            if pc in self.skip_pcs:
                pc += self.inst[pc][2]
                continue
            if pc in self.loop_headers:
                npc = self.do_loop(pc, pc1, indent, stack)
                if npc is None:
                    break
                pc = npc
                continue
            inst = self.at(pc)
            if inst is None:
                break
            op, arg, sz = inst
            sem = self.sem(pc)
            nxt = pc + sz
            if sem == 'UNK' or sem == '?':
                self.emit(indent, '-- unknown op %d' % op)
                pc = nxt
                continue

            if sem == 'JMP':
                tgt = self.jumps.get(pc, len(self.code))
                if tgt < pc:
                    break
                if tgt == pc1 and self.prev_pc(pc1) == pc:
                    return
                if tgt >= len(self.code) or self.is_ret_block(tgt):
                    self.flush(indent, stack)
                    self.emit(indent, 'return')
                    return
                if self.loops and tgt == self.loops[-1]['exit']:
                    self.flush(indent, stack)
                    self.emit(indent, 'break')
                    return
                self.flush(indent, stack)
                self.emit(indent, '-- goto %d' % tgt)
                return
            if sem in ('JT', 'JF', 'JNIL'):
                tgt = self.jumps.get(pc)
                if tgt is None or tgt < pc:
                    break
                cond = self.pop(stack, indent)
                then_end, else_pc, merge = tgt, None, tgt
                prev = self.prev_pc(tgt)
                if prev is not None and prev >= nxt and self.sem(prev) == 'JMP':
                    et = self.jumps.get(prev)
                    if et is not None and et > tgt:
                        then_end, else_pc, merge = prev, tgt, et
                    elif et == tgt:
                        then_end = prev
                if sem == 'JNIL':
                    ctext = '%s ~= nil' % cond.text
                elif sem == 'JT':
                    ctext = un_('not', cond, P_UN).text
                else:
                    ctext = cond.text
                self.emit(indent, 'if %s then' % ctext)
                self.parse_region(nxt, then_end, indent + 1, [])
                if else_pc is not None:
                    self.emit(indent, 'else')
                    self.parse_region(else_pc, merge, indent + 1, [])
                self.emit(indent, 'end')
                pc = merge
                continue
            if sem in ('ANDJMP', 'ORJMP'):
                tgt = self.jumps.get(pc)
                if tgt is None or tgt < pc:
                    break
                self.parse_region(nxt, tgt, indent, stack)
                y = self.pop(stack, indent) if stack else E('nil')
                x = self.pop(stack, indent) if stack else E('nil')
                prec = P_AND if sem == 'ANDJMP' else P_OR
                stack.append(bin_(x, 'and' if sem == 'ANDJMP' else 'or', y, prec))
                pc = tgt
                continue

            if sem == 'PUSHTRUE':
                stack.append(E('true'))
            elif sem == 'PUSHFALSE':
                stack.append(E('false'))
            elif sem == 'PUSHNIL':
                stack.append(E('nil'))
            elif sem == 'PUSHSTR':
                stack.append(E(quote(self.vm.strings.get(arg, ''))))
            elif sem == 'PUSHNUM':
                stack.append(E(self.vm.strings.get(arg, '0')))
            elif sem == 'PUSHVARARG':
                stack.append(E('...', 0, pack=True))
            elif sem == 'NEWTABLE':
                nm = self.tmp('t')
                self.emit(indent, 'local %s = {}' % nm)
                stack.append(E(nm))
            elif sem == 'DUP':
                if stack:
                    e = stack[-1]
                    if e.impure:
                        e = self.materialize(indent, e)
                        stack[-1] = e
                    stack.append(e)
            elif sem == 'SWAP':
                if len(stack) >= 2:
                    stack[-1], stack[-2] = stack[-2], stack[-1]
            elif sem == 'POP':
                if stack:
                    e = stack.pop()
                    if e.impure:
                        self.emit(indent, e.text)
            elif sem == 'BLOCKSTART':
                self.scopes.append({})
            elif sem == 'BLOCKEND':
                if len(self.scopes) > 1:
                    self.scopes.pop()
            elif sem in ('PICK1', 'PICK2', 'PICK3'):
                e = self.pop(stack, indent) if stack else E('nil')
                k = {'PICK1': 1, 'PICK2': 2, 'PICK3': 3}[sem]
                if e.pack and k == 1:
                    stack.append(E(e.text, 0, impure=e.impure))
                elif e.pack:
                    stack.append(E('select(%d, %s)' % (k, e.text), 0, impure=True))
                else:
                    stack.append(E('%s[%d]' % ('(' + e.text + ')' if e.prec > 0 else e.text, k), 0))
            elif sem == 'GETTABLE':
                k = self.pop(stack, indent)
                t = self.pop(stack, indent)
                stack.append(E(path(t.text, k.text), 0, impure=t.impure))
            elif sem == 'SETTABLE':
                v = self.pop(stack, indent)
                k = self.pop(stack, indent)
                t = self.pop(stack, indent)
                self.emit(indent, '%s = %s' % (path(t.text, k.text), v.text))
            elif sem == 'GETGLOBAL':
                nm = self.vm.strings.get(arg, '?')
                stack.append(E(nm if IDENT_RE.match(nm) else '_G[%s]' % quote(nm)))
            elif sem == 'SETGLOBAL':
                v = self.pop(stack, indent)
                nm = self.vm.strings.get(arg, '?')
                self.emit(indent, '%s = %s' % (nm if IDENT_RE.match(nm) else '_G[%s]' % quote(nm), v.text))
            elif sem == 'GETLOCAL':
                stack.append(E(self.resolve(arg)))
            elif sem == 'DECLARE':
                self.do_declare(arg, stack, indent)
            elif sem == 'SETLOCAL':
                v = self.pop(stack, indent)
                self.emit(indent, '%s = %s' % (self.resolve(arg), v.text))
                self.const_of.pop(self.resolve(arg), None)
            elif sem == 'GETUPVAL':
                stack.append(E(self.upvals.get(arg, 'u%d' % arg)))
            elif sem == 'SETUPVAL':
                v = self.pop(stack, indent)
                self.emit(indent, '%s = %s' % (self.upvals.get(arg, 'u%d' % arg), v.text))
            elif sem in ('ADD', 'SUB', 'MUL', 'MOD'):
                b = self.pop(stack, indent)
                a = self.pop(stack, indent)
                o = {'ADD': '+', 'SUB': '-', 'MUL': '*', 'MOD': '%'}[sem]
                stack.append(bin_(a, o, b, P_MUL if sem in ('MUL', 'MOD') else P_ADD))
            elif sem == 'DIV':
                b = self.pop(stack, indent)
                a = self.pop(stack, indent)
                stack.append(bin_(a, '/', b, P_MUL))
            elif sem == 'POW':
                b = self.pop(stack, indent)
                a = self.pop(stack, indent)
                stack.append(bin_(a, '^', b, P_POW, 'right'))
            elif sem == 'CONCAT':
                b = self.pop(stack, indent)
                a = self.pop(stack, indent)
                stack.append(bin_(a, '..', b, P_CAT, 'right'))
            elif sem in ('EQ', 'NEQ', 'LT', 'GT', 'LE', 'GE'):
                b = self.pop(stack, indent)
                a = self.pop(stack, indent)
                o = {'EQ': '==', 'NEQ': '~=', 'LT': '<', 'GT': '>', 'LE': '<=', 'GE': '>='}[sem]
                stack.append(bin_(a, o, b, P_CMP))
            elif sem == 'LEN':
                a = self.pop(stack, indent)
                stack.append(un_('#', a, P_UN, space=False))
            elif sem == 'NEG':
                a = self.pop(stack, indent)
                stack.append(un_('-', a, P_UN, space=False))
            elif sem == 'NOT':
                a = self.pop(stack, indent)
                stack.append(un_('not', a, P_UN))
            elif sem == 'CALL1':
                self.do_call(arg, stack, indent, False)
            elif sem == 'CALLM':
                self.do_call(arg, stack, indent, True)
            elif sem == 'UNPACK':
                self.do_unpack(arg, stack, indent)
            elif sem == 'APPEND':
                p = self.pop(stack, indent)
                t = self.pop(stack, indent)
                self.emit(indent, 'for _, _v in ipairs({%s}) do %s[#%s+1] = _v end' % (p.text, t.text, t.text))
            elif sem == 'CLOSURE':
                self.do_closure(arg, stack, indent, nxt)
            elif sem == 'RETURN':
                self.do_return(arg, stack, indent)
                return
            elif sem == 'RETURNPACK':
                self.do_returnpack(arg, stack, indent)
                return
            elif sem == 'GETIDX':
                if stack:
                    t = stack[-1]
                    txt = '(%s)' % t.text if t.prec > 0 else t.text
                    stack[-1] = E('%s[%d]' % (txt, arg), 0)
            pc = nxt
        while len(self.scopes) > base:
            self.scopes.pop()

    def do_declare(self, tid, stack, indent):
        v = self.pop(stack, indent)
        nm = self.declare(tid)
        self.emit(indent, 'local %s = %s' % (nm, v.text))
        if not v.impure and v.prec == 0:
            self.const_of[nm] = v.text

    def do_call(self, n, stack, indent, multi):
        args = []
        for _ in range(n or 0):
            args.append(self.pop(stack, indent) if stack else E('nil'))
        args.reverse()
        f = self.pop(stack, indent) if stack else E('?')
        ftext = '(%s)' % f.text if f.prec > 0 else f.text
        call = '%s(%s)' % (ftext, ', '.join(a.text for a in args))
        if args and '.' in ftext:
            base, _, key = strip_parens(ftext).rpartition('.')
            if base and IDENT_RE.match(key) and not base_has_op(base):
                if strip_parens(args[0].text) == strip_parens(base):
                    rest = ', '.join(a.text for a in args[1:])
                    call = '%s:%s(%s)' % (base, key, rest)
        stack.append(E(call, 0, pack=multi, impure=True))

    def do_unpack(self, n, stack, indent):
        p = self.pop(stack, indent) if stack else E('nil')
        names = []
        cur = self.cur_pc + (self.inst[self.cur_pc][2] if self.cur_pc in self.inst else 1)
        ok = True
        for _ in range(n or 0):
            nxt = cur + (self.inst[cur][2] if cur in self.inst else 1)
            if cur not in self.inst or self.sem(cur) != 'DECLARE':
                ok = False
                break
            names.append(self.declare(self.inst[cur][1]))
            cur = nxt
        if ok and names:
            self.emit(indent, 'local %s = %s' % (', '.join(names), p.text))
            self.skip_pcs.add(cur)
            for _ in range(n):
                stack.append(E('nil'))
            return
        tmps = [self.tmp('u') for _ in range(n or 0)]
        if tmps:
            self.emit(indent, 'local %s = %s' % (', '.join(tmps), p.text))
        for tname in tmps:
            stack.append(E(tname))

    def do_return(self, n, stack, indent):
        if not n:
            self.emit(indent, 'return')
            return
        if n == 1:
            self.emit(indent, 'return %s' % (self.pop(stack, indent).text if stack else 'nil'))
            return
        vals = []
        for _ in range(n):
            vals.append(self.pop(stack, indent) if stack else E('nil'))
        vals.reverse()
        self.emit(indent, 'return %s' % ', '.join(v.text for v in vals))

    def do_returnpack(self, k, stack, indent):
        p = self.pop(stack, indent) if stack else E('nil')
        vals = []
        for _ in range(k or 0):
            vals.append(self.pop(stack, indent) if stack else E('nil'))
        vals.reverse()
        parts = [v.text for v in vals] + [p.text]
        self.emit(indent, 'return %s' % ', '.join(parts))

    def do_closure(self, cid, stack, indent, nxt):
        snap = {}
        for sc in reversed(self.scopes):
            for tid, nm in sc.items():
                snap.setdefault(tid, nm)
        for tid, nm in self.upvals.items():
            snap.setdefault(tid, nm)
        body = self.master.chunk_lines(cid, snap)
        target = None
        if nxt in self.inst and self.sem(nxt) == 'DECLARE':
            target = self.declare(self.inst[nxt][1])
            self.skip_pcs.add(nxt)
        else:
            target = self.tmp('f')
        args = ['arg%d' % (i + 1) for i in range(len(self.vm.chunks[cid - 1]['p']))]
        if self.vm.chunks[cid - 1]['v']:
            args.append('...')
        self.emit(indent, 'local %s = function(%s)' % (target, ', '.join(args)))
        for i, t in body:
            self.emit(indent + 1 + i, t)
        self.emit(indent, 'end')
        if target is not None and nxt not in self.skip_pcs:
            stack.append(E(target))

    def try_forin(self, header, back, semb, szb, indent, stack):
        self.forin_end = None
        call_pc = None
        for p in self.pcs:
            if p < header or p >= back:
                continue
            if self.sem(p) == 'CALLM' and self.inst[p][1] == 2:
                call_pc = p
                break
        if call_pc is None:
            return False
        p = call_pc + self.inst[call_pc][2]
        if self.sem(p) == 'DUP':
            p += self.inst[p][2]
        if self.sem(p) != 'PICK1':
            return False
        p += self.inst[p][2]
        if self.sem(p) != 'JNIL':
            return False
        exit_pc = self.jumps.get(p)
        if exit_pc is None or exit_pc <= back:
            return False
        body_start = p + self.inst[p][2]

        self.parse_region(header, call_pc, indent, stack)
        if len(stack) < 3:
            return False
        fns = [stack.pop().text for _ in range(3)][::-1]
        del stack[:]

        names, skip = [], set()
        p = body_start
        while p < back:
            s_ = self.sem(p)
            if s_ in ('BLOCKSTART', 'NOP'):
                p += self.inst[p][2]
                continue
            if s_ != 'DUP':
                break
            pk = p + self.inst[p][2]
            if self.sem(pk) != 'GETIDX':
                break
            pd = pk + self.inst[pk][2]
            if self.sem(pd) != 'DECLARE':
                break
            names.append(self.declare(self.inst[pd][1]))
            skip.update((p, pk, pd))
            p = pd + self.inst[pd][2]
        if not names:
            return False
        body_start = p

        tail, q = [], back
        for want in ('POP', 'SETLOCAL', 'PICK1', 'DUP'):
            q = self.prev_pc(q)
            if q is None or q < body_start or self.sem(q) != want:
                tail = []
                break
            tail.append(q)
        if tail:
            skip.update(tail)
            back = min(tail)
        else:
            back = back

        fns = [self.const_of.get(x, x) for x in fns]
        mm = [re.match(r'^(\w+)\[(\d)\]$', x) for x in fns]
        if all(mm) and len(set(m.group(1) for m in mm)) == 1:
            src = self.const_of.get(mm[0].group(1))
            if src:
                self.drop_line('local %s = ' % mm[0].group(1))
                fns = [src]
        if len(fns) == 1:
            it = fns[0]
        elif fns[0] == 'next' and fns[2] == 'nil':
            it = 'pairs(%s)' % fns[1]
        else:
            it = ', '.join(fns)
        self.emit(indent, 'for %s in %s do' % (', '.join(names), it))
        saved, self.skip_pcs = self.skip_pcs, self.skip_pcs | skip
        self.loops.append({'exit': exit_pc, 'cont': header})
        self.parse_region(body_start, back, indent + 1, [])
        self.loops.pop()
        self.skip_pcs = saved
        self.emit(indent, 'end')
        self.forin_end = exit_pc
        return True

    def do_loop(self, header, pc1, indent, stack):
        back = self.loop_headers[header]
        opb, argb, szb = self.inst[back]
        semb = self.sem(back)
        self.loop_headers.pop(header, None)
        try:
            return self.do_loop_body(header, back, semb, szb, pc1, indent, stack)
        finally:
            self.loop_headers[header] = back

    def do_loop_body(self, header, back, semb, szb, pc1, indent, stack):
        if self.try_forin(header, back, semb, szb, indent, stack):
            return self.forin_end
        if semb == 'JMP':
            jc = None
            for p in self.pcs:
                if p < header or p >= back:
                    continue
                if self.sem(p) in ('JT', 'JF', 'JNIL'):
                    a = self.jumps.get(p)
                    if a is not None and a > back:
                        jc = p
                        break
            if jc is not None:
                semc = self.sem(jc)
                exit_pc = self.jumps[jc]
                self.parse_region(header, jc, indent, stack)
                cond = self.pop(stack, indent) if stack else E('true')
                if semc == 'JNIL':
                    ctext = '%s ~= nil' % cond.text
                elif semc == 'JT':
                    ctext = un_('not', cond, P_UN).text
                else:
                    ctext = cond.text
                self.emit(indent, 'while %s do' % ctext)
                self.loops.append({'exit': exit_pc, 'cont': header})
                self.parse_region(jc + self.inst[jc][2], back, indent + 1, [])
                self.loops.pop()
                self.emit(indent, 'end')
                return max(exit_pc, back + szb)
            self.emit(indent, 'while true do')
            self.loops.append({'exit': back + szb, 'cont': header})
            self.parse_region(header, back, indent + 1, [])
            self.loops.pop()
            self.emit(indent, 'end')
            return back + szb
        self.emit(indent, 'repeat')
        self.loops.append({'exit': back + szb, 'cont': header})
        self.parse_region(header, back, indent + 1, stack)
        self.loops.pop()
        cond = self.pop(stack, indent) if stack else E('true')
        if semb == 'JF':
            ctext = un_('not', cond, P_UN).text
        else:
            ctext = cond.text
        self.emit(indent, 'until %s' % ctext)
        return back + szb

class Decompiler:

    def __init__(self, vm):
        self.vm = vm
        self.active = set()
        self.cache = {}

    def chunk_lines(self, cid, upvals):
        key = (cid, tuple(sorted(upvals.items())))
        if key in self.cache:
            return self.cache[key]
        if cid in self.active or not (1 <= cid <= len(self.vm.chunks)):
            return [(0, '-- <recursive or missing chunk %s>' % cid)]
        self.active.add(cid)
        d = ChunkDec(self.vm, cid, upvals, 0, self)
        d.cur_pc = 0
        lines = d.run()
        self.active.discard(cid)
        self.cache[key] = lines
        return lines

    def decompile(self):
        lines = self.chunk_lines(self.vm.entry, {})
        head = ['-- allah niga decompiled scripter vm']
        return '\n'.join(head + ['    ' * i + t for i, t in lines])



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input')
    ap.add_argument('-o', '--out')
    ap.add_argument('--disasm', action='store_true')
    args = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    sys.setrecursionlimit(20000)
    vm = VM(args.input)
    if args.disasm:
        print(vm.disasm())
        return
    out = Decompiler(vm).decompile()
    path = args.out or (os.path.splitext(args.input)[0] + '.decompiled.lua')
    open(path, 'w', encoding='utf-8').write(out)
    print('%s (%d bytes)' % (path, len(out)))

if __name__ == '__main__':
    main()
