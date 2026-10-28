// Moonlit Shadow — original procedural score (Web Audio). No samples, no borrowed melodies.
// Instruments: breathy bamboo flute (shakuhachi-style), Karplus-Strong koto, taiko, rin bells, wind, sho-like drone.
// Scale: in / miyako-bushi on D (D Eb G A Bb). Moods crossfade: explore, hidden, tense, alert.
const SC=[]; {const base=[0,1,5,7,8]; for(let o=-1;o<3;o++) base.forEach(s=>SC.push(146.83*Math.pow(2,(s+12*o)/12)));}
// index: 0..4 = D2.., 5..9 = D3 Eb3 G3 A3 Bb3, 10..14 = D4 Eb4 G4 A4 Bb4, 15..19 = D5 Eb5 G5 A5 Bb5
const N=i=>SC[Math.max(0,Math.min(SC.length-1,i))];
// original flute motifs: [scale index, beats] (null = rest)
const MOTIFS=[
 [[13,2],[14,.5],[13,1.5],[12,3],[null,1],[10,4],[null,2]],
 [[15,3],[14,1],[13,1],[12,1],[13,4],[null,2]],
 [[10,1],[12,1],[13,2],[15,4],[14,1],[13,3],[null,2]],
 [[16,1],[15,2],[13,1],[12,2],[11,.5],[10,5.5],[null,3]],
 [[12,2],[13,2],[11,1],[10,6],[null,2]],
 [[17,2],[16,1],[15,3],[13,1.5],[14,.5],[13,4],[null,3]],
];
const MIX={ // flute, koto, taiko, bell, wind, drone
 explore:[1,.8,.25,.8,.45,.5], hidden:[.7,.5,0,1.2,1,1], tense:[.55,1,.8,.4,.5,.6], alert:[.75,1.1,1.25,.3,.35,.4], title:[1,.8,.2,.9,.5,.5]};
const BPM={explore:60,hidden:52,tense:84,alert:118,title:60};
export class Sound {
  constructor(){ this.ctx=null; this.muted=false; this.alert=0; this.mood='explore'; this.vol=0.55; this.step=0; this._mood=null; this.ksCache=new Map(); this.rng=1234; }
  r(){ this.rng=(this.rng*16807)%2147483647; return (this.rng-1)/2147483646; }
  init(ctx){
    if(this.ctx) return;
    const c=this.ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();
    this.offline=!!ctx;
    const comp=c.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=3; comp.connect(c.destination);
    this.master=c.createGain(); this.master.gain.value=this.muted?0:this.vol; this.master.connect(comp);
    // temple-hall convolution reverb: generated impulse with early reflections + dark exponential tail
    const sr=c.sampleRate,len=Math.floor(sr*4.8),ir=c.createBuffer(2,len,sr);
    for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);let lp=0;
      for(let i=0;i<len;i++){const t=i/sr;const n=Math.random()*2-1;lp+= (n-lp)*(0.08+0.5*Math.exp(-t*1.2));d[i]=lp*Math.exp(-t*1.25)*(t<0.012?0:1);}
      [0.019,0.031,0.047,0.061,0.083,0.11].forEach((e,k)=>{const i=Math.floor((e+ch*0.003)*sr);d[i]+=(k%2?-1:1)*0.6*Math.exp(-e*8);});}
    this.rev=c.createConvolver(); this.rev.buffer=ir; this.revG=c.createGain(); this.revG.gain.value=0.55; this.rev.connect(this.revG); this.revG.connect(this.master);
    this.noise=c.createBuffer(1,sr*2,sr); const nd=this.noise.getChannelData(0); for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
    // layer buses
    this.bus={}; ['flute','koto','taiko','bell','wind','drone','sfx'].forEach(k=>{const g=c.createGain();g.gain.value=k==='sfx'?1:0;this.bus[k]=g;g.connect(this.master);const w=c.createGain();w.gain.value=k==='taiko'?0.25:k==='sfx'?0.2:0.65;g.connect(w);w.connect(this.rev);});
    this.startWind(); this.startDrone();
    this.next=c.currentTime+0.15; this.fluteT=c.currentTime+1.5; this.motif=0; this.note=0;
    this.applyMood(c.currentTime,true);
    if(!this.offline) this.timer=setInterval(()=>this.schedule(),40);
  }
  setMuted(m){ this.muted=m; if(this.master) this.master.gain.setTargetAtTime(m?0:this.vol,this.ctx.currentTime,0.05); }
  applyMood(t,now){ const m=MIX[this.mood]||MIX.explore; ['flute','koto','taiko','bell','wind','drone'].forEach((k,i)=>{const g=this.bus[k].gain; if(now) g.setValueAtTime(m[i],t); else g.setTargetAtTime(m[i],t,1.4);});
    if(this.droneG) this.droneG.gain.setTargetAtTime(this.mood==='hidden'?0.07:this.mood==='alert'?0.02:0.045,t,2); this._mood=this.mood; }
  // ---- instruments ----
  shakuhachi(f,t,dur,v=0.16,o={}){ const c=this.ctx,out=this.bus.flute;
    const env=c.createGain(); env.gain.setValueAtTime(0,t);
    const atk=Math.min(0.35,dur*0.3); env.gain.linearRampToValueAtTime(v*0.55,t+atk*0.4); env.gain.linearRampToValueAtTime(v,t+atk+dur*0.25); // mura-iki swell
    env.gain.linearRampToValueAtTime(v*0.75,t+dur*0.8); env.gain.linearRampToValueAtTime(0,t+dur+0.12);
    const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.setValueAtTime(f*2.2,t); lp.frequency.linearRampToValueAtTime(f*4.5,t+atk+dur*0.3); lp.frequency.linearRampToValueAtTime(f*2.5,t+dur); lp.Q.value=0.7;
    const o1=c.createOscillator(),o2=c.createOscillator(),g2=c.createGain(); o1.type='sine'; o2.type='triangle'; g2.gain.value=0.35;
    // meri/kari: start flat and slide up; optional fall at the end
    const st=f*(o.meri??0.94); [o1,o2].forEach(osc=>{const p=osc.frequency; p.setValueAtTime(st,t); p.exponentialRampToValueAtTime(f,t+(o.slide??0.22));
      if(o.fall){p.setValueAtTime(f,t+dur*0.8);p.exponentialRampToValueAtTime(f*0.9,t+dur+0.1);} });
    const lfo=c.createOscillator(),lg=c.createGain(); lfo.frequency.value=4.6+this.r()*0.8; lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(0,t+dur*0.35); lg.gain.linearRampToValueAtTime(f*0.018,t+dur*0.9);
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const tremG=c.createGain(); tremG.gain.value=1; const tl=c.createGain(); tl.gain.value=0.12; lfo.connect(tl); tl.connect(tremG.gain);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(tremG); tremG.connect(env); env.connect(out);
    // breath: band noise around the pitch + airy hiss, with a chiff at the attack
    const n=c.createBufferSource(); n.buffer=this.noise; n.loop=true; n.loopStart=this.r(); const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=f; bp.Q.value=6;
    const hp=c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=2500; const ng=c.createGain(),hg=c.createGain();
    ng.gain.setValueAtTime(0,t); ng.gain.linearRampToValueAtTime(v*1.4,t+0.06); ng.gain.linearRampToValueAtTime(v*0.45,t+0.4); ng.gain.linearRampToValueAtTime(v*0.6,t+dur*0.5); ng.gain.linearRampToValueAtTime(0,t+dur+0.1);
    hg.gain.setValueAtTime(0,t); hg.gain.linearRampToValueAtTime(v*0.25,t+0.05); hg.gain.linearRampToValueAtTime(v*0.06,t+0.3); hg.gain.linearRampToValueAtTime(v*0.1,t+dur); hg.gain.linearRampToValueAtTime(0,t+dur+0.15);
    n.connect(bp); bp.connect(ng); ng.connect(out); n.connect(hp); hp.connect(hg); hg.connect(out);
    const end=t+dur+0.3; [o1,o2,lfo,n].forEach(s=>{s.start(t);s.stop(end);});
  }
  grace(f,t,v){ this.shakuhachi(f,t,0.09,v*0.7,{meri:1,slide:0.01}); }
  ksBuffer(f,bright=0.5,len=3){ const key=f.toFixed(2)+'_'+bright; if(this.ksCache.has(key)) return this.ksCache.get(key);
    const c=this.ctx,sr=c.sampleRate,n=Math.floor(sr*len),b=c.createBuffer(1,n,sr),d=b.getChannelData(0);
    const P=Math.max(2,Math.round(sr/f)),buf=new Float32Array(P); for(let i=0;i<P;i++){buf[i]=(Math.random()*2-1)*(1-bright*0.5)+(i<P*0.3?bright:0)*(Math.random()*2-1);}
    let idx=0,prev=0;const damp=0.996+0.0035*(1-Math.min(1,f/900));
    for(let i=0;i<n;i++){const cur=buf[idx];const nx=buf[(idx+1)%P];const val=(cur+nx)*0.5*damp;buf[idx]=val;d[i]=cur;idx=(idx+1)%P;}
    // pluck body: quick high-frequency emphasis at start
    for(let i=0;i<Math.min(n,400);i++)d[i]*=1+(1-i/400)*0.8;
    this.ksCache.set(key,b); return b; }
  koto(f,t,v=0.3,o={}){ const c=this.ctx,s=c.createBufferSource(); s.buffer=this.ksBuffer(f,o.bright??0.5); const g=c.createGain(); g.gain.value=v;
    if(o.bend){ s.playbackRate.setValueAtTime(1,t); s.playbackRate.setValueAtTime(1,t+o.bend); s.playbackRate.linearRampToValueAtTime(1.0595,t+o.bend+0.15); } // oshide press
    const pan=c.createStereoPanner?c.createStereoPanner():null; s.connect(g); if(pan){pan.pan.value=o.pan??((this.r()-0.5)*0.6);g.connect(pan);pan.connect(o.bus||this.bus.koto);}else g.connect(o.bus||this.bus.koto);
    s.start(t); s.stop(t+3); }
  taiko(t,v=0.7,f=62,bus){ const c=this.ctx,o=c.createOscillator(),g=c.createGain(); bus=bus||this.bus.taiko;
    o.frequency.setValueAtTime(f*2.2,t); o.frequency.exponentialRampToValueAtTime(f,t+0.09);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+0.006); g.gain.exponentialRampToValueAtTime(0.001,t+1.1); o.connect(g); g.connect(bus); o.start(t); o.stop(t+1.2);
    this.noiseHit(t,v*0.25,0.07,700,'lowpass',bus); }
  ka(t,v=0.2){ this.noiseHit(t,v,0.045,3200,'bandpass',this.bus.taiko); }
  noiseHit(t,v,d,freq,type='lowpass',bus){ const c=this.ctx,n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
    n.buffer=this.noise; n.loopStart=0; f.type=type; f.frequency.value=freq; g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+d);
    n.connect(f); f.connect(g); g.connect(bus||this.bus.sfx); n.start(t,this.r()); n.stop(t+d+0.05); }
  rin(f,t,v=0.12,bus){ const c=this.ctx;bus=bus||this.bus.bell; [[1,1,7],[2.74,0.5,4.5],[5.36,0.25,2.5],[8.9,0.12,1.4]].forEach(([m,a,d],k)=>{
      [0,1].forEach(j=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=f*m*(1+(j?0.0019:0)*(k+1));g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v*a*0.5,t+0.004);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
        o.connect(g);g.connect(bus);o.start(t);o.stop(t+d+0.05);});}); }
  startWind(){ const c=this.ctx,n=c.createBufferSource(); n.buffer=this.noise; n.loop=true; const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=500; bp.Q.value=0.8;
    const lfo=c.createOscillator(),lg=c.createGain(); lfo.frequency.value=0.07; lg.gain.value=320; lfo.connect(lg); lg.connect(bp.frequency);
    const g=c.createGain(); g.gain.value=0.05; const lfo2=c.createOscillator(),l2=c.createGain(); lfo2.frequency.value=0.11; l2.gain.value=0.03; lfo2.connect(l2); l2.connect(g.gain);
    n.connect(bp); bp.connect(g); g.connect(this.bus.wind); n.start(); lfo.start(); lfo2.start(); }
  startDrone(){ const c=this.ctx; this.droneG=c.createGain(); this.droneG.gain.value=0.045; const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900;
    [N(5),N(8),N(10),N(13)*1.0].forEach((f,i)=>{const o=c.createOscillator();o.type=i<2?'sine':'triangle';o.frequency.value=f*(1+(i%2?0.002:-0.0015));const g=c.createGain();g.gain.value=i<2?0.5:0.18;
      const l=c.createOscillator(),lg=c.createGain();l.frequency.value=0.05+i*0.03;lg.gain.value=g.gain.value*0.5;l.connect(lg);lg.connect(g.gain);o.connect(g);g.connect(lp);o.start();l.start();});
    lp.connect(this.droneG); this.droneG.connect(this.bus.drone); }
  // ---- sequencer ----
  schedule(until){ const c=this.ctx; until=until??c.currentTime+0.25;
    const mood=this.alert?'alert':this.mood; if(mood!==this._mood){const m0=this.mood;this.mood=mood;this.applyMood(c.currentTime,false);this.mood=m0;this._mood=mood;}
    while(this.next<until){ const t=this.next, spb=60/BPM[mood]/2, s=this.step%32, bar=Math.floor(this.step/8);
      if(mood==='explore'||mood==='title'){ const pat=[5,null,7,8,null,10,null,null]; const k=pat[s%8]; if(k!=null&&this.r()<0.85) this.koto(N(k+(bar%4===3&&s%8===5?2:0)),t,0.28,{bend:this.r()<0.12?0.25:0});
        if(s===0) {this.koto(N(0),t,0.35);this.koto(N(3),t+0.04,0.22);}
        if(s===0&&bar%4===0) this.rin(N(15),t+0.5,0.1); if(s%32===16&&this.r()<0.4) this.rin(N(18),t,0.05);
        if(s%16===0) {this.taiko(t,0.35,55);this.taiko(t+spb*0.7,0.2,55);} }
      else if(mood==='hidden'){ if(s%8===0&&this.r()<0.6) this.koto(N([5,7,8,10][Math.floor(this.r()*4)]),t,0.18,{bright:0.2});
        if(s===0&&bar%2===0) this.rin(N(this.r()<0.5?15:17),t,0.09); }
      else if(mood==='tense'){ const pat=[5,6,5,3,5,6,7,6]; this.koto(N(pat[s%8]),t,s%2?0.17:0.26,{bright:0.7});
        if(s%8===0){this.taiko(t,0.55,58);this.taiko(t+spb*0.75,0.32,58);} if(s%8===4) this.ka(t,0.08); if(s===0) this.koto(N(1),t,0.3); }
      else { // alert: driving taiko + koto ostinato
        const pat=[5,6,8,6,5,6,9,8]; this.koto(N(pat[s%8]+(bar%2?5:0)),t,0.27,{bright:0.9}); if(s%4===0) this.koto(N(0),t,0.3,{bright:0.8});
        if(s%2===0) this.taiko(t,s%8===0?1:0.55,s%4===0?52:70); else if(this.r()<0.5) this.taiko(t,0.3,90);
        if(s%4===3) this.ka(t,0.22); if(s===0&&bar%2===0) this.rin(N(16),t,0.06); }
      this.next+=spb; this.step++; }
    // flute line runs on its own clock so phrases breathe across mood changes
    while(this.fluteT<until){ const beat=60/BPM[mood]; const M=MOTIFS[this.motif%MOTIFS.length]; const [idx,b]=M[this.note]; let dur=b*beat*(mood==='alert'?0.8:1);
      const sparse=mood==='hidden'?0.45:1;
      if(idx!=null&&this.r()<sparse){ const shift=mood==='alert'?2:(mood==='hidden'?-5:0); const f=N(idx+shift);
        if(b>=1&&this.r()<0.35) this.grace(N(idx+shift+1),this.fluteT-0.08,0.13);
        this.shakuhachi(f,this.fluteT,Math.max(0.25,dur-0.05),mood==='alert'?0.13:0.16,{fall:b>=3&&this.r()<0.4,meri:this.r()<0.3?0.89:0.95,slide:b>=2?0.35:0.15});
      }
      this.fluteT+=dur; this.note++; if(this.note>=M.length){this.note=0;this.motif+=1+(this.r()<0.3?1:0);this.fluteT+=beat*(mood==='hidden'?4:1);} }
  }
  sfx(name){ if(!this.ctx) return; const c=this.ctx,t=c.currentTime,B=this.bus.sfx;
    const tone=(f1,f2,d,type='square',v=0.15)=>{const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);o.connect(g);g.connect(B);o.start(t);o.stop(t+d);};
    if(name==='jump') this.noiseHit(t,0.12,0.12,1800,'bandpass');
    if(name==='grapple'){ this.noiseHit(t,0.3,0.35,2500,'bandpass'); tone(900,300,0.3,'sawtooth',0.04); }
    if(name==='thunk') this.noiseHit(t,0.4,0.1,600);
    if(name==='takedown'){ this.noiseHit(t,0.5,0.15,1500); this.taiko(t,0.6,48,B); }
    if(name==='huh') this.koto(N(11),t,0.35,{bus:B,bend:0.05});
    if(name==='alert'){ this.taiko(t,1,45,B); this.ka(t+0.09,0.3); this.koto(N(10),t,0.4,{bus:B,bright:1}); this.koto(N(11),t+0.02,0.4,{bus:B,bright:1}); }
    if(name==='hurt') { tone(300,100,0.3,'sawtooth',0.12); this.taiko(t,0.7,50,B); }
    if(name==='scroll'){ [10,12,13,15,17].forEach((k,i)=>this.koto(N(k),t+i*0.09,0.35,{bus:B})); this.rin(N(15),t+0.45,0.15,B); }
    if(name==='win'){ [10,12,13,15].forEach((k,i)=>this.koto(N(k),t+i*0.12,0.35,{bus:B})); this.shakuhachi(N(15),t+0.5,2.4,0.18); this.rin(N(10),t+0.5,0.2,B); this.taiko(t+0.5,0.9,50,B); }
    if(name==='crow'){ [0,0.22].forEach(d=>{const o=c.createOscillator(),bp=c.createBiquadFilter(),g=c.createGain();o.type='sawtooth';o.frequency.setValueAtTime(720,t+d);o.frequency.exponentialRampToValueAtTime(430,t+d+0.18);bp.type='bandpass';bp.frequency.value=1400;bp.Q.value=3;g.gain.setValueAtTime(0.0001,t+d);g.gain.exponentialRampToValueAtTime(0.12,t+d+0.02);g.gain.exponentialRampToValueAtTime(0.001,t+d+0.2);o.connect(bp);bp.connect(g);g.connect(B);o.start(t+d);o.stop(t+d+0.25);}); this.noiseHit(t,0.15,0.4,900,'bandpass'); }
    if(name==='caught'){ this.taiko(t,1,40,B); this.shakuhachi(N(13),t+0.2,2.2,0.16,{fall:true}); }
  }
}
