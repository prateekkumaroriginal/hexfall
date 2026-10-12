import * as THREE from 'three';
import { at } from '../lib/assert';

// Sort the same active clumps, keeping density's original prefix and every transform.
export class GrassOrder {
  private source: Float32Array;
  private indices: Uint16Array;
  private depths: Float64Array;
  private count = -1;
  private forwardX = NaN;
  private forwardZ = NaN;
  private compare = (a: number, b: number) => at(this.depths, a) - at(this.depths, b) || a - b;
  constructor(matrix: THREE.InstancedBufferAttribute) {
    this.source = new Float32Array(matrix.array);
    this.indices = new Uint16Array(this.source.length / 16);
    this.depths = new Float64Array(this.indices.length);
  }
  update(
    matrix: THREE.InstancedBufferAttribute,
    count: number,
    forwardX: number,
    forwardZ: number,
  ) {
    if (count === this.count && forwardX === this.forwardX && forwardZ === this.forwardZ) return;
    const sameCount = count === this.count;
    this.count = count;
    this.forwardX = forwardX;
    this.forwardZ = forwardZ;
    if (count === 0) return;
    const order = this.indices.subarray(0, count);
    for (let i = 0; i < count; i++) {
      if (!sameCount) order[i] = i;
      this.depths[i] =
        at(this.source, i * 16 + 12) * forwardX + at(this.source, i * 16 + 14) * forwardZ;
    }
    if (sameCount) {
      // Camera turns usually move each clump only a few places. Keep the previous order as a start.
      // Fall back to the full sort for large turns; both paths use exactly the same comparison.
      let shifts = 0;
      for (let i = 1; i < count; i++) {
        const index = at(order, i);
        let destination = i;
        while (destination > 0 && this.compare(at(order, destination - 1), index) > 0) {
          order[destination] = at(order, destination - 1);
          destination--;
          shifts++;
          if (shifts > count * 2) break;
        }
        order[destination] = index;
        if (shifts > count * 2) {
          order.sort(this.compare);
          break;
        }
      }
    } else order.sort(this.compare);
    for (let i = 0; i < count; i++) {
      const start = at(order, i) * 16;
      // Copy all bits without allocating a typed-array view for every clump, every frame.
      for (let component = 0; component < 16; component++)
        matrix.array[i * 16 + component] = at(this.source, start + component);
    }
    matrix.clearUpdateRanges();
    matrix.addUpdateRange(0, count * 16);
    matrix.needsUpdate = true;
  }
}
