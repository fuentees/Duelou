import React from "react";
import { View } from "react-native";
import { readAvatar, avatarOptions } from "../../shared/avatar.mjs";

// Code-drawn characters scale cleanly and need no image downloads or icon fonts.
export default function Character({avatar,size=80,label}:{avatar?:unknown;size?:number;label?:string}){
  const a=readAvatar(avatar), color=avatarOptions.color.find(c=>c.id===a.color)!.hex!;
  const unit=size/100;
  const box=(x:number,y:number,w:number,h:number,extra:object={})=>({position:"absolute" as const,left:x*unit,top:y*unit,width:w*unit,height:h*unit,...extra});
  return <View accessible={!!label} accessibilityLabel={label} style={{width:size,height:size,borderRadius:a.frame==="square"?size*.2:size/2,backgroundColor:"#F0EBFF",borderWidth:a.frame==="gold"?3:1,borderColor:a.frame==="gold"?"#A97517":"#D7CEE9",overflow:"hidden"}}>
    <View style={box(18,68,64,42,{backgroundColor:color,borderRadius:20*unit})}/>
    {a.species==="cat" && <><View style={box(24,18,20,25,{backgroundColor:color,transform:[{rotate:"-20deg"}],borderRadius:3*unit})}/><View style={box(56,18,20,25,{backgroundColor:color,transform:[{rotate:"20deg"}],borderRadius:3*unit})}/></>}
    {a.species==="robot" && <><View style={box(48,12,4,18,{backgroundColor:"#24304B"})}/><View style={box(44,10,12,12,{backgroundColor:color,borderRadius:10*unit})}/></>}
    {a.species==="alien" && <><View style={box(27,13,4,25,{backgroundColor:color,transform:[{rotate:"-25deg"}]})}/><View style={box(67,13,4,25,{backgroundColor:color,transform:[{rotate:"25deg"}]})}/></>}
    <View style={box(22,28,56,48,{backgroundColor:color,borderRadius:(a.species==="robot"?12:26)*unit,borderWidth:2,borderColor:"#FFFFFF"})}/>
    <View style={box(28,39,44,24,{backgroundColor:"#17243C",borderRadius:12*unit})}/>
    {[35,57].map(x=><View key={x} style={box(x,45,8,a.species==="alien"?13:9,{backgroundColor:"#D6FFF3",borderRadius:8*unit})}/>)}
    <View style={box(42,65,16,3,{backgroundColor:"#FFFFFF",borderRadius:3*unit})}/>
    {a.accessory==="visor" && <View style={box(27,43,46,8,{backgroundColor:"#8DE1EF",borderRadius:4*unit,opacity:.85})}/>}
    {a.accessory==="crown" && <><View style={box(32,24,36,10,{backgroundColor:"#E6AC28",borderRadius:3*unit})}/>{[32,47,62].map(x=><View key={x} style={box(x,15,7,16,{backgroundColor:"#F5C644",borderRadius:2*unit})}/>)}</>}
    {a.species==="cat" && <View style={box(47,59,6,5,{backgroundColor:"#FFA9AE",borderRadius:4*unit})}/>}
  </View>;
}
