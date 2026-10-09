# Minimal asm6-compatible assembler for the SMB disassembly: outputs labels + binary.
import re, sys, os, json
OPS = {}
def op(name, **modes):
    OPS[name]=modes
# modes: imp acc imm zp zpx zpy abs abx aby ind izx izy rel
op('ADC',imm=0x69,zp=0x65,zpx=0x75,abs=0x6D,abx=0x7D,aby=0x79,izx=0x61,izy=0x71)
op('AND',imm=0x29,zp=0x25,zpx=0x35,abs=0x2D,abx=0x3D,aby=0x39,izx=0x21,izy=0x31)
op('ASL',acc=0x0A,zp=0x06,zpx=0x16,abs=0x0E,abx=0x1E)
for n,c in [('BCC',0x90),('BCS',0xB0),('BEQ',0xF0),('BMI',0x30),('BNE',0xD0),('BPL',0x10),('BVC',0x50),('BVS',0x70)]: op(n,rel=c)
op('BIT',zp=0x24,abs=0x2C)
op('BRK',imp=0x00)
for n,c in [('CLC',0x18),('CLD',0xD8),('CLI',0x58),('CLV',0xB8),('DEX',0xCA),('DEY',0x88),('INX',0xE8),('INY',0xC8),('NOP',0xEA),('PHA',0x48),('PHP',0x08),('PLA',0x68),('PLP',0x28),('RTI',0x40),('RTS',0x60),('SEC',0x38),('SED',0xF8),('SEI',0x78),('TAX',0xAA),('TAY',0xA8),('TSX',0xBA),('TXA',0x8A),('TXS',0x9A),('TYA',0x98)]: op(n,imp=c)
op('CMP',imm=0xC9,zp=0xC5,zpx=0xD5,abs=0xCD,abx=0xDD,aby=0xD9,izx=0xC1,izy=0xD1)
op('CPX',imm=0xE0,zp=0xE4,abs=0xEC)
op('CPY',imm=0xC0,zp=0xC4,abs=0xCC)
op('DEC',zp=0xC6,zpx=0xD6,abs=0xCE,abx=0xDE)
op('EOR',imm=0x49,zp=0x45,zpx=0x55,abs=0x4D,abx=0x5D,aby=0x59,izx=0x41,izy=0x51)
op('INC',zp=0xE6,zpx=0xF6,abs=0xEE,abx=0xFE)
op('JMP',abs=0x4C,ind=0x6C)
op('JSR',abs=0x20)
op('LDA',imm=0xA9,zp=0xA5,zpx=0xB5,abs=0xAD,abx=0xBD,aby=0xB9,izx=0xA1,izy=0xB1)
op('LDX',imm=0xA2,zp=0xA6,zpy=0xB6,abs=0xAE,aby=0xBE)
op('LDY',imm=0xA0,zp=0xA4,zpx=0xB4,abs=0xAC,abx=0xBC)
op('LSR',acc=0x4A,zp=0x46,zpx=0x56,abs=0x4E,abx=0x5E)
op('ORA',imm=0x09,zp=0x05,zpx=0x15,abs=0x0D,abx=0x1D,aby=0x19,izx=0x01,izy=0x11)
op('ROL',acc=0x2A,zp=0x26,zpx=0x36,abs=0x2E,abx=0x3E)
op('ROR',acc=0x6A,zp=0x66,zpx=0x76,abs=0x6E,abx=0x7E)
op('SBC',imm=0xE9,zp=0xE5,zpx=0xF5,abs=0xED,abx=0xFD,aby=0xF9,izx=0xE1,izy=0xF1)
op('STA',zp=0x85,zpx=0x95,abs=0x8D,abx=0x9D,aby=0x99,izx=0x81,izy=0x91)
op('STX',zp=0x86,zpy=0x96,abs=0x8E)
op('STY',zp=0x84,zpx=0x94,abs=0x8C)
SIZE={'imp':1,'acc':1,'imm':2,'zp':2,'zpx':2,'zpy':2,'abs':3,'abx':3,'aby':3,'ind':3,'izx':2,'izy':2,'rel':2}

def strip_comment(l):
    out='';q=False
    for ch in l:
        if ch=='"': q=not q
        if ch==';' and not q: break
        out+=ch
    return out.rstrip()

def read_lines(path, base):
    res=[]
    for raw in open(os.path.join(base,path)):
        l=strip_comment(raw.rstrip('\n'))
        m=re.match(r'\s*\.include\s+"([^"]+)"',l)
        if m: res+=read_lines(m.group(1),base); continue
        res.append(l)
    return res

class Asm:
    def __init__(s): s.sym={}; s.labels={}
    def num(s,t):
        t=t.strip()
        if t.startswith('$'): return int(t[1:],16)
        if t.startswith('%'): return int(t[1:],2)
        if re.match(r'^\d+$',t): return int(t)
        if t in s.sym: return s.sym[t]
        raise KeyError(t)
    def ev(s,e):
        e=e.strip()
        if e.startswith('<'): return s.ev(e[1:])&0xff
        if e.startswith('>'): return (s.ev(e[1:])>>8)&0xff
        # tokens with + - *
        toks=re.findall(r'\$[0-9a-fA-F]+|%[01]+|\d+|[A-Za-z_][A-Za-z0-9_]*|[-+*/()]',e)
        expr=''
        for t in toks:
            if t in '+-*/()': expr+=t if t!='/' else '//'
            else: expr+=str(s.num(t))
        return eval(expr)
    def run(s,lines,passno):
        pc=0; out=bytearray(); enum=False; epc=0
        for l in lines:
            if not l.strip(): continue
            m=re.match(r'^([A-Za-z_][A-Za-z0-9_]*):(.*)$',l.strip())
            if m and not l.startswith((' ','\t')) or (m and ':' in l and re.match(r'^\s*[A-Za-z_][A-Za-z0-9_]*:',l)):
                name=m.group(1)
                s.sym[name]=epc if enum else pc
                s.labels[name]=s.sym[name]
                l=m.group(2)
                if not l.strip(): continue
            st=l.strip()
            m=re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$',st)
            if m:
                try: s.sym[m.group(1)]=s.ev(m.group(2))
                except KeyError:
                    if passno==2: raise
                continue
            if st.startswith('.'):
                d,_,args=st.partition(' ')
                d=d.lower(); args=args.strip()
                if d=='.enum': enum=True; epc=s.ev(args); continue
                if d=='.ende': enum=False; continue
                if d=='.base': pc=s.ev(args); continue
                if d in('.db','.byte'):
                    parts=[p for p in re.split(r',(?=(?:[^"]*"[^"]*")*[^"]*$)',args)]
                    for p in parts:
                        p=p.strip()
                        if p.startswith('"'):
                            for ch in p[1:-1]: out.append(ord(ch)); pc+=1
                        else:
                            try: v=s.ev(p)
                            except KeyError:
                                if passno==2: raise
                                v=0
                            out.append(v&0xff); pc+=1
                    continue
                if d in('.dw','.word'):
                    for p in args.split(','):
                        try: v=s.ev(p)
                        except KeyError:
                            if passno==2: raise
                            v=0
                        out+=bytes([v&0xff,(v>>8)&0xff]); pc+=2
                    continue
                if d=='.dsb':
                    a=args.split(','); n=s.ev(a[0]); v=s.ev(a[1]) if len(a)>1 else 0
                    if enum: epc+=n
                    else: out+=bytes([v]*n); pc+=n
                    continue
                if d=='.incbin': continue
                raise Exception('dir '+st)
            m=re.match(r'^([A-Za-z]{3})\s*(.*)$',st)
            if not m: raise Exception('bad '+st)
            mn=m.group(1).upper(); arg=m.group(2).strip()
            modes=OPS[mn]
            def val(e):
                try: return s.ev(e), True
                except KeyError:
                    if passno==2: raise
                    return 0xFFFF, False
            if arg=='' : mode='imp' if 'imp' in modes else 'acc'; v=0
            elif arg.upper()=='A' and 'acc' in modes: mode='acc'; v=0
            elif arg.startswith('#'): mode='imm'; v,_=val(arg[1:])
            elif 'rel' in modes: mode='rel'; v,_=val(arg)
            elif re.match(r'^\(.*\),\s*[yY]$',arg): mode='izy'; v,_=val(arg[1:arg.rindex(')')])
            elif re.match(r'^\(.*,\s*[xX]\)$',arg): mode='izx'; v,_=val(arg[1:arg.rindex(',')])
            elif arg.startswith('(') and arg.endswith(')') and mn=='JMP': mode='ind'; v,_=val(arg[1:-1])
            else:
                idx=None
                mm=re.match(r'^(.*),\s*([xXyY])$',arg)
                if mm: arg2=mm.group(1); idx=mm.group(2).lower()
                else: arg2=arg
                v,known=val(arg2)
                zp = known and v<0x100
                if idx is None: mode='zp' if zp and 'zp' in modes else 'abs'
                elif idx=='x': mode='zpx' if zp and 'zpx' in modes else 'abx'
                else: mode='zpy' if zp and 'zpy' in modes else 'aby'
            if mode not in modes: raise Exception(f'mode {mode} {st}')
            opc=modes[mode]; sz=SIZE[mode]
            if mode=='rel':
                off=(v-(pc+2)) if passno==2 else 0
                if passno==2 and not -128<=off<=127: raise Exception('branch range '+st)
                out+=bytes([opc,off&0xff])
            elif sz==1: out.append(opc)
            elif sz==2: out+=bytes([opc,v&0xff])
            else: out+=bytes([opc,v&0xff,(v>>8)&0xff])
            pc+=sz
        return out

base=sys.argv[1]
lines=read_lines('smb1.asm',base)
a=Asm()
a.run(lines,1); a.run(lines,1)
out=a.run(lines,2)
rom=open(sys.argv[2],'rb').read()
prg=bytes(out[16:16+32768]) if len(out)>=16+32768 else bytes(out[16:])
print('assembled',len(out),'prg', len(prg))
rp=rom[16:16+32768]
diff=[i for i in range(min(len(prg),len(rp))) if prg[i]!=rp[i]]
print('diffs',len(diff), [hex(0x8000+i) for i in diff[:10]])
json.dump({k:v for k,v in a.labels.items()}, open(sys.argv[3],'w'), indent=0, sort_keys=True)
json.dump({k:v for k,v in a.sym.items()}, open(sys.argv[3].replace('.json','_sym.json'),'w'), indent=0, sort_keys=True)
