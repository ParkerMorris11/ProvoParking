import assert from "node:assert/strict";
import{mkdir}from"node:fs/promises";
import{pathToFileURL}from"node:url";
const{chromium}=await import(pathToFileURL(process.env.PARKING_BROWSER_TOOLS+"/node_modules/playwright/index.mjs").href);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:["--no-sandbox"]});
await mkdir("artifacts/account-timer",{recursive:true});
try{
 for(const width of[390,1440])for(const theme of["light","dark"]){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const url="http://127.0.0.1:8765/tests/manual/account-timer.html";
  await page.goto(url);await page.getByRole("link",{name:"Park here",exact:true}).click();
  await page.getByRole("button",{name:"Start timer",exact:true}).waitFor();
  await page.getByLabel("Where are you parking?").selectOption("1");
  assert.ok((await page.locator("#car-warning").innerText()).includes("does not cover"));
  await page.getByRole("button",{name:"Start timer",exact:true}).click();
  await page.getByRole("button",{name:"I left — end timer",exact:true}).waitFor();
  const deadline=await page.evaluate(()=>JSON.parse(localStorage.getItem("fixture.accountTimer")).leave_by);
  assert.equal(await page.locator("#app-header").evaluate(el=>el.inert),true);
  await page.getByRole("button",{name:"Close parking timer",exact:true}).click();
  await page.getByRole("link",{name:"Help",exact:true}).click();
  await page.getByRole("heading",{name:"Help",exact:true}).waitFor();
  assert.ok(await page.locator("#car-fab-time").isVisible());
  await page.reload();
  await page.locator("#car-fab.running").waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("fixture.accountTimer")).leave_by),deadline);
  await page.locator("#car-fab").click();
  await page.locator("#car-active").waitFor();
  await page.getByRole("button",{name:"Close parking timer",exact:true}).focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.getByRole("button",{name:"I left — end timer",exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole("button",{name:"Close parking timer",exact:true}).click();
  const other=await context.newPage();await other.goto(url+"#car");
  await other.getByRole("button",{name:"I left — end timer",exact:true}).waitFor();
  await other.getByRole("button",{name:"I left — end timer",exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await page.locator("#car-fab:not(.running)").waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`artifacts/account-timer/${width}-${theme}.png`,fullPage:true});
  await context.close();
 }
}finally{await browser.close();}
