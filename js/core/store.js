/* ============================================================
   知微·智学 · 状态存储与数据操作（唯一写入口）
   ------------------------------------------------------------
   - 所有页面通过 ZWZ.store.actions.* 修改数据；
   - 自动持久化到 localStorage（失败时降级为内存，不阻断演示）；
   - 每次提交记录审计日志并派发变更事件。
   ============================================================ */
(function () {
  'use strict';

  var ZWZ = (window.ZWZ = window.ZWZ || {});
  var DB_KEY = 'zwz.db.v1';
  var SESSION_KEY = 'zwz.session.v1';
var OFFICIAL_DB_KEY = 'zwz.db.official.v1';
var OFFICIAL_SESSION_KEY = 'zwz.session.official.v1';
  var listeners = [];
  var storageOK = true;

  function nowIso() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 10000).toString(36);
  }

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      storageOK = false;
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      storageOK = false;
      return false;
    }
  }

  function safeRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      storageOK = false;
    }
  }

  /* ---------------- 规整与判分 ---------------- */
  function normalize(state) {
    if (!state.meta) state.meta = {};
    if (!Array.isArray(state.answers)) state.answers = [];
    if (!Array.isArray(state.reviews)) state.reviews = [];
    if (!Array.isArray(state.diagnosisReviews)) state.diagnosisReviews = [];
    if (!Array.isArray(state.auditLogs)) state.auditLogs = [];
    if (!Array.isArray(state.imports)) state.imports = [];
    if (!state.drafts) state.drafts = {};
    if (!state.hintEvents) state.hintEvents = [];
    if (!state.assistantThreads) state.assistantThreads = { teacher: [], students: {} };
    state.answers.forEach(function (a) {
      if (a.score === undefined) {
        ZWZ.grader.apply(state, a);
      }
    });
    return state;
  }

  function freshState(mode) {
    var state = mode === 'official' && ZWZ.official ? ZWZ.official.build() : ZWZ.seed.build();
    normalize(state);
    state.__rev = 1;
    return state;
  }

  function defaultSession(mode, state) {
    if (mode === 'official') {
      var st = (state.users || []).filter(function (u) { return u.role === 'student'; })[0];
      return { userId: st ? st.id : 'D01', role: 'student', classId: st ? st.classId : 'DC01' };
    }
    return { userId: 's1', role: 'student', classId: 'c1' };
  }

  var store = {
    state: null,
    session: null,
    storageOK: true,

    init: function (mode) {
      this.mode = mode === 'official' ? 'official' : 'demo';
      var dbKey = this.mode === 'official' ? OFFICIAL_DB_KEY : DB_KEY;
      var sessionKey = this.mode === 'official' ? OFFICIAL_SESSION_KEY : SESSION_KEY;
      var raw = safeGet(dbKey);
      var loaded = null;
      if (raw) {
        try {
          loaded = JSON.parse(raw);
          if (!loaded || !loaded.meta || !loaded.questions || !loaded.answers) loaded = null;
        } catch (err) { loaded = null; }
      }
      this.state = loaded ? normalize(loaded) : freshState(this.mode);
      if (!this.state.__rev) this.state.__rev = 1;

      var sessionRaw = safeGet(sessionKey);
      if (sessionRaw) {
        try { this.session = JSON.parse(sessionRaw); } catch (err) { this.session = null; }
      }
      if (!this.session || !this.session.userId) {
        this.session = defaultSession(this.mode, this.state);
        safeSet(sessionKey, JSON.stringify(this.session));
      }
      var user = this.state.users.filter(function (u) { return u.id === store.session.userId; })[0];
      if (!user) {
        this.session = defaultSession(this.mode, this.state);
        safeSet(sessionKey, JSON.stringify(this.session));
      }
      this.storageOK = storageOK;
      return this;
    },

    user: function () {
      var sid = this.session.userId;
      return this.state.users.filter(function (u) { return u.id === sid; })[0] || null;
    },

    save: function () {
      var payload = this.state;
      var json = null;
      try { json = JSON.stringify(payload); } catch (err) { return false; }
      var key = this.mode === 'official' ? OFFICIAL_DB_KEY : DB_KEY;
      if (!safeSet(key, json)) { this.storageOK = false; return false; }
      this.storageOK = true;
      return true;
    },

    saveSession: function () {
      var key = this.mode === 'official' ? OFFICIAL_SESSION_KEY : SESSION_KEY;
      safeSet(key, JSON.stringify(this.session));
    },

    switchMode: function (mode) {
      this.save();
      this.mode = mode === 'official' ? 'official' : 'demo';
      var dbKey = this.mode === 'official' ? OFFICIAL_DB_KEY : DB_KEY;
      var sessionKey = this.mode === 'official' ? OFFICIAL_SESSION_KEY : SESSION_KEY;
      var raw = safeGet(dbKey);
      this.state = null;
      if (raw) {
        try {
          var loaded = JSON.parse(raw);
          if (loaded && loaded.meta && loaded.questions && loaded.answers) this.state = normalize(loaded);
        } catch (err) { /* ignore */ }
      }
      if (!this.state) { this.state = freshState(this.mode); this.save(); }
      var sessionRaw = safeGet(sessionKey);
      this.session = null;
      if (sessionRaw) {
        try { this.session = JSON.parse(sessionRaw); } catch (err) { /* ignore */ }
      }
      if (!this.session || !this.session.userId) this.session = defaultSession(this.mode, this.state);
      this.saveSession();
      this.emit('mode');
      return this;
    },

    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        var idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },

    emit: function (reason) {
      listeners.forEach(function (fn) {
        try {
          fn(reason, store.state);
        } catch (err) {
          if (window.console) console.error('[ZWZ] listener error', err);
        }
      });
    },

    commit: function (reason) {
      this.state.__rev = (this.state.__rev || 0) + 1;
      this.save();
      this.emit(reason || 'update');
    },

    resetDemo: function () {
      safeRemove(DB_KEY);
      safeRemove(SESSION_KEY);
      if (this.mode === 'official') return this.resetCurrent();
      this.state = freshState('demo');
      this.session = defaultSession('demo', this.state);
      this.saveSession();
      this.save();
      this.emit('reset');
    },

    resetCurrent: function () {
      var dbKey = this.mode === 'official' ? OFFICIAL_DB_KEY : DB_KEY;
      var sessionKey = this.mode === 'official' ? OFFICIAL_SESSION_KEY : SESSION_KEY;
      safeRemove(dbKey);
      safeRemove(sessionKey);
      this.state = freshState(this.mode);
      this.session = defaultSession(this.mode, this.state);
      this.saveSession();
      this.save();
      this.emit('reset');
    },

    audit: function (action, detail, targetType, targetId) {
      this.state.auditLogs.unshift({
        id: uid('log'),
        at: nowIso(),
        actorId: this.session.userId,
        role: this.session.role,
        action: action,
        detail: detail || '',
        targetType: targetType || '',
        targetId: targetId || ''
      });
      if (this.state.auditLogs.length > 300) this.state.auditLogs.length = 300;
    },

    actions: {}
  };

  var actions = store.actions;

  /* ---------------- 会话 ---------------- */
  actions.setRole = function (role) {
    var users = store.state.users || [];
    var target = null;
    if (role === 'teacher') target = users.filter(function (u) { return u.role === 'teacher'; })[0];
    else target = users.filter(function (u) { return u.role === 'student'; })[0];
    if (!target) return;
    store.session = {
      userId: target.id,
      role: role,
      classId: target.classId || (target.classIds && target.classIds[0]) || (store.state.classes[0] && store.state.classes[0].id) || 'c1'
    };
    store.saveSession();
    store.emit('session');
  };

  actions.setClass = function (classId) {
    var exists = (store.state.classes || []).some(function (c) { return c.id === classId; });
    if (!exists) return null;
    store.session.classId = classId;
    store.saveSession();
    store.emit('class');
    return classId;
  };

  actions.loginAs = function (userId) {
    var user = store.state.users.filter(function (u) { return u.id === userId; })[0];
    if (!user) return;
    var classId = user.classId || (user.classIds && user.classIds[0]) || 'c1';
    store.session = { userId: user.id, role: user.role, classId: classId };
    store.saveSession();
    store.emit('session');
  };

  /* ---------------- 题目 / 试卷导入 ---------------- */
  actions.importPaper = function (fileMeta) {
    var parsed = ZWZ.parser.parsePaper(fileMeta);
    var importRow = {
      id: uid('imp'),
      at: nowIso(),
      fileName: parsed.source.fileName,
      type: 'paper',
      rows: parsed.questions.length,
      ok: 0,
      issues: parsed.warnings,
      fieldMap: {},
      status: '待确认',
      note: '模拟解析 · ' + parsed.mode
    };
    store.state.imports.unshift(importRow);
    store.audit('上传试卷（模拟解析）', parsed.source.fileName + ' · 识别 ' + parsed.questions.length + ' 道题，待教师确认', 'paper', importRow.id);
    store.commit('import');
    return { parse: parsed, importId: importRow.id };
  };

  actions.confirmPaper = function (payload) {
    var p = payload || {};
    var classId = p.classId || 'c1';
    var paper = {
      id: uid('p'),
      title: p.title || '未命名试卷',
      classId: classId,
      questionIds: (p.questions || []).map(function (q) { return q.id; }),
      status: 'confirmed',
      createdAt: nowIso(),
      source: p.source || { fileName: '手动录入', type: 'manual', size: 0 },
      parseMode: p.parseMode || 'mock',
      materialId: p.materialId || 'm2'
    };
    (p.questions || []).forEach(function (q) {
      q.paperId = paper.id;
      q.code = q.code || String((p.questions || []).indexOf(q) + 1);
      q.status = 'confirmed';
      q.review = { needConfirm: false, notes: q.review && q.review.notes ? q.review.notes : [] };
      if ((q.kpIds || []).length) {
        q.kpNames = q.kpIds.map(function (id) {
          var kp = ZWZ.sel.kp(store.state, id);
          return kp ? kp.name : id;
        });
      }
      store.state.questions.push(q);
    });
    store.state.papers.push(paper);
    if (p.importId) {
      var imp = store.state.imports.filter(function (i) { return i.id === p.importId; })[0];
      if (imp) {
        imp.status = '已确认';
        imp.ok = (p.questions || []).length;
      }
    }
    store.audit('确认试卷与知识点映射', paper.title + ' · ' + paper.questionIds.length + ' 道题', 'paper', paper.id);
    store.commit('paper');
    return paper;
  };

  actions.updateQuestion = function (questionId, patch) {
    var q = store.state.questions.filter(function (item) { return item.id === questionId; })[0];
    if (!q) return null;
    Object.assign(q, patch || {});
    if (patch && patch.kpIds) {
      q.kpNames = patch.kpIds.map(function (id) {
        var kp = ZWZ.sel.kp(store.state, id);
        return kp ? kp.name : id;
      });
    }
    store.audit('修改题目信息', '题目 ' + q.code, 'question', q.id);
    store.commit('question');
    return q;
  };

  actions.createTask = function (payload) {
    var p = payload || {};
    var paper = store.state.papers.filter(function (item) { return item.id === p.paperId; })[0];
    var task = {
      id: uid('t'),
      title: p.title || (paper ? paper.title : '未命名任务'),
      classId: p.classId || 'c1',
      paperId: p.paperId,
      questionIds: (paper ? paper.questionIds : p.questionIds || []).slice(),
      assignedAt: p.assignedAt || nowIso(),
      dueAt: p.dueAt || new Date(Date.now() + 3 * 86400000).toISOString(),
      status: '进行中',
      scopeNote: p.scopeNote || ''
    };
    store.state.tasks.push(task);
    store.audit('布置练习任务', task.title, 'task', task.id);
    store.commit('task');
    return task;
  };

  /* ---------------- 学生作答 ---------------- */
  function findQuestion(questionId) {
    return store.state.questions.filter(function (q) { return q.id === questionId; })[0] || null;
  }

  function guessErrorTag(question, rawAnswer, correct) {
    if (correct || !question) return null;
    var target = ZWZ.grader.normalize(rawAnswer);
    var wrongs = question.wrongs || [];
    for (var i = 0; i < wrongs.length; i++) {
      if (ZWZ.grader.normalize(wrongs[i].a) === target) return wrongs[i].e;
    }
    if ((question.errorTags || []).length === 1) return question.errorTags[0];
    return null;
  }

  actions.submitAnswer = function (payload) {
    var p = payload || {};
    var question = findQuestion(p.questionId);
    if (!question) return null;
    var studentId = p.studentId || store.session.userId;
    var raw = p.rawAnswer === undefined || p.rawAnswer === null ? '' : String(p.rawAnswer);
    var existing = store.state.answers.filter(function (a) {
      return a.studentId === studentId && a.taskId === p.taskId && a.questionId === p.questionId;
    })[0];

    var hintLevels = (p.hintLevels || []).slice();
    store.state.hintEvents.forEach(function (ev) {
      if (ev.studentId === studentId && ev.questionId === p.questionId && hintLevels.indexOf(ev.level) < 0) {
        hintLevels.push(ev.level);
      }
    });

    var answer = existing || {
      id: uid('a'),
      studentId: studentId,
      taskId: p.taskId,
      questionId: p.questionId,
      submittedAt: nowIso(),
      source: '学生端提交'
    };
    answer.rawAnswer = raw;
    answer.submittedAt = nowIso();
    answer.attempts = (answer.attempts || 0) + 1;
    answer.hintLevels = hintLevels;
    answer.durationSec = p.durationSec || answer.durationSec || 0;
    answer.recognition = p.recognition || 'ok';
    answer.score = undefined;
    answer.reviewedScore = undefined;
    answer.reviewedNote = undefined;
    answer.reviewedBy = undefined;
    answer.reviewedAt = undefined;
    var result = ZWZ.grader.apply(store.state, answer);
    answer.errorTag = guessErrorTag(question, raw, result.status === 'auto' && result.score === result.maxScore);

    if (!existing) store.state.answers.push(answer);
    store.state.drafts[studentId + ':' + p.questionId] = undefined;

    store.audit('提交作答', '任务 ' + p.taskId + ' · 题目 ' + question.code + ' · ' + result.status, 'answer', answer.id);
    store.commit('answer');

    var kpId = (question.kpIds || [])[0];
    var diags = ZWZ.sel.diagnostics(store.state, { studentId: studentId }).filter(function (d) {
      return d.kpId === kpId;
    });
    return { answer: answer, result: result, diagnostics: diags };
  };

  actions.saveDraft = function (payload) {
    var p = payload || {};
    var sid = p.studentId || store.session.userId;
    store.state.drafts[sid + ':' + p.questionId] = {
      text: p.text,
      updatedAt: nowIso()
    };
    store.save();
    return store.state.drafts[sid + ':' + p.questionId];
  };

  actions.clearDraft = function (payload) {
    var p = payload || {};
    var sid = p.studentId || store.session.userId;
    delete store.state.drafts[sid + ':' + p.questionId];
    store.save();
  };

  actions.getDraft = function (payload) {
    var p = payload || {};
    var sid = p.studentId || store.session.userId;
    return store.state.drafts[sid + ':' + p.questionId] || null;
  };

  actions.logHint = function (payload) {
    var p = payload || {};
    var sid = p.studentId || store.session.userId;
    store.state.hintEvents.push({
      id: uid('h'),
      studentId: sid,
      questionId: p.questionId,
      level: p.level,
      at: nowIso()
    });
    store.save();
    store.emit('hint');
    return store.state.hintEvents.length;
  };

  /* ---------------- 教师复核 ---------------- */
  actions.gradeAnswer = function (answerId, patch) {
    var p = patch || {};
    var answer = store.state.answers.filter(function (a) { return a.id === answerId; })[0];
    if (!answer) return null;
    var question = findQuestion(answer.questionId);
    var before = { score: answer.score, status: answer.gradeStatus, note: answer.gradeNote };
    if (p.score !== undefined && p.score !== null && p.score !== '') {
      answer.reviewedScore = Number(p.score);
    }
    if (p.recognition !== undefined) answer.recognition = p.recognition;
    answer.reviewedNote = p.note || '';
    answer.reviewedBy = store.session.userId;
    answer.reviewedAt = nowIso();
    answer.score = undefined;
    ZWZ.grader.apply(store.state, answer);
    answer.reviewedAction = p.action || 'modify';

    store.state.reviews.unshift({
      id: uid('r'),
      targetType: 'grade',
      targetId: answer.id,
      by: store.session.userId,
      at: answer.reviewedAt,
      action: answer.reviewedAction,
      before: before,
      after: { score: answer.score, status: answer.gradeStatus, note: answer.reviewedNote },
      note: answer.reviewedNote
    });
    store.audit('复核批阅', (question ? '第 ' + question.code + ' 题' : '作答记录') + ' · ' + (answer.score === null ? '未定分' : answer.score + ' 分'), 'answer', answer.id);
    store.commit('review');
    return answer;
  };

  function parseDiagId(diagId) {
    var parts = String(diagId || '').split('_');
    if (parts.length < 3) return null;
    return { studentId: parts[1], kpId: parts.slice(2).join('_') };
  }

  actions.confirmDiagnosis = function (diagId, patch) {
    var ref = parseDiagId(diagId);
    if (!ref) return null;
    var p = patch || {};
    var kp = ZWZ.sel.kp(store.state, ref.kpId);
    var row = {
      id: uid('dr'),
      studentId: ref.studentId,
      kpId: ref.kpId,
      by: store.session.userId,
      at: nowIso(),
      action: p.action || 'confirm',
      status: p.status || 'sufficient',
      performance: p.performance || null,
      errorTypes: p.errorTypes || null,
      note: p.note || '教师已确认该诊断结论。'
    };
    store.state.diagnosisReviews.push(row);
    store.audit(
      p.action === 'mark-undetermined' ? '标记暂无法判断' : '确认 / 修正诊断',
      (kp ? kp.name : ref.kpId) + ' · ' + (p.note || ''),
      'diagnosis',
      diagId
    );
    store.commit('diagnosis');
    return row;
  };

  actions.markUndetermined = function (diagId, note) {
    return actions.confirmDiagnosis(diagId, {
      action: 'mark-undetermined',
      status: 'undetermined',
      note: note || '教师标记为暂无法判断，需补充记录。'
    });
  };

  /* ---------------- 材料与知识范围 ---------------- */
  actions.addMaterial = function (material) {
    var m = Object.assign(
      {
        id: uid('m'),
        name: '未命名材料',
        type: '教师补充',
        source: '教师上传（模拟）',
        version: 'v1',
        chapterIds: [],
        kpIds: [],
        usage: ['teacher'],
        status: '待确认',
        note: '',
        importedAt: nowIso()
      },
      material || {}
    );
    store.state.materials.push(m);
    store.audit('添加教学材料', m.name, 'material', m.id);
    store.commit('material');
    return m;
  };

  actions.updateMaterial = function (materialId, patch) {
    var m = store.state.materials.filter(function (item) { return item.id === materialId; })[0];
    if (!m) return null;
    Object.assign(m, patch || {});
    store.audit('更新教学材料', m.name + ' · ' + (patch && patch.status ? patch.status : ''), 'material', m.id);
    store.commit('material');
    return m;
  };

  actions.setClassScope = function (classId, chapterIds) {
    var cls = store.state.classes.filter(function (c) { return c.id === classId; })[0];
    if (!cls) return null;
    cls.scopeChapterIds = (chapterIds || []).slice();
    store.audit('调整教学范围', '章节：' + (chapterIds || []).join('、'), 'class', classId);
    store.commit('scope');
    return cls;
  };

  /* ---------------- 学情数据导入 ---------------- */
  actions.importLearners = function (payload) {
    var p = payload || {};
    var preview = p.preview || [];
    var cls = store.state.classes.filter(function (c) { return c.id === (p.classId || (store.state.classes[0] && store.state.classes[0].id) || 'c1'); })[0];
    var added = 0;
    preview.forEach(function (row) {
      if (!row.name) return;
      var exists = store.state.users.some(function (u) { return u.role === 'student' && u.name === row.name; });
      if (exists) return;
      var id = uid('s');
      store.state.users.push({
        id: id,
        role: 'student',
        name: row.name,
        classId: cls ? cls.id : ((store.state.classes[0] && store.state.classes[0].id) || 'c1'),
        avatarSeed: id,
        note: '导入后待确认',
        importedAt: nowIso()
      });
      if (cls) cls.studentIds.push(id);
      added++;
    });
    store.state.imports.unshift({
      id: uid('imp'),
      at: nowIso(),
      fileName: p.fileName || '未命名.csv',
      type: 'csv',
      rows: preview.length,
      ok: preview.length,
      issues: [],
      fieldMap: p.mapping || {},
      status: '已确认',
      note: '新增学生 ' + added + ' 名'
    });
    store.audit('导入学情数据', (p.fileName || '') + ' · 新增学生 ' + added + ' 名', 'import', '');
    store.commit('import');
    return { added: added };
  };

  /* ---------------- 辅助 ---------------- */
  actions.setPaperStatus = function (paperId, status) {
    var paper = store.state.papers.filter(function (p) { return p.id === paperId; })[0];
    if (!paper) return null;
    paper.status = status;
    store.commit('paper');
    return paper;
  };

  actions.markThreadRead = function () { /* 预留：助手消息已读状态 */ };

  ZWZ.store = store;
})();


