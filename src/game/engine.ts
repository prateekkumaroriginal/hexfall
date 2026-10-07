import * as THREE from 'three';
import { blankInput, Simulation } from './simulation';
import { PLAYER, STAFF } from '../config/gameplay';
import { CAMERA, SPELL_AUDIO } from '../config/rendering';
import { MAX_PROJECTILES, RUNTIME } from '../config/runtime';
import { AIM_SETTINGS, FIELD_OF_VIEW_SETTINGS } from '../config/settings';
import type { Snapshot } from './simulation';
import { CreatureRenderer } from './creatures';
import { Environment } from './environment';
import { buildStaff } from './staff';
import { renderPixelRatio } from './performance';
import { FrameDiagnostics } from './diagnostics';
import { verticalFieldOfView } from './camera';
import type { Settings } from '../settings';

export class Engine {
  readonly sim = new Simulation();
  readonly input = blankInput();
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(
    verticalFieldOfView(FIELD_OF_VIEW_SETTINGS.DEFAULT, CAMERA.REFERENCE_ASPECT),
    1,
    CAMERA.NEAR_CLIP_UNITS,
    CAMERA.FAR_CLIP_UNITS,
  );
  private abort = new AbortController();
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private last = 0;
  private accumulator = 0;
  private hudTime = 0;
  private previewTime = 0;
  private keys = new Set<string>();
  private dummy = new THREE.Object3D();
  private environment: Environment;
  private projectiles: THREE.InstancedMesh;
  private trails: THREE.InstancedMesh;
  private direction = new THREE.Vector3();
  private axis = new THREE.Vector3(0, 1, 0);
  private creatures: CreatureRenderer;
  private staff = new THREE.Group();
  private staffView = new THREE.Group();
  private crystal: THREE.Mesh;
  private mouseFire = false;
  private audio?: AudioContext;
  private lastShot = 0;
  private settings: Settings;
  private disposed = false;
  private fpsFrames = 0;
  private fpsTime = 0;
  private diagnostics = new FrameDiagnostics();
  private lastGameplayRender = {
    width: 0,
    height: 0,
    scale: 1,
    calls: 0,
    triangles: 0,
    enemies: 0,
  };
  constructor(
    private host: HTMLDivElement,
    private onUpdate: (s: Snapshot) => void,
    private onPerformance: (fps: number, calls: number) => void,
    settings: Settings,
  ) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor('#b2cedc');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'First-person view of a grassy mountain clearing',
    );
    this.scene.fog = new THREE.Fog('#adcad6', 65, 230);
    this.scene.add(new THREE.HemisphereLight('#d3ebff', '#627344', 2.0));
    const sun = new THREE.DirectionalLight('#fff0cf', 2.5);
    sun.position.set(-18, 30, -15);
    this.scene.add(sun);
    this.environment = new Environment(this.scene);
    this.environment.bakeSky(this.renderer);
    this.environment.setQuality(settings.quality);
    this.projectiles = this.instances(
      new THREE.SphereGeometry(0.1, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#b8fff0', toneMapped: false }),
      MAX_PROJECTILES,
    );
    this.trails = this.instances(
      new THREE.CylinderGeometry(0.025, 0.075, 0.8, 6),
      new THREE.MeshBasicMaterial({
        color: '#48deb0',
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
      MAX_PROJECTILES,
    );
    this.projectiles.name = 'wizard-projectiles';
    this.trails.name = 'spell-trails';
    this.creatures = new CreatureRenderer(this.scene);
    void this.creatures.loadTripoOrc().catch((error) => {
      if (this.disposed) return;
      console.error('Tripo orc could not load.', error);
      this.pause();
      this.host.dispatchEvent(
        new CustomEvent('engine-error', {
          detail: 'The orc model could not load. Reload the page to try again.',
        }),
      );
    });
    this.scene.add(this.camera);
    const faceFill = new THREE.PointLight('#d9e5dc', 3, 6, 2);
    faceFill.position.set(0, 0.55, -0.2);
    this.camera.add(faceFill);
    this.camera.add(this.staffView);
    this.staffView.add(this.staff);
    this.crystal = buildStaff(this.staff);
    const signal = this.abort.signal;
    document.addEventListener('pointerlockchange', this.lockChange, { signal });
    document.addEventListener('mousemove', this.mouseMove, { signal });
    window.addEventListener('keydown', this.keyDown, { signal });
    window.addEventListener('keyup', this.keyUp, { signal });
    window.addEventListener('mousedown', this.mouseDown, { signal });
    window.addEventListener('mouseup', this.mouseUp, { signal });
    window.addEventListener('blur', this.pause, { signal });
    document.addEventListener('visibilitychange', this.visibility, { signal });
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost, { signal });
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }
  private instances(g: THREE.BufferGeometry, m: THREE.Material, count: number) {
    const mesh = new THREE.InstancedMesh(g, m, count);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }
  updateSettings(settings: Settings) {
    this.settings = settings;
    this.environment.setQuality(settings.quality);
    this.resize();
  }
  statusCheck() {
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(
      debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    );
    return {
      renderer,
      acceleration: /basic render|swiftshader|llvmpipe|software|softpipe/i.test(renderer)
        ? 'software'
        : debug && /intel|nvidia|radeon|apple|adreno|mali|amd/i.test(renderer)
          ? 'hardware'
          : 'unknown',
      contextLost: gl.isContextLost(),
      quality: this.settings.quality,
      scale: this.settings.renderScale,
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
      grassQuality: this.settings.quality,
      gameplay: this.diagnostics.summary(),
    };
  }
  performanceReport() {
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return JSON.stringify(
      {
        reportVersion: 1,
        browser: navigator.userAgent,
        graphics: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        quality: this.settings.quality,
        renderScale: this.settings.renderScale,
        devicePixelRatio,
        viewport: [this.host.clientWidth, this.host.clientHeight],
        gameplay: { ...this.diagnostics.summary(), ...this.lastGameplayRender },
      },
      null,
      2,
    );
  }
  private resize = () => {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setPixelRatio(
      renderPixelRatio(w, h, devicePixelRatio, this.settings.quality, this.settings.renderScale),
    );
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = verticalFieldOfView(this.settings.fieldOfView, this.camera.aspect);
    this.camera.updateProjectionMatrix();
    // Preserve the staff's screen size and position as the world FOV changes.
    const staffScale =
      Math.tan((this.camera.fov * Math.PI) / 360) /
      Math.tan((CAMERA.STAFF_REFERENCE_VERTICAL_FOV_DEGREES * Math.PI) / 360);
    this.staffView.scale.set(staffScale, staffScale, 1);
  };
  async start() {
    if (this.disposed) return;
    try {
      await this.renderer.domElement.requestPointerLock();
      if (this.disposed) {
        document.exitPointerLock();
        return;
      }
      if (document.pointerLockElement !== this.renderer.domElement) return;
      if (this.sim.phase !== 'paused') {
        this.sim.reset();
        this.input.yaw = 0;
        this.input.pitch = 0;
      }
      this.sim.phase = 'playing';
      this.accumulator = 0;
      this.last = 0;
      if (this.settings.sound) {
        this.audio ??= new AudioContext();
        void this.audio.resume().catch(() => {});
      }
      this.onUpdate(this.sim.snapshot());
    } catch {
      throw new Error(
        'Mouse capture was blocked. Click PLAY again, or open the game in a desktop browser.',
      );
    }
  }
  exitToMenu() {
    this.sim.reset();
    this.sim.phase = 'ready';
    this.keys.clear();
    this.mouseFire = false;
    Object.assign(this.input, blankInput());
    this.accumulator = 0;
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.onUpdate(this.sim.snapshot());
  }
  pause = () => {
    if (this.sim.phase === 'playing') {
      this.sim.phase = 'paused';
      this.keys.clear();
      this.mouseFire = false;
      this.input.fire = false;
      if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
      this.onUpdate(this.sim.snapshot());
    }
  };
  private visibility = () => {
    if (document.hidden) this.pause();
  };
  private contextLost = (e: Event) => {
    e.preventDefault();
    this.pause();
    this.host.dispatchEvent(
      new CustomEvent('engine-error', {
        detail: 'The graphics context was lost. Reload the page to restore the arena.',
      }),
    );
  };
  private lockChange = () => {
    if (document.pointerLockElement !== this.renderer.domElement) this.pause();
  };
  private mouseMove = (e: MouseEvent) => {
    if (this.sim.phase !== 'playing') return;
    this.input.yaw -=
      e.movementX * AIM_SETTINGS.RADIANS_PER_MOUSE_PIXEL * this.settings.sensitivity;
    this.input.pitch = THREE.MathUtils.clamp(
      this.input.pitch -
        e.movementY * AIM_SETTINGS.RADIANS_PER_MOUSE_PIXEL * this.settings.sensitivity,
      -AIM_SETTINGS.PITCH_LIMIT_RADIANS,
      AIM_SETTINGS.PITCH_LIMIT_RADIANS,
    );
  };
  private keyDown = (e: KeyboardEvent) => {
    if (this.sim.phase !== 'playing') return;
    if (['ControlLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
      e.preventDefault();
    this.keys.add(e.code);
    if (e.code === 'KeyP' || e.code === 'Escape') this.pause();
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private mouseDown = (e: MouseEvent) => {
    if (this.sim.phase === 'playing' && e.button === 0) this.mouseFire = true;
  };
  private mouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseFire = false;
  };
  private tone() {
    if (!this.settings.sound || !this.audio || this.audio.state !== 'running') return;
    const osc = this.audio.createOscillator(),
      gain = this.audio.createGain(),
      now = this.audio.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(SPELL_AUDIO.START_FREQUENCY_HZ, now);
    osc.frequency.exponentialRampToValueAtTime(
      SPELL_AUDIO.END_FREQUENCY_HZ,
      now + SPELL_AUDIO.FREQUENCY_RAMP_SECONDS,
    );
    gain.gain.setValueAtTime(SPELL_AUDIO.START_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(
      SPELL_AUDIO.END_GAIN,
      now + SPELL_AUDIO.GAIN_RAMP_SECONDS,
    );
    osc.connect(gain);
    gain.connect(this.audio.destination);
    osc.start();
    osc.stop(now + SPELL_AUDIO.DURATION_SECONDS);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const renderHz =
      this.sim.phase === 'playing' ? RUNTIME.GAMEPLAY_RENDER_HZ : RUNTIME.MENU_RENDER_HZ;
    if (now - this.last < 1000 / renderHz - RUNTIME.FRAME_SCHEDULING_TOLERANCE_MILLISECONDS) return;
    const elapsed = (now - (this.last || now)) / 1000;
    const dt = Math.min(elapsed, RUNTIME.MAXIMUM_FRAME_DELTA_SECONDS);
    this.last = now;
    if (document.hidden) return;
    const frameStart = performance.now(),
      wasPlaying = this.sim.phase === 'playing';
    if (this.sim.phase === 'playing') {
      this.input.forward =
        Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
        Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
      this.input.strafe =
        Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
        Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
      this.input.fire = this.mouseFire || this.keys.has('ControlLeft');
      this.accumulator += dt;
      const simulationStep = 1 / RUNTIME.SIMULATION_HZ;
      while (this.accumulator >= simulationStep) {
        this.sim.step(simulationStep, this.input);
        this.accumulator -= simulationStep;
      }
      if (this.input.fire && now - this.lastShot > STAFF.FIRE_INTERVAL_SECONDS * 1000) {
        this.tone();
        this.lastShot = now;
      }
      this.camera.position.set(
        this.sim.x,
        PLAYER.EYE_HEIGHT_UNITS +
          Math.sin(this.sim.time * CAMERA.MOVEMENT_BOB_RADIANS_PER_SECOND) *
            CAMERA.MOVEMENT_BOB_AMPLITUDE_UNITS *
            Number(!!(this.input.forward || this.input.strafe)),
        this.sim.z,
      );
      this.camera.rotation.set(this.input.pitch, this.input.yaw, 0, 'YXZ');
      if (this.sim.phase !== 'playing') {
        document.exitPointerLock();
        this.keys.clear();
        this.mouseFire = false;
        this.input.fire = false;
        this.onUpdate(this.sim.snapshot());
      }
    } else if (this.sim.phase === 'ready') {
      this.previewTime += dt;
      this.camera.position.set(3 + Math.sin(this.previewTime * 0.08) * 1.5, 3.5, 14);
      this.camera.lookAt(-3, 2, -7);
    }
    this.staff.visible = this.sim.phase !== 'ready';
    this.staff.position.y =
      -0.86 +
      Math.sin(this.sim.time * 3) * 0.015 +
      (this.input.fire && this.sim.shootCooldown > 0.08 ? -0.035 : 0);
    this.crystal.rotation.y += dt;
    (this.crystal.material as THREE.MeshStandardMaterial).emissiveIntensity =
      this.input.fire && this.sim.phase === 'playing' && this.sim.shootCooldown > 0.07 ? 2.4 : 0.6;
    this.environment.update(
      this.sim.phase === 'ready' ? this.previewTime : this.sim.time,
      this.camera,
    );
    this.syncMeshes();
    this.renderer.render(this.scene, this.camera);
    if (wasPlaying) {
      this.diagnostics.record(elapsed * 1000, performance.now() - frameStart);
      const render = this.lastGameplayRender;
      render.width = this.renderer.domElement.width;
      render.height = this.renderer.domElement.height;
      render.scale = this.settings.renderScale;
      render.calls = this.renderer.info.render.calls;
      render.triangles = this.renderer.info.render.triangles;
      render.enemies = this.sim.alive;
    }
    this.hudTime += dt;
    if (this.hudTime > RUNTIME.HUD_INTERVAL_SECONDS) {
      if (this.sim.phase === 'playing') this.onUpdate(this.sim.snapshot());
      this.hudTime = 0;
    }
    this.fpsFrames++;
    this.fpsTime += elapsed;
    if (this.fpsTime >= RUNTIME.FPS_SAMPLE_INTERVAL_SECONDS) {
      this.onPerformance(
        Math.round(this.fpsFrames / this.fpsTime),
        this.renderer.info.render.calls,
      );
      this.fpsTime = this.fpsFrames = 0;
    }
  };
  private syncMeshes() {
    this.creatures.update(this.sim.enemies, this.sim.time, this.sim.x, this.sim.z, this.camera);
    let count = 0;
    for (const p of this.sim.projectiles)
      if (p.active) {
        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.quaternion.identity();
        this.dummy.updateMatrix();
        this.projectiles.setMatrixAt(count, this.dummy.matrix);
        this.direction.set(p.vx, p.vy, p.vz).normalize();
        this.dummy.position.addScaledVector(this.direction, -0.4);
        this.dummy.quaternion.setFromUnitVectors(this.axis, this.direction);
        this.dummy.updateMatrix();
        this.trails.setMatrixAt(count++, this.dummy.matrix);
      }
    this.projectiles.count = this.trails.count = count;
    this.projectiles.instanceMatrix.needsUpdate = true;
    this.trails.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.disposed = true;
    this.creatures.dispose();
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.resizeObserver.disconnect();
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    void this.audio?.close().catch(() => {});
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        const ms = Array.isArray(object.material) ? object.material : [object.material];
        for (const m of ms) materials.add(m);
        if (object instanceof THREE.InstancedMesh) object.dispose();
      }
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
