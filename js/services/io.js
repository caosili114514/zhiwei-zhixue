/* ============================================================
   知微·智学 · 导入导出服务（CSV / JSON / 打印）
   ------------------------------------------------------------
   约束：
   - 结构化数据优先 CSV / JSON；
   - 导入有字段映射、预览、质量检查与确认；
   - 导出受角色权限控制，学生只导出本人数据；
   - 文件名含日期，成功/失败均有反馈。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var fmt = ZWZ.fmt;
  var sel = ZWZ.sel;

  /* ui 在 io 之后加载，必须延迟取用 */
  function notify(message, tone) {
    if (ZWZ.ui && ZWZ.ui.toast) ZWZ.ui.toast(message, tone);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  /* ---------------- CSV ---------------- */
  function parseCSV(text) {
    var src = String(text || '').replace(/^\uFEFF/, '');
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\r') {
        // ignore
      } else {
        field += ch;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    rows = rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
    if (!rows.length) return { headers: [], rows: [] };
    var headers = rows.shift().map(function (h) { return String(h).trim(); });
    return {
      headers: headers,
      rows: rows.map(function (r) {
        var obj = {};
        headers.forEach(function (h, idx) { obj[h] = r[idx] === undefined ? '' : String(r[idx]).trim(); });
        return obj;
      })
    };
  }

  function csvEscape(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(headers, rows) {
    var lines = [];
    lines.push(headers.map(function (h) { return csvEscape(h.label || h.key); }).join(','));
    rows.forEach(function (row) {
      lines.push(headers.map(function (h) {
        var v = typeof h.value === 'function' ? h.value(row) : row[h.key];
        return csvEscape(v);
      }).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  function download(filename, content, mime) {
    try {
      var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 800);
      return true;
    } catch (err) {
      notify('导出失败：' + err.message + '，请检查浏览器下载权限。', 'error');
      return false;
    }
  }

  function exportCSV(filename, headers, rows) {
    var name = filename.indexOf('.csv') < 0 ? filename + '.csv' : filename;
    var ok = download(name, toCSV(headers, rows), 'text/csv;charset=utf-8');
    if (ok) notify('已导出 ' + name + '（' + rows.length + ' 行）', 'success');
    return ok;
  }

  function exportJSON(filename, obj) {
    var name = filename.indexOf('.json') < 0 ? filename + '.json' : filename;
    var ok = download(name, JSON.stringify(obj, null, 2), 'application/json;charset=utf-8');
    if (ok) notify('已导出 ' + name, 'success');
    return ok;
  }

  function printView(title) {
    if (!document.querySelector('.print-area')) {
      notify('当前页面没有可打印的报告区域', 'warn');
      return false;
    }
    setTimeout(function () {
      window.print();
    }, 120);
    notify('已打开打印预览' + (title ? '：' + title : ''), 'info');
    return true;
  }

  /* ---------------- 学生端导出（仅本人数据） ---------------- */
  function exportStudentReport(state, studentId) {
    var report = sel.studentReport(state, studentId);
    var headers = [
      { key: 'kpName', label: '知识点' },
      { key: 'chapterName', label: '章节' },
      { key: 'performance', label: '表现' },
      { key: 'status', label: '诊断状态' },
      { key: 'records', label: '相关记录数' },
      { key: 'judged', label: '可判读记录数' },
      { key: 'coverage', label: '数据覆盖' },
      { key: 'errorTypes', label: '错误类型' },
      { key: 'suggestion', label: '建议' },
      { key: 'reviewed', label: '教师是否复核' },
      { key: 'teacherNote', label: '教师备注' }
    ];
    var rows = report.rows.map(function (r) {
      return Object.assign({}, r, { reviewed: r.reviewed ? '已复核' : '未复核' });
    });
    var filename = '知微智学_个人学情报告_' + report.student.name + '_' + today() + '.csv';
    return exportCSV(filename, headers, rows);
  }

  function exportStudentJSON(state, studentId) {
    var report = sel.studentReport(state, studentId);
    var payload = {
      meta: {
        app: state.meta.appName,
        version: state.meta.version,
        exportedAt: new Date().toISOString(),
        dataRange: report.range,
        demoNotice: state.meta.demoNotice
      },
      student: { id: report.student.id, name: report.student.name, class: (report.cls || {}).name },
      stats: report.stats,
      knowledgePoints: report.rows,
      trend: report.trend,
      scopeNote: report.scopeNote,
      sourceNote: report.sourceNote
    };
    return exportJSON('知微智学_个人学情报告_' + report.student.name + '_' + today() + '.json', payload);
  }

  /* ---------------- 教师端导出 ---------------- */
  function exportClassReport(state, classId) {
    var report = sel.classReport(state, classId);
    var headers = [
      { key: 'kpName', label: '知识点' },
      { key: 'chapterName', label: '章节' },
      { key: 'masteryRate', label: '掌握学生占比', value: function (r) { return r.masteryRate === null ? '—' : Math.round(r.masteryRate * 100) + '%'; } },
      { key: 'weakCount', label: '仍需巩固人数' },
      { key: 'accuracy', label: '一次正确率', value: function (r) { return r.accuracy === null ? '—' : Math.round(r.accuracy * 100) + '%'; } },
      { key: 'records', label: '记录数' },
      { key: 'coverage', label: '学生覆盖率', value: function (r) { return Math.round(r.coverage * 100) + '%'; } },
      { key: 'errorTypes', label: '主要错误类型' },
      { key: 'trend', label: '时间变化', value: function (r) { return r.trend ? r.trend.from + '% → ' + r.trend.to + '%' : '数据不足'; } }
    ];
    var filename = '知微智学_班级学情报告_' + (report.cls || {}).name + '_' + today() + '.csv';
    return exportCSV(filename, headers, report.rows);
  }

  function exportDiagnosticsCSV(state, classId) {
    var students = sel.classStudents(state, classId);
    var headers = [
      { key: 'student', label: '学生' },
      { key: 'kp', label: '知识点' },
      { key: 'chapter', label: '章节' },
      { key: 'performance', label: '表现' },
      { key: 'status', label: '诊断状态' },
      { key: 'scope', label: '适用范围' },
      { key: 'records', label: '记录数' },
      { key: 'judged', label: '可判读' },
      { key: 'coverage', label: '数据覆盖' },
      { key: 'errorTypes', label: '错误类型' },
      { key: 'pending', label: '待复核记录' },
      { key: 'evidence', label: '主要证据' },
      { key: 'reviewed', label: '教师复核' },
      { key: 'updatedAt', label: '最近更新时间', value: function (r) { return r.updatedAt ? fmt.datetime(r.updatedAt) : '—'; } }
    ];
    var rows = [];
    students.forEach(function (st) {
      sel.diagnostics(state, { studentId: st.id, scopeOnly: true }).forEach(function (d) {
        rows.push({
          student: st.name,
          kp: d.kpName,
          chapter: d.chapterName,
          performance: d.performanceLabel,
          status: d.statusLabel,
          scope: d.scope === 'in-scope' ? '当前教学范围' : '拓展内容',
          records: d.evidence.records,
          judged: d.evidence.judged,
          coverage: d.evidence.coverageText,
          errorTypes: d.errorTypes.map(function (e) { return e.label; }).join('、') || '—',
          pending: d.evidence.pending,
          evidence: d.evidence.quotes.slice(0, 2).join('；') || '—',
          reviewed: d.reviewed ? '已复核' : '未复核',
          updatedAt: d.updatedAt
        });
      });
    });
    return exportCSV('知微智学_结构化诊断数据_' + today() + '.csv', headers, rows);
  }

  function exportAnswersCSV(state, classId) {
    var students = sel.classStudents(state, classId);
    var nameById = {};
    students.forEach(function (s) { nameById[s.id] = s.name; });
    var rows = (state.answers || [])
      .filter(function (a) { return nameById[a.studentId]; })
      .map(function (a) {
        var q = sel.question(state, a.questionId);
        var t = sel.task(state, a.taskId);
        return {
          student: nameById[a.studentId],
          task: t ? t.title : a.taskId,
          question: q ? q.code : a.questionId,
          type: q ? (q.type) : '',
          stem: q ? q.stem : '',
          answer: a.rawAnswer,
          score: a.score === null || a.score === undefined ? '' : a.score,
          maxScore: a.maxScore,
          gradeStatus: a.gradeStatus,
          hintLevels: (a.hintLevels || []).join('/'),
          attempts: a.attempts,
          recognition: a.recognition,
          submittedAt: fmt.datetime(a.submittedAt)
        };
      });
    var headers = [
      { key: 'student', label: '学生' },
      { key: 'task', label: '任务' },
      { key: 'question', label: '题号' },
      { key: 'type', label: '题型' },
      { key: 'stem', label: '题干' },
      { key: 'answer', label: '作答' },
      { key: 'score', label: '得分' },
      { key: 'maxScore', label: '满分' },
      { key: 'gradeStatus', label: '判分状态' },
      { key: 'hintLevels', label: '提示层级' },
      { key: 'attempts', label: '尝试次数' },
      { key: 'recognition', label: '识别质量' },
      { key: 'submittedAt', label: '提交时间' }
    ];
    return exportCSV('知微智学_作答记录_' + today() + '.csv', headers, rows);
  }

  function exportFullSnapshot(state) {
    var payload = {
      meta: {
        app: state.meta.appName,
        version: state.meta.version,
        exportedAt: new Date().toISOString(),
        demoNotice: state.meta.demoNotice
      },
      classes: state.classes,
      users: state.users,
      knowledgePoints: state.knowledgePoints,
      materials: state.materials,
      questions: state.questions,
      papers: state.papers,
      tasks: state.tasks,
      answers: state.answers,
      reviews: state.reviews,
      diagnosisReviews: state.diagnosisReviews,
      auditLogs: state.auditLogs
    };
    return exportJSON('知微智学_数据快照_' + today() + '.json', payload);
  }

  /* ---------------- 导入：学情 CSV ---------------- */
  var LEARNER_FIELDS = [
    { key: 'name', label: '姓名', required: true },
    { key: 'seatNo', label: '学号', required: false },
    { key: 'classId', label: '班级', required: false },
    { key: 'kp', label: '知识点', required: false },
    { key: 'answer', label: '作答/表现', required: false },
    { key: 'note', label: '备注', required: false }
  ];

  function guessMapping(headers) {
    var mapping = {};
    var alias = {
      name: ['姓名', '学生姓名', 'name', '学生'],
      seatNo: ['学号', '座号', 'seat', 'seatNo', '编号'],
      classId: ['班级', '班', 'class', 'classId'],
      kp: ['知识点', '考点', 'kp', '知识点名称'],
      answer: ['作答', '答案', '表现', '得分', 'answer', 'score'],
      note: ['备注', '说明', 'note']
    };
    headers.forEach(function (h) {
      Object.keys(alias).forEach(function (key) {
        if (mapping[key]) return;
        if (alias[key].some(function (a) { return String(h).toLowerCase() === String(a).toLowerCase(); })) {
          mapping[key] = h;
        }
      });
    });
    return mapping;
  }

  function buildLearnerImport(state, input) {
    var headers = input.headers || [];
    var rows = input.rows || [];
    var mapping = input.mapping || guessMapping(headers);
    var existing = {};
    (state.users || []).forEach(function (u) { if (u.role === 'student') existing[u.name] = u; });
    var knownClasses = (state.classes || []).map(function (c) { return c.name; });

    var seen = {};
    var preview = rows.map(function (row, idx) {
      var name = mapping.name ? String(row[mapping.name] || '').trim() : '';
      var issues = [];
      if (!name) issues.push('缺少姓名');
      if (name && seen[name]) issues.push('文件内姓名重复');
      if (name) seen[name] = true;
      if (name && !existing[name]) issues.push('系统中暂无该学生，将按“待确认”处理');
      var classVal = mapping.classId ? String(row[mapping.classId] || '').trim() : '';
      if (classVal && knownClasses.indexOf(classVal) < 0) issues.push('班级「' + classVal + '」不在现有班级中');
      var kpName = mapping.kp ? String(row[mapping.kp] || '').trim() : '';
      if (kpName) {
        var kpExists = (state.knowledgePoints || []).some(function (kp) { return kp.name === kpName; });
        if (!kpExists) issues.push('知识点「' + kpName + '」未在知识库中匹配');
      }
      return {
        index: idx + 1,
        name: name,
        seatNo: mapping.seatNo ? String(row[mapping.seatNo] || '').trim() : '',
        classId: classVal,
        kp: kpName,
        answer: mapping.answer ? String(row[mapping.answer] || '').trim() : '',
        note: mapping.note ? String(row[mapping.note] || '').trim() : '',
        issues: issues,
        ok: issues.filter(function (i) { return i.indexOf('待确认') < 0; }).length === 0
      };
    });

    var issues = [];
    if (!mapping.name) issues.push('未映射“姓名”字段，无法导入。');
    var bad = preview.filter(function (p) { return !p.ok; }).length;
    if (bad) issues.push('共 ' + bad + ' 行存在问题，请修正或确认后再导入。');

    return {
      mapping: mapping,
      headers: headers,
      preview: preview,
      issues: issues,
      canImport: !!mapping.name && bad === 0 && preview.length > 0,
      total: preview.length,
      valid: preview.length - bad,
      fields: LEARNER_FIELDS
    };
  }

  function learnerTemplateCSV(state) {
    var headers = [
      { key: 'name', label: '姓名' },
      { key: 'seatNo', label: '学号' },
      { key: 'classId', label: '班级' },
      { key: 'kp', label: '知识点' },
      { key: 'answer', label: '作答/表现' },
      { key: 'note', label: '备注' }
    ];
    var rows = [
      { name: '示例学生', seatNo: '01', classId: '七年级(3)班', kp: '有理数的加减运算', answer: '独立完成', note: '演示行，可删除' }
    ];
    return exportCSV('知微智学_学情导入模板_' + today() + '.csv', headers, rows);
  }

  ZWZ.io = {
    parseCSV: parseCSV,
    toCSV: toCSV,
    download: download,
    exportCSV: exportCSV,
    exportJSON: exportJSON,
    printView: printView,
    exportStudentReport: exportStudentReport,
    exportStudentJSON: exportStudentJSON,
    exportClassReport: exportClassReport,
    exportDiagnosticsCSV: exportDiagnosticsCSV,
    exportAnswersCSV: exportAnswersCSV,
    exportFullSnapshot: exportFullSnapshot,
    guessMapping: guessMapping,
    buildLearnerImport: buildLearnerImport,
    learnerTemplateCSV: learnerTemplateCSV,
    LEARNER_FIELDS: LEARNER_FIELDS,
    today: today
  };
})();
