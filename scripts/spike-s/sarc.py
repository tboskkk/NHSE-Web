import struct, sys, os
def extract(path, out):
    d = open(path, 'rb').read()
    assert d[:4] == b'SARC'
    bom = struct.unpack_from('>H', d, 6)[0]
    e = '<' if bom == 0xFFFE else '>'
    hdr, = struct.unpack_from(e+'H', d, 4)
    data_off, = struct.unpack_from(e+'I', d, 0x0c)
    assert d[hdr:hdr+4] == b'SFAT'
    cnt, = struct.unpack_from(e+'H', d, hdr+6)
    sfat = hdr + 12
    sfnt = sfat + cnt*16
    names_off = sfnt + 8
    os.makedirs(out, exist_ok=True)
    for i in range(cnt):
        _, nameoff, s, en = struct.unpack_from(e+'IIII', d, sfat + i*16)
        no = names_off + (nameoff & 0xffffff) * 4
        name = d[no:d.index(b'\0', no)].decode()
        p = os.path.join(out, name)
        os.makedirs(os.path.dirname(p) or out, exist_ok=True)
        open(p, 'wb').write(d[data_off+s:data_off+en])
        print(name, en - s)
extract(sys.argv[1], sys.argv[2])
