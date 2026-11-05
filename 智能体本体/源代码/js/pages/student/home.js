/* ============================================================
   学生端 · 学习主页（student/home）
   ------------------------------------------------------------
   第一轮 UI 优化（2026-11-05）：
   - 首屏只回答「接下来做什么」：主焦点 = 当前任务；
   - 4 个 KPI 卡 → 一行指标带（信息不丢，只改呈现）；
   - 只突出 1 个「当前优先关注」知识点，并保留「查看其他关注点（N 项）」明确入口；
   - 最近练习 5 条 → 3 条单行，去掉趋势图（趋势在「我的档案」）；
   - 数据口径只解释一次，放入折叠区。
   数据仍全部来自 ZWZ.sel 实时派生，不硬编码任何结论数字。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var html = ZWZ.html;
  var fmt = ZWZ.fmt;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;

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
      var pending = overview.pendingTask;
      var practiceFallback = pending ? practiceUrl(pending.task.id) : '#/student/practice';
      var className = (overview.cls && overview.cls.name) || session.className || '我的班级';
      var studentName = (overview.student && overview.student.name) || session.name;

      /* ---------------- 主焦点：接下来做什么 ---------------- */
      var hero;
      if (pending) {
        var pct = pending.total ? Math.round((pending.submitted / pending.total) * 100) : 0;
        hero = html`<section class="focus-card stu-hero">
          <div class="focus-kicker">${ui.icon('play', 13)} 接下来做什么</div>
          <div>
            <div class="focus-title">${pending.task.title}</div>
            <div class="focus-meta">
              <span class="stu-meta-item">${ui.icon('clock', 14)} 截止 ${fmt.shortDate(pending.task.dueAt)} ${fmt.time(pending.task.dueAt)}（${fmt.rel(pending.task.dueAt)}）</span>
              <span class="stu-meta-item">${ui.icon('fileText', 14)} 已完成 ${pending.submitted} / ${pending.total} 题</span>
              ${pending.missingCount
                ? html`<span class="stu-meta-item warn-text">${ui.icon('alert', 14)} 还剩 ${pending.missingCount} 题未提交</span>`
                : html`<span class="stu-meta-item teal-text">${ui.icon('checkCircle', 14)} 全部题目已提交</span>`}
            </div>
          </div>
          <div class="focus-progress">
            ${ui.progress(pct, pending.missingCount ? 'primary' : 'teal')}
            <span class="focus-progress-text num">${pct}%</span>
          </div>
          <div class="focus-actions">
            ${ui.button({ label: '继续练习', tone: 'primary', size: 'lg', icon: 'play', attrs: 'data-go="' + practiceUrl(pending.task.id) + '"' })}
            <span class="small muted">${pending.missingCount ? '未作答不计为答错 · 练习页可获取分层提示' : '可查看即时诊断反馈'}</span>
          </div>
        </section>`;
      } else if (tasks.length) {
        hero = html`<section class="focus-card stu-hero">
          <div class="focus-kicker">${ui.icon('checkCircle', 13)} 今日状态</div>
          <div>
            <div class="focus-title">练习任务已全部提交</div>
            <div class="focus-meta">
              <span class="stu-meta-item">共 ${tasks.length} 个任务</span>
              <span class="stu-meta-item">已判分 ${stats.judged} 条记录</span>
            </div>
          </div>
          <div class="focus-actions">
            ${ui.button({ label: '查看学情报告', tone: 'primary', size: 'lg', icon: 'chart', attrs: 'data-go="#/student/report"' })}
            ${ui.button({ label: '我的档案', tone: 'secondary', attrs: 'data-go="#/student/archive"' })}
          </div>
        </section>`;
      } else {
        hero = html`<section class="focus-card stu-hero">
          <div class="focus-kicker">${ui.icon('calendar', 13)} 今日状态</div>
          <div class="focus-title">暂时没有练习任务</div>
          <div class="focus-meta"><span>老师布置任务后会显示在这里；可以先看看自己的学情记录。</span></div>
          <div class="focus-actions">
            ${ui.button({ label: '查看我的档案', tone: 'secondary', icon: 'target', attrs: 'data-go="#/student/archive"' })}
          </div>
        </section>`;
      }

      /* ---------------- 指标带（原 4 个 KPI 卡） ---------------- */
      var statStrip = ui.statStrip([
        { label: '已完成题数', value: fmt.num(stats.records), unit: '条', sub: '可判读 ' + stats.judged + ' 条' },
        {
          label: '一次正确率',
          value: stats.accuracy === null ? '—' : fmt.pct(stats.accuracy),
          sub: stats.judged ? stats.correct + ' / ' + stats.judged + ' 条可判读' : '暂无可判读记录',
          tone: accuracyTone(stats.accuracy)
        },
        { label: '提示使用', value: fmt.num(stats.hintCount), unit: '次', sub: '用于区分独立完成' },
        { label: '待完成任务', value: pendingCount, unit: '个', sub: '共 ' + tasks.length + ' 个任务', tone: pendingCount ? 'warn' : 'teal' }
      ]);

      /* ---------------- 最近练习：3 条单行 ---------------- */
      var recent = overview.recent.slice(0, 3);
      var recentRows = recent.length
        ? html`<div class="list-rows">
            ${recent.map(function (item) {
              var a = item.answer;
              var q = item.question;
              if (!q) return '';
              var judged = a.score !== null && a.score !== undefined;
              var statusHtml = judged
                ? ui.badge(a.score + ' / ' + a.maxScore + ' 分', scoreTone(a))
                : ui.statusBadge(a.gradeStatus || 'unjudged');
              return html`<a class="list-row" href="${practiceUrl(a.taskId, q.id)}">
                <span class="list-row-mark ${judged ? (a.score >= (a.maxScore || 1) * 0.8 ? 'is-teal' : 'is-warn') : 'is-primary'}"></span>
                <span class="list-row-main">
                  <span class="list-row-title">第 ${q.code} 题 · ${fmt.trunc(q.stem, 34)}</span>
                  <span class="list-row-sub">${(q.kpNames || [])[0] || '知识点待确认'} · ${fmt.shortDate(a.submittedAt)} ${fmt.time(a.submittedAt)}</span>
                </span>
                <span class="list-row-end">${statusHtml}</span>
              </a>`;
            })}
          </div>`
        : ui.empty({
            icon: 'fileText',
            compact: true,
            title: '还没有练习记录',
            desc: '完成后这里会显示最近 3 条作答。',
            action: ui.button({ label: '去练习', tone: 'primary', size: 'sm', attrs: 'data-go="' + practiceFallback + '"' })
          });

      var recentBlock = html`<section class="plain-block">
        <div class="plain-head">
          <div class="plain-title">最近练习</div>
          <div class="plain-actions">
            <a class="link-btn" href="#/student/archive">全部记录${ui.icon('chevronRight', 13)}</a>
          </div>
        </div>
        ${recentRows}
      </section>`;

      /* ---------------- 当前优先关注（只突出 1 个，保留其他入口） ---------------- */
      var focusAll = overview.focus || [];
      var top = focusAll[0] || null;
      var othersCount = Math.max(0, focusAll.length - 1);
      var focusTarget = top ? questionTargetForKp(state, studentId, top.kpId, pending ? pending.task.id : null) : practiceFallback;

      var focusBody;
      if (top) {
        var topError = top.errorTypes.length ? top.errorTypes[0].label : '暂无可归因错误';
        focusBody = html`<div class="stu-priority">
          <div class="stu-priority-head">
            <span class="stu-priority-kp">${top.kpName}</span>
            ${ui.badge(top.performanceLabel, top.performanceTone)}
            ${ui.statusBadge(top.status)}
          </div>
          <div class="stu-priority-meta">
            <span class="num">${top.evidence.judged} / ${top.evidence.records}</span> 条可判读 · ${topError}
          </div>
          <div class="stu-priority-actions">
            ${ui.button({ label: '做同类练习', size: 'sm', tone: 'secondary', icon: 'edit', attrs: 'data-go="' + focusTarget + '"' })}
            <a class="link-btn" href="#/student/archive">查看依据</a>
          </div>
        </div>`;
      } else {
        focusBody = ui.empty({
          icon: 'checkCircle',
          compact: true,
          title: '暂无需集中巩固的知识点',
          desc: '当前记录中没有明显困难项。',
          action: ui.button({ label: '去练习', tone: 'secondary', size: 'sm', attrs: 'data-go="' + practiceFallback + '"' })
        });
      }

      var focusHeadAction = othersCount > 0
        ? html`<div class="plain-actions"><a class="link-btn" href="#/student/archive">查看其他关注点（${othersCount} 项）${ui.icon('chevronRight', 13)}</a></div>`
        : html`<div class="plain-actions"><a class="link-btn" href="#/student/archive">查看知识点档案${ui.icon('chevronRight', 13)}</a></div>`;

      var sampleParts = [];
      tasks.forEach(function (p) {
        if (!p.judged) return;
        sampleParts.push(fmt.shortDate(p.task.assignedAt) + ' 任务 ' + p.judged + ' 条');
      });
      var scopeNote = ui.disclosure({
        summary: '数据口径与说明',
        body: html`<div class="stack-sm small muted">
          <div>一次正确率 = 首次提交得分 ≥ 满分 80% 的记录占比；仅统计已判分记录，待复核与未提交不计入。</div>
          <div>「提示后完成 / 反复尝试」表示思路已能建立，但独立程度仍需观察；单条记录不作结论，以多次记录与教师复核为准。</div>
          <div>样本：${sampleParts.length ? sampleParts.join('；') : '暂无可用样本'}。</div>
        </div>`
      });

      var focusBlock = html`<section class="plain-block">
        <div class="plain-head">
          <div class="plain-title">当前优先关注</div>
          ${focusHeadAction}
        </div>
        ${focusBody}
        ${scopeNote}
      </section>`;

      return html`<div class="page stu-home">
        <div class="page-head">
          <div class="page-head-main">
            <h1 class="page-title">${greeting()}，${studentName}</h1>
            <div class="page-desc">${className} · 先完成当前练习，其他关注点随时可查。</div>
          </div>
          <div class="page-actions">
            ${ui.button({ label: '学情报告', tone: 'secondary', icon: 'chart', attrs: 'data-go="#/student/report"' })}
            ${ui.button({ label: '我的档案', tone: 'ghost', icon: 'target', attrs: 'data-go="#/student/archive"' })}
          </div>
        </div>

        ${hero}
        ${statStrip}

        <div class="focus-grid">
          ${recentBlock}
          ${focusBlock}
        </div>
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
