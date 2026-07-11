// ============================================================
// Progression System — XP, leveling, SEED rank
// ============================================================
import { RANKS, LEVEL_BONUS, SKILL_SCALING, SKILLS } from '@rift-seed/shared/config';
import { EventType, createEvent } from '@rift-seed/shared/events';

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
      if (LEVEL_BONUS.speed) this.player.stats.speed = (this.player.stats.speed || 3) + LEVEL_BONUS.speed;
      if (LEVEL_BONUS.attackRange) this.player.attackRange = (this.player.attackRange || 2) + LEVEL_BONUS.attackRange;

      // Scale skills with level
      this._scaleSkills(newLevel);

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

  _scaleSkills(level) {
    // Scale skill damage/healing based on level
    for (const [skillId, scaling] of Object.entries(SKILL_SCALING)) {
      const skill = SKILLS[skillId];
      if (!skill) continue;
      if (scaling.damagePerLevel && skill.damage !== undefined) {
        skill.damage += scaling.damagePerLevel;
      }
      if (scaling.healPerLevel && skill.healAmount !== undefined) {
        skill.healAmount += scaling.healPerLevel;
      }
      if (scaling.manaReduction && skill.manaCost !== undefined) {
        skill.manaCost = Math.max(5, skill.manaCost - scaling.manaReduction);
      }
      if (scaling.rangePerLevel && skill.range !== undefined) {
        skill.range += scaling.rangePerLevel;
      }
    }
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
