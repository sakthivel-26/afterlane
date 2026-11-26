import * as T from 'three';
import { roadX, roadPosition } from './road-layout.js';
import { playerTurn } from './collision.js';
import { trafficVehicle, vehicleBody } from './traffic.js';
import { trafficSpecs, vehicles } from './vehicle-specs.js';
import { newRouteProgress } from './route.js';

const waitingRoute = newRouteProgress();

export function connectRooms(scene, settings, hooks) {
  const socket = window.io({autoConnect:false});
  const panel = document.querySelector('#panel');
  const content = document.querySelector('#panel-content');
  const title = document.querySelector('#panel-title');
  const hud = document.querySelector('#room-score');
  const remote = new Map();
  const npcs = new Map();
  let state = null, roomCode = '', clockOffset = 0, begun = false, finished = false, lastSent = -Infinity;
  let respawnUntil = 0, selectedVehicle = 0;
  const make = (tag,text,properties) => Object.assign(document.createElement(tag),{textContent:text},properties);
  const button = (label,action) => {
    const element = make('button',label,{type:'button'});
    element.addEventListener('click',action);
    return element;
  };
  const clear = () => {
    state = null;
    roomCode = '';
    begun = finished = false;
    respawnUntil = 0;
    for (const vehicle of [...remote.values(),...npcs.values()]) remove(vehicle);
    remote.clear();
    npcs.clear();
    hud.hidden = true;
  };
  function joinScreen() {
    title.textContent = 'Multiplayer';
    const name = make('input','',{placeholder:'Driver name',maxLength:20});
    const code = make('input','',{placeholder:'Room code',maxLength:6});
    const color = make('input','',{type:'color',value:vehicles[settings.selected].color});
    const mode = make('select','');
    mode.append(make('option','Distance Race · 5 km',{value:'distance'}),make('option','Score Attack · 3 minutes',{value:'score'}));
    const status = make('p','',{className:'wallet'});
    function join(requestedCode) {
      selectedVehicle = settings.selected;
      status.textContent = 'Connecting…';
      if (!socket.connected) socket.connect();
      socket.timeout(5000).emit('join-room',{name:name.value,code:requestedCode,mode:mode.value,color:color.value,vehicle:settings.selected},(error,result) => {
        if (error || result?.error) {
          status.textContent = result?.error || 'Could not connect. Try again.';
          return;
        }
        roomCode = result.code;
        roomScreen();
      });
    }
    const label = (text,input) => {
      const row = make('label',text,{className:'setting'});
      row.append(input);
      return row;
    };
    const actions = make('div','',{className:'room-actions'});
    actions.append(button('Create room',()=>join('')),button('Join room',()=> {
      if (code.value.trim()) join(code.value);
      else status.textContent = 'Enter a room code.';
    }));
    content.replaceChildren(label('Driver name',name),label('Paint',color),label('New room mode',mode),label('Join code',code),actions,status);
  }
  function roomScreen() {
    title.textContent = 'Room '+roomCode;
    const actions = make('div','',{className:'room-actions'});
    if (state?.host === socket.id && !state.started) actions.append(button('Start race',()=>socket.emit('start-room')));
    actions.append(button('Leave room',() => {
      socket.emit('leave-room');
      clear();
      hooks.leave();
      joinScreen();
    }));
    content.replaceChildren(make('p',state?.mode || 'Connecting…'),actions);
  }
  document.querySelector('#multiplayer').addEventListener('click',()=>{
    panel.dataset.section = 'multiplayer';
    hooks.pause();
    if (roomCode) roomScreen(); else joinScreen();
    panel.showModal();
  });
  socket.on('room-state', snapshot => {
    if (snapshot.code !== roomCode) return;
    const previousHost = state?.host;
    state = snapshot;
    clockOffset = Date.now()-state.now;
    if (panel.open && title.textContent === 'Room '+roomCode && previousHost !== state.host) roomScreen();
    const header = state.winner ? 'Winner · '+(state.players.find(p=>p.id===state.winner)?.name || 'Driver') :
      !state.started ? 'Room '+roomCode+' · Waiting for host' : state.now < state.started ?
        'Starting in '+Math.ceil((state.started-state.now)/1000) :
        state.mode === 'Score Attack' ? Math.max(0,Math.ceil(180-state.elapsed))+' s remaining' : 'Distance Race · 5 km';
    hud.replaceChildren(make('strong',header),...state.players.map(p=>make('div',p.name+' · '+Math.max(0,Math.floor(p.distance))+' m · '+p.score+' pts')));
    hud.hidden = false;
    if (!begun && state.started && state.now >= state.started) {
      begun = true;
      if (panel.open) panel.close();
      hooks.start();
    }
    if (!finished && state.winner) {
      finished = true;
      hooks.finish(header);
    }
  });
  socket.on('correct-drive',hooks.correct);
  socket.on('room-crash',position => {
    respawnUntil = position.until;
    hooks.correct(position);
  });
  socket.on('disconnect',() => {
    if (!roomCode) return;
    clear();
    hooks.leave();
  });
  function remove(car) {
    scene.remove(car.body);
    const geometries = new Set();
    car.body.traverse(node=>{
      if (node.isMesh && !node.userData.sharedVehicleGeometry) geometries.add(node.geometry);
    });
    for (const geometry of geometries) geometry.dispose();
    car.body.userData.paint.dispose();
    car.body.userData.tailLight.dispose();
  }
  function sync(map, entries, distance, dt, create) {
    const ids = new Set(entries.map(entry=>entry.id));
    for (const [id,car] of map) if (!ids.has(id)) { remove(car); map.delete(id); }
    for (const entry of entries) {
      const station = entry.station ?? entry.distance;
      const offset = entry.offset ?? entry.x;
      if (!map.has(entry.id)) map.set(entry.id,{...create(entry),station,offset});
      const car = map.get(entry.id);
      const previousStation = car.station, previousOffset = car.offset;
      car.station = T.MathUtils.damp(car.station,station,13,dt);
      car.offset = T.MathUtils.damp(car.offset,offset,13,dt);
      car.headlights = entry.headlights !== false;
      const position = roadPosition(car.station,car.offset);
      car.body.position.set(position.x-roadX(distance),0,position.z+distance);
      const travel = car.station-previousStation;
      const steer = entry.steering ?? T.MathUtils.clamp((car.offset-previousOffset)*3/Math.max(.05,Math.abs(travel)),-1,1);
      car.body.rotation.y = position.heading+(entry.turn ?? playerTurn(steer,entry.speed));
      car.updateModel?.(Math.abs(car.station-distance));
      car.flashSignal?.(entry.signal,entry.signalAge ?? 0);
      car.animateWheels(Math.abs(travel)<4 ? travel : 0,steer);
    }
  }
  return {
    get active() { return Boolean(roomCode); },
    get canDrive() { return begun && !finished && Date.now()-clockOffset >= respawnUntil; },
    leave() {
      if (!roomCode) return;
      socket.emit('leave-room');
      clear();
      hooks.leave();
    },
    get elapsed() { return state?.elapsed ?? 0; },
    get route() { return state?.route ?? waitingRoute; },
    get score() { return state?.players.find(player => player.id === socket.id)?.score || 0; },
    get vehicle() { return selectedVehicle; },
    send(now,drive) {
      if (!this.canDrive || now-lastSent < 50) return;
      lastSent = now;
      socket.volatile.emit('drive',drive);
    },
    render(distance,dt) {
      if (!state) return;
      sync(remote,state.players.filter(p=>p.id!==socket.id),distance,dt,p=>{
        const vehicle = vehicles[p.vehicle] ?? vehicles[0];
        return vehicleBody(scene,vehicle.type,p.color,vehicle.style);
      });
      sync(npcs,state.npcs,distance,dt,p=>trafficVehicle(scene,...trafficSpecs[p.type]));
    },
    visitVisible(visit) {
      for (const car of remote.values()) visit(car);
      for (const car of npcs.values()) visit(car);
    }
  };
}
