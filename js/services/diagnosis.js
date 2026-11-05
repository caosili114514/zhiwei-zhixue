/* ============================================================
   知微·智学 · 学情诊断引擎（规则引擎，可替换为真实模型服务）
   ------------------------------------------------------------
   教育安全约束（务必保持）：
   1. 单条错误不下结论；
   2. 记录数 < 2 → 初步判断；无可判读记录 → 暂无法判断；
   3. 存在待复核/识别异常时结论标注不确定；
   4. 超出教学范围的内容不作为正式诊断依据；
   5. 措辞使用可改善、非固定标签的表达。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var fmt = ZWZ.fmt;

  var ERROR_TYPES = [
    { key: 'concept', label: '概念理解', desc: '概念、定义或性质的理解不到位', tone: 'primary' },
    { key: 'calculation', label: '计算 / 符号错误', desc: '运算过程或符号处理出错', tone: 'warn' },
    { key: 'steps', label: '步骤遗漏', desc: '解题步骤不完整、跳步或漏解', tone: 'purple' },
    { key: 'reading', label: '审题偏差', desc: '未按题意理解条件或所求问题', tone: 'warn' },
    { key: 'method', label: '方法选择不当', desc: '解题方法或建模思路出现偏差', tone: 'primary' },
    { key: 'transfer', label: '知识迁移困难', desc: '在新情境中调用知识受阻', tone: 'neutral' },
    { key: 'recognition', label: '作答识别异常', desc: '作答识别质量低，需人工核对', tone: 'danger' },
    { key: 'insufficient', label: '证据不足', desc: '有效记录不足以支持判断', tone: 'neutral' },
    { key: 'unclassified', label: '待教师归因', desc: '系统无法确定错误类型，需教师确认', tone: 'neutral' }
  ];

  var ERROR_MAP = ERROR_TYPES.reduce(function (acc, item) {
    acc[item.key] = item;
    return acc;
  }, {});

  var PERFORMANCE = {
    secure: { label: '掌握较稳定', tone: 'teal', desc: '记录较多且持续正确' },
    independent: { label: '独立完成', tone: 'teal', desc: '在无提示情况下完成' },
    'after-hint': { label: '提示后完成', tone: 'primary', desc: '借助提示后完成，独立程度待观察' },
    retry: { label: '反复尝试后完成', tone: 'primary', desc: '多次尝试后完成，一次正确率待提升' },
    partial: { label: '部分掌握', tone: 'primary', desc: '部分得分，存在明确失分点，需针对性巩固' },
    difficulty: { label: '仍需巩固', tone: 'warn', desc: '目标知识点上仍有困难，建议针对性练习' },
    'not-learned': { label: '尚未学习 / 不在范围', tone: 'neutral', desc: '未纳入当前教学范围，不作为诊断结论' },
    insufficient: { label: '记录不足', tone: 'neutral', desc: '有效记录不足，暂不作结论' }
  };

  var STATUS = {
    sufficient: { label: '证据充分', tone: 'teal' },
    preliminary: { label: '初步判断', tone: 'primary' },
    pending: { label: '待复核', tone: 'warn' },
    undetermined: { label: '暂无法判断', tone: 'neutral' }
  };

  var TYPE_LABELS = { choice: '选择题', fill: '填空题', calc: '计算题', process: '过程 / 应用题' };

  function questionMap(state) {
    var map = {};
    (state.questions || []).forEach(function (q) { map[q.id] = q; });
    return map;
  }

  function classScope(state, classId) {
    var cls = (state.classes || []).filter(function (c) { return c.id === classId; })[0];
    if (!cls) return null;
    return cls.scopeChapterIds || (state.meta && state.meta.scope && state.meta.scope.chapters) || [];
  }

  function kpInScope(kp, chapters) {
    if (!chapters || !chapters.length) return kp.inScope !== false;
    return kp.inScope !== false && chapters.indexOf(kp.chapterId) >= 0;
  }

  function isCorrect(answer) {
    if (answer.score === null || answer.score === undefined) return false;
    var max = answer.maxScore || 1;
    return answer.score >= max * 0.8;
  }

  function latestDiagnosisReview(state, studentId, kpId) {
    var rows = (state.diagnosisReviews || []).filter(function (r) {
      return r.studentId === studentId && r.kpId === kpId;
    });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    return rows[rows.length - 1];
  }

  function buildQuote(record) {
    var a = record.answer;
    if (a.attemptStatus === 'unanswered') {
      var q0 = record.question;
      return fmt.shortDate(a.submittedAt) + ' ' + (q0 ? '第' + q0.code + '题（' + (TYPE_LABELS[q0.type] || '题目') + '）' : '') +
        '未作答（缺失记录，不计为答错）';
    }
    var q = record.question;
    var parts = [];
    parts.push(fmt.shortDate(a.submittedAt) + ' 第' + q.code + '题（' + (TYPE_LABELS[q.type] || '题目') + '）');
    var raw = a.rawAnswer === undefined || a.rawAnswer === null || String(a.rawAnswer).trim() === ''
      ? '未作答'
      : '「' + String(a.rawAnswer).trim() + '」';
    parts.push('作答 ' + raw);
    if (a.gradeStatus === 'suggested') {
      parts.push('过程题待教师复核，暂未计分');
    } else if (a.gradeStatus === 'unjudged') {
      parts.push('暂无法判阅（' + (a.recognition === 'low' ? '识别质量低' : '无有效作答内容') + '）');
    } else if (isCorrect(a)) {
      parts.push('与参考答案一致');
    } else {
      parts.push('与参考答案不一致');
    }
    if (a.hintLevels && a.hintLevels.length) parts.push('使用提示 ' + a.hintLevels.length + ' 次');
    if (a.attempts && a.attempts > 1) parts.push('尝试 ' + a.attempts + ' 次');
    if (a.gradeStatus === 'reviewed') parts.push('教师已复核');
    return parts.join('，');
  }

  function pickPerformance(ratio, records, hints, retries, judgedCount) {
    if (ratio >= 0.999) {
      if (records.length >= 4 && hints === 0 && retries === 0 && judgedCount >= 3) return 'secure';
      if (hints > 0) return 'after-hint';
      if (retries > 0) return 'retry';
      return judgedCount >= 3 ? 'secure' : 'independent';
    }
    return 'difficulty';
  }

  function buildSuggestion(kp, performance, status, errorTypes, judgedCount, pendingCount) {
    var errorLabel = errorTypes.length ? ERROR_MAP[errorTypes[0].key].label : '';
    var text = '';
    switch (performance) {
      case 'secure':
        text = '「' + kp.name + '」目前记录较稳定，可以尝试变式题或综合题保持巩固，不需要重复刷同类基础题。';
        break;
      case 'independent':
        text = '近期在「' + kp.name + '」上能独立完成。' + (judgedCount < 3 ? '当前记录还不多，建议再补充 1—2 道不同类型的题目确认。' : '可以进入下一层次的综合练习。');
        break;
      case 'after-hint':
        text = '在提示帮助下能够完成「' + kp.name + '」相关题目，说明思路可以建立，但独立程度待观察；建议先独立尝试，再对照提示检查关键一步。';
        break;
      case 'retry':
        text = '经过反复尝试后完成「' + kp.name + '」相关题目，说明思路能形成但不够熟练；建议做少量限时练习提升一次正确率。';
        break;
      case 'partial':
        text = '「' + kp.name + '」有部分得分，说明基础思路已建立，但仍存在明确失分点' +
          (errorLabel ? '（主要涉及「' + errorLabel + '」）' : '') +
          '。建议先针对失分步骤做 2—3 道同类型变式题，再回到完整解答检验是否稳定。';
        break;
      case 'difficulty':
        text = '目前记录显示在「' + kp.name + '」上仍有困难' + (errorLabel ? '，主要涉及「' + errorLabel + '」' : '') +
          '。建议先回顾教材例题与关键步骤，再完成 2—3 道同类基础题，之后用新记录复核。';
        break;
      case 'not-learned':
        text = '该内容尚未纳入当前教学范围，系统不据此形成学情结论。';
        break;
      default:
        text = '「' + kp.name + '」的有效记录还不足，暂时无法判断掌握情况；缺失或未提交的记录不会计为答错。';
    }
    if (status === 'preliminary' && performance !== 'not-learned' && performance !== 'insufficient') {
      text += '（当前仅 ' + judgedCount + ' 条可判读记录，属初步判断。）';
    }
    if (status === 'pending') {
      text += '（另有 ' + pendingCount + ' 条作答待人工复核，复核后结论可能调整。）';
    }
    if (status === 'undetermined') {
      text += '当前状态为暂无法判断，建议补充练习或在教师复核后再查看。';
    }
    return text;
  }

  function buildOne(state, studentId, kp, records, chapters, qMap) {
    var inScope = kp.inScope !== false && (!chapters || chapters.indexOf(kp.chapterId) >= 0);
    var sorted = records.slice().sort(function (a, b) {
      return new Date(a.answer.submittedAt) - new Date(b.answer.submittedAt);
    });
    var judged = sorted.filter(function (r) {
      return r.answer.score !== null && r.answer.score !== undefined && !r.answer.excludeFromStats;
    });
    var excluded = sorted.filter(function (r) { return r.answer.excludeFromStats; });
    var absent = sorted.filter(function (r) { return r.answer.attemptStatus === 'unanswered'; });
    var pending = sorted.filter(function (r) {
      return (r.answer.gradeStatus === 'suggested' || r.answer.gradeStatus === 'unjudged') &&
        r.answer.attemptStatus !== 'unanswered' && !r.answer.excludeFromStats;
    });
    var correct = judged.filter(function (r) { return isCorrect(r.answer); });
    var wrong = judged.filter(function (r) { return !isCorrect(r.answer); });
    var hintRecords = sorted.filter(function (r) { return r.answer.hintLevels && r.answer.hintLevels.length; });
    var retryRecords = sorted.filter(function (r) { return r.answer.attempts && r.answer.attempts > 1; });
    var lowRecognition = sorted.filter(function (r) { return r.answer.recognition === 'low'; });
    var totalScore = judged.reduce(function (n, r) { return n + (Number(r.answer.score) || 0); }, 0);
    var totalMax = judged.reduce(function (n, r) { return n + (Number(r.answer.maxScore) || 0); }, 0);
    var scoreRate = totalMax ? totalScore / totalMax : null;
    var fullMarks = judged.filter(function (r) { return Number(r.answer.score) >= Number(r.answer.maxScore); });
    var partialMarks = judged.filter(function (r) {
      var sc = Number(r.answer.score), mx = Number(r.answer.maxScore);
      return sc > 0 && sc < mx;
    });
    var pointLoss = [];
    wrong.forEach(function (r) {
      var ps = r.answer.pointScores || {};
      (r.question.scoringPoints || []).forEach(function (p) {
        if (ps[p.id] !== undefined && Number(ps[p.id]) <= 0) pointLoss.push(p.id + ' ' + p.label);
      });
    });

    var errorCounts = {};
    wrong.forEach(function (r) {
      var tag = r.answer.errorTag;
      if (!tag) {
        var tags = r.question.errorTags || [];
        tag = tags.length === 1 ? tags[0] : 'unclassified';
      }
      if (ERROR_MAP[tag]) errorCounts[tag] = (errorCounts[tag] || 0) + 1;
    });
    var errorTypes = Object.keys(errorCounts).map(function (key) {
      return { key: key, label: ERROR_MAP[key].label, count: errorCounts[key], tone: ERROR_MAP[key].tone };
    }).sort(function (a, b) { return b.count - a.count; });

    var ratio = judged.length ? correct.length / judged.length : 0;
    var isCompetition = !!(state.meta && state.meta.dataMode === 'competition');
    var status;
    var performance;
    if (!inScope) {
      status = 'undetermined';
      performance = 'not-learned';
    } else if (!sorted.length) {
      status = 'undetermined';
      performance = 'insufficient';
    } else if (!judged.length) {
      if (pending.length) { status = 'pending'; performance = 'insufficient'; }
      else if (absent.length) { status = 'undetermined'; performance = 'insufficient'; }
      else { status = 'pending'; performance = 'insufficient'; }
    } else {
      if (isCompetition) {
        if (judged.length >= 4 && scoreRate !== null && scoreRate >= 0.9) performance = 'secure';
        else if (scoreRate !== null && scoreRate >= 0.75) performance = 'independent';
        else if (scoreRate !== null && scoreRate >= 0.4) performance = 'partial';
        else performance = 'difficulty';
        if (judged.length < 2) status = 'preliminary';
        else if (pending.length > 0 && pending.length >= Math.ceil(judged.length * 0.5)) status = 'pending';
        else if (judged.length >= 3 && scoreRate !== null && (scoreRate >= 0.85 || scoreRate <= 0.4)) status = 'sufficient';
        else status = 'preliminary';
      } else {
        performance = pickPerformance(ratio, sorted, hintRecords.length, retryRecords.length, judged.length);
        if (judged.length < 2) status = 'preliminary';
        else if (pending.length > 0 && pending.length >= Math.ceil(judged.length * 0.5)) status = 'pending';
        else if (judged.length >= 3 && (ratio >= 0.85 || ratio <= 0.4)) status = 'sufficient';
        else status = 'preliminary';
      }
      if (lowRecognition.length && judged.length <= 2) status = 'pending';
    }

    var quotes = [];
    var ordered = wrong.concat(pending.filter(function (p) { return wrong.indexOf(p) < 0; }))
      .concat(absent)
      .concat(correct)
      .slice(0, 4);
    ordered.forEach(function (r) { quotes.push(buildQuote(r)); });

    var review = latestDiagnosisReview(state, studentId, kp.id);
    var reviewed = false;
    var teacherNote = '';
    if (review) {
      reviewed = true;
      teacherNote = review.note || '';
      if (review.action === 'mark-undetermined') {
        status = 'undetermined';
      } else if (review.status) {
        status = review.status;
        if (status === 'sufficient' && performance === 'insufficient') performance = 'difficulty';
      }
      if (review.performance) performance = review.performance;
      if (review.errorTypes) {
        errorTypes = review.errorTypes.map(function (key) {
          return { key: key, label: (ERROR_MAP[key] || {}).label || key, count: 1, tone: (ERROR_MAP[key] || {}).tone || 'neutral' };
        });
      }
    }

    var lastAt = sorted.length ? sorted[sorted.length - 1].answer.submittedAt : null;
    if (review && (!lastAt || new Date(review.at) > new Date(lastAt))) lastAt = review.at;

    var diag = {
      id: 'dg_' + studentId + '_' + kp.id,
      studentId: studentId,
      kpId: kp.id,
      kpName: kp.name,
      kpCode: kp.code,
      chapterName: kp.chapterName,
      chapterId: kp.chapterId,
      performance: performance,
      performanceLabel: PERFORMANCE[performance].label,
      performanceTone: PERFORMANCE[performance].tone,
      status: status,
      statusLabel: STATUS[status].label,
      statusTone: STATUS[status].tone,
      errorTypes: errorTypes,
      evidence: {
        answerIds: sorted.map(function (r) { return r.answer.id; }),
        records: sorted.length,
        judged: judged.length,
        correct: correct.length,
        wrong: wrong.length,
        pending: pending.length,
        absent: absent.length,
        excluded: excluded.length,
        scoreRate: scoreRate,
        fullMarks: fullMarks.length,
        partialMarks: partialMarks.length,
        pointLoss: pointLoss.slice(0, 8),
        hintUsed: hintRecords.length,
        retries: retryRecords.length,
        lowRecognition: lowRecognition.length,
        coverageText: judged.length + ' / ' + (sorted.length - absent.length) + ' 条可判读' + (absent.length ? '（另 ' + absent.length + ' 条未作答）' : '') + (excluded.length ? '（' + excluded.length + ' 条异常已标记）' : ''),
        quotes: quotes
      },
      suggestion: buildSuggestion(kp, performance, status, errorTypes, judged.length, pending.length),
      scope: inScope ? 'in-scope' : 'extended',
      reviewed: reviewed,
      teacherNote: teacherNote,
      reviewAt: review ? review.at : null,
      updatedAt: lastAt || null
    };
    return diag;
  }

  function computeForStudent(state, studentId) {
    var qMap = questionMap(state);
    var classId = null;
    (state.users || []).forEach(function (u) { if (u.id === studentId) classId = u.classId; });
    var chapters = classId ? classScope(state, classId) : null;
    var kps = state.knowledgePoints || [];

    var byKp = {};
    var answers = (state.answers || []).filter(function (a) { return a.studentId === studentId; });
    answers.forEach(function (a) {
      var q = qMap[a.questionId];
      if (!q) return;
      (q.kpIds || []).forEach(function (kpId) {
        if (!byKp[kpId]) byKp[kpId] = [];
        byKp[kpId].push({ answer: a, question: q });
      });
    });

    return kps.map(function (kp) {
      return buildOne(state, studentId, kp, byKp[kp.id] || [], chapters, qMap);
    });
  }

  var cache = { state: null, rev: -1, data: {} };

  function computeDiagnostics(state, opts) {
    var o = opts || {};
    var rev = state.__rev || 0;
    if (cache.state !== state || cache.rev !== rev) {
      cache = { state: state, rev: rev, data: {} };
    }
    if (o.studentId) {
      if (!cache.data[o.studentId]) cache.data[o.studentId] = computeForStudent(state, o.studentId);
      return cache.data[o.studentId];
    }
    var out = [];
    if (o.classId) {
      var cls = (state.classes || []).filter(function (c) { return c.id === o.classId; })[0];
      (cls ? cls.studentIds : []).forEach(function (sid) {
        if (!cache.data[sid]) cache.data[sid] = computeForStudent(state, sid);
        out = out.concat(cache.data[sid]);
      });
      return out;
    }
    (state.users || []).forEach(function (u) {
      if (u.role !== 'student') return;
      if (!cache.data[u.id]) cache.data[u.id] = computeForStudent(state, u.id);
      out = out.concat(cache.data[u.id]);
    });
    return out;
  }

  function explain(diag) {
    if (!diag) return '';
    var ev = diag.evidence;
    return '依据：' + ev.records + ' 条相关记录，其中 ' + ev.judged + ' 条可判读；' +
      '表现判定为「' + diag.performanceLabel + '」，诊断状态为「' + diag.statusLabel + '」。' +
      (diag.errorTypes.length ? '主要错误类型：' + diag.errorTypes.map(function (e) { return e.label + '（' + e.count + '）'; }).join('、') + '。' : '');
  }

  ZWZ.diagnosis = {
    ERROR_TYPES: ERROR_TYPES,
    ERROR_MAP: ERROR_MAP,
    PERFORMANCE: PERFORMANCE,
    STATUS: STATUS,
    TYPE_LABELS: TYPE_LABELS,
    performanceLabels: PERFORMANCE,
    statusLabels: STATUS,
    errorTypeLabels: ERROR_MAP,
    errorTypes: ERROR_TYPES,
    errorLabel: function (key) { return (ERROR_MAP[key] || {}).label || '待归因'; },
    errorTone: function (key) { return (ERROR_MAP[key] || {}).tone || 'neutral'; },
    computeDiagnostics: computeDiagnostics,
    computeForStudent: computeForStudent,
    explain: explain,
    clearCache: function () { cache = { state: null, rev: -1, data: {} }; }
  };
})();
