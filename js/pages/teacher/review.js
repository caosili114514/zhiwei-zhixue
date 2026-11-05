/* ============================================================
   教师端 · 复核中心（诊断复核 + 批阅复核入口 + 复核记录时间线）
   ------------------------------------------------------------
   - 诊断列表来自 sel.pendingReviews(state,{classId:'c1'}).diagnoses（pending / preliminary）；
   - 确认 / 修正 / 标记暂无法判断均通过 store.actions 写入，
     诊断结果由 selectors 实时派生，班级分析与个体档案同步生效；
   - 所有复核写入 reviews / diagnosisReviews 与 auditLogs，页面底部展示时间线。
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

  var CLASS_ID = 'c1';

  var S = {
    _fresh: true,
    tab: 'diag',
    filter: 'all',
    expandedId: null
  };

  window.addEventListener('hashchange', function () {
    S._fresh = true;
  });

  function applyInitial(ctx) {
    var q = ctx.query || {};
    S.tab = 'diag';
    S.filter = (q.filter === 'pending' || q.filter === 'preliminary') ? q.filter : 'all';
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

  /* ---------------- 诊断复核列表 ---------------- */
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

  function diagTable(state, rows) {
    var head = '<div class="table-wrap tch-diag-wrap"><table class="table tch-diag-table"><thead><tr>' +
      '<th style="width:150px">学生</th>' +
      '<th style="width:190px">知识点</th>' +
      '<th style="width:120px">表现</th>' +
      '<th style="width:110px">状态</th>' +
      '<th style="width:150px">记录 / 可判读</th>' +
      '<th>证据摘要</th>' +
      '<th style="width:88px"></th>' +
      '</tr></thead><tbody>';
    var body = rows.map(function (r) {
      var d = r.diag;
      var st = r.student || sel.student(state, d.studentId) || { name: d.studentId, id: d.studentId };
      var expanded = S.expandedId === d.id;
      var quote = (d.evidence.quotes && d.evidence.quotes.length) ? d.evidence.quotes[0] : '暂无证据记录';
      var reviewedTag = d.reviewed ? ui.badge('已复核', 'success').value : '';
      var row =
        '<tr class="tch-diag-row' + (expanded ? ' is-expanded' : '') + '" data-diag-id="' + esc(d.id) + '">' +
        '<td><div class="tch-diag-student">' + ui.avatar(st.name, { size: 'sm', seed: st.id }).value +
          '<div><div class="cell-strong">' + esc(st.name) + '</div>' + (reviewedTag ? '<div class="cell-sub">' + reviewedTag + '</div>' : '') + '</div></div></td>' +
        '<td><div class="cell-strong">' + esc(d.kpName) + '</div><span class="cell-sub">' + esc(d.chapterName) + '</span></td>' +
        '<td>' + performanceBadge(d).value + '</td>' +
        '<td>' + ui.statusBadge(d.status).value + '</td>' +
        '<td><span class="num">' + d.evidence.records + '</span> 条 · 可判读 <span class="num">' + d.evidence.judged + '</span>' +
          '<span class="cell-sub">' + esc(d.evidence.coverageText) + '</span></td>' +
        '<td><span class="tch-quote">' + esc(fmt.trunc(quote, 62)) + '</span></td>' +
        '<td><button type="button" class="btn btn-ghost btn-sm" data-toggle-diag="' + esc(d.id) + '">' +
          (expanded ? '收起' : '展开') + ui.icon(expanded ? 'chevronDown' : 'chevronRight', 14).value + '</button></td>' +
        '</tr>';
      if (expanded) {
        row += '<tr class="tch-expand-row"><td colspan="7"><div class="tch-diag-detail">' + diagDetailHtml(state, d).value + '</div></td></tr>';
      }
      return row;
    }).join('');
    return raw(head + body + '</tbody></table></div>');
  }

  function renderDiagTab(state) {
    var all = allDiagnoses(state);
    var pendingCount = all.filter(function (r) { return r.diag.status === 'pending'; }).length;
    var prelimCount = all.filter(function (r) { return r.diag.status === 'preliminary'; }).length;
    var rows = filterRows(all);
    rows = rows.slice().sort(function (a, b) {
      var order = { pending: 0, preliminary: 1, sufficient: 2, undetermined: 3 };
      var oa = order[a.diag.status] !== undefined ? order[a.diag.status] : 9;
      var ob = order[b.diag.status] !== undefined ? order[b.diag.status] : 9;
      if (oa !== ob) return oa - ob;
      return (b.diag.evidence.records || 0) - (a.diag.evidence.records || 0);
    });

    var filters = [
      { key: 'pending', label: '待复核', count: pendingCount },
      { key: 'preliminary', label: '初步判断', count: prelimCount },
      { key: 'all', label: '全部', count: all.length }
    ];

    var filterBar = html`<div class="tch-queue-filters">
      <div class="seg">
        ${filters.map(function (f) {
          return html`<button type="button" class="seg-item${raw(S.filter === f.key ? ' is-active' : '')}" data-filter="${f.key}">
            ${f.label}<span class="tiny muted"> ${f.count}</span>
          </button>`;
        })}
      </div>
      <div class="spacer"></div>
      <span class="tiny muted">点击行展开证据与处理表单</span>
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

    return html`<div class="stack">
      ${ui.banner({
        tone: 'info',
        compact: true,
        body: '诊断由规则引擎派生：单条记录不下结论；记录数 < 2 为“初步判断”，识别异常为“待复核”。确认或修正后立即生效，“证据充分”仅建议在记录足够时选择。'
      })}
      ${filterBar}
      ${listHtml}
    </div>`;
  }

  /* ---------------- 批阅复核入口 ---------------- */
  function statHtml(label, value, sub, tone, icon) {
    return html`<div class="tch-stat${raw(tone ? ' is-' + tone : '')}">
      <div class="tch-stat-label">${ui.icon(icon, 14)}<span>${label}</span></div>
      <div class="tch-stat-value num">${value}</div>
      <div class="tch-stat-sub">${sub}</div>
    </div>`;
  }

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
    var counts = ZWZ.grader.countByStatus(state, classAnswers(state));
    var pending = (counts.suggested || 0) + (counts.unjudged || 0);
    var reviewed = reviewedAnswers(state);

    var entry = ui.card({
      title: '批阅复核入口',
      desc: '本 Tab 只提供入口与数量说明；具体给分与复核在「作业批阅」页完成。',
      body: html`<div class="stack-sm">
        <div class="tch-stat-grid is-3">
          ${statHtml('建议复核', counts.suggested || 0, '过程题等，需教师给分', 'warn', 'clock')}
          ${statHtml('暂无法判阅', counts.unjudged || 0, '识别质量低 / 空白，需核对', 'neutral', 'help')}
          ${statHtml('教师已复核', counts.reviewed || 0, '已完成人工复核', 'success', 'shield')}
        </div>
        <div class="help">待复核批阅共 ${pending} 条，不计入一次正确率与错误率统计；过程题不自动定分，系统不承诺 100% 自动批改。</div>
        <div class="row-sm row-wrap">
          ${ui.button({ label: '进入作业批阅', tone: 'primary', icon: 'clipboard', attrs: 'data-go="#/teacher/grading"' })}
          ${ui.button({ label: '只看暂无法判阅', tone: 'secondary', icon: 'filter', attrs: 'data-go="#/teacher/grading?status=unjudged"' })}
        </div>
      </div>`
    });

    var reviewedTable = ui.table({
      className: 'is-compact',
      columns: [
        {
          key: 'student',
          label: '学生',
          width: '150px',
          render: function (r) { return html`<div class="tch-diag-student">${ui.avatar(r.student.name, { size: 'sm', seed: r.student.id })}<span class="cell-strong">${r.student.name}</span></div>`; }
        },
        {
          key: 'question',
          label: '题目',
          width: '180px',
          render: function (r) { return r.question ? '第 ' + r.question.code + ' 题 · ' + (diagnosis.TYPE_LABELS[r.question.type] || '题目') : '—'; }
        },
        {
          key: 'score',
          label: '教师给分',
          width: '110px',
          align: 'right',
          render: function (r) {
            return raw('<span class="num strong">' + (r.answer.score === null || r.answer.score === undefined ? '—' : r.answer.score) + '</span> / <span class="num">' + (r.answer.maxScore || '—') + '</span>');
          }
        },
        { key: 'note', label: '复核备注', render: function (r) { return r.answer.reviewedNote || '—'; } },
        {
          key: 'at',
          label: '复核时间',
          width: '150px',
          render: function (r) { return fmt.datetime(r.answer.reviewedAt); }
        }
      ],
      rows: reviewed,
      empty: ui.empty({ compact: true, icon: 'clipboard', title: '暂无已复核批阅记录', desc: '在「作业批阅」中完成给分复核后，记录会显示在这里。' })
    });

    return html`<div class="stack">
      ${entry}
      ${ui.card({
        title: '最近复核批阅记录',
        desc: '来自 state.reviews 对应作答的教师给分结果，最多显示最近 10 条。',
        pad: false,
        body: reviewedTable
      })}
    </div>`;
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
      var actionLabel = r.action === 'confirm' ? '确认判分' : '修改判分';
      items.push({
        at: r.at,
        kind: 'grade',
        title: '批阅复核 · ' + (st ? st.name : '记录') + (q ? ' · 第 ' + q.code + ' 题' : ''),
        by: userById(state, r.by).name,
        action: actionLabel,
        before: gradeStateText(r.before),
        after: gradeStateText(r.after),
        note: r.note || ''
      });
    });
    (state.diagnosisReviews || []).forEach(function (r) {
      var st = sel.student(state, r.studentId);
      var kp = sel.kp(state, r.kpId);
      var actionLabel = r.action === 'mark-undetermined' ? '标记暂无法判断' : (r.action === 'modify' ? '修正诊断' : '确认诊断');
      var statusLabel = (diagnosis.STATUS[r.status] || {}).label || r.status || '—';
      var perfLabel = r.performance ? ((diagnosis.PERFORMANCE[r.performance] || {}).label || r.performance) : null;
      items.push({
        at: r.at,
        kind: 'diagnosis',
        title: '诊断复核 · ' + (st ? st.name : r.studentId) + ' · ' + (kp ? kp.name : r.kpId),
        by: userById(state, r.by).name,
        action: actionLabel,
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
        desc: '在诊断复核或作业批阅中完成一次操作后，这里会按时间倒序显示记录。'
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
    return ui.card({
      title: '复核记录时间线',
      desc: '合并批阅复核与诊断复核记录，按时间倒序显示最近 20 条。',
      actions: raw(ui.badge('共 ' + items.length + ' 条', 'neutral').value),
      body: body
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
    var patch;
    if (action === 'mark-undetermined') {
      ZWZ.store.actions.markUndetermined(diagId, form.note || '教师标记为暂无法判断，需补充记录。');
      ui.toast('已标记为暂无法判断：' + d.kpName, 'info');
    } else if (action === 'modify') {
      if (!form.performance) { ui.toast('请选择表现判断', 'warn'); return; }
      patch = {
        action: 'modify',
        status: form.status,
        performance: form.performance,
        errorTypes: form.errorTypes,
        note: form.note || '教师修正了该诊断的表现判断。'
      };
      ZWZ.store.actions.confirmDiagnosis(diagId, patch);
      ui.toast('诊断已修正：' + d.kpName, 'success');
    } else {
      patch = {
        action: 'confirm',
        status: form.status,
        note: form.note || '教师已确认该诊断结论。'
      };
      ZWZ.store.actions.confirmDiagnosis(diagId, patch);
      ui.toast('诊断已确认：' + d.kpName + ' · ' + ((diagnosis.STATUS[form.status] || {}).label || form.status), 'success');
    }
    S.expandedId = null;
    ctx.refresh();
  }

  /* ---------------- 页面注册 ---------------- */
  ZWZ.pages.register('teacher/review', {
    title: '复核中心',
    subtitle: '七年级(3)班 · 诊断复核与批阅复核',

    render: function (ctx) {
      if (S._fresh) {
        S._fresh = false;
        applyInitial(ctx);
      }
      var state = ctx.state;
      var diagRows = allDiagnoses(state);
      var pendingCount = diagRows.filter(function (r) { return r.diag.status === 'pending'; }).length;
      var prelimCount = diagRows.filter(function (r) { return r.diag.status === 'preliminary'; }).length;
      var counts = ZWZ.grader.countByStatus(state, classAnswers(state));
      var pendingGrades = (counts.suggested || 0) + (counts.unjudged || 0);

      var head = html`<div class="page-head">
        <div class="page-head-main">
          <div class="page-title">复核中心</div>
          <div class="page-desc">诊断复核与批阅复核的统一入口：确认 / 修正 / 标记暂无法判断，所有操作写入复核记录与审计日志，并即时同步到班级分析与个体档案。</div>
          <div class="row-sm row-wrap tch-head-tags">
            ${ui.badge('待复核诊断 ' + pendingCount + ' 项', 'warn')}
            ${ui.badge('初步判断 ' + prelimCount + ' 项', 'primary')}
            ${ui.badge('待复核批阅 ' + pendingGrades + ' 条', 'warn')}
          </div>
        </div>
        <div class="page-actions">
          ${ui.button({ label: '去作业批阅', tone: 'secondary', icon: 'clipboard', attrs: 'data-go="#/teacher/grading"' })}
          ${ui.button({ label: '返回工作台', tone: 'ghost', icon: 'dashboard', attrs: 'data-go="#/teacher/dashboard"' })}
        </div>
      </div>`;

      var tabs = ui.tabs({
        name: 'tch-review-tabs',
        active: S.tab,
        items: [
          { key: 'diag', label: '诊断复核', badge: diagRows.length },
          { key: 'grade', label: '批阅复核', badge: pendingGrades }
        ]
      });

      var content = S.tab === 'grade' ? renderGradeTab(state) : renderDiagTab(state);

      return html`<div class="page">
        ${head}
        <div class="card">
          <div class="tch-tabbar">${tabs}</div>
          <div class="tch-tabbody">${content}</div>
        </div>
        ${renderTimeline(state)}
        <div class="row-sm tiny muted">
          ${ui.icon('shield', 13)}
          <span>审计说明：复核操作通过 store.actions 写入 state.reviews / state.diagnosisReviews 与 auditLogs；诊断结论由 selectors 实时派生，页面不硬编码任何结论数字。演示数据，不代表真实学情。</span>
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
