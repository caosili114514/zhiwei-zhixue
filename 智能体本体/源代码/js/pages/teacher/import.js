/* ============================================================
   教师端 · 试卷与题目（上传 → 模拟解析预览 → 确认题目与知识点 → 布置任务）
   ------------------------------------------------------------
   - 文件解析为“模拟能力”：只读取文件名/大小/类型，题目来自内置示例题库；
     页面与弹窗中明确标注“模拟解析，未接入真实 OCR”，不伪装成真实识别；
   - 解析结果逐题可编辑；确认后调用 store.actions.confirmPaper 入库；
   - 下方提供已有试卷（可查看题目明细 / 直接布置任务）、手动录入与导入记录。
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
  var TYPE_LABEL = { choice: '选择题', fill: '填空题', calc: '计算题', process: '过程 / 应用题' };
  var DIFF_OPTIONS = ['基础', '中等', '提升'];

  /* ---------------- 模块内向导状态（ctx.refresh 后保留，不写入数据库） ---------------- */
  var S = {
    _stale: true,
    step: 1,
    file: null,
    parsing: false,
    parse: null,
    questions: [],
    openQ: {},
    importId: null,
    title: '',
    paperId: null,
    tab: 'papers',
    manual: emptyManual(),
    timer: null
  };

  function emptyManual() {
    return {
      title: '',
      type: 'choice',
      stem: '',
      answer: '',
      max: 4,
      difficulty: '基础',
      kpIds: [],
      options: ['', '', '', '']
    };
  }

  function resetWizard() {
    if (S.timer) { clearTimeout(S.timer); S.timer = null; }
    S.step = 1;
    S.file = null;
    S.parsing = false;
    S.parse = null;
    S.questions = [];
    S.openQ = {};
    S.importId = null;
    S.title = '';
    S.paperId = null;
  }

  /* 离开本页时标记向导失效，下次进入从第 1 步开始（避免回到旧步骤） */
  window.addEventListener('hashchange', function () {
    var hash = window.location.hash || '';
    if (hash.indexOf('/teacher/import') < 0) {
      if (S.timer) { clearTimeout(S.timer); S.timer = null; }
      S._stale = true;
    }
  });

  function ensureFresh() {
    if (S._stale) {
      resetWizard();
      S.tab = 'papers';
      S.manual = emptyManual();
      S._stale = false;
    }
  }

  /* ---------------- 小工具 ---------------- */
  function extOf(name) {
    var m = /\.([^.]+)$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : 'pdf';
  }

  function typeLabel(type) {
    return TYPE_LABEL[type] || type || '题目';
  }

  function fileIcon(type) {
    var t = String(type || '').toLowerCase();
    if (t === 'pdf') return 'pdf';
    if (t === 'png' || t === 'jpg' || t === 'jpeg') return 'image';
    if (t === 'docx' || t === 'doc') return 'fileText';
    return 'file';
  }

  function fileTypeLabel(type) {
    var t = String(type || '').toLowerCase();
    if (t === 'pdf') return 'PDF 文档';
    if (t === 'png' || t === 'jpg' || t === 'jpeg') return '图片';
    if (t === 'docx' || t === 'doc') return 'Word 文档';
    return t ? t.toUpperCase() : '未知类型';
  }

  function sizeText(size) {
    var n = Number(size) || 0;
    if (!n) return '大小未知（模拟）';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function toLocalInput(date) {
    var d = date instanceof Date ? date : new Date(Date.now() + 3 * 86400000);
    function p(n) { return n < 10 ? '0' + n : String(n); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function needCount() {
    return (S.questions || []).filter(function (q) {
      return q.review && q.review.needConfirm;
    }).length;
  }

  function qConfidence(q) {
    var base = Math.round(((S.parse && S.parse.confidence) || 0.78) * 100);
    return (q.review && q.review.needConfirm) ? Math.max(45, base - 23) : base;
  }

  /* ---------------- 第 1 步：上传 ---------------- */
  function renderStep1(ctx) {
    var zone = html`<div class="upload-zone" id="tch-upload-zone" data-act="pick-file" role="button" tabindex="0" aria-label="选择试卷文件">
      <div class="upload-icon">${ui.icon('upload', 22)}</div>
      <div class="upload-title">点击选择试卷文件，或拖拽到这里</div>
      <div class="upload-desc">支持 PDF / PNG / JPG / DOCX；原型阶段只读取文件名、大小与类型，文件不会上传到服务器。</div>
      <input type="file" id="tch-import-file" accept=".pdf,.png,.jpg,.jpeg,.docx" />
      <div class="row-sm row-wrap">
        <button type="button" class="btn btn-secondary btn-sm" data-act="sample-file">
          ${ui.icon('fileText', 14)}<span>使用示例文件（模拟）</span>
        </button>
      </div>
    </div>`;

    var fileItem = '';
    if (S.file) {
      fileItem = html`<div class="file-item">
        <div class="file-icon">${ui.icon(fileIcon(S.file.type), 18)}</div>
        <div class="file-meta">
          <div class="file-name">${S.file.fileName}</div>
          <div class="file-sub">${fileTypeLabel(S.file.type)} · ${sizeText(S.file.size)} · 待解析</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-act="remove-file">${ui.icon('x', 14)}<span>移除</span></button>
      </div>`;
    }

    var actions = html`<div class="row-sm row-wrap">
      ${S.file ? ui.button({ label: S.parsing ? '解析中……' : '开始解析', tone: 'primary', icon: 'spark', attrs: 'data-act="parse"' }) : ''}
      ${S.file && !S.parsing ? ui.button({ label: '重新选择', tone: 'ghost', icon: 'refresh', attrs: 'data-act="remove-file"' }) : ''}
    </div>`;

    return html`<div class="stack">
      ${ui.banner({
        tone: 'warn',
        compact: true,
        title: '模拟解析 · 未接入真实 OCR',
        body: '解析结果基于内置示例题库生成，请逐题核对后确认；文件不会上传到服务器。'
      })}
      ${zone}
      ${S.file ? fileItem : ''}
      ${S.parsing ? ui.loading('正在模拟解析试卷……（约 1.2 秒）') : actions}
      <div class="help">真实能力：题目编辑、知识点映射、确认入库与布置任务。待接入：OCR、真实文件解析与文件存储。</div>
    </div>`;
  }

  /* ---------------- 第 2 步：解析预览 ---------------- */
  function optionsHtml(q) {
    if (q.type !== 'choice' || !q.options || !q.options.length) return '';
    return raw('<div class="tch-option-list">' + q.options.map(function (opt, i) {
      var letter = String.fromCharCode(65 + i);
      var correct = String(q.answer || '').trim().toUpperCase() === letter;
      return '<div class="tch-option-item' + (correct ? ' is-correct' : '') + '">' +
        '<span class="option-key">' + letter + '</span><span>' + esc(opt || '（空）') + '</span></div>';
    }).join('') + '</div>');
  }

  function questionRow(q) {
    var need = !!(q.review && q.review.needConfirm);
    var notes = (q.review && q.review.notes) || [];
    var open = !!S.openQ[q.id];
    var stem = q.stem || '（题干为空，请编辑补充）';
    return html`<article class="tch-q-row${raw(need ? ' is-need' : '')}${raw(open ? ' is-open' : '')}" data-q-row="${q.id}">
      <div class="tch-q-row-head">
        <div class="tch-q-row-main">
          <span class="tch-q-no">第 ${q.code} 题</span>
          ${ui.badge(typeLabel(q.type), 'neutral')}
          ${need ? ui.badge('待确认', 'warn') : ui.badge('已识别', 'teal')}
          <span class="tch-q-summary">${fmt.trunc(stem, 58)}</span>
        </div>
        <div class="tch-q-row-actions">
          ${ui.button({ label: '编辑', tone: need ? 'secondary' : 'ghost', size: 'sm', icon: 'edit', attrs: 'data-edit="' + q.id + '"' })}
          <button type="button" class="btn btn-ghost btn-sm" data-toggle-q="${q.id}" aria-expanded="${open ? 'true' : 'false'}">
            <span>${open ? '收起' : '展开'}</span>${ui.icon(open ? 'chevronUp' : 'chevronDown', 14)}
          </button>
        </div>
      </div>
      ${need && !open ? html`<div class="tch-q-row-flag">${ui.icon('alert', 12)}<span>需核对：${notes.slice(0, 2).join('；') || '请核对题干、参考答案与知识点'}</span></div>` : ''}
      ${open ? html`<div class="tch-q-detail">
        <div class="question-stem">${stem}</div>
        ${optionsHtml(q)}
        <div class="tch-q-meta">
          <div class="tch-meta-item"><span class="k">参考答案</span><span class="v${q.answer ? '' : ' is-warn'}">${q.answer || '待教师确认'}</span></div>
          <div class="tch-meta-item"><span class="k">知识点</span><span class="v">${(q.kpNames && q.kpNames.length) ? q.kpNames.join('、') : '待确认'}</span></div>
          <div class="tch-meta-item"><span class="k">满分</span><span class="v num">${(q.scoring && q.scoring.max) || 0} 分</span></div>
          <div class="tch-meta-item"><span class="k">难度</span><span class="v">${q.difficulty || '待确认'}</span></div>
        </div>
        ${notes.length ? html`<div class="tch-q-note">${ui.icon('alert', 13)}<span>${notes.join('；')}</span></div>` : ''}
      </div>` : ''}
    </article>`;
  }
  function renderStep2(ctx) {
    if (!S.parse || !S.questions.length) {
      return html`<div class="stack">
        ${ui.empty({
          icon: 'upload',
          title: '请先上传并解析试卷',
          desc: '解析完成后会在这里逐题展示识别结果，供教师核对与编辑。',
          action: ui.button({ label: '回到上传', tone: 'primary', size: 'sm', icon: 'upload', attrs: 'data-act="reset-wizard"' })
        })}
      </div>`;
    }
    var need = needCount();
    var warnList = (S.parse.warnings || []).map(function (w) { return '· ' + esc(w); }).join('<br>');
    return html`<div class="stack">
      ${ui.banner({
        tone: 'warn',
        title: '模拟解析 · 未接入真实 OCR',
        body: raw(warnList || '· 本次为模拟解析，未接入真实 OCR 服务，请逐题核对。')
      })}
      <div class="tch-wizard-summary">
        <div>
          <div class="card-title">${S.parse.title}</div>
          <div class="small muted">来源文件：${S.parse.source.fileName} · 整体置信度 ${Math.round((S.parse.confidence || 0.78) * 100)}%（模拟值）</div>
        </div>
        <div class="row-sm row-wrap">
          ${ui.badge('共 ' + S.questions.length + ' 题', 'primary')}
          ${ui.badge('其中 ' + need + ' 处需确认', need ? 'warn' : 'teal')}
        </div>
      </div>
      <div class="tiny muted">标记「待确认」的题目请展开核对题干、参考答案与知识点后再入库；折叠只隐藏细节，不改变已识别内容。</div>
      <div class="stack">${S.questions.map(questionRow)}</div>
      <div class="tch-wizard-actions">
        ${ui.button({ label: '重新上传', tone: 'ghost', icon: 'refresh', attrs: 'data-act="reset-wizard"' })}
        <div class="spacer"></div>
        ${ui.button({ label: '下一步：确认题目与知识点', tone: 'primary', icon: 'arrowRight', attrs: 'data-act="to-step3"' })}
      </div>
    </div>`;
  }

  /* ---------------- 第 3 步：确认题目与知识点 ---------------- */
  function renderStep3(ctx) {
    if (!S.parse || !S.questions.length) {
      return ui.empty({
        icon: 'upload',
        title: '暂无可确认的题目',
        desc: '请先上传并解析试卷。',
        action: ui.button({ label: '回到上传', tone: 'primary', size: 'sm', icon: 'upload', attrs: 'data-act="reset-wizard"' })
      });
    }
    var need = needCount();
    var title = S.title || S.parse.title;
    var table = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'code', label: '题号', width: '64px', render: function (q) { return raw('<span class="num">' + esc(q.code) + '</span>'); } },
        { key: 'type', label: '题型', width: '110px', render: function (q) { return ui.badge(typeLabel(q.type), 'neutral'); } },
        {
          key: 'stem',
          label: '题干',
          render: function (q) {
            return html`<span class="truncate" style="display:block;max-width:520px" title="${q.stem}">${fmt.trunc(q.stem || '（空）', 48)}</span>`;
          }
        },
        {
          key: 'answer',
          label: '参考答案',
          width: '130px',
          render: function (q) {
            return q.answer ? raw('<span class="mono">' + esc(q.answer) + '</span>') : ui.badge('待确认', 'warn');
          }
        },
        {
          key: 'kp',
          label: '知识点',
          width: '210px',
          render: function (q) { return (q.kpNames || []).join('、') || '—'; }
        },
        {
          key: 'status',
          label: '状态',
          width: '110px',
          render: function (q) {
            return q.review && q.review.needConfirm ? ui.badge('待确认', 'warn') : ui.badge('已确认', 'teal');
          }
        },
        {
          key: 'ops',
          label: '操作',
          width: '80px',
          render: function (q) {
            return ui.button({ label: '编辑', tone: 'ghost', size: 'sm', icon: 'edit', attrs: 'data-edit="' + q.id + '"' });
          }
        }
      ],
      rows: S.questions
    });

    return html`<div class="stack">
      <div class="field">
        <div class="label">试卷标题 <span class="req">*</span></div>
        <input class="input" id="tch-paper-title" value="${title}" placeholder="例如：有理数专项练习（模拟解析）" />
        <div class="help">确认后会保存为班级试卷，可在下方“已有试卷”中查看与修改。</div>
      </div>
      ${need > 0 ? ui.banner({
        tone: 'warn',
        title: '仍有 ' + need + ' 处待确认',
        body: '共 ' + S.questions.length + ' 题，其中 ' + need + ' 处需确认。可以继续确认入库，未确认字段将以当前内容保存，之后可在题目明细中修改。'
      }) : ui.banner({
        tone: 'success',
        compact: true,
        title: '所有字段均已确认',
        body: '共 ' + S.questions.length + ' 题，可保存为试卷并布置任务。'
      })}
      ${table}
      <div class="tch-wizard-actions">
        ${ui.button({ label: '上一步：返回预览', tone: 'ghost', icon: 'chevronLeft', attrs: 'data-act="to-step2"' })}
        <div class="spacer"></div>
        ${ui.button({ label: '确认题目与知识点，生成试卷', tone: 'primary', icon: 'check', attrs: 'data-act="confirm-paper"' })}
      </div>
    </div>`;
  }

  /* ---------------- 第 4 步：布置任务 ---------------- */
  function renderStep4(ctx) {
    var state = ctx.state;
    var paper = S.paperId ? sel.paper(state, S.paperId) : null;
    if (!paper) {
      return ui.empty({
        icon: 'upload',
        title: '还没有可布置的试卷',
        desc: '请先导入并确认一份试卷，或在“已有试卷”中选择一份直接布置任务。',
        action: ui.button({ label: '回到上传', tone: 'primary', size: 'sm', icon: 'upload', attrs: 'data-act="reset-wizard"' })
      });
    }
    var questions = sel.questionsOfPaper(state, paper.id);
    var title = S.title || paper.title;
    var scopeDefault = '第一章 有理数 — 第三章 一元一次方程（第四章未纳入当前教学进度）';
    return html`<div class="stack">
      ${ui.banner({ tone: 'success', compact: true, title: '试卷已确认入库', body: paper.title + ' · ' + questions.length + ' 道题 · 知识点映射已保存' })}
      <div class="tch-paper-brief">
        <div class="row-sm row-wrap">
          <span class="tch-q-no">${paper.title}</span>
          ${ui.badge('已确认', 'success')}
          ${ui.badge(paper.parseMode === 'manual' ? '手动录入' : '模拟解析', paper.parseMode === 'manual' ? 'neutral' : 'warn')}
        </div>
        <div class="tiny muted">来源：${paper.source.fileName} · 题目 ${questions.length} 道 · 创建于 ${fmt.datetime(paper.createdAt)}</div>
      </div>
      <div class="form-grid">
        <div class="field">
          <div class="label">任务标题 <span class="req">*</span></div>
          <input class="input" id="tch-task-title" value="${title}" placeholder="例如：有理数专项练习 · 课后巩固" />
        </div>
        <div class="field">
          <div class="label">截止时间 <span class="req">*</span></div>
          <input class="input" id="tch-task-due" type="datetime-local" value="${toLocalInput()}" />
        </div>
      </div>
      <div class="form-grid">
        <div class="field">
          <div class="label">班级</div>
          <input class="input" value="七年级(3)班" disabled />
        </div>
        <div class="field">
          <div class="label">教学范围说明</div>
          <input class="input" id="tch-task-scope" value="${scopeDefault}" />
        </div>
      </div>
      <div class="help">布置后学生端会出现该任务；学生提交的作答会自动进入批阅队列，过程题仍需教师复核给分。</div>
      <div class="tch-wizard-actions">
        ${ui.button({ label: '返回工作台', tone: 'ghost', icon: 'dashboard', attrs: 'data-go="#/teacher/dashboard"' })}
        ${S.parse ? ui.button({ label: '返回确认', tone: 'ghost', icon: 'chevronLeft', attrs: 'data-act="to-step3"' }) : ''}
        <div class="spacer"></div>
        ${ui.button({ label: '布置任务', tone: 'primary', icon: 'check', attrs: 'data-act="create-task"' })}
      </div>
    </div>`;
  }

  /* ---------------- 试卷与题目库 ---------------- */
  function renderPapers(state) {
    var papers = state.papers || [];
    var table = ui.table({
      className: 'is-compact',
      columns: [
        {
          key: 'title',
          label: '试卷',
          render: function (p) {
            return html`<div class="cell-strong">${p.title}</div><span class="cell-sub">创建于 ${fmt.date(p.createdAt)}</span>`;
          }
        },
        {
          key: 'source',
          label: '来源文件',
          width: '240px',
          render: function (p) {
            return html`<span class="small">${p.source && p.source.fileName ? p.source.fileName : '未记录'}</span>`;
          }
        },
        {
          key: 'mode',
          label: '解析方式',
          width: '110px',
          render: function (p) {
            return p.parseMode === 'manual'
              ? ui.badge('手动录入', 'neutral')
              : ui.badge('模拟解析', 'warn');
          }
        },
        {
          key: 'count',
          label: '题目数',
          width: '90px',
          align: 'right',
          render: function (p) { return raw('<span class="num">' + (p.questionIds || []).length + '</span>'); }
        },
        {
          key: 'status',
          label: '状态',
          width: '100px',
          render: function (p) { return ui.badge(p.status === 'confirmed' ? '已确认' : p.status, p.status === 'confirmed' ? 'success' : 'neutral'); }
        },
        {
          key: 'ops',
          label: '操作',
          align: 'right',
          width: '210px',
          render: function (p) {
            return html`<div class="row-sm" style="justify-content:flex-end">
              ${ui.button({ label: '查看题目', tone: 'ghost', size: 'sm', icon: 'eye', attrs: 'data-open-paper="' + p.id + '"' })}
              ${ui.button({ label: '布置任务', tone: 'secondary', size: 'sm', icon: 'arrowRight', attrs: 'data-use-paper="' + p.id + '"' })}
            </div>`;
          }
        }
      ],
      rows: papers,
      empty: ui.empty({
        compact: true,
        icon: 'fileText',
        title: '还没有已确认的试卷',
        desc: '完成上方“上传 → 解析 → 确认”流程后，试卷会出现在这里。',
        action: ui.button({ label: '去上传试卷', tone: 'secondary', size: 'sm', icon: 'upload', attrs: 'data-act="reset-wizard"' })
      })
    });
    return table;
  }

  function renderManual(state) {
    var m = S.manual;
    var kps = sel.inScopeKps(state, CLASS_ID);
    var kpChecks = kps.map(function (kp) {
      return html`<label class="check tch-kp-check">
        <input type="checkbox" data-manual="kp" data-kp-id="${kp.id}" ${raw(m.kpIds.indexOf(kp.id) >= 0 ? 'checked' : '')} />
        <span>${kp.name}<span class="tiny muted"> · ${kp.chapterName}</span></span>
      </label>`;
    });
    var optionsFields = m.type === 'choice'
      ? html`<div class="form-grid tch-option-fields">
          ${['A', 'B', 'C', 'D'].map(function (letter, i) {
            return html`<div class="field">
              <div class="label">选项 ${letter}</div>
              <input class="input" data-manual="option" data-idx="${i}" value="${m.options[i] || ''}" placeholder="选项 ${letter} 内容" />
            </div>`;
          })}
        </div>`
      : '';
    return html`<div class="stack">
      ${ui.banner({
        tone: 'info',
        compact: true,
        body: '手动录入会生成一份仅含 1 道题的单题试卷（解析方式记为“手动录入”），适合补充课堂即时练习。'
      })}
      <div class="field">
        <div class="label">试卷标题</div>
        <input class="input" data-manual="title" value="${m.title}" placeholder="${'手动录入试卷 · ' + fmt.date(new Date().toISOString())}" />
      </div>
      <div class="form-grid is-3">
        <div class="field">
          <div class="label">题型</div>
          <select class="select" data-manual="type">
            ${['choice', 'fill', 'calc', 'process'].map(function (t) {
              return html`<option value="${t}" ${raw(m.type === t ? 'selected' : '')}>${typeLabel(t)}</option>`;
            })}
          </select>
        </div>
        <div class="field">
          <div class="label">满分（分）</div>
          <input class="input" type="number" min="1" max="20" step="1" data-manual="max" value="${m.max}" />
        </div>
        <div class="field">
          <div class="label">难度</div>
          <select class="select" data-manual="difficulty">
            ${DIFF_OPTIONS.map(function (d) {
              return html`<option value="${d}" ${raw(m.difficulty === d ? 'selected' : '')}>${d}</option>`;
            })}
          </select>
        </div>
      </div>
      <div class="field">
        <div class="label">题干 <span class="req">*</span></div>
        <textarea class="textarea" data-manual="stem" placeholder="请输入题目内容">${m.stem}</textarea>
      </div>
      ${optionsFields}
      <div class="field">
        <div class="label">参考答案 <span class="req">*</span></div>
        <input class="input" data-manual="answer" value="${m.answer}" placeholder="例如：C 或 -4 或 5x−7" />
      </div>
      <div class="field">
        <div class="label">知识点（可多选） <span class="req">*</span></div>
        <div class="tch-kp-checks">${kpChecks}</div>
      </div>
      <div class="tch-wizard-actions">
        ${ui.button({ label: '清空表单', tone: 'ghost', icon: 'refresh', attrs: 'data-act="manual-reset"' })}
        <div class="spacer"></div>
        ${ui.button({ label: '保存题目并生成试卷', tone: 'primary', icon: 'check', attrs: 'data-act="manual-save"' })}
      </div>
    </div>`;
  }

  function renderImports(state) {
    var imports = state.imports || [];
    return ui.table({
      className: 'is-compact',
      columns: [
        {
          key: 'fileName',
          label: '文件 / 批次',
          render: function (i) {
            return html`<div class="cell-strong">${i.fileName}</div><span class="cell-sub">${fmt.datetime(i.at)}</span>`;
          }
        },
        {
          key: 'type',
          label: '类型',
          width: '90px',
          render: function (i) { return i.type === 'paper' ? '试卷' : i.type === 'csv' ? '学情 CSV' : (i.type || '—'); }
        },
        { key: 'rows', label: '识别条数', width: '90px', align: 'right', render: function (i) { return raw('<span class="num">' + (i.rows || 0) + '</span>'); } },
        { key: 'ok', label: '成功', width: '80px', align: 'right', render: function (i) { return raw('<span class="num">' + (i.ok || 0) + '</span>'); } },
        {
          key: 'status',
          label: '状态',
          width: '100px',
          render: function (i) { return ui.badge(i.status || '—', i.status === '已确认' ? 'success' : 'warn'); }
        },
        { key: 'note', label: '说明', render: function (i) { return i.note || '—'; } }
      ],
      rows: imports,
      empty: ui.empty({ compact: true, icon: 'database', title: '暂无导入记录', desc: '上传试卷或导入学情数据后，这里会保留批次记录。' })
    });
  }

  function renderLibrary(ctx) {
    var state = ctx.state;
    var tabItems = [
      { key: 'papers', label: '已有试卷', badge: (state.papers || []).length },
      { key: 'manual', label: '手动录入' },
      { key: 'imports', label: '导入记录', badge: (state.imports || []).length }
    ];
    var body = S.tab === 'manual' ? renderManual(state) : (S.tab === 'imports' ? renderImports(state) : renderPapers(state));
    return html`<section class="section">
      <div class="section-head">
        <div class="section-title">试卷与题目库</div>
        <div class="section-desc">已确认的试卷、手动录入入口与导入记录。</div>
      </div>
      <div class="card">
        <div class="tch-tabbar">${ui.tabs({ name: 'tch-import-tabs', active: S.tab, items: tabItems })}</div>
        <div class="tch-tabbody">${body}</div>
      </div>
    </section>`;
  }

  /* ---------------- 能力边界说明 ---------------- */
  function renderCapability() {
    return ui.disclosure({
      summary: '能力与边界说明',
      count: '9 条',
      body: html`<div class="grid-3">
        <div class="tch-cap">
          ${ui.badge('真实能力 · 已实现', 'teal')}
          <ul class="tch-cap-list">
            <li>逐题编辑题干、答案、题型、满分、知识点与难度</li>
            <li>确认题目与知识点映射，保存到本地数据库</li>
            <li>布置任务，并按任务进入批阅队列</li>
          </ul>
        </div>
        <div class="tch-cap">
          ${ui.badge('模拟能力', 'warn')}
          <ul class="tch-cap-list">
            <li>文件解析：基于内置示例题库生成 4 道示例题</li>
            <li>置信度为模拟值，不代表真实识别准确率</li>
            <li>不读取文件内容，不做真实 OCR</li>
          </ul>
        </div>
        <div class="tch-cap">
          ${ui.badge('待接入', 'neutral')}
          <ul class="tch-cap-list">
            <li>真实 OCR / PDF / DOCX 解析服务</li>
            <li>文件云存储与原始试卷留存</li>
            <li>过程题自动批阅（当前仅辅助，需教师给分）</li>
          </ul>
        </div>
      </div>`
    });
  }

  /* ---------------- 交互动作 ---------------- */
  function startParse(ctx) {
    if (!S.file || S.parsing) return;
    var meta = { fileName: S.file.fileName, type: S.file.type, size: S.file.size };
    S.parsing = true;
    ctx.refresh();
    if (S.timer) clearTimeout(S.timer);
    S.timer = setTimeout(function () {
      S.timer = null;
      if ((window.location.hash || '').indexOf('/teacher/import') < 0) {
        S.parsing = false;
        return;
      }
      var res = ZWZ.store.actions.importPaper(meta);
      S.parse = res.parse;
      S.questions = res.parse.questions || [];
      S.importId = res.importId;
      S.title = res.parse.title || '未命名试卷';
      S.parsing = false;
      S.step = 2;
      ctx.refresh();
      var need = needCount();
      ui.toast('模拟解析完成：识别出 ' + S.questions.length + ' 道题，其中 ' + need + ' 处需确认', 'success');
    }, 1200);
  }

  function confirmPaper(ctx) {
    if (!S.parse || !S.questions.length) return;
    var titleInput = document.getElementById('tch-paper-title');
    if (titleInput) S.title = titleInput.value.trim();
    var title = S.title || S.parse.title || '未命名试卷';
    var need = needCount();
    var run = function () {
      var paper = ZWZ.store.actions.confirmPaper({
        title: title,
        classId: CLASS_ID,
        questions: S.questions,
        source: S.parse.source,
        parseMode: 'mock',
        materialId: 'm2',
        importId: S.importId
      });
      S.paperId = paper.id;
      S.title = paper.title;
      S.step = 4;
      ui.toast('已确认 ' + paper.questionIds.length + ' 道题并生成试卷（模拟解析结果已入库）', 'success');
      ctx.refresh();
    };
    if (need > 0) {
      ui.confirm({
        title: '仍有 ' + need + ' 处待确认，是否继续？',
        body: '未确认的字段将以当前内容保存，之后可在“已有试卷 → 查看题目”中修改。建议先逐题核对题干、参考答案与知识点。',
        okText: '仍然确认入库',
        cancelText: '返回核对'
      }).then(function (ok) { if (ok) run(); });
    } else {
      run();
    }
  }

  function createTask(ctx) {
    if (!S.paperId) { ui.toast('请先确认试卷', 'warn'); return; }
    var titleEl = document.getElementById('tch-task-title');
    var dueEl = document.getElementById('tch-task-due');
    var scopeEl = document.getElementById('tch-task-scope');
    var title = (titleEl && titleEl.value.trim()) || S.title || '未命名任务';
    var dueVal = dueEl && dueEl.value;
    var dueDate = dueVal ? new Date(dueVal) : null;
    if (!dueDate || isNaN(dueDate.getTime())) dueDate = new Date(Date.now() + 3 * 86400000);
    var scopeNote = (scopeEl && scopeEl.value.trim()) || '';
    var paper = sel.paper(ZWZ.store.state, S.paperId);
    var task = ZWZ.store.actions.createTask({
      title: title,
      classId: CLASS_ID,
      paperId: S.paperId,
      dueAt: dueDate.toISOString(),
      scopeNote: scopeNote
    });
    ui.toast('任务已布置：' + task.title + '（' + (paper ? (paper.questionIds || []).length : 0) + ' 道题）', 'success');
    resetWizard();
    S.manual = emptyManual();
    S.tab = 'papers';
    ctx.navigate('#/teacher/dashboard');
  }

  function saveManual(ctx) {
    var m = S.manual;
    var state = ZWZ.store.state;
    if (!m.stem.trim()) { ui.toast('请填写题干', 'warn'); return; }
    if (!m.answer.trim()) { ui.toast('请填写参考答案，或稍后在题目明细中补全', 'warn'); return; }
    if (!m.kpIds.length) { ui.toast('请至少选择 1 个知识点', 'warn'); return; }
    var q = ZWZ.parser.blankQuestion();
    q.code = '1';
    q.type = m.type;
    q.stem = m.stem.trim();
    q.answer = m.answer.trim();
    q.difficulty = m.difficulty || '基础';
    q.scoring = {
      max: Number(m.max) || (m.type === 'choice' ? 4 : 5),
      mode: m.type === 'process' ? 'process' : 'exact',
      rule: m.type === 'process'
        ? '按步骤给分，系统仅做辅助批阅，需教师复核'
        : '与参考答案一致即得满分，不设部分分'
    };
    q.kpIds = m.kpIds.slice();
    q.kpNames = q.kpIds.map(function (id) {
      var kp = sel.kp(state, id);
      return kp ? kp.name : id;
    });
    q.chapterId = (sel.kp(state, q.kpIds[0]) || {}).chapterId || 'ch1';
    if (m.type === 'choice') {
      q.options = m.options.map(function (o) { return String(o || '').trim(); });
    }
    var title = m.title.trim() || ('手动录入试卷 · ' + fmt.date(new Date().toISOString()));
    var paper = ZWZ.store.actions.confirmPaper({
      title: title,
      classId: CLASS_ID,
      questions: [q],
      source: { fileName: '教师手动录入', type: 'manual', size: 0 },
      parseMode: 'manual',
      materialId: 'm3'
    });
    S.manual = emptyManual();
    S.tab = 'papers';
    ui.toast('已生成单题试卷：' + title + '（' + paper.questionIds.length + ' 道题）', 'success');
    ctx.refresh();
  }

  /* ---------------- 弹窗：编辑题目 ---------------- */
  function openEditModal(ctx, questionId) {
    var state = ZWZ.store.state;
    var inState = null;
    for (var i = 0; i < state.questions.length; i++) {
      if (state.questions[i].id === questionId) { inState = state.questions[i]; break; }
    }
    var q = inState;
    if (!q) {
      q = null;
      for (var j = 0; j < S.questions.length; j++) {
        if (S.questions[j].id === questionId) { q = S.questions[j]; break; }
      }
    }
    if (!q) return;
    var kps = sel.inScopeKps(state, CLASS_ID);
    var kpChecks = kps.map(function (kp) {
      return html`<label class="check tch-kp-check">
        <input type="checkbox" data-edit-kp="${kp.id}" ${raw((q.kpIds || []).indexOf(kp.id) >= 0 ? 'checked' : '')} />
        <span>${kp.name}<span class="tiny muted"> · ${kp.chapterName}</span></span>
      </label>`;
    });
    var notes = (q.review && q.review.notes) || [];
    var body = html`<div class="stack">
      ${notes.length ? ui.banner({ tone: 'warn', compact: true, title: '解析提示', body: notes.join('；') }) : ''}
      <div class="field">
        <div class="label">题干 <span class="req">*</span></div>
        <textarea class="textarea" id="tch-edit-stem">${q.stem || ''}</textarea>
      </div>
      <div class="form-grid is-3">
        <div class="field">
          <div class="label">题型</div>
          <select class="select" id="tch-edit-type">
            ${['choice', 'fill', 'calc', 'process'].map(function (t) {
              return html`<option value="${t}" ${raw(q.type === t ? 'selected' : '')}>${typeLabel(t)}</option>`;
            })}
          </select>
        </div>
        <div class="field">
          <div class="label">满分（分）</div>
          <input class="input" type="number" min="1" max="20" step="1" id="tch-edit-max" value="${(q.scoring && q.scoring.max) || 5}" />
        </div>
        <div class="field">
          <div class="label">难度</div>
          <select class="select" id="tch-edit-diff">
            ${DIFF_OPTIONS.map(function (d) {
              return html`<option value="${d}" ${raw(q.difficulty === d ? 'selected' : '')}>${d}</option>`;
            })}
          </select>
        </div>
      </div>
      <div class="field">
        <div class="label">参考答案 <span class="req">*</span></div>
        <input class="input" id="tch-edit-answer" value="${q.answer || ''}" placeholder="例如：C 或 -4 或 5x−7" />
      </div>
      <div class="field">
        <div class="label">知识点（可多选，至少 1 个）</div>
        <div class="tch-kp-checks">${kpChecks}</div>
      </div>
      <label class="check">
        <input type="checkbox" id="tch-edit-confirm" ${raw(q.review && q.review.needConfirm ? '' : 'checked')} />
        <span>我已核对该题，清除“待确认”标记</span>
      </label>
    </div>`;
    var ctl = ui.modal({
      title: '编辑题目 · 第 ' + q.code + ' 题',
      desc: '修改仅保存在当前草稿；确认试卷后正式入库。',
      size: 'lg',
      body: body.value,
      footer: '<div class="spacer"></div><button type="button" class="btn btn-secondary" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" data-act="save-question">保存修改</button>'
    });
    ctl.el.querySelector('[data-act="save-question"]').addEventListener('click', function () {
      var stemEl = ctl.el.querySelector('#tch-edit-stem');
      var typeEl = ctl.el.querySelector('#tch-edit-type');
      var maxEl = ctl.el.querySelector('#tch-edit-max');
      var diffEl = ctl.el.querySelector('#tch-edit-diff');
      var ansEl = ctl.el.querySelector('#tch-edit-answer');
      var confirmEl = ctl.el.querySelector('#tch-edit-confirm');
      var kpIds = [];
      ctl.el.querySelectorAll('[data-edit-kp]').forEach(function (el) {
        if (el.checked) kpIds.push(el.getAttribute('data-edit-kp'));
      });
      var stem = stemEl.value.trim();
      if (!stem) { ui.toast('题干不能为空', 'warn'); return; }
      if (!kpIds.length) { ui.toast('请至少选择 1 个知识点', 'warn'); return; }
      var type = typeEl.value;
      var max = Math.max(1, Math.min(20, Number(maxEl.value) || 5));
      var kpNames = kpIds.map(function (id) {
        var kp = sel.kp(state, id);
        return kp ? kp.name : id;
      });
      var chapterId = (sel.kp(state, kpIds[0]) || {}).chapterId || q.chapterId || 'ch1';
      var patch = {
        stem: stem,
        type: type,
        answer: ansEl.value.trim(),
        difficulty: diffEl.value,
        scoring: {
          max: max,
          mode: type === 'process' ? 'process' : 'exact',
          rule: type === 'process' ? '按步骤给分，系统仅做辅助批阅，需教师复核' : '与参考答案一致即得满分，不设部分分'
        },
        kpIds: kpIds,
        kpNames: kpNames,
        chapterId: chapterId
      };
      if (confirmEl.checked) {
        patch.review = { needConfirm: false, notes: (q.review && q.review.notes) || [] };
      }
      if (inState) {
        ZWZ.store.actions.updateQuestion(q.id, patch);
      } else {
        Object.keys(patch).forEach(function (key) { q[key] = patch[key]; });
        if (!q.scoring) q.scoring = patch.scoring;
      }
      ctl.close();
      ui.toast(inState ? '题目已更新并保存' : '题目已更新（确认试卷后入库）', 'success');
      ctx.refresh();
    });
  }

  /* ---------------- 抽屉：查看试卷题目明细 ---------------- */
  function paperQuestionList(state, paperId) {
    var questions = sel.questionsOfPaper(state, paperId);
    if (!questions.length) {
      return ui.empty({ compact: true, icon: 'fileText', title: '试卷暂无题目', desc: '该试卷的题目明细为空。' });
    }
    return html`<div class="stack-sm">
      ${questions.map(function (q) {
        var options = '';
        if (q.options && q.options.length) {
          options = raw('<div class="tch-option-list is-compact">' + q.options.map(function (opt, i) {
            var letter = String.fromCharCode(65 + i);
            var correct = String(q.answer || '').trim().toUpperCase() === letter;
            return '<div class="tch-option-item' + (correct ? ' is-correct' : '') + '"><span class="option-key">' + letter + '</span><span>' + esc(opt || '（空）') + '</span></div>';
          }).join('') + '</div>');
        }
        return html`<div class="tch-drawer-q">
          <div class="row-sm row-wrap">
            <span class="tch-q-no">第 ${q.code} 题</span>
            ${ui.badge(typeLabel(q.type), 'neutral')}
            <span class="tag">${q.difficulty || '—'}</span>
            <span class="tiny muted">满分 ${(q.scoring && q.scoring.max) || '—'} 分</span>
          </div>
          <div class="question-stem">${q.stem || '（题干为空）'}</div>
          ${options}
          <div class="tch-q-meta">
            <div class="tch-meta-item"><span class="k">参考答案</span><span class="v${q.answer ? '' : ' is-warn'}">${q.answer || '待确认'}</span></div>
            <div class="tch-meta-item"><span class="k">知识点</span><span class="v">${(q.kpNames || []).join('、') || '—'}</span></div>
          </div>
        </div>`;
      })}
    </div>`;
  }

  function openPaperDrawer(ctx, paperId) {
    var state = ZWZ.store.state;
    var paper = sel.paper(state, paperId);
    if (!paper) return;
    var questions = sel.questionsOfPaper(state, paperId);
    var body = html`<div class="stack">
      ${ui.banner({
        tone: 'info',
        compact: true,
        body: '来源：' + (paper.source && paper.source.fileName ? paper.source.fileName : '未记录') +
          ' · 解析方式：' + (paper.parseMode === 'manual' ? '教师手动录入' : '模拟解析（未接入真实 OCR）') +
          ' · 创建于 ' + fmt.datetime(paper.createdAt)
      })}
      ${paperQuestionList(state, paperId)}
    </div>`;
    var ctl = ui.drawer({
      title: paper.title,
      desc: questions.length + ' 道题 · ' + (paper.status === 'confirmed' ? '已确认' : paper.status),
      width: 600,
      body: body.value,
      footer: '<button type="button" class="btn btn-secondary" data-close>关闭</button>' +
        '<button type="button" class="btn btn-primary" data-act="use-paper">用此试卷布置任务</button>'
    });
    ctl.el.querySelector('[data-act="use-paper"]').addEventListener('click', function () {
      ctl.close();
      usePaper(ctx, paperId);
    });
  }

  function usePaper(ctx, paperId) {
    var paper = sel.paper(ZWZ.store.state, paperId);
    if (!paper) return;
    S.paperId = paperId;
    S.title = paper.title;
    S.parse = null;
    S.questions = [];
    S.step = 4;
    ctx.refresh();
    ui.toast('已选择试卷「' + paper.title + '」，请填写任务信息', 'info');
  }

  /* ---------------- 页面注册 ---------------- */
  ZWZ.pages.register('teacher/import', {
    title: '试卷与题目',
    subtitle: '七年级(3)班 · 试卷导入与题目确认',

    render: function (ctx) {
      CLASS_ID = classIdOf(ctx);
      ensureFresh();
      var stepBody;
      if (S.step === 2) stepBody = renderStep2(ctx);
      else if (S.step === 3) stepBody = renderStep3(ctx);
      else if (S.step === 4) stepBody = renderStep4(ctx);
      else stepBody = renderStep1(ctx);

      var labels = ['上传文件', '解析预览', '确认题目与知识点', '布置任务'];
      var stepperItems = labels.map(function (label, i) {
        var state;
        if (S.step === 4 && S.paperId) state = i < 3 ? 'done' : 'active';
        else if (i < S.step - 1) state = 'done';
        else if (i === S.step - 1) state = 'active';
        else state = 'todo';
        return { label: label, state: state };
      });

      var head = html`<div class="page-head">
        <div class="page-head-main">
          <div class="page-title">试卷与题目</div>
          <div class="page-desc">上传试卷 → 模拟解析预览 → 逐题核对 → 确认入库 → 布置任务。</div>
        </div>
        <div class="page-actions">
          ${ui.button({ label: '查看批阅队列', tone: 'secondary', icon: 'clipboard', attrs: 'data-go="#/teacher/grading"' })}
          ${ui.button({ label: '返回工作台', tone: 'ghost', icon: 'dashboard', attrs: 'data-go="#/teacher/dashboard"' })}
        </div>
      </div>`;

      var wizard = ui.card({
        title: '导入试卷',
        desc: '四步完成：上传文件 → 解析预览 → 确认题目与知识点 → 布置任务',
        actions: raw(ui.badge('第 ' + S.step + ' / 4 步', 'primary').value),
        body: html`<div class="stack">
          ${ui.stepper(stepperItems)}
          <div class="divider"></div>
          ${stepBody}
        </div>`
      });

      return html`<div class="page">
        ${head}
        ${wizard}
        ${renderLibrary(ctx)}
        ${renderCapability()}
      </div>`;
    },

    mount: function (root, ctx) {
      /* 通用跳转 */
      ui.bind(root, '[data-go]', 'click', function (ev, el) {
        ev.preventDefault();
        var go = el.getAttribute('data-go');
        if (go) ctx.navigate(go);
      });

      /* 上传区 */
      ui.bind(root, '[data-act="pick-file"]', 'click', function (ev) {
        if (ev.target.closest('button')) return;
        var input = root.querySelector('#tch-import-file');
        if (input) input.click();
      });
      var fileInput = root.querySelector('#tch-import-file');
      if (fileInput) {
        fileInput.addEventListener('change', function () {
          var f = fileInput.files && fileInput.files[0];
          if (!f) return;
          S.file = { fileName: f.name, type: extOf(f.name), size: f.size };
          S.parsing = false;
          ctx.refresh();
        });
      }
      var zone = root.querySelector('#tch-upload-zone');
      if (zone) {
        ['dragenter', 'dragover'].forEach(function (evt) {
          zone.addEventListener(evt, function (ev) { ev.preventDefault(); zone.classList.add('is-over'); });
        });
        ['dragleave', 'drop'].forEach(function (evt) {
          zone.addEventListener(evt, function (ev) { ev.preventDefault(); zone.classList.remove('is-over'); });
        });
        zone.addEventListener('drop', function (ev) {
          var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
          if (!f) return;
          S.file = { fileName: f.name, type: extOf(f.name), size: f.size };
          S.parsing = false;
          ctx.refresh();
        });
      }
      ui.bind(root, '[data-act="sample-file"]', 'click', function (ev) {
        ev.stopPropagation();
        S.file = { fileName: '有理数专项练习（示例扫描件）.pdf', type: 'pdf', size: 1572864 };
        S.parsing = false;
        ctx.refresh();
      });
      ui.bind(root, '[data-act="remove-file"]', 'click', function () {
        S.file = null;
        S.parsing = false;
        ctx.refresh();
      });
      ui.bind(root, '[data-act="parse"]', 'click', function () { startParse(ctx); });

      /* 步骤切换 */
      ui.bind(root, '[data-act="to-step3"]', 'click', function () { S.step = 3; ctx.refresh(); });
      ui.bind(root, '[data-act="to-step2"]', 'click', function () { S.step = 2; ctx.refresh(); });
      ui.bind(root, '[data-act="reset-wizard"]', 'click', function () {
        resetWizard();
        S.tab = 'papers';
        S.manual = emptyManual();
        ctx.refresh();
      });
      ui.bind(root, '[data-act="confirm-paper"]', 'click', function () { confirmPaper(ctx); });
      ui.bind(root, '[data-act="create-task"]', 'click', function () { createTask(ctx); });

      /* 编辑题目（预览列表与确认表格共用） */
      ui.bind(root, '[data-toggle-q]', 'click', function (ev, el) {
        ev.stopPropagation();
        var qid = el.getAttribute('data-toggle-q');
        if (!qid) return;
        S.openQ[qid] = !S.openQ[qid];
        ctx.refresh();
      });
      root.querySelectorAll('[data-q-row]').forEach(function (row) {
        row.addEventListener('click', function (ev) {
          if (ev.target.closest('button, a, input, textarea, select, label')) return;
          var qid = row.getAttribute('data-q-row');
          if (!qid) return;
          S.openQ[qid] = !S.openQ[qid];
          ctx.refresh();
        });
      });

      ui.bind(root, '[data-edit]', 'click', function (ev, el) {
        openEditModal(ctx, el.getAttribute('data-edit'));
      });

      /* 已有试卷 */
      ui.bind(root, '[data-open-paper]', 'click', function (ev, el) {
        openPaperDrawer(ctx, el.getAttribute('data-open-paper'));
      });
      ui.bind(root, '[data-use-paper]', 'click', function (ev, el) {
        usePaper(ctx, el.getAttribute('data-use-paper'));
      });

      /* 三个 Tab */
      ui.bindTabs(root, 'tch-import-tabs', function (key) {
        S.tab = key;
        ctx.refresh();
      });

      /* 第 3 步试卷标题输入 */
      var titleInput = root.querySelector('#tch-paper-title');
      if (titleInput) {
        titleInput.addEventListener('input', function () { S.title = titleInput.value; });
      }

      /* 手动录入表单同步到模块状态（ctx.refresh 后不丢失） */
      root.querySelectorAll('[data-manual]').forEach(function (el) {
        var key = el.getAttribute('data-manual');
        var evt = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
        el.addEventListener(evt, function () {
          if (key === 'kp') {
            var kpId = el.getAttribute('data-kp-id');
            if (el.checked) {
              if (S.manual.kpIds.indexOf(kpId) < 0) S.manual.kpIds.push(kpId);
            } else {
              S.manual.kpIds = S.manual.kpIds.filter(function (id) { return id !== kpId; });
            }
            return;
          }
          if (key === 'option') {
            var idx = Number(el.getAttribute('data-idx'));
            S.manual.options[idx] = el.value;
            return;
          }
          S.manual[key] = el.value;
          if (key === 'type') ctx.refresh();
        });
      });

      /* 手动录入动作 */
      ui.bind(root, '[data-act="manual-save"]', 'click', function () { saveManual(ctx); });
      ui.bind(root, '[data-act="manual-reset"]', 'click', function () {
        S.manual = emptyManual();
        ctx.refresh();
      });
    }
  });
})();

