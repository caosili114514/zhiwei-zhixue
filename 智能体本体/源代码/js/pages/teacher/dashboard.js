/* ============================================================
   教师端 · 工作台（teacher/dashboard）
   ------------------------------------------------------------
   第一轮 UI 优化（2026-11-05）：
   - 5 个 KPI 卡 → 一行「班级状态」指标带（学生/正确率/提示率/覆盖/活跃）；
   - 「待处理 + 进行中任务」合并为首屏主卡：3 条行动项 + 任务进度，主操作明确；
   - 右侧窄栏只放「高频错误 Top3」并保留「查看完整分类」入口；
   - 需要关注的学生保留在第二屏；近期任务表移除（任务仍可在批阅页任务筛选、
     班级分析时间筛选、试卷与题目页找到，工作流不断裂）；
   - 口径说明合并为一处折叠，关键含义可查；数量均由 ZWZ.sel 实时派生。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = window.ZWZ;
  var html = ZWZ.html;
  var raw = ZWZ.raw;
  var esc = ZWZ.esc;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;
  var fmt = ZWZ.fmt;

  function classIdOf(ctx) {
    return (ctx && ctx.session && ctx.session.classId) || (ZWZ.store.session && ZWZ.store.session.classId) || (ZWZ.store.state && ZWZ.store.state.classes && ZWZ.store.state.classes[0] && ZWZ.store.state.classes[0].id) || 'c1';
  }
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

  /* ---------------- 行动项（3 条：数量 + 入口明确） ---------------- */
  function actionRow(o) {
    return html`<div class="tch-action-row is-${o.tone || 'primary'}">
      <div class="tch-action-main">
        <div class="tch-action-title">${o.title}${o.count === undefined
          ? ''
          : html` <span class="tch-action-count num">${o.count}</span><span class="tch-action-unit">${o.unit || ''}</span>`}</div>
        <div class="tch-action-desc">${o.desc}</div>
      </div>
      <div class="tch-action-btns">${o.action}</div>
    </div>`;
  }

  /* ---------------- 过程题 / 识别异常说明弹窗（保留原有能力） ---------------- */
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

  ZWZ.pages.register('teacher/dashboard', {
    title: '工作台',
    subtitle: '七年级(3)班 · 学情诊断与个性化学习',

    render: function (ctx) {
      CLASS_ID = classIdOf(ctx);
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
      var rangeText = range.start ? fmt.date(range.start) + ' — ' + fmt.date(range.end) : '暂无作答数据';
      var head = html`<div class="page-head">
        <div class="page-head-main">
          <h1 class="page-title">工作台</h1>
          <div class="page-desc">${cls.name} · 教学范围：${scopeText} · 数据范围：${rangeText}</div>
        </div>
        <div class="page-actions">
          ${ui.button({ label: '导入试卷', tone: 'secondary', icon: 'upload', attrs: 'data-go="#/teacher/import"' })}
          ${ui.button({ label: '查看班级分析', tone: 'ghost', icon: 'chart', attrs: 'data-go="#/teacher/analysis"' })}
        </div>
      </div>`;

      /* ---------- 班级状态指标带（原 5 个 KPI 卡） ---------- */
      var kpRows = ov.kpRows || [];
      var kpWithRecords = kpRows.filter(function (r) { return r.records > 0; }).length;
      var avgCoverage = kpRows.length
        ? kpRows.reduce(function (sum, r) { return sum + (r.coverage || 0); }, 0) / kpRows.length
        : 0;
      var statusStrip = ui.statStrip([
        { label: '班级学生', value: String(studentCount), unit: '人', sub: '有作答 ' + ov.activeStudents + ' 人' },
        {
          label: '一次正确率',
          value: fmt.pct(ov.accuracy, 1),
          sub: '可判读 ' + ov.judged + ' 条',
          tone: ov.accuracy === null ? 'neutral' : ov.accuracy >= 0.75 ? 'teal' : 'primary'
        },
        { label: '提示使用率', value: fmt.pct(ov.hintRate, 1), sub: '共 ' + ov.records + ' 条作答' },
        { label: '数据覆盖', value: kpWithRecords + ' / ' + kpRows.length, unit: '知识点', sub: '平均覆盖 ' + fmt.pct(avgCoverage, 0) },
        { label: '最近活跃', value: ov.lastActivity ? fmt.shortDate(ov.lastActivity) : '—', sub: ov.lastActivity ? fmt.time(ov.lastActivity) + ' 最近提交' : '暂无作答' }
      ]);

      /* ---------- 首屏主卡：待处理 + 进行中任务 ---------- */
      var rows = [];
      if (gradeQueue.length) {
        rows.push(actionRow({
          title: '待复核批阅',
          count: gradeQueue.length,
          unit: '条',
          tone: 'warn',
          desc: '过程题与识别异常作答需人工复核；复核后计入统计',
          action: ui.button({ label: '去批阅', tone: 'primary', size: 'sm', icon: 'arrowRight', attrs: 'data-go="#/teacher/grading"' })
        }));
      }
      if (pendingDiags) {
        rows.push(actionRow({
          title: '待确认诊断',
          count: pendingDiags,
          unit: '项',
          tone: 'primary',
          desc: '需教师确认或标记暂无法判断' + (prelimDiags ? '；另有 ' + prelimDiags + ' 项初步判断' : ''),
          action: ui.button({ label: '去复核', tone: 'primary', size: 'sm', icon: 'arrowRight', attrs: 'data-go="#/teacher/review?filter=pending"' })
        }));
      }
      var processCount = (counts.suggested || 0) + (counts.unjudged || 0);
      if (processCount) {
        rows.push(actionRow({
          title: '过程题与识别异常',
          tone: 'neutral',
          desc: '建议复核 ' + (counts.suggested || 0) + ' 条 · 暂无法判阅 ' + (counts.unjudged || 0) + ' 条；过程题不自动定分',
          action: ui.button({ label: '查看说明', tone: 'ghost', size: 'sm', icon: 'info', attrs: 'data-act="explain-process"' })
        }));
      }

      var pendingBody;
      if (rows.length) {
        pendingBody = html`<div class="tch-action-list">${rows}</div>`;
      } else {
        pendingBody = ui.empty({
          icon: 'checkCircle',
          title: '当前没有待处理事项',
          desc: '待复核批阅与待确认诊断均已处理完毕。',
          action: ui.button({ label: '查看班级分析', tone: 'secondary', size: 'sm', icon: 'chart', attrs: 'data-go="#/teacher/analysis"' })
        });
      }

      /* 进行中任务（并入主卡，作为第 4 块但视觉从属） */
      var ongoingTasks = ov.tasks.filter(function (t) { return t.status === '进行中'; });
      var activeTask = ongoingTasks[ongoingTasks.length - 1] || ov.tasks[ov.tasks.length - 1] || null;
      var ongoingBlock;
      if (activeTask) {
        var st = taskStats(state, activeTask, studentCount);
        var submitPct = studentCount ? Math.round((st.submitted / studentCount) * 100) : 0;
        ongoingBlock = html`<div class="tch-ongoing-block">
          <div class="tch-block-head">
            <span class="tch-block-kicker">进行中任务</span>
            ${ui.badge(activeTask.status, 'primary')}
            <span class="tiny muted">${fmt.shortDate(activeTask.assignedAt)} 布置</span>
          </div>
          <div class="tch-ongoing-title">${activeTask.title}</div>
          <div class="tch-deadline">
            ${ui.icon('calendar', 14)}
            <span>截止 ${fmt.datetime(activeTask.dueAt)}（${fmt.rel(activeTask.dueAt)}）</span>
            <span class="tiny muted">未提交不计为答错</span>
          </div>
          <div class="tch-metric-row">
            <div class="tch-metric">
              <div class="row-between"><span class="small muted">已提交学生</span><span class="num strong">${st.submitted} / ${studentCount} 人</span></div>
              ${ui.progress(submitPct, submitPct >= 100 ? 'teal' : 'primary')}
            </div>
            <div class="tch-metric">
              <div class="row-between"><span class="small muted">题次提交进度</span><span class="num strong">${st.answers} / ${st.slots}（${st.pct}%）</span></div>
              ${ui.progress(st.pct, 'primary')}
            </div>
          </div>
          <div class="row-sm row-wrap">
            ${ui.button({ label: '查看批阅', tone: 'secondary', size: 'sm', icon: 'clipboard', attrs: 'data-go="#/teacher/grading?task=' + activeTask.id + '"' })}
            ${ui.button({ label: '学情分析', tone: 'ghost', size: 'sm', icon: 'chart', attrs: 'data-go="#/teacher/analysis"' })}
          </div>
        </div>`;
      } else {
        ongoingBlock = html`<div class="tch-ongoing-block">
          <div class="tch-block-head"><span class="tch-block-kicker">进行中任务</span></div>
          ${ui.empty({
            compact: true,
            icon: 'upload',
            title: '暂无进行中的任务',
            desc: '导入一份试卷并布置任务后，这里会显示提交进度。',
            action: ui.button({ label: '导入试卷', tone: 'primary', size: 'sm', icon: 'upload', attrs: 'data-go="#/teacher/import"' })
          })}
        </div>`;
      }

      var mainCard = html`<section class="card tch-main-card">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">待处理 ${ui.badge('共 ' + totalPending + ' 项', 'warn')}</div>
            <div class="card-desc">处理后结论同步到班级分析与个体档案</div>
          </div>
          <div class="card-actions">
            ${ui.button({ label: '复核中心', tone: 'ghost', size: 'sm', icon: 'shield', attrs: 'data-go="#/teacher/review"' })}
          </div>
        </div>
        <div class="card-body">
          ${pendingBody}
          <div class="divider tch-block-divider"></div>
          ${ongoingBlock}
        </div>
      </section>`;

      /* ---------- 右侧窄栏：高频错误 Top3 + 完整分类入口 ---------- */
      var errorTypes = ov.errorTypes || [];
      var errorTotal = errorTypes.reduce(function (sum, e) { return sum + e.count; }, 0);
      var topErrors = errorTypes.slice(0, 3);
      var errorMax = topErrors.reduce(function (max, e) { return Math.max(max, e.count); }, 0) || 1;
      var errorRows = topErrors.map(function (e, idx) {
        var pct = Math.round((e.count / errorTotal) * 100);
        return html`<div class="tch-error-mini-row">
          <span class="tch-error-mini-rank num">${idx + 1}</span>
          <span class="tch-error-mini-label">${e.label}</span>
          <div class="tch-error-mini-bar">${ui.progress(Math.round((e.count / errorMax) * 100), idx === 0 ? 'primary' : 'neutral')}</div>
          <span class="tch-error-mini-count num">${e.count}<span class="tiny muted"> · ${pct}%</span></span>
        </div>`;
      });
      var errorSide = html`<section class="plain-block tch-side-block">
        <div class="plain-head">
          <div class="plain-title">高频错误</div>
          <div class="plain-actions"><a class="link-btn" href="#/teacher/analysis">查看完整分类${ui.icon('chevronRight', 13)}</a></div>
        </div>
        ${topErrors.length
          ? html`<div class="tch-error-mini">${errorRows}</div>
             <div class="tiny muted">Top 3 / 共 ${errorTypes.length} 类 · 仅统计已判分错误记录（${errorTotal} 条）</div>`
          : ui.empty({ compact: true, icon: 'chart', title: '暂无已判分的错误记录', desc: '复核或新作答提交后会显示。' })}
      </section>`;

      /* ---------- 口径说明（全页仅一处，默认折叠） ---------- */
      var scopeNote = ui.disclosure({
        summary: '数据口径与说明',
        count: '6 条',
        body: html`<div class="stack-sm small muted">
          <div>一次正确率 = 首次提交得分 ≥ 满分 80% 的记录占比；仅统计已判分记录，<b>待复核批阅与未提交不计入</b>。</div>
          <div>提示使用率 = 含任意层级提示的作答占比，<b>不等于独立完成率</b>。</div>
          <div>数据覆盖 = 范围内已有可判读记录的知识点数 / 范围内知识点总数；未覆盖不代表学生不会。</div>
          <div>错误类型仅统计已判分错误记录；识别异常（识别质量低 / 空白）需教师核对原始作答后才计入判分与诊断。</div>
          <div>过程题按步骤给分，系统只做辅助批阅，不承诺 100% 自动批改。</div>
          <div>${state.meta && state.meta.dataMode === 'competition' ? '本页数据为主办方模拟学情数据，仅用于本次比赛，不代表真实学情。' : '本页为虚构演示数据，仅用于产品演示，不代表真实学情；教材版本与教学范围待教师确认。'}</div>
        </div>`
      });
      var firstScreen = html`<div class="tch-focus tch-focus-v2">
        ${mainCard}
        <div class="stack tch-side">${errorSide}${scopeNote}</div>
      </div>`;

      /* ---------- 第二屏：需要关注的学生 ---------- */
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
                  <span class="tiny muted">${a.focus.length ? '重点：' + a.focus.map(function (f) { return f.kpName; }).join('、') : '暂未定位到具体知识点'}</span>
                </div>
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

      var attentionBlock = html`<section class="plain-block">
        <div class="plain-head">
          <div class="plain-title">需要关注的学生</div>
          <div class="plain-actions">
            <span class="tiny muted">按“仍需巩固”知识点数排序，不用于比较或排名</span>
            <a class="link-btn" href="#/teacher/analysis">班级分析${ui.icon('chevronRight', 13)}</a>
          </div>
        </div>
        ${attentionBody}
      </section>`;


      return html`<div class="page tch-dashboard">
        ${head}
        ${statusStrip}
        ${firstScreen}
        ${attentionBlock}
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





