/**
 * Exam Manager - Multiple exam support
 * Handles exam CRUD, status calculation, and review period tracking
 */

const ExamManager = {
  // Exam types
  TYPES: {
    REGULAR: 'regular',   // 定期テスト
    MOCK: 'mock',         // 模試
    ENTRANCE: 'entrance'  // 入試
  },

  // Exam status
  STATUS: {
    UPCOMING: 'upcoming',   // 試験前
    REVIEW: 'review',       // 復習期間中
    COMPLETED: 'completed'  // 終了
  },

  // Type labels for display
  TYPE_LABELS: {
    regular: '定期テスト',
    mock: '模試',
    entrance: '入試'
  },

  // Type icons for display
  TYPE_ICONS: {
    regular: '📝',
    mock: '📊',
    entrance: '🎯'
  },

  /**
   * Create a new exam object
   */
  createExam(data) {
    return {
      id: data.id || StorageManager.generateId(),
      name: data.name || '',
      type: data.type || this.TYPES.REGULAR,
      dates: data.dates || [],  // Array of 'YYYY-MM-DD' strings (1-3 days)
      dateUndecided: data.dateUndecided || false,
      subjectIds: data.subjectIds || [],
      subjectWeights: data.subjectWeights || {},  // {subjectId: weight}
      reviewDays: data.reviewDays ?? 3,
      status: data.status || this.STATUS.UPCOMING,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Calculate exam status based on dates
   * @param {Object} exam - Exam object
   * @param {Date} today - Optional today date for testing
   * @returns {string} - Status string
   */
  calculateStatus(exam, today = new Date()) {
    if (exam.dateUndecided || !exam.dates || exam.dates.length === 0) {
      return this.STATUS.UPCOMING;
    }

    const todayStr = this.formatDate(today);
    const lastExamDate = exam.dates[exam.dates.length - 1];

    // If last exam date has passed
    if (todayStr > lastExamDate) {
      return this.STATUS.COMPLETED;
    }

    // Check if in review period
    const firstExamDate = exam.dates[0];
    const reviewStartDate = this.addDays(new Date(firstExamDate), -exam.reviewDays);
    const reviewStartStr = this.formatDate(reviewStartDate);

    if (todayStr >= reviewStartStr) {
      return this.STATUS.REVIEW;
    }

    return this.STATUS.UPCOMING;
  },

  /**
   * Calculate days until exam start
   * @returns {number|null} - Days remaining, or null if date undecided
   */
  getDaysUntilExam(exam, today = new Date()) {
    if (exam.dateUndecided || !exam.dates || exam.dates.length === 0) {
      return null;
    }

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const examDate = new Date(exam.dates[0]);
    examDate.setHours(0, 0, 0, 0);

    const diffMs = examDate - todayStart;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  },

  /**
   * Calculate days until review period starts
   * @returns {number|null} - Days remaining, or null if already in review/completed
   */
  getDaysUntilReview(exam, today = new Date()) {
    if (exam.dateUndecided || !exam.dates || exam.dates.length === 0) {
      return null;
    }

    const status = this.calculateStatus(exam, today);
    if (status !== this.STATUS.UPCOMING) {
      return null;
    }

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const examDate = new Date(exam.dates[0]);
    const reviewStart = this.addDays(examDate, -exam.reviewDays);
    reviewStart.setHours(0, 0, 0, 0);

    const diffMs = reviewStart - todayStart;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  },

  /**
   * Get days remaining in review period
   * @returns {number|null} - Days remaining in review, or null if not in review
   */
  getReviewDaysRemaining(exam, today = new Date()) {
    const status = this.calculateStatus(exam, today);
    if (status !== this.STATUS.REVIEW) {
      return null;
    }

    return this.getDaysUntilExam(exam, today);
  },

  /**
   * Get the next upcoming exam (closest to today)
   * @param {Array} exams - Array of exam objects
   * @returns {Object|null} - Next exam or null
   */
  getNextExam(exams, today = new Date()) {
    if (!exams || exams.length === 0) return null;

    const upcomingExams = exams
      .filter(exam => {
        const status = this.calculateStatus(exam, today);
        return status !== this.STATUS.COMPLETED && !exam.dateUndecided;
      })
      .sort((a, b) => {
        const daysA = this.getDaysUntilExam(a, today);
        const daysB = this.getDaysUntilExam(b, today);
        if (daysA === null) return 1;
        if (daysB === null) return -1;
        return daysA - daysB;
      });

    return upcomingExams[0] || null;
  },

  /**
   * Get all active exams (upcoming + review)
   */
  getActiveExams(exams, today = new Date()) {
    if (!exams || exams.length === 0) return [];

    return exams.filter(exam => {
      const status = this.calculateStatus(exam, today);
      return status !== this.STATUS.COMPLETED;
    });
  },

  /**
   * Get subject weights for an exam
   * Falls back to default weights from subjects store
   */
  getSubjectWeights(exam, subjects) {
    const weights = {};

    exam.subjectIds.forEach(subjectId => {
      const subject = subjects.find(s => s.id === subjectId);
      if (subject) {
        // Use exam-specific weight if set, otherwise use subject's default
        weights[subjectId] = exam.subjectWeights[subjectId] ?? subject.weight ?? 5;
      }
    });

    return weights;
  },

  /**
   * Format date range for display
   */
  formatDateRange(exam) {
    if (exam.dateUndecided || !exam.dates || exam.dates.length === 0) {
      return '日付未定';
    }

    const dates = exam.dates;
    if (dates.length === 1) {
      return this.formatDisplayDate(dates[0]);
    }

    const first = this.formatDisplayDate(dates[0]);
    const last = this.formatDisplayDate(dates[dates.length - 1]);
    return `${first} - ${last}`;
  },

  /**
   * Format date for display (M/D format)
   */
  formatDisplayDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  },

  /**
   * Format date as YYYY-MM-DD
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Add days to a date
   */
  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },

  /**
   * Validate exam data
   * @returns {Object} - {valid: boolean, errors: string[]}
   */
  validate(exam) {
    const errors = [];

    if (!exam.name || exam.name.trim() === '') {
      errors.push('テスト名を入力してください');
    }

    if (!exam.dateUndecided && (!exam.dates || exam.dates.length === 0)) {
      errors.push('日付を設定するか、日付未定にチェックを入れてください');
    }

    if (exam.dates && exam.dates.length > 3) {
      errors.push('テスト期間は最大3日までです');
    }

    if (!exam.subjectIds || exam.subjectIds.length === 0) {
      errors.push('対象教科を1つ以上選択してください');
    }

    if (exam.reviewDays < 0 || exam.reviewDays > 30) {
      errors.push('復習期間は0〜30日の間で設定してください');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExamManager;
}
