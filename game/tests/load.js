// Loads the browser-style game modules into Node for headless tests.
const vm = require('vm'), fs = require('fs'), path = require('path');
global.WF = {};
const dir = path.join(__dirname, '..', 'js');
for (const f of ['util', 'data', 'map', 'sim_core', 'sim_units', 'ai', 'campaign']) {
  const p = path.join(dir, f + '.js');
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
module.exports = global.WF;
