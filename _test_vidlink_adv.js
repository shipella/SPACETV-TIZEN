const fs = require('fs');
const path = 'E:/androidOps/exports/SPACETV/_vidlink_script.js';
const wasmPath = 'E:/androidOps/exports/SPACETV/_vidlink_fu.wasm';
const sodium = require('E:/androidOps/exports/SPACETV/_libsodium_wrappers.js');
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.global = globalThis;
globalThis.document = {
  createElement() { return { set src(v){ this._src=v; if (typeof this.onload === 'function') setTimeout(()=>this.onload(),0); }, get src(){ return this._src; }, onload:null, appendChild(){}, setAttribute(){}, style:{}, removeChild(){} }; },
  body: { appendChild(){}, removeChild(){} },
  head: { appendChild(){} }
};
globalThis.navigator = { plugins: { namedItem(){ return true; } } };
globalThis.fetch = async function(url){
  if (String(url).includes('/fu.wasm')) {
    return { arrayBuffer: async ()=>fs.readFileSync(wasmPath) };
  }
  throw new Error('unexpected fetch ' + url);
};
const code = fs.readFileSync(path, 'utf8');
eval(code);
(async ()=>{
  try {
    await sodium.ready;
    globalThis.sodium = sodium;
    const go = new Dm();
    const bytes = fs.readFileSync(wasmPath);
    const result = await WebAssembly.instantiate(bytes, go.importObject);
    go.run(result.instance);
    setTimeout(()=>{
      try {
        console.log('getAdv type', typeof globalThis.getAdv);
        if (typeof globalThis.getAdv === 'function') {
          console.log('786892 ->', globalThis.getAdv('786892'));
          console.log('94997 ->', globalThis.getAdv('94997'));
          console.log('550 ->', globalThis.getAdv('550'));
        }
      } catch (err) {
        console.error(String(err && err.stack || err));
      }
      process.exit(0);
    }, 1000);
  } catch (error) {
    console.error(String(error && error.stack || error));
    process.exit(1);
  }
})();
