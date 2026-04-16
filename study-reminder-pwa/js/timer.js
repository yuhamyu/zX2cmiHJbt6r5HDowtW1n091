/**
 * Timer Manager - Handles study timer logic
 */

const TimerManager = {
  STORAGE_KEY: 'studycat_activeTimer',

  // Timer statuses
  STATUS: {
    IDLE: 'idle',
    ACTIVE: 'active',
    PAUSED: 'paused',
    COMPLETED: 'completed'
  },

  // Timer modes
  MODE: {
    COUNTUP: 'countup',
    COUNTDOWN: 'countdown'
  },

  // Current timer state (in-memory)
  currentTimer: null,
  intervalId: null,
  onTickCallback: null,
  onCompleteCallback: null,

  /**
   * Initialize timer from localStorage
   */
  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        this.currentTimer = JSON.parse(saved);
        // If timer was active, calculate elapsed time since last save
        if (this.currentTimer.status === this.STATUS.ACTIVE) {
          const now = Date.now();
          const elapsed = Math.floor((now - this.currentTimer.lastResumeTime) / 1000);
          this.currentTimer.accumulatedSeconds += elapsed;
          this.currentTimer.lastResumeTime = now;
          this.save();
        }
      } catch (e) {
        console.error('Failed to load timer state:', e);
        this.currentTimer = null;
      }
    }
    return this.currentTimer;
  },

  /**
   * Save current timer state to localStorage
   */
  save() {
    if (this.currentTimer) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentTimer));
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  },

  /**
   * Start a new timer
   * @param {string} mode - 'countup' or 'countdown'
   * @param {number} presetSeconds - countdown preset (ignored for countup)
   */
  start(mode = 'countup', presetSeconds = 0) {
    const now = Date.now();
    this.currentTimer = {
      sessionId: StorageManager.generateId(),
      startTime: new Date().toISOString(),
      accumulatedSeconds: 0,
      lastResumeTime: now,
      status: this.STATUS.ACTIVE,
      pauseCount: 0,
      mode: mode,
      presetSeconds: presetSeconds
    };
    this.save();
    this.startInterval();
    return this.currentTimer;
  },

  /**
   * Pause the timer
   */
  pause() {
    if (!this.currentTimer || this.currentTimer.status !== this.STATUS.ACTIVE) {
      return null;
    }

    const now = Date.now();
    const elapsed = Math.floor((now - this.currentTimer.lastResumeTime) / 1000);
    this.currentTimer.accumulatedSeconds += elapsed;
    this.currentTimer.status = this.STATUS.PAUSED;
    this.currentTimer.pauseCount += 1;
    this.currentTimer.lastResumeTime = null;

    this.save();
    this.stopInterval();
    return this.currentTimer;
  },

  /**
   * Resume the timer
   */
  resume() {
    if (!this.currentTimer || this.currentTimer.status !== this.STATUS.PAUSED) {
      return null;
    }

    this.currentTimer.status = this.STATUS.ACTIVE;
    this.currentTimer.lastResumeTime = Date.now();

    this.save();
    this.startInterval();
    return this.currentTimer;
  },

  /**
   * Stop the timer and return session data for review
   */
  stop() {
    if (!this.currentTimer) {
      return null;
    }

    // Calculate final accumulated time
    if (this.currentTimer.status === this.STATUS.ACTIVE) {
      const now = Date.now();
      const elapsed = Math.floor((now - this.currentTimer.lastResumeTime) / 1000);
      this.currentTimer.accumulatedSeconds += elapsed;
    }

    const sessionData = {
      sessionId: this.currentTimer.sessionId,
      startTime: this.currentTimer.startTime,
      endTime: new Date().toISOString(),
      totalSeconds: this.currentTimer.accumulatedSeconds,
      pauseCount: this.currentTimer.pauseCount
    };

    this.stopInterval();
    this.currentTimer = null;
    this.save();

    return sessionData;
  },

  /**
   * Cancel the timer without saving
   */
  cancel() {
    this.stopInterval();
    this.currentTimer = null;
    this.save();
  },

  /**
   * Get current elapsed seconds
   */
  getElapsedSeconds() {
    if (!this.currentTimer) {
      return 0;
    }

    let total = this.currentTimer.accumulatedSeconds;

    if (this.currentTimer.status === this.STATUS.ACTIVE && this.currentTimer.lastResumeTime) {
      const now = Date.now();
      total += Math.floor((now - this.currentTimer.lastResumeTime) / 1000);
    }

    return total;
  },

  /**
   * Get current status
   */
  getStatus() {
    if (!this.currentTimer) {
      return this.STATUS.IDLE;
    }
    return this.currentTimer.status;
  },

  /**
   * Check if timer is running
   */
  isRunning() {
    return this.currentTimer && this.currentTimer.status === this.STATUS.ACTIVE;
  },

  /**
   * Check if timer is paused
   */
  isPaused() {
    return this.currentTimer && this.currentTimer.status === this.STATUS.PAUSED;
  },

  /**
   * Check if timer exists (active or paused)
   */
  hasActiveSession() {
    return this.currentTimer !== null;
  },

  /**
   * Get seconds to display (remaining for countdown, elapsed for countup)
   */
  getDisplaySeconds() {
    const elapsed = this.getElapsedSeconds();
    if (this.currentTimer && this.currentTimer.mode === this.MODE.COUNTDOWN) {
      return Math.max(0, this.currentTimer.presetSeconds - elapsed);
    }
    return elapsed;
  },

  /**
   * Check if countdown has finished
   */
  isCountdownFinished() {
    if (!this.currentTimer || this.currentTimer.mode !== this.MODE.COUNTDOWN) {
      return false;
    }
    return this.getElapsedSeconds() >= this.currentTimer.presetSeconds;
  },

  /**
   * Get current mode (falls back to countup for old sessions without mode)
   */
  getMode() {
    return (this.currentTimer && this.currentTimer.mode) || this.MODE.COUNTUP;
  },

  /**
   * Set callback for when countdown reaches zero
   */
  onComplete(callback) {
    this.onCompleteCallback = callback;
  },

  /**
   * Start the interval for updating display
   */
  startInterval() {
    this.stopInterval();
    this.intervalId = setInterval(() => {
      if (this.onTickCallback) {
        this.onTickCallback(this.getDisplaySeconds());
      }
      // Auto-complete countdown when it reaches zero
      if (this.isCountdownFinished() && this.onCompleteCallback) {
        this.stopInterval();
        this.onCompleteCallback();
      }
      // Save periodically (every 10 seconds)
      if (this.getElapsedSeconds() % 10 === 0) {
        this.save();
      }
    }, 1000);
  },

  /**
   * Stop the interval
   */
  stopInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  /**
   * Set callback for tick updates
   */
  onTick(callback) {
    this.onTickCallback = callback;
  },

  /**
   * Format seconds to HH:MM:SS
   */
  formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  },

  /**
   * Format seconds to readable string (e.g., "1時間23分")
   */
  formatReadable(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours === 0) {
      return `${minutes}分`;
    } else if (minutes === 0) {
      return `${hours}時間`;
    } else {
      return `${hours}時間${minutes}分`;
    }
  },

  /**
   * Convert seconds to minutes (rounded)
   */
  toMinutes(seconds) {
    return Math.round(seconds / 60);
  }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TimerManager;
}
