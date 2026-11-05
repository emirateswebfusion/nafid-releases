/** Start Vite on port 5185, then launch this isolated renderer acceptance workspace. */
const {app,BrowserWindow}=require('electron');
const path=require('node:path');
app.name='Nafid release UI test';
app.setPath('userData',process.env.NAFID_UI_TEST_DATA || path.join(require('node:os').tmpdir(),'nafid-release-ui-2244'));
app.whenReady().then(async()=>{const win=new BrowserWindow({width:1280,height:900,title:'Nafid v2.2.44 checks',webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await win.loadURL('http://127.0.0.1:5185/tests/fixtures/releaseWorkspace.html');
if(process.env.NAFID_RELEASE_UI_AUTOTEST){
const assert=require('node:assert/strict');const fs=require('node:fs');
const out=path.resolve(process.env.NAFID_RELEASE_UI_AUTOTEST);fs.mkdirSync(out,{recursive:true});
const evalJs=code=>win.webContents.executeJavaScript(code);
const capture=async()=>{try{return (await win.webContents.capturePage()).toPNG();}catch{await new Promise(r=>setTimeout(r,250));return (await win.webContents.capturePage()).toPNG();}};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const click=async text=>{await evalJs(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);await wait(700);};
try {
 await wait(1200);assert.ok(await evalJs("document.body.innerText.includes('Mohammed - Admin')"));
 fs.writeFileSync(path.join(out,'pin.png'),await capture());
 await click('Pricing');await click('Add Tier');
 await evalJs(`(()=>{const el=document.querySelector('input[placeholder^="Tier Name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Wholesale');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await wait(700);await click('Save');assert.ok(await evalJs("document.body.innerText.toLowerCase().includes('wholesale')"));
 fs.writeFileSync(path.join(out,'tier.png'),await capture());
 await click('Salary');await click('Add ₹6,500.00');
 assert.ok(await evalJs("document.body.innerText.toLowerCase().includes('salary entry')"));
 await evalJs("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Add salary of'))?.click()");await wait(200);
 assert.ok(await evalJs("document.body.innerText.toLowerCase().includes('added for')"));
 fs.writeFileSync(path.join(out,'salary.png'),await capture());
 await click('Attendance');await click('Present');
 assert.ok(await evalJs("document.body.innerText.toLowerCase().includes('present')"));
 fs.writeFileSync(path.join(out,'attendance.png'),await capture());
 await click('Ledger');assert.ok(await evalJs("document.body.innerText.includes('SALARY_ACCRUAL')"));
 fs.writeFileSync(path.join(out,'ledger.png'),await capture());
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({pin:true,inlineTier:true,salaryAccrual:true,attendance:true,ledger:true}));console.log('Release UI checks passed');app.quit();
}catch(error){console.error(error);fs.writeFileSync(path.join(out,'error.txt'),String(error.stack||error));fs.writeFileSync(path.join(out,'body.txt'),await evalJs('document.body.innerText'));fs.writeFileSync(path.join(out,'failure.png'),await capture());app.exit(1);}
}
});
app.on('window-all-closed',()=>app.quit());
