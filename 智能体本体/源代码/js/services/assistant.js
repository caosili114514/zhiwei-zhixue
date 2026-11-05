/* ============================================================
   知微·智学 · 伴学 / 教学助理服务（本地规则应答，未接入真实大模型）
   ------------------------------------------------------------
   学生端：按“知识点提醒 → 思路提示 → 步骤提示 → 完整解析”分层，
          默认不直接给答案；超出教学范围只给拓展提示。
   教师端：以分析卡片形式输出，必须说明知识点、班级证据、适用条件，
          不替教师作决定；无依据时明确“暂无法判断”。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var fmt = ZWZ.fmt;

  var MODEL_NOTE = '本地规则应答 · 未接入真实大模型';

  function pct(v) {
    return v === null || v === undefined ? '—' : Math.round(v * 100) + '%';
  }

  /* ============================================================
     学生端
     ============================================================ */
  var STUDENT_QUICK_ASKS = [
    '这道题在考哪个知识点？',
    '给我一点思路提示',
    '下一步该怎么做？',
    '我想看完整解析',
    '为什么我这样算不对？'
  ];

  function hintMessage(q, level, scopeExtended) {
    var kpName = (q.kpNames || [])[0] || '当前知识点';
    var msg = {
      id: 'm_' + Date.now(),
      role: 'assistant',
      level: level,
      type: 'hint',
      scope: scopeExtended ? 'extended' : 'in-scope',
      actions: []
    };
    if (level <= 1) {
      msg.title = '第 1 层 · 知识点提醒';
      msg.body = '这道题主要涉及「' + kpName + '」。' + (q.hints && q.hints.kp ? q.hints.kp : '先回忆该知识点的定义与基本性质。');
      msg.actions = [{ label: '再给一点思路提示', action: 'hint', level: 2 }];
    } else if (level === 2) {
      msg.title = '第 2 层 · 思路提示';
      msg.body = (q.hints && q.hints.idea) || '先明确题目要求什么，再找出已知条件与所求量之间的关系。';
      msg.actions = [{ label: '给我步骤提示', action: 'hint', level: 3 }];
    } else if (level === 3) {
      var steps = (q.hints && q.hints.step) || [];
      msg.title = '第 3 层 · 步骤提示';
      msg.body = '按下面顺序尝试，最后一步请自己完成：';
      msg.steps = steps.length > 1 ? steps.slice(0, steps.length - 1) : steps;
      msg.caveat = '提示只覆盖思路与关键步骤，答案与最后一步请自行完成；如需完整解析可继续请求。';
      msg.actions = [
        { label: '我需要完整解析', action: 'hint', level: 4 },
        { label: '回到上一层', action: 'hint', level: 2 }
      ];
    } else {
      msg.title = '第 4 层 · 完整解析';
      msg.body = (q.hints && q.hints.solution) || '参考答案：' + q.answer;
      msg.steps = (q.hints && q.hints.step) || [];
      msg.caveat = '已提供完整解析。本次请求会记录为“使用完整解析”，用于区分独立完成与解析后完成，不影响对你的评价。';
      msg.hintLevel = 4;
      msg.actions = [{ label: '我再看一遍步骤提示', action: 'hint', level: 3 }];
    }
    if (scopeExtended) {
      msg.scopeWarning = '该题涉及的知识点尚未纳入当前教学范围，以下内容属于拓展提示，不作为正式学情诊断依据。';
    }
    return msg;
  }

  function studentReply(state, opts) {
    var o = opts || {};
    var studentId = o.studentId;
    var questionId = o.questionId;
    var message = String(o.message || '').trim();
    var level = o.level || null;
    var q = null;
    if (questionId) {
      for (var i = 0; i < state.questions.length; i++) {
        if (state.questions[i].id === questionId) { q = state.questions[i]; break; }
      }
    }

    var messages = [];
    var hintLevel = null;

    var cls = ZWZ.sel.classOf(state, studentId);
    var chapters = cls ? (cls.scopeChapterIds || []) : [];
    var scopeExtended = false;
    if (q) {
      scopeExtended = (q.kpIds || []).some(function (kpId) {
        var kp = ZWZ.sel.kp(state, kpId);
        if (!kp) return false;
        if (kp.inScope === false) return true;
        return chapters.length && chapters.indexOf(kp.chapterId) < 0;
      });
    }

    if (!q) {
      messages.push({
        id: 'm_' + Date.now(),
        role: 'assistant',
        type: 'guide',
        title: '先进入一道练习吧',
        body: '我可以围绕你当前正在做的题目，按“知识点提醒 → 思路提示 → 步骤提示 → 完整解析”的顺序提供帮助。打开任意一道未完成的题目后，再向我提问会更准确。',
        actions: [{ label: '去练习', hash: '#/student/practice' }]
      });
      return { messages: messages, hintLevel: null, quickAsks: STUDENT_QUICK_ASKS, modelNote: MODEL_NOTE };
    }

    if (level) {
      messages.push(hintMessage(q, Math.min(4, Math.max(1, level)), scopeExtended));
      hintLevel = Math.min(4, Math.max(1, level));
      return { messages: messages, hintLevel: hintLevel, quickAsks: STUDENT_QUICK_ASKS, modelNote: MODEL_NOTE };
    }

    if (!message) {
      messages.push(hintMessage(q, 1, scopeExtended));
      return { messages: messages, hintLevel: 1, quickAsks: STUDENT_QUICK_ASKS, modelNote: MODEL_NOTE };
    }

    /* 关键词路由 */
    if (/答案|结果是多少|直接告诉我/.test(message)) {
      messages.push({
        id: 'm_' + Date.now(),
        role: 'assistant',
        type: 'refuse',
        title: '先别急，试试分层提示',
        body: '直接给答案会减少你自己发现思路的机会。我可以先告诉你这道题涉及的知识点和思路，如果你仍然卡住，可以选择“完整解析”，那时会给出完整步骤并记录本次使用。',
        actions: [
          { label: '先看思路提示', action: 'hint', level: 2 },
          { label: '我确实需要完整解析', action: 'hint', level: 4 }
        ]
      });
      return { messages: messages, hintLevel: null, quickAsks: STUDENT_QUICK_ASKS, modelNote: MODEL_NOTE };
    }

    if (/为什么|不懂|什么意思|概念/.test(message)) {
      messages.push({
        id: 'm_' + Date.now(),
        role: 'assistant',
        type: 'explain',
        title: '知识点解释 · ' + ((q.kpNames || [])[0] || ''),
        body: (q.hints && q.hints.kp) || '这道题考查的是该知识点的基本概念与性质。',
        steps: (q.hints && q.hints.step) ? q.hints.step.slice(0, 1) : [],
        actions: [{ label: '继续看思路提示', action: 'hint', level: 2 }]
      });
      if (scopeExtended) {
        messages[0].scopeWarning = '该内容尚未纳入当前教学范围，属于拓展解释。';
      }
      return { messages: messages, hintLevel: hintLevel, quickAsks: STUDENT_QUICK_ASKS, modelNote: MODEL_NOTE };
    }

    if (/步骤|一步一步|怎么做|下一步/.test(message)) {
      messages.push(hintMessage(q, 3, scopeExtended));
      return { messages: messages, hintLevel: 3, quickAsks: STUDENT_QUICK_ASKS, modelNote: MODEL_NOTE };
    }

    if (/思路|提示|不会|卡住|没想法/.test(message)) {
      messages.push(hintMessage(q, 2, scopeExtended));
      return { messages: messages, hintLevel: 2, quickAsks: STUDENT_QUICK_ASKS, modelNote: MODEL_NOTE };
    }

    if (/知识点|考什么|考哪个/.test(message)) {
      messages.push(hintMessage(q, 1, scopeExtended));
      return { messages: messages, hintLevel: 1, quickAsks: STUDENT_QUICK_ASKS, modelNote: MODEL_NOTE };
    }

    messages.push({
      id: 'm_' + Date.now(),
      role: 'assistant',
      type: 'guide',
      title: '我只能围绕当前题目和已确认的教学范围提供帮助',
      body: '为了避免给出超出当前学习范围或没有依据的内容，我暂时无法回答这个问题。你可以尝试：询问这道题涉及的知识点、请求思路提示、请求步骤提示，或者选择“完整解析”。',
      actions: [
        { label: '这道题考什么', action: 'hint', level: 1 },
        { label: '给我思路提示', action: 'hint', level: 2 },
        { label: '我想看完整解析', action: 'hint', level: 4 }
      ]
    });
    return { messages: messages, hintLevel: null, quickAsks: STUDENT_QUICK_ASKS, modelNote: MODEL_NOTE };
  }

  /* ============================================================
     教师端
     ============================================================ */
  var TEACHER_QUICK_ASKS = [
    '本班目前最需要关注哪些知识点？',
    '学生在哪些错误类型上最集中？',
    '请针对最薄弱的知识点给出教学建议',
    '林以安最近的学习情况怎么样？',
    '这批数据的覆盖情况够不够支撑结论？'
  ];

  function kpCard(state, classId, row, index) {
    var errorText = row.errorTypes.length
      ? row.errorTypes.slice(0, 2).map(function (e) { return e.label + '（' + e.count + ' 次）'; }).join('、')
      : '暂无可归因的错误类型';
    return {
      title: (index !== undefined ? '关注点 ' + (index + 1) + ' · ' : '') + '「' + row.kpName + '」',
      kpName: row.kpName,
      insight: '本班在「' + row.kpName + '」上：' + row.studentsWithRecords + ' 名学生有记录，' +
        '其中 ' + row.weakCount + ' 人目前仍需巩固，掌握较稳定 ' + row.masteredCount + ' 人；' +
        '一次正确率 ' + pct(row.accuracy) + '，数据覆盖 ' + pct(row.coverage) + '，涉及 ' + row.records + ' 条作答记录。',
      evidence: [
        '记录数：' + row.records + ' 条；可判读 ' + row.judged + ' 条；待复核 ' + row.pendingCount + ' 条',
        '主要错误类型：' + errorText,
        '证据范围：' + row.chapterName + ' · 当前教学范围内',
        row.trend ? '时间变化：前段正确率 ' + row.trend.from + '% → 后段 ' + row.trend.to + '%' : '时间变化：该知识点目前只有一个时间段的记录，暂不判断趋势'
      ],
      suggestion: teachingAdvice(row),
      conditions: '适用条件：基于本班 ' + row.records + ' 条模拟数据记录（覆盖 ' + pct(row.coverage) + ' 学生）。若课堂观察与数据不一致，或以教师判断为准。',
      actions: [
        { label: '查看班级学情分析', hash: '#/teacher/analysis' },
        { label: '查看待复核诊断', hash: '#/teacher/review' }
      ]
    };
  }

  function teachingAdvice(row) {
    var top = row.errorTypes[0];
    var byTag = {
      concept: '先用反例辨析概念边界，再安排 3 道判断/辨析题，讲评时要求学生说出判断依据。',
      calculation: '安排 5 道同类符号运算并要求写出每一步的符号理由，重点检查“减去负数”与幂的符号。',
      steps: '使用步骤清单训练完整书写（设、列、解、检验），讲评时对照清单自查遗漏。',
      reading: '先圈画条件与问题再动笔，安排 2 道条件相近的易混题对比审题。',
      method: '对比算术法与方程法的适用条件，让学生说出选择方法的理由。',
      transfer: '在相近情境中做 1—2 道变式题，帮助把方法迁移到新情境。',
      unclassified: '建议先抽查 3—5 份典型作答，人工确认错误类型后再确定讲评重点。'
    };
    var advice = top ? (byTag[top.key] || byTag.unclassified) : '建议先用 3—5 分钟快速核对本知识点的典型作答，再决定是否安排集中讲评。';
    return advice + '（参考建议，最终教学决定由教师作出。）';
  }

  function findStudent(state, classId, message) {
    var students = ZWZ.sel.classStudents(state, classId);
    for (var i = 0; i < students.length; i++) {
      if (message.indexOf(students[i].name) >= 0) return students[i];
    }
    return null;
  }

  function studentCard(state, cls, student) {
    var diags = ZWZ.sel.diagnostics(state, { studentId: student.id, scopeOnly: true });
    var focus = diags.filter(function (d) { return d.performance === 'difficulty'; });
    var strengths = diags.filter(function (d) { return ['secure', 'independent', 'after-hint', 'retry'].indexOf(d.performance) >= 0; });
    var pending = diags.filter(function (d) { return d.status === 'pending'; });
    var overview = ZWZ.sel.studentOverview(state, student.id);
    return {
      title: student.name + ' · 个体学情摘要',
      kpName: focus.length ? focus[0].kpName : (strengths[0] ? strengths[0].kpName : '暂无明显聚焦'),
      insight: '共 ' + overview.stats.records + ' 条作答记录，其中 ' + overview.stats.judged + ' 条可判读，一次正确率 ' +
        pct(overview.stats.accuracy) + '；使用提示 ' + overview.stats.hintCount + ' 次。' +
        (focus.length ? '目前需要关注的知识点有 ' + focus.map(function (d) { return '「' + d.kpName + '」'; }).join('、') + '。' : '目前没有记录显示明显困难。'),
      evidence: diags.filter(function (d) { return d.evidence.records > 0; }).slice(0, 4).map(function (d) {
        return d.kpName + '：' + d.performanceLabel + ' / ' + d.statusLabel + '（可判读 ' + d.evidence.judged + ' 条）';
      }).concat(pending.length ? ['另有 ' + pending.length + ' 项诊断待教师复核'] : []),
      suggestion: focus.length
        ? '建议就「' + focus[0].kpName + '」准备 2—3 道同类基础题进行面批，并结合提示使用记录判断独立完成情况。'
        : '当前记录未显示明显薄弱点，可安排变式题检验迁移能力。',
      conditions: '适用范围：仅教师角色可见；数据为本班 ' + cls.name + ' 的模拟记录，教师可补充课堂观察。',
      actions: [
        { label: '查看个体学情档案', hash: '#/teacher/profile?student=' + student.id },
        { label: '查看该生的诊断证据', hash: '#/teacher/review?student=' + student.id }
      ]
    };
  }

  function teacherReply(state, opts) {
    var o = opts || {};
    var classId = o.classId;
    var message = String(o.message || '').trim();
    var cls = ZWZ.sel.classById(state, classId);
    var result = {
      intent: 'unknown',
      reply: '',
      cards: [],
      followUps: [],
      disclaimer: '以上内容基于当前演示数据与规则分析生成（未接入真实大模型），仅供参考，不替代教师的教学判断与最终决定。',
      modelNote: MODEL_NOTE
    };

    if (!cls) {
      result.reply = '暂无法识别当前班级数据，请先在顶部选择班级。';
      return result;
    }

    var kpRows = ZWZ.sel.kpAnalysis(state, classId);
    var withRecords = kpRows.filter(function (r) { return r.records > 0; });
    var overview = ZWZ.sel.classOverview(state, classId);

    if (!message) {
      result.intent = 'empty';
      result.reply = '你可以直接问我班级学情问题，例如“本班最需要关注哪些知识点”“错误类型集中在哪”“请给出教学建议”。';
      result.followUps = TEACHER_QUICK_ASKS;
      return result;
    }

    var student = findStudent(state, classId, message);
    if (student) {
      result.intent = 'student';
      result.reply = '已按个体维度整理 ' + student.name + ' 的学情摘要（仅教师可见）。';
      result.cards = [studentCard(state, cls, student)];
      result.followUps = ['这个学生最近的变化趋势如何？', '请给出针对性的教学建议', '本班还有哪些学生需要关注？'];
      return result;
    }

    if (/覆盖|样本|数据量|多少条|够不够|可信/.test(message)) {
      result.intent = 'coverage';
      result.reply = '先说明这批数据能支撑什么、不能支撑什么。';
      result.cards = [{
        title: '数据覆盖与结论可靠性',
        kpName: '全班级',
        insight: '本班 ' + overview.studentCount + ' 名学生中 ' + overview.activeStudents + ' 人有作答记录（覆盖 ' + pct(overview.studentCount ? overview.activeStudents / overview.studentCount : 0) + '），共 ' + overview.records + ' 条作答，其中 ' + overview.judged + ' 条可判读，' + overview.pendingGrades + ' 条待复核。',
        evidence: withRecords.map(function (r) {
          return r.kpName + '：' + r.records + ' 条记录 / 覆盖 ' + pct(r.coverage) + ' / 可判读 ' + r.judged + ' 条';
        }),
        suggestion: '建议在记录数少于 3 条或覆盖低于 50% 的知识点上，暂不据此作出班级统一的教学判断；可先补充练习或抽查作业。',
        conditions: '口径：模拟数据；记录数 = 学生提交的作答条数；可判读 = 已完成判分或复核的条数；待复核记录不计入结论。',
        actions: [
          { label: '查看数据覆盖详情', hash: '#/teacher/analysis' },
          { label: '导入更多学情数据', hash: '#/teacher/data' }
        ]
      }];
      result.followUps = ['哪些知识点数据不足？', '待复核的记录有多少？'];
      return result;
    }

    if (/趋势|进步|变化|提升|退步/.test(message)) {
      result.intent = 'trend';
      var trend = overview.trend;
      result.reply = trend.xLabels.length
        ? '按任务时间顺序统计了一次正确率与提示使用率，供你判断变化方向。'
        : '当前只有一次任务的可判读记录，暂不判断时间趋势。';
      result.cards = [{
        title: '班级阶段变化',
        kpName: '全班级',
        insight: trend.xLabels.length
          ? '已按 ' + trend.xLabels.join('、') + ' 三次任务的作答记录统计一次正确率与提示使用率，可对比变化方向。'
          : '记录点不足，暂无法判断趋势。',
        evidence: trend.xLabels.map(function (x, i) {
          return x + '：一次正确率 ' + trend.series[0].points[i] + '%，提示使用率 ' + trend.series[1].points[i] + '%';
        }),
        suggestion: '若正确率上升而提示使用率同时上升，需要区分“提示后完成”与“独立完成”，建议安排一次独立限时练习再判断。',
        conditions: '口径：仅统计已判分记录；不同任务题目难度不完全可比，趋势仅作参考。',
        actions: [{ label: '查看趋势与证据', hash: '#/teacher/analysis' }]
      }];
      result.followUps = ['哪些知识点进步最明显？', '提示使用率为什么上升？'];
      return result;
    }

    if (/复核|待确认|不确定|证据不足/.test(message)) {
      result.intent = 'review';
      var pending = ZWZ.sel.pendingReviews(state, { classId: classId });
      result.reply = '共 ' + pending.grades.length + ' 条批阅待复核、' + pending.diagnoses.length + ' 项诊断待确认。';
      result.cards = [{
        title: '待复核与待确认项',
        kpName: '全班级',
        insight: '过程题与识别质量低的作答不会自动定分；诊断在记录不足或多数记录待复核时不会给出明确结论。',
        evidence: [
          '待复核批阅：' + pending.grades.length + ' 条',
          '待确认诊断：' + pending.diagnoses.length + ' 项',
          '其中暂无法判阅（识别质量低/空白）：' + pending.grades.filter(function (g) { return g.answer.gradeStatus === 'unjudged'; }).length + ' 条'
        ],
        suggestion: '建议优先处理“暂无法判阅”的作答，再确认诊断，避免把缺失数据当作答错处理。',
        conditions: '口径：待复核 = 系统未自动定分或识别质量低的记录。',
        actions: [
          { label: '进入复核中心', hash: '#/teacher/review' },
          { label: '查看批阅队列', hash: '#/teacher/grading' }
        ]
      }];
      result.followUps = ['哪些是暂无法判阅的？', '诊断待确认的是哪些知识点？'];
      return result;
    }

    if (/错误|错因|为什么错|共性|错题/.test(message)) {
      result.intent = 'errors';
      var errors = overview.errorTypes;
      result.reply = errors.length
        ? '按错误类型统计了本班已判分记录中的错误分布，并结合知识点给出参考建议。'
        : '当前没有可归因的错误记录。';
      result.cards = [{
        title: '错误类型分布（全班级）',
        kpName: '全班级',
        insight: errors.length
          ? '错误最集中的类型是「' + errors[0].label + '」（' + errors[0].count + ' 次，占错误记录 ' + pct(errors[0].ratio) + '）。'
          : '暂无可归因的错误类型。',
        evidence: errors.slice(0, 4).map(function (e) { return e.label + '：' + e.count + ' 次（' + pct(e.ratio) + '）'; }),
        suggestion: errors.length
          ? (errors[0].key === 'calculation'
            ? '若以计算/符号错误为主，建议安排一次“符号专项”限时小练，并在讲评中要求学生写出每一步符号处理依据。'
            : '建议结合典型错题进行 10 分钟集中讲评，再布置 2—3 道同类题当堂检测。')
          : '建议先补充练习数据再分析。',
        conditions: '口径：仅统计已判分且判定为错误的记录；待复核记录不计入错误类型统计。',
        actions: [
          { label: '查看典型错题', hash: '#/teacher/analysis' },
          { label: '进入批阅', hash: '#/teacher/grading' }
        ]
      }];
      result.followUps = ['哪些学生在这类错误上最集中？', '请针对最薄弱的知识点给出教学建议'];
      return result;
    }

    if (/建议|怎么办|如何|教学|讲评|安排/.test(message) || /薄弱|最弱|困难|关注|掌握/.test(message)) {
      result.intent = 'advice';
      var ranked = withRecords.slice().sort(function (a, b) { return (b.weakRate || 0) - (a.weakRate || 0); });
      if (!ranked.length) {
        result.reply = '当前班级还没有可判读的作答记录，暂无法给出有依据的教学建议。';
        result.cards = [];
        result.followUps = TEACHER_QUICK_ASKS;
        return result;
      }
      var top = ranked.slice(0, 2);
      result.reply = '按照“仍需巩固学生占比”排序，整理了 ' + top.length + ' 个当前最值得关注的知识点，并附上依据与适用条件。';
      result.cards = top.map(function (row, i) { return kpCard(state, classId, row, i); });
      result.followUps = ['本班还有哪些学生需要关注？', '错误类型集中在哪？', '这批数据的覆盖情况够不够支撑结论？'];
      return result;
    }

    result.intent = 'fallback';
    result.reply = '这个问题暂时无法基于现有数据回答（系统不会在没有依据时给出结论）。我可以回答的方向包括：班级薄弱知识点、错误类型分布、阶段变化、数据覆盖与待复核情况、某位学生的学情摘要。';
    result.followUps = TEACHER_QUICK_ASKS;
    return result;
  }

  ZWZ.assistant = {
    MODEL_NOTE: MODEL_NOTE,
    quickAsks: STUDENT_QUICK_ASKS,
    STUDENT_QUICK_ASKS: STUDENT_QUICK_ASKS,
    TEACHER_QUICK_ASKS: TEACHER_QUICK_ASKS,
    teacherQuickAsks: TEACHER_QUICK_ASKS,
    studentReply: studentReply,
    teacherReply: teacherReply
  };
})();
