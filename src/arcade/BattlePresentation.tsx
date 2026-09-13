import React from "react";
import {Text,View} from "react-native";
import {LinearGradient} from "expo-linear-gradient";
import Character from "../components/Character";
import {palette} from "../theme";
import {ratingName} from "../../shared/progression.mjs";

export type BattleMember={id:string;name:string;avatar?:unknown;rank?:number|null;seriesWins:number};
export default function BattlePresentation({members,playerId,final=false,outcome}:{members:BattleMember[];playerId?:string;final?:boolean;outcome?:string}){
  const best=Math.max(0,...members.map(m=>m.seriesWins));
  const leaders=members.filter(m=>m.seriesWins===best);
  const winner=final && best>0 && leaders.length===1?leaders[0]:null;
  const ordered=final?members:[...members].sort((a,b)=>Number(b.id===playerId)-Number(a.id===playerId));
  return <LinearGradient colors={final?["#F9F1D8","#EFEAFF"]:["#20183F","#124B5A"]} style={{padding:20,borderRadius:22,gap:18}}>
    <Text style={{fontSize:12,fontWeight:"800",letterSpacing:1.2,textAlign:"center",color:final?palette.textDim:"#D8FFF5"}}>{final?(winner?"DESTAQUE DA DISPUTA":"CADA PROVA CONTOU"):"BATALHA ENCONTRADA"}</Text>
    {final && <>
      <View style={{alignItems:"center",gap:12}}>
        {winner?<><Text style={{fontSize:32}}>🏆</Text><Character avatar={winner.avatar} size={112} label={`Personagem de ${winner.name}`}/><Text style={{fontSize:20,fontWeight:"800",color:palette.text}}>{winner.name}</Text></>:<Text style={{fontSize:40}}>🤝</Text>}
        <Text accessibilityLiveRegion="polite" style={{fontSize:30,fontWeight:"900",textAlign:"center",color:palette.text}}>{outcome}</Text>
      </View>
      <Text style={{color:palette.textDim,textAlign:"center",lineHeight:21}}>Veja seus resultados com calma. Você escolhe quando jogar novamente.</Text>
    </>}
    <View style={{flexDirection:"row",flexWrap:"wrap",justifyContent:"center",gap:12}}>
      {ordered.map((member,index)=><View key={member.id} style={{flexGrow:1,flexBasis:105,minWidth:100,alignItems:"center",gap:9,padding:12,borderRadius:16,backgroundColor:final?"#FFFFFF":"#FFFFFF12"}}>
        {!final && <Character avatar={member.avatar} size={76} label={`Personagem de ${member.name}`}/>}
        <Text style={{color:final?palette.text:"#FFFFFF",fontWeight:"800",fontSize:17,textAlign:"center",flexShrink:1}}>{member.name}</Text>
        <Text style={{color:final?palette.textDim:"#CFD9F2",fontSize:12,textAlign:"center"}}>{member.id===playerId?"VOCÊ":"RIVAL"}{member.rank!=null?` · ${ratingName(member.rank)}`:""}</Text>
        {final && <Text style={{color:palette.violet,fontSize:24,fontWeight:"900"}}>{member.seriesWins} vitória(s)</Text>}
      </View>)}
    </View>
    {!final && <Text style={{fontSize:28,fontWeight:"900",color:"#FFFFFF",textAlign:"center"}}>VS</Text>}
  </LinearGradient>;
}
