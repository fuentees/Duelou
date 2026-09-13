import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
import {createApp} from "../server/server.mjs";
const app=createApp(":memory:");
await new Promise(r=>app.server.listen(0,"127.0.0.1",r));
const base="http://127.0.0.1:"+app.server.address().port;
const browser=await chromium.launch({channel:"msedge",headless:true});
const errors=[];
const call=async(path,token,body)=>{const r=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();};
// Escolher o jogo leva direto pra "como jogar" — nível só se pergunta depois,
// e só pra quem for jogar sozinho ou abrir sala por convite (multijogador
// público sempre usa o nível atual, pra pareamento não exigir nível igual).
const chooseGame=async(page,name)=>{
 await page.getByRole("button",{name:"Arena",exact:true}).click();
 await page.getByRole("button",{name,exact:true}).click();
 await page.getByText("Como você quer jogar?",{exact:true}).waitFor();
};
const playSolo=async(page,name,level=1)=>{
 await chooseGame(page,name);
 await page.getByRole("button",{name:"Jogar sozinho",exact:true}).click();
 await page.getByText("Sua campanha",{exact:true}).waitFor();
 await page.getByRole("button",{name:"Nível "+level,exact:true}).click();
 await page.getByRole("button",{name:"Continuar",exact:true}).click();
 await page.getByRole("button",{name:"Começar fase",exact:true}).click();
};
try {
 const users=[];
 for(let i=0;i<2;i++){
  const u=await call("/v1/guests",null,{name:"Unificado"+i});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**:3001/**",async route=>{
   const original=new URL(route.request().url());
   const response=await route.fetch({url:base+original.pathname+original.search});
   await route.fulfill({response});
  });
  await page.addInitScript(t=>sessionStorage.setItem("duelou.session.v1",t),u.token);
  await page.goto("http://localhost:8083");
  await page.getByRole("button",{name:"Jogar",exact:true}).waitFor();
  users.push({...u,page});
 }
 const host=users[0].page,rival=users[1].page;
 await host.getByRole("button",{name:"Menu",exact:true}).click();
 await host.getByRole("button",{name:"Como jogar",exact:true}).click();
 await host.getByText("Sempre o mesmo caminho",{exact:true}).waitFor();
 await host.screenshot({path:"work/menu-unificado.png"});
 // A mesma sequência de catálogo e "como jogar" para os nove jogos.
 for(const name of ["Conta rápida","Menor ou maior?","Fora do padrão","Sequência lógica","Cor certa","Tempo certo","Reflexo relâmpago","Mira certeira","Memória turbo"])
   await chooseGame(host,name);
 await chooseGame(host,"Tempo certo");
 await host.getByRole("button",{name:"Multijogador",exact:true}).click();
 await host.getByRole("button",{name:"Criar sala",exact:true}).click();
 await host.getByRole("button",{name:"Só por convite",exact:true}).click();
 // Sala privada ainda escolhe nível — não afeta pareamento público.
 await host.getByRole("button",{name:"Nível 1",exact:true}).click();
 await host.getByRole("button",{name:"2 pessoas",exact:true}).click();
 const created=host.waitForResponse(r=>r.url().endsWith("/v1/rooms")&&r.request().method()==="POST");
 await host.getByRole("button",{name:"Criar e entrar",exact:true}).click();
 const room=await (await created).json();
 await chooseGame(rival,"Tempo certo");
 await rival.getByRole("button",{name:"Multijogador",exact:true}).click();
 await rival.getByRole("button",{name:"Entrar em uma sala",exact:true}).click();
 await rival.getByLabel("Código da sala",{exact:true}).fill(room.code);
 await rival.getByRole("button",{name:"Entrar pelo código",exact:true}).click();
 await host.getByRole("button",{name:"Começar partida",exact:true}).click();
 await host.getByRole("button",{name:"Iniciar relógio",exact:true}).waitFor({timeout:15000});
 const live=await call("/v1/rooms/"+room.code,users[0].token);
 const target=live.config.rounds[0].targetMs;
 await Promise.all([host,rival].map(async page=>{
  await page.getByRole("button",{name:"Iniciar relógio",exact:true}).click();
  await page.waitForTimeout(target-40);
  await page.getByRole("button",{name:"Parar relógio",exact:true}).click();
 }));
 await host.getByText("PLACAR FINAL",{exact:true}).waitFor({timeout:15000});
 await host.getByText(/^Seu tempo:/).waitFor();
 await host.getByText(/^Diferença:/).waitFor();
 await host.screenshot({path:"work/tempo-placar-online.png"});
 const final=await call("/v1/rooms/"+room.code,users[0].token);
 assert.equal(final.state,"finished");
 assert.ok(final.members.every(m=>m.score>500));
 assert.ok(final.members.every(m=>m.details.length===3));
 const continued=host.waitForResponse(r=>r.url().endsWith("/continue")&&r.request().method()==="POST");
 await host.getByRole("button",{name:"Continuar",exact:true}).click();
 const nextRoom=await (await continued).json();
 assert.equal(nextRoom.difficulty,2);
 await rival.getByRole("button",{name:"Aceitar continuação",exact:true}).waitFor({timeout:15000});
 await rival.getByRole("button",{name:"Agora não",exact:true}).click();
 await rival.getByRole("button",{name:"Reabrir convite",exact:true}).click();
 await rival.getByText("SALA "+nextRoom.code,{exact:true}).waitFor();
 await host.getByRole("button",{name:"Começar partida",exact:true}).waitFor().catch(async e=>{console.log("CONTINUATION UI",await host.locator("body").innerText());console.log("ROOM",await call("/v1/rooms/"+nextRoom.code,users[0].token));throw e;});
 await host.screenshot({path:"work/continuar-nivel-2.png"});
 await rival.getByRole("button",{name:"Sair da sala",exact:true}).click();
 await host.getByRole("button",{name:"Sair da sala",exact:true}).click();
 await playSolo(host,"Reflexo relâmpago",1);
 for(let i=0;i<3;i++){
  await host.getByRole("button",{name:"Iniciar tentativa",exact:true}).click();
  await host.getByRole("button",{name:"Agora",exact:true}).waitFor({timeout:5000});
  await host.getByRole("button",{name:"Agora",exact:true}).click();
 }
 await host.getByText("PARTIDA OFFLINE CONCLUÍDA",{exact:true}).waitFor();
 await host.getByText(/^Tentativa 1:/).waitFor();
 await playSolo(host,"Mira certeira",1);
 // Nível 1: alvos nascem um (às vezes dois) de cada vez, ao longo de ~30s —
 // fica escutando e tocando cada um assim que aparece, até a prova acabar.
 await host.getByRole("button",{name:"Começar",exact:true}).click();
 while(!(await host.getByText("PARTIDA OFFLINE CONCLUÍDA",{exact:true}).count())){
  const alvo=host.getByRole("button",{name:"Alvo",exact:true}).first();
  if(await alvo.count()) await alvo.click().catch(()=>{});
  else await host.waitForTimeout(30);
 }
 await host.getByText(/de \d+ alvos tocados/).waitFor();
 await playSolo(host,"Memória turbo",1);
 await host.getByRole("button",{name:"Mostrar sequência",exact:true}).click();
 await host.getByText("Sua vez",{exact:true}).waitFor();
 for(let i=0;i<4;i++){
  if(await host.getByText("PARTIDA OFFLINE CONCLUÍDA",{exact:true}).count()) break;
  await host.getByRole("button",{name:"Bloco 1",exact:true}).click();
 }
 await host.getByText("PARTIDA OFFLINE CONCLUÍDA",{exact:true}).waitFor();
 await host.getByText(/passos corretos/).waitFor();
 await host.getByRole("button",{name:"Ranking",exact:true}).click();
 await host.getByText("Jogue uma série na fila competitiva para aparecer aqui.",{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log("PASS: nove jogos com mesma ordem, Menu, cronômetro online com alvo/tempo/diferença, ranking, reflexo, mira certeira e memória offline.");
} finally {
 await browser.close();await new Promise(r=>app.server.close(r));app.db.close();
}
