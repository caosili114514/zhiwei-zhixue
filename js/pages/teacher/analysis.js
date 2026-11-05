/* ============================================================
   知微·智学 · 班级学情分析（教师端核心页面）
   ------------------------------------------------------------
   第一轮 UI 优化（2026-11-05）：单页四层 → 5 个页内分段
   - 概览（默认）：3 个核心指标 + 1 句结论 + 1 张主图（知识点掌握率）
   - 知识点：知识点明细表（行 → 证据抽屉）+ 阶段变化
   - 错误类型：错误分布 + 各知识点主要错误类型
   - 学生差异：知识点×学生热力图 + 仍需巩固学生（不排名、不贴标签）
   - 证据与待核实：四类诊断状态分布 + 数据覆盖 + 待复核诊断 + 口径说明
   筛选（班级 / 时间区间 / 知识点）贯穿全部分段并持续展示；
   分段切换使用页内 Tab，不新增路由；所有数值由 ZWZ.sel 实时派生。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = window.ZWZ;
  var html = ZWZ.html;
  var fmt = ZWZ.fmt;
  var ui = ZWZ.ui;
  var charts = ZWZ.charts;
  var sel = ZWZ.sel;

  var RANGE_KEYS = ['all', 't1', 't2', 't3'];
  var SEG_KEYS = ['overview', 'kps', 'errors', 'students', 'evidence'];
  var SEG_LABELS = { overview: '概览', kps: '知识点', errors: '错误类型', students: '学生差异', evidence: '证据与待核实' };

  /* 筛选项与分段：模块级保存，ctx.refresh() / 分段切换后仍然保留 */
  var FILTERS = { range: 'all', kpId: 'all', seg: 'overview', inited: false };
  var LAST_QUERY = { range: null, kp: null, seg: null };

  /* 热力图口径：表现 → 0–100（页面内同步展示该映射规则） */
  var PERF_SCORE = {
    secure: 90,
    independent: 90,
    'after-hint': 70,
    retry: 65,
    difficulty: 35,
    insufficient: null,
    'not-learned': null
  };

  /* 错误类型 → 教学参考建议（仅作为参考，不替代教师决定） */
  var ERROR_ADVICE = {
    concept: '用反例辨析概念边界，安排 3 道判断/辨析题，并要求学生说出判断依据。',
    calculation: '安排 5 道同类符号运算并要求写出每一步符号理由，重点检查“减去负数”与幂的符号。',
    steps: '使用步骤清单训练完整书写（设、列、解、检验），讲评时对照清单自查遗漏。',
    reading: '先圈画条件与问题再动笔，安排 2 道条件相近的易混题对比审题。',
    method: '对比不同方法的适用条件，让学生说出选择方法的理由。',
    transfer: '在相近情境中做 1—2 道变式题，帮助方法迁移到新情境。',
    unclassified: '建议先抽查 3—5 份典型作答，人工确认错误类型后再确定讲评重点。'
  };

  var CN_NUM = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };

  /* ---------------- 通用工具 ---------------- */
  function pct(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Math.round(v * 100) + '%';
  }

  function sum(list, pick) {
    var total = 0;
    (list || []).forEach(function (item) { total += Number(pick ? pick(item) : item) || 0; });
    return total;
  }

  function classIdOf(ctx) {
    return (ctx.session && ctx.session.classId) || 'c1';
  }

  function chaptersOf(state, classId) {
    var cls = sel.classById(state, classId);
    var ids = (cls && cls.scopeChapterIds) || ((state.meta && state.meta.scope && state.meta.scope.chapters) || []);
    return ids.map(function (id) {
      var list = state.chapters || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }).filter(Boolean);
  }

  function chapterRangeLabel(chapters) {
    if (!chapters.length) return '未设置';
    var orders = chapters.map(function (c) { return c.order; }).sort(function (a, b) { return a - b; });
    var contiguous = orders.length > 1 && orders[orders.length - 1] - orders[0] === orders.length - 1;
    if (contiguous) {
      var a = CN_NUM[orders[0]] || orders[0];
      var b = CN_NUM[orders[orders.length - 1]] || orders[orders.length - 1];
      return '第' + a + '至第' + b + '章';
    }
    return chapters.map(function (c) { return '第' + (CN_NUM[c.order] || c.order) + '章'; }).join('、');
  }

  function toneForBadge(tone) {
    return tone === 'purple' ? 'primary' : (tone || 'neutral');
  }

  function statusBadgeOf(diag) {
    var label = diag.statusLabel || ((ZWZ.diagnosis && ZWZ.diagnosis.STATUS[diag.status]) || {}).label || diag.status || '未知';
    var tone = diag.statusTone || { sufficient: 'teal', preliminary: 'primary', pending: 'warn', undetermined: 'neutral' }[diag.status] || 'neutral';
    return ui.badge(label, tone);
  }

  /* ---------------- 时间区间 / 筛选 ---------------- */
  function rangeList(state, classId) {
    var tasks = sel.tasksOfClass(state, classId);
    var min = null;
    var max = null;
    tasks.forEach(function (t) {
      if (!min || new Date(t.assignedAt) < new Date(min)) min = t.assignedAt;
      if (!max || new Date(t.dueAt) > new Date(max)) max = t.dueAt;
    });
    var list = [{
      key: 'all',
      label: '全部',
      title: '全部时间',
      text: (min ? fmt.date(min) : '—') + ' — ' + (max ? fmt.date(max) : '—'),
      desc: '全部任务（共 ' + tasks.length + ' 个）的作答记录'
    }];
    tasks.forEach(function (t) {
      list.push({
        key: t.id,
        label: t.id,
        title: t.title + ' · ' + fmt.date(t.assignedAt) + ' — ' + fmt.date(t.dueAt),
        text: fmt.date(t.assignedAt) + ' — ' + fmt.date(t.dueAt),
        desc: t.title + (t.scopeNote ? '（' + t.scopeNote + '）' : '')
      });
    });
    return list;
  }

  function currentRange(state, classId) {
    var list = rangeList(state, classId);
    for (var i = 0; i < list.length; i++) if (list[i].key === FILTERS.range) return list[i];
    return list[0];
  }

  /* 用过滤后的 answers 派生一个新快照；selectors 为纯函数，不会修改原数据 */
  function viewState(state) {
    if (FILTERS.range === 'all') return state;
    var rows = (state.answers || []).filter(function (a) { return a.taskId === FILTERS.range; });
    return Object.assign({}, state, { answers: rows });
  }

  function syncUrl() {
    try {
      if (typeof history === 'undefined' || !history.replaceState) return;
      var qs = [];
      if (FILTERS.range !== 'all') qs.push('range=' + encodeURIComponent(FILTERS.range));
      if (FILTERS.kpId !== 'all') qs.push('kp=' + encodeURIComponent(FILTERS.kpId));
      if (FILTERS.seg !== 'overview') qs.push('seg=' + encodeURIComponent(FILTERS.seg));
      history.replaceState(null, '', '#/teacher/analysis' + (qs.length ? '?' + qs.join('&') : ''));
    } catch (err) { /* file:// 或受限环境下无需同步 URL */ }
  }

  function initFilters(ctx, state) {
    var q = ctx.query || {};
    var validRange = q.range && RANGE_KEYS.indexOf(q.range) >= 0 ? q.range : null;
    var validKp = q.kp && sel.kp(state, q.kp) ? q.kp : null;
    var validSeg = q.seg && SEG_KEYS.indexOf(q.seg) >= 0 ? q.seg : null;

    if (!FILTERS.inited) {
      FILTERS.inited = true;
      if (validRange) FILTERS.range = validRange;
      if (validKp) FILTERS.kpId = validKp;
      if (validSeg) FILTERS.seg = validSeg;
    } else {
      /* 站内再次带参进入（如个体档案 → “查看班级该知识点”）时同步筛选 */
      if (validKp && validKp !== LAST_QUERY.kp) FILTERS.kpId = validKp;
      if (validRange && validRange !== LAST_QUERY.range) FILTERS.range = validRange;
      if (validSeg && validSeg !== LAST_QUERY.seg) FILTERS.seg = validSeg;
    }
    LAST_QUERY.kp = validKp;
    LAST_QUERY.range = validRange;
    LAST_QUERY.seg = validSeg;
    FILTERS.inited = true;
  }

  /* 每个知识点上“待复核批阅”的作答条数 */
  function pendingAnswerByKp(state) {
    var map = {};
    (state.answers || []).forEach(function (a) {
      if (a.gradeStatus !== 'suggested' && a.gradeStatus !== 'unjudged') return;
      var q = sel.question(state, a.questionId);
      if (!q) return;
      (q.kpIds || []).forEach(function (kpId) { map[kpId] = (map[kpId] || 0) + 1; });
    });
    return map;
  }

  function focusRowsOf(kpRows) {
    if (FILTERS.kpId === 'all') return kpRows;
    return kpRows.filter(function (row) { return row.kp.id === FILTERS.kpId; });
  }

  /* ---------------- 顶部筛选条（压缩为一行 + 当前筛选摘要） ---------------- */
  function renderFilterBar(state, classId, overview) {
    var ranges = rangeList(state, classId);
    var chapters = chaptersOf(state, classId);
    var scopeLabel = chapterRangeLabel(chapters);
    var kps = sel.inScopeKps(state, classId);
    var excluded = (state.knowledgePoints || []).filter(function (kp) {
      return kps.every(function (item) { return item.id !== kp.id; });
    });
    var classes = sel.classes(state);
    var kpLabel = FILTERS.kpId === 'all'
      ? '全部知识点'
      : (function () {
        var kp = sel.kp(state, FILTERS.kpId);
        return kp ? kp.code + ' ' + kp.name : '全部知识点';
      })();
    var range = currentRange(state, classId);

    return html`<section class="card ana-filterbar">
      <div class="ana-filter-row">
        <div class="field ana-field-class">
          <div class="label">班级</div>
          <select class="select is-sm" id="ana-class" aria-label="选择班级">
            ${classes.map(function (c) {
              return html`<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${c.name}（当前班级）</option>`;
            })}
          </select>
        </div>
        <div class="field ana-field-range">
          <div class="label">时间区间</div>
          <div class="seg is-scroll" data-range-group role="group" aria-label="时间区间">
            ${ranges.map(function (item) {
              return html`<button type="button" class="seg-item ${FILTERS.range === item.key ? 'is-active' : ''}" data-range="${item.key}" title="${item.desc} · ${item.text}">${item.label}</button>`;
            })}
          </div>
        </div>
        <div class="field ana-field-kp">
          <div class="label">知识点</div>
          <select class="select is-sm" id="ana-kp" aria-label="选择知识点">
            <option value="all" ${FILTERS.kpId === 'all' ? 'selected' : ''}>全部知识点（${kps.length} 个）</option>
            ${kps.map(function (kp) {
              return html`<option value="${kp.id}" ${FILTERS.kpId === kp.id ? 'selected' : ''}>${kp.code} ${kp.name}</option>`;
            })}
            ${excluded.map(function (kp) {
              return html`<option value="" disabled>${kp.code} ${kp.name}（未纳入范围）</option>`;
            })}
          </select>
        </div>
        <div class="field ana-field-scope">
          <div class="label">教学范围</div>
          <div class="row-sm row-wrap">
            ${ui.badge(scopeLabel, 'primary')}
            ${ui.badge('待教师确认', 'warn')}
            <a class="link-btn" href="#/teacher/data?tab=materials">调整范围</a>
          </div>
        </div>
      </div>
      <div class="ana-filter-current">
        ${ui.icon('filter', 13)}
        <span>当前筛选：<b>${range.title}</b> · <b>${kpLabel}</b> · ${overview.studentCount} 名学生 · 可判读 ${overview.judged} / ${overview.records} 条 · 待复核批阅 ${overview.pendingGrades} 条</span>
      </div>
    </section>`;
  }

  /* ---------------- 分段导航（页内 Tab，不新增路由） ---------------- */
  function renderSegNav(view, classId, overview) {
    var diags = sel.classDiagnostics(view, classId);
    var pendingDiagCount = diags.filter(function (d) { return d.status === 'pending'; }).length;
    var kpCount = (overview.kpRows || []).length;
    var errorCount = (overview.errorTypes || []).length;
    var items = [
      { key: 'overview', label: '概览' },
      { key: 'kps', label: '知识点', badge: kpCount + ' 个' },
      { key: 'errors', label: '错误类型', badge: errorCount + ' 类' },
      { key: 'students', label: '学生差异', badge: overview.studentCount + ' 人' },
      { key: 'evidence', label: '证据与待核实', badge: pendingDiagCount ? pendingDiagCount + ' 项' : '覆盖与口径' }
    ];
    return html`<div class="ana-seg-nav">${ui.tabs({ items: items, active: FILTERS.seg, name: 'ana-seg' })}</div>`;
  }

  /* ---------------- 分段 1：概览（独立成立） ---------------- */
  function segOverview(state, classId, view, overview) {
    var range = currentRange(state, classId);
    var rows = overview.kpRows || [];
    var masteryRows = rows.filter(function (r) { return r.masteryRate !== null && r.masteryRate !== undefined; });
    var lowRows = masteryRows.filter(function (r) { return r.masteryRate < 0.6; })
      .sort(function (a, b) { return a.masteryRate - b.masteryRate; });
    var worst = lowRows[0] || null;
    var avgMastery = masteryRows.length
      ? sum(masteryRows, function (r) { return r.masteryRate; }) / masteryRows.length
      : null;
    var judgedRatio = overview.records ? overview.judged / overview.records : null;

    var conclusion = '共 ' + overview.judged + ' 条可判读记录，一次正确率 ' + pct(overview.accuracy) + '；' +
      rows.length + ' 个知识点中 ' + lowRows.length + ' 个掌握率低于 60%' +
      (worst ? '，最需关注「' + worst.kp.name + '」（掌握率 ' + pct(worst.masteryRate) + '）' : '') +
      '。待复核批阅 ' + overview.pendingGrades + ' 条、待确认诊断 ' + overview.pendingDiagnoses + ' 项未计入。';

    var hbarBlock = charts.hbar({
      title: '各知识点掌握率',
      desc: '单位：%。掌握率 = 掌握较稳定/独立/提示后/反复尝试的学生 ÷ 有可判读记录的学生',
      unit: '%',
      width: 720,
      labelWidth: 168,
      rowHeight: 34,
      max: 100,
      items: rows.map(function (row) {
        return {
          label: row.kp.name,
          value: row.masteryRate === null ? null : Math.round(row.masteryRate * 100),
          tone: row.masteryRate !== null && row.masteryRate < 0.5 ? 'warn' : (row.masteryRate >= 0.75 ? 'teal' : 'primary'),
          marker: avgMastery === null ? null : Math.round(avgMastery * 100)
        };
      }),
      note: '样本：' + overview.judged + ' / ' + overview.records + ' 条可判读记录（覆盖率 ' + pct(judgedRatio) + '）；各知识点 n=可判读记录条数。时间范围：' +
        range.text + '。待复核记录不计入；有可判读记录的学生少于 3 人或覆盖低于 50% 时仅作参考。' +
        (avgMastery === null ? '' : '灰色虚线 = 掌握率均值 ' + pct(avgMastery) + '。')
    });

    return html`<section class="ana-segment ana-seg-overview">
      ${ui.statStrip([
        {
          label: '一次正确率',
          value: pct(overview.accuracy),
          sub: '可判读 ' + overview.judged + ' / ' + overview.records + ' 条',
          tone: overview.accuracy !== null && overview.accuracy >= 0.75 ? 'teal' : 'primary'
        },
        { label: '数据覆盖', value: pct(judgedRatio), sub: '待复核与未提交不计入' },
        { label: '待关注知识点', value: lowRows.length, unit: '个', sub: '掌握率低于 60%', tone: lowRows.length ? 'warn' : 'teal' }
      ])}
      <div class="page-lead">${ui.icon('info', 15)}<div class="page-lead-text">${conclusion}</div></div>
      <section class="card ana-chart-card">
        <div class="card-body is-solo">${hbarBlock}</div>
      </section>
      <div class="ana-seg-actions">
        ${ui.button({ label: '查看知识点明细', tone: 'secondary', size: 'sm', icon: 'list', attrs: 'data-seg-go="kps"' })}
        ${ui.button({ label: '查看证据与待核实', tone: 'ghost', size: 'sm', icon: 'shield', attrs: 'data-seg-go="evidence"' })}
        ${ui.button({ label: '去复核中心', tone: 'ghost', size: 'sm', icon: 'arrowRight', attrs: 'data-go="#/teacher/review"' })}
      </div>
    </section>`;
  }

  /* ---------------- 分段 2：知识点明细 + 阶段变化 ---------------- */
  function segKnowledge(state, classId, view, overview) {
    var range = currentRange(state, classId);
    var students = sel.classStudents(view, classId);
    var pendingByKp = pendingAnswerByKp(view);
    var detailRows = focusRowsOf(overview.kpRows);

    var detailTable = ui.table({
      rowAttrs: function (row) {
        return 'class="is-clickable" data-kp="' + row.kp.id + '" tabindex="0" role="button"';
      },
      columns: [
        {
          key: 'kpName', label: '知识点', width: '180px', render: function (row) {
            return html`<div><span class="cell-strong">${row.kp.code}</span> ${row.kp.name}</div><span class="cell-sub">${row.kp.difficulty}</span>`;
          }
        },
        {
          key: 'coverage', label: '覆盖', align: 'right', width: '82px', render: function (row) {
            return html`<div class="num">${pct(row.coverage)}</div><span class="cell-sub">${row.studentsWithRecords}/${students.length} 人</span>`;
          }
        },
        {
          key: 'masteryRate', label: '掌握率', align: 'right', width: '86px', render: function (row) {
            return html`<div class="num">${pct(row.masteryRate)}</div><span class="cell-sub">${row.masteredCount}/${row.studentsJudged} 人</span>`;
          }
        },
        { key: 'weakCount', label: '仍需巩固', align: 'right', width: '78px', render: function (row) { return html`<span class="num">${row.weakCount}</span> 人`; } },
        {
          key: 'accuracy', label: '一次正确率', align: 'right', width: '92px', render: function (row) {
            return html`<div class="num">${pct(row.accuracy)}</div><span class="cell-sub">n=${row.judged}</span>`;
          }
        },
        {
          key: 'errorTypes', label: '主要错误类型', width: '190px', render: function (row) {
            if (!row.errorTypes.length) return html`<span class="muted">暂无归因</span>`;
            return html`${row.errorTypes.slice(0, 2).map(function (e) {
              return ui.badge(e.label + ' ×' + e.count, toneForBadge(e.tone));
            })}`;
          }
        },
        {
          key: 'trend', label: '时间变化', width: '116px', render: function (row) {
            if (!row.trend) return ui.badge('数据不足', 'neutral');
            var delta = row.trend.delta;
            var cls = delta > 0.05 ? 'trend-up' : (delta < -0.05 ? 'trend-down' : 'trend-flat');
            var iconName = delta > 0.05 ? 'arrowUp' : (delta < -0.05 ? 'arrowDown' : 'arrowRight');
            return html`<span class="row-sm ${cls}">${ui.icon(iconName, 13)}<span class="num">${row.trend.from}% → ${row.trend.to}%</span></span>`;
          }
        },
        {
          key: 'pending', label: '待复核', align: 'right', width: '88px', render: function (row) {
            return html`<div class="num">${row.pendingCount} 项</div><span class="cell-sub">作答 ${pendingByKp[row.kp.id] || 0} 条</span>`;
          }
        },
        {
          key: 'status', label: '状态', width: '92px', render: function (row) {
            if (row.records === 0) return ui.badge('无记录', 'neutral');
            if (row.pendingCount > 0) return ui.badge('待复核 ' + row.pendingCount, 'warn');
            if (row.judged < 3 || row.coverage < 0.5) return ui.badge('证据较少', 'neutral');
            return ui.badge('可参考', 'teal');
          }
        }
      ],
      rows: detailRows,
      empty: ui.empty({ compact: true, title: '暂无知识点数据', desc: '当前筛选下没有可统计的知识点记录。' })
    });

    var trend = sel.trendSeries(view, classId);
    var lineBlock = charts.line({
      title: '班级阶段变化：一次正确率与提示使用率',
      desc: '单位：% · 按任务时间顺序排列，仅统计已判分记录',
      series: trend.series,
      xLabels: trend.xLabels,
      height: 220,
      width: 720,
      unit: '%',
      ticks: [0, 25, 50, 75, 100],
      note: '口径：各任务内“一次正确率 = 正确记录 ÷ 可判读记录”“提示使用率 = 有提示记录 ÷ 全部作答记录”；不同任务题目难度不完全可比，趋势仅作参考。时间范围：' + range.text +
        '。' + (trend.xLabels.length < 2 ? '当前筛选只有 ' + trend.xLabels.length + ' 个时间点，暂不判断趋势。' : '')
    });

    return html`<section class="ana-segment">
      <section class="card">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">知识点明细</div>
            <div class="card-desc">点击任意行查看该知识点的证据、学生级记录与教学参考建议</div>
          </div>
          <div class="card-actions">
            ${ui.button({ label: '去复核中心', icon: 'shield', size: 'sm', tone: 'ghost', attrs: 'data-go="#/teacher/review"' })}
            ${ui.button({ label: '导出数据', icon: 'download', size: 'sm', tone: 'ghost', attrs: 'data-go="#/teacher/data?tab=export"' })}
          </div>
        </div>
        <div class="card-body is-flush">${detailTable}</div>
        <div class="card-foot">
          ${ui.icon('info', 14)}
          <span class="tiny muted">掌握率分母为“有可判读记录的学生”；“状态”表示该行结论的数据可用性，不代表学生评价。</span>
        </div>
      </section>
      <section class="card ana-chart-card">
        <div class="card-body is-solo">${lineBlock}</div>
      </section>
    </section>`;
  }

  /* ---------------- 分段 3：错误类型 ---------------- */
  function segErrors(state, classId, view, overview) {
    var range = currentRange(state, classId);
    var errors = sel.errorDistribution(view, classId, { kpId: FILTERS.kpId === 'all' ? null : FILTERS.kpId });
    var wrongTotal = sum(errors, function (e) { return e.count; });
    var top = errors[0] || null;
    var rows = focusRowsOf(overview.kpRows);

    var donutBlock = charts.donut({
      title: '错误类型分布',
      desc: '单位：条 · 占已判分错误记录的比例',
      segments: errors.map(function (e) {
        return { label: e.label + '（' + e.count + '）', value: e.count, tone: toneForBadge(e.tone) };
      }),
      centerValue: wrongTotal,
      centerLabel: '已判分错误记录',
      emptyText: '当前筛选下暂无可归因的错误记录',
      note: '仅统计已判分错误记录；待复核记录不计入。样本：' + overview.judged + ' 条可判读记录中的 ' + wrongTotal +
        ' 条错误；时间范围：' + range.text + '。未分类错误计入“待教师归因”。'
    });

    var errTable = ui.table({
      className: 'is-compact',
      columns: [
        {
          key: 'kp', label: '知识点', render: function (row) {
            return html`<span class="cell-strong">${row.kp.code}</span> ${row.kp.name}`;
          }
        },
        { key: 'judged', label: '可判读记录', align: 'right', render: function (row) { return row.judged + ' 条'; } },
        {
          key: 'errorTypes', label: '主要错误类型', render: function (row) {
            if (!row.errorTypes.length) return html`<span class="muted">暂无归因</span>`;
            return html`${row.errorTypes.slice(0, 3).map(function (e) {
              return ui.badge(e.label + ' ×' + e.count, toneForBadge(e.tone));
            })}`;
          }
        }
      ],
      rows: rows,
      empty: ui.empty({ compact: true, title: '暂无知识点数据', desc: '当前筛选下没有可统计的知识点记录。' })
    });

    var conclusion = top
      ? '错误最集中在「' + top.label + '」' + top.count + ' 条（占错误记录 ' + pct(top.ratio) + '）；共 ' + errors.length + ' 类错误，样本 ' + wrongTotal + ' 条。'
      : '当前筛选下没有可归因的错误记录，暂不形成结论。';

    return html`<section class="ana-segment">
      <div class="page-lead is-neutral">${ui.icon('info', 15)}<div class="page-lead-text">${conclusion}</div></div>
      <div class="grid-2">
        <section class="card ana-chart-card"><div class="card-body is-solo">${donutBlock}</div></section>
        <section class="card">
          <div class="card-head">
            <div class="card-head-main">
              <div class="card-title">各知识点主要错误类型</div>
              <div class="card-desc">用于确定讲评重点；仅统计已判分错误记录</div>
            </div>
          </div>
          <div class="card-body">${errTable}</div>
        </section>
      </div>
      ${ui.disclosure({
        summary: '错误类型统计口径与教学参考',
        count: '2 条',
        body: html`<div class="stack-sm small muted">
          <div>错误类型来自题目预设的错误标签（概念理解 / 计算·符号 / 步骤遗漏 / 审题偏差 / 方法选择 / 迁移困难等）；系统无法归因时记为「待教师归因」，不强行分类。</div>
          <div>教学参考：${top ? (ERROR_ADVICE[top.key] || ERROR_ADVICE.unclassified) : '暂无足够错误记录，建议先抽查 3—5 份典型作答。'}（参考建议，最终教学决定由教师作出。）</div>
        </div>`
      })}
    </section>`;
  }

  /* ---------------- 分段 4：学生差异 ---------------- */
  function segStudents(state, classId, view, overview) {
    var range = currentRange(state, classId);
    var students = sel.classStudents(view, classId);
    var rows = focusRowsOf(overview.kpRows);
    var diags = sel.classDiagnostics(view, classId);
    var diagMap = {};
    diags.forEach(function (d) { diagMap[d.studentId + '|' + d.kpId] = d; });

    var hmWidth = 118 + rows.length * 128;
    var heatRows = students.map(function (st) {
      return {
        label: st.name,
        cells: rows.map(function (row) {
          var d = diagMap[st.id + '|' + row.kp.id];
          var value = d ? PERF_SCORE[d.performance] : null;
          if (value === undefined) value = null;
          return { value: value, label: value === null ? '—' : String(value) };
        })
      };
    });
    var heatmapBlock = charts.heatmap({
      title: '知识点 × 学生表现热力图',
      desc: '行 = 学生（' + students.length + ' 人）· 列 = 知识点代号 · 单元格为表现映射值（0–100，非百分制得分）',
      width: hmWidth,
      labelWidth: 92,
      cellHeight: 30,
      rows: heatRows,
      cols: rows.map(function (row) { return row.kp.code; }),
      legend: [
        { label: '90 独立 / 稳定完成', color: 'var(--teal-100)' },
        { label: '65–70 提示或反复尝试后完成', color: 'var(--teal-50)' },
        { label: '35 仍需巩固', color: 'var(--danger-50)' },
        { label: '灰 — 记录不足（≠不会）', color: 'var(--bg-soft)' }
      ],
      note: '样本：每位学生每个知识点可判读记录 0–4 条；时间范围：' + range.text + '。'
    });
    var kpLegend = html`<div class="ana-kp-legend">
      ${rows.map(function (row) {
        return html`<span><b>${row.kp.code}</b> ${row.kp.name}</span>`;
      })}
    </div>`;

    var attention = overview.attention.slice(0, 8);
    var attentionTable = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'student', label: '学生', render: function (item) { return html`<span class="cell-strong">${item.student.name}</span>`; } },
        { key: 'weakCount', label: '需巩固知识点', align: 'right', render: function (item) { return item.weakCount + ' 个'; } },
        {
          key: 'focus', label: '主要知识点', render: function (item) {
            if (!item.focus.length) return '—';
            return html`${item.focus.map(function (d) { return ui.badge(d.kpName, 'warn'); })}`;
          }
        },
        { key: 'pending', label: '待复核作答', align: 'right', render: function (item) { return item.pending + ' 条'; } },
        {
          key: 'ops', label: '操作', render: function (item) {
            return html`${ui.button({ label: '查看档案', size: 'sm', tone: 'ghost', attrs: 'data-go="#/teacher/profile?student=' + item.student.id + '"' })}`;
          }
        }
      ],
      rows: attention,
      empty: ui.empty({ compact: true, icon: 'checkCircle', title: '暂无需要重点关注的学生', desc: '当前筛选下没有“仍需巩固”相关的可判读记录。' })
    });

    return html`<section class="ana-segment">
      <section class="card ana-chart-card">
        <div class="card-body is-solo">
          <div class="ana-heat-wrap" style="max-width:${hmWidth}px">
            ${heatmapBlock}
          </div>
          ${kpLegend}
        </div>
      </section>
      ${ui.disclosure({
        summary: '热力图映射规则',
        count: '映射说明',
        body: html`<div class="small muted">secure / independent = 90；after-hint = 70；retry = 65；difficulty = 35；insufficient / not-learned = 空（灰色显示“—”）。<b>灰色 = 记录不足或不在当前教学范围，不等同于“不会”</b>；单元格数值是表现映射值，不是百分制得分。</div>`
      })}
      <section class="card">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">目前仍需巩固的学生</div>
            <div class="card-desc">按“仍需巩固”知识点数量排序，用于安排个别辅导；不构成排名或固定标签</div>
          </div>
        </div>
        <div class="card-body is-flush">${attentionTable}</div>
      </section>
    </section>`;
  }

  /* ---------------- 分段 5：证据与待核实 ---------------- */
  function segEvidence(state, classId, view, overview) {
    var range = currentRange(state, classId);
    var students = sel.classStudents(view, classId);
    var kps = sel.inScopeKps(state, classId);
    var allKps = state.knowledgePoints || [];
    var excluded = allKps.filter(function (kp) {
      return kps.every(function (item) { return item.id !== kp.id; });
    });
    var chapters = chaptersOf(state, classId);
    var scopeLabel = chapterRangeLabel(chapters);
    var excludedText = excluded.length
      ? excluded.map(function (kp) { return kp.code + ' ' + kp.name; }).join('、')
      : '无';

    var diags = sel.classDiagnostics(view, classId);
    var statusCounts = { sufficient: 0, preliminary: 0, pending: 0, undetermined: 0 };
    diags.forEach(function (d) { if (statusCounts[d.status] !== undefined) statusCounts[d.status]++; });
    var statusDesc = {
      sufficient: '记录 ≥ 3 条且方向一致，可作为主要参考。',
      preliminary: '可判读记录 1–2 条，属于初步判断，需要更多记录确认。',
      pending: '存在待复核作答或识别异常，复核后结论可能调整。',
      undetermined: '无有效记录或记录不足，暂不形成结论（缺失≠答错）。'
    };
    var statusRows = [
      { key: 'sufficient', label: '证据充分', count: statusCounts.sufficient, tone: 'teal', action: '查看知识点明细', seg: 'kps' },
      { key: 'preliminary', label: '初步判断', count: statusCounts.preliminary, tone: 'primary', action: '查看知识点明细', seg: 'kps' },
      { key: 'pending', label: '待复核', count: statusCounts.pending, tone: 'warn', action: '去复核中心', href: '#/teacher/review?filter=pending' },
      { key: 'undetermined', label: '暂无法判断', count: statusCounts.undetermined, tone: 'neutral', action: '查看学生差异', seg: 'students' }
    ];

    var statusBlock = html`<div class="ana-status-grid">
      ${statusRows.map(function (s) {
        return html`<div class="ana-status-card">
          <div class="row-sm row-wrap">
            ${ui.statusBadge(s.key, s.label)}
            <span class="num strong">${s.count} 项</span>
          </div>
          <div class="tiny muted">${statusDesc[s.key]}</div>
          ${s.href
            ? html`<a class="link-btn" href="${s.href}">${s.action}${ui.icon('chevronRight', 13)}</a>`
            : html`<button type="button" class="link-btn" data-seg-go="${s.seg}">${s.action}${ui.icon('chevronRight', 13)}</button>`}
        </div>`;
      })}
    </div>`;

    var tasksWithRecords = overview.tasks.filter(function (t) {
      return (view.answers || []).some(function (a) {
        return a.taskId === t.id && a.score !== null && a.score !== undefined;
      });
    }).length;
    var coveredKps = overview.kpRows.filter(function (row) { return row.records > 0; }).length;
    var covItems = [
      { label: '学生覆盖', value: overview.activeStudents + ' / ' + students.length, sub: pct(overview.studentCount ? overview.activeStudents / overview.studentCount : null) + ' 名学生有作答记录' },
      { label: '任务覆盖', value: tasksWithRecords + ' / ' + overview.tasks.length, sub: '有可判读记录的任务数' },
      { label: '知识点覆盖', value: coveredKps + ' / ' + kps.length, sub: '有作答记录的范围内知识点' },
      { label: '可判读记录', value: overview.judged + ' / ' + overview.records, sub: '待复核与未判读记录不计入结论' },
      { label: '待复核批阅', value: overview.pendingGrades + ' 条', sub: '过程题或识别质量低，需人工确认' },
      { label: '待确认诊断', value: overview.pendingDiagnoses + ' 项', sub: '证据不足或多数记录待复核' }
    ];

    var pendingList = sel.pendingReviews(view, { classId: classId, type: 'diagnosis' }).slice().sort(function (a, b) {
      var rank = { pending: 0, preliminary: 1 };
      return (rank[a.diag.status] - rank[b.diag.status]) || (b.diag.evidence.records - a.diag.evidence.records);
    }).slice(0, 8);

    var pendingTable = ui.table({
      className: 'is-compact',
      columns: [
        {
          key: 'student', label: '学生', render: function (item) {
            return html`<span class="cell-strong">${item.student ? item.student.name : item.diag.studentId}</span>`;
          }
        },
        { key: 'kp', label: '知识点', render: function (item) { return item.diag.kpName; } },
        { key: 'performance', label: '表现', render: function (item) { return ui.badge(item.diag.performanceLabel, toneForBadge(item.diag.performanceTone)); } },
        { key: 'status', label: '状态', render: function (item) { return statusBadgeOf(item.diag); } },
        { key: 'records', label: '可判读', align: 'right', render: function (item) { return item.diag.evidence.judged + ' / ' + item.diag.evidence.records; } },
        {
          key: 'ops', label: '操作', render: function (item) {
            return html`<div class="ana-row-actions">
              ${ui.button({ label: '查看档案', size: 'sm', tone: 'ghost', attrs: 'data-go="#/teacher/profile?student=' + item.diag.studentId + '"' })}
              ${ui.button({ label: '去复核', size: 'sm', tone: 'ghost', attrs: 'data-go="#/teacher/review?student=' + item.diag.studentId + '"' })}
            </div>`;
          }
        }
      ],
      rows: pendingList,
      empty: ui.empty({ compact: true, icon: 'checkCircle', title: '当前筛选下没有待复核诊断', desc: '诊断结论均已确认，或记录不足以形成待复核项。' })
    });

    return html`<section class="ana-segment">
      <section class="plain-block">
        <div class="plain-head">
          <div class="plain-title">诊断状态分布</div>
          <span class="tiny muted">共 ${diags.length} 项诊断 · 每项均标注数据可用性</span>
        </div>
        ${statusBlock}
      </section>

      <section class="card">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">数据覆盖与待核实项</div>
            <div class="card-desc">覆盖不足的知识点不建议直接据此作班级统一教学判断</div>
          </div>
        </div>
        <div class="card-body">
          <div class="ana-cov-grid">
            ${covItems.map(function (item) {
              return html`<div class="ana-cov">
                <div class="ana-cov-label">${item.label}</div>
                <div class="ana-cov-value num">${item.value}</div>
                <div class="ana-cov-sub">${item.sub}</div>
              </div>`;
            })}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">待复核诊断（优先处理）</div>
            <div class="card-desc">状态为“待复核”或“初步判断”的记录，前 ${pendingList.length || 8} 项</div>
          </div>
          <div class="card-actions">
            ${ui.button({ label: '复核中心', icon: 'shield', size: 'sm', attrs: 'data-go="#/teacher/review"' })}
            ${ui.button({ label: '导出数据', icon: 'download', size: 'sm', tone: 'ghost', attrs: 'data-go="#/teacher/data?tab=export"' })}
          </div>
        </div>
        <div class="card-body is-flush">${pendingTable}</div>
      </section>

      ${ui.disclosure({
        summary: '数据口径与待核实信息',
        count: '5 条',
        body: html`<ul class="ana-bullets">
          <li>样本：本班 ${overview.studentCount} 名学生、${overview.tasks.length} 个任务、${(state.questions || []).length} 道题、${overview.records} 条作答；当前筛选「${range.title}」（${range.text}）内可判读 ${overview.judged} 条。</li>
          <li>缺失记录与待复核的过程题<b>不计为答错</b>；目前待复核批阅 ${overview.pendingGrades} 条、待确认诊断 ${overview.pendingDiagnoses} 项，复核后相关结论可能调整。</li>
          <li>掌握率只以“有可判读记录的学生”为分母；记录数少于 3 条或覆盖低于 50% 的知识点，结论仅作参考。</li>
          <li>教材版本与教学范围（${scopeLabel}）<b>待教师确认</b>；未纳入范围：${excludedText}，不参与正式诊断结论。</li>
          <li>本页全部数据为虚构模拟数据，仅用于产品演示，不代表真实学情；图表由规则引擎从原始作答实时派生，未接入真实大模型。</li>
        </ul>`
      })}
    </section>`;
  }

  /* ---------------- 知识点证据抽屉 ---------------- */
  function openKpDrawer(ctx, kpId) {
    var state = ctx.state;
    var classId = classIdOf(ctx);
    var view = viewState(state);
    var kpRows = sel.kpAnalysis(view, classId);
    var row = null;
    for (var i = 0; i < kpRows.length; i++) if (kpRows[i].kp.id === kpId) row = kpRows[i];
    if (!row) return;

    var students = sel.classStudents(view, classId);
    var range = currentRange(state, classId);
    var diags = sel.classDiagnostics(view, classId).filter(function (d) { return d.kpId === kpId; });
    var pendingByKp = pendingAnswerByKp(view);
    var top = row.errorTypes[0];
    var advice = top ? (ERROR_ADVICE[top.key] || ERROR_ADVICE.unclassified)
      : '建议先抽查 3—5 份典型作答，人工确认错误类型后再确定讲评重点。';
    var errText = row.errorTypes.length
      ? row.errorTypes.map(function (e) { return e.label + ' ×' + e.count; }).join('、')
      : '暂无可归因错误';

    var evidenceItems = [
      '记录 ' + row.records + ' 条，其中可判读 ' + row.judged + ' 条；待复核批阅 ' + (pendingByKp[kpId] || 0) + ' 条、待复核诊断 ' + row.pendingCount + ' 项。',
      '掌握率 ' + pct(row.masteryRate) + '（分母：有可判读记录的 ' + row.studentsJudged + ' 名学生）；仍需巩固 ' + row.weakCount + ' 人、掌握较稳定/独立 ' + row.masteredCount + ' 人。',
      '一次正确率 ' + pct(row.accuracy) + '（' + row.judged + ' 条可判读记录）。',
      '数据覆盖：' + row.studentsWithRecords + ' / ' + students.length + ' 名学生有记录（' + pct(row.coverage) + '）。',
      '主要错误类型：' + errText + '。',
      row.trend ? '时间变化：前段 ' + row.trend.from + '% → 后段 ' + row.trend.to + '%（n=' + row.trend.n + ' 条可判读记录）。'
        : '时间变化：可判读记录不足 6 条或只有一个时间段，暂不判断趋势。',
      '内容范围：' + row.chapterName + ' · 难度 ' + row.kp.difficulty + ' · 当前教学范围内。'
    ];

    var rank = { difficulty: 0, 'after-hint': 1, retry: 2, independent: 3, secure: 4, insufficient: 5, 'not-learned': 6 };
    var studentRows = diags.filter(function (d) { return d.evidence.records > 0; }).map(function (d) {
      var st = sel.student(view, d.studentId);
      return { name: st ? st.name : d.studentId, diag: d };
    }).sort(function (a, b) {
      return (rank[a.diag.performance] - rank[b.diag.performance]) || (a.diag.studentId < b.diag.studentId ? -1 : 1);
    });

    var studentTable = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'student', label: '学生', render: function (item) { return html`<span class="cell-strong">${item.name}</span>`; } },
        { key: 'perf', label: '表现', render: function (item) { return ui.badge(item.diag.performanceLabel, toneForBadge(item.diag.performanceTone)); } },
        { key: 'status', label: '状态', render: function (item) { return statusBadgeOf(item.diag); } },
        { key: 'judged', label: '可判读', align: 'right', render: function (item) { return item.diag.evidence.judged + ' / ' + item.diag.evidence.records; } },
        {
          key: 'quote', label: '主要证据', render: function (item) {
            var quote = item.diag.evidence.quotes[0] || '暂无可展示的作答证据';
            return html`<span class="tiny muted">${fmt.trunc(quote, 46)}</span>`;
          }
        },
        {
          key: 'ops', label: '操作', render: function (item) {
            return html`${ui.button({ label: '档案', size: 'sm', tone: 'ghost', attrs: 'data-drawer-go="#/teacher/profile?student=' + item.diag.studentId + '"' })}`;
          }
        }
      ],
      rows: studentRows,
      empty: ui.empty({ compact: true, title: '暂无学生记录', desc: '当前筛选下该知识点还没有可判读记录。' })
    });

    var body = html`<div class="stack">
      ${ui.banner({
        tone: 'info',
        compact: true,
        body: '以下结论由原始作答实时派生；记录不足或存在待复核记录时会标注为初步 / 暂无法判断。缺失记录不计为答错。'
      })}
      ${ui.evidence({
        title: '知识点级证据（' + (row.pendingCount ? '含待复核记录' : '均为已判读记录') + '）',
        items: evidenceItems,
        coverage: pct(row.coverage)
      })}
      <div class="section">
        <div class="section-head">
          <div class="section-title">学生级证据（仅列出有记录的学生）</div>
        </div>
        ${studentTable}
      </div>
      ${ui.evidence({
        title: '教学参考建议（不替代教师决定）',
        items: [
          advice + '（参考建议，最终教学决定由教师作出。）',
          '适用条件：基于当前筛选「' + range.title + '」的 ' + row.records + ' 条记录；若课堂观察与数据不一致，以教师判断为准。记录少于 3 条时建议先补充练习再判断。'
        ]
      })}
    </div>`;

    var ctl = ui.drawer({
      title: row.kp.name + ' · 诊断依据与建议',
      desc: row.chapterName + ' · 难度 ' + row.kp.difficulty + ' · 时间范围 ' + range.text,
      width: 620,
      body: body.value,
      footer: '<div class="spacer"></div>' +
        ui.button({ label: '按此知识点筛选', tone: 'secondary', size: 'sm', attrs: 'data-drawer-act="filter"' }).value +
        ui.button({ label: '去复核中心', tone: 'primary', size: 'sm', attrs: 'data-drawer-act="review"' }).value,
      onMount: function (bodyEl, control) {
        var filterBtn = control.el.querySelector('[data-drawer-act="filter"]');
        if (filterBtn) {
          filterBtn.addEventListener('click', function () {
            FILTERS.kpId = row.kp.id;
            syncUrl();
            control.close();
            ctx.refresh();
            ui.toast('已按「' + row.kp.name + '」筛选', 'success');
          });
        }
        var reviewBtn = control.el.querySelector('[data-drawer-act="review"]');
        if (reviewBtn) {
          reviewBtn.addEventListener('click', function () {
            control.close();
            ctx.navigate('#/teacher/review?kp=' + row.kp.id);
          });
        }
        bodyEl.querySelectorAll('[data-drawer-go]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            control.close();
            ctx.navigate(btn.getAttribute('data-drawer-go'));
          });
        });
      }
    });
    return ctl;
  }

  /* ---------------- 页面注册 ---------------- */
  ZWZ.pages.register('teacher/analysis', {
    title: '班级学情分析',
    subtitle: '教师端 · 仅本班教师可见',
    render: function (ctx) {
      var state = ctx.state;
      var classId = classIdOf(ctx);
      initFilters(ctx, state);

      var view = viewState(state);
      var overview = sel.classOverview(view, classId);
      var range = currentRange(state, classId);
      var chapters = chaptersOf(state, classId);
      var scopeLabel = chapterRangeLabel(chapters);

      var body;
      if (FILTERS.seg === 'kps') body = segKnowledge(state, classId, view, overview);
      else if (FILTERS.seg === 'errors') body = segErrors(state, classId, view, overview);
      else if (FILTERS.seg === 'students') body = segStudents(state, classId, view, overview);
      else if (FILTERS.seg === 'evidence') body = segEvidence(state, classId, view, overview);
      else body = segOverview(state, classId, view, overview);

      return html`<div class="page ana-analysis">
        <div class="page-head">
          <div class="page-head-main">
            <h1 class="page-title">班级学情分析</h1>
            <div class="page-desc">${scopeLabel}（待教师确认）· ${range.text} · 当前分段：${SEG_LABELS[FILTERS.seg] || '概览'}</div>
          </div>
          <div class="page-actions">
            ${ui.button({ label: '导出班级报告', icon: 'download', tone: 'secondary', attrs: 'data-go="#/teacher/data?tab=export"' })}
            ${ui.button({ label: '去复核中心', icon: 'shield', tone: 'primary', attrs: 'data-go="#/teacher/review"' })}
          </div>
        </div>

        ${renderFilterBar(state, classId, overview)}
        ${renderSegNav(view, classId, overview)}
        ${body}
      </div>`;
    },
    mount: function (root, ctx) {
      /* 时间区间切换 */
      var seg = root.querySelector('[data-range-group]');
      if (seg) {
        seg.addEventListener('click', function (ev) {
          var btn = ev.target.closest ? ev.target.closest('[data-range]') : null;
          if (!btn) return;
          var next = btn.getAttribute('data-range');
          if (next === FILTERS.range) return;
          FILTERS.range = next;
          syncUrl();
          ctx.refresh();
        });
      }

      /* 知识点筛选 */
      var kpSelect = root.querySelector('#ana-kp');
      if (kpSelect) {
        kpSelect.addEventListener('change', function () {
          FILTERS.kpId = kpSelect.value || 'all';
          syncUrl();
          ctx.refresh();
        });
      }

      /* 班级切换（原型预留） */
      var classSelect = root.querySelector('#ana-class');
      if (classSelect) {
        classSelect.addEventListener('change', function () {
          ui.toast('演示数据仅包含 1 个班级，切换班级为原型预留能力', 'info');
        });
      }

      /* 分段切换：保留 class / range / kp 筛选，写入 URL */
      ui.bindTabs(root, 'ana-seg', function (key) {
        if (!key || key === FILTERS.seg) return;
        FILTERS.seg = key;
        syncUrl();
        ctx.refresh();
      });

      /* 分段内跳转按钮（如概览 → 知识点） */
      ui.bind(root, '[data-seg-go]', 'click', function (ev, el) {
        var key = el.getAttribute('data-seg-go');
        if (!key || key === FILTERS.seg) return;
        FILTERS.seg = key;
        syncUrl();
        ctx.refresh();
      });

      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        ev.stopPropagation();
        ctx.navigate(el.getAttribute('data-go'));
      });

      ui.bind(root, '[data-act="refresh"]', 'click', function () {
        ui.toast('已按当前筛选重新计算', 'info');
        ctx.refresh();
      });

      /* 知识点明细行 → 证据抽屉（键盘 Enter 同样可打开） */
      root.querySelectorAll('tr[data-kp]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          openKpDrawer(ctx, tr.getAttribute('data-kp'));
        });
        tr.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            openKpDrawer(ctx, tr.getAttribute('data-kp'));
          }
        });
      });
    }
  });
})();

