/* ============================================================
   知微·智学 · 数据与报告（教师端）
   ------------------------------------------------------------
   四个标签页：
   1）数据导入：CSV 上传 / 拖拽 / 粘贴 → 字段映射 → 预览 → 质量检查 → 确认导入
   2）导出与报告：CSV / JSON 导出、班级报告打印预览
   3）材料与知识范围：材料管理、教学范围设置（影响诊断范围）
   4）审计日志：操作审计与导入记录
   所有数据修改走 ZWZ.store.actions，导出走 ZWZ.io。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = window.ZWZ;
  var html = ZWZ.html;
  var fmt = ZWZ.fmt;
  var esc = ZWZ.esc;
  var ui = ZWZ.ui;
  var sel = ZWZ.sel;
  var io = ZWZ.io;

  var TABS = ['import', 'export', 'materials', 'audit'];
  var TAB = 'import';
  var TAB_INITED = false;
  var LAST_TAB_QUERY = null;

  /* 导入流程的模块级状态：ctx.refresh() 后不丢失 */
  var IMPORT = null;
  var IMPORT_ERROR = '';
  var IMPORT_RESULT = null;
  var PASTE_TEXT = '';

  var USAGE_LABEL = { diagnosis: '诊断依据', student: '学生端', teacher: '教师端' };
  var MATERIAL_STATUS_TONE = { '已确认': 'teal', '示例': 'neutral', '待配置': 'warn', '待确认': 'warn' };
  var ROLE_LABEL = { teacher: '教师', student: '学生', system: '系统' };
  var TARGET_LABEL = {
    paper: '试卷', question: '题目', answer: '作答', diagnosis: '诊断',
    material: '材料', class: '班级', import: '导入', task: '任务'
  };

  function classIdOf(ctx) {
    return (ctx.session && ctx.session.classId) || 'c1';
  }

  function chapterShort(state, ids) {
    var list = state.chapters || [];
    return (ids || []).map(function (id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name.split(' ')[0];
      return id;
    }).join('、') || '—';
  }

  function chapterRangeLabel(state, classId) {
    var cls = sel.classById(state, classId);
    var ids = (cls && cls.scopeChapterIds) || ((state.meta && state.meta.scope && state.meta.scope.chapters) || []);
    return chapterShort(state, ids) || '未设置';
  }

  function initTab(ctx) {
    var q = (ctx.query && ctx.query.tab) || '';
    var valid = TABS.indexOf(q) >= 0 ? q : null;
    if (!TAB_INITED) {
      TAB_INITED = true;
      if (valid) TAB = valid;
    } else if (valid && valid !== LAST_TAB_QUERY) {
      /* 站内再次带参进入（如分析页 → “导出数据” ?tab=export）时切换标签 */
      TAB = valid;
    }
    LAST_TAB_QUERY = valid;
  }

  /* ============================================================
     标签页 1：数据导入
     ============================================================ */
  function renderImportPanel(ctx, state, classId) {
    var panel = IMPORT ? renderImportFlow(ctx, state) : renderImportStart(ctx, state);
    return html`<div class="stack">
      ${IMPORT_ERROR ? ui.banner({
        tone: 'danger',
        title: '导入文件解析失败',
        body: IMPORT_ERROR + ' 请确认文件为逗号分隔的 CSV（首行为字段名），或使用“下载导入模板”重新填写。'
      }) : ''}
      ${IMPORT_RESULT ? ui.banner({
        tone: IMPORT_RESULT.added > 0 ? 'success' : 'warn',
        title: IMPORT_RESULT.added > 0 ? '导入完成' : '导入完成，但没有新增学生',
        body: html`<ul class="ana-bullets">
          <li>文件：${IMPORT_RESULT.fileName}；共 ${IMPORT_RESULT.total} 行，新增学生 ${IMPORT_RESULT.added} 名，跳过/未新增 ${IMPORT_RESULT.total - IMPORT_RESULT.added} 行。</li>
          <li>${IMPORT_RESULT.added > 0 ? '新增学生已加入本班名单，状态为“待确认”，可在数据质量检查与后续练习中核对。' : '未新增的原因：姓名与系统内已有学生重名会被跳过；缺少姓名的行不会导入；本系统不覆盖已有作答数据。'}</li>
          <li>本次导入已写入“导入记录”与审计日志。</li>
        </ul>`
      }) : ''}
      ${panel}
      ${ui.disclosure({
        summary: '最近导入记录',
        count: Math.min(6, (state.imports || []).length) + ' 条',
        body: html`<div class="stack-sm">
          ${renderImportHistoryTable(state)}
          <div class="tiny muted">完整导入记录见“审计日志”标签页。</div>
        </div>`
      })}
    </div>`;
  }

  function renderImportStart(ctx, state) {
    return html`<section class="card">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">导入学情数据（CSV）</div>
          <div class="card-desc">支持上传、拖拽或粘贴；先做字段映射与质量检查，确认后写入。</div>
        </div>
      </div>
      <div class="card-body">
        <div class="ana-import-grid">
          <div>
            <label class="upload-zone" id="ana-drop" for="ana-file">
              <span class="upload-icon">${ui.icon('upload', 20)}</span>
              <span class="upload-title">点击选择 CSV 文件，或拖拽到此处</span>
              <span class="upload-desc">首行为字段名（姓名、学号、班级等）；CSV 仅在本地解析，不上传服务器。</span>
              <input type="file" id="ana-file" accept=".csv,text/csv,.txt" />
            </label>
            ${ui.disclosure({
              summary: '导入格式与字段说明',
              count: io.LEARNER_FIELDS.length + ' 个字段',
              body: html`<div class="ana-import-format">
                <div class="ana-field-list">
                  ${io.LEARNER_FIELDS.map(function (field) {
                    return html`<span class="tag">${field.label}${field.required ? '（必填）' : ''}</span>`;
                  })}
                </div>
                <div class="tiny muted">模板：[姓名, 学号, 班级, 知识点, 作答/表现, 备注]。导入只新增学生名单，不覆盖已有作答；同名学生自动跳过。</div>
              </div>`
            })}
          </div>
          <div class="ana-import-paste">
            <div class="label">或直接粘贴 CSV 文本</div>
            <textarea class="textarea is-lg" id="ana-paste" placeholder="姓名,学号,班级,知识点,作答/表现,备注&#10;张同学,12,七年级(3)班,有理数的加减运算,独立完成,演示行">${PASTE_TEXT}</textarea>
            <div class="row-between">
              <span class="tiny muted">第一行为字段名，逗号分隔</span>
              ${ui.button({ label: '解析粘贴内容', icon: 'play', size: 'sm', tone: 'primary', attrs: 'data-act="parse-paste"' })}
            </div>
          </div>
        </div>
      </div>
      <div class="card-foot">
        ${ui.icon('info', 14)}
        <span class="tiny muted">流程：选择 / 粘贴 → 字段映射 → 质量检查 → 确认导入；发现问题可返回修改。</span>
      </div>
    </section>`;
  }

  function renderImportFlow(ctx, state) {
    var built = IMPORT.built;
    var mapping = built.mapping || {};
    var unmapped = io.LEARNER_FIELDS.filter(function (field) {
      return !mapping[field.key];
    });
    var issueRows = built.preview.filter(function (row) { return !row.ok; }).length;

    var mappingFields = io.LEARNER_FIELDS.map(function (field) {
      return html`<div class="field">
        <div class="label">${field.label}${field.required ? html`<span class="req">*</span>` : ''}</div>
        <select class="select" id="ana-map-${field.key}" data-map="${field.key}">
          <option value="">未映射</option>
          ${IMPORT.headers.map(function (header) {
            return html`<option value="${header}" ${mapping[field.key] === header ? 'selected' : ''}>${header}</option>`;
          })}
        </select>
        <div class="help">${field.required ? '必填，用于匹配系统内学生' : '可选，未映射时留空'}</div>
      </div>`;
    });

    var previewTable = ui.table({
      className: 'is-compact',
      rowAttrs: function (row) {
        return row.ok ? '' : 'class="ana-row-warn"';
      },
      columns: [
        { key: 'index', label: '#', width: '46px', render: function (row) { return html`<span class="num muted">${row.index}</span>`; } },
        { key: 'name', label: '姓名', width: '110px', render: function (row) { return html`<span class="cell-strong">${row.name || '（空）'}</span>`; } },
        { key: 'seatNo', label: '学号', width: '80px', render: function (row) { return row.seatNo || '—'; } },
        { key: 'classId', label: '班级', width: '110px', render: function (row) { return row.classId || '—'; } },
        { key: 'kp', label: '知识点', width: '150px', render: function (row) { return row.kp || '—'; } },
        { key: 'answer', label: '作答 / 表现', width: '110px', render: function (row) { return row.answer || '—'; } },
        {
          key: 'issues', label: '质量检查', render: function (row) {
            if (!row.issues.length) return ui.badge('可导入', 'teal');
            return html`${row.issues.map(function (issue) {
              return ui.badge(issue, issue.indexOf('待确认') >= 0 ? 'neutral' : 'warn');
            })}`;
          }
        }
      ],
      rows: built.preview
    });

    var qualityTone = !built.canImport ? 'danger' : (unmapped.length ? 'warn' : 'success');
    var qualityTitle = !built.canImport
      ? '质量检查未通过，暂不能导入'
      : (unmapped.length ? '质量检查通过（部分字段未映射）' : '质量检查通过，可以导入');

    return html`<section class="card">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">字段映射与导入预览</div>
          <div class="card-desc">文件：${IMPORT.fileName} · ${IMPORT.rows.length} 行 · ${IMPORT.headers.length} 个字段</div>
        </div>
        <div class="card-actions">
          ${ui.button({ label: '重新选择文件', icon: 'refresh', size: 'sm', tone: 'ghost', attrs: 'data-act="reset-import"' })}
        </div>
      </div>
      <div class="card-body">
        ${ui.banner({
          tone: qualityTone,
          title: qualityTitle,
          body: html`<div class="stack-sm">
            <div>共 ${built.total} 行：可导入 ${built.valid} 行${issueRows ? '，存在问题 ' + issueRows + ' 行' : ''}${unmapped.length ? '；未映射字段：' + unmapped.map(function (f) { return f.label; }).join('、') + '（将留空）' : ''}。</div>
            ${built.issues.length ? html`<ul class="ana-bullets">${built.issues.map(function (issue) { return html`<li>${issue}</li>`; })}</ul>` : ''}
            <div class="tiny">说明：问题行不会写入数据；姓名与系统内已有学生重名时会跳过（不覆盖已有作答）；导入后学生状态为“待确认”。</div>
          </div>`
        })}

        <div class="ana-map-grid">${mappingFields}</div>

        <div class="ana-sub-title">预览（${built.preview.length} 行）</div>
        <div class="ana-preview-scroll">${previewTable}</div>
      </div>
      <div class="card-foot">
        <span class="tiny muted">${built.canImport ? '确认后将新增符合条件的学生并记录审计日志。' : '请先修正问题行或补充“姓名”字段映射后再导入。'}</span>
        <div class="spacer"></div>
        ${ui.button({ label: '取消', size: 'sm', tone: 'secondary', attrs: 'data-act="reset-import"' })}
        ${built.canImport
          ? ui.button({ label: '确认导入', icon: 'check', size: 'sm', tone: 'primary', attrs: 'data-act="confirm-import"' })
          : ui.button({ label: '确认导入（不可用）', size: 'sm', tone: 'secondary', attrs: 'disabled aria-disabled="true"' })}
      </div>
    </section>`;
  }

  function renderImportHistoryTable(state) {
    var rows = (state.imports || []).slice(0, 6);
    return ui.table({
      className: 'is-compact',
      columns: [
        { key: 'at', label: '时间', width: '132px', render: function (row) { return html`<span class="num small">${fmt.datetime(row.at)}</span>`; } },
        { key: 'fileName', label: '文件 / 来源', render: function (row) { return row.fileName || '—'; } },
        { key: 'type', label: '类型', width: '70px', render: function (row) { return row.type === 'csv' ? 'CSV' : (row.type || '—'); } },
        { key: 'rows', label: '行数', align: 'right', width: '70px', render: function (row) { return row.rows + ' 行'; } },
        { key: 'ok', label: '成功', align: 'right', width: '70px', render: function (row) { return (row.ok || 0) + ' 行'; } },
        {
          key: 'status', label: '状态', width: '90px', render: function (row) {
            return ui.badge(row.status || '—', row.status === '已确认' ? 'teal' : 'warn');
          }
        },
        { key: 'note', label: '说明', render: function (row) { return html`<span class="small muted">${row.note || '—'}</span>`; } }
      ],
      rows: rows,
      empty: ui.empty({ compact: true, title: '暂无导入记录', desc: '完成的导入会显示在这里，并同步写入审计日志。' })
    });
  }


  /* ============================================================
     标签页 2：导出与报告
     ============================================================ */
  function renderExportPanel(ctx, state, classId) {
    var exports = [
      {
        key: 'class', icon: 'chart', title: '班级学情报告（CSV）',
        desc: '知识点掌握率、仍需巩固人数、一次正确率、记录数、学生覆盖、主要错误类型、时间变化。文件名带日期。'
      },
      {
        key: 'diagnostics', icon: 'fileText', title: '结构化诊断数据（CSV）',
        desc: '每位学生 × 每个知识点的表现、诊断状态、数据覆盖、错误类型、待复核记录、主要证据、教师复核情况。'
      },
      {
        key: 'answers', icon: 'clipboard', title: '作答记录（CSV）',
        desc: '原始作答、得分、判分状态、提示层级、尝试次数、识别质量、提交时间；用于线下复核与存档。'
      },
      {
        key: 'snapshot', icon: 'database', title: '完整数据快照（JSON）',
        desc: '班级、学生、知识点、材料、题目、任务、作答、复核与审计日志的完整快照；仅用于原型演示与迁移。'
      }
    ];

    var rows = exports.map(function (item) {
      return html`<div class="ana-export-row">
        <span class="ana-export-icon">${ui.icon(item.icon, 18)}</span>
        <div class="ana-export-main">
          <div class="ana-export-title">${item.title}</div>
          <div class="ana-export-desc">${item.desc}</div>
        </div>
        ${ui.button({ label: '导出', icon: 'download', size: 'sm', tone: 'secondary', attrs: 'data-export="' + item.key + '"' })}
      </div>`;
    });

    return html`<div class="stack">
      <div class="ana-screen-only">
        ${ui.banner({
          tone: 'warn',
          icon: 'lock',
          title: '导出权限说明',
          body: '仅限本班教师使用，含学生作答与诊断信息，请勿外传；不含与教学无关的个人信息，文件名自动带日期。'
        })}
      </div>

      <section class="card ana-screen-only">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">导出数据与报告</div>
            <div class="card-desc">四种格式对应不同用途；完成后提示文件与行数。</div>
          </div>
        </div>
        <div class="card-body is-flush">${rows}</div>
        <div class="card-foot">
          ${ui.icon('info', 14)}
          <span class="tiny muted">导出由本地生成文件（浏览器下载），不经过服务器；如浏览器拦截下载，请允许本站点下载后重试。</span>
        </div>
      </section>

      ${renderPrintPreview(state, classId)}
    </div>`;
  }

  function renderPrintPreview(state, classId) {
    var report = sel.classReport(state, classId);
    var overview = report.overview;
    var cls = report.cls;
    var teacher = report.teacher;
    var rangeStart = report.range && report.range.start;
    var rangeEnd = report.range && report.range.end;
    var textbook = state.meta.textbook || {};
    var scopeLabel = chapterRangeLabel(state, classId);

    var kpTable = ui.table({
      className: 'is-compact',
      columns: [
        {
          key: 'kpName', label: '知识点', width: '24%', render: function (row) {
            return html`<div class="cell-strong">${row.kpName}</div><span class="cell-sub">${String(row.chapterName || '').split(' ')[0] || '—'}</span>`;
          }
        },
        { key: 'masteryRate', label: '掌握率', align: 'right', width: '10%', render: function (row) { return row.masteryRate === null ? '—' : Math.round(row.masteryRate * 100) + '%'; } },
        { key: 'weakCount', label: '仍需巩固', align: 'right', width: '9%', render: function (row) { return row.weakCount + ' 人'; } },
        { key: 'accuracy', label: '一次正确率', align: 'right', width: '10%', render: function (row) { return row.accuracy === null ? '—' : Math.round(row.accuracy * 100) + '%'; } },
        { key: 'records', label: '记录数', align: 'right', width: '8%' },
        { key: 'errorTypes', label: '主要错误类型', width: '20%' },
        { key: 'trend', label: '时间变化', width: '19%', render: function (row) { return row.trend ? row.trend.from + '% → ' + row.trend.to + '%' : '数据不足'; } }
      ],
      rows: report.rows
    });

    var errorRows = overview.errorTypes.map(function (item) {
      return html`<span class="tag">${item.label} ×${item.count}（${Math.round(item.ratio * 100)}%）</span>`;
    });

    var materialRows = (report.materials || []).map(function (material) {
      return html`<li>${material.name} · ${material.type} · ${material.version} · ${material.status}${material.note ? '（' + material.note + '）' : ''}</li>`;
    });

    return html`<section class="card ana-print-card">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">班级学情报告（打印预览）</div>
          <div class="card-desc">打印 / 导出 PDF 的内容；展开后核对口径、数据范围与材料来源。</div>
        </div>
        <div class="card-actions">
          ${ui.button({ label: '打印 / 导出 PDF', icon: 'printer', size: 'sm', tone: 'primary', attrs: 'data-act="print"' })}
        </div>
      </div>
      ${ui.disclosure({
        summary: '打印预览与数据范围',
        count: '1 份报告',
        body: html`<div class="ana-print-card-body">
        <div class="print-area ana-print-area">
          <div class="print-head">
            <div>
              <div class="print-title">知微·智学 · 班级学情报告</div>
              <div class="print-meta">
                班级：${cls ? cls.name : '—'} · 任课教师：${teacher ? teacher.name : '—'}<br>
                教学范围：${scopeLabel}（教材版本待教师确认）· 数据范围：${rangeStart ? fmt.date(rangeStart) + ' — ' + fmt.date(rangeEnd) : '—'}<br>
                生成时间：${fmt.datetime(report.generatedAt)} · 全部为虚构模拟数据
              </div>
            </div>
            <div class="print-meta">仅教师可见<br>${textbook.name || '七年级数学'}<br>${textbook.edition || ''}</div>
          </div>

          <div class="ana-print-summary">
            <div class="ana-print-stat"><span>学生数</span><b class="num">${overview.studentCount} 人</b></div>
            <div class="ana-print-stat"><span>作答记录</span><b class="num">${overview.records} 条</b></div>
            <div class="ana-print-stat"><span>可判读记录</span><b class="num">${overview.judged} 条</b></div>
            <div class="ana-print-stat"><span>一次正确率</span><b class="num">${overview.accuracy === null ? '—' : Math.round(overview.accuracy * 100) + '%'}</b></div>
            <div class="ana-print-stat"><span>提示使用率</span><b class="num">${overview.hintRate === null ? '—' : Math.round(overview.hintRate * 100) + '%'}</b></div>
            <div class="ana-print-stat"><span>待复核 / 待确认</span><b class="num">${overview.pendingGrades} 条 / ${overview.pendingDiagnoses} 项</b></div>
          </div>

          <div class="ana-sub-title">一、知识点学情</div>
          ${kpTable}

          <div class="ana-sub-title">二、错误类型分布（仅已判分错误记录）</div>
          <div class="ana-tag-row">${errorRows.length ? errorRows : html`<span class="muted small">暂无可归因错误</span>`}</div>

          <div class="ana-sub-title">三、待复核与数据说明</div>
          <div class="small">
            待复核批阅 ${overview.pendingGrades} 条（过程题或识别质量低，系统未自动定分），待确认诊断 ${overview.pendingDiagnoses} 项；
            这些记录不计为答错，也不计入掌握率与错误类型分布。缺失记录同样不计为答错。掌握率分母为“有可判读记录的学生”。
          </div>

          <div class="ana-sub-title">四、材料来源与教学范围</div>
          <ul class="ana-bullets small">${materialRows.length ? materialRows : html`<li>暂无材料记录。</li>`}</ul>
          <div class="small muted">${report.scopeNote || ''}</div>

          <div class="print-foot">
            口径说明：一次正确率 = 正确答案数 ÷ 可判读记录数；提示使用率 = 有提示记录数 ÷ 全部作答记录数；
            掌握率 = 掌握较稳定/独立/提示后/反复尝试的学生 ÷ 有可判读记录的学生。记录数少于 3 条或覆盖率低于 50% 的知识点结论仅作参考。
            本报告由本地规则引擎从原始作答派生，未接入真实大模型，仅供教学参考，不替代教师判断。
          </div>
        </div>
      </div>` })}
      <div class="card-foot no-print">
        ${ui.icon('printer', 14)}
        <span class="tiny muted">打印会使用浏览器打印对话框，可选择“另存为 PDF”；导出文件名与日期由浏览器下载设置决定。</span>
      </div>
    </section>`;
  }

  /* ============================================================
     标签页 3：材料与知识范围
     ============================================================ */
  function renderMaterialsPanel(ctx, state, classId) {
    var cls = sel.classById(state, classId);
    var scopeIds = (cls && cls.scopeChapterIds) || [];
    var kps = sel.inScopeKps(state, classId);
    var allKps = state.knowledgePoints || [];
    var textbook = state.meta.textbook || {};

    var scopeCard = html`<section class="card">
      <div class="card-head">
        <div class="card-head-main">
          <div class="card-title">教学范围设置</div>
          <div class="card-desc">勾选章节决定纳入正式诊断的知识点；范围外内容仍保留但不作为诊断依据。</div>
        </div>
        <div class="card-actions">
          ${ui.button({ label: '保存教学范围', icon: 'check', size: 'sm', tone: 'primary', attrs: 'data-act="save-scope"' })}
        </div>
      </div>
      <div class="card-body">
        ${ui.banner({
          tone: 'warn',
          title: '教材版本待教师确认',
          body: '当前教材：' + (textbook.name || '七年级数学（上册）') + ' · ' + (textbook.edition || '示例配置 · 教材版本待教师确认') +
            '。章节与知识点归属按示例配置组织，确认版本后可调整。'
        })}
        <div class="ana-scope-grid">
          ${(state.chapters || []).map(function (chapter) {
            var checked = scopeIds.indexOf(chapter.id) >= 0;
            return html`<label class="ana-scope-option ${checked ? 'is-checked' : ''}">
              <input type="checkbox" data-scope-chapter="${chapter.id}" ${checked ? 'checked' : ''}>
              <span class="ana-scope-option-main">
                <span class="ana-scope-option-title">${chapter.name}</span>
                <span class="ana-scope-option-sub">${allKps.filter(function (kp) { return kp.chapterId === chapter.id; }).length} 个知识点</span>
              </span>
            </label>`;
          })}
        </div>
        <div class="ana-scope-summary">
          ${ui.badge('范围内知识点 ' + kps.length + ' 个', 'primary')}
          ${ui.badge('未纳入 ' + (allKps.length - kps.length) + ' 个', 'neutral')}
          <span class="tiny muted">保存后立即影响班级学情分析、个体档案与教学助理的诊断范围。</span>
        </div>
        ${ui.disclosure({
          summary: '范围说明与未纳入知识点',
          count: (allKps.length - kps.length) + ' 个',
          body: html`<div class="tiny muted">
            知识库中单独标记为“未纳入”的知识点（${allKps.length - kps.length} 个：${allKps.filter(function (kp) { return kps.every(function (item) { return item.id !== kp.id; }); }).map(function (kp) { return kp.name; }).join('、') || '无'}），即使勾选其所在章节也不会自动纳入正式诊断，需在知识点配置中确认。
          </div>`
        })}
      </div>
    </section>`;

    var materialTable = ui.table({
      className: 'is-compact',
      columns: [
        {
          key: 'name', label: '名称', render: function (material) {
            return html`<div><span class="cell-strong">${material.name}</span></div>
              <span class="cell-sub">${material.note ? fmt.trunc(material.note, 34) : '—'}</span>`;
          }
        },
        { key: 'type', label: '类型', width: '90px' },
        { key: 'source', label: '来源', width: '130px', render: function (material) { return html`<span class="small muted">${material.source || '—'}</span>`; } },
        { key: 'version', label: '版本', width: '130px', render: function (material) { return html`<span class="small">${material.version || '—'}</span>`; } },
        { key: 'chapterIds', label: '章节', width: '110px', render: function (material) { return chapterShort(state, material.chapterIds); } },
        {
          key: 'usage', label: '用途', width: '120px', render: function (material) {
            return html`${(material.usage || []).map(function (usage) {
              return ui.badge(USAGE_LABEL[usage] || usage, usage === 'diagnosis' ? 'primary' : 'neutral');
            })}`;
          }
        },
        {
          key: 'status', label: '状态', width: '90px', render: function (material) {
            return ui.badge(material.status || '—', MATERIAL_STATUS_TONE[material.status] || 'neutral');
          }
        },
        {
          key: 'ops', label: '操作', width: '120px', render: function (material) {
            var next = material.status === '已确认' ? '待确认' : '已确认';
            return html`${ui.button({ label: next === '已确认' ? '标记已确认' : '标记待确认', size: 'sm', tone: 'ghost', attrs: 'data-mat-id="' + material.id + '" data-mat-status="' + next + '"' })}`;
          }
        }
      ],
      rows: state.materials || [],
      empty: ui.empty({ compact: true, title: '暂无材料记录', desc: '添加教材、课程标准或教师补充材料后，会显示在这里。' })
    });

    return html`<div class="stack">
      ${scopeCard}
      <section class="card">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">材料与知识来源</div>
            <div class="card-desc">材料用于标注知识点范围与来源。</div>
          </div>
          <div class="card-actions">
            ${ui.button({ label: '新增材料', icon: 'plus', size: 'sm', tone: 'primary', attrs: 'data-act="add-material"' })}
          </div>
        </div>
        <div class="card-body is-flush">${materialTable}</div>
        <div class="card-foot">
          ${ui.icon('info', 14)}
          <span class="tiny muted">“待配置 / 待确认”的材料不会被当作已确认的知识来源；教材版本确认后请在此更新状态。</span>
        </div>
      </section>
    </div>`;
  }

  function openMaterialModal(ctx) {
    var state = ctx.state;
    var body = html`<div class="stack">
      ${ui.banner({ tone: 'info', compact: true, body: '新增材料默认为“待确认”状态；保存后会写入审计日志，可在材料表中标记为已确认。' })}
      <div class="form-grid">
        <div class="field">
          <div class="label">材料名称 <span class="req">*</span></div>
          <input class="input" id="mat-name" placeholder="如：七年级数学教材（人教版）" />
        </div>
        <div class="field">
          <div class="label">类型</div>
          <select class="select" id="mat-type">
            <option>教材</option>
            <option>标准文件</option>
            <option>教师补充</option>
            <option>其他</option>
          </select>
        </div>
        <div class="field">
          <div class="label">来源</div>
          <input class="input" id="mat-source" placeholder="如：教师上传（模拟）" />
        </div>
        <div class="field">
          <div class="label">版本</div>
          <input class="input" id="mat-version" placeholder="如：v1 / 待确认" />
        </div>
      </div>
      <div class="field">
        <div class="label">适用章节</div>
        <div class="ana-check-row">
          ${(state.chapters || []).map(function (chapter) {
            return html`<label class="check"><input type="checkbox" data-mat-chapter="${chapter.id}" ${chapter.id === 'ch1' ? 'checked' : ''}>${chapter.name}</label>`;
          })}
        </div>
      </div>
      <div class="field">
        <div class="label">用途</div>
        <div class="ana-check-row">
          ${['diagnosis', 'student', 'teacher'].map(function (usage) {
            return html`<label class="check"><input type="checkbox" data-mat-usage="${usage}" ${usage === 'diagnosis' ? 'checked' : ''}>${USAGE_LABEL[usage]}</label>`;
          })}
        </div>
      </div>
      <div class="field">
        <div class="label">说明</div>
        <textarea class="textarea" id="mat-note" placeholder="材料用途、版本确认说明等（可选）"></textarea>
      </div>
    </div>`;

    var ctl = ui.modal({
      title: '新增教学材料',
      desc: '材料用于知识范围与来源标注，不会自动改变教学范围',
      size: 'lg',
      body: body.value,
      footer: '<div class="spacer"></div>' +
        '<button type="button" class="btn btn-secondary" data-close>取消</button>' +
        '<button type="button" class="btn btn-primary" data-act="save-material">保存材料</button>',
      onMount: function (bodyEl, control) {
        var saveBtn = control.el.querySelector('[data-act="save-material"]');
        if (!saveBtn) return;
        saveBtn.addEventListener('click', function () {
          var nameEl = bodyEl.querySelector('#mat-name');
          var name = nameEl ? String(nameEl.value || '').trim() : '';
          if (!name) {
            ui.toast('请填写材料名称后再保存', 'warn');
            if (nameEl) nameEl.focus();
            return;
          }
          var chapterIds = [];
          bodyEl.querySelectorAll('[data-mat-chapter]').forEach(function (input) {
            if (input.checked) chapterIds.push(input.getAttribute('data-mat-chapter'));
          });
          var usage = [];
          bodyEl.querySelectorAll('[data-mat-usage]').forEach(function (input) {
            if (input.checked) usage.push(input.getAttribute('data-mat-usage'));
          });
          ZWZ.store.actions.addMaterial({
            name: name,
            type: bodyEl.querySelector('#mat-type').value,
            source: String(bodyEl.querySelector('#mat-source').value || '').trim() || '教师上传（模拟）',
            version: String(bodyEl.querySelector('#mat-version').value || '').trim() || '待确认',
            chapterIds: chapterIds,
            usage: usage.length ? usage : ['teacher'],
            status: '待确认',
            note: String(bodyEl.querySelector('#mat-note').value || '').trim()
          });
          ctl.close();
          ui.toast('已添加材料「' + name + '」，状态为待确认', 'success');
          ctx.refresh();
        });
      }
    });
    return ctl;
  }

  /* ============================================================
     标签页 4：审计日志
     ============================================================ */
  function renderAuditPanel(ctx, state, classId) {
    var logs = (state.auditLogs || []).slice(0, 60);
    var logTable = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'at', label: '时间', width: '140px', render: function (row) { return html`<span class="num small">${fmt.datetime(row.at)}</span>`; } },
        { key: 'role', label: '角色', width: '70px', render: function (row) { return ui.badge(ROLE_LABEL[row.role] || row.role || '—', row.role === 'teacher' ? 'primary' : 'neutral'); } },
        { key: 'action', label: '操作', width: '180px', render: function (row) { return html`<span class="cell-strong">${row.action || '—'}</span>`; } },
        {
          key: 'target', label: '对象', width: '110px', render: function (row) {
            return html`<span class="small">${TARGET_LABEL[row.targetType] || row.targetType || '—'}</span>`;
          }
        },
        { key: 'detail', label: '详情', render: function (row) { return html`<span class="small muted">${fmt.trunc(row.detail || '—', 70)}</span>`; } }
      ],
      rows: logs,
      empty: ui.empty({ compact: true, icon: 'clipboard', title: '暂无审计日志', desc: '导入、复核、范围调整等操作会自动记录在这里。' })
    });

    var importRows = (state.imports || []).slice(0, 20);
    var importTable = ui.table({
      className: 'is-compact',
      columns: [
        { key: 'at', label: '时间', width: '140px', render: function (row) { return html`<span class="num small">${fmt.datetime(row.at)}</span>`; } },
        { key: 'fileName', label: '文件 / 来源', render: function (row) { return row.fileName || '—'; } },
        { key: 'type', label: '类型', width: '64px', render: function (row) { return row.type === 'csv' ? 'CSV' : (row.type || '—'); } },
        { key: 'rows', label: '行数', align: 'right', width: '64px' },
        { key: 'ok', label: '成功', align: 'right', width: '64px' },
        { key: 'status', label: '状态', width: '86px', render: function (row) { return ui.badge(row.status || '—', row.status === '已确认' ? 'teal' : 'warn'); } },
        {
          key: 'fieldMap', label: '字段映射', width: '180px', render: function (row) {
            var map = row.fieldMap || {};
            var text = Object.keys(map).map(function (key) { return key + '→' + map[key]; }).join('、');
            return html`<span class="tiny muted">${text ? fmt.trunc(text, 60) : '—'}</span>`;
          }
        }
      ],
      rows: importRows,
      empty: ui.empty({ compact: true, title: '暂无导入记录', desc: 'CSV 导入完成后会记录在这里。' })
    });

    var statusCounts = { auto: 0, suggested: 0, unjudged: 0, reviewed: 0 };
    (state.answers || []).forEach(function (a) {
      if (statusCounts[a.gradeStatus] === undefined) statusCounts[a.gradeStatus] = 0;
      statusCounts[a.gradeStatus]++;
    });
    var noRecordStudents = sel.classStudents(state, classId).filter(function (st) {
      return !(state.answers || []).some(function (a) { return a.studentId === st.id; });
    }).length;

    return html`<div class="stack">
      <section class="card">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">判分状态</div>
          </div>
        </div>
        <div class="card-body">
          <div class="ana-cov-grid">
            <div class="ana-cov"><div class="ana-cov-label">自动判分</div><div class="ana-cov-value num">${statusCounts.auto}</div><div class="ana-cov-sub">客观题自动判分</div></div>
            <div class="ana-cov"><div class="ana-cov-label">建议复核</div><div class="ana-cov-value num warn-text">${statusCounts.suggested}</div><div class="ana-cov-sub">过程题需教师复核给分</div></div>
            <div class="ana-cov"><div class="ana-cov-label">暂无法判阅</div><div class="ana-cov-value num">${statusCounts.unjudged}</div><div class="ana-cov-sub">识别质量低或空白，需人工核对</div></div>
            <div class="ana-cov"><div class="ana-cov-label">无记录学生</div><div class="ana-cov-value num">${noRecordStudents}</div><div class="ana-cov-sub">缺失记录不计为答错</div></div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div class="card-head-main">
            <div class="card-title">审计日志</div>
            <div class="card-desc">最近 ${logs.length} 条操作记录</div>
          </div>
        </div>
        <div class="card-body is-flush">${logTable}</div>
      </section>

      ${ui.disclosure({
        summary: '导入记录',
        count: importRows.length + ' 条',
        body: html`<div class="stack-sm">
          <div class="card-body is-flush">${importTable}</div>
          <div class="tiny muted">含行数、成功数、状态与字段映射；完整操作记录见上方审计日志。</div>
        </div>`
      })}
    </div>`;
  }

  /* ---------------- 事件：导入流程 ---------------- */
  function currentImportText() {
    return PASTE_TEXT;
  }

  function applyParsedText(ctx, text, fileName) {
    var parsed;
    try {
      parsed = io.parseCSV(text);
    } catch (err) {
      IMPORT_ERROR = 'CSV 解析异常：' + (err && err.message ? err.message : '未知错误') + '。';
      ctx.refresh();
      return;
    }
    if (!parsed.headers.length || !parsed.rows.length) {
      IMPORT_ERROR = '未解析到有效数据（共 ' + parsed.headers.length + ' 个字段、' + parsed.rows.length + ' 行）。';
      ctx.refresh();
      return;
    }
    var mapping = io.guessMapping(parsed.headers);
    var built = io.buildLearnerImport(ZWZ.store.state, {
      headers: parsed.headers,
      rows: parsed.rows,
      mapping: mapping
    });
    IMPORT = {
      fileName: fileName || '粘贴内容.csv',
      headers: parsed.headers,
      rows: parsed.rows,
      mapping: mapping,
      built: built
    };
    IMPORT_ERROR = '';
    IMPORT_RESULT = null;
    ctx.refresh();
    ui.toast('已解析 ' + parsed.rows.length + ' 行，请检查字段映射与质量检查结果', 'info');
  }

  function handleFile(ctx, file) {
    if (!file) return;
    var name = file.name || '上传文件.csv';
    if (!/\.(csv|txt)$/i.test(name)) {
      ui.toast('仅支持 CSV / TXT 文本文件（当前：' + name + '）', 'warn');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      ui.toast('文件超过 2MB，请拆分后再导入', 'warn');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () { applyParsedText(ctx, String(reader.result || ''), name); };
    reader.onerror = function () {
      IMPORT_ERROR = '读取文件失败（' + name + '），请检查文件权限或重新选择。';
      ctx.refresh();
    };
    reader.readAsText(file, 'UTF-8');
  }

  /* ---------------- 页面注册 ---------------- */
  ZWZ.pages.register('teacher/data', {
    title: '数据与报告',
    subtitle: '教师端 · 数据管理与导出',
    render: function (ctx) {
      var state = ctx.state;
      var classId = classIdOf(ctx);
      initTab(ctx);

      var classStudents = sel.classStudents(state, classId).length;
      var answerCount = (state.answers || []).length;
      var questionCount = (state.questions || []).length;
      var taskCount = (state.tasks || []).length;
      var dataStatus = html`<div class="ana-data-status">
        ${ui.icon('database', 14)}
        <span>当前数据：学生 <b class="num">${classStudents}</b> 名 · 作答 <b class="num">${answerCount}</b> 条 · 题目 <b class="num">${questionCount}</b> 道 · 任务 <b class="num">${taskCount}</b> 个</span>
      </div>`;

      var panel = TAB === 'export'
        ? renderExportPanel(ctx, state, classId)
        : TAB === 'materials'
          ? renderMaterialsPanel(ctx, state, classId)
          : TAB === 'audit'
            ? renderAuditPanel(ctx, state, classId)
            : renderImportPanel(ctx, state, classId);

      return html`<div class="page ana-data">
        <div class="page-head">
          <div class="page-head-main">
            <div class="page-title">数据与报告</div>
            <div class="page-desc">导入学情数据、导出报告、维护教学范围与材料；导出仅本班教师可见。</div>
          </div>
          <div class="page-actions">
            ${ui.button({ label: '下载导入模板', icon: 'download', tone: 'secondary', attrs: 'data-act="template"' })}
            ${ui.button({ label: '导出数据快照', icon: 'database', tone: 'primary', attrs: 'data-export="snapshot"' })}
          </div>
        </div>

        ${dataStatus}

        ${ui.tabs({
          name: 'data',
          active: TAB,
          items: [
            { key: 'import', label: '数据导入', badge: (state.imports || []).length ? String((state.imports || []).length) : '' },
            { key: 'export', label: '导出与报告' },
            { key: 'materials', label: '材料与知识范围', badge: String((state.materials || []).length) },
            { key: 'audit', label: '审计日志', badge: String((state.auditLogs || []).length) }
          ]
        })}

        <div class="ana-tab-panel">${panel}</div>
      </div>`;
    },
    mount: function (root, ctx) {
      var state = ctx.state;
      var classId = classIdOf(ctx);

      ui.bindTabs(root, 'data', function (key) {
        if (TABS.indexOf(key) < 0) return;
        TAB = key;
        ctx.refresh();
      });

      /* 文件选择 / 拖拽 */
      var fileInput = root.querySelector('#ana-file');
      if (fileInput) {
        fileInput.addEventListener('change', function () {
          handleFile(ctx, fileInput.files && fileInput.files[0]);
          fileInput.value = '';
        });
      }
      var drop = root.querySelector('#ana-drop');
      if (drop) {
        ['dragenter', 'dragover'].forEach(function (type) {
          drop.addEventListener(type, function (ev) {
            ev.preventDefault();
            drop.classList.add('is-over');
          });
        });
        ['dragleave', 'drop'].forEach(function (type) {
          drop.addEventListener(type, function (ev) {
            ev.preventDefault();
            drop.classList.remove('is-over');
          });
        });
        drop.addEventListener('drop', function (ev) {
          var files = ev.dataTransfer && ev.dataTransfer.files;
          if (files && files.length) handleFile(ctx, files[0]);
        });
      }

      /* 粘贴文本 */
      var paste = root.querySelector('#ana-paste');
      if (paste) {
        PASTE_TEXT = paste.value || '';
        paste.addEventListener('input', function () { PASTE_TEXT = paste.value; });
      }
      ui.bind(root, '[data-act="parse-paste"]', 'click', function () {
        var text = currentImportText();
        if (!String(text || '').trim()) {
          ui.toast('请先粘贴 CSV 文本后再解析', 'warn');
          return;
        }
        applyParsedText(ctx, text, '粘贴内容_' + io.today() + '.csv');
      });

      /* 重新选择 / 取消导入 */
      ui.bind(root, '[data-act="reset-import"]', 'click', function () {
        IMPORT = null;
        IMPORT_ERROR = '';
        PASTE_TEXT = '';
        ctx.refresh();
      });

      /* 字段映射变更 */
      root.querySelectorAll('[data-map]').forEach(function (select) {
        select.addEventListener('change', function () {
          if (!IMPORT) return;
          var field = select.getAttribute('data-map');
          var value = select.value;
          if (value) IMPORT.mapping[field] = value;
          else delete IMPORT.mapping[field];
          IMPORT.built = io.buildLearnerImport(ZWZ.store.state, {
            headers: IMPORT.headers,
            rows: IMPORT.rows,
            mapping: IMPORT.mapping
          });
          ctx.refresh();
        });
      });

      /* 确认导入 */
      var confirmBtn = root.querySelector('[data-act="confirm-import"]');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
          if (!IMPORT || !IMPORT.built.canImport) {
            ui.toast('当前数据未通过质量检查，暂不能导入', 'warn');
            return;
          }
          var built = IMPORT.built;
          var total = built.preview.length;
          var fileName = IMPORT.fileName;
          var res = ZWZ.store.actions.importLearners({
            fileName: fileName,
            preview: built.preview,
            mapping: built.mapping
          });
          IMPORT = null;
          PASTE_TEXT = '';
          IMPORT_ERROR = '';
          IMPORT_RESULT = { fileName: fileName, total: total, added: res ? res.added : 0 };
          ui.toast(
            res && res.added > 0
              ? '导入完成：新增学生 ' + res.added + ' 名'
              : '导入完成：未新增学生（姓名均已存在或缺少姓名）',
            res && res.added > 0 ? 'success' : 'warn'
          );
          ctx.refresh();
        });
      }

      /* 下载模板 */
      ui.bind(root, '[data-act="template"]', 'click', function () {
        io.learnerTemplateCSV(state);
      });

      /* 导出 */
      ui.bind(root, '[data-export]', 'click', function (ev, el) {
        var kind = el.getAttribute('data-export');
        try {
          if (kind === 'class') io.exportClassReport(ZWZ.store.state, classId);
          else if (kind === 'diagnostics') io.exportDiagnosticsCSV(ZWZ.store.state, classId);
          else if (kind === 'answers') io.exportAnswersCSV(ZWZ.store.state, classId);
          else if (kind === 'snapshot') io.exportFullSnapshot(ZWZ.store.state);
        } catch (err) {
          ui.toast('导出失败：' + (err && err.message ? err.message : '未知错误'), 'error');
        }
      });

      /* 打印 */
      ui.bind(root, '[data-act="print"]', 'click', function () {
        io.printView('班级学情报告');
      });

      /* 教学范围保存 */
      var saveScopeBtn = root.querySelector('[data-act="save-scope"]');
      if (saveScopeBtn) {
        saveScopeBtn.addEventListener('click', function () {
          var ids = [];
          root.querySelectorAll('[data-scope-chapter]').forEach(function (input) {
            if (input.checked) ids.push(input.getAttribute('data-scope-chapter'));
          });
          if (!ids.length) {
            ui.toast('请至少保留一个章节，否则诊断范围为空', 'warn');
            return;
          }
          ZWZ.store.actions.setClassScope(classId, ids);
          var kps = sel.inScopeKps(ZWZ.store.state, classId);
          ui.toast('教学范围已保存：' + ids.length + ' 个章节，范围内知识点 ' + kps.length + ' 个（将影响诊断范围）', 'success');
          ctx.refresh();
        });
      }

      /* 材料状态 */
      ui.bind(root, '[data-mat-id]', 'click', function (ev, el) {
        var id = el.getAttribute('data-mat-id');
        var status = el.getAttribute('data-mat-status');
        ZWZ.store.actions.updateMaterial(id, { status: status });
        ui.toast('材料状态已更新为「' + status + '」', 'success');
        ctx.refresh();
      });

      /* 新增材料 */
      var addBtn = root.querySelector('[data-act="add-material"]');
      if (addBtn) {
        addBtn.addEventListener('click', function () { openMaterialModal(ctx); });
      }
    }
  });
})();


