/* ============================================================
   知微·智学 · 手写 SVG 图表库（零依赖）
   所有函数返回 html 片段，自带标题 / 图例 / 口径说明
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var html = ZWZ.html;
  var raw = ZWZ.raw;
  var esc = ZWZ.esc;
  var fmt = ZWZ.fmt;

  var COLORS = {
    primary: '#365CF5',
    primarySoft: '#C3D0FF',
    teal: '#20B8A5',
    tealSoft: '#CDF1EB',
    success: '#16A085',
    warn: '#F0A43A',
    warnSoft: '#FBE7C7',
    danger: '#E56B6F',
    dangerSoft: '#FAD5D7',
    neutral: '#9AA4B2',
    purple: '#7C6CF0',
    navy: '#172B4D',
    ink2: '#6B7280',
    border: '#E8EDF5',
    track: '#F0F4FA'
  };

  var TONE = {
    primary: COLORS.primary,
    teal: COLORS.teal,
    success: COLORS.success,
    warn: COLORS.warn,
    danger: COLORS.danger,
    neutral: COLORS.neutral,
    purple: COLORS.purple
  };

  function colorOf(item, fallback) {
    if (!item) return fallback || COLORS.primary;
    if (item.color) return item.color;
    if (item.tone && TONE[item.tone]) return TONE[item.tone];
    return fallback || COLORS.primary;
  }

  function head(title, desc, extra) {
    if (!title && !desc) return '';
    return '<div class="chart-head"><div><div class="chart-title">' + esc(title || '') + '</div>' +
      (desc ? '<div class="chart-desc">' + esc(desc) + '</div>' : '') + '</div>' +
      (extra || '') + '</div>';
  }

  function noteEl(text) {
    return text ? '<div class="chart-note">' + esc(text) + '</div>' : '';
  }

  function legendEl(items) {
    if (!items || !items.length) return '';
    return '<div class="chart-legend">' + items.map(function (it) {
      return '<span class="legend-item"><i class="' + (it.round ? 'is-round' : '') + '" style="background:' + esc(it.color || COLORS.primary) + '"></i>' + esc(it.label) + '</span>';
    }).join('') + '</div>';
  }

  function emptyChart(text) {
    return '<div class="chart-empty">' + esc(text || '暂无可用数据') + '</div>';
  }

  function textWidth(str) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += str.charCodeAt(i) > 255 ? 12 : 6.6;
    return w;
  }

  function truncate(str, maxW) {
    var s = String(str === undefined || str === null ? '' : str);
    if (textWidth(s) <= maxW) return s;
    while (s.length > 1 && textWidth(s + '…') > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  /* ---------------- 横向条形图 ---------------- */
  function hbar(opts) {
    var o = opts || {};
    var items = (o.items || []).filter(function (it) { return it && it.value !== null && it.value !== undefined; });
    var width = o.width || 720;
    var labelW = o.labelWidth || 148;
    var valueW = 52;
    var rowH = o.rowHeight || 34;
    var padTop = 6;
    var trackH = o.barHeight || 12;
    var max = o.max || 100;

    if (!items.length) {
      return raw('<div class="chart">' + head(o.title, o.desc) + emptyChart(o.emptyText) + noteEl(o.note) + '</div>');
    }

    var height = padTop * 2 + items.length * rowH;
    var plotX = labelW;
    var plotW = Math.max(40, width - labelW - valueW);

    var body = '';
    items.forEach(function (it, i) {
      var y = padTop + i * rowH;
      var value = Math.max(0, Math.min(max, Number(it.value) || 0));
      var w = (value / max) * plotW;
      var color = colorOf(it);
      var label = truncate(it.label, labelW - 12);
      var text = it.text || (o.unit === '%' ? Math.round(value) + '%' : (it.unit || o.unit || '') + (Math.round(value * 10) / 10));
      if (it.valueText) text = it.valueText;
      body +=
        '<g class="hit">' +
        '<text x="0" y="' + (y + rowH / 2 + 4) + '" class="is-label">' + esc(label) + '</text>' +
        '<rect class="bar-track" x="' + plotX + '" y="' + (y + (rowH - trackH) / 2) + '" width="' + plotW + '" height="' + trackH + '" rx="' + trackH / 2 + '"></rect>' +
        '<rect class="bar" x="' + plotX + '" y="' + (y + (rowH - trackH) / 2) + '" width="' + Math.max(2, w).toFixed(1) + '" height="' + trackH + '" rx="' + trackH / 2 + '" fill="' + color + '"></rect>' +
        (it.marker ? '<line x1="' + (plotX + plotW * it.marker / 100) + '" y1="' + (y + 6) + '" x2="' + (plotX + plotW * it.marker / 100) + '" y2="' + (y + rowH - 6) + '" stroke="' + COLORS.ink2 + '" stroke-dasharray="2 3" stroke-width="1"></line>' : '') +
        '<text x="' + (plotX + plotW + 8) + '" y="' + (y + rowH / 2 + 4) + '" class="is-value">' + esc(text) + '</text>' +
        '</g>';
    });

    var svg = '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(o.title || '横向条形图') + '">' + body + '</svg>';
    return raw('<div class="chart' + (o.className ? ' ' + esc(o.className) : '') + '">' + head(o.title, o.desc) + legendEl(o.legend) + svg + noteEl(o.note) + '</div>');
  }

  /* ---------------- 堆叠条形图（错误类型分布等） ---------------- */
  function stacked(opts) {
    var o = opts || {};
    var items = (o.items || []);
    var keys = o.keys || [];
    var width = o.width || 720;
    var labelW = o.labelWidth || 148;
    var rowH = o.rowHeight || 30;
    var barH = o.barHeight || 14;
    var padTop = 8;
    var totalOf = function (it) {
      return keys.reduce(function (sum, k) { return sum + (Number(it.values ? it.values[k] : 0) || 0); }, 0);
    };
    var hasData = items.some(function (it) { return totalOf(it) > 0; });
    if (!items.length || !hasData) {
      return raw('<div class="chart">' + head(o.title, o.desc) + emptyChart(o.emptyText) + noteEl(o.note) + '</div>');
    }
    var height = padTop * 2 + items.length * rowH + 4;
    var plotX = labelW;
    var plotW = Math.max(60, width - labelW - 46);
    var body = '';
    items.forEach(function (it, i) {
      var y = padTop + i * rowH;
      var total = totalOf(it) || 1;
      var x = plotX;
      var label = truncate(it.label, labelW - 12);
      body += '<text x="0" y="' + (y + rowH / 2 + 4) + '" class="is-label">' + esc(label) + '</text>';
      keys.forEach(function (k) {
        var v = Number(it.values ? it.values[k] : 0) || 0;
        if (v <= 0) return;
        var w = (v / total) * plotW;
        body += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + (y + (rowH - barH) / 2) + '" width="' + w.toFixed(1) + '" height="' + barH + '" fill="' + esc(k.color || COLORS.primary) + '" rx="2"></rect>';
        if (w > 18) {
          body += '<text x="' + (x + w / 2) + '" y="' + (y + rowH / 2 + 3.5) + '" text-anchor="middle" class="is-small" fill="#fff" style="fill:#fff;font-weight:600">' + Math.round(v / total * 100) + '%</text>';
        }
        x += w;
      });
      body += '<text x="' + (plotX + plotW + 8) + '" y="' + (y + rowH / 2 + 4) + '" class="is-value">' + total + '</text>';
    });
    var svg = '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(o.title || '堆叠条形图') + '">' + body + '</svg>';
    return raw('<div class="chart">' + head(o.title, o.desc) + legendEl(keys.map(function (k) {
      return { label: k.label, color: k.color };
    })) + svg + noteEl(o.note) + '</div>');
  }

  /* ---------------- 折线图 ---------------- */
  function line(opts) {
    var o = opts || {};
    var series = (o.series || []).filter(function (s) { return s && s.points && s.points.length; });
    var xLabels = o.xLabels || [];
    var width = o.width || 720;
    var height = o.height || 240;
    var padL = o.padLeft || 40;
    var padR = 18;
    var padT = 14;
    var padB = 34;
    var yMax = o.yMax || 100;
    var yMin = o.yMin || 0;
    if (!series.length) {
      return raw('<div class="chart">' + head(o.title, o.desc) + emptyChart(o.emptyText) + noteEl(o.note) + '</div>');
    }
    var plotW = Math.max(60, width - padL - padR);
    var plotH = Math.max(60, height - padT - padB);
    var n = Math.max.apply(null, series.map(function (s) { return s.points.length; }));
    var xAt = function (i) { return padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW); };
    var yAt = function (v) { return padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH; };

    var grid = '';
    var ticks = o.ticks || [0, 25, 50, 75, 100];
    ticks.forEach(function (t) {
      var y = yAt(t);
      grid += '<line class="grid-line" x1="' + padL + '" y1="' + y + '" x2="' + (width - padR) + '" y2="' + y + '"></line>' +
        '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" class="is-axis">' + t + (o.unit || '') + '</text>';
    });
    var xText = '';
    xLabels.forEach(function (lb, i) {
      if (xLabels.length > 8 && i % 2 === 1) return;
      xText += '<text x="' + xAt(i) + '" y="' + (height - padB + 20) + '" text-anchor="middle" class="is-axis">' + esc(lb) + '</text>';
    });

    var lines = series.map(function (s) {
      var color = colorOf(s, COLORS.primary);
      var pts = s.points.map(function (v, i) { return xAt(i) + ',' + yAt(v); }).join(' ');
      var area = '';
      if (o.area) {
        area = '<polygon fill="' + color + '" opacity="0.07" points="' + padL + ',' + (padT + plotH) + ' ' + pts + ' ' + (padL + plotW) + ',' + (padT + plotH) + '"></polygon>';
      }
      var dots = s.points.map(function (v, i) {
        return '<circle cx="' + xAt(i) + '" cy="' + yAt(v) + '" r="3" fill="#fff" stroke="' + color + '" stroke-width="2"></circle>';
      }).join('');
      var dash = s.dashed ? ' stroke-dasharray="5 4"' : '';
      return area + '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"' + dash + '></polyline>' + dots;
    }).join('');

    var svg = '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(o.title || '趋势折线图') + '">' +
      grid + xText + lines + '</svg>';

    var legend = legendEl(series.map(function (s) {
      return { label: s.name, color: colorOf(s) };
    }));

    return raw('<div class="chart">' + head(o.title, o.desc) + legend + svg + noteEl(o.note) + '</div>');
  }

  /* ---------------- 热力图 ---------------- */
  function heatColor(value) {
    if (value === null || value === undefined) return { bg: '#F4F6FA', fg: '#9AA4B2' };
    var v = Number(value);
    if (v < 40) return { bg: '#FDEDEE', fg: '#9B3236' };
    if (v < 60) return { bg: '#FDF4E6', fg: '#8A5D12' };
    if (v < 80) return { bg: '#E7F8F5', fg: '#177D70' };
    return { bg: '#CDF1EB', fg: '#0F6459' };
  }

  function heatmap(opts) {
    var o = opts || {};
    var rows = o.rows || [];
    var cols = o.cols || [];
    var width = o.width || 720;
    var labelW = o.labelWidth || 132;
    var cellH = o.cellHeight || 28;
    var topH = 22;
    var gap = 4;
    if (!rows.length || !cols.length) {
      return raw('<div class="chart">' + head(o.title, o.desc) + emptyChart(o.emptyText) + noteEl(o.note) + '</div>');
    }
    var cellW = (width - labelW - 8) / cols.length;
    var height = topH + rows.length * (cellH + gap) + 6;
    var body = '';
    cols.forEach(function (c, i) {
      body += '<text x="' + (labelW + i * cellW + cellW / 2) + '" y="' + (topH - 8) + '" text-anchor="middle" class="is-axis">' + esc(truncate(c, cellW - 6)) + '</text>';
    });
    rows.forEach(function (row, r) {
      var y = topH + r * (cellH + gap);
      body += '<text x="0" y="' + (y + cellH / 2 + 4) + '" class="is-label">' + esc(truncate(row.label, labelW - 10)) + '</text>';
      (row.cells || []).forEach(function (cell, c) {
        if (c >= cols.length) return;
        var value = cell && cell.value !== undefined ? cell.value : cell;
        var conf = heatColor(value);
        var x = labelW + c * cellW;
        var label = cell && cell.label !== undefined ? cell.label : (value === null || value === undefined ? '—' : Math.round(value) + '%');
        body += '<g class="chart-heat-cell">' +
          '<rect x="' + (x + 1) + '" y="' + y + '" width="' + (cellW - 2) + '" height="' + cellH + '" rx="5" fill="' + conf.bg + '"></rect>' +
          '<text x="' + (x + cellW / 2) + '" y="' + (y + cellH / 2 + 4) + '" text-anchor="middle" fill="' + conf.fg + '">' + esc(label) + '</text>' +
          '</g>';
      });
    });
    var svg = '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(o.title || '热力图') + '">' + body + '</svg>';
    var legend = legendEl(o.legend || [
      { label: '<40% 待巩固', color: '#FDEDEE' },
      { label: '40–60% 不稳定', color: '#FDF4E6' },
      { label: '60–80% 基本掌握', color: '#E7F8F5' },
      { label: '≥80% 较稳定', color: '#CDF1EB' }
    ]);
    return raw('<div class="chart">' + head(o.title, o.desc) + svg + legend + noteEl(o.note) + '</div>');
  }

  /* ---------------- 环形图 ---------------- */
  function donut(opts) {
    var o = opts || {};
    var segments = (o.segments || []).filter(function (s) { return s.value > 0; });
    var size = o.size || 180;
    var stroke = o.stroke || 22;
    var r = (size - stroke) / 2;
    var cx = size / 2;
    var cy = size / 2;
    var total = segments.reduce(function (s, x) { return s + Number(x.value); }, 0);
    if (!total) {
      return raw('<div class="chart">' + head(o.title, o.desc) + emptyChart(o.emptyText) + noteEl(o.note) + '</div>');
    }
    var circumference = 2 * Math.PI * r;
    var offset = 0;
    var arcs = segments.map(function (s) {
      var frac = Number(s.value) / total;
      var dash = circumference * frac;
      var el = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + esc(colorOf(s)) + '" stroke-width="' + stroke + '" ' +
        'stroke-dasharray="' + (dash - 2).toFixed(2) + ' ' + (circumference - dash + 2).toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-offset).toFixed(2) + '" stroke-linecap="butt" transform="rotate(-90 ' + cx + ' ' + cy + ')"></circle>';
      offset += dash;
      return el;
    }).join('');
    var center = '<div class="chart-donut-center">' +
      (o.centerValue !== undefined ? '<div class="chart-donut-value">' + esc(o.centerValue) + '</div>' : '') +
      (o.centerLabel ? '<div class="chart-donut-label">' + esc(o.centerLabel) + '</div>' : '') + '</div>';
    var svg = '<div style="position:relative;width:' + size + 'px;max-width:100%">' +
      '<svg class="chart-svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(o.title || '环形图') + '">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + COLORS.track + '" stroke-width="' + stroke + '"></circle>' + arcs +
      '</svg>' + center + '</div>';
    return raw('<div class="chart">' + head(o.title, o.desc) +
      '<div class="row" style="gap:var(--s-5);align-items:center;flex-wrap:wrap">' + svg +
      '<div class="stack-sm" style="flex:1 1 160px;min-width:140px">' + segments.map(function (s) {
        return '<div class="legend-item"><i class="' + (s.round ? 'is-round' : '') + '" style="background:' + esc(colorOf(s)) + '"></i>' +
          '<span style="flex:1 1 auto">' + esc(s.label) + '</span>' +
          '<span class="num small muted">' + esc(s.value) + (o.unit || '') + '</span></div>';
      }).join('') + '</div></div>' + noteEl(o.note) + '</div>');
  }

  /* ---------------- 迷你趋势线 ---------------- */
  function sparkline(points, opts) {
    var o = opts || {};
    var data = (points || []).filter(function (p) { return p !== null && p !== undefined; });
    if (data.length < 2) return raw('<span class="muted small">数据不足</span>');
    var w = o.width || 96;
    var h = o.height || 26;
    var max = Math.max.apply(null, data);
    var min = Math.min.apply(null, data);
    var span = max - min || 1;
    var pts = data.map(function (v, i) {
      return (i / (data.length - 1) * w).toFixed(1) + ',' + (h - 3 - ((v - min) / span) * (h - 6)).toFixed(1);
    }).join(' ');
    return raw('<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" fill="none" aria-hidden="true"><polyline points="' + pts + '" stroke="' + esc(o.color || COLORS.primary) + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>');
  }

  /* ---------------- 迷你分组柱状（周趋势） ---------------- */
  function minibars(values, opts) {
    var o = opts || {};
    var data = values || [];
    if (!data.length) return raw('<span class="muted small">数据不足</span>');
    var w = o.width || 120;
    var h = o.height || 32;
    var max = Math.max.apply(null, data) || 1;
    var bw = w / data.length;
    var bars = data.map(function (v, i) {
      var bh = Math.max(2, (v / max) * (h - 4));
      return '<rect x="' + (i * bw + 1) + '" y="' + (h - bh) + '" width="' + Math.max(2, bw - 2) + '" height="' + bh + '" rx="2" fill="' + esc(v === max && o.highlight ? o.highlight : (o.color || COLORS.primarySoft)) + '"></rect>';
    }).join('');
    return raw('<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' + bars + '</svg>');
  }

  ZWZ.charts = {
    COLORS: COLORS,
    TONE: TONE,
    colorOf: colorOf,
    hbar: hbar,
    stacked: stacked,
    line: line,
    heatmap: heatmap,
    donut: donut,
    sparkline: sparkline,
    minibars: minibars,
    heatColor: heatColor,
    legend: legendEl,
    note: noteEl,
    empty: emptyChart
  };
})();
