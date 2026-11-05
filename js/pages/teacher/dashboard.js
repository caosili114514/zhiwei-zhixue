/* ============================================================
   教师端 · 工作台（第一屏突出“当前需要处理的事”，不做数字卡片堆叠）
   ------------------------------------------------------------
   - 所有数量与结论均由 ZWZ.sel 从作答 / 诊断数据实时派生，页面不硬编码；
   - “待复核批阅”不计入一次正确率与错误类型统计（口径在页面写明）。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = window.ZWZ;
  var html = ZWZ.html;
  var raw = ZWZ.raw;
  var esc = ZWZ.esc;
  var ui = ZWZ.ui;
  var charts = ZWZ.charts;
  var sel = ZWZ.sel;
  var fmt = ZWZ.fmt;

  var CLASS_ID = 'c1';

  /* ---------------- 取数辅助（只读，不修改 state） ---------------- */
  function classAnswers(state) {
    return (state.answers || []).filter(function (a) {
      var st = sel.student(state, a.studentId);
      return st && st.classId === CLASS_ID;
    });
  }

  function scopeInfo(state) {
    var cls = sel.classById(state, CLASS_ID) || {};
    var ids = cls.scopeChapterIds || (state.meta.scope || {}).chapters || [];
    var chapters = (state.chapters || []).slice().sort(function (a, b) { return a.order - b.order; });
    return {
      inScope: chapters.filter(function (c) { return ids.indexOf(c.id) >= 0; }),
      outScope: chapters.filter(function (c) { return ids.indexOf(c.id) < 0; })
    };
  }

  function answerRange(state) {
    var rows = classAnswers(state);
    var start = null;
    var end = null;
    rows.forEach(function (a) {
      if (!start || new Date(a.submittedAt) < new Date(start)) start = a.submittedAt;
      if (!end || new Date(a.submittedAt) > new Date(end)) end = a.submittedAt;
    });
    return { start: start, end: end, count: rows.length };
  }

  function taskStats(state, task, studentCount) {
    var rows = classAnswers(state).filter(function (a) { return a.taskId === task.id; });
    var byStudent = {};
    rows.forEach(function (a) { byStudent[a.studentId] = (byStudent[a.studentId] || 0) + 1; });
    var total = (task.questionIds || []).length;
    var submitted = Object.keys(byStudent).length;
    var complete = Object.keys(byStudent).filter(function (sid) { return byStudent[sid] >= total; }).length;
    var slots = studentCount * total;
    return {
      answers: rows.length,
      submitted: submitted,
      complete: complete,
      slots: slots,
      pct: slots ? Math.round((rows.length / slots) * 100) : 0
    };
  }

  /* ---------------- 待处理清单行 ---------------- */
  function pendingRow(o) {
    return raw(
      '<div class="tch-action-row is-' + esc(o.tone || 'primary') + '">' +
        '<div class="tch-action-icon is-' + esc(o.tone || 'primary') + '">' + ui.icon(o.icon || 'clock', 18).value + '</div>' +
        '<div class="tch-action-main">' +
          '<div class="tch-action-title">' + esc(o.title) +
            ' <span class="tch-action-count num">' + esc(o.count) + '</span>' +
            '<span class="tch-action-unit">' + esc(o.unit) + '</span>' +
          '</div>' +
          '<div class="tch-action-desc">' + esc(o.desc) + '</div>' +
        '</div>' +
        '<div class="tch-action-btns">' + (o.action ? o.action.value : '') + '</div>' +
      '</div>'
    );
  }

  /* ---------------- 过程题 / 识别异常说明弹窗 ---------------- */
  function openProcessModal(ctx) {
    var state = ZWZ.store.state;
    var counts = ZWZ.grader.countByStatus(state, classAnswers(state));
    var body = html`<div class="stack">
      ${ui.banner({
        tone: 'info',
        compact: true,
        body: '过程题按步骤给分，系统只提供辅助批阅与判分依据，不自动定分；识别质量低的作答需要教师核对原始作答后再给分。'
      })}
      <div class="tch-mini-list">
        <div class="stat-line"><span class="k">建议复核（过程题等）</span><span class="v num">${counts.suggested} 条</span></div>
        <div class="stat-line"><span class="k">暂无法判阅（识别质量低 / 空白）</span><span class="v num">${counts.unjudged} 条</span></div>
        <div class="stat-line"><span class="k">教师已复核</span><span class="v num">${counts.reviewed} 条</span></div>
        <div class="stat-line"><span class="k">自动判分（客观题）</span><span class="v num">${counts.auto} 条</span></div>
      </div>
      <div class="help">待复核批阅不计入班级一次正确率与错误类型统计；复核完成后，结论会同步到班级分析与个体档案。系统不承诺 100% 自动批改。</div>
    </div>`;
    var ctl = ui.modal({
      title: '过程题与识别异常说明',
      desc: '批阅口径 · 数据由规则引擎实时统计',
      size: 'md',
      body: body.value,
      footer: '<div class="spacer"></div><button type="button" class="btn btn-secondary" data-close>关闭</button>' +
        '<button type="button" class="btn btn-primary" data-act="go-grading">去批阅队列</button>'
    });
    ctl.el.querySelector('[data-act="go-grading"]').addEventListener('click', function () {
      ctl.close();
      ctx.navigate('#/teacher/grading?status=unjudged');
    });
  }

  /* ---------------- 页面注册 ---------------- */
  ZWZ.pages.register('teacher/dashboard', {
    title: '工作台',
    subtitle: '七年级(3)班 · 学情诊断与个性化学习',

    render: function (ctx) {
      var state = ctx.state;
      var cls = sel.classById(state, CLASS_ID) || { name: '七年级(3)班' };
      var ov = sel.classOverview(state, CLASS_ID);
      var studentCount = ov.studentCount;
      var scope = scopeInfo(state);
      var range = answerRange(state);
      var pending = sel.pendingReviews(state, { classId: CLASS_ID });
      var gradeQueue = pending.grades || [];
      var diagAll = sel.diagnostics(state, { classId: CLASS_ID, scopeOnly: true });
      var pendingDiags = diagAll.filter(function (d) { return d.status === 'pending'; }).length;
      var prelimDiags = diagAll.filter(function (d) { return d.status === 'preliminary'; }).length;
      var counts = ZWZ.grader.countByStatus(state, classAnswers(state));
      var totalPending = gradeQueue.length + pendingDiags;

      /* ---------- 页头 ---------- */
      var scopeText = scope.inScope.map(function (c) { return c.name; }).join(' · ') || '未配置教学范围';
      var outText = scope.outScope.map(function (c) { return c.name; }).join('、');
      var rangeText = range.start
        ? fmt.date(range.start) + ' — ' + fmt.date(range.end)
        : '暂无作答数据';
      var head = html`<div class="page-head">
        <div class="page-head-main">
          <div class="page-title">工作台</div>
          <div class="page-desc">
            ${cls.name} · 教学范围：${scopeText}${outText ? '（' + outText + '未纳入当前教学进度）' : ''} · 数据范围：${rangeText}
          </div>
          <div class="row-sm row-wrap tch-head-tags">
            ${ui.badge(cls.name + ' · ' + studentCount + ' 名学生', 'neutral')}
            ${ui.badge('教学任务 ' + ov.tasks.length + ' 个', 'neutral')}
            ${ui.badge('作答记录 ' + ov.records + ' 条', 'neutral')}
            ${ui.badge('在范围知识点 ' + (ov.kpRows || []).length + ' 个', 'neutral')}
          </div>
        </div>
        <div class="page-actions">
          ${ui.button({ label: '导入试卷', tone: 'primary', icon: 'upload', attrs: 'data-go="#/teacher/import"' })}
          ${ui.button({ label: '查看班级分析', tone: 'secondary', icon: 'chart', attrs: 'data-go="#/teacher/analysis"' })}
        </div>
      </div>`;

      /* ---------- 第一屏：待处理清单 ---------- */
      var rows = [];
      if (gradeQueue.length) {
        rows.push(pendingRow({
          title: '待复核批阅',
          count: gradeQueue.length,
          unit: '条',
          icon: 'clipboard',
          tone: 'warn',
          desc: '过程题与识别异常作答已进入人工复核队列；待复核批阅不计入一次正确率与错误类型统计。',
          action: ui.button({ label: '去批阅', tone: 'primary', size: 'sm', icon: 'arrowRight', attrs: 'data-go="#/teacher/grading"' })
        }));
      }
      if (pendingDiags) {
        rows.push(pendingRow({
          title: '待确认诊断',
          count: pendingDiags,
          unit: '项',
          icon: 'shield',
          tone: 'primary',
          desc: '存在识别异常或待补充记录的诊断，需要教师确认或标记暂无法判断' +
            (prelimDiags ? '；另有 ' + prelimDiags + ' 项初步判断可一并复核。' : '。'),
          action: ui.button({ label: '去复核', tone: 'primary', size: 'sm', icon: 'arrowRight', attrs: 'data-go="#/teacher/review?filter=pending"' })
        }));
      }
      rows.push(pendingRow({
        title: '过程题 / 识别异常',
        count: (counts.suggested || 0) + (counts.unjudged || 0),
        unit: '条记录需人工判断',
        icon: 'help',
        tone: 'neutral',
        desc: '建议复核 ' + (counts.suggested || 0) + ' 条、暂无法判阅 ' + (counts.unjudged || 0) +
          ' 条；过程题不自动定分，识别质量低的作答须先核对原始作答。',
        action: ui.button({ label: '查看说明', tone: 'ghost', size: 'sm', icon: 'info', attrs: 'data-act="explain-process"' })
      }));

      var pendingBody;
      if (gradeQueue.length || pendingDiags) {
        pendingBody = raw(rows.map(function (r, i) {
          return (i ? '<div class="divider"></div>' : '') + r.value;
        }).join(''));
      } else {
        pendingBody = ui.empty({
          icon: 'checkCircle',
          title: '当前没有待处理事项',
          desc: '待复核批阅与待确认诊断均已处理完毕，可以查看班级分析或布置新的练习。',
          action: ui.button({ label: '查看班级分析', tone: 'secondary', size: 'sm', icon: 'chart', attrs: 'data-go="#/teacher/analysis"' })
        });
      }

      /* ---------- 第一屏：进行中的任务 ---------- */
      var ongoingTasks = ov.tasks.filter(function (t) { return t.status === '进行中'; });
      var activeTask = ongoingTasks[ongoingTasks.length - 1] || ov.tasks[ov.tasks.length - 1] || null;
      var ongoingBody;
      if (activeTask) {
        var st = taskStats(state, activeTask, studentCount);
        var submitPct = studentCount ? Math.round((st.submitted / studentCount) * 100) : 0;
        ongoingBody = html`<div class="stack-sm">
          <div class="tch-ongoing-title">${activeTask.title}</div>
          <div class="row-sm row-wrap">
            <span class="tag tag-primary">${activeTask.scopeNote || '教学范围待确认'}</span>
            <span class="tiny muted">${fmt.shortDate(activeTask.assignedAt)} 布置</span>
          </div>
          <div class="tch-deadline">
            ${ui.icon('calendar', 14)}
            <span>截止 ${fmt.datetime(activeTask.dueAt)}</span>
            <span class="tiny muted">（${fmt.rel(activeTask.dueAt)}）</span>
          </div>
          <div class="tch-metric">
            <div class="row-between"><span class="small muted">已提交学生</span><span class="num strong">${st.submitted} / ${studentCount} 人</span></div>
            ${ui.progress(submitPct, submitPct >= 100 ? 'teal' : 'primary')}
          </div>
          <div class="tch-metric">
            <div class="row-between"><span class="small muted">题次提交进度</span><span class="num strong">${st.answers} / ${st.slots}（${st.pct}%）</span></div>
            ${ui.progress(st.pct, 'primary')}
          </div>
          <div class="help">${st.complete} 人已完成全部 ${(activeTask.questionIds || []).length} 道题；未提交不计为答错。</div>
          <div class="row-sm row-wrap">
            ${ui.button({ label: '查看批阅', tone: 'primary', size: 'sm', icon: 'clipboard', attrs: 'data-go="#/teacher/grading?task=' + activeTask.id + '"' })}
            ${ui.button({ label: '学情分析', tone: 'secondary', size: 'sm', icon: 'chart', attrs: 'data-go="#/teacher/analysis"' })}
          </div>
        </div>`;
      } else {
        ongoingBody = ui.empty({
          icon: 'upload',
          title: '暂无进行中的任务',
          desc: '导入一份试卷并布置任务后，这里会显示提交进度。',
          action: ui.button({ label: '导入试卷', tone: 'primary', size: 'sm', icon: 'upload', attrs: 'data-go="#/teacher/import"' })
        });
      }

      var firstScreen = html`<div class="tch-focus">
        ${ui.card({
          className: 'tch-pending-card',
          title: raw(ui.icon('clock', 18).value + '<span>当前需要处理的事</span>'),
          desc: '按优先级排列，数量由作答与诊断数据实时统计。',
          actions: raw(ui.badge('共 ' + totalPending + ' 项待处理', 'warn').value),
          body: pendingBody
        })}
        ${ui.card({
          className: 'tch-ongoing-card is-accent',
          title: '进行中的任务',
          desc: activeTask ? '关注提交进度，及时处理待复核批阅。' : '',
          actions: activeTask ? raw(ui.badge('进行中', 'primary').value) : '',
          body: ongoingBody
        })}
      </div>`;

      /* ---------- 第二屏：班级概览 KPI ---------- */
      var kpRows = ov.kpRows || [];
      var kpWithRecords = kpRows.filter(function (r) { return r.records > 0; }).length;
      var avgCoverage = kpRows.length
        ? kpRows.reduce(function (sum, r) { return sum + (r.coverage || 0); }, 0) / kpRows.length
        : 0;
      var trendPoints = (ov.trend && ov.trend.series && ov.trend.series[0] && ov.trend.series[0].points) || [];
      var spark = trendPoints.length >= 2
        ? raw(charts.sparkline(trendPoints, { color: '#365CF5' }).value + '<span class="tiny muted">近 ' + trendPoints.length + ' 次任务</span>')
        : null;
      var kpis = html`
        ${ui.kpi({ label: '班级学生', value: String(studentCount), unit: '人', sub: '已提交过作答 ' + ov.activeStudents + ' 人', icon: 'users' })}
        ${ui.kpi({ label: '一次正确率', value: fmt.pct(ov.accuracy, 1), sub: spark || ('已判分 ' + ov.judged + ' 条'), icon: 'target', tone: 'primary' })}
        ${ui.kpi({ label: '提示使用率', value: fmt.pct(ov.hintRate, 1), sub: '共 ' + ov.records + ' 条作答记录', icon: 'lightbulb' })}
        ${ui.kpi({ label: '数据覆盖', value: kpWithRecords + '/' + kpRows.length, unit: '知识点', sub: '平均覆盖 ' + fmt.pct(avgCoverage, 0) + ' · 待复核不计入', icon: 'layers' })}
        ${ui.kpi({ label: '最近活跃', value: ov.lastActivity ? fmt.shortDate(ov.lastActivity) : '—', sub: ov.lastActivity ? fmt.time(ov.lastActivity) + ' 最近一次提交' : '暂无作答记录', icon: 'clock' })}
      `;

      /* ---------- 高频错误类型 ---------- */
      var errorTypes = ov.errorTypes || [];
      var errorTotal = errorTypes.reduce(function (sum, e) { return sum + e.count; }, 0);
      var errorMax = errorTypes.reduce(function (max, e) { return Math.max(max, e.count); }, 0);
      var errorBody;
      if (errorTypes.length) {
        errorBody = charts.hbar({
          items: errorTypes.map(function (e) {
            return {
              label: e.label,
              value: e.count,
              max: errorMax,
              tone: e.tone === 'purple' ? 'primary' : e.tone,
              valueText: e.count + ' 条 · ' + Math.round(e.ratio * 100) + '%'
            };
          }),
          max: errorMax,
          labelWidth: 128,
          rowHeight: 34,
          note: '样本：已判分错误记录共 ' + errorTotal + ' 条（自动判分 + 教师复核）；仅统计已判分错误记录，待复核批阅不计入。'
        });
      } else {
        errorBody = ui.empty({
          compact: true,
          icon: 'chart',
          title: '暂无已判分的错误记录',
          desc: '完成复核或学生提交新作答后，这里会显示错误类型分布。'
        });
      }
      var errorCard = ui.card({
        className: 'tch-chart-card',
        title: '高频错误类型',
        desc: '仅统计已判分错误记录；待复核批阅不计入。',
        body: errorBody
      });

      /* ---------- 需要关注的学生 ---------- */
      var attention = (ov.attention || []).slice(0, 5);
      var attentionBody;
      if (attention.length) {
        attentionBody = html`<div class="tch-attention-list">
          ${attention.map(function (a) {
            return html`<div class="tch-attention-row">
              ${ui.avatar(a.student.name, { size: 'sm', seed: a.student.id })}
              <div class="tch-attention-main">
                <div class="row-sm row-wrap">
                  <span class="tch-attention-name">${a.student.name}</span>
                  ${ui.badge('需巩固 ' + a.weakCount + ' 个知识点', 'warn')}
                </div>
                <div class="tiny muted">${a.focus.length ? '重点：' + a.focus.map(function (f) { return f.kpName; }).join('、') : '暂未定位到具体知识点'}</div>
              </div>
              ${ui.button({
                label: '查看档案',
                tone: 'ghost',
                size: 'sm',
                icon: 'user',
                attrs: 'data-go="#/teacher/profile?student=' + a.student.id + '"'
              })}
            </div>`;
          })}
        </div>`;
      } else {
        attentionBody = ui.empty({
          compact: true,
          icon: 'checkCircle',
          title: '当前没有需要重点关注的学生',
          desc: '当某位学生在知识点上出现待巩固记录时，会出现在这里。'
        });
      }
      var attentionCard = ui.card({
        title: '需要关注的学生',
        desc: '依据稳定诊断记录（“仍需巩固”）排序，取前 5 位；不用于比较或排名。',
        body: attentionBody
      });

      /* ---------- 近期教学任务 ---------- */
      var tasksBody = ui.table({
        columns: [
          {
            key: 'title',
            label: '任务',
            render: function (t) {
              return html`<div class="cell-strong">${t.title}</div><span class="cell-sub">${t.scopeNote || '教学范围待确认'}</span>`;
            }
          },
          {
            key: 'time',
            label: '时间',
            width: '190px',
            render: function (t) {
              return raw('<span class="cell-strong">' + esc(fmt.shortDate(t.assignedAt)) + ' — ' + esc(fmt.shortDate(t.dueAt)) + '</span>' +
                '<span class="cell-sub">截止 ' + esc(fmt.datetime(t.dueAt)) + '</span>');
            }
          },
          {
            key: 'progress',
            label: '提交进度',
            width: '230px',
            render: function (t) {
              var s = taskStats(state, t, studentCount);
              return html`<div class="tch-progress-cell">
                <div class="row-between"><span class="tiny muted">${s.answers} / ${s.slots} 题次</span><span class="tiny num">${s.pct}%</span></div>
                ${ui.progress(s.pct, t.status === '进行中' ? 'primary' : 'teal')}
                <div class="tiny muted">${s.submitted} / ${studentCount} 人已提交</div>
              </div>`;
            }
          },
          {
            key: 'status',
            label: '状态',
            width: '96px',
            render: function (t) { return ui.badge(t.status, t.status === '进行中' ? 'primary' : 'neutral'); }
          },
          {
            key: 'ops',
            label: '操作',
            align: 'right',
            width: '150px',
            render: function (t) {
              return ui.button({
                label: '批阅 / 分析',
                tone: 'ghost',
                size: 'sm',
                icon: 'clipboard',
                attrs: 'data-go="#/teacher/grading?task=' + t.id + '"'
              });
            }
          }
        ],
        rows: ov.tasks,
        empty: ui.empty({
          compact: true,
          icon: 'upload',
          title: '还没有教学任务',
          desc: '从“试卷与题目”导入试卷并布置任务后，这里会显示提交进度。',
          action: ui.button({ label: '去导入试卷', tone: 'secondary', size: 'sm', icon: 'upload', attrs: 'data-go="#/teacher/import"' })
        })
      });
      var tasksCard = ui.card({
        title: '近期教学任务',
        desc: '提交进度按题次统计；未提交不计为答错。',
        actions: raw(ui.button({ label: '全部任务与试卷', tone: 'ghost', size: 'sm', icon: 'upload', attrs: 'data-go="#/teacher/import"' }).value),
        pad: false,
        body: tasksBody
      });

      /* ---------- 组装页面 ---------- */
      return html`<div class="page">
        ${head}
        ${firstScreen}
        <section class="section">
          <div class="section-head">
            <div class="section-title">班级概览</div>
            <div class="section-desc">下列指标由 selectors 从作答与诊断数据实时派生，未在页面硬编码。</div>
          </div>
          <div class="tch-kpi-grid">${kpis}</div>
          <div class="grid-2">${errorCard}${attentionCard}</div>
          ${tasksCard}
        </section>
        <div class="row-sm tiny muted">
          ${ui.icon('info', 13)}
          <span>口径说明：待复核批阅不计入一次正确率与错误类型统计；识别异常记录经教师核对后才进入诊断与错误归因。演示数据，不代表真实学情。</span>
        </div>
      </div>`;
    },

    mount: function (root, ctx) {
      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        ev.preventDefault();
        var go = el.getAttribute('data-go');
        if (go) ctx.navigate(go);
      });
      ui.bind(root, '[data-act="explain-process"]', 'click', function () {
        openProcessModal(ctx);
      });
    }
  });
})();
