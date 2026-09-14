import test from "node:test";
import assert from "node:assert/strict";
import {createApp} from "./server.mjs";
import {makeArcade, arcadeScore, publicArcade, modes, performanceLabel, resultDetails, minimumAttemptMs} from "../shared/arcade.mjs";
const perfect=c=>c.mode==="timer"?[c.rounds[0].targetMs]:c.mode==="reflex"?c.rounds.map(()=>100):c.mode==="aim"?c.rounds.map(()=>0):c.rounds[0].sequence;
test("nove jogos, alvos aleatórios, níveis e avaliações compartilhados",()=>{
 assert.deepEqual(modes.map(m=>m.id),["math","order","odd","sequence","colors","timer","reflex","aim","memory"]);
 for(const mode of ["timer","reflex","aim","memory"]) for(const level of [1,15,30]){
   const c=makeArcade(mode,level);
   assert.equal(c.difficulty,level);
   assert.equal(arcadeScore(c,perfect(c)),1000);
   assert.equal(arcadeScore(c,[]),0);
   assert.throws(()=>arcadeScore(c,[NaN]),/inválidas/);
   assert.throws(()=>arcadeScore(c,[Infinity]),/inválidas/);
   assert.ok(publicArcade(c).rounds.every(r=>!("answer" in r)));
 }
 const a=makeArcade("timer",1,()=>0), b=makeArcade("timer",1,()=>.99999);
 assert.equal(a.rounds[0].targetMs,2000);assert.equal(b.rounds[0].targetMs,12000);
 assert.notEqual(a.rounds[0].targetMs,b.rounds[0].targetMs);
 assert.equal(arcadeScore(a,[a.rounds[0].targetMs+a.rounds[0].toleranceMs/2]),500);
 assert.equal(arcadeScore(a,[30000]),0);
 assert.ok(resultDetails(a,[2100]).includes("Seu tempo: 2,100 s"));
 assert.ok(resultDetails(a,[2100]).includes("Diferença: 0,100 s depois do alvo"));
 assert.ok(makeArcade("timer",30).rounds[0].toleranceMs<a.rounds[0].toleranceMs);
 assert.ok(makeArcade("timer",30).rounds[0].hideAfterMs>0);
 assert.equal(arcadeScore(makeArcade("reflex",1),[-1,-1,-1]),0);
 assert.equal(arcadeScore(makeArcade("reflex",1),[0,0,0]),0);
 const aim=makeArcade("aim",1);
 assert.equal(arcadeScore(aim,aim.rounds.map(()=>-1)),0,"todo alvo perdido vale zero");
 assert.equal(arcadeScore(aim,aim.rounds.map(()=>0)),1000,"tocar todos vale o máximo, não importa a velocidade");
 assert.ok(resultDetails(aim,aim.rounds.map(()=>-1))[0].includes("0 de "+aim.rounds.length+" alvos"));
 assert.ok(resultDetails(aim,aim.rounds.map(()=>0))[0].includes(aim.rounds.length+" de "+aim.rounds.length+" alvos"));
 assert.ok(makeArcade("aim",30).rounds[0].visMs<aim.rounds[0].visMs,"alvo fica visível por menos tempo em níveis altos");
 assert.ok(makeArcade("aim",30).rounds.length>aim.rounds.length,"mais alvos aparecem no mesmo tempo total em níveis altos");
 // Alvos que nascem juntos (mesmo spawnMs) não colidem (respeitam a distância mínima).
 const bySpawn=new Map();
 for(const r of makeArcade("aim",30).rounds){
   if(!bySpawn.has(r.spawnMs)) bySpawn.set(r.spawnMs,[]);
   bySpawn.get(r.spawnMs).push(r);
 }
 for(const group of bySpawn.values())
   for(let i=0;i<group.length;i++) for(let j=i+1;j<group.length;j++)
     assert.ok(Math.hypot(group[i].x-group[j].x,group[i].y-group[j].y)>0,"alvos simultâneos não podem se sobrepor exatamente");
 const memory=makeArcade("memory",1);
 assert.equal(arcadeScore(memory,memory.rounds[0].sequence.slice(0,2)),500);
 assert.throws(()=>arcadeScore(memory,[4]),/inválidas/);
 assert.deepEqual([499,500,700,850,950].map(performanceLabel),["Continue praticando","Bom","Ótimo","Excelente","Profissional"]);
});
test("todos os novos jogos usam salas, níveis, resultados, ranking, replay e MD3",async()=>{
 let now=Date.now();const app=createApp(":memory:",()=>now);
 await new Promise(r=>app.server.listen(0,"127.0.0.1",r));
 const base="http://127.0.0.1:"+app.server.address().port;
 const call=async(path,token,body)=>{const r=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 try{
  const a=(await call("/v1/guests",null,{name:"Skill-A"})).data,b=(await call("/v1/guests",null,{name:"Skill-B"})).data;
  for(const difficulty of [0,31,1.5,"3"]) assert.equal((await call("/v1/rooms",a.token,{mode:"timer",difficulty,capacity:2})).status,400);
  for(const mode of ["timer","reflex","aim","memory"]){
   const room=(await call("/v1/rooms",a.token,{mode,difficulty:13,capacity:2,public:false,format:mode==="memory"?"md3":"md1"})).data;
   assert.equal(room.difficulty,13);
   await call("/v1/rooms/"+room.code+"/join",b.token,{});
   await call("/v1/rooms/"+room.code+"/start",a.token,{});
   const rounds=mode==="memory"?2:1;
   for(let gameIndex=0;gameIndex<rounds;gameIndex++){
    now+=gameIndex?25000:5000;
    const c=JSON.parse(app.db.prepare("SELECT config FROM rooms WHERE code=?").get(room.code).config);
    const answers=perfect(c);
    const minMs=minimumAttemptMs(c,answers);
    if(minMs>0) assert.equal((await call("/v1/rooms/"+room.code+"/finish",a.token,{answers,gameIndex})).status,400,"resultado antes do tempo mínimo é rejeitado");
    now+=Math.ceil(minMs)+500;
    const first=await call("/v1/rooms/"+room.code+"/finish",a.token,{answers,gameIndex});
    assert.equal(first.status,200);
    assert.equal(first.data.members.find(m=>m.id===a.profile.id).score,1000);
    assert.ok(first.data.members.find(m=>m.id===a.profile.id).details.length);
    const rival=await call("/v1/rooms/"+room.code,b.token);
    assert.deepEqual(rival.data.members.find(m=>m.id===a.profile.id).details,[]);
    const replay=await call("/v1/rooms/"+room.code+"/finish",a.token,{answers:[],gameIndex});
    assert.equal(replay.data.members.find(m=>m.id===a.profile.id).score,1000);
    now+=100;
    const final=await call("/v1/rooms/"+room.code+"/finish",b.token,{answers:[],gameIndex});
    assert.equal(final.status,200);
    if(mode==="memory"&&gameIndex===0){
      assert.equal(final.data.state,"intermission");
      assert.equal(final.data.gameIndex,1);
      assert.equal((await call("/v1/rooms/"+room.code+"/finish",a.token,{answers,gameIndex})).status,409);
    }else{
      assert.equal(final.data.state,"finished");
      assert.equal(final.data.members[0].id,a.profile.id);
      assert.ok(final.data.members[0].details.length);
    }
   }
   const rematch=await call("/v1/rooms/"+room.code+"/rematch",a.token,{});
   assert.equal(rematch.data.mode,mode);assert.equal(rematch.data.difficulty,13);
  }
  // Agregado (sem ?mode=) somando os 4 jogos testados: timer(1)+reflex(1)+aim(1)+memory(2 provas do MD3).
  const stats=(await call("/v1/rooms/stats",a.token)).data;
  assert.equal(stats.played,5);assert.equal(stats.wins,5);assert.equal(stats.level,3);
  // Por jogo (?mode=): cada um isolado, não soma com os outros.
  const aimStats=(await call("/v1/rooms/stats?mode=aim",a.token)).data;
  assert.equal(aimStats.played,1);assert.equal(aimStats.wins,1);
  const ranking=(await call("/v1/rooms/leaderboard",a.token)).data;
  assert.deepEqual(ranking,[],"jogos casuais não alteram classificação");
  const search=(await call("/v1/rooms/random",a.token,{mode:"timer",difficulty:7})).data;
  const match=(await call("/v1/rooms/random",b.token,{mode:"timer",difficulty:7})).data;
  assert.equal(match.code,search.code);assert.equal(match.difficulty,7);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
