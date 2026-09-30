import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('local-artifacts', {recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.route('**/chrome-check',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="host" style="width:100vw;height:100vh"></div></body>'}));
 await page.goto('http://localhost:5173/chrome-check');
 const report=await page.evaluate(async()=>{
  const {Engine}=await import('/src/game/engine.ts');
  const e=new Engine(document.querySelector('#host'),()=>{},()=>{},{quality:'balanced',sensitivity:1,sound:false});
  e.sim.reset();e.sim.phase='playing';e.sim.remaining=1;e.sim.spawnCooldown=1000;e.sim.invulnerable=100;
  for(let i=0;i<24;i++)Object.assign(e.sim.enemies[i],{active:true,kind:i%2,x:(i%6-2.5)*3,z:-Math.floor(i/6)*3,hp:6});
  await new Promise(r=>setTimeout(r,20000));
  const report=e.performanceReport();e.dispose();return report;
 });
 await writeFile('local-artifacts/chrome-gameplay-report.json',report);console.log(report);
 await page.close();
 const ui=await browser.newPage();
 await ui.goto('http://localhost:5173');
 await ui.getByRole('button',{name:'Open settings',exact:true}).click();
 await ui.getByRole('button',{name:'Copy performance report'}).click();
 await ui.getByRole('status').filter({hasText:/Copied|Select and copy/}).waitFor();
 console.log('Report button feedback passed.');
}finally{await browser.close();}

