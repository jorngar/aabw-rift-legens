// ============================================================
// Shop UI — HTML overlay
// ============================================================
import { ITEMS, WEAPONS } from '@rift-seed/shared/config';

export class ShopUI {
  constructor(inventory) {
    this.inventory = inventory;
    this.visible = false;
    this.el = null;
    this.activeTab = 'buy';
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
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin:4px 0;background:#1a1a2a;border-radius:4px;">
          <div><div style="color:#fff;font-size:11px;">${item.name}</div><div style="color:#666;font-size:9px;">${item.desc}</div></div>
          <div style="display:flex;align-items:center;gap:8px;"><span style="color:#f59e0b;font-size:11px;">${item.price}g</span><button data-buy="${id}" style="padding:4px 12px;background:#e8ff47;color:#000;border:none;cursor:pointer;font-family:monospace;font-size:10px;border-radius:3px;">BUY</button></div>
        </div>`;
      }
    } else if (this.activeTab === 'sell') {
      for (const slot of this.inventory.slots) {
        const item = ITEMS[slot.itemId] || WEAPONS[slot.itemId];
        if (!item) continue;
        const sellPrice = Math.floor((item.price || 0) / 2);
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin:4px 0;background:#1a1a2a;border-radius:4px;">
          <div><div style="color:#fff;font-size:11px;">${item.name} x${slot.quantity}</div></div>
          <div style="display:flex;align-items:center;gap:8px;"><span style="color:#f59e0b;font-size:11px;">${sellPrice}g</span><button data-sell="${slot.itemId}" style="padding:4px 12px;background:#ff8844;color:#000;border:none;cursor:pointer;font-family:monospace;font-size:10px;border-radius:3px;">SELL</button></div>
        </div>`;
      }
      if (this.inventory.slots.length === 0) html += `<div style="color:#666;text-align:center;padding:20px;">No items to sell</div>`;
    } else if (this.activeTab === 'weapons') {
      for (const [id, w] of Object.entries(WEAPONS)) {
        const owned = this.inventory.hasItem(id);
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin:4px 0;background:#1a1a2a;border-radius:4px;${owned?'border:1px solid #44ff44':''}">
          <div><div style="color:#fff;font-size:11px;">${w.name}</div><div style="color:#666;font-size:9px;">DMG +${w.damage} ${w.speed>0?'SPD +'+w.speed:''}${w.speed<0?'SPD '+w.speed:''}</div></div>
          <div style="display:flex;align-items:center;gap:8px;"><span style="color:#f59e0b;font-size:11px;">${w.price}g</span>${owned?`<button data-equip="${id}" style="padding:4px 12px;background:#44ff44;color:#000;border:none;cursor:pointer;font-family:monospace;font-size:10px;border-radius:3px;">EQUIP</button>`:`<button data-buy="${id}" style="padding:4px 12px;background:#e8ff47;color:#000;border:none;cursor:pointer;font-family:monospace;font-size:10px;border-radius:3px;">BUY</button>`}</div>
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
        const item = ITEMS[id] || WEAPONS[id];
        if (item && this.inventory.gold >= item.price) {
          this.inventory.gold -= item.price;
          this.inventory.addItem(id);
          this.render();
        }
      });
    });
    this.el.querySelectorAll('[data-sell]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.sell;
        const item = ITEMS[id];
        if (item && this.inventory.removeItem(id)) {
          this.inventory.gold += Math.floor(item.price / 2);
          this.render();
        }
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
