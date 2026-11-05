/* ============================================================
   知微·智学 · 教学助理（教师端学情工作台 + 智能分析面板）
   ------------------------------------------------------------
   - 左侧：提问 + 分析卡片流；右侧：班级实时摘要 + 快捷跳转；
   - 回答来自 ZWZ.assistant.teacherReply（本地规则应答，未接入真实大模型）；
   - 每条卡片展示知识点、班级证据、教学建议与适用条件；
   - 对话历史保存在模块级数组中，ctx.refresh() 后仍然保留。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = window.ZWZ;
  var html = ZWZ.html;
  var fmt = ZWZ.fmt;
  var esc = ZWZ.esc;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;
  var assistant = ZWZ.assistant;

  /* 会话历史（模块级：refresh 后保留） */
  var MESSAGES = [];
  var INPUT_TEXT = '';

  var INTENT_LABEL = {
    advice: '教学建议',
    errors: '错误类型',
    student: '个体学情',
    coverage: '数据覆盖',
    trend: '阶段变化',
    review: '待复核',
    fallback: '暂无法判断',
    empty: '引导',
    unknown: '未识别'
  };

  function classIdOf(ctx) {
    return (ctx.session && ctx.session.classId) || 'c1';
  }

  function pct(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Math.round(v * 100) + '%';
  }

  /* ---------------- 欢迎区 ---------------- */
  function renderWelcome(state, classId) {
    return html`<div class="ana-welcome">
      <div class="ana-welcome-head">
        <span class="ana-ai-avatar">${ui.icon('bot', 17)}</span>
        <div>
          <div class="ana-welcome-title">你好，我是班级学情教学助理</div>
          <div class="ana-welcome-sub">可以询问本班薄弱知识点、错误类型、阶段变化，或某位学生的学情摘要；回答附数据依据与适用条件。</div>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- 消息渲染 ---------------- */
  function renderUserMessage(msg) {
    return html`<div class="ana-msg ana-msg-user">
      <div class="ana-bubble ana-bubble-user">${msg.text}</div>
      ${ui.avatar('沈老师', { size: 'sm', seed: 't1' })}
    </div>`;
  }

  function renderCardActions(actions) {
    if (!actions || !actions.length) return '';
    return html`<div class="ana-card-actions">
      ${actions.map(function (action) {
        if (action.hash) {
          return ui.button({ label: action.label, size: 'sm', tone: 'secondary', attrs: 'data-hash="' + esc(action.hash) + '"' });
        }
        return ui.button({ label: action.label, size: 'sm', tone: 'ghost', attrs: 'data-action="unsupported"' });
      })}
    </div>`;
  }

  function renderAssistantCard(card) {
    return html`<div class="ai-card ana-ai-card">
      <div class="ai-head">
        <span class="ai-tag is-teacher">${ui.icon('spark', 11)}分析卡片</span>
        <span class="ai-title">${card.title}</span>
        ${card.kpName ? ui.badge(card.kpName, 'primary') : ''}
      </div>
      ${card.insight ? html`<div class="ai-text">${card.insight}</div>` : ''}
      ${card.evidence && card.evidence.length ? ui.evidence({ title: '数据依据', items: card.evidence }) : ''}
      ${card.suggestion ? html`<div class="ana-ai-suggestion"><span class="ana-ai-suggestion-label">教学参考建议</span>${card.suggestion}</div>` : ''}
      ${card.conditions ? html`<div class="ai-caveat">${card.conditions}</div>` : ''}
      ${renderCardActions(card.actions)}
    </div>`;
  }

  function renderAssistantMessage(msg) {
    var result = msg.result;
    var intent = result.intent || 'unknown';
    var intentTone = intent === 'fallback' || intent === 'unknown' ? 'neutral' : (intent === 'review' ? 'warn' : 'primary');
    return html`<div class="ana-msg ana-msg-ai">
      <span class="ana-ai-avatar">${ui.icon('bot', 17)}</span>
      <div class="ana-msg-body">
        <div class="ana-msg-meta">
          ${ui.badge(INTENT_LABEL[intent] || '分析', intentTone)}
          <span class="tiny muted">${fmt.datetime(msg.at)} · 基于提问时的班级数据</span>
        </div>
        <div class="ana-bubble ana-bubble-ai">
          ${result.reply || '暂无法基于当前数据回答这个问题。'}
        </div>
        ${(result.cards || []).length ? html`<div class="ana-card-flow">
          ${result.cards.map(renderAssistantCard)}
        </div>` : ''}
        ${(result.followUps || []).length ? html`<div class="ana-followups">
          <span class="tiny muted">继续追问：</span>
          ${result.followUps.slice(0, 4).map(function (q) {
            return ui.chip(q, { attrs: 'data-ask="' + esc(q) + '"' });
          })}
        </div>` : ''}
        ${result.disclaimer ? html`<div class="ana-disclaimer-inline">${ui.icon('shield', 12)}<span>${result.disclaimer}</span></div>` : ''}
      </div>
    </div>`;
  }

  function renderMessages() {
    return html`${MESSAGES.map(function (msg) {
      return msg.role === 'user' ? renderUserMessage(msg) : renderAssistantMessage(msg);
    })}`;
  }

  function renderChat(state, classId) {
    var quick = assistant.teacherQuickAsks;
    return html`<section class="card ana-chat-card">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">提问</div>
        </div>
        <div class="card-actions">
          ${ui.button({ label: '清空会话', icon: 'refresh', size: 'sm', tone: 'ghost', attrs: 'data-act="clear"' })}
        </div>
      </div>
      <div class="card-body ana-chat-body">
        <div class="ana-chat-list" id="ana-chat-list">
          ${MESSAGES.length ? '' : renderWelcome(state, classId)}
          ${renderMessages()}
        </div>
      </div>
      <div class="card-foot ana-composer-wrap">
        <div class="ana-quick-bar">
          <span class="tiny muted">快捷提问</span>
          ${quick.map(function (q) {
            return ui.chip(q, { attrs: 'data-ask="' + esc(q) + '"' });
          })}
        </div>
        <div class="ana-composer">
          <textarea class="textarea ana-composer-input" id="ana-input" rows="2"
            placeholder="输入问题，例如：本班目前最需要关注哪些知识点？">${INPUT_TEXT}</textarea>
          <div class="ana-composer-side">
            ${ui.button({ label: '发送', icon: 'arrowRight', tone: 'primary', attrs: 'data-act="send"' })}
            <div class="tiny muted">Enter 发送<br>Shift+Enter 换行</div>
          </div>
        </div>
        <div class="ana-assistant-disclaimer">
          ${ui.icon('shield', 13)}
          <span>本地规则应答，未接入真实大模型；建议仅供参考，不替代教师判断。数据为虚构模拟。</span>
        </div>
      </div>
    </section>`;
  }

  /* ---------------- 右侧辅助面板 ---------------- */
  function renderSidePanel(state, classId) {
    var overview = sel.classOverview(state, classId);
    var kps = sel.kpAnalysis(state, classId);
    var covered = kps.filter(function (r) { return r.records > 0; }).length;
    var weak = overview.weakKps;

    var top3 = weak.length ? html`<div class="ana-top3">
      ${weak.map(function (row, index) {
        return html`<div class="ana-top3-item">
          <span class="ana-rank">${index + 1}</span>
          <div class="ana-top3-main">
            <div class="ana-top3-name">${row.kpName}</div>
            <div class="ana-top3-meta">仍需巩固 ${row.weakCount} 人 / 有可判读记录 ${row.studentsJudged} 人</div>
            <div class="ana-top3-meta">掌握率 ${pct(row.masteryRate)} · 记录 ${row.records} 条 · 待复核 ${row.pendingCount} 项</div>
          </div>
          ${ui.button({ label: '查看', size: 'sm', tone: 'ghost', attrs: 'data-hash="#/teacher/analysis?kp=' + row.kp.id + '"' })}
        </div>`;
      })}
    </div>` : ui.empty({ compact: true, title: '暂无明显薄弱知识点', desc: '当前没有记录显示需要优先关注的知识点。' });

    return html`<div class="stack ana-side">
      <section class="card">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">班级摘要</div>
          </div>
        </div>
        <div class="card-body">
          <div class="ana-side-sub">最需关注知识点 TOP3</div>
          ${top3}
          <div class="divider mt-2 mb-4"></div>
          <div class="ana-side-sub">数据覆盖与待处理</div>
          <div class="ana-side-stats">
            <div class="ana-side-stat"><span>学生覆盖</span><b class="num">${overview.activeStudents} / ${overview.studentCount}</b></div>
            <div class="ana-side-stat"><span>可判读记录</span><b class="num">${overview.judged} / ${overview.records}</b></div>
            <div class="ana-side-stat"><span>知识点覆盖</span><b class="num">${covered} / ${kps.length}</b></div>
            <div class="ana-side-stat"><span>待复核批阅</span><b class="num warn-text">${overview.pendingGrades}</b></div>
            <div class="ana-side-stat"><span>待确认诊断</span><b class="num warn-text">${overview.pendingDiagnoses}</b></div>
            <div class="ana-side-stat"><span>最近作答</span><b class="num">${overview.lastActivity ? fmt.shortDate(overview.lastActivity) : '—'}</b></div>
          </div>
          <div class="tiny muted mt-2">口径：可判读 = 已判分或教师已复核；待复核不计入掌握率与错误分布。</div>
        </div>
      </section>

      ${ui.disclosure({
        summary: '快捷跳转',
        count: '5 个入口',
        body: html`<div class="ana-jump-grid">
          ${ui.button({ label: '班级学情分析', icon: 'chart', size: 'sm', tone: 'secondary', attrs: 'data-hash="#/teacher/analysis"' })}
          ${ui.button({ label: '个体学情档案', icon: 'user', size: 'sm', tone: 'secondary', attrs: 'data-hash="#/teacher/profile"' })}
          ${ui.button({ label: '复核中心', icon: 'shield', size: 'sm', tone: 'secondary', attrs: 'data-hash="#/teacher/review"' })}
          ${ui.button({ label: '作业批阅', icon: 'clipboard', size: 'sm', tone: 'secondary', attrs: 'data-hash="#/teacher/grading"' })}
          ${ui.button({ label: '数据与报告', icon: 'database', size: 'sm', tone: 'secondary', attrs: 'data-hash="#/teacher/data"' })}
        </div>`
      })}

      ${ui.disclosure({
        summary: '使用说明与能力边界',
        count: '4 条',
        body: html`<ul class="ana-bullets small">
          <li>每条分析都附“数据依据”与“适用条件”，请结合课堂观察判断。</li>
          <li>记录不足或存在待复核时，助理会明确说明“暂无法判断”或标注初步。</li>
          <li>回复中的按钮可直接跳转到对应页面继续处理。</li>
          <li>会话内容仅保存在当前页面，刷新浏览器后清空。</li>
        </ul>`
      })}
    </div>`;
  }

  /* ---------------- 发送与绘制 ---------------- */
  function pushAssistantReply(ctx, text) {
    var state = ctx.state;
    var classId = classIdOf(ctx);
    MESSAGES.push({ role: 'user', text: text, at: Date.now() });
    var result;
    try {
      result = assistant.teacherReply(state, { classId: classId, message: text });
    } catch (err) {
      result = {
        intent: 'fallback',
        reply: '分析生成失败，请稍后重试；本次没有给出任何结论。',
        cards: [],
        followUps: assistant.teacherQuickAsks.slice(0, 3),
        disclaimer: '发生内部错误，未生成分析结论。'
      };
      ui.toast('分析生成失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    }
    MESSAGES.push({ role: 'assistant', result: result, at: Date.now() });
    return result;
  }

  function paint(root, ctx) {
    var list = root.querySelector('#ana-chat-list');
    if (list) {
      list.innerHTML = (MESSAGES.length ? '' : renderWelcome(ctx.state, classIdOf(ctx)).value) +
        (MESSAGES.length ? renderMessages().value : '');
      list.scrollTop = list.scrollHeight;
    }
    var input = root.querySelector('#ana-input');
    if (input) {
      input.value = INPUT_TEXT;
      try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); }
    }
    var sendBtn = root.querySelector('[data-act="send"]');
    if (sendBtn) sendBtn.disabled = !String(INPUT_TEXT || '').trim();
  }

  function sendMessage(root, ctx, text) {
    var message = String(text || '').trim();
    if (!message) {
      ui.toast('请先输入问题，或点击下方快捷提问', 'warn');
      return;
    }
    var result = pushAssistantReply(ctx, message);
    INPUT_TEXT = '';
    paint(root, ctx);
    if (result.intent === 'fallback' || result.intent === 'unknown') {
      ui.toast('该问题暂无法基于现有数据回答，助理已说明缺少的数据', 'warn');
    }
  }

  /* ---------------- 页面注册 ---------------- */
  ZWZ.pages.register('teacher/assistant', {
    title: '教学助理',
    subtitle: '教师端 · 学情工作台',
    render: function (ctx) {
      var state = ctx.state;
      var classId = classIdOf(ctx);
      var overview = sel.classOverview(state, classId);

      return html`<div class="page ana-assistant">
        <div class="page-head">
          <div class="page-head-main">
            <div class="page-title">教学助理</div>
            <div class="page-desc">用自然语言查询班级或个体学情；回答包含数据依据与适用条件，辅助教学判断。</div>
          </div>
          <div class="page-actions">
            ${ui.button({ label: '班级学情分析', icon: 'chart', tone: 'secondary', attrs: 'data-hash="#/teacher/analysis"' })}
            ${ui.button({ label: '复核中心', icon: 'shield', tone: 'ghost', attrs: 'data-hash="#/teacher/review"' })}
          </div>
        </div>

        ${overview.records === 0 ? ui.banner({
          tone: 'warn',
          title: '当前班级还没有可判读的学情记录',
          body: '助理会在没有数据依据时明确回答“暂无法判断”。请先导入或布置练习，或在“数据与报告”中检查数据状态。'
        }) : ''}

        <div class="split ana-assistant-split">
          <div class="split-main">${renderChat(state, classId)}</div>
          <aside class="split-side">${renderSidePanel(state, classId)}</aside>
        </div>
      </div>`;
    },
    mount: function (root, ctx) {
      var input = root.querySelector('#ana-input');

      function currentText() {
        return input ? input.value : INPUT_TEXT;
      }

      if (input) {
        input.addEventListener('input', function () {
          INPUT_TEXT = input.value;
          var sendBtn = root.querySelector('[data-act="send"]');
          if (sendBtn) sendBtn.disabled = !String(INPUT_TEXT || '').trim();
        });
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            sendMessage(root, ctx, currentText());
          }
        });
        INPUT_TEXT = input.value || '';
        input.focus();
      }

      ui.bind(root, '[data-act="send"]', 'click', function () {
        sendMessage(root, ctx, currentText());
      });

      ui.bind(root, '[data-act="clear"]', 'click', function () {
        if (!MESSAGES.length) {
          ui.toast('当前会话还没有提问记录', 'info');
          return;
        }
        ui.confirm({
          title: '清空当前会话？',
          body: '将清除本次页面内的提问与分析记录（不影响任何学情数据）。',
          okText: '清空会话'
        }).then(function (ok) {
          if (!ok) return;
          MESSAGES = [];
          INPUT_TEXT = '';
          paint(root, ctx);
          ui.toast('会话已清空', 'success');
        });
      });

      /* 事件委托：快捷提问、追问、卡片内跳转按钮（重绘后仍然有效） */
      root.addEventListener('click', function (ev) {
        var target = ev.target;
        var askEl = target.closest ? target.closest('[data-ask]') : null;
        if (askEl) {
          ev.preventDefault();
          sendMessage(root, ctx, askEl.getAttribute('data-ask'));
          return;
        }
        var hashEl = target.closest ? target.closest('[data-hash]') : null;
        if (hashEl) {
          ev.preventDefault();
          var hash = hashEl.getAttribute('data-hash');
          if (hash) ctx.navigate(hash);
        }
      });

      var list = root.querySelector('#ana-chat-list');
      if (list) list.scrollTop = list.scrollHeight;
      paint(root, ctx);
    }
  });
})();

