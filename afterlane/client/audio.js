import { hasAsset } from './model-cache.js';

const harmonics = {
  electric:{wave:[0,1,.09,.025],pitch:1,bass:0,cutoff:1},
  inline:{wave:[0,1,.42,.23,.12,.09,.07],pitch:1,bass:.24,cutoff:.93},
  flat:{wave:[0,.86,1,.42,.20,.23,.10],pitch:1,bass:.13,cutoff:1.72},
  diesel:{wave:[0,.81,1,.23,.54,.16,.35],pitch:.81,bass:.58,cutoff:.62},
  crossplane:{wave:[0,1,.17,.57,.16,.35,.12],pitch:.5,bass:.49,cutoff:.79},
  flatplane:{wave:[0,.74,1,.12,.43,.23,.34],pitch:1,bass:.13,cutoff:1.38}
};

export function exhaustUnderLoad(engine,rpm,load,acceleration) {
  return engine.pop && rpm >= engine.redline*.68 && load >= .90 && acceleration > 1.1;
}

export function drivingAudio() {
  let context, engine, resonance, sub, motorFilter, engineGain, rainGain, filter, master, popBuffer;
  let tone = '', nextPop = 0, lastHeavy = -Infinity, previousGear = 0, previousLoad = 0, drivingCar = '';
  let waves;
  let currentCar='', runningSamples=[], audition=null;
  const recordings=new Map();
  function wake() {
    if (!window.AudioContext) return;
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = .35;
      master.connect(context.destination);
      engine = context.createOscillator();
      resonance = context.createOscillator();
      resonance.type = 'sine';
      sub = context.createGain();
      sub.gain.value = .28;
      motorFilter = context.createBiquadFilter();
      motorFilter.type = 'lowpass';
      motorFilter.Q.value = .57;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engine.connect(motorFilter).connect(engineGain).connect(master);
      resonance.connect(sub).connect(motorFilter);
      engine.start();
      resonance.start();
      waves = Object.fromEntries(Object.entries(harmonics).map(([name,{wave:series}])=>[
        name,context.createPeriodicWave(new Float32Array(series.length),new Float32Array(series))
      ]));
      const buffer = context.createBuffer(1,context.sampleRate*2,context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i=0;i<samples.length;i++) samples[i] = Math.random()*2-1;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      rainGain = context.createGain();
      rainGain.gain.value = 0;
      noise.connect(filter).connect(rainGain).connect(master);
      noise.start();
      popBuffer = context.createBuffer(1,Math.ceil(context.sampleRate*.23),context.sampleRate);
      const pulse = popBuffer.getChannelData(0);
      for (let i=0;i<pulse.length;i++) {
        const t=i/context.sampleRate;
        const crack = (Math.random()*2-1)*Math.exp(-t*92)*.75;
        const thump = Math.sin(2*Math.PI*(122*t-123*t*t))*Math.exp(-t*32)*.43;
        pulse[i] = Math.min(1,t*1500)*(crack+thump);
      }
    }
    context.resume().catch(() => {});
  }

  async function readClip(id,layer) {
    try {
      const path = '/audio/'+id+'-'+layer+'.wav';
      if (!await hasAsset(path)) return null;
      const response=await fetch(path);
      if (!response.ok) return null;
      const data=await context.decodeAudioData(await response.arrayBuffer());
      return data.duration>=.25 ? data : null;
    } catch { return null; }
  }

  function useRecordings(vehicle) {
    const {asset,engine:profile}=vehicle;
    if (currentCar===asset) return;
    currentCar=asset;
    for (const clip of runningSamples) {
      clip.source.stop();
      clip.source.disconnect();
      clip.volume.disconnect();
    }
    runningSamples=[];
    if (vehicle.electric) return;
    if (!recordings.has(asset)) recordings.set(asset,Promise.all(['idle','load'].map(layer=>readClip(asset,layer))));
    recordings.get(asset).then(buffers=>{
      if (currentCar!==asset || runningSamples.length) return;
      runningSamples=buffers.flatMap((buffer,index)=>{
        if (!buffer) return [];
        const source=context.createBufferSource();
        const volume=context.createGain();
        volume.gain.value=0;
        source.buffer=buffer;
        source.loop=true;
        source.connect(volume).connect(master);
        source.start();
        return [{source,volume,index,reference:index ? profile.redline*.60 : profile.tone==='diesel' ? 750 : 850}];
      });
    });
  }

  function tick(frequency,volume,duration,type='sine') {
    if (!context || context.state !== 'running') return;
    const time = context.currentTime;
    const voice = context.createOscillator(), gain = context.createGain();
    voice.type = type;
    voice.frequency.setValueAtTime(frequency,time);
    voice.frequency.exponentialRampToValueAtTime(frequency*.6,time+duration);
    gain.gain.setValueAtTime(volume,time);
    gain.gain.exponentialRampToValueAtTime(.001,time+duration);
    voice.connect(gain).connect(master);
    voice.start(time);
    voice.stop(time+duration);
  }

  function pop(profile,strength,time) {
    const blast = context.createBufferSource();
    const shape = context.createBiquadFilter();
    const volume = context.createGain();
    blast.buffer = popBuffer;
    blast.playbackRate.value = (profile.tone === 'crossplane' ? .79 : profile.tone === 'flat' ? 1.10 : 1.02)*(.94+Math.random()*.12);
    shape.type = 'lowpass';
    shape.frequency.value = profile.tone === 'crossplane' ? 1420 : 2450;
    volume.gain.value = strength;
    blast.connect(shape).connect(volume).connect(master);
    blast.start(time);
  }

  return {
    wake,tick,
    preview(vehicle) {
      wake();
      if (context) audition={vehicle,time:context.currentTime};
    },
    stopPreview() { audition=null; },
    update(active,rpm,wet,speed,muted,vehicle,load,acceleration,gear) {
      if (!context) return;
      const time = context.currentTime;
      if (audition) {
        const elapsed=time-audition.time;
        if (elapsed>=4.3) audition=null;
        else {
          vehicle=audition.vehicle;
          const swell=Math.sin(Math.PI*Math.min(1,Math.max(0,(elapsed-.32)/3.6)))**1.8;
          rpm=850+(vehicle.engine.redline*.87-850)*swell;
          load=.87*swell;
          acceleration=0;
          active=true;
          wet=speed=0;
        }
      }
      const profile=vehicle.engine, character=harmonics[profile.tone];
      if (active) useRecordings(vehicle);
      if (tone !== profile.tone) {
        tone = profile.tone;
        engine.setPeriodicWave(waves[tone]);
      }
      const firing = vehicle.electric ? 115+speed*6+load*175 : rpm*profile.cylinders/120*character.pitch;
      master.gain.setTargetAtTime(muted ? 0 : .35,time,.09);
      engine.frequency.setTargetAtTime(firing,time,.065);
      resonance.frequency.setTargetAtTime(firing*.5,time,.075);
      sub.gain.setTargetAtTime(character.bass,time,.10);
      motorFilter.frequency.setTargetAtTime((320+rpm*.132+load*825)*character.cutoff,time,.08);
      const volume=active ? (vehicle.electric ? Math.min(.055,load*.035+speed*.0003) : .11+load*.23+speed*.0009) : 0;
      const revBlend=Math.min(1,Math.max(0,(rpm/profile.redline-.19)*2.7));
      let blend=0;
      for (const clip of runningSamples) {
        const mix=clip.index ? revBlend : 1-revBlend;
        blend+=mix;
        clip.source.playbackRate.setTargetAtTime(Math.max(.53,Math.min(2.65,rpm/clip.reference)),time,.065);
        clip.volume.gain.setTargetAtTime(volume*mix*1.16,time,.095);
      }
      engineGain.gain.setTargetAtTime(volume*(1-blend*.94),time,.14);
      filter.frequency.setTargetAtTime(340+speed*26,time,.12);
      rainGain.gain.setTargetAtTime(active ? wet*.36 : 0,time,.2);
      if (!active || audition || drivingCar!==vehicle.asset) {
        lastHeavy=-Infinity;
        previousGear=gear;
        previousLoad=load;
        drivingCar=vehicle.asset;
      }
      if (active && !audition && load>.8 && rpm>profile.redline*.65) lastHeavy=time;
      const upshift = previousGear>0 && gear>previousGear;
      const lift = previousLoad>.35 && load<.25;
      const afterfire = time-lastHeavy<.58 && (upshift||lift);
      const underLoad = exhaustUnderLoad(profile,rpm,load,acceleration) && rpm>profile.redline*.88;
      if (active && !audition && !muted && profile.pop && time>=nextPop && (afterfire||underLoad)) {
        pop(profile,afterfire ? .79 : .44,time);
        if (afterfire && profile.tone!=='crossplane') pop(profile,.28,time+.073);
        nextPop=time+(afterfire ? .42 : 1.1);
      }
      previousGear=gear;
      previousLoad=load;
    }
  };
}
