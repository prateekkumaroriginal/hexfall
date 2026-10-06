import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CreatureRenderer } from './creatures';
import { Simulation } from './simulation';
import { SLIME } from '../config/gameplay';
import { buildBlenderOrcGeometries, ORC_JOINT_PIVOTS } from './creature-blender';

describe('creature rendering', () => {
  it('shares model batches across a full crowd', () => {
    const scene = new THREE.Scene();
    const renderer = new CreatureRenderer(scene, {
      groups: buildBlenderOrcGeometries(),
      pivots: ORC_JOINT_PIVOTS,
    });
    const sim = new Simulation();
    const parts = scene.children.filter((object) =>
      object.name.startsWith('creature-'),
    ) as THREE.InstancedMesh[];
    const triangles = (slime: boolean) =>
      parts
        .filter((p) => p.name.includes('slime:') === slime)
        .reduce((sum, p) => sum + p.geometry.index!.count / 3, 0);
    expect(triangles(true)).toBeLessThanOrEqual(14000);
    expect(triangles(false)).toBeGreaterThan(0);
    expect(parts.length).toBeLessThanOrEqual(23);
    const paintedMaterials = new Set(
      parts.map((part) => part.material as THREE.MeshStandardMaterial).filter((m) => m.map),
    );
    expect(paintedMaterials.size).toBe(4);
    const maps = new Set([...paintedMaterials].map((m) => m.map!));
    expect(maps.size).toBe(4);
    const slimeMaterial = scene.getObjectByName('creature-slime:gel') as THREE.InstancedMesh;
    const gel = slimeMaterial.material as THREE.MeshPhysicalMaterial;
    expect(gel.transparent).toBe(false);
    expect(gel.transmission).toBe(0);
    expect(gel.map!.image.width).toBe(512);
    let released = 0;
    maps.forEach((map) => map.addEventListener('dispose', () => released++));
    for (const part of parts) {
      expect(part.geometry.index).not.toBeNull();
      for (const name of ['position', 'normal', 'color']) {
        const attribute = part.geometry.getAttribute(name);
        expect(attribute.count, `${part.name} ${name} vertex count`).toBe(
          part.geometry.getAttribute('position').count,
        );
        expect(
          Array.from(attribute.array).every(Number.isFinite),
          `${part.name} ${name} is finite`,
        ).toBe(true);
      }
    }
    Object.assign(sim.enemies[0], { active: true, kind: 0, spawnRemaining: 0 });
    Object.assign(sim.enemies[1], { active: true, kind: 1 });
    renderer.update(sim.enemies, 0, 0, 9);
    const geometries = parts.map((p) => p.geometry);
    sim.enemies.forEach((enemy, i) =>
      Object.assign(enemy, {
        active: true,
        kind: i % 2,
        spawnRemaining: 0,
        x: i % 8,
        z: -Math.floor(i / 8) * 3,
      }),
    );
    renderer.update(sim.enemies, 1, 0, 9);
    expect(scene.children.filter((object) => object.name.startsWith('creature-'))).toEqual(parts);
    parts.forEach((part, i) => {
      expect(part.geometry).toBe(geometries[i]);
      expect(part.count).toBe(24);
    });
    expect(
      new Set(
        parts.map((part) => (part.material as THREE.MeshStandardMaterial).map).filter(Boolean),
      ),
    ).toEqual(maps);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
    camera.position.set(0, 1.6, 9);
    camera.lookAt(0, 1.6, 20);
    renderer.update(sim.enemies, 1, 0, 9, camera);
    expect(parts.every((part) => part.count === 0)).toBe(true);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (paintedMaterials.has(material as THREE.MeshStandardMaterial)) return;
          material.dispose();
        });
        if (object instanceof THREE.InstancedMesh) object.dispose();
      }
    });
    paintedMaterials.forEach((material) => material.dispose());
    expect(released).toBe(4);
  }, 30000);
});

describe('slime birth rendering', () => {
  it('keeps birth bubble pulses at their original speed throughout the longer birth', () => {
    const scene = new THREE.Scene(),
      renderer = new CreatureRenderer(scene),
      sim = new Simulation(() => 0.2);
    sim.remaining = 1;
    sim.spawn();
    const e = sim.enemies[0],
      matrix = new THREE.Matrix4();
    const bubbles = scene.getObjectByName('slime-spawn-bubbles') as THREE.InstancedMesh;
    for (const elapsed of [0.56, 1.12, 1.68, 2.24]) {
      e.spawnRemaining = SLIME.SPAWN_DURATION_SECONDS - elapsed;
      renderer.update(sim.enemies, elapsed, 0, 9);
      expect(bubbles.count).toBe(5);
      bubbles.getMatrixAt(0, matrix);
      // The first bubble returns to the ground every 0.56 seconds, even after 1.4 seconds.
      expect(matrix.elements[13]).toBeCloseTo(0.08, 5);
      e.spawnRemaining -= 0.28;
      if (e.spawnRemaining > 0) {
        renderer.update(sim.enemies, elapsed + 0.28, 0, 9);
        bubbles.getMatrixAt(0, matrix);
        expect(matrix.elements[13]).toBeGreaterThan(0.55);
      }
    }
    e.spawnRemaining = 0;
    renderer.update(sim.enemies, 2.5, 0, 9);
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
    e.spawnRemaining = SLIME.SPAWN_DURATION_SECONDS * 0.7;
    renderer.update(sim.enemies, 0.42, 0, 9);
    const puddle = bodyScale();
    expect(puddle.x).toBeGreaterThan(beginning.x * 100);
    expect(puddle.y).toBeLessThan(0.1);
    expect(bubbles.count).toBe(5);
    e.spawnRemaining = SLIME.SPAWN_DURATION_SECONDS * 0.2;
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
