/* ============================================================
   知微·智学 · 应用外壳 / 路由 / 会话
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var html = ZWZ.html;
  var raw = ZWZ.raw;
  var esc = ZWZ.esc;
  var fmt = ZWZ.fmt;
  var ui = ZWZ.ui;
  var store = ZWZ.store;
  var sel = ZWZ.sel;

  /* ---------------- 页面注册表（定义在 js/core/pages.js，早于页面脚本加载） ---------------- */
  var pagesRegistry = ZWZ.pages;

  /* ---------------- 导航配置 ---------------- */
  var NAV = {
    student: [
      {
        title: '学习空间',
        items: [
          { key: 'student/home', label: '学习主页', icon: 'home' },
          { key: 'student/practice', label: '题目练习', icon: 'edit', count: 'studentTask' },
          { key: 'student/archive', label: '我的档案', icon: 'target' },
          { key: 'student/report', label: '学情报告', icon: 'chart' }
        ]
      }
    ],
    teacher: [
      {
        title: '教学工作台',
        items: [
          { key: 'teacher/dashboard', label: '工作台', icon: 'dashboard' },
          { key: 'teacher/analysis', label: '班级学情分析', icon: 'chart' },
          { key: 'teacher/profile', label: '个体学情档案', icon: 'user' }
        ]
      },
      {
        title: '题目与批阅',
        items: [
          { key: 'teacher/import', label: '试卷与题目', icon: 'upload' },
          { key: 'teacher/grading', label: '作业批阅', icon: 'clipboard', count: 'pendingGrades' },
          { key: 'teacher/review', label: '复核中心', icon: 'shield' }
        ]
      },
      {
        title: '教学支持',
        items: [
          { key: 'teacher/assistant', label: '教学助理', icon: 'bot' },
          { key: 'teacher/contest', label: '赛题成果', icon: 'target' },
          { key: 'teacher/data', label: '数据与报告', icon: 'database' }
        ]
      }
    ]
  };

  var DEFAULT_ROUTE = { student: 'student/home', teacher: 'teacher/dashboard' };

  var ROLE_HOME = { student: '#/student/home', teacher: '#/teacher/dashboard' };

  /* ---------------- 路由解析 ---------------- */
  function parseHash() {
    var hash = window.location.hash || '';
    var clean = hash.replace(/^#\/?/, '');
    var qIdx = clean.indexOf('?');
    var path = qIdx >= 0 ? clean.slice(0, qIdx) : clean;
    var queryStr = qIdx >= 0 ? clean.slice(qIdx + 1) : '';
    var query = {};
    queryStr.split('&').forEach(function (pair) {
      if (!pair) return;
      var parts = pair.split('=');
      query[decodeURIComponent(parts[0])] = parts[1] === undefined ? '' : decodeURIComponent(parts[1]);
    });
    path = path.replace(/\/+$/, '');
    return { path: path, query: query, hash: hash };
  }

  function currentCtx() {
    var route = parseHash();
    var pageKey = route.path || DEFAULT_ROUTE[session().role];
    return {
      pageKey: pageKey,
      params: route.query,
      query: route.query,
      hash: window.location.hash,
      navigate: navigate,
      refresh: refresh,
      state: store.state,
      session: session()
    };
  }

  function session() {
    var s = store.session;
    var user = store.user();
    var classes = store.state.classes || [];
    var bySession = s.classId ? classes.filter(function (c) { return c.id === s.classId; })[0] : null;
    var byUser = user ? classes.filter(function (c) {
      return (user.classId && c.id === user.classId) || (user.classIds && user.classIds.indexOf(c.id) >= 0);
    })[0] : null;
    var cls = bySession || byUser || null;
    return {
      userId: s.userId,
      role: s.role,
      name: user ? user.name : s.userId,
      classId: cls ? cls.id : s.classId,
      className: cls ? cls.name : '',
      user: user
    };
  }

  /* ---------------- 导航计数 ---------------- */
  function navCount(kind) {
    try {
      var s = session();
      if (kind === 'pendingGrades') {
        var pending = sel.pendingReviews(store.state, { classId: s.classId });
        return pending.grades.length;
      }
      if (kind === 'studentTask') {
        var tasks = sel.tasksForStudent(store.state, s.userId);
        var n = 0;
        tasks.forEach(function (t) {
          var p = sel.taskProgress(store.state, s.userId, t);
          if (!p.completed) n++;
        });
        return n;
      }
    } catch (err) {
      return 0;
    }
    return 0;
  }

  /* ---------------- 渲染：侧边栏 ---------------- */
  function renderSidebar() {
    var s = session();
    var groups = NAV[s.role] || NAV.student;
    var collapsed = window.localStorage.getItem('zwz.sidebar') === 'collapsed';
    var navHtml = groups.map(function (group) {
      return html`<div class="nav-group">
        <div class="nav-group-title">${group.title}</div>
        ${group.items.map(function (item) {
          var count = item.count ? navCount(item.count) : 0;
          return html`<a class="nav-item" href="#/${item.key}" data-nav="${item.key}">
            ${ui.icon(item.icon, 18)}
            <span class="nav-item-label">${item.label}</span>
            ${count ? html`<span class="nav-count">${count}</span>` : ''}
          </a>`;
        })}
      </div>`;
    });

    return html`<aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">知微</div>
        <div class="brand-text">
          <div class="brand-name">知微·智学</div>
          <div class="brand-sub">七年级数学 · 学情诊断</div>
        </div>
        <span class="brand-badge">原型</span>
      </div>
      <nav class="nav" aria-label="主导航">${navHtml}</nav>
      <div class="nav-foot">
        <button type="button" class="nav-collapse" data-act="toggle-sidebar" aria-label="折叠导航">
          ${ui.icon('minimize', 16)}<span>折叠导航</span>
        </button>
        <div class="tiny muted" style="padding:0 10px">v${store.state.meta.version}</div>
      </div>
    </aside>`;
  }

  /* ---------------- 渲染：顶栏 ---------------- */
  function renderTopbar(pageDef, ctx) {
    var s = session();
    var title = (pageDef && pageDef.title) || '知微·智学';
    var subtitle = (pageDef && pageDef.subtitle) || (s.role === 'teacher' ? s.className : s.className + ' · 学生');
    return html`<header class="topbar">
      <button type="button" class="btn btn-ghost btn-icon" data-act="toggle-sidebar" title="折叠 / 展开导航" aria-label="折叠导航">
        ${ui.icon('minimize', 18)}
      </button>
      <div class="topbar-title">
        <h1>${title}</h1>
        <div class="topbar-crumb">${subtitle}</div>
      </div>
      <div class="topbar-tools">
        <span class="demo-badge" title="${store.mode === 'official' ? '主办方模拟赛题数据（仅用于比赛）' : '全部数据为虚构演示数据'}">${ui.icon('shield', 12)}${store.mode === 'official' ? '赛题数据' : '演示数据'}</span>
        <div class="role-switch" role="group" aria-label="切换角色">
          <button type="button" class="seg-item ${s.role === 'student' ? 'is-active' : ''}" data-act="role" data-role="student">学生端</button>
          <button type="button" class="seg-item ${s.role === 'teacher' ? 'is-active' : ''}" data-act="role" data-role="teacher">教师端</button>
        </div>
        <button type="button" class="user-chip" data-act="user-menu" title="切换演示身份">
          ${ui.avatar(s.name, { size: 'sm' })}
          <span class="user-name">${s.name}</span>
          ${ui.icon('chevronDown', 14)}
        </button>
      </div>
    </header>`;
  }

  /* ---------------- 渲染：内容 ---------------- */
  function renderRoute(preserveScroll) {
    if (needsIdentity()) { renderIdentityGate(); return; }
    var ctx = currentCtx();
    var s = session();
    var pageKey = ctx.pageKey;

    /* 角色越界保护 */
    if (pageKey.indexOf('teacher/') === 0 && s.role !== 'teacher') {
      ui.toast('当前为学生身份，无法访问教师端页面', 'warn');
      window.location.hash = ROLE_HOME.student;
      return;
    }
    if (pageKey.indexOf('student/') === 0 && s.role !== 'student') {
      ui.toast('当前为教师身份，无法访问学生端页面', 'warn');
      window.location.hash = ROLE_HOME.teacher;
      return;
    }

    var pageDef = ZWZ.pages.get(pageKey);
    var content = document.getElementById('page-content');
    if (!content) return;

    if (!pageDef) {
      var known = ZWZ.pages.keys();
      content.innerHTML = ui.empty({
        icon: 'help',
        title: '页面不存在或尚未实现',
        desc: '当前路由：' + pageKey + '。已实现的页面：' + known.join('、'),
        action: ui.button({ label: '回到首页', tone: 'primary', attrs: 'data-act="home"' })
      }).value;
      content.querySelector('[data-act="home"]').addEventListener('click', function () {
        navigate(ROLE_HOME[s.role]);
      });
      return;
    }

    var scrollY = window.scrollY;
    var focused = document.activeElement;
    var focusSel = null;
    if (focused && focused.id) focusSel = '#' + focused.id;

    try {
      var out = pageDef.render(ctx);
      content.innerHTML = out === undefined || out === null ? '' : (ZWZ.isRaw(out) ? out.value : String(out));
      content.className = 'content' + (pageDef.wide ? ' is-wide' : '');
      if (typeof pageDef.mount === 'function') pageDef.mount(content, ctx);
      /* 更新导航高亮 */
      document.querySelectorAll('[data-nav]').forEach(function (el) {
        el.classList.toggle('is-active', el.getAttribute('data-nav') === pageKey);
      });
      /* 更新顶栏标题（懒创建时） */
      var titleEl = document.querySelector('.topbar-title h1');
      if (titleEl) {
        titleEl.textContent = pageDef.title || '知微·智学';
        var crumb = document.querySelector('.topbar-crumb');
        if (crumb) crumb.textContent = pageDef.subtitle || (s.role === 'teacher' ? s.className : s.className + ' · 学生');
      }
      document.title = (pageDef.title ? pageDef.title + ' · ' : '') + '知微·智学';
    } catch (err) {
      if (window.console) console.error('[ZWZ] 页面渲染失败', err);
      content.innerHTML = ui.banner({
        tone: 'danger',
        title: '页面渲染失败',
        body: '错误信息：' + (err && err.message ? err.message : String(err)) + '。请刷新页面或重置演示数据后重试。'
      }).value + ui.empty({ icon: 'alert', title: '可以尝试的操作', desc: '刷新页面（F5）或使用右上角用户菜单中的“重置演示数据”。' }).value;
    }

    if (preserveScroll) {
      window.scrollTo(0, scrollY);
      if (focusSel) {
        var el = document.querySelector(focusSel);
        if (el && el.focus) {
          try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
        }
      }
    } else {
      window.scrollTo(0, 0);
    }
  }

  function refresh() {
    renderRoute(true);
  }

  function navigate(hash) {
    if (!hash) return;
    if (hash.charAt(0) !== '#') hash = '#' + (hash.charAt(0) === '/' ? hash : '/' + hash);
    if (window.location.hash === hash) {
      renderRoute(false);
    } else {
      window.location.hash = hash;
    }
  }

  /* ---------------- 外壳 ---------------- */
  function renderShell() {
    var root = document.getElementById('app');
    root.innerHTML =
      '<div class="shell" id="shell">' +
      renderSidebar().value +
      '<div class="main">' +
      renderTopbar(ZWZ.pages.get(currentCtx().pageKey), currentCtx()).value +
      '<main class="content" id="page-content" tabindex="-1"></main>' +
      '<footer class="no-print" style="padding:16px 32px 28px;color:var(--text-3);font-size:12px;line-height:1.8">' +
      '<div style="max-width:1280px;margin:0 auto">' +
      '知微·智学 · ' + esc(store.state.meta.version) + ' · 本系统为学生、班级、成绩与分析结果的<b>虚构模拟数据</b>，仅用于产品演示，不代表真实学情。' +
      '<br>诊断引擎与伴学助手为本地规则实现（未接入真实大模型 / OCR），相关能力均标注为“模拟 / 待接入”。' +
      '</div></footer>' +
      '</div></div>';

    /* 角色切换 / 用户菜单 / 折叠按钮 */
    document.querySelectorAll('[data-act="role"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var role = btn.getAttribute('data-role');
        if (role === session().role) return;
        openIdentityGate(role);
      });
    });

    document.querySelectorAll('[data-act="user-menu"]').forEach(function (btn) {
      btn.addEventListener('click', openUserMenu);
    });

    document.querySelectorAll('[data-act="toggle-sidebar"]').forEach(function (btn) {
      btn.addEventListener('click', toggleSidebar);
    });

    if (window.localStorage.getItem('zwz.sidebar') === 'collapsed') {
      var shell = document.getElementById('shell');
      if (shell) shell.classList.add('is-collapsed');
    }
  }

  function toggleSidebar() {
    var shell = document.getElementById('shell');
    if (!shell) return;
    var collapsed = shell.classList.toggle('is-collapsed');
    window.localStorage.setItem('zwz.sidebar', collapsed ? 'collapsed' : 'expanded');
  }

  function openUserMenu() {
    var s = session();
    var students = sel.classStudents(store.state, s.classId);
    var teacher = store.state.users.filter(function (u) { return u.role === 'teacher'; })[0];
    var classes = store.state.classes || [];
    var isOfficial = store.mode === 'official';
    var body = html`<div class="stack">
      ${ui.banner({
        tone: isOfficial ? 'warn' : 'info',
        compact: true,
        body: isOfficial
          ? '当前为「赛题数据」模式：主办方模拟学情数据，仅用于本次比赛；学生均为匿名编号，不包含真实学生信息。'
          : '当前为「演示数据」模式：全部为虚构演示数据；可随时切换回赛题数据。'
      })}
      <div class="field">
        <div class="label">数据模式</div>
        <div class="row-sm row-wrap">
          <button type="button" class="btn ${isOfficial ? 'btn-secondary' : 'btn-primary'} btn-sm" data-mode="demo">演示数据</button>
          <button type="button" class="btn ${isOfficial ? 'btn-primary' : 'btn-secondary'} btn-sm" data-mode="official">赛题数据</button>
          <span class="tiny muted">当前：${isOfficial ? '赛题数据（官方模拟数据）' : '演示数据（虚构）'}</span>
        </div>
        <div class="help">两种模式数据独立存储、互不污染；切换后需重新进入页面。</div>
      </div>
      ${isOfficial && s.role === 'teacher' && classes.length ? html`<div class="field">
        <div class="label">当前班级（教师视图）</div>
        <div class="row-sm row-wrap">
          ${classes.map(function (c) {
            return html`<button type="button" class="btn btn-sm ${c.id === s.classId ? 'btn-primary' : 'btn-secondary'}" data-class="${c.id}">${c.name}</button>`;
          })}
        </div>
      </div>` : ''}
      ${s.role === 'teacher' ? html`<div class="field">
        <div class="label">教师身份</div>
        <div class="tile-grid">
          ${teacher ? html`<button type="button" class="user-chip" data-user="${teacher.id}">
            ${ui.avatar(teacher.name, { size: 'sm' })}<span class="user-name">${teacher.name}</span>
            <span class="tag tag-teal">教师</span>
          </button>` : ''}
        </div>
      </div>` : ''}
      <div class="field">
        <div class="label">${s.role === 'student' ? '当前学生身份（仅本人）' : '学生身份（' + (s.className || s.classId) + '）'}</div>
        <div class="tile-grid">
          ${(s.role === 'student' ? [store.user()].filter(Boolean) : students).map(function (st) {
            return html`<button type="button" class="user-chip ${st.id === s.userId ? 'is-current' : ''}" data-user="${st.id}" ${s.role === 'student' ? 'disabled' : ''}>
              ${ui.avatar(st.name, { size: 'sm' })}<span class="user-name">${st.name}</span>
              ${s.role === 'student' ? html`<span class="tag tag-teal">当前</span>` : ''}
            </button>`;
          })}
        </div>
      </div>
      <div class="divider"></div>
      <div class="row-between">
        <div class="small muted">${isOfficial ? '赛题数据保存在本机浏览器；重置会恢复为官方数据的初始导入状态。' : '演示数据保存在本机浏览器中，可随时重置。'}</div>
        <button type="button" class="btn btn-danger btn-sm" data-act="reset">${ui.icon('refresh', 14)}${isOfficial ? '重置赛题数据' : '重置演示数据'}</button>
      </div>
      <div class="row-between">
        <div class="small muted">身份仅用于本机体验，不是真实登录；切换会重新进入身份入口。</div>
        <button type="button" class="btn btn-secondary btn-sm" data-act="exit-identity">${ui.icon('refresh', 14)}切换身份 / 退出体验</button>
      </div>
    </div>`;

    var ctl = ui.modal({
      title: '切换身份与数据模式',
      desc: '当前身份：' + s.name + '（' + (s.role === 'teacher' ? '教师' : '学生') + '） · ' + (isOfficial ? '赛题数据' : '演示数据'),
      size: 'lg',
      body: body.value,
      footer: '<div class="spacer"></div><button type="button" class="btn btn-secondary" data-close>关闭</button>',
      onMount: function (bodyEl) {
        bodyEl.querySelectorAll('[data-mode]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var mode = btn.getAttribute('data-mode');
            if (mode === store.mode) return;
            ui.confirm({
              title: mode === 'official' ? '切换到赛题数据？' : '切换到演示数据？',
              body: '两种模式的数据独立保存，切换后会重新加载对应数据；不会删除另一种模式的数据。',
              okText: '切换模式'
            }).then(function (ok) {
              if (!ok) return;
              store.switchMode(mode);
              try {
                var url = new URL(window.location.href);
                if (mode === 'official') url.searchParams.set('data', 'official');
                else url.searchParams.delete('data');
                history.replaceState(null, '', url.pathname + url.search + url.hash);
              } catch (err) { /* ignore */ }
              ctl.close();
              ui.toast(mode === 'official' ? '已切换到赛题数据' : '已切换到演示数据', 'success');
              navigate(ROLE_HOME[store.session.role]);
              renderShell();
              renderRoute(false);
            });
          });
        });
        bodyEl.querySelectorAll('[data-class]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            store.actions.setClass(btn.getAttribute('data-class'));
            ctl.close();
            ui.toast('已切换班级：' + btn.textContent.trim(), 'success');
            renderShell();
            renderRoute(false);
          });
        });
        bodyEl.querySelectorAll('[data-user]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var userId = btn.getAttribute('data-user');
            var user = store.state.users.filter(function (u) { return u.id === userId; })[0];
            store.actions.loginAs(userId);
            ctl.close();
            ui.toast('已切换为「' + user.name + '」' + (user.role === 'teacher' ? '（教师）' : '（学生）'), 'success');
            navigate(ROLE_HOME[user.role]);
            renderShell();
            renderRoute(false);
          });
        });
        var exitBtn = bodyEl.querySelector('[data-act="exit-identity"]');
        if (exitBtn) {
          exitBtn.addEventListener('click', function () {
            ctl.close();
            store.actions.clearIdentity();
            openIdentityGate();
          });
        }
        var resetBtn = bodyEl.querySelector('[data-act="reset"]');
        if (resetBtn) {
          resetBtn.addEventListener('click', function () {
            ui.confirm({
              title: isOfficial ? '重置赛题数据？' : '重置演示数据？',
              body: isOfficial
                ? '将清除本机对赛题数据的修改，恢复为官方数据初始导入状态（原始 CSV 不受影响）。该操作不可撤销。'
                : '将清除本机保存的作答、复核与导入记录，恢复到初始演示数据。该操作不可撤销。',
              okText: '确认重置',
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              store.resetCurrent();
              ctl.close();
              ui.toast(isOfficial ? '赛题数据已重置' : '演示数据已重置', 'success');
              navigate(ROLE_HOME[session().role]);
              renderShell();
              renderRoute(false);
            });
          });
        }
      }
    });
  }

  /* ---------------- 身份入口 ---------------- */
  var ENTRY = null;

  function needsIdentity() {
    return !store.session || !store.session.identityChosen || !store.user();
  }

  function ensureEntry(preselectRole) {
    if (!ENTRY) ENTRY = { role: null, studentId: null, teacherId: null, classId: null };
    if (preselectRole === 'student' || preselectRole === 'teacher') ENTRY.role = preselectRole;
    var classes = store.state.classes || [];
    var cls = classes.filter(function (c) { return c.id === ENTRY.classId; })[0];
    if (!cls) { ENTRY.classId = classes[0] ? classes[0].id : null; ENTRY.studentId = null; }
    var teachers = (store.state.users || []).filter(function (u) { return u.role === 'teacher'; });
    if (!ENTRY.teacherId || !teachers.some(function (t) { return t.id === ENTRY.teacherId; })) {
      ENTRY.teacherId = teachers[0] ? teachers[0].id : null;
    }
    return ENTRY;
  }

  function entryStudents() {
    var e = ENTRY;
    return (store.state.users || []).filter(function (u) {
      return u.role === 'student' && (!e.classId || u.classId === e.classId);
    });
  }

  function studentRecordInfo(st) {
    var records = (store.state.answers || []).filter(function (a) { return a.studentId === st.id; });
    var nodes = {};
    var tasks = (store.state.tasks || []).filter(function (t) { return t.classId === st.classId; });
    records.forEach(function (a) { if (a.nodeId) nodes[a.nodeId] = true; });
    var missingNode = tasks.filter(function (t) { return !nodes[t.nodeId]; })[0];
    return {
      count: records.length,
      text: records.length ? ('学习记录 ' + records.length + ' 条') : '暂无学习记录',
      missing: missingNode ? ('暂无 ' + (missingNode.title || missingNode.nodeId) + ' 记录') : ''
    };
  }

  function showApp() {
    renderShell();
    renderRoute(false);
  }

  function finishIdentity(role, userId) {
    store.actions.loginAs(userId);
    var user = store.user();
    if (user && user.classId) store.actions.setClass(user.classId);
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete('role');
      url.searchParams.delete('user');
      if (store.mode === 'official') url.searchParams.set('data', 'official');
      else url.searchParams.delete('data');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (err) { /* ignore */ }
    ENTRY = null;
    navigate(role === 'teacher' ? ROLE_HOME.teacher : ROLE_HOME.student);
    showApp();
  }

  function openIdentityGate(preselectRole) {
    ENTRY = { role: null, studentId: null, teacherId: null, classId: null };
    renderIdentityGate(preselectRole);
  }

  function renderIdentityGate(preselectRole) {
    var e = ensureEntry(preselectRole);
    var root = document.getElementById('app');
    if (!root) return;
    var classes = store.state.classes || [];
    var teachers = (store.state.users || []).filter(function (u) { return u.role === 'teacher'; });
    var students = entryStudents();
    var modeOfficial = store.mode === 'official';
    var counts = {
      students: (store.state.users || []).filter(function (u) { return u.role === 'student'; }).length,
      answers: (store.state.answers || []).length,
      classes: classes.length
    };
    var roleCards = [
      { key: 'student', title: '学生体验', icon: 'user', desc: '查看个人档案、知识点诊断、练习记录与伴学助手' },
      { key: 'teacher', title: '教师体验', icon: 'users', desc: '查看班级学情、指标分布、授权学生档案与教学建议' },
      { key: 'judge', title: '评委快速体验', icon: 'flag', desc: '直接进入赛题成果与三任务演示，使用固定演示身份' }
    ];
    var currentClass = classes.filter(function (c) { return c.id === e.classId; })[0];
    var body = '';

    body += html`<div class="identity-top">
      <div class="identity-brand"><span class="identity-mark">知微</span><div><b>知微·智学</b><span>七年级数学 · 学情诊断与个性化学习智能体</span></div></div>
      <div class="identity-mode" role="group" aria-label="数据模式">
        <button type="button" class="btn btn-sm ${modeOfficial ? 'btn-secondary' : 'btn-primary'}" data-id-mode="demo">演示数据</button>
        <button type="button" class="btn btn-sm ${modeOfficial ? 'btn-primary' : 'btn-secondary'}" data-id-mode="official">赛题数据</button>
        <span class="identity-mode-note">${modeOfficial ? '主办方模拟数据' : '虚构演示数据'}</span>
      </div>
    </div>
    <div class="identity-head">
      <div class="identity-kicker">身份入口 · 非真实登录</div>
      <h1>欢迎使用「知微·智学」</h1>
      <p>请选择体验身份。当前为${modeOfficial ? '主办方模拟赛题数据' : '虚构演示数据'}：${counts.students} 名学生、${counts.answers} 条记录、${counts.classes} 个班级；身份仅用于本机体验与权限演示。</p>
    </div>
    <div class="identity-roles" role="group" aria-label="体验身份">
      ${roleCards.map(function (r) {
        return html`<button type="button" class="identity-role ${e.role === r.key ? 'is-active' : ''}" data-id-role="${r.key}">
          <span class="identity-role-icon">${ui.icon(r.icon, 20)}</span>
          <span class="identity-role-title">${r.title}</span>
          <span class="identity-role-desc">${r.desc}</span>
        </button>`;
      })}
    </div>`;

    if (!e.role) {
      body += html`<div class="identity-panel identity-empty">${ui.empty({ icon: 'user', title: '请先选择体验身份', desc: '学生、教师与评委快速体验对应不同的数据范围与页面；不会自动替你选择。' })}</div>`;
    } else if (e.role === 'student') {
      body += html`<div class="identity-panel">
        <div class="identity-panel-head"><div><h2>学生体验</h2><div class="tiny muted">明确选择一个模拟学生；只显示该学生自己的数据。</div></div>
          <label class="identity-class">班级 <select class="select is-sm" id="identity-class">
            ${classes.map(function (c) { return html`<option value="${c.id}" ${c.id === e.classId ? 'selected' : ''}>${c.name}（${c.id}）</option>`; })}
          </select></label>
        </div>
        <div class="identity-student-grid">
          ${students.map(function (st) {
            var info = studentRecordInfo(st);
            return html`<button type="button" class="identity-student ${e.studentId === st.id ? 'is-active' : ''}" data-id-student="${st.id}">
              <span class="identity-student-id">${st.id}</span>
              <span class="identity-student-class">${st.classId}</span>
              <span class="identity-student-rec">${info.text}</span>
              ${info.missing ? html`<span class="identity-student-missing">${info.missing}</span>` : ''}
            </button>`;
          })}
        </div>
        <div class="identity-actions">
          <span class="tiny muted">${e.studentId ? '将以 ' + e.studentId + ' 的学生身份进入；可在进入后切换。' : '请选择一名学生（无默认选择）。'}</span>
          <button type="button" class="btn btn-primary" data-id-enter="student" ${e.studentId ? '' : 'disabled'}>以该学生身份进入</button>
        </div>
      </div>`;
    } else if (e.role === 'teacher') {
      var teacher = teachers.filter(function (t) { return t.id === e.teacherId; })[0];
      body += html`<div class="identity-panel">
        <div class="identity-panel-head"><div><h2>教师体验</h2><div class="tiny muted">教师演示身份；当前可查看所选班级的整体与授权个体数据。</div></div>
          <label class="identity-class">班级 <select class="select is-sm" id="identity-class">
            ${classes.map(function (c) { return html`<option value="${c.id}" ${c.id === e.classId ? 'selected' : ''}>${c.name}（${c.id}）</option>`; })}
          </select></label>
        </div>
        <div class="identity-teacher-box">
          ${teacher ? html`<div class="identity-teacher">${ui.avatar(teacher.name, { size: 'md' })}<div><b>${teacher.name}</b><div class="tiny muted">教师演示身份 · ${teacher.id} · 非真实账号</div></div></div>` : ui.empty({ icon: 'user', title: '没有教师演示身份', desc: '当前数据中没有教师用户，无法进入教师体验。' })}
          <div class="identity-scope">
            <div><span class="tiny muted">当前班级</span><b>${currentClass ? currentClass.name : '—'}</b></div>
            <div><span class="tiny muted">学生范围</span><b>${students.length} 名</b></div>
            <div><span class="tiny muted">数据性质</span><b>${modeOfficial ? '主办方模拟数据' : '虚构演示数据'}</b></div>
          </div>
        </div>
        <div class="identity-actions">
          <span class="tiny muted">教师可查看班级整体数据与授权学生档案；不代表真实学校账号。</span>
          <button type="button" class="btn btn-primary" data-id-enter="teacher" ${teacher ? '' : 'disabled'}>以教师演示身份进入</button>
        </div>
      </div>`;
    } else {
      body += html`<div class="identity-panel identity-judge">
        <div class="identity-panel-head"><div><h2>评委快速体验</h2><div class="tiny muted">固定使用教师演示身份 + 赛题数据 + DC01，直接进入赛题成果。</div></div></div>
        <div class="identity-scope identity-scope-wide">
          <div><span class="tiny muted">体验身份</span><b>${teachers[0] ? teachers[0].name + '（' + teachers[0].id + '）' : '教师演示'}</b></div>
          <div><span class="tiny muted">数据模式</span><b>赛题数据（官方模拟）</b></div>
          <div><span class="tiny muted">可查看</span><b>DC01 / DC02 班级数据与授权学生档案</b></div>
        </div>
        ${ui.banner({ tone: 'warn', compact: true, body: '这是模拟数据演示：不包含真实学生个人信息，不代表真实学情；教师身份为演示身份，不是真实登录。' })}
        <div class="identity-actions">
          <span class="tiny muted">进入后可在右上角切换身份或退出体验。</span>
          <button type="button" class="btn btn-primary" data-id-enter="judge" ${teachers[0] ? '' : 'disabled'}>进入评委快速体验</button>
        </div>
      </div>`;
    }
    body += html`<div class="identity-foot">
      <span>${ui.icon('shield', 13)} 前端演示环境：身份仅保存在本机浏览器，不是真实认证；不会修改官方原始数据。</span>
      ${store.session && store.session.identityChosen ? html`<button type="button" class="btn btn-ghost btn-sm" data-id-cancel>返回当前体验</button>` : ''}
    </div>`;

    root.innerHTML = '<div class="identity-page"><div class="identity-card">' + body + '</div></div>';
    document.title = '选择体验身份 · 知微·智学';

    function bindAll() {
      root.querySelectorAll('[data-id-mode]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var mode = btn.getAttribute('data-id-mode');
          if (mode === store.mode) return;
          store.switchMode(mode);
          ENTRY = null;
          renderIdentityGate(preselectRole);
        });
      });
      root.querySelectorAll('[data-id-role]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          e.role = btn.getAttribute('data-id-role');
          e.studentId = null;
          renderIdentityGate();
        });
      });
      var clsSel = root.querySelector('#identity-class');
      if (clsSel) clsSel.addEventListener('change', function () {
        e.classId = clsSel.value;
        e.studentId = null;
        renderIdentityGate();
      });
      root.querySelectorAll('[data-id-student]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          e.studentId = btn.getAttribute('data-id-student');
          renderIdentityGate();
        });
      });
      root.querySelectorAll('[data-id-enter]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var kind = btn.getAttribute('data-id-enter');
          if (kind === 'student' && e.studentId) finishIdentity('student', e.studentId);
          else if (kind === 'teacher' && e.teacherId) finishIdentity('teacher', e.teacherId);
          else if (kind === 'judge') {
            if (store.mode !== 'official') store.switchMode('official');
            var t = (store.state.users || []).filter(function (u) { return u.role === 'teacher'; })[0];
            if (!t) { ui.toast('当前数据没有教师演示身份', 'error'); return; }
            store.actions.loginAs(t.id);
            store.actions.setClass((store.state.classes[0] || {}).id);
            try {
              var url = new URL(window.location.href);
              url.searchParams.delete('role'); url.searchParams.delete('user');
              url.searchParams.set('data', 'official');
              url.hash = '#/teacher/contest';
              history.replaceState(null, '', url.pathname + url.search + url.hash);
            } catch (err) { /* ignore */ }
            ENTRY = null;
            showApp();
          }
        });
      });
      var cancel = root.querySelector('[data-id-cancel]');
      if (cancel) cancel.addEventListener('click', function () { ENTRY = null; showApp(); });
    }
    bindAll();
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    var params = null;
    try { params = new URLSearchParams(window.location.search || ''); } catch (err) { /* ignore */ }
    store.init(params && params.get('data') === 'official' ? 'official' : 'demo');

    /* 深链：user= 是明确身份；role= 只预选入口，不自动分配学生/教师。
       已明确选择过身份时，URL 的 user/role 不得静默覆盖当前身份（切换必须走身份入口）。 */
    var presetRole = null;
    try {
      var hasChosen = !!(store.session && store.session.identityChosen);
      if (!hasChosen && params && params.get('user')) {
        store.actions.loginAs(params.get('user'));
      } else if (!hasChosen && params && params.get('role')) {
        presetRole = params.get('role') === 'teacher' ? 'teacher' : (params.get('role') === 'student' ? 'student' : null);
      }
    } catch (err) { /* 忽略不支持 URLSearchParams 的极端环境 */ }

    store.subscribe(function () {
      /* 数据变更：仅刷新内容区与导航计数 */
      refresh();
      refreshNavCounts();
    });

    if (needsIdentity()) {
      renderIdentityGate(presetRole);
    } else {
      showApp();
    }

    if (!store.storageOK) {
      ui.toast('浏览器本地存储不可用，本次演示数据不会被保存', 'warn');
    }

    window.addEventListener('hashchange', function () {
      if (needsIdentity()) { renderIdentityGate(); return; }
      renderRoute(false);
    });

    window.addEventListener('error', function (ev) {
      if (window.console) console.error('[ZWZ] 未捕获错误', ev.error || ev.message);
    });

    /* 全局快捷键：Alt+1 学生端 / Alt+2 教师端 */
    document.addEventListener('keydown', function (ev) {
      if (!ev.altKey) return;
      if (ev.key === '1' || ev.code === 'Digit1') {
        ev.preventDefault();
        if (needsIdentity() || session().role !== 'student') { openIdentityGate('student'); }
      } else if (ev.key === '2' || ev.code === 'Digit2') {
        ev.preventDefault();
        if (needsIdentity() || session().role !== 'teacher') { openIdentityGate('teacher'); }
      }
    });
  }

  function refreshNavCounts() {
    var s = session();
    var groups = NAV[s.role] || [];
    groups.forEach(function (group) {
      group.items.forEach(function (item) {
        if (!item.count) return;
        var el = document.querySelector('[data-nav="' + item.key + '"] .nav-count');
        var count = navCount(item.count);
        if (!el && count) {
          var link = document.querySelector('[data-nav="' + item.key + '"]');
          if (link) {
            var span = document.createElement('span');
            span.className = 'nav-count';
            span.textContent = count;
            link.appendChild(span);
          }
        } else if (el) {
          if (count) el.textContent = count;
          else el.remove();
        }
      });
    });
  }

  ZWZ.app = {
    boot: boot,
    identity: { open: openIdentityGate, needs: needsIdentity, current: function () { return ENTRY; } },
    refresh: refresh,
    navigate: navigate,
    session: session,
    renderShell: renderShell,
    renderRoute: renderRoute,
    NAV: NAV,
    ROLE_HOME: ROLE_HOME
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();



