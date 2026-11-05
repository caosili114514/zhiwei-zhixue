/* ============================================================
   学生端 · 我的档案（student/archive）
   ------------------------------------------------------------
   第一轮 UI 优化（2026-11-05）：
   - 首屏：1 句阶段结论 + 关键指标带 + 3 个需关注知识点（含表现/状态/证据数量）；
   - 筛选压缩为一行（时间范围 / 知识点 / 错误类型 / 完成方式 + 重置），并持续展示当前筛选；
   - 完整知识点表、错误类型分布、完成方式统计、变化趋势收进带数量提示的折叠区；
   - 趋势谨慎表达：数据点不足时显示「记录不足，暂无法判断」，不制造进步/退步结论；
   - 不排名、不贴固定能力标签；数据仍全部实时派生，诊断规则与权限未改动。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var html = ZWZ.html;
  var raw = ZWZ.raw;
  var esc = ZWZ.esc;
  var fmt = ZWZ.fmt;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;
  var charts = ZWZ.charts;
  var diagnosis = ZWZ.diagnosis;

  var ERROR_TYPES = (diagnosis && diagnosis.ERROR_TYPES) || [];

  var MEM = {
    kpId: 'all',
    errorType: 'all',
    range: 'all',
    mode: 'all',
    tableRows: []
  };

  /* ---------------- 工具 ---------------- */
  function rangeLabel(task) {
    var title = String((task && task.title) || '');
    if (title.indexOf('订正') >= 0) return '订正再练';
    if (title.indexOf('单元测评') >= 0) return '单元测评';
    if (title.indexOf('课后巩固') >= 0) return '课后巩固';
    return fmt.trunc(title, 8);
  }

  function practiceUrl(taskId, questionId) {
    var url = '#/student/practice';
    var params = [];
    if (taskId) params.push('task=' + encodeURIComponent(taskId));
    if (questionId) params.push('question=' + encodeURIComponent(questionId));
    if (params.length) url += '?' + params.join('&');
    return url;
  }

  function kpIdsOfTask(state, task) {
    var set = {};
    (task.questionIds || []).forEach(function (qid) {
      var q = sel.question(state, qid);
      if (!q) return;
      (q.kpIds || []).forEach(function (kpId) { set[kpId] = true; });
    });
    return set;
  }

  function errorTagOf(state, answer) {
    if (answer.errorTag) return answer.errorTag;
    var q = sel.question(state, answer.questionId);
    if (q && (q.errorTags || []).length === 1) return q.errorTags[0];
    return 'unclassified';
  }

  /** 本人错误类型分布（仅统计已判分且判为错误的记录） */
  function ownErrorDistribution(state, studentId, taskId) {
    var counts = {};
    var answered = 0;
    var wrongTotal = 0;
    sel.answers(state, { studentId: studentId, taskId: taskId }).forEach(function (a) {
      if (a.score === null || a.score === undefined) return;
      answered++;
      if (sel.isCorrect(a)) return;
      var tag = errorTagOf(state, a);
      counts[tag] = (counts[tag] || 0) + 1;
      wrongTotal++;
    });
    var items = Object.keys(counts).map(function (key) {
      return {
        key: key,
        label: diagnosis.errorLabel(key),
        tone: diagnosis.errorTone(key),
        count: counts[key]
      };
    }).sort(function (a, b) { return b.count - a.count; });
    return { items: items, total: wrongTotal, answered: answered };
  }

  function completionStats(state, studentId, taskId) {
    var out = { independent: 0, hint: 0, retry: 0, total: 0 };
    sel.answers(state, { studentId: studentId, taskId: taskId }).forEach(function (a) {
      out.total++;
      var attempts = a.attempts || 1;
      var hints = (a.hintLevels || []).length;
      if (attempts > 1) out.retry++;
      else if (hints > 0) out.hint++;
      else out.independent++;
    });
    return out;
  }

  function wrongAnswers(state, studentId, taskId, errorType) {
    return sel.answers(state, { studentId: studentId, taskId: taskId })
      .filter(function (a) { return a.score !== null && a.score !== undefined && !sel.isCorrect(a); })
      .filter(function (a) { return errorType === 'all' || errorTagOf(state, a) === errorType; })
      .sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); })
      .slice(0, 8);
  }

  function questionTargetForKp(state, studentId, kpId, preferredTaskId) {
    var tasks = sel.tasksForStudent(state, studentId);
    var ordered = tasks.slice().sort(function (a, b) {
      if (a.id === preferredTaskId) return -1;
      if (b.id === preferredTaskId) return 1;
      return 0;
    });
    var fallback = null;
    for (var i = 0; i < ordered.length; i++) {
      var task = ordered[i];
      var qids = task.questionIds || [];
      for (var j = 0; j < qids.length; j++) {
        var q = sel.question(state, qids[j]);
        if (!q || (q.kpIds || []).indexOf(kpId) < 0) continue;
        var url = practiceUrl(task.id, q.id);
        var answered = sel.answers(state, { studentId: studentId, taskId: task.id, questionId: q.id }).length > 0;
        if (!answered) return url;
        if (!fallback) fallback = url;
      }
    }
    return fallback || '#/student/practice';
  }

  /* 完成方式筛选：按知识点累计记录中的提示使用 / 反复尝试情况归类（互斥、不重复计数） */
  function matchesMode(d, mode) {
    if (mode === 'all') return true;
    var performance = d.performance;
    var hints = d.evidence.hintUsed || 0;
    var retries = d.evidence.retries || 0;
    if (mode === 'retry') return retries > 0;
    if (mode === 'hint') return hints > 0 && retries === 0;
    if (mode === 'independent') {
      return hints === 0 && retries === 0 && performance !== 'insufficient' && performance !== 'not-learned';
    }
    return true;
  }

  /* ---------------- 诊断证据抽屉 ---------------- */
  function openDiagDrawer(ctx, state, d) {
    var target = questionTargetForKp(state, ctx.session.userId, d.kpId, null);
    var errorHtml = d.errorTypes.length
      ? html`<div class="chip-row">${d.errorTypes.map(function (e) { return ui.badge(e.label + ' ×' + e.count, e.tone); })}</div>`
      : html`<span class="small muted">当前没有可归因的错误类型记录。</span>`;

    var body = html`<div class="stack">
      <div class="row-sm row-wrap">
        ${ui.badge(d.performanceLabel, d.performanceTone)}
        ${ui.statusBadge(d.status)}
        ${ui.badge(d.scope === 'in-scope' ? '当前教学范围' : '尚未纳入当前教学范围', d.scope === 'in-scope' ? 'neutral' : 'warn')}
      </div>
      ${d.scope === 'extended'
        ? ui.banner({
            tone: 'warn',
            compact: true,
            title: '不在当前教学范围',
            body: '该知识点尚未纳入当前教学进度，相关记录仅作展示，不参与正式学情诊断结论。'
          })
        : ''}
      <div class="stu-drawer-stats">
        <div class="stat-line"><span class="k">章节</span><span class="v">${d.chapterName || '—'}</span></div>
        <div class="stat-line"><span class="k">相关记录数 / 可判读</span><span class="v num">${d.evidence.records} / ${d.evidence.judged}</span></div>
        <div class="stat-line"><span class="k">其中待复核</span><span class="v num">${d.evidence.pending}</span></div>
        <div class="stat-line"><span class="k">提示使用 / 反复尝试</span><span class="v num">${d.evidence.hintUsed} / ${d.evidence.retries}</span></div>
        <div class="stat-line"><span class="k">最近更新</span><span class="v num">${d.updatedAt ? fmt.datetime(d.updatedAt) : '—'}</span></div>
        <div class="stat-line"><span class="k">教师复核</span><span class="v">${d.reviewed ? '已复核' : '未复核'}</span></div>
      </div>
      <div class="field">
        <div class="label">错误类型</div>
        ${errorHtml}
      </div>
      ${ui.evidence({
        title: '诊断依据（可核查记录）',
        items: d.evidence.quotes || [],
        status: d.status,
        coverage: d.evidence.coverageText
      })}
      ${ui.banner({ tone: 'info', title: '下一步建议', body: d.suggestion })}
      ${d.reviewed && d.teacherNote
        ? ui.banner({ tone: 'success', compact: true, title: '教师复核备注', body: d.teacherNote })
        : ''}
      <div class="tiny muted">口径：诊断由规则引擎基于累计作答记录实时派生；记录数较少时为“初步判断”，暂无法判读的记录不会计为答错，单条记录不形成结论。</div>
    </div>`;

    ui.drawer({
      title: d.kpName + ' · 学情证据',
      desc: (d.chapterName || '') + ' · ' + d.statusLabel,
      width: 540,
      body: body.value,
      footer: '<div class="spacer"></div>' +
        '<button type="button" class="btn btn-secondary" data-close>关闭</button>' +
        '<button type="button" class="btn btn-primary" data-act="to-practice">去练习</button>',
      onMount: function (bodyEl, controller) {
        var btn = controller.footer && controller.footer.querySelector('[data-act="to-practice"]');
        if (btn) {
          btn.addEventListener('click', function () {
            controller.close();
            ctx.navigate(target);
          });
        }
      }
    });
  }

  /* ---------------- 页面 ---------------- */
  ZWZ.pages.register('student/archive', {
    title: '我的档案',

    render: function (ctx) {
      var state = ctx.state;
      var studentId = ctx.session.userId;
      var overview = sel.studentOverview(state, studentId);
      var stats = overview.stats;
      var allDiags = sel.diagnostics(state, { studentId: studentId });
      var tasks = sel.tasksForStudent(state, studentId);

      var extended = allDiags.filter(function (d) { return d.scope === 'extended'; });
      var inScope = allDiags.filter(function (d) { return d.scope === 'in-scope'; });

      /* ---- 筛选条件 ---- */
      var rangeItems = [{ key: 'all', label: '全部' }].concat(tasks.map(function (t) {
        return { key: t.id, label: rangeLabel(t) };
      }));
      var modeItems = [
        { key: 'all', label: '全部完成方式' },
        { key: 'independent', label: '独立完成' },
        { key: 'hint', label: '提示后完成' },
        { key: 'retry', label: '反复尝试' }
      ];

      var activeTask = MEM.range === 'all' ? null : sel.task(state, MEM.range);
      var taskKpSet = activeTask ? kpIdsOfTask(state, activeTask) : null;

      var rows = allDiags.filter(function (d) {
        if (MEM.kpId !== 'all' && d.kpId !== MEM.kpId) return false;
        if (taskKpSet && !taskKpSet[d.kpId]) return false;
        if (!matchesMode(d, MEM.mode)) return false;
        if (MEM.errorType !== 'all' && !d.errorTypes.some(function (e) { return e.key === MEM.errorType; })) return false;
        return true;
      });
      MEM.tableRows = rows;

      /* ---- 阶段结论（不制造进步/退步结论） ---- */
      var difficultyCount = inScope.filter(function (d) { return d.performance === 'difficulty'; }).length;
      var observeCount = inScope.filter(function (d) { return d.performance === 'after-hint' || d.performance === 'retry'; }).length;
      var insufficientCount = inScope.filter(function (d) { return d.performance === 'insufficient' || d.performance === 'not-learned'; }).length;
      var accText = stats.accuracy === null ? '—' : fmt.pct(stats.accuracy);
      var conclusion = stats.records === 0
        ? '还没有练习记录；完成练习并提交后，这里会形成阶段结论与知识点档案。'
        : '累计 ' + stats.judged + ' 条可判读记录，一次正确 ' + stats.correct + ' 条（' + accText + '）；' +
          inScope.length + ' 个知识点中 ' + difficultyCount + ' 个仍需继续巩固、' + observeCount + ' 个在提示或反复尝试后完成（独立程度待观察）' +
          (insufficientCount ? '、' + insufficientCount + ' 个记录不足' : '') +
          (stats.pendingReviews ? '；另有 ' + stats.pendingReviews + ' 条作答待教师复核。' : '。');

      var statStrip = ui.statStrip([
        { label: '可判读记录', value: stats.judged, unit: '条', sub: '共 ' + stats.records + ' 条作答' },
        { label: '一次正确率', value: stats.accuracy === null ? '—' : fmt.pct(stats.accuracy), sub: stats.correct + ' / ' + stats.judged + ' 条可判读', tone: stats.accuracy !== null && stats.accuracy >= 0.8 ? 'teal' : 'primary' },
        { label: '已覆盖知识点', value: (stats.coveredKpCount || 0) + ' / ' + (stats.scopeKpCount || inScope.length), unit: '个', sub: '有可判读记录' },
        { label: '待教师复核', value: stats.pendingReviews, unit: '条', sub: '复核后结论可能调整' }
      ]);

      /* ---- 首屏重点知识点（前 3，含表现/状态/证据数量） ---- */
      var focusAll = overview.focus || [];
      var focus = focusAll.slice(0, 3);
      var focusRows = focus.length
        ? html`<div class="stu-report-focus-list">
            ${focus.map(function (d) {
              var target = questionTargetForKp(state, studentId, d.kpId, activeTask ? activeTask.id : null);
              return html`<div class="stu-report-focus">
                <div class="stu-report-focus-main">
                  <div class="stu-report-focus-head">
                    <span class="stu-report-focus-kp">${d.kpName}</span>
                    ${ui.badge(d.performanceLabel, d.performanceTone)}
                    ${ui.statusBadge(d.status)}
                    <span class="stu-report-focus-meta num">记录 ${d.evidence.records} 条 · 可判读 ${d.evidence.judged} 条</span>
                  </div>
                  <div class="stu-report-focus-action">
                    <span class="small muted">${fmt.trunc(d.suggestion, 40)}</span>
                    <button type="button" class="link-btn" data-kp-row="${d.kpId}">查看依据</button>
                    <a class="link-btn" href="${target}">去练习</a>
                  </div>
                </div>
              </div>`;
            })}
          </div>`
        : ui.empty({
            icon: 'checkCircle',
            compact: true,
            title: '当前记录未显示需要优先关注的知识点',
            desc: '记录不足时不会下结论；可继续练习后再查看。'
          });

      var focusBlock = html`<section class="plain-block">
        <div class="plain-head">
          <div class="plain-title">需关注知识点</div>
          <div class="plain-actions">
            <span class="tiny muted">按累计记录排序，共 ${focusAll.length} 项</span>
            <button type="button" class="link-btn" data-act="show-table">查看完整知识点表现（${allDiags.length} 个）${ui.icon('chevronRight', 13)}</button>
          </div>
        </div>
        ${focusRows}
      </section>`;

      /* ---- 筛选条（一行 + 当前筛选） ---- */
      var kpOptions = '<option value="all"' + (MEM.kpId === 'all' ? ' selected' : '') + '>全部知识点</option>' +
        allDiags.map(function (d) {
          return '<option value="' + esc(d.kpId) + '"' + (MEM.kpId === d.kpId ? ' selected' : '') + '>' + esc(d.kpName) + (d.scope === 'extended' ? '（未纳入范围）' : '') + '</option>';
        }).join('');
      var errorOptions = '<option value="all"' + (MEM.errorType === 'all' ? ' selected' : '') + '>全部错误类型</option>' +
        ERROR_TYPES.map(function (t) {
          return '<option value="' + esc(t.key) + '"' + (MEM.errorType === t.key ? ' selected' : '') + '>' + esc(t.label) + '</option>';
        }).join('');
      var modeOptions = modeItems.map(function (item) {
        return '<option value="' + esc(item.key) + '"' + (MEM.mode === item.key ? ' selected' : '') + '>' + esc(item.label) + '</option>';
      }).join('');

      var rangeSeg = rangeItems.map(function (item) {
        return html`<button type="button" class="seg-item ${item.key === MEM.range ? 'is-active' : ''}" data-range="${item.key}">${item.label}</button>`;
      });
      var kpLabel = MEM.kpId === 'all' ? '全部知识点' : (sel.kp(state, MEM.kpId) || {}).name || '全部知识点';
      var modeLabel = (modeItems.filter(function (m) { return m.key === MEM.mode; })[0] || {}).label || '全部完成方式';
      var errorLabel = MEM.errorType === 'all' ? '全部错误类型' : diagnosis.errorLabel(MEM.errorType);

      var filterBar = html`<section class="card stu-filterbar">
        <div class="stu-filter-inline">
          <div class="field stu-filter-range">
            <div class="label">时间范围</div>
            <div class="seg is-scroll" data-range-group role="group" aria-label="时间范围">${rangeSeg}</div>
          </div>
          <div class="field">
            <div class="label">知识点</div>
            <select class="select is-sm" data-filter="kp" aria-label="按知识点筛选">${raw(kpOptions)}</select>
          </div>
          <div class="field">
            <div class="label">错误类型</div>
            <select class="select is-sm" data-filter="errorType" aria-label="按错误类型筛选">${raw(errorOptions)}</select>
          </div>
          <div class="field">
            <div class="label">完成方式</div>
            <select class="select is-sm" data-filter="mode" aria-label="按完成方式筛选">${raw(modeOptions)}</select>
          </div>
          <div class="stu-filter-reset">
            ${ui.button({ label: '重置', size: 'sm', tone: 'ghost', icon: 'refresh', attrs: 'data-act="reset-filters"' })}
          </div>
        </div>
        <div class="stu-filter-current">
          ${ui.icon('filter', 13)}
          <span>当前筛选：<b>${activeTask ? rangeLabel(activeTask) : '全部时间'}</b> · <b>${kpLabel}</b> · <b>${errorLabel}</b> · <b>${modeLabel}</b> · 显示 ${rows.length} 个知识点</span>
        </div>
      </section>`;

      /* ---- 完整知识点表现（折叠） ---- */
      var tableRows = rows.map(function (d) {
        return { kpId: d.kpId, diag: d, kpName: d.kpName, chapterName: d.chapterName, scope: d.scope };
      });
      var kpTable = ui.table({
        className: 'stu-kp-table is-compact',
        rows: tableRows,
        rowAttrs: function (row) { return 'data-kp-row="' + row.kpId + '" class="is-clickable" title="点击查看诊断证据" tabindex="0" role="button"'; },
        empty: ui.empty({
          icon: 'filter',
          compact: true,
          title: '当前筛选下没有匹配的知识点',
          desc: '可以调整筛选条件，或点击「重置」查看全部。',
          action: ui.button({ label: '重置筛选', size: 'sm', tone: 'secondary', attrs: 'data-act="reset-filters"' })
        }),
        columns: [
          {
            label: '知识点',
            render: function (row) {
              var d = row.diag;
              return html`<div class="cell-strong">${d.kpName}${d.scope === 'extended' ? html` <span class="tag tag-warn">尚未纳入当前教学范围</span>` : ''}</div>
                <span class="cell-sub">${d.chapterName}</span>`;
            }
          },
          { label: '表现', render: function (row) { return ui.badge(row.diag.performanceLabel, row.diag.performanceTone); } },
          { label: '诊断状态', render: function (row) { return ui.statusBadge(row.diag.status); } },
          {
            label: '记录数 / 可判读',
            align: 'right',
            render: function (row) {
              return html`<span class="num">${row.diag.evidence.records}</span><span class="muted small"> / ${row.diag.evidence.judged}</span>`;
            }
          },
          {
            label: '错误类型',
            render: function (row) {
              var types = row.diag.errorTypes || [];
              if (!types.length) return html`<span class="muted small">—</span>`;
              return html`<div class="chip-row">${types.slice(0, 2).map(function (e) {
                return ui.badge(e.label + '×' + e.count, e.tone);
              })}${types.length > 2 ? html`<span class="tiny muted">等 ${types.length} 类</span>` : ''}</div>`;
            }
          },
          {
            label: '最近更新',
            render: function (row) {
              var at = row.diag.updatedAt;
              return at ? html`<span class="num tiny">${fmt.shortDate(at)}<br>${fmt.time(at)}</span>` : html`<span class="muted">—</span>`;
            }
          }
        ]
      });

      var totalRecords = rows.reduce(function (n, d) { return n + d.evidence.records; }, 0);
      var totalJudged = rows.reduce(function (n, d) { return n + d.evidence.judged; }, 0);

      var tableDisclosure = ui.disclosure({
        summary: '完整知识点表现',
        count: rows.length + ' 个',
        className: 'stu-arch-detail',
        body: html`<div class="stack-sm">
          <div class="tiny muted">共 ${allDiags.length} 个知识点（范围内 ${inScope.length} 个）；当前筛选显示 ${rows.length} 个，涉及 ${totalRecords} 条记录、${totalJudged} 条可判读。点击任意行查看诊断证据与完整建议。</div>
          ${kpTable}
        </div>`
      });

      /* ---- 错误类型分布（折叠） ---- */
      var taskIdForStats = MEM.range === 'all' ? null : MEM.range;
      var dist = ownErrorDistribution(state, studentId, taskIdForStats);
      var distItems = MEM.errorType === 'all'
        ? dist.items
        : dist.items.filter(function (item) { return item.key === MEM.errorType; });
      var distTotal = distItems.reduce(function (n, item) { return n + item.count; }, 0);
      var donut = charts.donut({
        segments: distItems.map(function (item) {
          return { label: item.label, value: item.count, color: charts.TONE[item.tone] || charts.COLORS.neutral };
        }),
        size: 160,
        stroke: 20,
        unit: ' 条',
        title: '错误类型分布',
        desc: '统计本人已判分且判定为错误的作答' + (activeTask ? '（' + rangeLabel(activeTask) + '）' : '（全部任务）'),
        centerValue: distTotal,
        centerLabel: '错误记录',
        emptyText: '当前范围内没有可归因的错误记录。',
        note: '口径：仅统计已判分且判定错误的记录；待复核与暂无法判阅的记录不计入错误分布，也不视为答错。'
      });
      var errorDisclosure = ui.disclosure({
        summary: '错误类型分布',
        count: distTotal + ' 条 · ' + distItems.length + ' 类',
        body: donut
      });

      /* ---- 完成方式统计（折叠） ---- */
      var completion = completionStats(state, studentId, taskIdForStats);
      var cTotal = completion.total || 1;
      function ratio(n) { return completion.total ? Math.round((n / cTotal) * 100) + '%' : '—'; }
      var completionDisclosure = ui.disclosure({
        summary: '完成方式统计',
        count: completion.total + ' 条作答',
        body: html`<div class="stack-sm">
          <div class="stu-stat-list">
            <div class="stat-line"><span class="k">独立完成（无提示、一次提交）</span><span class="v num">${completion.independent} 条 · ${ratio(completion.independent)}</span></div>
            <div class="stat-line"><span class="k">提示后完成</span><span class="v num">${completion.hint} 条 · ${ratio(completion.hint)}</span></div>
            <div class="stat-line"><span class="k">反复尝试（多次提交）</span><span class="v num">${completion.retry} 条 · ${ratio(completion.retry)}</span></div>
            <div class="stat-line"><span class="k">参与统计的作答总数</span><span class="v num">${completion.total} 条</span></div>
          </div>
          <div class="ai-caveat">提示后完成 ≠ 未掌握：借助提示完成说明思路可以建立，独立程度需要更多记录观察；系统分别统计独立完成 / 提示后完成 / 反复尝试，不会把使用提示直接当作不会。</div>
        </div>`
      });

      /* ---- 变化趋势（按当前时间范围筛选；数据不足时明确不下结论） ---- */
      var trend = { xLabels: [], points: [] };
      var sampleParts = [];
      overview.tasks.forEach(function (p) {
        if (MEM.range !== 'all' && p.task.id !== MEM.range) return;
        if (!p.judged) return;
        trend.xLabels.push(fmt.shortDate(p.task.assignedAt));
        trend.points.push(Math.round((p.accuracy || 0) * 100));
        sampleParts.push(rangeLabel(p.task) + '（' + p.judged + ' 条可判读）');
      });
      var trendBody;
      if (trend.xLabels.length < 2) {
        trendBody = html`<div class="stack-sm">
          ${ui.banner({
            tone: 'neutral',
            compact: true,
            title: '记录不足，暂无法判断趋势',
            body: '按任务的变化趋势需要至少 2 个任务的可判读记录，当前只有 ' + trend.xLabels.length + ' 个时间点。'
          })}
          <div class="tiny muted">已有数据点：${sampleParts.length ? sampleParts.join('；') : '暂无可用样本'}。不使用单个数据点推断进步或退步。</div>
        </div>`;
      } else {
        trendBody = charts.line({
          series: [{ name: '一次正确率', color: charts.COLORS.primary, points: trend.points }],
          xLabels: trend.xLabels,
          yMax: 100,
          unit: '%',
          height: 210,
          area: true,
          title: '按任务的一次正确率',
          desc: '时间范围：' + trend.xLabels.join(' → '),
          note: '口径：一次正确率 = 首次提交即得分 ≥ 满分 80% 的记录占比；仅统计已判分记录，待复核与未提交不计入。样本量：' +
            (sampleParts.length ? sampleParts.join('；') : '暂无可用样本') + '。不同任务题目难度不完全可比，趋势仅作参考，不用于横向比较。'
        });
      }
      var trendDisclosure = ui.disclosure({
        summary: '按任务的变化趋势',
        count: trend.xLabels.length >= 2 ? trend.xLabels.length + ' 个时间点' : '记录不足',
        body: trendBody
      });

      /* ---- 需要回顾的作答（次级区块） ---- */
      var reviewList = wrongAnswers(state, studentId, taskIdForStats, MEM.errorType);
      var taskTitles = {};
      tasks.forEach(function (t) { taskTitles[t.id] = t.title; });
      var reviewBlock = html`<section class="plain-block">
        <div class="plain-head">
          <div class="plain-title">需要回顾的作答</div>
          <div class="plain-actions"><span class="tiny muted">${reviewList.length ? '最近 ' + reviewList.length + ' 条' : '当前筛选下暂无'} · 仅已判分判错</span></div>
        </div>
        ${reviewList.length
          ? html`<div class="stu-review-list">
              ${reviewList.map(function (a) {
                var q = sel.question(state, a.questionId);
                if (!q) return '';
                var tag = errorTagOf(state, a);
                var typeMeta = diagnosis.ERROR_MAP && diagnosis.ERROR_MAP[tag];
                return html`<div class="stu-review-item">
                  <div class="stu-review-main">
                    <div class="stu-review-head">
                      <strong>第 ${q.code} 题</strong>
                      ${typeMeta ? ui.badge(typeMeta.label, typeMeta.tone) : ''}
                      <span class="tag">${(q.kpNames || [])[0] || '知识点待确认'}</span>
                      <span class="tiny muted num">${taskTitles[a.taskId] || a.taskId} · ${fmt.shortDate(a.submittedAt)}</span>
                    </div>
                    <div class="small stu-review-stem">${fmt.trunc(q.stem, 72)}</div>
                    <div class="tiny muted">我的作答：「${a.rawAnswer || '（空）'}」 · ${a.score} / ${a.maxScore} 分</div>
                  </div>
                  ${ui.button({ label: '去重做', size: 'sm', tone: 'secondary', icon: 'edit', attrs: 'data-go="' + practiceUrl(a.taskId, q.id) + '"' })}
                </div>`;
              })}
            </div>`
          : ui.empty({
              icon: 'checkCircle',
              compact: true,
              title: '当前筛选下没有需要回顾的作答',
              desc: '可以调整时间范围或错误类型筛选。'
            })}
      </section>`;

      return html`<div class="page stu-archive">
        <div class="page-head">
          <div class="page-head-main">
            <h1 class="page-title">我的档案</h1>
            <div class="page-desc">按知识点查看表现、诊断状态与可核查依据；记录不足时标注“初步判断 / 暂无法判断”。</div>
          </div>
          <div class="page-actions">
            ${ui.button({ label: '继续练习', tone: 'ghost', icon: 'edit', attrs: 'data-go="#/student/practice"' })}
            ${ui.button({ label: '个人学情报告', tone: 'primary', icon: 'fileText', attrs: 'data-go="#/student/report"' })}
          </div>
        </div>

        ${extended.length
          ? ui.banner({
              tone: 'warn',
              compact: true,
              title: '知识范围说明',
              body: '“' + extended.map(function (d) { return d.kpName; }).join('、') + '”尚未纳入当前教学范围，仅展示相关记录，不作为正式学情诊断依据。'
            })
          : ''}

        <div class="page-lead">${ui.icon('info', 15)}<div class="page-lead-text">${conclusion}</div></div>
        ${statStrip}
        ${focusBlock}
        ${filterBar}
        <section class="stu-arch-details">
          ${tableDisclosure}
          ${errorDisclosure}
          ${completionDisclosure}
          ${trendDisclosure}
        </section>
        ${reviewBlock}

        <div class="row-between stu-archive-foot">
          ${ui.aiNote('本页数据为演示用模拟数据；诊断结论由规则引擎实时派生，可随记录补充与教师复核变化。')}
          ${ui.button({ label: '查看可打印的学情报告', tone: 'secondary', size: 'sm', icon: 'printer', attrs: 'data-go="#/student/report"' })}
        </div>
      </div>`;
    },

    mount: function (root, ctx) {
      var state = ctx.state;

      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        var target = el.getAttribute('data-go');
        if (target) ctx.navigate(target);
      });

      /* 时间范围 */
      ui.bind(root, '[data-range]', 'click', function (ev, el) {
        MEM.range = el.getAttribute('data-range') || 'all';
        ctx.refresh();
      });

      /* 三个下拉筛选 */
      root.querySelectorAll('[data-filter]').forEach(function (select) {
        select.addEventListener('change', function () {
          var key = select.getAttribute('data-filter');
          var value = select.value || 'all';
          if (key === 'kp') MEM.kpId = value;
          else if (key === 'errorType') MEM.errorType = value;
          else if (key === 'mode') MEM.mode = value;
          ctx.refresh();
        });
      });

      ui.bind(root, '[data-act="reset-filters"]', 'click', function () {
        MEM.kpId = 'all';
        MEM.errorType = 'all';
        MEM.range = 'all';
        MEM.mode = 'all';
        ctx.refresh();
        ui.toast('已重置筛选条件', 'success');
      });

      /* 首屏「查看完整知识点表现」：展开折叠并滚动到表格 */
      ui.bind(root, '[data-act="show-table"]', 'click', function () {
        var details = root.querySelector('details.stu-arch-detail');
        if (!details) return;
        details.open = true;
        setTimeout(function () {
          try { details.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) { details.scrollIntoView(); }
        }, 80);
      });

      /* 行 / 查看依据 → 证据抽屉 */
      function openByKpId(kpId) {
        var diag = null;
        for (var i = 0; i < MEM.tableRows.length; i++) {
          if (MEM.tableRows[i].kpId === kpId) { diag = MEM.tableRows[i]; break; }
        }
        if (diag) openDiagDrawer(ctx, state, diag);
      }
      ui.bind(root, '[data-kp-row]', 'click', function (ev, el) {
        openByKpId(el.getAttribute('data-kp-row'));
      });
      ui.bind(root, '[data-kp-row]', 'keydown', function (ev, el) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openByKpId(el.getAttribute('data-kp-row'));
        }
      });
    }
  });
})();


