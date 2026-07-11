import { getBalance } from './database.js';

/** Convert the server balance table into the client game's public config shape. */
export function getRuntimeConfig() {
  return {
    generatedAt: Date.now(),
    player: {
      hp: getBalance('player.base_hp', 500),
      maxHp: getBalance('player.base_hp', 500),
      mp: getBalance('player.base_mp', 100),
      maxMp: getBalance('player.base_mp', 100),
      speed: getBalance('player.base_speed', 3),
      attackDamage: getBalance('player.base_damage', 30),
      attackCooldownMs: getBalance('player.attack_cooldown', 600),
      attackRange: getBalance('player.attack_range', 2),
    },
    enemies: {
      shadowBeast: {
        hp: getBalance('enemy.shadow_beast.hp', 200),
        damage: getBalance('enemy.shadow_beast.damage', 3),
        speed: getBalance('enemy.shadow_beast.speed', 1.5),
        aggroRange: getBalance('enemy.shadow_beast.aggro_range', 4),
      },
      riftKnight: {
        hp: getBalance('enemy.rift_knight.hp', 500),
        damage: getBalance('enemy.rift_knight.damage', 8),
        speed: getBalance('enemy.rift_knight.speed', 1),
        aggroRange: getBalance('enemy.rift_knight.aggro_range', 5),
      },
    },
    skills: {
      shadowStrike: {
        damage: getBalance('skill.shadow_strike.damage', 45),
        manaCost: getBalance('skill.shadow_strike.mana_cost', 15),
        cooldownMs: getBalance('skill.shadow_strike.cooldown', 3000),
      },
      riftSlash: {
        damage: getBalance('skill.rift_slash.damage', 30),
        manaCost: getBalance('skill.rift_slash.mana_cost', 10),
        cooldownMs: getBalance('skill.rift_slash.cooldown', 2000),
      },
      heal: {
        healAmount: getBalance('skill.heal.amount', 40),
        manaCost: getBalance('skill.heal.mana_cost', 20),
        cooldownMs: getBalance('skill.heal.cooldown', 5000),
      },
    },
  };
}
