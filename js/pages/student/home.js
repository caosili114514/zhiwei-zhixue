/* ============================================================
   学生端 · 学习主页（student/home）
   ------------------------------------------------------------
   - 数据全部来自 ZWZ.sel 的实时派生结果，页面不硬编码任何结论数字；
   - 欢迎语按当前时间生成，学习任务 / 最近练习 / 待巩固 / 趋势均取自数据；
   - 所有按钮都有真实行为（跳转练习页对应题目）。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var html = ZWZ.html;
  var fmt = ZWZ.fmt;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;
  var charts = ZWZ.charts;

  function greeting() {
    var hour = new Date().getHours();
    if (hour < 5) return '夜深了';
    if (hour < 9) return '早上好';
    if (hour < 12) return '上午好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  function accuracyTone(value) {
    if (value === null || value === undefined) return 'neutral';
    if (value >= 0.8) return 'teal';
    if (value >= 0.6) return 'primary';
    return 'warn';
  }

  function scoreTone(answer) {
    if (answer.score === null || answer.score === undefined) return 'neutral';
    var max = answer.maxScore || 1;
    if (answer.score >= max) return 'teal';
    if (answer.score <= 0) return 'warn';
    return 'primary';
  }

  /** 任务短名：优先使用任务标题中的关键动作词，保证 chips 可读 */
  function shortTaskName(title) {
    var text = String(title || '');
    if (text.indexOf('订正') >= 0) return '订正再练';
    if (text.indexOf('单元测评') >= 0) return '单元测评';
    if (text.indexOf('课后巩固') >= 0) return '课后巩固';
    if (text.indexOf('测评') >= 0) return '单元测评';
    return fmt.trunc(text, 10);
  }

  function practiceUrl(taskId, questionId) {
    var url = '#/student/practice';
    var params = [];
    if (taskId) params.push('task=' + encodeURIComponent(taskId));
    if (questionId) params.push('question=' + encodeURIComponent(questionId));
    if (params.length) url += '?' + params.join('&');
    return url;
  }

  /** 为某个知识点找到最合适的练习入口：优先当前任务、优先未完成题目 */
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

  ZWZ.pages.register('student/home', {
    title: '学习主页',

    render: function (ctx) {
      var state = ctx.state;
      var session = ctx.session;
      var studentId = session.userId;
      var overview = sel.studentOverview(state, studentId);
      var stats = overview.stats;
      var tasks = overview.tasks;
      var pendingCount = tasks.filter(function (p) { return !p.completed; }).length;
      var taskTitles = {};
      tasks.forEach(function (p) { taskTitles[p.task.id] = p.task.title; });

      var pending = overview.pendingTask;
      var practiceFallback = pending ? practiceUrl(pending.task.id) : '#/student/practice';

      var className = (overview.cls && overview.cls.name) || session.className || '我的班级';

      /* ---------------- 当前任务 ---------------- */
      var taskCard;
      if (pending) {
        var pct = pending.total ? Math.round((pending.submitted / pending.total) * 100) : 0;
        taskCard = ui.card({
          className: 'stu-task-card',
          title: html`当前任务 ${ui.badge('进行中', 'primary')}`,
          desc: pending.task.scopeNote || '',
          actions: ui.button({
            label: '继续练习',
            tone: 'primary',
            icon: 'play',
            attrs: 'data-go="' + practiceUrl(pending.task.id) + '"'
          }),
          body: html`
            <div class="stu-task-title">${pending.task.title}</div>
            <div class="stu-task-meta">
              <span class="stu-meta-item">${ui.icon('calendar', 14)} 截止 ${fmt.datetime(pending.task.dueAt)}（${fmt.rel(pending.task.dueAt)}）</span>
              <span class="stu-meta-item">${ui.icon('fileText', 14)} 已完成 ${pending.submitted} / ${pending.total} 题</span>
              <span class="stu-meta-item warn-text">${ui.icon('alert', 14)} 还剩 ${pending.missingCount} 题未提交</span>
            </div>
            <div class="stu-task-progress">
              ${ui.progress(pct, pending.missingCount ? 'primary' : 'teal')}
              <span class="small muted num">${pct}%</span>
            </div>
            <div class="small muted">
              ${pending.judged
                ? '已判分 ' + pending.judged + ' 条记录，其中一次正确 ' + pending.correct + ' 条。继续作答后会实时更新本任务的进度与诊断。'
                : '本任务还没有可判读的记录，提交后才会进入诊断统计；未作答不会计为答错。'}
            </div>
          `
        });
      } else if (tasks.length) {
        taskCard = ui.card({
          className: 'stu-task-card',
          title: html`当前任务 ${ui.badge('已全部提交', 'teal')}`,
          body: html`<div class="stu-done-hint">
            ${ui.icon('checkCircle', 18)}
            <div>
              <div class="stu-task-title">所有任务都已提交，暂时没有待完成的练习。</div>
              <div class="small muted">可以查看「我的档案」了解知识点表现，或到「学情报告」导出个人报告。</div>
            </div>
          </div>`,
          actions: ui.button({ label: '查看我的档案', tone: 'secondary', icon: 'target', attrs: 'data-go="#/student/archive"' })
        });
      } else {
        taskCard = ui.card({
          body: ui.empty({
            icon: 'calendar',
            title: '暂时没有练习任务',
            desc: '老师还没有给你布置练习任务。可以先看看自己的学情记录，等任务发布后在这里继续。',
            action: ui.button({ label: '查看我的档案', tone: 'secondary', icon: 'target', attrs: 'data-go="#/student/archive"' })
          })
        });
      }

      /* ---------------- KPI ---------------- */
      var kpis = html`<div class="grid grid-4">
        ${ui.kpi({
          label: '已完成题数',
          value: stats.records,
          unit: '条',
          sub: '其中可判读 ' + stats.judged + ' 条',
          icon: 'checkCircle'
        })}
        ${ui.kpi({
          label: '一次正确率',
          value: stats.accuracy === null ? '—' : fmt.pct(stats.accuracy),
          sub: stats.accuracy === null ? '暂无可判读记录' : '可判读 ' + stats.judged + ' 条，正确 ' + stats.correct + ' 条',
          tone: accuracyTone(stats.accuracy),
          icon: 'target'
        })}
        ${ui.kpi({
          label: '使用提示次数',
          value: stats.hintCount,
          unit: '次',
          sub: '分层提示累计使用（用于区分独立完成）',
          icon: 'lightbulb'
        })}
        ${ui.kpi({
          label: '待完成任务数',
          value: pendingCount,
          unit: '个',
          sub: '共 ' + tasks.length + ' 个练习任务',
          tone: pendingCount ? 'warn' : 'teal',
          icon: 'bookmark'
        })}
      </div>`;

      /* ---------------- 最近练习（5 条） ---------------- */
      var recent = overview.recent.slice(0, 5);
      var recentBody;
      if (recent.length) {
        recentBody = html`<div class="stu-recent-list">
          ${recent.map(function (item) {
            var a = item.answer;
            var q = item.question;
            if (!q) return '';
            var judged = a.score !== null && a.score !== undefined;
            var statusHtml = judged
              ? ui.badge(a.score + ' / ' + a.maxScore + ' 分', scoreTone(a))
              : ui.statusBadge(a.gradeStatus || 'unjudged');
            return html`<button type="button" class="stu-recent-item" data-go="${practiceUrl(a.taskId, q.id)}">
              <div class="stu-recent-main">
                <div class="stu-recent-title">第 ${q.code} 题 · ${fmt.trunc(q.stem, 46)}</div>
                <div class="stu-recent-meta">
                  <span class="tag">${(q.kpNames || [])[0] || '知识点待确认'}</span>
                  <span class="tag tag-teal">${taskTitles[a.taskId] || a.taskId}</span>
                  <span class="tiny muted num">${fmt.shortDate(a.submittedAt)} ${fmt.time(a.submittedAt)}</span>
                </div>
              </div>
              <div class="stu-recent-right">${statusHtml}</div>
            </button>`;
          })}
        </div>`;
      } else {
        recentBody = ui.empty({
          icon: 'fileText',
          compact: true,
          title: '还没有练习记录',
          desc: '完成第一道练习后，这里会显示最近的作答与判分情况。',
          action: ui.button({ label: '去练习', tone: 'primary', size: 'sm', attrs: 'data-go="' + practiceFallback + '"' })
        });
      }

      var recentCard = ui.card({
        title: '最近练习',
        desc: '最近 5 条作答记录（按提交时间倒序），点击可进入对应题目查看或修改。',
        actions: ui.button({ label: '全部记录', size: 'sm', tone: 'ghost', attrs: 'data-go="#/student/archive"' }),
        body: recentBody
      });

      /* ---------------- 需要巩固 ---------------- */
      var focus = overview.focus.slice(0, 3);
      var focusCard = ui.card({
        title: '需要巩固',
        desc: '根据当前累计记录优先展示前 3 项；其中“提示后完成 / 反复尝试”说明思路已能建立，但独立程度仍需继续观察。单条记录不作结论，以多次记录与教师复核为准。',
        body: focus.length
          ? html`<div class="stu-focus-list">
              ${focus.map(function (d) {
                var target = questionTargetForKp(state, studentId, d.kpId, pending ? pending.task.id : null);
                return html`<div class="stu-focus-item">
                  <div class="stu-focus-main">
                    <div class="stu-focus-head">
                      <strong>${d.kpName}</strong>
                      ${ui.badge(d.performanceLabel, d.performanceTone)}
                      ${ui.statusBadge(d.status)}
                      <span class="tiny muted num">${d.evidence.coverageText}</span>
                    </div>
                    <div class="small muted stu-focus-note">${d.suggestion}</div>
                  </div>
                  ${ui.button({ label: '去练习', size: 'sm', tone: 'secondary', icon: 'arrowRight', attrs: 'data-go="' + target + '"' })}
                </div>`;
              })}
            </div>`
          : ui.empty({
              icon: 'checkCircle',
              compact: true,
              title: '暂无需集中巩固的知识点',
              desc: '当前记录中没有显示明显的困难项，可以尝试综合题或变式题保持巩固。',
              action: ui.button({ label: '去练习', tone: 'secondary', size: 'sm', attrs: 'data-go="' + practiceFallback + '"' })
            })
      });

      /* ---------------- 学习变化趋势 ---------------- */
      var trend = overview.trend || { xLabels: [], points: [] };
      var sampleParts = [];
      tasks.forEach(function (p) {
        if (!p.judged) return;
        sampleParts.push(shortTaskName(p.task.title) + '（' + p.judged + ' 条可判读）');
      });
      var trendChart = charts.line({
        series: [{ name: '一次正确率', color: charts.COLORS.primary, points: trend.points }],
        xLabels: trend.xLabels,
        yMax: 100,
        unit: '%',
        height: 230,
        area: true,
        title: '学习变化趋势 · 按任务统计一次正确率',
        desc: '横轴为任务时间顺序，纵轴为一次正确率（0—100%）。',
        emptyText: '还没有足够的已判分记录，完成练习后会生成趋势。',
        note: '口径：一次正确率 = 首次提交即得分 ≥ 满分 80% 的记录占比；仅统计已判分记录，待复核与未提交不计入。样本量：' +
          (sampleParts.length ? sampleParts.join('；') : '暂无可用样本') + '。不同任务题目难度不完全可比，趋势仅作参考。'
      });
      var trendCard = ui.card({ body: trendChart });

      /* ---------------- 伴学助手入口 ---------------- */
      var helperCard = ui.card({
        className: 'stu-helper-card',
        title: html`伴学助手 · 分层提示 ${ui.badge('不直接给答案', 'teal')}`,
        actions: ui.button({ label: '去练习页提问', tone: 'teal', icon: 'message', attrs: 'data-go="' + practiceFallback + '"' }),
        body: html`<div class="stu-helper-entry">
          <div class="stu-helper-icon">${ui.icon('bot', 22)}</div>
          <div class="stack-sm stu-helper-text">
            <div class="small">按「知识点提醒 → 思路提示 → 步骤提示 → 完整解析」逐层提供帮助，默认不直接给出答案。</div>
            <div class="small muted">完整解析需要你确认后才会展示，系统会把这次使用记录为“提示使用”，用于区分独立完成与解析后完成，不影响对你的评价。</div>
          </div>
        </div>`
      });

      return html`<div class="page stu-home">
        <div class="page-head">
          <div class="page-head-main">
            <h1 class="page-title">${greeting()}，${overview.student.name || session.name}</h1>
            <div class="page-desc">${className} · 学生视角。这里汇总你当前的练习任务、最近记录与需要巩固的知识点。</div>
          </div>
          <div class="page-actions">
            ${ui.button({ label: '去练习', tone: 'primary', icon: 'edit', attrs: 'data-go="' + practiceFallback + '"' })}
            ${ui.button({ label: '我的档案', tone: 'secondary', icon: 'target', attrs: 'data-go="#/student/archive"' })}
          </div>
        </div>

        ${taskCard}
        ${kpis}

        <div class="grid grid-2 stu-home-split">
          ${recentCard}
          ${focusCard}
        </div>

        ${trendCard}
        ${helperCard}
      </div>`;
    },

    mount: function (root, ctx) {
      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        var target = el.getAttribute('data-go');
        if (target) ctx.navigate(target);
      });
    }
  });
})();
