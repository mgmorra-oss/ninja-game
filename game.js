import * as THREE from 'three';
import { Sound } from './audio.js';
const $=id=>document.getElementById(id);
const snd=new Sound();
let seed=7; const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};

// ---------- renderer / scene ----------
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true; document.body.prepend(renderer.domElement);
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x0b1026); scene.fog=new THREE.FogExp2(0x101a33,0.022);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,0.1,400);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
scene.add(new THREE.HemisphereLight(0x5566aa,0x111122,0.9));
const moon=new THREE.DirectionalLight(0xaabbff,1.1); moon.position.set(-40,60,-30); moon.castShadow=true;
moon.shadow.mapSize.set(2048,2048); Object.assign(moon.shadow.camera,{left:-80,right:80,top:80,bottom:-80,far:200}); moon.shadow.camera.updateProjectionMatrix();
moon.target.position.set(0,0,-50); scene.add(moon,moon.target);
const moonBall=new THREE.Mesh(new THREE.SphereGeometry(8,24,16),new THREE.MeshBasicMaterial({color:0xfff6d8,fog:false}));
moonBall.position.set(-90,110,-220); scene.add(moonBall);
// stars
{const g=new THREE.BufferGeometry(),p=[];for(let i=0;i<600;i++){const a=rnd()*6.28,b=rnd()*1.2+0.15,r=300;p.push(Math.cos(a)*Math.cos(b)*r,Math.sin(b)*r,Math.sin(a)*Math.cos(b)*r);}
g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:1.2,fog:false})));}

const M=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:0.85,...o});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,260),M(0x2a2a33)); ground.rotation.x=-Math.PI/2; ground.position.z=-50; ground.receiveShadow=true; scene.add(ground);
const street=new THREE.Mesh(new THREE.PlaneGeometry(8,140),M(0x45403a)); street.rotation.x=-Math.PI/2; street.position.set(0,0.01,-50); street.receiveShadow=true; scene.add(street);

// ---------- level geometry ----------
const colliders=[], solids=[];
function box(x,z,w,d,h,mat,y0=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y0+h/2,z);m.castShadow=m.receiveShadow=true;scene.add(m);solids.push(m);
  colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,top:y0+h,bot:y0});return m;}
function roof(x,z,w,d,y,h,col){const r=new THREE.Mesh(new THREE.ConeGeometry(1,1,4,1),M(col));r.rotation.y=Math.PI/4;r.scale.set(w*0.78,h,d*0.78);r.position.set(x,y+h/2,z);r.castShadow=true;scene.add(r);
  // flat walkable ridge
  const top=new THREE.Mesh(new THREE.BoxGeometry(w*0.98,0.25,d*0.98),M(col));top.position.set(x,y+0.12,z);top.castShadow=top.receiveShadow=true;scene.add(top);solids.push(top);
  colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,top:y+0.25,bot:y});}
const wallMats=[M(0xd8ccb0),M(0xc9b994),M(0x8a5a3a)], roofCols=[0x3a3f4f,0x4a3030,0x2f3a35];
const lanterns=[];
function lantern(x,y,z,light){const g=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.6,8),new THREE.MeshStandardMaterial({color:0xff5522,emissive:0xff4411,emissiveIntensity:2}));
  g.position.set(x,y,z);scene.add(g);lanterns.push(g);if(light){const l=new THREE.PointLight(0xff8844,25,16,1.6);l.position.set(x,y,z);scene.add(l);}}
// houses on both sides of the street
let li=0;
for(let z=-6;z>-92;z-=11){for(const side of[-1,1]){
  if(rnd()<0.12) continue;
  const w=6+rnd()*3,d=7+rnd()*2,h=3+rnd()*2.5,x=side*(4+w/2+0.5+rnd()*1.5);
  box(x,z,w,d,h,wallMats[(rnd()*3)|0]); roof(x,z,w+0.6,d+0.6,h,0.0,0x333);
  if(rnd()<0.6){lantern(x-side*(w/2+0.1),h-0.6,z+d/2-0.5,(li++%3)===0);}
  if(rnd()<0.5){const x2=x+side*(w/2+4+rnd()*2),h2=2.5+rnd()*4;box(x2,z+rnd()*2,6,7,h2,wallMats[(rnd()*3)|0]);roof(x2,z,6.6,7.6,h2,0,0x333);}
}}
// remove the hidden cone roof heights (flat-topped Edo townhouses with dark tile tops) -> colour tops
solids.forEach((s,i)=>{if(s.geometry.parameters.height===0.25)s.material=M(roofCols[i%3]);});
// stacks of crates for hopping
[[3,-20],[-3,-47],[2.8,-70]].forEach(([x,z])=>{box(x,z,1.4,1.4,1.4,M(0x6b4a2b));box(x+0.2,z+1.5,1.4,1.4,1.4,M(0x6b4a2b));});
// boundary walls
const wm=M(0x5a4a3a);box(-34,-50,1,140,4,wm);box(34,-50,1,140,4,wm);box(0,16,69,1,4,wm);box(0,-122,69,1,4,wm);
// pagoda
const PZ=-108; box(0,PZ,22,16,1,M(0x666)); // stone base
const tiers=[[10,4],[8,3.2],[6.4,3],[5,2.8],[3.6,2.4]]; let py=1;
tiers.forEach(([s,h],i)=>{box(0,PZ,s,s,h,M(i%2?0x7a2222:0x8c2a2a),py);py+=h;
  const eave=new THREE.Mesh(new THREE.BoxGeometry(s+3,0.35,s+3),M(0x2c2c38));eave.position.set(0,py,PZ);eave.castShadow=true;scene.add(eave);solids.push(eave);
  colliders.push({minX:-(s+3)/2,maxX:(s+3)/2,minZ:PZ-(s+3)/2,maxZ:PZ+(s+3)/2,top:py+0.17,bot:py-0.17});
  lantern((s+2.6)/2,py-0.6,PZ+(s+2.6)/2,i%2===0);lantern(-(s+2.6)/2,py-0.6,PZ+(s+2.6)/2,false);py+=0.35;});
const spire=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.2,4,6),M(0xccaa55,{metalness:0.6}));spire.position.set(0,py+2,PZ);scene.add(spire);
// the scroll (on the 3rd eave, front)
const scroll=new THREE.Group();{const r=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,1,12),new THREE.MeshStandardMaterial({color:0xf3e3b0,emissive:0xffcc55,emissiveIntensity:0.6}));r.rotation.z=Math.PI/2;
  const e=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,0.12,12),M(0x552211));e.rotation.z=Math.PI/2;e.position.x=0.55;const e2=e.clone();e2.position.x=-0.55;scroll.add(r,e,e2);}
const eave2=colliders.filter(c=>c.bot>0&&Math.abs(c.maxZ-c.minZ-11)<0.01)[0];const scrollEaveTop=eave2.top;
scroll.position.set(0,scrollEaveTop+0.8,PZ+4.6); scene.add(scroll);
const scrollLight=new THREE.PointLight(0xffdd88,20,8);scrollLight.position.copy(scroll.position);scene.add(scrollLight);
// exit gate
const gate=new THREE.Group();[-3,3].forEach(x=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,6),M(0xaa2222));p.position.set(x,3,0);gate.add(p);});
[[6.2,0.4,6],[8,0.5,6.8]].forEach(([w,h,y])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w+2,h,0.5),M(0xaa2222));b.position.y=y-1;gate.add(b);});
gate.position.set(0,0,10);scene.add(gate);lantern(-2.4,3,10.4,true);lantern(2.4,3,10.4,false);
const exitRing=new THREE.Mesh(new THREE.RingGeometry(1.8,2.2,32),new THREE.MeshBasicMaterial({color:0x55ff88,transparent:true,opacity:0.6,side:2}));
exitRing.rotation.x=-Math.PI/2;exitRing.position.set(0,0.05,9);exitRing.visible=false;scene.add(exitRing);
// street lanterns on poles
for(let z=-12;z>-100;z-=22){const p=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,3),M(0x332211));p.position.set(3.6,1.5,z);scene.add(p);lantern(3.6,3.1,z,true);}

// ---------- ninja ----------
function makeNinja(){const g=new THREE.Group(),dark=M(0x1a1a24),body=new THREE.Mesh(new THREE.CapsuleGeometry(0.32,0.7,4,8),dark);body.position.y=0.75;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.28,12,10),dark);head.position.y=1.42;
  const eyes=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.08,0.2),new THREE.MeshBasicMaterial({color:0xffe9c0}));eyes.position.set(0,1.45,0.17);
  const scarf=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.06,0.9),M(0xcc1122));scarf.position.set(0,1.45,-0.5);scarf.rotation.x=0.3;
  const sword=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,1.1),M(0x222));sword.position.set(0,1,-0.35);sword.rotation.x=0.8;
  g.add(body,head,eyes,scarf,sword);g.traverse(o=>o.castShadow=true);g.userData={body,scarf};return g;}
const ninja=makeNinja();scene.add(ninja);
const rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xddccaa}));rope.visible=false;scene.add(rope);

// ---------- guards ----------
function sprite(txt,col){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.font='bold 54px Arial';x.textAlign='center';x.fillStyle=col;x.strokeStyle='#000';x.lineWidth=5;x.strokeText(txt,32,52);x.fillText(txt,32,52);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));s.scale.set(1,1,1);s.position.y=2.6;s.visible=false;return s;}
const RANGE=15,FOV=Math.cos(THREE.MathUtils.degToRad(33));
const coneGeo=new THREE.ConeGeometry(RANGE*Math.tan(THREE.MathUtils.degToRad(33)),RANGE,24,1,true);coneGeo.translate(0,-RANGE/2,0);coneGeo.rotateX(-Math.PI/2);
const guardDefs=[ [[-1.5,-8],[1.5,-40]], [[2,-30],[-2,-62],[2,-62]], [[0,-55],[0,-90]], [[-10,-97],[10,-97],[10,-118],[-10,-118]], [[12,-20],[12,-45]], [[-13,-72],[-13,-88],[-6,-80]] ];
const SILLY_SEE=['Must have been a very large cat.','Hmm? ...probably my imagination again.','Was that a shadow or a raccoon in pajamas?','I should not have eaten that third rice ball.'];
const SILLY_ALERT=['NINJA! Everyone act natural!','INTRUDER! Somebody grab my sandals!','A NINJA?! On a WEDNESDAY?!','HALT! Or... continue, but slower!'];
const SILLY_KO=['zzz... five more minutes, mom...','*bonk* ...I see tiny cranes...','"Tell my goldfish... I loved him."','*falls over like a polite tree*'];
const guards=guardDefs.map((wps,i)=>{const g=new THREE.Group();
  const robe=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.5,1.3,8),M(0x2d4a7a));robe.position.y=0.65;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.27,10,8),M(0xe0b890));head.position.y=1.55;
  const hat=new THREE.Mesh(new THREE.ConeGeometry(0.6,0.35,12),M(0xc8a860));hat.position.y=1.85;
  const spear=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,2.6),M(0x553311));spear.position.set(0.45,1.2,0.1);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.3,6),M(0xcccccc,{metalness:0.8}));tip.position.set(0.45,2.6,0.1);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.15,8,6),new THREE.MeshBasicMaterial({color:0xffaa55}));lamp.position.set(-0.4,0.9,0.35);
  const body=new THREE.Group();body.add(robe,head,hat,spear,tip,lamp);g.add(body);body.traverse(o=>o.castShadow=true);
  const cone=new THREE.Mesh(coneGeo,new THREE.MeshBasicMaterial({color:0xffee88,transparent:true,opacity:0.13,depthWrite:false,side:2}));cone.position.y=1.5;cone.rotation.x=0.12;g.add(cone);
  const q=sprite('?','#ffdd33'),ex=sprite('!','#ff3322');g.add(q,ex);
  const y=(wps[0][1]<-100)?1:0;g.position.set(wps[0][0],y,wps[0][1]);scene.add(g);
  return {g,body,cone,q,ex,wps,wi:1,state:'patrol',susp:0,lost:0,wait:0,ko:false,dir:0,lastSeen:new THREE.Vector3(),y,hitCd:0,id:i};});

// ---------- state ----------
const keys={};let yaw=Math.PI,pitch=0.25;
const P={pos:new THREE.Vector3(),vy:0,ground:true,crouch:false,grap:null,hp:3,inv:0,face:Math.PI};
let mode='title',stats,hasScroll=false,toastT=0;
function reset(){P.pos.set(0,0,6);P.vy=0;P.hp=3;P.grap=null;yaw=Math.PI;hasScroll=false;scroll.visible=true;scrollLight.visible=true;exitRing.visible=false;
  stats={kills:0,spotted:0,time:0};guards.forEach(g=>{g.ko=false;g.state='patrol';g.susp=0;g.wi=1;g.body.rotation.set(0,0,0);g.body.position.y=0;g.cone.visible=true;g.g.position.set(g.wps[0][0],g.y,g.wps[0][1]);});}
function toast(t,d=2.5){$('toast').textContent=t;$('toast').style.opacity=1;toastT=d;}
function show(id,on){$(id).classList.toggle('hidden',!on);}
function lock(){try{const r=renderer.domElement.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(e){}}
function start(){snd.init();snd.ctx.resume();reset();mode='play';show('title',0);show('end',0);show('pause',0);show('hud',1);lock();toast('Find the Pickled Scroll atop the far pagoda!',4);}
function pause(on){if(mode!=='play'&&mode!=='pause')return;mode=on?'pause':'play';show('pause',on);if(!on)lock();}
$('startBtn').onclick=start;$('againBtn').onclick=start;$('resumeBtn').onclick=()=>pause(false);
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&mode==='play')pause(true);});
renderer.domElement.addEventListener('click',()=>{if(mode==='play'&&!document.pointerLockElement)lock();});
addEventListener('mousemove',e=>{if(mode!=='play'||!document.pointerLockElement)return;yaw-=e.movementX*0.0025;pitch=THREE.MathUtils.clamp(pitch+e.movementY*0.0025,-0.6,1.2);});
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mousedown',e=>{if(mode==='play'&&e.button===2)grapple();});
addEventListener('keydown',e=>{keys[e.code]=true;
  if(e.code==='KeyM'){snd.setMuted(!snd.muted);toast(snd.muted?'Muted':'Sound on',1);}
  if(e.code==='Escape'){if(mode==='pause')pause(false);else if(mode==='play')pause(true);}
  if(mode!=='play')return;
  if(e.code==='Space'&&P.ground&&!P.grap){P.vy=P.crouch?6:8.5;P.ground=false;snd.sfx('jump');}
  if(e.code==='KeyE')grapple(); if(e.code==='KeyF')takedown(); if(e.code==='KeyC')P.crouch=!P.crouch;});
addEventListener('keyup',e=>keys[e.code]=false);

// ---------- mechanics ----------
const ray=new THREE.Raycaster(),tmp=new THREE.Vector3(),tmp2=new THREE.Vector3();
function grappleTarget(){ray.setFromCamera({x:0,y:0},camera);ray.far=60;const h=ray.intersectObjects(solids,false)[0];if(!h)return null;
  const p=h.point;let best=null;for(const c of colliders){if(p.x>c.minX-0.3&&p.x<c.maxX+0.3&&p.z>c.minZ-0.3&&p.z<c.maxZ+0.3&&c.top>1.2&&p.y<=c.top+0.3&&p.y>=c.bot-0.3&&(!best||c.top<best.top))best=c;}
  if(!best||best.top-P.pos.y>22||p.distanceTo(P.pos)>42)return null;
  return new THREE.Vector3(THREE.MathUtils.clamp(p.x,best.minX+0.5,best.maxX-0.5),best.top,THREE.MathUtils.clamp(p.z,best.minZ+0.5,best.maxZ-0.5));}
function grapple(){if(P.grap)return;const t=grappleTarget();if(!t){toast('No roof to hook onto there.',1);return;}P.grap=t;P.vy=0;rope.visible=true;snd.sfx('grapple');}
function takedown(){for(const g of guards){if(g.ko)continue;tmp.subVectors(P.pos,g.g.position);tmp.y=0;const d=tmp.length();if(d>2.3||Math.abs(P.pos.y-g.g.position.y)>1.2)continue;
  const fwd=tmp2.set(Math.sin(g.dir),0,Math.cos(g.dir));if(fwd.dot(tmp.normalize())<-0.2||g.state!=='alert'&&g.susp<0.5&&d<1.4||g.state==='patrol'&&fwd.dot(tmp)<0.3){
   g.ko=true;g.state='ko';g.susp=0;g.cone.visible=false;g.q.visible=g.ex.visible=false;stats.kills++;snd.sfx('takedown');toast(SILLY_KO[(Math.random()*4)|0]);return;}}
  toast('Get closer — and sneak up from BEHIND!',1.2);}
function groundAt(x,z,y,r=0.35){let gy=0;for(const c of colliders){if(x>c.minX-r&&x<c.maxX+r&&z>c.minZ-r&&z<c.maxZ+r&&c.top<=y+0.45&&c.top>gy)gy=c.top;}return gy;}
function collide(p,r,h){for(const c of colliders){if(p.y>=c.top-0.45||p.y+h<=c.bot)continue;
  if(p.x>c.minX-r&&p.x<c.maxX+r&&p.z>c.minZ-r&&p.z<c.maxZ+r){const dx1=p.x-(c.minX-r),dx2=(c.maxX+r)-p.x,dz1=p.z-(c.minZ-r),dz2=(c.maxZ+r)-p.z,m=Math.min(dx1,dx2,dz1,dz2);
   if(m===dx1)p.x=c.minX-r;else if(m===dx2)p.x=c.maxX+r;else if(m===dz1)p.z=c.minZ-r;else p.z=c.maxZ+r;}}}
function canSee(g){tmp.copy(g.g.position);tmp.y+=1.6;const to=tmp2.copy(P.pos);to.y+=P.crouch?0.6:1.2;to.sub(tmp);const dist=to.length();
  let range=RANGE*(P.crouch?0.65:1);if(P.pos.y-g.g.position.y>2.5)range*=0.6; // nobody looks up
  if(dist>range)return 0;const hz=Math.hypot(to.x,to.z)||1;if((Math.sin(g.dir)*to.x+Math.cos(g.dir)*to.z)/hz<FOV&&dist>1.5)return 0;
  ray.set(tmp,to.clone().normalize());ray.far=dist;if(ray.intersectObjects(solids,false).length)return 0;return 1-dist/range*0.6;}
function hurt(g){if(P.inv>0)return;P.hp--;P.inv=1.5;snd.sfx('hurt');tmp.subVectors(P.pos,g.g.position).setY(0).normalize().multiplyScalar(4);P.pos.add(tmp);collide(P.pos,0.4,1.6);P.vy=5;P.ground=false;
  toast(P.hp>0?'Ouch! Poked by a spear!':'Captured! (They make you wash the dishes.)');if(P.hp<=0)finish(false);}
function updateGuards(dt){let maxS=0,anyAlert=false;
  for(const g of guards){if(g.ko){g.body.rotation.x=Math.min(g.body.rotation.x+dt*5,Math.PI/2);g.body.position.y=Math.max(g.body.position.y-dt,-0.25);continue;}
    const v=canSee(g);let noise=0;tmp.subVectors(P.pos,g.g.position);const d=tmp.length();
    if(!P.crouch&&d<5&&(keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD)&&P.ground)noise=0.5;
    if(v||noise){g.susp+=dt*(v?(P.crouch?0.9:1.7)*(0.5+v):noise);g.lastSeen.copy(P.pos);g.lost=0;}else{g.lost+=dt;if(g.state!=='alert'||g.lost>5)g.susp-=dt*(g.state==='alert'?0.15:0.22);}
    g.susp=THREE.MathUtils.clamp(g.susp,0,1.2);const prev=g.state;
    if(g.susp>=1)g.state='alert';else if(g.state==='alert'&&g.susp<0.6)g.state='suspicious';else if(g.state!=='alert')g.state=g.susp>0.3?'suspicious':'patrol';
    if(prev!==g.state){if(g.state==='alert'){stats.spotted++;snd.sfx('alert');toast('Guard: "'+SILLY_ALERT[(Math.random()*4)|0]+'"');
        guards.forEach(o=>{if(!o.ko&&o!==g&&o.g.position.distanceTo(g.g.position)<18){o.susp=Math.max(o.susp,0.7);o.lastSeen.copy(P.pos);}});}
      else if(g.state==='suspicious'&&prev==='patrol'){snd.sfx('huh');}
      else if(g.state==='patrol'&&prev==='suspicious')toast('Guard: "'+SILLY_SEE[(Math.random()*4)|0]+'"',2);}
    let target=null,speed=1.6;
    if(g.state==='patrol'){const w=g.wps[g.wi];target=tmp.set(w[0],0,w[1]);if(Math.hypot(target.x-g.g.position.x,target.z-g.g.position.z)<0.4){g.wi=(g.wi+1)%g.wps.length;}}
    else if(g.state==='suspicious'){target=tmp.copy(g.lastSeen);speed=g.susp>0.6?1.2:0;}
    else{target=tmp.copy(g.lostedTarget=g.lost<5?P.pos:g.lastSeen);speed=5.4;anyAlert=true;}
    const dx=target.x-g.g.position.x,dz=target.z-g.g.position.z,dl=Math.hypot(dx,dz);
    if(dl>0.05){const want=Math.atan2(dx,dz);let da=((want-g.dir+Math.PI*3)%(Math.PI*2))-Math.PI;g.dir+=THREE.MathUtils.clamp(da,-dt*(g.state==='alert'?8:2.5),dt*(g.state==='alert'?8:2.5));}
    if(dl>(g.state==='alert'?1.0:0.3)&&speed>0){const s=Math.min(speed*dt,dl);const np=g.g.position.clone();np.x+=Math.sin(g.dir)*s;np.z+=Math.cos(g.dir)*s;np.y=g.y;collide(np,0.4,1.8);g.g.position.copy(np);}
    g.g.rotation.y=g.dir;g.body.position.y=Math.abs(Math.sin(performance.now()*0.008))*0.06*(speed>0?1:0);
    if(g.state==='alert'&&d<1.4&&Math.abs(P.pos.y-g.g.position.y)<1.6)hurt(g);
    g.q.visible=g.state==='suspicious';g.ex.visible=g.state==='alert';
    g.cone.material.color.set(g.state==='alert'?0xff2222:g.state==='suspicious'?0xffaa00:0xffee88);g.cone.material.opacity=g.state==='patrol'?0.12:0.2;
    maxS=Math.max(maxS,g.susp);}
  snd.alert=anyAlert?1:0;return maxS;}
function rankFor(s){const t=s.time,sp=s.spotted,k=s.kills;
  if(sp===0&&k===0)return['Ghost of the Pickle Jar','Nobody even knew you existed. Including your mom.'];
  if(sp===0&&k>=4)return['Silent Nap-Giver Supreme','Six guards, six naps. Very generous.'];
  if(sp===0)return['Shadow Noodle Grandmaster','Unseen, unheard, slightly smelling of soy sauce.'];
  if(sp<=2&&t<180)return['Respectable Night Raccoon','A few gasps were heard. Mostly yours.'];
  if(sp<=4)return['Apprentice Sock-Ninja','Sneaky-ish. In the way a marching band is sneaky.'];
  return['Loudest Ninja in the Prefecture','They will write songs about you. Bad ones.'];}
function finish(won){mode='end';show('hud',0);document.exitPointerLock?.();snd.alert=0;
  $('endTitle').textContent=won?'MISSION COMPLETE':'MISSION FAILED';snd.sfx(won?'win':'hurt');
  const [r,sub]=won?rankFor(stats):['Dish-Washing Ninja','Captured. The pots are not going to scrub themselves.'];
  $('rank').innerHTML=`Rank: <b>${r}</b><div style="font-size:16px;color:#ccc;margin-top:4px">${sub}</div>`;
  const m=Math.floor(stats.time/60),s=Math.floor(stats.time%60);
  $('stats').innerHTML=`<tr><td>Stealth takedowns</td><td>${stats.kills}</td></tr><tr><td>Times spotted</td><td>${stats.spotted}</td></tr><tr><td>Time</td><td>${m}:${String(s).padStart(2,'0')}</td></tr><tr><td>Scroll</td><td>${hasScroll?'Pickled &amp; secured':'Still missing'}</td></tr>`;
  show('end',1);}

// ---------- loop ----------
const clock=new THREE.Clock();
function update(dt){stats.time+=dt;P.inv=Math.max(0,P.inv-dt);
  P.crouch=keys.ShiftLeft||keys.ShiftRight?true:(keys.KeyC?P.crouch:P.crouch);
  if(!keys.ShiftLeft&&!keys.ShiftRight&&P._shift)P.crouch=false;P._shift=keys.ShiftLeft||keys.ShiftRight;
  if(P.grap){tmp.subVectors(P.grap,P.pos);const d=tmp.length();if(d<0.5){P.pos.copy(P.grap);P.grap=null;rope.visible=false;P.vy=0;P.ground=true;snd.sfx('thunk');}
    else{P.pos.addScaledVector(tmp.normalize(),Math.min(d,30*dt));P.face=Math.atan2(tmp.x,tmp.z);
      const a=rope.geometry.attributes.position;a.setXYZ(0,P.pos.x,P.pos.y+1.2,P.pos.z);a.setXYZ(1,P.grap.x,P.grap.y,P.grap.z);a.needsUpdate=true;}}
  else{const f=(keys.KeyW?1:0)-(keys.KeyS?1:0),s=(keys.KeyD?1:0)-(keys.KeyA?1:0);
    const sp=P.crouch?3:6.5;if(f||s){const fx=Math.sin(yaw),fz=Math.cos(yaw);let mx=fx*f-fz*s,mz=fz*f+fx*s;const l=Math.hypot(mx,mz);mx/=l;mz/=l;
      P.pos.x+=mx*sp*dt;P.pos.z+=mz*sp*dt;P.face=Math.atan2(mx,mz);}
    collide(P.pos,0.4,P.crouch?1:1.6);
    P.vy-=22*dt;P.pos.y+=P.vy*dt;const gy=groundAt(P.pos.x,P.pos.z,P.pos.y-P.vy*dt);
    if(P.pos.y<=gy){P.pos.y=gy;P.vy=0;P.ground=true;}else P.ground=P.pos.y-gy<0.05;}
  // ninja visuals
  let da=((P.face-ninja.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;ninja.rotation.y+=da*Math.min(1,dt*12);
  ninja.position.copy(P.pos);ninja.scale.y=P.crouch?0.65:1;ninja.visible=!(P.inv>0&&Math.floor(P.inv*10)%2);
  ninja.userData.scarf.rotation.y=Math.sin(performance.now()*0.01)*0.3;
  // camera
  const cd=P.crouch?4.2:5.2;camera.position.set(P.pos.x-Math.sin(yaw)*Math.cos(pitch)*cd,P.pos.y+1.6+Math.sin(pitch)*cd,P.pos.z-Math.cos(yaw)*Math.cos(pitch)*cd);
  {const h=new THREE.Vector3(P.pos.x,P.pos.y+1.5,P.pos.z),dir=camera.position.clone().sub(h),L=dir.length();ray.set(h,dir.normalize());ray.far=L;const hit=ray.intersectObjects(solids,false)[0];if(hit)camera.position.copy(h).addScaledVector(dir,Math.max(0.6,hit.distance-0.3));}
  camera.lookAt(P.pos.x,P.pos.y+1.5,P.pos.z);
  const maxS=updateGuards(dt);
  // scroll & exit
  scroll.rotation.y+=dt*1.5;scroll.position.y=scrollEaveTop+0.8+Math.sin(performance.now()*0.003)*0.15;
  if(!hasScroll&&P.pos.distanceTo(scroll.position)<1.8){hasScroll=true;scroll.visible=false;scrollLight.visible=false;exitRing.visible=true;snd.sfx('scroll');toast('You got the Pickled Scroll! Now escape to the town gate!',4);}
  if(hasScroll&&Math.hypot(P.pos.x,P.pos.z-9)<2.4&&P.pos.y<1)finish(true);
  // HUD
  const fill=$('meterfill');fill.style.width=Math.min(100,maxS*100)+'%';fill.style.background=maxS>=1?'#e33':maxS>0.3?'#eb3':'#4c8';
  $('mlabel').textContent=maxS>=1?'ALERT!':maxS>0.3?'SUSPICIOUS?':P.crouch?'HIDDEN (sneaking)':'HIDDEN';
  const m=Math.floor(stats.time/60),s=Math.floor(stats.time%60);
  $('tl').innerHTML=`Health: ${'❤'.repeat(P.hp)}${'♡'.repeat(3-P.hp)}<br>Takedowns: ${stats.kills} · Spotted: ${stats.spotted}<br>Time: ${m}:${String(s).padStart(2,'0')}`;
  $('obj').textContent=hasScroll?'Objective: Escape through the red town gate (green circle)':'Objective: Grab the glowing scroll on the far pagoda';
  $('cross').classList.toggle('ok',!P.grap&&!!grappleTarget());
  if(toastT>0){toastT-=dt;if(toastT<=0)$('toast').style.opacity=0;}}
let lt=0;function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),0.05);
  lanterns.forEach((l,i)=>l.rotation.z=Math.sin(performance.now()*0.0015+i)*0.12);
  if(mode==='play')update(dt);else if(mode==='title'){lt+=dt;camera.position.set(Math.sin(lt*0.1)*30,14,-30+Math.cos(lt*0.1)*40);camera.lookAt(0,4,-70);}
  renderer.render(scene,camera);}
reset();frame();
window.__game={start,P,guards,get stats(){return stats},get mode(){return mode},set yaw(v){yaw=v},set pitch(v){pitch=v},finish};
