/**
 * StudyCat - Main Application
 */

const App = {
  config: null,
  subjects: [],
  logs: [],
  catState: null,
  timerSessions: [],

  /**
   * Initialize the application
   */
  async init() {
    // Initialize storage
    await StorageManager.init();

    // Load data
    await this.loadData();

    // Check if setup is needed
    if (!this.config || !this.config.examDate || this.subjects.length === 0) {
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
    const allocation = Calculator.calculateDailyAllocation(this.subjects, todayHours);

    const todayLogs = this.logs.filter(log => log.date === todayString);
    const logsBySubject = {};
    todayLogs.forEach(log => {
      logsBySubject[log.subjectId] = (logsBySubject[log.subjectId] || 0) + log.actualMinutes;
    });

    const todayPlans = this.subjects.map(subject => {
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
   * Get remaining days
   */
  getRemainingDays() {
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
