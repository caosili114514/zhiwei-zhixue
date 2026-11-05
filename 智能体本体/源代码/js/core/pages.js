/* ============================================================
   知微·智学 · 页面注册表（必须早于页面脚本加载）
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var pages = {};

  ZWZ.pages = {
    register: function (key, def) {
      if (!key || !def) return null;
      pages[key] = def;
      return def;
    },
    get: function (key) { return pages[key] || null; },
    keys: function () { return Object.keys(pages); },
    has: function (key) { return !!pages[key]; }
  };
})();
