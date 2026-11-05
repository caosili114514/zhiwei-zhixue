/* ============================================================
   知微·智学 · 正式赛题数据适配层（Competition Dataset Adapter）
   ------------------------------------------------------------
   - 输入：js/data/official-data.js（由 data/official/*.csv 自动生成）
   - 输出：与现有 store/selectors/diagnosis 兼容的 state
   - 不修改原始 CSV；原始行、修订版本、异常均保留在 state.dataQuality / answerHistory
   - 不硬编码 40 人 / 806 条 / DC01 / DC02 等数量
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});

  var TYPE_MAP = { '选择题': 'choice', '填空题': 'fill', '解答题': 'process' };

  function iso(dateStr) {
    return dateStr + 'T08:00:00+08:00';
  }
  function dueIso(dateStr) {
    return dateStr + 'T23:59:59+08:00';
  }
  function splitIds(value, sep) {
    return String(value || '').split(sep || '、').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function toNum(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  function parsePointScores(text) {
    var out = {};
    String(text || '').split('；').forEach(function (part) {
      var m = String(part).trim().match(/^([A-Za-z0-9]+)=(-?\d+(?:\.\d+)?)$/);
      if (m) out[m[1]] = Number(m[2]);
    });
    return out;
  }
  function parseScoringPoints(text) {
    return String(text || '').split('\n').map(function (line, i) {
      var t = String(line || '').trim();
      if (!t) return null;
      var m = t.match(/^(\S+)\s+(.+?)\s*(\d+(?:\.\d+)?)\s*分$/);
      if (!m) return { id: 'P' + (i + 1), label: t, score: null, order: i + 1 };
      return { id: m[1], label: m[2].trim(), score: Number(m[3]), order: i + 1 };
    }).filter(Boolean);
  }
  function parseOptions(text) {
    return String(text || '').split('\n').map(function (line) {
      var t = String(line || '').trim();
      if (!t) return '';
      return t.replace(/^[A-DＡ-Ｄ][.．、]\s*/, '');
    }).filter(function (x) { return x !== ''; });
  }

  /* 评分点关键词 → 现有错误类型（仅规则推断；不确定则 unclassified） */
  var POINT_ERROR_RULES = [
    { re: /去括号|括号|符号/, tag: 'calculation' },
    { re: /合并同类项|化简|计算|代入|数值/, tag: 'calculation' },
    { re: /去分母|移项|求解|检验|核对|回代/, tag: 'steps' },
    { re: /列式|关系|数量关系|建模|等量关系|设/, tag: 'concept' },
    { re: /解集|反向|端点|范围|交集/, tag: 'concept' },
    { re: /方法|消元|选择/, tag: 'method' }
  ];
  function inferErrorTag(question, pointScores) {
    if (!question || !pointScores || !question.scoringPoints || !question.scoringPoints.length) return null;
    var failed = question.scoringPoints.filter(function (p) { return pointScores[p.id] !== undefined && Number(pointScores[p.id]) <= 0; });
    if (!failed.length) return null;
    for (var i = 0; i < failed.length; i++) {
      for (var j = 0; j < POINT_ERROR_RULES.length; j++) {
        if (POINT_ERROR_RULES[j].re.test(failed[i].label)) {
          return { tag: POINT_ERROR_RULES[j].tag, source: 'scoring-point-rule', point: failed[i] };
        }
      }
    }
    return { tag: 'unclassified', source: 'scoring-point-rule', point: failed[0] };
  }

  function themeOfMaterial(name) {
    var s = String(name || '');
    if (/不等式/.test(s)) return 'T03';
    if (/方程|方程组/.test(s)) return 'T02';
    if (/代数式|整式/.test(s)) return 'T01';
    return '';
  }

  function build(rawArg) {
    var sourceData = rawArg || ZWZ.officialData || {};
    var raw = sourceData.tables || {};
    var courseRows = raw.courseRequirements || [];
    var materialRows = raw.materials || [];
    var studentRows = raw.students || [];
    var nodeRows = raw.nodes || [];
    var answerRows = raw.answers || [];

    /* ---------- 主题 / 指标 ---------- */
    var themes = [];
    var themeMap = {};
    courseRows.forEach(function (r) {
      var tid = String(r['主题编号'] || '').trim();
      if (!tid || themeMap[tid]) return;
      var theme = {
        id: tid, code: tid, name: String(r['主题'] || '').trim(),
        goal: String(r['主题目标'] || '').trim(),
        standardRef: String(r['课标整理编号'] || '').trim(),
        standardPages: String(r['课标文件页／正文页'] || '').trim(),
        textbookPages: String(r['教材正文页'] || '').trim()
      };
      themeMap[tid] = theme;
      themes.push(theme);
    });

    var indicators = courseRows.map(function (r, i) {
      var tid = String(r['主题编号'] || '').trim();
      var theme = themeMap[tid] || { name: tid, goal: '' };
      return {
        id: String(r['指标编号'] || '').trim(),
        code: String(r['指标编号'] || '').trim(),
        name: String(r['观察指标'] || '').trim(),
        themeId: tid,
        chapterId: tid,
        chapterName: theme.name,
        standardRef: String(r['课标整理编号'] || '').trim(),
        standardPages: String(r['课标文件页／正文页'] || '').trim(),
        textbookPages: String(r['教材正文页'] || '').trim(),
        desc: theme.goal,
        inScope: true,
        order: i + 1
      };
    });
    var indicatorMap = {};
    indicators.forEach(function (k) { indicatorMap[k.id] = k; });

    /* ---------- 学习卡 / 教材材料（L/B） ---------- */
    var materials = [];
    var cardByTheme = {};
    materialRows.forEach(function (m) {
      var type = String(m['材料类型'] || '').trim();
      if (type === '题目') return;
      var id = String(m['材料编号'] || '').trim();
      var content = String(m['题干或内容'] || '').trim();
      var themeId = String(m['主题编号'] || '').trim() || themeOfMaterial(content);
      var theme = themeMap[themeId] || null;
      var indicatorsOf = splitIds(m['指标编号']);
      var mat = {
        id: id, officialId: id,
        name: type === '学习卡' ? ((theme ? theme.name : '') + ' · 学习卡') : content.split('\n')[0],
        content: content,
        type: type,
        themeId: themeId,
        themeName: theme ? theme.name : '',
        indicatorIds: indicatorsOf,
        kpIds: indicatorsOf,
        chapterIds: themeId ? [themeId] : [],
        source: String(m['来源或资料文件'] || '').trim(),
        status: '已确认',
        version: 'official-2026',
        note: type === '学习卡' ? '官方学习卡，可作为建议材料' : '官方教材切片，可作为建议材料'
      };
      materials.push(mat);
      if (type === '学习卡' && themeId) cardByTheme[themeId] = mat;
    });

    /* ---------- 题目 ---------- */
    var questions = [];
    var questionMap = {};
    materialRows.forEach(function (m) {
      if (String(m['材料类型'] || '').trim() !== '题目') return;
      var id = String(m['材料编号'] || '').trim();
      var themeId = String(m['主题编号'] || '').trim();
      var theme = themeMap[themeId] || { name: themeId };
      var indicatorId = splitIds(m['指标编号'])[0] || '';
      var indicator = indicatorMap[indicatorId] || { name: indicatorId };
      var type = TYPE_MAP[String(m['题型'] || '').trim()] || 'fill';
      var max = toNum(m['满分']);
      var scoringPoints = parseScoringPoints(m['评分点']);
      var card = cardByTheme[themeId];
      var explanation = String(m['参考解析'] || '').trim();
      var q = {
        id: id, officialId: id, code: id,
        paperId: null,
        type: type,
        stem: String(m['题干或内容'] || '').trim(),
        options: type === 'choice' ? parseOptions(m['选项']) : null,
        answer: String(m['参考答案'] || '').trim(),
        accept: [],
        wrongs: [],
        scoring: {
          max: max === null ? (type === 'process' ? 3 : 1) : max,
          mode: type === 'process' ? 'process' : 'exact',
          rule: type === 'process' ? '官方评分点给分；系统仅展示各评分点得分，不自动重新判分' : '与参考答案一致得满分（官方 1 分题）'
        },
        scoringPoints: scoringPoints,
        explanation: explanation,
        kpIds: indicatorId ? [indicatorId] : [],
        kpNames: indicatorId ? [indicator.name] : [],
        chapterId: themeId,
        chapterName: theme.name,
        themeId: themeId,
        indicatorId: indicatorId,
        difficulty: '',
        hints: {
          kp: card ? card.content : (indicator.name || ''),
          idea: '',
          step: explanation ? explanation.split('；').filter(Boolean) : [],
          solution: explanation
        },
        errorTags: [],
        source: { materialId: id, materialType: '题目', source: String(m['来源或资料文件'] || '').trim(), themeId: themeId },
        status: 'confirmed',
        review: { needConfirm: false, notes: [] }
      };
      questions.push(q);
      questionMap[id] = q;
    });

    /* ---------- 学生 / 班级 ---------- */
    var classMap = {};
    studentRows.forEach(function (s) {
      var cid = String(s['模拟班级编号'] || '').trim();
      if (!classMap[cid]) classMap[cid] = [];
      classMap[cid].push(String(s['学生编号'] || '').trim());
    });
    var classes = Object.keys(classMap).sort().map(function (cid) {
      return {
        id: cid,
        name: cid + ' 模拟班',
        grade: '七年级',
        teacherId: 'T01',
        studentIds: classMap[cid].slice(),
        term: '2026 学年',
        scopeChapterIds: themes.map(function (t) { return t.id; })
      };
    });
    var users = [{
      id: 'T01', role: 'teacher', name: '赛题教师（模拟）', classIds: classes.map(function (c) { return c.id; }),
      title: '七年级数学教师', avatarSeed: 'T01', note: '主办方数据未提供教师身份，此处为演示用模拟教师'
    }];
    var studentClass = {};
    studentRows.forEach(function (s) {
      var sid = String(s['学生编号'] || '').trim();
      var cid = String(s['模拟班级编号'] || '').trim();
      studentClass[sid] = cid;
      users.push({
        id: sid, role: 'student', name: sid, classId: cid, avatarSeed: sid,
        note: '模拟学生（匿名编号）', grade: s['年级']
      });
    });

    /* ---------- 测验节点 → 任务 ---------- */
    var tasks = [];
    var papers = [];
    var nodeMap = {};
    nodeRows.forEach(function (n) {
      var nid = String(n['节点编号'] || '').trim();
      var qids = splitIds(n['可用题目编号']);
      var date = String(n['模拟测验日期'] || '').trim();
      var themesTaught = splitIds(n['已教及测量主题']);
      nodeMap[nid] = { id: nid, date: date, questionIds: qids, themesTaught: themesTaught, desc: String(n['说明'] || '').trim() };
      classes.forEach(function (cls) {
        var taskId = nid + '_' + cls.id;
        tasks.push({
          id: taskId, nodeId: nid, classId: cls.id,
          title: '测验 ' + nid + ' · ' + cls.name,
          paperId: 'paper_' + nid + '_' + cls.id,
          questionIds: qids.slice(),
          assignedAt: iso(date), dueAt: dueIso(date),
          status: 'closed',
          themesTaught: themesTaught.slice(),
          scopeNote: nodeMap[nid].desc,
          nodeDate: date
        });
        papers.push({
          id: 'paper_' + nid + '_' + cls.id, title: '测验 ' + nid + ' · ' + cls.name,
          classId: cls.id, questionIds: qids.slice(), status: 'confirmed',
          createdAt: iso(date), source: { fileName: '官方数据 · ' + nid, type: 'official', size: 0 },
          parseMode: 'official', materialId: ''
        });
      });
    });

    /* ---------- 作答记录：按事件聚合，取最新修订 ---------- */
    var byEvent = {};
    answerRows.forEach(function (r) {
      var eid = String(r['作答事件编号'] || '').trim() ||
        (String(r['学生编号']) + '-' + String(r['节点编号']) + '-' + String(r['材料编号']));
      if (!byEvent[eid]) byEvent[eid] = [];
      byEvent[eid].push(r);
    });

    var answers = [];
    var answerHistory = [];
    var qualityIssues = [];
    var revisionEvents = 0;
    var statusCounts = { '已评分': 0, '待评分': 0, '未作答': 0 };
    var rawStatusCounts = { '已评分': 0, '待评分': 0, '未作答': 0 };
    answerRows.forEach(function (r) {
      var st0 = String(r['评分状态'] || '').trim();
      if (rawStatusCounts[st0] !== undefined) rawStatusCounts[st0]++;
    });
    var excludedCount = 0;

    Object.keys(byEvent).forEach(function (eid) {
      var versions = byEvent[eid].slice().sort(function (a, b) {
        var ra = toNum(a['修订版本']) || 1;
        var rb = toNum(b['修订版本']) || 1;
        if (ra !== rb) return ra - rb;
        return new Date(a['模拟提交时间'] || 0) - new Date(b['模拟提交时间'] || 0);
      });
      var latest = versions[versions.length - 1];
      var rev = toNum(latest['修订版本']) || 1;
      var status = String(latest['评分状态'] || '').trim();
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      var sid = String(latest['学生编号'] || '').trim();
      var cid = studentClass[sid] || '';
      var nid = String(latest['节点编号'] || '').trim();
      var qid = String(latest['材料编号'] || '').trim();
      var node = nodeMap[nid] || null;
      var q = questionMap[qid] || null;
      var pointScores = parsePointScores(latest['评分点得分']);
      var score = toNum(latest['得分']);
      var maxScore = toNum(latest['满分']);
      var flags = [];

      if (score !== null && maxScore !== null && (score < 0 || score > maxScore)) {
        flags.push({ type: 'score_out_of_range', detail: '得分 ' + score + ' 超出满分 ' + maxScore });
      }
      if (score !== null && Object.keys(pointScores).length) {
        var sum = Object.keys(pointScores).reduce(function (n, k) { return n + Number(pointScores[k] || 0); }, 0);
        if (sum !== score) flags.push({ type: 'point_sum_mismatch', detail: '评分点合计 ' + sum + ' ≠ 总分 ' + score });
      }
      if (node && node.questionIds.length && node.questionIds.indexOf(qid) < 0) {
        flags.push({ type: 'node_question_mismatch', detail: '题目 ' + qid + ' 不在节点 ' + nid + ' 可用题目中' });
      }


      var gradeStatus = status === '已评分' ? 'auto' : (status === '待评分' ? 'suggested' : 'unjudged');
      var attemptStatus = status === '未作答' ? 'unanswered' : (status === '待评分' ? 'pending' : 'answered');
      var incorrect = score !== null && maxScore !== null && score < maxScore;
      var inferred = incorrect ? inferErrorTag(q, pointScores) : null;
      var answer = {
        id: String(latest['记录编号'] || eid),
        recordId: String(latest['记录编号'] || ''),
        eventId: eid,
        revision: rev,
        versionsCount: versions.length,
        officialGradeStatus: status,
        gradeStatus: gradeStatus,
        attemptStatus: attemptStatus,
        studentId: sid,
        taskId: nid + '_' + cid,
        nodeId: nid,
        themeId: String(latest['主题编号'] || '') || (q ? q.themeId : ''),
        questionId: qid,
        materialId: qid,
        submittedAt: String(latest['模拟提交时间'] || ''),
        rawAnswer: String(latest['学生最终作答'] || ''),
        solution: String(latest['解答过程'] || ''),
        score: score,
        maxScore: maxScore,
        pointScores: pointScores,
        errorTag: inferred ? inferred.tag : null,
        errorTagSource: inferred ? inferred.source : '',
        errorPoint: inferred ? inferred.point : null,
        recognition: 'ok',
        hintLevels: [],
        attempts: 1,
        durationSec: 0,
        source: 'official',
        flags: flags,
        excludeFromStats: flags.length > 0,
        reviewedBy: null,
        reviewedAt: null,
        reviewedNote: '',
        officialRow: {
          recordId: latest['记录编号'], revision: rev, status: status, score: latest['得分'],
          maxScore: latest['满分'], submittedAt: latest['模拟提交时间']
        }
      };
      if (flags.length) {
        excludedCount++;
        flags.forEach(function (f) {
          qualityIssues.push({
            type: f.type, recordId: answer.recordId, eventId: eid,
            rawValue: f.detail, rule: f.type, status: '已标记（未自动修正）',
            inStats: false, needsReview: true, linked: answer.recordId
          });
        });
      }
      answers.push(answer);

      if (versions.length > 1) {
        revisionEvents++;
        var hist = versions.slice(0, -1).map(function (v) {
          return {
            recordId: v['记录编号'], revision: toNum(v['修订版本']) || 1,
            submittedAt: v['模拟提交时间'], gradeStatus: v['评分状态'], score: v['得分'],
            pointScores: parsePointScores(v['评分点得分'])
          };
        });
        answerHistory.push({ eventId: eid, latestRecordId: answer.recordId, versions: hist });
        qualityIssues.push({
          type: 'revision_version', recordId: answer.recordId, eventId: eid,
          rawValue: '共 ' + versions.length + ' 个版本，最新 v' + rev,
          rule: '同一作答事件取最新修订版本参与统计，历史版本保留',
          status: '自动取最新版', inStats: true, needsReview: false, linked: answer.recordId
        });
      }
    });

    /* 未作答 / 待评分 质量说明（不进入错误统计） */
    answers.forEach(function (a) {
      if (a.attemptStatus === 'unanswered') {
        qualityIssues.push({
          type: 'unanswered', recordId: a.recordId, eventId: a.eventId,
          rawValue: '未作答（无得分）', rule: '未作答不等于答错；不进入错误率/掌握率分母',
          status: '保留原状', inStats: false, needsReview: false, linked: a.recordId
        });
      } else if (a.attemptStatus === 'pending') {
        qualityIssues.push({
          type: 'pending_score', recordId: a.recordId, eventId: a.eventId,
          rawValue: '待评分（无得分）', rule: '待评分不等于错误；不进入错误率/掌握率分母',
          status: '保持待评分', inStats: false, needsReview: true, linked: a.recordId
        });
      }
    });

    var rawCounts = sourceData.counts || {};
    var dataQuality = {
      datasetVersion: sourceData.version || '2026-11-05',
      importedAt: new Date().toISOString(),
      source: sourceData.source || '',
      rawRows: answerRows.length,
      analysisRecords: answers.length,
      revisionEvents: revisionEvents,
      statusCounts: statusCounts,
      analysisStatusCounts: statusCounts,
      rawStatusCounts: rawStatusCounts,
      excludedCount: excludedCount,
      issues: qualityIssues,
      tableCounts: {
        courseRequirements: courseRows.length,
        materials: materialRows.length,
        questions: questions.length,
        students: studentRows.length,
        nodes: nodeRows.length,
        answers: answerRows.length
      },
      rawCounts: rawCounts
    };

    var importRow = {
      id: 'imp_official_1', at: new Date().toISOString(),
      fileName: '官方模拟学情数据（6 个 CSV）', type: 'official', rows: answerRows.length,
      ok: answers.length, issues: [], fieldMap: {},
      status: '已确认', note: '官方数据 · 仅用于本次比赛'
    };

    var state = {
      meta: {
        appName: '知微·智学',
        version: '1.0.0 · 赛题数据版',
        dataMode: 'competition',
        term: '2026 学年',
        generatedAt: new Date().toISOString(),
        datasetVersion: dataQuality.datasetVersion,
        source: dataQuality.source,
        demoNotice: '本数据集为主办方提供的模拟学情数据（学生/班级/成绩均为模拟），仅用于本次比赛，不包含真实学生个人信息。',
        textbook: {
          name: '义务教育教科书 · 数学（官方教材切片 B01–B08）',
          edition: '赛题材料提供',
          confirmed: true
        },
        scope: {
          term: '2026 学年',
          chapters: themes.map(function (t) { return t.id; }),
          note: '学习范围以赛题课程要求 T01–T03 及两个测验节点 N01/N02 为准。'
        },
        engine: {
          diagnosis: '规则引擎（按观察指标聚合；异常记录不进入统计）',
          grader: '规则判分（官方数据已给分；系统只展示与复核，不重判）',
          assistant: '本地规则应答（未接入真实大模型）'
        }
      },
      users: users,
      classes: classes,
      chapters: themes,
      knowledgePoints: indicators,
      themes: themes,
      indicators: indicators,
      materials: materials,
      questions: questions,
      papers: papers,
      tasks: tasks,
      answers: answers,
      answerHistory: answerHistory,
      dataQuality: dataQuality,
      reviews: [],
      imports: [importRow],
      auditLogs: [{
        id: 'log_official_1', at: new Date().toISOString(), actorId: 'T01', role: 'teacher',
        action: '导入官方赛题数据', detail: '学生 ' + studentRows.length + ' 名 · 作答 ' + answerRows.length + ' 行 · 题目 ' + questions.length + ' 道',
        targetType: 'import', targetId: importRow.id
      }],
      drafts: {},
      hintEvents: [],
      assistantThreads: { teacher: [], students: {} },
      diagnosisReviews: [],
      studentProfiles: {}
    };
    state.__rev = 1;
    return state;
  }


  /* ---------------- 导入校验（供交互式导入使用） ---------------- */
  function validate(tables) {
    var t = tables || {};
    var errors = [];
    var warnings = [];
    function need(name, label) {
      if (!Array.isArray(t[name]) || !t[name].length) { errors.push('缺少数据表：' + label + '（' + name + '）'); return false; }
      return true;
    }
    var ok = true;
    ok = need('courseRequirements', '课程要求') && ok;
    ok = need('materials', '题目与材料') && ok;
    ok = need('students', '模拟学生') && ok;
    ok = need('nodes', '测验节点') && ok;
    ok = need('answers', '作答记录') && ok;
    if (!ok) return { ok: false, errors: errors, warnings: warnings, counts: {} };

    function field(row, name) { return row && row[name] !== undefined ? String(row[name]).trim() : ''; }
    var req = ['主题编号', '主题', '指标编号', '观察指标'];
    t.courseRequirements.forEach(function (r, i) {
      req.forEach(function (f) { if (!field(r, f)) errors.push('课程要求第 ' + (i + 1) + ' 行缺少 ' + f); });
    });
    var stuIds = {};
    t.students.forEach(function (r, i) {
      var id = field(r, '学生编号'); var cid = field(r, '模拟班级编号');
      if (!id || !cid) errors.push('模拟学生第 ' + (i + 1) + ' 行缺少学生编号或班级编号');
      if (id && stuIds[id]) errors.push('学生编号重复：' + id);
      stuIds[id] = true;
    });
    var questionIds = {};
    t.materials.forEach(function (r, i) {
      var id = field(r, '材料编号');
      if (!id) errors.push('题目与材料第 ' + (i + 1) + ' 行缺少材料编号');
      if (id && questionIds[id]) errors.push('材料编号重复：' + id);
      questionIds[id] = true;
    });
    var nodeIds = {};
    t.nodes.forEach(function (r, i) {
      var id = field(r, '节点编号');
      if (!id) errors.push('测验节点第 ' + (i + 1) + ' 行缺少节点编号');
      nodeIds[id] = true;
    });
    var eventVersions = {};
    var statuses = { '已评分': 1, '待评分': 1, '未作答': 1 };
    t.answers.forEach(function (r, i) {
      var sid = field(r, '学生编号'); var qid = field(r, '材料编号'); var nid = field(r, '节点编号');
      var eid = field(r, '作答事件编号') || (sid + '-' + nid + '-' + qid);
      var ver = Number(field(r, '修订版本') || 1);
      var st = field(r, '评分状态');
      if (!sid || !qid || !nid) errors.push('作答记录第 ' + (i + 1) + ' 行缺少学生/材料/节点');
      if (sid && !stuIds[sid]) errors.push('作答记录第 ' + (i + 1) + ' 行学生不存在：' + sid);
      if (qid && !questionIds[qid]) errors.push('作答记录第 ' + (i + 1) + ' 行材料不存在：' + qid);
      if (nid && !nodeIds[nid]) errors.push('作答记录第 ' + (i + 1) + ' 行节点不存在：' + nid);
      if (!statuses[st]) errors.push('作答记录第 ' + (i + 1) + ' 行评分状态非法：' + st);
      if (!/^\d+$/.test(String(field(r, '修订版本') || '1'))) warnings.push('作答记录第 ' + (i + 1) + ' 行修订版本非整数，按 1 处理');
      var key = eid + '#' + ver;
      if (eventVersions[key]) errors.push('同一作答事件存在重复版本：' + eid + ' v' + ver);
      eventVersions[key] = true;
    });
    return {
      ok: errors.length === 0,
      errors: errors.slice(0, 100),
      warnings: warnings,
      counts: {
        courseRequirements: t.courseRequirements.length,
        materials: t.materials.length,
        questions: t.materials.filter(function (r) { return field(r, '材料类型') === '题目'; }).length,
        students: t.students.length,
        classes: Object.keys(t.students.reduce(function (a, r) { var c = field(r, '模拟班级编号'); if (c) a[c] = 1; return a; }, {})).length,
        nodes: t.nodes.length,
        answers: t.answers.length
      }
    };
  }

  ZWZ.official = {
    build: build,
    validate: validate,
    TYPE_MAP: TYPE_MAP,
    parsePointScores: parsePointScores,
    parseScoringPoints: parseScoringPoints
  };
})();


