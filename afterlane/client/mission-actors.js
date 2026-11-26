import * as T from 'three';
import { box, luminous, mesh, surface } from './car.js';
import { roadPosition, roadX } from './road-layout.js';
import { trafficLanes as lanes, trafficTurn } from './collision.js';
import { vehicleBody } from './traffic.js';

const redBeacon = luminous(0xff2c38);
const blueBeacon = luminous(0x3094ff);
const rivalBeacon = luminous(0xffc176);
const targetBeacon = luminous(0xff5238);
const darkBase = surface(0x161a1f, .5, .3);

export function createLightbar(colorA = redBeacon, colorB = blueBeacon) {
  const bar = new T.Group();
  box(bar, darkBase, 0, .035, 0, .92, .065, .18);
  const left = box(bar, colorA.clone(), -.25, .048, 0, .36, .068, .15);
  const right = box(bar, colorB.clone(), .25, .048, 0, .36, .068, .15);
  bar.userData.left = left.material;
  bar.userData.right = right.material;
  return bar;
}

export function animateLightbar(bar, now) {
  if (!bar) return;
  const phase = Math.floor(now / 120) % 2;
  bar.userData.left.color.setHex(phase === 0 ? 0xff2c38 : 0x3b0b0e);
  bar.userData.right.color.setHex(phase === 1 ? 0x3094ff : 0x0a1c38);
}

function addMarker(parent, material, y = 1.85) {
  const geo = new T.OctahedronGeometry(.22, 0);
  const marker = mesh(parent, geo, material, 0, y, 0);
  marker.name = 'Actor marker';
  return marker;
}

export function createMissionActors(scene) {
  const actors = [];
  const laneGaps = [999, 999, 999, 999];
  const laneBlocked = [false, false, false, false];

  function clear() {
    for (const actor of actors) scene.remove(actor.body);
    actors.length = 0;
  }

  function spawnActor(role, spec, station, lane, basePace, initialSpeed = basePace) {
    const built = vehicleBody(scene, spec.type, spec.color, spec.style);
    const { body, footprint, animateWheels } = built;
    let lightbar = null, marker = null;
    if (role === 'police') {
      lightbar = createLightbar();
      lightbar.position.set(0, 1.38, -.06);
      body.add(lightbar);
      marker = addMarker(body, blueBeacon, 2.05);
    } else if (role === 'suspect') {
      marker = addMarker(body, targetBeacon, 1.92);
    } else if (role === 'rival') {
      marker = addMarker(body, rivalBeacon, 1.88);
    }
    const actor = {
      role,
      body,
      footprint,
      animateWheels,
      lightbar,
      marker,
      station,
      previousStation: station,
      lane,
      target: lane,
      offset: lanes[lane],
      previousOffset: lanes[lane],
      pace: basePace,
      speed: initialSpeed,
      timer: .5 + Math.random() * 1.2,
      slowUntil: 0,
    };
    actors.push(actor);
    return actor;
  }

  function setup(mission) {
    clear();
    if (!mission) return;
    const { mode, id } = mission;
    const lvl = id / 50;
    if (mode === 'pack') {
      const count = mission.rivals || 3;
      const rivalSpecs = [
        { type: 'Sports car', color: 0xe64938, style: 'Mid-engine coupe' },
        { type: 'Sports car', color: 0x26b6d4, style: 'Touring coupe' },
        { type: 'Sports car', color: 0xf0b232, style: 'AMG GT' },
        { type: 'Sports car', color: 0x56cf7e, style: 'Rear-engine coupe' },
      ];
      const rivalLanes = [0, 1, 3, 2];
      for (let i = 0; i < count; i++) {
        const pace = 27 + lvl * 18 + (count - i) * 1.5;
        spawnActor('rival', rivalSpecs[i % rivalSpecs.length], 7 + i * 7, rivalLanes[i % 4], pace, 8);
      }
    } else if (mode === 'police_chase') {
      const pace = 30 + lvl * 18;
      spawnActor('suspect', { type: 'Sports car', color: 0x1c2026, style: 'Classic muscle' }, 34, 1, pace, 16);
    } else if (mode === 'flee') {
      const count = mission.policeCount || 1;
      const pLanes = [1, 3];
      for (let i = 0; i < count; i++) {
        const pace = 34 + lvl * 22 - i * 1.5;
        spawnActor('police', { type: 'Sedan', color: 0x1e2631, style: 'Executive saloon' }, -42 - i * 18, pLanes[i % 2], pace, 16);
      }
    }
  }

  function pickLane(actor, playerDistance, playerX, trafficList) {
    laneGaps.fill(999);
    laneBlocked.fill(false);
    for (const c of trafficList) {
      const cw = c.footprint?.width ?? c.width ?? 2;
      const cl = c.footprint?.length ?? c.length ?? 4.5;
      const dz = c.station - actor.station;
      for (let i = 0; i < 4; i++) {
        const L = lanes[i];
        if (Math.abs(c.offset - L) > cw * .5 + 1.35) continue;
        if (dz > -(cl * .5 + 3.5) && dz < cl * .5 + 5.5) laneBlocked[i] = true;
        if (dz > 0) laneGaps[i] = Math.min(laneGaps[i], dz - cl * .5 - 2);
      }
    }
    // Avoid occupying the exact same slot as another actor
    for (const other of actors) {
      if (other === actor) continue;
      const dz = other.station - actor.station;
      if (Math.abs(dz) < 7) laneBlocked[other.target] = true;
    }
    let best = actor.target, bestScore = -1e9;
    for (let i = 0; i < 4; i++) {
      if (Math.abs(i - actor.target) > 1) continue;
      if (i !== actor.target && (laneBlocked[i] || laneGaps[i] < 16)) continue;
      let score = Math.min(laneGaps[i], 140);
      if (i === actor.target && laneGaps[i] > 42) score += 20;
      if (actor.role === 'police') score -= Math.abs(lanes[i] - playerX) * 1.4;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  function update(dt, now, playerDistance, playerX, playerSpeed, trafficList) {
    if (!actors.length) return;
    const roadOrigin = roadX(playerDistance);
    for (const actor of actors) {
      actor.previousStation = actor.station;
      actor.previousOffset = actor.offset;
      actor.timer -= dt;
      if (actor.timer <= 0) {
        actor.target = pickLane(actor, playerDistance, playerX, trafficList);
        actor.timer = .35 + Math.random() * .45;
      }

      // Compute forward gap ahead in actor's lane
      let gapAhead = 999;
      for (const c of trafficList) {
        const cw = c.footprint?.width ?? c.width ?? 2;
        const cl = c.footprint?.length ?? c.length ?? 4.5;
        const dz = c.station - actor.station;
        if (dz > 0 && Math.abs(c.offset - actor.offset) < cw * .5 + 1.25) {
          gapAhead = Math.min(gapAhead, dz - cl * .5 - 2.5);
        }
      }

      let targetSpeed = actor.pace;
      if (actor.role === 'rival') {
        const gap = actor.station - playerDistance;
        if (gap < -30) targetSpeed = Math.max(actor.pace, playerSpeed + 5);
        else if (gap > 75) targetSpeed = Math.max(24, actor.pace * .86);
      } else if (actor.role === 'suspect') {
        const gap = actor.station - playerDistance;
        if (now < actor.slowUntil) targetSpeed = Math.max(18, actor.pace * .58);
        else if (gap < -6) targetSpeed = Math.max(actor.pace + 8, playerSpeed + 6);
        else if (gap > 70) targetSpeed = Math.max(22, playerSpeed * .85);
        else if (gap < 15) targetSpeed = Math.min(actor.pace + 5, Math.max(actor.pace, playerSpeed * .93));
      } else if (actor.role === 'police') {
        const behind = playerDistance - actor.station;
        const sameLane = Math.abs(actor.offset - playerX) < 2.0;
        if (behind > 50) targetSpeed = Math.max(actor.pace + 6, playerSpeed + 5);
        else if (behind > 24) targetSpeed = Math.max(actor.pace + 2.5, playerSpeed * 0.96);
        else if (sameLane && behind < 5.6) targetSpeed = Math.max(0, playerSpeed - 2);
        else if (behind < 1.5) targetSpeed = Math.max(0, playerSpeed - 1.5);
        else targetSpeed = actor.pace;
      }

      if (gapAhead < 14) targetSpeed = Math.min(targetSpeed, 16);
      actor.speed = T.MathUtils.damp(actor.speed, targetSpeed, 3.2, dt);
      actor.station += actor.speed * dt;
      if (actor.role === 'police' && Math.abs(actor.offset - playerX) < 2.05 && actor.station > playerDistance - 5.2 && actor.station < playerDistance + 2.5) {
        actor.station = Math.min(actor.station, playerDistance - 5.2);
      }
      actor.offset = T.MathUtils.damp(actor.offset, lanes[actor.target], 3.8, dt);
      actor.lane = actor.target;

      const pos = roadPosition(actor.station, actor.offset);
      actor.body.position.set(pos.x - roadOrigin, 0, pos.z + playerDistance);
      actor.body.rotation.y = pos.heading + trafficTurn(actor);
      actor.animateWheels(actor.station - actor.previousStation, (lanes[actor.target] - actor.offset) * .22);
      animateLightbar(actor.lightbar, now);
      if (actor.marker) {
        actor.marker.rotation.y = now * .004;
        actor.marker.position.y = (actor.role === 'police' ? 2.08 : 1.90) + Math.sin(now * .006) * .08;
      }
    }
  }

  function rank(playerDistance) {
    let ahead = 0, total = 0;
    for (const a of actors) {
      if (a.role !== 'rival') continue;
      total++;
      if (a.station > playerDistance) ahead++;
    }
    return { place: 1 + ahead, total: total + 1 };
  }

  function suspectStatus(playerDistance, playerX, now) {
    const suspect = actors.find(a => a.role === 'suspect');
    if (!suspect) return null;
    const dz = suspect.station - playerDistance;
    const dx = Math.abs(suspect.offset - playerX);
    const rammed = Math.abs(dz) < 5.3 && dx < 2.35;
    if (rammed) suspect.slowUntil = now + 1800;
    const locking = Math.abs(dz) < 15 && dx < 5.0;
    return { gap: dz, offset: suspect.offset, locking, rammed };
  }

  function policeStatus(playerDistance, playerX) {
    let closest = Infinity, pinning = false;
    for (const a of actors) {
      if (a.role !== 'police') continue;
      const dist = Math.hypot(playerDistance - a.station, playerX - a.offset);
      if (dist < closest) closest = dist;
      if (Math.abs(playerDistance - a.station) < 6.5 && Math.abs(playerX - a.offset) < 2.25) pinning = true;
    }
    return { closest, pinning };
  }

  function relaunchSuspect(playerDistance) {
    const suspect = actors.find(a => a.role === 'suspect');
    if (!suspect) return;
    suspect.station = Math.max(suspect.station, playerDistance + 30);
    suspect.speed = suspect.pace + 8;
    suspect.slowUntil = 0;
  }

  return { setup, clear, update, rank, suspectStatus, policeStatus, relaunchSuspect };
}
