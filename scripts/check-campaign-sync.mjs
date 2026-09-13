import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createApp} from '../server/server.mjs';
const app=createApp(':memory:');await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const user=await (await fetch(base+'/v1/guests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'CloudTest'})})).json();
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(({token})=>{sessionStorage.setItem('duelou.session.v1',token);localStorage.setItem('duelou.campaign.v2.math',JSON.stringify({unlocked:2,best:{1:800}}));},user);
 await page.route('**:3001/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:base+u.pathname+u.search})});});
 await page.goto('http://localhost:8083');
 const open=async()=>{await page.getByRole('button',{name:'Arena',exact:true}).click();await page.getByRole('button',{name:'Conta rápida',exact:true}).click();};
 await open();await page.getByRole('button',{name:'Ativar sincronização',exact:true}).click();
 await page.getByText('Campanha sincronizada com sua conta.',{exact:true}).waitFor();
 const row=app.db.prepare("SELECT * FROM campaign_progress WHERE player=? AND mode='math'").get(user.profile.id);assert.equal(row.unlocked,2);assert.equal(JSON.parse(row.best)[1],800);
 await page.reload();await open();await page.getByText('Campanha sincronizada com sua conta.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Desativar sincronização',exact:true}).click();await page.getByText('Sincronização desativada. A cópia na conta foi mantida.',{exact:true}).waitFor();
 assert.equal((await (await fetch(base+'/v1/me',{headers:{Authorization:'Bearer '+user.token}})).json()).xp,0);
 console.log('PASS: opt-in, importacao local, persistencia apos reload e desativacao sem XP.');
}finally{await browser.close();await new Promise(r=>app.server.close(r));app.db.close();}
