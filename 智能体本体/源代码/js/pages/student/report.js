/* ============================================================
   学生端 · 个人学情报告（student/report）
   ------------------------------------------------------------
   第一轮 UI 优化（2026-11-05）：
   - 首屏：一句阶段结论 + 核心指标带 + 重点知识点（每个保留知识点 / 状态 / 证据数量）；
   - 「全部知识点明细（表格）」与「证据与数据口径（覆盖·状态·趋势）」默认折叠，
     可用键盘展开，打印时自动展开并完整输出；
   - 明细表与「查看依据」沿用现有表格与 ui.drawer，不改任何数据逻辑；
   - 折叠后仍保留：四类诊断状态、记录/可判读数量、缺失≠答错、待复核含义。
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

  var STATUS_DESC = {
    sufficient: '记录 ≥ 3 条且方向一致，结论可作为主要参考。',
    preliminary: '可判读记录为 1–2 条，属于初步判断，需要更多记录确认。',
    pending: '部分作答待教师复核，复核后结论可能调整。',
    undetermined: '无有效记录或记录不足，暂不作结论。'
  };

  function rangeText(range) {
    if (!range || !range.start || !range.end) return '暂无作答记录（尚未形成统计区间）';
    return fmt.shortDate(range.start) + ' — ' + fmt.shortDate(range.end);
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

      /* 诊断详情（只读派生）：供重点知识点与明细行打开「依据」抽屉 */
      var diags = sel.diagnostics(state, { studentId: studentId });
      var diagByKp = {};
      diags.forEach(function (d) { diagByKp[d.kpName] = d; });

      /* 优势 / 待巩固按知识点 id 去重，避免同一知识点同时出现在两栏 */
      var focusAll = report.focus || [];
      var focusIds = {};
      focusAll.forEach(function (d) { focusIds[d.id] = true; });
      var strengthsAll = (report.strengths || []).filter(function (d) { return !focusIds[d.id]; });
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
          <div>数据性质：${state.meta && state.meta.dataMode === 'competition' ? '主办方模拟学情数据（仅用于本次比赛，不含真实学生信息）' : '演示用模拟数据（不含真实学生信息）'}</div>
          <div>适用范围：当前教学范围内 ${scopeCount} 个知识点</div>
        </div>
      </div>`;

      /* ---------------- 一句话阶段结论 ---------------- */
      var accText = stats.accuracy === null ? '—' : fmt.pct(stats.accuracy);
      var difficultyCount = focusAll.filter(function (d) { return d.performance === 'difficulty'; }).length;
      var observeCount = focusAll.length - difficultyCount;
      var conclusion;
      if (stats.records === 0) {
        conclusion = '还没有练习记录；完成练习并提交作答后，这里会生成阶段性结论。';
      } else {
        conclusion = '共 ' + stats.judged + ' 条可判读记录，一次正确 ' + stats.correct + ' 条（' + accText + '）；已覆盖 ' +
          covered + '/' + scopeCount + ' 个知识点';
        var focusPhrase = [];
        if (difficultyCount) focusPhrase.push(difficultyCount + ' 个仍需继续巩固');
        if (observeCount) focusPhrase.push(observeCount + ' 个在提示或反复尝试后完成（独立程度待观察）');
        conclusion += focusPhrase.length ? '，其中 ' + focusPhrase.join('、') : '，暂无明显困难项';
        conclusion += stats.pendingReviews ? '；另有 ' + stats.pendingReviews + ' 条作答待教师复核，复核后结论可能调整' : '';
        conclusion += '。';
        if (strengthsAll.length) conclusion += '表现较稳定：' + strengthsAll.slice(0, 2).map(function (d) { return '「' + d.kpName + '」'; }).join('、') + '。';
      }

      var lead = html`<div class="page-lead">${ui.icon('info', 15)}<div class="page-lead-text">${conclusion}</div></div>`;

      /* ---------------- 核心指标带 ---------------- */
      var statStrip = ui.statStrip([
        {
          label: '一次正确率',
          value: stats.accuracy === null ? '—' : fmt.pct(stats.accuracy),
          sub: stats.judged ? stats.correct + ' / ' + stats.judged + ' 条可判读' : '暂无可判读记录',
          tone: stats.accuracy === null ? 'neutral' : stats.accuracy >= 0.8 ? 'teal' : 'primary'
        },
        { label: '已覆盖知识点', value: covered + ' / ' + scopeCount, unit: '个', sub: '有可判读记录的知识点' },
        { label: '待关注知识点', value: focusAll.length, unit: '个', sub: '含需巩固与提示后完成', tone: focusAll.length ? 'warn' : 'teal' },
        { label: '待教师复核', value: stats.pendingReviews, unit: '条', sub: '复核后结论可能调整' }
      ]);

      /* ---------------- 重点知识点（每个保留：知识点 / 状态 / 证据数量） ---------------- */
      var focusRows = focus.length
        ? html`<div class="stu-report-focus-list">
            ${focus.map(function (d) {
              return html`<div class="stu-report-focus">
                <div class="stu-report-focus-main">
                  <div class="stu-report-focus-head">
                    <span class="stu-report-focus-kp">${d.kpName}</span>
                    ${ui.badge(d.performanceLabel, d.performanceTone)}
                    ${ui.statusBadge(d.status)}
                    <span class="stu-report-focus-meta num">记录 ${d.evidence.records} 条 · 可判读 ${d.evidence.judged} 条</span>
                  </div>
                  <div class="stu-report-focus-action">
                    <span class="small muted">${fmt.trunc(d.suggestion, 42)}</span>
                    <button type="button" class="link-btn" data-kp="${d.kpName}">查看依据</button>
                  </div>
                </div>
              </div>`;
            })}
          </div>`
        : ui.empty({
            icon: 'checkCircle',
            compact: true,
            title: '当前记录未显示明显需要巩固的知识点',
            desc: '记录不足时也会保持中性显示，不作固定判断。'
          });

      var focusBlock = html`<section class="plain-block">
        <div class="plain-head">
          <div class="plain-title">重点知识点</div>
          <div class="plain-actions"><span class="tiny muted">按累计记录优先展示前 ${focus.length} 项</span></div>
        </div>
        ${focusRows}
      </section>`;

      /* ---------------- 全部知识点明细（默认折叠，表格沿用） ---------------- */
      var table = ui.table({
        className: 'stu-report-table is-compact',
        rows: report.rows,
        rowAttrs: function (row) { return 'data-kp="' + row.kpName + '" class="is-clickable" role="button" tabindex="0"'; },
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
              if (!row.reviewed) return html`<span class="muted small">未复核</span>`;
              return html`<span class="small">${row.teacherNote || '教师已复核'}</span>`;
            }
          }
        ]
      });

      var detailDisclosure = ui.disclosure({
        summary: '全部知识点明细',
        count: report.rows.length + ' 个',
        body: html`<div class="stack-sm">
          <div class="tiny muted">点击任意行查看该知识点的证据与判断依据；表格仅展示当前教学范围内的知识点。</div>
          ${table}
        </div>`
      });

      /* ---------------- 证据与数据口径（覆盖 / 状态含义 / 趋势，默认折叠） ---------------- */
      var coverageList = html`<div class="stu-stat-list stu-report-coverage">
        <div class="stat-line"><span class="k">已提交作答记录</span><span class="v num">${stats.records} 条</span></div>
        <div class="stat-line"><span class="k">其中可判读</span><span class="v num">${stats.judged} 条</span></div>
        <div class="stat-line"><span class="k">一次正确</span><span class="v num">${stats.correct} 条（${accText}）</span></div>
        <div class="stat-line"><span class="k">使用提示</span><span class="v num">${stats.hintCount} 次</span></div>
        <div class="stat-line"><span class="k">待教师复核</span><span class="v num">${stats.pendingReviews} 条</span></div>
        <div class="stat-line"><span class="k">已覆盖知识点</span><span class="v num">${covered} / ${scopeCount} 个</span></div>
      </div>`;

      var statusLegend = html`<div class="stu-report-status-legend">
        ${[
          { key: 'sufficient', label: '证据充分' },
          { key: 'preliminary', label: '初步判断' },
          { key: 'pending', label: '待复核' },
          { key: 'undetermined', label: '暂无法判断' }
        ].map(function (s) {
          return html`<div class="stu-report-status-row">
            ${ui.statusBadge(s.key, s.label)}
            <span>${STATUS_DESC[s.key] || ''}</span>
          </div>`;
        })}
      </div>`;

      var trend = report.trend || { xLabels: [], points: [] };
      var sampleParts = [];
      sel.tasksForStudent(state, studentId).forEach(function (task) {
        var progress = sel.taskProgress(state, studentId, task);
        if (!progress.judged) return;
        sampleParts.push(fmt.shortDate(task.assignedAt) + ' 任务（' + progress.judged + ' 条可判读）');
      });
      var trendChart = charts.line({
        series: [{ name: '一次正确率', color: charts.COLORS.primary, points: trend.points }],
        xLabels: trend.xLabels,
        yMax: 100,
        unit: '%',
        height: 200,
        area: true,
        title: '按任务的一次正确率',
        emptyText: '还没有足够的已判分记录，完成练习后会生成趋势。',
        note: '口径：一次正确率 = 首次提交得分 ≥ 满分 80% 的记录占比；仅统计已判分记录，待复核与未提交不计入。样本：' +
          (sampleParts.length ? sampleParts.join('；') : '暂无可用样本') + '。不同任务难度不完全可比，趋势仅作参考。'
      });

      var evidenceDisclosure = ui.disclosure({
        summary: '证据与数据口径',
        count: '覆盖 · 状态 · 趋势',
        body: html`<div class="stack">
          <div class="stu-report-evidence-block">
            <div class="plain-title">证据覆盖</div>
            ${coverageList}
            ${ui.progressLine(coveragePct, coveragePct >= 80 ? 'teal' : 'primary', coveragePct + '%')}
            <div class="tiny muted">覆盖口径：当前教学范围内、已有可判读记录的知识点数量占比；未覆盖不代表不会，只代表记录不足。</div>
          </div>
          <div class="stu-report-evidence-block">
            <div class="plain-title">诊断状态含义</div>
            ${statusLegend}
            <div class="tiny muted">缺失记录不计为答错；「待复核」与识别质量低的作答不计入结论，教师复核后会同步更新。</div>
          </div>
          <div class="stu-report-evidence-block">
            <div class="plain-title">学习变化</div>
            ${trendChart}
          </div>
        </div>`
      });

      /* ---------------- 页脚 ---------------- */
      var textbookText = (textbook.name || '七年级数学') + ' · ' + (textbook.edition || '版本待确认');
      if (textbook.confirmed) textbookText += '（已确认）';
      else if (textbookText.indexOf('待教师确认') < 0 && textbookText.indexOf('待确认') < 0) textbookText += '（待教师确认）';
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
            <div class="page-desc">统计区间内的知识点表现、证据与下一步练习方向；证据和口径可展开查看。</div>
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
              body: '知识点状态会显示为“记录不足 / 暂无法判断”。完成练习后再查看或导出，结论会更有依据。',
              compact: true
            })
          : ''}

        ${header}
        ${lead}
        ${statStrip}
        ${focusBlock}
        ${detailDisclosure}
        ${evidenceDisclosure}
        ${footer}
      </div>`;
    },

    mount: function (root, ctx) {
      var state = ctx.state;
      var studentId = ctx.session.userId;

      function openEvidence(kpName) {
        var diag = null;
        var rows = sel.diagnostics(state, { studentId: studentId });
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].kpName === kpName) { diag = rows[i]; break; }
        }
        if (!diag) {
          ui.toast('该知识点的诊断详情暂不可用', 'warn');
          return;
        }
        var body = html`<div class="stack">
          <div class="row-sm row-wrap">
            ${ui.badge(diag.performanceLabel, diag.performanceTone)}
            ${ui.statusBadge(diag.status)}
            <span class="tiny muted">${diag.chapterName}${diag.scope === 'in-scope' ? '' : ' · 尚未纳入正式诊断范围'}</span>
          </div>
          <div class="stu-stat-list">
            <div class="stat-line"><span class="k">相关记录</span><span class="v num">${diag.evidence.records} 条</span></div>
            <div class="stat-line"><span class="k">可判读记录</span><span class="v num">${diag.evidence.judged} 条</span></div>
            <div class="stat-line"><span class="k">一次正确</span><span class="v num">${diag.evidence.correct} 条</span></div>
            <div class="stat-line"><span class="k">使用提示</span><span class="v num">${diag.evidence.hintUsed} 条</span></div>
            <div class="stat-line"><span class="k">待教师复核</span><span class="v num">${diag.evidence.pending} 条</span></div>
          </div>
          <div class="row-sm row-wrap">
            <span class="small muted">错误类型：</span>
            ${diag.errorTypes.length
              ? diag.errorTypes.map(function (e) { return ui.badge(e.label + ' ×' + e.count, 'quiet'); })
              : html`<span class="small muted">暂无可归因错误</span>`}
          </div>
          ${ui.evidence({
            title: '判断依据',
            items: diag.evidence.quotes,
            status: diag.status,
            coverage: diag.evidence.coverageText
          })}
          <div>
            <div class="plain-title">下一步建议</div>
            <div class="small muted mt-2">${diag.suggestion}</div>
          </div>
          <div>
            <div class="plain-title">教师复核</div>
            <div class="small muted mt-2">${diag.reviewed
              ? '已复核' + (diag.reviewAt ? '（' + fmt.date(diag.reviewAt) + '）' : '') + (diag.teacherNote ? '：' + diag.teacherNote : '')
              : '尚未复核；当前结论可能随复核与新记录变化。'}</div>
          </div>
          <div class="tiny muted">单条记录不构成结论；缺失记录不计为答错。</div>
        </div>`;
        ui.drawer({ title: diag.kpName + ' · 诊断依据', body: body.value, width: 520 });
      }

      ui.bind(root, '[data-kp]', 'click', function (ev, el) {
        openEvidence(el.getAttribute('data-kp'));
      });
      ui.bind(root, '[data-kp]', 'keydown', function (ev, el) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openEvidence(el.getAttribute('data-kp'));
        }
      });

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
