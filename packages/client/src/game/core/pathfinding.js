// ============================================================
// A* Pathfinding on Isometric Grid
// ============================================================

/**
 * Simple priority queue (min-heap) for A*.
 */
class MinHeap {
  constructor() { this.data = []; }
  push(item, priority) {
    this.data.push({ item, priority });
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top.item;
  }
  get size() { return this.data.length; }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].priority < this.data[parent].priority) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else break;
    }
  }
  _sinkDown(i) {
    const len = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < len && this.data[left].priority < this.data[smallest].priority) smallest = left;
      if (right < len && this.data[right].priority < this.data[smallest].priority) smallest = right;
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else break;
    }
  }
}

/** 4-directional neighbors (no diagonals on iso grid for cleaner paths) */
const DIRS = [
  { dx: 1, dy: 0 },  // E
  { dx: -1, dy: 0 }, // W
  { dx: 0, dy: 1 },  // S
  { dx: 0, dy: -1 }, // N
];

import { isBlocked } from '@rift-seed/shared/patch';

/**
 * A* pathfinding.
 * @param {number[][]} grid - 2D tile array
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} end
 * @returns {{x: number, y: number}[]} path (excluding start, including end) or empty if no path
 */
export function findPath(grid, start, end) {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  // Bounds check
  if (end.x < 0 || end.x >= cols || end.y < 0 || end.y >= rows) return [];
  if (isBlocked(grid[end.y][end.x])) return [];

  const key = (x, y) => `${x},${y}`;
  const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  const open = new MinHeap();
  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();

  const startKey = key(start.x, start.y);
  gScore.set(startKey, 0);
  open.push(start, heuristic(start, end));

  while (open.size > 0) {
    const current = open.pop();
    const ck = key(current.x, current.y);

    if (current.x === end.x && current.y === end.y) {
      // Reconstruct path
      const path = [];
      let node = ck;
      while (node !== startKey) {
        const [px, py] = node.split(',').map(Number);
        path.unshift({ x: px, y: py });
        node = cameFrom.get(node);
      }
      return path;
    }

    if (closed.has(ck)) continue;
    closed.add(ck);

    for (const { dx, dy } of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nk = key(nx, ny);

      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (isBlocked(grid[ny][nx])) continue;
      if (closed.has(nk)) continue;

      const tentative = (gScore.get(ck) || Infinity) + 1;
      if (tentative < (gScore.get(nk) || Infinity)) {
        gScore.set(nk, tentative);
        cameFrom.set(nk, ck);
        open.push({ x: nx, y: ny }, tentative + heuristic({ x: nx, y: ny }, end));
      }
    }
  }

  return []; // No path
}

/**
 * Smooth a path by removing unnecessary waypoints.
 * @param {{x: number, y: number}[]} path
 * @returns {{x: number, y: number}[]}
 */
export function smoothPath(path) {
  if (path.length <= 2) return path;
  const smoothed = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];
    // Only keep waypoints where direction changes
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    if (dx1 !== dx2 || dy1 !== dy2) {
      smoothed.push(curr);
    }
  }
  smoothed.push(path[path.length - 1]);
  return smoothed;
}
