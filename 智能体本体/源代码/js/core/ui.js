/* ============================================================
   知微·智学 · UI 组件库（图标 / 组件 / 浮层 / 提示）
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var html = ZWZ.html;
  var raw = ZWZ.raw;
  var esc = ZWZ.esc;
  var fmt = ZWZ.fmt;
  var util = ZWZ.util;

  /* ---------------- 图标（stroke 线性图标，24 网格） ---------------- */
  var PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    dashboard: '<rect x="3" y="3" width="7.5" height="8.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.6"/><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.6"/><rect x="3" y="14" width="7.5" height="7" rx="1.6"/>',
    upload: '<path d="M12 16V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    download: '<path d="M12 4v12"/><path d="m7.5 11.5 4.5 4.5 4.5-4.5"/><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>',
    check: '<path d="m4.5 12.5 5 5 10-11"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8L16.2 9"/>',
    alert: '<path d="M12 3.2 22 20H2z"/><path d="M12 9.5v4.5"/><path d="M12 17.2v.3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    users: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.6 3.6 0 0 1 0 6.9"/><path d="M18.2 20.5a6.5 6.5 0 0 0-2.6-5.2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.9 4.6h.07A1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.07a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    x: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
    chevronRight: '<path d="m9 5 7 7-7 7"/>',
    chevronLeft: '<path d="m15 5-7 7 7 7"/>',
    chevronDown: '<path d="m5 9 7 7 7-7"/>',
    arrowRight: '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
    arrowUp: '<path d="M12 20V4"/><path d="m6 10 6-6 6 6"/>',
    arrowDown: '<path d="M12 4v16"/><path d="m18 14-6 6-6-6"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    fileText: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 17v-4h1.2a1.3 1.3 0 0 1 0 2.6H8.5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17 4.6-4.6a2 2 0 0 1 2.8 0L20 19"/>',
    bot: '<rect x="4" y="7.5" width="16" height="12" rx="3"/><path d="M12 3.5v4"/><circle cx="9" cy="13" r="1.1"/><circle cx="15" cy="13" r="1.1"/><path d="M9.5 16.4h5"/>',
    spark: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 16.5 19 18l1.5.5L19 19l-.5 1.5L18 19l-1.5-.5L18 18z"/>',
    lightbulb: '<path d="M9.2 18h5.6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.6v.6h5.6v-.6c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>',
    edit: '<path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17z"/><path d="m14 6.5 3.5 3.5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12S18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    flag: '<path d="M5 21V3.5c4-1.5 7 1.5 14 0V15c-7 1.5-10-1.5-14 0"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3.5 12.5 8.5 4.7 8.5-4.7"/><path d="m3.5 17 8.5 4.7L20.5 17"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
    printer: '<path d="M7 8V3.5h10V8"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 16h10v4.5H7z"/>',
    shield: '<path d="M12 3 5 6v5c0 4.4 2.9 8.2 7 9.5 4.1-1.3 7-5.1 7-9.5V6z"/><path d="m9.2 12.2 2 2 3.6-3.8"/>',
    database: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
    message: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.7A8.5 8.5 0 1 1 20.5 12z"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="M9 10h6"/><path d="M9 14h4"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    bookmark: '<path d="M6 3.5h12v18l-6-4.2-6 4.2z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.6 2.3c-.7.4-1.2 1-1.2 1.8v.4"/><path d="M12 17.2v.3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    trend: '<path d="M3 17.5 9 11l4 4 7.5-8"/><path d="M15.5 7H21v5.5"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.4A9 9 0 0 1 20.6 9H15z"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3.5 6h.01"/><path d="M3.5 12h.01"/><path d="M3.5 18h.01"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    external: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    minimize: '<path d="M4 12h6"/><path d="M14 12h6"/><path d="m7 8-3 4 3 4"/><path d="m17 8 3 4-3 4"/>'
  };

  function icon(name, size, className) {
    var path = PATHS[name] || PATHS.info;
    var s = size || 18;
    return raw(
      '<svg class="' + (className || '') + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>'
    );
  }

  /* ---------------- 基础组件 ---------------- */
  function button(opts) {
    var o = opts || {};
    var cls = 'btn';
    var tone = o.tone || 'secondary';
    if (tone === 'primary') cls += ' btn-primary';
    else if (tone === 'secondary') cls += ' btn-secondary';
    else if (tone === 'ghost') cls += ' btn-ghost';
    else if (tone === 'quiet') cls += ' btn-quiet';
    else if (tone === 'teal') cls += ' btn-teal';
    else if (tone === 'danger') cls += ' btn-danger';
    if (o.size === 'sm') cls += ' btn-sm';
    if (o.size === 'lg') cls += ' btn-lg';
    if (o.size === 'icon') cls += ' btn-icon';
    if (o.block) cls += ' btn-block';
    if (o.className) cls += ' ' + o.className;
    var attrs = o.attrs ? ' ' + o.attrs : '';
    var label = o.label ? '<span>' + esc(o.label) + '</span>' : '';
    return html`<button type="${raw(o.type || 'button')}" class="${raw(cls)}"${raw(attrs)}>${o.icon ? icon(o.icon, o.iconSize || 16) : ''}${raw(label)}</button>`;
  }

  function card(opts) {
    var o = opts || {};
    var cls = 'card';
    if (o.className) cls += ' ' + o.className;
    var head = '';
    if (o.title || o.desc || o.actions) {
      head = '<div class="card-head' + (o.bordered ? ' is-bordered' : '') + '">' +
        '<div class="card-head-main">' +
        (o.title ? '<div class="card-title">' + (ZWZ.isRaw(o.title) ? o.title.value : esc(o.title)) + '</div>' : '') +
        (o.desc ? '<div class="card-desc">' + (ZWZ.isRaw(o.desc) ? o.desc.value : esc(o.desc)) + '</div>' : '') +
        '</div>' +
        (o.actions ? '<div class="card-actions">' + (ZWZ.isRaw(o.actions) ? o.actions.value : esc(o.actions)) + '</div>' : '') +
        '</div>';
    }
    var padClass = 'card-body' + (head ? (o.bodyPadTop ? ' is-pad-top' : '') : ' is-solo');
    if (o.pad === false) padClass = 'card-body is-flush';
    var body = o.body === undefined ? '' : (ZWZ.isRaw(o.body) ? o.body.value : esc(o.body));
    var foot = o.foot ? '<div class="card-foot">' + (ZWZ.isRaw(o.foot) ? o.foot.value : esc(o.foot)) + '</div>' : '';
    return raw('<section class="' + cls + '">' + head + '<div class="' + padClass + '">' + body + '</div>' + foot + '</section>');
  }

  function badge(text, tone, opts) {
    var o = opts || {};
    var cls = 'badge' + (tone ? ' badge-' + tone : '') + (o.dot ? ' badge-dot' : '') + (o.size === 'lg' ? ' badge-lg' : '');
    return raw('<span class="' + cls + '">' + esc(text) + '</span>');
  }

  var STATUS_MAP = {
    // 诊断状态
    sufficient: { label: '证据充分', tone: 'teal', icon: 'checkCircle' },
    preliminary: { label: '初步判断', tone: 'primary', icon: 'lightbulb' },
    pending: { label: '待复核', tone: 'warn', icon: 'clock' },
    undetermined: { label: '暂无法判断', tone: 'neutral', icon: 'help' },
    // 批阅状态
    auto: { label: '自动判分', tone: 'teal', icon: 'check' },
    suggested: { label: '建议复核', tone: 'warn', icon: 'clock' },
    unjudged: { label: '暂无法判阅', tone: 'neutral', icon: 'help' },
    reviewed: { label: '教师已复核', tone: 'success', icon: 'shield' },
    // 通用
    confirmed: { label: '已确认', tone: 'success', icon: 'check' },
    processing: { label: '处理中', tone: 'primary', icon: 'refresh' },
    error: { label: '判阅异常', tone: 'danger', icon: 'alert' },
    insufficient: { label: '证据不足', tone: 'neutral', icon: 'help' },
    draft: { label: '草稿', tone: 'neutral', icon: 'edit' }
  };

  function statusBadge(status, override) {
    var conf = STATUS_MAP[status] || { label: override || status || '未知', tone: 'neutral', icon: 'info' };
    var label = override || conf.label;
    return raw(
      '<span class="badge badge-' + conf.tone + '">' + icon(conf.icon, 12).value + esc(label) + '</span>'
    );
  }

  function kpi(opts) {
    var o = opts || {};
    var toneCls = o.tone ? ' is-' + o.tone : '';
    var value = o.value === undefined || o.value === null ? '—' : o.value;
    return html`<div class="kpi${raw(toneCls)}">
      <div class="kpi-head">${o.icon ? icon(o.icon, 15) : ''}<span>${o.label || ''}</span></div>
      <div class="kpi-value num">${typeof value === 'string' && /^\d/.test(value) ? raw(esc(value)) : raw(esc(String(value)))}${o.unit ? raw(' <span class="unit">' + esc(o.unit) + '</span>') : ''}</div>
      ${o.sub ? raw('<div class="kpi-sub">' + (ZWZ.isRaw(o.sub) ? o.sub.value : esc(o.sub)) + '</div>') : ''}
    </div>`;
  }

  function table(opts) {
    var o = opts || {};
    var columns = o.columns || [];
    var rows = o.rows || [];
    var cls = 'table' + (o.className ? ' ' + o.className : '');
    var head = '<tr>' + columns.map(function (c) {
      var style = c.width ? ' style="width:' + esc(c.width) + '"' : '';
      var align = c.align === 'right' ? ' class="td-num"' : (c.align === 'center' ? ' class="col-center"' : '');
      return '<th' + style + (align ? align.replace('td-num', 'col-center') : '') + '>' + esc(c.label) + '</th>';
    }).join('') + '</tr>';

    var body;
    if (!rows.length) {
      var colspan = columns.length || 1;
      body = '<tr><td colspan="' + colspan + '" style="padding:0">' +
        (o.empty ? (ZWZ.isRaw(o.empty) ? o.empty.value : esc(o.empty)) : emptyState({ compact: true, title: '暂无数据', desc: '当前筛选条件下没有可用记录。' }).value) +
        '</td></tr>';
    } else {
      body = rows.map(function (row) {
        var trAttrs = o.rowAttrs ? ' ' + o.rowAttrs(row) : '';
        var cells = columns.map(function (c) {
          var content = c.render ? c.render(row) : row[c.key];
          if (content === null || content === undefined) content = '—';
          var alignCls = c.align === 'right' ? ' class="td-num"' : (c.align === 'center' ? ' class="col-center"' : '');
          return '<td' + alignCls + '>' + (ZWZ.isRaw(content) ? content.value : esc(content)) + '</td>';
        }).join('');
        return '<tr' + trAttrs + '>' + cells + '</tr>';
      }).join('');
    }
    return raw('<div class="table-wrap' + (o.wrapClass ? ' ' + esc(o.wrapClass) : '') + '"><table class="' + cls + '"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>');
  }

  function tabs(opts) {
    var o = opts || {};
    var items = o.items || [];
    return raw('<div class="tabs" data-tabs="' + esc(o.name || 'tabs') + '">' + items.map(function (it) {
      return '<button type="button" class="tab' + (it.key === o.active ? ' is-active' : '') + '" data-tab-key="' + esc(it.key) + '">' +
        esc(it.label) + (it.badge ? '<span class="nav-count">' + esc(it.badge) + '</span>' : '') + '</button>';
    }).join('') + '</div>');
  }

  function bindTabs(root, name, handler) {
    var wrap = root.querySelector('[data-tabs="' + name + '"]');
    if (!wrap) return;
    wrap.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-tab-key]');
      if (!btn || !wrap.contains(btn)) return;
      var key = btn.getAttribute('data-tab-key');
      wrap.querySelectorAll('[data-tab-key]').forEach(function (el) {
        el.classList.toggle('is-active', el === btn);
      });
      handler(key, btn);
    });
  }

  function stepper(items) {
    return raw('<div class="stepper">' + (items || []).map(function (it, idx) {
      var cls = it.state === 'done' ? ' is-done' : (it.state === 'active' ? ' is-active' : '');
      var dot = it.state === 'done' ? icon('check', 12).value : String(idx + 1);
      var sep = idx < items.length - 1 ? '<span class="step-sep"></span>' : '';
      return '<div class="step' + cls + '"><span class="step-dot">' + dot + '</span><span>' + esc(it.label) + '</span></div>' + sep;
    }).join('') + '</div>');
  }

  function progress(value, tone) {
    var v = Math.max(0, Math.min(100, Number(value) || 0));
    return raw('<div class="progress"><div class="progress-bar' + (tone ? ' is-' + tone : '') + '" style="width:' + v + '%"></div></div>');
  }

  function progressLine(value, tone, label) {
    return raw('<div class="progress-line">' + progress(value, tone).value +
      '<span class="progress-value num">' + esc(label !== undefined ? label : Math.round(value) + '%') + '</span></div>');
  }

  function emptyState(opts) {
    var o = opts || {};
    return html`<div class="empty${raw(o.compact ? ' is-compact' : '')}">
      <div class="empty-icon">${icon(o.icon || 'fileText', 22)}</div>
      <div class="empty-title">${o.title || '暂无数据'}</div>
      ${o.desc ? raw('<div class="empty-desc">' + esc(o.desc) + '</div>') : ''}
      ${o.action ? raw('<div class="mt-4">' + (ZWZ.isRaw(o.action) ? o.action.value : esc(o.action)) + '</div>') : ''}
    </div>`;
  }

  function loading(text) {
    return html`<div class="loading"><span class="spinner"></span><span>${text || '正在加载……'}</span></div>`;
  }

  function skeleton(rows) {
    var n = rows || 3;
    var lines = '';
    for (var i = 0; i < n; i++) lines += '<div class="skeleton-line"' + (i === 0 ? ' style="width:40%"' : '') + '></div>';
    return raw('<div class="skeleton">' + lines + '</div>');
  }

  function banner(opts) {
    var o = opts || {};
    var cls = 'banner' + (o.tone ? ' banner-' + o.tone : '') + (o.compact ? ' is-compact' : '');
    var iconName = o.icon || ({ info: 'info', warn: 'alert', danger: 'alert', success: 'checkCircle' }[o.tone] || 'info');
    return html`<div class="${raw(cls)}">
      <span class="banner-icon">${icon(iconName, o.compact ? 14 : 16)}</span>
      <div class="banner-body">
        ${o.title ? raw('<div class="banner-title">' + esc(o.title) + '</div>') : ''}
        ${o.body ? raw('<div>' + (ZWZ.isRaw(o.body) ? o.body.value : esc(o.body)) + '</div>') : ''}
      </div>
    </div>`;
  }

  function avatar(name, opts) {
    var o = opts || {};
    var color = o.color || util.colorFrom(o.seed || name);
    var cls = 'avatar' + (o.size ? ' is-' + o.size : '');
    var style = 'background:' + color;
    return raw('<span class="' + cls + '" style="' + style + '" title="' + esc(name || '') + '">' + esc(util.initials(name)) + '</span>');
  }

  function chip(text, opts) {
    var o = opts || {};
    var cls = 'chip' + (o.active ? ' is-active' : '');
    var attrs = o.attrs ? ' ' + o.attrs : '';
    return raw('<button type="button" class="' + cls + '"' + attrs + '>' + esc(text) + '</button>');
  }

  function evidence(opts) {
    var o = opts || {};
    var items = o.items || [];
    return html`<div class="evidence">
      <div class="evidence-head">
        <span class="evidence-title">${o.title || '判断依据'}</span>
        ${o.status ? statusBadge(o.status) : ''}
        ${o.coverage !== undefined ? raw('<span class="badge badge-neutral">覆盖 ' + esc(o.coverage) + '</span>') : ''}
      </div>
      ${items.length ? raw('<div class="evidence-list">' + items.map(function (it) {
        return '<div class="evidence-item"><span>' + (ZWZ.isRaw(it) ? it.value : esc(it)) + '</span></div>';
      }).join('') + '</div>') : raw('<div class="evidence-item"><span>当前记录不足以形成可核查的依据。</span></div>')}
      ${o.foot ? raw('<div class="evidence-foot">' + (ZWZ.isRaw(o.foot) ? o.foot.value : esc(o.foot)) + '</div>') : ''}
    </div>`;
  }

  function aiNote(text, opts) {
    var o = opts || {};
    return html`<div class="row-sm tiny muted">${icon(o.icon || 'spark', 13)}<span>${text}</span></div>`;
  }

  function aiCard(opts) {
    var o = opts || {};
    return html`<div class="ai-card${raw(o.plain ? ' is-plain' : '')}">
      <div class="ai-head">
        ${raw('<span class="ai-tag' + (o.teacher ? ' is-teacher' : '') + '">' + icon('spark', 11).value + esc(o.tag || 'AI 辅助') + '</span>')}
        ${o.title ? raw('<span class="ai-title">' + esc(o.title) + '</span>') : ''}
        ${o.meta ? raw('<span class="ai-meta">' + esc(o.meta) + '</span>') : ''}
      </div>
      ${o.body ? raw('<div class="ai-text">' + (ZWZ.isRaw(o.body) ? o.body.value : esc(o.body)) + '</div>') : ''}
      ${o.caveat ? raw('<div class="ai-caveat">' + (ZWZ.isRaw(o.caveat) ? o.caveat.value : esc(o.caveat)) + '</div>') : ''}
    </div>`;
  }

  function hintCard(opts) {
    var o = opts || {};
    return html`<div class="hint-step">
      <span class="hint-num">${o.num || '?'}</span>
      <div class="hint-body">
        ${o.title ? raw('<strong>' + esc(o.title) + '</strong><br>') : ''}
        ${raw(ZWZ.isRaw(o.body) ? o.body.value : esc(o.body || ''))}
      </div>
    </div>`;
  }

  function legend(items) {
    return raw('<div class="legend">' + (items || []).map(function (it) {
      return '<span class="legend-item"><span class="legend-dot' + (it.round ? ' is-round' : '') + '" style="background:' + esc(it.color || 'var(--primary)') + '"></span>' + esc(it.label) + '</span>';
    }).join('') + '</div>');
  }

  /* ---------------- 浮层 ---------------- */
  var openLayers = [];

  function overlayRoot() {
    return document.getElementById('overlay-root') || document.body;
  }

  function closeTop(except) {
    for (var i = openLayers.length - 1; i >= 0; i--) {
      if (openLayers[i] !== except) {
        openLayers[i].close();
        return true;
      }
    }
    return false;
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && openLayers.length) {
      ev.preventDefault();
      closeTop();
    }
  });

  function modal(opts) {
    var o = opts || {};
    var root = overlayRoot();
    var wrap = document.createElement('div');
    wrap.className = 'overlay';
    var sizeCls = o.size ? ' is-' + o.size : ' is-md';
    wrap.innerHTML =
      '<div class="modal' + sizeCls + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head">' +
      '<div style="flex:1 1 auto;min-width:0">' +
      (o.title ? '<div class="modal-title">' + esc(o.title) + '</div>' : '') +
      (o.desc ? '<div class="modal-desc">' + esc(o.desc) + '</div>' : '') +
      '</div>' +
      '<button type="button" class="modal-close" data-close aria-label="关闭">' + icon('x', 18).value + '</button>' +
      '</div>' +
      '<div class="modal-body' + (o.flush ? ' is-flush' : '') + '"></div>' +
      (o.footer !== false ? '<div class="modal-foot"></div>' : '') +
      '</div>';

    var bodyEl = wrap.querySelector('.modal-body');
    if (o.body !== undefined) {
      if (typeof o.body === 'string') bodyEl.innerHTML = o.body;
      else if (o.body instanceof Node) bodyEl.appendChild(o.body);
    }
    var footEl = wrap.querySelector('.modal-foot');
    if (footEl && o.footer) {
      if (typeof o.footer === 'string') footEl.innerHTML = o.footer;
      else if (o.footer instanceof Node) footEl.appendChild(o.footer);
    }

    root.appendChild(wrap);
    document.body.style.overflow = 'hidden';

    var controller = {
      el: wrap,
      body: bodyEl,
      footer: footEl,
      close: function () {
        if (!wrap.parentNode) return;
        wrap.remove();
        var idx = openLayers.indexOf(controller);
        if (idx >= 0) openLayers.splice(idx, 1);
        if (!openLayers.length) document.body.style.overflow = '';
        if (typeof o.onClose === 'function') o.onClose();
      }
    };
    openLayers.push(controller);

    wrap.addEventListener('click', function (ev) {
      if (ev.target === wrap) controller.close();
      if (ev.target.closest('[data-close]')) controller.close();
    });

    var focusable = bodyEl.querySelector('input, textarea, select, button, [tabindex]');
    if (focusable) setTimeout(function () { try { focusable.focus(); } catch (e) {} }, 30);
    if (typeof o.onMount === 'function') o.onMount(bodyEl, controller);
    return controller;
  }

  function drawer(opts) {
    var o = opts || {};
    var root = overlayRoot();
    var wrap = document.createElement('div');
    wrap.className = 'drawer-root';
    wrap.innerHTML =
      '<div class="drawer" style="width:min(' + (o.width || 480) + 'px,100%)" role="dialog" aria-modal="true">' +
      '<div class="drawer-head">' +
      '<div style="flex:1 1 auto;min-width:0">' +
      (o.title ? '<div class="modal-title" style="font-size:var(--fs-lg)">' + esc(o.title) + '</div>' : '') +
      (o.desc ? '<div class="modal-desc">' + esc(o.desc) + '</div>' : '') +
      '</div>' +
      '<button type="button" class="modal-close" data-close aria-label="关闭">' + icon('x', 18).value + '</button>' +
      '</div>' +
      '<div class="drawer-body"></div>' +
      (o.footer ? '<div class="drawer-foot"></div>' : '') +
      '</div>';

    var bodyEl = wrap.querySelector('.drawer-body');
    if (typeof o.body === 'string') bodyEl.innerHTML = o.body;
    else if (o.body instanceof Node) bodyEl.appendChild(o.body);
    var footEl = wrap.querySelector('.drawer-foot');
    if (footEl && o.footer) {
      if (typeof o.footer === 'string') footEl.innerHTML = o.footer;
      else footEl.appendChild(o.footer);
    }

    root.appendChild(wrap);
    document.body.style.overflow = 'hidden';

    var controller = {
      el: wrap,
      body: bodyEl,
      footer: footEl,
      close: function () {
        if (!wrap.parentNode) return;
        wrap.remove();
        var idx = openLayers.indexOf(controller);
        if (idx >= 0) openLayers.splice(idx, 1);
        if (!openLayers.length) document.body.style.overflow = '';
        if (typeof o.onClose === 'function') o.onClose();
      }
    };
    openLayers.push(controller);
    wrap.addEventListener('click', function (ev) {
      if (ev.target === wrap) controller.close();
      if (ev.target.closest('[data-close]')) controller.close();
    });
    if (typeof o.onMount === 'function') o.onMount(bodyEl, controller);
    return controller;
  }

  function confirmDialog(opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      var done = false;
      var ctl = modal({
        title: o.title || '请确认',
        desc: o.desc || '',
        size: 'sm',
        body: o.body ? '<div class="small muted" style="line-height:1.7">' + o.body + '</div>' : '',
        footer:
          '<div class="spacer"></div>' +
          '<button type="button" class="btn btn-secondary" data-act="cancel">' + esc(o.cancelText || '取消') + '</button>' +
          '<button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok">' + esc(o.okText || '确认') + '</button>',
        onClose: function () {
          if (!done) { done = true; resolve(false); }
        }
      });
      ctl.el.querySelector('[data-act="ok"]').addEventListener('click', function () {
        done = true;
        ctl.close();
        resolve(true);
      });
      ctl.el.querySelector('[data-act="cancel"]').addEventListener('click', function () {
        done = true;
        ctl.close();
        resolve(false);
      });
    });
  }

  /* ---------------- Toast ---------------- */
  var TOAST_MAX = 3;
  var tones = {
    info: { icon: 'info', cls: '' },
    success: { icon: 'checkCircle', cls: ' toast-success' },
    warn: { icon: 'alert', cls: ' toast-warn' },
    error: { icon: 'alert', cls: ' toast-error' }
  };

  function toast(message, tone) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    var conf = tones[tone] || tones.info;
    var el = document.createElement('div');
    el.className = 'toast' + conf.cls;
    el.setAttribute('role', 'status');
    el.innerHTML = icon(conf.icon, 16).value + '<div>' + esc(message) + '</div>';
    root.appendChild(el);
    while (root.children.length > TOAST_MAX) root.removeChild(root.firstChild);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, tone === 'error' ? 4200 : 2600);
  }

  /* ---------------- 工具 ---------------- */
  function bind(root, selector, event, handler) {
    var els = root.querySelectorAll(selector);
    els.forEach(function (el) {
      el.addEventListener(event, function (ev) { handler(ev, el); });
    });
    return els.length;
  }

  function copy(text) {
    var value = String(text || '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        toast('已复制到剪贴板', 'success');
      }).catch(function () {
        fallbackCopy(value);
      });
    } else {
      fallbackCopy(value);
    }
  }

  function fallbackCopy(value) {
    var ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    try {
      ta.select();
      document.execCommand('copy');
      toast('已复制到剪贴板', 'success');
    } catch (e) {
      toast('复制失败，请手动选择文本', 'warn');
    }
    document.body.removeChild(ta);
  }

  function flashFocus(el, tone) {
    if (!el) return;
    el.classList.add(tone === 'danger' ? 'is-wrong' : 'is-active');
    setTimeout(function () { el.classList.remove('is-wrong', 'is-active'); }, 1400);
  }

  /* ============================================================
     第一轮 UI 优化 · 轻量展示原语（2026-11-05 追加，仅新增）
     ============================================================ */

  /**
   * 渐进披露容器（原生 details，键盘可操作；打印前自动展开）
   * ui.disclosure({ summary: '证据与数据口径', count: 7, body: html`...`, open: false })
   */
  function disclosure(opts) {
    var o = opts || {};
    var body = o.body === undefined || o.body === null ? '' : o.body;
    return html`<details class="disclosure${raw(o.className ? ' ' + o.className : '')}"${raw(o.open ? ' open' : '')}>
      <summary>${o.summary || '展开查看'}${o.count === undefined || o.count === null ? '' : html`<span class="disclosure-count">${o.count}</span>`}</summary>
      <div class="disclosure-body">${body}</div>
    </details>`;
  }

  /**
   * 指标带：3–4 个关键数字一行展示（替代多个独立 KPI 卡）
   * ui.statStrip([{ label, value, unit, sub, tone }])
   */
  function statStrip(items, opts) {
    var o = opts || {};
    return html`<div class="stat-strip${raw(o.className ? ' ' + o.className : '')}">
      ${(items || []).map(function (it) {
        return html`<div class="stat${raw(it.tone ? ' is-' + it.tone : '')}">
          <div class="stat-label">${it.label}</div>
          <div class="stat-value">${it.value === undefined || it.value === null ? '—' : it.value}${it.unit ? html`<span class="unit">${it.unit}</span>` : ''}</div>
          ${it.sub ? html`<div class="stat-sub">${it.sub}</div>` : ''}
        </div>`;
      })}
    </div>`;
  }

  /* 打印时自动展开所有折叠面板，打印后恢复原状，保证打印版信息完整 */
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeprint', function () {
      document.querySelectorAll('details.disclosure').forEach(function (el) {
        el.setAttribute('data-was-open', el.open ? '1' : '0');
        el.open = true;
      });
    });
    window.addEventListener('afterprint', function () {
      document.querySelectorAll('details.disclosure').forEach(function (el) {
        el.open = el.getAttribute('data-was-open') === '1';
        el.removeAttribute('data-was-open');
      });
    });
  }

  ZWZ.ui = {
    icon: icon,
    PATHS: PATHS,
    button: button,
    card: card,
    badge: badge,
    statusBadge: statusBadge,
    STATUS_MAP: STATUS_MAP,
    kpi: kpi,
    statStrip: statStrip,
    disclosure: disclosure,
    table: table,
    tabs: tabs,
    bindTabs: bindTabs,
    stepper: stepper,
    progress: progress,
    progressLine: progressLine,
    empty: emptyState,
    emptyState: emptyState,
    loading: loading,
    skeleton: skeleton,
    banner: banner,
    avatar: avatar,
    chip: chip,
    evidence: evidence,
    aiNote: aiNote,
    aiCard: aiCard,
    hintCard: hintCard,
    legend: legend,
    modal: modal,
    drawer: drawer,
    confirm: confirmDialog,
    toast: toast,
    bind: bind,
    copy: copy,
    flashFocus: flashFocus
  };
})();
