
const fs = require('fs'), vm = require('vm');
let src = fs.readFileSync(process.argv[2], 'utf8');
// LuCI 的 'require xxx'; 是加载器语法，这里换成等价赋值
src = src.replace(/^'require ([a-z.]+)';$/gm, "var $1 = require('$1');");
const opts = [];
function opt(cls, name, title) { const o = { cls, name, title, props: {} }; opts.push(o); return o; }
const form = {
  Map: function (c, t, d) {
    return { config: c, title: t,
      section(cls, ...a) {
        return { cls, args: a, tabs: [],
          tab(n) { this.tabs.push(n); },
          taboption(tb, cls2, n, ti) { const o = opt(cls2, n, ti); o.tab = tb; return o; },
          option(cls2, n, ti) { return opt(cls2, n, ti); } };
      },
      render() { return Promise.resolve('ok'); } };
  },
  NamedSection: 'NamedSection', Value: 'Value', DynamicList: 'DynamicList',
  Flag: 'Flag', Button: 'Button', DummyValue: 'DummyValue'
};
const mods = {
  view: { extend: o => o }, form,
  fs: { exec: () => Promise.resolve({ code: 0, stdout: '', stderr: '' }),
       read: () => Promise.resolve(''), write: () => Promise.resolve() },
  rpc: { declare: () => () => Promise.resolve({}) },
  ui: { addNotification() {} }, poll: { add() {} }
};
const ctx = { console, Promise, Object, Array, String, RegExp, Error, Number, JSON, setTimeout: (fn) => { fn(); return 0; },
  document: { getElementById: () => null },
  E: (t, a, c) => ({ t, a, c }), require: n => mods[n] || {} };
vm.createContext(ctx);
vm.runInContext('var __ret = (function(){' + src + '})();', ctx);
const v = ctx.__ret;
Promise.resolve(v.render({ cns: { instances: { main: { running: true } } } })).then(function(out) {
	console.log('render 返回:', JSON.stringify(out).slice(0, 120));
	console.log('字段数:', opts.length);
	for (const o of opts) console.log('  [' + (o.tab || '-') + ']', o.cls, o.name, '=', o.title);
});
