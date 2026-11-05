/* ============================================================
   知微·智学 · 个体学情档案（教师端）
   ------------------------------------------------------------
   第一轮 UI 优化（2026-11-05）：
   - 首屏：学生标识 + 一句阶段结论 + 3 项关键指标 + 「当前关注」知识点；
   - 知识点表现：默认只突出需关注项，完整表折叠（标题与数量清楚，不删任何行/证据/操作）；
   - 作答记录、趋势、完成方式、教师复核记录收进带数量的折叠区；
   - 趋势数据点不足时显示「记录不足，暂无法判断」，不推断进步/退步；
   - 仅展示层重排：证据抽屉、复核入口、导出/打印、诊断规则与数据逻辑均未改动。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = window.ZWZ;
  var html = ZWZ.html;
  var fmt = ZWZ.fmt;
  var ui = ZWZ.ui;
  var charts = ZWZ.charts;
  var sel = ZWZ.sel;
  var io = ZWZ.io;

  var STUDENT_ID = null;
  var LAST_QUERY_STUDENT = null;

  function classIdOf(ctx) {
    return (ctx.session && ctx.session.classId) || 'c1';
  }

  function studentsOf(state, classId) {
    return sel.classStudents(state, classId);
  }

  function pct(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Math.round(v * 100) + '%';
  }

  function toneForBadge(tone) {
    return tone === 'purple' ? 'primary' : (tone || 'neutral');
  }

  var ACTION_LABEL = {
    confirm: '确认诊断',
    modify: '修正诊断',
    'mark-undetermined': '标记暂无法判断'
  };

  function syncStudentUrl(studentId) {
    try {
      if (typeof history === 'undefined' || !history.replaceState) return;
      history.replaceState(null, '', '#/teacher/profile?student=' + encodeURIComponent(studentId));
      LAST_QUERY_STUDENT = studentId;
    } catch (err) { /* 受限环境下忽略 */ }
  }

  function resolveStudent(ctx, state, classId) {
    var q = (ctx.query && ctx.query.student) || null;
    var students = studentsOf(state, classId);
    if (q && q !== LAST_QUERY_STUDENT && sel.student(state, q)) {
      STUDENT_ID = q;
      LAST_QUERY_STUDENT = q;
    }
    if (!STUDENT_ID || !sel.student(state, STUDENT_ID)) {
      STUDENT_ID = students.length ? students[0].id : null;
    }
    return STUDENT_ID;
  }

  function countHintAnswers(state, studentId) {
    return sel.answers(state, { studentId: studentId }).filter(function (a) {
      return a.hintLevels && a.hintLevels.length;
    }).length;
  }

  function lastRange(state, studentId) {
    var rows = sel.answers(state, { studentId: studentId });
    if (!rows.length) return '暂无作答记录';
    return fmt.date(rows[0].submittedAt) + ' — ' + fmt.date(rows[rows.length - 1].submittedAt);
  }

  /* ---------------- 学生切换：压缩为一行 ---------------- */
  function renderStudentBar(state, classId, studentId) {
    var students = studentsOf(state, classId);
    return html`<section class="ana-student-bar is-slim">
      <div class="field ana-student-select">
        <div class="label">${ui.icon('users', 14)}选择学生（共 ${students.length} 名）</div>
        <select class="select" id="ana-student" aria-label="选择学生">
          ${students.map(function (st, i) {
            return html`<option value="${st.id}" ${st.id === studentId ? 'selected' : ''}>${i + 1}. ${st.name}${st.seatNo ? '（学号 ' + st.seatNo + '）' : ''}</option>`;
          })}
        </select>
      </div>
      <div class="ana-student-step">
        ${ui.button({ label: '上一位', icon: 'chevronLeft', size: 'sm', tone: 'secondary', attrs: 'data-step="-1"' })}
        ${ui.button({ label: '下一位', icon: 'chevronRight', size: 'sm', tone: 'secondary', attrs: 'data-step="1"' })}
      </div>
      <div class="ana-student-perm">
        ${ui.badge('仅教师可见', 'teal')}
        ${ui.badge('不含排名', 'neutral')}
      </div>
    </section>`;
  }

  /* ---------------- 首屏：一句阶段结论 ---------------- */
  function renderHead(state, classId, studentId, ctxData) {
    var student = ctxData.student;
    var cls = ctxData.cls;
    var focusAll = ctxData.focusAll;
    var top = focusAll[0] || null;
    var observeCount = Math.max(0, focusAll.length - 1);

    var conclusion;
    if (ctxData.stats.records === 0) {
      conclusion = '还没有作答记录；完成练习后可形成知识点表现与诊断结论。';
    } else if (top) {
      conclusion = '当前最需关注「' + top.kpName + '」：' + top.performanceLabel + ' · ' + top.statusLabel +
        '（' + top.evidence.judged + '/' + top.evidence.records + ' 条可判读）' +
        (observeCount ? '；另有 ' + observeCount + ' 个知识点需继续观察。' : '。');
    } else {
      conclusion = '当前记录未显示需要优先关注的知识点，可继续观察或布置变式题检验迁移。';
    }

    return html`<div class="page-head ana-profile-head-row">
      <div class="page-head-main">
        <div class="ana-name-line">
          ${ui.avatar(student.name, { size: 'lg', seed: student.avatarSeed || student.id })}
          <div>
            <h1 class="page-title">${student.name}</h1>
            <div class="tiny muted">${cls ? cls.name : '未分班'} · 数据范围 ${ctxData.range}</div>
          </div>
        </div>
        <div class="page-lead mt-2">${ui.icon('info', 15)}<div class="page-lead-text">${conclusion}</div></div>
      </div>
      <div class="page-actions">
        ${ui.button({ label: '返回班级分析', icon: 'chart', tone: 'ghost', attrs: 'data-go="#/teacher/analysis"' })}
        ${ui.button({ label: '导出报告', icon: 'download', tone: 'secondary', attrs: 'data-act="export"' })}
        ${ui.button({ label: '打印', icon: 'printer', tone: 'ghost', attrs: 'data-act="print"' })}
      </div>
    </div>`;
  }

  /* ---------------- 关键指标带（3 项） ---------------- */
  function renderStats(ctxData) {
    var stats = ctxData.stats;
    return ui.statStrip([
      {
        label: '一次正确率',
        value: stats.accuracy === null ? '—' : pct(stats.accuracy),
        sub: pct(stats.accuracy) === '—' ? '暂无可判读记录' : stats.correct + ' / ' + stats.judged + ' 条可判读',
        tone: stats.accuracy !== null && stats.accuracy >= 0.8 ? 'teal' : 'primary'
      },
      { label: '已覆盖知识点', value: (stats.coveredKpCount || 0) + ' / ' + (stats.scopeKpCount || 0), unit: '个', sub: '有可判读记录' },
      {
        label: '待处理复核',
        value: stats.pendingReviews,
        unit: '条批阅',
        sub: ctxData.pendingDiags + ' 项诊断待确认 · 复核后结论可能调整',
        tone: stats.pendingReviews || ctxData.pendingDiags ? 'warn' : 'teal'
      }
    ]);
  }

  /* ---------------- 当前关注知识点 ---------------- */
  function renderFocusCard(ctxData, studentId) {
    var focusAll = ctxData.focusAll;
    var top = focusAll[0] || null;
    if (!top) {
      return ui.empty({
        icon: 'checkCircle',
        compact: true,
        title: '当前记录未显示需要优先关注的知识点',
        desc: '可继续观察，或在班级分析中查看该班共性知识点。',
        action: ui.button({ label: '查看班级分析', tone: 'secondary', size: 'sm', icon: 'chart', attrs: 'data-go="#/teacher/analysis"' })
      });
    }
    var reviewUrl = '#/teacher/review?student=' + studentId + '&kp=' + top.kpId;
    var analysisUrl = '#/teacher/analysis?kp=' + top.kpId;
    var errorText = top.errorTypes.length
      ? top.errorTypes.slice(0, 2).map(function (e) { return e.label + ' ×' + e.count; }).join('、')
      : '暂无可归因错误';
    var quote = (top.evidence.quotes || [])[0];

    return html`<div class="ana-focus-card">
      <div class="ana-focus-head">
        <span class="ana-focus-kicker">${ui.icon('target', 13)} 当前关注</span>
        <span class="ana-focus-kp">${top.kpName}</span>
        ${ui.badge(top.performanceLabel, toneForBadge(top.performanceTone))}
        ${ui.statusBadge(top.status)}
        <span class="tiny muted num">记录 ${top.evidence.records} 条 · 可判读 ${top.evidence.judged} 条</span>
      </div>
      <div class="ana-focus-meta">${top.chapterName} · 错误类型：${errorText}</div>
      ${quote ? html`<div class="ana-focus-quote">依据摘要：${fmt.trunc(quote, 64)}</div>` : ''}
      <div class="ana-focus-actions">
        ${ui.button({ label: '查看依据', tone: 'primary', size: 'sm', icon: 'fileText', attrs: 'data-act="diag-open-focus"' })}
        ${ui.button({ label: '去复核', tone: 'secondary', size: 'sm', icon: 'shield', attrs: 'data-go="' + reviewUrl + '"' })}
        ${ui.button({ label: '班级该知识点', tone: 'ghost', size: 'sm', icon: 'chart', attrs: 'data-go="' + analysisUrl + '"' })}
      </div>
    </div>`;
  }

  /* ---------------- 其余需关注知识点（最多 2 条） ---------------- */
  function renderFocusRows(ctxData, studentId) {
    var rest = ctxData.focusAll.slice(1, 3);
    if (!rest.length) return '';
    return html`<section class="plain-block">
      <div class="plain-head">
        <div class="plain-title">其他需继续观察</div>
        <div class="plain-actions"><span class="tiny muted">共 ${Math.max(0, ctxData.focusAll.length - 1)} 项</span></div>
      </div>
      <div class="list-rows">
        ${rest.map(function (d) {
          return html`<div class="list-row">
            <span class="list-row-mark is-warn"></span>
            <span class="list-row-main">
              <span class="list-row-title ana-focus-title">${d.kpName} ${ui.badge(d.performanceLabel, toneForBadge(d.performanceTone))} ${ui.statusBadge(d.status)}</span>
              <span class="list-row-sub">记录 ${d.evidence.records} 条 · 可判读 ${d.evidence.judged} 条 · ${d.errorTypes.length ? d.errorTypes[0].label : '暂无可归因错误'}</span>
            </span>
            <span class="list-row-end">
              <button type="button" class="link-btn" data-diag="${d.id}">查看依据</button>
              <a class="link-btn" href="#/teacher/review?student=${studentId}&kp=${d.kpId}">去复核</a>
            </span>
          </div>`;
        })}
      </div>
    </section>`;
  }

  /* ---------------- 全部知识点表现（折叠表格） ---------------- */
  function renderDiagTable(ctxData) {
    var diags = ctxData.diags;
    var inScope = ctxData.inScope;
    var covered = ctxData.covered;
    var uncertain = ctxData.uncertain;
    var reviewed = ctxData.reviewed;

    var table = ui.table({
      rowAttrs: function (row) {
        return 'class="is-clickable" data-diag="' + row.id + '" tabindex="0" role="button"';
      },
      columns: [
        {
          key: 'kpName', label: '知识点', width: '210px', render: function (row) {
            return html`<div>
              <span class="cell-strong">${row.kpCode || ''} ${row.kpName}</span>
              ${row.scope === 'extended' ? ui.badge('未纳入范围', 'neutral') : ''}
            </div>
            <span class="cell-sub">${row.chapterName}</span>`;
          }
        },
        { key: 'performance', label: '表现', width: '120px', render: function (row) { return ui.badge(row.performanceLabel, toneForBadge(row.performanceTone)); } },
        {
          key: 'status', label: '诊断状态', width: '124px', render: function (row) {
            return html`${ui.statusBadge(row.status)}${row.reviewed ? html`<span class="ana-reviewed-tag">${ui.icon('shield', 11)}已复核</span>` : ''}`;
          }
        },
        {
          key: 'records', label: '记录 / 可判读', align: 'right', width: '104px', render: function (row) {
            return html`<span class="num">${row.evidence.judged}</span> / ${row.evidence.records} 条`;
          }
        },
        {
          key: 'errorTypes', label: '错误类型', width: '170px', render: function (row) {
            if (!row.errorTypes.length) return html`<span class="muted">暂无可归因错误</span>`;
            return html`${row.errorTypes.slice(0, 2).map(function (e) {
              return ui.badge(e.label + ' ×' + e.count, toneForBadge(e.tone));
            })}`;
          }
        },
        {
          key: 'quote', label: '证据摘要', render: function (row) {
            var quote = row.evidence.quotes[0];
            if (!quote) return html`<span class="muted">${row.scope === 'extended' ? '该内容未纳入当前教学范围' : '暂无可用记录'}</span>`;
            return html`<span class="small muted">${fmt.trunc(quote, 46)}</span>`;
          }
        },
        {
          key: 'ops', label: '操作', width: '66px', render: function () {
            return html`${ui.button({ label: '展开', size: 'sm', tone: 'ghost', attrs: 'data-act="diag-open"' })}`;
          }
        }
      ],
      rows: diags,
      empty: ui.empty({ compact: true, title: '暂无可展示的知识点', desc: '当前班级还没有知识点数据。' })
    });

    return ui.disclosure({
      summary: '全部知识点表现',
      count: diags.length + ' 项',
      body: html`<div class="stack-sm">
        <div class="row-sm row-wrap">
          ${ui.badge('已覆盖 ' + covered + ' / ' + inScope.length, covered >= inScope.length ? 'teal' : 'warn')}
          ${ui.badge('待核实 ' + uncertain, uncertain ? 'warn' : 'neutral')}
          ${ui.badge('已复核 ' + reviewed, reviewed ? 'primary' : 'neutral')}
          <span class="tiny muted">共 ${diags.length} 项（范围内 ${inScope.length} 项 + 未纳入范围 ${diags.length - inScope.length} 项）；点击任意行查看完整证据与建议。</span>
        </div>
        ${table}
        <div class="tiny muted">“表现”为规则引擎的当前判断，记录不足时为“记录不足 / 初步判断”，不代表固定评价；“未纳入范围”的内容不作为正式诊断依据。</div>
      </div>`
    });
  }

  /* ---------------- 最近作答（折叠） ---------------- */
  function renderAnswers(state, studentId) {
    var all = sel.answers(state, { studentId: studentId });
    var rows = all.slice(-9).reverse().map(function (a) {
      return { answer: a, question: sel.question(state, a.questionId), task: sel.task(state, a.taskId) };
    });

    var table = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'at', label: '提交时间', width: '128px', render: function (item) { return html`<span class="num small">${fmt.datetime(item.answer.submittedAt)}</span>`; } },
        { key: 'task', label: '任务', width: '120px', render: function (item) { return html`<span class="small">${item.task ? fmt.trunc(item.task.title, 12) : item.answer.taskId}</span>`; } },
        {
          key: 'question', label: '题目摘要', render: function (item) {
            if (!item.question) return item.answer.questionId;
            return html`<div><span class="cell-strong">第 ${item.question.code} 题</span> <span class="small muted">${fmt.trunc(item.question.stem, 26)}</span></div>
              <span class="cell-sub">${(ZWZ.diagnosis.TYPE_LABELS[item.question.type] || item.question.type) || ''}</span>`;
          }
        },
        {
          key: 'raw', label: '作答', width: '110px', render: function (item) {
            var v = item.answer.rawAnswer === undefined || item.answer.rawAnswer === null || String(item.answer.rawAnswer).trim() === ''
              ? '未作答' : String(item.answer.rawAnswer).trim();
            return html`<span class="small">${fmt.trunc(v, 16)}</span>`;
          }
        },
        {
          key: 'score', label: '得分 / 状态', width: '136px', render: function (item) {
            var a = item.answer;
            return html`<div class="ana-score-cell">
              <span class="num">${a.score === null || a.score === undefined ? '—' : a.score + ' / ' + a.maxScore}</span>
              ${ui.statusBadge(a.gradeStatus)}
            </div>`;
          }
        },
        {
          key: 'hint', label: '提示', width: '82px', render: function (item) {
            var levels = item.answer.hintLevels || [];
            if (!levels.length) return html`<span class="muted small">未使用</span>`;
            return html`<span class="small">${levels.map(function (l) { return 'L' + l; }).join(' · ')}</span>`;
          }
        },
        { key: 'attempts', label: '尝试', align: 'right', width: '58px', render: function (item) { return (item.answer.attempts || 1) + ' 次'; } }
      ],
      rows: rows,
      empty: ui.empty({ compact: true, title: '暂无作答记录', desc: '该学生当前还没有提交任何作答。' })
    });

    return ui.disclosure({
      summary: '最近作答记录',
      count: rows.length + ' / 共 ' + all.length + ' 条',
      body: html`<div class="stack-sm">
        ${table}
        <div class="tiny muted">得分为“—”表示暂未定分（过程题待复核或识别质量低），不计入一次正确率，也不计为答错。
          <a class="link-btn" href="#/teacher/grading?student=${studentId}">查看全部作答记录</a>
        </div>
      </div>`
    });
  }

  /* ---------------- 趋势（折叠，样本不足不下结论） ---------------- */
  function renderTrend(state, studentId) {
    var trend = sel.studentTrend(state, studentId);
    var sampleParts = [];
    sel.tasksForStudent(state, studentId).forEach(function (task) {
      var p = sel.taskProgress(state, studentId, task);
      if (!p.judged) return;
      sampleParts.push(fmt.shortDate(task.assignedAt) + ' 任务（' + p.judged + ' 条可判读）');
    });

    var body;
    if (trend.points.length < 2) {
      body = html`<div class="stack-sm">
        ${ui.banner({
          tone: 'neutral',
          compact: true,
          title: '记录不足，暂无法判断趋势',
          body: '按任务的变化趋势需要至少 2 个任务的可判读记录，当前只有 ' + trend.points.length + ' 个数据点。'
        })}
        <div class="tiny muted">已有数据点：${sampleParts.length ? sampleParts.join('；') : '暂无可用样本'}。不使用单个数据点推断进步或退步。</div>
      </div>`;
    } else {
      body = charts.line({
        series: [{ name: '一次正确率', points: trend.points, color: charts.COLORS.primary }],
        xLabels: trend.xLabels,
        yMax: 100,
        unit: '%',
        width: 640,
        height: 210,
        area: true,
        title: '按任务的一次正确率',
        desc: '时间范围：' + trend.xLabels.join(' → ') + '；每个任务一个数据点',
        note: '口径：任务内一次正确率 = 首次提交得分 ≥ 满分 80% 的记录 ÷ 可判读记录；仅统计已判分记录，待复核与未提交不计入。样本：' +
          (sampleParts.length ? sampleParts.join('；') : '暂无可用样本') + '。不同任务题目难度不完全可比，趋势仅作参考。'
      });
    }

    return ui.disclosure({
      summary: '按任务的变化趋势',
      count: trend.points.length >= 2 ? trend.points.length + ' 个数据点' : '记录不足',
      body: body
    });
  }

  /* ---------------- 完成方式与提示使用（折叠） ---------------- */
  function renderCompletion(state, studentId) {
    var answers = sel.answers(state, { studentId: studentId });
    var total = answers.length;
    var withHints = answers.filter(function (a) { return a.hintLevels && a.hintLevels.length; }).length;
    var retried = answers.filter(function (a) { return a.attempts && a.attempts > 1; }).length;
    var independent = answers.filter(function (a) {
      return !(a.hintLevels && a.hintLevels.length) && !(a.attempts && a.attempts > 1);
    }).length;
    var levelCounts = [1, 2, 3, 4].map(function (level) {
      return { level: level, count: answers.filter(function (a) { return (a.hintLevels || []).indexOf(level) >= 0; }).length };
    });
    var statusCounts = { auto: 0, suggested: 0, unjudged: 0, reviewed: 0 };
    answers.forEach(function (a) {
      if (statusCounts[a.gradeStatus] === undefined) statusCounts[a.gradeStatus] = 0;
      statusCounts[a.gradeStatus]++;
    });

    function distRow(label, count, tone) {
      var value = total ? Math.round(count / total * 100) : 0;
      return html`<div class="ana-dist-row">
        <div class="ana-dist-label">${label}</div>
        <div class="ana-dist-bar">${ui.progress(value, tone)}</div>
        <div class="ana-dist-value num">${count} 条<span class="muted"> / ${value}%</span></div>
      </div>`;
    }
    var hintLevelRows = levelCounts.map(function (item) {
      var value = total ? Math.round(item.count / total * 100) : 0;
      return html`<div class="ana-dist-row">
        <div class="ana-dist-label">第 ${item.level} 层提示</div>
        <div class="ana-dist-bar">${ui.progress(value, 'primary')}</div>
        <div class="ana-dist-value num">${item.count} 条</div>
      </div>`;
    });

    return ui.disclosure({
      summary: '完成方式与提示使用',
      count: total + ' 条作答',
      body: html`<div class="stack-sm">
        ${distRow('独立完成（无提示、未反复尝试）', independent, 'teal')}
        ${distRow('使用过提示', withHints, 'primary')}
        ${distRow('反复尝试（≥2 次）', retried, 'warn')}
        <div class="ana-sub-title">提示层级分布（同一记录可能使用多级提示）</div>
        ${hintLevelRows}
        <div class="ana-sub-title">判分状态分布（共 ${total} 条）</div>
        <div class="ana-tag-row">
          ${ui.badge('自动判分 ' + (statusCounts.auto || 0), 'teal')}
          ${ui.badge('建议复核 ' + (statusCounts.suggested || 0), 'warn')}
          ${ui.badge('暂无法判阅 ' + (statusCounts.unjudged || 0), 'neutral')}
          ${ui.badge('教师已复核 ' + (statusCounts.reviewed || 0), 'primary')}
        </div>
        <div class="tiny muted">口径：三项完成方式为可重叠统计（一条记录可能既使用提示又反复尝试），分母为全部 ${total} 条作答记录；与学生学习档案中的互斥分类口径不同，两处对比时请以本区块口径为准。</div>
      </div>`
    });
  }

  /* ---------------- 教师备注与复核记录（折叠时间线） ---------------- */
  function renderReviews(state, studentId) {
    var teacherName = {};
    (state.users || []).forEach(function (u) { teacherName[u.id] = u.name; });
    var items = [];

    (state.diagnosisReviews || []).forEach(function (r) {
      if (r.studentId !== studentId) return;
      var kp = sel.kp(state, r.kpId);
      items.push({
        at: r.at,
        tone: r.action === 'mark-undetermined' ? 'warn' : 'teal',
        title: '诊断复核 · ' + (kp ? kp.name : r.kpId) + ' · ' + (ACTION_LABEL[r.action] || r.action || '处理'),
        note: r.note || '',
        by: teacherName[r.by] || r.by,
        type: '诊断'
      });
    });

    var answerMap = {};
    sel.answers(state, { studentId: studentId }).forEach(function (a) { answerMap[a.id] = a; });
    (state.reviews || []).forEach(function (r) {
      var a = answerMap[r.targetId];
      if (!a) return;
      var q = sel.question(state, a.questionId);
      items.push({
        at: r.at,
        tone: 'primary',
        title: '批阅复核 · ' + (q ? '第 ' + q.code + ' 题' : '作答记录') + ' · ' + (ACTION_LABEL[r.action] || '修改判分'),
        note: r.note || (r.after && r.after.note) || '',
        by: teacherName[r.by] || r.by,
        type: '批阅'
      });
    });

    items.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    items = items.slice(0, 20);

    var timeline = items.length
      ? html`<div class="timeline">
          ${items.map(function (it) {
            return html`<div class="tl-item">
              <span class="tl-dot is-${it.tone}"></span>
              <div class="tl-body">
                <div class="tl-title">${it.title}</div>
                ${it.note ? html`<div class="small muted">${it.note}</div>` : ''}
                <div class="tl-meta">${fmt.datetime(it.at)} · ${it.by || '教师'} · ${it.type}</div>
              </div>
            </div>`;
          })}
        </div>`
      : ui.empty({ compact: true, icon: 'clock', title: '暂无教师备注与复核记录', desc: '该学生当前的诊断与批阅尚未产生教师复核记录。' });

    return ui.disclosure({
      summary: '教师备注与复核记录',
      count: items.length + ' 条',
      body: html`<div class="stack-sm">
        ${timeline}
        <div class="row-sm row-wrap">
          ${ui.button({ label: '处理该生复核', icon: 'shield', tone: 'secondary', size: 'sm', attrs: 'data-go="#/teacher/review?student=' + studentId + '"' })}
        </div>
        <div class="tiny muted">按时间倒序；仅展示与当前学生相关的诊断复核与批阅复核；复核记录同步写入审计日志。</div>
      </div>`
    });
  }

  /* ---------------- 数据口径、权限与说明（折叠） ---------------- */
  function renderNotes() {
    return ui.disclosure({
      summary: '数据口径、权限与说明',
      count: '6 条',
      body: html`<ul class="ana-bullets">
        <li>表现与诊断状态由规则引擎从原始作答实时派生；缺失记录与待复核过程题<b>不计为答错</b>，记录不足时为“初步判断 / 暂无法判断”。</li>
        <li>一次正确率 = 首次提交得分 ≥ 满分 80% 的记录占比；仅统计已判分记录，待复核与未提交不计入。</li>
        <li>完成方式（独立 / 提示后 / 反复尝试）为可重叠统计，与学生学习档案的互斥口径不同。</li>
        <li>本页仅教师可见，学生仅能查看本人数据；不用于排名、分班或标签化评价。</li>
        <li>教材版本与教学范围待教师确认；未纳入范围的内容不参与正式诊断结论。</li>
        <li>本页为虚构模拟数据，仅用于产品演示；诊断结论可随新记录与教师复核变化，不替代教师判断。</li>
      </ul>`
    });
  }

  /* ---------------- 打印区（保持不变） ---------------- */
  function renderPrintArea(state, studentId, classId) {
    var student = sel.student(state, studentId) || { name: studentId };
    var cls = sel.classById(state, classId);
    var report = sel.studentReport(state, studentId);
    var table = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'kpName', label: '知识点', width: '24%', render: function (row) { return html`<div class="cell-strong">${row.kpName}</div><span class="cell-sub">${row.chapterName}</span>`; } },
        { key: 'performance', label: '表现', width: '12%' },
        { key: 'status', label: '诊断状态', width: '12%' },
        { key: 'records', label: '相关记录', align: 'right', width: '10%' },
        { key: 'errorTypes', label: '错误类型', width: '14%' },
        { key: 'suggestion', label: '建议', width: '28%' }
      ],
      rows: report.rows,
      empty: ui.empty({ compact: true, title: '暂无数据', desc: '当前没有可导出的知识点记录。' })
    });
    return html`<section class="print-area print-only">
      <div class="print-head">
        <div>
          <div class="print-title">个体学情档案 · ${student.name}</div>
          <div class="print-meta">
            班级：${cls ? cls.name : '—'} · 数据范围：${report.range && report.range.start ? fmt.date(report.range.start) + ' — ' + fmt.date(report.range.end) : '—'}<br>
            生成时间：${fmt.datetime(report.generatedAt)} · 仅教师可见 · 模拟数据
          </div>
        </div>
        <div class="print-meta">知微·智学</div>
      </div>
      <div class="mt-4">
        记录 ${report.stats.records} 条，可判读 ${report.stats.judged} 条；一次正确率 ${pct(report.stats.accuracy)}；
        提示使用 ${report.stats.hintCount} 次；待复核 ${report.stats.pendingReviews} 条。
      </div>
      <div class="mt-4">${table}</div>
      <div class="print-foot">
        口径说明：缺失记录与待复核过程题不计为答错；记录少于 2 条时结论为初步判断，无记录时为暂无法判断。
        教材版本与教学范围待教师确认。本报告由规则引擎从原始作答派生，仅供参考，不替代教师判断。
      </div>
    </section>`;
  }

  /* ---------------- 知识点证据抽屉（保持原有内容） ---------------- */
  function openDiagDrawer(ctx, diagId) {
    var state = ctx.state;
    var studentId = STUDENT_ID;
    var diags = sel.diagnostics(state, { studentId: studentId });
    var diag = null;
    diags.forEach(function (d) { if (d.id === diagId) diag = d; });
    if (!diag) return;
    var student = sel.student(state, studentId) || { name: studentId };
    var teacherName = {};
    (state.users || []).forEach(function (u) { teacherName[u.id] = u.name; });
    var review = null;
    (state.diagnosisReviews || []).forEach(function (r) {
      if (r.studentId === studentId && r.kpId === diag.kpId) review = r;
    });

    var evidenceItems = [
      '表现判定：' + diag.performanceLabel + '（' + ((ZWZ.diagnosis.PERFORMANCE[diag.performance] || {}).desc || '') + '）',
      '诊断状态：' + diag.statusLabel + '；' + ZWZ.diagnosis.explain(diag),
      '记录 ' + diag.evidence.records + ' 条，可判读 ' + diag.evidence.judged + ' 条；待复核 ' + diag.evidence.pending + ' 条。',
      '提示使用 ' + diag.evidence.hintUsed + ' 条；反复尝试 ' + diag.evidence.retries + ' 条；识别质量低 ' + diag.evidence.lowRecognition + ' 条。',
      diag.updatedAt ? '最近更新：' + fmt.datetime(diag.updatedAt) : '最近更新：—'
    ];
    if (diag.errorTypes.length) {
      evidenceItems.push('错误类型：' + diag.errorTypes.map(function (e) { return e.label + '（' + e.count + '）'; }).join('、'));
    }

    var quotes = diag.evidence.quotes || [];
    var body = html`<div class="stack">
      ${diag.scope === 'extended' ? ui.banner({
        tone: 'warn',
        compact: true,
        body: '该知识点尚未纳入当前教学范围，以下内容为拓展信息，不作为正式学情诊断结论。'
      }) : ''}
      ${ui.evidence({
        title: '诊断依据（' + diag.kpName + '）',
        status: diag.status,
        coverage: diag.evidence.coverageText,
        items: evidenceItems
      })}
      ${ui.evidence({
        title: '作答证据（最多 4 条，含待复核记录）',
        items: quotes.length ? quotes : ['当前没有可展示的作答记录；缺失记录不计为答错。']
      })}
      ${ui.evidence({
        title: '建议（中性表述，不替代教师决定）',
        items: [
          diag.suggestion,
          '适用条件：基于当前数据范围与已判读记录；若课堂观察与数据不一致，以教师判断为准。'
        ]
      })}
      ${review ? ui.evidence({
        title: '教师复核记录',
        items: [
          '处理：' + (ACTION_LABEL[review.action] || review.action) + ' · ' + fmt.datetime(review.at) + ' · ' + (teacherName[review.by] || review.by),
          review.note || '教师未填写备注。'
        ]
      }) : ''}
    </div>`;

    var ctl = ui.drawer({
      title: diag.kpName + ' · 证据与建议',
      desc: student.name + ' · ' + diag.chapterName + ' · ' + diag.statusLabel,
      width: 580,
      body: body.value,
      footer: '<div class="spacer"></div>' +
        ui.button({ label: '查看班级该知识点', tone: 'secondary', size: 'sm', attrs: 'data-drawer-act="analysis"' }).value +
        ui.button({ label: '去复核', tone: 'primary', size: 'sm', attrs: 'data-drawer-act="review"' }).value,
      onMount: function (bodyEl, control) {
        var analysisBtn = control.el.querySelector('[data-drawer-act="analysis"]');
        if (analysisBtn) {
          analysisBtn.addEventListener('click', function () {
            control.close();
            ctx.navigate('#/teacher/analysis?kp=' + diag.kpId);
          });
        }
        var reviewBtn = control.el.querySelector('[data-drawer-act="review"]');
        if (reviewBtn) {
          reviewBtn.addEventListener('click', function () {
            control.close();
            ctx.navigate('#/teacher/review?student=' + studentId + '&kp=' + diag.kpId);
          });
        }
      }
    });
    return ctl;
  }

  /* ---------------- 页面注册 ---------------- */
  ZWZ.pages.register('teacher/profile', {
    title: '个体学情档案',
    subtitle: '教师端 · 仅本班教师可见',
    render: function (ctx) {
      var state = ctx.state;
      var classId = classIdOf(ctx);
      var studentId = resolveStudent(ctx, state, classId);

      if (!studentId) {
        return html`<div class="page">
          ${ui.empty({ icon: 'users', title: '当前班级还没有学生数据', desc: '请先在“数据与报告”中导入学生名单后再查看个体学情档案。', action: ui.button({ label: '去数据与报告', tone: 'primary', attrs: 'data-go="#/teacher/data"' }) })}
        </div>`;
      }

      var student = sel.student(state, studentId) || { name: studentId };
      var cls = sel.classById(state, classId);
      var overview = sel.studentOverview(state, studentId);
      var diags = sel.diagnostics(state, { studentId: studentId });
      var inScope = diags.filter(function (d) { return d.scope === 'in-scope'; });
      var covered = inScope.filter(function (d) { return d.evidence.records > 0; }).length;
      var pendingDiags = inScope.filter(function (d) { return d.status === 'pending'; }).length;
      var uncertain = diags.filter(function (d) { return d.status === 'pending' || d.status === 'undetermined' || d.status === 'preliminary'; }).length;
      var reviewed = diags.filter(function (d) { return d.reviewed; }).length;

      var data = {
        student: student,
        cls: cls,
        stats: overview.stats,
        range: lastRange(state, studentId),
        diags: diags,
        inScope: inScope,
        covered: covered,
        pendingDiags: pendingDiags,
        uncertain: uncertain,
        reviewed: reviewed,
        focusAll: overview.focus || []
      };

      return html`<div class="page ana-profile">
        <div class="ana-profile-screen">
          ${renderStudentBar(state, classId, studentId)}
          ${renderHead(state, classId, studentId, data)}
          ${renderStats(data)}
          <section class="plain-block">
            <div class="plain-head">
              <div class="plain-title">当前关注</div>
              <div class="plain-actions"><span class="tiny muted">按累计记录排序</span></div>
            </div>
            ${renderFocusCard(data, studentId)}
          </section>
          ${renderFocusRows(data, studentId)}
          <div class="ana-profile-details">
            ${renderDiagTable(data)}
            ${renderAnswers(state, studentId)}
            ${renderTrend(state, studentId)}
            ${renderCompletion(state, studentId)}
            ${renderReviews(state, studentId)}
            ${renderNotes()}
          </div>
        </div>

        ${renderPrintArea(state, studentId, classId)}
      </div>`;
    },
    mount: function (root, ctx) {
      var state = ctx.state;
      var classId = classIdOf(ctx);
      var select = root.querySelector('#ana-student');
      if (select) {
        select.addEventListener('change', function () {
          STUDENT_ID = select.value;
          syncStudentUrl(STUDENT_ID);
          ctx.refresh();
        });
      }

      root.querySelectorAll('[data-step]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var students = studentsOf(state, classId);
          if (!students.length) return;
          var index = 0;
          students.forEach(function (st, i) { if (st.id === STUDENT_ID) index = i; });
          var step = Number(btn.getAttribute('data-step')) || 0;
          index = (index + step + students.length) % students.length;
          STUDENT_ID = students[index].id;
          syncStudentUrl(STUDENT_ID);
          ctx.refresh();
        });
      });

      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        ev.stopPropagation();
        ctx.navigate(el.getAttribute('data-go'));
      });

      var exportBtn = root.querySelector('[data-act="export"]');
      if (exportBtn) {
        exportBtn.addEventListener('click', function () {
          var ok = io.exportStudentReport(state, STUDENT_ID);
          if (!ok) ui.toast('导出未完成，请检查浏览器下载权限', 'warn');
        });
      }

      var printBtn = root.querySelector('[data-act="print"]');
      if (printBtn) {
        printBtn.addEventListener('click', function () {
          io.printView('个体学情档案');
        });
      }

      /* 首屏「当前关注」的查看依据 */
      ui.bind(root, '[data-act="diag-open-focus"]', 'click', function () {
        var diags = sel.diagnostics(state, { studentId: STUDENT_ID });
        var overview = sel.studentOverview(state, STUDENT_ID);
        var top = (overview.focus || [])[0];
        if (top) openDiagDrawer(ctx, top.id);
        else ui.toast('当前没有需要展开的知识点', 'info');
      });

      /* 行 & 「查看依据」→ 证据抽屉 */
      function openById(diagId) {
        if (!diagId) return;
        openDiagDrawer(ctx, diagId);
      }
      ui.bind(root, '[data-diag]', 'click', function (ev, el) {
        openById(el.getAttribute('data-diag'));
      });
      ui.bind(root, '[data-diag]', 'keydown', function (ev, el) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openById(el.getAttribute('data-diag'));
        }
      });
      ui.bind(root, '[data-act="diag-open"]', 'click', function (ev, el) {
        ev.stopPropagation();
        var tr = el.closest ? el.closest('tr[data-diag]') : null;
        if (tr) openDiagDrawer(ctx, tr.getAttribute('data-diag'));
      });
    }
  });
})();

