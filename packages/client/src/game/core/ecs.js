// ============================================================
// Minimal Entity-Component-System
// ============================================================

let nextEntityId = 1;

/**
 * Create a new entity with an auto-incrementing ID.
 * @param {Object} components - initial components
 * @returns {Object} entity
 */
export function createEntity(components = {}) {
  return {
    id: nextEntityId++,
    ...components,
  };
}

/**
 * Simple world that stores entities and runs systems.
 */
export class World {
  constructor() {
    /** @type {Map<number, Object>} */
    this.entities = new Map();
    /** @type {Array<(world: World, dt: number) => void>} */
    this.systems = [];
  }

  addEntity(entity) {
    this.entities.set(entity.id, entity);
    return entity;
  }

  removeEntity(id) {
    this.entities.delete(id);
  }

  getEntity(id) {
    return this.entities.get(id);
  }

  /**
   * Get all entities that have ALL the specified component keys.
   * @param {string[]} keys
   * @returns {Object[]}
   */
  query(...keys) {
    return [...this.entities.values()].filter(e =>
      keys.every(k => e[k] !== undefined)
    );
  }

  addSystem(fn) {
    this.systems.push(fn);
  }

  /**
   * Run all systems once.
   * @param {number} dt - delta time in seconds
   */
  tick(dt) {
    for (const sys of this.systems) {
      sys(this, dt);
    }
  }
}
