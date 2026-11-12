// Run from the repository root after installing pinned tools in a temporary directory.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
const toolsDir=process.env.PARKING_AUDIT_TOOLS;
if(!toolsDir) throw new Error("Set PARKING_AUDIT_TOOLS to the temporary audit tools directory.");
const fromTools=p=>pathToFileURL(path.join(toolsDir,"node_modules",p)).href;
const { chromium }=await import(fromTools("playwright/index.mjs"));
const { default:lighthouse }=await import(fromTools("lighthouse/core/index.js"));
const chromeLauncher=await import(fromTools("chrome-launcher/dist/index.js"));
await mkdir("artifacts/lot-rules",{recursive:true});
const base="http://127.0.0.1:8765/tests/manual/lot-rules.html";
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:["--no-sandbox"]});
try {
  for(const width of [320,390,768,1440]) for(const theme of ["light","dark"]) {
    const page=await browser.newPage({viewport:{width,height:1000}});
    const errors=[];
    page.on("pageerror",err=>errors.push(err.message));
    await page.goto(base+"?theme="+theme);
    await page.getByRole("heading",{name:"24-hour parking rules"}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}px ${theme}`);
    assert.equal(await page.locator(".day-period").count(),5);
    const originalStatus=await page.locator(".detail-status").innerText();
    await page.getByLabel("Day",{exact:true}).selectOption("6");
    assert.equal(await page.locator(".day-period").count(),3);
    assert.equal(await page.locator(".detail-status").innerText(),originalStatus);
    assert.equal(await page.locator("#rules-day").evaluate(el=>el===document.activeElement),true);
    await page.getByLabel("Day",{exact:true}).selectOption("1");
    await page.getByText("Sources and verification",{exact:true}).click();
    assert.equal(await page.locator(".detail-source-disclosure").first().evaluate(el=>el.open),true);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`artifacts/lot-rules/${width}-${theme}.png`,fullPage:true});
    await page.close();
  }
} finally {await browser.close();}
const scores=[];
for(const form of ["mobile","desktop"]) for(const theme of ["light","dark"]) {
  const chrome=await chromeLauncher.launch({chromePath:process.env.CHROME_PATH,chromeFlags:["--headless","--no-sandbox"]});
  try {
    const options={port:chrome.port,output:"html",logLevel:"error",onlyCategories:["performance","accessibility","best-practices","seo"]};
    const settings=form==="desktop"?{extends:"lighthouse:default",settings:{formFactor:"desktop",screenEmulation:{mobile:false,width:1440,height:1000,deviceScaleFactor:1,disabled:false}}}:undefined;
    const result=await lighthouse(base+"?theme="+theme,options,settings);
    if(result.lhr.runtimeError) throw new Error(result.lhr.runtimeError.message);
    await writeFile(`artifacts/lot-rules/lighthouse-${form}-${theme}.html`,result.report);
    await writeFile(`artifacts/lot-rules/lighthouse-${form}-${theme}.json`,JSON.stringify(result.lhr,null,2));
    const categories=Object.fromEntries(Object.entries(result.lhr.categories).map(([k,v])=>[k,Math.round(v.score*100)]));
    scores.push({form,theme,...categories});
    for(const [category,score]of Object.entries(categories)) {
      if(score!==100) console.error(`${form} ${theme}: ${category} = ${score}; inspect the uploaded report.`);
    }
  } finally {await chrome.kill();}
}
await writeFile("artifacts/lot-rules/scores.json",JSON.stringify(scores,null,2));
console.table(scores);
assert.ok(scores.every(s=>["performance","accessibility","best-practices","seo"].every(k=>s[k]===100)),"The isolated lot-details preview must score 100 in each category; this does not audit the authenticated full app.");
