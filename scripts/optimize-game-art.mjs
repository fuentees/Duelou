import sharp from "sharp";
import {mkdir,stat} from "node:fs/promises";
const names=["math","order","odd","sequence","colors","timer","reflex","memory"];
await mkdir("assets/games/optimized",{recursive:true});
let before=0,after=0;
for(const name of names){
 const input=`assets/games/${name}.png`,output=`assets/games/optimized/${name}.jpg`;
 await sharp(input).resize({width:512,height:512,fit:"inside",withoutEnlargement:true}).flatten({background:"#F5F6FC"}).jpeg({quality:82,mozjpeg:true}).toFile(output);
 before+=(await stat(input)).size;after+=(await stat(output)).size;
}
console.log(JSON.stringify({before,after,reductionPercent:Math.round(100*(1-after/before))}));
