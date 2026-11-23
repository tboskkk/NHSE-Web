import json,sys,os,re
S=sys.argv[1]; want=sys.argv[2].lower()
il=json.load(open('app/public/data/lang/en.json'))['items']
lines=open(S+'/bcsv/ItemParam.tsv',encoding='utf8').read().split('\n')
idc=lines[0].split('\t').index('0x54706054')
cl=lambda x:x.replace('\x00','').strip()
for r in lines[1:]:
    c=r.split('\t')
    if len(c)<=idc: continue
    i=int(cl(c[idc]))
    u=[cl(x) for x in c if re.fullmatch(r'Ftr[A-Za-z0-9]+',cl(x)) and os.path.exists(os.path.expanduser(f'~/Games/ACNH/romfs/Model/{cl(x)}.Nin_NX_NVN.zs'))]
    if u and want in il[i].lower(): print(i, il[i], u[0])
