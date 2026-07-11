import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameRenderer } from '../core/Game';
import type { AssetManager } from '../engine/AssetManager';
import { PLAYER, SNOWBALL, TEAM_COLORS } from '../game/config';
import type { Player, Snowball } from '../game/types';
import type { World } from '../game/World';
import { toThree } from './coords';

const SNOWBALL_POOL_SIZE = 64;
const PARTICLE_POOL_SIZE = 500;
const FOOTPRINT_POOL_SIZE = 64;
const SPARKLE_POOL_SIZE = 72;
const PLAYER_FX_STATE_SIZE = 32;
const PARTICLE_DT = 1 / 60;
const PARTICLE_GRAVITY = 7.5;
const TRAIL_RATE = 18;
const TRAIL_LIFE = 0.34;
const BURST_LIFE = 0.55;
const FOOTPRINT_INTERVAL = 0.22;
const FOOTPRINT_LIFE = 3.8;
const FOOTPRINT_SIDE_OFFSET = 0.16;
const FOOTPRINT_MOVE_THRESHOLD_SQ = (PLAYER.moveSpeed * 0.12) ** 2;
const PUFF_COOLDOWN = 0.28;
const SHARP_TURN_COS = 0.25;
const SPARKLE_TWO_PI = Math.PI * 2;
const WHITE = 0xffffff;
const FOOTPRINT_COLOR = 0x86a5b8;

interface SnowballSlot {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  snowballId: number;
  lastTrailTick: number;
}

interface ParticleSlot {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

interface FootprintSlot {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  active: boolean;
}

interface SparkleSlot {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  x: number;
  y: number;
  height: number;
  vx: number;
  vy: number;
  fall: number;
  phase: number;
  phaseSpeed: number;
  size: number;
}

interface PlayerFxState {
  playerId: number;
  footprintTimer: number;
  puffCooldown: number;
  side: number;
  wasMoving: boolean;
  lastVx: number;
  lastVy: number;
}

/**
 * Observes snowball simulation data and combat events, rendering pooled flying
 * snowballs, snow trails and hit puffs without mutating world state.
 */
export class ParticleRenderer implements GameRenderer {
  private readonly group = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  private readonly snowballSlots: SnowballSlot[] = [];
  private readonly particleSlots: ParticleSlot[] = [];
  private readonly footprintSlots: FootprintSlot[] = [];
  private readonly sparkleSlots: SparkleSlot[] = [];
  private readonly playerFxStates: PlayerFxState[] = [];
  private readonly offSnowballImpact: () => void;
  private readonly offPlayerHit: () => void;
  private readonly offSnowballThrown: () => void;

  constructor(
    private readonly scene: THREE.Scene,
    assets: AssetManager,
    private readonly world: World,
    events: EventBus,
  ) {
    this.group.name = 'ParticleRenderer';
    this.scene.add(this.group);

    const snowballGeometry = assets.geometry(
      'particle-renderer-snowball-sphere',
      () => new THREE.SphereGeometry(1, 12, 10),
    );
    const snowballMaterial = assets.standardMaterial(WHITE, false);
    const particleGeometry = assets.geometry(
      'particle-renderer-puff-sphere',
      () => new THREE.SphereGeometry(1, 8, 6),
    );
    const footprintGeometry = assets.geometry('particle-renderer-footprint-disc', () => {
      const geometry = new THREE.CircleGeometry(1, 12);
      geometry.rotateX(-Math.PI * 0.5);
      return geometry;
    });
    const sparkleGeometry = assets.geometry(
      'particle-renderer-sparkle-sphere',
      () => new THREE.SphereGeometry(1, 6, 4),
    );

    for (let i = 0; i < SNOWBALL_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(snowballGeometry, snowballMaterial);
      mesh.castShadow = true;
      mesh.visible = false;
      this.group.add(mesh);
      this.snowballSlots.push({ mesh, snowballId: -1, lastTrailTick: -1 });
    }

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: WHITE,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(particleGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.particleSlots.push({
        mesh,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        active: false,
      });
    }

    for (let i = 0; i < FOOTPRINT_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: FOOTPRINT_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new THREE.Mesh(footprintGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.footprintSlots.push({
        mesh,
        life: 0,
        maxLife: FOOTPRINT_LIFE,
        active: false,
      });
    }

    for (let i = 0; i < SPARKLE_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: WHITE,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(sparkleGeometry, material);
      this.group.add(mesh);
      const slot = this.createSparkleSlot(mesh, i);
      mesh.position.set(slot.x, slot.height, slot.y);
      mesh.scale.setScalar(slot.size);
      this.sparkleSlots.push(slot);
    }

    for (let i = 0; i < PLAYER_FX_STATE_SIZE; i++) {
      this.playerFxStates.push({
        playerId: -1,
        footprintTimer: 0,
        puffCooldown: 0,
        side: 1,
        wasMoving: false,
        lastVx: 0,
        lastVy: 0,
      });
    }

    this.offSnowballImpact = events.on('SnowballImpact', (event) => {
      this.spawnBurst(event.x, event.y, 0.18, WHITE, event.hitPlayerId === null ? 8 : 6);
      if (event.hitPlayerId === null) {
        this.spawnSnowPuff(event.x, event.y, 7);
      }
    });
    this.offPlayerHit = events.on('PlayerHit', (event) => {
      this.spawnBurst(event.x, event.y, 0.55, this.teamColorForPlayer(event.attackerId), 8);
    });
    this.offSnowballThrown = events.on('SnowballThrown', (event) => {
      const color = TEAM_COLORS[event.team];
      const snowball = this.findSnowball(event.snowballId);
      if (!snowball) return;
      toThree(this.tmp, snowball.position.x, snowball.position.y, snowball.height);
      this.spawnParticle(this.tmp.x, this.tmp.y, this.tmp.z, 0, 0.45, 0, 0.1, TRAIL_LIFE, color);
    });
  }

  sync(alpha: number): void {
    void alpha;
    let visibleSnowballs = 0;

    for (const snowball of this.world.snowballs) {
      if (!snowball.alive || visibleSnowballs >= SNOWBALL_POOL_SIZE) continue;
      const slot = this.snowballSlots[visibleSnowballs];
      this.updateSnowballSlot(slot, snowball);
      visibleSnowballs++;
    }

    for (let i = visibleSnowballs; i < SNOWBALL_POOL_SIZE; i++) {
      const slot = this.snowballSlots[i];
      slot.mesh.visible = false;
      slot.snowballId = -1;
      slot.lastTrailTick = -1;
    }

    this.updatePlayerEffects();
    this.updateParticles();
    this.updateFootprints();
    this.updateSparkles();
  }

  dispose(): void {
    this.offSnowballImpact();
    this.offPlayerHit();
    this.offSnowballThrown();
    this.scene.remove(this.group);

    for (const particle of this.particleSlots) {
      particle.mesh.material.dispose();
    }
    for (const footprint of this.footprintSlots) {
      footprint.mesh.material.dispose();
    }
    for (const sparkle of this.sparkleSlots) {
      sparkle.mesh.material.dispose();
    }
    this.group.clear();
  }

  private updateSnowballSlot(slot: SnowballSlot, snowball: Snowball): void {
    if (slot.snowballId !== snowball.id) {
      slot.snowballId = snowball.id;
      slot.lastTrailTick = -1;
    }

    toThree(this.tmp, snowball.position.x, snowball.position.y, snowball.height);
    slot.mesh.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
    slot.mesh.scale.setScalar(Math.max(snowball.radius, SNOWBALL.radius * 0.5));
    slot.mesh.visible = true;

    const trailTick = Math.floor(snowball.age * TRAIL_RATE);
    if (snowball.height > SNOWBALL.radius * 0.5 && trailTick > slot.lastTrailTick) {
      slot.lastTrailTick = trailTick;
      this.spawnTrail(snowball);
    }
  }

  private spawnTrail(snowball: Snowball): void {
    toThree(this.tmp, snowball.position.x, snowball.position.y, snowball.height);
    this.spawnParticle(
      this.tmp.x,
      this.tmp.y,
      this.tmp.z,
      -snowball.velocity.x * 0.025,
      0.18,
      -snowball.velocity.y * 0.025,
      0.075,
      TRAIL_LIFE,
      WHITE,
    );
  }

  private spawnBurst(x: number, y: number, height: number, color: number, count: number): void {
    toThree(this.tmp, x, y, height);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 1.5 + (i % 3) * 0.35;
      this.spawnParticle(
        this.tmp.x,
        this.tmp.y,
        this.tmp.z,
        Math.cos(angle) * speed,
        1.9 + (i % 2) * 0.45,
        Math.sin(angle) * speed,
        0.13 + (i % 3) * 0.025,
        BURST_LIFE,
        color,
      );
    }
  }

  private spawnSnowPuff(x: number, y: number, count: number): void {
    toThree(this.tmp, x, y, 0.05);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 0.45 + (i % 3) * 0.18;
      this.spawnParticle(
        this.tmp.x,
        this.tmp.y,
        this.tmp.z,
        Math.cos(angle) * speed,
        0.45 + (i % 2) * 0.18,
        Math.sin(angle) * speed,
        0.09 + (i % 3) * 0.018,
        0.42,
        WHITE,
      );
    }
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    life: number,
    color: number,
  ): void {
    for (const particle of this.particleSlots) {
      if (particle.active) continue;
      particle.x = x;
      particle.y = y;
      particle.z = z;
      particle.vx = vx;
      particle.vy = vy;
      particle.vz = vz;
      particle.life = life;
      particle.maxLife = life;
      particle.size = size;
      particle.active = true;
      particle.mesh.material.color.setHex(color);
      particle.mesh.material.opacity = 1;
      particle.mesh.position.set(x, y, z);
      particle.mesh.scale.setScalar(size);
      particle.mesh.visible = true;
      return;
    }
  }

  private updateParticles(): void {
    for (const particle of this.particleSlots) {
      if (!particle.active) continue;

      particle.life -= PARTICLE_DT;
      if (particle.life <= 0) {
        particle.active = false;
        particle.mesh.visible = false;
        particle.mesh.material.opacity = 0;
        continue;
      }

      particle.vy -= PARTICLE_GRAVITY * PARTICLE_DT;
      particle.x += particle.vx * PARTICLE_DT;
      particle.y += particle.vy * PARTICLE_DT;
      particle.z += particle.vz * PARTICLE_DT;

      const t = particle.life / particle.maxLife;
      particle.mesh.position.set(particle.x, particle.y, particle.z);
      particle.mesh.scale.setScalar(particle.size * (0.35 + t * 0.65));
      particle.mesh.material.opacity = t;
    }
  }

  private updatePlayerEffects(): void {
    for (const player of this.world.players) {
      const state = this.fxStateForPlayer(player);
      if (state === null) continue;

      if (state.puffCooldown > 0) {
        state.puffCooldown -= PARTICLE_DT;
      }

      const vx = player.velocity.x;
      const vy = player.velocity.y;
      const speedSq = vx * vx + vy * vy;
      const moving = player.alive && speedSq > FOOTPRINT_MOVE_THRESHOLD_SQ;

      if (moving) {
        const speed = Math.sqrt(speedSq);
        let sharpTurn = false;
        const lastSpeedSq = state.lastVx * state.lastVx + state.lastVy * state.lastVy;
        if (lastSpeedSq > FOOTPRINT_MOVE_THRESHOLD_SQ) {
          const dot = (vx * state.lastVx + vy * state.lastVy) / (speed * Math.sqrt(lastSpeedSq));
          sharpTurn = dot < SHARP_TURN_COS;
        }

        if ((!state.wasMoving || sharpTurn) && state.puffCooldown <= 0) {
          this.spawnSnowPuff(player.position.x, player.position.y, 5);
          state.puffCooldown = PUFF_COOLDOWN;
        }

        state.footprintTimer -= PARTICLE_DT;
        if (state.footprintTimer <= 0) {
          const sideOffset = FOOTPRINT_SIDE_OFFSET * state.side;
          this.spawnFootprint(
            player.position.x - (vy / speed) * sideOffset,
            player.position.y + (vx / speed) * sideOffset,
            Math.atan2(vx, vy),
          );
          state.side = -state.side;
          state.footprintTimer = FOOTPRINT_INTERVAL;
        }

        state.lastVx = vx;
        state.lastVy = vy;
      } else {
        state.footprintTimer = 0;
        state.lastVx = 0;
        state.lastVy = 0;
      }

      state.wasMoving = moving;
    }
  }

  private spawnFootprint(x: number, y: number, rotation: number): void {
    for (const footprint of this.footprintSlots) {
      if (footprint.active) continue;
      toThree(this.tmp, x, y, 0.012);
      footprint.life = FOOTPRINT_LIFE;
      footprint.maxLife = FOOTPRINT_LIFE;
      footprint.active = true;
      footprint.mesh.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
      footprint.mesh.rotation.set(0, rotation, 0);
      footprint.mesh.scale.set(0.12, 1, 0.26);
      footprint.mesh.material.opacity = 0.34;
      footprint.mesh.visible = true;
      return;
    }
  }

  private updateFootprints(): void {
    for (const footprint of this.footprintSlots) {
      if (!footprint.active) continue;

      footprint.life -= PARTICLE_DT;
      if (footprint.life <= 0) {
        footprint.active = false;
        footprint.mesh.visible = false;
        footprint.mesh.material.opacity = 0;
        continue;
      }

      const t = footprint.life / footprint.maxLife;
      footprint.mesh.material.opacity = 0.34 * t;
    }
  }

  private updateSparkles(): void {
    const halfWidth = this.world.arena.width * 0.5;
    const halfHeight = this.world.arena.height * 0.5;

    for (const sparkle of this.sparkleSlots) {
      sparkle.x += sparkle.vx * PARTICLE_DT;
      sparkle.y += sparkle.vy * PARTICLE_DT;
      sparkle.height -= sparkle.fall * PARTICLE_DT;
      sparkle.phase += sparkle.phaseSpeed * PARTICLE_DT;

      if (sparkle.phase > SPARKLE_TWO_PI) {
        sparkle.phase -= SPARKLE_TWO_PI;
      }
      if (sparkle.x > halfWidth) {
        sparkle.x = -halfWidth;
      } else if (sparkle.x < -halfWidth) {
        sparkle.x = halfWidth;
      }
      if (sparkle.y > halfHeight) {
        sparkle.y = -halfHeight;
      } else if (sparkle.y < -halfHeight) {
        sparkle.y = halfHeight;
      }
      if (sparkle.height < 0.05) {
        sparkle.height = 1.4 + (sparkle.phase / SPARKLE_TWO_PI) * 0.9;
      }

      const twinkle = 0.5 + Math.sin(sparkle.phase) * 0.5;
      sparkle.mesh.position.set(sparkle.x, sparkle.height, sparkle.y);
      sparkle.mesh.material.opacity = 0.08 + twinkle * 0.18;
    }
  }

  private createSparkleSlot(
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
    index: number,
  ): SparkleSlot {
    const width = Math.max(this.world.arena.width, 1);
    const height = Math.max(this.world.arena.height, 1);
    const fx = ((index * 37) % SPARKLE_POOL_SIZE) / SPARKLE_POOL_SIZE;
    const fy = ((index * 53) % SPARKLE_POOL_SIZE) / SPARKLE_POOL_SIZE;
    const phase = ((index * 17) % SPARKLE_POOL_SIZE) / SPARKLE_POOL_SIZE * SPARKLE_TWO_PI;
    return {
      mesh,
      x: (fx - 0.5) * width,
      y: (fy - 0.5) * height,
      height: 0.12 + ((index % 9) / 9) * 1.9,
      vx: 0.08 + (index % 5) * 0.012,
      vy: -0.035 - (index % 7) * 0.007,
      fall: 0.018 + (index % 4) * 0.004,
      phase,
      phaseSpeed: 1.2 + (index % 6) * 0.16,
      size: 0.018 + (index % 3) * 0.006,
    };
  }

  private fxStateForPlayer(player: Player): PlayerFxState | null {
    let empty: PlayerFxState | null = null;
    for (const state of this.playerFxStates) {
      if (state.playerId === player.id) return state;
      if (state.playerId === -1 && empty === null) {
        empty = state;
      }
    }
    if (empty === null) return null;
    empty.playerId = player.id;
    empty.footprintTimer = 0;
    empty.puffCooldown = 0;
    empty.side = 1;
    empty.wasMoving = false;
    empty.lastVx = 0;
    empty.lastVy = 0;
    return empty;
  }

  private findSnowball(id: number): Snowball | null {
    for (const snowball of this.world.snowballs) {
      if (snowball.id === id) return snowball;
    }
    return null;
  }

  private teamColorForPlayer(playerId: number): number {
    for (const player of this.world.players) {
      if (player.id === playerId) return TEAM_COLORS[player.team];
    }
    return WHITE;
  }
}
