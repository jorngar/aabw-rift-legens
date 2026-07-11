// ============================================================
// Shop UI — HTML overlay
// ============================================================
import { ITEMS, WEAPONS } from '@rift-seed/shared/config';
import { getSellPrice, getWeaponContribution } from '@rift-seed/shared/balance';
import { EventType } from '@rift-seed/shared/events';

export class ShopUI {
  /**
   * @param {Object} inventory
   * @param {{ emitEvent?: (event: object) => void, playerId?: string, getPlayerPos?: () => {x:number,y:number} }} [opts]
   */
  constructor(inventory, opts = {}) {
    this.inventory = inventory;
    this.visible = false;
    this.el = null;
    this.activeTab = 'buy';
    this.emitEvent = opts.emitEvent || null;
    this.playerId = opts.playerId || null;
    this.getPlayerPos = opts.getPlayerPos || (() => null);
  }

  /**
   * Report an in-game shop purchase to the A/B collection layer.
   * No-op if no emitter was wired (e.g. offline mode).
   */
  _emitPurchase(itemId, item, goldBefore) {
    if (!this.emitEvent) return;
    const pos = this.getPlayerPos() || {};
    this.emitEvent({
      type: EventType.ITEM_PURCHASE,
      playerId: this.playerId,
      payload: {
        itemId,
        price: item.price ?? 0,
        goldBefore,
        goldAfter: this.inventory.gold,
        x: pos.x ?? null,
        y: pos.y ?? null,
      },
    });
  }

  init() {
    this.el = document.createElement('div');
    this.el.id = 'shop-ui';
    this.el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;max-height:500px;background:rgba(10,6,18,0.97);border:2px solid #e8ff47;border-radius:8px;z-index:600;font-family:monospace;display:none;overflow:hidden;';
    document.body.appendChild(this.el);
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.render();
  }

  open() { this.visible = true; this.el.style.display = 'block'; this.render(); }
  close() { this.visible = false; this.el.style.display = 'none'; }

  render() {
    let html = `<div style="padding:12px;border-bottom:1px solid #2a2a3a;display:flex;justify-content:space-between;align-items:center;">
      <span style="color:#e8ff47;font-size:16px;font-weight:bold;">MERCHANT</span>
      <div>
        <span style="color:#f59e0b;font-size:12px;">Gold: ${this.inventory.gold}</span>
        <span style="color:#a855f7;font-size:12px;margin-left:12px;">Crystals: ${this.inventory.crystals}</span>
        <span style="color:#666;font-size:16px;margin-left:16px;cursor:pointer;" id="shop-close">✕</span>
      </div>
    </div>`;

    // Tabs
    html += `<div style="display:flex;border-bottom:1px solid #2a2a3a;">`;
    html += `<div data-stab="buy" style="flex:1;padding:8px;text-align:center;cursor:pointer;color:${this.activeTab==='buy'?'#e8ff47':'#666'};border-bottom:${this.activeTab==='buy'?'2px solid #e8ff47':'none'};font-size:11px;">BUY</div>`;
    html += `<div data-stab="sell" style="flex:1;padding:8px;text-align:center;cursor:pointer;color:${this.activeTab==='sell'?'#e8ff47':'#666'};border-bottom:${this.activeTab==='sell'?'2px solid #e8ff47':'none'};font-size:11px;">SELL</div>`;
    html += `<div data-stab="weapons" style="flex:1;padding:8px;text-align:center;cursor:pointer;color:${this.activeTab==='weapons'?'#e8ff47':'#666'};border-bottom:${this.activeTab==='weapons'?'2px solid #e8ff47':'none'};font-size:11px;">WEAPONS</div>`;
    html += `</div>`;

    html += `<div style="padding:12px;max-height:350px;overflow-y:auto;">`;

    if (this.activeTab === 'buy') {
      for (const [id, item] of Object.entries(ITEMS)) {
        if (item.sellOnly) continue; // monster loot — sold to the merchant, not bought
        const canAfford = this.inventory.gold >= item.price;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin:4px 0;background:#1a1a2a;border-radius:4px;">
          <div><div style="color:#fff;font-size:11px;">${item.name}</div><div style="color:#666;font-size:9px;">${item.desc}</div></div>
          <div style="display:flex;align-items:center;gap:8px;"><span style="color:#f59e0b;font-size:11px;">${item.price}g</span><button data-buy="${id}" ${canAfford ? '' : 'disabled'} style="padding:4px 12px;background:${canAfford ? '#e8ff47' : '#444'};color:${canAfford ? '#000' : '#888'};border:none;cursor:${canAfford ? 'pointer' : 'not-allowed'};font-family:monospace;font-size:10px;border-radius:3px;">${canAfford ? 'BUY' : 'LOCKED'}</button></div>
        </div>`;
      }
    } else if (this.activeTab === 'sell') {
      for (const slot of this.inventory.slots) {
        const item = ITEMS[slot.itemId] || WEAPONS[slot.itemId];
        if (!item) continue;
        const sellPrice = getSellPrice(item);
        const canUse = Boolean(item.usableFromInventory);
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin:4px 0;background:#1a1a2a;border-radius:4px;">
          <div><div style="color:#fff;font-size:11px;">${item.name} x${slot.quantity}</div></div>
          <div style="display:flex;align-items:center;gap:8px;">${canUse ? `<button data-use="${slot.itemId}" style="padding:4px 12px;background:#44ddaa;color:#000;border:none;cursor:pointer;font-family:monospace;font-size:10px;border-radius:3px;">USE</button>` : ''}<span style="color:#f59e0b;font-size:11px;">${sellPrice}g</span><button data-sell="${slot.itemId}" style="padding:4px 12px;background:#ff8844;color:#000;border:none;cursor:pointer;font-family:monospace;font-size:10px;border-radius:3px;">SELL</button></div>
        </div>`;
      }
      if (this.inventory.slots.length === 0) html += `<div style="color:#666;text-align:center;padding:20px;">No items to sell</div>`;
    } else if (this.activeTab === 'weapons') {
      for (const [id, w] of Object.entries(WEAPONS)) {
        const owned = this.inventory.hasItem(id);
        const equipped = this.inventory.equipped.mainHand === id;
        const canAfford = this.inventory.gold >= w.price;
        const contribution = getWeaponContribution({
          classId: this.inventory.player.classId,
          level: this.inventory.player.level,
          weaponId: id,
        });
        const affinityPct = Math.round(contribution.affinity * 100);
        const statParts = [`${w.weaponClass.toUpperCase()} ${affinityPct}%`, `DMG +${contribution.damage}`];
        if (w.attackSpeedPct) statParts.push(`ATK SPD ${w.attackSpeedPct > 0 ? '+' : ''}${Math.round(w.attackSpeedPct * 100)}%`);
        if (w.rangeBonus) statParts.push(`RANGE +${w.rangeBonus}`);
        if (w.maxMp) statParts.push(`MP +${w.maxMp}`);
        if (contribution.skillPower) statParts.push(`SKILL DMG +${contribution.skillPower}`);
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin:4px 0;background:#1a1a2a;border-radius:4px;${owned||equipped?'border:1px solid #44ff44':''}">
          <div><div style="color:#fff;font-size:11px;">${w.name}${equipped?' <span style="color:#44ff44;">[EQUIPPED]</span>':''}</div><div style="color:#666;font-size:9px;">${statParts.join(' | ')}${w.desc?' — '+w.desc:''}</div></div>
          <div style="display:flex;align-items:center;gap:8px;"><span style="color:#f59e0b;font-size:11px;">${w.price}g</span>${equipped?'':owned?`<button data-equip="${id}" style="padding:4px 12px;background:#44ff44;color:#000;border:none;cursor:pointer;font-family:monospace;font-size:10px;border-radius:3px;">EQUIP</button>`:`<button data-buy="${id}" ${canAfford ? '' : 'disabled'} style="padding:4px 12px;background:${canAfford ? '#e8ff47' : '#444'};color:${canAfford ? '#000' : '#888'};border:none;cursor:${canAfford ? 'pointer' : 'not-allowed'};font-family:monospace;font-size:10px;border-radius:3px;">${canAfford ? 'BUY' : 'LOCKED'}</button>`}</div>
        </div>`;
      }
    }

    html += `</div>`;
    this.el.innerHTML = html;

    // Event handlers
    this.el.querySelector('#shop-close')?.addEventListener('click', () => this.close());
    this.el.querySelectorAll('[data-stab]').forEach(tab => {
      tab.addEventListener('click', () => { this.activeTab = tab.dataset.stab; this.render(); });
    });
    this.el.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.buy;
        if (this.inventory.purchaseItem(id)) this.render();
      });
    });
    this.el.querySelectorAll('[data-sell]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.sell;
        if (this.inventory.sellItem(id)) this.render();
      });
    });
    this.el.querySelectorAll('[data-use]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.inventory.useItem(btn.dataset.use)) this.render();
      });
    });
    this.el.querySelectorAll('[data-equip]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.inventory.equipWeapon(btn.dataset.equip);
        this.render();
      });
    });
  }
}
