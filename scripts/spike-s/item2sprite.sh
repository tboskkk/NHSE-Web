#!/bin/bash
# THROWAWAY spike: ID NAME [V]  geometry from Model/NAME, texture from Model/NAME ReBodyV (if present) else NAME's own bntx
set -e
S=$(cd "$(dirname "$0")" && pwd); ID=$1; NAME=$2; V=${3:-0}; W=$S/w/$NAME; R=$S/w/$NAME-rb$V; mkdir -p $W $R
M=~/Games/ACNH/romfs/Model
x() { zstd -d -f -q $M/$1.Nin_NX_NVN.zs -o $2/a.sarc; python3 $S/sarc.py $2/a.sarc $2/sarc >/dev/null; (cd $S/bf/bf && dotnet run -c Release --no-build -- $2/sarc/output.bfres $2 >/dev/null); }
x $NAME $W
TEX=$W/textures.bntx
if [ -f $M/${NAME}ReBody$V.Nin_NX_NVN.zs ]; then x ${NAME}ReBody$V $R; TEX=$R/textures.bntx; fi
python3 $S/render.py $W/model.json $TEX $W/r$V
P=$(printf "%05d" $ID)
mkdir -p personal-sprites
cp $W/r${V}_top.png personal-sprites/${P}_$V.png
cp $W/r${V}_iso.png $S/${P}_${V}_iso.png
