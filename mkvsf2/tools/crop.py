# crop + scale a png: crop.py in out x y w h scale
import sys, zlib, struct
sys.path.insert(0, __file__.rsplit('/',1)[0])
from montage import readpng, writepng
a=sys.argv; w,h,rows=readpng(a[1]); x,y,cw,ch,sc=map(int,a[3:8])
out=[]
for yy in range(ch*sc):
    r=rows[y+yy//sc]; line=bytearray()
    for xx in range(cw*sc): px=(x+xx//sc)*4; line+=r[px:px+4]
    out.append(line)
writepng(a[2],cw*sc,ch*sc,out)
