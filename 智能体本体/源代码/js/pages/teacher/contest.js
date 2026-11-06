/* ============================================================
   教师端 · 赛题成果（Task 1/2/3 + 典型案例 + 成果包）
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = window.ZWZ;
  var html = ZWZ.html;
  var raw = ZWZ.raw;
  var fmt = ZWZ.fmt;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;
  var io = ZWZ.io;
  var comp = ZWZ.competition;

  var S = { tab: 'task1', studentId: null };

  function pct(v) { return v === null || v === undefined ? '—' : Math.round(v * 100) + '%'; }
  function official(state) { return !!(state.meta && state.meta.dataMode === 'competition'); }
  function dataGuard(state, ctx) {
    if (official(state)) return '';
    return html`<div class="page">
      <div class="page-head"><div class="page-head-main">
        <h1 class="page-title">赛题成果</h1>
        <div class="page-desc">当前为演示数据模式；本页仅展示主办方模拟学情数据的 Task 1/2/3 成果。</div>
      </div></div>
      ${ui.empty({
        icon: 'database',
        title: '请先切换到赛题数据',
        desc: '赛题成果页依赖官方模拟学情数据（40 名学生 / 806 条记录 / 2 个测验节点）。切换不会删除演示数据。',
        action: ui.button({ label: '切换到赛题数据', tone: 'primary', icon: 'shield', attrs: 'data-act="to-official"' })
      })}
    </div>`;
  }

  function downloadJSON(name, obj) {
    return io.download(name, JSON.stringify(obj, null, 2), 'application/json');
  }
  function downloadCSV(name, headers, rows) {
    return io.download(name, io.toCSV(headers, rows), 'text/csv;charset=utf-8');
  }

  function statStrip(state) {
    var q = comp.quality(state);
    var rawCounts = q.rawStatusCounts || q.statusCounts || {};
    return ui.statStrip([
      { label: '学生', value: (state.users || []).filter(function (u) { return u.role === 'student'; }).length, unit: '名', sub: (state.classes || []).length + ' 个模拟班' },
      { label: '原始作答', value: q.rawRows, unit: '行', sub: '分析记录 ' + q.analysisRecords + '（修订合并后）' },
      { label: '已评分', value: rawCounts['已评分'] || 0, unit: '行', sub: '官方给定分数' },
      { label: '待评分 / 未作答', value: (rawCounts['待评分'] || 0) + ' / ' + (rawCounts['未作答'] || 0), sub: '不计为答错' }
    ]);
  }

  function task1(state) {
    var data = comp.task1(state);
    var rows = [];
    data.themes.forEach(function (t) {
      t.indicators.forEach(function (ind) {
        rows.push({
          themeId: t.themeId, themeName: t.themeName, goal: t.goal,
          indicatorId: ind.indicatorId, indicatorName: ind.indicatorName,
          standardRef: ind.standardRef, standardPages: ind.standardPages, textbookPages: ind.textbookPages,
          questionCount: (ind.questionIds || []).length,
          questionIds: (ind.questionIds || []).join('、'),
          cards: (ind.learningCards || []).join('、'),
          books: (ind.textbookSlices || []).join('、')
        });
      });
    });
    var table = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'themeId', label: '主题', width: '150px', render: function (r) { return html`<div class="cell-strong">${r.themeId} · ${r.themeName}</div><span class="cell-sub">${fmt.trunc(r.goal || '', 38)}</span>`; } },
        { key: 'indicatorId', label: '观察指标', width: '190px', render: function (r) { return html`<div class="cell-strong">${r.indicatorId}</div><span class="cell-sub">${r.indicatorName}</span>`; } },
        { key: 'standard', label: '课标 / 教材出处', width: '190px', render: function (r) { return html`<div class="small">${r.standardRef || '—'} · 课标页 ${r.standardPages || '—'}</div><div class="cell-sub">教材：${r.textbookPages || '—'}</div>`; } },
        { key: 'q', label: '题目', width: '90px', render: function (r) { return html`<div class="num">${r.questionCount}</div><span class="cell-sub">${r.questionIds || '—'}</span>`; } },
        { key: 'materials', label: '配套材料', render: function (r) { return html`<div class="small">学习卡：${r.cards || '—'}</div><div class="cell-sub">教材切片：${r.books || '—'}</div>`; } }
      ],
      rows: rows
    });
    var cards = (state.materials || []).filter(function (m) { return m.type === '学习卡' || m.type === '教材'; });
    var materialTable = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'id', label: '材料编号', width: '90px' },
        { key: 'type', label: '类型', width: '90px' },
        { key: 'theme', label: '主题', width: '170px', render: function (m) { return m.themeName || '未标注'; } },
        { key: 'content', label: '内容 / 来源', render: function (m) { return html`<div class="small">${fmt.trunc(m.content || m.name, 80)}</div><span class="cell-sub">${m.source || ''}</span>`; } }
      ],
      rows: cards
    });
    return html`<div class="stack">
      <div class="plain-block">
        <div class="plain-head"><div class="plain-title">学习内容与要求（T01–T03）</div><div class="plain-actions"><span class="tiny muted">来源：课程要求.csv / 题目与材料.csv / 课标与教材切片</span></div></div>
        <div class="tiny muted">每个观察指标均对应课标整理编号（CR01–CR03）、课标页码、教材页码、题目与学习卡/教材切片，可供 Task 2 分析与 Task 3 建议引用。</div>
      </div>
      ${table}
      ${ui.disclosure({ summary: '学习卡与教材切片清单', count: cards.length + ' 项', body: materialTable })}
      <div class="row-sm row-wrap">
        ${ui.button({ label: '导出 Task1 JSON', tone: 'secondary', icon: 'download', attrs: 'data-export="task1-json"' })}
        ${ui.button({ label: '导出 Task1 CSV', tone: 'secondary', icon: 'download', attrs: 'data-export="task1-csv"' })}
      </div>
    </div>`;
  }

  function task2(state) {
    var cmp = comp.classComparison(state);
    var rows = comp.task2Group(state);
    var clsTable = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'classId', label: '班级', width: '90px' },
        { key: 'students', label: '学生', align: 'right', width: '70px' },
        { key: 'records', label: '分析记录', align: 'right', width: '86px' },
        { key: 'judged', label: '有效记录', align: 'right', width: '86px' },
        { key: 'scoreRate', label: '得分率', align: 'right', width: '80px', render: function (r) { return pct(r.scoreRate); } },
        { key: 'pending', label: '待评分', align: 'right', width: '76px' },
        { key: 'unanswered', label: '未作答', align: 'right', width: '76px' },
        { key: 'excluded', label: '异常排除', align: 'right', width: '86px' },
        { key: 'themes', label: '主题得分率', render: function (r) { return r.themes.map(function (t) { return t.themeId + ' ' + pct(t.scoreRate); }).join(' · '); } }
      ],
      rows: cmp.classes.map(function (c) {
        var g = rows.filter(function (r) { return r.classId === c.classId; })[0] || {};
        return { classId: c.classId, students: c.students, records: c.records, judged: c.judged, scoreRate: c.scoreRate, pending: c.pending, unanswered: c.unanswered, excluded: c.excluded, themes: g.themes || [] };
      })
    });

    var qRows = (comp.quality(state).issues || []).map(function (i) {
      return { type: i.type, recordId: i.recordId, rawValue: i.rawValue, rule: i.rule, status: i.status, inStats: i.inStats ? '是' : '否', needsReview: i.needsReview ? '是' : '否' };
    });
    var qualityTable = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'type', label: '问题类型', width: '150px' },
        { key: 'recordId', label: '记录编号', width: '110px' },
        { key: 'rawValue', label: '原始值 / 说明' },
        { key: 'rule', label: '规则', width: '230px' },
        { key: 'status', label: '处理状态', width: '130px' },
        { key: 'inStats', label: '进入统计', width: '86px' },
        { key: 'needsReview', label: '待确认', width: '76px' }
      ],
      rows: qRows
    });

    var students = (state.users || []).filter(function (u) { return u.role === 'student'; });
    if (!S.studentId || !students.some(function (s) { return s.id === S.studentId; })) S.studentId = students[0] ? students[0].id : null;
    var current = S.studentId ? comp.studentSummary(state, S.studentId) : null;
    var studentTable = current ? ui.table({
      className: 'is-compact',
      columns: [
        { key: 'indicatorId', label: '观察指标', width: '120px' },
        { key: 'themeId', label: '主题', width: '160px', render: function (r) { return r.themeName; } },
        { key: 'records', label: '记录', align: 'right', width: '64px' },
        { key: 'judged', label: '有效', align: 'right', width: '60px' },
        { key: 'scoreRate', label: '得分率', align: 'right', width: '80px', render: function (r) { return pct(r.scoreRate); } },
        { key: 'fullRate', label: '满分率', align: 'right', width: '80px', render: function (r) { return pct(r.fullRate); } },
        { key: 'status', label: '状态', width: '130px', render: function (r) { return html`${ui.statusBadge(r.status)}<span class="tiny muted"> ${r.performanceLabel}</span>`; } },
        { key: 'evidence', label: '证据', width: '130px', render: function (r) { return html`<span class="tiny muted">${(r.evidenceIds || []).join('、') || '—'}</span>`; } }
      ],
      rows: current.indicators
    }) : '';

    return html`<div class="stack">
      ${statStrip(state)}
      <div class="plain-block">
        <div class="plain-head"><div class="plain-title">班级对比（DC01 / DC02）</div><div class="plain-actions"><span class="tiny muted">得分率 = 有效记录得分合计 / 满分合计；未作答、待评分、异常记录不计入分母</span></div></div>
        ${clsTable}
      </div>
      ${ui.disclosure({ summary: '数据质量报告', count: qRows.length + ' 条', body: html`<div class="stack-sm"><div class="tiny muted">修订事件取最新版本；3 条分数异常、1 条节点越界、5 条未作答、6 条待评分均保留原始记录并标记，不静默修正。</div>${qualityTable}</div>` })}
      <div class="plain-block">
        <div class="plain-head">
          <div class="plain-title">学生个体分析</div>
          <div class="plain-actions">
            <select class="select is-sm" id="contest-student" aria-label="选择学生">
              ${students.map(function (s) { return html`<option value="${s.id}" ${s.id === S.studentId ? 'selected' : ''}>${s.id} · ${s.classId}</option>`; })}
            </select>
          </div>
        </div>
        ${current ? html`<div class="row-sm row-wrap"><span class="small">记录 ${current.records} · 有效 ${current.judged} · 待评分 ${current.pending} · 未作答 ${current.unanswered} · 平均得分率 ${pct(current.scoreRate)}</span></div>` : ''}
        ${studentTable}
      </div>
      <div class="row-sm row-wrap">
        ${ui.button({ label: '导出 Task2 个体 JSON', tone: 'secondary', icon: 'download', attrs: 'data-export="task2i-json"' })}
        ${ui.button({ label: '导出 Task2 群体 CSV', tone: 'secondary', icon: 'download', attrs: 'data-export="task2g-csv"' })}
      </div>
    </div>`;
  }

  function caseCard(c) {
    var diagRows = c.diagnoses.map(function (d) {
      return { indicator: d.indicatorId + ' ' + d.indicatorName, status: d.statusLabel, performance: d.performanceLabel, evidence: (d.evidence || []).map(function (e) { return e.recordId; }).join('、') };
    });
    var diagTable = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'indicator', label: '观察指标', width: '220px' },
        { key: 'performance', label: '表现', width: '120px' },
        { key: 'status', label: '状态', width: '120px' },
        { key: 'evidence', label: '证据记录', render: function (r) { return r.evidence || '—'; } }
      ],
      rows: diagRows
    });
    return html`<section class="card ct-case">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">${c.studentId} · ${c.classId} · ${c.type === 'partial' ? '部分得分案例' : c.type === 'strong' ? '表现较好案例' : '记录不足案例'}</div>
          <div class="card-desc">${c.selectionReason}</div>
        </div>
      </div>
      <div class="card-body stack-sm">
        <div class="row-sm row-wrap">
          ${ui.badge('记录 ' + c.summary.records, 'neutral')}
          ${ui.badge('有效 ' + c.summary.judged, 'teal')}
          ${ui.badge('待评分 ' + c.summary.pending, 'warn')}
          ${ui.badge('未作答 ' + c.summary.unanswered, 'neutral')}
          ${ui.badge('平均得分率 ' + pct(c.summary.scoreRate), 'primary')}
        </div>
        ${diagTable}
        ${c.diagnoses.map(function (d) {
          if (!(d.evidence || []).length) return '';
          var evTable = ui.table({
            className: 'is-compact',
            columns: [
              { key: 'recordId', label: '记录', width: '92px' },
              { key: 'questionCode', label: '题目', width: '76px' },
              { key: 'rawAnswer', label: '作答 / 过程', render: function (e) { return html`<div class="small">${fmt.trunc(e.rawAnswer || '（空）', 60)}</div>${e.solution ? html`<div class="cell-sub">过程：${fmt.trunc(e.solution, 70)}</div>` : ''}`; } },
              { key: 'score', label: '得分', width: '70px', render: function (e) { return (e.score === null || e.score === undefined ? '—' : e.score) + ' / ' + e.maxScore; } },
              { key: 'loss', label: '失分评分点', width: '200px', render: function (e) { return (e.pointLoss || []).join('；') || '—'; } }
            ],
            rows: d.evidence
          });
          return ui.disclosure({ summary: d.indicatorId + ' 作答证据', count: d.evidence.length + ' 条', body: evTable });
        })}
        <div class="plain-block">
          <div class="plain-head"><div class="plain-title">个性化学习建议</div></div>
          ${c.recommendations.map(function (r) {
            return html`<div class="ct-rec">
              <div class="row-sm row-wrap"><b>${r.indicatorId} ${r.indicatorName}</b><span class="tiny muted">${r.need}</span></div>
              <div class="small">材料：${r.materials.learningCard ? '学习卡 ' + r.materials.learningCard.id + '（' + r.materials.learningCard.title + '）' : '—'}；教材 ${r.materials.textbook ? r.materials.textbook.id : '—'}；练习 ${r.materials.practiceQuestions.map(function (q) { return q.id; }).join('、') || '—'}</div>
              <ul class="ana-bullets small">${r.sequence.map(function (s) { return html`<li>${s}</li>`; })}</ul>
              <div class="tiny muted">提示方式：${r.hints}　调整条件：${r.adjustment}</div>
            </div>`;
          })}
        </div>
        <div class="tiny muted">后续观察：${c.followUp}</div>
      </div>
    </section>`;
  }

  function cases(state) {
    var cs = comp.caseStudies(state);
    var cmp = comp.classComparison(state);
    return html`<div class="stack">
      <div class="plain-block">
        <div class="plain-head"><div class="plain-title">三名代表性学生</div><div class="plain-actions"><span class="tiny muted">按真实数据自动筛选，覆盖部分得分 / 表现较好 / 记录不足</span></div></div>
      </div>
      ${cs.map(caseCard)}
      <div class="plain-block">
        <div class="plain-head"><div class="plain-title">双班比较（DC01 / DC02）</div></div>
        <div class="small muted">样本：DC01 ${cmp.classes[0] ? cmp.classes[0].students : 0} 人 / DC02 ${cmp.classes[1] ? cmp.classes[1].students : 0} 人；差异仅作教学参考，不将小样本差异解释为因果。</div>
        <div class="row-sm row-wrap mt-2">
          ${cmp.classes.map(function (c) { return ui.badge(c.classId + ' · 得分率 ' + pct(c.scoreRate) + ' · 有效 ' + c.judged, 'neutral'); })}
        </div>
      </div>
      <div class="row-sm row-wrap">
        ${ui.button({ label: '导出案例 JSON', tone: 'secondary', icon: 'download', attrs: 'data-export="cases-json"' })}
        ${ui.button({ label: '导出 Task3 JSON', tone: 'secondary', icon: 'download', attrs: 'data-export="task3-json"' })}
      </div>
    </div>`;
  }

  function pkg(state) {
    var m = comp.manifest(state);
    var rows = [
      ['task1_learning_requirements.json / csv', '学习主题、指标、课标/教材出处、题目与材料', 'Task 1'],
      ['task2_individual_analysis.json', '学生×指标分析、证据记录 ID', 'Task 2'],
      ['task2_group_analysis.json / csv', 'DC01/DC02 群体分析', 'Task 2'],
      ['task3_learning_recommendations.json', '个性化建议、Q/L/B 材料、顺序、提示、调整条件', 'Task 3'],
      ['case_studies.json', '三名案例 + 双班比较', '典型案例'],
      ['data_quality_report.json / csv', '修订、未作答、待评分、分数异常、节点越界', 'Task 2 数据处理'],
      ['field_spec.json / csv', '字段名、类型、含义、关联、缺失表示', '成果包要求'],
      ['dataset_manifest.json / README.md', '数据集清单与说明', '成果包要求']
    ];
    var table = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'file', label: '文件', width: '300px' },
        { key: 'content', label: '内容' },
        { key: 'task', label: '对应任务', width: '130px' }
      ],
      rows: rows.map(function (r) { return { file: r[0], content: r[1], task: r[2] }; })
    });
    return html`<div class="stack">
      ${ui.statStrip([
        { label: '原始作答', value: m.rawAnswers, unit: '行' },
        { label: '分析记录', value: m.analysisRecords, unit: '条' },
        { label: '修订事件', value: m.revisionEvents, unit: '个' },
        { label: '数据质量问题', value: m.issues, unit: '条' }
      ])}
      <div class="plain-block">
        <div class="plain-head"><div class="plain-title">任务成果包</div><div class="plain-actions"><span class="tiny muted">JSON/CSV 可机读 + 字段说明 + manifest；Demo 数据不会混入</span></div></div>
        ${table}
      </div>
      <div class="row-sm row-wrap">
        ${ui.button({ label: '导出全部成果包', tone: 'primary', icon: 'download', attrs: 'data-act="export-all"' })}
        ${ui.button({ label: '导出字段说明', tone: 'secondary', icon: 'fileText', attrs: 'data-export="fields-json"' })}
        ${ui.button({ label: '导出数据质量报告', tone: 'secondary', icon: 'shield', attrs: 'data-export="quality-json"' })}
      </div>
      <div class="tiny muted">导出为浏览器下载；若浏览器拦截多文件下载，请允许本站点下载或分批导出。</div>
    </div>`;
  }

  ZWZ.pages.register('teacher/contest', {
    title: '赛题成果',
    subtitle: '教师端 · Task 1/2/3 与比赛成果',
    render: function (ctx) {
      if (!official(ctx.state)) return dataGuard(ctx.state, ctx);
      var tabs = ui.tabs({
        name: 'contest-tabs',
        active: S.tab,
        items: [
          { key: 'task1', label: 'Task 1 · 学习内容与要求' },
          { key: 'task2', label: 'Task 2 · 学情分析' },
          { key: 'cases', label: '典型案例' },
          { key: 'pkg', label: '成果包' }
        ]
      });
      var body = S.tab === 'task2' ? task2(ctx.state) : S.tab === 'cases' ? cases(ctx.state) : S.tab === 'pkg' ? pkg(ctx.state) : task1(ctx.state);
      return html`<div class="page ct-page">
        <div class="page-head">
          <div class="page-head-main">
            <h1 class="page-title">赛题成果</h1>
            <div class="page-desc">按主办方三项任务组织：学习内容与要求 → 个体/群体学情分析 → 个性化建议；数据来源与证据可追溯。</div>
          </div>
          <div class="page-actions">
            ${ui.button({ label: '布置作业', tone: 'primary', icon: 'plus', attrs: 'data-go="#/teacher/assign"' })}
            ${ui.button({ label: '导出全部成果包', tone: 'secondary', icon: 'download', attrs: 'data-act="export-all"' })}
            ${ui.button({ label: '数据与报告', tone: 'ghost', icon: 'database', attrs: 'data-go="#/teacher/data"' })}
          </div>
        </div>
        ${tabs}
        ${body}
      </div>`;
    },
    mount: function (root, ctx) {
      ui.bindTabs(root, 'contest-tabs', function (key) { S.tab = key; ctx.refresh(); });
      var selEl = root.querySelector('#contest-student');
      if (selEl) selEl.addEventListener('change', function () { S.studentId = selEl.value; ctx.refresh(); });
      ui.bind(root, '[data-go]', 'click', function (ev, el) { ev.preventDefault(); ctx.navigate(el.getAttribute('data-go')); });
      ui.bind(root, '[data-act="to-official"]', 'click', function () {
        ZWZ.store.switchMode('official');
        try {
          var url = new URL(window.location.href);
          url.searchParams.set('data', 'official');
          history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch (err) { /* ignore */ }
        ctx.navigate('#/teacher/contest');
        ZWZ.app.renderShell();
        ZWZ.app.renderRoute(false);
      });
      ui.bind(root, '[data-act="export-all"]', 'click', function () {
        comp.exportPackage(ctx.state);
        ui.toast('成果包导出已开始（多文件下载）', 'success');
      });
      var handlers = {
        'task1-json': function () { downloadJSON('task1_learning_requirements.json', comp.task1(ctx.state)); },
        'task1-csv': function () {
          var rows = [];
          comp.task1(ctx.state).themes.forEach(function (t) { t.indicators.forEach(function (i) { rows.push({ themeId: t.themeId, themeName: t.themeName, goal: t.goal, indicatorId: i.indicatorId, indicatorName: i.indicatorName, standardRef: i.standardRef, standardPages: i.standardPages, textbookPages: i.textbookPages, questions: i.questionIds.join('|'), learningCards: i.learningCards.join('|'), textbookSlices: i.textbookSlices.join('|') }); }); });
          downloadCSV('task1_learning_requirements.csv', [
            { key: 'themeId', label: '主题编号' }, { key: 'themeName', label: '主题' }, { key: 'goal', label: '主题目标' },
            { key: 'indicatorId', label: '指标编号' }, { key: 'indicatorName', label: '观察指标' },
            { key: 'standardRef', label: '课标整理编号' }, { key: 'standardPages', label: '课标页码' },
            { key: 'textbookPages', label: '教材页码' }, { key: 'questions', label: '题目' },
            { key: 'learningCards', label: '学习卡' }, { key: 'textbookSlices', label: '教材切片' }
          ], rows);
        },
        'task2i-json': function () { downloadJSON('task2_individual_analysis.json', comp.task2Rows(ctx.state)); },
        'task2g-csv': function () {
          var rows = [];
          comp.task2Group(ctx.state).forEach(function (c) {
            c.themes.forEach(function (t) {
              t.indicators.forEach(function (i) {
                rows.push({ classId: c.classId, className: c.className, themeId: t.themeId, themeName: t.themeName, indicatorId: i.indicatorId, indicatorName: i.indicatorName, records: i.records, judged: i.judged, scoreRate: i.scoreRate, status: i.status });
              });
            });
          });
          downloadCSV('task2_group_analysis.csv', [
            { key: 'classId', label: '班级编号' }, { key: 'className', label: '班级' }, { key: 'themeId', label: '主题' }, { key: 'themeName', label: '主题名称' },
            { key: 'indicatorId', label: '指标编号' }, { key: 'indicatorName', label: '观察指标' }, { key: 'records', label: '记录数' },
            { key: 'judged', label: '有效记录' }, { key: 'scoreRate', label: '得分率' }, { key: 'status', label: '状态' }
          ], rows);
        },
        'task3-json': function () { downloadJSON('task3_learning_recommendations.json', comp.task3(ctx.state)); },
        'cases-json': function () { downloadJSON('case_studies.json', { students: comp.caseStudies(ctx.state), classComparison: comp.classComparison(ctx.state) }); },
        'fields-json': function () { downloadJSON('field_spec.json', comp.fieldSpec()); },
        'quality-json': function () { downloadJSON('data_quality_report.json', comp.quality(ctx.state)); }
      };
      Object.keys(handlers).forEach(function (key) {
        ui.bind(root, '[data-export="' + key + '"]', 'click', handlers[key]);
      });
    }
  });
})();
