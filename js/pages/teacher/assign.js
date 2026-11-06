/* ============================================================
   教师端 · 布置作业
   ============================================================ */
(function () {
  'use strict';
  var ZWZ = window.ZWZ;
  var html = ZWZ.html;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;
  var fmt = ZWZ.fmt;

  var S = { paperId: null, title: '', due: '', scope: '' };

  function classIdOf(ctx) {
    return (ctx.session && ctx.session.classId) || 'c1';
  }
  function localInput(ms) {
    var d = new Date(ms);
    var p = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function dueDefault() { return localInput(Date.now() + 3 * 86400000); }

  function papersOf(state, classId) {
    return (state.papers || []).filter(function (p) { return p.classId === classId && p.status === 'confirmed'; });
  }

  ZWZ.pages.register('teacher/assign', {
    title: '布置作业',
    subtitle: '教师端 · 选择试卷、设置截止时间并布置',
    render: function (ctx) {
      var state = ctx.state;
      var classId = classIdOf(ctx);
      var classes = sel.classes(state);
      var papers = papersOf(state, classId);
      if (!S.due) S.due = dueDefault();
      if (S.paperId && !papers.some(function (p) { return p.id === S.paperId; })) S.paperId = null;
      var selected = S.paperId ? papers.filter(function (p) { return p.id === S.paperId; })[0] : null;
      var questions = selected ? sel.questionsOfPaper(state, selected.id) : [];
      var students = sel.classStudents(state, classId);

      var head = html`<div class="page-head">
        <div class="page-head-main">
          <div class="page-title">布置作业</div>
          <div class="page-desc">选择一份已确认试卷，填写标题与截止时间，布置后学生端立即出现任务；提交自动进入批阅队列。</div>
        </div>
        <div class="page-actions">
          ${ui.button({ label: '查看批阅队列', tone: 'secondary', icon: 'clipboard', attrs: 'data-go="#/teacher/grading"' })}
          ${ui.button({ label: '返回工作台', tone: 'ghost', icon: 'dashboard', attrs: 'data-go="#/teacher/dashboard"' })}
        </div>
      </div>`;

      if (!papers.length) {
        return html`<div class="page">${head}
          ${ui.empty({
            icon: 'upload',
            title: '当前班级还没有可布置的试卷',
            desc: '请先在“试卷与题目”中导入/确认一份试卷，再回来布置作业。',
            action: ui.button({ label: '去导入试卷', tone: 'primary', icon: 'upload', attrs: 'data-go="#/teacher/import"' })
          })}
        </div>`;
      }

      var classField = classes.length > 1 ? html`<label class="assign-class">班级
        <select class="select is-sm" id="assign-class">
          ${classes.map(function (c) { return html`<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${c.name}</option>`; })}
        </select>
      </label>` : html`<span class="tiny muted">班级：${classes[0] ? classes[0].name : classId}</span>`;

      var paperCards = papers.map(function (p) {
        var qs = sel.questionsOfPaper(state, p.id);
        return html`<button type="button" class="assign-paper ${p.id === S.paperId ? 'is-active' : ''}" data-paper="${p.id}">
          <span class="assign-paper-title">${p.title}</span>
          <span class="assign-paper-meta">${qs.length} 道题 · ${p.parseMode === 'manual' ? '手动录入' : '模拟解析'} · 已确认</span>
        </button>`;
      });

      var paperList = html`<div class="assign-paper-list">${paperCards}</div>`;
      var form = selected ? html`<div class="assign-form">
        <div class="form-grid">
          <div class="field"><div class="label">任务标题 <span class="req">*</span></div>
            <input class="input" id="assign-title" value="${S.title || selected.title}" placeholder="例如：整式运算专项练习" /></div>
          <div class="field"><div class="label">截止时间 <span class="req">*</span></div>
            <input class="input" id="assign-due" type="datetime-local" value="${S.due}" /></div>
        </div>
        <div class="form-grid">
          <div class="field"><div class="label">布置班级</div>
            <input class="input" value="${classes[0] ? classes[0].name : classId}" disabled /></div>
          <div class="field"><div class="label">教学范围说明</div>
            <input class="input" id="assign-scope" value="${S.scope}" placeholder="例如：T01 代数式与整式运算；不涉及未教内容" /></div>
        </div>
        <div class="assign-preview">
          <div class="assign-preview-head">试卷预览 <span class="tiny muted">共 ${questions.length} 道题</span></div>
          <div class="assign-question-list">
            ${questions.slice(0, 6).map(function (q, i) {
              return html`<div class="assign-question"><span class="num">${i + 1}</span><span>${fmt.trunc(q.stem || q.code, 54)}</span><span class="tiny muted">${q.type === 'process' ? '过程题' : (q.type === 'choice' ? '选择题' : (q.type === 'fill' ? '填空题' : '计算题'))}</span></div>`;
            })}
            ${questions.length > 6 ? html`<div class="tiny muted">还有 ${questions.length - 6} 道题未展开…</div>` : ''}
          </div>
        </div>
        <div class="assign-submit">
          <span class="tiny muted">布置后学生端出现“待完成”任务；未提交不计为答错；提交后客观题自动判分，过程题进入批阅队列。</span>
          ${ui.button({ label: '确认布置作业', tone: 'primary', icon: 'check', attrs: 'data-act="assign-submit"' })}
        </div>
      </div>` : html`<div class="assign-form assign-empty">
        ${ui.empty({ icon: 'fileText', title: '请选择一份试卷', desc: '从左侧选择已确认试卷后，右侧填写任务信息并确认布置。' })}
      </div>`;

      return html`<div class="page assign-page">
        ${head}
        <div class="assign-toolbar">${classField}<span class="tiny muted">已确认试卷 ${papers.length} 份 · 可布置学生 ${students.length} 名</span></div>
        <div class="assign-layout">
          <section class="card assign-papers-card">
            <div class="card-head"><div class="card-head-main"><div class="card-title">选择试卷</div><div class="card-desc">仅显示当前班级已确认的试卷</div></div></div>
            <div class="card-body">${paperList}</div>
          </section>
          <section class="card assign-form-card">
            <div class="card-head"><div class="card-head-main"><div class="card-title">任务信息</div><div class="card-desc">${selected ? '当前：' + selected.title : '先选择左侧试卷'}</div></div></div>
            <div class="card-body">${form}</div>
          </section>
        </div>
      </div>`;
    },
    mount: function (root, ctx) {
      ui.bind(root, '[data-go]', 'click', function (ev, el) { ev.preventDefault(); ctx.navigate(el.getAttribute('data-go')); });
      root.querySelectorAll('[data-paper]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          S.paperId = btn.getAttribute('data-paper');
          var p = (ZWZ.store.state.papers || []).filter(function (x) { return x.id === S.paperId; })[0];
          S.title = p ? p.title : '';
          ctx.refresh();
        });
      });
      var cls = root.querySelector('#assign-class');
      if (cls) cls.addEventListener('change', function () {
        if (!ZWZ.store.actions.setClass(cls.value)) return;
        S.paperId = null; S.title = ''; S.scope = '';
        ctx.refresh();
      });
      var titleEl = root.querySelector('#assign-title');
      var dueEl = root.querySelector('#assign-due');
      var scopeEl = root.querySelector('#assign-scope');
      if (titleEl) titleEl.addEventListener('input', function () { S.title = titleEl.value; });
      if (dueEl) dueEl.addEventListener('change', function () { S.due = dueEl.value; });
      if (scopeEl) scopeEl.addEventListener('input', function () { S.scope = scopeEl.value; });
      ui.bind(root, '[data-act="assign-submit"]', 'click', function () {
        if (!S.paperId) { ui.toast('请先选择试卷', 'warn'); return; }
        var title = titleEl ? String(titleEl.value || '').trim() : '';
        var dueVal = dueEl ? dueEl.value : '';
        var due = dueVal ? new Date(dueVal) : null;
        if (!title) { ui.toast('请填写任务标题', 'warn'); if (titleEl) titleEl.focus(); return; }
        if (!due || isNaN(due.getTime())) { ui.toast('请填写有效的截止时间', 'warn'); if (dueEl) dueEl.focus(); return; }
        var paper = (ZWZ.store.state.papers || []).filter(function (p) { return p.id === S.paperId; })[0];
        if (!paper) { ui.toast('试卷不存在，请重新选择', 'error'); return; }
        var task = ZWZ.store.actions.createTask({
          title: title,
          classId: classIdOf(ctx),
          paperId: S.paperId,
          dueAt: due.toISOString(),
          scopeNote: scopeEl ? scopeEl.value : ''
        });
        S.paperId = null; S.title = ''; S.scope = '';
        ui.toast('已布置「' + task.title + '」，学生端会出现待完成任务', 'success');
        ctx.navigate('#/teacher/dashboard');
      });
    }
  });
})();
