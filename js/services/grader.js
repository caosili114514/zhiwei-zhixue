/* ============================================================
   知微·智学 · 规则判分服务（可替换为真实批阅服务）
   ------------------------------------------------------------
   原则：
   - 客观题（答案明确）按明确答案规则自动判分；
   - 过程题只做“辅助批阅”，必须由教师复核给分；
   - 空白、涂改严重、识别质量低 → “暂无法判阅”，提供人工复核入口；
   - 不编造识别内容与评分依据。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});

  var STATUS_LABELS = {
    auto: '自动判分',
    suggested: '建议复核',
    unjudged: '暂无法判阅',
    reviewed: '教师已复核'
  };

  function normalize(input) {
    if (input === null || input === undefined) return '';
    var s = String(input);
    s = s.replace(/[\uFF01-\uFF5E]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    });
    s = s.replace(/\u3000/g, ' ');
    s = s.replace(/[−–—－]/g, '-');
    s = s.replace(/[×✕✖]/g, '*').replace(/÷/g, '/');
    s = s.replace(/[（）]/g, function (ch) { return ch === '（' ? '(' : ')'; });
    s = s.replace(/[，、；]/g, ',');
    s = s.replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4');
    s = s.replace(/\s+/g, '');
    return s.toLowerCase();
  }

  function toNumber(str) {
    var s = normalize(str);
    if (!s) return null;
    // 仅当整体是一个数（可带符号/小数/分数）时返回数值
    if (!/^-?\d+(\.\d+)?$/.test(s) && !/^-?\d+\/\d+$/.test(s)) return null;
    if (s.indexOf('/') > 0) {
      var parts = s.split('/');
      return Number(parts[0]) / Number(parts[1]);
    }
    return Number(s);
  }

  function matches(question, raw) {
    if (!question) return false;
    var target = normalize(raw);
    if (!target) return false;
    if (target === normalize(question.answer)) return true;
    var accepts = question.accept || [];
    for (var i = 0; i < accepts.length; i++) {
      if (target === normalize(accepts[i])) return true;
    }
    var a = toNumber(raw);
    var b = toNumber(question.answer);
    if (a !== null && b !== null && Math.abs(a - b) < 1e-9) return true;
    return false;
  }

  /** 判分（纯函数，不修改入参） */
  function grade(state, answer, question) {
    var q = question;
    if (!q) {
      return {
        score: null,
        maxScore: 0,
        status: 'unjudged',
        evidence: ['题目数据缺失，无法判读。'],
        note: '题目信息缺失，已进入人工复核队列。'
      };
    }
    var max = (q.scoring && q.scoring.max) || 5;
    var raw = answer && answer.rawAnswer !== undefined && answer.rawAnswer !== null ? String(answer.rawAnswer).trim() : '';

    if (answer && answer.reviewedScore !== undefined && answer.reviewedScore !== null && answer.reviewedScore !== '') {
      return {
        score: Number(answer.reviewedScore),
        maxScore: max,
        status: 'reviewed',
        evidence: ['教师已复核给定分：' + answer.reviewedScore + ' / ' + max, answer.reviewedNote ? '复核说明：' + answer.reviewedNote : ''],
        note: answer.reviewedNote || '教师已完成复核。'
      };
    }

    if (!raw) {
      return {
        score: null,
        maxScore: max,
        status: 'unjudged',
        evidence: ['未检测到有效作答内容。'],
        note: '空白或未提交，暂不判分；缺失记录不计为答错。'
      };
    }

    if (answer.recognition === 'low') {
      return {
        score: null,
        maxScore: max,
        status: 'unjudged',
        evidence: ['作答图像/文本识别质量低，无法确认原始书写内容。', '系统不会猜测识别结果。'],
        note: '识别质量低，需教师核对学生原始作答后再判分。'
      };
    }

    if (q.scoring && q.scoring.mode === 'process') {
      var same = matches(q, raw);
      return {
        score: null,
        maxScore: max,
        status: 'suggested',
        evidence: [
          '过程题按步骤给分，系统不做自动定分。',
          same ? '学生最终结果与参考答案一致，过程仍需教师核对。' : '学生最终结果与参考答案不一致，需教师查看过程判断失分点。',
          '学生作答：「' + raw + '」'
        ],
        note: same
          ? '结果与参考答案一致，建议教师核对过程后给分（系统未计分）。'
          : '结果与参考答案不一致，建议教师复核过程后给分（系统未计分）。'
      };
    }

    var ok = matches(q, raw);
    return {
      score: ok ? max : 0,
      maxScore: max,
      status: 'auto',
      evidence: [
        '题目类型：' + (q.type === 'choice' ? '选择题' : q.type === 'fill' ? '填空题' : '计算题') + '，答案明确，适用自动判分规则。',
        '参考答案：' + q.answer + '；学生作答：' + raw,
        ok ? '两者一致，判定为正确。' : '两者不一致，判定为错误（按“结果对错”规则，不设部分分）。'
      ],
      note: ok ? '自动判分：正确。' : '自动判分：与参考答案不一致；如为书写/识别原因可在复核中修改。'
    };
  }

  /** 把判分结果写回作答记录（不落库，由 store 负责持久化） */
  function apply(state, answer) {
    var q = null;
    for (var i = 0; i < state.questions.length; i++) {
      if (state.questions[i].id === answer.questionId) { q = state.questions[i]; break; }
    }
    var result = grade(state, answer, q);
    answer.score = result.score;
    answer.maxScore = result.maxScore;
    answer.gradeStatus = result.status;
    answer.gradeEvidence = result.evidence;
    answer.gradeNote = result.note;
    return result;
  }

  function countByStatus(state, answers) {
    var rows = answers || state.answers;
    var out = { auto: 0, suggested: 0, unjudged: 0, reviewed: 0 };
    for (var i = 0; i < rows.length; i++) {
      var st = rows[i].gradeStatus || 'unjudged';
      out[st] = (out[st] || 0) + 1;
    }
    return out;
  }

  ZWZ.grader = {
    STATUS_LABELS: STATUS_LABELS,
    normalize: normalize,
    matches: matches,
    grade: grade,
    apply: apply,
    countByStatus: countByStatus
  };
})();
