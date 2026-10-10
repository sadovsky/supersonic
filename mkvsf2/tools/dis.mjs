// 65816 disassembler for development: node tools/dis.mjs rom.sfc addr(hex, snes) count [m x]
import fs from 'node:fs';
const T = `BRK s|ORA (d,x)|COP s|ORA d,s|TSB d|ORA d|ASL d|ORA [d]|PHP|ORA #m|ASL A|PHD|TSB a|ORA a|ASL a|ORA l|BPL r|ORA (d),y|ORA (d)|ORA (d,s),y|TRB d|ORA d,x|ASL d,x|ORA [d],y|CLC|ORA a,y|INC A|TCS|TRB a|ORA a,x|ASL a,x|ORA l,x|JSR a|AND (d,x)|JSL l|AND d,s|BIT d|AND d|ROL d|AND [d]|PLP|AND #m|ROL A|PLD|BIT a|AND a|ROL a|AND l|BMI r|AND (d),y|AND (d)|AND (d,s),y|BIT d,x|AND d,x|ROL d,x|AND [d],y|SEC|AND a,y|DEC A|TSC|BIT a,x|AND a,x|ROL a,x|AND l,x|RTI|EOR (d,x)|WDM s|EOR d,s|MVP b|EOR d|LSR d|EOR [d]|PHA|EOR #m|LSR A|PHK|JMP a|EOR a|LSR a|EOR l|BVC r|EOR (d),y|EOR (d)|EOR (d,s),y|MVN b|EOR d,x|LSR d,x|EOR [d],y|CLI|EOR a,y|PHY|TCD|JML l|EOR a,x|LSR a,x|EOR l,x|RTS|ADC (d,x)|PER R|ADC d,s|STZ d|ADC d|ROR d|ADC [d]|PLA|ADC #m|ROR A|RTL|JMP (a)|ADC a|ROR a|ADC l|BVS r|ADC (d),y|ADC (d)|ADC (d,s),y|STZ d,x|ADC d,x|ROR d,x|ADC [d],y|SEI|ADC a,y|PLY|TDC|JMP (a,x)|ADC a,x|ROR a,x|ADC l,x|BRA r|STA (d,x)|BRL R|STA d,s|STY d|STA d|STX d|STA [d]|DEY|BIT #m|TXA|PHB|STY a|STA a|STX a|STA l|BCC r|STA (d),y|STA (d)|STA (d,s),y|STY d,x|STA d,x|STX d,y|STA [d],y|TYA|STA a,y|TXS|TXY|STZ a|STA a,x|STZ a,x|STA l,x|LDY #x|LDA (d,x)|LDX #x|LDA d,s|LDY d|LDA d|LDX d|LDA [d]|TAY|LDA #m|TAX|PLB|LDY a|LDA a|LDX a|LDA l|BCS r|LDA (d),y|LDA (d)|LDA (d,s),y|LDY d,x|LDA d,x|LDX d,y|LDA [d],y|CLV|LDA a,y|TSX|TYX|LDY a,x|LDA a,x|LDX a,y|LDA l,x|CPY #x|CMP (d,x)|REP #s|CMP d,s|CPY d|CMP d|DEC d|CMP [d]|INY|CMP #m|DEX|WAI|CPY a|CMP a|DEC a|CMP l|BNE r|CMP (d),y|CMP (d)|CMP (d,s),y|PEI d|CMP d,x|DEC d,x|CMP [d],y|CLD|CMP a,y|PHX|STP|JML (a)|CMP a,x|DEC a,x|CMP l,x|CPX #x|SBC (d,x)|SEP #s|SBC d,s|CPX d|SBC d|INC d|SBC [d]|INX|SBC #m|NOP|XBA|CPX a|SBC a|INC a|SBC l|BEQ r|SBC (d),y|SBC (d)|SBC (d,s),y|PEA a|SBC d,x|INC d,x|SBC [d],y|SED|SBC a,y|PLX|XCE|JSR (a,x)|SBC a,x|INC a,x|SBC l,x`.split('|');
export function disasm(read, addr, count, m = 1, x = 1) {
  const lines = [];
  for (let k = 0; k < count; k++) {
    const op = read(addr);
    const [mn, arg = ''] = T[op].split(' ');
    const h = (v, n) => v.toString(16).padStart(n, '0');
    let len = 1, s = '';
    const b1 = read(addr + 1), w = b1 | (read(addr + 2) << 8), l = w | (read(addr + 3) << 16);
    const a0 = arg.replace(/[^a-zA-Z]/g, '')[0];
    switch (a0) {
      case 'd': len = 2; s = arg.replace('d', '$' + h(b1, 2)); break;
      case 's': len = 2; s = arg.replace('s', '$' + h(b1, 2)); break;
      case 'a': len = 3; s = arg.replace('a', '$' + h(w, 4)); break;
      case 'l': len = 4; s = arg.replace('l', '$' + h(l, 6)); break;
      case 'r': len = 2; s = '$' + h((addr & 0xff0000) | ((addr + 2 + ((b1 << 24) >> 24)) & 0xffff), 6); break;
      case 'R': len = 3; s = '$' + h((addr & 0xff0000) | ((addr + 3 + ((w << 16) >> 16)) & 0xffff), 6); break;
      case 'b': len = 3; s = `$${h(b1, 2)},$${h(read(addr + 2), 2)}`; break;
      case 'm': len = m ? 2 : 3; s = '#$' + (m ? h(b1, 2) : h(w, 4)); break;
      case 'x': len = x ? 2 : 3; s = '#$' + (x ? h(b1, 2) : h(w, 4)); break;
      case 'A': s = 'A'; break;
    }
    if (mn === 'REP') { if (b1 & 0x20) m = 0; if (b1 & 0x10) x = 0; }
    if (mn === 'SEP') { if (b1 & 0x20) m = 1; if (b1 & 0x10) x = 1; }
    const bytes = []; for (let i = 0; i < len; i++) bytes.push(h(read(addr + i), 2));
    lines.push(`${h(addr, 6)}  ${bytes.join(' ').padEnd(12)} ${mn} ${s}`);
    addr = (addr & 0xff0000) | ((addr + len) & 0xffff);
  }
  return lines.join('\n');
}
export function romReader(rom) { return a => rom[(((a >> 16) & 0x7f) << 15 | (a & 0x7fff)) & (rom.length - 1)]; }
if (process.argv[1].endsWith('dis.mjs')) {
  const [f, a, n = '30', m = '1', x = '1'] = process.argv.slice(2);
  const rom = new Uint8Array(fs.readFileSync(f));
  console.log(disasm(romReader(rom), parseInt(a, 16), +n, +m, +x));
}
