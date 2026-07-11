// ============================================================
// Inventory System
// ============================================================
import { ITEMS, WEAPONS } from '@rift-seed/shared/config';
import { EventType, createEvent } from '@rift-seed/shared/events';
import { getSellPrice, getWeaponContribution } from '@rift-seed/shared/balance';
import { applyEffect } from '../core/combat.js';

export class InventorySystem {
  constructor(player, emitEvent) {
    this.player = player;
    this.emitEvent = emitEvent;
    this.slots = []; // {itemId, quantity}
    this.maxSlots = 20;
    this.equipped = { mainHand: null };
    this.gold = 100;
    this.crystals = 0;
  }

  addItem(itemId, qty = 1, { emit = true, source = 'loot' } = {}) {
    const existing = this.slots.find(s => s.itemId === itemId);
    if (existing) {
      existing.quantity += qty;
    } else if (this.slots.length < this.maxSlots) {
      this.slots.push({ itemId, quantity: qty });
    } else {
      return false;
    }
    if (emit) {
      this.emitEvent(createEvent(EventType.ITEM_PICKUP, this.player.id, {
        actorId: this.player.id, actorType: 'player', classId: this.player.classId,
        playerLevel: this.player.level, itemId, quantity: qty, source,
      }));
    }
    return true;
  }

  removeItem(itemId, qty = 1) {
    const idx = this.slots.findIndex(s => s.itemId === itemId);
    if (idx === -1) return false;
    this.slots[idx].quantity -= qty;
    if (this.slots[idx].quantity <= 0) this.slots.splice(idx, 1);
    return true;
  }

  useItem(itemId) {
    const item = ITEMS[itemId];
    if (!item || !this.hasItem(itemId) || item.type !== 'consumable') return false;
    const canHeal = item.heal && this.player.stats.hp < this.player.stats.maxHp;
    const canRestoreMana = item.mana && this.player.stats.mp < this.player.stats.maxMp;
    const hasImmediateEffect = canHeal || canRestoreMana || item.buffDamage;
    if (!hasImmediateEffect && itemId !== 'rift_shard') return false;
    const hpBefore = this.player.stats.hp;
    const mpBefore = this.player.stats.mp;
    if (canHeal) {
      this.player.stats.hp = Math.min(this.player.stats.maxHp, this.player.stats.hp + item.heal);
    }
    if (canRestoreMana) {
      this.player.stats.mp = Math.min(this.player.stats.maxMp, this.player.stats.mp + item.mana);
    }
    if (item.buffDamage) {
      applyEffect(this.player.id, {
        type: 'damage_buff',
        amount: item.buffDamage,
        expires: Date.now() + (item.buffDuration || 10000),
      });
    }
    this.removeItem(itemId);
    this.emitEvent(createEvent(EventType.ITEM_USE, this.player.id, {
      actorId: this.player.id, actorType: 'player', sourceType: 'item', sourceId: itemId,
      itemId, hpBefore, hpAfter: this.player.stats.hp, mpBefore, mpAfter: this.player.stats.mp,
      classId: this.player.classId, playerLevel: this.player.level, itemType: item.type,
    }));
    if (this.player.stats.hp !== hpBefore) {
      this.emitEvent(createEvent(EventType.RESOURCE_CHANGE, this.player.id, {
        actorId: this.player.id, actorType: 'player', sourceType: 'item', sourceId: itemId,
        resource: 'hp', delta: this.player.stats.hp - hpBefore,
        hpBefore, hpAfter: this.player.stats.hp,
      }));
    }
    if (this.player.stats.mp !== mpBefore) {
      this.emitEvent(createEvent(EventType.RESOURCE_CHANGE, this.player.id, {
        actorId: this.player.id, actorType: 'player', sourceType: 'item', sourceId: itemId,
        resource: 'mp', delta: this.player.stats.mp - mpBefore,
        mpBefore, mpAfter: this.player.stats.mp,
      }));
    }
    return true;
  }

  equipWeapon(weaponId) {
    const w = WEAPONS[weaponId];
    if (!w || !this.hasItem(weaponId) || this.equipped.mainHand === weaponId) return false;
    // Remove the replacement first so swapping works even with a full inventory.
    if (!this.removeItem(weaponId)) return false;
    if (this.equipped.mainHand) this._unequipWeapon(this.equipped.mainHand);
    this.equipped.mainHand = weaponId;
    this.player.equippedWeaponId = weaponId;
    if (w.maxMp) { this.player.stats.maxMp += w.maxMp; this.player.stats.mp += w.maxMp; }
    const contribution = getWeaponContribution({
      classId: this.player.classId,
      level: this.player.level,
      weaponId,
    });
    this.emitEvent(createEvent(EventType.WEAPON_EQUIP, this.player.id, {
      actorId: this.player.id, actorType: 'player', classId: this.player.classId,
      playerLevel: this.player.level, weaponId, weaponClass: w.weaponClass,
      weaponDamage: contribution.damage, weaponSkillPower: contribution.skillPower,
      weaponAffinity: contribution.affinity,
    }));
    return true;
  }

  _unequipWeapon(weaponId) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    if (w.maxMp) {
      this.player.stats.maxMp -= w.maxMp;
      this.player.stats.mp = Math.min(this.player.stats.mp, this.player.stats.maxMp);
    }
    this.player.equippedWeaponId = null;
    this.addItem(weaponId, 1, { emit: false });
  }

  purchaseItem(itemId) {
    const item = ITEMS[itemId] || WEAPONS[itemId];
    if (!item || item.sellOnly || this.gold < item.price) return false;
    const goldBefore = this.gold;
    if (!this.addItem(itemId, 1, { emit: false })) return false;
    this.gold -= item.price;
    this.emitEvent(createEvent(EventType.ITEM_PURCHASE, this.player.id, {
      actorId: this.player.id, actorType: 'player', classId: this.player.classId,
      playerLevel: this.player.level, sourceType: 'shop', sourceId: itemId,
      itemId, itemType: item.weaponClass ? 'weapon' : item.type,
      weaponClass: item.weaponClass || null, quantity: 1, unitPrice: item.price,
      goldSpent: item.price, goldBefore, goldAfter: this.gold,
    }));
    return true;
  }

  sellItem(itemId) {
    const item = ITEMS[itemId] || WEAPONS[itemId];
    if (!item || !this.hasItem(itemId)) return false;
    const goldBefore = this.gold;
    const salePrice = getSellPrice(item);
    if (!this.removeItem(itemId)) return false;
    this.gold += salePrice;
    this.emitEvent(createEvent(EventType.ITEM_SELL, this.player.id, {
      actorId: this.player.id, actorType: 'player', classId: this.player.classId,
      playerLevel: this.player.level, sourceType: 'shop', sourceId: itemId,
      itemId, itemType: item.weaponClass ? 'weapon' : item.type,
      weaponClass: item.weaponClass || null, quantity: 1, unitPrice: salePrice,
      goldBefore, goldAfter: this.gold,
    }));
    return true;
  }

  hasItem(itemId) {
    return this.slots.some(s => s.itemId === itemId && s.quantity > 0);
  }

  getCount(itemId) {
    return this.slots.find(s => s.itemId === itemId)?.quantity || 0;
  }
}
