// ============================================================
// Progression System — XP, leveling, SEED rank
// ============================================================
import { RANKS, LEVEL_BONUS } from '@rift-seed/shared/config';
import { EventType, createEvent } from '@rift-seed/shared/events';

export class ProgressionSystem {
  constructor(player, emitEvent) {
    this.player = player;
    this.emitEvent = emitEvent;
    this.xp = 0;
    this.level = 1;
    this.player.level = 1;
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
    const previousXp = this.xp;
    this.xp += amount;
    this.emitEvent(createEvent(EventType.XP_GAIN, this.player.id, {
      actorId: this.player.id,
      actorType: 'player',
      classId: this.player.classId,
      playerLevel: this.level,
      amount,
      xpBefore: previousXp,
      xpAfter: this.xp,
      reason,
    }));
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

    const didLevelUp = newLevel > this.level;
    if (didLevelUp) {
      const previousLevel = this.level;
      const gained = newLevel - this.level;
      this.level = newLevel;
      // Combat reads entity.level for skill/heal scaling
      this.player.level = newLevel;
      // Apply stat bonuses (per level gained)
      this.player.stats.maxHp += LEVEL_BONUS.maxHp * gained;
      this.player.stats.hp = this.player.stats.maxHp;
      this.player.stats.maxMp += LEVEL_BONUS.maxMp * gained;
      this.player.stats.mp = this.player.stats.maxMp;
      if (LEVEL_BONUS.speed) this.player.stats.speed = (this.player.stats.speed || 3) + LEVEL_BONUS.speed * gained;

      this.emitEvent(createEvent(EventType.LEVEL_UP, this.player.id, {
        actorId: this.player.id,
        actorType: 'player',
        classId: this.player.classId,
        previousLevel,
        playerLevel: newLevel,
        levelsGained: gained,
        xp: this.xp,
      }));
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
        return { leveled: didLevelUp, newLevel, rankUp: false };
      }
    }
    return { leveled: didLevelUp, rankUp: false };
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
