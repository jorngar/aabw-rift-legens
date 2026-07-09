// ============================================================
// Inventory System
// ============================================================
import { ITEMS, WEAPONS } from '@shared/config.js';
import { EventType, createEvent } from '@shared/events.js';

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

  addItem(itemId, qty = 1) {
    const existing = this.slots.find(s => s.itemId === itemId);
    if (existing) {
      existing.quantity += qty;
    } else if (this.slots.length < this.maxSlots) {
      this.slots.push({ itemId, quantity: qty });
    }
    this.emitEvent(createEvent(EventType.ITEM_PICKUP, this.player.id, { itemId, quantity: qty }));
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
    if (!item) return false;
    if (item.heal) {
      this.player.stats.hp = Math.min(this.player.stats.maxHp, this.player.stats.hp + item.heal);
    }
    if (item.mana) {
      this.player.stats.mp = Math.min(this.player.stats.maxMp, this.player.stats.mp + item.mana);
    }
    this.removeItem(itemId);
    this.emitEvent(createEvent(EventType.ITEM_USE, this.player.id, { itemId }));
    return true;
  }

  equipWeapon(weaponId) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    // Unequip current
    if (this.equipped.mainHand) this._unequipWeapon(this.equipped.mainHand);
    this.equipped.mainHand = weaponId;
    this.player.stats.damage += w.damage || 0;
    if (w.speed) this.player.stats.speed = (this.player.stats.speed || 3) + w.speed;
    if (w.maxMp) { this.player.stats.maxMp += w.maxMp; this.player.stats.mp += w.maxMp; }
    this.removeItem(weaponId);
  }

  _unequipWeapon(weaponId) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    this.player.stats.damage -= w.damage || 0;
    if (w.speed) this.player.stats.speed -= w.speed;
    if (w.maxMp) { this.player.stats.maxMp -= w.maxMp; }
    this.addItem(weaponId);
  }

  hasItem(itemId) {
    return this.slots.some(s => s.itemId === itemId && s.quantity > 0);
  }

  getCount(itemId) {
    return this.slots.find(s => s.itemId === itemId)?.quantity || 0;
  }
}
