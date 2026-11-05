/* ============================================================
   教师端 · 作业批阅（左侧队列 + 右侧详情，过程题人工给分复核）
   ------------------------------------------------------------
   - 队列来自 sel.pendingReviews(state,{classId:'c1'}).grades；
   - 客观题自动判分可直接查看；过程题只做辅助批阅，不自动定分；
   - “暂无法判阅”保留在队列，不计为答错；
   - 复核写入 store.actions.gradeAnswer → reviews / auditLogs，并即时刷新。
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

  var CLASS_ID = 'c1';
  var TYPE_LABEL = { choice: '选择题', fill: '填空题', calc: '计算题', process: '过程 / 应用题' };
  var STATUS_FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'suggested', label: '建议复核' },
    { key: 'unjudged', label: '暂无法判阅' }
  ];

  /* ---------------- 模块内界面状态（刷新后保留） ---------------- */
  var S = {
    _fresh: true,
    tab: 'pending',
    status: 'all',
    taskId: 'all',
    search: '',
    selectedId: null,
    keyHandler: null
  };

  window.addEventListener('hashchange', function () {
    S._fresh = true;
  });

  function applyInitial(ctx) {
    var q = ctx.query || {};
    S.tab = 'pending';
    S.status = (q.status === 'suggested' || q.status === 'unjudged' || q.status === 'all') ? q.status : 'all';
    S.taskId = (q.task && sel.task(ctx.state, q.task)) ? q.task : 'all';
    S.search = '';
    S.selectedId = q.answer || null;
  }

  /* ---------------- 数据整理 ---------------- */
  function typeLabel(type) {
    return TYPE_LABEL[type] || type || '题目';
  }

  function taskTitle(state, taskId) {
    var t = sel.task(state, taskId);
    return t ? t.title : '未知任务';
  }

  function pendingList(state) {
    var rows = sel.pendingReviews(state, { classId: CLASS_ID }).grades || [];
    return rows.filter(function (row) {
      if (S.status !== 'all' && row.answer.gradeStatus !== S.status) return false;
      if (S.taskId !== 'all' && row.answer.taskId !== S.taskId) return false;
      if (S.search && row.student.name.indexOf(S.search) < 0) return false;
      return true;
    }).sort(function (a, b) {
      return new Date(b.answer.submittedAt) - new Date(a.answer.submittedAt);
    });
  }

  function reviewedList(state) {
    var rows = [];
    (state.answers || []).forEach(function (a) {
      if (a.gradeStatus !== 'reviewed') return;
      var st = sel.student(state, a.studentId);
      if (!st || st.classId !== CLASS_ID) return;
      if (S.taskId !== 'all' && a.taskId !== S.taskId) return;
      if (S.search && st.name.indexOf(S.search) < 0) return;
      rows.push({ answer: a, question: sel.question(state, a.questionId), student: st });
    });
    return rows.sort(function (a, b) {
      return new Date(b.answer.reviewedAt || b.answer.submittedAt) - new Date(a.answer.reviewedAt || a.answer.submittedAt);
    });
  }

  function currentList(state) {
    return S.tab === 'reviewed' ? reviewedList(state) : pendingList(state);
  }

  function indexOfRow(list, answerId) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].answer.id === answerId) return i;
    }
    return -1;
  }

  function classAnswers(state) {
    return (state.answers || []).filter(function (a) {
      var st = sel.student(state, a.studentId);
      return st && st.classId === CLASS_ID;
    });
  }

  function findRow(answerId) {
    var state = ZWZ.store.state;
    var list = pendingList(state).concat(reviewedList(state));
    for (var i = 0; i < list.length; i++) {
      if (list[i].answer.id === answerId) return list[i];
    }
    return null;
  }

  /* ---------------- 队列列表 ---------------- */
  function queueItemHtml(state, row, selected) {
    var a = row.answer;
    var q = row.question;
    var st = row.student;
    var scoreText = (a.score !== null && a.score !== undefined) ? a.score + ' / ' + (a.maxScore || '—') : '未定分';
    return html`<button type="button" class="tch-queue-item${raw(selected ? ' is-selected' : '')}" data-answer-id="${a.id}">
      <div class="row-between">
        <span class="tch-queue-name">${st.name}</span>
        <span class="row-sm">
          ${a.recognition === 'low' ? ui.badge('低识别', 'warn') : ''}
          ${ui.statusBadge(a.gradeStatus)}
        </span>
      </div>
      <div class="tch-queue-meta">第 ${q ? q.code : '?'} 题 · ${q ? typeLabel(q.type) : '题目缺失'}</div>
      <div class="row-between tch-queue-foot">
        <span class="tiny muted">${fmt.rel(a.submittedAt)}提交</span>
        ${a.gradeStatus === 'reviewed'
          ? html`<span class="tch-queue-score">给分 <span class="num">${scoreText}</span></span>`
          : ''}
      </div>
    </button>`;
  }
  function queueListHtml(state, list) {
    if (!list.length) {
      var filtering = S.status !== 'all' || S.taskId !== 'all' || !!S.search;
      return ui.empty({
        compact: true,
        icon: 'clipboard',
        title: filtering ? '当前筛选下没有记录' : (S.tab === 'pending' ? '当前没有待复核批阅' : '暂无已复核记录'),
        desc: filtering
          ? '可以调整状态 / 任务筛选，或清空搜索条件。'
          : '所有待复核作答都已处理完毕，可以导入新试卷或查看班级分析。',
        action: filtering
          ? ui.button({ label: '清除筛选', tone: 'secondary', size: 'sm', icon: 'refresh', attrs: 'data-act="clear-filters"' })
          : ui.button({ label: '去导入试卷', tone: 'secondary', size: 'sm', icon: 'upload', attrs: 'data-go="#/teacher/import"' })
      });
    }
    return raw(list.map(function (row) {
      return queueItemHtml(state, row, row.answer.id === S.selectedId).value;
    }).join(''));
  }

  /* ---------------- 详情面板 ---------------- */
  function optionsHtml(q) {
    if (!q || !q.options || !q.options.length) return '';
    return html`<div class="tch-option-list">
      ${q.options.map(function (opt, i) {
        var letter = String.fromCharCode(65 + i);
        var correct = String(q.answer || '').trim().toUpperCase() === letter;
        return html`<div class="tch-option-item${raw(correct ? ' is-correct' : '')}">
          <span class="option-key">${letter}</span>
          <span>${opt || '（空）'}</span>
          ${correct ? html`<span class="tag tag-teal">参考答案</span>` : ''}
        </div>`;
      })}
    </div>`;
  }

  function detailEmptyHtml(state) {
    var pending = sel.pendingReviews(state, { classId: CLASS_ID }).grades || [];
    if (!pending.length && S.tab === 'pending') {
      return ui.empty({
        icon: 'checkCircle',
        title: '当前没有待复核记录',
        desc: '待复核批阅已全部处理。可以导入新试卷，或查看班级分析中复核后的结果。',
        action: ui.button({ label: '去导入试卷', tone: 'primary', size: 'sm', icon: 'upload', attrs: 'data-go="#/teacher/import"' })
      });
    }
    return ui.empty({
      icon: 'clipboard',
      title: '请选择左侧的一份作答',
      desc: '左侧队列按提交时间倒序排列；可用学生名搜索、按任务或状态筛选。',
      action: ui.button({ label: '去导入试卷', tone: 'secondary', size: 'sm', icon: 'upload', attrs: 'data-go="#/teacher/import"' })
    });
  }

  function detailHtml(state, list) {
    var row = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].answer.id === S.selectedId) { row = list[i]; break; }
    }
    if (!row) return detailEmptyHtml(state);

    var a = row.answer;
    var q = row.question;
    var st = row.student;
    var idx = indexOfRow(list, a.id);
    var max = a.maxScore || (q && q.scoring && q.scoring.max) || 5;
    var isReviewed = a.gradeStatus === 'reviewed';
    var prefillScore = isReviewed
      ? (a.reviewedScore !== undefined && a.reviewedScore !== null ? a.reviewedScore : (a.score === null || a.score === undefined ? '' : a.score))
      : '';
    var prefillNote = a.reviewedNote || '';
    var hintText = (a.hintLevels && a.hintLevels.length) ? '提示 ' + a.hintLevels.length + ' 次' : '未使用提示';
    var task = sel.task(state, a.taskId);
    var scoreText = (a.score === null || a.score === undefined) ? '未定分' : a.score + ' / ' + max;
    var evidenceItems = (a.gradeEvidence && a.gradeEvidence.length) ? a.gradeEvidence.slice() : ['系统暂无判读依据。'];
    var basisLabel = isReviewed ? '当前判分 ' + scoreText : '系统建议 ' + scoreText;

    var navInfo = html`<div class="tch-detail-head">
      <div class="tch-detail-head-row">
        ${ui.avatar(st.name, { size: 'sm', seed: st.id })}
        <div class="tch-detail-id">
          <div class="tch-detail-name">${st.name}</div>
          <div class="tiny muted">${task ? task.title : '—'} · 第 ${idx + 1} / ${list.length} 份</div>
        </div>
        <div class="row-sm row-wrap">
          ${ui.statusBadge(a.gradeStatus)}
          <span class="tag tag-primary">${S.tab === 'reviewed' ? '已复核记录' : '待复核'}</span>
        </div>
        <div class="row-sm tch-detail-nav">
          ${ui.button({ label: '上一份', tone: 'ghost', size: 'sm', icon: 'chevronLeft', attrs: 'data-act="prev"' })}
          ${ui.button({ label: '下一份', tone: 'ghost', size: 'sm', icon: 'chevronRight', attrs: 'data-act="next"' })}
          <span class="tiny muted">←/→ 切换</span>
        </div>
      </div>
    </div>`;

    var qaPanel = html`<div class="tch-panel tch-qa-panel">
      <div class="tch-panel-head">
        <span class="tch-panel-title">当前题目与学生作答</span>
        <div class="row-sm row-wrap">
          ${q ? ui.badge(typeLabel(q.type), 'neutral') : ''}
          ${q ? html`<span class="tag">${q.difficulty || '—'}</span>` : ''}
          <span class="tiny muted">满分 ${max} 分</span>
        </div>
      </div>
      <div class="tch-qa-grid">
        <div class="tch-qa-block">
          <div class="tch-qa-label">题目</div>
          ${q
            ? html`<div class="question-stem">${q.stem}</div>
                ${optionsHtml(q)}
                <div class="tch-q-meta">
                  <div class="tch-meta-item"><span class="k">参考答案</span><span class="v${q.answer ? '' : ' is-warn'}">${q.answer || '待确认'}</span></div>
                  <div class="tch-meta-item"><span class="k">知识点</span><span class="v">${(q.kpNames || []).join('、') || '—'}</span></div>
                  <div class="tch-meta-item"><span class="k">任务</span><span class="v">${task ? task.title : '—'}</span></div>
                </div>`
            : ui.banner({ tone: 'danger', compact: true, title: '题目数据缺失', body: '无法读取题目信息，请检查数据或重置演示数据。' })}
        </div>
        <div class="tch-qa-block">
          <div class="tch-qa-label">学生作答</div>
          ${a.recognition === 'low'
            ? ui.banner({
                tone: 'warn',
                compact: true,
                title: '识别质量低，请核对原始作答',
                body: '系统不会猜测低识别质量的内容，也不会据此自动定分；以下文本可能不完整，请对照原始书写核对后再给分。'
              })
            : ''}
          <div class="tch-answer-box${raw(a.rawAnswer && String(a.rawAnswer).trim() ? '' : ' is-empty')}">${a.rawAnswer && String(a.rawAnswer).trim() ? a.rawAnswer : '（未检测到有效作答内容）'}</div>
          <div class="tch-qa-meta">提交于 ${fmt.datetime(a.submittedAt)} · ${hintText} · 尝试 ${a.attempts || 1} 次 · 用时 ${fmt.duration(a.durationSec)}</div>
        </div>
      </div>
    </div>`;

    var evidenceDisclosure = ui.disclosure({
      summary: '判分依据',
      count: basisLabel + ' · ' + evidenceItems.length + ' 条',
      body: html`<div class="stack-sm">
        ${ui.evidence({ title: '系统判读依据', items: evidenceItems, status: a.gradeStatus })}
        <div class="row-between tch-system-score">
          <span class="small muted">${isReviewed ? '教师复核给分' : '系统建议分'}</span>
          <span class="num strong${(a.score === null || a.score === undefined) ? ' muted' : ''}">${(a.score === null || a.score === undefined) ? '未定分' : a.score + ' / ' + max}</span>
        </div>
        ${a.gradeNote ? html`<div class="help">${a.gradeNote}</div>` : ''}
        ${q && q.type === 'process'
          ? ui.aiNote('过程题按步骤给分，系统不做自动定分；下方分数由教师确认后生效。')
          : ''}
      </div>`
    });

    var gradeHint = q && q.type === 'process'
      ? html`<div class="tch-inline-warn">${ui.icon('info', 13)}<span>过程题不自动定分：请按步骤给分，系统建议仅供参考。</span></div>`
      : '';

    var gradePanel = html`<div class="tch-panel tch-grade-panel">
      <div class="tch-panel-head">
        <span class="tch-panel-title">教师复核</span>
        <span class="tiny muted">待复核批阅不计入一次正确率与错误率统计</span>
      </div>
      ${gradeHint}
      <div class="tch-grade-form">
        <div class="form-grid">
          <div class="field">
            <div class="label">给分（0 — ${max} 分）<span class="req">*</span></div>
            <input class="input" type="number" id="tch-score-input" min="0" max="${max}" step="0.5"
              value="${prefillScore}" placeholder="请输入 0 — ${max} 之间的分数" />
            <div class="help">过程题需教师按步骤给分；系统不会代填。</div>
          </div>
          <div class="field">
            <div class="label">复核备注</div>
            <textarea class="textarea" id="tch-note-input" placeholder="例如：方程列对，解方程时符号出错，给过程分">${prefillNote}</textarea>
          </div>
        </div>
        <label class="check">
          <input type="checkbox" id="tch-recog-check"${raw(a.recognition === 'low' ? '' : 'checked')} />
          <span>原始作答已人工核对（如识别质量低，勾选后可正常判分）</span>
        </label>
        <div class="tch-wizard-actions">
          <div class="spacer"></div>
          ${S.tab === 'pending'
            ? ui.button({ label: '标记暂无法判阅', tone: 'secondary', size: 'sm', icon: 'help', attrs: 'data-act="mark-unjudged"' })
            : ''}
          ${ui.button({
            label: isReviewed ? '更新复核分数（修正判分）' : '确认给分并复核',
            tone: 'primary',
            icon: 'check',
            attrs: 'data-act="grade-confirm"'
          })}
        </div>
        ${isReviewed
          ? html`<div class="help">已有复核记录：修改分数后点击「更新复核分数」即可修正判分，历史记录保留在下方。</div>`
          : ''}
      </div>
    </div>`;

    var historyList = (state.reviews || []).filter(function (r) { return r.targetId === a.id; })
      .sort(function (x, y) { return new Date(y.at) - new Date(x.at); });
    var historyDisclosure = historyList.length
      ? ui.disclosure({
          summary: '历史复核记录',
          count: historyList.length + ' 条',
          body: html`<div class="tch-history-list">
            ${historyList.map(function (r) {
              var user = sel.userById(state, r.by) || { name: r.by };
              var before = r.before && r.before.status ? (ZWZ.grader.STATUS_LABELS[r.before.status] || r.before.status) + ' · ' + (r.before.score === null || r.before.score === undefined ? '未定分' : r.before.score + ' 分') : '—';
              var after = r.after && r.after.status ? (ZWZ.grader.STATUS_LABELS[r.after.status] || r.after.status) + ' · ' + (r.after.score === null || r.after.score === undefined ? '未定分' : r.after.score + ' 分') : '—';
              return html`<div class="tch-history-item">
                <div class="row-between">
                  <span class="small strong">${r.action === 'confirm' ? '确认判分' : (r.action === 'modify' ? '修正判分' : '教师复核')}</span>
                  <span class="tiny muted">${fmt.datetime(r.at)} · ${user.name}</span>
                </div>
                <div class="tiny muted">${before} → ${after}${r.note ? ' · 备注：' + r.note : ''}</div>
              </div>`;
            })}
          </div>`
        })
      : '';

    return html`<div class="stack">
      ${navInfo}
      ${qaPanel}
      ${evidenceDisclosure}
      ${gradePanel}
      ${historyDisclosure}
    </div>`;
  }

  /* ---------------- 动作 ---------------- */
  function moveSelection(ctx, delta) {
    var state = ZWZ.store.state;
    var list = currentList(state);
    if (!list.length) return;
    var idx = indexOfRow(list, S.selectedId);
    var nextIdx;
    if (idx < 0) nextIdx = 0;
    else nextIdx = idx + delta;
    if (nextIdx < 0) { ui.toast('已经是第一份了', 'info'); nextIdx = 0; }
    if (nextIdx >= list.length) { ui.toast('已经是最后一份了', 'info'); nextIdx = list.length - 1; }
    S.selectedId = list[nextIdx].answer.id;
    ctx.refresh();
  }

  function gradeConfirm(ctx) {
    var state = ZWZ.store.state;
    var row = S.selectedId ? findRow(S.selectedId) : null;
    if (!row) { ui.toast('请先在左侧选择一份作答', 'warn'); return; }
    var q = row.question;
    var max = row.answer.maxScore || (q && q.scoring && q.scoring.max) || 5;
    var scoreEl = document.getElementById('tch-score-input');
    var noteEl = document.getElementById('tch-note-input');
    var recogEl = document.getElementById('tch-recog-check');
    var rawScore = scoreEl ? scoreEl.value.trim() : '';
    if (rawScore === '') {
      ui.toast('请先填写分数（0 — ' + max + ' 分）', 'warn');
      if (scoreEl) scoreEl.focus();
      return;
    }
    var score = Number(rawScore);
    if (isNaN(score) || score < 0 || score > max) {
      ui.toast('分数需在 0 — ' + max + ' 分之间', 'warn');
      if (scoreEl) scoreEl.focus();
      return;
    }
    var note = noteEl ? noteEl.value.trim() : '';
    var beforeList = currentList(state);
    var idx = indexOfRow(beforeList, row.answer.id);
    var patch = { score: score, note: note, action: 'confirm' };
    if (recogEl && recogEl.checked) patch.recognition = 'ok';
    ZWZ.store.actions.gradeAnswer(row.answer.id, patch);

    var afterList = currentList(ZWZ.store.state);
    var next = afterList.length ? afterList[Math.min(Math.max(idx, 0), afterList.length - 1)] : null;
    S.selectedId = next ? next.answer.id : null;
    ui.toast('已确认判分：' + row.student.name + ' · 第 ' + (q ? q.code : '?') + ' 题 ' + score + ' / ' + max + ' 分（教师已复核）', 'success');
    ctx.refresh();
  }

  function markUnjudged(ctx) {
    var row = S.selectedId ? findRow(S.selectedId) : null;
    if (!row) { ui.toast('请先在左侧选择一份作答', 'warn'); return; }
    var noteEl = document.getElementById('tch-note-input');
    var note = noteEl ? noteEl.value.trim() : '';
    ui.confirm({
      title: '标记为暂无法判阅？',
      body: '该记录会保留在复核队列，不计为答错，也不会进入正确率/错误率统计。系统不会猜测作答内容，请补充或核对原始作答后再给分。',
      okText: '标记暂无法判阅',
      cancelText: '返回'
    }).then(function (ok) {
      if (!ok) return;
      var state = ZWZ.store.state;
      var beforeList = currentList(state);
      var idx = indexOfRow(beforeList, row.answer.id);
      ZWZ.store.actions.gradeAnswer(row.answer.id, {
        score: null,
        note: note || '原始作答暂无法辨认，待补充或核对后再判分。',
        action: 'mark-undetermined',
        recognition: 'low'
      });
      var afterList = currentList(ZWZ.store.state);
      var next = afterList.length ? afterList[Math.min(Math.max(idx, 0), afterList.length - 1)] : null;
      S.selectedId = next ? next.answer.id : null;
      ui.toast('已标记为暂无法判阅，记录仍保留在复核队列', 'info');
      ctx.refresh();
    });
  }

  function clearFilters(ctx) {
    S.status = 'all';
    S.taskId = 'all';
    S.search = '';
    S.selectedId = null;
    ctx.refresh();
  }

  /* ---------------- 页面注册 ---------------- */
  ZWZ.pages.register('teacher/grading', {
    title: '作业批阅',
    subtitle: '七年级(3)班 · 待复核批阅与教师给分',

    render: function (ctx) {
      if (S._fresh) {
        S._fresh = false;
        applyInitial(ctx);
      }
      var state = ctx.state;
      var counts = ZWZ.grader.countByStatus(state, classAnswers(state));
      var pendingAll = sel.pendingReviews(state, { classId: CLASS_ID }).grades || [];
      var pendingSuggested = pendingAll.filter(function (r) { return r.answer.gradeStatus === 'suggested'; }).length;
      var pendingUnjudged = pendingAll.filter(function (r) { return r.answer.gradeStatus === 'unjudged'; }).length;
      var reviewedAll = reviewedListForCount(state);
      var list = currentList(state);
      if (!list.some(function (r) { return r.answer.id === S.selectedId; })) {
        S.selectedId = list.length ? list[0].answer.id : null;
      }
      var tasks = sel.tasksOfClass(state, CLASS_ID);
      var taskLabel = '全部任务';
      tasks.forEach(function (t) { if (t.id === S.taskId) taskLabel = t.title; });
      var statusLabel = '全部状态';
      STATUS_FILTERS.forEach(function (f) { if (f.key === S.status && f.key !== 'all') statusLabel = f.label; });

      var head = html`<div class="page-head">
        <div class="page-head-main">
          <div class="page-title">作业批阅</div>
          <div class="page-desc">客观题自动判分；过程题与识别异常作答进入人工复核，待复核不计入正确率与错误率。</div>
        </div>
        <div class="page-actions">
          ${ui.button({ label: '去复核中心', tone: 'secondary', icon: 'shield', attrs: 'data-go="#/teacher/review"' })}
          ${ui.button({ label: '返回工作台', tone: 'ghost', icon: 'dashboard', attrs: 'data-go="#/teacher/dashboard"' })}
        </div>
      </div>`;

      var statStrip = ui.statStrip([
        {
          label: '待复核批阅',
          value: pendingAll.length,
          unit: '条',
          sub: '建议复核 ' + pendingSuggested + ' · 暂无法判阅 ' + pendingUnjudged,
          tone: 'warn'
        },
        {
          label: '教师已复核',
          value: reviewedAll,
          unit: '条',
          sub: '确认或修正后计入统计',
          tone: 'teal'
        },
        {
          label: '自动判分',
          value: counts.auto || 0,
          unit: '条',
          sub: '客观题答案明确，自动确认'
        }
      ]);

      var filterRow = html`<div class="tch-queue-filters">
        ${S.tab === 'pending'
          ? html`<div class="seg">
              ${STATUS_FILTERS.map(function (f) {
                return html`<button type="button" class="seg-item${raw(S.status === f.key ? ' is-active' : '')}" data-status="${f.key}">${f.label}</button>`;
              })}
            </div>`
          : ''}
        <select class="select is-sm" id="tch-task-filter" aria-label="按任务筛选">
          <option value="all"${raw(S.taskId === 'all' ? ' selected' : '')}>全部任务</option>
          ${tasks.map(function (t) {
            return html`<option value="${t.id}"${raw(S.taskId === t.id ? ' selected' : '')}>${t.title}</option>`;
          })}
        </select>
        <div class="search">
          ${ui.icon('search', 14)}
          <input class="input is-sm" id="tch-queue-search" value="${S.search}" placeholder="搜索学生名" />
        </div>
      </div>`;

      var queueCurrent = html`<div class="tch-queue-current">
        <span>当前筛选：<b>${S.tab === 'pending' ? '待复核' : '已复核'}</b> · ${taskLabel} · ${S.tab === 'pending' ? statusLabel : '全部状态'} · 显示 ${list.length} 条</span>
        <span class="tiny muted">点击队列项切换当前作答</span>
      </div>`;

      var tabs = ui.tabs({
        name: 'tch-grading-tabs',
        active: S.tab,
        items: [
          { key: 'pending', label: '待复核' },
          { key: 'reviewed', label: '已复核' }
        ]
      });

      var queue = html`<aside class="card tch-queue">
        <div class="tch-queue-head">
          ${tabs}
          ${filterRow}
          ${queueCurrent}
        </div>
        <div class="tch-queue-list" id="tch-queue-list">${queueListHtml(state, list)}</div>
      </aside>`;

      var detail = html`<section class="card tch-detail" id="tch-detail-panel">${detailHtml(state, list)}</section>`;

      var rules = ui.disclosure({
        summary: '评分规则与审计说明',
        count: '6 条',
        body: html`<ul class="ana-bullets">
          <li>自动判分仅适用于答案明确的客观题；过程题不自动定分，系统给出的判分建议仅供参考。</li>
          <li>识别质量低时系统不猜测作答内容，也不据此自动定分；请核对原始作答后再给分。</li>
          <li>“建议复核”“暂无法判阅”属于待复核状态，不计入一次正确率与错误率统计；“暂无法判阅”不计为答错。</li>
          <li>确认给分或修正分数后写入复核记录，复核结果同步到班级分析与个体档案，并写入审计日志。</li>
          <li>本页不承诺 100% 自动批改；演示数据仅用于产品演示，不代表真实学情。</li>
          <li>队列按提交时间倒序排列；支持 ↑/↓ 或 ←/→ 切换当前作答（输入框内不响应）。</li>
        </ul>`
      });

      return html`<div class="page">
        ${head}
        ${statStrip}
        <div class="tch-grading">
          ${queue}
          ${detail}
        </div>
        ${rules}
      </div>`;
    },

    mount: function (root, ctx) {
      /* 通用跳转 */
      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        ev.preventDefault();
        var go = el.getAttribute('data-go');
        if (go) ctx.navigate(go);
      });

      /* 队列选择 */
      root.querySelectorAll('[data-answer-id]').forEach(function (el) {
        el.addEventListener('click', function () {
          S.selectedId = el.getAttribute('data-answer-id');
          ctx.refresh();
        });
      });

      /* 状态筛选 */
      ui.bind(root, '[data-status]', 'click', function (ev, el) {
        S.status = el.getAttribute('data-status');
        S.selectedId = null;
        ctx.refresh();
      });

      /* 任务筛选 */
      var taskSelect = root.querySelector('#tch-task-filter');
      if (taskSelect) {
        taskSelect.addEventListener('change', function () {
          S.taskId = taskSelect.value;
          S.selectedId = null;
          ctx.refresh();
        });
      }

      /* 学生名搜索 */
      var searchInput = root.querySelector('#tch-queue-search');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          S.search = searchInput.value;
          ctx.refresh();
        });
      }

      /* Tab 切换 */
      ui.bindTabs(root, 'tch-grading-tabs', function (key) {
        S.tab = key;
        S.status = 'all';
        S.selectedId = null;
        ctx.refresh();
      });

      /* 复核动作 */
      ui.bind(root, '[data-act="grade-confirm"]', 'click', function () { gradeConfirm(ctx); });
      ui.bind(root, '[data-act="mark-unjudged"]', 'click', function () { markUnjudged(ctx); });
      ui.bind(root, '[data-act="prev"]', 'click', function () { moveSelection(ctx, -1); });
      ui.bind(root, '[data-act="next"]', 'click', function () { moveSelection(ctx, 1); });
      ui.bind(root, '[data-act="clear-filters"]', 'click', function () { clearFilters(ctx); });

      /* 键盘：<- -> / 上 下 切换上一份 / 下一份（输入框内不响应） */
      if (S.keyHandler) document.removeEventListener('keydown', S.keyHandler);
      S.keyHandler = function (ev) {
        if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
        if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          moveSelection(ctx, -1);
        } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
          ev.preventDefault();
          moveSelection(ctx, 1);
        }
      };
      document.addEventListener('keydown', S.keyHandler);
    }
  });

  function reviewedListForCount(state) {
    var n = 0;
    (state.answers || []).forEach(function (a) {
      if (a.gradeStatus !== 'reviewed') return;
      var st = sel.student(state, a.studentId);
      if (st && st.classId === CLASS_ID) n++;
    });
    return n;
  }
})();

