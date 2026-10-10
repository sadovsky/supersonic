# montage of pngs: python3 montage.py out.png cols in1.png in2.png ...
import sys, zlib, struct
def readpng(p):
    d=open(p,'rb').read(); i=8; idat=b''; w=h=0
    while i<len(d):
        l=struct.unpack('>I',d[i:i+4])[0]; t=d[i+4:i+8]; c=d[i+8:i+8+l]
        if t==b'IHDR': w,h=struct.unpack('>II',c[:8])
        if t==b'IDAT': idat+=c
        i+=12+l
    raw=zlib.decompress(idat); rows=[]; s=w*4
    prev=bytearray(s)
    for y in range(h):
        f=raw[y*(s+1)]; line=bytearray(raw[y*(s+1)+1:(y+1)*(s+1)])
        assert f==0
        rows.append(line)
    return w,h,rows
def writepng(p,w,h,rows):
    raw=b''.join(b'\0'+bytes(r) for r in rows)
    def ch(t,c): return struct.pack('>I',len(c))+t+c+struct.pack('>I',zlib.crc32(t+c)&0xffffffff)
    open(p,'wb').write(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b''))
if __name__=='__main__':
  out=sys.argv[1]; cols=int(sys.argv[2]); ims=[readpng(p) for p in sys.argv[3:]]
  w,h=ims[0][0],ims[0][1]; n=len(ims); rws=(n+cols-1)//cols
  W=w*cols+ (cols-1)*2; H=h*rws+(rws-1)*2
  canvas=[bytearray(b'\x40\x40\x40\xff'*W) for _ in range(H)]
  for k,(iw,ih,rows) in enumerate(ims):
      ox=(k%cols)*(w+2); oy=(k//cols)*(h+2)
      for y in range(ih): canvas[oy+y][ox*4:(ox+iw)*4]=rows[y]
  writepng(out,W,H,canvas)
