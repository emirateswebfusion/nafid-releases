/** Minimal `electron` stand-in for running the main process under plain Node (records ipcMain.handle registrations). */
const os=require('os'),path=require('path'),fs=require('fs');
const dir=process.env.EQ_USERDATA||path.join(os.tmpdir(),'nafid-stmt-'+process.pid);fs.mkdirSync(dir,{recursive:true});
const noop=()=>{};
globalThis.__handlers=globalThis.__handlers||new Map();
const ipcMain={handle:(ch,fn)=>globalThis.__handlers.set(ch,fn),on:noop,removeHandler:(ch)=>globalThis.__handlers.delete(ch),handleOnce:noop};
class BW{static getAllWindows(){return[]} static getFocusedWindow(){return null} static fromWebContents(){return null}}
module.exports={app:{getPath:()=>dir,isPackaged:false,getVersion:()=>'0.0.0',getName:()=>'nafid',on:noop,whenReady:()=>Promise.resolve(),quit:noop,relaunch:noop,exit:noop,getAppPath:()=>dir},ipcMain,BrowserWindow:BW,safeStorage:{isEncryptionAvailable:()=>false,encryptString:(s)=>Buffer.from(s),decryptString:(b)=>b.toString()},shell:{openExternal:noop},dialog:{showSaveDialog:async()=>({canceled:true}),showOpenDialog:async()=>({canceled:true})},Notification:class{show(){}},webContents:{getAllWebContents:()=>[]},net:{},session:{},screen:{},nativeImage:{createFromPath:()=>({})},Menu:{setApplicationMenu:noop,buildFromTemplate:()=>({})},Tray:class{},powerMonitor:{on:noop}};
