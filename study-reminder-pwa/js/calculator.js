/**
 * Calculator - Study time allocation calculations
 */

const Calculator = {
  /**
   * Calculate remaining days until exam
   */
  calculateRemainingDays(examDate, bufferDays = 7) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const exam = new Date(examDate);
    exam.setHours(0, 0, 0, 0);

    const diffTime = exam - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays - bufferDays);
  },

  /**
   * Calculate daily time allocation for each subject
   * @param {Array} subjects - Array of subject objects with weight
   * @param {number} dailyHours - Total study hours for the day
   * @returns {Object} - {subjectId: minutes}
   */
  calculateDailyAllocation(subjects, dailyHours) {
    if (!subjects || subjects.length === 0) return {};

    const totalWeight = subjects.reduce((sum, s) => sum + (s.weight || 1), 0);
    const totalMinutes = dailyHours * 60;

    const allocation = {};
    subjects.forEach(subject => {
      const ratio = (subject.weight || 1) / totalWeight;
      allocation[subject.id] = Math.round(ratio * totalMinutes);
    });

    return allocation;
  },

  /**
   * Get today's study hours based on day of week
   */
  getTodayHours(config) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = dayNames[new Date().getDay()];
    return config.weeklyHours?.[today] || 3.0;
  },

  /**
   * Check if today is a cram school day
   */
  isCramSchoolDay(config) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = dayNames[new Date().getDay()];
    return config.cramSchoolDays?.includes(today) || false;
  },

  /**
   * Calculate progress rate
   */
  calculateProgressRate(planned, actual) {
    if (planned <= 0) return 0;
    return Math.round((actual / planned) * 100 * 10) / 10;
  },

  /**
   * Calculate savings (ahead/behind schedule)
   * @returns {Object} - {savingsMinutes, savingsDays, status}
   */
  calculateSavings(config, subjects, logs) {
    if (!config.startDate || !config.examDate) {
      return { savingsMinutes: 0, savingsDays: 0, status: 'unknown' };
    }

    const startDate = new Date(config.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const elapsedDays = Math.max(0, Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)));

    // Calculate expected progress
    const avgDailyMinutes = this.getAverageDailyMinutes(config);
    const expectedMinutes = elapsedDays * avgDailyMinutes;

    // Calculate actual progress
    const actualMinutes = logs.reduce((sum, log) => sum + (log.actualMinutes || 0), 0);

    const savingsMinutes = actualMinutes - expectedMinutes;
    const savingsDays = avgDailyMinutes > 0 ? Math.round(savingsMinutes / avgDailyMinutes * 10) / 10 : 0;

    let status = 'on_track';
    if (savingsDays >= 1) status = 'ahead';
    else if (savingsDays <= -1) status = 'behind';

    return { savingsMinutes, savingsDays, status };
  },

  /**
   * Get average daily minutes from weekly hours
   */
  getAverageDailyMinutes(config) {
    if (!config.weeklyHours) return 180; // Default 3 hours

    const hours = Object.values(config.weeklyHours);
    const avgHours = hours.reduce((a, b) => a + b, 0) / hours.length;
    return avgHours * 60;
  },

  /**
   * Get today's date as ISO string (YYYY-MM-DD)
   */
  getTodayString() {
    return new Date().toISOString().split('T')[0];
  },

  /**
   * Format minutes to display string
   */
  formatMinutes(minutes) {
    if (minutes < 60) {
      return `${minutes}分`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`;
  },

  /**
   * Calculate subject progress
   */
  calculateSubjectProgress(subject, logs, config) {
    const subjectLogs = logs.filter(log => log.subjectId === subject.id);
    const totalActual = subjectLogs.reduce((sum, log) => sum + (log.actualMinutes || 0), 0);

    // Calculate expected (simplified: daily allocation * elapsed days)
    if (!config.startDate) {
      return { totalActual, totalPlanned: 0, rate: 0 };
    }

    const startDate = new Date(config.startDate);
    const today = new Date();
    const elapsedDays = Math.max(0, Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)));

    const subjects = [subject]; // Simplified - would need all subjects for accurate calc
    const dailyAlloc = this.calculateDailyAllocation([subject], this.getAverageDailyMinutes(config) / 60);
    const dailyMinutes = dailyAlloc[subject.id] || 0;
    const totalPlanned = dailyMinutes * elapsedDays;

    return {
      totalActual,
      totalPlanned,
      rate: this.calculateProgressRate(totalPlanned, totalActual)
    };
  },

  /**
   * Calculate goal bonus XP for exceeding daily goal
   * @param {number} excessMinutes - Minutes over the goal
   * @returns {number} - Bonus XP (1 XP per 10 minutes, max 20 XP)
   */
  calculateGoalBonus(excessMinutes) {
    if (excessMinutes <= 0) return 0;
    return Math.min(20, Math.floor(excessMinutes / 10));
  }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Calculator;
}
