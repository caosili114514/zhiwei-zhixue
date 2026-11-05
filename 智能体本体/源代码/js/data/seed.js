/* ============================================================
   知微·智学 · 演示数据种子（全部为虚构模拟数据）
   ------------------------------------------------------------
   说明：
   - 所有学生、教师、班级、成绩、作答均为虚构，仅用于产品演示。
   - 教材版本为示例配置，标注“待教师确认”，不假设真实出版社/版本。
   - 在本文件之外生成的数据（学生现场作答、教师复核）会写入 localStorage。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});

  /* 确定性随机数（保证每次刷新演示数据一致） */
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function iso(dateStr) {
    return new Date(dateStr).toISOString();
  }

  function addMinutes(baseIso, minutes) {
    return new Date(new Date(baseIso).getTime() + minutes * 60000).toISOString();
  }

  /* ---------------- 章节与知识点 ---------------- */
  var CHAPTERS = [
    { id: 'ch1', name: '第一章 有理数', order: 1 },
    { id: 'ch2', name: '第二章 整式的加减', order: 2 },
    { id: 'ch3', name: '第三章 一元一次方程', order: 3 },
    { id: 'ch4', name: '第四章 几何图形初步', order: 4 }
  ];

  var KPS = [
    { id: 'kp1', code: '1.1', name: '有理数的概念与数轴', chapterId: 'ch1', difficulty: '基础', desc: '正负数、数轴三要素、数轴上两点距离，以及点在数轴上移动的方向判断。' },
    { id: 'kp2', code: '1.2', name: '绝对值与相反数', chapterId: 'ch1', difficulty: '基础', desc: '绝对值的几何意义与代数意义，相反数的概念，含绝对值的化简与比较大小。' },
    { id: 'kp3', code: '1.3', name: '有理数的加减运算', chapterId: 'ch1', difficulty: '基础', desc: '同号、异号两数相加的法则，减法转化为加法，以及实际情境中的温差、位移问题。' },
    { id: 'kp4', code: '1.4', name: '有理数的乘除与乘方', chapterId: 'ch1', difficulty: '中等', desc: '乘除法则与符号判断，乘方的意义与幂的符号规律，混合运算顺序。' },
    { id: 'kp5', code: '2.1', name: '整式的概念与合并同类项', chapterId: 'ch2', difficulty: '基础', desc: '单项式、多项式、同类项的判定，合并同类项的法则。' },
    { id: 'kp6', code: '2.2', name: '去括号与整式加减', chapterId: 'ch2', difficulty: '中等', desc: '去括号时符号的变化规律，整式加减的一般步骤与规范书写。' },
    { id: 'kp7', code: '3.1', name: '一元一次方程的概念与解法', chapterId: 'ch3', difficulty: '中等', desc: '等式性质、移项与合并、系数化为 1，方程解的意义与检验。' },
    { id: 'kp8', code: '3.2', name: '列方程解应用题', chapterId: 'ch3', difficulty: '提升', desc: '从实际问题中抽象数量关系、设未知数、列方程并检验结果的实际意义。' },
    { id: 'kp9', code: '4.1', name: '几何图形初步', chapterId: 'ch4', difficulty: '基础', desc: '立体图形与平面图形、点线面体、直线射线线段与角的初步认识。', inScope: false }
  ];

  /* ---------------- 题目 ---------------- */
  /* 字段：id, paper, code, type, kp, diff, stem, options, answer, accept, wrongs[{a, e}], idea, steps[], solution */
  var Q = [
    /* 试卷 1：第一章 有理数 · 单元测评（kp1×3、kp2×2、kp3×2、kp4×2） */
    {
      id: 'q1', paper: 'p1', code: '1', type: 'choice', kp: ['kp1'], diff: '基础',
      stem: '在数轴上，点 A 表示 −2，点 B 表示 3，则 A、B 两点之间的距离是（　　）',
      options: ['1', '5', '−5', '6'],
      answer: 'B',
      wrongs: [{ a: 'A', e: 'reading' }, { a: 'C', e: 'concept' }, { a: 'D', e: 'calculation' }],
      idea: '数轴上两点之间的距离与方向无关，只与两个数的差的绝对值有关。',
      steps: ['写出两点表示的数：−2 和 3；', '求两数之差：3 − (−2) = 5；', '取绝对值：|5| = 5，即两点间距离。'],
      solution: 'A、B 两点之间的距离为 |3 − (−2)| = 5，选 B。'
    },
    {
      id: 'q2', paper: 'p1', code: '2', type: 'fill', kp: ['kp1'], diff: '基础',
      stem: '若 |x| = 4，则 x 的值是＿＿＿＿。',
      answer: '±4', accept: ['4和-4', '4或-4', '-4和4', '±4', '4,-4', '-4,4', '4，-4'],
      wrongs: [{ a: '4', e: 'concept' }, { a: '-4', e: 'concept' }, { a: '4或-4或0', e: 'concept' }],
      idea: '绝对值的几何意义是“到原点的距离”，距离为 4 的点在原点的左右两侧各有一个。',
      steps: ['由 |x| = 4 可知 x 到原点的距离是 4；', '原点右侧的点表示 4，左侧的点表示 −4；', '所以 x = ±4。'],
      solution: '|x| = 4 表示 x 到原点的距离为 4，因此 x = 4 或 x = −4，即 x = ±4。'
    },
    {
      id: 'q3', paper: 'p1', code: '3', type: 'choice', kp: ['kp2'], diff: '基础',
      stem: '下列各数中，最小的数是（　　）',
      options: ['−3', '0', '−(−2)', '|−1|'],
      answer: 'A',
      wrongs: [{ a: 'B', e: 'concept' }, { a: 'C', e: 'concept' }, { a: 'D', e: 'concept' }],
      idea: '先把每个数化简成最简形式，再在数轴上比较大小。',
      steps: ['化简：−(−2) = 2，|−1| = 1；', '四个数分别是 −3、0、2、1；', '数轴上越靠左的数越小，所以 −3 最小。'],
      solution: '−(−2) = 2，|−1| = 1，四个数中 −3 最小，选 A。'
    },
    {
      id: 'q4', paper: 'p1', code: '4', type: 'fill', kp: ['kp2'], diff: '基础',
      stem: '计算：|−5| − |3| ＝＿＿＿＿。',
      answer: '2',
      wrongs: [{ a: '8', e: 'concept' }, { a: '−2', e: 'calculation' }, { a: '−8', e: 'calculation' }],
      idea: '先分别求两个数的绝对值，再按有理数减法计算。',
      steps: ['|−5| = 5，|3| = 3；', '5 − 3 = 2。'],
      solution: '|−5| − |3| = 5 − 3 = 2。'
    },
    {
      id: 'q5', paper: 'p1', code: '5', type: 'calc', kp: ['kp3'], diff: '基础',
      stem: '计算：−7 + 3 ＝＿＿＿＿。',
      answer: '-4',
      wrongs: [{ a: '4', e: 'calculation' }, { a: '-10', e: 'calculation' }, { a: '10', e: 'concept' }],
      idea: '异号两数相加，取绝对值较大的加数的符号，再用较大的绝对值减去较小的绝对值。',
      steps: ['两个加数异号，|−7| > |3|，所以和的符号取负号；', '|−7| − |3| = 7 − 3 = 4；', '结果为 −4。'],
      solution: '−7 + 3 = −(7 − 3) = −4。'
    },
    {
      id: 'q6', paper: 'p1', code: '6', type: 'process', kp: ['kp3'], diff: '中等',
      stem: '某地某一天的最高气温是 3 ℃，最低气温是 −9 ℃。求这一天的温差（最高气温与最低气温之差），请写出计算过程。',
      answer: '12',
      wrongs: [{ a: '6', e: 'reading' }, { a: '−6', e: 'calculation' }, { a: '−12', e: 'concept' }],
      idea: '温差 = 最高气温 − 最低气温，代入时注意“减去一个负数”。',
      steps: ['列出算式：3 − (−9)；', '减法转化为加法：3 + 9；', '计算结果：12（℃）。'],
      solution: '温差 = 3 − (−9) = 3 + 9 = 12 ℃。'
    },
    {
      id: 'q7', paper: 'p1', code: '7', type: 'calc', kp: ['kp4'], diff: '中等',
      stem: '计算：(−2)² × (−3) ＝＿＿＿＿。',
      answer: '-12',
      wrongs: [{ a: '12', e: 'calculation' }, { a: '−6', e: 'concept' }, { a: '−18', e: 'concept' }],
      idea: '先算乘方，再算乘法，注意 (−2)² 与 −2² 的区别。',
      steps: ['(−2)² = 4（负数的偶次幂为正）；', '4 × (−3) = −12。'],
      solution: '(−2)² × (−3) = 4 × (−3) = −12。'
    },
    {
      id: 'q8', paper: 'p1', code: '8', type: 'calc', kp: ['kp4'], diff: '提升',
      stem: '计算：−3² − (−2)³ ＝＿＿＿＿。',
      answer: '-1',
      wrongs: [{ a: '1', e: 'calculation' }, { a: '−17', e: 'concept' }, { a: '17', e: 'concept' }],
      idea: '−3² 表示 3² 的相反数，(−2)³ 是负数的奇次幂，结果为负。',
      steps: ['−3² = −9；', '(−2)³ = −8；', '−9 − (−8) = −9 + 8 = −1。'],
      solution: '−3² − (−2)³ = −9 − (−8) = −9 + 8 = −1。'
    },
    {
      id: 'q9', paper: 'p1', code: '9', type: 'fill', kp: ['kp1'], diff: '中等',
      stem: '在数轴上，点 P 从表示 −3 的位置出发，向右移动 5 个单位长度到达点 Q，则点 Q 表示的数是＿＿＿＿。',
      answer: '2',
      wrongs: [{ a: '-8', e: 'reading' }, { a: '8', e: 'calculation' }, { a: '-2', e: 'concept' }],
      idea: '数轴上向右移动表示加上移动的距离，向左移动表示减去移动的距离。',
      steps: ['起点表示 −3；', '向右移动 5，即 −3 + 5；', '结果为 2。'],
      solution: '−3 + 5 = 2，所以点 Q 表示的数是 2。'
    },

    /* 试卷 2：第二章、第三章 · 课后巩固（kp5—kp8 各 2 题） */
    {
      id: 'q10', paper: 'p2', code: '1', type: 'choice', kp: ['kp5'], diff: '基础',
      stem: '下列式子中，与 3a²b 是同类项的是（　　）',
      options: ['3ab²', '−a²b', '2a²b²', '3ab'],
      answer: 'B',
      wrongs: [{ a: 'A', e: 'concept' }, { a: 'C', e: 'concept' }, { a: 'D', e: 'concept' }],
      idea: '同类项要求所含字母相同，并且相同字母的指数也相同，与系数无关。',
      steps: ['3a²b 含有字母 a、b，且 a 的指数为 2，b 的指数为 1；', '逐项检查：只有 −a²b 的字母与指数完全相同；', '判断系数不影响同类项，所以选 B。'],
      solution: '−a²b 与 3a²b 所含字母相同、相同字母的指数也相同，是同类项，选 B。'
    },
    {
      id: 'q11', paper: 'p2', code: '2', type: 'calc', kp: ['kp5'], diff: '基础',
      stem: '化简：5x² − 3x² + 2x² ＝＿＿＿＿。',
      answer: '4x²', accept: ['4x^2', '4x2', '4x²'],
      wrongs: [{ a: '0', e: 'calculation' }, { a: '2x²', e: 'steps' }, { a: '4', e: 'concept' }],
      idea: '合并同类项时，系数相加减，字母和字母的指数保持不变。',
      steps: ['三项都是同类项，把系数相加：5 − 3 + 2 = 4；', '字母部分 x² 不变；', '结果为 4x²。'],
      solution: '5x² − 3x² + 2x² = (5 − 3 + 2)x² = 4x²。'
    },
    {
      id: 'q12', paper: 'p2', code: '3', type: 'choice', kp: ['kp6'], diff: '基础',
      stem: '化简 −2(a − 3) 的结果是（　　）',
      options: ['−2a − 3', '−2a + 6', '−2a + 3', '2a − 6'],
      answer: 'B',
      wrongs: [{ a: 'A', e: 'calculation' }, { a: 'C', e: 'steps' }, { a: 'D', e: 'concept' }],
      idea: '括号前是负号时，去括号后括号内每一项都要变号。',
      steps: ['用 −2 乘括号内每一项：−2·a = −2a；', '−2·(−3) = +6；', '所以结果为 −2a + 6。'],
      solution: '−2(a − 3) = −2a + 6，选 B。'
    },
    {
      id: 'q13', paper: 'p2', code: '4', type: 'calc', kp: ['kp6'], diff: '中等',
      stem: '计算：3(2x − 1) − (x + 4) ＝＿＿＿＿。',
      answer: '5x−7', accept: ['5x-7', '5x - 7', '5x−7'],
      wrongs: [{ a: '5x+1', e: 'calculation' }, { a: '5x−1', e: 'calculation' }, { a: '7x−7', e: 'concept' }],
      idea: '先去括号（注意第二项括号前的负号），再合并同类项。',
      steps: ['去括号：3(2x − 1) = 6x − 3，−(x + 4) = −x − 4；', '写成 6x − 3 − x − 4；', '合并同类项：6x − x = 5x，−3 − 4 = −7，结果为 5x − 7。'],
      solution: '3(2x − 1) − (x + 4) = 6x − 3 − x − 4 = 5x − 7。'
    },
    {
      id: 'q14', paper: 'p2', code: '5', type: 'calc', kp: ['kp7'], diff: '基础',
      stem: '解方程 2x + 5 = 11，则 x ＝＿＿＿＿。',
      answer: '3',
      wrongs: [{ a: '6', e: 'steps' }, { a: '−3', e: 'calculation' }, { a: '8', e: 'reading' }],
      idea: '利用等式性质：先移项，再把未知数的系数化为 1。',
      steps: ['移项：2x = 11 − 5；', '合并：2x = 6；', '系数化为 1：x = 3。'],
      solution: '2x + 5 = 11 → 2x = 6 → x = 3。'
    },
    {
      id: 'q15', paper: 'p2', code: '6', type: 'choice', kp: ['kp7'], diff: '中等',
      stem: '方程 3(x − 1) = 2x + 1 的解是（　　）',
      options: ['x = 2', 'x = 4', 'x = −2', 'x = 1'],
      answer: 'B',
      wrongs: [{ a: 'A', e: 'calculation' }, { a: 'C', e: 'concept' }, { a: 'D', e: 'steps' }],
      idea: '先去括号，再把含 x 的项移到一边、常数项移到另一边。',
      steps: ['去括号：3x − 3 = 2x + 1；', '移项：3x − 2x = 1 + 3；', '合并得 x = 4，选 B。'],
      solution: '3(x − 1) = 2x + 1 → 3x − 3 = 2x + 1 → x = 4。'
    },
    {
      id: 'q16', paper: 'p2', code: '7', type: 'process', kp: ['kp8'], diff: '提升',
      stem: '某班共有学生 45 人，其中男生人数比女生人数的 2 倍少 3 人。设女生有 x 人，请列方程并求女生人数。',
      answer: '16',
      wrongs: [{ a: '24', e: 'method' }, { a: '15', e: 'calculation' }, { a: '21', e: 'reading' }],
      idea: '用同一个未知数 x 表示女生人数，再把“男生比女生 2 倍少 3 人”翻译成代数式。',
      steps: ['设女生有 x 人，则男生有 (2x − 3) 人；', '列方程：x + (2x − 3) = 45；', '解方程：3x = 48，x = 16。'],
      solution: '设女生有 x 人，男生有 (2x − 3) 人，则 x + 2x − 3 = 45，解得 3x = 48，x = 16，女生有 16 人。'
    },
    {
      id: 'q17', paper: 'p2', code: '8', type: 'process', kp: ['kp8'], diff: '提升',
      stem: '一件商品按标价的八折出售，售价为 96 元。设标价为 x 元，请列方程求标价。',
      answer: '120',
      wrongs: [{ a: '76.8', e: 'method' }, { a: '108', e: 'calculation' }, { a: '104', e: 'reading' }],
      idea: '“八折”表示按标价的 80% 出售，等量关系是“标价 × 0.8 = 售价”。',
      steps: ['设标价为 x 元；', '列方程：0.8x = 96；', '解得 x = 120。'],
      solution: '由题意 0.8x = 96，解得 x = 120，即标价为 120 元。'
    },

    /* 试卷 3：有理数 · 订正与再练（kp1×2、kp2×1、kp3×2、kp4×1） */
    {
      id: 'q18', paper: 'p3', code: '1', type: 'choice', kp: ['kp1'], diff: '基础',
      stem: '下列说法正确的是（　　）',
      options: ['−a 一定是负数', '0 是最小的有理数', '数轴上原点表示的数是 0', '绝对值等于它本身的数只有 0'],
      answer: 'C',
      wrongs: [{ a: 'A', e: 'concept' }, { a: 'B', e: 'concept' }, { a: 'D', e: 'concept' }],
      idea: '逐项举反例检验，特别注意字母 a 可以表示正数、负数或 0。',
      steps: ['A：当 a = 0 时 −a = 0，不是负数，错误；', 'B：没有最小的有理数，错误；', 'C：数轴上原点表示的数是 0，正确；', 'D：绝对值等于本身的数还有正数，错误。'],
      solution: '只有 C 正确：数轴上原点表示的数是 0。'
    },
    {
      id: 'q19', paper: 'p3', code: '2', type: 'fill', kp: ['kp1'], diff: '中等',
      stem: '若点 A 在数轴上表示 −1，点 B 与点 A 相距 3 个单位长度，则点 B 表示的数是＿＿＿＿。',
      answer: '2或−4', accept: ['-4或2', '2,-4', '-4,2', '2或-4', '2，-4'],
      wrongs: [{ a: '2', e: 'steps' }, { a: '4', e: 'calculation' }, { a: '−4', e: 'steps' }],
      idea: '“相距 3 个单位长度”没有说明在 A 的哪一侧，要考虑两种情况。',
      steps: ['若 B 在 A 的右侧：−1 + 3 = 2；', '若 B 在 A 的左侧：−1 − 3 = −4；', '所以点 B 表示的数是 2 或 −4。'],
      solution: 'B 可能在 A 的左右两侧：−1 + 3 = 2 或 −1 − 3 = −4，因此点 B 表示 2 或 −4。'
    },
    {
      id: 'q20', paper: 'p3', code: '3', type: 'fill', kp: ['kp2'], diff: '基础',
      stem: '若 |a| = 5，则 a ＝＿＿＿＿。',
      answer: '±5', accept: ['5和-5', '5或-5', '-5和5', '±5', '5,-5', '-5,5', '5，-5'],
      wrongs: [{ a: '5', e: 'concept' }, { a: '−5', e: 'concept' }, { a: '25', e: 'concept' }],
      idea: '绝对值表示到原点的距离，距离相等的点在原点两侧。',
      steps: ['|a| = 5 表示 a 到原点的距离为 5；', '原点右侧是 5，左侧是 −5；', '所以 a = ±5。'],
      solution: '|a| = 5，则 a = 5 或 a = −5，即 a = ±5。'
    },
    {
      id: 'q21', paper: 'p3', code: '4', type: 'calc', kp: ['kp3'], diff: '基础',
      stem: '计算：−8 − (−3) ＝＿＿＿＿。',
      answer: '-5',
      wrongs: [{ a: '−11', e: 'calculation' }, { a: '11', e: 'concept' }, { a: '−4', e: 'calculation' }],
      idea: '减去一个数等于加上这个数的相反数：−8 − (−3) = −8 + 3。',
      steps: ['减法转化为加法：−8 − (−3) = −8 + 3；', '异号相加取绝对值较大者的符号：−(8 − 3) = −5。'],
      solution: '−8 − (−3) = −8 + 3 = −5。'
    },
    {
      id: 'q22', paper: 'p3', code: '5', type: 'calc', kp: ['kp3'], diff: '中等',
      stem: '计算：(−3) + (−5) − (−2) ＝＿＿＿＿。',
      answer: '-6',
      wrongs: [{ a: '−10', e: 'calculation' }, { a: '−4', e: 'calculation' }, { a: '0', e: 'steps' }],
      idea: '按从左到右的顺序计算，减法先转化为加法。',
      steps: ['先算 (−3) + (−5) = −8；', '−8 − (−2) = −8 + 2；', '结果为 −6。'],
      solution: '(−3) + (−5) − (−2) = −8 + 2 = −6。'
    },
    {
      id: 'q23', paper: 'p3', code: '6', type: 'calc', kp: ['kp4'], diff: '提升',
      stem: '计算：(−1)²⁰²⁵ ＝＿＿＿＿。',
      answer: '-1',
      wrongs: [{ a: '1', e: 'concept' }, { a: '2025', e: 'concept' }],
      idea: '负数的奇次幂为负，偶次幂为正；1 的任何次幂都是 1。',
      steps: ['2025 是奇数；', '(−1) 的奇次幂等于 −1；', '所以 (−1)²⁰²⁵ = −1。'],
      solution: '2025 为奇数，(−1)²⁰²⁵ = −1。'
    }
  ];

  var PAPER_DEFS = [
    {
      id: 'p1',
      title: '第一章 有理数 · 单元测评',
      classId: 'c1',
      source: { fileName: '有理数单元测评卷（扫描件）.pdf', type: 'pdf', size: 1843200 },
      parseMode: 'mock',
      createdAt: iso('2026-10-19T09:20:00+08:00'),
      status: 'confirmed',
      materialId: 'm2'
    },
    {
      id: 'p2',
      title: '第二章、第三章 · 课后巩固练习',
      classId: 'c1',
      source: { fileName: '整式与方程巩固练习.docx', type: 'docx', size: 92160 },
      parseMode: 'mock',
      createdAt: iso('2026-10-26T20:05:00+08:00'),
      status: 'confirmed',
      materialId: 'm2'
    },
    {
      id: 'p3',
      title: '有理数 · 订正与再练',
      classId: 'c1',
      source: { fileName: '教师手动录入', type: 'manual', size: 0 },
      parseMode: 'manual',
      createdAt: iso('2026-10-31T16:40:00+08:00'),
      status: 'confirmed',
      materialId: 'm3'
    }
  ];

  var PAPER_QUESTIONS = {
    p1: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'],
    p2: ['q10', 'q11', 'q12', 'q13', 'q14', 'q15', 'q16', 'q17'],
    p3: ['q18', 'q19', 'q20', 'q21', 'q22', 'q23']
  };

  var TASK_DEFS = [
    {
      id: 't1', title: '有理数单元测评 · 课堂完成', classId: 'c1', paperId: 'p1',
      assignedAt: iso('2026-10-20T08:10:00+08:00'), dueAt: iso('2026-10-23T18:00:00+08:00'), status: '已结束',
      scopeNote: '第一章 有理数（1.1—1.4）'
    },
    {
      id: 't2', title: '整式与方程 · 课后巩固', classId: 'c1', paperId: 'p2',
      assignedAt: iso('2026-10-27T16:00:00+08:00'), dueAt: iso('2026-11-02T22:00:00+08:00'), status: '已结束',
      scopeNote: '第二章 整式的加减、第三章 3.1—3.2'
    },
    {
      id: 't3', title: '有理数 · 订正与再练', classId: 'c1', paperId: 'p3',
      assignedAt: iso('2026-11-01T19:00:00+08:00'), dueAt: iso('2026-11-05T22:00:00+08:00'), status: '进行中',
      scopeNote: '第一章 有理数（重点：加减与乘方符号）'
    }
  ];

  /* ---------------- 班级、教师与学生 ---------------- */
  /* mastery：该知识点“独立做对”的概率；hintiness：主动使用提示的概率 */
  var STUDENT_PROFILES = [
    {
      id: 's1', name: '林以安', bio: '演示学生账号',
      mastery: { kp1: 0.9, kp2: 0.55, kp3: 0.3, kp4: 0.45, kp5: 0.8, kp6: 0.35, kp7: 0.75, kp8: 0.3 },
      hintiness: 0.38, retry: 0.3, recognitionRisk: 0,
      submit: { t1: 1, t2: 1, t3: 0.33 }
    },
    {
      id: 's2', name: '周子墨',
      mastery: { kp1: 0.97, kp2: 0.95, kp3: 0.9, kp4: 0.9, kp5: 0.95, kp6: 0.9, kp7: 0.95, kp8: 0.55 },
      hintiness: 0.15, retry: 0.2, recognitionRisk: 0,
      submit: { t1: 1, t2: 1, t3: 0.5 }
    },
    {
      id: 's3', name: '陈雨桐',
      mastery: { kp1: 0.8, kp2: 0.55, kp3: 0.65, kp4: 0.5, kp5: 0.6, kp6: 0.55, kp7: 0.85, kp8: 0.6 },
      hintiness: 0.55, retry: 0.35, recognitionRisk: 0,
      submit: { t1: 1, t2: 1, t3: 0.33 }
    },
    {
      id: 's4', name: '黄嘉禾',
      mastery: { kp1: 0.7, kp2: 0.7, kp3: 0.6, kp4: 0.6, kp5: 0.6, kp6: 0.4, kp7: 0.6, kp8: 0.45 },
      hintiness: 0.35, retry: 0.3, recognitionRisk: 0.16,
      submit: { t1: 1, t2: 0.88, t3: 0.33 }
    },
    {
      id: 's5', name: '徐若溪',
      mastery: { kp1: 0.95, kp2: 0.9, kp3: 0.85, kp4: 0.8, kp5: 0.9, kp6: 0.85, kp7: 0.9, kp8: 0.7 },
      hintiness: 0.3, retry: 0.15, recognitionRisk: 0,
      submit: { t1: 1, t2: 1, t3: 0.67 }
    },
    {
      id: 's6', name: '赵一诺',
      mastery: { kp1: 0.6, kp2: 0.6, kp3: 0.45, kp4: 0.5, kp5: 0.45, kp6: 0.45, kp7: 0.6, kp8: 0.35 },
      hintiness: 0.6, retry: 0.4, recognitionRisk: 0,
      submit: { t1: 0.89, t2: 0.88, t3: 0.5 }
    },
    {
      id: 's7', name: '何锦程',
      mastery: { kp1: 0.85, kp2: 0.8, kp3: 0.7, kp4: 0.4, kp5: 0.75, kp6: 0.7, kp7: 0.8, kp8: 0.6 },
      hintiness: 0.7, retry: 0.5, recognitionRisk: 0,
      submit: { t1: 1, t2: 1, t3: 0.83 }
    },
    {
      id: 's8', name: '吴思远',
      mastery: { kp1: 0.9, kp2: 0.85, kp3: 0.8, kp4: 0.75, kp5: 0.85, kp6: 0.75, kp7: 0.8, kp8: 0.4 },
      hintiness: 0.25, retry: 0.2, recognitionRisk: 0.1,
      submit: { t1: 1, t2: 1, t3: 0.33 }
    },
    {
      id: 's9', name: '唐可欣',
      mastery: { kp1: 0.8, kp2: 0.75, kp3: 0.75, kp4: 0.65, kp5: 0.7, kp6: 0.65, kp7: 0.5, kp8: 0.55 },
      hintiness: 0.45, retry: 0.25, recognitionRisk: 0,
      submit: { t1: 1, t2: 1, t3: 0.5 }
    },
    {
      id: 's10', name: '罗嘉言',
      mastery: { kp1: 0.55, kp2: 0.6, kp3: 0.5, kp4: 0.45, kp5: 0.55, kp6: 0.35, kp7: 0.5, kp8: 0.3 },
      hintiness: 0.5, retry: 0.45, recognitionRisk: 0.06,
      submit: { t1: 1, t2: 0.88, t3: 0.33 }
    },
    {
      id: 's11', name: '苏清和',
      mastery: { kp1: 0.7, kp2: 0.7, kp3: 0.6, kp4: 0.6, kp5: 0.6, kp6: 0.6, kp7: 0.6, kp8: 0.5 },
      hintiness: 0.4, retry: 0.2, recognitionRisk: 0,
      submit: { t1: 0.11, t2: 0.13, t3: 0.17 }
    }
  ];

  var MATERIALS = [
    {
      id: 'm1', name: '课程标准 · 七年级数学（节选）', type: '标准文件',
      source: '比赛指定材料（待确认）', version: '待配置',
      chapterIds: ['ch1', 'ch2', 'ch3', 'ch4'], kpIds: [],
      usage: ['diagnosis', 'teacher'], status: '待配置',
      note: '用于约束知识范围与教学要求；具体版本待教师/赛题材料确认。',
      importedAt: iso('2026-10-15T10:00:00+08:00')
    },
    {
      id: 'm2', name: '七年级数学教材（示例配置）', type: '教材',
      source: '项目默认配置', version: '示例 · 待教师确认版本',
      chapterIds: ['ch1', 'ch2', 'ch3'], kpIds: ['kp1', 'kp2', 'kp3', 'kp4', 'kp5', 'kp6', 'kp7', 'kp8'],
      usage: ['diagnosis', 'student', 'teacher'], status: '示例',
      note: '默认按常见教材章节顺序组织，出版社与版本待教师确认后更新。',
      importedAt: iso('2026-10-15T10:05:00+08:00')
    },
    {
      id: 'm3', name: '班级补充材料 · 有理数易错题集', type: '教师补充',
      source: '教师上传（模拟）', version: 'v1',
      chapterIds: ['ch1'], kpIds: ['kp1', 'kp2', 'kp3', 'kp4'],
      usage: ['diagnosis', 'teacher'], status: '已确认',
      note: '教师根据本班错题情况补充，用于订正与再练。',
      importedAt: iso('2026-10-31T16:30:00+08:00')
    }
  ];

  /* ---------------- 生成作答记录 ---------------- */
  function buildAnswers(students, questions) {
    var answers = [];
    TASK_DEFS.forEach(function (task) {
      var qids = PAPER_QUESTIONS[task.paperId];
      var assigned = new Date(task.assignedAt).getTime();
      var due = new Date(task.dueAt).getTime();
      students.forEach(function (st) {
        var profile = st.profile;
        var ratio = profile.submit[task.id];
        if (ratio === undefined) ratio = 1;
        var rng = mulberry32(hash(st.id + task.id));
        qids.forEach(function (qid, qi) {
          if (rng() > ratio) return;
          var q = questions[qid];
          var kpId = q.kpIds[0];
          var mastery = profile.mastery[kpId];
          if (mastery === undefined) mastery = 0.6;
          var hintLevels = [];
          if (rng() < profile.hintiness) {
            hintLevels.push(1);
            if (rng() < 0.55) hintLevels.push(2);
            if (rng() < 0.22 && q.type === 'process') hintLevels.push(3);
          }
          var boost = hintLevels.length ? 0.14 : 0;
          var correct = rng() < mastery + boost;
          var rawAnswer, errorTag = null;
          if (correct) {
            rawAnswer = q.answer;
          } else {
            var wrong = q.wrongs[Math.floor(rng() * q.wrongs.length)] || q.wrongs[0];
            rawAnswer = wrong.a;
            errorTag = wrong.e;
          }
          var attempts = rng() < profile.retry ? 2 : 1;
          var recognition = rng() < profile.recognitionRisk ? 'low' : 'ok';
          if (recognition === 'low') {
            rawAnswer = rawAnswer + '（书写模糊）';
          }
          var span = due - assigned;
          /* 演示数据落在“布置后的 3 小时内”，避免出现凌晨三点的作业提交时间 */
          var windowMs = Math.min(span * 0.92, 3 * 3600 * 1000);
          var offset = Math.floor(rng() * windowMs);
          answers.push({
            id: 'a_' + st.id + '_' + task.id + '_' + qid,
            studentId: st.id,
            taskId: task.id,
            questionId: qid,
            submittedAt: new Date(assigned + offset).toISOString(),
            rawAnswer: rawAnswer,
            correctBySeed: correct,
            errorTag: errorTag,
            attempts: attempts,
            hintLevels: hintLevels,
            durationSec: q.type === 'process' ? 150 + Math.floor(rng() * 240) : 45 + Math.floor(rng() * 130),
            recognition: recognition,
            source: '演示数据',
            score: undefined,
            maxScore: undefined,
            gradeStatus: undefined,
            gradeNote: '',
            reviewedBy: null,
            reviewedAt: null
          });
        });
      });
    });
    return answers;
  }

  /* ---------------- 组装数据库 ---------------- */
  function build() {
    var students = STUDENT_PROFILES.map(function (p, idx) {
      return {
        id: p.id,
        role: 'student',
        name: p.name,
        classId: 'c1',
        seatNo: idx + 1,
        avatarSeed: p.id,
        note: p.bio || '',
        profile: p
      };
    });

    var questions = {};
    var questionList = Q.map(function (row) {
      var kpNames = row.kp.map(function (id) {
        var kp = KPS.filter(function (k) { return k.id === id; })[0];
        return kp ? kp.name : id;
      });
      var q = {
        id: row.id,
        code: row.code,
        paperId: row.paper,
        type: row.type,
        stem: row.stem,
        options: row.options || null,
        answer: row.answer,
        accept: row.accept || [],
        wrongs: row.wrongs || [],
        scoring: {
          max: row.type === 'process' ? 6 : (row.type === 'choice' ? 4 : 5),
          mode: row.type === 'process' ? 'process' : 'exact',
          rule: row.type === 'process' ? '按步骤给分，系统仅做辅助批阅，需教师复核' : '与参考答案一致即得满分，不设部分分'
        },
        kpIds: row.kp,
        kpNames: kpNames,
        chapterId: (KPS.filter(function (k) { return k.id === row.kp[0]; })[0] || {}).chapterId,
        difficulty: row.diff,
        hints: {
          kp: '先回忆「' + kpNames[0] + '」：' + ((KPS.filter(function (k) { return k.id === row.kp[0]; })[0] || {}).desc || ''),
          idea: row.idea,
          step: row.steps,
          solution: row.solution
        },
        errorTags: (row.wrongs || []).map(function (w) { return w.e; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),
        source: { paperId: row.paper, materialId: 'm2' },
        status: 'confirmed'
      };
      questions[q.id] = q;
      return q;
    });

    var answers = buildAnswers(students.map(function (s) {
      return { id: s.id, profile: s.profile };
    }), questions);

    /* 教师已复核的样本：让“教师复核”闭环有真实落点 */
    var REVIEW_SEEDS = [
      { studentId: 's1', taskId: 't2', questionId: 'q16', rawAnswer: '24', errorTag: 'method', score: 3, note: '方程列对，解方程时把 3x = 48 写成 x = 24，属于计算错误，给过程分。', action: 'modify' },
      { studentId: 's2', taskId: 't2', questionId: 'q17', rawAnswer: '120', score: 6, note: '设未知数、列方程、求解均正确。', action: 'confirm' },
      { studentId: 's4', taskId: 't1', questionId: 'q6', rawAnswer: '12', score: 6, note: '识别模糊，人工核对为正确。', action: 'modify' }
    ];

    var reviews = [];
    REVIEW_SEEDS.forEach(function (rs, idx) {
      var ans = answers.filter(function (a) {
        return a.studentId === rs.studentId && a.taskId === rs.taskId && a.questionId === rs.questionId;
      })[0];
      if (!ans) return;
      ans.rawAnswer = rs.rawAnswer;
      ans.errorTag = rs.errorTag || null;
      ans.recognition = rs.studentId === 's4' ? 'low' : 'ok';
      ans.reviewedBy = 't1';
      ans.reviewedAt = iso('2026-11-02T09:30:00+08:00');
      ans.reviewedScore = rs.score;
      ans.reviewedNote = rs.note;
      ans.reviewedAction = rs.action;
      reviews.push({
        id: 'r' + (idx + 1),
        targetType: 'grade',
        targetId: ans.id,
        by: 't1',
        at: ans.reviewedAt,
        action: rs.action,
        before: { score: null, status: 'suggested' },
        after: { score: rs.score, note: rs.note },
        note: rs.note
      });
    });

    var db = {
      meta: {
        appName: '知微·智学',
        version: '0.1.0 · 可交互原型',
        term: '2026 学年第一学期',
        generatedAt: iso('2026-11-03T08:00:00+08:00'),
        demoNotice: '本系统全部学生、班级、成绩、作业与分析结果均为虚构模拟数据，仅用于产品演示；不包含任何真实学生信息。',
        textbook: {
          name: '七年级数学（上册）',
          edition: '示例配置 · 教材版本待教师确认',
          confirmed: false
        },
        scope: {
          term: '2026 学年第一学期',
          chapters: ['ch1', 'ch2', 'ch3'],
          note: '默认教学范围按项目配置的七年级上册第一至第三章组织；第四章尚未纳入当前教学进度。'
        },
        engine: {
          diagnosis: '规则引擎（可替换服务层，未接入真实模型）',
          grader: '规则判分（客观题自动判分 + 过程题辅助批阅）',
          assistant: '本地规则应答（模拟，未接入真实大模型）'
        }
      },
      users: [
        { id: 't1', role: 'teacher', name: '沈老师', classIds: ['c1'], title: '七年级数学教师', avatarSeed: 't1', note: '演示教师账号' }
      ].concat(students.map(function (s) {
        return { id: s.id, role: 'student', name: s.name, classId: 'c1', avatarSeed: s.avatarSeed, note: s.note };
      })),
      classes: [
        {
          id: 'c1', name: '七年级(3)班', grade: '七年级', teacherId: 't1',
          studentIds: students.map(function (s) { return s.id; }),
          term: '2026 学年第一学期',
          scopeChapterIds: ['ch1', 'ch2', 'ch3']
        }
      ],
      chapters: CHAPTERS,
      knowledgePoints: KPS.map(function (kp) {
        return {
          id: kp.id, code: kp.code, name: kp.name, chapterId: kp.chapterId,
          chapterName: (CHAPTERS.filter(function (c) { return c.id === kp.chapterId; })[0] || {}).name,
          difficulty: kp.difficulty, desc: kp.desc,
          inScope: kp.inScope !== false
        };
      }),
      materials: MATERIALS,
      questions: questionList,
      papers: PAPER_DEFS.map(function (p) {
        return {
          id: p.id, title: p.title, classId: p.classId,
          questionIds: PAPER_QUESTIONS[p.id].slice(),
          status: p.status, createdAt: p.createdAt,
          source: p.source, parseMode: p.parseMode, materialId: p.materialId
        };
      }),
      tasks: TASK_DEFS.map(function (t) {
        return {
          id: t.id, title: t.title, classId: t.classId, paperId: t.paperId,
          questionIds: PAPER_QUESTIONS[t.paperId].slice(),
          assignedAt: t.assignedAt, dueAt: t.dueAt, status: t.status,
          scopeNote: t.scopeNote
        };
      }),
      answers: answers,
      reviews: reviews,
      imports: [
        {
          id: 'imp1', at: iso('2026-10-18T15:20:00+08:00'),
          fileName: '七3班_学生名单.csv', type: 'csv', rows: 11, ok: 11,
          issues: [], fieldMap: { 姓名: 'name', 学号: 'seatNo', 班级: 'classId' },
          status: '已确认', note: '演示数据'
        }
      ],
      auditLogs: [
        { id: 'log1', at: iso('2026-10-19T09:20:00+08:00'), actorId: 't1', role: 'teacher', action: '导入试卷', detail: '有理数单元测评卷（扫描件）.pdf · 模拟解析', targetType: 'paper', targetId: 'p1' },
        { id: 'log2', at: iso('2026-10-19T09:41:00+08:00'), actorId: 't1', role: 'teacher', action: '确认题目与知识点映射', detail: '9 道题，其中 2 道知识点映射待确认后由教师修正', targetType: 'paper', targetId: 'p1' },
        { id: 'log3', at: iso('2026-10-31T16:30:00+08:00'), actorId: 't1', role: 'teacher', action: '添加补充材料', detail: '班级补充材料 · 有理数易错题集', targetType: 'material', targetId: 'm3' },
        { id: 'log4', at: iso('2026-11-02T09:30:00+08:00'), actorId: 't1', role: 'teacher', action: '复核批阅', detail: '共 3 份过程题作答完成人工复核', targetType: 'grade', targetId: 'batch' },
        { id: 'log5', at: iso('2026-11-02T10:05:00+08:00'), actorId: 't1', role: 'teacher', action: '确认诊断', detail: '林以安 · 有理数的加减运算', targetType: 'diagnosis', targetId: 's1:kp3' }
      ],
      diagnosisReviews: [
        {
          id: 'dr1', studentId: 's1', kpId: 'kp2', by: 't1',
          at: iso('2026-11-02T10:05:00+08:00'),
          action: 'confirm', status: 'preliminary',
          note: '已核对：绝对值化简时容易漏掉负数解，与课堂练习表现一致，先按初步判断跟进。'
        },
        {
          id: 'dr2', studentId: 's7', kpId: 'kp4', by: 't1',
          at: iso('2026-11-02T10:12:00+08:00'),
          action: 'mark-undetermined', status: 'undetermined',
          note: '作答中提示使用较频繁，暂不据此下结论，安排一次独立练习再确认。'
        }
      ],
      drafts: {},
      assistantThreads: { teacher: [], students: {} },
      studentProfiles: STUDENT_PROFILES.reduce(function (acc, p) {
        acc[p.id] = p;
        return acc;
      }, {})
    };

    return db;
  }

  ZWZ.seed = {
    build: build,
    CHAPTERS: CHAPTERS,
    KPS: KPS,
    QUESTIONS: Q,
    STUDENT_PROFILES: STUDENT_PROFILES
  };
})();
