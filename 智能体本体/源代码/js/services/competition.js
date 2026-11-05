/* ============================================================
   知微·智学 · 赛题成果服务（Task 1/2/3、数据质量、案例、成果包）
   ------------------------------------------------------------
   - 纯读取 state；不修改任何数据
   - 统计口径显式排除：未作答、待评分、已标记异常
   - 所有结论可回溯到 recordId / questionId / indicatorId / materialId
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var sel = ZWZ.sel;
  var diagnosis = ZWZ.diagnosis;

  function pct(v) { return v === null || v === undefined ? '—' : Math.round(v * 100) + '%'; }
  function rate(score, max) { return max ? score / max : null; }
  function safe(n) { return Number(n) || 0; }

  function classStudents(state, classId) {
    return (state.users || []).filter(function (u) { return u.role === 'student' && u.classId === classId; });
  }
  function student(state, id) {
    return (state.users || []).filter(function (u) { return u.id === id; })[0] || null;
  }
  function answersOf(state, filter) {
    var f = filter || {};
    return (state.answers || []).filter(function (a) {
      if (f.studentId && a.studentId !== f.studentId) return false;
      if (f.classId && student(state, a.studentId) && student(state, a.studentId).classId !== f.classId) return false;
      if (f.nodeId && a.nodeId !== f.nodeId) return false;
      return true;
    });
  }
  function question(state, id) {
    return (state.questions || []).filter(function (q) { return q.id === id; })[0] || null;
  }
  function indicator(state, id) {
    return (state.knowledgePoints || []).filter(function (k) { return k.id === id; })[0] || null;
  }
  function diagMap(state, filter) {
    var rows = sel.diagnostics(state, filter || {});
    var map = {};
    rows.forEach(function (d) { map[d.kpId] = d; });
    return map;
  }

  function indicatorStats(state, filter) {
    var f = filter || {};
    var answers = answersOf(state, f);
    var diags = diagMap(state, f.studentId ? { studentId: f.studentId } : { classId: f.classId });
    return (state.knowledgePoints || []).map(function (kp) {
      var recs = answers.filter(function (a) {
        var q = question(state, a.questionId);
        return q && (q.indicatorId === kp.id || (q.kpIds || []).indexOf(kp.id) >= 0);
      });
      var judged = recs.filter(function (a) { return a.score !== null && a.score !== undefined && !a.excludeFromStats; });
      var pending = recs.filter(function (a) { return a.attemptStatus === 'pending'; });
      var absent = recs.filter(function (a) { return a.attemptStatus === 'unanswered'; });
      var excluded = recs.filter(function (a) { return a.excludeFromStats; });
      var sum = judged.reduce(function (n, a) { return n + safe(a.score); }, 0);
      var max = judged.reduce(function (n, a) { return n + safe(a.maxScore); }, 0);
      var full = judged.filter(function (a) { return safe(a.score) >= safe(a.maxScore); }).length;
      var partial = judged.filter(function (a) { var s = safe(a.score), m = safe(a.maxScore); return s > 0 && s < m; }).length;
      var d = diags[kp.id] || null;
      return {
        indicatorId: kp.id, indicatorName: kp.name, themeId: kp.themeId || kp.chapterId,
        themeName: kp.chapterName, standardRef: kp.standardRef || '', standardPages: kp.standardPages || '',
        textbookPages: kp.textbookPages || '',
        records: recs.length, judged: judged.length, pending: pending.length, unanswered: absent.length,
        excluded: excluded.length, fullMarks: full, partialMarks: partial,
        scoreRate: max ? sum / max : null, fullRate: judged.length ? full / judged.length : null,
        partialRate: judged.length ? partial / judged.length : null,
        status: d ? d.status : 'undetermined', statusLabel: d ? d.statusLabel : '暂无法判断',
        performance: d ? d.performance : 'insufficient', performanceLabel: d ? d.performanceLabel : '记录不足',
        evidenceIds: judged.slice(0, 5).map(function (a) { return a.recordId || a.id; }),
        answerIds: recs.map(function (a) { return a.id; })
      };
    });
  }

  function themeStats(state, filter) {
    var rows = indicatorStats(state, filter);
    return (state.themes || state.chapters || []).map(function (t) {
      var list = rows.filter(function (r) { return r.themeId === t.id; });
      var judged = list.reduce(function (n, r) { return n + r.judged; }, 0);
      var records = list.reduce(function (n, r) { return n + r.records; }, 0);
      var sumRate = list.filter(function (r) { return r.scoreRate !== null; });
      return {
        themeId: t.id, themeName: t.name, goal: t.goal, standardRef: t.standardRef,
        standardPages: t.standardPages, textbookPages: t.textbookPages,
        indicators: list, records: records, judged: judged,
        scoreRate: sumRate.length ? sumRate.reduce(function (n, r) { return n + r.scoreRate; }, 0) / sumRate.length : null,
        pending: list.reduce(function (n, r) { return n + r.pending; }, 0),
        unanswered: list.reduce(function (n, r) { return n + r.unanswered; }, 0)
      };
    });
  }

  function classSummary(state, classId) {
    var students = classStudents(state, classId);
    var answers = answersOf(state, { classId: classId });
    var judged = answers.filter(function (a) { return a.score !== null && a.score !== undefined && !a.excludeFromStats; });
    var sum = judged.reduce(function (n, a) { return n + safe(a.score); }, 0);
    var max = judged.reduce(function (n, a) { return n + safe(a.maxScore); }, 0);
    var pending = answers.filter(function (a) { return a.attemptStatus === 'pending'; }).length;
    var absent = answers.filter(function (a) { return a.attemptStatus === 'unanswered'; }).length;
    var excluded = answers.filter(function (a) { return a.excludeFromStats; }).length;
    var active = {};
    answers.forEach(function (a) { active[a.studentId] = true; });
    return {
      classId: classId, className: (state.classes || []).filter(function (c) { return c.id === classId; })[0] ? (state.classes.filter(function (c) { return c.id === classId; })[0].name) : classId,
      students: students.length, activeStudents: Object.keys(active).length,
      records: answers.length, judged: judged.length, pending: pending, unanswered: absent, excluded: excluded,
      scoreRate: max ? sum / max : null,
      themeStats: themeStats(state, { classId: classId })
    };
  }

  function classComparison(state) {
    var classes = (state.classes || []).map(function (c) { return classSummary(state, c.id); });
    var metrics = ['students', 'activeStudents', 'records', 'judged', 'scoreRate', 'pending', 'unanswered', 'excluded'];
    var diffs = [];
    if (classes.length >= 2) {
      metrics.forEach(function (m) {
        var a = classes[0][m], b = classes[1][m];
        if (typeof a === 'number' && typeof b === 'number') {
          diffs.push({ metric: m, a: a, b: b, delta: a - b });
        }
      });
    }
    return { classes: classes, differences: diffs };
  }

  function studentSummary(state, studentId) {
    var st = student(state, studentId);
    var rows = indicatorStats(state, { studentId: studentId });
    var judged = rows.reduce(function (n, r) { return n + r.judged; }, 0);
    var records = rows.reduce(function (n, r) { return n + r.records; }, 0);
    var pending = rows.reduce(function (n, r) { return n + r.pending; }, 0);
    var absent = rows.reduce(function (n, r) { return n + r.unanswered; }, 0);
    var weight = rows.filter(function (r) { return r.scoreRate !== null; });
    return {
      student: st, classId: st ? st.classId : '', indicators: rows, records: records, judged: judged,
      pending: pending, unanswered: absent,
      scoreRate: weight.length ? weight.reduce(function (n, r) { return n + r.scoreRate; }, 0) / weight.length : null,
      needs: rows.filter(function (r) { return r.judged < 2 || r.scoreRate === null || r.scoreRate < 0.8 || r.partialMarks > 0; })
    };
  }

  function evidenceFor(state, studentId, indicatorId) {
    var rows = answersOf(state, { studentId: studentId }).filter(function (a) {
      var q = question(state, a.questionId);
      return q && (q.indicatorId === indicatorId || (q.kpIds || []).indexOf(indicatorId) >= 0);
    }).sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); });
    return rows.slice(0, 4).map(function (a) {
      var q = question(state, a.questionId);
      return {
        recordId: a.recordId || a.id, eventId: a.eventId, revision: a.revision,
        questionId: a.questionId, questionCode: q ? q.code : '',
        submittedAt: a.submittedAt, rawAnswer: a.rawAnswer, solution: a.solution,
        score: a.score, maxScore: a.maxScore, pointScores: a.pointScores,
        pointLoss: q && q.scoringPoints ? q.scoringPoints.filter(function (p) {
          return a.pointScores && a.pointScores[p.id] !== undefined && Number(a.pointScores[p.id]) <= 0;
        }).map(function (p) { return p.id + ' ' + p.label; }) : [],
        status: a.officialGradeStatus || a.gradeStatus, flags: a.flags || []
      };
    });
  }

  function recommendationFor(state, studentId, ind) {
    var qs = (state.questions || []).filter(function (q) { return q.indicatorId === ind.indicatorId; });
    var answered = {};
    answersOf(state, { studentId: studentId }).forEach(function (a) { answered[a.questionId] = a; });
    var practice = qs.filter(function (q) {
      var a = answered[q.id];
      return !a || safe(a.score) < safe(a.maxScore) || a.attemptStatus !== 'answered';
    }).slice(0, 2);
    if (!practice.length) practice = qs.slice(0, 2);
    var card = (state.materials || []).filter(function (m) { return m.type === '学习卡' && m.themeId === ind.themeId; })[0] || null;
    var textbook = (state.materials || []).filter(function (m) { return m.type === '教材' && m.themeId === ind.themeId; })[0] || null;
    var reason = ind.judged < 2
      ? '可判读记录不足（' + ind.judged + ' 条），先补充观察，不直接下掌握结论。'
      : (ind.partialMarks > 0
        ? '有 ' + ind.partialMarks + ' 条部分得分记录，存在明确失分评分点，需针对步骤巩固。'
        : '得分率约 ' + pct(ind.scoreRate) + '，低于稳定掌握参考线（80%），需针对性练习。');
    return {
      studentId: studentId,
      indicatorId: ind.indicatorId, indicatorName: ind.indicatorName, themeId: ind.themeId,
      need: reason,
      materials: {
        learningCard: card ? { id: card.id, title: card.name, content: String(card.content || '').slice(0, 100) } : null,
        textbook: textbook ? { id: textbook.id, title: textbook.name, source: textbook.source } : null,
        practiceQuestions: practice.map(function (q) {
          return { id: q.id, stem: String(q.stem || '').slice(0, 80), scoreRate: ind.scoreRate };
        })
      },
      sequence: [
        card ? '1. 先回顾学习卡 ' + card.id + '（' + ind.themeName + '核心方法）' : '1. 先回顾教材对应章节',
        '2. 教师用 1 道例题演示关键步骤（不直接给完整答案）',
        practice.length ? '3. 完成练习 ' + practice.map(function (q) { return q.id; }).join('、') + '，按评分点自检' : '3. 补充同指标基础练习',
        '4. 用新记录复核：连续 3 条同类题得分率 ≥80% 再进入下一指标'
      ],
      hints: card ? '先提示学习卡中的方法关键词，再让学生复述步骤；不直接给出答案。' : '先提示题目对应的观察指标，再让学生说出第一步。',
      adjustment: '若连续 3 条记录得分率仍 <60%，改为教材例题讲解 + 教师面批；若出现新的失分评分点，回到对应指标补充观察。',
      followUp: '后续观察：同类题得分率、部分得分比例、对应评分点是否稳定得分；记录不足时不作掌握结论。',
      evidenceIds: ind.evidenceIds
    };
  }

  function recommendations(state, studentId) {
    var sum = studentSummary(state, studentId);
    return sum.needs.slice(0, 3).map(function (ind) { return recommendationFor(state, studentId, ind); });
  }

  function caseCandidates(state) {
    var students = (state.users || []).filter(function (u) { return u.role === 'student'; });
    var summaries = students.map(function (s) { return studentSummary(state, s.id); });
    var partialScore = function (s) {
      var n = 0;
      answersOf(state, { studentId: s.student.id }).forEach(function (a) {
        var q = question(state, a.questionId);
        if (!q || q.type !== 'process' || a.excludeFromStats) return;
        if (safe(a.score) > 0 && safe(a.score) < safe(a.maxScore)) n++;
      });
      return n;
    };
    var partial = summaries.slice().sort(function (a, b) { return partialScore(b) - partialScore(a); })[0];
    var strong = summaries.filter(function (s) { return s.judged >= 8; })
      .sort(function (a, b) { return (b.scoreRate || 0) - (a.scoreRate || 0); })[0] || summaries[0];
    var insufficient = summaries.slice().sort(function (a, b) {
      return (a.judged + a.pending * 0.5) - (b.judged + b.pending * 0.5);
    })[0];
    var picks = [];
    [partial, strong, insufficient].forEach(function (s) {
      if (!s) return;
      if (picks.some(function (p) { return p.id === s.student.id; })) return;
      picks.push({ id: s.student.id, type: picks.length === 0 ? 'partial' : (picks.length === 1 ? 'strong' : 'insufficient'), summary: s });
    });
    // 补齐 3 个（若重复）
    summaries.forEach(function (s) {
      if (picks.length >= 3) return;
      if (picks.some(function (p) { return p.id === s.student.id; })) return;
      picks.push({ id: s.student.id, type: 'supplement', summary: s });
    });
    return picks.slice(0, 3).map(function (p) {
      var reason = p.type === 'partial'
        ? '选择理由：该生有较多“部分得分”的解答题记录，适合展示分步诊断与失分点分析。'
        : p.type === 'strong'
          ? '选择理由：该生整体得分率较高，但仍存在局部薄弱指标，适合展示“保持优势 + 局部巩固”。'
          : '选择理由：该生记录/可判读记录较少，适合展示“记录不足不等同于未掌握”与补充观察建议。';
      return { id: p.id, type: p.type, reason: reason };
    });
  }

  function caseDetail(state, id) {
    var sum = studentSummary(state, id);
    var diags = sel.diagnostics(state, { studentId: id });
    var focus = sum.needs.slice(0, 3);
    return {
      studentId: id,
      studentName: id,
      classId: sum.classId,
      selectionReason: '',
      summary: sum,
      diagnoses: focus.map(function (n) {
        var d = diags.filter(function (x) { return x.kpId === n.indicatorId; })[0] || {};
        return {
          indicatorId: n.indicatorId, indicatorName: n.indicatorName,
          status: d.status || n.status, statusLabel: d.statusLabel || n.statusLabel,
          performance: d.performance || n.performance, performanceLabel: d.performanceLabel || n.performanceLabel,
          evidence: evidenceFor(state, id, n.indicatorId)
        };
      }),
      recommendations: recommendations(state, id),
      followUp: '下次观察：同一指标连续 3 条记录得分率、部分得分是否减少、对应评分点是否稳定得分；仍不足则继续补充观察。'
    };
  }

  function caseStudies(state) {
    var picks = caseCandidates(state);
    return picks.map(function (p) {
      var c = caseDetail(state, p.id);
      c.selectionReason = p.reason;
      c.type = p.type;
      return c;
    });
  }

  function task1(state) {
    var themes = themeStats(state, {});
    return {
      dataset: { source: state.meta.source, version: state.meta.datasetVersion, mode: state.meta.dataMode },
      themes: themes.map(function (t) {
        var cards = (state.materials || []).filter(function (m) { return m.type === '学习卡' && m.themeId === t.themeId; });
        var books = (state.materials || []).filter(function (m) { return m.type === '教材' && m.themeId === t.themeId; });
        return {
          themeId: t.themeId, themeName: t.themeName, goal: t.goal,
          standardRef: t.standardRef, standardPages: t.standardPages, textbookPages: t.textbookPages,
          indicators: t.indicators.map(function (r) {
            return {
              indicatorId: r.indicatorId, indicatorName: r.indicatorName,
              standardRef: r.standardRef, standardPages: r.standardPages, textbookPages: r.textbookPages,
              questionIds: (state.questions || []).filter(function (q) { return q.indicatorId === r.indicatorId; }).map(function (q) { return q.id; }),
              learningCards: cards.map(function (m) { return m.id; }),
              textbookSlices: books.map(function (m) { return m.id; })
            };
          })
        };
      })
    };
  }

  function task2Rows(state) {
    var out = [];
    (state.users || []).filter(function (u) { return u.role === 'student'; }).forEach(function (s) {
      indicatorStats(state, { studentId: s.id }).forEach(function (r) {
        out.push({
          studentId: s.id, classId: s.classId, indicatorId: r.indicatorId, indicatorName: r.indicatorName,
          themeId: r.themeId, records: r.records, judged: r.judged, pending: r.pending,
          unanswered: r.unanswered, excluded: r.excluded, scoreRate: r.scoreRate,
          fullRate: r.fullRate, partialRate: r.partialRate, status: r.status,
          performance: r.performance, evidenceIds: (r.evidenceIds || []).join('|')
        });
      });
    });
    return out;
  }

  function task2Group(state) {
    return (state.classes || []).map(function (c) {
      var s = classSummary(state, c.id);
      return {
        classId: c.id, className: c.name, students: s.students, records: s.records,
        judged: s.judged, pending: s.pending, unanswered: s.unanswered, excluded: s.excluded,
        scoreRate: s.scoreRate,
        themes: s.themeStats.map(function (t) {
          return {
            themeId: t.themeId, themeName: t.themeName, scoreRate: t.scoreRate,
            indicators: t.indicators.map(function (r) {
              return { indicatorId: r.indicatorId, indicatorName: r.indicatorName, scoreRate: r.scoreRate, judged: r.judged, records: r.records, status: r.status };
            })
          };
        })
      };
    });
  }

  function task3(state) {
    var cases = caseStudies(state);
    return cases.map(function (c) {
      return { studentId: c.studentId, classId: c.classId, selectionType: c.type, recommendations: c.recommendations };
    });
  }

  function quality(state) {
    var q = state.dataQuality || { issues: [], counts: {} };
    return q;
  }

  function fieldSpec() {
    return [
      { file: 'task1_learning_requirements', field: 'themeId', type: 'string', required: true, meaning: '学习主题编号', relatesTo: 'chapters.id', missing: '不允许', source: '课程要求.csv', example: 'T01' },
      { file: 'task1_learning_requirements', field: 'indicatorId', type: 'string', required: true, meaning: '观察指标编号', relatesTo: 'knowledgePoints.id', missing: '不允许', source: '课程要求.csv', example: 'T01I1' },
      { file: 'task1_learning_requirements', field: 'standardRef', type: 'string', required: false, meaning: '课标整理编号', relatesTo: '课程要求.csv', missing: '空字符串', source: '课程要求.csv', example: 'CR01' },
      { file: 'task1_learning_requirements', field: 'textbookPages', type: 'string', required: false, meaning: '教材页码', relatesTo: '题目与材料.csv', missing: '空字符串', source: '课程要求.csv', example: '上册68—109' },
      { file: 'task2_individual_analysis', field: 'studentId', type: 'string', required: true, meaning: '模拟学生编号', relatesTo: 'users.id', missing: '不允许', source: '模拟学生.csv', example: 'D01' },
      { file: 'task2_individual_analysis', field: 'indicatorId', type: 'string', required: true, meaning: '观察指标', relatesTo: 'knowledgePoints.id', missing: '不允许', source: '课程要求.csv', example: 'T01I1' },
      { file: 'task2_individual_analysis', field: 'scoreRate', type: 'number', required: false, meaning: '得分率=得分合计/满分合计（仅有效记录）', relatesTo: '作答记录.csv', missing: 'null', source: '派生', example: '0.72' },
      { file: 'task2_individual_analysis', field: 'evidenceIds', type: 'string', required: true, meaning: '证据记录 ID（| 分隔）', relatesTo: '作答记录.记录编号', missing: '空字符串', source: '作答记录.csv', example: 'DR0012|DR0034' },
      { file: 'task3_learning_recommendations', field: 'studentId', type: 'string', required: true, meaning: '学生编号', relatesTo: 'users.id', missing: '不允许', source: '模拟学生.csv', example: 'D07' },
      { file: 'task3_learning_recommendations', field: 'materials.learningCard', type: 'object', required: false, meaning: '学习卡材料', relatesTo: 'materials.id (L01–L03)', missing: 'null', source: '题目与材料.csv', example: '{"id":"L01"}' },
      { file: 'task3_learning_recommendations', field: 'materials.practiceQuestions', type: 'array', required: true, meaning: '练习题目', relatesTo: 'questions.id (Q001–Q054)', missing: '空数组', source: '题目与材料.csv', example: '["Q007","Q013"]' },
      { file: 'data_quality_report', field: 'recordId', type: 'string', required: true, meaning: '原始记录编号', relatesTo: '作答记录.记录编号', missing: '不允许', source: '作答记录.csv', example: 'DR0361' },
      { file: 'data_quality_report', field: 'type', type: 'string', required: true, meaning: '问题类型', relatesTo: '-', missing: '不允许', source: '派生', example: 'score_out_of_range' },
      { file: 'data_quality_report', field: 'inStats', type: 'boolean', required: true, meaning: '是否进入统计', relatesTo: '-', missing: '不允许', source: '派生', example: 'false' }
    ];
  }

  function manifest(state) {
    var q = quality(state);
    return {
      dataset: '官方模拟学情数据',
      datasetVersion: state.meta.datasetVersion,
      dataMode: state.meta.dataMode,
      source: state.meta.source,
      generatedAt: new Date().toISOString(),
      tables: q.tableCounts || {},
      rawAnswers: q.rawRows,
      analysisRecords: q.analysisRecords,
      revisionEvents: q.revisionEvents,
      statusCounts: q.statusCounts,
      excludedCount: q.excludedCount,
      issues: (q.issues || []).length,
      fields: fieldSpec().length,
      files: [
        'task1_learning_requirements.json/csv',
        'task2_individual_analysis.json/csv',
        'task2_group_analysis.json/csv',
        'task3_learning_recommendations.json/csv',
        'case_studies.json',
        'data_quality_report.json/csv',
        'field_spec.json/csv',
        'dataset_manifest.json',
        'README.md'
      ]
    };
  }

  function buildOutcomes(state) {
    var cases = caseStudies(state);
    return {
      task1: task1(state),
      task2Individual: task2Rows(state),
      task2Group: task2Group(state),
      task3: task3(state),
      cases: { students: cases, classComparison: classComparison(state) },
      quality: quality(state),
      fieldSpec: fieldSpec(),
      manifest: manifest(state)
    };
  }

  function csv(headers, rows) {
    return ZWZ.io.toCSV(headers, rows);
  }

  function downloadText(filename, content, mime) {
    return ZWZ.io.download(filename, content, mime || 'text/plain;charset=utf-8');
  }

  function exportPackage(state) {
    var o = buildOutcomes(state);
    var prefix = '知微智学_赛题成果包_';
    downloadText(prefix + 'task1_learning_requirements.json', JSON.stringify(o.task1, null, 2), 'application/json');
    setTimeout(function () {
      downloadText(prefix + 'task2_individual_analysis.json', JSON.stringify(o.task2Individual, null, 2), 'application/json');
    }, 120);
    setTimeout(function () {
      downloadText(prefix + 'task2_group_analysis.json', JSON.stringify(o.task2Group, null, 2), 'application/json');
    }, 240);
    setTimeout(function () {
      downloadText(prefix + 'task3_learning_recommendations.json', JSON.stringify(o.task3, null, 2), 'application/json');
    }, 360);
    setTimeout(function () {
      downloadText(prefix + 'case_studies.json', JSON.stringify(o.cases, null, 2), 'application/json');
    }, 480);
    setTimeout(function () {
      downloadText(prefix + 'data_quality_report.json', JSON.stringify(o.quality, null, 2), 'application/json');
    }, 600);
    setTimeout(function () {
      downloadText(prefix + 'field_spec.json', JSON.stringify(o.fieldSpec, null, 2), 'application/json');
    }, 720);
    setTimeout(function () {
      downloadText(prefix + 'dataset_manifest.json', JSON.stringify(o.manifest, null, 2), 'application/json');
    }, 840);
    setTimeout(function () {
      var readme = [
        '# 知微·智学 · 赛题成果包',
        '',
        '数据来源：' + state.meta.source,
        '数据集版本：' + state.meta.datasetVersion,
        '生成时间：' + new Date().toISOString(),
        '',
        '## 文件',
        'task1_learning_requirements：学习主题/观察指标/课标与教材出处/题目与材料',
        'task2_individual_analysis：学生×观察指标分析（含证据记录 ID）',
        'task2_group_analysis：DC01/DC02 群体分析',
        'task3_learning_recommendations：个性化建议（Q/L/B 材料、顺序、提示、调整条件）',
        'case_studies：三名典型案例 + 双班比较',
        'data_quality_report：修订版本、未作答、待评分、分数异常、节点越界',
        'field_spec：字段说明',
        'dataset_manifest：数据集清单',
        '',
        '## 口径',
        '未作答/待评分不计入错误率与掌握率分母；异常记录标记后不进入统计；修订版本取最新版参与分析，历史版本保留。',
        '详细字段见 field_spec.json。'
      ].join('\n');
      downloadText(prefix + 'README.md', readme, 'text/markdown;charset=utf-8');
    }, 960);
    return o;
  }

  ZWZ.competition = {
    indicatorStats: indicatorStats,
    themeStats: themeStats,
    classSummary: classSummary,
    classComparison: classComparison,
    studentSummary: studentSummary,
    caseCandidates: caseCandidates,
    caseStudies: caseStudies,
    recommendations: recommendations,
    task1: task1,
    task2Rows: task2Rows,
    task2Group: task2Group,
    task3: task3,
    quality: quality,
    fieldSpec: fieldSpec,
    manifest: manifest,
    buildOutcomes: buildOutcomes,
    exportPackage: exportPackage,
    csv: csv
  };
})();
