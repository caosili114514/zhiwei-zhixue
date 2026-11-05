/* ============================================================
   知微·智学 · 个体学情档案（教师端）
   ------------------------------------------------------------
   - 仅教师可见；不使用排名 / 标签化表达；
   - 知识点表现、证据摘要、趋势、作答记录、教师备注与复核记录；
   - 支持 ?student=s1 深链，默认展示班级第一位学生。
   所有数值由 ZWZ.sel 实时派生。
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

  /* ---------------- 学生切换条 ---------------- */
  function renderStudentBar(state, classId, studentId) {
    var students = studentsOf(state, classId);
    return html`<section class="card ana-student-bar">
      <div class="field ana-student-select">
        <div class="label">${ui.icon('users', 14)}选择学生（共 ${students.length} 名）</div>
        <select class="select" id="ana-student" aria-label="选择学生">
          ${students.map(function (st, i) {
            return html`<option value="${st.id}" ${st.id === studentId ? 'selected' : ''}>${i + 1}. ${st.name}（${st.seatNo ? '学号 ' + st.seatNo : st.id}）</option>`;
          })}
        </select>
        <div class="help">支持深链：在地址栏追加 ?student=s1 可直接打开某位学生。</div>
      </div>
      <div class="ana-student-step">
        ${ui.button({ label: '上一位', icon: 'chevronLeft', size: 'sm', tone: 'secondary', attrs: 'data-step="-1"' })}
        ${ui.button({ label: '下一位', icon: 'chevronRight', size: 'sm', tone: 'secondary', attrs: 'data-step="1"' })}
      </div>
      <div class="ana-student-perm">
        ${ui.badge('仅教师可见', 'teal')}
        ${ui.badge('不含排名', 'neutral')}
        <span class="tiny muted">学生仅能查看本人数据；本页不展示与教学无关的个人信息。</span>
      </div>
    </section>`;
  }

  /* ---------------- 头部卡片 ---------------- */
  function renderHeadCard(state, classId, studentId) {
    var student = sel.student(state, studentId) || { name: studentId };
    var cls = sel.classById(state, classId);
    var overview = sel.studentOverview(state, studentId);
    var diags = sel.diagnostics(state, { studentId: studentId });
    var inScope = diags.filter(function (d) { return d.scope === 'in-scope'; });
    var covered = inScope.filter(function (d) { return d.evidence.records > 0; }).length;
    var pendingDiags = inScope.filter(function (d) { return d.status === 'pending'; }).length;
    var stats = overview.stats;
    var range = lastRange(state, studentId);
    var hintAnswers = countHintAnswers(state, studentId);

    return html`<section class="card ana-profile-head">
      <div class="ana-profile-main">
        <div class="ana-profile-id">
          ${ui.avatar(student.name, { size: 'xl', seed: student.avatarSeed || student.id })}
          <div class="ana-profile-name">
            <div class="ana-name-line">
              <span class="ana-name">${student.name}</span>
              ${ui.badge(cls ? cls.name : '未分班', 'primary')}
              ${ui.badge('在范围内知识点 ' + covered + ' / ' + inScope.length, covered >= inScope.length ? 'teal' : 'warn')}
            </div>
            <div class="tiny muted">
              数据范围：${range} · 档案生成于 ${fmt.datetime(new Date())} · 数据来源为本班任务作答与教师复核记录
            </div>
          </div>
        </div>
        <div class="ana-profile-actions">
          ${ui.button({ label: '查看作答记录', icon: 'clipboard', size: 'sm', tone: 'secondary', attrs: 'data-go="#/teacher/grading?student=' + studentId + '"' })}
          ${ui.button({ label: '去复核中心', icon: 'shield', size: 'sm', tone: 'secondary', attrs: 'data-go="#/teacher/review?student=' + studentId + '"' })}
          ${ui.button({ label: '导出报告', icon: 'download', size: 'sm', tone: 'primary', attrs: 'data-act="export"' })}
          ${ui.button({ label: '打印', icon: 'printer', size: 'sm', tone: 'ghost', attrs: 'data-act="print"' })}
        </div>
      </div>
      <div class="ana-head-stats">
        <div class="ana-head-stat">
          <div class="ana-head-stat-label">记录数 / 可判读</div>
          <div class="ana-head-stat-value num">${stats.records} <span class="unit">/ ${stats.judged} 条</span></div>
          <div class="ana-head-stat-sub">覆盖 ${stats.coveredKpCount} / ${stats.scopeKpCount} 个范围内知识点</div>
        </div>
        <div class="ana-head-stat">
          <div class="ana-head-stat-label">一次正确率</div>
          <div class="ana-head-stat-value num">${pct(stats.accuracy)}</div>
          <div class="ana-head-stat-sub">按 ${stats.judged} 条可判读记录计算；缺失不计为答错</div>
        </div>
        <div class="ana-head-stat">
          <div class="ana-head-stat-label">提示使用次数</div>
          <div class="ana-head-stat-value num">${stats.hintCount} <span class="unit">次</span></div>
          <div class="ana-head-stat-sub">涉及 ${hintAnswers} 条作答记录，需结合独立完成情况判断</div>
        </div>
        <div class="ana-head-stat">
          <div class="ana-head-stat-label">待复核</div>
          <div class="ana-head-stat-value num">${stats.pendingReviews} <span class="unit">条批阅</span></div>
          <div class="ana-head-stat-sub">另有 ${pendingDiags} 项诊断待确认 · 复核后结论可能变化</div>
        </div>
      </div>
    </section>`;
  }

  /* ---------------- 知识点表现表 ---------------- */
  function renderDiagnosticsTable(state, studentId) {
    var diags = sel.diagnostics(state, { studentId: studentId });
    var inScope = diags.filter(function (d) { return d.scope === 'in-scope'; });
    var covered = inScope.filter(function (d) { return d.evidence.records > 0; }).length;
    var uncertain = diags.filter(function (d) {
      return d.status === 'pending' || d.status === 'undetermined' || d.status === 'preliminary';
    }).length;
    var reviewed = diags.filter(function (d) { return d.reviewed; }).length;

    var table = ui.table({
      rowAttrs: function (row) {
        return 'class="is-clickable" data-diag="' + row.id + '"';
      },
      columns: [
        {
          key: 'kpName', label: '知识点', width: '220px', render: function (row) {
            return html`<div>
              <span class="cell-strong">${row.kpCode || ''} ${row.kpName}</span>
              ${row.scope === 'extended' ? ui.badge('未纳入范围', 'neutral') : ''}
            </div>
            <span class="cell-sub">${row.chapterName}</span>`;
          }
        },
        {
          key: 'performance', label: '表现', width: '128px', render: function (row) {
            return ui.badge(row.performanceLabel, toneForBadge(row.performanceTone));
          }
        },
        {
          key: 'status', label: '诊断状态', width: '128px', render: function (row) {
            return html`${ui.statusBadge(row.status)}${row.reviewed ? html`<span class="ana-reviewed-tag">${ui.icon('shield', 11)}已复核</span>` : ''}`;
          }
        },
        {
          key: 'records', label: '记录 / 可判读', align: 'right', width: '108px', render: function (row) {
            return html`<span class="num">${row.evidence.judged}</span> / ${row.evidence.records} 条`;
          }
        },
        {
          key: 'errorTypes', label: '错误类型', width: '180px', render: function (row) {
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
            return html`<span class="small muted">${fmt.trunc(quote, 52)}</span>`;
          }
        },
        {
          key: 'ops', label: '操作', width: '70px', render: function () {
            return html`${ui.button({ label: '展开', size: 'sm', tone: 'ghost', attrs: 'data-act="diag-open"' })}`;
          }
        }
      ],
      rows: diags,
      empty: ui.empty({ compact: true, title: '暂无可展示的知识点', desc: '当前班级还没有知识点数据。' })
    });

    return html`<section class="card">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">知识点表现与诊断依据</div>
          <div class="card-desc">共 ${diags.length} 项（范围内 ${inScope.length} 项 + 未纳入范围 ${diags.length - inScope.length} 项）；点击任意行查看完整证据与建议</div>
        </div>
        <div class="card-actions">
          ${ui.badge('已覆盖 ' + covered + ' / ' + inScope.length, covered >= inScope.length ? 'teal' : 'warn')}
          ${ui.badge('待核实 ' + uncertain, uncertain ? 'warn' : 'neutral')}
          ${ui.badge('已复核 ' + reviewed, reviewed ? 'primary' : 'neutral')}
        </div>
      </div>
      <div class="card-body is-flush">${table}</div>
      <div class="card-foot">
        ${ui.icon('info', 14)}
        <span class="tiny muted">“表现”为规则引擎的当前判断，记录不足时为“记录不足 / 初步判断”，不代表固定评价；“未纳入范围”的内容不作为正式诊断依据。</span>
      </div>
    </section>`;
  }

  /* ---------------- 典型错误与作答记录 ---------------- */
  function renderAnswers(state, studentId) {
    var all = sel.answers(state, { studentId: studentId });
    var rows = all.slice(-9).reverse().map(function (a) {
      var q = sel.question(state, a.questionId);
      var t = sel.task(state, a.taskId);
      return { answer: a, question: q, task: t };
    });

    var table = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'at', label: '提交时间', width: '132px', render: function (item) { return html`<span class="num small">${fmt.datetime(item.answer.submittedAt)}</span>`; } },
        { key: 'task', label: '任务', width: '128px', render: function (item) { return html`<span class="small">${item.task ? fmt.trunc(item.task.title, 12) : item.answer.taskId}</span>`; } },
        {
          key: 'question', label: '题目摘要', render: function (item) {
            if (!item.question) return item.answer.questionId;
            return html`<div><span class="cell-strong">第 ${item.question.code} 题</span> <span class="small muted">${fmt.trunc(item.question.stem, 30)}</span></div>
              <span class="cell-sub">${(ZWZ.diagnosis.TYPE_LABELS[item.question.type] || item.question.type) || ''}</span>`;
          }
        },
        {
          key: 'raw', label: '作答', width: '116px', render: function (item) {
            var v = item.answer.rawAnswer === undefined || item.answer.rawAnswer === null || String(item.answer.rawAnswer).trim() === ''
              ? '未作答' : String(item.answer.rawAnswer).trim();
            return html`<span class="small">${fmt.trunc(v, 16)}</span>`;
          }
        },
        {
          key: 'score', label: '得分 / 状态', width: '140px', render: function (item) {
            var a = item.answer;
            return html`<div class="ana-score-cell">
              <span class="num">${a.score === null || a.score === undefined ? '—' : a.score + ' / ' + a.maxScore}</span>
              ${ui.statusBadge(a.gradeStatus)}
            </div>`;
          }
        },
        {
          key: 'hint', label: '提示层级', width: '92px', render: function (item) {
            var levels = item.answer.hintLevels || [];
            if (!levels.length) return html`<span class="muted small">未使用</span>`;
            return html`<span class="small">${levels.map(function (l) { return 'L' + l; }).join(' · ')}</span>`;
          }
        },
        { key: 'attempts', label: '尝试', align: 'right', width: '64px', render: function (item) { return (item.answer.attempts || 1) + ' 次'; } }
      ],
      rows: rows,
      empty: ui.empty({ compact: true, title: '暂无作答记录', desc: '该学生当前还没有提交任何作答。' })
    });

    return html`<section class="card">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">典型错误与最近作答记录</div>
          <div class="card-desc">最近 ${rows.length} 条（共 ${all.length} 条）；过程题与识别质量低的记录会被标注为待复核</div>
        </div>
        <div class="card-actions">
          ${ui.button({ label: '全部作答记录', icon: 'external', size: 'sm', tone: 'ghost', attrs: 'data-go="#/teacher/grading?student=' + studentId + '"' })}
        </div>
      </div>
      <div class="card-body is-flush">${table}</div>
      <div class="card-foot">
        ${ui.icon('info', 14)}
        <span class="tiny muted">得分为“—”表示暂未定分（过程题待复核或识别质量低），不计入一次正确率，也不计为答错。</span>
      </div>
    </section>`;
  }

  /* ---------------- 趋势与完成方式 ---------------- */
  function renderTrend(state, studentId) {
    var trend = sel.studentTrend(state, studentId);
    var lineBlock = charts.line({
      title: '各任务一次正确率变化',
      desc: '单位：% · 每个任务一个数据点；仅统计已判分记录',
      series: [{ name: '一次正确率', points: trend.points, color: charts.COLORS.primary }],
      xLabels: trend.xLabels,
      width: 600,
      height: 220,
      unit: '%',
      ticks: [0, 25, 50, 75, 100],
      note: '口径：任务内正确记录 ÷ 可判读记录。数据点少于 2 个时不判断趋势；不同任务题目难度不完全可比。'
    });
    var hint = trend.points.length < 2
      ? html`<div class="ana-inline-note">${ui.icon('info', 14)}<span>当前只有 ${trend.points.length} 个可判读的任务数据点，暂不判断趋势，建议补充练习后再看变化。</span></div>`
      : '';

    return html`<section class="card ana-chart-card">
      <div class="card-body is-solo">
        ${lineBlock}
        ${hint}
      </div>
    </section>`;
  }

  function renderCompletion(state, studentId) {
    var answers = sel.answers(state, { studentId: studentId });
    var total = answers.length;
    var withHints = answers.filter(function (a) { return a.hintLevels && a.hintLevels.length; }).length;
    var retried = answers.filter(function (a) { return a.attempts && a.attempts > 1; }).length;
    var independent = answers.filter(function (a) {
      return !(a.hintLevels && a.hintLevels.length) && !(a.attempts && a.attempts > 1);
    }).length;
    var levelCounts = [1, 2, 3, 4].map(function (level) {
      return {
        level: level,
        count: answers.filter(function (a) { return (a.hintLevels || []).indexOf(level) >= 0; }).length
      };
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

    return html`<section class="card">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">完成方式与提示使用</div>
          <div class="card-desc">用于区分“独立完成”与“提示后完成”，避免把提示后的正确等同于独立掌握</div>
        </div>
      </div>
      <div class="card-body">
        <div class="stack-sm">
          ${distRow('独立完成（无提示、未反复尝试）', independent, 'teal')}
          ${distRow('使用过提示', withHints, 'primary')}
          ${distRow('反复尝试（≥2 次）', retried, 'warn')}
        </div>
        <div class="ana-sub-title">提示层级分布（同一记录可能使用多级提示）</div>
        <div class="stack-sm">${hintLevelRows}</div>
        <div class="ana-sub-title">判分状态分布（共 ${total} 条）</div>
        <div class="ana-tag-row">
          ${ui.badge('自动判分 ' + (statusCounts.auto || 0), 'teal')}
          ${ui.badge('建议复核 ' + (statusCounts.suggested || 0), 'warn')}
          ${ui.badge('暂无法判阅 ' + (statusCounts.unjudged || 0), 'neutral')}
          ${ui.badge('教师已复核 ' + (statusCounts.reviewed || 0), 'primary')}
        </div>
        <div class="tiny muted mt-2">口径：三项完成方式为可重叠统计（一条记录可能既使用提示又反复尝试），分母为全部 ${total} 条作答记录；与学生学习档案中的互斥分类口径不同，两处对比时请以本卡片口径为准。</div>
      </div>
    </section>`;
  }

  /* ---------------- 教师备注与复核记录 ---------------- */
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

    return html`<section class="card">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">教师备注与复核记录</div>
          <div class="card-desc">按时间倒序；仅展示与当前学生相关的诊断复核与批阅复核</div>
        </div>
        <div class="card-actions">
          ${ui.button({ label: '处理该生复核', icon: 'shield', size: 'sm', tone: 'secondary', attrs: 'data-go="#/teacher/review?student=' + studentId + '"' })}
        </div>
      </div>
      <div class="card-body">${timeline}</div>
    </section>`;
  }

  /* ---------------- 打印区 ---------------- */
  function renderPrintArea(state, studentId, classId) {
    var student = sel.student(state, studentId) || { name: studentId };
    var cls = sel.classById(state, classId);
    var report = sel.studentReport(state, studentId);
    var table = ui.table({
      className: 'is-compact',
      columns: [
        {
          key: 'kpName', label: '知识点', width: '24%', render: function (row) {
            return html`<div class="cell-strong">${row.kpName}</div><span class="cell-sub">${row.chapterName}</span>`;
          }
        },
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

  /* ---------------- 知识点证据抽屉 ---------------- */
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

      var student = sel.student(state, studentId);

      return html`<div class="page ana-profile">
        <div class="ana-profile-screen">
          <div class="page-head">
            <div class="page-head-main">
              <div class="page-title">个体学情档案</div>
              <div class="page-desc">
                查看 ${student ? student.name : studentId} 的知识点表现、诊断证据、趋势与教师复核记录。
                所有结论均标注依据与数据范围；记录不足时保持中性表述，不使用排名或标签化评价。
              </div>
            </div>
            <div class="page-actions">
              ${ui.button({ label: '返回班级分析', icon: 'chart', tone: 'secondary', attrs: 'data-go="#/teacher/analysis"' })}
              ${ui.button({ label: '去复核中心', icon: 'shield', tone: 'primary', attrs: 'data-go="#/teacher/review?student=' + studentId + '"' })}
            </div>
          </div>

          ${renderStudentBar(state, classId, studentId)}
          ${renderHeadCard(state, classId, studentId)}
          ${renderDiagnosticsTable(state, studentId)}
          ${renderAnswers(state, studentId)}
          <div class="grid-2">
            ${renderTrend(state, studentId)}
            ${renderCompletion(state, studentId)}
          </div>
          ${renderReviews(state, studentId)}

          ${ui.banner({
            tone: 'info',
            icon: 'lock',
            title: '权限与使用说明',
            body: '本页仅教师可见，学生只能查看本人数据。档案用于教学支持，不作为排名、分班或标签化依据；待复核结论在确认前仅供参考。数据为虚构模拟数据，仅用于产品演示。'
          })}
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

      root.querySelectorAll('tr[data-diag]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          openDiagDrawer(ctx, tr.getAttribute('data-diag'));
        });
      });

      ui.bind(root, '[data-act="diag-open"]', 'click', function (ev, el) {
        ev.stopPropagation();
        var tr = el.closest ? el.closest('tr[data-diag]') : null;
        if (tr) openDiagDrawer(ctx, tr.getAttribute('data-diag'));
      });
    }
  });
})();
