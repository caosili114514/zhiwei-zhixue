/* ============================================================
   学生端 · 个人学情报告（student/report）
   ------------------------------------------------------------
   - 外层 .print-area，操作区 .no-print（打印时由 css/print.css 隐藏）；
   - 数据来自 ZWZ.sel.studentReport（含统计区间、覆盖、教师复核备注）；
   - 支持浏览器打印、导出 CSV / JSON，导出文件名带日期（由 io 服务实现）；
   - 明确标注模拟数据、教材版本待确认与诊断引擎能力边界。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var html = ZWZ.html;
  var fmt = ZWZ.fmt;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;
  var charts = ZWZ.charts;
  var io = ZWZ.io;

  function rangeText(range) {
    if (!range || !range.start || !range.end) return '暂无作答记录（尚未形成统计区间）';
    return fmt.shortDate(range.start) + ' — ' + fmt.shortDate(range.end);
  }

  function focusList(items, emptyText) {
    if (!items || !items.length) {
      return ui.empty({ icon: 'checkCircle', compact: true, title: emptyText || '暂无相关记录', desc: '记录不足时本栏为空，属于正常情况。' });
    }
    return html`<div class="stu-report-list">
      ${items.map(function (d) {
        return html`<div class="stu-report-item">
          <div class="row-sm row-wrap">
            ${ui.badge(d.performanceLabel, d.performanceTone)}
            ${ui.badge(d.statusLabel, d.statusTone)}
            <strong>${d.kpName}</strong>
          </div>
          <div class="tiny muted">${d.chapterName} · 记录 ${d.evidence.records} 条 / 可判读 ${d.evidence.judged} 条</div>
          <div class="small muted">${d.suggestion}</div>
        </div>`;
      })}
    </div>`;
  }

  ZWZ.pages.register('student/report', {
    title: '学情报告',

    render: function (ctx) {
      var state = ctx.state;
      var studentId = ctx.session.userId;
      var report = sel.studentReport(state, studentId);
      var meta = state.meta || {};
      var textbook = meta.textbook || {};
      var engine = meta.engine || {};
      var stats = report.stats;
      var covered = stats.coveredKpCount || 0;
      var scopeCount = stats.scopeKpCount || 0;
      var coveragePct = scopeCount ? Math.round((covered / scopeCount) * 100) : 0;

      /* 优势与待巩固按“知识点 id”去重：同时命中两栏的知识点只在待巩固中呈现，
         避免同一知识点既被描述为优势、又被要求巩固（after-hint / retry 天然同时满足两套筛选条件）。 */
      var focusAll = report.focus || [];
      var focusIds = {};
      focusAll.forEach(function (d) { focusIds[d.id] = true; });
      var strengths = (report.strengths || []).filter(function (d) {
        return !focusIds[d.id];
      }).slice(0, 3);
      var focus = focusAll.slice(0, 3);

      /* ---------------- 表头 ---------------- */
      var header = html`<div class="print-head stu-report-head">
        <div class="stu-report-head-main">
          <div class="stu-report-brand">${ui.icon('shield', 14)} 知微·智学 · 七年级数学学情诊断</div>
          <h1 class="print-title">个人学情报告</h1>
          <div class="print-meta">
            ${report.student.name} · ${(report.cls && report.cls.name) || '班级待确认'} · 学生
            <span class="stu-report-demo">${ui.badge('模拟数据', 'warn')}</span>
          </div>
        </div>
        <div class="print-meta stu-report-head-meta">
          <div>统计区间：${rangeText(report.range)}</div>
          <div>生成时间：${fmt.datetime(report.generatedAt)}</div>
          <div>数据性质：演示用模拟数据（不含真实学生信息）</div>
          <div>适用范围：当前教学范围内 ${scopeCount} 个知识点</div>
        </div>
      </div>`;

      /* ---------------- 概览 ---------------- */
      var strengthsCard = ui.card({
        className: 'avoid-break',
        title: '优势知识点',
        desc: '记录较稳定，或能在没有提示的情况下独立完成的知识点；仅列前 3 项，不做横向比较。',
        body: focusList(strengths, '暂未形成稳定的优势知识点')
      });

      var focusCard = ui.card({
        className: 'avoid-break',
        title: '待巩固知识点',
        desc: '根据当前累计记录优先列出的前 3 项；“提示后完成 / 反复尝试”表示思路已能建立，但独立程度仍需继续观察，单条记录不构成结论。',
        body: focusList(focus, '当前记录未显示明显需要巩固的知识点')
      });

      var coverageCard = ui.card({
        className: 'avoid-break',
        title: '证据覆盖',
        desc: '数据覆盖决定结论的可靠程度；覆盖不足时会保持“初步判断 / 暂无法判断”。',
        body: html`<div class="stu-stat-list">
          <div class="stat-line"><span class="k">已提交作答记录</span><span class="v num">${stats.records} 条</span></div>
          <div class="stat-line"><span class="k">其中可判读</span><span class="v num">${stats.judged} 条</span></div>
          <div class="stat-line"><span class="k">一次正确</span><span class="v num">${stats.correct} 条（${stats.accuracy === null ? '—' : fmt.pct(stats.accuracy)}）</span></div>
          <div class="stat-line"><span class="k">使用提示</span><span class="v num">${stats.hintCount} 次</span></div>
          <div class="stat-line"><span class="k">待教师复核</span><span class="v num">${stats.pendingReviews} 条</span></div>
          <div class="stat-line"><span class="k">已覆盖知识点</span><span class="v num">${covered} / ${scopeCount} 个</span></div>
        </div>
        ${ui.progressLine(coveragePct, coveragePct >= 80 ? 'teal' : 'primary', coveragePct + '%')}
        <div class="tiny muted">覆盖口径：当前教学范围内、已有可判读记录的知识点数量占比；未覆盖不代表不会，只代表记录不足。</div>`
      });

      /* ---------------- 明细表 ---------------- */
      var table = ui.table({
        className: 'stu-report-table is-compact',
        rows: report.rows,
        empty: ui.empty({
          icon: 'fileText',
          compact: true,
          title: '还没有可展示的知识点记录',
          desc: '完成练习并提交作答后，报告会自动生成知识点明细。'
        }),
        columns: [
          {
            label: '知识点',
            width: '15%',
            render: function (row) {
              return html`<div class="cell-strong">${row.kpName}</div><span class="cell-sub">${row.chapterName}</span>`;
            }
          },
          { label: '表现', width: '9%', render: function (row) { return ui.badge(row.performance, row.performanceTone); } },
          { label: '状态', width: '9%', render: function (row) { return ui.badge(row.status, row.statusTone); } },
          {
            label: '数据覆盖',
            width: '13%',
            render: function (row) {
              return html`<div class="small">${row.coverage}</div><span class="cell-sub">记录 ${row.records} · 可判读 ${row.judged}</span>`;
            }
          },
          {
            label: '错误类型',
            width: '13%',
            render: function (row) {
              return row.errorTypes === '—' ? html`<span class="muted small">—</span>` : html`<span class="small">${row.errorTypes}</span>`;
            }
          },
          {
            label: '下一步建议',
            width: '26%',
            render: function (row) { return html`<span class="small stu-report-advice">${row.suggestion}</span>`; }
          },
          {
            label: '教师复核备注',
            width: '15%',
            render: function (row) {
              if (!row.reviewed) return html`<span class="muted small">待复核</span>`;
              return html`<span class="small">${row.teacherNote || '教师已复核'}</span>`;
            }
          }
        ]
      });

      /* ---------------- 趋势 ---------------- */
      var trend = report.trend || { xLabels: [], points: [] };
      var sampleParts = [];
      sel.tasksForStudent(state, studentId).forEach(function (task) {
        var progress = sel.taskProgress(state, studentId, task);
        if (!progress.judged) return;
        sampleParts.push(task.title + '（' + progress.judged + ' 条可判读）');
      });
      var trendChart = charts.line({
        series: [{ name: '一次正确率', color: charts.COLORS.primary, points: trend.points }],
        xLabels: trend.xLabels,
        yMax: 100,
        unit: '%',
        height: 220,
        area: true,
        title: '按任务的一次正确率趋势',
        desc: '横轴为任务时间顺序，纵轴为一次正确率（0—100%）。',
        emptyText: '还没有足够的已判分记录，完成练习后会生成趋势。',
        note: '口径：一次正确率 = 首次提交即得分 ≥ 满分 80% 的记录占比；仅统计已判分记录，待复核与未提交不计入。样本量：' +
          (sampleParts.length ? sampleParts.join('；') : '暂无可用样本') +
          '。不同任务题目难度不完全可比，趋势仅作参考，不用于任何人际比较。'
      });

      /* ---------------- 页脚 ---------------- */
      var textbookText = (textbook.name || '七年级数学') + ' · ' + (textbook.edition || '版本待确认');
      if (textbook.confirmed) textbookText += '（已确认）';
      else if (textbookText.indexOf('待教师确认') < 0 && textbookText.indexOf('待确认') < 0) textbookText += '（待教师确认）';
      /* sourceNote 自身已含“数据来源：”前缀与结尾句号，避免页脚重复 */
      var sourceText = String(report.sourceNote || '演示数据')
        .replace(/^数据来源：/, '')
        .replace(/[。；]\s*$/, '');
      var footer = html`<div class="print-foot stu-report-foot">
        <div>教材版本：${textbookText}。</div>
        <div>数据来源：${sourceText}；统计区间 ${rangeText(report.range)}。</div>
        <div>诊断引擎：${engine.diagnosis || '规则引擎（未接入真实模型）'}；批阅：${engine.grader || '规则判分'}；伴学助手：${engine.assistant || '本地规则应答'}。</div>
        <div>数据性质：${meta.demoNotice || '本报告为虚构模拟数据，仅用于产品演示。'}</div>
        <div>说明：本报告用于帮助了解学习进展与下一步练习方向，不作为评价、排序或分班依据。</div>
        <div>生成时间：${fmt.datetime(report.generatedAt)} · 生成工具：知微·智学 ${meta.version || ''}</div>
      </div>`;

      return html`<div class="page print-area stu-report">
        <div class="page-head no-print">
          <div class="page-head-main">
            <h1 class="page-title">学情报告</h1>
            <div class="page-desc">可打印的个人学情报告：包含优势与待巩固知识点、逐知识点证据覆盖、教师复核备注与趋势口径。数据全部来自实时派生结果。</div>
          </div>
          <div class="page-actions no-print">
            ${ui.button({ label: '打印报告', tone: 'primary', icon: 'printer', attrs: 'data-act="print"' })}
            ${ui.button({ label: '导出 CSV', tone: 'secondary', icon: 'download', attrs: 'data-act="export-csv"' })}
            ${ui.button({ label: '导出 JSON', tone: 'secondary', icon: 'download', attrs: 'data-act="export-json"' })}
          </div>
        </div>

        ${stats.records === 0
          ? ui.banner({
              tone: 'warn',
              title: '当前还没有作答记录',
              body: '报告中的知识点状态会显示为“记录不足 / 暂无法判断”。完成练习后再导出，结论会更有依据。',
              compact: true
            })
          : ''}

        ${header}

        <div class="grid grid-3 stu-report-overview">
          ${strengthsCard}
          ${focusCard}
          ${coverageCard}
        </div>

        <div class="card stu-report-table-card">
          <div class="card-head">
            <div class="card-head-main">
              <div class="card-title">知识点明细与下一步建议</div>
              <div class="card-desc">仅展示当前教学范围内的知识点；“—”表示暂无相关记录。教师复核备注会随复核操作更新。</div>
            </div>
          </div>
          <div class="card-body is-flush">${table}</div>
        </div>

        <div class="card"><div class="card-body is-solo">${trendChart}</div></div>

        ${footer}
      </div>`;
    },

    mount: function (root, ctx) {
      var state = ctx.state;
      var studentId = ctx.session.userId;

      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        var target = el.getAttribute('data-go');
        if (target) ctx.navigate(target);
      });

      ui.bind(root, '[data-act="print"]', 'click', function () {
        io.printView('个人学情报告');
      });

      ui.bind(root, '[data-act="export-csv"]', 'click', function () {
        try {
          io.exportStudentReport(state, studentId);
        } catch (err) {
          ui.toast('导出未成功：' + (err && err.message ? err.message : '浏览器下载受限'), 'error');
        }
      });

      ui.bind(root, '[data-act="export-json"]', 'click', function () {
        try {
          io.exportStudentJSON(state, studentId);
        } catch (err) {
          ui.toast('导出未成功：' + (err && err.message ? err.message : '浏览器下载受限'), 'error');
        }
      });
    }
  });
})();
