import struct
def parse(path):
    d = open(path,'rb').read()
    assert d[:4]==b'BNTX'
    assert d[0x20:0x24]==b'NX  '
    n, = struct.unpack_from('<I', d, 0x24)
    infoptr, = struct.unpack_from('<Q', d, 0x28)
    out=[]
    for i in range(n):
        off, = struct.unpack_from('<Q', d, infoptr+i*8)
        assert d[off:off+4]==b'BRTI'
        tile, = struct.unpack_from('<H', d, off+0x12)
        mips, = struct.unpack_from('<H', d, off+0x16)
        fmt, = struct.unpack_from('<I', d, off+0x1c)
        w,h,depth,arr,bh = struct.unpack_from('<5I', d, off+0x24)
        imgsize, = struct.unpack_from('<I', d, off+0x50)
        nameoff, = struct.unpack_from('<Q', d, off+0x60)
        ln, = struct.unpack_from('<H', d, nameoff)
        name = d[nameoff+2:nameoff+2+ln].decode()
        ptrs, = struct.unpack_from('<Q', d, off+0x70)
        base, = struct.unpack_from('<Q', d, ptrs)
        out.append(dict(name=name,fmt=fmt,w=w,h=h,bh=bh,tile=tile,mips=mips,size=imgsize,data=d[base:base+imgsize]))
    return out
if __name__=='__main__':
    import sys
    for t in parse(sys.argv[1]): print(t['name'], hex(t['fmt']), t['w'],t['h'],'bhlog2',t['bh'],'mips',t['mips'],t['size'])
