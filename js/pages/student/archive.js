/* ============================================================
   学生端 · 我的档案（student/archive）
   ------------------------------------------------------------
   - 知识点表现（sel.diagnostics，含拓展知识点标注）、错误类型分布、
     完成方式统计、按任务的一次正确率趋势、需要回顾的作答；
   - 筛选：知识点 / 错误类型 / 时间范围（任务）/ 完成方式；
   - 措辞支持性、非标签化，无任何排序或标签化称呼；数据全部实时派生。
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
      var allDiags = sel.diagnostics(state, { studentId: studentId });
      var tasks = sel.tasksForStudent(state, studentId);

      var extended = allDiags.filter(function (d) { return d.scope === 'extended'; });
      var inScopeDiags = allDiags.filter(function (d) { return d.scope === 'in-scope'; });

      /* ---- 筛选条件 ---- */
      var rangeItems = [{ key: 'all', label: '全部' }].concat(tasks.map(function (t) {
        return { key: t.id, label: rangeLabel(t) };
      }));
      var modeItems = [
        { key: 'all', label: '全部' },
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

      var kpChips = [ui.chip('全部', { active: MEM.kpId === 'all', attrs: 'data-kp="all"' })].concat(
        allDiags.map(function (d) {
          return ui.chip(d.kpName, { active: MEM.kpId === d.kpId, attrs: 'data-kp="' + d.kpId + '"' });
        })
      );

      var errorOptions = '<option value="all"' + (MEM.errorType === 'all' ? ' selected' : '') + '>全部错误类型</option>' +
        ERROR_TYPES.map(function (t) {
          return '<option value="' + esc(t.key) + '"' + (MEM.errorType === t.key ? ' selected' : '') + '>' + esc(t.label) + '</option>';
        }).join('');

      var filterCard = html`<div class="card stu-filters-card">
        <div class="card-body is-solo stu-filters">
          <div class="stu-filter-row">
            <span class="stu-filter-label">知识点</span>
            <div class="chip-row">${kpChips}</div>
          </div>
          <div class="stu-filter-row">
            <span class="stu-filter-label">错误类型</span>
            <select class="select stu-filter-select" data-filter="errorType" aria-label="按错误类型筛选">
              ${raw(errorOptions)}
            </select>
            <span class="stu-filter-label">时间范围</span>
            <div class="seg">
              ${rangeItems.map(function (item) {
                return html`<button type="button" class="seg-item ${item.key === MEM.range ? 'is-active' : ''}" data-range="${item.key}">${item.label}</button>`;
              })}
            </div>
          </div>
          <div class="stu-filter-row">
            <span class="stu-filter-label">完成方式</span>
            <div class="seg">
              ${modeItems.map(function (item) {
                return html`<button type="button" class="seg-item ${item.key === MEM.mode ? 'is-active' : ''}" data-mode="${item.key}">${item.label}</button>`;
              })}
            </div>
            <div class="spacer"></div>
            ${ui.button({ label: '重置筛选', size: 'sm', tone: 'ghost', icon: 'refresh', attrs: 'data-act="reset-filters"' })}
          </div>
        </div>
      </div>`;

      /* ---- 知识点表现表 ---- */
      var tableRows = rows.map(function (d) {
        return {
          kpId: d.kpId,
          diag: d,
          kpName: d.kpName,
          chapterName: d.chapterName,
          scope: d.scope
        };
      });
      var kpTable = ui.table({
        className: 'stu-kp-table',
        rows: tableRows,
        rowAttrs: function (row) { return 'data-kp-row="' + row.kpId + '" class="is-clickable" title="点击查看诊断证据"'; },
        empty: ui.empty({
          icon: 'filter',
          compact: true,
          title: '当前筛选下没有匹配的知识点',
          desc: '可以调整知识点、错误类型、时间范围或完成方式筛选，或点击“重置筛选”查看全部。',
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

      /* ---- 统计：错误类型分布 ---- */
      var taskIdForStats = MEM.range === 'all' ? null : MEM.range;
      var dist = ownErrorDistribution(state, studentId, taskIdForStats);
      var distItems = MEM.errorType === 'all'
        ? dist.items
        : dist.items.filter(function (item) { return item.key === MEM.errorType; });
      var distTotal = distItems.reduce(function (n, item) { return n + item.count; }, 0);
      var donut = charts.donut({
        segments: distItems.map(function (item) {
          return {
            label: item.label,
            value: item.count,
            color: charts.TONE[item.tone] || charts.COLORS.neutral
          };
        }),
        size: 168,
        stroke: 22,
        unit: ' 条',
        title: '错误类型分布',
        desc: '统计本人已判分且判定为错误的作答' + (activeTask ? '（' + rangeLabel(activeTask) + '）' : '（全部任务）'),
        centerValue: distTotal,
        centerLabel: '错误记录',
        emptyText: '当前范围内没有可归因的错误记录。',
        note: '口径：仅统计已判分且判定错误的记录；待复核与暂无法判阅的记录不计入错误分布，也不视为答错。'
      });

      /* ---- 统计：完成方式 ---- */
      var completion = completionStats(state, studentId, taskIdForStats);
      var cTotal = completion.total || 1;
      function ratio(n) { return completion.total ? Math.round((n / cTotal) * 100) + '%' : '—'; }
      var completionCard = ui.card({
        title: '完成方式：独立完成 vs 提示后完成',
        desc: '按作答记录统计' + (activeTask ? '（' + rangeLabel(activeTask) + '）' : '（全部任务）') + '，每次提交按最高完成方式归类。',
        body: html`<div class="stu-stat-list">
          <div class="stat-line"><span class="k">独立完成（无提示、一次提交）</span><span class="v num">${completion.independent} 条 · ${ratio(completion.independent)}</span></div>
          <div class="stat-line"><span class="k">提示后完成</span><span class="v num">${completion.hint} 条 · ${ratio(completion.hint)}</span></div>
          <div class="stat-line"><span class="k">反复尝试（多次提交）</span><span class="v num">${completion.retry} 条 · ${ratio(completion.retry)}</span></div>
          <div class="stat-line"><span class="k">参与统计的作答总数</span><span class="v num">${completion.total} 条</span></div>
        </div>
        ${ui.banner({
          tone: 'success',
          compact: true,
          title: '提示后完成 ≠ 未掌握',
          body: '借助提示完成说明思路可以建立，只是独立程度还需要更多记录观察。系统把“独立完成 / 提示后完成 / 反复尝试”分开统计，不会把使用提示直接当作不会。'
        })}`
      });

      /* ---- 变化趋势 ---- */
      var trend = overview.trend || { xLabels: [], points: [] };
      var sampleParts = [];
      overview.tasks.forEach(function (p) {
        if (!p.judged) return;
        sampleParts.push(rangeLabel(p.task) + '（' + p.judged + ' 条可判读）');
      });
      var trendChart = charts.line({
        series: [{ name: '一次正确率', color: charts.COLORS.primary, points: trend.points }],
        xLabels: trend.xLabels,
        yMax: 100,
        unit: '%',
        height: 226,
        area: true,
        title: '按任务的一次正确率变化',
        desc: '横轴为任务时间顺序，纵轴为一次正确率（0—100%）。',
        emptyText: '还没有足够的已判分记录，完成练习后会生成趋势。',
        note: '口径：一次正确率 = 首次提交即得分 ≥ 满分 80% 的记录占比；仅统计已判分记录，待复核与未提交不计入。样本量：' +
          (sampleParts.length ? sampleParts.join('；') : '暂无可用样本') + '。不同任务题目难度不完全可比，趋势仅作参考，不用于横向比较。'
      });

      /* ---- 需要回顾的作答 ---- */
      var reviewList = wrongAnswers(state, studentId, taskIdForStats, MEM.errorType);
      var taskTitles = {};
      tasks.forEach(function (t) { taskTitles[t.id] = t.title; });
      var reviewCard = ui.card({
        title: '需要回顾的作答',
        desc: '本人已判分且判定为错误的作答，按提交时间倒序展示最多 8 条；点击可进入对应题目重做。',
        body: reviewList.length
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
              desc: '可以调整时间范围或错误类型筛选；没有可判读的错误记录时，该列表为空。'
            })
      });

      var totalRecords = rows.reduce(function (n, d) { return n + d.evidence.records; }, 0);
      var totalJudged = rows.reduce(function (n, d) { return n + d.evidence.judged; }, 0);

      return html`<div class="page stu-archive">
        <div class="page-head">
          <div class="page-head-main">
            <h1 class="page-title">我的档案</h1>
            <div class="page-desc">
              按知识点查看当前表现、诊断状态与可核查依据。表现与状态均由累计记录实时派生；记录不足时会标注“初步判断”或“暂无法判断”，不会用一次作答下结论。
            </div>
          </div>
          <div class="page-actions">
            ${ui.button({ label: '继续练习', tone: 'secondary', icon: 'edit', attrs: 'data-go="#/student/practice"' })}
            ${ui.button({ label: '个人学情报告', tone: 'primary', icon: 'fileText', attrs: 'data-go="#/student/report"' })}
          </div>
        </div>

        ${extended.length
          ? ui.banner({
              tone: 'warn',
              compact: true,
              title: '知识范围说明',
              body: '“' + extended.map(function (d) { return d.kpName; }).join('、') + '”尚未纳入当前教学范围，下表中仅展示相关记录并标注，不作为正式学情诊断依据。'
            })
          : ''}

        ${filterCard}

        <div class="card">
          <div class="card-head">
            <div class="card-head-main">
              <div class="card-title">知识点表现</div>
              <div class="card-desc">共 ${allDiags.length} 个知识点（范围内 ${inScopeDiags.length} 个）；当前筛选显示 ${rows.length} 个，涉及 ${totalRecords} 条记录、${totalJudged} 条可判读。点击任意行查看诊断证据与建议。</div>
            </div>
          </div>
          <div class="card-body is-flush">${kpTable}</div>
        </div>

        <div class="grid grid-2">
          <div class="card"><div class="card-body is-solo">${donut}</div></div>
          ${completionCard}
        </div>

        <div class="card"><div class="card-body is-solo">${trendChart}</div></div>

        ${reviewCard}

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

      ui.bind(root, '[data-kp]', 'click', function (ev, el) {
        MEM.kpId = el.getAttribute('data-kp') || 'all';
        ctx.refresh();
      });

      ui.bind(root, '[data-range]', 'click', function (ev, el) {
        MEM.range = el.getAttribute('data-range') || 'all';
        ctx.refresh();
      });

      ui.bind(root, '[data-mode]', 'click', function (ev, el) {
        MEM.mode = el.getAttribute('data-mode') || 'all';
        ctx.refresh();
      });

      var errorSelect = root.querySelector('[data-filter="errorType"]');
      if (errorSelect) {
        errorSelect.addEventListener('change', function () {
          MEM.errorType = errorSelect.value || 'all';
          ctx.refresh();
        });
      }

      ui.bind(root, '[data-act="reset-filters"]', 'click', function () {
        MEM.kpId = 'all';
        MEM.errorType = 'all';
        MEM.range = 'all';
        MEM.mode = 'all';
        ctx.refresh();
        ui.toast('已重置筛选条件', 'success');
      });

      ui.bind(root, '[data-kp-row]', 'click', function (ev, el) {
        var kpId = el.getAttribute('data-kp-row');
        var diag = null;
        for (var i = 0; i < MEM.tableRows.length; i++) {
          if (MEM.tableRows[i].kpId === kpId) { diag = MEM.tableRows[i]; break; }
        }
        if (diag) openDiagDrawer(ctx, state, diag);
      });
    }
  });
})();
