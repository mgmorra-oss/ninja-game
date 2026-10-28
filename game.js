import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sound } from './audio.js';
const $=id=>document.getElementById(id);
const snd=new Sound();
let seed=7; const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};

// ---------- quality ----------
const QUALS=['auto','low','medium','high'];
let quality=new URLSearchParams(location.search).get('q')||localStorage.getItem('ms_quality')||'auto';if(!QUALS.includes(quality))quality='auto';
const QP={auto:{pr:1.25,bloom:true,ink:true,grass:0.6,shadow:2048,msaa:2,adaptive:true,fx:1},low:{pr:0.75,bloom:false,ink:false,grass:0.3,shadow:1024,msaa:0,fx:0.6},medium:{pr:1,bloom:true,ink:true,grass:0.6,shadow:2048,msaa:0,fx:1},high:{pr:1.5,bloom:true,ink:true,grass:1,shadow:2048,msaa:4,fx:1}};

// ---------- renderer / scene ----------
const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,QP[quality].pr)); renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0;
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();
const FOGC=new THREE.Color(0x2b3a6e); scene.fog=new THREE.FogExp2(FOGC,0.0135); scene.background=FOGC.clone();
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,0.1,500);
const uTime={value:0};

// toon ramp
function ramp(steps){const d=new Uint8Array(steps.length*4);steps.forEach((v,i)=>{d.set([v,v,v,255],i*4)});const t=new THREE.DataTexture(d,steps.length,1);t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;}
const RAMP=ramp([70,150,215,255]), RAMP2=ramp([110,200,255]);
const T=(c,o={})=>new THREE.MeshToonMaterial({color:c,gradientMap:RAMP,...o});
const M=T;
function canvasTex(w,h,draw,rep=[1,1]){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...rep);t.anisotropy=4;return t;}

// lights: cool moon vs warm lanterns
const MOONDIR=new THREE.Vector3(-0.5,0.36,-0.79).normalize();
scene.add(new THREE.HemisphereLight(0x5a74c8,0x141c2a,0.95));
const moon=new THREE.DirectionalLight(0xb8c8ff,2.1); moon.castShadow=true;
moon.shadow.mapSize.set(QP[quality].shadow,QP[quality].shadow); Object.assign(moon.shadow.camera,{left:-50,right:50,top:50,bottom:-50,near:1,far:260});
moon.shadow.bias=-0.0006; moon.shadow.normalBias=0.04; moon.shadow.camera.updateProjectionMatrix();
moon.target.position.set(0,0,-50); moon.position.copy(moon.target.position).addScaledVector(MOONDIR,140); scene.add(moon,moon.target);

// ---------- painterly sky dome (gradient, mountains, toon clouds, big moon, stars) ----------
const sky=new THREE.Mesh(new THREE.SphereGeometry(450,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
 uniforms:{time:uTime,moonDir:{value:MOONDIR},fogC:{value:FOGC}},
 vertexShader:`varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
 fragmentShader:`uniform float time;uniform vec3 moonDir,fogC;varying vec3 vD;
 float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
 float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
 void main(){vec3 d=normalize(vD);float y=d.y;
  vec3 zen=vec3(.012,.018,.07),mid=vec3(.06,.09,.25),hor=vec3(.20,.24,.48);
  vec3 c=mix(hor,mid,smoothstep(0.,.25,y));c=mix(c,zen,smoothstep(.25,.85,y));
  float md=dot(d,moonDir);
  c+=vec3(.2,.3,.55)*pow(max(md,0.),8.)*.3+vec3(.55,.65,.9)*pow(max(md,0.),70.)*.55+vec3(.8,.85,1.)*pow(max(md,0.),900.)*.6;
  // stars
  vec2 sp=vec2(atan(d.z,d.x)*80.,y*160.);vec2 cell=floor(sp);float st=h(cell);
  float sd=length(fract(sp)-.5);float star=step(.985,st)*smoothstep(.12,0.,sd)*(.6+.4*sin(time*2.+st*90.))*smoothstep(.05,.3,y);
  c+=vec3(1.,.95,.85)*star*1.6;
  // moon disk
  float disk=smoothstep(.9972,.99745,md);
  vec2 mu=vec2(dot(d,normalize(cross(moonDir,vec3(0,1,0)))),d.y-moonDir.y)*38.;
  vec3 moonC=vec3(2.7,2.6,2.3)*(.8+.2*smoothstep(.35,.65,fbm(mu*1.3+3.)));
  c=mix(c,moonC,disk);
  // toon clouds
  if(y>0.){vec2 uv=d.xz/(y+.18)*1.1+vec2(time*.006,time*.002);
   float cl=fbm(uv*1.4)+.18*fbm(uv*5.);float cov=smoothstep(.0,.35,y)*(1.-smoothstep(.55,.9,y));
   float m1=smoothstep(.65,.67,cl)*cov, m2=smoothstep(.73,.75,cl+.03*sin(uv.x*3.))*cov;
   float lit=pow(max(md,0.),4.);
   vec3 cb=mix(vec3(.08,.12,.28),vec3(.20,.28,.50),lit), ch=mix(vec3(.24,.32,.60),vec3(.80,.92,1.25),lit);
   float rim=smoothstep(.655,.67,cl)-smoothstep(.685,.7,cl);
   c=mix(c,cb,m1*.92);c=mix(c,ch,m2*.85);c+=vec3(.75,.88,1.2)*rim*cov*pow(max(md,0.),10.)*1.6;c=mix(c,moonC,disk*(1.-m2*.6));
  }
  // layered mountains
  float az=atan(d.z,d.x);
  float m1h=.035+.07*fbm(vec2(az*2.2,1.)),m2h=.015+.045*fbm(vec2(az*4.,7.));
  c=mix(c,mix(fogC,vec3(.07,.09,.2),.55),step(y,m1h));
  c=mix(c,mix(fogC,vec3(.04,.06,.14),.25),step(y,m2h));
  c=mix(c,fogC,smoothstep(.02,-.04,y));
  gl_FragColor=vec4(c,1.);}`}));
sky.renderOrder=-10;sky.frustumCulled=false;
// sky is baked into a cube map (re-baked every few seconds for cloud drift) instead of shading ~8 fbm per pixel every frame
const skyScene=new THREE.Scene();skyScene.add(sky);const skyRT=new THREE.WebGLCubeRenderTarget(1024,{type:THREE.HalfFloatType,generateMipmaps:false});
const skyCam=new THREE.CubeCamera(1,1000,skyRT);scene.background=skyRT.texture;let skyT=-99;
function bakeSky(now){if(now-skyT<3)return;skyT=now;uTime.value=now;skyCam.update(renderer,skyScene);}

// ---------- ground ----------
const grassTex=canvasTex(256,256,(x,w,h)=>{x.fillStyle='#3d5a3a';x.fillRect(0,0,w,h);for(let i=0;i<2200;i++){const g=50+Math.random()*50|0;x.fillStyle=`rgba(${g*0.6|0},${g+30},${g*0.7|0},.35)`;x.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*5,2+Math.random()*5);}},[60,60]);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(600,600),T(0x9fb99a,{map:grassTex})); ground.rotation.x=-Math.PI/2; ground.position.z=-50; ground.receiveShadow=true; scene.add(ground);
const stoneTex=canvasTex(256,512,(x,w,h)=>{x.fillStyle='#4a4a52';x.fillRect(0,0,w,h);let y=0;while(y<h){const rh=40+Math.random()*30;let xx=-Math.random()*40;while(xx<w){const rw=50+Math.random()*60;const v=110+Math.random()*40|0;x.fillStyle=`rgb(${v},${v-4},${v-10})`;x.beginPath();x.roundRect(xx+3,y+3,rw-6,rh-6,8);x.fill();xx+=rw;}y+=rh;}},[1,10]);
const street=new THREE.Mesh(new THREE.PlaneGeometry(8,150),T(0xb8b4c0,{map:stoneTex})); street.rotation.x=-Math.PI/2; street.position.set(0,0.02,-55); street.receiveShadow=true; scene.add(street);

// ---------- textures for architecture ----------
function wallTex(plaster,wood){return canvasTex(256,256,(x,w,h)=>{x.fillStyle=plaster;x.fillRect(0,0,w,h);
  for(let i=0;i<400;i++){x.fillStyle=`rgba(0,0,0,${Math.random()*0.04})`;x.fillRect(Math.random()*w,Math.random()*h,6,6);}
  x.fillStyle=wood;x.fillRect(0,h*0.68,w,h*0.32);x.fillStyle='rgba(0,0,0,.25)';for(let i=0;i<w;i+=18)x.fillRect(i,h*0.68,2,h*0.32);
  x.fillStyle=wood;x.fillRect(0,0,w,14);x.fillRect(0,h*0.66,w,10);x.fillRect(0,0,12,h);x.fillRect(w-12,0,12,h);x.fillRect(w*0.5-6,0,12,h*0.68);x.fillRect(0,h*0.3,w,8);});}
const wallMats=[T(0xffffff,{map:wallTex('#e9dfc8','#4a2f22')}),T(0xffffff,{map:wallTex('#d9c9a4','#3b2a24')}),T(0xffffff,{map:wallTex('#c98a5c','#2e2220')})];
const shojiTex=canvasTex(128,128,(x,w,h)=>{x.fillStyle='#fff3d0';x.fillRect(0,0,w,h);x.fillStyle='#3a2416';x.fillRect(0,0,w,6);x.fillRect(0,h-6,w,6);x.fillRect(0,0,6,h);x.fillRect(w-6,0,6,h);
  for(let i=1;i<4;i++)x.fillRect(i*w/4-2,0,4,h);for(let j=1;j<5;j++)x.fillRect(0,j*h/5-2,w,4);});
const shojiMat=new THREE.MeshBasicMaterial({map:shojiTex,color:new THREE.Color(2.4,1.7,0.9)});
const shojiDim=new THREE.MeshBasicMaterial({map:shojiTex,color:new THREE.Color(0.55,0.42,0.3)});
const woodMat=T(0x4a2f22), darkWood=T(0x2b1d18);
const roofMats=[0x3b4766,0x4b3a4a,0x35504a].map(c=>{const m=T(c);m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;').replace('#include <fog_vertex>','#include <fog_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;').replace('#include <color_fragment>','#include <color_fragment>\nfloat tl=abs(fract(vWP.z*2.2)-.5);diffuseColor.rgb*=.72+.28*smoothstep(.05,.18,tl);');};return m;});

// ---------- level geometry ----------
const colliders=[], solids=[];
const topAt=(c,x,z)=>c.h?c.h(x,z):c.top;
function box(x,z,w,d,h,mat,y0=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y0+h/2,z);m.castShadow=m.receiveShadow=true;scene.add(m);solids.push(m);
  colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,top:y0+h,bot:y0});return m;}
// curved Japanese gable roof (concave slopes + upturned eaves); walkable along its curve
function roof(x,z,w,d,y,_h,col){const W=w+1.6,D=d+1.0,H=Math.min(1.9,0.22*w),hw=W/2;
  const prof=u=>0.12+H*Math.pow(1-Math.abs(u),1.6)+0.28*Math.pow(Math.max(0,Math.abs(u)-0.8)/0.2,2);
  const sh=new THREE.Shape(),N=24;for(let i=0;i<=N;i++){const u=-1+2*i/N;i?sh.lineTo(u*hw,prof(u)):sh.moveTo(u*hw,prof(u));}
  for(let i=N;i>=0;i--){const u=-1+2*i/N;sh.lineTo(u*hw*0.97,prof(u)-0.28);}
  const g=new THREE.ExtrudeGeometry(sh,{depth:D,bevelEnabled:false});g.translate(0,0,-D/2);g.computeVertexNormals();
  const m=new THREE.Mesh(g,roofMats[(typeof col==='number'?col:0)%3]);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);solids.push(m);
  const ridge=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.32,D+0.3),darkWood);ridge.position.set(x,y+prof(0)+0.05,z);ridge.castShadow=true;scene.add(ridge);
  [-1,1].forEach(s=>{const o=new THREE.Mesh(new THREE.SphereGeometry(0.22,10,8),darkWood);o.scale.set(1,1.2,1);o.position.set(x,y+prof(0)+0.18,z+s*(D/2+0.15));scene.add(o);});
  colliders.push({minX:x-hw,maxX:x+hw,minZ:z-D/2,maxZ:z+D/2,top:y+prof(0)+0.2,bot:y,h:(px)=>y+prof(THREE.MathUtils.clamp((px-x)/hw,-1,1))+0.02});}
const lanterns=[];let lightCount=0;
const lanternMat=new THREE.MeshBasicMaterial({color:new THREE.Color(3.2,1.1,0.35)});
function lantern(x,y,z,light){const g=new THREE.Group();const b=new THREE.Mesh(new THREE.SphereGeometry(0.3,14,10),lanternMat);b.scale.set(1,1.3,1);
  const c1=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.08,10),darkWood);c1.position.y=0.38;const c2=c1.clone();c2.position.y=-0.38;g.add(b,c1,c2);
  g.position.set(x,y,z);scene.add(g);lanterns.push(g);if(light&&lightCount<14){lightCount++;const l=new THREE.PointLight(0xff9a50,9,13,1.8);l.position.set(x,y-0.3,z);scene.add(l);}}
// stone lantern (toro)
const stoneM=T(0x9a98a0);const toroGlow=new THREE.MeshBasicMaterial({color:new THREE.Color(3,1.9,0.8)});
function toro(x,z,light){const g=new THREE.Group();const add=(geo,y,m=stoneM)=>{const o=new THREE.Mesh(geo,m);o.position.y=y;o.castShadow=true;g.add(o);return o;};
  add(new THREE.CylinderGeometry(0.45,0.55,0.25,8),0.12);add(new THREE.CylinderGeometry(0.14,0.18,0.9,8),0.7);add(new THREE.CylinderGeometry(0.42,0.3,0.2,6),1.2);
  add(new THREE.BoxGeometry(0.42,0.42,0.42),1.5,toroGlow);add(new THREE.ConeGeometry(0.6,0.4,6),1.9);add(new THREE.SphereGeometry(0.12,8,6),2.15);
  g.position.set(x,0,z);scene.add(g);if(light&&lightCount<14){lightCount++;const l=new THREE.PointLight(0xffb060,6,9,1.8);l.position.set(x,1.6,z);scene.add(l);}}
// houses on both sides of the street
let li=0;
for(let z=-6;z>-92;z-=11){for(const side of[-1,1]){
  if(rnd()<0.12) continue;
  const w=6+rnd()*3,d=7+rnd()*2,h=3+rnd()*2.5,x=side*(4+w/2+0.5+rnd()*1.5);
  box(x,z,w,d,h,wallMats[(rnd()*3)|0]); roof(x,z,w,d,h,0,(li+(z|0))&3);
  // glowing paper screens facing the street
  const lit=rnd()<0.7;const s=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3,d*0.4),h*0.42),lit?shojiMat:shojiDim);s.position.set(x-side*(w/2+0.02),h*0.42,z+(rnd()-0.5)*1.5);s.rotation.y=-side*Math.PI/2;scene.add(s);
  // wooden porch beam
  const beam=new THREE.Mesh(new THREE.BoxGeometry(0.25,0.25,d+0.4),woodMat);beam.position.set(x-side*(w/2+0.12),h-0.1,z);scene.add(beam);
  if(rnd()<0.6){lantern(x-side*(w/2+0.4),h-0.75,z+d/2-0.6,(li++%3)===0);}
  if(rnd()<0.5){const x2=x+side*(w/2+4+rnd()*2),h2=2.5+rnd()*4;box(x2,z+rnd()*2,6,7,h2,wallMats[(rnd()*3)|0]);roof(x2,z,6,7,h2,0,(li+1)%3);}
}}
// stacks of crates for hopping
const crateTex=canvasTex(64,64,(x,w,h)=>{x.fillStyle='#8a5e36';x.fillRect(0,0,w,h);x.strokeStyle='#4a2e18';x.lineWidth=6;x.strokeRect(3,3,w-6,h-6);x.beginPath();x.moveTo(3,3);x.lineTo(w-3,h-3);x.stroke();});
const crateM=T(0xffffff,{map:crateTex});
[[3,-20],[-3,-47],[2.8,-70]].forEach(([x,z])=>{box(x,z,1.4,1.4,1.4,crateM);box(x+0.2,z+1.5,1.4,1.4,1.4,crateM);});
// boundary walls (plaster with tile caps)
const wm=T(0xffffff,{map:wallTex('#ddd2bb','#3b2a24')});
[[-34,-50,1,140],[34,-50,1,140],[0,16,69,1],[0,-122,69,1]].forEach(([x,z,w,d])=>{box(x,z,w,d,4,wm);const cap=new THREE.Mesh(new THREE.BoxGeometry(w+0.8,0.35,d+0.8),roofMats[0]);cap.position.set(x,4.15,z);cap.castShadow=true;scene.add(cap);});
// pagoda
const PZ=-108; box(0,PZ,22,16,1,T(0x8d8a92)); // stone base
const pagWall=[T(0xffffff,{map:wallTex('#b8342c','#2a1a18')}),T(0xffffff,{map:wallTex('#c23b30','#2a1a18')})];
const tiers=[[10,4],[8,3.2],[6.4,3],[5,2.8],[3.6,2.4]]; let py=1;
tiers.forEach(([s,h],i)=>{box(0,PZ,s,s,h,pagWall[i%2],py);py+=h;
  const r=(s+3)/2*Math.SQRT2,pts=[new THREE.Vector2(r*1.06,-0.05),new THREE.Vector2(r,-0.28),new THREE.Vector2(r*0.85,0.05),new THREE.Vector2(r*0.7,0.22),new THREE.Vector2(s/2*Math.SQRT2,0.5),new THREE.Vector2(0.01,0.5)];
  const eave=new THREE.Mesh(new THREE.LatheGeometry(pts,4),roofMats[0]);eave.rotation.y=Math.PI/4;eave.position.set(0,py-0.05,PZ);eave.castShadow=eave.receiveShadow=true;scene.add(eave);solids.push(eave);
  colliders.push({minX:-(s+3)/2,maxX:(s+3)/2,minZ:PZ-(s+3)/2,maxZ:PZ+(s+3)/2,top:py+0.17,bot:py-0.17});
  lantern((s+2.6)/2,py-0.75,PZ+(s+2.6)/2,i%2===0);lantern(-(s+2.6)/2,py-0.75,PZ+(s+2.6)/2,false);py+=0.35;});
const spire=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.2,4,6),T(0xd8b45a));spire.position.set(0,py+2,PZ);scene.add(spire);
for(let i=0;i<5;i++){const r=new THREE.Mesh(new THREE.TorusGeometry(0.3-i*0.03,0.06,6,12),T(0xd8b45a));r.rotation.x=Math.PI/2;r.position.set(0,py+0.8+i*0.5,PZ);scene.add(r);}
// the scroll (on the 3rd eave, front)
const scroll=new THREE.Group();{const r=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,1,12),new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,2.0,1.1)}));r.rotation.z=Math.PI/2;
  const e=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,0.12,12),M(0x552211));e.rotation.z=Math.PI/2;e.position.x=0.55;const e2=e.clone();e2.position.x=-0.55;scroll.add(r,e,e2);}
const eave2=colliders.filter(c=>c.bot>0&&Math.abs(c.maxZ-c.minZ-11)<0.01)[0];const scrollEaveTop=eave2.top;
scroll.position.set(0,scrollEaveTop+0.8,PZ+4.6); scene.add(scroll);
const scrollLight=new THREE.PointLight(0xffdd88,20,8);scrollLight.position.copy(scroll.position);scene.add(scrollLight);
// exit gate (torii)
const gate=new THREE.Group();const vermil=T(0xd8432c);[-3,3].forEach(x=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.34,6,12),vermil);p.position.set(x,3,0);p.castShadow=true;gate.add(p);});
{const b=new THREE.Mesh(new THREE.BoxGeometry(8,0.4,0.5),vermil);b.position.y=5;gate.add(b);
 const kas=new THREE.Shape();kas.moveTo(-5,0.15);kas.quadraticCurveTo(0,-0.25,5,0.45);kas.lineTo(5,0.8);kas.quadraticCurveTo(0,0.15,-5,0.8);kas.lineTo(-5,0.15);
 const top=new THREE.Mesh(new THREE.ExtrudeGeometry(kas,{depth:0.6,bevelEnabled:false}),darkWood);top.position.set(0,5.9,-0.3);top.castShadow=true;gate.add(top);
 const top2=top.clone();top2.scale.x=-1;top2.material=darkWood;gate.add(top2);}
gate.position.set(0,0,10);scene.add(gate);lantern(-2.4,3,10.4,true);lantern(2.4,3,10.4,false);
const exitRing=new THREE.Mesh(new THREE.RingGeometry(1.8,2.2,32),new THREE.MeshBasicMaterial({color:new THREE.Color(0.5,2.2,0.9),transparent:true,opacity:0.7,side:2}));
exitRing.rotation.x=-Math.PI/2;exitRing.position.set(0,0.05,9);exitRing.visible=false;scene.add(exitRing);
// street lanterns on poles + stone lanterns
for(let z=-12;z>-100;z-=22){const p=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,3),woodMat);p.position.set(3.6,1.5,z);p.castShadow=true;scene.add(p);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.6),woodMat);arm.position.set(3.6,3,z);scene.add(arm);lantern(3.6,2.6,z+0.3,true);}
for(let z=-23;z>-100;z-=22)toro(-3.7,z,(z|0)%2===0);
toro(-4.5,-96,true);toro(4.5,-96,false);

// ---------- koi pond (stylized water, ripples, moon glint) ----------
const POND={x:-22,z:-106,r:5.5};const inPond=(x,z,m=0)=>Math.hypot(x-POND.x,z-POND.z)<POND.r+m;
const waterMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:uTime,moonDir:{value:MOONDIR},center:{value:new THREE.Vector2(POND.x,POND.z)},R:{value:POND.r},fogC:{value:FOGC}},
 vertexShader:`varying vec3 vWP;void main(){vec4 w=modelMatrix*vec4(position,1.);vWP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`uniform float time,R;uniform vec3 moonDir,fogC;uniform vec2 center;varying vec3 vWP;
 void main(){vec2 p=vWP.xz;float r=length(p-center)/R;vec3 V=normalize(cameraPosition-vWP);
  float a1=sin(length(p-center-vec2(1.5,-1.))*7.-time*2.2),a2=sin(dot(p,vec2(.8,.35))*3.1+time*1.2),a3=sin(dot(p,vec2(-.3,.9))*4.3-time*1.7);
  vec3 N=normalize(vec3((a1*.5+a2*.3)*.07,1.,(a3*.5+a1*.2)*.07));
  float fres=pow(1.-max(dot(V,N),0.),2.5);
  vec3 deep=vec3(.01,.04,.09),sh=vec3(.03,.13,.18),skyR=vec3(.06,.12,.32);
  vec3 c=mix(sh,deep,smoothstep(.2,.95,1.-r));c=mix(c,skyR,clamp(fres,0.,.7));
  vec3 Rf=reflect(-V,N);float sp=dot(Rf,moonDir);c+=vec3(2.4,2.35,2.1)*step(.992,sp)+vec3(.5,.6,.9)*step(.985,sp)*.3;
  float rings=step(.96,sin(r*26.-time*2.))*(1.-r)*.14;c+=vec3(.6,.75,1.)*rings;
  float foam=smoothstep(.9,.98,r)*(.6+.4*step(.0,sin(atan(p.y-center.y,p.x-center.x)*14.+time)));c=mix(c,vec3(.7,.82,1.),foam*.55);
  float fd=length(cameraPosition-vWP);c=mix(c,fogC,1.-exp(-fd*fd*.0135*.0135));
  gl_FragColor=vec4(c,.86);}`});
{const w=new THREE.Mesh(new THREE.CircleGeometry(POND.r,64),waterMat);w.rotation.x=-Math.PI/2;w.position.set(POND.x,0.07,POND.z);w.renderOrder=1;scene.add(w);
 const bed=new THREE.Mesh(new THREE.CircleGeometry(POND.r+0.1,48),T(0x1d3a3a));bed.rotation.x=-Math.PI/2;bed.position.set(POND.x,0.03,POND.z);bed.receiveShadow=true;scene.add(bed);
 const rockM=[T(0x8f8c96),T(0x6f6e7c)];for(let i=0;i<30;i++){const a=i/30*6.283+rnd()*0.1,s=0.35+rnd()*0.4;const r=new THREE.Mesh(new THREE.IcosahedronGeometry(s,0),rockM[i%2]);
  r.position.set(POND.x+Math.cos(a)*(POND.r+0.25),s*0.35,POND.z+Math.sin(a)*(POND.r+0.25));r.rotation.set(rnd()*3,rnd()*3,rnd()*3);r.scale.y=0.6;r.castShadow=r.receiveShadow=true;scene.add(r);}
 const padM=T(0x3f7a4a);for(let i=0;i<9;i++){const a=rnd()*6.28,d=1+rnd()*3.6;const p=new THREE.Mesh(new THREE.CylinderGeometry(0.45+rnd()*0.25,0.45,0.03,14,1,false,0.3,5.9),padM);p.position.set(POND.x+Math.cos(a)*d,0.09,POND.z+Math.sin(a)*d);p.rotation.y=rnd()*6;scene.add(p);
  if(i%3===0){const f=new THREE.Mesh(new THREE.IcosahedronGeometry(0.16,0),new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,0.7,1.0)}));f.position.copy(p.position);f.position.y=0.2;f.scale.y=0.7;scene.add(f);}}
 toro(POND.x+POND.r+1.4,POND.z-2,true);}
const koi=[];{const km=[T(0xff7a2a),T(0xf4f0ea),T(0xffb040)];for(let i=0;i<6;i++){const g=new THREE.Group();const b=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8),km[i%3]);b.scale.set(0.7,0.45,1.8);
  const t=new THREE.Mesh(new THREE.ConeGeometry(0.12,0.25,6),km[(i+1)%3]);t.rotation.x=-Math.PI/2;t.position.z=-0.36;t.scale.x=0.4;g.add(b,t);g.position.y=0.045;g.userData={dyn:1,r:1.2+rnd()*3.3,s:(0.25+rnd()*0.3)*(i%2?1:-1),o:rnd()*6,tail:t};scene.add(g);koi.push(g);}}
function updateKoi(t){koi.forEach(k=>{const u=k.userData,a=t*u.s+u.o;k.position.x=POND.x+Math.cos(a)*u.r;k.position.z=POND.z+Math.sin(a)*u.r*0.8;k.rotation.y=-a+(u.s>0?0:Math.PI);u.tail.rotation.y=Math.sin(t*8+u.o)*0.5;});}

// ---------- cloth: nobori banners and noren curtains (vertex-shader wind) ----------
function crestTex(bg,fg){return canvasTex(128,256,(x,w,h)=>{x.fillStyle=bg;x.fillRect(0,0,w,h);x.fillStyle=fg;x.fillRect(0,0,w,10);x.fillRect(0,h-10,w,10);
  x.beginPath();x.arc(w/2,h*0.3,34,0,6.283);x.lineWidth=7;x.strokeStyle=fg;x.stroke();for(let i=0;i<5;i++){const a=i/5*6.283-1.57;x.beginPath();x.arc(w/2+Math.cos(a)*14,h*0.3+Math.sin(a)*14,9,0,6.283);x.fill();}
  for(let i=0;i<3;i++)x.fillRect(w/2-20+i*16,h*0.55,8,h*0.33);});}
function clothMat(tex,hang){const m=T(0xffffff,{map:tex,side:THREE.DoubleSide});m.onBeforeCompile=s=>{s.uniforms.time=uTime;s.vertexShader='uniform float time;\n'+s.vertexShader.replace('#include <begin_vertex>',
  hang?`vec3 transformed=position;float k=clamp((0.4-position.y)/0.8,0.,1.);vec4 wp=modelMatrix*vec4(position,1.);transformed.z+=sin(time*2.4+wp.x*1.3+position.x*5.)*0.09*k;`
      :`vec3 transformed=position;float k=clamp(position.x/0.7,0.,1.);vec4 wp=modelMatrix*vec4(0.,0.,0.,1.);transformed.z+=(sin(time*3.1-position.x*5.+position.y*1.6+wp.z)*0.16+sin(time*5.3-position.x*9.)*0.04)*k;transformed.x-=abs(sin(time*3.1+position.y))*0.04*k;`);};return m;}
const banTex=[crestTex('#c8d4ea','#1d2a52'),crestTex('#b8322c','#f2e6cc'),crestTex('#2a3a6a','#f0e2c0')];
const banners=[];for(let z=-16,i=0;z>-96;z-=19,i++){const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,4.4,6),darkWood);pole.position.set(-3.95,2.2,z);pole.castShadow=true;scene.add(pole);
  const f=new THREE.Mesh(new THREE.PlaneGeometry(0.7,2.4,10,12).translate(0.35,0,0),clothMat(banTex[i%3],false));f.position.set(-3.95,2.7,z);f.rotation.y=-Math.PI/2;f.castShadow=true;f.userData.dyn=1;scene.add(f);banners.push(f);}
// noren curtains are added on houses with lit screens
function noren(x,y,z,rotY,i){const n=new THREE.Mesh(new THREE.PlaneGeometry(1.8,0.8,12,6),clothMat(banTex[(i+2)%3],true));n.position.set(x,y,z);n.rotation.y=rotY;n.userData.dyn=1;n.castShadow=true;scene.add(n);}
{let i=0;scene.children.filter(o=>o.isMesh&&o.material===shojiMat).forEach(s=>{if(i++%2)return;const nx=s.position.x+Math.sign(-s.position.x)*0.06;noren(nx,s.position.y+s.geometry.parameters.height*0.5+0.15,s.position.z,s.rotation.y,i);});}

// ---------- inverted-hull ink outline (for smooth organic shapes) ----------
const hullMat=new THREE.MeshBasicMaterial({color:0x07060f,side:THREE.BackSide});
hullMat.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','vec3 transformed=position+normal*0.035;');};
function inkHull(root){const list=[];root.traverse(o=>{if(o.isMesh&&!o.userData.noHull&&o.material!==hullMat)list.push(o);});list.forEach(o=>{const h=new THREE.Mesh(o.geometry,hullMat);h.userData.noHull=true;h.raycast=()=>{};o.add(h);});}

// ---------- trees: pines + sakura ----------
const trunkM=T(0x4b3226),pineM=T(0x2f5a46),pineM2=T(0x3e7458),sakM=T(0xf3a6c4),sakM2=T(0xffc8da);
const treePos=[];
const freeAt=(x,z,r,pm=8)=>!colliders.some(c=>x>c.minX-r&&x<c.maxX+r&&z>c.minZ-r&&z<c.maxZ+r)&&Math.abs(x)>5&&!inPond(x,z,pm);
function pine(x,z,s){const g=new THREE.Group();const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.18*s,0.32*s,4*s,7),trunkM);tr.position.y=2*s;tr.rotation.z=(rnd()-0.5)*0.25;g.add(tr);
  for(let i=0;i<4;i++){const b=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),i%2?pineM:pineM2);b.scale.set((1.9-i*0.3)*s,0.55*s,(1.7-i*0.3)*s);b.position.set((rnd()-0.5)*1.2*s,(2.6+i*1.05)*s,(rnd()-0.5)*1.2*s);g.add(b);}
  g.position.set(x,0,z);g.rotation.y=rnd()*6;g.traverse(o=>{o.castShadow=true;o.receiveShadow=true});inkHull(g);scene.add(g);return g;}
function sakura(x,z,s){const g=new THREE.Group();const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.16*s,0.3*s,3*s,7),trunkM);tr.position.y=1.5*s;g.add(tr);
  for(let i=0;i<6;i++){const b=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),i%3?sakM:sakM2);const r=0.9+rnd()*0.6;b.scale.set(r*s,r*0.8*s,r*s);const a=i/6*6.28;b.position.set(Math.cos(a)*1.2*s,(3.3+rnd()*0.9)*s,Math.sin(a)*1.2*s);g.add(b);}
  const c=new THREE.Mesh(new THREE.IcosahedronGeometry(1.3*s,2),sakM2);c.position.y=4.1*s;g.add(c);
  g.position.set(x,0,z);g.traverse(o=>{o.castShadow=true;o.receiveShadow=true});inkHull(g);scene.add(g);treePos.push([x,4*s,z]);return g;}
{let n=0,tries=0;while(n<34&&tries<900){tries++;const x=(rnd()*2-1)*31,z=12-rnd()*130;if(!freeAt(x,z,2.2))continue;if(Math.hypot(x,z-10)<6)continue;(rnd()<0.45?sakura:pine)(x,z,0.8+rnd()*0.5);n++;}
 // backdrop forest outside walls
 for(let i=0;i<60;i++){const s=rnd()<0.5?-1:1,x=s*(38+rnd()*40),z=20-rnd()*170;(rnd()<0.25?sakura:pine)(x,z,1.1+rnd()*0.9);}
 for(let i=0;i<20;i++){const x=(rnd()*2-1)*60,z=-128-rnd()*40;pine(x,z,1.2+rnd());}
 sakura(-9,-100,1.3);sakura(9,-114,1.2);}

const MERGED=[];
// ---------- wind-swaying instanced grass ----------
const grassGeo=(()=>{const g=new THREE.BufferGeometry();const p=[],uv=[];const segs=3;for(let i=0;i<=segs;i++){const t=i/segs,w=0.045*(1-t);p.push(-w,t,0,w,t,0);uv.push(0,t,1,t);}
  const idx=[];for(let i=0;i<segs;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}g.setIndex(idx);g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(new Array(p.length).fill(0).map((_,i)=>i%3===1?1:0),3));return g;})();
const grassMat=T(0xffffff,{side:THREE.DoubleSide,transparent:true,depthWrite:false});
grassMat.onBeforeCompile=s=>{s.uniforms.time=uTime;s.vertexShader='uniform float time;varying float vH;\n'+s.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=position;vH=uv.y;
  vec3 ip=instanceMatrix[3].xyz;float wv=sin(time*1.7+ip.x*0.35+ip.z*0.22)*0.5+sin(time*3.1+ip.x*1.3)*0.18;transformed.x+=wv*0.28*uv.y*uv.y;transformed.z+=wv*0.12*uv.y*uv.y;`);
  s.fragmentShader='varying float vH;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(.45,1.15,vH);');};
const GRASS_MAX=26000;const grass=new THREE.InstancedMesh(grassGeo,grassMat,GRASS_MAX);grass.receiveShadow=true;grass.renderOrder=2;
{const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),c=new THREE.Color();let n=0,t=0;
 while(n<GRASS_MAX&&t<GRASS_MAX*4){t++;let x,z;
  if(n%3===0){const tp=treePos[(rnd()*treePos.length)|0]||[10,0,-30];x=tp[0]+(rnd()-0.5)*9;z=tp[2]+(rnd()-0.5)*9;}else{x=(rnd()*2-1)*33;z=15-rnd()*136;}
  if(Math.abs(x)<4.3||Math.abs(x)>33.4||!freeAt(x,z,0.1,0.6)&&Math.abs(x)>4)continue;
  if(inPond(x,z,0.6)||colliders.some(cc=>x>cc.minX&&x<cc.maxX&&z>cc.minZ&&z<cc.maxZ))continue;
  const s=0.3+rnd()*0.5;e.set((rnd()-0.5)*0.3,rnd()*6.28,(rnd()-0.5)*0.3);q.setFromEuler(e);m.compose(new THREE.Vector3(x,0,z),q,new THREE.Vector3(1+rnd(),s,1));grass.setMatrixAt(n,m);
  c.setHSL(0.30+rnd()*0.08,0.35+rnd()*0.2,0.22+rnd()*0.1);grass.setColorAt(n,c);n++;}
 grass.userData.max=n;grass.count=Math.floor(n*QP[quality].grass);}
scene.add(grass);

// ---------- particles: fireflies + falling petals ----------
function particles(count,make,color,size,additive,fall){const g=new THREE.BufferGeometry(),p=[],r=[];for(let i=0;i<count;i++){const v=make(i);p.push(...v);r.push(rnd()*100);}
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('rnd',new THREE.Float32BufferAttribute(r,1));
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
   uniforms:{time:uTime,color:{value:color},size:{value:size},fall:{value:fall}},
   vertexShader:`uniform float time,size,fall;attribute float rnd;varying float vA;varying float vR;void main(){vec3 p=position;float t=time+rnd*10.;
    if(fall>0.){float ph=fract(t*0.045+rnd*.37);p.y=position.y*(1.-ph);p.x+=sin(t*0.9+rnd)*0.8+ph*3.;p.z+=cos(t*0.7+rnd*2.)*0.8;vA=smoothstep(0.,.08,ph)*smoothstep(1.,.85,ph);}
    else{p+=vec3(sin(t*.5+rnd),sin(t*.8+rnd*3.)*.5,cos(t*.43+rnd*2.))*1.2;vA=pow(.5+.5*sin(t*2.3+rnd*7.),3.);}
    vR=rnd;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=size*(300./-mv.z);gl_Position=projectionMatrix*mv;}`,
   fragmentShader:`uniform vec3 color;uniform float fall;varying float vA;varying float vR;void main(){vec2 c=gl_PointCoord-.5;float d;
    if(fall>0.){float a=vR*6.;c=mat2(cos(a),-sin(a),sin(a),cos(a))*c;d=length(c*vec2(1.,2.2));if(d>.5)discard;gl_FragColor=vec4(color,vA);}
    else{d=length(c);float a=smoothstep(.5,0.,d);gl_FragColor=vec4(color*a*vA,1.);}}`});
  const pts=new THREE.Points(g,mat);pts.frustumCulled=false;pts.renderOrder=3;scene.add(pts);return pts;}
particles(140,()=>[(rnd()*2-1)*32,0.4+rnd()*2.5,12-rnd()*130],new THREE.Color(1.6,2.4,0.7),0.32,true,0);
particles(420,()=>{const tp=treePos[(rnd()*treePos.length)|0];return[tp[0]+(rnd()-0.5)*5,tp[1]+1+rnd()*1.5,tp[2]+(rnd()-0.5)*5];},new THREE.Color(1.0,0.62,0.78),0.16,false,1);

// ---------- characters ----------
const skinM=T(0xf0c8a0);
function rimify(m,col,pow=2.6){m.onBeforeCompile=s=>{s.uniforms.rimC={value:col};s.fragmentShader='uniform vec3 rimC;\n'+s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat rimF=pow(1.0-clamp(dot(normal,normalize(vViewPosition)),0.,1.),'+pow.toFixed(1)+');totalEmissiveRadiance+=rimC*rimF;');};m.customProgramCacheKey=()=>'rim'+pow;return m;}
const NRIM=new THREE.Color(0.2,0.32,0.75),GRIM=new THREE.Color(0.18,0.22,0.4);
function limb(r,len,mat){const piv=new THREE.Group();const m=new THREE.Mesh(new THREE.CapsuleGeometry(r,len,4,10),mat);m.position.y=-len/2-r*0.5;piv.add(m);return piv;}
function makeNinja(){const g=new THREE.Group(),dark=rimify(T(0x2c3560),NRIM,3.2),dark2=rimify(T(0x1e2442),NRIM,3.2),red=rimify(T(0xe0283a,{emissive:0x400008}),new THREE.Color(0.9,0.3,0.3));
  const hip=new THREE.Group();hip.position.y=0.78;g.add(hip);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.27,0.38,6,12),dark);body.position.y=0.32;body.scale.set(1,1,0.8);hip.add(body);
  const belt=new THREE.Mesh(new THREE.TorusGeometry(0.25,0.05,6,16),red);belt.rotation.x=Math.PI/2;belt.position.y=0.12;belt.scale.set(1,0.8,1);hip.add(belt);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.27,20,16),dark2);head.position.y=0.86;hip.add(head);
  const face=new THREE.Mesh(new THREE.SphereGeometry(0.255,20,8,-0.9,1.8,1.25,0.45),skinM);face.position.copy(head.position);face.scale.setScalar(1.06);face.rotation.y=Math.PI/2*0+0;hip.add(face);face.rotation.y=-Math.PI/2+Math.PI/2;
  face.userData.noHull=true;
  const eyeM=new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,2.0,1.6)});
  [-1,1].forEach(s=>{const e=new THREE.Mesh(new THREE.SphereGeometry(0.045,8,6),eyeM);e.scale.set(1.3,0.6,0.5);e.position.set(s*0.09,0.88,0.265);e.userData.noHull=true;hip.add(e);});
  const knot=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6),red);knot.position.set(0,0.9,-0.26);hip.add(knot);
  const band=new THREE.Mesh(new THREE.TorusGeometry(0.27,0.035,6,20),red);band.position.y=0.98;band.rotation.x=Math.PI/2+0.15;hip.add(band);band.userData.noHull=true;
  const armL=limb(0.085,0.42,dark),armR=limb(0.085,0.42,dark);armL.position.set(-0.33,0.58,0);armR.position.set(0.33,0.58,0);hip.add(armL,armR);
  const legL=limb(0.1,0.56,dark2),legR=limb(0.1,0.56,dark2);legL.position.set(-0.13,0,0);legR.position.set(0.13,0,0);hip.add(legL,legR);
  const sword=new THREE.Group();const blade=new THREE.Mesh(new THREE.BoxGeometry(0.06,1.0,0.04),T(0x1b1b22));const hilt=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.3,6),red);hilt.position.y=0.65;
  const tsuba=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.03,10),T(0xc9a24a));tsuba.position.y=0.5;sword.add(blade,hilt,tsuba);sword.position.set(0.05,0.45,-0.27);sword.rotation.z=0.7;hip.add(sword);
  blade.userData.noHull=true;
  inkHull(g);
  // flowing scarf ribbon (CPU-animated)
  const SEG=14;const sg=new THREE.PlaneGeometry(0.16,1.5,1,SEG);const scarf=new THREE.Mesh(sg,new THREE.MeshToonMaterial({color:0xff3344,emissive:0x5a0810,gradientMap:RAMP2,side:THREE.DoubleSide}));scarf.castShadow=true;scarf.frustumCulled=false;
  scarf.userData.base=sg.attributes.position.array.slice();hip.add(scarf);scarf.position.set(0,0.98,-0.26);
  g.traverse(o=>o.castShadow=true);
  g.userData={dyn:1,hip,body,scarf,armL,armR,legL,legR,head};return g;}
const ninja=makeNinja();scene.add(ninja);
const rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xddccaa}));rope.visible=false;scene.add(rope);
let nPhase=0,nPrev=new THREE.Vector3(),nSpeed=0;
function animateNinja(dt){const u=ninja.userData,t=performance.now()*0.001;
  const v=Math.hypot(P.pos.x-nPrev.x,P.pos.z-nPrev.z)/Math.max(dt,1e-3);nPrev.copy(P.pos);nSpeed+=(Math.min(v,8)-nSpeed)*Math.min(1,dt*10);
  nPhase+=dt*nSpeed*1.9;const a=Math.min(1,nSpeed/6.5);const s=Math.sin(nPhase);
  const air=!P.ground&&!P.grap;
  const kb=1-Math.exp(-dt*14),D=(o,ax,v)=>{o.rotation[ax]+=(v-o.rotation[ax])*kb;};
  let lL=air?-0.9:s*0.85*a,lR=air?-0.3:-s*0.85*a,aL=air?-2.4:-s*0.9*a,aR=air?-2.2:s*0.9*a;
  if(P.crouch){lL-=0.9;lR-=0.9;aL-=0.5;aR-=0.5;}if(P.grap){aR=-2.9;aL=-0.5;}
  D(u.legL,'x',lL);D(u.legR,'x',lR);D(u.armL,'x',aL);D(u.armR,'x',aR);D(u.armL,'z',-0.15-(air?0.3:0));D(u.armR,'z',0.15+(air?0.3:0));
  const hy=(P.crouch?0.5:0.78)+Math.abs(Math.cos(nPhase))*0.06*a+(a<0.1?Math.sin(t*2)*0.012:0);u.hip.position.y+=(hy-u.hip.position.y)*kb;
  D(u.hip,'x',P.crouch?0.55:0.14*a+(air?-0.15:0));D(u.head,'y',a<0.1?Math.sin(t*0.7)*0.25:0);
  const st=Math.floor(nPhase/Math.PI);if(st!==u.lastStep&&P.ground&&!P.grap&&a>0.25){u.lastStep=st;stepFx(P.pos.x,P.pos.y,P.pos.z,P.crouch?2:4);}
  if(P.ground&&!u.wasGround&&u.airT>0.25)stepFx(P.pos.x,P.pos.y,P.pos.z,14);u.airT=P.ground?0:(u.airT||0)+dt;u.wasGround=P.ground;
  // scarf: trailing wave that streams back with speed
  const arr=u.scarf.geometry.attributes.position.array,b=u.scarf.userData.base;
  for(let i=0;i<arr.length;i+=3){const k=(0.75-b[i+1])/1.5;// 0 at knot -> 1 tail
    const lift=0.75+a*0.65+(air?0.35:0)+Math.sin(t*3-k*4)*0.08;const L=k*1.5,ang=lift*(1-0.35*k);
    arr[i]=b[i]+L*0.42*Math.sin(k*1.6)+Math.sin(t*8-k*6)*0.13*k*(0.5+a);
    arr[i+1]=-L*Math.cos(ang)+Math.sin(t*10-k*9)*0.05*k*a;
    arr[i+2]=-L*Math.sin(ang);}
  u.scarf.geometry.attributes.position.needsUpdate=true;u.scarf.geometry.computeVertexNormals();}

// ---------- guards ----------
function sprite(txt,col){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.font='bold 54px Arial';x.textAlign='center';x.fillStyle=col;x.strokeStyle='#000';x.lineWidth=5;x.strokeText(txt,32,52);x.fillText(txt,32,52);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));s.scale.set(1,1,1);s.position.y=2.75;s.visible=false;return s;}
const RANGE=15,FOV=Math.cos(THREE.MathUtils.degToRad(33));
const coneGeo=new THREE.ConeGeometry(RANGE*Math.tan(THREE.MathUtils.degToRad(33)),RANGE,24,1,true);coneGeo.translate(0,-RANGE/2,0);coneGeo.rotateX(-Math.PI/2);
const guardDefs=[ [[-1.5,-8],[1.5,-40]], [[2,-30],[-2,-62],[2,-62]], [[0,-55],[0,-90]], [[-10,-97],[10,-97],[10,-118],[-10,-118]], [[12,-20],[12,-45]], [[-13,-72],[-13,-88],[-6,-80]] ];
const SILLY_SEE=['Must have been a very large cat.','Hmm? ...probably my imagination again.','Was that a shadow or a raccoon in pajamas?','I should not have eaten that third rice ball.'];
const SILLY_ALERT=['NINJA! Everyone act natural!','INTRUDER! Somebody grab my sandals!','A NINJA?! On a WEDNESDAY?!','HALT! Or... continue, but slower!'];
const SILLY_KO=['zzz... five more minutes, mom...','*bonk* ...I see tiny cranes...','"Tell my goldfish... I loved him."','*falls over like a polite tree*'];
const robeM=rimify(T(0x3a5d9a),GRIM),robeM2=rimify(T(0x24375e),GRIM),hatM=rimify(T(0xd9b56a),GRIM),pantsM=T(0x2a2a36);
const guards=guardDefs.map((wps,i)=>{const g=new THREE.Group();const body=new THREE.Group();
  const legL=limb(0.11,0.44,pantsM),legR=limb(0.11,0.44,pantsM);legL.position.set(-0.15,0.62,0);legR.position.set(0.15,0.62,0);
  const robe=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.52,0.75,14),robeM);robe.position.y=0.78;
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(0.33,0.35,6,12),robeM2);torso.position.y=1.25;
  const sash=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.05,6,16),T(0xe8d8b0));sash.rotation.x=Math.PI/2;sash.position.y=1.08;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.25,18,14),skinM);head.position.y=1.72;
  const hat=new THREE.Mesh(new THREE.ConeGeometry(0.62,0.3,18),hatM);hat.position.y=1.95;
  [-1,1].forEach(s=>{const e=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,6),new THREE.MeshBasicMaterial({color:0x111111}));e.position.set(s*0.08,1.74,0.235);e.userData.noHull=true;body.add(e);});
  const armL=limb(0.09,0.4,robeM2),armR=limb(0.09,0.4,robeM2);armL.position.set(-0.4,1.45,0);armR.position.set(0.4,1.45,0);
  const spear=new THREE.Group();const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,2.6,6),T(0x5a3a1c));const tip=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.32,6),T(0xdfe6ee));tip.position.y=1.45;
  spear.add(shaft,tip);spear.position.set(0,-0.5,0.12);armR.add(spear);armR.rotation.x=-0.25;
  const lamp=new THREE.Group();const lb=new THREE.Mesh(new THREE.SphereGeometry(0.15,10,8),new THREE.MeshBasicMaterial({color:new THREE.Color(3,1.6,0.6)}));lb.scale.y=1.3;lb.position.y=-0.25;lb.userData.noHull=true;
  const str=new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,0.25),darkWood);str.position.y=-0.05;lamp.add(lb,str);lamp.position.set(0,-0.55,0.15);armL.add(lamp);armL.rotation.x=-0.6;
  body.add(legL,legR,robe,torso,sash,head,hat,armL,armR);g.add(body);body.traverse(o=>{if(o.isMesh)o.castShadow=true;});inkHull(body);
  const cone=new THREE.Mesh(coneGeo,new THREE.MeshBasicMaterial({color:0xffee88,transparent:true,opacity:0.05,depthWrite:false,side:THREE.FrontSide,fog:false}));cone.position.y=1.5;cone.rotation.x=0.12;g.add(cone);
  const q=sprite('?','#ffdd33'),ex=sprite('!','#ff3322');g.add(q,ex);
  g.userData.dyn=1;const y=(wps[0][1]<-100)?1:0;g.position.set(wps[0][0],y,wps[0][1]);scene.add(g);
  return {g,body,cone,q,ex,wps,wi:1,state:'patrol',susp:0,lost:0,wait:0,ko:false,dir:0,lastSeen:new THREE.Vector3(),y,hitCd:0,id:i,limbs:{legL,legR,armL,armR},ph:i,prev:new THREE.Vector3(wps[0][0],y,wps[0][1])};});
function animateGuards(dt){for(const g of guards){const v=g.prev.distanceTo(g.g.position)/Math.max(dt,1e-3);g.prev.copy(g.g.position);if(g.ko)continue;
  const a=Math.min(1,v/2.5);g.ph+=dt*v*2.6;const s=Math.sin(g.ph);const L=g.limbs;
  const kb=1-Math.exp(-dt*10),t=performance.now()*0.001;g.sm=(g.sm||0)+(a-(g.sm||0))*kb;const b=g.sm;
  L.legL.rotation.x+=(s*0.6*b-L.legL.rotation.x)*kb;L.legR.rotation.x+=(-s*0.6*b-L.legR.rotation.x)*kb;
  L.armL.rotation.x+=(-0.6-s*0.25*b+Math.sin(t*1.3+g.id)*0.04-L.armL.rotation.x)*kb;
  L.armR.rotation.x+=((g.state==='alert'?-1.3:g.state==='suspicious'?-0.7:-0.25)+s*0.2*b-L.armR.rotation.x)*kb;
  g.body.rotation.y+=((g.state==='suspicious'&&b<0.2?Math.sin(t*1.6+g.id)*0.6:0)-g.body.rotation.y)*kb;
  if(b>0.3&&Math.floor(g.ph/Math.PI)!==g.lastStep){g.lastStep=Math.floor(g.ph/Math.PI);if(g.g.position.distanceTo(P.pos)<25)stepFx(g.g.position.x,g.g.position.y,g.g.position.z,2);}}}

// ---------- moonlight shafts ----------
const shaftMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.DoubleSide,uniforms:{time:uTime,amt:{value:1}},
 vertexShader:`varying vec2 vUv;varying float vF;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vF=smoothstep(4.,22.,-mv.z);gl_Position=projectionMatrix*mv;}`,
 fragmentShader:`uniform float time,amt;varying vec2 vUv;varying float vF;void main(){float e=smoothstep(0.,.35,vUv.x)*smoothstep(1.,.65,vUv.x);
  float a=e*smoothstep(0.,.25,vUv.y)*smoothstep(1.,.55,vUv.y)*(.65+.35*sin(time*.35+vUv.x*7.+vUv.y*3.));gl_FragColor=vec4(vec3(.42,.55,1.)*a*.075*vF*amt,1.);}`});
{const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),MOONDIR);
 [[-8,-30],[9,-52],[-6,-74],[0,-96],[POND.x,POND.z],[14,-12],[-16,-58]].forEach(([x,z],i)=>{for(let k=0;k<2;k++){const m=new THREE.Mesh(new THREE.PlaneGeometry(3+rnd()*3,46),shaftMat);
  m.quaternion.copy(q);m.rotateY(k*Math.PI/2+i);m.position.set(x,0,z).addScaledVector(MOONDIR,23);m.renderOrder=4;m.frustumCulled=false;scene.add(m);}});}
// ---------- drifting mist layers ----------
const mistMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{time:uTime,fogC:{value:new THREE.Color(0.32,0.42,0.72)},amt:{value:1}},
 vertexShader:`varying vec3 vWP;varying float vF;void main(){vec4 w=modelMatrix*vec4(position,1.);vWP=w.xyz;vec4 mv=viewMatrix*w;vF=smoothstep(3.,16.,-mv.z);gl_Position=projectionMatrix*mv;}`,
 fragmentShader:`uniform float time,amt;uniform vec3 fogC;varying vec3 vWP;varying float vF;
 float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
 void main(){vec2 p=vWP.xz*.045+vec2(time*.012,time*.004)+vWP.y;float m=n(p)*.6+n(p*2.3-time*.01)*.4;float a=smoothstep(.45,.8,m);
  vec2 e=abs(vWP.xz-vec2(0.,-53.))/vec2(36.,75.);float edge=1.-smoothstep(.6,1.,max(e.x,e.y));gl_FragColor=vec4(fogC,a*.1*vF*amt*edge);}`});
[0.6,1.8].forEach((y,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(72,150),mistMat);m.rotation.x=-Math.PI/2;m.position.set(0,y,-50);m.renderOrder=5;scene.add(m);});
// ---------- footstep dust / leaves / splashes (pooled) ----------
const DN=220,dPos=new Float32Array(DN*3),dVel=new Float32Array(DN*3),dLife=new Float32Array(DN),dCol=new Float32Array(DN*3);let dI=0;
const dGeo=new THREE.BufferGeometry();dGeo.setAttribute('position',new THREE.BufferAttribute(dPos,3));dGeo.setAttribute('life',new THREE.BufferAttribute(dLife,1));dGeo.setAttribute('col',new THREE.BufferAttribute(dCol,3));
const dust=new THREE.Points(dGeo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,
 vertexShader:`attribute float life;attribute vec3 col;varying float vL;varying vec3 vC;void main(){vL=life;vC=col;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=(life>0.?(1.6-life)*7.*(300./-mv.z)*.06:0.);gl_Position=projectionMatrix*mv;}`,
 fragmentShader:`varying float vL;varying vec3 vC;void main(){float d=length(gl_PointCoord-.5);if(d>.5||vL<=0.)discard;gl_FragColor=vec4(vC,smoothstep(.5,.2,d)*min(vL,1.)*.75);}`}));
dust.frustumCulled=false;dust.renderOrder=6;scene.add(dust);
function emit(x,y,z,n,col,spd,up){for(let i=0;i<n;i++){const k=dI++%DN;dPos.set([x+(Math.random()-.5)*.3,y+.05,z+(Math.random()-.5)*.3],k*3);
  dVel.set([(Math.random()-.5)*spd,up*(0.5+Math.random()),(Math.random()-.5)*spd],k*3);dLife[k]=1;dCol.set([col.r,col.g,col.b],k*3);}}
function updateDust(dt){for(let k=0;k<DN;k++){if(dLife[k]<=0)continue;dLife[k]-=dt*1.6;dVel[k*3+1]-=dt*2.2;for(let j=0;j<3;j++)dPos[k*3+j]+=dVel[k*3+j]*dt;}
  dGeo.attributes.position.needsUpdate=dGeo.attributes.life.needsUpdate=dGeo.attributes.col.needsUpdate=true;}
const DUSTC=new THREE.Color(0.55,0.55,0.65),LEAFC=new THREE.Color(0.3,0.6,0.35),SPLASHC=new THREE.Color(0.8,0.9,1.3),PETALC=new THREE.Color(1,0.65,0.8);
function stepFx(x,y,z,n=4){if(y>0.3){emit(x,y,z,n,DUSTC,0.8,0.4);return;}if(inPond(x,z))emit(x,0.1,z,n*2,SPLASHC,1.6,1.8);else if(Math.abs(x)>4.3)emit(x,y,z,n,Math.random()<0.3?PETALC:LEAFC,1,0.9);else emit(x,y,z,n,DUSTC,0.9,0.35);}

// ---------- static geometry merge (draw-call reduction) ----------
function mergeStatic(){scene.updateMatrixWorld(true);const skip=new Set();[...lanterns,scroll,exitRing,ground,street].forEach(o=>o.traverse(c=>skip.add(c)));
 const groups=new Map(),remove=[];
 scene.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||skip.has(o))return;const m=o.material;if(Array.isArray(m)||m.isShaderMaterial||m.transparent)return;
  for(let p=o;p;p=p.parent)if(p.userData.dyn)return;
  const key=m.uuid+(o.castShadow?'s':'')+(o.receiveShadow?'r':'');if(!groups.has(key))groups.set(key,{m,cast:o.castShadow,rec:o.receiveShadow,geos:[]});
  let g=o.geometry.clone();if(g.index)g=g.toNonIndexed();g.applyMatrix4(o.matrixWorld);
  for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
  if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  g.morphAttributes={};g.clearGroups();groups.get(key).geos.push(g);remove.push(o);});
 remove.forEach(o=>o.parent&&o.parent.remove(o));let n=0;
 for(const {m,cast,rec,geos} of groups.values()){const mg=mergeGeometries(geos,false);if(!mg)continue;const mesh=new THREE.Mesh(mg,m);mesh.castShadow=cast;mesh.receiveShadow=rec;mesh.matrixAutoUpdate=false;scene.add(mesh);n++;}
 return [remove.length,n];}
const MERGE_STATS=mergeStatic();

// ---------- post-processing: ink edges + bloom + ACES + grade ----------
const rtScene=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:QP[quality].msaa});
rtScene.depthTexture=new THREE.DepthTexture(1,1);rtScene.depthTexture.type=THREE.UnsignedIntType;
const composer=new EffectComposer(renderer);
const inkPass=new ShaderPass({uniforms:{tScene:{value:rtScene.texture},tDepth:{value:rtScene.depthTexture},near:{value:camera.near},far:{value:camera.far},res:{value:new THREE.Vector2()},ink:{value:1}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`#include <packing>
 uniform sampler2D tScene,tDepth;uniform float near,far,ink;uniform vec2 res;varying vec2 vUv;
 float lz(vec2 uv){float d=texture2D(tDepth,uv).x;return -perspectiveDepthToViewZ(d,near,far);}
 void main(){vec3 col=texture2D(tScene,vUv).rgb;if(ink<.5){gl_FragColor=vec4(col,1.);return;}
  vec2 px=1./res;float c=lz(vUv);
  float l=lz(vUv-vec2(px.x,0.)),r=lz(vUv+vec2(px.x,0.)),u=lz(vUv+vec2(0.,px.y)),d=lz(vUv-vec2(0.,px.y));
  float sil=max(max(l,r),max(u,d))-c;float silE=smoothstep(.06,.12,sil/c);
  float ic=1./c;float lap=abs(1./l+1./r-2.*ic)+abs(1./u+1./d-2.*ic);float crE=smoothstep(.0035,.008,lap/ic);
  float e=max(silE,crE*.8)*exp(-c*.012)*step(c,far*.8);
  col=mix(col,vec3(.008,.008,.025),e*.88);
  gl_FragColor=vec4(col,1.);}`},'tNone');
inkPass.uniforms.tScene.value=rtScene.texture;inkPass.uniforms.tDepth.value=rtScene.depthTexture;composer.addPass(inkPass);
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.6,0.5,0.95);composer.addPass(bloom);
composer.addPass(new OutputPass());
const gradePass=new ShaderPass({uniforms:{tDiffuse:{value:null},time:uTime,hid:{value:0},alert:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float time,hid,alert;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float L=dot(c,vec3(.299,.587,.114));
  c=mix(vec3(L),c,1.18-hid*.45);vec2 qq=vUv-.5;float vg=smoothstep(.25,.75,length(qq*vec2(1.3,1.)));c=mix(c,c*vec3(.35,.42,.7),vg*hid*.8);c=mix(c,c*vec3(1.4,.45,.4),vg*alert*(.55+.25*sin(time*7.)));c+=vec3(-.01,.0,.035)*(1.-L);c=mix(c,c*vec3(1.05,1.0,.94),smoothstep(.45,1.,L));
  vec2 q=vUv-.5;c*=1.-dot(q,q)*.75;float g=fract(sin(dot(vUv*999.+time,vec2(12.9,78.2)))*43758.5);c+=(g-.5)*.012;gl_FragColor=vec4(c,1.);}`});
composer.addPass(gradePass);
let dynPR=1,autoLvl=0;const PRMIN=0.5;function applyQuality(){const q=QP[quality];dynPR=Math.min(devicePixelRatio,q.pr);renderer.setPixelRatio(dynPR);onResize();if(rtScene.samples!==q.msaa){rtScene.samples=q.msaa;rtScene.dispose();}shaftMat.uniforms.amt.value=mistMat.uniforms.amt.value=q.fx;moon.shadow.autoUpdate=true;if(q.adaptive)setAuto(0);bloom.enabled=q.bloom;inkPass.uniforms.ink.value=q.ink?1:0;grass.count=Math.floor(grass.userData.max*q.grass);localStorage.setItem('ms_quality',quality);}
function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);
  const pr=renderer.getPixelRatio();rtScene.setSize(innerWidth*pr,innerHeight*pr);inkPass.uniforms.res.value.set(innerWidth*pr,innerHeight*pr);}
addEventListener('resize',onResize);applyQuality();
let fpsAcc=0,fpsN=0,fpsT=0,fpsShow=0;
function adapt(dt){fpsAcc+=dt;fpsN++;if(fpsAcc<1)return;const fps=fpsN/fpsAcc;fpsShow=fps;fpsAcc=0;fpsN=0;if(!QP[quality].adaptive)return;
  let np=dynPR;if(fps<45)np=Math.max(PRMIN,dynPR*(fps<20?0.7:0.88));else if(fps>58)np=Math.min(Math.min(devicePixelRatio,QP.auto.pr),dynPR*1.08);
  if(Math.abs(np-dynPR)>0.02){dynPR=np;renderer.setPixelRatio(dynPR);onResize();}
  // degrade ladder once resolution is at its floor: 1 bloom off, 2 fewer grass + cheap shadows, 3 no MSAA + no ink
  if(dynPR<=PRMIN+0.01&&fps<30&&autoLvl<3)setAuto(autoLvl+1);else if(fps>55&&autoLvl>0)setAuto(autoLvl-1);}
function setAuto(l){autoLvl=l;bloom.enabled=l<1;grass.count=Math.floor(grass.userData.max*(l>=2?0.25:QP.auto.grass));
  const ss=l>=2?1024:2048;if(moon.shadow.mapSize.x!==ss){moon.shadow.mapSize.set(ss,ss);moon.shadow.map?.dispose();moon.shadow.map=null;}
  inkPass.uniforms.ink.value=l>=3?0:1;const ms=l>=3?0:QP.auto.msaa;if(rtScene.samples!==ms){rtScene.samples=ms;rtScene.dispose();}}
let frameN=0;
function render(){uTime.value=performance.now()*0.001;bakeSky(uTime.value);frameN++;if(quality==='low'||(QP[quality].adaptive&&autoLvl>=2))moon.shadow.autoUpdate=frameN%3===0;renderer.setRenderTarget(rtScene);renderer.render(scene,camera);renderer.setRenderTarget(null);composer.render();}

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
  if(e.code==='KeyQ'){quality=QUALS[(QUALS.indexOf(quality)+1)%QUALS.length];applyQuality();toast('Graphics quality: '+quality.toUpperCase(),1.5);}
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
  const gx=THREE.MathUtils.clamp(p.x,best.minX+0.5,best.maxX-0.5),gz=THREE.MathUtils.clamp(p.z,best.minZ+0.5,best.maxZ-0.5);return new THREE.Vector3(gx,topAt(best,gx,gz),gz);}
function grapple(){if(P.grap)return;const t=grappleTarget();if(!t){toast('No roof to hook onto there.',1);return;}P.grap=t;P.vy=0;rope.visible=true;snd.sfx('grapple');}
function takedown(){for(const g of guards){if(g.ko)continue;tmp.subVectors(P.pos,g.g.position);tmp.y=0;const d=tmp.length();if(d>2.3||Math.abs(P.pos.y-g.g.position.y)>1.2)continue;
  const fwd=tmp2.set(Math.sin(g.dir),0,Math.cos(g.dir));if(fwd.dot(tmp.normalize())<-0.2||g.state!=='alert'&&g.susp<0.5&&d<1.4||g.state==='patrol'&&fwd.dot(tmp)<0.3){
   g.ko=true;g.state='ko';g.susp=0;g.cone.visible=false;g.q.visible=g.ex.visible=false;stats.kills++;snd.sfx('takedown');toast(SILLY_KO[(Math.random()*4)|0]);return;}}
  toast('Get closer — and sneak up from BEHIND!',1.2);}
function groundAt(x,z,y,r0=0.35){let gy=0;for(const c of colliders){const r=c.h?0.05:r0;if(x>c.minX-r&&x<c.maxX+r&&z>c.minZ-r&&z<c.maxZ+r&&topAt(c,x,z)<=y+0.45&&topAt(c,x,z)>gy)gy=topAt(c,x,z);}return gy;}
function collide(p,r,h){for(const c of colliders){if(p.y>=topAt(c,p.x,p.z)-0.45||p.y+h<=c.bot)continue;
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
    g.cone.material.color.set(g.state==='alert'?0xff2222:g.state==='suspicious'?0xffaa00:0xffee88);g.cone.material.opacity=g.state==='patrol'?0.045:0.12;
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
  $('rank').innerHTML=`Rank: <b>${r}</b><div style="font-size:16px;color:#4a3a2a;margin-top:4px">${sub}</div>`;
  const m=Math.floor(stats.time/60),s=Math.floor(stats.time%60);
  $('stats').innerHTML=`<tr><td>Stealth takedowns</td><td>${stats.kills}</td></tr><tr><td>Times spotted</td><td>${stats.spotted}</td></tr><tr><td>Time</td><td>${m}:${String(s).padStart(2,'0')}</td></tr><tr><td>Scroll</td><td>${hasScroll?'Pickled &amp; secured':'Still missing'}</td></tr>`;
  show('end',1);}

// ---------- loop ----------
const clock=new THREE.Clock();const camDes=new THREE.Vector3(),camLook=new THREE.Vector3();let mxS0=0;
const flyPath=new THREE.CatmullRomCurve3([[0,12,30],[3,5,0],[-1,6,-24],[2,9,-48],[-2,7,-72],[-14,9,-96],[-22,7,-112],[-6,14,-128],[18,22,-104],[24,30,-60],[16,18,-10],[8,11,18]].map(a=>new THREE.Vector3(...a)),true,'catmullrom',0.4);
let titleSnap=true;function titleCam(dt){lt+=dt;const u=(lt/75)%1,pos=flyPath.getPointAt(u),ahead=flyPath.getPointAt((u+0.02)%1).sub(pos).normalize();
  ahead.y=0;ahead.normalize();const want=ahead.multiplyScalar(0.4).add(tmp2.set(MOONDIR.x,0,MOONDIR.z).normalize().multiplyScalar(0.6)).normalize();want.y=0.06;
  const snap=titleSnap;titleSnap=false;camera.position.lerp(pos,snap?1:1-Math.exp(-dt*3));camLook.lerp(tmp2.copy(camera.position).addScaledVector(want,12),snap?1:1-Math.exp(-dt*2.5));camera.lookAt(camLook);
  moon.target.position.set(Math.round(camera.position.x/4)*4,0,Math.round(camera.position.z/4)*4-25);moon.position.copy(moon.target.position).addScaledVector(MOONDIR,120);}
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
  ninja.position.copy(P.pos);animateNinja(dt);ninja.visible=!(P.inv>0&&Math.floor(P.inv*10)%2);
  // camera
  const cd=P.crouch?4.4:5.4;camDes.set(P.pos.x-Math.sin(yaw)*Math.cos(pitch)*cd,P.pos.y+1.9+Math.sin(pitch)*cd,P.pos.z-Math.cos(yaw)*Math.cos(pitch)*cd);
  {const h=new THREE.Vector3(P.pos.x,P.pos.y+1.6,P.pos.z),dir=camDes.clone().sub(h),L=dir.length();ray.set(h,dir.normalize());ray.far=L;const hit=ray.intersectObjects(solids,false)[0];if(hit)camDes.copy(h).addScaledVector(dir,Math.max(0.6,hit.distance-0.3));}
  const kc=1-Math.exp(-dt*(P.grap?18:11));camera.position.lerp(camDes,kc);camLook.lerp(tmp2.set(P.pos.x,P.pos.y+2.15,P.pos.z),1-Math.exp(-dt*16));camera.lookAt(camLook);
  moon.target.position.set(Math.round(P.pos.x/2)*2,0,Math.round(P.pos.z/2)*2);moon.position.copy(moon.target.position).addScaledVector(MOONDIR,120);
  gradePass.uniforms.hid.value+=(((P.crouch&&mxS0<0.3)?1:0)-gradePass.uniforms.hid.value)*Math.min(1,dt*3);gradePass.uniforms.alert.value+=((mxS0>=1?1:0)-gradePass.uniforms.alert.value)*Math.min(1,dt*3);
  const maxS=updateGuards(dt);mxS0=maxS;animateGuards(dt);
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
let lt=0;function frame(){requestAnimationFrame(frame);const rawDt=clock.getDelta(),dt=Math.min(rawDt,0.05);
  lanterns.forEach((l,i)=>l.rotation.z=Math.sin(performance.now()*0.0015+i)*0.1);
  if(mode==='play')update(dt);else if(mode==='title')titleCam(dt);
  updateKoi(performance.now()*0.001);updateDust(dt);adapt(rawDt);
  render();}
reset();frame();
window.__game={renderer,scene,grass,bloom,inkPass,moon,set lt(v){lt=v;titleSnap=true},get fps(){return fpsShow},get pr(){return dynPR.toFixed(2)+' lvl'+autoLvl},MERGE_STATS,get quality(){return quality},start,P,guards,get stats(){return stats},get mode(){return mode},set yaw(v){yaw=v},set pitch(v){pitch=v},finish};
