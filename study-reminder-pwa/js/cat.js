/**
 * Cat System - Mascot state and messages
 */

const CatSystem = {
  // Cat states
  STATES: {
    HAPPY: 'happy',
    CHEERING: 'cheering',
    WORRIED: 'worried',
    SLEEPING: 'sleeping',
    CELEBRATING: 'celebrating'
  },

  // Emoji for each state
  EMOJI: {
    happy: '😺',
    cheering: '😸',
    worried: '😿',
    sleeping: '😴',
    celebrating: '🎉😻'
  },

  // Messages for each state
  MESSAGES: {
    happy: [
      'いい調子だにゃ！',
      '順調に進んでるにゃ〜',
      'この調子で頑張ろうにゃ！',
      '今日もよく頑張ってるにゃ！'
    ],
    cheering: [
      'もう少しだにゃ！頑張って！',
      '応援してるにゃ！',
      'あと少しで目標達成にゃ！',
      '一緒に頑張ろうにゃ！'
    ],
    worried: [
      '今日はまだ始めてないにゃ...',
      '一緒に頑張ろうにゃ！',
      '少しずつでいいにゃ',
      '無理しないでね、でも頑張ろうにゃ'
    ],
    sleeping: [
      'おやすみにゃ...zzz',
      '今日もお疲れ様にゃ...',
      'ゆっくり休んでにゃ...'
    ],
    celebrating: [
      '今日の目標達成だにゃ！🎉',
      'すごいにゃ！よく頑張った！',
      '完璧にゃ〜！✨',
      'やったにゃ！最高だにゃ！'
    ]
  },

  // Savings messages
  SAVINGS_MESSAGES: {
    ahead: [
      '{days}日分の貯金があるにゃ！✨',
      'すごい！{days}日分も前倒しだにゃ！',
      '貯金{days}日分！この調子にゃ！'
    ],
    on_track: [
      '予定通り進んでるにゃ！',
      'いいペースだにゃ〜',
      'ちょうどいい感じにゃ！'
    ],
    behind: [
      'ちょっと遅れ気味にゃ...頑張ろう！',
      '{days}日分取り戻そうにゃ！',
      '少しペースアップしようにゃ'
    ]
  },

  // Level thresholds (total hours)
  LEVEL_THRESHOLDS: [0, 50, 150, 300, 500],

  /**
   * Get default cat state
   */
  getDefaultState() {
    return {
      id: 'main',
      currentState: this.STATES.HAPPY,
      level: 1,
      experience: 0,
      totalStudyMinutes: 0,
      streakDays: 0,
      lastStudyDate: null,
      unlockedItems: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Update cat state based on progress
   */
  updateState(catState, progressRate, todayActualMinutes = 0) {
    let newState = this.STATES.WORRIED;

    const hour = new Date().getHours();

    // Determine state based on progress and time
    if (progressRate >= 100) {
      newState = this.STATES.CELEBRATING;
    } else if (progressRate >= 80) {
      newState = this.STATES.HAPPY;
    } else if (progressRate >= 50) {
      newState = this.STATES.CHEERING;
    } else if (todayActualMinutes > 0) {
      newState = this.STATES.CHEERING;
    } else if (hour >= 23 || hour < 6) {
      newState = this.STATES.SLEEPING;
    } else {
      newState = this.STATES.WORRIED;
    }

    catState.currentState = newState;
    catState.updatedAt = new Date().toISOString();

    return catState;
  },

  /**
   * Add study time and check for level up
   */
  addStudyTime(catState, minutes) {
    catState.totalStudyMinutes += minutes;
    catState.experience += Math.floor(minutes / 5); // 5 minutes = 1 XP

    const totalHours = catState.totalStudyMinutes / 60;
    let newLevel = 1;

    for (let i = this.LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (totalHours >= this.LEVEL_THRESHOLDS[i]) {
        newLevel = i + 1;
        break;
      }
    }

    const leveledUp = newLevel > catState.level;
    catState.level = newLevel;
    catState.updatedAt = new Date().toISOString();

    return { leveledUp, newLevel };
  },

  /**
   * Update streak
   */
  updateStreak(catState, todayString, hasStudied) {
    if (!hasStudied) return catState;

    if (catState.lastStudyDate === todayString) {
      // Already studied today
      return catState;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split('T')[0];

    if (catState.lastStudyDate === yesterdayString) {
      // Consecutive day
      catState.streakDays += 1;
    } else if (catState.lastStudyDate !== todayString) {
      // Streak broken, reset to 1
      catState.streakDays = 1;
    }

    catState.lastStudyDate = todayString;
    catState.updatedAt = new Date().toISOString();

    return catState;
  },

  /**
   * Get random message for current state
   */
  getMessage(state) {
    const messages = this.MESSAGES[state] || this.MESSAGES.happy;
    return messages[Math.floor(Math.random() * messages.length)];
  },

  /**
   * Get savings message
   */
  getSavingsMessage(savingsData) {
    const { savingsDays, status } = savingsData;
    const messages = this.SAVINGS_MESSAGES[status] || this.SAVINGS_MESSAGES.on_track;
    const message = messages[Math.floor(Math.random() * messages.length)];
    return message.replace('{days}', Math.abs(savingsDays).toFixed(1));
  },

  /**
   * Get emoji for state
   */
  getEmoji(state) {
    return this.EMOJI[state] || this.EMOJI.happy;
  },

  /**
   * Get level progress percentage
   */
  getLevelProgress(catState) {
    const currentThreshold = this.LEVEL_THRESHOLDS[catState.level - 1] || 0;
    const nextThreshold = this.LEVEL_THRESHOLDS[catState.level] || this.LEVEL_THRESHOLDS[this.LEVEL_THRESHOLDS.length - 1];

    const totalHours = catState.totalStudyMinutes / 60;
    const progress = (totalHours - currentThreshold) / (nextThreshold - currentThreshold);

    return Math.min(100, Math.max(0, progress * 100));
  },

  /**
   * Get streak message
   */
  getStreakMessage(streakDays) {
    if (streakDays >= 30) return `${streakDays}日連続！すごすぎるにゃ！🔥`;
    if (streakDays >= 14) return `${streakDays}日連続！最高だにゃ！🔥`;
    if (streakDays >= 7) return `${streakDays}日連続！素晴らしいにゃ！🔥`;
    if (streakDays >= 3) return `${streakDays}日連続！いい調子にゃ！`;
    if (streakDays >= 1) return `${streakDays}日目！続けていこうにゃ！`;
    return '';
  }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CatSystem;
}
