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
  // "Park here" preselects the lot; change it through the search box to exercise the picker.
  assert.equal(await page.locator("#car-picked-name").innerText(),"Lot 20 Stadium section A");
  await page.getByRole("button",{name:"Change",exact:true}).click();
  await page.getByRole("combobox",{name:"Where did you park?"}).fill("20");
  await page.getByRole("option",{name:/Lot 20 Stadium section A/}).click();
  assert.equal(await page.locator("#car-area").inputValue(),"1");
  // Hour and minute wheels: 2 hr 00 min by default, arrow keys change the total.
  assert.equal(await page.locator("#car-minutes").inputValue(),"120");
  await page.getByRole("spinbutton",{name:"Minutes"}).press("ArrowDown");
  assert.ok(Number(await page.locator("#car-minutes").inputValue())>120);
  assert.ok((await page.locator("#car-warning").innerText()).includes("does not cover"));
  await page.getByRole("button",{name:"Start timer",exact:true}).click();
  await page.getByRole("button",{name:"End timer",exact:true}).waitFor();
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
  // Shift+Tab from the first control wraps to the last one in the sheet (the note toggle under End timer).
  assert.equal(await page.evaluate(()=>document.activeElement?.matches("#car-active details.car-note > summary")),true);
  await page.getByRole("button",{name:"Close parking timer",exact:true}).click();
  await page.screenshot({path:`artifacts/account-timer/${width}-${theme}-active.png`,fullPage:true});
  const other=await context.newPage();other.on("pageerror",e=>errors.push(e.message));
  other.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await other.goto(url+"#car");
  await other.getByRole("button",{name:"End timer",exact:true}).waitFor();
  await other.getByRole("button",{name:"End timer",exact:true}).click();
  await other.getByRole("button",{name:"Start timer",exact:true}).waitFor();
  assert.ok((await other.locator("#car-action-status").innerText()).startsWith("Timer ended."));
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  // With no timer the pill hides itself (the idle car button stays off the map).
  await page.locator("#car-fab").waitFor({state:"hidden"});
  assert.equal(await page.locator("#car-fab.running").count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`artifacts/account-timer/${width}-${theme}.png`,fullPage:true});
  await context.close();
 }
}finally{await browser.close();}
