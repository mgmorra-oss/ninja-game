// Original procedural music + SFX (WebAudio). Miyako-bushi-style scale on D.
export class Sound {
  constructor(){ this.ctx=null; this.muted=false; this.alert=0; this.step=0; }
  init(){
    if(this.ctx) return;
    const c=this.ctx=new (window.AudioContext||window.webkitAudioContext)();
    this.master=c.createGain(); this.master.gain.value=0.6; this.master.connect(c.destination);
    // generated reverb
    const len=c.sampleRate*2.5, ir=c.createBuffer(2,len,c.sampleRate);
    for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);}
    this.rev=c.createConvolver(); this.rev.buffer=ir; const rg=c.createGain(); rg.gain.value=0.35;
    this.rev.connect(rg); rg.connect(this.master);
    this.noise=c.createBuffer(1,c.sampleRate,c.sampleRate); const nd=this.noise.getChannelData(0); for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
    this.next=c.currentTime+0.1;
    this.timer=setInterval(()=>this.schedule(),50);
  }
  out(node,wet=0.5){ node.connect(this.master); const g=this.ctx.createGain(); g.gain.value=wet; node.connect(g); g.connect(this.rev); }
  setMuted(m){ this.muted=m; if(this.master) this.master.gain.value=m?0:0.6; }
  koto(f,t,v=0.25){ const c=this.ctx, o=c.createOscillator(), o2=c.createOscillator(), g=c.createGain(), lp=c.createBiquadFilter();
    o.type='sawtooth'; o2.type='triangle'; o.frequency.value=f; o2.frequency.value=f*2.003;
    lp.type='lowpass'; lp.frequency.setValueAtTime(f*8,t); lp.frequency.exponentialRampToValueAtTime(f*1.5,t+0.6);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(v,t+0.005); g.gain.exponentialRampToValueAtTime(0.001,t+1.6);
    o.connect(lp); o2.connect(lp); lp.connect(g); this.out(g,0.5); o.start(t); o2.start(t); o.stop(t+1.7); o2.stop(t+1.7); }
  flute(f,t,dur,v=0.12){ const c=this.ctx,o=c.createOscillator(),g=c.createGain(),lfo=c.createOscillator(),lg=c.createGain();
    o.type='sine'; o.frequency.setValueAtTime(f*0.97,t); o.frequency.linearRampToValueAtTime(f,t+0.25);
    lfo.frequency.value=5; lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f*0.012,t+dur*0.6); lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(v,t+0.3); g.gain.setValueAtTime(v,t+dur-0.4); g.gain.linearRampToValueAtTime(0,t+dur);
    const n=c.createBufferSource(); n.buffer=this.noise; n.loop=true; const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=f*2; bp.Q.value=2; const ng=c.createGain();
    ng.gain.setValueAtTime(0,t); ng.gain.linearRampToValueAtTime(v*0.35,t+0.1); ng.gain.linearRampToValueAtTime(v*0.08,t+0.5); ng.gain.linearRampToValueAtTime(0,t+dur);
    n.connect(bp); bp.connect(ng); this.out(ng,0.8); o.connect(g); this.out(g,0.8);
    o.start(t); lfo.start(t); n.start(t); o.stop(t+dur); lfo.stop(t+dur); n.stop(t+dur); }
  taiko(t,v=0.7,f=70){ const c=this.ctx,o=c.createOscillator(),g=c.createGain();
    o.frequency.setValueAtTime(f*1.8,t); o.frequency.exponentialRampToValueAtTime(f,t+0.12);
    g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.7); o.connect(g); this.out(g,0.3); o.start(t); o.stop(t+0.8);
    this.noiseHit(t,v*0.3,0.08,900); }
  noiseHit(t,v,d,freq,type='lowpass'){ const c=this.ctx,n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
    n.buffer=this.noise; f.type=type; f.frequency.value=freq; g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+d);
    n.connect(f); f.connect(g); this.out(g,0.3); n.start(t); n.stop(t+d+0.05); }
  schedule(){
    const c=this.ctx, spb=60/(this.alert?96:66)/2; // eighth notes
    const S=[146.83,155.56,196,220,233.08,293.66,311.13,392,440,466.16,587.33];
    const koto=[5,-1,7,8,-1,9,8,-1, 7,-1,5,6,-1,5,3,-1, 2,-1,3,5,-1,7,-1,5, 4,3,-1,2,0,-1,-1,-1];
    while(this.next<c.currentTime+0.2){
      const s=this.step%64, t=this.next, k=koto[s%32];
      if(k>=0 && (s<32||Math.random()<0.8)) this.koto(S[k]*(s>=32&&k<5?2:1),t,0.18);
      if(s%32===0) this.koto(S[0]/1,t,0.2), this.koto(S[3]/1,t+0.03,0.15);
      if(s===4) this.flute(S[8],t,spb*10); if(s===20) this.flute(S[7],t,spb*6); if(s===28) this.flute(S[9],t,spb*3);
      if(s===36) this.flute(S[10]*0.75,t,spb*12); if(s===52) this.flute(S[8],t,spb*8);
      if(s%16===0) this.taiko(t,0.8); if(s%16===11) this.taiko(t,0.4,90);
      if(this.alert){ if(s%2===0) this.taiko(t,0.35+(s%4===0?0.3:0),s%4?110:65); if(s%4===3) this.noiseHit(t,0.15,0.05,4000,'highpass'); }
      this.next+=spb; this.step++;
    }
  }
  sfx(name){ if(!this.ctx) return; const c=this.ctx,t=c.currentTime;
    const tone=(f1,f2,d,type='square',v=0.15)=>{const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);o.connect(g);this.out(g,0.2);o.start(t);o.stop(t+d);};
    if(name==='jump') tone(300,600,0.15,'triangle',0.12);
    if(name==='grapple'){ this.noiseHit(t,0.3,0.35,2500,'bandpass'); tone(900,300,0.3,'sawtooth',0.05); }
    if(name==='thunk') this.noiseHit(t,0.4,0.1,600);
    if(name==='takedown'){ this.noiseHit(t,0.6,0.15,1500); tone(500,80,0.4,'square',0.1); }
    if(name==='huh') tone(400,700,0.25,'triangle',0.15);
    if(name==='alert'){ tone(800,1200,0.12,'square',0.15); setTimeout(()=>this.taiko(c.currentTime,0.9),90); }
    if(name==='hurt') tone(300,100,0.3,'sawtooth',0.2);
    if(name==='scroll'){ [587,698,880,1175].forEach((f,i)=>this.koto(f,t+i*0.09,0.3)); }
    if(name==='win'){ [293,392,440,587,880].forEach((f,i)=>this.koto(f,t+i*0.12,0.3)); this.taiko(t+0.7,1); }
  }
}
