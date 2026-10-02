import { describe, expect, it } from 'vitest';
import data from './creature-sculpt-data.json';

const bytes = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

describe('quantized creature sculpture topology', () => {
  for (const [name, source] of Object.entries(data)) {
    it(`${name} remains a closed, consistently wound surface after quantization`, () => {
      const positions = new Int16Array(bytes(source.positions).buffer);
      const indices = new Uint16Array(bytes(source.indices).buffer);
      const edges = new Map<string, { count: number; direction: number }>();
      const vertices = new Set<string>();
      for (let i = 0; i < positions.length; i += 3)
        vertices.add(`${positions[i]},${positions[i + 1]},${positions[i + 2]}`);
      expect(vertices.size).toBe(positions.length / 3);
      let zeroArea = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const ids = [indices[i], indices[i + 1], indices[i + 2]];
        const [a, b, c] = ids.map((id) => Array.from(positions.subarray(id * 3, id * 3 + 3)));
        const u = b.map((v, axis) => v - a[axis]);
        const v = c.map((n, axis) => n - a[axis]);
        if (
          u[1] * v[2] - u[2] * v[1] === 0 &&
          u[2] * v[0] - u[0] * v[2] === 0 &&
          u[0] * v[1] - u[1] * v[0] === 0
        )
          zeroArea++;
        for (let edge = 0; edge < 3; edge++) {
          const from = ids[edge],
            to = ids[(edge + 1) % 3];
          const key = from < to ? `${from}:${to}` : `${to}:${from}`;
          const value = edges.get(key) ?? { count: 0, direction: 0 };
          value.count++;
          value.direction += from < to ? 1 : -1;
          edges.set(key, value);
        }
      }
      expect(zeroArea).toBe(0);
      expect(
        [...edges.values()].filter((edge) => edge.count !== 2 || edge.direction !== 0),
      ).toEqual([]);
      expect(vertices.size - edges.size + indices.length / 3).toBe(2);
    });
  }
});
