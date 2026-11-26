const weathers = ['Clear', 'Light rain', 'Heavy rain', 'Thunderstorm', 'Snow'];

function makeMission(id, config) {
  return { id, ...config };
}

const raceTitles = [
  'Downtown Showdown', 'Bridge Sprint', 'Rainy Duel', 'Cedar GP', 'Midnight Rush',
  'Storm Circuit', 'Dawn Express', 'Frostwood Clash', 'Thunder Finals', 'Route 07 Championship',
];

const modeConfigs = [
  { mode: 'time_attack', label: 'Time Attack', badge: '⏱' },
  { mode: 'police_chase', label: 'Police Mode', badge: '🚓' },
  { mode: 'no_scratch', label: 'No-Scratch Run', badge: '🛡' },
  { mode: 'flee', label: 'Flee Mode', badge: '🚨' },
  { mode: 'overtake', label: 'Overtake Rush', badge: '⚡' },
  { mode: 'speed', label: 'Speed Trial', badge: '🔥' },
];

const districtNames = ['City', 'Suburbs', 'Cedar Woods', 'North Bridge', 'Countryside', 'Stormway', 'Red Basin', 'Frostwood'];

export const missions = Array.from({ length: 50 }, (_, idx) => {
  const id = idx + 1;
  const tier = Math.floor(idx / 5); // 0..9
  const progress = idx / 49; // 0..1
  const biome = districtNames[tier % districtNames.length];
  const weather = id % 12 === 0 ? 'Thunderstorm'
    : id % 9 === 0 ? 'Snow'
      : id % 5 === 4 && id >= 12 ? 'Heavy rain'
        : id % 6 === 3 && id >= 8 ? 'Light rain' : 'Clear';
  const daylight = id % 10 === 0 ? 0.58 : id % 8 === 0 ? 0.45 : 1;

  // Every 5th mission is a Pack Race (Boss/Rival Race)
  if (id % 5 === 0) {
    const raceIndex = id / 5 - 1;
    const distance = Math.round((2000 + raceIndex * 380) / 100) * 100;
    const timeLimit = Math.max(65, Math.round(65 + raceIndex * 7));
    const rivals = id >= 20 ? 4 : 3;
    const reward = 250 + raceIndex * 110;
    return makeMission(id, {
      title: raceTitles[raceIndex],
      mode: 'pack',
      modeLabel: 'Pack Race',
      badge: '🏁',
      biome,
      weather,
      daylight,
      timeLimit,
      rivals,
      reward,
      objectives: { distance, finishFirst: true },
      desc: `Beat ${rivals} rival racers to the ${distance.toLocaleString()} m finish before the timer runs out.`,
    });
  }

  const pick = modeConfigs[(id - 1 - Math.floor((id - 1) / 5)) % modeConfigs.length];
  const timeLimit = Math.max(60, Math.round(60 + progress * 45));
  const reward = 120 + id * 22;

  if (pick.mode === 'police_chase') {
    const takedowns = id >= 30 ? 2 : 1;
    const distance = Math.round((1500 + progress * 2400) / 100) * 100;
    return makeMission(id, {
      title: `Suspect Pursuit ${Math.ceil(id / 5)}`,
      mode: 'police_chase',
      modeLabel: 'Police Mode',
      badge: '🚓',
      biome,
      weather,
      daylight,
      timeLimit: Math.max(60, timeLimit),
      takedowns,
      reward: reward + 60,
      objectives: { catchSuspect: true, takedowns, maxDistanceHint: distance },
      desc: `Chase down the fleeing suspect! Stay locked behind or ram them (${takedowns} takedown${takedowns > 1 ? 's' : ''}) before time expires.`,
    });
  }

  if (pick.mode === 'flee') {
    const policeCount = id >= 28 ? 2 : 1;
    const distance = Math.round((1700 + progress * 2800) / 100) * 100;
    const surviveOnly = id % 2 === 0;
    return makeMission(id, {
      title: `Highway Escape ${Math.ceil(id / 5)}`,
      mode: 'flee',
      modeLabel: 'Flee Mode',
      badge: '🚨',
      biome,
      weather,
      daylight,
      timeLimit: Math.max(60, Math.round(60 + progress * 25)),
      policeCount,
      reward: reward + 60,
      objectives: surviveOnly ? { evadePolice: true, surviveTimer: true } : { evadePolice: true, distance },
      desc: surviveOnly
        ? `Police interceptors are on your tail! Evade arrest for ${Math.max(60, Math.round(60 + progress * 25))} s without getting boxed in.`
        : `Outrun ${policeCount} police cruiser${policeCount > 1 ? 's' : ''} and reach the ${distance.toLocaleString()} m escape point!`,
    });
  }

  if (pick.mode === 'no_scratch') {
    const distance = Math.round((1400 + progress * 2800) / 100) * 100;
    const closeOvertakes = Math.round(4 + progress * 14);
    return makeMission(id, {
      title: `Clean Line ${Math.ceil(id / 5)}`,
      mode: 'no_scratch',
      modeLabel: 'No-Scratch Run',
      badge: '🛡',
      biome,
      weather,
      daylight,
      timeLimit: Math.max(60, timeLimit),
      reward: reward + 40,
      objectives: { distance, closeOvertakes, noScratch: true },
      desc: `Reach ${distance.toLocaleString()} m with ${closeOvertakes} close overtakes and ZERO scratches!`,
    });
  }

  if (pick.mode === 'overtake') {
    const closeOvertakes = Math.round(6 + progress * 24);
    const distance = Math.round((1400 + progress * 2800) / 100) * 100;
    const noBrake = id >= 14 && id % 3 === 0;
    return makeMission(id, {
      title: `Needle Thread ${Math.ceil(id / 5)}`,
      mode: 'overtake',
      modeLabel: 'Overtake Rush',
      badge: '⚡',
      biome,
      weather,
      daylight,
      timeLimit: Math.max(60, timeLimit),
      reward,
      objectives: { distance, closeOvertakes, ...(noBrake ? { noBrake: true } : {}) },
      desc: `Pass ${closeOvertakes} vehicles closely across ${distance.toLocaleString()} m${noBrake ? ' without using brakes' : ''}.`,
    });
  }

  if (pick.mode === 'speed') {
    const speedTarget = Math.round((130 + progress * 75) / 5) * 5;
    const speedDuration = Math.round(12 + progress * 16);
    const distance = Math.round((1600 + progress * 2800) / 100) * 100;
    const noBrake = id >= 18 && id % 2 === 0;
    return makeMission(id, {
      title: `Velocity ${speedTarget}`,
      mode: 'speed',
      modeLabel: 'Speed Trial',
      badge: '🔥',
      biome,
      weather,
      daylight,
      timeLimit: Math.max(60, timeLimit),
      reward,
      objectives: { distance, speedTarget, speedDuration, ...(noBrake ? { noBrake: true } : {}) },
      desc: `Hold ${speedTarget}+ km/h for ${speedDuration} s over ${distance.toLocaleString()} m${noBrake ? ' with zero brakes' : ''}.`,
    });
  }

  // Time Attack default
  const distance = Math.round((1500 + progress * 3400) / 100) * 100;
  const speedTarget = id >= 12 ? Math.round((135 + progress * 60) / 5) * 5 : 0;
  const speedDuration = speedTarget ? Math.round(10 + progress * 12) : 0;
  return makeMission(id, {
    title: `Time Attack ${Math.ceil(id / 5)}`,
    mode: 'time_attack',
    modeLabel: 'Time Attack',
    badge: '⏱',
    biome,
    weather,
    daylight,
    timeLimit: Math.max(60, timeLimit),
    reward,
    objectives: { distance, ...(speedTarget ? { speedTarget, speedDuration } : {}) },
    desc: `Beat the ${Math.max(60, timeLimit)} s clock to ${distance.toLocaleString()} m${speedTarget ? ` and hold ${speedTarget}+ km/h for ${speedDuration} s` : ''}.`,
  });
});

export function formatMissionRules(mission) {
  const { objectives: o } = mission;
  const chips = [mission.modeLabel];
  if (o.distance) chips.push(`Finish ${o.distance.toLocaleString()} m`);
  if (o.finishFirst) chips.push(`Win vs ${mission.rivals} rivals`);
  if (o.catchSuspect) chips.push(`Takedown (${mission.takedowns}x)`);
  if (o.evadePolice && o.surviveTimer) chips.push(`Survive ${mission.timeLimit}s`);
  if (o.evadePolice && !o.surviveTimer) chips.push('Outrun Police');
  if (o.closeOvertakes) chips.push(`${o.closeOvertakes} close passes`);
  if (o.speedTarget) chips.push(`${o.speedTarget}+ km/h · ${o.speedDuration}s`);
  if (o.noScratch) chips.push('No Scratch');
  if (o.noBrake) chips.push('No Brakes');
  chips.push(`${mission.timeLimit}s limit`);
  const timeLabel = mission.daylight >= 0.8 ? 'Day' : mission.daylight > 0.15 ? 'Dawn' : 'Night';
  chips.push(`${timeLabel} · ${mission.weather}`);
  return chips;
}

export function buildMissionMap(settings, onStartMission) {
  const dialog = document.querySelector('#mission-dialog');
  const milestone = document.querySelector('#mission-milestone');
  const canvas = document.querySelector('#mission-map-scroll');
  const briefTitle = document.querySelector('#mission-brief-title');
  const briefDesc = document.querySelector('#mission-brief-desc');
  const briefTags = document.querySelector('#mission-brief-tags');
  const briefReward = document.querySelector('#mission-brief-reward');
  const briefStart = document.querySelector('#mission-start-btn');
  const closeBtn = document.querySelector('#mission-close');

  let selectedId = Math.min(missions.length, Math.max(1, settings.missionUnlocked || 1));

  function renderBrief() {
    const m = missions.find(item => item.id === selectedId) ?? missions[0];
    const unlocked = Math.max(1, settings.missionUnlocked || 1);
    const done = settings.missionCompleted?.[m.id];
    const locked = m.id > unlocked;
    briefTitle.textContent = `Mission ${m.id} · ${m.title}`;
    briefDesc.textContent = m.desc;
    briefTags.replaceChildren(...formatMissionRules(m).map(label => {
      const span = document.createElement('span');
      const warn = label === 'No Brakes' || label === 'No Scratch' || label === 'Flee Mode';
      const race = label === 'Pack Race';
      span.className = warn ? 'mission-tag warn' : race ? 'mission-tag race' : 'mission-tag';
      span.textContent = label;
      return span;
    }));
    briefReward.textContent = m.id === 5
      ? (done ? `Completed · +${m.reward} pts · 🎁 BMW M4 Competition Unlocked FREE!` : `Reward: +${m.reward} pts · 🎁 Unlocks BMW M4 Competition FREE!`)
      : done
        ? `Completed (${done.bestRemaining.toFixed(1)}s left) · +${m.reward} pts`
        : `Reward: +${m.reward} pts`;
    briefStart.disabled = locked;
    briefStart.textContent = locked ? `Complete Mission ${m.id - 1} to unlock` : done ? 'Replay Mission' : 'Start Mission';
  }

  function renderMap() {
    const unlocked = Math.max(1, settings.missionUnlocked || 1);
    const completed = settings.missionCompleted || {};
    if (milestone) {
      const doneFirst5 = [1, 2, 3, 4, 5].filter(id => Boolean(completed[id])).length;
      const m4Unlocked = Boolean(completed[5]);
      milestone.classList.toggle('is-unlocked', m4Unlocked);
      milestone.textContent = m4Unlocked
        ? '🎁 Unlocked FREE: BMW M4 Competition in your Garage!'
        : `🎁 First 5 Missions Reward: Complete Missions 1–5 to unlock BMW M4 Competition FREE! (${doneFirst5}/5)`;
    }
    const stepY = 82;
    const padTop = 58;
    const padBottom = 64;
    const height = padTop + (missions.length - 1) * stepY + padBottom;
    const width = 460;

    const points = missions.map((m, idx) => {
      const rev = missions.length - 1 - idx;
      const y = padTop + rev * stepY;
      const x = width * 0.5 + Math.sin(idx * 0.85) * 128;
      return { m, x, y };
    });

    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], curr = points[i];
      const midY = (prev.y + curr.y) * 0.5;
      d += ` C ${prev.x.toFixed(1)} ${midY.toFixed(1)}, ${curr.x.toFixed(1)} ${midY.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }

    canvas.replaceChildren();
    const board = document.createElement('div');
    board.className = 'mission-board';
    board.style.height = `${height}px`;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'mission-path-svg');
    svg.setAttribute('preserveAspectRatio', 'none');

    const roadOuter = document.createElementNS(svgNS, 'path');
    roadOuter.setAttribute('d', d);
    roadOuter.setAttribute('class', 'mission-road-outer');

    const roadInner = document.createElementNS(svgNS, 'path');
    roadInner.setAttribute('d', d);
    roadInner.setAttribute('class', 'mission-road-inner');

    const roadCenter = document.createElementNS(svgNS, 'path');
    roadCenter.setAttribute('d', d);
    roadCenter.setAttribute('class', 'mission-road-dashes');

    svg.append(roadOuter, roadInner, roadCenter);
    board.append(svg);

    for (const { m, x, y } of points) {
      const isDone = Boolean(completed[m.id]);
      const isUnlocked = m.id <= unlocked;
      const isCurrent = m.id === unlocked;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = [
        'mission-node',
        `mode-${m.mode}`,
        isDone ? 'is-done' : '',
        isCurrent ? 'is-current' : '',
        !isUnlocked ? 'is-locked' : '',
        m.id === selectedId ? 'is-selected' : '',
      ].filter(Boolean).join(' ');
      node.style.left = `${(x / width) * 100}%`;
      node.style.top = `${y}px`;
      node.setAttribute('aria-label', `Mission ${m.id}: ${m.title} (${m.modeLabel})${!isUnlocked ? ' (Locked)' : isDone ? ' (Completed)' : ''}`);

      const num = document.createElement('span');
      num.className = 'mission-node-num';
      num.textContent = String(m.id);

      const badge = document.createElement('span');
      badge.className = 'mission-node-badge';
      badge.textContent = !isUnlocked ? '🔒' : isDone ? '★' : m.badge;

      const label = document.createElement('span');
      label.className = 'mission-node-label';
      label.textContent = m.id === 5
        ? `🏁 ${m.title} · 🎁 Free BMW M4`
        : m.mode === 'pack' ? `🏁 ${m.title}` : m.title;

      node.append(num, badge, label);
      node.addEventListener('click', () => {
        selectedId = m.id;
        for (const el of board.querySelectorAll('.mission-node')) el.classList.remove('is-selected');
        node.classList.add('is-selected');
        renderBrief();
      });
      board.append(node);
    }

    canvas.append(board);
    renderBrief();

    requestAnimationFrame(() => {
      const target = board.querySelector('.mission-node.is-selected') || board.querySelector('.mission-node.is-current');
      target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }

  briefStart.addEventListener('click', () => {
    const m = missions.find(item => item.id === selectedId);
    if (!m || m.id > Math.max(1, settings.missionUnlocked || 1)) return;
    dialog.close();
    onStartMission(m);
  });
  closeBtn.addEventListener('click', () => dialog.close());

  return {
    open(focusId) {
      selectedId = Math.min(missions.length, Math.max(1, focusId || settings.missionUnlocked || 1));
      renderMap();
      dialog.showModal();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    get isOpen() { return dialog.open; },
  };
}
