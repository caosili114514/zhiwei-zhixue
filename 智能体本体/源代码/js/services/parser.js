/* ============================================================
   知微·智学 · 题目 / 试卷解析服务（模拟解析，可替换为真实 OCR / 抽取服务）
   ------------------------------------------------------------
   说明：
   - 当前为本地模拟解析，不接入真实 OCR / 大模型；
   - 解析结果均标记“模拟解析”，并保留需要教师确认的字段；
   - 不编造识别内容：无法确定的字段用“待教师确认”占位。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});

  var KP_HINTS = {
    kp1: '有理数的概念与数轴',
    kp2: '绝对值与相反数',
    kp3: '有理数的加减运算',
    kp4: '有理数的乘除与乘方',
    kp5: '整式的概念与合并同类项',
    kp6: '去括号与整式加减',
    kp7: '一元一次方程的概念与解法',
    kp8: '列方程解应用题'
  };

  function stamp() {
    return new Date().toISOString();
  }

  function newQuestionId() {
    return 'q_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000);
  }

  function makeQuestion(base) {
    return {
      id: newQuestionId(),
      code: base.code,
      paperId: base.paperId || null,
      type: base.type,
      stem: base.stem,
      options: base.options || null,
      answer: base.answer,
      accept: base.accept || [],
      wrongs: base.wrongs || [],
      scoring: base.scoring || {
        max: base.type === 'process' ? 6 : base.type === 'choice' ? 4 : 5,
        mode: base.type === 'process' ? 'process' : 'exact',
        rule: base.type === 'process' ? '按步骤给分，系统仅做辅助批阅，需教师复核' : '与参考答案一致即得满分，不设部分分'
      },
      kpIds: base.kpIds,
      kpNames: base.kpIds.map(function (id) { return KP_HINTS[id] || id; }),
      chapterId: base.chapterId || 'ch1',
      difficulty: base.difficulty || '基础',
      hints: base.hints || { kp: '', idea: '', step: [], solution: '' },
      errorTags: base.errorTags || [],
      source: base.source || { paperId: null, materialId: 'm2', parseMode: 'mock' },
      status: base.status || 'ai-suggested',
      review: base.review || { needConfirm: false, notes: [] }
    };
  }

  /* 模拟解析出的题目（4 道，其中 2 道存在需确认字段，用于演示人工确认流程） */
  function template() {
    return [
      {
        code: '1',
        type: 'choice',
        stem: '下列计算正确的是（　　）',
        options: ['−2 + (−3) = 5', '−2 − (−3) = −5', '−2 × (−3) = 6', '(−2)³ = 8'],
        answer: 'C',
        wrongs: [{ a: 'A', e: 'calculation' }, { a: 'B', e: 'steps' }, { a: 'D', e: 'concept' }],
        kpIds: ['kp3', 'kp4'],
        chapterId: 'ch1',
        difficulty: '中等',
        errorTags: ['calculation', 'steps', 'concept'],
        hints: {
          kp: '本题考查有理数的加减、乘法与乘方，重点检查符号与运算顺序。',
          idea: '逐项代入计算，注意“减去一个负数”和“负数的奇次幂”。',
          step: ['A 项：−2 + (−3) = −5，不是 5；', 'B 项：−2 − (−3) = −2 + 3 = 1；', 'C 项：−2 × (−3) = 6，正确；', 'D 项：(−2)³ = −8。'],
          solution: '−2 × (−3) = 6，所以选 C。'
        },
        status: 'ai-suggested',
        review: { needConfirm: true, notes: ['选项 D 的识别内容存在涂改痕迹，已按“(−2)³ = 8”还原，请教师确认。'] }
      },
      {
        code: '2',
        type: 'choice',
        stem: '在数轴上，点 A 表示 −1，点 B 表示 4，则 A、B 两点之间的距离是（　　）',
        options: ['3', '5', '−5', '4'],
        answer: 'B',
        wrongs: [{ a: 'A', e: 'reading' }, { a: 'C', e: 'concept' }, { a: 'D', e: 'reading' }],
        kpIds: ['kp1'],
        chapterId: 'ch1',
        difficulty: '基础',
        errorTags: ['reading', 'concept'],
        hints: {
          kp: '数轴上两点之间的距离等于两点所表示数的差的绝对值。',
          idea: '用“右边的数减去左边的数”，再取绝对值。',
          step: ['4 − (−1) = 5；', '距离不能为负数，取绝对值仍为 5。'],
          solution: '距离 = |4 − (−1)| = 5，选 B。'
        },
        status: 'ai-suggested',
        review: { needConfirm: false, notes: [] }
      },
      {
        code: '3',
        type: 'process',
        stem: '计算：−2³ + (−3) × (−2) − 5，请写出计算过程。',
        options: null,
        answer: '−? ',
        accept: [],
        wrongs: [],
        kpIds: ['kp4'],
        chapterId: 'ch1',
        difficulty: '中等',
        errorTags: ['calculation', 'steps'],
        hints: {
          kp: '混合运算顺序：先乘方，再乘除，最后加减。',
          idea: '注意 −2³ 与 (−2)³ 的区别：前者是 2³ 的相反数。',
          step: ['−2³ = −8；', '(−3) × (−2) = 6；', '原式 = −8 + 6 − 5 = −7。'],
          solution: '−2³ + (−3) × (−2) − 5 = −8 + 6 − 5 = −7。'
        },
        status: 'ai-suggested',
        review: { needConfirm: true, notes: ['标准答案区域识别失败，系统未填写答案，请教师补充或确认。'] }
      },
      {
        code: '4',
        type: 'process',
        stem: '某商店购进一批文具，每件进价 8 元，按进价提高 50% 后标价，再按标价打八折出售。每件文具的利润是多少元？',
        options: null,
        answer: '1.6',
        accept: ['1.6元', '1.6 元'],
        wrongs: [{ a: '2.4', e: 'method' }, { a: '0.8', e: 'calculation' }],
        kpIds: ['kp8'],
        chapterId: 'ch3',
        difficulty: '提升',
        errorTags: ['method', 'calculation'],
        hints: {
          kp: '列方程解应用题：先明确“进价、标价、售价、利润”的数量关系。',
          idea: '标价 = 进价 × (1 + 50%)，售价 = 标价 × 80%，利润 = 售价 − 进价。',
          step: ['标价 = 8 × 1.5 = 12（元）；', '售价 = 12 × 0.8 = 9.6（元）；', '利润 = 9.6 − 8 = 1.6（元）。'],
          solution: '8 × 1.5 × 0.8 − 8 = 9.6 − 8 = 1.6（元），每件利润 1.6 元。'
        },
        status: 'ai-suggested',
        review: { needConfirm: false, notes: [] }
      }
    ];
  }

  /** 模拟解析一份试卷文件，返回待确认的题目与警告 */
  function parsePaper(fileMeta) {
    var meta = fileMeta || {};
    var name = meta.fileName || '未命名文件';
    var baseTitle = name.replace(/\.[^.]+$/, '');
    var rows = template();
    var warnings = [];
    var questions = rows.map(function (row) {
      row.source = { paperId: null, materialId: null, parseMode: 'mock' };
      if (row.answer === '−? ') {
        row.answer = '';
        row.review.needConfirm = true;
      }
      return makeQuestion(row);
    });

    questions.forEach(function (q) {
      if (q.review && q.review.needConfirm) {
        warnings.push('第 ' + q.code + ' 题：' + (q.review.notes[0] || '存在需教师确认的字段'));
      }
    });
    warnings.push('本次为“模拟解析”：未接入真实 OCR 服务，题目文字与答案为演示占位，请教师逐题核对后确认。');

    return {
      mode: 'mock',
      title: baseTitle || '未命名试卷',
      source: {
        fileName: name,
        type: meta.type || 'pdf',
        size: meta.size || 0,
        uploadedAt: stamp()
      },
      questions: questions,
      warnings: warnings,
      confidence: 0.78
    };
  }

  function blankQuestion(chapterId) {
    return {
      id: newQuestionId(),
      code: '新',
      paperId: null,
      type: 'choice',
      stem: '',
      options: ['', '', '', ''],
      answer: '',
      accept: [],
      wrongs: [],
      scoring: { max: 4, mode: 'exact', rule: '与参考答案一致即得满分，不设部分分' },
      kpIds: [],
      kpNames: [],
      chapterId: chapterId || 'ch1',
      difficulty: '基础',
      hints: { kp: '', idea: '', step: [], solution: '' },
      errorTags: [],
      source: { paperId: null, materialId: null, parseMode: 'manual' },
      status: 'draft',
      review: { needConfirm: true, notes: ['手动录入题目，需教师确认知识点与答案。'] }
    };
  }

  ZWZ.parser = {
    parsePaper: parsePaper,
    blankQuestion: blankQuestion,
    makeQuestion: makeQuestion,
    KP_HINTS: KP_HINTS
  };
})();
