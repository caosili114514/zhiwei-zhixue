/* ============================================================
   知微·智学 · HTML 模板与格式化工具
   经典 script，挂载到 window.ZWZ
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});

  var ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
  };

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"'`]/g, function (ch) {
      return ESCAPE_MAP[ch];
    });
  }

  var RAW = '__zwz_raw__';

  function raw(value) {
    return { __zwzRaw: RAW, value: value === null || value === undefined ? '' : String(value) };
  }

  function isRaw(value) {
    return !!value && typeof value === 'object' && value.__zwzRaw === RAW;
  }

  function renderValue(value) {
    if (value === null || value === undefined || value === false) return '';
    if (Array.isArray(value)) {
      var out = '';
      for (var i = 0; i < value.length; i++) out += renderValue(value[i]);
      return out;
    }
    if (isRaw(value)) return value.value;
    return esc(value);
  }

  function html(strings) {
    var out = '';
    if (!strings || !strings.raw) {
      // 允许 html(str) 调用
      return renderValue(strings);
    }
    for (var i = 0; i < strings.length; i++) {
      out += strings[i];
      if (i + 1 < arguments.length) out += renderValue(arguments[i + 1]);
    }
    return raw(out);
  }

  /* ---------------- 格式化 ---------------- */
  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  var fmt = {
    date: function (value) {
      var d = toDate(value);
      if (!d) return '—';
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    },
    shortDate: function (value) {
      var d = toDate(value);
      if (!d) return '—';
      return d.getMonth() + 1 + '月' + d.getDate() + '日';
    },
    time: function (value) {
      var d = toDate(value);
      if (!d) return '—';
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    },
    datetime: function (value) {
      var d = toDate(value);
      if (!d) return '—';
      return fmt.date(d) + ' ' + fmt.time(d);
    },
    rel: function (value) {
      var d = toDate(value);
      if (!d) return '—';
      var diff = (Date.now() - d.getTime()) / 1000;
      var future = diff < 0;
      diff = Math.abs(diff);
      var text;
      if (diff < 60) text = '刚刚';
      else if (diff < 3600) text = Math.floor(diff / 60) + ' 分钟';
      else if (diff < 86400) text = Math.floor(diff / 3600) + ' 小时';
      else if (diff < 86400 * 30) text = Math.floor(diff / 86400) + ' 天';
      else text = fmt.date(d);
      if (text === '刚刚') return text;
      return future ? text + '后' : text + '前';
    },
    pct: function (value, digits) {
      if (value === null || value === undefined || isNaN(value)) return '—';
      var d = typeof digits === 'number' ? digits : 0;
      return (Number(value) * 100).toFixed(d) + '%';
    },
    num: function (value) {
      if (value === null || value === undefined || isNaN(value)) return '—';
      return Number(value).toLocaleString('zh-CN');
    },
    fixed: function (value, digits) {
      if (value === null || value === undefined || isNaN(value)) return '—';
      return Number(value).toFixed(typeof digits === 'number' ? digits : 1);
    },
    duration: function (sec) {
      if (!sec && sec !== 0) return '—';
      var s = Math.round(Number(sec));
      if (s < 60) return s + ' 秒';
      var m = Math.floor(s / 60);
      var rest = s % 60;
      if (m < 60) return rest ? m + ' 分 ' + rest + ' 秒' : m + ' 分钟';
      var h = Math.floor(m / 60);
      return h + ' 小时 ' + (m % 60) + ' 分';
    },
    trunc: function (str, n) {
      if (!str) return '';
      var s = String(str);
      return s.length > n ? s.slice(0, n) + '…' : s;
    },
    weekday: function (value) {
      var d = toDate(value);
      if (!d) return '—';
      return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    }
  };

  /* ---------------- 杂项 ---------------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function sum(arr, pick) {
    var total = 0;
    for (var i = 0; i < arr.length; i++) total += Number(pick ? pick(arr[i]) : arr[i]) || 0;
    return total;
  }

  function groupBy(arr, pick) {
    var out = {};
    for (var i = 0; i < arr.length; i++) {
      var key = pick(arr[i]);
      if (!out[key]) out[key] = [];
      out[key].push(arr[i]);
    }
    return out;
  }

  function unique(arr) {
    return arr.filter(function (item, idx) {
      return arr.indexOf(item) === idx;
    });
  }

  function byKey(arr, key, value) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i][key] === value) return arr[i];
    }
    return null;
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait || 200);
    };
  }

  /** 取姓名首字（中文取 1 字，英文取首字母） */
  function initials(name) {
    if (!name) return '?';
    var trimmed = String(name).trim();
    if (/^[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 1);
    return trimmed.slice(0, 1).toUpperCase();
  }

  var AVATAR_COLORS = [
    '#365CF5', '#20B8A5', '#7C6CF0', '#F0A43A', '#E56B6F',
    '#2F80ED', '#16A085', '#8E6FE8', '#D9822B', '#4C6EF5'
  ];

  function colorFrom(seed) {
    var str = String(seed || 'x');
    var hash = 0;
    for (var i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % 9973;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  ZWZ.html = html;
  ZWZ.raw = raw;
  ZWZ.esc = esc;
  ZWZ.isRaw = isRaw;
  ZWZ.fmt = fmt;
  ZWZ.util = {
    uid: uid,
    clamp: clamp,
    sum: sum,
    groupBy: groupBy,
    unique: unique,
    byKey: byKey,
    debounce: debounce,
    initials: initials,
    colorFrom: colorFrom,
    toDate: toDate,
    pad: pad
  };
  window.html = html;
  window.raw = raw;
})();
