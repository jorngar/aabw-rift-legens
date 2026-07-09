// ============================================================
// Progression System — XP, leveling, SEED rank
// ============================================================
import { RANKS, LEVEL_BONUS } from '@shared/config.js';
import { EventType, createEvent } from '@shared/events.js';

export class ProgressionSystem {
  constructor(player, emitEvent) {
    this.player = player;
    this.emitEvent = emitEvent;
    this.xp = 0;
    this.level = 1;
    this.rank = 'D';
    this.kills = 0;
    this.skillsUsed = 0;
    this.riftsCleared = 0;
    this.gold = 100;
    this.crystals = 0;

    // Stats for missions
    this._rankOrder = ['D','C','B','A','S'];
  }

  addXP(amount, reason) {
    this.xp += amount;
    this._checkLevelUp();
  }

  addGold(amount) {
    this.gold += amount;
  }

  addKill(enemyType) {
    this.kills++;
  }

  addSkillUse() {
    this.skillsUsed++;
  }

  addRiftClear() {
    this.riftsCleared++;
  }

  _checkLevelUp() {
    const thresholds = [0, 100, 250, 500, 1000, 2000];
    let newLevel = 1;
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (this.xp >= thresholds[i]) {
        newLevel = i + 1;
        break;
      }
    }

    if (newLevel > this.level) {
      this.level = newLevel;
      // Apply stat bonuses
      this.player.stats.maxHp += LEVEL_BONUS.maxHp;
      this.player.stats.hp = this.player.stats.maxHp;
      this.player.stats.maxMp += LEVEL_BONUS.maxMp;
      this.player.stats.mp = this.player.stats.maxMp;
      this.player.stats.damage += LEVEL_BONUS.damage;

      this.emitEvent(createEvent(EventType.RESPAWN, this.player.id, { level: newLevel, xp: this.xp }));
    }

    // Check rank
    const rankNames = ['D','C','B','A','S'];
    const rankXps = [0, 100, 250, 500, 1000];
    for (let i = rankXps.length - 1; i >= 0; i--) {
      if (this.xp >= rankXps[i]) {
        if (rankNames[i] !== this.rank) {
          const oldRank = this.rank;
          this.rank = rankNames[i];
          return { leveled: true, newLevel, rankUp: true, oldRank, newRank: this.rank };
        }
        return { leveled: newLevel > this.level, newLevel, rankUp: false };
      }
    }
    return { leveled: false, rankUp: false };
  }

  getRankInfo() {
    return RANKS[this.rank] || RANKS.D;
  }

  trackEvent(event) {
    switch (event.type) {
      case EventType.DEATH:
        this.addKill(event.victimId);
        break;
      case EventType.SKILL_USE:
        this.addSkillUse();
        break;
    }
  }

  getProgress() {
    const thresholds = [0, 100, 250, 500, 1000, 2000];
    const current = thresholds[this.level - 1] || 0;
    const next = thresholds[this.level] || thresholds[thresholds.length - 1];
    return { current: this.xp - current, needed: next - current, pct: (this.xp - current) / (next - current) };
  }
}
