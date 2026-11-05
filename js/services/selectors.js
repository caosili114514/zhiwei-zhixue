/* ============================================================
   知微·智学 · 选择器层（纯查询 / 聚合，不修改数据库）
   页面统一通过 selectors 取数，保证学生端 / 教师端 / 图表 / 导出数据一致。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var fmt = ZWZ.fmt;
  var diagnosis = ZWZ.diagnosis;

  var MASTERED = ['secure', 'independent', 'after-hint', 'retry'];

  function byTimeDesc(a, b) {
    return new Date(b) - new Date(a);
  }

  function classById(state, id) {
    return (state.classes || []).filter(function (c) { return c.id === id; })[0] || null;
  }

  function userById(state, id) {
    return (state.users || []).filter(function (u) { return u.id === id; })[0] || null;
  }

  function classOf(state, id) {
    var user = userById(state, id);
    if (!user) return (state.classes || [])[0] || null;
    if (user.classId) return classById(state, user.classId);
    if (user.classIds && user.classIds.length) return classById(state, user.classIds[0]);
    return (state.classes || [])[0] || null;
  }

  function classStudents(state, classId) {
    var cls = classById(state, classId);
    if (!cls) return [];
    return (cls.studentIds || []).map(function (sid) {
      var user = userById(state, sid);
      return user ? user : { id: sid, role: 'student', name: sid, classId: classId };
    });
  }

  function inScopeKps(state, classId) {
    var cls = classById(state, classId);
    var chapters = cls ? (cls.scopeChapterIds || (state.meta.scope || {}).chapters || []) : [];
    return (state.knowledgePoints || []).filter(function (kp) {
      if (kp.inScope === false) return false;
      if (!chapters.length) return true;
      return chapters.indexOf(kp.chapterId) >= 0;
    });
  }

  function tasksOfClass(state, classId) {
    return (state.tasks || []).filter(function (t) { return t.classId === classId; })
      .sort(function (a, b) { return new Date(a.assignedAt) - new Date(b.assignedAt); });
  }

  /* ---------------- 基础查询 ---------------- */
  function question(state, qid) {
    for (var i = 0; i < state.questions.length; i++) {
      if (state.questions[i].id === qid) return state.questions[i];
    }
    return null;
  }

  function questionsOfPaper(state, paperId) {
    var paper = (state.papers || []).filter(function (p) { return p.id === paperId; })[0];
    if (!paper) return [];
    return (paper.questionIds || []).map(function (id) { return question(state, id); }).filter(Boolean);
  }

  function answers(state, filter) {
    var f = filter || {};
    return (state.answers || []).filter(function (a) {
      if (f.studentId && a.studentId !== f.studentId) return false;
      if (f.taskId && a.taskId !== f.taskId) return false;
      if (f.questionId && a.questionId !== f.questionId) return false;
      if (f.statuses && f.statuses.indexOf(a.gradeStatus) < 0) return false;
      return true;
    }).sort(function (a, b) { return new Date(a.submittedAt) - new Date(b.submittedAt); });
  }

  function diagnostics(state, filter) {
    var f = filter || {};
    var rows = diagnosis.computeDiagnostics(state, {
      studentId: f.studentId,
      classId: f.classId
    });
    if (f.kpId) rows = rows.filter(function (d) { return d.kpId === f.kpId; });
    if (f.scopeOnly) rows = rows.filter(function (d) { return d.scope === 'in-scope'; });
    return rows;
  }

  function isCorrect(answer) {
    if (answer.score === null || answer.score === undefined) return false;
    return answer.score >= (answer.maxScore || 1) * 0.8;
  }

  /* ---------------- 学生端 ---------------- */
  function tasksForStudent(state, studentId) {
    var cls = classOf(state, studentId);
    if (!cls) return [];
    return tasksOfClass(state, cls.id);
  }

  function taskProgress(state, studentId, task) {
    var questions = task.questionIds || [];
    var submitted = answers(state, { studentId: studentId, taskId: task.id });
    var submittedIds = submitted.map(function (a) { return a.questionId; });
    var missing = questions.filter(function (qid) { return submittedIds.indexOf(qid) < 0; });
    var judged = submitted.filter(function (a) { return a.score !== null && a.score !== undefined; });
    var correct = judged.filter(isCorrect);
    return {
      task: task,
      total: questions.length,
      submitted: submitted.length,
      missing: missing,
      missingCount: missing.length,
      judged: judged.length,
      correct: correct.length,
      accuracy: judged.length ? correct.length / judged.length : null,
      completed: missing.length === 0 && questions.length > 0,
      answers: submitted
    };
  }

  function studentOverview(state, studentId) {
    var student = userById(state, studentId) || { id: studentId, name: studentId };
    var cls = classOf(state, studentId);
    var tasks = tasksForStudent(state, studentId).map(function (t) {
      return taskProgress(state, studentId, t);
    });
    var all = answers(state, { studentId: studentId });
    var judged = all.filter(function (a) { return a.score !== null && a.score !== undefined; });
    var correct = judged.filter(isCorrect);

    var diags = diagnostics(state, { studentId: studentId, scopeOnly: true });
    var focus = diags.filter(function (d) {
      return ['difficulty', 'after-hint', 'retry'].indexOf(d.performance) >= 0 && d.evidence.records > 0;
    }).sort(function (a, b) {
      var w = { difficulty: 0, retry: 1, 'after-hint': 2 };
      return (w[a.performance] - w[b.performance]) || (b.evidence.wrong - a.evidence.wrong);
    });
    var strengths = diags.filter(function (d) {
      return MASTERED.indexOf(d.performance) >= 0 && d.status !== 'undetermined';
    }).sort(function (a, b) {
      return b.evidence.judged - a.evidence.judged;
    });
    /* 同一知识点不能既算“优势”又算“需要巩固”：优先归入需要巩固/待观察 */
    var focusIds = {};
    focus.forEach(function (d) { focusIds[d.kpId] = true; });
    strengths = strengths.filter(function (d) { return !focusIds[d.kpId]; });

    var pendingTask = tasks.filter(function (p) { return !p.completed; })
      .sort(function (a, b) { return new Date(a.task.dueAt) - new Date(b.task.dueAt); })[0] || null;

    var recentAnswers = all.slice().sort(function (a, b) { return new Date(b.submittedAt) - new Date(a.submittedAt); }).slice(0, 6);
    var recent = recentAnswers.map(function (a) {
      return { answer: a, question: question(state, a.questionId) };
    });

    var hintCount = all.reduce(function (n, a) { return n + (a.hintLevels ? a.hintLevels.length : 0); }, 0);

    return {
      student: student,
      cls: cls,
      tasks: tasks,
      pendingTask: pendingTask,
      recent: recent,
      focus: focus,
      strengths: strengths,
      diagnostics: diags,
      stats: {
        records: all.length,
        judged: judged.length,
        correct: correct.length,
        accuracy: judged.length ? correct.length / judged.length : null,
        hintCount: hintCount,
        scopeKpCount: diags.filter(function (d) { return d.scope === 'in-scope'; }).length,
        coveredKpCount: diags.filter(function (d) { return d.scope === 'in-scope' && d.evidence.records > 0; }).length,
        pendingReviews: all.filter(function (a) { return a.gradeStatus === 'suggested' || a.gradeStatus === 'unjudged'; }).length
      },
      trend: studentTrend(state, studentId)
    };
  }

  function studentTrend(state, studentId) {
    var cls = classOf(state, studentId);
    if (!cls) return { xLabels: [], points: [] };
    var tasks = tasksOfClass(state, cls.id);
    var xLabels = [];
    var points = [];
    tasks.forEach(function (t) {
      var rows = answers(state, { studentId: studentId, taskId: t.id }).filter(function (a) {
        return a.score !== null && a.score !== undefined;
      });
      if (!rows.length) return;
      var correct = rows.filter(isCorrect).length;
      xLabels.push(fmt.shortDate(t.assignedAt));
      points.push(Math.round((correct / rows.length) * 100));
    });
    return { xLabels: xLabels, points: points };
  }

  function studentReport(state, studentId) {
    var overview = studentOverview(state, studentId);
    var diags = overview.diagnostics.filter(function (d) { return d.scope === 'in-scope'; });
    var rows = diags.map(function (d) {
      return {
        kpName: d.kpName,
        chapterName: d.chapterName,
        performance: d.performanceLabel,
        performanceTone: d.performanceTone,
        status: d.statusLabel,
        statusTone: d.statusTone,
        records: d.evidence.records,
        judged: d.evidence.judged,
        coverage: d.evidence.coverageText,
        errorTypes: d.errorTypes.map(function (e) { return e.label; }).join('、') || '—',
        suggestion: d.suggestion,
        reviewed: d.reviewed,
        teacherNote: d.teacherNote
      };
    });
    var rangeStart = null;
    var rangeEnd = null;
    (state.answers || []).filter(function (a) { return a.studentId === studentId; }).forEach(function (a) {
      if (!rangeStart || new Date(a.submittedAt) < new Date(rangeStart)) rangeStart = a.submittedAt;
      if (!rangeEnd || new Date(a.submittedAt) > new Date(rangeEnd)) rangeEnd = a.submittedAt;
    });
    return {
      student: overview.student,
      cls: overview.cls,
      generatedAt: new Date().toISOString(),
      range: { start: rangeStart, end: rangeEnd },
      stats: overview.stats,
      strengths: overview.strengths,
      focus: overview.focus,
      rows: rows,
      trend: overview.trend,
      scopeNote: (state.meta.scope || {}).note || '',
      sourceNote: '数据来源：' + (state.meta.textbook || {}).edition + '；教材/材料版本待教师确认。'
    };
  }

  /* ---------------- 教师端：班级分析 ---------------- */
  function classDiagnostics(state, classId) {
    return diagnostics(state, { classId: classId, scopeOnly: true });
  }

  function kpAnalysis(state, classId, opts) {
    var o = opts || {};
    var kps = inScopeKps(state, classId);
    var students = classStudents(state, classId);
    var allDiags = classDiagnostics(state, classId);

    return kps.map(function (kp) {
      var rows = allDiags.filter(function (d) { return d.kpId === kp.id; });
      var withRecords = rows.filter(function (d) { return d.evidence.records > 0; });
      var mastered = rows.filter(function (d) { return MASTERED.indexOf(d.performance) >= 0 && d.status !== 'undetermined'; });
      var weak = rows.filter(function (d) { return d.performance === 'difficulty'; });
      var pending = rows.filter(function (d) { return d.status === 'pending'; });
      var insufficient = rows.filter(function (d) { return d.performance === 'insufficient' || d.performance === 'not-learned'; });

      var records = rows.reduce(function (n, d) { return n + d.evidence.records; }, 0);
      var judged = rows.reduce(function (n, d) { return n + d.evidence.judged; }, 0);
      var correct = rows.reduce(function (n, d) { return n + d.evidence.correct; }, 0);
      var judgedStudents = rows.filter(function (d) { return d.evidence.judged > 0; }).length;

      var errorCounts = {};
      rows.forEach(function (d) {
        d.errorTypes.forEach(function (e) {
          errorCounts[e.key] = (errorCounts[e.key] || 0) + e.count;
        });
      });
      var errorTypes = Object.keys(errorCounts).map(function (key) {
        return { key: key, label: diagnosis.errorLabel(key), count: errorCounts[key], tone: diagnosis.errorTone(key) };
      }).sort(function (a, b) { return b.count - a.count; });

      /* 时间趋势：按该知识点全部作答记录的时间中位数分成前后两段 */
      var kpAnswers = [];
      (state.answers || []).forEach(function (a) {
        var q = question(state, a.questionId);
        if (!q || (q.kpIds || []).indexOf(kp.id) < 0) return;
        var st = userById(state, a.studentId);
        if (!st || st.classId !== classId) return;
        if (a.score === null || a.score === undefined) return;
        kpAnswers.push(a);
      });
      kpAnswers.sort(function (a, b) { return new Date(a.submittedAt) - new Date(b.submittedAt); });
      var trend = null;
      if (kpAnswers.length >= 6) {
        var mid = Math.floor(kpAnswers.length / 2);
        var firstHalf = kpAnswers.slice(0, mid);
        var secondHalf = kpAnswers.slice(mid);
        var r1 = firstHalf.filter(isCorrect).length / firstHalf.length;
        var r2 = secondHalf.filter(isCorrect).length / secondHalf.length;
        trend = { delta: r2 - r1, from: Math.round(r1 * 100), to: Math.round(r2 * 100), n: kpAnswers.length };
      }

      return {
        kp: kp,
        kpName: kp.name,
        chapterName: kp.chapterName,
        difficulty: kp.difficulty,
        records: records,
        judged: judged,
        pendingCount: pending.length,
        studentsWithRecords: withRecords.length,
        studentsJudged: judgedStudents,
        masteredCount: mastered.length,
        weakCount: weak.length,
        insufficientCount: insufficient.length,
        /* 掌握率只以“有可判读记录的学生”为分母，避免把待复核数据当成不会 */
        masteryRate: judgedStudents ? mastered.length / judgedStudents : null,
        weakRate: judgedStudents ? weak.length / judgedStudents : null,
        accuracy: judged ? correct / judged : null,
        coverage: students.length ? withRecords.length / students.length : 0,
        judgedCoverage: students.length ? judgedStudents / students.length : 0,
        errorTypes: errorTypes,
        trend: trend,
        pendingDiagnoses: pending
      };
    });
  }

  function errorDistribution(state, classId, opts) {
    var o = opts || {};
    var counts = {};
    var answered = 0;
    (state.answers || []).forEach(function (a) {
      var st = userById(state, a.studentId);
      if (!st || st.classId !== classId) return;
      var q = question(state, a.questionId);
      if (!q) return;
      if (o.kpId && (q.kpIds || []).indexOf(o.kpId) < 0) return;
      if (a.score === null || a.score === undefined) return;
      answered++;
      if (isCorrect(a)) return;
      var tag = a.errorTag;
      if (!tag) tag = (q.errorTags || []).length === 1 ? q.errorTags[0] : 'unclassified';
      counts[tag] = (counts[tag] || 0) + 1;
    });
    var totalWrong = Object.keys(counts).reduce(function (n, k) { return n + counts[k]; }, 0);
    return Object.keys(counts).map(function (key) {
      return {
        key: key,
        label: diagnosis.errorLabel(key),
        tone: diagnosis.errorTone(key),
        count: counts[key],
        ratio: totalWrong ? counts[key] / totalWrong : 0
      };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  function trendSeries(state, classId) {
    var tasks = tasksOfClass(state, classId);
    var xLabels = [];
    var accuracy = [];
    var hintRate = [];
    tasks.forEach(function (t) {
      var rows = (state.answers || []).filter(function (a) { return a.taskId === t.id && a.score !== null && a.score !== undefined; });
      if (!rows.length) return;
      var correct = rows.filter(isCorrect).length;
      var hints = rows.filter(function (a) { return a.hintLevels && a.hintLevels.length; }).length;
      xLabels.push(fmt.shortDate(t.assignedAt));
      accuracy.push(Math.round((correct / rows.length) * 100));
      hintRate.push(Math.round((hints / rows.length) * 100));
    });
    return {
      xLabels: xLabels,
      series: [
        { name: '一次正确率', points: accuracy, color: '#365CF5' },
        { name: '提示使用率', points: hintRate, color: '#F0A43A', dashed: true }
      ]
    };
  }

  function classOverview(state, classId) {
    var cls = classById(state, classId);
    var students = classStudents(state, classId);
    var all = (state.answers || []).filter(function (a) {
      var st = userById(state, a.studentId);
      return st && st.classId === classId;
    });
    var judged = all.filter(function (a) { return a.score !== null && a.score !== undefined; });
    var correct = judged.filter(isCorrect);
    var activeIds = {};
    all.forEach(function (a) { activeIds[a.studentId] = true; });
    var diags = classDiagnostics(state, classId);
    var kpRows = kpAnalysis(state, classId);
    var weakKps = kpRows.filter(function (r) { return r.records > 0; })
      .sort(function (a, b) { return (b.weakRate || 0) - (a.weakRate || 0); })
      .slice(0, 3);
    var lastAt = null;
    all.forEach(function (a) {
      if (!lastAt || new Date(a.submittedAt) > new Date(lastAt)) lastAt = a.submittedAt;
    });

    var attention = students.map(function (st) {
      var rows = diags.filter(function (d) { return d.studentId === st.id && d.performance === 'difficulty'; });
      var pending = all.filter(function (a) { return a.studentId === st.id && (a.gradeStatus === 'suggested' || a.gradeStatus === 'unjudged'); }).length;
      var focus = rows.sort(function (a, b) { return b.evidence.wrong - a.evidence.wrong; }).slice(0, 2);
      return { student: st, weakCount: rows.length, focus: focus, pending: pending };
    }).filter(function (r) { return r.weakCount > 0; })
      .sort(function (a, b) { return b.weakCount - a.weakCount; });

    return {
      cls: cls,
      teacher: userById(state, (cls || {}).teacherId),
      studentCount: students.length,
      activeStudents: Object.keys(activeIds).length,
      tasks: tasksOfClass(state, classId),
      records: all.length,
      judged: judged.length,
      accuracy: judged.length ? correct.length / judged.length : null,
      hintRate: all.length ? all.filter(function (a) { return a.hintLevels && a.hintLevels.length; }).length / all.length : null,
      pendingGrades: all.filter(function (a) { return a.gradeStatus === 'suggested' || a.gradeStatus === 'unjudged'; }).length,
      pendingDiagnoses: diags.filter(function (d) { return d.status === 'pending'; }).length,
      kpRows: kpRows,
      weakKps: weakKps,
      errorTypes: errorDistribution(state, classId),
      trend: trendSeries(state, classId),
      attention: attention,
      lastActivity: lastAt
    };
  }

  function pendingReviews(state, filter) {
    var f = filter || {};
    var classId = f.classId;
    var out = { grades: [], diagnoses: [] };
    (state.answers || []).forEach(function (a) {
      var st = userById(state, a.studentId);
      if (!st || (classId && st.classId !== classId)) return;
      if (a.gradeStatus !== 'suggested' && a.gradeStatus !== 'unjudged') return;
      out.grades.push({ answer: a, question: question(state, a.questionId), student: st });
    });
    var diags = diagnostics(state, { classId: classId, scopeOnly: true });
    diags.forEach(function (d) {
      if (d.status !== 'pending' && d.status !== 'preliminary') return;
      if (!d.evidence.records) return;
      out.diagnoses.push({ diag: d, student: userById(state, d.studentId) });
    });
    if (f.type === 'grade') return out.grades;
    if (f.type === 'diagnosis') return out.diagnoses;
    return out;
  }

  function classReport(state, classId) {
    var overview = classOverview(state, classId);
    var rows = overview.kpRows;
    var rangeStart = null;
    var rangeEnd = null;
    (state.answers || []).forEach(function (a) {
      if (!rangeStart || new Date(a.submittedAt) < new Date(rangeStart)) rangeStart = a.submittedAt;
      if (!rangeEnd || new Date(a.submittedAt) > new Date(rangeEnd)) rangeEnd = a.submittedAt;
    });
    return {
      cls: overview.cls,
      teacher: overview.teacher,
      generatedAt: new Date().toISOString(),
      range: { start: rangeStart, end: rangeEnd },
      overview: overview,
      rows: rows.map(function (r) {
        return {
          kpName: r.kpName,
          chapterName: r.chapterName,
          masteryRate: r.masteryRate,
          weakCount: r.weakCount,
          accuracy: r.accuracy,
          records: r.records,
          coverage: r.coverage,
          errorTypes: r.errorTypes.map(function (e) { return e.label + '×' + e.count; }).join('、') || '—',
          trend: r.trend
        };
      }),
      pendingGrades: overview.pendingGrades,
      pendingDiagnoses: overview.pendingDiagnoses,
      materials: state.materials || [],
      scopeNote: (state.meta.scope || {}).note || '',
      textbook: state.meta.textbook || {}
    };
  }

  function assistantContext(state, opts) {
    var o = opts || {};
    var classId = o.classId || (classOf(state, o.studentId) || {}).id;
    var rows = kpAnalysis(state, classId);
    return {
      classId: classId,
      cls: classById(state, classId),
      kpRows: rows,
      overview: classOverview(state, classId),
      student: o.studentId ? userById(state, o.studentId) : null,
      studentDiags: o.studentId ? diagnostics(state, { studentId: o.studentId, scopeOnly: true }) : null
    };
  }

  ZWZ.sel = {
    MASTERED: MASTERED,
    classById: classById,
    classOf: classOf,
    classStudents: classStudents,
    userById: userById,
    inScopeKps: inScopeKps,
    tasksOfClass: tasksOfClass,
    tasksForStudent: tasksForStudent,
    taskProgress: taskProgress,
    question: question,
    questionsOfPaper: questionsOfPaper,
    answers: answers,
    diagnostics: diagnostics,
    classDiagnostics: classDiagnostics,
    isCorrect: isCorrect,
    kp: function (state, kpId) {
      return (state.knowledgePoints || []).filter(function (k) { return k.id === kpId; })[0] || null;
    },
    knowledgePoints: inScopeKps,
    paper: function (state, id) {
      return (state.papers || []).filter(function (p) { return p.id === id; })[0] || null;
    },
    task: function (state, id) {
      return (state.tasks || []).filter(function (t) { return t.id === id; })[0] || null;
    },
    student: function (state, id) { return userById(state, id); },
    teacher: function (state, id) { return userById(state, id); },
    classes: function (state) { return state.classes || []; },
    studentOverview: studentOverview,
    studentTrend: studentTrend,
    studentReport: studentReport,
    kpAnalysis: kpAnalysis,
    errorDistribution: errorDistribution,
    trendSeries: trendSeries,
    classOverview: classOverview,
    pendingReviews: pendingReviews,
    classReport: classReport,
    assistantContext: assistantContext
  };
})();
