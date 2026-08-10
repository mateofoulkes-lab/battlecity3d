import { BattleGame } from './game.js';

// Mantiene el tablero exactamente en 20 x 14 tiles, como la base original.
BattleGame.prototype.buildMap=function(){
  const rows=[
    'SSSSSSSSSSSSSSSSSSSS',
    'S..B...B..TTB...B..S',
    'S.BB.B.B.SS.B.B.BB.S',
    'S....B..WWW..B.....S',
    'S.B.SS.B.WW.B.SS.B.S',
    'S.B....B...B....B...S',
    'S..IBB..SS...BBI....S',
    'S..IBB..SS...BBI....S',
    'S.B....B...B....B...S',
    'S.B.SS.B.BB.B.SS.B.S',
    'S....B...WWW..B.....S',
    'S.BB.B.B.SS.B.B.BB.S',
    'S..B...BTT..B...B..S',
    'SSSSSSSSSSSSSSSSSSSS'
  ];
  rows.forEach((row,z)=>[...row].forEach((type,x)=>{
    const wx=x-9.5,wz=z-6.5;
    if(type==='B'||type==='S')this.addBlock(type,wx,wz,`${x}-${z}`);
    else if(type!=='.')this.addTerrain(type,wx,wz);
  }));
};
