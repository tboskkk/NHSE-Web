import json, sys, math
import numpy as np
from PIL import Image
sys.path.insert(0, __file__.rsplit('/',1)[0])
import bntx

def deswizzle(w_blk, h_blk, bpp, bh_log2, data):
    bh = 1 << bh_log2
    pitch = (w_blk*bpp + 63)//64*64
    out = bytearray(w_blk*h_blk*bpp)
    ys = np.arange(h_blk)
    for x in range(w_blk):
        px = x*bpp
        pos = ((ys//(8*bh))*(512*bh*(pitch//64)) + (px//64)*(512*bh) + ((ys%(8*bh))//8)*512
               + ((px%64)//32)*256 + ((ys%8)//2)*64 + ((px%32)//16)*32 + (ys%2)*16 + (px%16))
        for y in range(h_blk):
            o = (y*w_blk + x)*bpp
            out[o:o+bpp] = data[pos[y]:pos[y]+bpp]
    return bytes(out)

def rgb565(c):
    r=(c>>11)&31; g=(c>>5)&63; b=c&31
    return np.stack([r*255//31, g*255//63, b*255//31],-1)

def decode_bc1(w, h, raw):
    bw, bh = w//4, h//4
    blocks = np.frombuffer(raw, dtype=np.uint8).reshape(bh, bw, 8)
    c0 = blocks[...,0].astype(np.uint16) | (blocks[...,1].astype(np.uint16)<<8)
    c1 = blocks[...,2].astype(np.uint16) | (blocks[...,3].astype(np.uint16)<<8)
    bits = blocks[...,4].astype(np.uint32)|(blocks[...,5].astype(np.uint32)<<8)|(blocks[...,6].astype(np.uint32)<<16)|(blocks[...,7].astype(np.uint32)<<24)
    p0, p1 = rgb565(c0), rgb565(c1)
    pal = np.zeros((bh,bw,4,4), np.int32)
    four = (c0 > c1)[...,None]
    pal[...,0,:3] = p0; pal[...,1,:3] = p1
    pal[...,2,:3] = np.where(four, (2*p0+p1)//3, (p0+p1)//2)
    pal[...,3,:3] = np.where(four, (p0+2*p1)//3, 0)
    pal[...,:,3] = 255
    pal[...,3,3] = np.where(four[...,0], 255, 0)
    img = np.zeros((h, w, 4), np.uint8)
    for py in range(4):
        for px in range(4):
            sel = (bits >> (2*(py*4+px))) & 3
            img[py::4, px::4] = np.take_along_axis(pal, sel[...,None,None], 2)[...,0,:]
    return img

def albedo(bntx_path, name='_Alb'):
    for t in bntx.parse(bntx_path):
        if t['name'].endswith(name):
            assert t['fmt']>>8 == 0x1a, hex(t['fmt'])
            raw = deswizzle(t['w']//4, t['h']//4, 8, t['bh'], t['data'])
            return decode_bc1(t['w'], t['h'], raw)
    raise KeyError(name)

def raster(models, tex, view, size=128):
    # view: 'top' looks down -Y; 'iso' rotates 45deg about Y then tilts 35deg
    shapes = [s for m in models for s in m['shapes']]
    P = np.concatenate([np.array(s['pos'],np.float32).reshape(-1,3) for s in shapes])
    def xf(p):
        if view == 'top':
            return np.stack([p[:,0], p[:,2], -p[:,1]], 1)  # screen x, screen y(down), depth (nearer = larger y)
        a=math.radians(45); t=math.radians(35)
        x = p[:,0]*math.cos(a) - p[:,2]*math.sin(a)
        z = p[:,0]*math.sin(a) + p[:,2]*math.cos(a)
        y = p[:,1]*math.cos(t) - z*math.sin(t)
        d = p[:,1]*math.sin(t) + z*math.cos(t)
        return np.stack([x, -y, d], 1)
    Q = xf(P)
    mn, mx = Q[:,:2].min(0), Q[:,:2].max(0)
    scale = (size-8)/max(mx-mn)
    ctr = (mn+mx)/2
    img = np.zeros((size,size,4), np.uint8)
    zb = np.full((size,size), np.inf, np.float32)
    th, tw = tex.shape[:2]
    base = 0
    for s in shapes:
        p = np.array(s['pos'],np.float32).reshape(-1,3); uv = np.array(s['uv'],np.float32).reshape(-1,2)/65535.0
        q = xf(p); sx = (q[:,0]-ctr[0])*scale+size/2; sy = (q[:,1]-ctr[1])*scale+size/2
        idx = np.array(s['idx'],np.int64).reshape(-1,3)
        for a,b,c in idx:
            x0,x1 = int(max(0,math.floor(min(sx[[a,b,c]])))), int(min(size-1,math.ceil(max(sx[[a,b,c]]))))
            y0,y1 = int(max(0,math.floor(min(sy[[a,b,c]])))), int(min(size-1,math.ceil(max(sy[[a,b,c]]))))
            if x1<x0 or y1<y0: continue
            den = (sy[b]-sy[c])*(sx[a]-sx[c])+(sx[c]-sx[b])*(sy[a]-sy[c])
            if abs(den)<1e-9: continue
            gx,gy = np.meshgrid(np.arange(x0,x1+1)+0.5, np.arange(y0,y1+1)+0.5)
            w0=((sy[b]-sy[c])*(gx-sx[c])+(sx[c]-sx[b])*(gy-sy[c]))/den
            w1=((sy[c]-sy[a])*(gx-sx[c])+(sx[a]-sx[c])*(gy-sy[c]))/den
            w2=1-w0-w1
            m=(w0>=-1e-4)&(w1>=-1e-4)&(w2>=-1e-4)
            if not m.any(): continue
            dz=w0*q[a,2]+w1*q[b,2]+w2*q[c,2]
            u=w0*uv[a,0]+w1*uv[b,0]+w2*uv[c,0]; v=w0*uv[a,1]+w1*uv[b,1]+w2*uv[c,1]
            ys,xs=np.nonzero(m)
            for yy,xx in zip(ys,xs):
                Y,X=y0+yy,x0+xx
                if dz[yy,xx]<zb[Y,X]:
                    zb[Y,X]=dz[yy,xx]
                    tx=int(np.clip(u[yy,xx]*tw,0,tw-1)); ty=int(np.clip(v[yy,xx]*th,0,th-1))
                    img[Y,X]=tex[ty,tx]; img[Y,X,3]=255
    return Image.fromarray(img,'RGBA')

if __name__=='__main__':
    model, bntx_path, out = sys.argv[1:4]
    models = json.load(open(model))
    tex = albedo(bntx_path)
    Image.fromarray(tex).save(out+'_albedo.png')
    for view in ('top','iso'):
        raster(models, tex, view).save(f'{out}_{view}.png')
    print('ok')
