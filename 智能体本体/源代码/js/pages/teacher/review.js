/* ============================================================
   教师端 · 复核中心（诊断复核 + 批阅复核入口 + 复核时间线）
   ------------------------------------------------------------
   第一轮 UI 优化（2026-11-05）：
   - 首屏：3 项待办指标 + 诊断复核主列表（默认「待复核」，不把已处理内容放首屏）；
   - 列表改为紧凑任务行：学生 / 知识点（含表现）/ 待复核原因 / 状态 / 记录 / 最近更新 / 复核入口；
   - 展开行内保留完整判据与处理表单（确认 / 修改 / 标记暂无法判断），动作与原有逻辑一致；
   - 批阅复核 Tab 只保留入口、计数说明与已复核记录（折叠）；
   - 复核时间线与口径/审计说明收进带数量的折叠区；状态、排序、筛选与复核闭环不变。
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
  var diagnosis = ZWZ.diagnosis;

  function classIdOf(ctx) {
    return (ctx && ctx.session && ctx.session.classId) || (ZWZ.store.session && ZWZ.store.session.classId) || (ZWZ.store.state && ZWZ.store.state.classes && ZWZ.store.state.classes[0] && ZWZ.store.state.classes[0].id) || 'c1';
  }
  var CLASS_ID = 'c1';

  var S = {
    _fresh: true,
    tab: 'diag',
    filter: 'pending',
    expandedId: null
  };

  window.addEventListener('hashchange', function () {
    S._fresh = true;
  });

  function applyInitial(ctx) {
    var q = ctx.query || {};
    S.tab = 'diag';
    S.filter = (q.filter === 'all' || q.filter === 'preliminary' || q.filter === 'pending') ? q.filter : 'pending';
    S.expandedId = null;
  }

  /* ---------------- 数据整理 ---------------- */
  function classAnswers(state) {
    return (state.answers || []).filter(function (a) {
      var st = sel.student(state, a.studentId);
      return st && st.classId === CLASS_ID;
    });
  }

  function allDiagnoses(state) {
    return sel.pendingReviews(state, { classId: CLASS_ID }).diagnoses || [];
  }

  function filterRows(rows) {
    if (S.filter === 'all') return rows;
    return rows.filter(function (r) { return r.diag.status === S.filter; });
  }

  function performanceBadge(d) {
    return ui.badge(d.performanceLabel, d.performanceTone);
  }

  function userById(state, id) {
    return sel.userById(state, id) || { id: id, name: id };
  }

  /** 待复核原因：只做事实性说明，不夸大结论 */
  function reasonOf(d) {
    if (d.status === 'pending') {
      return d.evidence.pending
        ? '存在 ' + d.evidence.pending + ' 条待复核记录，需人工判断'
        : '识别异常或证据不足，需人工判断';
    }
    return '可判读记录 ' + d.evidence.judged + ' 条，尚未达到“证据充分”';
  }

  function countOf(state) {
    var diagRows = allDiagnoses(state);
    var pending = diagRows.filter(function (r) { return r.diag.status === 'pending'; }).length;
    var prelim = diagRows.filter(function (r) { return r.diag.status === 'preliminary'; }).length;
    var counts = ZWZ.grader.countByStatus(state, classAnswers(state));
    var pendingGrades = (counts.suggested || 0) + (counts.unjudged || 0);
    var reviewedGrades = counts.reviewed || 0;
    var reviewedDiags = (state.diagnosisReviews || []).length;
    return {
      diagRows: diagRows,
      pending: pending,
      prelim: prelim,
      counts: counts,
      pendingGrades: pendingGrades,
      reviewedGrades: reviewedGrades,
      reviewedDiags: reviewedDiags,
      reviewedTotal: reviewedGrades + reviewedDiags
    };
  }

  /* ---------------- 诊断复核：行内详情 ---------------- */
  function diagDetailHtml(state, d) {
    var ev = d.evidence || {};
    var quotes = ev.quotes || [];
    var curStatus = (d.status === 'sufficient' || d.status === 'preliminary') ? d.status : 'preliminary';
    var perfOptions = Object.keys(diagnosis.PERFORMANCE).map(function (key) {
      return html`<option value="${key}"${raw(d.performance === key ? ' selected' : '')}>${diagnosis.PERFORMANCE[key].label}</option>`;
    });
    var errorTypes = diagnosis.errorTypes || [];
    var checkedKeys = (d.errorTypes || []).map(function (e) { return e.key; });
    var errorChecks = errorTypes.map(function (t) {
      return html`<label class="check tch-kp-check" title="${t.desc || ''}">
        <input type="checkbox" data-diag-error="${t.key}"${raw(checkedKeys.indexOf(t.key) >= 0 ? ' checked' : '')} />
        <span>${t.label}<span class="tiny muted"> · ${t.desc || ''}</span></span>
      </label>`;
    });
    var noteValue = d.teacherNote || '';
    return html`<div class="stack-sm">
      ${ui.evidence({
        title: '判断依据（系统记录）',
        items: quotes.length ? quotes : ['当前记录不足以形成可核查的依据。'],
        status: d.status,
        coverage: ev.coverageText,
        foot: '记录 ' + ev.records + ' 条 · 可判读 ' + ev.judged + ' 条 · 待复核 ' + ev.pending + ' 条 · 使用提示 ' + ev.hintUsed + ' 次 · 最近更新 ' + (d.updatedAt ? fmt.datetime(d.updatedAt) : '—')
      })}
      ${ui.aiCard({
        tag: '规则引擎',
        title: '系统建议（供教师参考）',
        meta: d.scope === 'extended' ? '超出教学范围，不作为正式结论' : '记录数 ' + ev.records + ' 条',
        body: d.suggestion,
        caveat: '系统建议不替代教师判断；确认或修正后以教师结论为准，学生端与班级分析同步生效。'
      })}
      ${d.reviewed && d.teacherNote ? ui.banner({ tone: 'info', compact: true, title: '已有教师备注', body: d.teacherNote }) : ''}
      <div class="tch-diag-form">
        <div class="tch-panel-title">教师处理</div>
        <div class="form-grid is-3">
          <div class="field">
            <div class="label">诊断状态</div>
            <select class="select" data-diag-status aria-label="诊断状态">
              <option value="sufficient"${raw(curStatus === 'sufficient' ? ' selected' : '')}>证据充分</option>
              <option value="preliminary"${raw(curStatus === 'preliminary' ? ' selected' : '')}>初步判断</option>
            </select>
            <div class="help">“证据充分”仅建议在记录足够时选择。</div>
          </div>
          <div class="field">
            <div class="label">表现判断（仅“修正并保存”时生效）</div>
            <select class="select" data-diag-perf aria-label="表现判断">${perfOptions}</select>
          </div>
          <div class="field">
            <div class="label">记录覆盖</div>
            <input class="input" value="${ev.records} 条记录 / ${ev.judged} 条可判读" disabled />
          </div>
        </div>
        <div class="field">
          <div class="label">错误类型（仅“修正并保存”时生效，可多选）</div>
          <div class="tch-kp-checks">${errorChecks}</div>
        </div>
        <div class="field">
          <div class="label">教师备注</div>
          <textarea class="textarea" data-diag-note placeholder="例如：与课堂练习表现一致，先按初步判断跟进；下次独立练习后再确认。">${noteValue}</textarea>
        </div>
        <div class="tch-wizard-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-act="diag-undetermined" data-diag="${d.id}">
            ${ui.icon('help', 14)}<span>标记暂无法判断</span>
          </button>
          <div class="spacer"></div>
          <button type="button" class="btn btn-secondary btn-sm" data-act="diag-modify" data-diag="${d.id}">
            ${ui.icon('edit', 14)}<span>修正并保存</span>
          </button>
          <button type="button" class="btn btn-primary btn-sm" data-act="diag-confirm" data-diag="${d.id}">
            ${ui.icon('check', 14)}<span>确认结论</span>
          </button>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- 诊断复核列表（紧凑任务行） ---------------- */
  function diagTable(state, rows) {
    var head = '<div class="table-wrap tch-diag-wrap"><table class="table tch-diag-table is-compact"><thead><tr>' +
      '<th style="width:150px">学生</th>' +
      '<th style="width:230px">知识点 / 表现</th>' +
      '<th style="width:210px">待复核原因</th>' +
      '<th style="width:110px">诊断状态</th>' +
      '<th style="width:140px">记录 / 可判读</th>' +
      '<th style="width:120px">最近更新</th>' +
      '<th style="width:78px"></th>' +
      '</tr></thead><tbody>';
    var body = rows.map(function (r) {
      var d = r.diag;
      var st = r.student || sel.student(state, d.studentId) || { name: d.studentId, id: d.studentId };
      var expanded = S.expandedId === d.id;
      var reviewedTag = d.reviewed ? ui.badge('已复核', 'success').value : '';
      var row =
        '<tr class="tch-diag-row' + (expanded ? ' is-expanded' : '') + '" data-diag-id="' + esc(d.id) + '">' +
        '<td><div class="tch-diag-student">' + ui.avatar(st.name, { size: 'sm', seed: st.id }).value +
          '<div><div class="cell-strong">' + esc(st.name) + '</div>' + (reviewedTag ? '<div class="cell-sub">' + reviewedTag + '</div>' : '<div class="cell-sub">' + esc(st.seatNo ? '学号 ' + st.seatNo : '') + '</div>') + '</div></div></td>' +
        '<td><div class="cell-strong">' + esc(d.kpName) + '</div><div class="cell-sub">' + esc(d.chapterName) + ' · ' + performanceBadge(d).value + '</div></td>' +
        '<td><span class="tch-quote">' + esc(reasonOf(d)) + '</span></td>' +
        '<td>' + ui.statusBadge(d.status).value + '</td>' +
        '<td><span class="num">' + d.evidence.records + '</span> 条 · 可判读 <span class="num">' + d.evidence.judged + '</span>' +
          '<span class="cell-sub">' + esc(d.evidence.coverageText) + '</span></td>' +
        '<td><span class="num tiny">' + (d.updatedAt ? fmt.shortDate(d.updatedAt) + ' ' + fmt.time(d.updatedAt) : '—') + '</span></td>' +
        '<td><button type="button" class="btn btn-ghost btn-sm" data-toggle-diag="' + esc(d.id) + '">' +
          (expanded ? '收起' : '复核') + ui.icon(expanded ? 'chevronDown' : 'chevronRight', 14).value + '</button></td>' +
        '</tr>';
      if (expanded) {
        row += '<tr class="tch-expand-row"><td colspan="7"><div class="tch-diag-detail">' + diagDetailHtml(state, d).value + '</div></td></tr>';
      }
      return row;
    }).join('');
    return raw(head + body + '</tbody></table></div>');
  }

  function renderDiagTab(state) {
    var info = countOf(state);
    var all = info.diagRows;
    var rows = filterRows(all);
    rows = rows.slice().sort(function (a, b) {
      var order = { pending: 0, preliminary: 1, sufficient: 2, undetermined: 3 };
      var oa = order[a.diag.status] !== undefined ? order[a.diag.status] : 9;
      var ob = order[b.diag.status] !== undefined ? order[b.diag.status] : 9;
      if (oa !== ob) return oa - ob;
      return (b.diag.evidence.records || 0) - (a.diag.evidence.records || 0);
    });

    var filters = [
      { key: 'pending', label: '待复核', count: info.pending },
      { key: 'preliminary', label: '初步判断', count: info.prelim },
      { key: 'all', label: '全部', count: all.length }
    ];
    var currentLabel = (filters.filter(function (f) { return f.key === S.filter; })[0] || filters[0]).label;
    var filterBar = html`<div class="tch-review-filters">
      <div class="seg" data-review-filter role="group" aria-label="诊断筛选">
        ${filters.map(function (f) {
          return html`<button type="button" class="seg-item${raw(S.filter === f.key ? ' is-active' : '')}" data-filter="${f.key}">
            ${f.label}<span class="tiny muted"> ${f.count}</span>
          </button>`;
        })}
      </div>
      <div class="tch-review-current">
        <span>当前筛选：<b>${currentLabel}</b> · 显示 ${rows.length} 项</span>
        <span class="tiny muted">点击行展开证据与处理表单</span>
      </div>
    </div>`;

    var listHtml;
    if (!rows.length) {
      listHtml = ui.empty({
        icon: all.length ? 'filter' : 'checkCircle',
        title: all.length ? '当前筛选下没有待复核项' : '当前没有待复核项',
        desc: all.length
          ? '可以切换到“初步判断”或“全部”查看其他诊断记录。'
          : '诊断均已完成教师复核；新增作答后，识别异常或证据不足的诊断会出现在这里。',
        action: all.length
          ? ui.button({ label: '查看全部诊断', tone: 'secondary', size: 'sm', icon: 'refresh', attrs: 'data-act="clear-diag-filter"' })
          : ui.button({ label: '去作业批阅', tone: 'secondary', size: 'sm', icon: 'clipboard', attrs: 'data-go="#/teacher/grading"' })
      });
    } else {
      listHtml = diagTable(state, rows);
    }

    return html`<section class="plain-block tch-review-board">
      <div class="plain-head">
        <div class="plain-title">诊断复核</div>
        <div class="plain-actions">
          <span class="tiny muted">按“待复核 → 初步判断”排序，记录多的在前</span>
        </div>
      </div>
      ${filterBar}
      ${listHtml}
    </section>`;
  }

  /* ---------------- 批阅复核入口 ---------------- */
  function reviewedAnswers(state) {
    var out = [];
    (state.answers || []).forEach(function (a) {
      if (a.gradeStatus !== 'reviewed') return;
      var st = sel.student(state, a.studentId);
      if (!st || st.classId !== CLASS_ID) return;
      out.push({ answer: a, question: sel.question(state, a.questionId), student: st });
    });
    return out.sort(function (a, b) {
      return new Date(b.answer.reviewedAt || b.answer.submittedAt) - new Date(a.answer.reviewedAt || a.answer.submittedAt);
    });
  }

  function renderGradeTab(state) {
    var info = countOf(state);
    var reviewed = reviewedAnswers(state);

    var reviewedTable = ui.table({
      className: 'is-compact',
      columns: [
        {
          key: 'student', label: '学生', width: '140px',
          render: function (r) { return html`<div class="tch-diag-student">${ui.avatar(r.student.name, { size: 'sm', seed: r.student.id })}<span class="cell-strong">${r.student.name}</span></div>`; }
        },
        {
          key: 'question', label: '题目', width: '170px',
          render: function (r) { return r.question ? '第 ' + r.question.code + ' 题 · ' + (diagnosis.TYPE_LABELS[r.question.type] || '题目') : '—'; }
        },
        {
          key: 'score', label: '教师给分', width: '100px', align: 'right',
          render: function (r) {
            return raw('<span class="num strong">' + (r.answer.score === null || r.answer.score === undefined ? '—' : r.answer.score) + '</span> / <span class="num">' + (r.answer.maxScore || '—') + '</span>');
          }
        },
        { key: 'note', label: '复核备注', render: function (r) { return r.answer.reviewedNote || '—'; } },
        { key: 'at', label: '复核时间', width: '140px', render: function (r) { return fmt.datetime(r.answer.reviewedAt); } }
      ],
      rows: reviewed,
      empty: ui.empty({ compact: true, icon: 'clipboard', title: '暂无已复核批阅记录', desc: '在「作业批阅」中完成给分复核后，记录会显示在这里。' })
    });

    return html`<section class="plain-block tch-review-board">
      <div class="plain-head">
        <div class="plain-title">批阅复核</div>
        <div class="plain-actions"><span class="tiny muted">具体给分与复核在「作业批阅」页完成</span></div>
      </div>
      <div class="tch-review-entry">
        <div class="tch-review-entry-text">
          <div>待复核批阅 <b class="num">${info.pendingGrades}</b> 条（建议复核 <span class="num">${info.counts.suggested || 0}</span> · 暂无法判阅 <span class="num">${info.counts.unjudged || 0}</span>）；已复核 <b class="num">${info.reviewedGrades}</b> 条。</div>
          <div class="tiny muted">过程题不自动定分；识别质量低的作答需核对原始作答后再给分。待复核批阅不计入一次正确率与错误类型统计。</div>
        </div>
        <div class="row-sm row-wrap">
          ${ui.button({ label: '进入作业批阅', tone: 'primary', icon: 'clipboard', attrs: 'data-go="#/teacher/grading"' })}
          ${ui.button({ label: '只看暂无法判阅', tone: 'secondary', icon: 'filter', attrs: 'data-go="#/teacher/grading?status=unjudged"' })}
        </div>
      </div>
      ${ui.disclosure({
        summary: '已复核批阅记录',
        count: reviewed.length + ' 条',
        body: reviewedTable
      })}
    </section>`;
  }

  /* ---------------- 复核记录时间线 ---------------- */
  function timelineItems(state) {
    var STATUS_LABELS = ZWZ.grader.STATUS_LABELS || {};
    function gradeStateText(obj) {
      if (!obj) return '—';
      var parts = [];
      if (obj.status) parts.push(STATUS_LABELS[obj.status] || obj.status);
      parts.push((obj.score === null || obj.score === undefined) ? '未定分' : obj.score + ' 分');
      return parts.join(' · ');
    }
    var items = [];
    (state.reviews || []).forEach(function (r) {
      var answer = null;
      for (var i = 0; i < state.answers.length; i++) {
        if (state.answers[i].id === r.targetId) { answer = state.answers[i]; break; }
      }
      var st = answer ? sel.student(state, answer.studentId) : null;
      var q = answer ? sel.question(state, answer.questionId) : null;
      items.push({
        at: r.at,
        kind: 'grade',
        title: '批阅复核 · ' + (st ? st.name : '记录') + (q ? ' · 第 ' + q.code + ' 题' : ''),
        by: userById(state, r.by).name,
        action: r.action === 'confirm' ? '确认判分' : '修改判分',
        before: gradeStateText(r.before),
        after: gradeStateText(r.after),
        note: r.note || ''
      });
    });
    (state.diagnosisReviews || []).forEach(function (r) {
      var st = sel.student(state, r.studentId);
      var kp = sel.kp(state, r.kpId);
      var statusLabel = (diagnosis.STATUS[r.status] || {}).label || r.status || '—';
      var perfLabel = r.performance ? ((diagnosis.PERFORMANCE[r.performance] || {}).label || r.performance) : null;
      items.push({
        at: r.at,
        kind: 'diagnosis',
        title: '诊断复核 · ' + (st ? st.name : r.studentId) + ' · ' + (kp ? kp.name : r.kpId),
        by: userById(state, r.by).name,
        action: r.action === 'mark-undetermined' ? '标记暂无法判断' : (r.action === 'modify' ? '修正诊断' : '确认诊断'),
        before: '系统派生诊断',
        after: '状态 ' + statusLabel + (perfLabel ? ' · ' + perfLabel : '') + (r.errorTypes && r.errorTypes.length ? ' · 错误类型 ' + r.errorTypes.length + ' 项' : ''),
        note: r.note || ''
      });
    });
    return items.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }

  function renderTimeline(state) {
    var items = timelineItems(state);
    var body;
    if (!items.length) {
      body = ui.empty({
        compact: true,
        icon: 'clock',
        title: '暂无复核记录',
        desc: '完成一次诊断复核或批阅复核后，这里会按时间倒序显示。'
      });
    } else {
      body = html`<div class="timeline tch-timeline">
        ${items.slice(0, 20).map(function (it) {
          var dot = it.kind === 'grade' ? (it.action === '修改判分' ? 'is-primary' : 'is-teal') : (it.action === '标记暂无法判断' ? 'is-warn' : 'is-teal');
          return html`<div class="tl-item">
            <span class="tl-dot ${dot}"></span>
            <div class="tl-body">
              <div class="tl-title">${it.title}</div>
              <div class="tl-meta">${fmt.datetime(it.at)} · 操作者：${it.by} · ${it.action}</div>
              <div class="tiny muted">${it.before} → ${it.after}${it.note ? ' · 备注：' + it.note : ''}</div>
            </div>
          </div>`;
        })}
      </div>`;
    }
    return ui.disclosure({
      summary: '复核记录时间线',
      count: items.length + ' 条',
      body: body
    });
  }

  function renderNotes(state) {
    return ui.disclosure({
      summary: '复核口径与审计说明',
      count: '5 条',
      body: html`<ul class="ana-bullets">
        <li>诊断由规则引擎派生：单条记录不下结论；可判读记录少时为“初步判断”，识别异常或证据不足为“待复核”。</li>
        <li>确认 / 修正 / 标记暂无法判断均写入复核记录（reviews / diagnosisReviews）与审计日志，并即时同步到班级分析与个体档案。</li>
        <li>“暂无法判断”不会作为正式结论使用，也不会计为答错；待复核批阅不计入一次正确率与错误类型统计。</li>
        <li>“证据充分”仅建议在记录足够时选择；过程题不自动定分，系统不承诺 100% 自动批改。</li>
        <li>${state.meta && state.meta.dataMode === 'competition' ? '本页数据为主办方模拟学情数据（仅用于本次比赛）；复核结论可随新记录再次调整。' : '本页为虚构模拟数据，仅用于产品演示；复核结论可随新记录再次调整。'}</li>
      </ul>`
    });
  }

  /* ---------------- 动作 ---------------- */
  function findDiag(diagId) {
    var rows = allDiagnoses(ZWZ.store.state);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].diag.id === diagId) return rows[i];
    }
    return null;
  }

  function readForm(diagId) {
    var wrap = document.querySelector('[data-diag-id="' + diagId + '"]');
    var detail = wrap ? wrap.parentNode.querySelector('.tch-diag-detail') : null;
    var scope = detail || document;
    var statusEl = scope.querySelector('[data-diag-status]');
    var perfEl = scope.querySelector('[data-diag-perf]');
    var noteEl = scope.querySelector('[data-diag-note]');
    var errorTypes = [];
    scope.querySelectorAll('[data-diag-error]').forEach(function (el) {
      if (el.checked) errorTypes.push(el.getAttribute('data-diag-error'));
    });
    return {
      status: statusEl ? statusEl.value : 'preliminary',
      performance: perfEl ? perfEl.value : null,
      note: noteEl ? noteEl.value.trim() : '',
      errorTypes: errorTypes
    };
  }

  function diagAction(ctx, diagId, action) {
    var row = findDiag(diagId);
    if (!row) { ui.toast('诊断记录已更新，请刷新后重试', 'warn'); return; }
    var d = row.diag;
    var form = readForm(diagId);
    if (action === 'mark-undetermined') {
      ZWZ.store.actions.markUndetermined(diagId, form.note || '教师标记为暂无法判断，需补充记录。');
      ui.toast('已标记为暂无法判断：' + d.kpName, 'info');
    } else if (action === 'modify') {
      if (!form.performance) { ui.toast('请选择表现判断', 'warn'); return; }
      ZWZ.store.actions.confirmDiagnosis(diagId, {
        action: 'modify',
        status: form.status,
        performance: form.performance,
        errorTypes: form.errorTypes,
        note: form.note || '教师修正了该诊断的表现判断。'
      });
      ui.toast('诊断已修正：' + d.kpName, 'success');
    } else {
      ZWZ.store.actions.confirmDiagnosis(diagId, {
        action: 'confirm',
        status: form.status,
        note: form.note || '教师已确认该诊断结论。'
      });
      ui.toast('诊断已确认：' + d.kpName + ' · ' + ((diagnosis.STATUS[form.status] || {}).label || form.status), 'success');
    }
    S.expandedId = null;
    ctx.refresh();
  }

  /* ---------------- 页面注册 ---------------- */
  ZWZ.pages.register('teacher/review', {
    title: '复核中心',
    subtitle: '七年级(3)班 · 待办优先',

    render: function (ctx) {
      CLASS_ID = classIdOf(ctx);
      if (S._fresh) {
        S._fresh = false;
        applyInitial(ctx);
      }
      var state = ctx.state;
      var info = countOf(state);

      var head = html`<div class="page-head">
        <div class="page-head-main">
          <h1 class="page-title">复核中心</h1>
          <div class="page-desc">待复核记录优先展示；处理结果即时同步到班级分析与个体档案。</div>
        </div>
        <div class="page-actions">
          ${ui.button({ label: '去作业批阅', tone: 'secondary', icon: 'clipboard', attrs: 'data-go="#/teacher/grading"' })}
          ${ui.button({ label: '返回工作台', tone: 'ghost', icon: 'dashboard', attrs: 'data-go="#/teacher/dashboard"' })}
        </div>
      </div>`;

      var statStrip = ui.statStrip([
        {
          label: '待复核诊断',
          value: info.pending,
          unit: '项',
          sub: '另有 ' + info.prelim + ' 项初步判断可一并复核',
          tone: info.pending ? 'warn' : 'teal'
        },
        {
          label: '待复核批阅',
          value: info.pendingGrades,
          unit: '条',
          sub: '建议复核 ' + (info.counts.suggested || 0) + ' · 暂无法判阅 ' + (info.counts.unjudged || 0),
          tone: info.pendingGrades ? 'warn' : 'teal'
        },
        {
          label: '已处理复核',
          value: info.reviewedTotal,
          unit: '条',
          sub: '批阅 ' + info.reviewedGrades + ' · 诊断 ' + info.reviewedDiags
        }
      ]);

      var tabs = ui.tabs({
        name: 'tch-review-tabs',
        active: S.tab,
        items: [
          { key: 'diag', label: '诊断复核' },
          { key: 'grade', label: '批阅复核' }
        ]
      });

      var content = S.tab === 'grade' ? renderGradeTab(state) : renderDiagTab(state);

      return html`<div class="page tch-review-page">
        ${head}
        ${statStrip}
        ${tabs}
        ${content}
        <div class="tch-review-details">
          ${renderTimeline(state)}
          ${renderNotes(state)}
        </div>
      </div>`;
    },

    mount: function (root, ctx) {
      /* 通用跳转 */
      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        ev.preventDefault();
        var go = el.getAttribute('data-go');
        if (go) ctx.navigate(go);
      });

      /* 顶层 Tab */
      ui.bindTabs(root, 'tch-review-tabs', function (key) {
        S.tab = key;
        S.expandedId = null;
        ctx.refresh();
      });

      /* 诊断筛选 */
      ui.bind(root, '[data-filter]', 'click', function (ev, el) {
        S.filter = el.getAttribute('data-filter');
        S.expandedId = null;
        ctx.refresh();
      });
      ui.bind(root, '[data-act="clear-diag-filter"]', 'click', function () {
        S.filter = 'all';
        S.expandedId = null;
        ctx.refresh();
      });

      /* 展开 / 收起诊断行 */
      ui.bind(root, '[data-toggle-diag]', 'click', function (ev, el) {
        ev.stopPropagation();
        var id = el.getAttribute('data-toggle-diag');
        S.expandedId = S.expandedId === id ? null : id;
        ctx.refresh();
      });
      root.querySelectorAll('[data-diag-id]').forEach(function (tr) {
        tr.addEventListener('click', function (ev) {
          if (ev.target.closest('button, select, input, textarea, label, a, .tch-diag-detail')) return;
          var id = tr.getAttribute('data-diag-id');
          S.expandedId = S.expandedId === id ? null : id;
          ctx.refresh();
        });
      });

      /* 诊断处理动作 */
      ui.bind(root, '[data-act="diag-confirm"]', 'click', function (ev, el) {
        ev.stopPropagation();
        diagAction(ctx, el.getAttribute('data-diag'), 'confirm');
      });
      ui.bind(root, '[data-act="diag-modify"]', 'click', function (ev, el) {
        ev.stopPropagation();
        diagAction(ctx, el.getAttribute('data-diag'), 'modify');
      });
      ui.bind(root, '[data-act="diag-undetermined"]', 'click', function (ev, el) {
        ev.stopPropagation();
        var diagId = el.getAttribute('data-diag');
        var row = findDiag(diagId);
        var note = '';
        var detail = document.querySelector('[data-diag-id="' + diagId + '"]');
        if (detail) {
          var noteEl = detail.parentNode.querySelector('[data-diag-note]');
          if (noteEl) note = noteEl.value.trim();
        }
        ui.confirm({
          title: '标记为暂无法判断？',
          body: '该诊断将标记为“暂无法判断”，不会作为正式结论使用；学生端显示中性提示，待补充记录后可再次复核。' + (row ? '（' + row.diag.kpName + '）' : ''),
          okText: '标记暂无法判断',
          cancelText: '返回'
        }).then(function (ok) {
          if (!ok) return;
          var form = readForm(diagId);
          ZWZ.store.actions.markUndetermined(diagId, form.note || note || '教师标记为暂无法判断，需补充记录。');
          S.expandedId = null;
          ui.toast('已标记为暂无法判断（不计入正式结论）', 'info');
          ctx.refresh();
        });
      });
    }
  });
})();



