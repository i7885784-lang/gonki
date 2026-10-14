import { chromium } from 'playwright';
const browser = await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Debugger.enable');
await cdp.send('Debugger.setPauseOnExceptions', {state:'all'});
cdp.on('Debugger.paused', async event => {
  console.log('EXCEPTION', event.data?.description, event.callFrames.slice(0,5).map(f=>({fn:f.functionName,url:f.url,line:f.location.lineNumber,column:f.location.columnNumber})));
  await cdp.send('Debugger.resume');
});
page.on('pageerror', e=>console.log('PAGEERROR',e.stack));
await page.goto('https://rally-together-rusli.wavy-seesaws9e.chatgpt.site');
await page.click('#create');
try {
 await page.waitForFunction(()=>document.querySelector('#invite-link')?.value, {timeout:30000});
 console.log('ROOM_CREATED');
} finally {
 console.log('HOME_ERROR',await page.locator('#home-error').textContent());
 await page.screenshot({path:'live-site.png'});
 await browser.close();
}
