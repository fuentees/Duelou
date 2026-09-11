import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel:'msedge',headless:true});
const users = [];
try {
  for (const name of ['Host','Guest']) {
    const response = await fetch('http://127.0.0.1:3001/v1/guests', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name+Date.now().toString().slice(-6)})});
    const user = await response.json();
    users.push(user);
    user.context = await browser.newContext({viewport:{width:390,height:844}});
    await user.context.addInitScript(token => sessionStorage.setItem('duelou.session.v1',token),user.token);
    user.page = await user.context.newPage();
    await user.page.goto('http://localhost:8083');
    await user.page.getByRole('button',{name:'Jogos clássicos, perfil e conquistas',exact:true}).click();
    await user.page.getByText('CONECTADO AO SERVIDOR',{exact:true}).waitFor();
  }
  const response = await fetch('http://127.0.0.1:3001/v1/duels',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+users[0].token},body:JSON.stringify({game:'timer',difficulty:1})});
  const room = await response.json();
  await users[1].page.getByLabel('Código do duelo').fill(room.code);
  await users[1].page.getByRole('button',{name:'Entrar na sala',exact:true}).click();
  await users[0].page.getByText(users[1].profile.name+' · online',{exact:true}).waitFor({timeout:15000});
  assert.equal(await users[0].page.getByRole('button',{name:'Jogar tentativa',exact:true}).isEnabled(),true);
  await users[0].page.screenshot({path:'work/online-room.png',fullPage:true});
  console.log('PASS: duas sessões independentes, entrada na sala, presença automática e liberação da tentativa.');
} finally {
  for(const user of users) await fetch('http://127.0.0.1:3001/v1/me',{method:'DELETE',headers:{Authorization:'Bearer '+user.token}});
  await browser.close();
}
