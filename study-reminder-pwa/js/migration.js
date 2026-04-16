/**
 * Migration Manager - Database migration and data transformation
 */

const MigrationManager = {
  /**
   * Run all necessary migrations
   * Called from App.init() after StorageManager.init()
   */
  async runMigrations() {
    const config = await StorageManager.load(StorageManager.STORES.CONFIG, null);

    // If no config, nothing to migrate
    if (!config) return;

    // Check if migration needed: examDate exists but no exams store data
    if (config.examDate) {
      const exams = await StorageManager.load(StorageManager.STORES.EXAMS, []);

      // If no exams exist, migrate from legacy examDate
      if (!exams || exams.length === 0) {
        await this.migrateExamDateToExams(config);
      }
    }

    console.log('Migrations completed');
  },

  /**
   * Migrate legacy examDate from config to exams store
   */
  async migrateExamDateToExams(config) {
    console.log('Migrating legacy examDate to exams store...');

    // Get all subjects for the exam
    const subjects = await StorageManager.load(StorageManager.STORES.SUBJECTS, []);
    const subjectIds = subjects.map(s => s.id);

    // Create exam from legacy data
    const exam = ExamManager.createExam({
      name: '試験',  // Generic name since we didn't store it before
      type: ExamManager.TYPES.REGULAR,
      dates: [config.examDate],
      dateUndecided: false,
      subjectIds: subjectIds,
      subjectWeights: {},  // Use default weights from subjects
      reviewDays: config.bufferDays || 7  // Use bufferDays as reviewDays
    });

    // Save the migrated exam
    await StorageManager.add(StorageManager.STORES.EXAMS, exam);

    console.log('Migration complete: Created exam from legacy examDate', exam);
  }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MigrationManager;
}
