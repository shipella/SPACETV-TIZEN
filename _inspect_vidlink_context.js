const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('E:/androidOps/exports/SPACETV/_vidlink_script.js','utf8');
const context = {
  console,
  window: {},
  self: {},
  globalThis: {},
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  performance: { now: ()=>Date.now() },
};
context.window = context;
context.self = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(code, context);
console.log(Object.keys(context).filter(k => /Dm|getAdv|Go|sodium/i.test(k)).join(','));
console.log('Dm type', typeof context.Dm);
console.log('getAdv type', typeof context.getAdv);
