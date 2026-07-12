import test from 'node:test';
import assert from 'node:assert/strict';
import { EventType } from '@rift-seed/shared/events';
import { computeBaseDamage } from '../src/game/core/combat.js';
import { InventorySystem } from '../src/game/systems/inventory-system.js';
import { ProgressionSystem } from '../src/game/systems/progression.js';

function player(classId = 'warrior') {
  return {
    id: 'player-1', isPlayer: true, classId, level: 1,
    baseAttackRange: 2, baseAttackCooldownMs: 600,
    stats: { hp: 100, maxHp: 100, mp: 60, maxMp: 60, speed: 3, damage: 35, baseDamage: 35 },
  };
}

test('buying and equipping a weapon changes damage and emits economy telemetry', () => {
  const events = [];
  const actor = player();
  const inventory = new InventorySystem(actor, event => events.push(event));
  inventory.gold = 250;

  assert.equal(inventory.purchaseItem('gunblade'), true);
  assert.equal(inventory.gold, 50);
  assert.equal(inventory.equipWeapon('gunblade'), true);
  assert.equal(computeBaseDamage(actor), 53);

  const purchase = events.find(event => event.type === EventType.ITEM_PURCHASE);
  const equip = events.find(event => event.type === EventType.WEAPON_EQUIP);
  assert.deepEqual({ before: purchase.goldBefore, after: purchase.goldAfter }, { before: 250, after: 50 });
  assert.equal(equip.weaponClass, 'martial');
  assert.equal(equip.weaponDamage, 18);
});

test('sell-only loot has an explicit sale value', () => {
  const actor = player();
  const inventory = new InventorySystem(actor, () => {});
  inventory.addItem('ether_crystal', 1, { emit: false });
  assert.equal(inventory.sellItem('ether_crystal'), true);
  assert.equal(inventory.gold, 160);
});

test('Battle Scroll is usable from inventory and changes real damage', () => {
  const actor = player();
  actor.id = 'scroll-user';
  const inventory = new InventorySystem(actor, () => {});
  inventory.addItem('scroll', 1, { emit: false });
  assert.equal(inventory.useItem('scroll'), true);
  assert.equal(inventory.hasItem('scroll'), false);
  assert.equal(computeBaseDamage(actor), 43);
});

test('multi-level XP applies survivability once and leaves damage derived', () => {
  const events = [];
  const actor = player();
  const progression = new ProgressionSystem(actor, event => events.push(event));
  progression.addXP(500, 'test');

  assert.equal(progression.level, 4);
  assert.equal(actor.level, 4);
  assert.equal(actor.stats.maxHp, 145);
  assert.equal(actor.stats.maxMp, 84);
  assert.equal(actor.stats.damage, 35);
  assert.equal(computeBaseDamage(actor), 49);
  assert.ok(events.some(event => event.type === EventType.XP_GAIN));
  assert.ok(events.some(event => event.type === EventType.LEVEL_UP));
});

test('weapon swaps are rejected without losing items when a full inventory cannot hold the old weapon', () => {
  const actor = player();
  const inventory = new InventorySystem(actor, () => {});
  inventory.maxSlots = 2;
  inventory.slots = [
    { itemId: 'gunblade', quantity: 2 },
    { itemId: 'health_potion', quantity: 1 },
  ];
  inventory.equipped.mainHand = 'pistol';
  actor.equippedWeaponId = 'pistol';

  assert.equal(inventory.equipWeapon('gunblade'), false);
  assert.equal(inventory.equipped.mainHand, 'pistol');
  assert.equal(actor.equippedWeaponId, 'pistol');
  assert.equal(inventory.getCount('gunblade'), 2);
});

test('weapons are unique purchases across inventory and equipment', () => {
  const actor = player();
  const inventory = new InventorySystem(actor, () => {});
  inventory.gold = 1000;
  assert.equal(inventory.purchaseItem('pistol'), true);
  assert.equal(inventory.purchaseItem('pistol'), false);
  assert.equal(inventory.equipWeapon('pistol'), true);
  assert.equal(inventory.purchaseItem('pistol'), false);
});
