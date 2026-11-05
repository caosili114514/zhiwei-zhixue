/* ============================================================
   学生端 · 题目练习（student/practice）
   ------------------------------------------------------------
   双栏：左侧题目区 + 题目导航 + 即时诊断反馈；右侧分层伴学助手。
   - 取数全部来自 ZWZ.sel；修改只通过 ZWZ.store.actions；
   - 作答自动存草稿（debounce 300ms），渲染时回填；
   - 提交后展示判分结果、知识点表现、诊断证据、建议与不确定性说明；
   - 提示按 1→4 分层，完整解析需二次确认并记录提示使用。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var html = ZWZ.html;
  var fmt = ZWZ.fmt;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;
  var diagnosis = ZWZ.diagnosis;
  var assistant = ZWZ.assistant;
  var actions = ZWZ.store.actions;

  var TYPE_LABELS = (diagnosis && diagnosis.TYPE_LABELS) || {
    choice: '选择题', fill: '填空题', calc: '计算题', process: '过程 / 应用题'
  };
  var HINT_LABELS = { 1: '知识点提醒', 2: '思路提示', 3: '步骤提示', 4: '完整解析' };
  var DIFF_TONE = { '基础': 'teal', '中等': 'primary', '提升': 'warn' };
  var MAX_MESSAGES = 80;

  var MEM = {
    taskId: null,
    questionId: null,
    messages: []
  };

  /* ---------------- 基础工具 ---------------- */
  function param(ctx, name) {
    if (ctx && ctx.query && ctx.query[name]) return ctx.query[name];
    try {
      var sp = new URLSearchParams(window.location.search || '');
      return sp.get(name) || null;
    } catch (err) {
      return null;
    }
  }

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

  function draftOf(studentId, questionId) {
    var draft = actions.getDraft({ studentId: studentId, questionId: questionId });
    if (!draft || draft.text === undefined || draft.text === null) return '';
    return String(draft.text);
  }

  function answerText(info, q) {
    var submitted = info.answersByQ[q.id];
    var draft = draftOf(info.sid, q.id);
    if (draft !== '') return draft;
    return submitted ? String(submitted.rawAnswer === undefined || submitted.rawAnswer === null ? '' : submitted.rawAnswer) : '';
  }

  /* ---------------- 解析当前上下文 ---------------- */
  function resolve(state, ctx) {
    var sid = ctx.session.userId;
    var progress = sel.tasksForStudent(state, sid).map(function (t) {
      return sel.taskProgress(state, sid, t);
    });
    var taskIds = progress.map(function (p) { return p.task.id; });
    var wantedTask = param(ctx, 'task');
    var taskId = wantedTask && taskIds.indexOf(wantedTask) >= 0 ? wantedTask : null;
    if (!taskId) {
      var pending = progress.filter(function (p) { return !p.completed; }).sort(function (a, b) {
        return new Date(a.task.dueAt) - new Date(b.task.dueAt);
      })[0];
      taskId = pending ? pending.task.id : (progress[0] ? progress[0].task.id : null);
    }
    var task = taskId ? sel.task(state, taskId) : null;
    var questions = task
      ? (task.questionIds || []).map(function (id) { return sel.question(state, id); }).filter(Boolean)
      : [];
    var answersByQ = {};
    if (taskId) {
      sel.answers(state, { studentId: sid, taskId: taskId }).forEach(function (a) {
        answersByQ[a.questionId] = a;
      });
    }
    var wantedQ = param(ctx, 'question');
    var qid = null;
    if (wantedQ && questions.some(function (q) { return q.id === wantedQ; })) qid = wantedQ;
    else if (MEM.questionId && MEM.taskId === taskId && questions.some(function (q) { return q.id === MEM.questionId; })) qid = MEM.questionId;
    if (!qid) {
      var missing = questions.filter(function (q) { return !answersByQ[q.id]; });
      qid = missing.length ? missing[0].id : (questions[0] ? questions[0].id : null);
    }
    MEM.taskId = taskId;
    MEM.questionId = qid;

    var q = null;
    var qIndex = -1;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].id === qid) { q = questions[i]; qIndex = i; break; }
    }
    var activeProgress = null;
    for (var j = 0; j < progress.length; j++) {
      if (progress[j].task.id === taskId) activeProgress = progress[j];
    }
    return {
      sid: sid,
      progress: progress,
      activeProgress: activeProgress,
      task: task,
      questions: questions,
      answersByQ: answersByQ,
      q: q,
      qIndex: qIndex
    };
  }

  /* ---------------- 即时诊断反馈 ---------------- */
  function buildFeedback(state, info, q, answer) {
    var result = ZWZ.grader.grade(state, answer, q);
    var kpId = (q.kpIds || [])[0];
    var diag = null;
    if (kpId) {
      var list = sel.diagnostics(state, { studentId: info.sid });
      for (var i = 0; i < list.length; i++) {
        if (list[i].kpId === kpId) { diag = list[i]; break; }
      }
    }
    var judged = result.score !== null && result.score !== undefined;
    var scoreText = judged ? (result.score + ' / ' + result.maxScore + ' 分') : '暂不计分';

    var statusBanner = '';
    if (result.status === 'suggested') {
      statusBanner = ui.banner({
        tone: 'warn',
        compact: true,
        title: '过程题需教师复核',
        body: '系统只做辅助批阅，不对过程题自动定分；本条记录不会计为答错，最终得分以教师复核为准。'
      });
    } else if (result.status === 'unjudged') {
      statusBanner = ui.banner({
        tone: 'warn',
        compact: true,
        title: '暂无法判阅',
        body: '没有识别到有效内容，或识别质量较低，本条记录不计入答错。你可以修改后重新提交，或等待教师核对原始作答。'
      });
    }

    var diagBlock = '';
    if (diag) {
      diagBlock = html`<div class="stu-fb-block">
        <div class="stu-fb-row">
          <span class="small muted">当前知识点表现</span>
          ${ui.badge(diag.performanceLabel, diag.performanceTone)}
          ${ui.statusBadge(diag.status)}
          <span class="tiny muted num">${diag.evidence.coverageText}</span>
        </div>
        <div class="tiny muted">
          「${diag.kpName}」累计 ${diag.evidence.records} 条记录，其中 ${diag.evidence.judged} 条可判读、${diag.evidence.pending} 条待复核。单次提交只增加 1 条记录，不单独判定掌握情况。
        </div>
      </div>`;
    }

    var errorBlock = '';
    if (diag && diag.errorTypes && diag.errorTypes.length) {
      errorBlock = html`<div class="stu-fb-block">
        <div class="tiny muted">错误类型（来自累计记录，非单题定性）</div>
        <div class="chip-row">
          ${diag.errorTypes.map(function (e) { return ui.badge(e.label + ' ×' + e.count, e.tone); })}
        </div>
      </div>`;
    }

    var hasNext = info.qIndex >= 0 && info.qIndex < info.questions.length - 1;
    var hasMissing = info.questions.some(function (qq) { return !info.answersByQ[qq.id]; });

    var body = html`
      ${statusBanner}
      ${diagBlock}
      ${errorBlock}
      ${ui.evidence({
        title: '本题判分依据',
        items: result.evidence || [],
        status: result.status
      })}
      ${diag ? ui.evidence({
        title: '知识点累计证据',
        items: diag.evidence.quotes || [],
        status: diag.status,
        coverage: diag.evidence.coverageText
      }) : ''}
      ${diag ? ui.banner({ tone: 'info', compact: true, title: '下一步建议', body: diag.suggestion }) : ''}
      ${ui.banner({
        tone: 'info',
        compact: true,
        title: '单题不作结论',
        body: '这道题只带来 1 条新的作答记录。知识点表现需要累计记录支撑，诊断状态会随记录数量与教师复核结果变化，并不代表对你的固定评价。'
      })}
      <div class="stu-fb-actions">
        ${hasNext ? ui.button({ label: '下一题', tone: 'primary', icon: 'arrowRight', attrs: 'data-act="next"' }) : ''}
        ${hasMissing ? ui.button({ label: '继续练习（下一道未完成）', tone: 'secondary', attrs: 'data-act="continue"' }) : ''}
        ${ui.button({ label: '查看提示', tone: 'quiet', icon: 'lightbulb', attrs: 'data-hint="1"' })}
      </div>`;

    return ui.card({
      className: 'stu-feedback',
      title: html`即时诊断反馈 ${ui.statusBadge(result.status)}`,
      desc: '提交后立即生成；结论会随记录累积与教师复核变化。',
      actions: html`<span class="stu-fb-score">${scoreText}</span>`,
      body: body
    });
  }

  /* ---------------- 伴学消息 ---------------- */
  function pushMessages(list, q) {
    (list || []).forEach(function (m) {
      if (q) m.__qcode = q.code;
      MEM.messages.push(m);
    });
    if (MEM.messages.length > MAX_MESSAGES) MEM.messages = MEM.messages.slice(-MAX_MESSAGES);
  }

  function messageHtml(m) {
    if (!m) return '';
    if (m.role === 'user') {
      return html`<div class="stu-msg is-user">
        <div class="stu-msg-body">${m.body || ''}</div>
      </div>`;
    }
    var actionHtml = [];
    (m.actions || []).forEach(function (a) {
      if (a.hash) {
        actionHtml.push(ui.button({ label: a.label, size: 'sm', tone: 'secondary', attrs: 'data-go="' + a.hash + '"' }));
      } else if (a.action === 'hint' && a.level) {
        actionHtml.push(ui.button({ label: a.label, size: 'sm', tone: 'secondary', attrs: 'data-hint="' + a.level + '"' }));
      }
    });
    var badges = [];
    if (m.__qcode) badges.push(ui.badge('第 ' + m.__qcode + ' 题', 'neutral'));
    if (m.scope === 'extended') badges.push(ui.badge('拓展内容', 'warn'));

    return html`<div class="stu-msg is-bot">
      <div class="stu-msg-head">
        ${ui.icon('bot', 14)}
        <strong>${m.title || '伴学助手'}</strong>
        ${badges}
      </div>
      <div class="stu-msg-body">${m.body || ''}</div>
      ${m.scopeWarning ? ui.banner({ tone: 'warn', compact: true, body: m.scopeWarning }) : ''}
      ${m.steps && m.steps.length ? html`<ol class="steps-list">${m.steps.map(function (s) { return html`<li>${s}</li>`; })}</ol>` : ''}
      ${m.evidence && m.evidence.length ? ui.evidence({ title: '参考依据', items: m.evidence }) : ''}
      ${m.caveat ? html`<div class="ai-caveat">${m.caveat}</div>` : ''}
      ${actionHtml.length ? html`<div class="stu-msg-actions">${actionHtml}</div>` : ''}
    </div>`;
  }

  function welcomeHtml() {
    return html`<div class="stu-msg is-bot is-welcome">
      <div class="stu-msg-head">${ui.icon('bot', 14)}<strong>伴学助手</strong></div>
      <div class="stu-msg-body">我会围绕当前这道题提供分层帮助，不直接给答案。可以先点下方快捷问法，或选择「知识点提醒 / 思路提示 / 步骤提示 / 完整解析」。</div>
      <div class="ai-caveat">完整解析需要你确认后才会展示，并记录为“提示使用”；提示使用会与「独立完成」区分统计，不影响对你的评价。</div>
    </div>`;
  }

  function requestHint(ctx, q, level) {
    if (!q) {
      ui.toast('请先选择一道题目，再请求提示', 'warn');
      return;
    }
    var sid = ctx.session.userId;
    var run = function () {
      var res = assistant.studentReply(ctx.state, { studentId: sid, questionId: q.id, level: level });
      pushMessages(res.messages, q);
      /* 先记录提示使用，再展示（store 派发变更后页面会自动刷新到最新状态） */
      actions.logHint({ studentId: sid, questionId: q.id, level: level });
      if (level === 4) ui.toast('已记录本次完整解析使用，不计入错误', 'info');
      else ui.toast('已显示「' + (HINT_LABELS[level] || '提示') + '」，可继续独立思考', 'success');
    };
    if (level === 4) {
      ui.confirm({
        title: '查看完整解析？',
        body: '完整解析会直接给出解题过程。系统会把这次使用记录为“提示使用”，用于区分独立完成与解析后完成，不影响对你的评价。',
        okText: '确认查看',
        cancelText: '再想一想'
      }).then(function (ok) { if (ok) run(); });
    } else {
      run();
    }
  }

  function sendMessage(ctx, q, text) {
    var value = String(text || '').trim();
    if (!value) {
      ui.toast('请先输入你的问题', 'warn');
      return;
    }
    var sid = ctx.session.userId;
    MEM.messages.push({ role: 'user', type: 'user', body: value, __qcode: q ? q.code : '' });
    var res = assistant.studentReply(ctx.state, { studentId: sid, questionId: q ? q.id : null, message: value });
    pushMessages(res.messages, q);
    ctx.refresh();
  }

  function clearMessages(ctx) {
    MEM.messages = [];
    ctx.refresh();
    ui.toast('已清空伴学对话记录（提示使用记录仍保留在学情数据中）', 'info');
  }

  /* ---------------- 作答交互 ---------------- */
  function readAnswer(root, q) {
    if (!q) return '';
    if (q.type === 'choice') {
      var active = root.querySelector('[data-opt].is-active');
      return active ? active.getAttribute('data-opt') : '';
    }
    var input = root.querySelector('[data-answer-input]');
    return input ? input.value : '';
  }

  function doSubmit(root, ctx, info) {
    var q = info.q;
    if (!q) {
      ui.toast('请先选择一道题目', 'warn');
      return;
    }
    var value = readAnswer(root, q);
    if (!String(value || '').trim()) {
      ui.toast(q.type === 'choice' ? '请先选择一个选项再提交' : '请先填写作答内容再提交', 'warn');
      return;
    }
    var res = actions.submitAnswer({
      studentId: info.sid,
      taskId: info.task.id,
      questionId: q.id,
      rawAnswer: value
    });
    if (!res) {
      ui.toast('提交未成功：题目数据缺失，请刷新后重试', 'error');
      return;
    }
    var message;
    if (res.result.status === 'auto') message = '已提交并完成自动判分，下方为即时诊断反馈';
    else if (res.result.status === 'suggested') message = '已提交。过程题需教师复核，下方为辅助批阅结果';
    else message = '已提交。本题暂无法判阅，可修改后重新提交';
    ui.toast(message, res.result.status === 'auto' ? 'success' : 'info');
    ctx.refresh();
    /* app 在渲染后会恢复滚动位置，因此在渲染结束后再把反馈卡片带入视野 */
    setTimeout(function () {
      var card = document.querySelector('.stu-feedback');
      if (!card || !card.scrollIntoView) return;
      try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) { card.scrollIntoView(); }
    }, 90);
  }

  function goQuestion(ctx, taskId, questionId) {
    MEM.questionId = questionId;
    ctx.navigate(practiceUrl(taskId, questionId));
  }

  /* ---------------- 页面 ---------------- */
  ZWZ.pages.register('student/practice', {
    title: '题目练习',

    render: function (ctx) {
      var state = ctx.state;
      var info = resolve(state, ctx);

      if (!info.task) {
        return html`<div class="page stu-practice">
          <div class="page-head">
            <div class="page-head-main">
              <h1 class="page-title">题目练习</h1>
              <div class="page-desc">选择任务、逐题作答，提交后查看即时诊断反馈；右侧伴学助手提供分层提示。</div>
            </div>
          </div>
          <div class="card">${ui.empty({
            icon: 'edit',
            title: '暂时没有可练习的任务',
            desc: '当前还没有分配给你的练习任务。可以先回到学习主页查看最近的记录与学情。',
            action: ui.button({ label: '回到学习主页', tone: 'primary', attrs: 'data-go="#/student/home"' })
          })}</div>
        </div>`;
      }

      var task = info.task;
      var q = info.q;
      var activeProgress = info.activeProgress || { total: 0, submitted: 0, missingCount: 0 };
      var pct = activeProgress.total ? Math.round((activeProgress.submitted / activeProgress.total) * 100) : 0;

      /* ---- 任务 chips ---- */
      var taskChips = info.progress.map(function (p) {
        return ui.chip(shortTaskName(p.task.title) + ' · ' + p.submitted + '/' + p.total, {
          active: p.task.id === task.id,
          attrs: 'data-task="' + p.task.id + '"'
        });
      });

      var taskBar = html`<div class="card stu-taskbar">
        <div class="card-body is-solo">
          <div class="stu-taskbar-top">
            <div class="stu-taskbar-main">
              <div class="small strong navy">练习任务</div>
              <div class="chip-row stu-task-chips">${taskChips}</div>
            </div>
            <div class="stu-taskbar-progress">
              <div class="small muted">已提交 <span class="num">${activeProgress.submitted}</span> / <span class="num">${activeProgress.total}</span> 题
                ${activeProgress.missingCount ? html`<span class="warn-text">· 还剩 ${activeProgress.missingCount} 题</span>` : html`<span class="teal-text">· 已全部提交</span>`}
              </div>
              ${ui.progress(pct, activeProgress.missingCount ? 'primary' : 'teal')}
            </div>
          </div>
          <div class="tiny muted stu-taskbar-note">${task.scopeNote || ''} · 截止 ${fmt.datetime(task.dueAt)}（${fmt.rel(task.dueAt)}）</div>
        </div>
      </div>`;

      if (!q) {
        return html`<div class="page stu-practice">
          <div class="page-head">
            <div class="page-head-main">
              <h1 class="page-title">题目练习</h1>
              <div class="page-desc">选择任务、逐题作答，提交后查看即时诊断反馈；右侧伴学助手提供分层提示。</div>
            </div>
          </div>
          ${taskBar}
          <div class="card">${ui.empty({
            icon: 'fileText',
            title: '该任务下暂无题目',
            desc: '任务题目正在准备中，请稍后再试或选择其他任务。',
            action: ui.button({ label: '回到学习主页', tone: 'secondary', attrs: 'data-go="#/student/home"' })
          })}</div>
        </div>`;
      }

      /* ---- 题目导航 ---- */
      var navButtons = info.questions.map(function (item, idx) {
        var submitted = !!info.answersByQ[item.id];
        var cls = 'stu-qnav-btn' + (submitted ? ' is-submitted' : '') + (item.id === q.id ? ' is-current' : '');
        var label = '第 ' + (idx + 1) + ' 题' + (submitted ? ' · 已提交' : ' · 未提交');
        return html`<button type="button" class="${cls}" data-qid="${item.id}" title="${label}" aria-label="${label}">${item.code}</button>`;
      });
      var navCard = html`<div class="card stu-qnav-card">
        <div class="card-body is-solo">
          <div class="row-between stu-qnav-head">
            <div class="small strong navy">题目导航</div>
            <div class="stu-legend tiny muted">
              <span><i class="stu-dot is-submitted"></i>已提交</span>
              <span><i class="stu-dot"></i>未提交</span>
              <span><i class="stu-dot is-current"></i>当前题</span>
            </div>
          </div>
          <div class="stu-qnav">${navButtons}</div>
        </div>
      </div>`;

      /* ---- 题目区 ---- */
      var answer = info.answersByQ[q.id];
      var currentValue = answerText(info, q);
      var typeLabel = TYPE_LABELS[q.type] || q.type;
      var diffTone = DIFF_TONE[q.difficulty] || 'neutral';
      var metaHtml = html`<div class="stu-qmeta">
        <span class="tag tag-primary">第 ${info.qIndex + 1} 题</span>
        <span class="tag">${typeLabel}</span>
        ${ui.badge(q.difficulty || '难度待确认', diffTone)}
        ${(q.kpNames || []).map(function (name) { return html`<span class="tag tag-teal">${name}</span>`; })}
        ${answer ? html`<span class="badge badge-success">${ui.icon('check', 12)}已提交</span>` : ''}
      </div>`;

      var answerArea;
      if (q.type === 'choice') {
        var selected = String(currentValue || '').trim().toUpperCase();
        var correctLetter = String(q.answer || '').trim().toUpperCase();
        var graded = answer && answer.score !== null && answer.score !== undefined && answer.gradeStatus === 'auto';
        var options = (q.options || []).map(function (opt, idx) {
          var letter = String.fromCharCode(65 + idx);
          var cls = 'option';
          if (letter === selected) cls += ' is-active';
          if (graded) {
            if (letter === correctLetter) cls += ' is-correct';
            else if (letter === selected) cls += ' is-wrong';
          }
          return html`<button type="button" class="${cls}" data-opt="${letter}">
            <span class="option-key">${letter}</span>
            <span class="option-text">${opt}</span>
          </button>`;
        });
        answerArea = html`<div class="stu-options">${options}</div>
          <div class="answer-hint">点击选项即可选择；选择后会自动保存，切换题目不会丢失。</div>`;
      } else if (q.type === 'process') {
        answerArea = html`<div class="field">
          <label class="label" for="answer-input">你的作答过程</label>
          <textarea class="textarea is-lg stu-answer-input" id="answer-input" data-answer-input="1"
            placeholder="写出关键步骤与最终结果，例如：3 − (−9) = 3 + 9 = 12（℃）">${currentValue}</textarea>
          <div class="help">过程题由系统辅助批阅，最终得分以教师复核为准；空白不会被计为答错。</div>
        </div>`;
      } else {
        answerArea = html`<div class="field">
          <label class="label" for="answer-input">${q.type === 'fill' ? '填写答案' : '计算结果'}</label>
          <input class="input stu-answer-input" id="answer-input" data-answer-input="1" type="text"
            value="${currentValue}" placeholder="${q.type === 'fill' ? '填写最终答案' : '填写计算结果，例如 -4'}" autocomplete="off" />
          <div class="help">按题目的参考答案填写最终结果即可；书写不规范时可修改后重新提交。</div>
        </div>`;
      }

      var submittedNote = '';
      if (answer) {
        var hintsUsed = (answer.hintLevels || []).length;
        submittedNote = html`<div class="stu-submitted-note">
          ${ui.icon('checkCircle', 14)}
          <span>已于 ${fmt.datetime(answer.submittedAt)} 提交（第 ${answer.attempts || 1} 次作答）${hintsUsed ? '，本题使用提示 ' + hintsUsed + ' 次' : '，本次未使用提示'}。如需修改，改动后再次提交即可。</span>
        </div>`;
      }
      var draft = draftOf(info.sid, q.id);
      var draftNote = draft && !answer ? html`<div class="tiny muted stu-draft-note">${ui.icon('edit', 12)} 草稿已自动保存</div>` : '';

      var questionCard = html`<div class="card stu-question-card">
        <div class="card-body is-solo">
          ${metaHtml}
          <div class="question-stem stu-stem">${q.stem}</div>
          <div class="stu-answer-area">${answerArea}</div>
          ${draftNote}
          ${submittedNote}
          <div class="stu-answer-actions">
            ${ui.button({
              label: answer ? '重新提交' : '提交作答',
              tone: 'primary',
              icon: 'check',
              attrs: 'data-act="submit"'
            })}
            ${ui.button({ label: '下一题', tone: 'secondary', icon: 'arrowRight', attrs: 'data-act="next"' })}
            ${ui.button({ label: '清空重填', tone: 'ghost', attrs: 'data-act="reset"' })}
          </div>
        </div>
      </div>`;

      var feedbackCard = answer ? buildFeedback(state, info, q, answer) : '';

      /* ---- 右侧伴学面板 ---- */
      var chatList = MEM.messages.length ? MEM.messages.map(messageHtml) : welcomeHtml();
      var quickAsks = (assistant && assistant.quickAsks) || [];
      var hintButtons = [1, 2, 3, 4].map(function (level) {
        return ui.button({
          label: HINT_LABELS[level],
          size: 'sm',
          tone: level === 1 ? 'quiet' : 'secondary',
          icon: level === 4 ? 'eye' : 'lightbulb',
          attrs: 'data-hint="' + level + '"'
        });
      });

      var assistantCard = ui.card({
        className: 'stu-assistant',
        title: html`伴学助手 ${ui.badge('分层提示', 'teal')}`,
        desc: '当前题目：第 ' + q.code + ' 题 · ' + ((q.kpNames || [])[0] || '知识点待确认'),
        actions: ui.button({ label: '清空', size: 'sm', tone: 'ghost', icon: 'refresh', attrs: 'data-act="clear-chat"' }),
        body: html`<div class="stu-chat">
          <div class="stu-chat-list" data-chat-list>
            ${chatList}
          </div>
          <div class="stu-chat-quick">
            <div class="tiny muted">快捷问法</div>
            <div class="chip-row stu-quick-asks">
              ${quickAsks.map(function (text) {
                return ui.chip(text, { attrs: 'data-ask="' + ZWZ.esc(text) + '"' });
              })}
            </div>
          </div>
          <div class="stu-hint-levels">${hintButtons}</div>
          <div class="stu-chat-input">
            <input class="input" id="chat-input" type="text" placeholder="就当前题目提问，例如：这道题在考什么？" autocomplete="off" />
            ${ui.button({ label: '发送', tone: 'primary', size: 'sm', icon: 'arrowRight', attrs: 'data-act="send-chat"' })}
          </div>
          <div class="tiny muted stu-chat-foot">${(assistant && assistant.MODEL_NOTE) || '本地规则应答'} · 提示使用会与独立完成区分统计</div>
        </div>`
      });

      return html`<div class="page stu-practice">
        <div class="page-head">
          <div class="page-head-main">
            <h1 class="page-title">题目练习</h1>
            <div class="page-desc">选择任务、逐题作答，提交后查看即时诊断反馈；右侧伴学助手按层级提供提示，不直接给答案。</div>
          </div>
          <div class="page-actions">
            ${ui.button({ label: '我的档案', tone: 'secondary', icon: 'target', attrs: 'data-go="#/student/archive"' })}
            ${ui.button({ label: '学情报告', tone: 'secondary', icon: 'chart', attrs: 'data-go="#/student/report"' })}
          </div>
        </div>

        ${taskBar}

        <div class="split stu-practice-split">
          <div class="split-main stack">
            ${navCard}
            ${questionCard}
            ${feedbackCard}
          </div>
          <aside class="split-side">${assistantCard}</aside>
        </div>
      </div>`;
    },

    mount: function (root, ctx) {
      var state = ctx.state;
      var info = resolve(state, ctx);
      var q = info.q;

      /* 通用跳转 */
      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        var target = el.getAttribute('data-go');
        if (target) ctx.navigate(target);
      });

      /* 任务切换 */
      ui.bind(root, '[data-task]', 'click', function (ev, el) {
        var taskId = el.getAttribute('data-task');
        if (!taskId || taskId === MEM.taskId) return;
        MEM.taskId = taskId;
        MEM.questionId = null;
        ctx.navigate(practiceUrl(taskId));
      });

      /* 题目切换 */
      ui.bind(root, '[data-qid]', 'click', function (ev, el) {
        var questionId = el.getAttribute('data-qid');
        if (!questionId) return;
        goQuestion(ctx, MEM.taskId, questionId);
      });

      /* 选择题选项 */
      ui.bind(root, '[data-opt]', 'click', function (ev, el) {
        if (!q) return;
        var letter = el.getAttribute('data-opt');
        root.querySelectorAll('[data-opt]').forEach(function (node) {
          node.classList.toggle('is-active', node === el);
        });
        actions.saveDraft({ studentId: info.sid, questionId: q.id, text: letter });
      });

      /* 输入自动存草稿（debounce 300ms） */
      var inputEl = root.querySelector('[data-answer-input]');
      if (inputEl && q) {
        var saveDraft = ZWZ.util.debounce(function () {
          actions.saveDraft({ studentId: info.sid, questionId: q.id, text: inputEl.value });
        }, 300);
        inputEl.addEventListener('input', saveDraft);
      }

      /* 提交 / 下一题 / 继续 / 清空 */
      ui.bind(root, '[data-act="submit"]', 'click', function () { doSubmit(root, ctx, info); });
      ui.bind(root, '[data-act="next"]', 'click', function () {
        if (!q) return;
        if (info.qIndex >= 0 && info.qIndex < info.questions.length - 1) {
          goQuestion(ctx, info.task.id, info.questions[info.qIndex + 1].id);
        } else {
          ui.toast('已经是本任务的最后一题', 'info');
        }
      });
      ui.bind(root, '[data-act="continue"]', 'click', function () {
        var next = info.questions.filter(function (item) { return !info.answersByQ[item.id]; })[0];
        if (next) goQuestion(ctx, info.task.id, next.id);
        else ui.toast('本任务已全部提交，可以到「我的档案」查看学情记录', 'success');
      });
      ui.bind(root, '[data-act="reset"]', 'click', function () {
        if (!q) return;
        var el = root.querySelector('[data-answer-input]');
        if (el) el.value = '';
        root.querySelectorAll('[data-opt]').forEach(function (node) { node.classList.remove('is-active'); });
        actions.clearDraft({ studentId: info.sid, questionId: q.id });
        ui.toast('已清空当前输入内容（已提交的记录不受影响）', 'info');
        ctx.refresh();
      });

      /* 分层提示 */
      ui.bind(root, '[data-hint]', 'click', function (ev, el) {
        var level = parseInt(el.getAttribute('data-hint'), 10) || 1;
        requestHint(ctx, q, Math.min(4, Math.max(1, level)));
      });

      /* 快捷问法 / 自由提问 / 清空对话 */
      ui.bind(root, '[data-ask]', 'click', function (ev, el) {
        sendMessage(ctx, q, el.getAttribute('data-ask'));
      });
      ui.bind(root, '[data-act="send-chat"]', 'click', function () {
        var chatInput = root.querySelector('#chat-input');
        sendMessage(ctx, q, chatInput ? chatInput.value : '');
      });
      var chatInput = root.querySelector('#chat-input');
      if (chatInput) {
        chatInput.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            sendMessage(ctx, q, chatInput.value);
          }
        });
      }
      ui.bind(root, '[data-act="clear-chat"]', 'click', function () {
        if (!MEM.messages.length) {
          ui.toast('当前没有对话记录', 'info');
          return;
        }
        clearMessages(ctx);
      });

      /* 新消息滚到底部 */
      var list = root.querySelector('[data-chat-list]');
      if (list) list.scrollTop = list.scrollHeight;
    }
  });
})();
