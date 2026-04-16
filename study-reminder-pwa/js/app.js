/**
 * StudyCat - Main Application
 */

const App = {
  config: null,
  subjects: [],
  logs: [],
  catState: null,
  timerSessions: [],
  exams: [],
  _initPromise: null,

  /**
   * Initialize the application (idempotent: concurrent calls share the same Promise)
   */
  init() {
    if (!this._initPromise) {
      this._initPromise = this._doInit();
    }
    return this._initPromise;
  },

  async _doInit() {
    // Initialize storage
    await StorageManager.init();

    // Run migrations (must be before loadData to ensure exams are available)
    if (typeof MigrationManager !== 'undefined') {
      await MigrationManager.runMigrations();
    }

    // Load data
    await this.loadData();

    // Check if setup is needed: require either legacy examDate or exams
    const hasExamDate = this.config && this.config.examDate;
    const hasExams = this.exams && this.exams.length > 0;
    if ((!hasExamDate && !hasExams) || this.subjects.length === 0) {
      if (!window.location.pathname.includes('setup')) {
        window.location.href = 'setup.html';
        return;
      }
    }

    // Initialize cat state if needed
    if (!this.catState || !this.catState.level) {
      this.catState = CatSystem.getDefaultState();
      await this.saveCatState();
    }
  },

  /**
   * Load all data from storage
   */
  async loadData() {
    this.config = await StorageManager.load(StorageManager.STORES.CONFIG, this.getDefaultConfig());
    this.subjects = await StorageManager.load(StorageManager.STORES.SUBJECTS, []);
    this.logs = await StorageManager.load(StorageManager.STORES.LOGS, []);
    this.catState = await StorageManager.load(StorageManager.STORES.CAT, CatSystem.getDefaultState());
    this.timerSessions = await StorageManager.load(StorageManager.STORES.TIMER_SESSIONS, []);
    this.exams = await StorageManager.load(StorageManager.STORES.EXAMS, []);
  },

  /**
   * Get default config
   */
  getDefaultConfig() {
    return {
      id: 'main',
      examDate: null,
      startDate: null,
      bufferDays: 7,
      weeklyHours: {
        monday: 3.0,
        tuesday: 1.5,
        wednesday: 3.0,
        thursday: 1.5,
        friday: 3.0,
        saturday: 1.5,
        sunday: 3.0
      },
      cramSchoolDays: ['tuesday', 'thursday', 'saturday'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Save config
   */
  async saveConfig() {
    this.config.updatedAt = new Date().toISOString();
    await StorageManager.save(StorageManager.STORES.CONFIG, this.config);
  },

  /**
   * Save subjects
   */
  async saveSubjects() {
    await StorageManager.save(StorageManager.STORES.SUBJECTS, this.subjects);
  },

  /**
   * Save study logs
   */
  async saveLogs() {
    await StorageManager.save(StorageManager.STORES.LOGS, this.logs);
  },

  /**
   * Save cat state
   */
  async saveCatState() {
    await StorageManager.save(StorageManager.STORES.CAT, this.catState);
  },

  /**
   * Add study log
   */
  async addStudyLog(subjectId, minutes, date = null) {
    const subject = this.subjects.find(s => s.id === subjectId);
    if (!subject) return null;

    const logDate = date || Calculator.getTodayString();

    // Check for existing log
    const existingLog = this.logs.find(
      log => log.date === logDate && log.subjectId === subjectId
    );

    if (existingLog) {
      existingLog.actualMinutes += minutes;
      existingLog.updatedAt = new Date().toISOString();
    } else {
      const newLog = {
        id: StorageManager.generateId(),
        date: logDate,
        subjectId: subjectId,
        subjectName: subject.name,
        plannedMinutes: 0,
        actualMinutes: minutes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.logs.push(newLog);
    }

    // Update subject total
    subject.totalActual = (subject.totalActual || 0) + minutes;
    subject.updatedAt = new Date().toISOString();

    // Update cat
    const { leveledUp, newLevel } = CatSystem.addStudyTime(this.catState, minutes);
    CatSystem.updateStreak(this.catState, logDate, true);

    // Save all
    await this.saveLogs();
    await this.saveSubjects();
    await this.saveCatState();

    return { leveledUp, newLevel };
  },

  /**
   * Get today's study data
   */
  getTodayData() {
    const todayString = Calculator.getTodayString();
    const todayHours = Calculator.getTodayHours(this.config);

    // 次のテストに対象教科が設定されている場合はその科目のみに絞り込む
    const nextExam = this.getNextExam();
    const hasExamSubjects = nextExam && nextExam.subjectIds && nextExam.subjectIds.length > 0;
    const activeSubjects = hasExamSubjects
      ? this.subjects.filter(s => nextExam.subjectIds.includes(s.id))
      : this.subjects;
    const allocation = hasExamSubjects
      ? Calculator.calculateExamAllocation(nextExam, this.subjects, todayHours)
      : Calculator.calculateDailyAllocation(this.subjects, todayHours);

    const todayLogs = this.logs.filter(log => log.date === todayString);
    const logsBySubject = {};
    todayLogs.forEach(log => {
      logsBySubject[log.subjectId] = (logsBySubject[log.subjectId] || 0) + log.actualMinutes;
    });

    const todayPlans = activeSubjects.map(subject => {
      const planned = allocation[subject.id] || 0;
      const actual = logsBySubject[subject.id] || 0;
      return {
        subject,
        plannedMinutes: planned,
        actualMinutes: actual,
        completed: planned > 0 && actual >= planned,
        rate: Calculator.calculateProgressRate(planned, actual)
      };
    });

    const totalPlanned = todayPlans.reduce((sum, p) => sum + p.plannedMinutes, 0);
    const totalActual = todayPlans.reduce((sum, p) => sum + p.actualMinutes, 0);
    const progressRate = Calculator.calculateProgressRate(totalPlanned, totalActual);

    return {
      date: todayString,
      todayPlans,
      totalPlanned,
      totalActual,
      progressRate,
      isCramSchoolDay: Calculator.isCramSchoolDay(this.config)
    };
  },

  /**
   * Save exams
   */
  async saveExams() {
    await StorageManager.save(StorageManager.STORES.EXAMS, this.exams);
  },

  /**
   * Add a new exam
   */
  async addExam(examData) {
    const exam = ExamManager.createExam(examData);
    this.exams.push(exam);
    await this.saveExams();
    return exam;
  },

  /**
   * Update an exam
   */
  async updateExam(examId, updates) {
    const index = this.exams.findIndex(e => e.id === examId);
    if (index === -1) return null;

    this.exams[index] = {
      ...this.exams[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await this.saveExams();
    return this.exams[index];
  },

  /**
   * Delete an exam
   */
  async deleteExam(examId) {
    this.exams = this.exams.filter(e => e.id !== examId);
    await this.saveExams();
  },

  /**
   * Get the next upcoming exam
   */
  getNextExam() {
    if (typeof ExamManager !== 'undefined') {
      return ExamManager.getNextExam(this.exams);
    }
    return null;
  },

  /**
   * Get remaining days (legacy compatibility + new exam system)
   */
  getRemainingDays() {
    // First, try to get from next exam
    const nextExam = this.getNextExam();
    if (nextExam) {
      const days = ExamManager.getDaysUntilExam(nextExam);
      return days !== null ? days : 0;
    }

    // Fallback to legacy config.examDate
    if (!this.config || !this.config.examDate) return 0;
    return Calculator.calculateRemainingDays(this.config.examDate, this.config.bufferDays || 7);
  },

  /**
   * Get savings data
   */
  getSavings() {
    return Calculator.calculateSavings(this.config, this.subjects, this.logs);
  },

  /**
   * Update cat state based on today's progress
   */
  updateCatForToday() {
    const todayData = this.getTodayData();
    CatSystem.updateState(this.catState, todayData.progressRate, todayData.totalActual);
    return this.catState;
  },

  /**
   * Export data for backup
   */
  async exportBackup() {
    const data = await StorageManager.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `studycat-backup-${Calculator.getTodayString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Import data from backup
   */
  async importBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          await StorageManager.importData(data);
          await this.loadData();
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  },

  /**
   * Reset all data
   */
  async resetAllData() {
    await StorageManager.clearAll();
    this.config = this.getDefaultConfig();
    this.subjects = [];
    this.logs = [];
    this.catState = CatSystem.getDefaultState();
    this.timerSessions = [];
    this.exams = [];
  },

  /**
   * Get today's timer sessions
   */
  async getTodayTimerSessions() {
    const todayString = Calculator.getTodayString();
    return await StorageManager.getTimerSessionsByDate(todayString);
  },

  /**
   * Check if timer has an active session
   */
  hasActiveTimer() {
    if (typeof TimerManager !== 'undefined') {
      return TimerManager.hasActiveSession();
    }
    return false;
  }
};

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('ServiceWorker registered:', registration.scope);
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed:', error);
      });
  });
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(console.error);
});
