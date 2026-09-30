import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CreatureRenderer } from './creatures';
import { Simulation, SLIME_SPAWN_DURATION } from './simulation';

describe('slime birth rendering', () => {
  it('spreads a low puddle, raises the body, and removes bubbles when formation ends', () => {
    const scene = new THREE.Scene(),
      renderer = new CreatureRenderer(scene),
      sim = new Simulation(() => 0.2);
    sim.remaining = 1;
    sim.spawn();
    const e = sim.enemies[0],
      matrix = new THREE.Matrix4(),
      scale = new THREE.Vector3();
    const body = scene.getObjectByName('creature-slime:gel') as THREE.InstancedMesh;
    const bubbles = scene.getObjectByName('slime-spawn-bubbles') as THREE.InstancedMesh;
    const bodyScale = () => {
      body.getMatrixAt(0, matrix);
      return scale.setFromMatrixScale(matrix).clone();
    };
    renderer.update(sim.enemies, 0, 0, 9);
    const beginning = bodyScale();
    e.spawnRemaining = SLIME_SPAWN_DURATION * 0.7;
    renderer.update(sim.enemies, 0.42, 0, 9);
    const puddle = bodyScale();
    expect(puddle.x).toBeGreaterThan(beginning.x * 100);
    expect(puddle.y).toBeLessThan(0.1);
    expect(bubbles.count).toBe(5);
    e.spawnRemaining = SLIME_SPAWN_DURATION * 0.2;
    renderer.update(sim.enemies, 1.12, 0, 9);
    expect(bodyScale().y).toBeGreaterThan(puddle.y * 5);
    e.spawnRemaining = 0;
    renderer.update(sim.enemies, 1.4, 0, 9);
    expect(bodyScale().y).toBeGreaterThan(0.9);
    expect(bubbles.count).toBe(0);
    e.active = false;
    renderer.update(sim.enemies, 1.5, 0, 9);
    expect(body.count).toBe(0);
    expect(bubbles.count).toBe(0);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
        if (object instanceof THREE.InstancedMesh) object.dispose();
      }
    });
  });
});
