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
    var cls = user ? (store.state.classes.filter(function (c) {
      return (user.classId && c.id === user.classId) || (user.classIds && user.classIds.indexOf(c.id) >= 0);
    })[0]) : null;
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
        store.actions.setRole(role);
        ui.toast(role === 'teacher' ? '已切换到教师端视角（沈老师）' : '已切换到学生端视角（林以安）', 'success');
        renderShell();
        renderRoute(false);
        navigate(ROLE_HOME[role]);
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
      <div class="field">
        <div class="label">教师身份</div>
        <div class="tile-grid">
          ${teacher ? html`<button type="button" class="user-chip" data-user="${teacher.id}">
            ${ui.avatar(teacher.name, { size: 'sm' })}<span class="user-name">${teacher.name}</span>
            <span class="tag tag-teal">教师</span>
          </button>` : ''}
        </div>
      </div>
      <div class="field">
        <div class="label">学生身份（${s.className || s.classId}）</div>
        <div class="tile-grid">
          ${students.map(function (st) {
            return html`<button type="button" class="user-chip" data-user="${st.id}">
              ${ui.avatar(st.name, { size: 'sm' })}<span class="user-name">${st.name}</span>
            </button>`;
          })}
        </div>
      </div>
      <div class="divider"></div>
      <div class="row-between">
        <div class="small muted">${isOfficial ? '赛题数据保存在本机浏览器；重置会恢复为官方数据的初始导入状态。' : '演示数据保存在本机浏览器中，可随时重置。'}</div>
        <button type="button" class="btn btn-danger btn-sm" data-act="reset">${ui.icon('refresh', 14)}${isOfficial ? '重置赛题数据' : '重置演示数据'}</button>
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

  /* ---------------- 启动 ---------------- */
  function boot() {
    var params = null;
    try { params = new URLSearchParams(window.location.search || ''); } catch (err) { /* ignore */ }
    store.init(params && params.get('data') === 'official' ? 'official' : 'demo');

    /* 支持深链演示参数：index.html?role=teacher#/teacher/analysis 或 ?user=s1&data=official */
    try {
      if (params && params.get('user')) {
        store.actions.loginAs(params.get('user'));
      } else if (params && params.get('role')) {
        store.actions.setRole(params.get('role') === 'teacher' ? 'teacher' : 'student');
      }
    } catch (err) { /* 忽略不支持 URLSearchParams 的极端环境 */ }

    store.subscribe(function () {
      /* 数据变更：仅刷新内容区与导航计数 */
      refresh();
      refreshNavCounts();
    });

    renderShell();
    renderRoute(false);

    if (!store.storageOK) {
      ui.toast('浏览器本地存储不可用，本次演示数据不会被保存', 'warn');
    }

    window.addEventListener('hashchange', function () {
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
        if (session().role !== 'student') { store.actions.setRole('student'); renderShell(); navigate(ROLE_HOME.student); }
      } else if (ev.key === '2' || ev.code === 'Digit2') {
        ev.preventDefault();
        if (session().role !== 'teacher') { store.actions.setRole('teacher'); renderShell(); navigate(ROLE_HOME.teacher); }
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


