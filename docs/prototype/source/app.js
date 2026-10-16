import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const time = { value: 0 };
const $ = (id) => document.getElementById(id);
// the composer is a rich text box: bold shows as bold while you type; .value reads it back as Markdown for the chat
{
  const ed = document.getElementById('chatInput');
  const md = (n) => [...n.childNodes].map((c) => {
    if (c.nodeType === 3) return c.nodeValue.replace(/\u00a0/g, ' ');
    if (c.nodeName === 'BR') return c.nextSibling ? '\n' : '';
    const inner = md(c), t = c.nodeName, st = c.getAttribute?.('style') ?? '', wrap = (m) => (inner.trim() ? `${m}${inner}${m}` : inner);
    if (t === 'B' || t === 'STRONG' || /font-weight:\s*(bold|[6-9]00)/.test(st)) return wrap('**');
    if (t === 'I' || t === 'EM' || /font-style:\s*italic/.test(st)) return wrap('*');
    if (t === 'U') return wrap('__');
    if (t === 'S' || t === 'STRIKE' || t === 'DEL') return wrap('~~');
    if (t === 'DIV' || t === 'P') return (c.previousSibling ? '\n' : '') + inner;
    return inner;
  }).join('');
  const toEnd = () => { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
  const mark = () => ed.classList.toggle('empty', !ed.textContent);
  Object.defineProperty(ed, 'value', { get: () => md(ed), set: (v) => { ed.textContent = v; mark(); if (document.activeElement === ed) toEnd(); } });
  Object.defineProperty(ed, 'placeholder', { get: () => ed.dataset.placeholder, set: (v) => { ed.dataset.placeholder = v; } });
  // the plain text before the caret (mentions read it)
  ed.textBefore = () => { const sel = getSelection(); if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return ed.textContent; const r = sel.getRangeAt(0).cloneRange(); r.setStart(ed, 0); return r.toString(); };
  let byPointer = false;
  ed.addEventListener('pointerdown', () => { byPointer = true; });
  ed.addEventListener('focus', () => { if (!byPointer) toEnd(); byPointer = false; });
  ed.addEventListener('input', mark);
  ed.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  // the format buttons show what the caret is in
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== ed) return;
    document.querySelectorAll('#fmtBar button[data-f]').forEach((b) => { const c = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' }[b.dataset.f]; if (c) b.classList.toggle('on', document.queryCommandState(c)); });
  });
}
let hotSet = new Set(), labelExtras = false; // labels get friends and first words once everything is defined
let loaded = false, loadedAt = 0, onLoaded = () => {};
// line icons, one stroke style everywhere (no emoji in the interface)
const ICONS = {"link": "<path d=\"M6.5 9.5l3-3M7 4.6l1-1a2.6 2.6 0 0 1 3.7 3.7l-1 1M9 11.4l-1 1a2.6 2.6 0 0 1-3.7-3.7l1-1\"/>", "comet": "<circle cx=\"11.5\" cy=\"4.5\" r=\"2\"/><path d=\"M10 6 3 13M8.2 4.6 3.6 9.2M11.4 7.8 6.8 12.4\"/>", "bookmark": "<path d=\"M4.5 2.5h7v11L8 11l-3.5 2.5z\"/>", "expand": "<path d=\"M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9\"/>", "close": "<path d=\"M4 4l8 8M12 4l-8 8\"/>", "smile": "<circle cx=\"8\" cy=\"8\" r=\"5.75\"/><path d=\"M5.8 9.4c1.2 1.4 3.2 1.4 4.4 0\"/><circle cx=\"6.1\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"9.9\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/>", "plus": "<path d=\"M8 3v10M3 8h10\"/>", "send": "<path d=\"M8 13V3.5M3.5 7.5 8 3l4.5 4.5\"/>", "code": "<path d=\"M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5\"/>", "block": "<rect x=\"2\" y=\"2.5\" width=\"12\" height=\"11\" rx=\"2\"/><path d=\"M6.5 6 4.5 8l2 2M9.5 6l2 2-2 2\"/>", "ul": "<circle cx=\"3\" cy=\"4.5\" r=\".9\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"3\" cy=\"8\" r=\".9\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"3\" cy=\"11.5\" r=\".9\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M6 4.5h8M6 8h8M6 11.5h8\"/>", "ol": "<path d=\"M2.4 3.2 3.4 2.6v3.2M2.3 8.1c.2-.6 1.7-.6 1.7.3 0 .7-1.7 1.3-1.7 2h1.8M6.5 4.5h7.5M6.5 9.5h7.5\" stroke-width=\"1.3\"/>", "quote": "<path d=\"M3 3.5v9M6.5 5h7M6.5 8h7M6.5 11h4.5\"/>", "pause": "<path d=\"M5.5 4v8M10.5 4v8\"/>", "play": "<path d=\"M5 3.5v9l7-4.5z\" fill=\"currentColor\"/>", "reply": "<path d=\"M6.5 4.5 3 8l3.5 3.5\"/><path d=\"M3 8h6.5a3.5 3.5 0 0 1 3.5 3.5v1\"/>", "thread": "<path d=\"M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z\"/><path d=\"M5.5 6h5M5.5 8h3\"/>", "pin": "<path d=\"M9.8 2.5 13.5 6.2l-1.6.5-2.5 2.5-.3 2.9-.9.9-4.8-4.8.9-.9 2.9-.3 2.5-2.5z\"/><path d=\"M5.3 10.7 2.5 13.5\"/>", "more": "<circle cx=\"3.5\" cy=\"8\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"8\" cy=\"8\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12.5\" cy=\"8\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/>", "pencil": "<path d=\"M10.5 3 13 5.5 6 12.5H3.5V10z\"/>", "shrink": "<path d=\"M13.5 6.5h-4v-4M9.5 6.5l4-4M2.5 9.5h4v4M6.5 9.5l-4 4\"/>"};
const icon = (n, w = 16) => { const t = document.createElement('template'); t.innerHTML = `<svg width="${w}" height="${w}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`; return t.content.firstChild; };

{
  const bar = $('loaderBar'), pct = $('loaderPct');
  let target = 0, shown = 0;
  const reveal = () => { $('loader').classList.add('done'); $('loader').setAttribute('aria-busy', 'false'); onLoaded(); setTimeout(() => $('loader').remove(), 2000); };
  // the counter glides toward the real texture progress instead of jumping
  const tick = () => {
    shown += (target - shown) * (reduced ? 1 : 0.07);
    if (target === 1 && shown > 0.996) shown = 1;
    bar.style.transform = `scaleX(${shown})`; pct.textContent = String(Math.round(shown * 100));
    if (shown < 1) requestAnimationFrame(tick); else setTimeout(reveal, 250);
  };
  requestAnimationFrame(tick);
  const finish = () => { if (loaded) return; loaded = true; loadedAt = performance.now(); target = 1; };
  THREE.DefaultLoadingManager.onProgress = (url, n, total) => { target = Math.max(target, n / total); };
  THREE.DefaultLoadingManager.onLoad = finish;
  THREE.DefaultLoadingManager.onError = () => {};
  setTimeout(finish, 9000);
}

// ---------- renderer, camera, controls, bloom ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 9000);
camera.position.set(0, 186, 255);
scene.add(camera);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.zoomToCursor = true;
controls.autoRotate = !reduced;
controls.autoRotateSpeed = 0.18;
controls.minDistance = 3;
controls.maxDistance = 2000;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// planet view: the scene without the focused world, then the plate, then the focused world (with its air, rings, moons and satellites) over it
const plateU = { uRect: { value: new THREE.Vector4() }, uRes: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } };
const plateScene = new THREE.Scene();
const plateQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: plateU, transparent: true, depthTest: false, depthWrite: true,
  vertexShader: 'void main(){ gl_Position=vec4(position.xy,0.9999,1.0); }',
  fragmentShader: `uniform vec4 uRect; uniform vec3 uRes; uniform vec3 uColor; uniform float uAlpha;
    void main(){
      vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uRes.z;
      if(p.x>uRect.z) discard;
      vec2 hs=vec2(uRect.z+60.0-uRect.x,uRect.w-uRect.y)*0.5, c=uRect.xy+hs;
      vec2 q=abs(p-c)-hs+28.0; float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-28.0;
      if(d>1.0) discard;
      vec3 col=uColor;
      col=mix(col,vec3(1.0),0.045*(1.0-smoothstep(0.6,1.2,length(mod(p-uRect.xy,14.0)-7.0))));
      // the right edge melts into space instead of cutting it
      float melt=1.0-smoothstep(uRect.z-110.0,uRect.z,p.x);
      gl_FragColor=vec4(col,uAlpha*clamp(0.5-d,0.0,1.0)*melt*(0.6+0.4*melt));
    }`,
}));
plateQuad.frustumCulled = false; plateScene.add(plateQuad);
const platePass = new RenderPass(plateScene, new THREE.Camera()); platePass.clear = false; platePass.enabled = false;
const focusCam = new THREE.PerspectiveCamera();
const focusPass = new RenderPass(scene, focusCam); focusPass.clear = false; focusPass.enabled = false;
composer.addPass(platePass); composer.addPass(focusPass);
const FOCUS_LAYER = 2;
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.55, 0.8);
composer.addPass(bloom);
// Travel: a light radial blur and colour fringe, centred where the camera is really heading.
const motion = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uStrength: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uCenter; uniform float uStrength; varying vec2 vUv;
    void main(){
      vec2 d=vUv-uCenter; float r=length(d);
      vec3 acc=vec3(0.0); float tot=0.0;
      for(int i=0;i<12;i++){
        float t=float(i)/11.0;
        vec2 uv=uCenter+d*(1.0-uStrength*0.07*t*r);
        vec2 fringe=d*uStrength*0.004*t;
        float w=1.0-t*0.55;
        acc+=vec3(texture2D(tDiffuse,uv+fringe).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-fringe).b)*w;
        tot+=w;
      }
      gl_FragColor=vec4(acc/tot,1.0);
    }`,
});
motion.enabled = false;
composer.addPass(motion);
composer.addPass(new OutputPass());
const overlay = new THREE.WebGLRenderer({ canvas: $('adOverlay'), alpha: true, antialias: true });
overlay.setPixelRatio(Math.min(devicePixelRatio, 2));
overlay.toneMapping = THREE.ACESFilmicToneMapping;
overlay.setClearColor(0x000000, 0);
// the focused world, depth only, so the satellite hides when it passes behind it
const occluder = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ colorWrite: false }));
occluder.layers.set(1); occluder.renderOrder = -1;
const moonOccluders = [];
let overlayOn = false, overlayCut = -1;
const chatW = () => (innerWidth < 1400 ? 320 : 360);
const film = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: time, uPlate: { value: new THREE.Vector4(-1, -1, -1, -1) }, uPlateA: { value: 0 }, uMelt: { value: 0.05 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec4 uPlate; uniform float uPlateA; uniform float uMelt; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uTime*7.0)*43758.5453); }
    void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb; float v=smoothstep(0.95,0.35,length(vUv-0.5)); float p=step(uPlate.x,vUv.x)*(1.0-smoothstep(uPlate.z-uMelt,uPlate.z,vUv.x))*step(uPlate.y,vUv.y)*step(vUv.y,uPlate.w)*uPlateA; c*=mix(mix(0.72,1.0,v),1.0,p); c+=(rnd(vUv*vec2(1920.0,1080.0))-0.5)*0.035*(1.0-p); gl_FragColor=vec4(c,1.0); }`,
});
composer.addPass(film);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  overlay.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- seeded randomness: same address, same planet ----------
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- shaders ----------
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float f=0.0,a=0.5;for(int i=0;i<5;i++){f+=a*snoise(p);p*=2.03;a*=0.5;}return f;}
`;
const VERT = `
varying vec3 vObj; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){ vObj=position; vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }
`;
const SUN_POS = new THREE.Vector3(0, 0, 0);

const planetMaterial = (type, cols, seed, look, radius, sun = SUN_POS) => new THREE.ShaderMaterial({
  uniforms: {
    uType: { value: type }, uA: { value: cols[0] }, uB: { value: cols[1] }, uC: { value: cols[2] }, uSeed: { value: seed }, uTime: time, uSun: { value: sun },
    uScan: { value: -1 }, uRingIn: { value: 0 }, uRingOut: { value: 0 }, uRingN: { value: new THREE.Vector3(0, 1, 0) }, uCenter: { value: new THREE.Vector3() }, uMap: { value: look.map }, uHue: { value: look.hue }, uSat: { value: look.sat }, uGain: { value: look.gain }, uOff: { value: (seed % 1) + seed * 0.013 }, uBump: { value: 0.01 * radius },
  },
  vertexShader: VERT,
  fragmentShader: `
uniform int uType; uniform vec3 uA,uB,uC; uniform float uSeed,uTime; uniform vec3 uSun;
uniform sampler2D uMap; uniform float uHue,uSat,uGain,uOff,uBump,uScan,uRingIn,uRingOut; uniform vec3 uRingN,uCenter;
varying vec3 vObj; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
${NOISE}
vec3 hue(vec3 c,float a){const vec3 k=vec3(0.57735);float ca=cos(a);return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.0-ca);}
vec3 relief(vec3 pos,vec3 n,float h,float s){
  vec3 sx=dFdx(pos),sy=dFdy(pos); vec3 r1=cross(sy,n),r2=cross(n,sx); float det=dot(sx,r1);
  vec3 grad=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);
  return normalize(abs(det)*n-grad*s);
}
void main(){
  vec3 p=normalize(vObj); vec3 sd=vec3(uSeed,uSeed*0.37,uSeed*0.71);
  vec3 tex=texture2D(uMap,vec2(vUv.x+uOff,vUv.y)).rgb;
  float lum=dot(tex,vec3(0.3,0.59,0.11));
  vec3 base=max(hue(mix(vec3(lum),tex,uSat),uHue),0.0)*uGain;
  vec3 col; vec3 glow=vec3(0.0); float spec=0.0; float h=0.0; float bump=0.0;
  if(uType==0){
    vec3 q=p+0.06*vec3(fbm(p*3.0+sd+uTime*0.01),fbm(p*3.0+sd*1.3),0.0);
    col=base*(0.88+0.24*fbm(q*vec3(2.0,9.0,2.0)+sd));
    float storm=smoothstep(0.15,0.0,length(p-normalize(vec3(0.6,-0.25,0.75))));
    col=mix(col,uC,storm*0.45);
  } else if(uType==1){
    float hh=fbm(p*1.8+sd);
    float land=smoothstep(0.03,0.08,hh);
    vec3 ocean=mix(uA*0.3,uA*0.9,smoothstep(-0.5,0.05,hh));
    vec3 ground=mix(uB,uC,smoothstep(0.1,0.5,hh+fbm(p*6.0+sd)*0.2))*(0.55+0.9*lum);
    col=mix(ocean,ground,land);
    float ice=smoothstep(0.72,0.86,abs(p.y)+fbm(p*4.0+sd)*0.12);
    col=mix(col,vec3(0.56,0.6,0.64),ice);
    spec=(1.0-land)*(1.0-ice); h=land*(hh*2.0+lum); bump=uBump;
  } else if(uType==2){
    float cr=smoothstep(0.55,0.8,snoise(p*6.0+sd*2.0));
    col=base*(1.0-cr*0.25); h=lum+cr*0.3; bump=uBump;
  } else if(uType==3){
    float r=pow(1.0-abs(snoise(p*5.0+sd)),24.0);
    col=mix(base,base*vec3(0.74,0.83,0.95),r*0.65); spec=0.3; h=lum*0.5-r*0.15; bump=uBump*0.6;
  } else {
    col=base*0.35;
    float cr=pow(1.0-abs(snoise(p*4.0+sd+vec3(0.0,uTime*0.01,0.0))),14.0);
    glow=uC*cr*3.0; h=lum; bump=uBump;
  }
  vec3 N0=normalize(vN);
  vec3 N=bump>0.0?relief(vW,N0,h,bump):N0;
  vec3 L=normalize(uSun-vW); vec3 V=normalize(cameraPosition-vW);
  float d0=dot(N0,L), d=dot(N,L);
  float lit0=smoothstep(-0.06,0.4,d0);
  float shade=1.0;
  if(uRingOut>0.0){
    float den=dot(L,uRingN);
    if(abs(den)>1e-4){
      float t=dot(uCenter-vW,uRingN)/den;
      if(t>0.0){ float rr=length(vW+L*t-uCenter); float k=(rr-uRingIn)/(uRingOut-uRingIn);
        if(k>0.0&&k<1.0) shade*=1.0-0.65*smoothstep(0.0,0.08,k)*smoothstep(1.0,0.9,k)*(0.7+0.3*sin(k*70.0+uSeed)); }
    }
  }
  if(uType==1) shade*=1.0-0.4*smoothstep(0.08,0.55,fbm(p*3.0+vec3(uSeed)+vec3(uTime*0.006,0.0,0.0)));
  float day=lit0*clamp(0.4+d*0.9,0.0,1.3)*shade;
  float limb=uType==0?mix(0.5,1.0,pow(max(dot(N0,V),0.0),0.45)):1.0;
  float sp=pow(max(dot(N,normalize(L+V)),0.0),160.0)*spec*lit0;
  vec3 c=col*(0.004+1.3*day)*limb+vec3(0.85,0.9,1.0)*sp*0.3;
  c+=col*vec3(0.35,0.1,0.0)*smoothstep(0.22,0.0,abs(d0-0.04))*0.4;
  if(uScan>0.0&&uScan<1.0){
    float la=asin(clamp(p.y,-1.0,1.0))*6.0/3.14159; float lo=atan(p.z,p.x)*12.0/6.28318;
    float g=max(1.0-smoothstep(0.0,1.5*fwidth(la),min(fract(la),1.0-fract(la))),1.0-smoothstep(0.0,1.5*fwidth(lo),min(fract(lo),1.0-fract(lo))));
    float band=mix(1.15,-1.15,uScan);
    float fade=1.0-smoothstep(0.8,1.0,uScan);
    c+=vec3(0.85,1.0,0.96)*(g*0.45*step(band,p.y)+exp(-pow((p.y-band)*14.0,2.0))*0.9)*fade;
  }
  c+=vec3(0.45,0.6,0.85)*pow(1.0-max(dot(N0,V),0.0),5.0)*(1.0-lit0)*0.22;
  gl_FragColor=vec4(c+glow*(1.0-lit0*0.7),1.0);
}`,
});

// The air seen from orbit: density falls with the altitude of each view ray's closest approach.
const haloMaterial = (color, power, center, R, Rs, sun = SUN_POS) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: color }, uPower: { value: power }, uCenter: { value: center }, uR: { value: R }, uRs: { value: Rs }, uSun: { value: sun } },
  vertexShader: VERT,
  fragmentShader: `
uniform vec3 uColor,uCenter,uSun; uniform float uPower,uR,uRs;
varying vec3 vW;
void main(){
  vec3 rd=normalize(vW-cameraPosition); vec3 oc=uCenter-cameraPosition;
  float tca=dot(oc,rd); float d=sqrt(max(dot(oc,oc)-tca*tca,0.0));
  float x=clamp((d-uR)/(uRs-uR),0.0,1.0);
  float dens=exp(-x*5.0)*(1.0-x);
  vec3 P=cameraPosition+rd*tca;
  float lit=smoothstep(-0.35,0.6,dot(normalize(P-uCenter),normalize(uSun-uCenter)));
  gl_FragColor=vec4(min(uColor*dens*lit*uPower,vec3(0.85)),1.0);
}`,
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});

const atmosphereMaterial = (color, power, sun = SUN_POS) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: color }, uSun: { value: sun }, uPower: { value: power } },
  vertexShader: VERT,
  fragmentShader: `
uniform vec3 uColor; uniform vec3 uSun; uniform float uPower;
varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW); vec3 L=normalize(uSun-vW);
  float f=pow(1.0-max(dot(N,V),0.0),3.0);
  float lightSide=smoothstep(-0.3,0.6,dot(N,L));
  gl_FragColor=vec4(min(uColor*f*lightSide*uPower,vec3(0.7)),1.0);
}`,
  blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});

const cloudMaterial = (seed, sun = SUN_POS) => new THREE.ShaderMaterial({
  uniforms: { uSeed: { value: seed }, uTime: time, uSun: { value: sun } },
  vertexShader: VERT,
  fragmentShader: `
uniform float uSeed,uTime; uniform vec3 uSun;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
${NOISE}
void main(){
  vec3 p=normalize(vObj);
  float c=smoothstep(0.08,0.55,fbm(p*3.0+vec3(uSeed)+vec3(uTime*0.006,0.0,0.0)));
  float day=smoothstep(-0.1,0.4,dot(normalize(vN),normalize(uSun-vW)));
  gl_FragColor=vec4(vec3(1.0)*(0.01+1.1*day),c*0.8);
}`,
  transparent: true, depthWrite: false,
});

const ringMaterial = (inner, outer, seed, color, center, radius, sun = SUN_POS) => new THREE.ShaderMaterial({
  uniforms: { uIn: { value: inner }, uOut: { value: outer }, uSeed: { value: seed }, uColor: { value: color }, uSun: { value: sun }, uCenter: { value: center }, uR: { value: radius } },
  vertexShader: VERT,
  fragmentShader: `
uniform float uIn,uOut,uSeed,uR; uniform vec3 uColor,uSun,uCenter;
varying vec3 vObj; varying vec3 vW; varying vec3 vN;
${NOISE}
void main(){
  float t=(length(vObj.xy)-uIn)/(uOut-uIn);
  if(t<0.0||t>1.0) discard;
  float fine=snoise(vec3(t*150.0,uSeed,0.0))*0.5+0.5;
  float mid=snoise(vec3(t*26.0,uSeed*1.7,1.0))*0.5+0.5;
  float a=smoothstep(0.0,0.1,t)*smoothstep(1.0,0.84,t)*(0.22+0.55*mid+0.28*fine);
  a*=1.0-smoothstep(0.035,0.0,abs(t-0.63))*0.93;
  a*=1.0-smoothstep(0.012,0.0,abs(t-0.86))*0.6;
  vec3 tint=mix(uColor*0.72,uColor*1.08,mid);
  tint=mix(tint,vec3(0.6,0.53,0.46),fine*0.22);
  vec3 N=normalize(vN); vec3 L=normalize(uSun-vW); vec3 V=normalize(cameraPosition-vW);
  float ln=dot(N,L), vn=dot(N,V);
  float lit=0.2+0.8*abs(ln);
  float back=step(ln*vn,0.0);
  lit=mix(lit,0.12+0.45*abs(ln)*(1.0-a),back);
  vec3 oc=vW-uCenter; float b=dot(oc,L); float c=dot(oc,oc)-uR*uR;
  float shadow=(b<0.0&&b*b-c>0.0)?0.05:1.0;
  gl_FragColor=vec4(tint*lit*shadow,a*mix(0.78,0.35,back));
}`,
  side: THREE.DoubleSide, transparent: true, depthWrite: false,
});

// ---------- textures ----------
const loader = new THREE.TextureLoader();
const tex = (url) => { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const MAPS = Object.fromEntries(['jupiter', 'saturn', 'neptune', 'uranus', 'mars', 'venus'].map((n) => { const t = tex(`./${n}.jpg`); t.wrapS = THREE.RepeatWrapping; return [n, t]; }));
// Each hub's look: a real surface as the base, shifted by its seed so no two are alike.
const lookFor = (type, r, grey) => {
  const pick = (a) => a[Math.floor(r() * a.length)];
  switch (type) {
    case 0: return { map: pick([MAPS.jupiter, MAPS.saturn, MAPS.neptune, MAPS.venus]), hue: r() < 0.45 ? 0 : (r() - 0.5) * 1.1, sat: 0.85 + r() * 0.25, gain: 1 };
    case 1: return { map: MAPS.mars, hue: 0, sat: 0, gain: 1 };
    case 2: return grey ? { map: MAPS.mars, hue: 0, sat: 0.06 + r() * 0.14, gain: 0.7 + r() * 0.3 } : { map: MAPS.mars, hue: (r() - 0.5) * 0.7, sat: 0.3 + r() * 0.6, gain: 0.85 + r() * 0.3 };
    case 3: return { map: pick([MAPS.uranus, MAPS.neptune]), hue: (r() - 0.5) * 0.6, sat: 0.45 + r() * 0.5, gain: 0.82 };
    default: return { map: MAPS.mars, hue: 0, sat: 0.3, gain: 0.5 };
  }
};

// ---------- the sky: Milky Way, stars, nebulae ----------
const skyTex = loader.load('./sky.jpg', (t) => {
  const env = t.clone();
  env.mapping = THREE.EquirectangularReflectionMapping;
  env.needsUpdate = true;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(env).texture;
  scene.environmentIntensity = 0.7;
  pm.dispose();
});
skyTex.colorSpace = THREE.SRGBColorSpace;
const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, color: 0x8a8a90, depthWrite: false }));
sky.rotation.set(0.5, 0, 0.35);
scene.add(sky);

{
  const n = 7000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
  const r = rng(7);
  const tints = [[0.7, 0.8, 1.0], [1, 1, 1], [1, 0.95, 0.8], [1, 0.8, 0.6]];
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, d = 2600 + r() * 1800, s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * s * d, u * d, Math.sin(a) * s * d], i * 3);
    col.set(tints[Math.floor(r() * tints.length)], i * 3);
    size[i] = r() < 0.97 ? 1 + r() * 2 : 3 + r() * 3;
    phase[i] = r() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  scene.add(new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTime: time, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aPhase; uniform float uTime,uPR; varying vec3 vC;
      void main(){ vC=aColor*(0.7+0.3*sin(uTime*1.3+aPhase)); gl_PointSize=aSize*uPR; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(vC*a*1.4,a); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  })));
}

[[0.55, 0.2, 0.6, -1800, 600, -2600, 2200], [0.1, 0.45, 0.55, 2400, -500, -1500, 2600], [0.85, 0.45, 0.25, -2200, -700, 1800, 2000], [0.3, 0.3, 0.7, 1600, 900, 2300, 1800]]
  .forEach(([r, g, b, x, y, z, s], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(r, g, b) }, uSeed: { value: i * 7.3 } },
      vertexShader: VERT,
      fragmentShader: `uniform vec3 uColor; uniform float uSeed; varying vec2 vUv; ${NOISE}
        void main(){ vec2 q=vUv-0.5; float n=fbm(vec3(vUv*2.6,uSeed)); float n2=fbm(vec3(vUv*7.0,uSeed+3.0));
          float m=smoothstep(0.5,0.05,length(q))*smoothstep(-0.15,0.6,n)*(0.6+0.4*n2);
          gl_FragColor=vec4(uColor*m*0.42,1.0); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  });

// ---------- gno.land, the sun ----------
const glowTexture = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,220,160,0.55)'); gr.addColorStop(0.5, 'rgba(255,160,80,0.12)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const sunGain = { value: 1 };
const sun = new THREE.Mesh(new THREE.SphereGeometry(9, 64, 64), new THREE.ShaderMaterial({
  uniforms: { uTime: time, uGain: sunGain },
  vertexShader: VERT,
  fragmentShader: `uniform float uTime,uGain; varying vec3 vObj; varying vec3 vN; varying vec3 vW; ${NOISE}
    void main(){ vec3 p=normalize(vObj); float n=fbm(p*3.0+vec3(uTime*0.03)); float n2=fbm(p*10.0-vec3(uTime*0.05));
      vec3 col=mix(vec3(1.0,0.42,0.06),vec3(1.0,0.86,0.55),smoothstep(-0.3,0.6,n+n2*0.45));
      float limb=pow(max(dot(normalize(vN),normalize(cameraPosition-vW)),0.0),0.45);
      gl_FragColor=vec4(col*(1.6+limb*2.2)*uGain,1.0); }`,
}));
scene.add(sun);
const sunGlows = [];
[[150, 0.85], [420, 0.16]].forEach(([s, o]) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xfff1e0, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.setScalar(s);
  sp.userData.base = o;
  sunGlows.push(sp);
  scene.add(sp);
});
[new THREE.PointLight(0xfff1dd, 2.4, 0, 0), new THREE.AmbientLight(0x223044, 0.15)].forEach((l) => { l.layers.enableAll(); scene.add(l); });

// ---------- hubs: generated planets ----------
const HUBS = [
  { name: 'Adena', desc: "The wallet's home: releases, help and feedback.", group: 'hub', path: 'gno.land/r/sample/adena', type: 4, here: 22, rooms: 2, R: 30 },
  { name: 'BUBBLE', desc: 'Boop a bubble before its clock runs out. The busiest hub.', group: 'hub', path: 'gno.land/r/sample/bubble', type: 0, here: 214, rooms: 3, R: 46, tiles: [['BUBBLE TOKEN', '0.0123 GNOT ▲ 4.2%'], ['LIVE POTS', '6 bubbles']] },
  { name: 'Memba DAO', desc: 'A DAO with channels, quests and escrow.', group: 'dao', path: 'gno.land/r/sample/memba', type: 3, here: 96, rooms: 4, R: 64, dao: true, tiles: [['PROPOSAL 14', 'vote ends block 1,210,000'], ['MEMBERS', '312']] },
  { name: 'GovDAO', desc: "gno.land's governance: proposals and votes.", group: 'dao', path: 'gno.land/r/sample/govdao', type: 0, here: 38, rooms: 2, R: 32, dao: true, tiles: [['OPEN PROPOSALS', '3'], ['NEXT VOTE ENDS', 'in 2 days']] },
  { name: 'gnogolf', desc: 'Code golf on gno: shortest realm wins.', group: 'hub', path: 'gno.land/r/sample/gnogolf', type: 1, here: 41, rooms: 2, R: 122 },
  { name: 'Bug hunters', desc: 'People who break things before mainnet does.', group: 'hub', path: 'gno.land/r/sample/onyx', type: 2, here: 17, rooms: 1, R: 172 },
  { name: 'Lisbon Gnomes', desc: 'The Lisbon community: meetups and builds.', group: 'hub', path: 'gno.land/r/sample/lisbon', type: 1, here: 12, rooms: 2, R: 192 },
  { name: 'Kyoto builders', desc: 'Builders in Japan, in Japanese and English.', group: 'hub', path: 'gno.land/r/sample/kyoto', type: 3, here: 19, rooms: 3, R: 212 },
  { name: 'Art Hall', desc: 'A DAO that curates on-chain art.', group: 'dao', path: 'gno.land/r/sample/arthall', type: 0, here: 27, rooms: 2, R: 236, dao: true },
  { name: 'Realm Review', desc: 'Ask for a review of your realm.', group: 'hub', path: 'gno.land/r/sample/review', type: 2, here: 9, rooms: 1, R: 256 },
  { name: 'Night Owls', desc: 'Late-night builders, every time zone.', group: 'hub', path: 'gno.land/r/sample/nightowls', type: 4, here: 12, rooms: 2, R: 560, signal: true },
  { name: 'Deep Field', desc: 'A quiet hub for long reads and research.', group: 'hub', path: 'gno.land/r/sample/deepfield', type: 3, here: 4, rooms: 1, R: 600, signal: true },
  { name: 'Validators', desc: 'Validator operators: upgrades and incidents.', group: 'hub', path: 'gno.land/r/sample/validators', type: 2, here: 9, rooms: 2, R: 640, signal: true },
  { name: 'DeFi', desc: 'Tokens, pools, prices and their risks.', group: 'topic', path: 'gno.land/r/sample/topic-defi', type: 0, here: 64, rooms: 4, R: 195, tags: ['#defi', '#tokens'] },
  { name: 'Dev help', desc: 'Stuck on a realm? Ask here.', group: 'topic', path: 'gno.land/r/sample/topic-dev', type: 2, here: 88, rooms: 5, R: 240, tags: ['#gno', '#realms'] },
  { name: 'Art', desc: 'Drawings, generative art and NFTs.', group: 'topic', path: 'gno.land/r/sample/topic-art', type: 1, here: 45, rooms: 3, R: 330, tags: ['#art', '#nft'] },
  { name: 'Games', desc: 'Games built on gno.land, and their players.', group: 'topic', path: 'gno.land/r/sample/topic-games', type: 3, here: 52, rooms: 3, R: 285, tags: ['#games'] },
  { name: 'Night Radio', desc: 'Live sets and playlists from the community.', group: 'hub', path: 'gno.land/r/sample/radio', type: 4, here: 14, rooms: 2, R: 300 },
  { name: 'Music', desc: 'Share and discover music.', group: 'topic', path: 'gno.land/r/sample/topic-music', type: 4, here: 23, rooms: 2, R: 375, tags: ['#music'] },
];
const TOPIC_MEMBERS = { DeFi: ['Memba DAO', 'Adena'], 'Dev help': ['Realm Review', 'Bug hunters', 'Kyoto builders', 'Lisbon Gnomes', 'Workshop', 'Launchpad'], Art: ['Art Hall', 'Studio', 'Gallery'], Games: ['BUBBLE', 'gnogolf'], Music: ['Night Radio', 'Stage'] };
function ecoMembers(b) {
  if (b?.kind === 'system') return bodies.filter((x) => x.system === b.name);
  return (TOPIC_MEMBERS[b?.name] ?? []).map((n) => bodies.find((x) => x.name === n)).filter((x) => x && !hidden(x));
}
const ecoNear = (b) => ecoMembers(b).filter((x) => !x.remote);
const ecoOf = (b) => (b.system ? bodies.find((x) => x.kind === 'system' && x.name === b.system) : bodies.find((x) => x.group === 'topic' && (TOPIC_MEMBERS[x.name] ?? []).includes(b.name)));
function navState() {
  const cur = state.lens === 'list' ? 'list' : state.view === 'focus' ? (state.focus?.earth ? 'earth' : '') : state.lens === 'earth' ? 'earth' : 'cosmos';
  document.querySelectorAll('#hnav [data-flens]').forEach((x) => x.setAttribute('aria-current', String(x.dataset.flens === cur)));
}
const isEco = (b) => b?.kind === 'system' || b?.group === 'topic';
const inEco = (x) => state.view === 'focus' && isEco(state.focus) && (x === state.focus || ecoMembers(state.focus).includes(x));
const KIND = ['Gas giant', 'Ocean world', 'Rocky world', 'Ice world', 'Lava world'];
const palette = (type, r) => {
  const h = r(), c = (hh, s, l) => new THREE.Color().setHSL(((hh % 1) + 1) % 1, s, l);
  switch (type) {
    case 0: return [c(h, 0.45, 0.62), c(h + 0.05, 0.55, 0.36), c(h + 0.45 + r() * 0.2, 0.55, 0.62)];
    case 1: { const [sea, ground] = [[0.47, 0.03], [0.78, 0.11], [0.09, 0.6], [0.36, 0.95]][Math.floor(r() * 4)]; return [c(sea, 0.55, 0.3), c(ground, 0.4, 0.3), c(ground + 0.04, 0.3, 0.55)]; }
    case 2: return [c(h * 0.15, 0.22, 0.25), c(h * 0.15 + 0.03, 0.28, 0.52), c(0.6, 0.05, 0.72)];
    case 3: return [c(0.52 + r() * 0.1, 0.35, 0.75), c(0.58 + r() * 0.08, 0.5, 0.5), c(0.55, 0.6, 0.95)];
    default: return [c(0.02, 0.15, 0.06), c(0.05, 0.2, 0.16), c(0.03 + r() * 0.06, 1, 0.55)];
  }
};
const ATMO = [null, null, [0.6, 0.5, 0.4, 0.35], [0.55, 0.8, 1.0, 0.75], [1.0, 0.4, 0.1, 0.8]];
const orbitLine = (radius, opacity) => {
  const pts = []; for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity, depthWrite: false }));
};
const sphere = new THREE.SphereGeometry(1, 96, 64);
const bodies = [];

function makeBody(hub) {
  const r = rng(hash(hub.path));
  const seed = r() * 100;
  const radius = (hub.r ?? 1.3 + Math.log10(hub.here + 1) * 1.45) * 2.4;
  const tilt = new THREE.Object3D();
  const tx = r(), tz = r();
  tilt.rotation.set(hub.tiltX ?? (hub.group === 'topic' ? 0.32 : 0) + (tx - 0.5) * 0.12, 0, hub.tiltZ ?? (tz - 0.5) * 0.12);
  const orbit = orbitLine(hub.R, 0.05);
  tilt.add(orbit);
  const spinner = new THREE.Object3D();
  const angle = r() * Math.PI * 2;
  spinner.rotation.y = hub.angle ?? angle;
  tilt.add(spinner);
  const group = new THREE.Group();
  group.position.set(hub.R, 0, 0);
  spinner.add(group);
  (hub.parent ?? scene).add(tilt);
  const body = { ...hub, sunPos: hub.sun ?? SUN_POS, radius, obj: group, spinner, orbit, speed: 0.9 / Math.pow(hub.speedR ?? hub.R, 1.5), discovered: !hub.signal, extras: [] };
  if (hub.earth) return body;
  const cols = palette(hub.type, r);
  const look = lookFor(hub.type, r);
  body.look = { tex: Object.keys(MAPS).find((k) => MAPS[k] === look.map), hue: look.hue, sat: look.sat, gain: look.gain, tint: hub.type === 1 ? `#${cols[0].getHexString()}` : null };
  const mesh = new THREE.Mesh(sphere, planetMaterial(hub.type, cols, seed, look, radius, hub.sun));
  mesh.scale.setScalar(radius);
  mesh.rotation.z = (r() - 0.5) * 0.5;
  group.add(mesh);
  body.mesh = mesh;
  const atmo = ATMO[hub.type] ?? [cols[0].r, cols[0].g, cols[0].b, 1.0];
  const a = new THREE.Mesh(sphere, atmosphereMaterial(new THREE.Color(atmo[0], atmo[1], atmo[2]), atmo[3], hub.sun));
  a.scale.setScalar(radius * 1.04);
  a.material.uniforms.uPower.value *= 0.55;
  group.add(a);
  body.extras.push(a);
  const center = new THREE.Vector3();
  const halo = new THREE.Mesh(sphere, haloMaterial(new THREE.Color(atmo[0], atmo[1], atmo[2]), atmo[3] * 1.3, center, radius, radius * (hub.type === 0 ? 1.12 : hub.type === 3 ? 1.08 : 1.14), hub.sun));
  halo.scale.setScalar(radius * (hub.type === 0 ? 1.12 : hub.type === 3 ? 1.08 : 1.14));
  group.add(halo);
  body.haloCenter = center;
  body.extras.push(halo);
  if (hub.type === 1) {
    const c = new THREE.Mesh(sphere, cloudMaterial(seed, hub.sun));
    c.scale.setScalar(radius * 1.015);
    group.add(c);
    body.clouds = c;
    body.extras.push(c);
  }
  if (hub.dao) {
    const inner = radius * 1.45, outer = radius * 2.35;
    const center = new THREE.Vector3();
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 180, 1), ringMaterial(inner, outer, seed, cols[0].clone().lerp(new THREE.Color(0.85, 0.8, 0.7), 0.6), center, radius, hub.sun));
    ring.rotation.set(-Math.PI / 2 + (r() - 0.5) * 0.6, (r() - 0.5) * 0.3, 0);
    ring.userData.center = center;
    group.add(ring);
    body.ring = ring;
    mesh.material.uniforms.uRingIn.value = inner;
    mesh.material.uniforms.uRingOut.value = outer;
    body.extras.push(ring);
  }
  body.moons = [];
  for (let i = 0; i < hub.rooms; i++) {
    const pivot = new THREE.Object3D();
    pivot.rotation.set((r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.4);
    const dist = radius * (2.6 + i * 0.9 + r() * 0.4);
    const mo = orbitLine(dist, 0.1); mo.visible = false; pivot.add(mo); (body.moonOrbits ??= []).push(mo);
    const mr = radius * (0.12 + r() * 0.1);
    const moon = new THREE.Mesh(sphere, planetMaterial(2, palette(2, r), seed + i * 11, lookFor(2, r, true), mr, hub.sun));
    moon.scale.setScalar(mr);
    moon.position.set(dist, 0, 0);
    pivot.add(moon);
    group.add(pivot);
    body.moons.push({ pivot, speed: 0.25 + r() * 0.35 });
    body.extras.push(pivot);
  }
  const n = Math.min(60, Math.max(4, Math.round(hub.here / 4)));
  const sp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, inc = (r() - 0.5) * 1.2, d = radius * (1.35 + r() * 0.6);
    sp.set([Math.cos(a) * d, Math.sin(inc) * d * 0.5, Math.sin(a) * d], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sats = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTexture, color: 0xc9fff0, size: Math.max(0.1, radius * 0.07), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  group.add(sats);
  body.sats = sats;
  body.extras.push(sats);
  if (hub.signal) {
    mesh.visible = false;
    body.extras.forEach((e) => { e.visible = false; });
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xb79cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    beacon.scale.setScalar(14);
    group.add(beacon);
    body.beacon = beacon;
  }
  return body;
}
// a tighter map: the inner worlds keep their orbit, the outer ones come closer
HUBS.forEach((h) => { if (h.R > 150) h.R = Math.round(150 + (h.R - 150) * 0.55); });
// the uncharted frontier sits between the ecosystems and the other systems
[['Night Owls', 178], ['Deep Field', 184], ['Validators', 190]].forEach(([n, R]) => { const h = HUBS.find((x) => x.name === n); if (h) h.R = R; });
// a topic's projects fly in formation with it, so an ecosystem reads as one place
['Dev help', 'DeFi', 'Games', 'Art', 'Music'].forEach((n, i) => Object.assign(HUBS.find((h) => h.name === n), { angle: 0.3 + (i * Math.PI * 2) / 5, R: i % 2 ? 116 : 104, tiltX: 0.06, tiltZ: 0, speedR: 190 }));
const OFFS = [[0.13, 13], [-0.135, -12], [0.21, -19], [-0.21, 19]];
HUBS.filter((t) => t.group === 'topic').forEach((t) => {
  const ar = rng(hash(t.path)); ar();
  const tx = ar(), tz = ar(), ang = ar() * Math.PI * 2;
  (TOPIC_MEMBERS[t.name] ?? []).map((n) => HUBS.find((h) => h.name === n)).filter(Boolean).forEach((h, i) => {
    const [da, dr] = OFFS[i % OFFS.length];
    Object.assign(h, { R: t.R + dr, angle: (t.angle ?? ang) + da, tiltX: t.tiltX ?? 0.32 + (tx - 0.5) * 0.12, tiltZ: t.tiltZ ?? (tz - 0.5) * 0.12, speedR: t.speedR ?? t.R });
  });
});
HUBS.forEach((h) => bodies.push(makeBody(h)));
bodies.filter((b) => b.group === 'topic').forEach((b) => {
  b.mesh.visible = false;
  b.extras.forEach((e) => { e.visible = false; });
  b.hit = new THREE.Mesh(new THREE.SphereGeometry(b.radius * 2.2, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  b.hit.userData.soft = true; b.obj.add(b.hit);
});

// ---------- BUBBLE's live pots: glass bubbles in orbit ----------
const pots = [];
{
  const host = bodies.find((b) => b.name === 'BUBBLE'), r = rng(314);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.35, ior: 1.33, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 720], envMapIntensity: 1.6 });
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Object3D();
    pivot.rotation.set((r() - 0.5) * 1.2, r() * 6.28, (r() - 0.5) * 0.8);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), glass);
    m.scale.setScalar(host.radius * (0.1 + r() * 0.16));
    m.position.set(host.radius * (1.9 + r() * 1.3), 0, 0);
    pivot.add(m);
    host.obj.add(pivot);
    pots.push({ pivot, m, speed: 0.15 + r() * 0.2, phase: r() * 6.28 });
  }
}

// ---------- Earth, with its Moon ----------
const earth = makeBody({ name: 'Earth', group: 'home', path: 'earth', R: 60, r: 5.2, here: 184, rooms: 0, earth: true });
earth.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.ShaderMaterial({
  uniforms: { uDay: { value: tex('./earth_day.jpg') }, uNight: { value: tex('./earth_night.jpg') }, uSun: { value: SUN_POS }, uBump: { value: 0.02 } },
  vertexShader: VERT,
  fragmentShader: `uniform sampler2D uDay,uNight; uniform vec3 uSun; uniform float uBump; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
    vec3 relief(vec3 pos, vec3 n, float h){
      vec3 sx=dFdx(pos), sy=dFdy(pos); vec3 r1=cross(sy,n), r2=cross(n,sx); float det=dot(sx,r1);
      vec3 grad=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);
      return normalize(abs(det)*n-grad*uBump);
    }
    void main(){
      vec3 raw=texture2D(uDay,vUv).rgb; vec3 night=texture2D(uNight,vUv).rgb;
      float ocean=smoothstep(0.02,0.12,raw.b-raw.r);
      float lum=dot(raw,vec3(0.3,0.59,0.11));
      vec3 day=mix(raw,vec3(lum)*vec3(0.82,0.88,1.0),0.55)*mix(1.0,0.55,ocean);
      vec3 N=relief(vW,normalize(vN),(1.0-ocean)*lum*6.0); vec3 L=normalize(uSun-vW); vec3 V=normalize(cameraPosition-vW);
      float d=dot(N,L); float k0=smoothstep(-0.1,0.25,dot(normalize(vN),L)); float k=k0*clamp(0.35+d,0.0,1.3);
      vec3 col=day*(0.004+1.25*k)+night*vec3(1.0,0.78,0.5)*(1.0-k0)*2.2;
      gl_FragColor=vec4(col,1.0); }`,
}));
earth.mesh.scale.setScalar(earth.radius);
earth.mesh.rotation.y = -1.9;
earth.obj.add(earth.mesh);
{
  const a = new THREE.Mesh(sphere, atmosphereMaterial(new THREE.Color(0.3, 0.55, 1.0), 1.0));
  a.scale.setScalar(earth.radius * 1.03);
  earth.obj.add(a);
  earth.haloCenter = new THREE.Vector3();
  const halo = new THREE.Mesh(sphere, haloMaterial(new THREE.Color(0.3, 0.55, 1.0), 1.4, earth.haloCenter, earth.radius, earth.radius * 1.12));
  halo.scale.setScalar(earth.radius * 1.12);
  earth.obj.add(halo);
  earth.extras.push(a, halo);
  const pivot = new THREE.Object3D();
  pivot.rotation.x = 0.09;
  pivot.add(orbitLine(earth.radius * 1.9, 0.08));
  const moon = new THREE.Mesh(sphere, planetMaterial(2, [new THREE.Color(0.18, 0.18, 0.18), new THREE.Color(0.5, 0.5, 0.5), new THREE.Color(0.75, 0.75, 0.75)], 3.3, { map: MAPS.mars, hue: 0, sat: 0.05, gain: 0.8 }, earth.radius * 0.27));
  moon.scale.setScalar(earth.radius * 0.27);
  moon.position.set(earth.radius * 1.9, 0, 0);
  pivot.add(moon);
  earth.obj.add(pivot);
  earth.moons = [{ pivot, speed: 0.12 }];
}
bodies.push(earth);

// ---------- sponsored satellites: anyone can rent one ----------
const ADS = [
  { text: 'Gno hackathon · Oct 30', by: 'gno.land', price: '2 GNOT / day', host: 'BUBBLE' },
  { text: 'Adena 1.22 signs messages', by: 'Adena', price: '2 GNOT / day', host: 'GovDAO' },
  { text: 'Mint your hub planet', by: 'gnoworld', price: '1 GNOT / day', host: 'Earth' },
  { text: 'Free slot · rent me', by: null, price: '1 GNOT / day', host: 'gnogolf' },
  { text: 'Build on gno.land', by: 'gno.land', price: '3 GNOT / day', R: 150, h: 10 },
];
const busMat = new THREE.MeshStandardMaterial({ color: 0xc9a45c, metalness: 1, roughness: 0.3 });
const panelMat = new THREE.MeshStandardMaterial({ color: 0x15233f, metalness: 0.7, roughness: 0.22, emissive: 0x06101f });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b313c, metalness: 0.9, roughness: 0.38, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
const strutMat = new THREE.MeshStandardMaterial({ color: 0x8b93a3, metalness: 1, roughness: 0.4 });
function backCanvas(ad) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1A1F29'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.fillStyle = 'rgba(244, 246, 250, 0.7)'; g.font = '500 22px monospace';
  g.fillText('GNOWORLD · RENTABLE SATELLITE', 32, 60);
  g.fillStyle = 'rgba(244, 246, 250, 0.45)'; g.font = '18px monospace';
  g.fillText(ad.by ? `rented by ${ad.by}` : 'free slot', 32, 96);
  g.fillStyle = '#5CF2C8'; g.fillRect(32, 200, 10, 10); g.fillStyle = '#FF4D4D'; g.fillRect(52, 200, 10, 10);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t;
}
function adCanvas(ad) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  const draw = () => {
    const neon = ad.by ? '#7FE9FF' : '#C9A8FF';
    const g = c.getContext('2d');
    g.fillStyle = '#070B14'; g.fillRect(0, 0, 1024, 512);
    for (let y = 0; y < 512; y += 4) { g.fillStyle = 'rgba(255, 255, 255, 0.025)'; g.fillRect(0, y, 1024, 1); }
    g.shadowColor = neon; g.shadowBlur = 24; g.strokeStyle = neon; g.lineWidth = 6;
    g.strokeRect(22, 22, 980, 468);
    g.shadowBlur = 0;
    g.fillStyle = neon; g.font = '500 30px "Geist Mono", monospace';
    g.fillText(ad.by ? `SPONSORED · ${ad.by.toUpperCase()}` : 'AVAILABLE · ANYONE CAN RENT', 60, 88);
    g.fillStyle = '#F4F6FA'; g.shadowColor = neon; g.shadowBlur = 18; g.font = '500 92px Geist, sans-serif';
    const words = ad.text.split(' '); let line = '', y = 230;
    words.forEach((wd) => { const t = line ? `${line} ${wd}` : wd; if (g.measureText(t).width > 900 && line) { g.fillText(line, 58, y); line = wd; y += 104; } else line = t; });
    g.fillText(line, 58, y);
    g.shadowBlur = 0; g.fillStyle = 'rgba(244, 246, 250, 0.6)'; g.font = '400 28px "Geist Mono", monospace';
    g.fillText(ad.by ? `${ad.days ?? 12} days left · ${ad.price}` : `rent this satellite · ${ad.price}`, 60, 452);
    tex.needsUpdate = true;
  };
  draw(); document.fonts.ready.then(draw);
  ad.redraw = draw;
  return tex;
}
const NOHIT = new THREE.Object3D();
const ads = ADS.map((ad) => {
  const r = rng(hash(ad.text));
  const host = ad.host ? bodies.find((b) => b.name === ad.host) : null;
  const spinner = new THREE.Object3D();
  spinner.rotation.y = r() * 6.28;
  const group = new THREE.Group();
  let scale = 0.9;
  if (host) {
    spinner.rotation.x = (r() - 0.5) * 0.7;
    scale = host.radius * 0.06;
    group.position.set(host.radius * (host.ring ? 2.9 : 2.2), 0, 0);
    host.obj.add(spinner);
  } else {
    const tilt = new THREE.Object3D();
    tilt.rotation.set((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3);
    tilt.add(spinner); scene.add(tilt);
    group.position.set(ad.R, ad.h, 0);
  }
  spinner.add(group);
  const bill = new THREE.Group();
  bill.scale.setScalar(scale);
  group.add(bill);
  bill.add(new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.4, 0.24), frameMat));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 3.05), new THREE.MeshBasicMaterial({ map: adCanvas(ad), toneMapped: false }));
  screen.position.z = 0.13;
  bill.add(screen);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 3.05), new THREE.MeshBasicMaterial({ map: backCanvas(ad), toneMapped: false }));
  back.position.z = -0.13; back.rotation.y = Math.PI;
  bill.add(back);
  const bus = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.7), busMat); bus.position.z = -1.0; bill.add(bus);
  [-1, 1].forEach((sgn) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), strutMat); strut.rotation.z = Math.PI / 2; strut.position.set(sgn * 4.0, 0, -1.0); bill.add(strut);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 1.5), panelMat); wing.position.set(sgn * 6.6, 0, -1.0); bill.add(wing);
  });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), strutMat); mast.position.set(2.6, 2.6, 0); bill.add(mast);
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff4d4d, toneMapped: false })); blink.position.set(2.6, 3.55, 0); bill.add(blink);
  return { ...ad, src: ad, name: `${host ? host.name : 'Deep space'} satellite`, group: 'ad', radius: 3.4 * scale, group3d: group, spinner, orbit: null, bill, blink, seed: r() * 10, mesh: screen, speed: host ? 0.12 : 0.6 / Math.pow(ad.R, 1.5), discovered: true, extras: [], host: host ? host.name : null };
});
ads.forEach((a) => { a.kind = 'ad'; a.obj = a.group3d; a.group = 'ad'; });
ads.forEach((a) => bodies.push(a));

// ---------- other systems: sub-spaces far away ----------
const SYSTEMS = [
  { name: 'Onyx system', star: 'a white dwarf', pos: [197, -11, -128], color: [0.75, 0.85, 1.0], here: 140, desc: 'The testnet, as its own system: try things before mainnet.', worlds: [['Faucet', 1, 24], ['Sandbox', 2, 40], ['Test DAOs', 3, 58]] },
  { name: 'Creators', star: 'an orange star', pos: [-211, 9, -97], color: [1.0, 0.62, 0.3], here: 88, desc: 'Artists, musicians and writers who wanted their own sky.', worlds: [['Studio', 4, 26], ['Gallery', 1, 42], ['Stage', 0, 60]] },
  { name: 'Builders', star: 'a blue giant', pos: [41, -8, -231], color: [0.6, 0.75, 1.0], here: 120, desc: 'Teams shipping on gno.land, each with its own world.', worlds: [['Workshop', 2, 30], ['Launchpad', 3, 48]] },
];
SYSTEMS.forEach((sys) => {
  const pos = new THREE.Vector3(...sys.pos);
  const root = new THREE.Group(); root.position.copy(pos); scene.add(root);
  const star = new THREE.Mesh(sun.geometry, sun.material); star.scale.setScalar(0.6); root.add(star);
  [[90, 0.9], [300, 0.35]].forEach(([sz, o]) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: new THREE.Color(...sys.color), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(sz); sp.userData.base = o; sunGlows.push(sp); root.add(sp); });
  const body = { name: sys.name, desc: sys.desc, star: sys.star, tint: `#${new THREE.Color(...sys.color).getHexString()}`, extent: Math.max(...sys.worlds.map((w) => w[2])) * 0.62 + 10, kind: 'system', group: 'system', obj: root, mesh: star, radius: 6, here: sys.here, count: sys.worlds.length, spinner: new THREE.Object3D(), speed: 0, discovered: true, extras: [] };
  body.hit = new THREE.Mesh(new THREE.SphereGeometry(48, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  body.hit.userData.soft = true; root.add(body.hit);
  bodies.push(body);
  sys.worlds.forEach(([name, type, R0], i) => {
    const R = Math.round(R0 * 0.62);
    const w = makeBody({ name, type, R, here: 8 + i * 6, rooms: 1 + (i % 3), path: `${sys.name}/${name}`, parent: root, sun: pos, remote: true, system: sys.name, group: 'remote' });
    bodies.push(w);
  });
});
// ---------- stations: built places in one corner of the map, curated by the gno.land team ----------
// not realms: each carries a topic the team cares about, and shows something from it
const steel = new THREE.MeshStandardMaterial({ color: 0xb9c1cd, metalness: 0.55, roughness: 0.4 });
const hull = new THREE.MeshStandardMaterial({ color: 0x323a49, metalness: 0.45, roughness: 0.6 });
const glowDots = (pts, color, size) => new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.PointsMaterial({ map: glowTexture, color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const plateTex = canvasTex(512, 256, (g, W, H) => {
  const r = rng(11);
  g.fillStyle = '#7d838c'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 32) for (let x = 0; x < W; x += 64) {
    const v = (112 + r() * 46) | 0; g.fillStyle = `rgb(${v},${v + 3},${v + 7})`; g.fillRect(x + 1, y + 1, 62, 30);
    if (r() < 0.22) { g.fillStyle = 'rgba(26,30,36,0.55)'; g.fillRect(x + 6 + r() * 34, y + 7, 16, 12); }
    if (r() < 0.12) { g.fillStyle = 'rgba(214,190,140,0.25)'; g.fillRect(x + 2, y + 2, 60, 6); }
  }
  g.strokeStyle = 'rgba(16,19,24,0.6)'; g.lineWidth = 1.5;
  for (let y = 0; y <= H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let x = 0; x <= W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
});
plateTex.wrapS = plateTex.wrapT = THREE.RepeatWrapping;
const plateMat = (rx, ry) => { const t = plateTex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, color: 0xd2d6dc, metalness: 0.3, roughness: 0.58 }); };
const portholes = (w, h, along) => { const t = canvasTex(w, h, (g, W, H) => { const r = rng(5); for (let i = 4; i < (along === 'x' ? W : H); i += 9) if (r() < 0.7) { g.fillStyle = r() < 0.12 ? 'rgba(170,220,255,0.9)' : `rgba(255,${(196 + r() * 40) | 0},${(128 + r() * 50) | 0},${(0.55 + r() * 0.4).toFixed(2)})`; if (along === 'x') g.fillRect(i, H * 0.3, 3, H * 0.4); else g.fillRect(W * 0.3, i, W * 0.4, 3); } }); return t; };
const solarTex = canvasTex(256, 512, (g, W, H) => {
  const r = rng(9); g.fillStyle = '#0a1426'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) { const v = 26 + r() * 16; g.fillStyle = `rgb(${(v * 0.45) | 0},${(v * 0.75) | 0},${(v * 1.7) | 0})`; g.fillRect(x + 1, y + 1, 14, 14); }
  g.fillStyle = 'rgba(190,200,215,0.4)'; for (let y = 0; y < H; y += 128) g.fillRect(0, y, W, 3);
});
// a straight member between two points, for trusses
const beam = (a, b, w) => { const d = b.clone().sub(a), g = new THREE.BoxGeometry(w, w, d.length()), m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) > 0.99 * d.length() ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)); m.setPosition(a.clone().add(b).multiplyScalar(0.5)); return g.applyMatrix4(m); };
const dirOf = (lat, lon) => { const a = (lat * Math.PI) / 180, o = (lon * Math.PI) / 180; return new THREE.Vector3(Math.cos(a) * Math.cos(o), Math.sin(a), Math.cos(a) * Math.sin(o)); };
// the site built aboard the AI Ring this week, drawn as its own little page
function drawSite(g, W, H) {
  g.fillStyle = '#0B0F18'; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.78, H * 0.18, 10, W * 0.78, H * 0.18, W * 0.7); glow.addColorStop(0, 'rgba(92,242,200,0.32)'); glow.addColorStop(1, 'rgba(11,15,24,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, W, 34);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(20 + i * 16, 17, 5, 0, 7); g.fill(); });
  g.fillStyle = 'rgba(244,246,250,0.55)'; g.font = '14px monospace'; g.fillText('realmscope · sample', 80, 22);
  g.fillStyle = '#F4F6FA'; g.font = '600 56px Geist, sans-serif'; g.fillText('realmscope', 40, 118);
  g.fillStyle = 'rgba(244,246,250,0.7)'; g.font = '20px Geist, sans-serif'; g.fillText('Read any gno.land realm like a book.', 40, 156);
  g.fillStyle = '#5CF2C8'; g.beginPath(); g.roundRect(40, 182, 156, 42, 21); g.fill(); g.fillStyle = '#05221A'; g.font = '600 16px Geist, sans-serif'; g.fillText('Open a realm', 62, 209);
  ['r/gov/dao', 'p/nt/avl/v0', 'r/sys/users'].forEach((t, i) => {
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.roundRect(40 + i * 190, 258, 174, 112, 12); g.fill();
    g.fillStyle = 'rgba(244,246,250,0.85)'; g.font = '13px monospace'; g.fillText(t, 56 + i * 190, 288);
    g.fillStyle = 'rgba(244,246,250,0.22)'; for (let j = 0; j < 3; j++) { g.beginPath(); g.roundRect(56 + i * 190, 304 + j * 16, 80 + ((i + j) % 3) * 28, 7, 4); g.fill(); }
  });
}
const CHANNELS = [['Deep zoom', './art-zoom.mp4', 'Art'], ['BUBBLE replay', './bubble-clip.mp4', 'Games'], ['Life, live', './ch-life.mp4', 'Science'], ['Aurora loop', './ch-aurora.mp4', 'Ambient'], ['Rule 30', './ch-rule30.mp4', 'Computation'], ['Carpet', './ch-carpet.mp4', 'Math art']];
const STATIONS = [
  { name: 'AI Ring', topic: 'AI', desc: 'Where the team’s AI experiments dock. This week: a site built in an afternoon.', here: 64, roomList: ['#ai-ring', '#show-and-tell'], tint: '#5CF2C8', at: [-150, 15, -175], tags: ['#ai', 'curated'], tilt: [0.55, 0, 0.25] },
  { name: 'Broadcast Moon', topic: 'Screens', scale: 1, radius: 8, roomList: ['#broadcast-moon', '#watch-party'], desc: 'A moon that is not one: its surface is screens. Talks, launches and art, curated.', here: 112, tint: '#FFC46B', at: [-102, 2, -207], tags: ['#video', 'curated'], tilt: [0.15, 0, 0.1] },
  { name: 'Harbor', topic: 'Space', desc: 'A long colony where space and science readers dock. One long read a day.', here: 31, roomList: ['#harbor', '#reading-club'], tint: '#9CC8FF', at: [-55, 4, -236], tags: ['#space', '#science', 'curated'], tilt: [0.3, 0, 1.0] },
];
const BUILD = {
  'AI Ring': (st) => {
    // a working torus station: habitat modules joined by collars, lit portholes, truss spokes with a lift shaft, a hub with docking ports, solar arrays on the axis
    const spin = new THREE.Group(), R = 10, N = 32, seg = (2 * Math.PI * R) / N, Y = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const mods = [], collars = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, m4 = new THREE.Matrix4().compose(V(Math.cos(a) * R, 0, Math.sin(a) * R), new THREE.Quaternion().setFromUnitVectors(Y, V(-Math.sin(a), 0, Math.cos(a))), V(1, 1, 1));
      mods.push(new THREE.CylinderGeometry(1.05, 1.05, seg * 0.84, 20, 1).applyMatrix4(m4));
      collars.push(new THREE.CylinderGeometry(1.2, 1.2, seg * 0.13, 20, 1).translate(0, seg * 0.49, 0).applyMatrix4(m4));
    }
    spin.add(new THREE.Mesh(mergeGeometries(mods), plateMat(2, 1)), new THREE.Mesh(mergeGeometries(collars), hull));
    const lights = portholes(512, 32, 'x'); lights.wrapS = THREE.RepeatWrapping; lights.repeat.set(28, 1);
    const lmat = new THREE.MeshBasicMaterial({ map: lights, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    [R + 1.07, R - 1.07].forEach((r) => spin.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 192, 1, true), lmat)));
    const truss = [], h = 0.26, L0 = 1.75, L1 = R - 1.02;
    for (let k = 0; k < 4; k++) {
      const parts = [], c = [[-h, -h], [-h, h], [h, h], [h, -h]];
      c.forEach(([y, z]) => parts.push(beam(V(L0, y, z), V(L1, y, z), 0.07)));
      for (let x = L0; x < L1 - 0.05; x += 0.72) {
        const x2 = Math.min(L1, x + 0.72);
        for (let j = 0; j < 4; j++) { const [y1, z1] = c[j], [y2, z2] = c[(j + 1) % 4]; parts.push(beam(V(x, y1, z1), V(x, y2, z2), 0.04), beam(V(x, y1, z1), V(x2, y2, z2), 0.032)); }
      }
      parts.push(new THREE.CylinderGeometry(0.1, 0.1, L1 - L0, 10).rotateZ(Math.PI / 2).translate((L0 + L1) / 2, 0, 0));
      parts.forEach((g) => truss.push(g.rotateY((k * Math.PI) / 2 + Math.PI / 4)));
    }
    spin.add(new THREE.Mesh(mergeGeometries(truss), hull));
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.4, 32), plateMat(3, 1)));
    [1.95, -1.95].forEach((y) => { const c2 = new THREE.Mesh(new THREE.CylinderGeometry(y > 0 ? 0.75 : 1.55, y > 0 ? 1.55 : 0.75, 0.5, 32), hull); c2.position.y = y; spin.add(c2); const port = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 18), plateMat(1, 1)); port.position.y = y * 1.38; spin.add(port); });
    const smat = new THREE.MeshStandardMaterial({ map: solarTex, color: 0xffffff, metalness: 0.45, roughness: 0.32, side: THREE.DoubleSide });
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.2, 8).translate(0, 6.3, 0), hull));
    [6.4, 8.6].forEach((y) => { spin.add(new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.07, 0.07).translate(0, y, 0), hull)); [-1, 1].forEach((sx) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.9), smat); w.position.set(sx * 3.3, y, 0); w.rotation.x = -0.35; spin.add(w); }); });
    st.siteTex = canvasTex(640, 400, drawSite);
    return [spin];
  },
  'Broadcast Moon': (st) => {
    // a real moon, smaller than the worlds around it, wearing one megastructure: a belt of curved screens on its equator
    const spin = new THREE.Group(), R = 6, N = 8, gap = 0.03, band = 0.2;
    const rock = new THREE.Mesh(sphere, planetMaterial(2, [new THREE.Color(0.16, 0.16, 0.17), new THREE.Color(0.45, 0.45, 0.47), new THREE.Color(0.7, 0.7, 0.72)], 7.7, { map: MAPS.mars, hue: 0, sat: 0.04, gain: 0.75 }, R));
    rock.scale.setScalar(R); spin.add(rock);
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.008, 128, 8, 0, Math.PI * 2, Math.PI / 2 - band - 0.04, (band + 0.04) * 2), hull));
    st.screens = CHANNELS.map(([, src]) => { const v = Object.assign(document.createElement('video'), { src, muted: true, loop: true, playsInline: true, preload: 'none' }); const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; return { v, t }; });
    st.posters = CHANNELS.map(([, src]) => tex(`./poster-${src.slice(2, -4)}.jpg`));
    st.panels = [];
    for (let i = 0; i < N; i++) {
      const k = i % CHANNELS.length;
      const scr = new THREE.Mesh(new THREE.SphereGeometry(R * 1.014, 24, 6, (i / N) * Math.PI * 2 + gap, (Math.PI * 2) / N - gap * 2, Math.PI / 2 - band, band * 2), new THREE.MeshBasicMaterial({ map: st.posters[k], color: 0x8e939c, toneMapped: false }));
      scr.userData.k = k; spin.add(scr); st.panels.push(scr);
    }
    return [spin];
  },
  Harbor: () => {
    // an O'Neill cylinder: a segmented hull with window and land strips, three hinged mirrors, an agricultural ring, docked ships, radiators
    const spin = new THREE.Group(), V = (x, y, z) => new THREE.Vector3(x, y, z), R = 3, H = 24;
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 48), plateMat(6, 5)));
    const rings = []; for (let y = -H / 2; y <= H / 2 + 0.01; y += H / 6) rings.push(new THREE.CylinderGeometry(R + 0.16, R + 0.16, 0.35, 48).translate(0, y, 0));
    spin.add(new THREE.Mesh(mergeGeometries(rings), hull));
    const rows = portholes(32, 512, 'y'); rows.wrapT = THREE.RepeatWrapping; rows.repeat.set(1, 6);
    const lmat = new THREE.MeshBasicMaterial({ map: rows, transparent: true, depthWrite: false, toneMapped: false });
    const mirror = new THREE.MeshStandardMaterial({ map: solarTex, color: 0xb8c6da, metalness: 0.7, roughness: 0.22, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.9, H - 1), lmat); strip.position.set(Math.cos(a) * (R + 0.02), 0, Math.sin(a) * (R + 0.02)); strip.rotation.y = Math.PI / 2 - a; spin.add(strip);
      // a mirror hinged at the top rim, opened outward
      const hinge = new THREE.Group(); hinge.position.set(Math.cos(a) * (R + 0.2), H / 2, Math.sin(a) * (R + 0.2)); hinge.rotation.y = -a;
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(2.6, H).translate(0, -H / 2, 0), mirror); wing.rotation.y = Math.PI / 2; wing.rotation.order = 'YXZ';
      const tilt = new THREE.Group(); tilt.rotation.z = 0.32; tilt.add(wing); hinge.add(tilt); spin.add(hinge);
    }
    // the agricultural ring at the far end: pods on spokes
    const pods = [], spokes = [], RR = 6.2, y0 = -H / 2 - 1.6;
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; pods.push(new THREE.CylinderGeometry(0.55, 0.55, 1.7, 14).rotateX(Math.PI / 2).rotateY(-a).translate(Math.cos(a) * RR, y0, Math.sin(a) * RR)); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spokes.push(beam(V(Math.cos(a) * 1.2, y0, Math.sin(a) * 1.2), V(Math.cos(a) * (RR - 0.5), y0, Math.sin(a) * (RR - 0.5)), 0.12)); }
    spokes.push(new THREE.CylinderGeometry(1.2, 1.2, 1.4, 24).translate(0, y0, 0), new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16).translate(0, -H / 2 - 0.6, 0));
    spin.add(new THREE.Mesh(mergeGeometries(pods), plateMat(1, 1)), new THREE.Mesh(mergeGeometries(spokes), hull));
    // the docking mast at the near end, two ships moored
    const mast = [new THREE.CylinderGeometry(0.35, 0.35, 4, 16).translate(0, H / 2 + 2, 0), new THREE.CylinderGeometry(1.1, 1.1, 0.6, 24).translate(0, H / 2 + 3.6, 0)];
    spin.add(new THREE.Mesh(mergeGeometries(mast), hull));
    [0, Math.PI].forEach((a) => {
      const ship = new THREE.Group();
      ship.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 3.2, 14), plateMat(1, 2)));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 14), hull); nose.position.y = 2.05; ship.add(nose);
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.5, 14), hull); eng.position.y = -1.85; ship.add(eng);
      ship.rotation.z = Math.PI / 2; ship.position.set(Math.cos(a) * 2.9, H / 2 + 3.6, Math.sin(a) * 2.9); ship.rotation.y = -a; spin.add(ship);
    });
    // radiators near the ring end
    const rmat = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 0.1, roughness: 0.75, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 3, fin = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.5), rmat); fin.position.set(Math.cos(a) * (R + 0.85), -H / 2 + 3, Math.sin(a) * (R + 0.85)); fin.rotation.y = -a; spin.add(fin); }
    return [spin];
  },
};
STATIONS.forEach((s) => {
  const root = new THREE.Group(); root.position.set(...s.at); scene.add(root);
  const st = { ...s, kind: 'station', group: 'station', path: `gno.land/station/${s.name.toLowerCase().replace(/\s+/g, '-')}`, obj: root, radius: s.radius ?? 18, rooms: 2, spinner: new THREE.Object3D(), speed: 0, discovered: true, extras: [] };
  const [spin, ...free] = BUILD[s.name](st);
  const tilt = new THREE.Group(); tilt.rotation.set(...s.tilt); tilt.add(spin); root.add(tilt, ...free); root.scale.setScalar(s.scale ?? 1.5);
  st.mesh = spin;
  root.traverse((o) => { if (o.isMesh || o.isPoints) st.extras.push(o); });
  st.hit = new THREE.Mesh(new THREE.SphereGeometry(s.name === 'Broadcast Moon' ? 10 : 13, 12, 8), new THREE.MeshBasicMaterial({ visible: false })); root.add(st.hit);
  bodies.push(st);
});
const aiRing = bodies.find((b) => b.name === 'AI Ring'), bmoon = bodies.find((b) => b.name === 'Broadcast Moon');
const embassyGeo = mergeGeometries([new THREE.CylinderGeometry(0.5, 0.5, 2.2, 16).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(0.62, 0.62, 0.3, 16).rotateZ(Math.PI / 2).translate(0.9, 0, 0), new THREE.CylinderGeometry(0.62, 0.62, 0.3, 16).rotateZ(Math.PI / 2).translate(-0.9, 0, 0)]);
const embassyWing = new THREE.MeshStandardMaterial({ map: solarTex, color: 0xffffff, metalness: 0.45, roughness: 0.32, side: THREE.DoubleSide });
const embassies = [];
const galaxyTexture = (seed, tint) => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), r = rng(seed);
  const core = g.createRadialGradient(256, 256, 0, 256, 256, 90); core.addColorStop(0, 'rgba(255,245,225,0.9)'); core.addColorStop(1, 'rgba(255,245,225,0)');
  g.fillStyle = core; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    const arm = i % 2, t = r() * 4.2, a = t + arm * Math.PI + (r() - 0.5) * 0.5, d = 18 + t * 52 + (r() - 0.5) * 22;
    g.fillStyle = `rgba(${tint},${(0.15 + r() * 0.5).toFixed(2)})`;
    g.fillRect(256 + Math.cos(a) * d, 256 + Math.sin(a) * d * 0.55, 1.4, 1.4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
[[1, '200,215,255', [-1200, 1500, -4200], 900, 0.4], [2, '255,220,190', [3800, -900, 2000], 700, -0.9], [3, '220,200,255', [-3600, 400, 2600], 600, 1.2]].forEach(([seed, tint, p, size, rot]) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: galaxyTexture(seed, tint), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, rotation: rot }));
  sp.position.set(...p); sp.scale.setScalar(size); scene.add(sp);
});

// ---------- asteroid belt, comet, dust, warp streaks ----------
{
  const n = 1100, belt = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.95, flatShading: true }), n);
  const r = rng(99), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = 152 + (r() + r() - 1) * 8;
    p.set(Math.cos(a) * d, (r() - 0.5) * 3, Math.sin(a) * d);
    q.setFromEuler(e.set(r() * 6, r() * 6, r() * 6));
    const k = 0.08 + Math.pow(r(), 3) * 0.55;
    s.set(k, k * (0.6 + r() * 0.5), k * (0.7 + r() * 0.4));
    belt.setMatrixAt(i, m.compose(p, q, s));
  }
  belt.userData.spin = 0.004;
  scene.add(belt);
  bodies.belt = belt;
}
const comet = (() => {
  const n = 70, pos = new Float32Array(n * 3), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sizes = new Float32Array(n); for (let i = 0; i < n; i++) sizes[i] = 6 * (1 - i / n) + 0.5;
  g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uPR: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float aSize; uniform float uPR; varying float vA; void main(){ vA=aSize/6.5; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uPR*(300.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d)*vA; gl_FragColor=vec4(vec3(0.8,0.92,1.0)*a*1.6,a); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, pos, n, t: 0 };
})();
const dust = (() => {
  const n = 500, pos = new Float32Array(n * 3), r = rng(5);
  for (let i = 0; i < n * 3; i++) pos[i] = (r() - 0.5) * 60;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTexture, color: 0xfff0dc, size: 0.2, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, pos, n };
})();

// ---------- links between worlds (samples) ----------
// realm-to-realm traffic seen on chain: who calls or imports whom
const ROUTES = [['BUBBLE', 'Adena', 'calls', 340], ['gnogolf', 'Realm Review', 'imports', 12], ['Memba DAO', 'GovDAO', 'calls', 96], ['Art Hall', 'Memba DAO', 'imports', 8], ['Bug hunters', 'Realm Review', 'calls', 41], ['Night Radio', 'Art Hall', 'calls', 22], ['Kyoto builders', 'gnogolf', 'calls', 17]];
// rooms two worlds share: one conversation, open from both
const SHARED = [['BUBBLE', 'gnogolf', '#arcade', 18], ['Memba DAO', 'GovDAO', '#governance', 24], ['Lisbon Gnomes', 'Kyoto builders', '#meetups', 9], ['Art Hall', 'Night Radio', '#studio', 7]];
const linksOf = (b) => [
  ...ROUTES.filter((r) => r[0] === b.name || r[1] === b.name).map(([a, c, kind, n]) => ({ kind, n, out: a === b.name, other: bodies.find((x) => x.name === (a === b.name ? c : a)) })),
  ...SHARED.filter((r) => r[0] === b.name || r[1] === b.name).map(([a, c, room, n]) => ({ kind: 'shared', room, n, out: true, other: bodies.find((x) => x.name === (a === b.name ? c : a)) })),
].filter((x) => x.other);
// the next live moment on the map
// the AMA has a fixed time (18:00 UTC every day), so it really happens; ?demo brings it to 3 minutes from now
const nextAt = (h) => { const d = new Date(); d.setUTCHours(h, 0, 0, 0); if (Date.now() > d.getTime() + 3600e3) d.setUTCDate(d.getUTCDate() + 1); return d.getTime(); };
const EVENT = { place: 'Dev help', title: 'AMA · interrealm, with the core team', at: new URLSearchParams(location.search).has('demo') ? Date.now() + 3 * 60000 : nextAt(18) };
const eventPhase = () => (Date.now() < EVENT.at ? 'soon' : Date.now() < EVENT.at + 3600e3 ? 'live' : 'done');
const eventLabel = () => { const m = Math.round((EVENT.at - Date.now()) / 60000); return eventPhase() === 'live' ? 'live now' : m < 60 ? `in ${Math.max(1, m)} min` : m < 1440 ? `in ${Math.round(m / 60)} h` : 'tomorrow'; };

// ---------- labels ----------
const labelsEl = $('labels');
const hidden = (b) => b.signal && !b.discovered;
const nameOf = (b) => (hidden(b) ? 'Uncharted signal' : b.name);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
function addLabel(b) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'label' + (b.signal ? ' unknown' : '');
  el.addEventListener('click', () => { peekHide(); go(b); });
  el.addEventListener('mouseenter', () => { hover(b); peekShow(b, el); });
  el.addEventListener('mouseleave', () => { hover(null); peekHide(); });
  labelsEl.append(el);
  b.label = el;
  renderLabel(b);
}
bodies.forEach(addLabel);
setTimeout(() => { labelExtras = true; bodies.forEach((b) => b.label && renderLabel(b)); }, 0); // once friends and first words are known
// heat: messages an hour against the usual, drifting slowly (sample)
const rateOf = (b) => Math.round(20 + (b.here ?? 10) * 0.6); // messages an hour now: one number for labels, plate, chart
const heatOf = (b) => {
  const k = hash(b.name), msgs = rateOf(b), trend = Math.round(((k % 64) - 22) + 12 * Math.sin(Date.now() / 24000 + (k % 7)));
  return { msgs, trend, score: msgs * (1 + Math.max(-0.5, trend / 100)) };
};
function updateHot() {
  const pool = bodies.filter((b) => b.mesh && !b.remote && b.kind !== 'ad' && b.kind !== 'system' && b.kind !== 'station' && !hidden(b) && b.group !== 'topic');
  const next = new Set(pool.map((b) => [b, heatOf(b)]).filter(([, x]) => x.trend > 8).sort((a, c) => c[1].score - a[1].score).slice(0, 2).map(([b]) => b));
  const changed = [...next].some((b) => !hotSet.has(b)) || [...hotSet].some((b) => !next.has(b));
  hotSet = next;
  pool.forEach((b) => { if (b.label && (changed || next.has(b))) renderLabel(b); });
}
// heat reads as a warm haze that breathes around the busy worlds: no lines, so it never fights the orbits
const pings = new Map();
function pingFrame(t) {
  const on = state.view !== 'focus' && state.lens !== 'list' && loaded && performance.now() - loadedAt > 5000;
  bodies.forEach((b) => {
    let m = pings.get(b);
    if (!hotSet.has(b) || !on) { if (m) m.visible = false; return; }
    if (!m) { m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffa25a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(m); pings.set(b, m); }
    m.visible = true;
    const heat = Math.min(1, heatOf(b).trend / 50);
    worldOf(b, m.position);
    m.scale.setScalar(b.radius * 3.6);
    m.material.opacity = 0.1 + 0.12 * heat;
  });
}
function renderLabel(b) {
  const sub = b.kind === 'ad' ? b.price : b.earth ? '184 talking' : hidden(b) ? `${b.here} here · go and look` : `${b.here} here`;
  b.label.innerHTML = '';
  const pill = document.createElement('span'); pill.className = 'pill';
  const strong = document.createElement('b'); strong.textContent = b.kind === 'ad' ? (b.by ? 'Sponsored' : 'Open slot') : nameOf(b);
  const span = document.createElement('span'); span.className = 'n'; span.textContent = sub;
  pill.append(strong, span);
  if (hotSet.has(b)) { const x = heatOf(b), hc = document.createElement('span'); hc.className = 'heat'; hc.textContent = `▲ ${x.trend}% · ${x.msgs}/h`; pill.append(hc); b.labelW += 0; }
  if (b.name === EVENT.place) { const ev = document.createElement('span'); ev.className = 'heat ev'; ev.textContent = `AMA ${eventLabel()}`; pill.append(ev); }
  const fr = labelExtras && b.kind !== 'ad' ? friendsAt(b) : [], fw = labelExtras ? log.firstWords?.[b.name] : null;
  if (fr.length) { const f = document.createElement('span'); f.className = 'heat fr'; f.textContent = fr.length > 1 ? `${fr[0]} + ${fr.length - 1} you know` : `${fr[0]} is here`; pill.append(f); }
  if (fw) { const f = document.createElement('span'); f.className = 'heat fr'; f.textContent = `first words @${fw}`; pill.append(f); }
  b.labelW = strong.textContent.length * 7.2 + sub.length * 6.4 + 34 + (hotSet.has(b) ? 92 : 0) + (b.name === EVENT.place ? 96 : 0) + [...pill.querySelectorAll('.fr')].reduce((a, x) => a + x.textContent.length * 6.4 + 24, 0);
  const stem = document.createElement('span'); stem.className = 'stem';
  b.label.append(pill, stem);
  b.label.setAttribute('aria-label', `Fly to ${nameOf(b)}`);
}

// ---------- zones: where things are, written into space ----------
const ZONES = [
  ['Home', 'Earth and GovDAO, close to gno.land', [-30, 12, 30]],
  ['Asteroid belt', 'Rocks between the ecosystems and the frontier', [108, 6, 108]],
  ['Uncharted frontier', 'Signals nobody has charted yet', [128, 16, 136]],
  ['Stations', 'Built and curated by the gno.land team', [-104, 44, -206]],
].map(([name, desc, p]) => {
  const el = document.createElement('div'); el.className = 'zone';
  const b = document.createElement('small'); b.textContent = name;
  const d = document.createElement('span'); d.textContent = desc;
  el.append(b, d); labelsEl.append(el);
  return { el, p: new THREE.Vector3(...p) };
});

// ---------- the destinations list, sorted into sections ----------
const listEl = $('placeList');
const SECTIONS = [
  ['Ecosystems', (b) => b.group === 'topic'],
  ['Hubs and DAOs', (b) => (b.group === 'hub' || b.group === 'dao') && !hidden(b)],
  ['Home', (b) => b.earth],
  ['Stations', (b) => b.kind === 'station'],
  ['Sponsored satellites', (b) => b.kind === 'ad'],
  ['Other systems', (b) => b.kind === 'system'],
  ['Uncharted', (b) => hidden(b)],
];
function dotColor(b) {
  if (hidden(b)) return '#B79CFF';
  if (b.earth) return '#5aa0ff';
  if (b.kind === 'ad') return '#C9A45C';
  if (b.kind === 'system') return '#DDE7FF';
  if (b.kind === 'station') return b.tint;
  return '#' + b.mesh.material.uniforms.uA.value.getHexString();
}
function renderList() {
  const q = $('search').value.trim().toLowerCase();
  listEl.innerHTML = '';
  SECTIONS.forEach(([title, test]) => {
    const items = bodies.filter(test).filter((b) => !q || nameOf(b).toLowerCase().includes(q) || (b.tags ?? []).some((t) => t.includes(q)))
      .sort((a, b) => (b.here ?? 0) - (a.here ?? 0));
    if (!items.length) return;
    const h = document.createElement('small');
    h.textContent = `${title} · ${items.length}`;
    h.style.cssText = 'display: block; padding: 10px 6px 4px';
    listEl.append(h);
    items.forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'place';
      el.setAttribute('aria-current', String(state.focus === b));
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = dotColor(b);
      const label = document.createElement('span'); label.textContent = b.kind === 'ad' ? b.text : nameOf(b);
      const n = document.createElement('span'); n.className = 'n';
      n.textContent = b.kind === 'system' ? 'far' : b.kind === 'ad' ? (b.by ? 'rented' : 'free') : b.earth ? '184' : b.group === 'dao' ? `DAO · ${b.here}` : b.signal && b.discovered ? `new · ${b.here}` : String(b.here);
      el.append(dot, label, n);
      el.addEventListener('click', () => go(b));
      listEl.append(el);
    });
  });
}
$('search').addEventListener('input', renderList);

// ---------- state, flights, lenses ----------
const state = { focus: null, lens: 'cosmos', flight: null, last: new THREE.Vector3(), followed: new Set((() => { try { return JSON.parse(localStorage.getItem('gw.follow')) ?? []; } catch { return []; } })()), explored: new Set() };
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const worldOf = (b, v = new THREE.Vector3()) => b.obj.getWorldPosition(v);
function goalFor(b) {
  const p = worldOf(b);
  const toSun = (b.kind === 'system' ? SUN_POS : b.sunPos ?? SUN_POS).clone().sub(p).normalize();
  const side = new THREE.Vector3().crossVectors(toSun, up).normalize();
  const dir = toSun.multiplyScalar(0.5).add(up.clone().multiplyScalar(0.22)).add(side.multiplyScalar(0.85)).normalize();
  if (b.ring) { const n = new THREE.Vector3(0, 0, 1).transformDirection(b.ring.matrixWorld); if (n.dot(dir) < 0) n.negate(); dir.multiplyScalar(0.7).addScaledVector(n, 0.6).normalize(); }
  if (b.group === 'topic') {
    const ms = ecoNear(b), pts = [p, ...ms.map((m) => worldOf(m))];
    const c = pts.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    // the group's reach: the farthest world plus its own size
    b.extent = Math.max(b.radius * 2.5, ...ms.map((m, i) => pts[i + 1].distanceTo(c) + m.radius * 1.5)) + 4;
    return { target: c, cam: c.clone().addScaledVector(up.clone().multiplyScalar(0.85).addScaledVector(side, 0.5).normalize(), b.extent * 2.1) };
  }
  if (b.kind === 'system') dir.copy(up).multiplyScalar(0.8).addScaledVector(side, 0.6).normalize();
  const reach = b.kind === 'system' ? (b.extent / b.radius) * 2.1 : b.kind === 'ad' ? 5.2 : b.ring ? 3.5 : b.earth ? 3.1 : 2.9;
  return { target: p, cam: p.clone().add(dir.multiplyScalar(b.radius * reach)) };
}
const VIEWS = {
  cosmos: () => ({ target: new THREE.Vector3(0, -8, 0), cam: new THREE.Vector3(0, 186, 255) }),
  map: () => ({ target: new THREE.Vector3(0, 0, 0), cam: new THREE.Vector3(0, 760, 1) }),
};
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function flyTo(goal, onArrive, target = 'Universe', onNear) {
  const g = goal();
  const from = camera.position.clone();
  const dist = from.distanceTo(g.cam);
  state.flight = { goal, from, t0: controls.target.clone(), start: performance.now(), dur: reduced ? 1 : Math.min(dist > 1500 ? 5600 : 3200, 1300 + dist * 4.5), lift: Math.min(dist * 0.22, 120), onArrive, onNear, prev: from.clone(), target };
  $('fTarget').textContent = target;
  $('flight').hidden = reduced || dist < 30;
  $('toast').hidden = true;
  controls.enabled = false;
}
function go(b) {
  try { history.replaceState(null, '', `#${slug(b)}`); } catch {}
  track('go', { to: b.name });
  exitFocus();
  state.focus = b;
  setLens(b.earth ? 'earth' : 'cosmos', false);
  highlight(b);
  flyTo(() => goalFor(b), () => arrive(b), nameOf(b), () => { if (focusable(b)) enterFocus(b); });
  showCard(b);
  renderList();
}
function arrive(b) {
  $('srLive').textContent = `Arrived at ${nameOf(b)}.`;
  setTimeout(() => { if (state.view === 'focus' && (!document.activeElement || document.activeElement === document.body)) $('fName').focus({ preventScroll: true }); }, 50);
  worldOf(b, state.last);
  controls.minDistance = b.radius * 1.12;
  controls.maxDistance = 2000;
  controls.enableRotate = true;
  if (b.signal && !b.discovered) {
    b.discovered = true;
    b.reveal = 0;
    b.mesh.visible = true;
    b.extras.forEach((e) => { e.visible = true; });
    b.beacon.visible = false;
    renderLabel(b);
    showCard(b);
    log.charted[b.name] = { by: me(), at: dayKey }; saveLog();
    quietStamp = b;
    flash(`First to chart · ${b.name}`, `${KIND[b.type]} · ${b.here} here · your name stays on it`, ['Share', () => shareMoment(`I was the first to chart ${b.name} on gnoworld`, b)]);
    toRoom('Earth/#general', `@${me()} was the first to chart ${b.name}.`);
  }
  if (b.mesh?.material?.uniforms?.uScan && !state.explored.has(b.name)) { b.scan = 0; if (HUBS.some((h) => h.name === b.name)) state.explored.add(b.name); }
  updateExplored();
  stamp(b);
  renderList();
  renderHRail();
  if (!focusable(b)) showBigTitle(b); else if (state.view !== 'focus') enterFocus(b);
}
function home(lens) {
  exitFocus();
  state.focus = null;
  highlight(null);
  leftView('places');
  $('bigTitle').hidden = true;
  document.body.dataset.focus = 'off';
  if (!roomState.place) setRoom(null);
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  controls.minDistance = 3;
  controls.enableRotate = lens !== 'map';
  flyTo(VIEWS[lens], undefined, lens === 'map' ? 'Top view' : 'Universe');
  renderList();
}
function setLens(lens, travel = true) {
  state.lens = lens;
  wake();
  document.querySelectorAll('#lens button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lens === lens)));
  navState();
  document.body.dataset.ui = lens === 'list' ? 'list' : 'space';
  $('board').hidden = lens !== 'list';
  if (lens === 'list') { exitFocus(); renderBoard(); if (G) G.fromTo('#board', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }); return; }
  $('crumb').textContent = lens === 'map' ? 'Map' : state.focus ? `› ${nameOf(state.focus)}` : 'Cosmos';
  paintOrbits();
  if (!travel) return;
  if (lens === 'earth') go(earth); else home(lens);
}
let hoverBody = null;
function paintOrbits() {
  bodies.forEach((x) => {
    if (!x.orbit) return;
    x.orbit.material.color.set(0x9fb4d8);
    x.orbit.material.opacity = (x !== state.focus && state.focus?.kind === 'system' && inEco(x)) || (state.view !== 'focus' && x === hoverBody) ? 0.3 : state.lens === 'map' && !x.remote ? 0.16 : 0;
    x.orbit.visible = x.orbit.material.opacity > 0.001;
  });
}
function hover(b) { if (hoverBody === b) return; hoverBody = b; paintOrbits(); }
function highlight(b) {
  paintOrbits();
  bodies.forEach((x) => { (x.moonOrbits ?? []).forEach((o) => { o.visible = x === b; }); });
  $('crumb').textContent = b ? `› ${nameOf(b)}` : state.lens === 'map' ? 'Map' : 'Cosmos';
}
document.querySelectorAll('#lens button').forEach((b) => b.addEventListener('click', () => setLens(b.dataset.lens)));
$('crumb').addEventListener('click', () => setLens('cosmos'));
$('backBtn').addEventListener('click', () => setLens('cosmos'));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('dialog[open]')) return;
  const typing = e.target.closest && e.target.closest('input, textarea');
  if (typing && !$('cmdHint').hidden) { $('cmdHint').hidden = true; return; }
  if (!$('share').hidden) { closeShare(); return; }
  if (!$('notif').hidden) { $('notif').hidden = true; $('bellBtn').setAttribute('aria-expanded', 'false'); $('bellBtn').focus(); return; }
  if (document.body.dataset.drawer) { document.body.dataset.drawer = ''; $('hFind').focus(); return; }
  if (threadLi) { closeThread(); return; }
  if (document.body.dataset.chat) { chatMode(document.body.dataset.chat === 'full' ? 'open' : ''); return; }
  if (typing) { e.target.blur(); return; }
  if (state.focus || state.lens !== 'cosmos') setLens('cosmos');
});
$('followBtn').addEventListener('click', () => {
  const b = state.focus; if (!b || hidden(b)) return;
  if (state.followed.has(b.name)) state.followed.delete(b.name); else state.followed.add(b.name);
  try { localStorage.setItem('gw.follow', JSON.stringify([...state.followed])); } catch {}
  showCard(b); renderHRail();
});

// ---------- card, toast, explored ----------
const SVGNS = 'http://www.w3.org/2000/svg';
function histogram(svg, seed, n = 48) {
  const r = rng(seed), vals = [];
  svg.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const v = 0.12 + 0.88 * Math.pow(Math.abs(Math.sin(i / 7 + r() * 0.6)), 1.4) * (0.5 + r() * 0.5);
    const rect = document.createElementNS(SVGNS, 'rect');
    rect.setAttribute('x', String((i * 100) / n)); rect.setAttribute('width', String((100 / n) * 0.45));
    rect.setAttribute('y', String(32 - v * 30)); rect.setAttribute('height', String(v * 30));
    rect.setAttribute('fill', i === n - 1 ? '#F2EFEA' : 'rgba(242, 239, 234, 0.36)');
    svg.append(rect);
    vals.push(v);
  }
  return vals;
}
const ROOMS = ['#lobby', '#builders', '#help', '#trading', '#events'];
const slug = (b) => b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const roomNames = (b) => b.roomList ?? [b.earth ? '#general' : `#${slug(b)}`, ...ROOMS.slice(1)];
const POOL = [['kaito', 'JP'], ['aarav', 'IN'], ['mia', 'AU'], ['lea', 'FR'], ['ines', 'PT'], ['sam', 'US'], ['bruna', 'BR'], ['jonas', 'DE'], ['ada', 'NG'], ['minji', 'KR'], ['noor', 'EG'], ['diego', 'MX']];
const flag = (cc) => cc; // a small mono country code, not a flag emoji
const CCOL = ['#F2EFEA', '#FFC46B', '#5CF2C8', '#8FB8FF', '#B79CFF', '#FF8A7A'];
function renderPeople(b) {
  const real = !(b.kind === 'ad' || b.kind === 'system' || hidden(b));
  $('peopleBlock').hidden = !real; $('countryBlock').hidden = !real;
  if (!real) return;
  const r = rng(hash(b.name) ^ 77), list = $('cardPeople'), people = [];
  const pool = POOL.slice().sort(() => r() - 0.5).slice(0, 5);
  pool.forEach(([name, cc], i) => people.push({ name, cc, n: Math.round((40 - i * 7) * (0.6 + r() * 0.6)) }));
  list.innerHTML = '';
  people.forEach((x) => {
    const li = document.createElement('li');
    const av = document.createElement('span'); av.className = 'av'; av.style.background = `hsl(${Math.round(r() * 360)} 40% 55%)`;
    const nm = document.createElement('span'); nm.textContent = x.name;
    const fl = document.createElement('span'); fl.className = 'fl'; fl.textContent = flag(x.cc); fl.title = COUNTRIES[x.cc][0];
    const v = document.createElement('span'); v.className = 'v'; v.textContent = String(x.n);
    li.append(av, nm, fl, v); list.append(li);
  });
  const shares = people.slice(0, 4).map((x, i) => [COUNTRIES[x.cc][0], 34 - i * 6 + Math.round(r() * 6)]);
  shares.push(['Others', 100 - shares.reduce((a, [, v]) => a + v, 0)]);
  const bar = $('cardCountries'), key = $('cardCountriesKey');
  bar.innerHTML = ''; key.innerHTML = '';
  shares.forEach(([c, v], i) => {
    const seg = document.createElement('span'); seg.style.cssText = `flex: ${v}; background: ${CCOL[i % CCOL.length]}`; bar.append(seg);
    const k = document.createElement('span'); const dot = document.createElement('i'); dot.style.background = CCOL[i % CCOL.length];
    k.append(dot, document.createTextNode(`${c} ${v}%`)); key.append(k);
  });
}
const LINKS = {
  BUBBLE: { app: 'https://gno.world', gnoweb: 'https://gno.land/r/g1leu8d2vsplhehcfkjg50mwgdpxdkt8tztu95wr/bubble' },
  'Memba DAO': { gnoweb: 'https://gno.land/r/samcrew/memba_dao_channels_v2' },
  GovDAO: { gnoweb: 'https://gno.land/r/gov/dao' },
  Adena: { app: 'https://www.adena.app' },
  Earth: { gnoweb: 'https://gno.land' },
};
function linksFor(b) {
  const l = LINKS[b.name] ?? {};
  const out = [];
  if (l.app && DAPP[b.name]?.[6] !== l.app) out.push(['Open the dApp', l.app]);
  if (l.gnoweb && DAPP[b.name]?.[6] !== l.gnoweb) out.push(['View on gnoweb', l.gnoweb]);
  out.push(['Explorer', 'https://gnoscan.io'], ['Docs', 'https://docs.gno.land']);
  return out;
}
const DAPP = {
  BUBBLE: ['A game of pots: boop a bubble before its clock runs out.', 'Latest', 'Version 6 · 2 days ago', 'Today', '1,204 boops', 'Boop a bubble', 'https://gno.world'],
  'Memba DAO': ['DAO tools: channels, quests and escrow.', 'Latest', 'escrow_v4 is live', 'Members', '312', 'Open a quest', 'https://gno.land/r/samcrew/memba_dao_channels_v2'],
  GovDAO: ["gno.land's governance: proposals and votes.", 'Latest', 'Proposal 15 opened today', 'Open', '3 proposals', 'Read the proposals', 'https://gno.land/r/gov/dao'],
  Adena: ['The gno.land wallet: send, sign, connect.', 'Latest', 'v1.22.3 signs messages', 'Works with', 'gnoworld', 'Install Adena', 'https://www.adena.app'],
  gnogolf: ['Code golf on gno: write the shortest realm that passes.', 'This week', 'A new course', 'Best score', '214 bytes', 'Ask Jarvis how to play', null],
};
function renderDapp(el, b, act = true) {
  el.innerHTML = '';
  if (b.kind === 'ad') {
    el.hidden = false;
    const what = document.createElement('div'); what.className = 'what'; what.textContent = 'A billboard anyone with a gno name can rent. Its text passes the name filter and moderation.';
    const kv = (k, v) => { const w = document.createElement('div'); const sm = document.createElement('small'); sm.textContent = k; const bb = document.createElement('b'); bb.textContent = v; w.append(sm, bb); return w; };
    const id = String(++actId); actions.set(id, () => say('ai', 'Renting arrives in phase 2, on onyx first. This is a sample.'));
    const bt = document.createElement('a'); bt.href = '#'; bt.dataset.act = id; bt.addEventListener('click', (e) => e.preventDefault()); bt.textContent = b.by ? 'Rent when it frees up' : 'Rent this satellite';
    el.append(what, kv('Price', b.price), kv('Status', b.by ? `rented by ${b.by}` : 'free'));
    if (act) el.append(bt);
    return;
  }
  if (b.kind === 'system' || hidden(b) || b.earth || (!act && !DAPP[b.name])) { el.hidden = true; return; }
  el.hidden = false;
  const d = DAPP[b.name] ?? [b.desc ?? 'A world of the gno.land universe.', 'Rooms', String(b.rooms ?? 0), 'Here now', String(b.here ?? 0), (b.here ?? 0) < 20 ? 'Start the first conversation' : 'Join the conversation', null];
  const kv = (k, v) => { const w = document.createElement('div'); const sm = document.createElement('small'); sm.textContent = k; const bb = document.createElement('b'); bb.textContent = v; w.append(sm, bb); return w; };
  el.append(kv(d[1], d[2]), kv(d[3], d[4]));
  if (!act) return;
  if (d[6]) { const a = document.createElement('a'); a.href = d[6]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = `${d[5]} ↗`; el.append(a); }
  else { const id = String(++actId); actions.set(id, () => (d[5].startsWith('Ask') ? ask(`@jarvis how do I play ${b.name}?`) : openChat())); const bt = document.createElement('a'); bt.href = '#'; bt.dataset.act = id; bt.addEventListener('click', (e) => e.preventDefault()); bt.textContent = d[5]; el.append(bt); }
}
const kvEl = (k, v, wide) => { const w = document.createElement('div'); if (wide) w.className = 'wide'; const sm = document.createElement('small'); sm.textContent = k; const bb = document.createElement('b'); bb.textContent = v; w.append(sm, bb); return w; };
const realmOf = (b) => (LINKS[b.name]?.gnoweb ?? '').replace('https://', '') || (b.path?.includes('/r/') ? b.path : `gno.land/r/${slug({ name: b.system ?? 'hubs' })}/${slug(b)}`);
function renderAbout(b) {
  const el = $('fDapp'); el.innerHTML = '';
  el.hidden = b.kind === 'system' || hidden(b) || b.earth;
  if (el.hidden) return;
  const what = (t) => Object.assign(document.createElement('div'), { className: 'what', textContent: t });
  if (b.kind === 'ad') { el.append(what('A billboard anyone with a gno name can rent. Its text passes the name filter and moderation.')); return; }
  const d = DAPP[b.name], r = rng(hash(b.name) ^ 77);
  if (d) el.append(kvEl(d[1], d[2]), kvEl(d[3], d[4]));
  const addr = `g1${Array.from({ length: 38 }, () => '023456789acdefghjklmnpqrstuvwxyz'[Math.floor(r() * 32)]).join('')}`;
  el.append(kvEl('Realm · from the explorer', realmOf(b), true), kvEl('Deployed by', `${addr.slice(0, 8)}…${addr.slice(-4)}`), kvEl('Since block', (1203891 - Math.floor(200000 + r() * 700000)).toLocaleString('en-US')), kvEl('Calls · 24 h', String(Math.round(40 + (b.here ?? 10) * (4 + r() * 12)))));
}
const POSTS = {
  Earth: ['@_gnoland', 'Onyx, the new testnet, is live. Deploy, break things, tell us.', '2 h'],
  BUBBLE: ['@gnoworld', 'Version 6: bubbles now pop in chains. Go boop.', '5 h'],
  GovDAO: ['@_gnoland', 'Proposal 15 is open for votes until tonight.', '1 h'],
  'Memba DAO': ['@membadao', 'escrow_v4 is live: quests can hold funds until they are done.', '1 d'],
  Adena: ['@adena_app', 'Adena 1.22.3 signs messages. gnoworld login uses it.', '3 h'],
  gnogolf: ['@gnogolf', 'New course: the shortest realm that counts to 10.', '6 h'],
};
function renderMedia(b) {
  const d = DAPP[b.name], post = POSTS[b.name];
  $('fPost').hidden = !post;
  if (post) { $('fPostWho').textContent = post[0]; $('fPostText').textContent = post[1]; $('fPostWhen').textContent = `${post[2]} ago · sample ↗`; $('fPostLink').href = `https://x.com/${post[0].slice(1)}`; }
  // a real capture of the world's page, taken on gnoweb or its site; no capture, no preview
  const p = PREVIEWS[b.name], el = $('fMedia'); el.hidden = !p;
  if (!p) return;
  $('fShot').src = p[0]; $('fShot').alt = `${p[1]}, a capture`;
  $('fMediaS').textContent = `${p[1]} · captured`;
}
const PREVIEWS = {
  GovDAO: ['./prev-govdao.jpg', 'gno.land/r/gov/dao'],
  'Memba DAO': ['./prev-memba.jpg', 'gno.land/r/samcrew/memba_dao_channels_v2'],
  BUBBLE: ['./prev-bubble-realm.jpg', 'gno.land/r/…/bubble'],
  Adena: ['./prev-adena.jpg', 'adena.app'],
};
// the lightbox: one photo or video at a time, arrows walk through the rest of the chat's media
let media = [], mediaAt = 0;
function openMedia(list, i) {
  media = list; mediaAt = (i + list.length) % list.length;
  const el = list[mediaAt], video = el.tagName === 'VIDEO', vid = $('mediaVid'), img = $('mediaImg');
  img.hidden = video; vid.hidden = !video;
  if (video) { vid.src = el.src; vid.play().catch(() => {}); } else { vid.pause(); vid.removeAttribute('src'); img.src = el.src; img.alt = el.alt; }
  $('mediaCap').textContent = `${el.dataset.cap ?? ''}${list.length > 1 ? ` · ${mediaAt + 1} of ${list.length}` : ''}`;
  $('mediaPrev').hidden = $('mediaNext').hidden = list.length < 2;
  if (!$('mediaBox').open) $('mediaBox').showModal();
}
$('fMedia').addEventListener('click', () => { const shot = Object.assign(document.createElement('img'), { src: $('fShot').src, alt: $('fShot').alt }); shot.dataset.cap = $('fMediaS').textContent; openMedia([shot], 0); });
$('mediaClose').addEventListener('click', () => $('mediaBox').close());
$('mediaBox').addEventListener('close', () => $('mediaVid').pause());
$('mediaPrev').addEventListener('click', () => openMedia(media, mediaAt - 1));
$('mediaNext').addEventListener('click', () => openMedia(media, mediaAt + 1));
$('mediaBox').addEventListener('keydown', (e) => { if (media.length < 2 || e.target.tagName === 'VIDEO') return; if (e.key === 'ArrowLeft') openMedia(media, mediaAt - 1); if (e.key === 'ArrowRight') openMedia(media, mediaAt + 1); });
function fitName() {
  const nm = $('fName'), colW = innerWidth <= 900 ? innerWidth - 64 : Math.min(600, innerWidth * 0.41) - 126;
  nm.style.fontSize = `${Math.max(36, Math.min(innerHeight * 0.12, colW / Math.max(4, nm.textContent.length * 0.58)))}px`;
}
let rentDays = 3;
function openRent(b) {
  const box = $('rentBox'), per = parseFloat(b.price);
  $('rentWhere').textContent = b.name;
  $('rentText').value = '';
  const sync = () => {
    box.querySelectorAll('#rentDays button').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.d) === rentDays)));
    $('rentGo').textContent = `Rent · ${per * rentDays} GNOT`;
    $('rentLeft').textContent = `${40 - $('rentText').value.length} characters left`;
    $('rentGo').disabled = !$('rentText').value.trim();
  };
  box.querySelectorAll('#rentDays button').forEach((x) => { x.onclick = () => { rentDays = Number(x.dataset.d); sync(); }; });
  $('rentText').oninput = sync;
  $('rentCancel').onclick = () => box.close();
  $('rentGo').onclick = () => {
    const text = $('rentText').value.trim().slice(0, 40); if (!text) return;
    Object.assign(b.src, { text, by: me(), days: rentDays }); Object.assign(b, { text, by: me(), days: rentDays });
    const f2 = $('fFacts').children[1];
    if (f2) { f2.querySelector('.big > span').textContent = String(rentDays); f2.querySelector('sup').textContent = 'days'; f2.querySelector('.cap').textContent = 'left on the rental'; }
    b.src.redraw?.();
    box.close();
    $('fName').textContent = text; fitName();
    renderMain(b);
    sys(`You rented ${b.name} for ${rentDays} days · ${per * rentDays} GNOT. Your text is live after the name filter. (Sample: nothing was sent.)`);
    if (G) G.fromTo(b.bill.scale, { x: b.bill.scale.x * 0.8, y: b.bill.scale.y * 0.8, z: b.bill.scale.z * 0.8 }, { x: b.bill.scale.x, y: b.bill.scale.y, z: b.bill.scale.z, duration: 0.9, ease: 'elastic.out(1, 0.5)' });
  };
  sync();
  box.showModal();
  setTimeout(() => $('rentText').focus(), 50);
}
let mainAct = null;
$('fMain').addEventListener('click', (e) => { if (mainAct) { e.preventDefault(); mainAct(); } });
function renderMain(b) {
  const el = $('fMain'), d = DAPP[b.name];
  mainAct = null; el.href = '#'; el.removeAttribute('target'); el.removeAttribute('rel'); el.textContent = '';
  if (b.kind === 'system') { const w = bodies.filter((x) => x.system === b.name).sort((a, c) => (c.here ?? 0) - (a.here ?? 0))[0]; el.textContent = `Enter ${w.name}`; mainAct = () => go(w); }
  else if (b.kind === 'ad') { el.textContent = b.by === me() ? `Yours for ${b.days} days` : b.by ? 'Rent when it frees up' : 'Rent this satellite'; mainAct = b.by === me() ? () => {} : b.by ? () => { openChat(); say('ai', 'This one is taken. You can rent it when it frees up, or claim the free slot around gnogolf.'); } : () => openRent(b); }
  else if (d?.[6]) { el.textContent = `${d[5]} ↗`; el.href = d[6]; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
  else if (d) { el.textContent = d[5]; mainAct = () => ask(`@jarvis how do I play ${b.name}?`); }
  else if (b.born && !log.firstWords?.[b.name]) { el.textContent = 'Be the first to say hi'; mainAct = () => { openChat(); const i = $('chatInput'); i.value = `gm ${b.name}, first one here`; i.focus(); }; }
  else if (b.kind === 'station') { el.textContent = b === bmoon ? 'Watch the screens' : b === aiRing ? 'Open this week’s build' : 'Today’s long read'; mainAct = () => placeCard('station'); }
  else if (b.name === EVENT.place) { el.textContent = eventPhase() === 'live' ? 'Join the AMA · live' : `AMA ${eventLabel()} · remind me`; mainAct = () => { openChat(); placeCard('events'); }; }
  else if (b.group === 'topic') { const top = ecoMembers(b).filter((x) => !hidden(x)).sort((x, y) => (y.here ?? 0) - (x.here ?? 0))[0]; if (top) { el.textContent = `Enter ${top.name}`; mainAct = () => go(top); } }
  else if (!b.earth && b.path?.includes('/r/')) { el.textContent = 'Open the realm'; mainAct = () => { openChat(); placeCard('realm'); }; }
  else if (roomsFor(b).length) { el.textContent = `Say hi in ${roomState.name}`; mainAct = () => { if (!document.body.dataset.chat) chatMode('open'); const i = $('chatInput'); i.value = 'Hi everyone 👋 '; i.focus(); }; }
  el.hidden = !el.textContent;
  // an icon says what the button does: talk, ask, rent, enter, open
  const kind = b.name === EVENT.place ? 'chat' : b.kind === 'system' || b.kind === 'station' || b.group === 'topic' || (!b.earth && !d && b.path?.includes('/r/')) ? 'enter' : b.kind === 'ad' ? 'sat' : d?.[6] ? 'out' : d ? 'jarvis' : 'chat';
  const ic = document.createElement('span'); ic.className = `cta-ic ${kind}`; ic.setAttribute('aria-hidden', 'true');
  ic.innerHTML = { chat: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke-linejoin="round"/></svg>', enter: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>', sat: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="6" y="6" width="4" height="4" rx="0.8"/><path d="M1.5 6.5h3v3h-3zM11.5 6.5h3v3h-3zM8 10v2.5M6.5 13.5h3"/></svg>', out: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="5.5"/><path d="M6 10l4-4M6.5 6H10v3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>', jarvis: '' }[kind];
  if (el.textContent) el.prepend(ic);
  if (d?.[6]) el.lastChild.textContent = el.lastChild.textContent.replace(/ ↗$/, '');
}
const PINS = {
  Earth: [['ana · mod', 'Welcome. Be kind, no spam, any language is fine.'], ['gno.land', 'Onyx, the new testnet, is live. Report bugs in #help.']],
  GovDAO: [['GovDAO', 'Proposal 15 closes in 2 h. Read it before you vote.']],
};
function renderEco(b) {
  const m = ecoMembers(b), box = $('fEcoList'); box.innerHTML = '';
  $('fEco').hidden = !m.length;
  $('fEcoTitle').textContent = b.kind === 'system' ? `Worlds of ${b.name}` : `The ${b.name} ecosystem`;
  m.forEach((x) => {
    const bt = document.createElement('button'); bt.type = 'button';
    const col = document.createElement('span'), nm = document.createElement('b'), sm = document.createElement('small');
    nm.textContent = x.name; sm.textContent = `${facts(x).kind} · ${x.here ?? 0} here`; col.append(nm, sm);
    bt.append(thumbFor(x), col); bt.addEventListener('click', () => go(x)); box.append(bt);
  });
}
const pinStore = new Map();
function pinsFor(b) {
  if (!b) return [];
  if (b.name === EVENT.place && !pinStore.has(b.name)) pinStore.set(b.name, [['Dev help mods', `${EVENT.title} · ${eventLabel()} · voice lounge`]]);
  if (!pinStore.has(b.name)) { const d = DAPP[b.name]; pinStore.set(b.name, [...(PINS[b.name] ?? (d ? [[`${b.name} team`, `${d[1]}: ${d[2]}.`]] : [[`${b.name} mods`, `Welcome to ${roomNames(b)[0]}. Say hi and tell us what you build.`]]))]); }
  return pinStore.get(b.name);
}
let pinsOpen = false;
function renderPinList() {
  const pins = pinsFor(roomState.place), bar = $('pinBar');
  bar.hidden = !pins.length; bar.innerHTML = '';
  if (!pins.length) return;
  bar.classList.toggle('open', pinsOpen);
  const head = document.createElement('button'); head.type = 'button'; head.className = 'pinhead'; head.setAttribute('aria-expanded', String(pinsOpen));
  const ic = document.createElement('span'); ic.className = 'pinic'; ic.setAttribute('aria-hidden', 'true'); ic.append(icon('pin', 13));
  const first = document.createElement('span'); first.className = 'pintext';
  const w = document.createElement('b'); w.textContent = pins[0][0]; first.append(w, ` ${pins[0][1]}`);
  const n = document.createElement('small'); n.textContent = pins.length > 1 ? (pinsOpen ? 'Hide' : `+${pins.length - 1}`) : '';
  head.append(ic, first, n); head.setAttribute('aria-label', `Pinned in ${roomState.name}: ${pins.length}`);
  head.addEventListener('click', () => { pinsOpen = !pinsOpen; renderPinList(); });
  bar.append(head);
  if (!pinsOpen) return;
  pins.forEach(([who, text], i) => {
    const row = document.createElement('div'); row.className = 'pin';
    const b = document.createElement('b'); b.textContent = who;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'unpin'; x.setAttribute('aria-label', `Unpin ${who}'s message`); x.append(icon('close', 12));
    x.addEventListener('click', () => { pins.splice(i, 1); renderPinList(); });
    row.append(b, document.createTextNode(text), x); bar.append(row);
  });
}
function renderLinks(el, b) {
  el.innerHTML = '';
  linksFor(b).forEach(([label, href]) => {
    const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = label;
    const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '↗';
    a.append(arrow); el.append(a);
  });
}
function facts(b) {
  if (b.kind === 'ad') return { soft: 'on a rented satellite.', kind: 'Sponsored satellite', name: b.text, a: [b.price.split(' ')[0], 'GNOT a day'], c: b.by ? ['12', 'days left'] : ['now', 'available'],
    tags: [b.by ? `rented by ${b.by}` : 'anyone can rent', 'name required'], tiles: [['Text rules', 'name filter · moderated'], ['Renting', 'paid in GNOT on chain']],
    seed: 'Anyone with a gno name can rent a satellite for a few days. The text passes the name filter and moderation.' };
  if (b.earth) return { soft: 'our home.', kind: 'Home · the general chat', name: 'Earth', a: ['184', 'talking now'], c: ['31', 'countries'], tags: ['countries are opt-in'],
    tiles: [['Most active', 'United States · Japan'], ['You appear in', 'France']], seed: 'Bubbles show public messages at the speaker\'s declared country.', desc: 'Where people speak from. Countries are opt-in.' };
  if (hidden(b)) return { soft: 'nobody knows yet.', kind: 'Uncharted signal', name: 'Signal', a: ['?', 'here'], c: ['?', 'rooms'], tags: ['go and look'], tiles: [], seed: 'Fly there to find out what it is.' };
  if (b.kind === 'station') return { soft: 'a station.', kind: `Station · ${b.topic}`, name: b.name, a: [String(b.here), 'aboard'], c: ['2', 'rooms'], tags: b.tags, tiles: [['Curated by', 'the gno.land team'], ['Topic', b.topic]], seed: b.desc, desc: `${b.desc} Curated by the gno.land team, not a realm.` };
  if (b.kind === 'system') return { soft: 'another system.', kind: 'Another system', name: b.name, a: [String(b.here), 'here now'], c: [String(b.count), 'worlds'], tags: ['far away', 'a long trip'], tiles: [['Light from', b.star], ['Reached', 'by a long trip']], seed: b.desc, desc: b.desc };
  return { soft: `${b.group === 'topic' ? 'an ecosystem' : 'a ' + KIND[b.type].toLowerCase()}.`, desc: b.desc ?? (b.remote ? `A world of ${b.system}.` : ''), kind: b.group === 'topic' ? 'Ecosystem' : b.dao ? 'DAO' : DAPP[b.name] ? 'dApp' : b.remote ? 'World' : 'Hub', name: b.name, a: [String(b.here), 'here now'], c: [String(b.rooms), 'rooms'],
    tags: [...(b.tags ?? []), ...(b.dao ? ['rings = a DAO'] : []), ...(b.signal ? ['new'] : [])],
    tiles: b.tiles ?? [['Active', 'last hour'], ['Rooms', roomNames(b).slice(0, b.rooms).join(' ')]], seed: `Planet generated from ${b.path}` };
}
function leftView(v) {
  if (v === 'guide') document.body.dataset.drawer = 'left';
  $('places').hidden = v !== 'places';
  $('card').hidden = v !== 'card';
  $('guide').hidden = v !== 'guide';
  $('guideBtn').setAttribute('aria-expanded', String(v === 'guide'));
  document.body.dataset.guide = v === 'guide' ? 'open' : '';
}
let range = [0.15, 0.85], series = [], peakRate = 100;
function setRange() {
  const n = series.length, a = Math.floor(range[0] * (n - 1)), z = Math.ceil(range[1] * (n - 1));
  const part = series.slice(a, z + 1).map((v) => Math.round(v * peakRate));
  $('hMin').style.left = `${range[0] * 100}%`; $('hMax').style.left = `${range[1] * 100}%`;
  $('rSel').style.left = `${range[0] * 100}%`; $('rSel').style.width = `${(range[1] - range[0]) * 100}%`;
  $('rMin').textContent = String(Math.min(...part)); $('rMax').textContent = String(Math.max(...part));
  $('rNow').textContent = String(Math.round(series[n - 1] * peakRate));
  [...$('cardHist').children].forEach((r, i) => r.setAttribute('opacity', i >= a && i <= z ? '1' : '0.3'));
}
['hMin', 'hMax'].forEach((id, k) => {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const box = $('rTrack').getBoundingClientRect();
      let x = Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width));
      x = k === 0 ? Math.min(x, range[1] - 0.06) : Math.max(x, range[0] + 0.06);
      range[k] = x; setRange();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const d = e.key === 'ArrowLeft' ? -0.04 : 0.04;
    range[k] = k === 0 ? Math.min(Math.max(0, range[k] + d), range[1] - 0.06) : Math.max(Math.min(1, range[k] + d), range[0] + 0.06);
    setRange();
  });
});
const MOODS = ['Quiet', 'Calm', 'Steady', 'Lively', 'Buzzing'];
function renderInsights(b, f, vals) {
  const real = !(b.kind === 'ad' || b.kind === 'system' || hidden(b) || b.earth);
  ['pulseBlock', 'activityBlock', 'gaugeBlock'].forEach((id) => { $(id).hidden = !real && !b.earth; });
  $('cardTabs').hidden = !real;
  const r = rng(hash(b.name) ^ 991);
  series = vals; peakRate = Math.round(20 + (b.here ?? 100) * 0.6); range = [0.15, 0.85]; setRange();
  const pct = Math.round(45 + r() * 50), delta = Math.round((r() - 0.3) * 30);
  $('pulsePct').textContent = `${pct}%`;
  $('pulseA').textContent = MOODS[Math.min(4, Math.floor(pct / 20))];
  $('pulseB').textContent = `${delta >= 0 ? '+' : ''}${delta}% · 1 h`;
  const g = Math.round(52 + r() * 34);
  $('gaugePct').textContent = `${g}% regulars`;
  $('gaugeArc').setAttribute('stroke-dasharray', `${g} 100`);
  $('gaugeArc').dataset.v = String(g);
  renderRelief(b, r);
  selectTab('overview');
}
function renderRelief(b, r) {
  const svg = $('reliefSvg'), pills = $('reliefPills'), rooms = roomNames(b).slice(0, Math.max(1, b.rooms ?? 1));
  svg.innerHTML = ''; pills.innerHTML = '';
  const peaks = rooms.map((name, i) => ({ name, x: 0.18 + r() * 0.64, z: 0.2 + r() * 0.6, h: 1 - i * 0.18 }));
  const H = (x, z) => peaks.reduce((a, p) => a + p.h * Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / 0.018), 0) + 0.04 * Math.sin(x * 19 + z * 7);
  const P = (x, z) => [20 + x * 220 + z * 40, 132 - z * 56 - H(x, z) * 62];
  const N = 26, M = 13;
  for (let j = 0; j <= M; j++) {
    const pts = []; for (let i = 0; i <= N; i++) pts.push(P(i / N, j / M).map((v) => v.toFixed(1)).join(','));
    const pl = document.createElementNS(SVGNS, 'polyline'); pl.setAttribute('points', pts.join(' ')); svg.append(pl);
  }
  for (let i = 0; i <= N; i += 2) {
    const pts = []; for (let j = 0; j <= M; j++) pts.push(P(i / N, j / M).map((v) => v.toFixed(1)).join(','));
    const pl = document.createElementNS(SVGNS, 'polyline'); pl.setAttribute('points', pts.join(' ')); pl.setAttribute('class', 'c'); svg.append(pl);
  }
  peaks.forEach((p) => {
    const [x, y] = P(p.x, p.z);
    const el = document.createElement('span'); el.className = 'pill'; el.textContent = p.name;
    el.style.left = `${(x / 280) * 100}%`; el.style.top = `calc(${(y / 150) * 100}% - 14px)`;
    pills.append(el);
  });
  const list = $('roomList'); list.innerHTML = '';
  rooms.forEach((name, i) => {
    const n = Math.max(1, Math.round(((b.here ?? 10) * (rooms.length - i)) / (rooms.length * 1.6)));
    const li = document.createElement('li');
    const a = document.createElement('span'); a.textContent = name;
    const bar = document.createElement('span'); bar.className = 'bar'; const fill = document.createElement('i'); fill.style.width = `${Math.round((n / Math.max(1, b.here ?? 10)) * 160)}%`; bar.append(fill);
    const v = document.createElement('span'); v.className = 'v'; v.textContent = String(n);
    li.append(a, bar, v); list.append(li);
  });
}
function selectTab(tab) {
  document.querySelectorAll('#cardTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('tabOverview').hidden = tab !== 'overview'; $('tabPeople').hidden = tab !== 'people'; $('tabRooms').hidden = tab !== 'rooms';
  if (!G) return;
  if (tab === 'rooms') {
    document.querySelectorAll('#reliefSvg polyline').forEach((pl) => { const L = pl.getTotalLength(); G.fromTo(pl, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out', delay: Math.random() * 0.25 }); });
    G.fromTo('#reliefPills .pill', { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, delay: 0.5 });
    G.fromTo('#roomList li', { x: -10, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, stagger: 0.05 });
  } else if (tab === 'people') {
    G.fromTo('#cardPeople li', { x: -10, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, stagger: 0.05 });
    G.fromTo('#cardCountries span', { scaleX: 0 }, { scaleX: 1, transformOrigin: '0 50%', duration: 0.7, stagger: 0.06, ease: 'power3.out' });
  }
}
document.querySelectorAll('#cardTabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
const focusable = (b) => !hidden(b);
const fPlate = $('fPlate');
const tuckEls = [];
let fRect = null, offK = { v: 0 }, lastPr0 = 200, fitRight = 1200;
function focusLayer(b, on) {
  const worlds = b ? [b, ...(isEco(b) ? ecoNear(b).concat(b.kind === 'system' ? ecoMembers(b) : []) : [])] : [];
  worlds.forEach((x) => [x.mesh, ...x.extras.filter((e) => e !== x.sats && !(x.moons ?? []).some((m) => m.pivot === e))].forEach((o) => o?.layers.set(on ? FOCUS_LAYER : 0)));
  const sat = b && ads.find((a) => a.host === b.name);
  if (sat) sat.bill.traverse((o) => o.layers.set(on ? 1 : 0));
  if (on && sat) { b.obj.add(occluder); occluder.scale.setScalar(b.radius * (b.earth ? 1.01 : 1)); } else occluder.removeFromParent();
  moonOccluders.splice(0).forEach((o) => o.removeFromParent());
  if (on && sat) b.obj.traverse((m) => {
    if (!m.isMesh || m === b.mesh || m.geometry !== sphere || m.material.transparent || m.material.blending === THREE.AdditiveBlending) return;
    const o = new THREE.Mesh(occluder.geometry, occluder.material); o.layers.set(1); o.renderOrder = -1; m.add(o); moonOccluders.push(o);
  });
  focusPass.enabled = on;
}
const ACES_IN_INV = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777).invert();
const ACES_OUT_INV = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602).invert();
const panelLinear = new THREE.Color();
// the scene colour that three's ACES filmic tone mapping (at this exposure) turns into `target`
function untone(target, exposure, out) {
  const y = new THREE.Vector3(target.r, target.g, target.b).applyMatrix3(ACES_OUT_INV);
  const v = y.toArray().map((t) => { const a = 1 - 0.983729 * t, b = 0.0245786 - 0.432951 * t, c = -0.000090537 - 0.238081 * t; return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); });
  const x = new THREE.Vector3(...v).applyMatrix3(ACES_IN_INV).multiplyScalar(0.6 / exposure);
  return out.setRGB(Math.max(0, x.x), Math.max(0, x.y), Math.max(0, x.z));
}
function tintPlate(b) {
  const tc = new THREE.Color(dotColor(b)).convertLinearToSRGB(), base = new THREE.Color(0x0a0e16).convertLinearToSRGB();
  const hex = `#${base.lerp(tc, 0.14).getHexString(THREE.NoColorSpace)}`;
  document.body.style.setProperty('--panel', hex);
  panelLinear.setStyle(hex);
}
// how much room a world takes in its frame: a margin around it, more for rings and satellites
const fitReach = (b) => (isEco(b) ? b.extent / b.radius : b?.ring ? 2.35 : b?.kind === 'ad' ? 1.5 : b?.kind === 'station' ? 1.3 : 1.24);
// status ring: a thin gauge around the focused world for what is live there (a clock, a vote, the pace of the room)
const ringU = { uProg: { value: 0 }, uTick: { value: -1 }, uHot: { value: 0 }, uA: { value: 0 }, uTime: time, uR: { value: 0.9 } };
const statusRing = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: ringU, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform float uProg,uTick,uHot,uA,uTime,uR; varying vec2 vP;
    const float TAU=6.2831853;
    float line(float d,float px,float w){ return 1.0-smoothstep(w*px,(w+1.4)*px,abs(d)); }
    void main(){
      vec2 p=vP; float r=length(p); float px=fwidth(r);
      float t=fract(atan(p.x,p.y)/TAU);
      vec3 warm=mix(vec3(1.0,0.66,0.3),vec3(1.0,0.34,0.24),uHot);
      float inArc=step(t,uProg);
      float start=smoothstep(0.0,0.09,t);
      float arc=line(r-uR,px,0.9)*inArc*start*(0.3+0.7*smoothstep(0.0,max(uProg,0.001),t));
      float glow=exp(-pow((r-uR)/0.022,2.0))*inArc*start*0.3;
      vec2 h=vec2(sin(TAU*uProg),cos(TAU*uProg))*uR; float d=length(p-h);
      float head=((1.0-smoothstep(0.011,0.011+px*1.5,d))+exp(-d*d/0.0014)*0.8)*step(0.003,uProg);
      float top=line(p.x,px,0.5)*step(uR+0.022,p.y)*step(p.y,uR+0.07);
      float th=0.0;
      if(uTick>=0.0){ vec2 dir=vec2(sin(TAU*uTick),cos(TAU*uTick)); float al=dot(p,dir); th=line(dot(p,vec2(dir.y,-dir.x)),px,0.5)*step(uR-0.045,al)*step(al,uR+0.06); }
      vec3 col=warm*(arc*1.7+glow*1.4+head*2.4)+vec3(1.0,0.92,0.82)*th*1.3;
      gl_FragColor=vec4(col*uA,1.0);
    }`,
}));
statusRing.layers.set(2); statusRing.visible = false; statusRing.frustumCulled = false; scene.add(statusRing);
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const dh = (ms) => { const h = Math.max(0, Math.floor(ms / 3.6e6)); return `${Math.floor(h / 24)} d ${String(h % 24).padStart(2, '0')} h`; };
const t0 = Date.now(), WEEK = 7 * 864e5;
const MOMENTS = {
  BUBBLE: () => { const left = 240 - ((Date.now() / 1000) % 240); return { prog: left / 240, hot: left < 60, text: `Pot 72.9 GNOT · ${mmss(left)}` }; },
  GovDAO: () => ({ prog: 0.33, tick: 2 / 3, text: 'Proposal 15 · YES 33% of 66.66%' }),
  'Memba DAO': () => { const left = t0 + 52 * 3.6e6 - Date.now(); return { prog: left / WEEK, hot: left < 864e5, text: `Vote closes in ${dh(left)}` }; },
  gnogolf: () => { const left = t0 + 67 * 3.6e6 - Date.now(); return { prog: left / WEEK, text: `Course ends in ${dh(left)}` }; },
};
let ringData = null, ringText = '';
function pickRing(b) {
  if (isEco(b) || b.kind === 'ad' || b.kind === 'system' || b.kind === 'station' || !roomsFor(b).length) return null;
  if (MOMENTS[b.name]) return MOMENTS[b.name];
  const vals = sparkVals, now = vals[vals.length - 1], peak = Math.max(...vals), usual = vals.reduce((a, x) => a + x, 0) / vals.length;
  const d = Math.round((now / usual - 1) * 100);
  return () => ({ prog: now / peak, text: `${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}% vs a usual hour` });
}
let textRight = 600;
function measureFocus() {
  // layout boxes, not the animated ones
  fRect = { left: fPlate.offsetLeft, top: fPlate.offsetTop, right: fPlate.offsetLeft + fPlate.offsetWidth, bottom: fPlate.offsetTop + fPlate.offsetHeight };
  textRight = $('fLeft').offsetLeft + $('fLeft').offsetWidth;
  plateU.uRect.value.set(fRect.left, fRect.top, fRect.right, fRect.bottom);
}
const facts4 = (b) => {
  if (b.earth) return [['184', 'talking', 'right now · 31 countries'], ['37', 'realms', 'deployed on gno.land in 24 h']];
  if (b.kind === 'ad') return [[b.price.split(' ')[0], 'GNOT', 'a day to rent it'], [b.by ? String(b.days ?? 12) : 'Open', b.by ? 'days' : '', b.by ? 'left on the rental' : 'slot, 40 characters']];
  if (b.kind === 'system') return [[String(b.here), 'here', 'right now'], [String(b.count), 'worlds', `in this system · light from ${b.star}`]];
  return [[String(b.here), b.kind === 'station' ? 'aboard' : 'here', 'right now'], [String(rateOf(b)), '/h', 'messages now']];
};
function mirrorTalk() {
  const list = $('fMsgs'); list.innerHTML = '';
  [...$('chatList').children].filter((li) => !li.classList.contains('sys')).slice(-3).forEach((li) => list.append(li.cloneNode(true)));
}
function enterFocus(b) {
  const f = facts(b);
  $('flight').hidden = true;
  state.view = 'focus';
  document.body.dataset.view = 'focus';
  navState();
  bodies.forEach((x) => (x.moonOrbits ?? []).forEach((o) => { o.visible = false; }));
  paintOrbits();
  const focus = $('focus');
  if (G) { G.killTweensOf(focus); G.killTweensOf(offK); G.killTweensOf(plateU.uAlpha); }
  tintPlate(b);
  focusLayer(b, true);
  ringU.uProg.value = 0; ringU.uA.value = 0; ringText = '';
  focus.style.opacity = '';
  focus.hidden = false;
  document.body.style.setProperty('--tc', dotColor(b));
  $('fKind').textContent = f.kind;
  const crumbs = $('fCrumbs'), eco = isEco(b) || b.earth ? null : ecoOf(b);
  crumbs.innerHTML = '';
  [['Universe', () => setLens('cosmos')], ...(eco ? [[eco.name, () => go(eco)]] : [])].forEach(([t, fn]) => {
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = t; bt.addEventListener('click', fn);
    const sep = document.createElement('span'); sep.setAttribute('aria-hidden', 'true'); sep.textContent = '›';
    crumbs.append(bt, sep);
  });
  const nm = $('fName'); nm.textContent = b.kind === 'ad' ? b.text : b.name;
  fitName();
  $('fText').textContent = f.desc ?? '';
  if (log.charted[b.name]) $('fText').textContent += ` First charted by @${log.charted[b.name].by}.`;
  const fx = $('fFacts'); fx.innerHTML = '';
  facts4(b).forEach(([v, unit, cap]) => { const d = document.createElement('div'); const big = document.createElement('span'); big.className = 'big'; const n = document.createElement('span'); n.textContent = v; const sup = document.createElement('sup'); sup.textContent = unit; big.append(n, sup); const c = document.createElement('span'); c.className = 'cap'; c.textContent = cap; d.append(big, c); fx.append(d); });
  const hasRooms = roomsFor(b).length > 0;
  $('fTalk').hidden = !hasRooms;
  $('fActivity').hidden = !hasRooms;
  $('fFollow').hidden = !hasRooms;
  if (hasRooms) {
    const vals = histogram($('fSpark'), hash(b.name), 48);
    const rate = 20 + (b.here ?? 100) * 0.6;
    sparkVals = vals.map((v) => Math.round(v * rate)); sparkVals[sparkVals.length - 1] = rateOf(b);
    $('fActNow').textContent = `${sparkVals[sparkVals.length - 1]} msgs/h now`;
    const peak = sparkVals.indexOf(Math.max(...sparkVals));
    $('fActPeak').textContent = `peak ${sparkVals[peak]}/h · ${hourAgo(sparkVals.length - 1 - peak)}`;
  }
  const on = state.followed.has(b.name);
  $('fFollow').setAttribute('aria-pressed', String(on)); $('fFollow').textContent = on ? 'Following' : 'Follow';
  renderLinks($('fLinks'), b);
  renderAbout(b);
  renderMedia(b);
  renderEco(b);
  renderConn(b);
  renderStationPanel(b);
  setRoom(b);
  renderMain(b);
  $('fRoom').textContent = `${roomState.name} · ${b.earth ? 'Earth' : b.name} · live`;
  $('fEnter').textContent = `Open ${roomState.name}`;
  if (!roomState.welcomed.has(b.name) && roomsFor(b).length) { roomState.welcomed.add(b.name); setTimeout(() => sys(`${roomState.name} · ${roomsFor(b)[0][2]} people here now.`), 1200); }
  mirrorTalk();
  if (innerWidth > 1200 && hasRooms && document.body.dataset.chat !== 'full') { document.body.dataset.chat = 'open'; $('hChat').setAttribute('aria-expanded', 'true'); }
  fitRight = innerWidth - (document.body.dataset.chat === 'open' ? chatW() + 36 : 152);
  renderRail(b);
  renderStations(b);
  ringData = pickRing(b);
  $('fRingLabel').hidden = !ringData;
  if (G && ringData) G.to(ringU.uA, { value: 1, duration: 1.2, delay: 0.5, ease: 'sine.out' }); else ringU.uA.value = 1;
  ads.filter((a) => a.host === b.name).forEach((a) => {
    // orbit seen almost face on from where the camera will stop: it circles the world and dips in front of it, never towards the lens
    const parent = new THREE.Quaternion(); a.spinner.parent.getWorldQuaternion(parent);
    const g = goalFor(b), view = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(g.cam, g.target, up));
    const want = view.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.0));
    a.spinner.quaternion.copy(parent.clone().invert().multiply(want));
    a.spinner.position.set(0, 0, 0);
    a.group3d.position.setLength(b.radius * 1.62);
    a.speed = 0.08;
  });
  requestAnimationFrame(() => {
    measureFocus();
    if (G) {
      G.to(offK, { v: 1, duration: 1.7, ease: 'sine.inOut' });
      G.fromTo(plateU.uAlpha, { value: 0 }, { value: 1, duration: 1.1, ease: 'sine.out' });
      if (innerWidth <= 900) G.fromTo('#fPlate', { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power3.out' });
      G.fromTo('#fFrame', { opacity: 0 }, { opacity: 1, duration: 1.2 });
      G.fromTo('#fName', { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, ease: 'power4.out', delay: 0.1 });
      G.fromTo('#fLeft > .kicker, #fText, #fFacts > div, #fActivity, #fActs, #fEco, #fConn, #fStation, #fMedia, #fDapp, #fPost, #fLinks, #fTalk', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.05, ease: 'power3.out', delay: 0.25 });
      document.querySelectorAll('#fFacts .big > span:first-child').forEach((e) => countUp(e));
      G.fromTo('#fSpark rect', { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 100%', duration: 0.6, stagger: 0.01, ease: 'power2.out', delay: 0.4 });
    } else { offK.v = 1; plateU.uAlpha.value = 1; }
  });
}
let sparkVals = [];
const hourAgo = (i) => { const d = new Date(Date.now() - i * 30 * 60000); return `${String(d.getHours()).padStart(2, '0')}:${d.getMinutes() < 30 ? '00' : '30'}`; };
$('fSpark').addEventListener('pointermove', (e) => {
  const r = e.currentTarget.getBoundingClientRect(), n = sparkVals.length;
  if (!n) return;
  const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
  const tip = $('fSparkTip'); tip.hidden = false;
  tip.textContent = `${hourAgo(n - 1 - i)} · ${sparkVals[i]} msgs/h`;
  tip.style.left = `${((i + 0.5) / n) * 100}%`;
  $('fSpark').querySelectorAll('rect').forEach((x, j) => x.classList.toggle('on', j === i));
});
$('fSpark').addEventListener('pointerleave', () => { $('fSparkTip').hidden = true; $('fSpark').querySelectorAll('rect.on').forEach((x) => x.classList.remove('on')); });
function thumbFor(b) {
  if (b.kind === 'system') { const st = document.createElement('span'); st.className = 'thumbp star'; st.style.setProperty('--sc', b.tint); return st; }
  if (b.kind === 'station') { const st = document.createElement('span'); st.className = 'thumbp stn'; st.style.backgroundImage = `url(./thumb-${slug(b)}.jpg)`; return st; }
  if (b.group === 'topic') { const g = document.createElement('span'); g.className = 'thumbp cluster'; ecoMembers(b).slice(0, 3).forEach((m) => g.append(thumbFor(m))); return g; }
  const t = document.createElement('span'); t.className = 'thumbp';
  if (b.earth) t.style.backgroundImage = 'url(./earth_day.jpg)';
  else if (b.look?.tex) {
    t.style.backgroundImage = `url(./${b.look.tex}.jpg)`;
    t.style.filter = `hue-rotate(${Math.round((b.look.hue * 180) / Math.PI)}deg) saturate(${b.look.sat.toFixed(2)}) brightness(${b.look.gain.toFixed(2)})`;
    if (b.look.tint) Object.assign(t.style, { backgroundColor: b.look.tint, backgroundBlendMode: 'luminosity', filter: 'none' });
  } else t.style.background = dotColor(b);
  return t;
}
function renderRail(cur) {
  const list = $('fRailList'); list.innerHTML = '';
  const here = worldOf(cur);
  const eco = isEco(cur) ? cur : ecoOf(cur);
  const near = eco ? ecoMembers(eco).slice(0, 8).map((x) => [x, 0]) : bodies.filter((x) => focusable(x) && !x.remote && x.kind !== 'ad' && x.kind !== 'system' && x.group !== 'topic').map((x) => [x, x === cur ? 0 : worldOf(x).distanceTo(here)]).sort((a, c) => a[1] - c[1]).slice(0, 7);
  near.forEach(([x]) => {
    const btn = document.createElement('button'); btn.type = 'button';
    const t = thumbFor(x);
    if (x === cur) { t.classList.add('here'); btn.setAttribute('aria-current', 'true'); }
    const sm = document.createElement('small'); sm.textContent = x.name;
    btn.append(t, sm);
    btn.setAttribute('aria-label', x === cur ? `${x.name}, you are here` : `Fly to ${x.name}`);
    if (x !== cur) btn.addEventListener('click', () => go(x));
    list.append(btn);
  });
  // one step up: from a world to its group, from a group to the universe
  const up = !isEco(cur) && eco ? eco : null, back = document.createElement('button'); back.type = 'button'; back.className = 'up';
  const arrow = document.createElement('span'); arrow.className = 'thumbp upic'; arrow.textContent = '↑';
  const lab = document.createElement('small'); lab.textContent = up ? up.name : 'Universe';
  back.append(arrow, lab); back.setAttribute('aria-label', up ? `Back to ${up.name}` : 'Back to the universe');
  back.addEventListener('click', () => (up ? go(up) : setLens('cosmos')));
  list.prepend(back);
  if (G) G.fromTo('#fRailList button', { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, stagger: 0.06, ease: 'power3.out', delay: 0.4 });
}
let stations = [];
function renderStations(b) {
  const box = $('fStations'); box.innerHTML = '';
  const r = rng(hash(b.name) ^ 4242);
  stations = roomNames(b).slice(0, isEco(b) || b.kind === 'station' ? 0 : b.rooms ?? 0).map((name, i) => {
    const el = document.createElement('div'); el.className = 'station';
    el.innerHTML = '<i></i><i></i><b></b><span></span>';
    el.lastElementChild.textContent = `${name} · ${roomsFor(b)[i]?.[2] ?? 1}`;
    el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer'; el.title = `Open ${name}`; el.addEventListener('click', () => { openChat(); joinRoom(name); });
    box.append(el);
    return { el, dir: latLon(-35 + r() * 70, -180 + r() * 360) };
  });
}
function exitFocus() {
  if (state.view !== 'focus') return;
  state.view = '';
  document.body.dataset.view = '';
  navState();
  paintOrbits();
  const f = $('focus');
  focusLayer(state.focus, false);
  ringData = null; $('fRingLabel').hidden = true;
  const done = () => { f.hidden = true; f.style.opacity = ''; offK.v = 0; plateU.uAlpha.value = 0; camera.zoom = 1; camera.clearViewOffset(); };
  if (!G || reduced) { done(); return; }
  G.killTweensOf(offK); G.killTweensOf(f); G.killTweensOf(plateU.uAlpha);
  G.to(f, { opacity: 0, duration: 0.35, ease: 'power2.out' });
  G.to(plateU.uAlpha, { value: 0, duration: 0.45, ease: 'power2.out' });
  G.to(offK, { v: 0, duration: 0.8, ease: 'power2.inOut', onComplete: done });
}
addEventListener('resize', () => { if (state.view === 'focus') measureFocus(); });
const syncInert = () => {
  const d = document.body.dataset;
  $('chat').inert = !d.chat;
  $('leftdock').inert = d.drawer !== 'left';
  $('fRail').inert = d.chat === 'open';
};
// any change of the chat's mode may need the 3D back (it sleeps behind the full chat)
new MutationObserver(() => { syncInert(); wake(); }).observe(document.body, { attributes: true, attributeFilter: ['data-chat', 'data-drawer'] });
const BEHIND = ['hnav', 'hero', 'hRail', 'ticker', 'focus', 'labels'];
function chatMode(mode) {
  if (mode === 'full' && innerWidth <= 900) mode = 'open';
  document.body.dataset.chat = mode;
  wake();
  $('chatExpand').setAttribute('aria-pressed', String(mode === 'full'));
  $('chatExpand').setAttribute('aria-label', mode === 'full' ? 'Shrink the chat' : 'Open the chat full screen');
  $('hChat').setAttribute('aria-expanded', String(!!mode));
  BEHIND.forEach((id) => { $(id).inert = mode === 'full'; });
  chatList.scrollTop = chatList.scrollHeight;
  if (mode) { if (!matchMedia('(pointer: coarse)').matches) $('chatInput').focus(); } else $('hChat').focus();
  if (G && mode === 'full') G.fromTo('#chat > *', { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.03, ease: 'power3.out' });
}
const openChat = () => { if (!document.body.dataset.chat) chatMode('open'); };
$('chatClose').addEventListener('click', () => chatMode(''));
$('chatExpand').addEventListener('click', () => chatMode(document.body.dataset.chat === 'full' ? 'open' : 'full'));
$('fEnter').addEventListener('click', () => openChat(true));
$('fForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('fInput'), v = i.value.trim(); if (!v) return; i.value = ''; if (v.startsWith('/')) runCommand(v); else if (/^@(jarvis|guide)\b/i.test(v)) { say('you', v); setTimeout(() => answer(v), 400); } else { post(v); if (v.includes('?')) setTimeout(() => answer(v, true), 600); } });
document.querySelectorAll('[data-flens]').forEach((btn) => btn.addEventListener('click', () => setLens(btn.dataset.flens)));
$('fFollow').addEventListener('click', () => { $('followBtn').click(); const on = state.followed.has(state.focus?.name); $('fFollow').setAttribute('aria-pressed', String(on)); $('fFollow').textContent = on ? 'Following' : 'Follow'; });
function showBigTitle(b) {
  const f = facts(b);
  $('btKind').textContent = f.kind;
  const h = $('btName'); h.textContent = f.name + ' ';
  const sp = document.createElement('span'); sp.textContent = f.soft ?? ''; h.append(sp);
  $('bigTitle').hidden = false;
  if (G) G.fromTo('#bigTitle > *', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power3.out' });
}
function showCard(b) {
  const f = facts(b);
  leftView('card');
  document.body.dataset.focus = 'on';
  setRoom(b);
  $('cardKind').textContent = f.kind;
  $('cardName').textContent = f.name;
  $('cardSoft').textContent = f.soft ?? '';
  renderPeople(b);
  $('cardDesc').textContent = f.desc ?? '';
  $('cardDesc').hidden = !f.desc;
  renderNearby(b);
  [$('mA').textContent, $('mAL').textContent] = f.a;
  [$('mB').textContent, $('mBL').textContent] = f.c;
  const chips = $('cardChips'); chips.innerHTML = '';
  f.tags.forEach((t, i) => { const s = document.createElement('span'); s.className = i ? 'tag dim' : 'tag'; s.textContent = t; chips.append(s); });
  const vals = histogram($('cardHist'), hash(b.name));
  renderInsights(b, f, vals);
  const tiles = $('cardTiles'); tiles.innerHTML = '';
  f.tiles.forEach(([k, v]) => { const d = document.createElement('div'); const sm = document.createElement('small'); sm.textContent = k; const bb = document.createElement('b'); bb.textContent = v; d.append(sm, bb); tiles.append(d); });
  tiles.hidden = !f.tiles.length;
  $('cardSeed').textContent = f.seed;
  requestAnimationFrame(animateCard);
  const btn = $('followBtn');
  const on = state.followed.has(b.name);
  btn.textContent = b.kind === 'ad' ? (on ? 'Request sent · sample' : 'Rent a satellite') : on ? 'Following' : 'Follow';
  btn.setAttribute('aria-pressed', String(on));
  btn.hidden = !!b.earth || hidden(b);
}
function renderNearby(b) {
  const here = worldOf(b), el = $('cardNearby');
  el.innerHTML = '';
  const near = bodies.filter((x) => x !== b && !x.remote && x.kind !== 'ad').map((x) => [x, worldOf(x).distanceTo(here)]).sort((a, c) => a[1] - c[1]).slice(0, 3);
  near.forEach(([x, d]) => {
    const btn = document.createElement('button'); btn.type = 'button';
    const nm = document.createElement('span'); nm.textContent = nameOf(x);
    const t = document.createElement('small'); t.textContent = `${Math.min(5.6, (1300 + d * 4.5) / 1000).toFixed(1)} s`;
    btn.append(nm, t); btn.addEventListener('click', () => go(x)); el.append(btn);
  });
}
$('exploreBtn').addEventListener('click', () => { $('hExplore').click(); });
let toastTimer;
function toast(b) {
  $('toastName').textContent = `You discovered ${b.name}`;
  $('toastInfo').textContent = `${KIND[b.type]} · ${b.here} here · ${plural(b.rooms, 'room')}`;
  const t = $('toast'); t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}
const TOTAL = HUBS.length;
$('exploredTotal').textContent = `/ ${TOTAL}`;
function updateExplored() {
  const worlds = bodies.filter(stampable), n = worlds.filter((w) => log.stamps[w.name]).length, left = bodies.filter((b) => hidden(b)).length;
  $('passCount').textContent = `${n}/${worlds.length}`;
  $('exploredPct').textContent = String(n); $('exploredTotal').textContent = `/ ${worlds.length}`;
  $('exploredArc').setAttribute('stroke-dasharray', `${(n / worlds.length) * 100} 100`);
  $('signalsText').textContent = left ? `${plural(left, 'signal')} left to find` : 'all charted';
  $('exploredBar').setAttribute('aria-label', `${n} of ${worlds.length} worlds stamped`);
}

// ---------- the list view: the same world, as panels only ----------
function renderBoard() {
  const grid = $('boardGrid');
  grid.innerHTML = '';
  SECTIONS.forEach(([title, test]) => {
    const items = bodies.filter(test).sort((a, b) => (b.here ?? 0) - (a.here ?? 0));
    if (!items.length) return;
    const h = document.createElement('h3'); h.textContent = title + ' '; const hs = document.createElement('span'); hs.textContent = String(items.length); h.append(hs); grid.append(h);
    const wrap = document.createElement('div'); wrap.className = 'cards';
    items.forEach((b) => {
      const f = facts(b);
      const c = document.createElement('button'); c.type = 'button'; c.className = 'hubcard glass';
      const top = document.createElement('div'); top.className = 'row';
      const orb = hidden(b) ? Object.assign(document.createElement('span'), { className: 'thumbp unknown' }) : thumbFor(b);
      const nm = document.createElement('div'); nm.className = 'nm';
      const k = document.createElement('small'); k.textContent = f.kind;
      const n = document.createElement('b'); n.textContent = f.name;
      const dd = document.createElement('span'); dd.className = 'dd'; dd.textContent = f.desc ?? '';
      nm.append(k, n, dd); top.append(orb, nm);
      const m = document.createElement('div'); m.className = 'row stats';
      m.innerHTML = '<span class="big"></span><small></small><span class="big"></span><small></small>';
      m.children[0].textContent = f.a[0]; m.children[1].textContent = f.a[1]; m.children[2].textContent = f.c[0]; m.children[3].textContent = f.c[1];
      const hist = document.createElementNS(SVGNS, 'svg'); hist.setAttribute('viewBox', '0 0 100 40'); hist.setAttribute('preserveAspectRatio', 'none'); hist.setAttribute('aria-hidden', 'true'); hist.classList.add('mini');
      histogram(hist, hash(b.name), 32);
      c.append(top, m, hist);
      c.addEventListener('click', () => (innerWidth <= 900 ? go(b) : openDetail(b)));
      wrap.append(c);
    });
    grid.append(wrap);
  });
  animateBoard();
}
function openDetail(b) {
  const f = facts(b), d = $('boardDetail');
  d.innerHTML = '';
  const k = document.createElement('small'); k.textContent = f.kind;
  const h = document.createElement('h2'); h.textContent = f.name + ' '; const hs = document.createElement('span'); hs.className = 'soft'; hs.textContent = f.soft ?? ''; h.append(hs);
  const tags = document.createElement('div'); tags.className = 'chips';
  f.tags.forEach((t, i) => { const s = document.createElement('span'); s.className = i ? 'tag dim' : 'tag'; s.textContent = t; tags.append(s); });
  const rooms = document.createElement('ol'); rooms.className = 'rooms';
  roomsFor(b).forEach(([r, , n]) => { const li = document.createElement('li'); const nm = document.createElement('b'); nm.textContent = r; const c = document.createElement('small'); c.textContent = `${n} here`; li.append(nm, c); rooms.append(li); });
  const seed = document.createElement('div'); seed.className = 'seed'; seed.textContent = f.seed;
  const fly = document.createElement('button'); fly.type = 'button'; fly.className = 'primary'; fly.textContent = 'Show in space';
  fly.addEventListener('click', () => go(b));
  const desc = document.createElement('p'); desc.className = 'desc'; desc.textContent = f.desc ?? '';
  d.append(k, h, desc, tags, rooms, seed, fly);
  animateDetail();
}

// ---------- picking ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
let lastHover = 0;
canvas.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (now - lastHover < 90 || state.view === 'focus') return;
  lastHover = now;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = bodies.map((b) => (b.kind === 'ad' && !b.group3d.visible ? NOHIT : hidden(b) ? b.beacon : b.hit ?? b.mesh));
  const hits = ray.intersectObjects(targets, false), hit = hits.find((x) => !x.object.userData.soft) ?? hits[0];
  hover(hit ? bodies[targets.indexOf(hit.object)] : null);
  canvas.style.cursor = hit ? 'pointer' : '';
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = bodies.map((b) => (b.kind === 'ad' && !b.group3d.visible ? NOHIT : hidden(b) ? b.beacon : b.hit ?? b.mesh));
  const hits = ray.intersectObjects(targets, false), hit = hits.find((x) => !x.object.userData.soft) ?? hits[0];
  if (hit) go(bodies[targets.indexOf(hit.object)]);
});

// ---------- the chat sample and the Earth's bubbles ----------
const SAMPLE = [
  ['kaito', 'JP', 'found a tiny hub past GovDAO, go look'], ['aarav', 'IN', 'deployed my first realm, feedback welcome'],
  ['mia', 'AU', 'who is up for the GovDAO call tonight?'], ['lea', 'FR', 'the rings on Memba are a DAO, right?'],
  ['ines', 'PT', 'Night Owls showed up on the map, anyone been?'], ['sam', 'US', 'voting yes on proposal 15'],
  ['bruna', 'BR', 'bom dia from São Paulo'], ['jonas', 'DE', 'gnogolf has a new course'], ['ada', 'NG', 'Lagos builders, we have a room now'],
  ['minji', 'KR', 'Kyoto builders looks lovely from orbit'], ['noor', 'EG', 'two moons out from BUBBLE is #builders'], ['diego', 'MX', 'hola a todos'],
];
const COUNTRIES = { JP: ['Japan', 36, 138], IN: ['India', 22, 79], AU: ['Australia', -25, 134], FR: ['France', 46, 2], PT: ['Portugal', 39, -8], US: ['United States', 39, -98], BR: ['Brazil', -10, -52], DE: ['Germany', 51, 10], NG: ['Nigeria', 9, 8], KR: ['Korea', 36, 128], EG: ['Egypt', 26, 30], MX: ['Mexico', 23, -102] };
const GENERIC = [['bruna', 'BR', 'bom dia from São Paulo'], ['diego', 'MX', 'hola a todos'], ['aarav', 'IN', 'deployed my first realm, feedback welcome'], ['lea', 'FR', 'first time here, what should I look at?'], ['kaito', 'JP', 'docs link for this one?'], ['ada', 'NG', 'gm from Lagos']];
const PLACE_LINES = {
  BUBBLE: [['jonas', 'DE', 'pot at 72.9 GNOT, someone boop'], ['minji', 'KR', 'v6 chains are wild, 3 pops in a row'], ['sam', 'US', 'clock under a minute on the big one']],
  GovDAO: [['sam', 'US', 'proposal 15 in short:\n- raise the *storage deposit* cap\n- ~~freeze~~ keep the old realms\n- **vote ends tonight**'], ['mia', 'AU', 'who is up for the GovDAO call tonight?'], ['noor', 'EG', 'read the proposal before you vote please']],
  gnogolf: [['jonas', 'DE', 'new course is up, 214 bytes to beat'], ['kaito', 'JP', 'got it to 220, so close'], ['lea', 'FR', 'is a for loop cheaper than recursion here?']],
  'Memba DAO': [['lea', 'FR', 'the rings mean we are a DAO, right?'], ['noor', 'EG', 'escrow_v4 works, my quest paid out'], ['minji', 'KR', 'new quest in #builders']],
  Adena: [['ada', 'NG', 'signing works in 1.22.3'], ['diego', 'MX', 'how do I add onyx to Adena?']],
  'Dev help': [['aarav', 'IN', 'stuck on a cross-realm call, anyone?'], ['noor', 'EG', 'pass `cur realm`, **not** the address:\n```go\nfunc Transfer(cur realm, to address) {\n  caller := cur.Previous().Address()\n}\n```'], ['kaito', 'JP', 'Realm Review can look at it']],
  'Kyoto builders': [['minji', 'KR', 'Kyoto builders looks lovely from orbit'], ['kaito', 'JP', '今夜のミートアップ、誰か来る？']],
  'Lisbon Gnomes': [['lea', 'FR', 'see you at the Lisbon meetup'], ['ines', 'PT', 'pastéis after the meetup']],
  'Art Hall': [['lea', 'FR', 'new piece from the Saturn shots ./saturn.jpg'], ['ines', 'PT', 'the rings came out so well']],
  Stage: [['diego', 'MX', 'tonight: a live set from Mexico City'], ['ada', 'NG', 'the venus palette is wild ./venus.jpg']],
};
const linesFor = (place) => (!place || place.earth ? SAMPLE : [...(PLACE_LINES[place.name] ?? []), ...GENERIC]);
let sampleIndex = 0;
const chatList = $('chatList');
const bubbles = [];
const RULES = { max: 5, lifeMs: 6000, everyMs: 1500 };
const roomMedia = new Map();
function chatLine(cls, parts) {
  const li = document.createElement('li');
  if (cls) li.className = cls;
  li.append(...parts);
  if (cls === '' || cls === 'mine') withActions(li, parts);
  // a room's photos and videos stay in its gallery after their message scrolls out
  li.querySelectorAll('.embed').forEach((e) => { if (!roomMedia.has(curKey)) roomMedia.set(curKey, []); roomMedia.get(curKey).push(e); });
  chatList.append(li);
  while (chatList.children.length > 60) chatList.firstElementChild.remove();
  chatList.scrollTop = chatList.scrollHeight;
  if (state.view === 'focus') mirrorTalk();
  return li;
}
// ---------- message actions, as in Discord: react, reply, pin, more ----------
let msgSeq = 0;
const QUICK_REACT = ['👍', '❤️', '😂', '🔥', '🎉', '👀'];
function quoteOf({ who, text }) {
  const q = document.createElement('div'); q.className = 'quote';
  const b = document.createElement('b'); b.append(icon('reply', 12), ` ${who}`); q.append(b, ` ${text.length > 70 ? text.slice(0, 69) + '…' : text}`);
  return q;
}
function setReply(r) {
  roomState.reply = r;
  $('replyBar').hidden = !r;
  if (r) { $('replyWho').textContent = r.who; $('replyText').textContent = r.text.length > 60 ? r.text.slice(0, 59) + '…' : r.text; $('chatInput').focus(); }
}
function react(li, e) {
  let row = li.querySelector('.reacts');
  if (!row) { row = document.createElement('div'); row.className = 'reacts'; li.querySelector('.mact').before(row); }
  let chip = [...row.children].find((c) => c.dataset.e === e);
  if (!chip) { chip = document.createElement('button'); chip.type = 'button'; chip.dataset.e = e; chip.dataset.n = '0'; chip.addEventListener('click', () => react(li, e)); row.append(chip); }
  const on = chip.classList.toggle('on'), n = Number(chip.dataset.n) + (on ? 1 : -1);
  chip.dataset.n = String(n); chip.textContent = `${e} ${n}`; chip.setAttribute('aria-pressed', String(on));
  if (n <= 0) chip.remove();
  if (!row.children.length) row.remove();
}
function popover(id, anchor) {
  // opens right above the message toolbar, aligned on its right edge
  const el = $(id), r = anchor.getBoundingClientRect();
  document.querySelectorAll('.pop').forEach((p) => { if (p !== el) p.hidden = true; });
  el.hidden = false;
  el.style.left = `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, r.right - el.offsetWidth))}px`;
  el.style.top = `${Math.max(8, r.top - el.offsetHeight - 4)}px`;
  return el;
}
// a pop's own button toggles it, so it is not an outside click
document.addEventListener('pointerdown', (e) => { if (e.target.closest('.pop, .mact, [data-pop], #chatList .meta b')) return; document.querySelectorAll('.pop').forEach((p) => { p.hidden = true; }); $('roomSwitch').setAttribute('aria-expanded', 'false'); });
function withActions(li, parts) {
  const who = li.querySelector('.meta b')?.textContent ?? '', body = li.querySelector('.body');
  li.dataset.id = String(++msgSeq);
  const bar = document.createElement('div'); bar.className = 'mact'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Message actions');
  const btn = (label, ic, fn) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; if (typeof ic === 'string') b.textContent = ic; else b.append(ic); b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); }); bar.append(b); };
  const text = () => body?.textContent ?? '';
  ['👍', '❤️', '😂'].forEach((e) => btn(`React ${e}`, e, () => react(li, e)));
  bar.append(Object.assign(document.createElement('i'), { className: 'sep' }));
  btn('More reactions', icon('smile', 15), () => { const pop = popover('reactPop', bar); pop.onclick = (e) => { const x = e.target.closest('button'); if (x) { react(li, x.textContent); pop.hidden = true; } }; });
  btn('Reply', icon('reply', 15), () => setReply({ who, text: text() }));
  btn('Start a thread', icon('thread', 15), () => openThread(li));
  btn('Pin message', icon('pin', 15), () => { pinsFor(roomState.place).unshift([who, text()]); pinsOpen = false; renderPinList(); sys(`Pinned ${who}'s message in ${roomState.name}.`); });
  btn('More', icon('more', 15), (b) => {
    const pop = $('msgMenu'); pop.innerHTML = '';
    const item = (label, fn) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = label; x.addEventListener('click', () => { fn(x); }); pop.append(x); };
    const copy = (x, v) => { navigator.clipboard?.writeText(v).catch(() => {}); x.textContent = 'Copied'; setTimeout(() => { pop.hidden = true; }, 600); };
    if (li.classList.contains('mine')) {
      item('Edit message', () => { pop.hidden = true; roomState.edit = li; const i = $('chatInput'); i.value = text(); i.focus(); });
      item('Delete message', () => { pop.hidden = true; li.remove(); });
    }
    const isSaved = li.classList.contains('saved');
    item(isSaved ? 'Remove from saved' : 'Save for later', () => {
      pop.hidden = true;
      if (isSaved) { li.classList.remove('saved'); li.querySelector('.saved-mark')?.remove(); savedMsgs = savedMsgs.filter((x) => x.id !== li.dataset.sid); }
      else {
        li.dataset.sid ??= `${curKey}/${li.dataset.id}`; li.classList.add('saved');
        { const sm = Object.assign(document.createElement('span'), { className: 'saved-mark', title: 'Saved' }); sm.append(icon('bookmark', 12)); li.querySelector('.meta b')?.after(sm); }
        savedMsgs.unshift({ id: li.dataset.sid, key: curKey, who, text: text().slice(0, 140) });
      }
      keep.set('gw.saved', savedMsgs);
    });
    item('Copy text', (x) => copy(x, text()));
    item('Copy room link', (x) => copy(x, `${location.href.split('#')[0]}#${slug(roomState.place ?? earth)}/${roomState.name.slice(1)}`));
    item('Mark unread', () => { pop.hidden = true; chatList.querySelectorAll('.unread').forEach((u) => u.remove()); const u = document.createElement('li'); u.className = 'unread'; u.textContent = 'New'; li.before(u); });
    if (!li.classList.contains('mine')) item('Report message', () => { pop.hidden = true; li.classList.add('reported'); sys(`Reported ${who}'s message to the moderators of ${roomState.name}. Thank you. (sample)`); });
    popover('msgMenu', bar);
  });
  li.append(bar);
}
function addBubble(name, cc, text) {
  const host = state.focus;
  // your own message takes the place of an older one from the same spot
  if (name === me()) for (let i = bubbles.length - 1; i >= 0; i--) if (host?.earth ? bubbles[i].cc === cc : bubbles[i].name === name) { bubbles[i].el.remove(); bubbles.splice(i, 1); }
  if (state.view !== 'focus' || !host?.mesh || host.kind === 'ad' || isEco(host) || bubbles.some((x) => (host.earth ? x.cc === cc : x.name === name))) return;
  const r = rng(hash(name + host.name)), [lat, lon] = host.earth ? COUNTRIES[cc].slice(1) : [-38 + r() * 76, -180 + r() * 360];
  if (bubbles.length >= RULES.max) bubbles.shift().el.remove();
  const el = document.createElement('div');
  el.className = 'bubble glass';
  const i = document.createElement('i'); i.textContent = name[0].toUpperCase();
  const box = document.createElement('div');
  const small = document.createElement('small'); small.textContent = host.earth ? `${name} · ${COUNTRIES[cc][0]}` : `${name} · ${roomState.name}`;
  const en = inEnglish(text), p = document.createElement('p'); p.textContent = en.length > 80 ? en.slice(0, 79) + '…' : en;
  box.append(small, p); el.append(i, box);
  labelsEl.append(el);
  bubbles.push({ cc, name, host, lat, lon, el, born: performance.now() });
  if (name === me()) faceSpot(host, lat, lon);
  if (!host.earth) burst(host.mesh.localToWorld(latLon(lat, lon).multiplyScalar(1.01)), host.radius * 0.18, 0xffc98a, 1);
}
// turn the camera around the world so the spot faces you (your message, on the far side, would be missed)
function faceSpot(host, lat, lon) {
  const c = controls.target, off0 = camera.position.clone().sub(c), spot = host.mesh.localToWorld(latLon(lat, lon)).sub(worldOf(host));
  if (off0.clone().normalize().dot(spot.clone().normalize()) > 0.55) return;
  // aim a bit above the spot, as a person would look at it
  const goal = spot.normalize().lerp(off0.clone().normalize(), 0.15).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(off0.clone().normalize(), goal), qi = new THREE.Quaternion(), qk = new THREE.Quaternion();
  const k = { v: 0 }, apply = () => { qk.copy(qi).slerp(q, k.v); camera.position.copy(controls.target).add(off0.clone().applyQuaternion(qk)); };
  if (!G || reduced) { k.v = 1; apply(); return; }
  G.to(k, { v: 1, duration: 1.4, ease: 'power2.inOut', onUpdate: apply });
}
const AV_TEX = ['jupiter', 'saturn', 'neptune', 'uranus', 'mars', 'venus'];
const me = () => state.name ?? (state.account ? 'alexis' : 'guest');
function avatarFor(name) {
  const a = document.createElement('span'); a.className = 'av'; a.setAttribute('aria-hidden', 'true');
  const mine = name === me();
  if (mine && state.avatar?.url) { a.style.backgroundImage = `url(${state.avatar.url})`; a.style.backgroundSize = 'cover'; return a; }
  const k = mine && state.avatar?.tex ? state.avatar.tex : AV_TEX[hash(name) % AV_TEX.length];
  a.style.backgroundImage = `url(./${k}.jpg)`;
  if (!(mine && state.avatar?.tex)) a.style.filter = `hue-rotate(${hash(name + 'h') % 360}deg)`;
  return a;
}
const PEOPLE = () => [...new Set([...POOL.map(([n]) => n), 'jarvis'])];
function mdInline(text, into) {
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(https?:\/\/[^\s<]+)|(@[a-z0-9-]+)|(#[a-z0-9][a-z0-9-]*(?:\/[a-z0-9-]+)?)/gi;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) into.append(text.slice(last, m.index));
    const [tok] = m; let el;
    if (m[1]) { el = document.createElement('code'); el.textContent = tok.slice(1, -1); }
    else if (m[2]) { el = document.createElement('strong'); mdInline(tok.slice(2, -2), el); }
    else if (m[3]) { el = document.createElement('u'); mdInline(tok.slice(2, -2), el); }
    else if (m[4]) { el = document.createElement('s'); mdInline(tok.slice(2, -2), el); }
    else if (m[5] || m[6]) { el = document.createElement('em'); mdInline(tok.slice(1, -1), el); }
    else if (m[9]) {
      const low = tok.toLowerCase(), [ps, rs] = low.slice(1).split('/'), here = !rs && roomsFor(roomState.place).some(([n]) => n === low);
      const pl = !here && !(!rs && ROOMS.includes(low)) && bodies.find((x) => !hidden(x) && x.kind !== 'ad' && x.kind !== 'system' && slug(x) === ps);
      if (pl || here) { el = document.createElement('button'); el.type = 'button'; el.className = 'plink'; el.dataset.place = pl ? pl.name : ''; el.dataset.room = rs ? `#${rs}` : here ? low : ''; el.title = pl ? `Fly to ${pl.name}${rs ? `, ${el.dataset.room}` : ''}` : `Open ${low}`; el.textContent = tok; }
      else el = document.createTextNode(tok);
    }
    else if (m[7]) { el = document.createElement('a'); el.href = tok; el.target = '_blank'; el.rel = 'noopener noreferrer'; el.textContent = tok; }
    else { const who = tok.slice(1).toLowerCase(); if (who === me().toLowerCase() || PEOPLE().includes(who)) { el = document.createElement('span'); el.className = 'mention' + (who === me().toLowerCase() ? ' me' : ''); el.textContent = tok; } else el = document.createTextNode(tok); }
    into.append(el); last = m.index + tok.length;
  }
  if (last < text.length) into.append(text.slice(last));
}
function mdRender(text) {
  const frag = document.createDocumentFragment(), lines = text.split('\n');
  let list = null, para = null;
  const flush = () => { list = null; para = null; };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.startsWith('```')) {
      const code = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      const pre = document.createElement('pre'), c = document.createElement('code'); c.textContent = code.join('\n'); pre.append(c); frag.append(pre); flush(); continue;
    }
    const ul = ln.match(/^\s*[-*•] (.*)$/), ol = ln.match(/^\s*\d+[.)] (.*)$/), q = ln.match(/^> ?(.*)$/);
    if (ul || ol) {
      const tag = ul ? 'UL' : 'OL';
      if (!list || list.tagName !== tag) { list = document.createElement(tag); frag.append(list); para = null; }
      const li = document.createElement('li'); mdInline((ul ?? ol)[1], li); list.append(li); continue;
    }
    if (q) { const b = document.createElement('blockquote'); mdInline(q[1], b); frag.append(b); flush(); continue; }
    list = null;
    if (!para) { para = document.createElement('span'); frag.append(para); } else para.append(document.createElement('br'));
    mdInline(ln, para);
  }
  return frag;
}
const TRANSLATED = {
  'bom dia from São Paulo': ['Portuguese', 'good morning from São Paulo'],
  'hola a todos': ['Spanish', 'hello everyone'],
  '今夜のミートアップ、誰か来る？': ['Japanese', 'anyone coming to the meetup tonight?'],
  'pastéis after the meetup': ['Portuguese', 'pastries after the meetup'],
};
const inEnglish = (text) => TRANSLATED[text]?.[1] ?? text;
function msgParts(name, cc, text, media) {
  const meta = document.createElement('div'); meta.className = 'meta';
  const fl = document.createElement('span'); fl.className = 'fl'; fl.textContent = flag(cc); fl.title = COUNTRIES[cc]?.[0] ?? cc;
  const b = document.createElement('b'); b.textContent = name;
  const em = document.createElement('em'); const d = new Date(); em.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  meta.append(avatarFor(name), fl, b, em);
  const tr = TRANSLATED[text];
  const mediaRe = /(?:https?:\/\/|\.\/|blob:)\S+\.(png|jpe?g|gif|webp|mp4|webm)(?:\?\S*)?$|blob:\S+$/i;
  const words = text.split(/\s+/), mediaUrl = media?.url ?? words.find((w) => mediaRe.test(w));
  const shown = media?.url ? text : text.replace(mediaUrl ?? '\u0000', '').trim();
  const out = [meta];
  if (!tr) {
    const body = document.createElement('span'); body.className = 'body';
    body.append(mdRender(shown));
    if (shown) out.push(body);
    if (mediaUrl) {
      const video = /\.(mp4|webm)(\?|$)/i.test(mediaUrl) || media?.type?.startsWith('video');
      const el = document.createElement(video ? 'video' : 'img'); el.className = 'embed'; el.src = mediaUrl; el.dataset.cap = `${name} · ${em.textContent}`;
      if (video) { el.controls = true; el.muted = true; el.playsInline = true; el.autoplay = true; el.loop = true; } else { el.alt = `Image shared by ${name}`; el.loading = 'lazy'; }
      out.push(el);
    }
    return out;
  }
  const body = document.createElement('span'); body.className = 'body'; body.textContent = tr[1];
  const note = document.createElement('button'); note.type = 'button'; note.className = 'trnote'; note.textContent = `Translated from ${tr[0]} · show original`;
  note.addEventListener('click', () => { const orig = body.textContent === tr[1]; body.textContent = orig ? text : tr[1]; note.textContent = orig ? `Original in ${tr[0]} · show English` : `Translated from ${tr[0]} · show original`; });
  return [...out, body, note];
}
const CHAIN = { BUBBLE: ['booped pot 12', 'Boop too', 'play'], GovDAO: ['voted yes on proposal 15', 'Vote', 'proposal'], 'Memba DAO': ['voted on proposal 14', 'Vote', 'proposal'], gnogolf: ['submitted 209 bytes · new best', 'Try it', 'play'] };
function chainLine(b) {
  const [n] = POOL[(sampleIndex * 7) % POOL.length], [what, cta, kind] = CHAIN[b.name];
  const ic = document.createElement('span'); ic.className = 'chic'; ic.append(icon('link', 12));
  const t = document.createElement('span'); t.append(Object.assign(document.createElement('b'), { textContent: n }), ` ${what} · on chain, `, Object.assign(document.createElement('code'), { textContent: b.path?.replace('gno.land/', '') ?? '' }));
  const go2 = Object.assign(document.createElement('button'), { type: 'button', textContent: cta }); go2.addEventListener('click', () => placeCard(kind));
  chatLine('chain', [ic, t, go2]);
}
function nextMessage() {
  if (!roomState.dm && CHAIN[roomState.place?.name] && sampleIndex % 4 === 3) { sampleIndex++; chainLine(roomState.place); return; }
  const pool = linesFor(roomState.place), [name, cc, text] = pool[sampleIndex++ % pool.length];
  if (state.view !== 'focus' && state.lens !== 'list' && hotSet.size && !reduced) { const hs = [...hotSet], b = hs[Math.floor(Math.random() * hs.length)]; burst(worldOf(b), b.radius * 0.9, 0xffc98a, 1); }
  if (roomState.dm) return;
  chatLine('', msgParts(name, cc, text));
  addBubble(name, cc, text);
}
setInterval(nextMessage, RULES.everyMs * 2.2);
const EARTH_ROOMS = [['#general', 'text', 96], ['#help', 'text', 31], ['#random', 'text', 22], ['#show-and-tell', 'text', 14], ['Lounge', 'voice', 8], ['Builders call', 'voice', 3]];
function roomsFor(b) {
  if (!b || b.earth) return EARTH_ROOMS;
  if (b.kind === 'ad' || b.kind === 'system' || hidden(b)) return [];
  const n = b.rooms ?? 0, voice = n >= 2, w = Array.from({ length: n }, (_, i) => n - i).concat(voice ? [0.6] : []);
  const total = w.reduce((a, x) => a + x, 0);
  return [...w.map((x, i) => [i < n ? roomNames(b)[i] : 'Voice lounge', i < n ? 'text' : 'voice', Math.max(1, Math.round(((b.here ?? 10) * x) / total))]),
    ...SHARED.filter((r) => r[0] === b.name || r[1] === b.name).map(([x, y, room, c]) => [room, 'text', c, x === b.name ? y : x])];
}
const roomKey = (place, name) => (SHARED.some((r) => r[2] === name && (r[0] === place?.name || r[1] === place?.name)) ? `shared/${name}` : `${place?.name ?? 'Earth'}/${name}`);
const roomState = { place: null, name: '#general', welcomed: new Set(), dm: null };
const store = new Map();
let curKey = 'Earth/#general';
const keep = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const drafts = new Map(Object.entries(keep.get('gw.drafts', {})));
const saveDrafts = () => keep.set('gw.drafts', Object.fromEntries(drafts));
let savedMsgs = keep.get('gw.saved', []);
function swapTo(key, seed) {
  if (key === curKey) return;
  const v = $('chatInput').value.trim();
  if (v && !v.startsWith('/')) drafts.set(curKey, v); else drafts.delete(curKey);
  saveDrafts();
  $('chatInput').value = drafts.get(key) ?? ''; grow?.();
  store.set(curKey, [...chatList.children]);
  chatList.innerHTML = '';
  curKey = key;
  const saved = store.get(key);
  if (saved) chatList.append(...saved); else seed();
  chatList.scrollTop = chatList.scrollHeight;
  if (state.view === 'focus') mirrorTalk();
}
// ---------- threads: a sub-chat under one message ----------
let threadLi = null;
const TH_REPLIES = [['noor', 'EG', 'same question here, following'], ['kaito', 'JP', 'there is a doc for this, sending it'], ['lea', 'FR', 'thanks, that helped'], ['minji', 'KR', 'can we move this to a call?']];
function threadChip(li) {
  const t = li._thread; if (!t) return;
  let chip = li.querySelector('.tchip');
  if (!chip) { chip = document.createElement('button'); chip.type = 'button'; chip.className = 'tchip'; chip.addEventListener('click', () => openThread(li)); (li.querySelector('.mact') ? li.querySelector('.mact').before(chip) : li.append(chip)); }
  const n = t.replies.length;
  chip.replaceChildren(icon('thread', 13), n ? `${n} ${n > 1 ? 'replies' : 'reply'} · ${t.replies[n - 1][0]}${n > 1 ? ' and others' : ''} · open thread` : 'Thread · no replies yet');
}
function renderThread() {
  const li = threadLi, t = li._thread, list = $('threadList');
  list.innerHTML = '';
  const head = document.createElement('li'); head.className = 'tparent';
  head.append(...msgParts(t.who, t.cc, t.text));
  list.append(head);
  const sep = document.createElement('li'); sep.className = 'tsep'; sep.textContent = t.replies.length ? `${t.replies.length} ${t.replies.length > 1 ? 'replies' : 'reply'}` : 'Start the thread'; list.append(sep);
  t.replies.forEach(([n, cc, x]) => { const r = document.createElement('li'); if (n === me()) r.className = 'mine'; r.append(...msgParts(n, cc, x)); list.append(r); });
  $('threadTitle').textContent = t.text.length > 46 ? `${t.text.slice(0, 45)}…` : t.text;
  list.scrollTop = list.scrollHeight;
}
function openThread(li) {
  const who = li.querySelector('.meta b')?.textContent ?? '', text = li.querySelector('.body')?.textContent ?? '';
  li._thread ??= { who, cc: li.querySelector('.fl')?.title ? Object.keys(COUNTRIES).find((k) => COUNTRIES[k][0] === li.querySelector('.fl').title) ?? 'FR' : 'FR', text, replies: [] };
  threadLi = li;
  if (!document.body.dataset.chat) chatMode('open');
  document.body.dataset.thread = 'open';
  $('threadPane').hidden = false;
  renderThread(); threadChip(li);
  $('chatInput').placeholder = 'Reply in the thread';
  if (G) G.fromTo('#threadPane', { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'power3.out' });
  $('chatInput').focus();
}
function closeThread() {
  if (!threadLi) return;
  threadLi = null; delete document.body.dataset.thread;
  $('threadPane').hidden = true;
  $('chatInput').placeholder = `Message ${roomState.name}`;
}
$('threadBack').addEventListener('click', closeThread);
function threadReply(v) {
  const t = threadLi._thread;
  t.replies.push([me(), 'FR', v]); renderThread(); threadChip(threadLi);
  const li = threadLi;
  setTimeout(() => { if (!li._thread) return; const r = TH_REPLIES[li._thread.replies.length % TH_REPLIES.length]; li._thread.replies.push(r); threadChip(li); if (threadLi === li) renderThread(); }, 2200);
}
const SEED_MEDIA = {
  Earth: [['noor', 'EG', 'from the window this morning', './ph-earth.jpg'], ['lea', 'FR', 'Europe tonight, the lights are back on', './ph-night.jpg'], ['kaito', 'JP', 'long exposure from the dark site', './ph-milkyway.jpg']],
  'Art Hall': [['minji', 'KR', 'minted tonight, rendered on-chain', './art-1.jpg'], ['lea', 'FR', 'same seed, but rule 110', './art-2.jpg'], ['ines', 'PT', 'the rings, from the gallery deck', './ph-rings.jpg'], ['minji', 'KR', 'and the zoom, 5 seconds', './art-zoom.mp4']],
  BUBBLE: [['sam', 'US', 'the hub from orbit, pot was at 60', './ph-jupiter.jpg'], ['jonas', 'DE', 'how the hub looked last week', './bubble-clip.mp4']],
  Harbor: [['aarav', 'IN', 'docking at the near end, look at the farm ring', './ph-harbor.jpg'], ['kaito', 'JP', 'what you see from the mirrors at night', './ph-milkyway.jpg']],
  'AI Ring': [['noor', 'EG', 'the ring from the shuttle, solar wings out', './ph-ring.jpg']],
};
function seedRoom(place, room) {
  const sh = SHARED.find((r) => r[2] === room && (r[0] === place.name || r[1] === place.name));
  if (sh) sys(`${room} is shared by ${sh[0]} and ${sh[1]}: one conversation, open from both worlds.`);
  const pool = linesFor(place), start = hash(place.name + room) % pool.length;
  for (let i = 0; i < 3; i++) {
    const [n, cc, t] = pool[(start + i) % pool.length], li = chatLine('', msgParts(n, cc, t));
    if (i === 0) { li._thread = { who: n, cc, text: t, replies: TH_REPLIES.slice(0, 2 + (start % 2)) }; threadChip(li); }
  }
  if (room === roomsFor(place)[0][0]) (SEED_MEDIA[place.name] ?? []).forEach(([n, cc, t, url]) => chatLine('', msgParts(n, cc, t, { url, type: url.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' })));
  const k = roomKey(place, room); (inbox.get(k) ?? []).forEach(([n, cc, t, f]) => chatLine('', cometParts(n, cc, t, f))); inbox.delete(k);
  sampleIndex = start + 3;
  const count = roomsFor(place).find(([n]) => n === room)?.[2] ?? 0;
  if (count < 3) sys(`${room} is quiet right now: say hi.`);
}
const DMS_PEOPLE = [['noor', 'EG', 'want to pair on the realm review?'], ['minji', 'KR', 'thanks for the intro!'], ['lea', 'FR', 'see you at the Lisbon meetup'], ['kaito', 'JP', 'the hub past GovDAO is real, come']];
function renderDMs() {
  const list = $('dmList'); list.innerHTML = '';
  DMS_PEOPLE.forEach(([name, cc], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'dm';
    b.setAttribute('aria-current', String(roomState.dm?.name === name));
    const av = document.createElement('span'); av.className = 'av'; av.style.background = `hsl(${(hash(name) % 360)} 45% 55%)`;
    const nm = document.createElement('span'); nm.textContent = `${flag(cc)} ${name}`;
    b.append(av, nm);
    if (i < 2) { const on = document.createElement('span'); on.className = 'on'; on.setAttribute('aria-label', 'online'); b.append(on); }
    b.addEventListener('click', () => openDM(name, cc));
    list.append(b);
  });
}
function openDM(name, cc) {
  closeLib();
  roomState.dm = { name, cc };
  $('sealBtn').hidden = false; $('sealBtn').classList.toggle('done', !!sealed.get(name));
  $('roomPlace').textContent = 'Direct message';
  $('roomName').textContent = `@${name}`;
  $('roomInfo').textContent = 'sample';
  $('chatInput').placeholder = `Message @${name}`;
  $('voiceBar').hidden = true;
  swapTo(`dm/${name}`, () => { const m = DMS_PEOPLE.find(([n]) => n === name); chatLine('', msgParts(name, cc, m?.[2] ?? 'hey! saw you around, what are you building?')); });
  renderQuick();
  renderDMs();
  document.querySelectorAll('#roomChips .room').forEach((c) => c.setAttribute('aria-current', 'false'));
}
function renderPlaceRail() {
  const rail = $('placeRail'); rail.innerHTML = '';
  [earth, ...bodies.filter((x) => focusable(x) && !x.remote && x.kind !== 'ad' && x.kind !== 'system' && !x.earth).sort((a, c) => (c.here ?? 0) - (a.here ?? 0))].forEach((x) => {
    const b = document.createElement('button'); b.type = 'button'; b.title = x.name; b.setAttribute('aria-label', `${x.name} rooms`);
    b.setAttribute('aria-current', String(roomState.place === x && !roomState.dm));
    b.append(x.earth ? Object.assign(document.createElement('span'), { className: 'thumbp', style: 'background: radial-gradient(circle at 35% 35%, #9CC8FF, #2A5BB8 60%, #0B1B3A)' }) : thumbFor(x));
    b.addEventListener('click', () => { roomState.dm = null; setRoom(x); });
    rail.append(b);
  });
}
function placeOf(b) { return b && roomsFor(b).length ? b : earth; }
let nudgeT = 0;
const STARTERS = ['what are you building this week?', 'anyone tried the new release yet?', 'what brought you here?', 'one thing you would change here?'];
function setRoom(b) {
  const place = placeOf(b);
  const rooms = roomsFor(place);
  if (roomState.place !== place) { roomState.place = place; roomState.name = rooms[0][0]; }
  roomState.dm = null;
  closeLib();
  $('sealBtn').hidden = true;
  stopVoice();
  closeThread();
  setReply(null); roomState.edit = null;
  renderPinList();
  swapTo(roomKey(place, roomState.name), () => seedRoom(place, roomState.name));
  const chips = $('roomChips'); chips.innerHTML = '';
  rooms.forEach(([name, kind, n, mate]) => {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'room' + (kind === 'voice' ? ' voice' : '') + (mate ? ' shared' : '');
    c.setAttribute('aria-current', String(name === roomState.name));
    const t = document.createElement('span'); t.textContent = name;
    const k = document.createElement('span'); k.className = 'cnt'; k.textContent = String(n);
    c.append(t, k);
    if (mate) { c.title = `Shared with ${mate}`; c.prepend(icon('link', 12)); }
    if (drafts.has(roomKey(place, name))) c.classList.add('draft');
    c.addEventListener('click', () => joinRoom(name));
    chips.append(c);
  });
  const cur = rooms.find(([n]) => n === roomState.name) ?? rooms[0];
  $('roomPlace').textContent = place.earth ? 'Earth · general chat' : `${place.name} · ${facts(place).kind}`;
  $('roomName').textContent = cur[0];
  $('roomInfo').textContent = cur[1] === 'voice' ? `${cur[2]} in the call` : `${cur[2]} here`;
  $('chatInput').placeholder = `Message ${cur[0]} or ask @jarvis`;
  const vb = $('voiceBar');
  vb.hidden = cur[1] !== 'voice';
  if (cur[1] === 'voice') { $('voiceName').textContent = cur[0]; $('voiceInfo').textContent = `${cur[2]} people talking · sample`; }
  renderSide(place);
  renderPlaceRail();
  renderDMs();
  renderQuick();
  clearTimeout(nudgeT); nudgeT = setTimeout(() => { const i = $('chatInput'); if (!i.value && !roomState.dm && document.activeElement !== i) i.placeholder = STARTERS[hash(cur[0]) % STARTERS.length].replace(/^./, (c) => c.toUpperCase()); }, 20000);
}
function joinRoom(name, quiet) {
  roomState.name = name;
  if (roomState.place && !roomState.place.earth) try { history.replaceState(null, '', `#${slug(roomState.place)}/${name.slice(1)}`); } catch {}
  setRoom(roomState.place);
  if (!quiet) sys(`You are in ${name}.`);
}
function renderSide(place) {
  const f = facts(place);
  $('sideKind').textContent = f.kind;
  $('sidePlace').textContent = f.name;
  $('sideDesc').textContent = f.desc ?? '';
  const st = $('sideStats'); st.innerHTML = '';
  [[f.a[0], f.a[1]], [f.c[0], f.c[1]]].forEach(([v, k]) => { const d = document.createElement('div'); const b = document.createElement('span'); b.className = 'big'; b.textContent = v; const sm = document.createElement('small'); sm.textContent = k; d.append(b, sm); st.append(d); });
  renderLinks($('sideLinks'), place);
  renderDapp($('sideDapp'), place);
  const ppl = $('sidePeople'); ppl.innerHTML = '';
  const r = rng(hash(place.name) ^ 77);
  POOL.slice().sort(() => r() - 0.5).slice(0, 6).forEach(([name, cc]) => {
    const li = document.createElement('li');
    const av = document.createElement('span'); av.className = 'av'; av.style.background = `hsl(${Math.round(r() * 360)} 40% 55%)`;
    const nm = document.createElement('span'); nm.textContent = name;
    const fl = document.createElement('span'); fl.className = 'fl'; fl.textContent = flag(cc);
    const v = document.createElement('span'); v.className = 'v'; v.textContent = COUNTRIES[cc][0];
    li.append(av, nm, fl, v); ppl.append(li);
  });
}
let voiceTimer = 0;
function stopVoice() { clearInterval(voiceTimer); $('voiceBar').classList.remove('live'); $('voiceJoin').textContent = 'Join'; $('voicePeople').hidden = true; }
$('voiceJoin').addEventListener('click', () => {
  const vb = $('voiceBar'), on = !vb.classList.contains('live');
  if (!on) { stopVoice(); sys(`Left ${roomState.name}.`); return; }
  vb.classList.add('live');
  $('voiceJoin').textContent = 'Leave';
  const cur = roomsFor(roomState.place).find(([n]) => n === roomState.name), list = $('voicePeople');
  list.innerHTML = '';
  [[me(), 'FR'], ...POOL.slice(0, Math.max(2, Math.min(5, (cur?.[2] ?? 3) - 1)))].forEach(([name], i) => {
    const d = document.createElement('div'); d.className = 'vp';
    const a = avatarFor(name); const n = document.createElement('small'); n.textContent = i ? name : `${name} · you`;
    if (!i) d.classList.add('muted');
    d.append(a, n); list.append(d);
  });
  list.hidden = false;
  const people = [...list.children].slice(1);
  voiceTimer = setInterval(() => people.forEach((x) => x.classList.toggle('talk', Math.random() < 0.35)), 900);
  sys(on ? `Joined ${roomState.name}. The microphone is not available in this preview; voice arrives with the app.` : `Left ${roomState.name}.`);
});
const sys = (text) => chatLine('sys', [document.createTextNode(text)]);
const findPlace = (q) => {
  const n = q.trim().toLowerCase();
  return n && bodies.find((b) => !hidden(b) && (nameOf(b).toLowerCase().includes(n) || (b.text ?? '').toLowerCase().includes(n) || (b.tags ?? []).some((t) => t.includes(n))));
};
const COMMANDS = [
  ['/go', 'place', 'fly anywhere', (a) => { const b = findPlace(a); if (b) { sys(`Flying to ${nameOf(b)}.`); go(b); } else sys(`No place called "${a}". Try /find ${a}.`); }],
  ['/top', '', 'the universe seen from above', () => setLens(state.lens === 'map' ? 'cosmos' : 'map')],
  ['/earth', '', 'the general chat', () => setLens('earth')],
  ['/universe', '', 'back to the universe', () => setLens('cosmos')],
  ['/rooms', '', 'list the rooms here', () => sys(`Rooms here: ${roomsFor(roomState.place).map(([n, k]) => (k === 'voice' ? `${n} (voice)` : n)).join(', ')}. Use /join <room>.`)],
  ['/join', 'room', 'join a room here (or type #)', (a) => { const r = roomsFor(roomState.place).find(([n]) => n.toLowerCase().includes(a.toLowerCase().replace(/^#/, ''))); if (r) joinRoom(r[0]); else sys(`No room called ${a} here. /rooms lists them.`); }],
  ['/list', '', 'everything as panels, no 3D', () => setLens('list')],
  ['/find', 'word', 'search topics, hubs and tags', (a) => { $('search').value = a; renderList(); const hits = bodies.filter((b) => !hidden(b) && (nameOf(b).toLowerCase().includes(a.toLowerCase()) || (b.tags ?? []).some((t) => t.includes(a.toLowerCase())))); sys(hits.length ? `Found ${hits.map(nameOf).join(', ')}. /go to fly there.` : `Nothing for "${a}" yet. Ask Jarvis: /ask ${a}`); }],
  ['/ask', 'question', 'ask Jarvis', (a) => ask(`@jarvis ${a}`)],
  ['/who', '', 'who is here', () => sys(state.focus && !state.focus.earth && state.focus.kind !== 'ad' ? `${state.focus.here} here in ${state.focus.name}: kaito, noor, ines and others (sample).` : '671 online in 31 countries: kaito, aarav, mia, lea and others (sample).')],
  ['/follow', '', 'follow the hub you are on', () => { if (state.focus) $('followBtn').click(); else sys('Fly to a hub first.'); }],
  ['/poll', 'question | a | b', 'ask the room', (a) => { const [q, ...opts] = a.split('|').map((x) => x.trim()).filter(Boolean); if (!q || opts.length < 2) sys('Write /poll question | option | option'); else pollMsg(state.account ? 'alexis' : 'guest', q, opts); }],
  ['/quiz', '', 'Jarvis asks a question', () => { const [q, o, c] = QUIZ[quizIndex++ % QUIZ.length]; pollMsg('guide', q, o, c); }],
  ['/dm', 'name', 'a direct message', (a) => { const p = DMS_PEOPLE.find(([n]) => n === a.replace('@', '').trim()); if (p) { chatMode('full'); openDM(p[0], p[1]); } else sys(`Try /dm ${DMS_PEOPLE.map(([n]) => n).join(', /dm ')}.`); }],
  ['/thread', '', 'open a thread on the last message', () => { const li = [...chatList.children].filter((x) => x.querySelector('.mact')).pop(); if (li) openThread(li); }],
  ['/comet', 'world message', 'send a message to another world', (a) => sendComet(a)],
  ['/passport', '', 'your stamps, expedition and quests', () => openLog()],
  ['/logbook', '', 'same as /passport', () => openLog()],
  ['/evolve', 'idea', 'ask Jarvis for a change to gnoworld', (a) => openEvo(a)],
  ['/catchup', '', 'what you missed here', () => catchUp()],
  ['/events', '', 'what is on, and when', () => placeCard('events')],
  ['/calendar', '', 'everything coming up, across worlds', () => calendarCard(false)],
  ['/event', 'HH:MM title', 'add an event to this world (its moderators, in the app)', (a) => { const m = a.match(/^(\d{1,2}):(\d{2})\s+(.+)$/); const p = roomState.place; if (!m || !p || p.earth) { sys('Write /event 19:00 Your title, in the world it belongs to.'); return; } const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); EVENTS.push({ place: p.name, title: m[3], at: d.getTime(), where: roomState.name }); EVENTS.sort((x, y) => x.at - y.at); renderQuick(); sys(`Added: ${m[3]}, ${fmtDay(d.getTime())} at ${fmtTime(d.getTime())}, in ${p.name}.`); }],
  ['/digest', '', 'this week in gnoworld', () => digestCard()],
  ['/realm', '', 'the realm behind this world', () => placeCard('realm')],
  ['/play', '', 'play here', () => placeCard('play')],
  ['/proposal', '', 'the open proposal', () => placeCard('proposal')],
  ['/station', '', 'what this station shows', () => placeCard('station')],
  ['/stats', '', 'what this browser counted (go, post, realm, vote...)', () => { let t = {}; try { t = JSON.parse(localStorage.getItem('gw.track') ?? '{}'); } catch {} sys(Object.entries(t).map(([k, v]) => `${k} ${v}`).join(' · ') || 'Nothing counted yet.'); }],
  ['/help', '', 'list the commands', () => sys(COMMANDS.map(([c, a]) => (a ? `${c} <${a}>` : c)).join('  ·  '))],
];
function runCommand(text) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const c = COMMANDS.find(([name]) => name === cmd.toLowerCase());
  if (!c) { sys(`Unknown command ${cmd}. /help lists them.`); return; }
  c[3](rest.join(' '));
}
function post(text, media) {
  chatLine('mine', [...(roomState.reply ? [quoteOf(roomState.reply)] : []), ...msgParts(me(), 'FR', text, media)]);
  setReply(null);
  progress({ type: 'post', place: roomState.place?.name, room: roomState.name, text });
  const here = roomState.place;
  if (!roomState.dm && here?.born && !log.firstWords?.[here.name]) { (log.firstWords ??= {})[here.name] = me(); saveLog(); renderLabel(here); flash(`First words in ${here.name}`, 'Your name shows on its label for a day', ['Share', () => shareMoment(`I said the first words in ${here.name} on gnoworld`, here)]); }
  if (!roomState.dm && !keep.get('gw.posted', false)) {
    keep.set('gw.posted', true);
    chatList.lastElementChild?.querySelector('.meta b')?.after(Object.assign(document.createElement('span'), { className: 'newbie', textContent: 'new here' }));
    const [n, cc] = POOL[(hash(roomState.name) + 3) % POOL.length];
    setTimeout(() => { if (!roomState.dm) chatLine('', msgParts(n, cc, `welcome @${me()}! first time here? ask anything, people are nice`)); }, reduced ? 0 : 2600);
  }
  if (roomState.dm) { const { name, cc } = roomState.dm; setTimeout(() => { if (roomState.dm?.name === name) chatLine('', msgParts(name, cc, 'nice! (sample reply)')); }, 1800); return; }
  addBubble(me(), 'FR', text);
  routeQuestion(text);
}
const hintEl = $('cmdHint');
$('attachBtn').addEventListener('click', () => $('attachFile').click());
// Enter sends (after the hint list had its say), Shift+Enter is a new line
setTimeout(() => $('chatInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.defaultPrevented) return;
  e.preventDefault(); $('chatForm').requestSubmit();
}));
// formatting: wrap the selection, or prefix the lines
$('fmtBar').addEventListener('mousedown', (e) => e.preventDefault());
$('fmtBar').addEventListener('click', (e) => {
  const b = e.target.closest('button'), f = b?.dataset.f; if (!f) return;
  const i = $('chatInput'); i.focus();
  // bold, italic, underline, strike apply to the text itself, as you see it
  const cmd = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' }[f];
  if (cmd) { document.execCommand(cmd); b.classList.toggle('on', document.queryCommandState(cmd)); return; }
  // code, blocks, lists and quotes stay written as Markdown
  const sel = getSelection().toString() || { code: 'code', block: 'code', ul: 'item', ol: 'item', quote: 'quote' }[f];
  const lineStart = !i.textBefore() || i.textBefore().endsWith('\n') ? '' : '\n';
  const out = f === 'code' ? `\`${sel}\`` : f === 'block' ? `${lineStart}\`\`\`\n${sel}\n\`\`\`` : lineStart + sel.split('\n').map((l, k) => (f === 'ul' ? '- ' : f === 'ol' ? `${k + 1}. ` : '> ') + l).join('\n');
  document.execCommand('insertText', false, out);
});
// mentions: the @ button, or typing @, lists the people here
$('mentionBtn').addEventListener('click', () => {
  const i = $('chatInput'); i.focus();
  const pre = i.textBefore();
  document.execCommand('insertText', false, (pre && !/\s$/.test(pre) ? ' ' : '') + '@');
});
$('replyCancel').addEventListener('click', () => setReply(null));
// ---------- seal a direct conversation: both sign its fingerprint, only the fingerprint goes on chain (phase 2) ----------
const sealed = new Map();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
$('sealBtn').addEventListener('click', async () => {
  const dm = roomState.dm; if (!dm) return;
  const lines = [...chatList.children].filter((x) => x.querySelector('.body')).map((x) => `${x.querySelector('.meta b')?.textContent}: ${x.querySelector('.body').textContent}`);
  let fp = '';
  try { fp = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`gnoworld/seal/v1\n${lines.join('\n')}`))); } catch { fp = hash(lines.join('\n')).toString(16).padStart(8, '0').repeat(8); }
  const box = $('sealBox');
  $('sealWho').textContent = `@${dm.name}`; $('sealCount').textContent = lines.length === 1 ? 'this message' : `these ${lines.length} messages`;
  $('sealCancel').hidden = false;
  $('sealFp').textContent = `${fp.slice(0, 16)}…${fp.slice(-8)}`;
  box.querySelectorAll('#sealSteps li').forEach((li) => { li.className = ''; });
  $('sealGo').disabled = false; $('sealGo').textContent = 'Sign and seal'; $('sealDone').hidden = true;
  $('sealCancel').onclick = () => box.close();
  $('sealGo').onclick = () => {
    const steps = box.querySelectorAll('#sealSteps li');
    $('sealGo').disabled = true; $('sealGo').textContent = 'Waiting for signatures…';
    steps[0].className = 'go';
    setTimeout(() => { steps[0].className = 'ok'; steps[1].className = 'go'; }, 900);
    setTimeout(() => { steps[1].className = 'ok'; steps[2].className = 'go'; }, 2400);
    setTimeout(() => {
      steps[2].className = 'ok';
      const block = $('blockHeight').textContent;
      $('sealDone').hidden = false; $('sealDone').textContent = `Sealed at block ${block}. Anyone you show ${lines.length === 1 ? 'this message' : `these ${lines.length} messages`} to can check it was not changed.`;
      $('sealCancel').hidden = true;
      $('sealGo').textContent = 'Close'; $('sealGo').disabled = false; $('sealGo').onclick = () => box.close();
      sealed.set(dm.name, fp); $('sealBtn').classList.add('done');
      const card = document.createElement('div'); card.className = 'sealcard';
      const t = document.createElement('b'); t.textContent = `Sealed by you and ${dm.name}`;
      const d = document.createElement('span'); d.textContent = `${lines.length} ${lines.length === 1 ? 'message' : 'messages'} · fingerprint ${fp.slice(0, 10)}…${fp.slice(-6)} · block ${block} · sample`;
      card.append(t, d); chatLine('sys', [card]);
    }, 3600);
  };
  box.showModal();
});
function openKey(key) {
  const [placeName, room] = [key.slice(0, key.lastIndexOf('/')), key.slice(key.lastIndexOf('/') + 1)];
  if (placeName === 'dm') { chatMode('full'); openDM(room, DMS_PEOPLE.find(([n]) => n === room)?.[1] ?? 'FR'); return; }
  const sh = placeName === 'shared' && SHARED.find((r) => r[2] === room);
  const p = sh ? (sh.includes(roomState.place?.name) ? roomState.place : bodies.find((b) => b.name === sh[0])) : placeName === 'Earth' ? earth : bodies.find((b) => b.name === placeName);
  if (!p) return;
  if (roomState.place === p) { joinRoom(room, true); return; }
  go(p); setTimeout(() => joinRoom(room, true), 3800);
}
// ---------- the library: photos and videos, saved and drafts, as a full view over the chat ----------
let libKind = null, libFilter = 'all';
function openLib(kind) {
  if (libKind === kind) { closeLib(); return; }
  closeThread();
  libKind = kind; document.body.dataset.lib = kind; libFilter = 'all';
  $('libPane').hidden = false;
  $('galleryBtn').setAttribute('aria-current', String(kind === 'media')); $('laterBtn').setAttribute('aria-current', String(kind === 'saved'));
  renderLib();
  if (G) G.fromTo('#libPane', { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' });
  $('libBack').focus();
}
function closeLib() {
  if (!libKind) return;
  libKind = null; delete document.body.dataset.lib;
  $('libPane').hidden = true;
  ['galleryBtn', 'laterBtn'].forEach((id) => $(id).setAttribute('aria-current', 'false'));
}
function renderLib() {
  const body = $('libBody'); body.replaceChildren();
  $('libKicker').textContent = $('roomName').textContent;
  $('libTabs').hidden = libKind !== 'media';
  $('libTabs').querySelectorAll('button').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.f === libFilter)));
  const note = (text) => body.append(Object.assign(document.createElement('p'), { className: 'lnote', textContent: text }));
  if (libKind === 'media') {
    const all = [...(roomMedia.get(curKey) ?? [])].reverse();
    const items = all.filter((el) => libFilter === 'all' || (libFilter === 'video') === (el.tagName === 'VIDEO'));
    $('libTitle').textContent = `Photos and videos · ${all.length}`;
    if (!items.length) { note(all.length ? 'Nothing of that kind here.' : 'Nothing shared here yet. Add a photo or a video with + in the message box.'); return; }
    const grid = document.createElement('div'); grid.className = 'lgrid';
    items.forEach((el, i) => {
      const b = document.createElement('button'); b.type = 'button';
      const video = el.tagName === 'VIDEO', t = document.createElement(video ? 'video' : 'img');
      b.setAttribute('aria-label', `${video ? 'Video' : 'Photo'} from ${el.dataset.cap}`);
      if (video) {
        const badge = Object.assign(document.createElement('span'), { className: 'play' }); badge.append(icon('play', 9));
        Object.assign(t, { muted: true, playsInline: true, preload: 'metadata', src: `${el.src}#t=0.1` });
        t.onloadedmetadata = () => { badge.append(` ${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, '0')}`); };
        b.append(t, badge);
      } else { t.src = el.src; t.alt = ''; b.append(t); }
      b.append(Object.assign(document.createElement('small'), { textContent: el.dataset.cap ?? '' }));
      b.onclick = () => openMedia(items, i);
      grid.append(b);
    });
    body.append(grid);
    return;
  }
  $('libTitle').textContent = 'Saved and drafts';
  const cur = $('chatInput').value.trim(); if (cur) { drafts.set(curKey, cur); saveDrafts(); }
  const where = (k) => (k.startsWith('dm/') ? `@${k.slice(3)} · direct` : k.replace('/', ' · '));
  const section = (title, items, empty, fill) => {
    body.append(Object.assign(document.createElement('small'), { className: 'h', textContent: `${title} · ${items.length}` }));
    if (!items.length) note(empty);
    items.forEach((x) => { const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'it'; fill(bt, x); bt.addEventListener('click', () => { closeLib(); openKey(x.key); }); body.append(bt); });
  };
  section('Saved', savedMsgs, 'Nothing saved yet. Open ⋯ on a message, then Save for later.', (bt, x) => { bt.append(Object.assign(document.createElement('span'), { textContent: `${x.who} · ${where(x.key)}` }), x.text); });
  section('Drafts', [...drafts.entries()].map(([key, text]) => ({ key, text })), 'No unsent drafts.', (bt, x) => { const w = document.createElement('span'); w.append(icon('pencil', 11), ` ${where(x.key)}`); bt.append(w, x.text); });
}
$('galleryBtn').addEventListener('click', () => openLib('media'));
$('laterBtn').addEventListener('click', () => openLib('saved'));
$('libBack').addEventListener('click', () => { closeLib(); $('chatInput').focus(); });
$('libPane').addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('mediaBox').open) { e.stopPropagation(); closeLib(); $('chatInput').focus(); } });
$('libTabs').addEventListener('click', (e) => { const f = e.target.closest('button')?.dataset.f; if (f) { libFilter = f; renderLib(); } });
chatList.addEventListener('click', (e) => { const nm = e.target.closest('.meta b'); if (nm && !nm.closest('li.guide')) { e.stopPropagation(); personCard(nm.textContent, nm); } });
chatList.addEventListener('click', (e) => { const el = e.target.closest('img.embed'); if (!el) return; const all = [...chatList.querySelectorAll('.embed')].reverse(); openMedia(all, all.indexOf(el)); });
$('attachFile').addEventListener('change', (e) => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f || !/^(image|video)\//.test(f.type)) return;
  const i = $('chatInput'), t = i.value.trim(); i.value = '';
  post(t, { url: URL.createObjectURL(f), type: f.type });
});
// emoji: a small set that fits a community chat; inserted where the caret is
const EMOJI = ['👋', '🙂', '😂', '😍', '🤔', '😮', '🙏', '👍', '👎', '🔥', '🚀', '🎉', '💯', '👀', '❤️', '✅', '⚡', '🌍', '🪐', '🌙', '⭐', '🫧', '🧠', '🛠️'];
{
  const pop = $('emojiPop');
  EMOJI.forEach((e) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e; b.setAttribute('aria-label', `Insert ${e}`); pop.append(b); });
  pop.addEventListener('mousedown', (e) => e.preventDefault());
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $('chatInput').focus(); document.execCommand('insertText', false, b.textContent);
    toggle(false);
  });
  const toggle = (open) => { pop.hidden = !open; $('emojiBtn').setAttribute('aria-expanded', String(open)); };
  $('emojiBtn').addEventListener('click', () => toggle(pop.hidden));
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !e.target.closest('#emojiPop, #emojiBtn')) toggle(false); });
  $('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { e.stopPropagation(); toggle(false); } });
  // help: every command, grouped, clickable
  $('helpBtn').addEventListener('click', () => {
    const i = $('chatInput'); i.value = '/'; i.focus(); i.dispatchEvent(new Event('input'));
    if (G) G.fromTo('#cmdHint button', { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.02 });
  });
}
let hintItems = [], hintSel = 0;
function showHints(items) {
  hintEl.innerHTML = ''; hintItems = items.slice(0, 20); hintSel = 0;
  hintItems.forEach(([label, what, apply], i) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.setAttribute('role', 'option'); btn.setAttribute('aria-selected', String(i === 0));
    btn.textContent = label;
    const sp = document.createElement('span'); sp.textContent = what; btn.append(sp);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', apply);
    hintEl.append(btn);
  });
  if (hintItems.length) { const k = document.createElement('small'); k.className = 'keys'; k.textContent = '↑↓ choose · ↵ or Tab go · Alt+↑↓ rooms'; hintEl.append(k); }
  hintEl.hidden = !hintItems.length;
}
const done = (fn) => () => { const i = $('chatInput'); i.value = ''; hintEl.hidden = true; fn(); i.focus(); };
const roomHints = (q) => roomsFor(roomState.place).filter(([n]) => n.toLowerCase().includes(q.toLowerCase())).map(([n, k, c]) => [n, k === 'voice' ? `voice · ${c} in` : `${c} here`, done(() => joinRoom(n, true))]);
const placeHints = (q) => bodies.filter((b) => !hidden(b) && b.kind !== 'ad' && nameOf(b).toLowerCase().includes(q.toLowerCase())).sort((a, c) => (c.here ?? 0) - (a.here ?? 0)).map((b) => [nameOf(b), `${facts(b).kind} · ${b.here ?? 0} here`, done(() => { sys(`Flying to ${nameOf(b)}.`); go(b); })]);
$('chatInput').addEventListener('input', (e) => {
  const v = e.target.value, go_ = v.match(/^\/go\s+(.*)$/i), join = v.match(/^\/join\s+(.*)$/i);
  if (v.startsWith('#')) showHints(roomHints(v.slice(1)));
  else if (go_) showHints(placeHints(go_[1]));
  else if (join) showHints(roomHints(join[1].replace(/^#/, '')));
  else if (e.target.textBefore().match(/(?:^|\s)@([a-z0-9-]*)$/i)) {
    const i = e.target, q = i.textBefore().match(/@([a-z0-9-]*)$/i)[1].toLowerCase();
    const here = POOL.filter(([n]) => n.startsWith(q)).map(([n, cc]) => [`@${n}`, COUNTRIES[cc]?.[0] ?? '', n]);
    if ('jarvis'.startsWith(q)) here.push(['@jarvis', 'AI concierge', 'jarvis']);
    showHints(here.map(([label, what, n]) => [label, what, () => { i.focus(); for (let k = 0; k <= q.length; k++) document.execCommand('delete'); document.execCommand('insertText', false, `@${n} `); hintEl.hidden = true; }]));
  }
  else if (v.startsWith('/') && !v.includes(' ')) showHints(COMMANDS.filter(([c]) => c.startsWith(v.toLowerCase())).map(([c, arg, what]) => [arg ? `${c} <${arg}>` : c, what, () => { const i = $('chatInput'); if (arg) { i.value = `${c} `; i.focus(); i.dispatchEvent(new Event('input')); } else { i.value = c; $('chatForm').requestSubmit(); } }]));
  else showHints([]);
});
const grow = () => {}; // the rich box grows by itself, up to its max height
$('chatInput').addEventListener('keydown', (e) => {
  if (hintEl.hidden || !hintItems.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    hintSel = (hintSel + (e.key === 'ArrowDown' ? 1 : -1) + hintItems.length) % hintItems.length;
    hintEl.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === hintSel)));
  } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.altKey) { e.preventDefault(); hintItems[hintSel][2](); }
});
addEventListener('keydown', (e) => {
  if (!e.altKey || e.metaKey || e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  const rooms = roomsFor(roomState.place);
  if (!rooms.length || !document.body.dataset.chat) return;
  e.preventDefault();
  const i = rooms.findIndex(([n]) => n === roomState.name);
  joinRoom(rooms[(i + (e.key === 'ArrowDown' ? 1 : -1) + rooms.length) % rooms.length][0], true);
});
$('quick').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const c = btn.dataset.cmd, i = $('chatInput');
  if (c.endsWith(' ') || c.startsWith('@')) { i.value = c; i.focus(); i.dispatchEvent(new Event('input')); } else runCommand(c);
});
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const i = $('chatInput'), v = i.value.trim();
  if (!v) return;
  i.value = ''; hintEl.hidden = true; i.style.height = ''; drafts.delete(curKey); saveDrafts();
  if (threadLi && !v.startsWith('/')) { threadReply(v); return; }
  if (roomState.edit) { const b = roomState.edit.querySelector('.body'); if (b) { b.replaceChildren(mdRender(v)); if (!roomState.edit.querySelector('.edited')) b.after(Object.assign(document.createElement('small'), { className: 'edited', textContent: ' (edited)' })); } roomState.edit = null; return; }
  if (v.startsWith('/')) runCommand(v);
  else if (/^@(jarvis|guide)\b/i.test(v)) ask(v);
  else post(v);
});
const HOT = [['US', 12], ['JP', 15], ['IN', -3], ['BR', 4], ['FR', 7]].map(([cc, delta]) => {
  const el = document.createElement('div');
  el.className = 'hot' + (delta < 0 ? ' down' : '');
  el.hidden = true;
  el.innerHTML = '<i></i><i></i><b></b><span></span>';
  el.lastElementChild.textContent = `${delta > 0 ? '+' : ''}${delta}% · 1 h`;
  labelsEl.append(el);
  return { cc, el };
});
const latLon = (lat, lon) => { const a = THREE.MathUtils.degToRad(lat), o = THREE.MathUtils.degToRad(lon); return new THREE.Vector3(Math.cos(a) * Math.cos(o), Math.sin(a), -Math.cos(a) * Math.sin(o)); };

// embassies are built once the worlds exist
function buildEmbassies() {
  SHARED.forEach(([a, c, room]) => {
    const A = bodies.find((x) => x.name === a), C = bodies.find((x) => x.name === c); if (!A || !C) return;
    const g = new THREE.Group(); g.add(new THREE.Mesh(embassyGeo, plateMat(1, 1)));
    [-1, 1].forEach((sz) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.6), embassyWing); w.position.set(0, 0, sz * 1.9); w.rotation.x = Math.PI / 2; g.add(w); });
    g.scale.setScalar(1.6); scene.add(g);
    const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'embtag'; tag.hidden = true; tag.textContent = `${room} · ${a} and ${c}`; tag.title = `Open ${room}, shared by ${a} and ${c}`;
    tag.addEventListener('click', () => goPlace(a, room)); tag.addEventListener('mouseenter', () => { tag.dataset.keep = '1'; }); tag.addEventListener('mouseleave', () => { delete tag.dataset.keep; });
    labelsEl.append(tag);
    embassies.push({ g, A, C, tag });
  });
}
function embassyFrame(w, h) {
  const ui = state.view !== 'focus' && state.lens !== 'list';
  embassies.forEach(({ g, A, C, tag }) => {
    g.visible = ui; if (!ui) { tag.hidden = true; return; }
    worldOf(A, fv0); worldOf(C, fv1); g.position.copy(fv0).add(fv1).multiplyScalar(0.5).addScaledVector(up, 6); g.rotation.y += 0.003;
    const show = hoverBody === A || hoverBody === C || routeFrom === A || routeFrom === C ? routeFade > 0.3 : false;
    if (!show && !tag.dataset.keep) { tag.hidden = true; return; }
    const p = fv0.copy(g.position).project(camera); if (p.z > 1) { tag.hidden = true; return; }
    tag.hidden = false; tag.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h + 14}px) translate(-50%, 0)`;
  });
}

// ---------- what we would measure: counts kept in this browser only, no text, no names ----------
function track(type) { try { const t = JSON.parse(localStorage.getItem('gw.track') ?? '{}'); t[type] = (t[type] ?? 0) + 1; localStorage.setItem('gw.track', JSON.stringify(t)); } catch {} }

// ---------- links, logbook, live moments: what makes worlds lead to each other ----------
const fv0 = new THREE.Vector3(), fv1 = new THREE.Vector3();
// hover a world in the universe: its links to other realms light up, with traffic on them
const routeLines = Array.from({ length: 6 }, () => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe6c2, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  l.frustumCulled = false; l.visible = false; scene.add(l); return l;
});
const routeDots = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3)), new THREE.PointsMaterial({ map: glowTexture, color: 0xfff1dc, size: 3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
routeDots.frustumCulled = false; routeDots.visible = false; scene.add(routeDots);
const routeCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
let routeFade = 0, routeFrom = null;
function featureFrame(dt) {
  const a = state.view !== 'focus' && state.lens !== 'list' && !state.flight && hoverBody && !hidden(hoverBody) ? hoverBody : null;
  if (a) routeFrom = a;
  routeFade = Math.max(0, Math.min(1, routeFade + (a ? dt * 5 : -dt * 3)));
  const links = routeFrom && routeFade > 0 ? linksOf(routeFrom).slice(0, 6) : [], dots = routeDots.geometry.attributes.position;
  routeLines.forEach((l, i) => {
    const x = links[i]; l.visible = !!x; if (!x) return;
    worldOf(routeFrom, routeCurve.v0); worldOf(x.other, routeCurve.v2);
    routeCurve.v1.copy(routeCurve.v0).add(routeCurve.v2).multiplyScalar(0.5).addScaledVector(up, routeCurve.v0.distanceTo(routeCurve.v2) * 0.22);
    const pos = l.geometry.attributes.position;
    for (let j = 0; j < 40; j++) { routeCurve.getPoint(j / 39, fv0); pos.setXYZ(j, fv0.x, fv0.y, fv0.z); }
    pos.needsUpdate = true;
    l.material.color.set(x.kind === 'shared' ? 0x9ffbe0 : 0xffe6c2);
    l.material.opacity = 0.5 * routeFade;
    for (let k = 0; k < 3; k++) { const u = (time.value * (x.kind === 'shared' ? 0.1 : 0.22) + k / 3) % 1; routeCurve.getPoint(x.out ? u : 1 - u, fv0); dots.setXYZ(i * 3 + k, fv0.x, fv0.y, fv0.z); }
  });
  for (let i = links.length * 3; i < 18; i++) dots.setXYZ(i, 0, -9999, 0);
  dots.needsUpdate = true; routeDots.visible = links.length > 0; routeDots.material.opacity = routeFade;
  // the AI Ring's screen faces you; the moon's screens light up only when you are close (battery)
  const near = state.lens !== 'list' && (state.view === 'focus' ? state.focus === bmoon : camera.position.distanceTo(worldOf(bmoon, fv1)) < 150);
  if (near !== bmoon.on) {
    bmoon.on = near;
    bmoon.screens.forEach(({ v }) => { if (near) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause(); });
  }
  // each screen keeps its poster until its video has a frame to show, so the belt never goes black
  bmoon.panels.forEach((p) => {
    const k = p.userData.k, live = near && bmoon.screens[k].v.readyState >= 2, map = live ? bmoon.screens[k].t : bmoon.posters[k];
    if (p.material.map !== map) { p.material.map = map; p.material.color.set(live ? 0xd9dce2 : 0x8e939c); p.material.needsUpdate = true; }
  });
  // meteors announce the event where it happens
  if (state.view !== 'focus' && state.lens !== 'list' && !reduced && loaded) {
    EVENT.next = (EVENT.next ?? 8) - dt;
    if (EVENT.next <= 0) { EVENT.next = 10 + Math.random() * 8; meteor(bodies.find((b) => b.name === EVENT.place)); }
  }
}
function meteor(to) {
  if (!to) return;
  const end = worldOf(to), from = end.clone().add(new THREE.Vector3((Math.random() - 0.5) * 160, 90 + Math.random() * 40, (Math.random() - 0.5) * 160));
  const heads = [3.4, 2.2, 1.4].map((sz) => { const sp = new THREE.Sprite(cometMat); sp.scale.setScalar(sz); scene.add(sp); return sp; });
  comets.push({ heads, curve: new THREE.QuadraticBezierCurve3(from, from.clone().lerp(end, 0.5).addScaledVector(up, 12), end), to, t: 0 });
}

// where someone hangs out: one answer for the person card, the map and routed questions
function worldsOf(name) { const r = rng(hash(name) ^ 77); return bodies.filter((b) => HUBS.some((h) => h.name === b.name) && b.group !== 'topic' && !b.signal).sort(() => r() - 0.5).slice(0, 3); }
function helpedOf(name) { return 3 + (hash(name) % 20) + (keep.get('gw.rep', {})[name] ?? 0); }
function friendsAt(b) { return DMS_PEOPLE.map(([n]) => n).filter((n) => worldsOf(n)[0] === b); }
// the telescope: hover a world's name to hear its room from afar
let peekT = 0;
let peekRot = null;
function peekShow(b, el) {
  clearTimeout(peekT);
  if (peekRot === null) { peekRot = controls.autoRotate; controls.autoRotate = false; }
  peekT = setTimeout(() => {
    if (state.view === 'focus' || state.flight || hidden(b) || b.kind === 'ad' || b.kind === 'system' || isEco(b)) return;
    const p = $('peek'), lines = linesFor(b).slice(0, 2);
    p.replaceChildren();
    const k = document.createElement('small'); k.append(document.createElement('i'), `Live in ${roomsFor(b)[0]?.[0] ?? b.name} · ${b.here} here`); p.append(k);
    lines.forEach(([n, , t]) => { const x = document.createElement('p'); x.append(Object.assign(document.createElement('b'), { textContent: n }), ` ${inEnglish(t).replace(/[*_~`]+/g, '')}`); p.append(x); });
    const r = (el.querySelector('.pill') ?? el).getBoundingClientRect(), right = r.right + 284 < innerWidth;
    p.style.left = `${right ? r.right + 12 : Math.max(16, r.left - 272)}px`; p.style.top = `${Math.max(16, Math.min(innerHeight - 140, r.top - 4))}px`;
    p.classList.add('on');
  }, 160);
}
function peekHide() { clearTimeout(peekT); $('peek').classList.remove('on'); if (peekRot !== null) { controls.autoRotate = peekRot; peekRot = null; } }

// connected worlds, on the plate: realms it calls, rooms it shares, where its visitors come from
const visitorsOf = (b) => { const r = rng(hash(b.name) ^ 4242); return bodies.filter((x) => x !== b && HUBS.some((h) => h.name === x.name) && x.group !== 'topic' && !hidden(x)).sort(() => r() - 0.5).slice(0, 2).map((x) => ({ other: x, n: 2 + Math.floor(r() * 14) })); };
function renderConn(b) {
  const box = $('fConn'), list = box.querySelector('.connList'); list.replaceChildren();
  const rows = linksOf(b).map((x) => (x.kind === 'shared'
    ? [x.other, `${x.room}, shared with ${x.other.name}`, `one room, two worlds · ${x.n} here`, () => { openChat(); joinRoom(x.room); }]
    : [x.other, x.out ? `${x.kind === 'imports' ? 'Imports' : 'Calls'} ${x.other.name}` : `${x.other.name} ${x.kind} this realm`, x.kind === 'imports' ? 'on chain · a package it builds on' : `on chain · ${x.n} calls a day`, () => go(x.other)]));
  if (HUBS.some((h) => h.name === b.name) && !isEco(b)) visitorsOf(b).forEach((v) => rows.push([v.other, `${v.n} people from ${v.other.name}`, 'are here right now · say hi', () => {
    openChat(); const ppl = POOL.filter(([n]) => worldsOf(n).includes(v.other)).slice(0, 3).map(([n]) => n); const who = ppl.length ? ppl : POOL.slice(0, 2).map(([n]) => n);
    sys(`${who.join(', ')} came over from ${v.other.name}.`); const i = $('chatInput'); i.value = `@${who[0]} welcome from ${v.other.name}! `; i.focus();
  }]));
  box.hidden = !rows.length || isEco(b);
  rows.slice(0, 4).forEach(([o, t, sub, fn]) => {
    const row = document.createElement('div'); row.className = 'crow';
    const bt = document.createElement('button'); bt.type = 'button';
    const tx = document.createElement('span'); tx.append(t, Object.assign(document.createElement('small'), { textContent: sub }));
    bt.append(thumbFor(o), tx, Object.assign(document.createElement('span'), { className: 'go', textContent: '→' }));
    bt.addEventListener('click', fn);
    const cm = document.createElement('button'); cm.type = 'button'; cm.className = 'cmt'; cm.title = `Send a comet to ${o.name}`; cm.setAttribute('aria-label', `Send a comet to ${o.name}`); cm.append(icon('comet', 14));
    cm.addEventListener('click', () => { openChat(); const i = $('chatInput'); i.value = `/comet ${o.name} `; i.focus(); });
    row.append(bt, cm); list.append(row);
  });
}
const readsOf = (items) => { const d = document.createElement('div'); d.className = 'reads'; items.forEach(([t, sub]) => { const x = document.createElement('div'); x.append(Object.assign(document.createElement('b'), { textContent: t }), Object.assign(document.createElement('small'), { textContent: sub })); d.append(x); }); return d; };
const channelVideos = () => CHANNELS.map(([t, src, topic]) => { const v = Object.assign(document.createElement('video'), { src, muted: true, loop: true, playsInline: true }); v.dataset.cap = `${t} · ${topic} · curated`; return v; });
function siteShot() { const img = Object.assign(document.createElement('img'), { src: aiRing.siteTex.image.toDataURL('image/png'), alt: 'realmscope, a site built with AI aboard the AI Ring' }); img.dataset.cap = 'realmscope · built with AI by minji in one afternoon · sample'; return img; }
function renderStationPanel(b) {
  const box = $('fStation'); box.hidden = b.kind !== 'station'; if (box.hidden) return;
  const body = box.querySelector('.sbody'), title = box.querySelector('.kicker span'); body.replaceChildren();
  if (b === aiRing) {
    title.textContent = 'Built aboard this week';
    const img = siteShot(), card = document.createElement('button'); card.type = 'button'; card.className = 'siteCard'; card.setAttribute('aria-label', 'Open realmscope large');
    card.append(img.cloneNode()); card.addEventListener('click', () => openMedia([img], 0));
    body.append(card, readsOf([['Vote explainer', 'noor · turns a GovDAO proposal into plain words'], ['Test writer', 'jonas · writes filetests from a realm']]));
  } else if (b === bmoon) {
    title.textContent = 'On the screens';
    const grid = document.createElement('div'), vids = channelVideos(); grid.className = 'chGrid';
    CHANNELS.forEach(([t, src, topic], i) => {
      const bt = document.createElement('button'); bt.type = 'button';
      bt.append(Object.assign(document.createElement('video'), { muted: true, playsInline: true, preload: 'metadata', src: `${src}#t=1` }), Object.assign(document.createElement('span'), { textContent: t }), Object.assign(document.createElement('small'), { textContent: topic }));
      bt.addEventListener('click', () => openMedia(vids, i)); grid.append(bt);
    });
    body.append(grid);
  } else {
    title.textContent = 'Today on board';
    body.append(readsOf([['Why the Moon has a far side', 'long read · 14 min · sample'], ['Living in a spinning cylinder', 'long read · 9 min · sample'], ['The quietest places in the sky', 'long read · 11 min · sample']]));
  }
}

function shareMoment(text, b) {
  const url = `${location.href.split('#')[0]}${b ? `#${slug(b)}` : ''}`;
  track('share');
  if (navigator.share) { navigator.share({ title: 'gnoworld', text, url }).catch(() => {}); return; }
  navigator.clipboard?.writeText(`${text} ${url}`).then(() => flash('Copied', 'Paste it anywhere')).catch(() => {});
}
// the logbook: a stamp for each world, today's expedition, quests across worlds
const dayKey = new Date().toISOString().slice(0, 10);
const log = keep.get('gw.log', { stamps: {}, charted: {}, quests: {} });
if (log.day !== new Date().toISOString().slice(0, 10)) { log.day = new Date().toISOString().slice(0, 10); log.today = {}; }
const saveLog = () => keep.set('gw.log', log);
const stampable = (b) => (HUBS.some((h) => h.name === b.name) && b.group !== 'topic') || b.kind === 'station' || b.earth;
// the first stop is where something is happening today, the two others change every day; the same for everyone
const LIVE_STOPS = ['BUBBLE', 'GovDAO', 'gnogolf', 'Memba DAO'];
const expedition = (() => {
  const live = bodies.find((b) => b.name === LIVE_STOPS[hash(dayKey) % LIVE_STOPS.length]);
  return [live, ...bodies.filter((b) => b !== live && stampable(b) && !b.earth && !b.signal && b.kind !== 'station').sort((a, c) => hash(dayKey + a.name) - hash(dayKey + c.name)).slice(0, 2)];
})();
const streak = () => { const days = new Set(log.done ?? []); let n = 0; const d = new Date(); for (;;) { const k = d.toISOString().slice(0, 10); if (!days.has(k)) { if (n === 0 && k === dayKey) { d.setUTCDate(d.getUTCDate() - 1); continue; } break; } n++; d.setUTCDate(d.getUTCDate() - 1); } return n; };
// signals charted on an earlier visit stay charted
bodies.filter((b) => b.signal && log.charted[b.name]).forEach((b) => { b.discovered = true; b.mesh.visible = true; b.extras.forEach((e) => { e.visible = true; }); if (b.beacon) b.beacon.visible = false; renderLabel(b); });
const QUESTS = [
  { id: 'citizen', name: 'Citizen', reward: 'Citizen badge', steps: [['Visit GovDAO', (e) => e.type === 'visit' && e.b.name === 'GovDAO'], ['Say something in #governance', (e) => e.type === 'post' && e.room === '#governance'], ['Vote on the open proposal', (e) => e.type === 'vote']] },
  { id: 'arcade', name: 'Player one', reward: 'Arcade badge', steps: [['Visit BUBBLE', (e) => e.type === 'visit' && e.b.name === 'BUBBLE'], ['Visit gnogolf', (e) => e.type === 'visit' && e.b.name === 'gnogolf'], ['Talk in #arcade', (e) => e.type === 'post' && e.room === '#arcade']] },
  { id: 'eyes', name: 'Second pair of eyes', reward: 'Reviewer badge', steps: [['Visit Realm Review', (e) => e.type === 'visit' && e.b.name === 'Realm Review'], ['Open a realm and its functions', (e) => e.type === 'realm'], ['Ask Jarvis what a realm can do', (e) => e.type === 'code']] },
];
function progress(e) {
  let changed = false;
  QUESTS.forEach((q) => {
    q.steps.forEach(([, test], i) => { const k = `${q.id}.${i}`; if (!log.quests[k] && test(e)) { log.quests[k] = 1; changed = true; } });
    if (!log.quests[q.id] && q.steps.every((_, i) => log.quests[`${q.id}.${i}`])) { log.quests[q.id] = 1; changed = true; flash(`Quest done: ${q.name}`, `${q.reward} · on chain in phase 2`, ['Passport', openLog]); }
  });
  if (changed) saveLog();
  track(e.type);
}
let quietStamp = null;
function stamp(b) {
  if (!stampable(b)) return;
  progress({ type: 'visit', b });
  const first = !log.stamps[b.name], exp = expedition.includes(b) && !log.today[b.name];
  if (first) log.stamps[b.name] = dayKey;
  log.today[b.name] = 1; saveLog(); updateExplored();
  if (quietStamp === b) { quietStamp = null; return; } // charting it already said so
  if (!first && !exp) return;
  const done = expedition.filter((x) => log.today[x.name]).length, n = Object.keys(log.stamps).length;
  if (exp && done === 3) { (log.done ??= []).includes(dayKey) || log.done.push(dayKey); saveLog(); flash("Today's expedition: done", `${streak()}-day streak · same route for everyone today`, ['Share', () => shareMoment(`gnoworld expedition ${dayKey} · 3/3 · ${expedition.map((x) => x.name).join(' → ')} · ${streak()}-day streak`)]); return; }
  flash(first ? `Stamped · ${b.name}` : `${b.name} · on today's expedition`, exp ? (done < 3 ? `Today's expedition · ${done} of 3` : "Today's expedition: done") : `${n} ${n > 1 ? 'stamps' : 'stamp'} in your passport`, ['Passport', openLog]);
}
let flashT = 0, flashUntil = 0;
const flashQ = [];
function flash(title, sub, act) {
  // a second note waits for the first to be read
  if (performance.now() < flashUntil) { flashQ.push([title, sub, act]); return; }
  flashUntil = performance.now() + 2600;
  setTimeout(() => { const n = flashQ.shift(); if (n) { flashUntil = 0; flash(...n); } }, 2700);
  const f = $('flash'); f.replaceChildren();
  const t = document.createElement('div'); t.append(Object.assign(document.createElement('b'), { textContent: title }), Object.assign(document.createElement('small'), { textContent: sub }));
  f.append(t);
  if (act) { const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = act[0]; bt.addEventListener('click', () => { f.hidden = true; act[1](); }); f.append(bt); }
  f.hidden = false;
  if (G) G.fromTo(f, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' });
  clearTimeout(flashT); flashT = setTimeout(() => { if (G) G.to(f, { opacity: 0, duration: 0.3, onComplete: () => { f.hidden = true; } }); else f.hidden = true; }, 5200);
}
function openLog() {
  const body = $('logBody'); body.replaceChildren();
  const worlds = bodies.filter(stampable), n = worlds.filter((w) => log.stamps[w.name]).length;
  $('logCount').textContent = `${n} of ${worlds.length} worlds stamped`;
  $('passBtn').setAttribute('aria-expanded', 'true');
  const sec = (title) => { const x = document.createElement('section'); x.className = 'lbSec'; x.append(Object.assign(document.createElement('small'), { textContent: title })); body.append(x); return x; };
  const eg = document.createElement('div'); eg.className = 'exp';
  expedition.forEach((x) => {
    const bt = document.createElement('button'); bt.type = 'button'; if (log.today[x.name]) bt.className = 'done';
    const tx = document.createElement('span'); tx.append(nameOf(x), Object.assign(document.createElement('small'), { textContent: log.today[x.name] ? 'visited today' : facts(x).kind }));
    bt.append(thumbFor(x), tx); bt.addEventListener('click', () => { $('logBox').close(); go(x); }); eg.append(bt);
  });
  const st = streak(), es = sec(`Today's expedition · ${expedition.filter((x) => log.today[x.name]).length} of 3 · same for everyone, new each day${st ? ` · ${st}-day streak` : ''}`);
  es.append(eg);
  if (expedition.every((x) => log.today[x.name])) { const sh = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost lshare', textContent: 'Share today’s route' }); sh.addEventListener('click', () => shareMoment(`gnoworld expedition ${dayKey} · 3/3 · ${expedition.map((x) => x.name).join(' → ')}`)); es.append(sh); }
  const ql = document.createElement('div'); ql.className = 'quests';
  QUESTS.forEach((q) => {
    const d = document.createElement('div'); d.className = 'quest' + (log.quests[q.id] ? ' won' : '');
    const done = q.steps.filter((_, i) => log.quests[`${q.id}.${i}`]).length;
    d.append(Object.assign(document.createElement('b'), { textContent: q.name }), Object.assign(document.createElement('small'), { textContent: log.quests[q.id] ? `done · ${q.reward}` : `${done} of ${q.steps.length} · ${q.reward}` }));
    const ol = document.createElement('ol'); q.steps.forEach(([t], i) => { const li = document.createElement('li'); li.textContent = t; if (log.quests[`${q.id}.${i}`]) li.className = 'ok'; ol.append(li); }); d.append(ol); ql.append(d);
  });
  sec('Quests').append(ql);
  const sg = document.createElement('div'); sg.className = 'stamps';
  worlds.forEach((w) => {
    const d = document.createElement('button'); d.type = 'button'; d.className = `stamp ${log.stamps[w.name] ? 'yes' : 'no'}`; d.title = log.stamps[w.name] ? `Stamped ${log.stamps[w.name]}` : `Not yet: fly to ${w.name}`;
    d.append(hidden(w) ? Object.assign(document.createElement('span'), { className: 'thumbp unknown' }) : thumbFor(w), Object.assign(document.createElement('small'), { textContent: nameOf(w) }));
    if (log.charted[w.name]) d.append(Object.assign(document.createElement('em'), { textContent: 'first to chart' }));
    d.addEventListener('click', () => { $('logBox').close(); go(w); }); sg.append(d);
  });
  // constellations: every world of an ecosystem stamped
  const cg = document.createElement('div'); cg.className = 'consts';
  bodies.filter((t) => t.group === 'topic').forEach((t) => {
    const ms = ecoMembers(t).filter((m) => stampable(m)), k = ms.filter((m) => log.stamps[m.name]).length;
    const d = document.createElement('button'); d.type = 'button'; d.className = 'const' + (ms.length && k === ms.length ? ' won' : '');
    const dots = document.createElement('span'); dots.className = 'dots'; ms.forEach((m) => dots.append(Object.assign(document.createElement('i'), { className: log.stamps[m.name] ? 'on' : '' })));
    d.append(Object.assign(document.createElement('b'), { textContent: t.name }), dots, Object.assign(document.createElement('small'), { textContent: k === ms.length && ms.length ? 'constellation complete' : `${k} of ${ms.length} ${ms.length > 1 ? 'worlds' : 'world'}` }));
    d.addEventListener('click', () => { $('logBox').close(); go(t); }); cg.append(d);
  });
  sec('Constellations').append(cg);
  sec('Stamps').append(sg);
  body.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Kept in this browser for now. Stamps and badges go on chain in phase 2.' }));
  $('logBox').showModal();
}
$('logClose').addEventListener('click', () => $('logBox').close());
$('logBox').addEventListener('close', () => $('passBtn').setAttribute('aria-expanded', 'false'));
$('passBtn').addEventListener('click', openLog);
$('logBtn').addEventListener('click', openLog);

function toRoom(key, text) {
  const li = document.createElement('li'); li.className = 'sys'; li.append(document.createTextNode(text));
  if (key === curKey) { chatList.append(li); chatList.scrollTop = chatList.scrollHeight; } else store.get(key)?.push(li);
}
// comets: send a message from here to another world's main room
const inbox = new Map();
function cometParts(name, cc, text, from) { const parts = msgParts(name, cc, text); const n = document.createElement('small'); n.className = 'cnote'; const back = Object.assign(document.createElement('button'), { type: 'button', className: 'plink', textContent: from, title: `Fly to ${from}` }); back.dataset.place = from === 'Earth' ? 'Earth' : from; n.append(icon('comet', 11), ' comet from ', back); parts.push(n); return parts; }
function deliver(key, name, cc, text, from) {
  if (key === curKey) { chatLine('', cometParts(name, cc, text, from)); return; }
  const kept = store.get(key);
  if (kept) { const li = document.createElement('li'), parts = cometParts(name, cc, text, from); li.append(...parts); withActions(li, parts); kept.push(li); return; }
  if (!inbox.has(key)) inbox.set(key, []);
  inbox.get(key).push([name, cc, text, from]);
}
function sendComet(arg) {
  const w = arg.trim().split(/\s+/);
  for (let k = Math.min(3, w.length - 1); k >= 1; k--) {
    const to = bodies.find((b) => !hidden(b) && roomsFor(b).length && b.name.toLowerCase() === w.slice(0, k).join(' ').toLowerCase());
    if (!to) continue;
    const text = w.slice(k).join(' '), from = roomState.place ?? earth;
    if (to === from) { sys('That world is right here.'); return; }
    if (!reduced && state.view !== 'focus' && state.lens !== 'list') {
      const s0 = worldOf(from), e0 = worldOf(to);
      comets.push({ heads: [5, 3.2, 2.2, 1.4].map((sz) => { const sp = new THREE.Sprite(cometMat); sp.scale.setScalar(sz); scene.add(sp); return sp; }), curve: new THREE.QuadraticBezierCurve3(s0, s0.clone().lerp(e0, 0.5).addScaledVector(up, s0.distanceTo(e0) * 0.35), e0), to, t: 0 });
    }
    const room = roomsFor(to)[0][0];
    deliver(roomKey(to, room), me(), 'FR', text, from.earth ? 'Earth' : from.name);
    sys(`Comet sent: “${text}” lands in ${room} on ${to.name}.`);
    return;
  }
  sys('Write /comet <world> <message>, for example /comet BUBBLE gm from GovDAO');
}

// place links: #gnogolf/help or #bubble in a message flies you there
function goPlace(name, room) {
  const p = name ? (name === 'Earth' ? earth : bodies.find((b) => b.name === name)) : roomState.place;
  if (!p) return;
  const has = (q) => roomsFor(q).some(([n]) => n === room);
  if (p === roomState.place) { if (room && has(p)) joinRoom(room); else if (!state.focus || state.focus !== p) go(p); return; }
  go(p); if (room) setTimeout(() => { if (has(p)) joinRoom(room, true); }, 3800);
}
document.addEventListener('click', (e) => { const p = e.target.closest('.plink'); if (p) goPlace(p.dataset.place || null, p.dataset.room || null); });

// a person: where they hang out, what they do there
function personCard(name, anchor) {
  if (!name || name === 'Jarvis' || name === me()) return;
  const pop = $('personPop'), r = rng(hash(name) ^ 78), cc = POOL.find(([n]) => n === name)?.[1] ?? 'FR';
  const worlds = worldsOf(name);
  pop.replaceChildren();
  const who = document.createElement('div'); who.className = 'who';
  const orbit = document.createElement('span'); orbit.className = 'orbit'; orbit.append(avatarFor(name));
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ring.setAttribute('viewBox', '-20 -20 100 100'); ring.setAttribute('aria-hidden', 'true'); orbit.append(ring);
  worlds.forEach((w, i) => {
    const rx = 26 + i * 6, ry = 7 + i * 3;
    const e = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse'); Object.entries({ cx: 30, cy: 30, rx, ry }).forEach(([k, v]) => e.setAttribute(k, v)); ring.append(e);
    const m = thumbFor(w); m.classList.add('pmoon');
    m.style.offsetPath = `path("M ${30 - rx} 30 a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0")`;
    m.style.animationDuration = `${10 + i * 5}s`; m.style.animationDelay = `${-i * 3.1}s`;
    orbit.append(m);
  });
  const id = document.createElement('div'); id.append(Object.assign(document.createElement('b'), { className: 'nm', textContent: name }), Object.assign(document.createElement('small'), { textContent: `${COUNTRIES[cc]?.[0] ?? ''} · ${3 + Math.floor(r() * 12)} worlds stamped · helped ${helpedOf(name)}` }));
  who.append(orbit, id);
  const ul = document.createElement('ul');
  worlds.forEach((w, i) => { const li = document.createElement('li'); const d = document.createElement('i'); d.style.setProperty('--mc', dotColor(w)); li.append(d, `${['Regular', 'Helps people', 'Builds'][i]} in ${w.name}`); ul.append(li); });
  const row = document.createElement('div'); row.className = 'row';
  const msg = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost', textContent: 'Message' }); msg.addEventListener('click', () => { pop.hidden = true; chatMode('full'); openDM(name, cc); });
  const fly = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost', textContent: `Fly to ${worlds[0].name}` }); fly.addEventListener('click', () => { pop.hidden = true; go(worlds[0]); });
  row.append(msg, fly);
  pop.append(who, ul, row);
  pop.hidden = false;
  const a = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, a.left))}px`;
  pop.style.top = `${Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, a.bottom + 8))}px`;
}

// a question in a world's room reaches people from the world that knows best
const routed = new Set();
function routeQuestion(text) {
  const place = roomState.place;
  if (roomState.dm || !/\?\s*$/.test(text) || /^@(jarvis|guide)/i.test(text) || !place || place.earth || routed.has(place.name)) return;
  routed.add(place.name);
  const exp = linksOf(place).find((x) => x.kind !== 'shared')?.other ?? bodies.find((b) => b.name === 'Realm Review');
  const from = POOL.filter(([n]) => n !== me() && worldsOf(n).includes(exp)), [p1, p2] = [...from, ...POOL.filter(([n]) => n !== me() && !from.some(([m]) => m === n))].slice(0, 2);
  setTimeout(() => say('ai', `I asked ${p1[0]} and ${p2[0]} from ${exp.name}: they know this well.`), reduced ? 0 : 1400);
  setTimeout(() => {
    if (roomState.place !== place || roomState.dm) return;
    const li = chatLine('', msgParts(p1[0], p1[1], `came over from ${exp.name}: happy to help, what have you tried so far?`));
    const th = Object.assign(document.createElement('button'), { type: 'button', className: 'thanks', textContent: 'Thanks' });
    th.addEventListener('click', () => { const rp = keep.get('gw.rep', {}); rp[p1[0]] = (rp[p1[0]] ?? 0) + 1; keep.set('gw.rep', rp); th.disabled = true; th.textContent = `Thanked · ${p1[0]} helped ${helpedOf(p1[0])}`; });
    li.querySelector('.mact')?.before(th);
  }, reduced ? 0 : 4600);
}

// a world is born: a realm was just deployed, and it appears on the map
let born = false;
function birth() {
  if (born) return; born = true;
  const hub = { name: 'Fresh Mint', desc: 'Deployed a minute ago: mint tiny stickers and trade them.', group: 'hub', path: 'gno.land/r/sample/freshmint', type: 2, here: 3, rooms: 1, R: 134, angle: 2.3, signal: true };
  HUBS.push(hub);
  const w = makeBody(hub); bodies.push(w); addLabel(w);
  if (state.view !== 'focus' && !reduced) burst(worldOf(w), w.radius * 3, 0xb79cff, 2);
  NOTES.unshift({ text: 'A new signal: a realm was just deployed near the belt', where: 'Fresh Mint', when: 'now', unread: true, kind: 'world', ic: 'new' }); updateBell();
  TICKER.unshift(['SIGNAL', 'A realm was just deployed near the belt · nobody has charted it yet', 'Fresh Mint']); renderTicker();
  flash('A new signal near the belt', 'A realm was just deployed. Be the first to chart it.', ['Fly there', () => go(w)]);
  w.born = true;
  renderHRail(); renderList();
}
// Jarvis reads a realm with you: what it does, what you can read for free, what you can call (signed in Adena)
function realmTalk(b) {
  const path = realmOf(b) || b.path, f = realmFns(b), nr = f.filter((x) => x[1] === 'read').length, nc = f.length - nr;
  say('ai', `Reading ${path} on onyx. ${b.name}: ${nr} ${nr > 1 ? 'things' : 'thing'} you can read for free, ${nc} you can call. Calls open Adena for you to sign; I never sign for you.`);
  placeCard('realm', b); progress({ type: 'code' });
}

const nextDow = (dow, h) => { const d = new Date(); d.setUTCHours(h, 0, 0, 0); d.setUTCDate(d.getUTCDate() + ((dow - d.getUTCDay() + 7) % 7)); if (d.getTime() < Date.now() - 3600e3) d.setUTCDate(d.getUTCDate() + 7); return d.getTime(); };
const EVENTS = [
  { place: EVENT.place, title: EVENT.title, at: EVENT.at, where: 'voice lounge' },
  { place: 'GovDAO', title: 'Proposal 15 closes', at: nextAt(20), where: 'vote in #governance' },
  { place: 'Lisbon Gnomes', title: 'Lisbon meetup', at: nextDow(4, 18), where: 'in person · bring a laptop' },
  { place: 'gnogolf', title: 'Course ends · shortest realm wins', at: t0 + 67 * 3.6e6, where: '#gnogolf' },
  { place: 'Night Radio', title: 'Listening party', at: nextDow(5, 20), where: 'voice lounge' },
  { place: 'Memba DAO', title: 'Vote closes · proposal 14', at: t0 + 52 * 3.6e6, where: '#memba-dao' },
].sort((a, c) => a.at - c.at);
const remindKey = (e) => `${e.place}|${e.title}|${e.at}`;
const fmtDay = (t) => { const d = new Date(t), today = new Date(); const diff = Math.round((new Date(d.toDateString()) - new Date(today.toDateString())) / 864e5); return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'long' }); };
const fmtTime = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
function calendarCard(onlyHere) {
  const here = roomState.place, list = EVENTS.filter((e) => e.at > Date.now() - 3600e3 && (!onlyHere || e.place === here?.name));
  card('Calendar · your time', onlyHere ? `Coming up in ${here.name}` : 'Coming up across the worlds', (c) => {
    if (!list.length) line(c, 'Nothing planned here yet. Running this world? /event 19:00 your title');
    let day = '';
    list.slice(0, 6).forEach((e) => {
      const d = fmtDay(e.at); if (d !== day) { day = d; c.append(Object.assign(document.createElement('span'), { className: 'cday', textContent: d })); }
      const row = document.createElement('div'); row.className = 'cev';
      const w = findPlace(e.place);
      const tx = document.createElement('span'); tx.append(Object.assign(document.createElement('b'), { textContent: `${fmtTime(e.at)} · ${e.title}` }), Object.assign(document.createElement('small'), { textContent: `${e.place} · ${e.where}${Date.now() >= e.at ? ' · live now' : ''}` }));
      const set = () => keep.get('gw.reminds', []).includes(remindKey(e));
      const rm = Object.assign(document.createElement('button'), { type: 'button', className: 'rm' + (set() ? ' on' : ''), title: set() ? 'Reminder set' : 'Remind me' }); rm.setAttribute('aria-label', `Remind me: ${e.title}`); rm.setAttribute('aria-pressed', String(set()));
      rm.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
      rm.addEventListener('click', () => { const r = keep.get('gw.reminds', []); if (!r.includes(remindKey(e))) r.push(remindKey(e)); keep.set('gw.reminds', r); if (e.place === EVENT.place) keep.set('gw.remind', EVENT.at); rm.classList.add('on'); rm.title = 'Reminder set'; rm.setAttribute('aria-pressed', 'true'); });
      const gt = Object.assign(document.createElement('button'), { type: 'button', className: 'go', textContent: '→', title: `Go to ${e.place}` }); gt.setAttribute('aria-label', `Go to ${e.place}`); gt.addEventListener('click', () => goPlace(e.place));
      row.append(w ? thumbFor(w) : document.createElement('span'), tx, rm, gt); c.append(row);
    });
  });
}

// the weekly report: drafted by Jarvis, approved by a person, posted in Earth
function digestCard() {
  const born = bodies.filter((b) => b.born || b.name === 'Night Owls').map((b) => b.name);
  card('This week in gnoworld · drafted by Jarvis, approved by the team', `Week ${Math.ceil((new Date().getUTCDate()) / 7)} · ${new Date().toLocaleDateString('en-GB', { month: 'long' })}`, (c) => {
    [['New worlds', born.join(', ')], ['Busiest threads', '#bubble · the v6 chains, #governance · proposal 15'], ['Shipped', EVOS.filter((e) => e.step === 3).map((e) => e.t).join(', ') || 'nothing this week'], ['Coming up', EVENTS.slice(0, 3).map((e) => `${fmtDay(e.at)} ${fmtTime(e.at)} ${e.title}`).join(' · ')]]
      .forEach(([k, v]) => { const r = document.createElement('div'); r.className = 'dg'; r.append(Object.assign(document.createElement('small'), { textContent: k }), Object.assign(document.createElement('span'), { textContent: v })); c.append(r); });
    btnRow(c, [['Share the report', () => shareMoment('This week in gnoworld')], ['Calendar', () => calendarCard(false)]]);
  });
}

// actions that fit the place: play in a game, vote in a DAO, a date for a meetup, the realm itself
function card(kicker, title, build) {
  const c = document.createElement('div'); c.className = 'ccard';
  c.append(Object.assign(document.createElement('span'), { className: 'k', textContent: kicker }), Object.assign(document.createElement('b'), { className: 't', textContent: title }));
  build(c);
  const li = say('ai', ''); li.querySelector('.body')?.remove(); li.append(c);
  chatList.scrollTop = chatList.scrollHeight;
  return c;
}
const btnRow = (c, list) => { const r = document.createElement('div'); r.className = 'row'; list.forEach(([t, fn]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.addEventListener('click', () => fn(b)); r.append(b); }); c.append(r); return r; };
const line = (c, text) => c.append(Object.assign(document.createElement('span'), { className: 'ln', textContent: text }));
const actLine = (text) => chatLine('mine', msgParts(me(), 'FR', text)); // what you do in a card, the room sees
// what each realm exposes: reads are free queries (no signature), calls are transactions the person signs in Adena
// GovDAO follows gno.land/r/gov/dao as read on onyx with gnomcp (Render, GetProposal, MustVoteOnProposalSimple); the rest is sample
const REALM_FNS = {
  GovDAO: [['Render(":15")', 'read', 'Prop #15 · Raise the storage deposit cap · ACTIVE · YES 33% of 66.66%'], ['GetProposal(15)', 'read', 'Raise the storage deposit cap · by a T1 member · 2 days ago'], ['MustVoteOnProposalSimple(15, "YES")', 'call']],
  BUBBLE: [['Pot(12)', 'read', '72.9 GNOT in the pot · 41 boops today'], ['Boop(12)', 'call']],
  gnogolf: [['Best()', 'read', '209 bytes, by jonas'], ['Submit(code)', 'call']],
  'Memba DAO': [['GetProposal(14)', 'read', 'Fund the spring art drop · 71% yes · closes Friday'], ['Vote(14, true)', 'call']],
};
const realmFns = (b) => REALM_FNS[b.name] ?? [['Render("")', 'read', `${b.name}'s home page · ${b.here ?? 0} here`], ['Join()', 'call']];
// a realm call is a transaction: Adena asks you to sign it, and only then does it happen
// ponytail: the prototype never calls Adena for real (its data is sample), it shows the request it would send
function signTx({ title, what, realm, fn, args, done }) {
  const box = $('signBox');
  $('signTitle').textContent = title; $('signWhat').textContent = what;
  $('signRealm').textContent = realm; $('signFn').textContent = fn; $('signArgs').textContent = args;
  const go = $('signGo'), cancel = $('signCancel'), wait = $('signWait');
  go.disabled = cancel.disabled = false; go.textContent = 'Sign in Adena'; wait.hidden = true; wait.classList.remove('ok');
  go.onclick = () => {
    // the person signs in the wallet; here we wait for it, then confirm
    go.disabled = cancel.disabled = true; wait.hidden = false; wait.querySelector('span').textContent = 'Waiting for your signature in Adena…';
    setTimeout(() => {
      wait.classList.add('ok'); wait.querySelector('span').textContent = `Signed · tx ${(hash(title + Date.now()) >>> 0).toString(16).padStart(8, '0').slice(0, 4)}…${(hash(fn) >>> 0).toString(16).slice(0, 4)} · sample`;
      setTimeout(() => { box.close(); done?.(); }, reduced ? 0 : 1200);
    }, reduced ? 0 : 2800);
  };
  cancel.onclick = () => box.close();
  box.showModal(); box.focus();
}
function placeCard(kind, at) {
  const b = at ?? roomState.place ?? earth;
  if (kind === 'play' && b.name === 'BUBBLE') {
    card('Play · BUBBLE', 'Pot 72.9 GNOT · the last boop wins it', (c) => { line(c, `Clock ${MOMENTS.BUBBLE().text.split('· ')[1]} · the same clock as the ring`); btnRow(c, [['Boop', (bt) => signTx({ title: 'Boop the pot', what: 'A boop is a call to the BUBBLE realm. Adena asks you to sign it.', realm: 'gno.land/r/sample/bubble', fn: 'Boop', args: 'pot 12', done: () => { bt.textContent = 'Booped'; bt.classList.add('on'); bt.disabled = true; actLine('booped the pot · signed with Adena (sample)'); progress({ type: 'realm' }); } })]]); });
  } else if (kind === 'play') {
    card('Play · gnogolf', 'This week: the shortest realm that renders “gm”', (c) => { line(c, 'Best so far: 214 bytes, by jonas'); btnRow(c, [['Ask Jarvis for a start', () => ask('@jarvis write the shortest gno realm whose Render returns gm')]]); });
  } else if (kind === 'proposal') {
    const yes = b.name === 'GovDAO' ? 58 : 71;
    card(`Proposal · ${b.name}`, b.name === 'GovDAO' ? 'Proposal 15 · closes in 2 h' : 'Proposal 14 · fund the spring art drop', (c) => {
      const bar = document.createElement('div'); bar.className = 'bar'; const i = document.createElement('i'); i.style.width = `${yes}%`; bar.append(i); c.append(bar);
      line(c, b.name === 'GovDAO' ? `${yes}% yes · passes at 66.66% of voting power` : `${yes}% yes · closes Friday`);
      const gov = b.name === 'GovDAO', pid = gov ? 15 : 14;
      const vote = (yesNo) => (bt) => signTx({
        title: `Vote ${yesNo} on proposal ${pid}`, what: `Your vote is a transaction to the ${b.name} realm. Adena asks you to sign it.`,
        realm: gov ? 'gno.land/r/gov/dao' : (realmOf(b) || b.path), fn: gov ? 'MustVoteOnProposalSimple' : 'Vote', args: gov ? `${pid}, ${yesNo.toUpperCase()}` : `${pid}, ${yesNo === 'yes'}`,
        done: () => {
          const row = bt.parentElement; row.querySelectorAll('button').forEach((x) => { x.disabled = true; }); bt.classList.add('on');
          i.style.width = `${yes + (yesNo === 'yes' ? 1 : -1)}%`;
          actLine(`voted ${yesNo} on proposal ${pid} · signed with Adena (sample)`); progress({ type: 'vote' });
        },
      });
      btnRow(c, [['Vote yes', vote('yes')], ['Vote no', vote('no')]]);
    });
  } else if (kind === 'events') {
    calendarCard(!b.earth && EVENTS.some((e) => e.place === b.name));
    return;
  } else if (kind === 'oldevents') {
    const local = /Lisbon|Kyoto/.test(b.name);
    card(local ? `Meetup · ${b.name}` : `Event · ${EVENT.place}`, local ? `${b.name.split(' ')[0]} meetup · Thursday 19:00` : `${EVENT.title} · ${eventLabel()}`, (c) => {
      line(c, local ? '14 going · bring a laptop' : `Voice room in ${EVENT.place} · questions welcome`);
      const reminded = () => keep.get('gw.remind', 0) === EVENT.at;
      btnRow(c, local ? [['I am going', (bt) => { bt.classList.add('on'); bt.textContent = 'Going · 15'; actLine(`is going to the ${b.name.split(' ')[0]} meetup`); }]] : [[reminded() ? 'Reminder set' : 'Remind me', (bt) => { bt.classList.add('on'); bt.textContent = 'Reminder set'; keep.set('gw.remind', EVENT.at); }], ['Go there', () => goPlace(EVENT.place)]]);
    });
  } else if (kind === 'realm') {
    const path = realmOf(b) || b.path;
    progress({ type: 'realm' });
    card(`Realm · ${path} · onyx`, 'Read it for free, call it with Adena', (c) => {
      realmFns(b).forEach(([sig, k, res]) => {
        const row = document.createElement('div'); row.className = 'fn';
        row.append(Object.assign(document.createElement('code'), { textContent: sig }));
        const bt = Object.assign(document.createElement('button'), { type: 'button', textContent: k === 'read' ? 'Read' : 'Call' });
        bt.addEventListener('click', () => {
          if (k === 'read') {
            bt.disabled = true;
            const out = document.createElement('div'); out.className = 'fnout';
            out.append(Object.assign(document.createElement('span'), { textContent: res }), Object.assign(document.createElement('small'), { textContent: 'read on chain · free, no signature' }));
            row.after(out); progress({ type: 'realm' }); chatList.scrollTop = chatList.scrollHeight; return;
          }
          const name = sig.split('(')[0], args = sig.slice(sig.indexOf('(') + 1, -1);
          signTx({ title: `Call ${name}`, what: `A call to ${b.name}'s realm. Adena asks you to sign it; Jarvis never signs for you.`, realm: path, fn: name, args: args || 'none', done: () => { sys(`Signed ${name} with Adena (sample: nothing was sent).`); progress({ type: 'realm' }); } });
        });
        row.append(bt); c.append(row);
      });
    });
  } else if (kind === 'station') {
    if (b === aiRing) openMedia([siteShot()], 0); else if (b === bmoon) openMedia(channelVideos(), 0);
    else card('Today on board · Harbor', 'Why the Moon has a far side', (c) => { line(c, 'Long read · 14 min · sample. The reading club meets in #reading-club.'); btnRow(c, [['Open #reading-club', () => joinRoom('#reading-club')]]); });
  }
}
function catchUp() {
  if (sampleFn) { ask(`@jarvis what did I miss in ${roomState.name}? Three short points.`); return; }
  const msgs = [...chatList.children].filter((li) => li.querySelector('.mact')).slice(-8).map((li) => [li.querySelector('.meta b')?.textContent ?? '', li.querySelector('.body')?.textContent ?? '']);
  const people = [...new Set(msgs.map(([n]) => n))].slice(0, 4);
  say('ai', `While you were away in ${roomState.name}: ${people.join(', ')} were here.\n${msgs.slice(-3).map(([n, t]) => `- ${n}: ${t.slice(0, 70)}`).join('\n')}`, [], true);
}
const GAMES = new Set(['BUBBLE', 'gnogolf']);
function renderQuick() {
  const q = $('quick'), b = roomState.dm ? null : roomState.place ?? earth; q.replaceChildren();
  const items = [];
  if (!b || b.earth) items.push(["Who's here", '/who'], ['Quiz', '/quiz']);
  if (b?.kind === 'station') items.push([b === bmoon ? 'Watch' : b === aiRing ? 'Showcase' : 'Read', '/station']);
  if (b && GAMES.has(b.name)) items.push(['Play', '/play']);
  if (b?.dao) items.push(['Proposal', '/proposal']);
  if (b && (b.earth || EVENTS.some((e) => e.place === b.name))) items.push([b.earth ? 'Calendar' : 'Events', '/events']);
  if (b && !b.earth && b.group !== 'topic' && b.kind !== 'station' && b.path?.includes('/r/')) items.push(['Realm', '/realm']);
  if (b && !b.earth) items.push(['Catch up', '/catchup']);
  if (b) items.push(['Poll', '/poll ']);
  (innerWidth > 900 ? items.slice(0, 4) : [...items.slice(0, 3), ['@jarvis', '@jarvis ']]).forEach(([t, c]) => { const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.cmd = c; bt.textContent = t; q.append(bt); });
}

// site evolutions: Jarvis prebuilds a change, a person on the team reviews it, nothing ships on its own
const EVO_STEPS = ['Asked', 'Prebuilt', 'Reviewed', 'Live'];
const EVOS = [
  { t: 'Show a realm’s source next to its world', by: 'noor', step: 0, pct: 60, votes: 12 },
  { t: 'A dark list view with bigger planets', by: 'kaito', step: 1, votes: 8 },
  { t: 'A weekly digest pinned in Earth', by: 'lea', step: 2, votes: 23, rev: 'the gno.land team' },
  { t: 'Line icons instead of emoji', by: 'alexis', step: 3, votes: 41, rev: 'the gno.land team' },
];
function renderEvo() {
  const list = $('evoList'); list.replaceChildren();
  [...EVOS].sort((a, c) => (c.votes ?? 0) + (c.mine ? 1 : 0) - (a.votes ?? 0) - (a.mine ? 1 : 0)).forEach((e) => {
    const li = document.createElement('li');
    const top = document.createElement('div'); top.className = 'top'; top.append(Object.assign(document.createElement('b'), { textContent: e.t }), Object.assign(document.createElement('small'), { textContent: `asked by @${e.by}` }));
    const st = document.createElement('div'); st.className = 'steps';
    EVO_STEPS.forEach((n, i) => { const x = document.createElement('i'); x.title = n; if (i <= e.step) x.className = 'on'; st.append(x); });
    st.append(Object.assign(document.createElement('span'), { className: 'st', textContent: ['Jarvis is prebuilding · ' + (e.pct ?? 10) + '%', 'Preview ready · waiting for a person to review', `Approved by ${e.rev ?? 'the team'} · ships next version`, `Live · reviewed by ${e.rev ?? 'the team'}`][e.step] }));
    const up = Object.assign(document.createElement('button'), { type: 'button', className: 'up' + (e.mine ? ' on' : ''), textContent: `+1 · ${(e.votes ?? 0) + (e.mine ? 1 : 0)}` }); up.setAttribute('aria-pressed', String(!!e.mine)); up.addEventListener('click', () => { e.mine = !e.mine; renderEvo(); });
    st.append(up);
    li.append(top, st);
    if (e.step >= 1) { const p = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost', textContent: 'Open the preview' }); p.addEventListener('click', () => { let src = ''; try { composer.render(); src = renderer.domElement.toDataURL('image/jpeg', 0.85); } catch {} const img = Object.assign(document.createElement('img'), { src, alt: `Preview: ${e.t}` }); img.dataset.cap = `Prebuilt by Jarvis · ${e.t} · not live`; openMedia([img], 0); }); li.append(p); }
    list.append(li);
  });
}
function openEvo(prefill = '') { renderEvo(); $('evoInput').value = prefill; $('evoBox').showModal(); }
$('evoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('evoInput').value.trim(); if (!v) return;
  const ev = { t: v, by: me(), step: 0, pct: 8, votes: 0, mine: true }; EVOS.unshift(ev); track('evolve'); $('evoInput').value = ''; renderEvo();
  setTimeout(() => { ev.pct = 64; if ($('evoBox').open) renderEvo(); }, 1500);
  setTimeout(() => { ev.step = 1; if ($('evoBox').open) renderEvo(); }, 3600);
});
$('evoClose').addEventListener('click', () => $('evoBox').close());

// ---------- the guide: navigation, discovery, explanations, introductions (scripted here) ----------
const actions = new Map();
let actId = 0;
document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && actions.has(b.dataset.act)) actions.get(b.dataset.act)(); });
function say(who, text, acts = [], md = false) {
  if (who === 'you') { chatLine('mine', msgParts(me(), 'FR', text)); return; }
  const meta = document.createElement('div'); meta.className = 'meta';
  const orb = document.createElement('span'); orb.className = 'gorb';
  const b = document.createElement('b'); b.textContent = 'Jarvis';
  const tag = document.createElement('span'); tag.className = 'gtag'; tag.textContent = 'AI concierge';
  meta.append(orb, b, tag);
  const tx = document.createElement('span'); tx.className = 'body'; if (md) { tx.append(mdRender(text)); addCopy(tx); } else tx.textContent = text;
  const parts = [meta, tx];
  if (acts.length) {
    const row = document.createElement('div'); row.className = 'acts';
    acts.forEach(([label, fn]) => { const id = String(++actId); actions.set(id, fn); const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'tag'; bt.dataset.act = id; bt.textContent = label; row.append(bt); });
    parts.push(row);
  }
  const li = chatLine('guide', parts);
  $('srLive').textContent = `Jarvis: ${text}`;
  return li;
}
function pollMsg(author, question, options, correct = -1) {
  const votes = options.map(() => 2 + Math.floor(Math.random() * 18));
  let voted = -1;
  const meta = author === 'guide' ? (() => { const m = document.createElement('div'); m.className = 'meta'; const o = document.createElement('span'); o.className = 'gorb'; const b = document.createElement('b'); b.textContent = 'Jarvis'; const t = document.createElement('span'); t.className = 'gtag'; t.textContent = correct >= 0 ? 'quiz' : 'poll'; m.append(o, b, t); return m; })() : msgParts(author, 'FR', '')[0];
  const q = document.createElement('div'); q.textContent = question;
  const box = document.createElement('div'); box.className = 'poll';
  const total = () => votes.reduce((a, v) => a + v, 0);
  const paint = () => box.querySelectorAll('button').forEach((bt, i) => {
    const pct = Math.round((votes[i] / total()) * 100);
    bt.querySelector('i').style.width = voted < 0 ? '0%' : `${pct}%`;
    bt.querySelector('.pct').textContent = voted < 0 ? '' : `${pct}%`;
    bt.classList.toggle('mine', i === voted);
    if (voted >= 0 && correct >= 0) { bt.classList.toggle('right', i === correct); bt.classList.toggle('wrong', i === voted && i !== correct); }
  });
  options.forEach((opt, i) => {
    const id = String(++actId);
    actions.set(id, () => {
      if (voted >= 0) return;
      voted = i; votes[i] += 1; progress({ type: 'poll' });
      document.querySelectorAll(`[data-poll="${box.dataset.poll}"]`).forEach((bx) => { bx.dataset.voted = String(i); });
      paintAll();
      if (correct >= 0) say('ai', i === correct ? `Right: ${options[correct]}.` : `Not quite: it is ${options[correct]}.`);
    });
    const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.act = id;
    const bar = document.createElement('i'); const t = document.createElement('span'); t.textContent = opt; const pc = document.createElement('span'); pc.className = 'pct';
    bt.append(bar, t, pc); box.append(bt);
  });
  box.dataset.poll = String(++actId);
  const note = document.createElement('small'); note.textContent = `${total()} votes · ${correct >= 0 ? 'one right answer' : 'tap to vote'}`;
  const paintAll = () => { document.querySelectorAll(`[data-poll="${box.dataset.poll}"]`).forEach((bx) => paintBox(bx)); };
  const paintBox = (bx) => bx.querySelectorAll('button').forEach((bt, i) => {
    const pct = Math.round((votes[i] / total()) * 100);
    bt.querySelector('i').style.width = `${pct}%`; bt.querySelector('.pct').textContent = `${pct}%`;
    bt.classList.toggle('mine', i === voted);
    if (correct >= 0) { bt.classList.toggle('right', i === correct); bt.classList.toggle('wrong', i === voted && i !== correct); }
  });
  void paint;
  chatLine(author === 'guide' ? 'guide' : 'mine', [meta, q, box, note]);
}
const QUIZ = [
  ['Which planet has rings because a DAO lives there?', ['BUBBLE', 'Memba DAO', 'gnogolf'], 1],
  ['What does the size of a planet show?', ['Its age', 'The people there now', 'Its token price'], 1],
  ['Where is the general chat?', ['Earth', 'GovDAO', 'The asteroid belt'], 0],
  ['What are the moons around a hub?', ['Its rooms', 'Its tokens', 'Its validators'], 0],
];
let quizIndex = 0;
const flyAct = (b) => [`Fly to ${nameOf(b)}`, () => go(b)];
function answer(q, quiet = false) {
  const n = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const known = bodies.filter((b) => !hidden(b) && b.kind !== 'ad');
  const hit = known.find((b) => n.includes(b.name.toLowerCase()) || (b.tags ?? []).some((t) => n.includes(t.slice(1))));
  const dev = bodies.find((b) => b.name === 'Dev help');
  const realmish = (x) => x?.path?.includes('/r/') && x.group !== 'topic';
  if (/\b(write|deploy|deployer|coder|counter|ecris|ecrire)\b/.test(n)) {
    say('ai', 'I cannot write or deploy realms yet. I can read any realm on chain, explain its functions, read its state for free, and prepare a call you sign in Adena.', realmish(hit ?? roomState.place) ? [['What can I do here?', () => realmTalk(hit ?? roomState.place)]] : []); progress({ type: 'code' });
  } else if (/(what can i do|que faire|functions?|fonctions?|\brealm\b|explain|interact|\bcall\b|\bread\b)/.test(n) && realmish(hit ?? roomState.place)) {
    realmTalk(hit ?? roomState.place);
  } else if (/(introduc|meet|rencontr|connect|present|who build|qui )/.test(n)) {
    say('ai', 'Three people in Dev help are building realms right now: noor (Egypt), minji (Korea) and jonas (Germany). I can ask whether they are open to a chat with you.',
      [['Ask them', () => say('ai', 'Asked. I will tell you when someone answers. (sample)')], flyAct(dev)]);
  } else if (hit) {
    const f = facts(hit);
    say('ai', `${hit.name}: ${f.kind.toLowerCase()}, ${f.a[0]} ${f.a[1]}, ${f.c[0]} ${f.c[1]}.${hit.dao ? ' Its rings mean a DAO lives there.' : ''}`, [flyAct(hit)]);
  } else if (/(new|nouveau|discover|decouv|surprise|uncharted|inconnu|explore)/.test(n)) {
    const sig = bodies.find((b) => hidden(b));
    if (sig) say('ai', `There is an uncharted signal at the edge of the system, ${sig.here} people. Nobody you follow has been there.`, [flyAct(sig)]);
    else say('ai', 'You have charted every signal. The newest hub is Night Owls.', [flyAct(bodies.find((b) => b.name === 'Night Owls'))]);
  } else if (/(dao|ring|anneau|govern|vote)/.test(n)) {
    const daos = known.filter((b) => b.dao);
    say('ai', `Rings mean a DAO lives on that planet. ${daos.map((b) => b.name).join(', ')} have one; GovDAO has 3 open proposals.`, daos.slice(0, 3).map(flyAct));
  } else if (/(price|prix|gnot|token|cours)/.test(n)) {
    say('ai', `GNOT is at $${$('gnotPrice').textContent} (${$('gnotChange').textContent}). The BUBBLE token is at 0.0123 GNOT. These are sample figures in this prototype.`, [flyAct(bodies.find((b) => b.name === 'BUBBLE'))]);
  } else if (/(earth|terre|world|monde|pays|country)/.test(n)) {
    say('ai', '184 people are talking from 31 countries. On the Earth, each public message pops up over its speaker\'s country.', [flyAct(earth)]);
  } else if (/(system|galax|beyond|au-dela|au dela|other chain|testnet|onyx)/.test(n)) {
    const sy = bodies.filter((b) => b.kind === 'system');
    say('ai', `Beyond our system there are ${sy.length} others: ${sy.map((b) => `${b.name} (${b.desc.toLowerCase()})`).join(' and ')}. The trip takes a few seconds.`, sy.map(flyAct));
  } else if (/(rent|louer|pub|advert|satellite|sponsor)/.test(n)) {
    const free = ads.find((a) => !a.by);
    say('ai', 'Anyone with a gno name can rent a satellite for a few days, paid in GNOT. Its text goes through the name filter and moderation.', [flyAct(free)]);
  } else if (CODE_RE.test(n) && realmish(roomState.place)) {
    realmTalk(roomState.place);
  } else {
    if (quiet) return false;
    say('ai', 'I can fly you somewhere, explain what you see, read a realm with you and help you call it, or introduce you to people. Try: @jarvis what can I do here?');
  }
  return true;
}
// Jarvis also codes in gno: these are the facts it builds on (checked against the gno skill references)
const CODE_RE = /\b(gno|realms?|code|coder|func|package|avl|render|crossing|cross|gnokey|gnomod|deploy|deployer|testnet|onyx|panic|struct|import|compile|filetest|write a|ecris|ecrire)\b/;
const GNO_FACTS = 'You also explain Gno realms (the Go-like contracts of gno.land) and help people use them. You cannot write or deploy realms for them yet: you read a realm on chain, explain its functions, read its state for free, and prepare a call the person signs in Adena. Facts to rely on, and say when something must be checked on the target chain:\n'
  + '- /r/ realms are stateful contracts; /p/ packages are pure libraries. A realm\'s package-level variables are its state.\n'
  + '- A function a transaction can call takes `cur realm` first: calling it is a transaction, signed in Adena, and costs a small fee. Functions without it, and Render, are read for free.\n'
  + '- The caller is `cur.Previous().Address()`; `panic` reverts the whole transaction.\n'
  + '- GovDAO lives at gno.land/r/gov/dao; members vote with MustVoteOnProposalSimple(pid, "YES"|"NO"|"ABSTAIN"); proposals pass at 2/3 of voting power.\n'
  + '- Use onyx (the testnet) to try things. Never ask for keys or seed phrases, never sign for the person.\n'
  + 'Answer in short Markdown; show a function signature in `code` when it helps.';
function addCopy(el) {
  el.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.cpy')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cpy'; b.textContent = 'Copy';
    b.addEventListener('click', () => { navigator.clipboard?.writeText(pre.querySelector('code')?.textContent ?? '').then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1400); }).catch(() => {}); });
    pre.append(b);
  });
}
let sampleFn = null;
window.claude?.use?.('sample').then((f) => { sampleFn = f; }).catch(() => {});
const JARVIS = 'You are Jarvis, the AI concierge inside gnoworld, a public 3D hub for the gno.land blockchain ecosystem. '
  + 'Places are planets (projects, hubs, DAOs); ecosystems are groups of worlds; Earth is the general chat; far systems are other communities. '
  + 'Numbers in this prototype are sample data. Reply in the language of the question, in at most three short sentences of plain text, no markdown. '
  + 'Be concrete and kind. Never give financial advice or price predictions, never ask for keys, seed phrases or signatures. '
  + 'If the person wants to go to one of the places listed, add a last line exactly: FLY: <place name>.';
async function smartAsk(q) {
  const li = say('ai', 'Thinking…'), body = li.querySelector('.body');
  const places = bodies.filter((b) => !hidden(b) && b.kind !== 'ad').slice(0, 50).map((b) => `- ${nameOf(b)} (${facts(b).kind}, ${b.here ?? 0} here${b.path?.includes('/r/') && b.group !== 'topic' ? `, realm ${b.path}` : ''}): ${b.desc ?? ''}`).join('\n');
  const recent = [...chatList.children].slice(-8).map((x) => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 160)).join('\n');
  const code = CODE_RE.test(q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const links = ROUTES.map(([a, c, k, n]) => `${a} ${k} ${c}${k === 'calls' ? ` (${n} a day)` : ''}`).concat(SHARED.map(([a, c, r]) => `${a} and ${c} share ${r}`)).join('; ');
  const input = `${code ? JARVIS.replace('in at most three short sentences of plain text, no markdown', 'briefly') + '\n' + GNO_FACTS : JARVIS}\n\nPlaces (sample realm paths):\n${places}\nLinks between realms: ${links}.\n\nThe person is in ${roomState.name} on ${roomState.place?.name ?? 'Earth'}. Recent chat:\n${recent}\n\nTheir question: ${q.replace(/^@(jarvis|guide)\s*/i, '')}`;
  const show = (t) => { const clean = t.replace(/\n?FLY:.*$/s, '').trim() || 'Thinking…'; if (code) body.replaceChildren(mdRender(clean)); else body.textContent = clean; };
  try {
    const { text } = await sampleFn(input, { modelTier: code ? 'default' : 'quick', cache: false, onText: ({ text: t }) => { show(t); chatList.scrollTop = chatList.scrollHeight; } });
    const fly = text.match(/FLY:\s*(.+)\s*$/)?.[1]?.trim(), to = fly && findPlace(fly);
    show(text);
    if (code) { addCopy(body); progress({ type: 'code' }); const rb = roomState.place; if (rb?.path?.includes('/r/') && rb.group !== 'topic') placeCard('realm', rb); }
    $('srLive').textContent = `Jarvis: ${body.textContent}`;
    if (to) { const row = document.createElement('div'); row.className = 'acts'; const id = String(++actId); actions.set(id, () => go(to)); const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'tag'; bt.dataset.act = id; bt.textContent = `Fly to ${nameOf(to)}`; row.append(bt); li.append(row); }
  } catch (e) {
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e?.code)) sampleFn = null;
    if (e?.code === 'rate_limited') { body.textContent = 'Lots of questions right now. Ask me again in a minute.'; return; }
    li.remove(); answer(q);
  }
}
function ask(q) {
  if (!q.trim()) return;
  openChat(true);
  say('you', q);
  if (sampleFn) { smartAsk(q); return; }
  setTimeout(() => answer(q), reduced ? 0 : 420);
}
function setGuide() {
  openChat(true);
  const i = $('chatInput'); i.value = '@jarvis '; i.focus();
  if (!roomState.welcomed.has('guide-intro')) {
    roomState.welcomed.add('guide-intro');
    say('ai', 'I am Jarvis, in every room. I can fly you somewhere, read a realm with you and help you call it, catch you up, or take your idea for the site to the team.', [
      ['What can I do here?', () => ask(`@jarvis what can I do in ${(roomState.place ?? earth).name}?`)],
      ['What is new today?', () => ask('@jarvis show me something new')],
      ['Site evolutions', () => openEvo()],
    ]);
  }
}
$('guideBtn').addEventListener('click', () => setGuide());
$('askBtn').addEventListener('click', () => { const b = state.focus; if (b) ask(`@jarvis tell me about ${nameOf(b)}`); else setGuide(); });

// ---------- notifications and messages (samples) ----------
// kind: message (mentions, replies, direct), world (votes, events, new worlds), news (gno.land itself)
const NOTES = [
  { text: `AMA in Dev help ${eventLabel()}: interrealm, with the core team`, where: 'Dev help', when: 'soon', unread: true, kind: 'world', ic: 'event' },
  { text: 'kaito mentioned you in #builders', where: 'BUBBLE', room: '#builders', when: '2 min', unread: true, kind: 'message', ic: 'mention' },
  { text: 'Proposal 15 closes in 2 hours', where: 'GovDAO', when: '9 min', unread: true, kind: 'world', ic: 'vote' },
  { text: 'noor · want to pair on the realm review?', where: 'Realm Review', dm: ['noor', 'EG'], when: '12 min', unread: true, kind: 'message', ic: 'dm' },
  { text: 'Onyx testnet: release notes for this week', where: 'Earth', when: '40 min', unread: false, kind: 'news', ic: 'news' },
  { text: 'A new hub was born near you', where: 'Night Owls', when: '1 h', unread: true, kind: 'world', ic: 'new' },
  { text: 'gnoweb now shows a realm’s source next to its page', where: 'Earth', when: '3 h', unread: false, kind: 'news', ic: 'news' },
  { text: 'This week in gnoworld: the report is out', where: 'Earth', when: '5 h', unread: true, kind: 'news', ic: 'news', act: () => { goPlace('Earth', '#general'); setTimeout(() => digestCard(), 400); } },
  { text: 'minji · thanks for the intro!', where: 'Kyoto builders', dm: ['minji', 'KR'], when: '1 h', unread: false, kind: 'message', ic: 'dm' },
];
const DMS = [
  { text: 'noor · want to pair on the realm review?', where: 'Realm Review', when: '5 min', unread: true },
  { text: 'minji · thanks for the intro!', where: 'Kyoto builders', when: '1 h', unread: false },
  { text: 'lea · see you at the Lisbon meetup', where: 'Lisbon Gnomes', when: 'yesterday', unread: false },
];
let notifTab = 'all', notifWhere = '';
const NOTE_IC = { mention: '<path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0 0v1a1.75 1.75 0 0 0 3.5 0V8A6 6 0 1 0 11 13.2"/>', dm: '<path d="M2.5 4.5h11v7.5h-11z"/><path d="m2.5 4.5 5.5 4.5 5.5-4.5"/>', vote: '<path d="M3 8.5 6.5 12 13 4.5"/>', event: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>', new: '<circle cx="8" cy="8" r="2"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4"/>', news: '<path d="M3 3.5h8v9H4a1 1 0 0 1-1-1z"/><path d="M11 6h2v5.5a1 1 0 0 1-2 0M5 6h4M5 8.5h4"/>' };
function renderNotif() {
  const list = $('notifList'), mine = NOTES.filter((n) => notifTab === 'all' || n.kind === notifTab);
  // where: the worlds in this kind of note, the ones you follow first
  const places = [...new Set(mine.map((n) => n.where))].sort((a, c) => state.followed.has(c) - state.followed.has(a));
  if (notifWhere && !places.includes(notifWhere)) notifWhere = '';
  const wh = $('notifWhere'); wh.replaceChildren();
  [['', 'All worlds'], ...places.map((p) => [p, p])].forEach(([v, t]) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(notifWhere === v));
    const p = v && findPlace(v); if (p) b.append(thumbFor(p)); b.append(t);
    b.addEventListener('click', () => { notifWhere = v; renderNotif(); }); wh.append(b);
  });
  wh.hidden = places.length < 2;
  list.replaceChildren();
  const items = mine.filter((n) => !notifWhere || n.where === notifWhere);
  items.forEach((n) => {
    const li = document.createElement('li'); if (n.unread) li.className = 'unread';
    const b = document.createElement('button'); b.type = 'button';
    const ic = document.createElement('span'); ic.className = 'nic'; ic.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NOTE_IC[n.ic] ?? NOTE_IC.news}</svg>`;
    const t = document.createElement('span'); t.className = 'nt'; t.append(n.text, Object.assign(document.createElement('small'), { textContent: n.where === 'Earth' && n.kind === 'news' ? 'gno.land' : n.where }));
    const w = document.createElement('small'); w.className = 'nw'; w.textContent = n.when;
    b.append(ic, t, w);
    b.addEventListener('click', () => {
      n.unread = false; updateBell(); $('notif').hidden = true; $('bellBtn').setAttribute('aria-expanded', 'false');
      if (n.dm) { chatMode('full'); openDM(n.dm[0], n.dm[1]); return; }
      if (n.act) { n.act(); return; }
      // a signal nobody has charted is not in search yet, but its notification still flies you there
      const to = findPlace(n.where) ?? bodies.find((b) => b.name === n.where); if (to) goPlace(to.name, n.room ?? null);
    });
    li.append(b); list.append(li);
  });
  if (!items.length) list.append(Object.assign(document.createElement('li'), { className: 'nempty', textContent: 'Nothing here yet.' }));
  const counts = { all: NOTES.filter((x) => x.unread).length };
  ['message', 'world', 'news'].forEach((k) => { counts[k] = NOTES.filter((x) => x.unread && x.kind === k).length; });
  document.querySelectorAll('#notifTabs button').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.tab === notifTab)); b.querySelector('.c').textContent = counts[b.dataset.tab] ? String(counts[b.dataset.tab]) : ''; });
  $('notifNote').textContent = 'Direct messages are end-to-end encrypted, with MLS, in phase 2. These are samples.';
}
$('notifRead').addEventListener('click', () => { NOTES.forEach((n) => { n.unread = false; }); updateBell(); renderNotif(); });
function updateBell() {
  const n = NOTES.filter((x) => x.unread).length;
  $('bellCount').textContent = String(n); $('bellCount').hidden = !n;
}
$('bellBtn').addEventListener('click', () => {
  const open = $('notif').hidden;
  $('notif').hidden = !open; $('bellBtn').setAttribute('aria-expanded', String(open));
  if (open) renderNotif();
});
document.addEventListener('pointerdown', (e) => { if (!$('notif').hidden && !e.target.closest('#notif, #bellBtn')) { $('notif').hidden = true; $('bellBtn').setAttribute('aria-expanded', 'false'); } });
document.querySelectorAll('#notifTabs button').forEach((b) => b.addEventListener('click', () => { notifTab = b.dataset.tab; renderNotif(); }));
const MORE = [['aarav replied in Dev help', 'Dev help', 'message', 'mention'], ['GovDAO opened proposal 15', 'GovDAO', 'world', 'vote'], ['3 people joined Night Owls', 'Night Owls', 'world', 'new'], ['mia mentioned you in #general', 'Earth', 'message', 'mention']];
let moreIndex = 0;
setInterval(() => {
  if (moreIndex >= MORE.length) return;
  const [text, where, kind, ic] = MORE[moreIndex++];
  NOTES.unshift({ text, where, when: 'now', unread: true, kind, ic });
  NOTES.length = Math.min(NOTES.length, 12);
  updateBell(); // an open list does not move under the pointer: it shows the new note at its next opening
  if (window.gsap && !reduced) window.gsap.fromTo('#bellBtn', { rotate: -14 }, { rotate: 0, duration: 0.8, ease: 'elastic.out(1, 0.3)' });
}, 30000);
updateBell();

// ---------- Adena: connect to speak ----------
const TAKEN = new Set(['satoshi001', 'satoshi002', 'satoshi003', 'elonmusk000', 'alexis001', 'gnoland000']);
function checkName() {
  const v = $('profName').value.trim().toLowerCase(), out = $('profCheck'), ok = /^[a-z]{5,13}[0-9]{3}$/.test(v);
  let msg = '5 to 13 letters, then 3 digits. Example: nym-alexis042.';
  if (ok && TAKEN.has(v)) msg = `nym-${v} is taken.`;
  else if (ok && /[lio0]/.test(v) && /[1o0]/.test(v.slice(-3))) msg = `nym-${v} is free. Names that look alike (l/i/1, 0/o) may be refused.`;
  else if (ok) msg = `nym-${v} is free.`;
  out.textContent = msg; out.className = ok && !TAKEN.has(v) ? 'ok' : '';
  $('profSave').disabled = !ok || TAKEN.has(v);
}
function openProfile() {
  const box = $('profile'), list = $('profAvatars');
  if (!list.children.length) {
    AV_TEX.forEach((k) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'avpick'; b.dataset.tex = k; b.style.backgroundImage = `url(./${k}.jpg)`; b.setAttribute('aria-label', `${k} avatar`); list.append(b); });
    const up = document.createElement('button'); up.type = 'button'; up.className = 'avpick up'; up.textContent = '+'; up.setAttribute('aria-label', 'Upload an image'); list.append(up);
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.avpick'); if (!b) return;
      if (b.classList.contains('up')) { $('profFile').click(); return; }
      list.querySelectorAll('.avpick').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      box.dataset.tex = b.dataset.tex; box.dataset.url = '';
    });
    $('profFile').addEventListener('change', (e) => {
      const f = e.target.files?.[0]; if (!f || !f.type.startsWith('image/')) return;
      const url = URL.createObjectURL(f); up.style.backgroundImage = `url(${url})`; up.textContent = '';
      list.querySelectorAll('.avpick').forEach((x) => x.setAttribute('aria-pressed', String(x === up)));
      box.dataset.url = url; box.dataset.tex = '';
    });
    $('profName').addEventListener('input', checkName);
    $('profLater').addEventListener('click', () => box.close());
    $('profSave').addEventListener('click', () => {
      state.name = `nym-${$('profName').value.trim().toLowerCase()}`;
      state.avatar = box.dataset.url ? { url: box.dataset.url } : { tex: box.dataset.tex || 'neptune' };
      box.close();
      $('connectText').textContent = state.name; $('connectBtn').className = 'ghost';
      const who = $('connectBtn').querySelector('.who'); who.replaceWith(Object.assign(avatarFor(state.name), { className: 'who av' }));
      sys(`Registered ${state.name} on gno.land in one Adena transaction (sample: nothing was sent). It is your name in every room.`);
    });
  }
  $('profName').value = state.name ? state.name.slice(4) : '';
  checkName();
  box.showModal();
}
$('connectBtn').addEventListener('click', async () => {
  if (state.account) { openProfile(); return; }
  const t = $('connectText'), label0 = t.textContent;
  t.textContent = 'Connecting…';
  let addr = null;
  try {
    const a = window.adena;
    if (a) { await a.AddEstablish('gnoworld'); const r = await a.GetAccount(); addr = r?.data?.address ?? null; }
  } catch { addr = null; }
  state.account = addr ?? 'sample';
  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : 'alexis · sample';
  // the button changes once registration is over: your name after Register, your address after Later
  const showAccount = () => { if (state.name) return; t.textContent = short; $('connectBtn').querySelector('.who').hidden = false; $('connectBtn').className = 'ghost'; };
  sys(addr ? `Connected with Adena as ${short}.` : 'Adena did not answer in this page, so you are signed in with a sample account.');
  if (state.name) { showAccount(); return; }
  t.textContent = label0;
  $('profile').addEventListener('close', showAccount, { once: true });
  setTimeout(openProfile, 400);
});

// ---------- motion for the panels (GSAP) ----------
const G = !reduced && window.gsap ? window.gsap : null;
function countUp(el) {
  const target = Number(String(el.textContent).replace(/,/g, ''));
  if (!G || !Number.isFinite(target) || target === 0) return;
  const o = { v: 0 };
  G.to(o, { v: target, duration: 0.9, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString('en-US'); } });
}
const animateCard = () => {
  if (!G) return;
  G.fromTo('#card > *', { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, stagger: 0.045, ease: 'power3.out', overwrite: true });
  G.fromTo('#cardHist rect', { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 100%', duration: 0.6, stagger: 0.008, ease: 'power2.out' });
  const arc = $('gaugeArc'), gv = Number(arc.dataset.v || 0), o = { v: 0 };
  G.to(o, { v: gv, duration: 1.2, ease: 'power3.out', delay: 0.2, onUpdate: () => arc.setAttribute('stroke-dasharray', `${o.v.toFixed(1)} 100`) });
  G.fromTo('.porb', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9, ease: 'back.out(1.6)' });
  G.fromTo('.pulse .pill', { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.12, delay: 0.4 });
  countUp($('mA')); countUp($('mB'));
};
const animateBoard = () => { if (G) G.fromTo('.hubcard', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.025, ease: 'power3.out' }); };
const animateDetail = () => { if (G) G.fromTo('#boardDetail > *', { x: 16, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, stagger: 0.04, ease: 'power3.out' }); };
if (G) {
  G.from('.stat, #explored, #places, #chatList li, #quick, #lens, #guideBtn', { y: -12, opacity: 0, duration: 0.8, stagger: 0.06, ease: 'power3.out', delay: 0.3 });
  const line = document.querySelectorAll('#stats svg .line');
  if (line.length) { const L = 300; G.fromTo(line, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', delay: 0.6 }); }
  G.from('#activityBars rect', { scaleY: 0, transformOrigin: '50% 100%', duration: 0.8, stagger: 0.01, ease: 'power2.out', delay: 0.7 });
}

// ---------- hype: message comets, trending, surprise, share ----------
const bursts = [];
// a message lands: the light around the world swells softly and settles, no line drawn
function burst(pos, size, color = 0xfff1dc) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(pos); scene.add(m);
  bursts.push({ m, size, t: 0 });
}
const comets = [];
const cometMat = new THREE.SpriteMaterial({ map: glowTexture, color: 0xfff1dc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const TICKER = [
  ['TRENDING', 'DeFi +34% this hour', 'DeFi'], ['AMA', `Dev help · ${EVENT.title} ${eventLabel()}`, 'Dev help'], ['VOTE', 'GovDAO · proposal 15 closes in 2 h', 'GovDAO'],
  ['POT', 'BUBBLE · 72.9 GNOT waiting for the last boop', 'BUBBLE'], ['ON AIR', 'Broadcast Moon · 6 screens, curated', 'Broadcast Moon'], ['NEW', 'Night Owls was born near the frontier', 'Night Owls'],
];
function renderTicker() {
  const items = TICKER.slice(0, 6);
  const track = $('tickerTrack'); track.innerHTML = '';
  [...items, ...items].forEach(([k, t, where], i) => {
    const b = document.createElement('button'); b.type = 'button';
    if (i >= items.length) { b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
    const kk = document.createElement('b'); kk.textContent = k;
    b.append(kk, document.createTextNode(`  ${t}`));
    b.addEventListener('click', () => { const to = findPlace(where); if (to) go(to); });
    track.append(b);
  });
}
function openShare(b) {
  composer.render();
  let img = '';
  try { img = renderer.domElement.toDataURL('image/jpeg', 0.86); } catch { img = ''; }
  $('shareImg').src = img;
  $('shareTitle').textContent = b.kind === 'ad' ? b.text : b.name;
  const f = facts(b);
  $('shareSub').textContent = `${f.a[0]} ${f.a[1]} · ${f.kind.toLowerCase()} · on gnoworld`;
  const link = `${location.href.split('#')[0]}#${slug(b)}`;
  $('shareX').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${b.name} on gnoworld: ${f.a[0]} ${f.a[1]}`)}&url=${encodeURIComponent(link)}`;
  $('shareNote').textContent = 'The link opens this world directly. In this preview it points to the prototype.';
  shareReturn = document.activeElement;
  $('share').hidden = false;
  $('shareCopy').focus();
  $('shareCopy').onclick = () => { navigator.clipboard.writeText(link).then(() => { $('shareNote').textContent = 'Link copied.'; }, () => { $('shareNote').textContent = link; }); };
  $('shareChat').textContent = `Share in ${roomState.name}`;
  $('shareChat').onclick = () => {
    const thumb = document.createElement('img'); thumb.src = img; thumb.alt = ''; thumb.style.cssText = 'display: block; width: 100%; max-width: 280px; border-radius: 12px; margin-top: 8px';
    chatLine('mine', [msgParts(me(), 'FR', '')[0], document.createTextNode(`shared ${b.name}`), thumb]);
    closeShare();
  };
  if (G) G.fromTo('.sbox', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
}
let shareReturn = null;
function closeShare() { $('share').hidden = true; shareReturn?.focus?.(); }
$('shareClose').addEventListener('click', closeShare);
$('tickerPause').addEventListener('click', () => { const on = !$('ticker').classList.contains('paused'); $('ticker').classList.toggle('paused', on); $('tickerPause').setAttribute('aria-pressed', String(on)); $('tickerPause').setAttribute('aria-label', on ? 'Play the ticker' : 'Pause the ticker'); });
$('share').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const f = [...$('share').querySelectorAll('button, a[href]')];
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
});
$('share').addEventListener('click', (e) => { if (e.target.id === 'share') closeShare(); });
$('fShare').addEventListener('click', () => { if (state.focus) openShare(state.focus); });

// ---------- the loop ----------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camPrev = new THREE.Vector3();
let speed = 0;
const heading = new THREE.Vector3(), forward = new THREE.Vector3(), lastCam = new THREE.Vector3(), focusPoint = new THREE.Vector2();
let orbitK = 24;
// the 3D sleeps when nothing of it is visible (full-screen chat, List view): saves the battery
let sleeping = false;
const asleep = () => !state.flight && (document.body.dataset.chat === 'full' || state.lens === 'list');
function wake() { if (!sleeping || asleep()) return; sleeping = false; clock.getDelta(); requestAnimationFrame(frame); }
function frame() {
  if (asleep()) { sleeping = true; return; }
  const dt = Math.min(clock.getDelta(), 0.05);
  time.value += dt;
  const now = performance.now();
  const k = reduced ? 0 : 1;
  orbitK += ((state.view === 'focus' ? (isEco(state.focus) ? 6 : 1) : state.flight ? 1 : 24) - orbitK) * (1 - Math.exp(-dt / 1.2));

  // in a planet view, the world is alone with its moons and its satellite
  const solo = state.view === 'focus' && state.focus && !isEco(state.focus) ? state.focus : null;
  bodies.forEach((b) => {
    b.spinner.rotation.y += b.speed * dt * k * (b.kind === 'ad' ? 1 : orbitK);
    // a world of another system lives inside that system's group: keep the group, or the world vanishes with it
    b.obj.visible = !solo || b === solo || b.host === solo.name || b.name === solo.host || b.name === solo.system;
    if (b.kind === 'ad') { b.group3d.visible = state.focus === b || (state.view === 'focus' && b.host === state.focus?.name); b.bill.lookAt(camera.position); b.blink.visible = Math.sin(time.value * 4 + b.seed) > 0.55; }
    if (b.scan !== undefined && b.scan < 1) { b.scan = Math.min(1, b.scan + dt / 2.2); b.mesh.material.uniforms.uScan.value = b.scan; }
    if (b.mesh && b.kind !== 'ad') b.mesh.rotation.y += dt * 0.05 * k;
    if (b.clouds) b.clouds.rotation.y += dt * 0.065 * k;
    if (b.sats) b.sats.rotation.y += dt * 0.35 * k;
    // moons are rooms: they show on the world you are on, not across the whole map (except Earth's Moon)
    if (b.moons) b.moons.forEach((m) => { m.pivot.rotation.y += m.speed * dt * k; m.pivot.visible = b.earth || (state.view === 'focus' && state.focus === b); });
    if (b.ring) {
      b.obj.getWorldPosition(b.ring.userData.center);
      const u = b.mesh.material.uniforms;
      u.uCenter.value.copy(b.ring.userData.center);
      u.uRingN.value.set(0, 0, 1).transformDirection(b.ring.matrixWorld);
    }
    if (b.haloCenter) b.obj.getWorldPosition(b.haloCenter);
    if (b.beacon) b.beacon.scale.setScalar(12 + Math.sin(time.value * 2.5 + b.R) * 4);
    if (b.reveal !== undefined && b.reveal < 1) { b.reveal = Math.min(1, b.reveal + dt / 1.4); const s = b.radius * (1 - Math.pow(1 - b.reveal, 3)); b.mesh.scale.setScalar(Math.max(0.001, s)); }
  });
  bodies.belt.rotation.y += bodies.belt.userData.spin * dt * k;
  for (let i = bursts.length - 1; i >= 0; i--) {
    const x = bursts[i]; x.t += dt / 2.2;
    if (x.t >= 1) { scene.remove(x.m); x.m.material.dispose(); bursts.splice(i, 1); continue; }
    const t = x.t;
    x.m.scale.setScalar(x.size * (2.6 + t * 0.8));
    x.m.material.opacity = Math.sin(t * Math.PI) * 0.18;
  }
  for (let i = comets.length - 1; i >= 0; i--) {
    const c = comets[i]; c.t += dt / 2.6;
    if (c.t >= 1) { c.heads.forEach((sp) => scene.remove(sp)); if (state.view !== 'focus') burst(worldOf(c.to), c.to.radius * 0.6); comets.splice(i, 1); continue; }
    c.heads.forEach((sp, j) => { sp.visible = state.view !== 'focus'; sp.position.copy(c.curve.getPoint(Math.max(0, c.t - j * 0.018))); });
  }
  pingFrame(time.value);
  pots.forEach((p) => { p.pivot.rotation.y += p.speed * dt * k; p.m.position.y = Math.sin(time.value * 0.8 + p.phase) * 0.6 * k; });

  comet.t += dt * k;
  {
    const cyc = (comet.t % 40) / 40, a = cyc * Math.PI * 2;
    const head = tmp.set(Math.cos(a) * 420 - 160, Math.sin(a * 0.5) * 40, Math.sin(a) * 130);
    const away = tmp2.copy(head).normalize();
    for (let i = 0; i < comet.n; i++) comet.pos.set([head.x + away.x * i * 0.9, head.y + away.y * i * 0.9, head.z + away.z * i * 0.9], i * 3);
    comet.pts.geometry.attributes.position.needsUpdate = true;
  }

  if (state.flight) {
    const f = state.flight, t = Math.min(1, (now - f.start) / f.dur), e = ease(t), g = f.goal();
    controls.target.lerpVectors(f.t0, g.target, ease(Math.min(1, t * 1.25)));
    const ctrl = v1.copy(f.from).add(g.cam).multiplyScalar(0.5).addScaledVector(up, f.lift);
    camera.position.set(0, 0, 0).addScaledVector(f.from, (1 - e) * (1 - e)).addScaledVector(ctrl, 2 * (1 - e) * e).addScaledVector(g.cam, e * e);
    camera.lookAt(controls.target);
    if (!reduced) { camera.fov = 50 + 5 * Math.sin(Math.PI * t); camera.updateProjectionMatrix(); }
    $('fDist').textContent = `${(camera.position.distanceTo(g.cam) / 40).toFixed(2)} AU`;
    $('fSpeed').textContent = `${Math.round((camera.position.distanceTo(camPrev) / Math.max(dt, 1e-3)) * 9.7).toLocaleString('en-US')} km/s`;
    $('fEta').textContent = `${(((1 - t) * f.dur) / 1000).toFixed(1)} s`;
    $('fProg').style.width = `${(t * 100).toFixed(1)}%`;
    $('fTitle').textContent = t < 0.15 ? 'Course plotted · leaving orbit' : t < 0.85 ? 'In transit' : 'Entering orbit';
    if (!f.near && t >= 0.68) { f.near = true; f.onNear?.(); }
    if (t >= 1) { state.flight = null; controls.enabled = true; controls._sphericalDelta?.set(0, 0, 0); controls._panOffset?.set(0, 0, 0); if ('_scale' in controls) controls._scale = 1; controls.autoRotateSpeed = 0; camera.fov = 50; camera.updateProjectionMatrix(); setTimeout(() => { if (!state.flight) $('flight').hidden = true; }, 700); f.onArrive?.(); }
  } else if (state.focus) {
    worldOf(state.focus, tmp);
    tmp2.subVectors(tmp, state.last);
    camera.position.add(tmp2);
    controls.target.add(tmp2);
    state.last.copy(tmp);
  }
  controls.autoRotate = !reduced && !state.flight && state.lens !== 'map';
  controls.autoRotateSpeed += (0.18 - controls.autoRotateSpeed) * (1 - Math.exp(-dt / 2.5));
  if (!state.flight) controls.update();

  const moved = camPrev.distanceTo(camera.position);
  camPrev.copy(camera.position);
  const want = state.flight ? Math.min(2, moved / Math.max(0.5, dt * 60)) : 0;
  speed += (want - speed) * (want < speed ? 0.25 : 0.1);
  if (moved > 1e-4) {
    heading.subVectors(camera.position, lastCam).normalize();
    camera.getWorldDirection(forward);
    const ahead = v2.copy(camera.position).addScaledVector(heading, 100).project(camera);
    const inFront = heading.dot(forward) > 0.2 && ahead.z < 1;
    motion.uniforms.uCenter.value.lerp(focusPoint.set(inFront ? (ahead.x + 1) / 2 : 0.5, inFront ? (ahead.y + 1) / 2 : 0.5), 0.2);
  }
  lastCam.copy(camera.position);
  const blur = Math.min(1, Math.max(0, (speed - 0.25) / 1.3));
  motion.uniforms.uStrength.value = reduced ? 0 : 0.5 * blur * blur * (3 - 2 * blur);
  motion.enabled = motion.uniforms.uStrength.value > 0.01;

  for (let i = 0; i < dust.n; i++) {
    for (let a = 0; a < 3; a++) {
      const c = camera.position.getComponent(a);
      let d = dust.pos[i * 3 + a] - c;
      if (d > 30) d -= 60; else if (d < -30) d += 60;
      dust.pos[i * 3 + a] = c + d;
    }
  }
  dust.pts.geometry.attributes.position.needsUpdate = true;
  dust.pts.material.opacity = state.lens === 'map' || state.view === 'focus' ? 0 : 0.3;

  const w = innerWidth, h = innerHeight;
  const css = getComputedStyle(document.documentElement);
  const leftEdge = state.view === 'focus' && w > 900 ? textRight + 16 : 0, rightEdge = w > 900 ? (document.body.dataset.chat === 'open' ? 428 : 150) : 0, topEdge = 92;
  const ease1 = 1 - Math.exp(-dt / 1.1);
  bloom.strength += ((state.view === 'focus' ? 0.1 : 0.75) - bloom.strength) * ease1;
  sunGain.value += ((state.view === 'focus' && state.focus?.kind !== 'system' ? 0.45 : 1) - sunGain.value) * ease1;
  sunGlows.forEach((g) => { g.material.opacity = g.userData.base * (0.05 + 0.95 * (sunGain.value - 0.45) / 0.55); });
  renderer.toneMappingExposure += ((state.view === 'focus' ? 0.92 : 1.05) - renderer.toneMappingExposure) * ease1;
  if (state.view === 'focus' || offK.v > 0) {
    if (w <= 900) {
      // phones: the world fits in the space above the sheet (which starts at 46% of the height)
      const top = 70, bottom = h * 0.46 - 12, fit = Math.min(w - 40, bottom - top) / (2 * lastPr0 * fitReach(state.focus));
      camera.zoom = 1 + (Math.min(1, fit) - 1) * offK.v;
      camera.setViewOffset(w, h, 0, -((top + bottom) / 2 - h / 2) * offK.v, w, h);
    }
    else {
      // the planet fits between the text column and the chat (or the rail), with air on the text side
      const left = textRight - 40, reach = fitReach(state.focus);
      fitRight += (w - (document.body.dataset.chat === 'open' ? chatW() + 36 : 152) - fitRight) * (1 - Math.exp(-dt / 0.35));
      // fit inside the frame both ways, centred on it (the frame starts under the header)
      const top = 98 + 8, bottom = h - 24 - 36;
      const fit = Math.min(fitRight - left, bottom - top) / (2 * lastPr0 * reach);
      camera.zoom = 1 + (Math.min(1, fit) - 1) * offK.v;
      camera.setViewOffset(w, h, -((left + fitRight) / 2 - w / 2) * offK.v, -((top + bottom) / 2 - h / 2) * offK.v, w, h);
    }
  }
  statusRing.visible = !!ringData && state.view === 'focus' && !!state.focus && w > 900;
  $('fRingLabel').style.visibility = statusRing.visible ? '' : 'hidden';
  if (statusRing.visible) {
    const b = state.focus, R = b.radius * (b.earth ? 1.03 : 1), m = ringData();
    worldOf(b, statusRing.position);
    statusRing.quaternion.copy(camera.quaternion);
    const dd = camera.position.distanceTo(statusRing.position), Rs = R * dd / Math.sqrt(Math.max(dd * dd - R * R, 1e-6));
    statusRing.scale.setScalar((Rs * 1.07) / 0.9);
    ringU.uProg.value += (Math.max(0, Math.min(1, m.prog)) - ringU.uProg.value) * (1 - Math.exp(-dt / 0.45));
    ringU.uTick.value = m.tick ?? -1;
    ringU.uHot.value += ((m.hot ? 1 : 0) - ringU.uHot.value) * (1 - Math.exp(-dt / 0.6));
    const lab = $('fRingLabel');
    if (m.text !== ringText) { ringText = m.text; lab.textContent = m.text; lab.classList.toggle('hot', !!m.hot); }
    v1.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(-Rs * 1.16).add(statusRing.position).project(camera);
    lab.style.transform = `translate(${((v1.x + 1) / 2) * w}px, ${Math.min(((1 - v1.y) / 2) * h, h - 24 - 46)}px) translate(-50%, 6px)`;
    lab.style.opacity = String(ringU.uA.value);
  }
  platePass.enabled = w > 900 && plateU.uAlpha.value > 0.001;
  film.uniforms.uPlateA.value = platePass.enabled ? plateU.uAlpha.value : 0;
  if (platePass.enabled) {
    plateU.uRes.value.set(renderer.domElement.width, renderer.domElement.height, renderer.getPixelRatio());
    untone(panelLinear, renderer.toneMappingExposure, plateU.uColor.value);
    const R = plateU.uRect.value;
    film.uniforms.uPlate.value.set(R.x / w, 1 - R.w / h, R.z / w, 1 - R.y / h);
    film.uniforms.uMelt.value = 110 / w;
  }
  if (state.view === 'focus' && state.focus && fRect) {
    worldOf(state.focus, tmp);
    const R = state.focus.radius;
    const dist = camera.position.distanceTo(tmp);
    if (!state.flight && dist > R * (isEco(state.focus) ? fitReach(state.focus) * 5 : 16)) { exitFocus(); showCard(state.focus); }
    else {
      const c = tmp.clone().project(camera);
      v2.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(R).add(tmp).project(camera);
      const px = ((c.x + 1) / 2) * w, py = ((1 - c.y) / 2) * h, pr = Math.hypot((((v2.x + 1) / 2) * w) - px, (((1 - v2.y) / 2) * h) - py);
      fPlate.style.setProperty('--px', `${px - fRect.left}px`);
      fPlate.style.setProperty('--py', `${py - fRect.top}px`);
      fPlate.style.setProperty('--pr', `${pr * (state.focus.kind === 'system' ? fitReach(state.focus) : state.focus.earth ? 1.05 : 1.04)}px`);
      lastPr0 = pr / camera.zoom;
      tuckEls.forEach((el) => {
        const r = el.getBoundingClientRect();
        const cx = Math.max(r.left, Math.min(px, r.right)), cy = Math.max(r.top, Math.min(py, r.bottom));
        el.classList.toggle('tucked', Math.hypot(cx - px, cy - py) < pr * 1.02);
      });
      stations.forEach((st) => {
        const wpos = state.focus.mesh.localToWorld(v1.copy(st.dir).multiplyScalar(1.004));
        const n = tmp2.copy(wpos).sub(tmp).normalize();
        const facing = n.dot(v2.copy(camera.position).sub(wpos).normalize());
        st.el.hidden = facing < 0.25;
        if (st.el.hidden) return;
        wpos.project(camera);
        st.el.style.transform = `translate(${((wpos.x + 1) / 2) * w}px, ${((1 - wpos.y) / 2) * h}px)`;
        st.el.style.opacity = String(Math.min(1, (facing - 0.25) * 3));
      });
    }
  }
  const cand = [], lod = state.view !== 'focus' && state.lens === 'cosmos' && !state.flight;
  const keyLabel = (b) => b.group === 'topic' || b.earth || b.name === 'GovDAO' || b.kind === 'system' || hidden(b) || hotSet.has(b) || b === hoverBody || state.followed.has(b.name) || b.name === EVENT.place || b.born || friendsAt(b).length > 0;
  bodies.forEach((b) => {
    worldOf(b, tmp);
    tmp2.copy(tmp).addScaledVector(up, b.kind === 'ad' ? 3.4 : b.radius * 1.08);
    tmp2.project(camera);
    const dist = camera.position.distanceTo(tmp);
    const near = b.kind === 'system' || (b.kind === 'ad' ? dist < 60 : b.remote ? dist < 260 : dist < 700);
    const eco = inEco(b);
    b.label.classList.toggle('sys', eco);
    const show = !(b.kind === 'ad' && !b.group3d.visible) && state.lens !== 'list' && (state.view !== 'focus' || eco) && tmp2.z < 1 && Math.abs(tmp2.x) < 1.05 && Math.abs(tmp2.y) < 1.05 && (eco || b === state.focus || (state.lens === 'map' ? b.kind !== 'ad' : near));
    if (!show || (lod && !keyLabel(b) && dist > 170)) { b.label.hidden = true; return; }
    cand.push({ b, x: ((tmp2.x + 1) / 2) * w, y: ((1 - tmp2.y) / 2) * h, dist, prio: b === state.focus ? 1e9 : b.earth ? 1e8 : b.kind === 'ad' ? 0 : (b.here ?? 1) + 1000 / Math.max(10, dist) });
  });
  cand.sort((a, c) => c.prio - a.prio);
  const placed = heroRect && state.view !== 'focus' && document.body.dataset.focus !== 'on' && state.lens !== 'list' ? [[heroRect.left, heroRect.top, heroRect.right, heroRect.bottom]] : [];
  cand.forEach(({ b, x, y, dist }) => {
    const r = [x - 24, y - 66, x - 4 + (b.labelW ?? 120), y - 18];
    const free = r[0] > leftEdge && r[2] < w - rightEdge && r[1] > topEdge && r[3] < h - 44 && placed.every((q) => r[2] < q[0] || r[0] > q[2] || r[3] < q[1] || r[1] > q[3]);
    b.label.hidden = !free && b !== state.focus;
    if (b.label.hidden) return;
    placed.push(r);
    b.label.classList.toggle('on', b === state.focus);
    b.label.style.transform = `translate(${x - 14}px, ${y}px) translateY(-100%)`;
    b.label.style.opacity = String(b === state.focus || inEco(b) ? 1 : Math.max(0.45, Math.min(1, 1.7 - dist / 520)));
  });

  ZONES.forEach((z) => {
    tmp.copy(z.p).project(camera);
    const d = camera.position.distanceTo(z.p);
    const show = state.lens !== 'list' && !state.focus && (state.lens === 'map' || z.el.firstChild?.textContent === 'Stations') && tmp.z < 1 && Math.abs(tmp.x) < 0.95 && Math.abs(tmp.y) < 0.95 && d < 2600;
    const zx = ((tmp.x + 1) / 2) * w, zy = ((1 - tmp.y) / 2) * h;
    z.el.hidden = !show || zx + 130 > w - rightEdge || placed.some((q) => !(zx + 120 < q[0] || zx - 120 > q[2] || zy + 24 < q[1] || zy - 24 > q[3]));
    if (!z.el.hidden) { z.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -50%)`; z.el.style.opacity = String(Math.min(1, Math.max(0.25, 1.4 - d / 1600))); }
  });
  const edge = new Map();
  if (state.view === 'focus' && state.focus?.mesh) {
    const camDir = tmp.copy(camera.position);
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const x = bubbles[i];
      if (now - x.born > RULES.lifeMs || x.host !== state.focus) { x.el.remove(); bubbles.splice(i, 1); continue; }
      const world = x.host.mesh.localToWorld(latLon(x.lat, x.lon).multiplyScalar(1.01));
      const normal = tmp2.copy(world).sub(worldOf(x.host, v2)).normalize();
      const facing = normal.dot(v1.copy(camDir).sub(world).normalize());
      if (facing < 0.32) { x.el.hidden = true; if (x.host.earth) edge.set(COUNTRIES[x.cc][0], (edge.get(COUNTRIES[x.cc][0]) || 0) + 1); continue; }
      world.project(camera);
      x.el.hidden = false;
      // a bubble opens to the left when the docked chat would cover it
      const px = ((world.x + 1) / 2) * w, limit = document.body.dataset.chat === 'open' && w > 900 ? w - 412 : w - 16;
      x.el.style.transform = `translate(${px + 238 > limit ? px - 238 : px + 6}px, ${((1 - world.y) / 2) * h - 62}px)`;
    }
    if (state.focus === earth) HOT.forEach((x) => {
      const [, lat, lon] = COUNTRIES[x.cc];
      const world = earth.mesh.localToWorld(latLon(lat, lon).multiplyScalar(1.005));
      const normal = tmp2.copy(world).sub(worldOf(earth, v2)).normalize();
      x.el.hidden = normal.dot(v1.copy(camera.position).sub(world).normalize()) < 0.38;
      if (x.el.hidden) return;
      world.project(camera);
      x.el.style.transform = `translate(${((world.x + 1) / 2) * w}px, ${((1 - world.y) / 2) * h}px)`;
    });
    if (state.focus !== earth) HOT.forEach((x) => { x.el.hidden = true; });
  } else {
    if (bubbles.length) { bubbles.forEach((x) => x.el.remove()); bubbles.length = 0; }
    HOT.forEach((x) => { x.el.hidden = true; });
  }
  const edgeEl = $('edge');
  const edgeText = [...edge].map(([c, n]) => `${c} · ${n}`).join('|');
  if (edgeEl.dataset.v !== edgeText) {
    edgeEl.dataset.v = edgeText;
    edgeEl.innerHTML = '';
    edge.forEach((n, c) => { const s = document.createElement('span'); s.className = 'glass'; s.textContent = `${c} · ${n}, far side`; edgeEl.append(s); });
  }

  featureFrame(dt);
  embassyFrame(w, h);
  if (focusPass.enabled) { camera.updateMatrixWorld(); focusCam.copy(camera, false); focusCam.layers.set(FOCUS_LAYER); }
  composer.render();
  if (occluder.parent && state.view === 'focus') {
    const cut = Math.round(w - 24 - (document.body.dataset.chat === 'open' ? chatW() : 120));
    if (cut !== overlayCut) { overlayCut = cut; const m = `linear-gradient(90deg, #000 ${cut - 110}px, transparent ${cut - 12}px)`; $('adOverlay').style.maskImage = m; $('adOverlay').style.webkitMaskImage = m; }
    camera.layers.set(1); overlay.render(scene, camera); camera.layers.set(0); overlayOn = true;
  }
  else if (overlayOn) { overlay.clear(); overlayOn = false; }
  requestAnimationFrame(frame);
}

// ---------- the static tiles (sample figures, no network) ----------
{
  const market = (key, seed, start, digits) => {
    const r = rng(seed), series = [];
    let p = start;
    for (let i = 0; i < 40; i++) { p *= 1 + (r() - 0.47) * 0.04; series.push(p); }
    const lo = Math.min(...series), hi = Math.max(...series);
    const line = series.map((v, i) => `${i ? 'L' : 'M'}${((i / 39) * 100).toFixed(1)},${(28 - ((v - lo) / (hi - lo)) * 24).toFixed(1)}`).join('');
    const last = series[39], change = (last / series[0] - 1) * 100, col = change >= 0 ? 'var(--action)' : 'var(--down)';
    $(`${key}Spark`).querySelector('.line').setAttribute('d', line);
    $(`${key}Spark`).querySelector('.line').style.stroke = col;
    $(`${key}Spark`).querySelector('.area').setAttribute('d', `${line}L100,30L0,30Z`);
    $(`${key}Price`).textContent = last.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    $(`${key}Change`).textContent = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% · 24 h`;
    $(`${key}Change`).style.color = col;
  };
  market('gnot', 2026, 0.41, 3); market('atom', 7, 0.62, 3); market('btc', 21, 64000, 0);
  const bars = $('activityBars'), rb = rng(77);
  for (let i = 0; i < 60; i++) {
    const v = 0.15 + 0.85 * Math.pow(Math.abs(Math.sin(i / 9)), 1.3) * (0.6 + rb() * 0.4);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(i * (100 / 60))); rect.setAttribute('width', '0.7'); rect.setAttribute('y', String(26 - v * 26)); rect.setAttribute('height', String(v * 26));
    rect.setAttribute('fill', i === 59 ? '#F2EFEA' : 'rgba(242, 239, 234, 0.42)');
    bars.append(rect);
  }
  let height = 1203881;
  setInterval(() => { height += 1; $('blockHeight').textContent = height.toLocaleString('en-US'); }, 2000);
}

// ---------- the light chrome: nav, hero, rail, drawers ----------
$('hnavActs').append($('passBtn'), $('bellBtn'), $('connectBtn'));
$('heroStats').append($('stats'));
$('hFind').addEventListener('click', () => { document.body.dataset.drawer = 'left'; syncInert(); leftView('places'); $('search').focus(); $('search').select(); });
addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('hFind').click(); } });
$('hGuide').addEventListener('click', () => setGuide());
$('hChat').addEventListener('click', () => chatMode(document.body.dataset.chat ? '' : 'open'));
$('hOpenChat').addEventListener('click', () => { setLens('earth'); openChat(true); });
$('mChat').addEventListener('click', () => chatMode('open'));
addEventListener('keydown', (e) => {
  if (!e.altKey || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea')) return;
  const k = { KeyE: 'e', KeyU: 'u', KeyL: 'l', KeyT: 't', KeyC: 'c' }[e.code];
  if (!k) return;
  e.preventDefault();
  if (k === 'e') setLens('earth'); else if (k === 'u') setLens('cosmos'); else if (k === 'l') setLens('list'); else if (k === 't') setLens(state.lens === 'map' ? 'cosmos' : 'map'); else if (k === 'c') chatMode(document.body.dataset.chat ? '' : 'open');
});
$('hExplore').addEventListener('click', () => {
  if (eventPhase() === 'live' || (eventPhase() === 'soon' && EVENT.at - Date.now() < 30 * 60000)) { goPlace(EVENT.place); flash(`AMA ${eventLabel()}`, `${EVENT.place} · ${EVENT.title}`); return; }
  const next = expedition.find((x) => !log.today[x.name]);
  if (!next) { openLog(); return; }
  go(next);
  flash("Today's expedition", `${expedition.filter((x) => log.today[x.name]).length} of 3 · next stop: ${next.name}`, ['Passport', openLog]);
});
$('leftClose').addEventListener('click', () => { document.body.dataset.drawer = ''; if (!$('guide').hidden) leftView(state.focus ? 'card' : 'places'); });
$('placeList').addEventListener('click', () => { document.body.dataset.drawer = ''; });
let railTab = 'worlds';
document.querySelectorAll('#hRailTabs button').forEach((b) => b.addEventListener('click', () => { railTab = b.dataset.tab; renderHRail(); if (G) G.fromTo('#hRailList button', { x: 16, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, stagger: 0.04, ease: 'power3.out' }); }));
function renderHRail() {
  const list = $('hRailList'); list.innerHTML = '';
  const groups = railTab === 'groups';
  document.querySelectorAll('#hRailTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === railTab)));
  const all = bodies.filter((x) => (groups ? x.group === 'topic' || x.kind === 'system' || x.kind === 'station' : !x.remote && x.kind !== 'ad' && x.kind !== 'system' && x.kind !== 'station' && x.group !== 'topic')).sort((a, c) => (state.followed.has(c.name) - state.followed.has(a.name)) || (c.here ?? 0) - (a.here ?? 0));
  [all].forEach((xs) => {
  xs.forEach((x) => {
    const btn = document.createElement('button'); btn.type = 'button';
    const t = hidden(x) ? Object.assign(document.createElement('span'), { className: 'thumbp unknown' }) : thumbFor(x);
    const sm = document.createElement('small'); sm.textContent = nameOf(x);
    btn.append(t, sm); btn.setAttribute('aria-label', `Fly to ${nameOf(x)}`);
    btn.addEventListener('click', () => go(x));
    list.append(btn);
  });
  });
}
// dock magnification on the planet rails
function dock(list) {
  // each planet eases toward its target size every frame: smooth when the pointer enters or leaves, no lag while it moves
  let raf = 0, py = null;
  const step = () => {
    let moving = false;
    list.querySelectorAll('button').forEach((b) => {
      const th = b.querySelector('.thumbp'); if (!th) return;
      let target = 1;
      if (py !== null) { const r = b.getBoundingClientRect(), d = Math.abs(py - (r.top + r.height / 2)); target = d > 230 ? 1 : 1 + 0.55 * ((Math.cos((d / 230) * Math.PI) + 1) / 2); }
      const cur = th._mag ?? 1, next = reduced ? target : cur + (target - cur) * 0.2;
      th._mag = Math.abs(next - target) < 0.002 ? target : next;
      if (th._mag !== target) moving = true;
      th.style.setProperty('--mag', th._mag.toFixed(4));
    });
    raf = moving ? requestAnimationFrame(step) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
  list.addEventListener('pointermove', (e) => { py = e.clientY; kick(); });
  list.addEventListener('pointerleave', () => { py = null; kick(); });
}
dock($('hRailList')); dock($('fRailList'));
buildEmbassies();
renderHRail();
paintOrbits();
updateHot(); setInterval(updateHot, 6000);
if (innerWidth <= 900) $('connectText').textContent = 'Connect';
let heroRect = null;
const measureHero = () => { heroRect = $('hero').getBoundingClientRect(); };
addEventListener('resize', measureHero);
document.fonts.ready.then(() => setTimeout(measureHero, 1400));
const [want, wantRoom] = decodeURIComponent(location.hash.slice(1)).split('/'), deepTarget = want && bodies.find((b) => slug(b) === want);
addEventListener('hashchange', () => { const [p, r] = decodeURIComponent(location.hash.slice(1)).split('/'), b = p && bodies.find((x) => slug(x) === p); if (b && b !== state.focus) goPlace(b.name, r ? `#${r}` : null); });
onLoaded = () => {
  setTimeout(birth, 70000);
  const tickEvent = () => {
    const b = bodies.find((x) => x.name === EVENT.place); if (b?.label) renderLabel(b);
    if (eventPhase() === 'live' && keep.get('gw.remind', 0) === EVENT.at && !EVENT.told) { EVENT.told = true; NOTES.unshift({ text: `${EVENT.title} is live`, where: EVENT.place, when: 'now', unread: true, kind: 'world', ic: 'event' }); updateBell(); flash('The AMA is live', `${EVENT.place} · voice lounge`, ['Join', () => goPlace(EVENT.place)]); }
  };
  setInterval(tickEvent, 30000);
  let lastLeft = 1e9;
  setInterval(() => {
    const left = 240 - ((Date.now() / 1000) % 240);
    if (left > lastLeft + 60) {
      const bub = bodies.find((x) => x.name === 'BUBBLE'), [w] = POOL[Math.floor(Date.now() / 240000) % POOL.length];
      const text = `The pot popped: ${w} got the last boop and wins 72.9 GNOT (sample). A new pot starts.`;
      toRoom(roomKey(bub, roomsFor(bub)[0][0]), text);
      if (state.view !== 'focus' && !reduced) burst(worldOf(bub), bub.radius * 2.2, 0xffd38a, 2);
      if (state.focus === bub) flash('The pot popped', `${w} got the last boop`);
    }
    lastLeft = left;
  }, 1000);
  // what you follow comes to the bell
  setInterval(() => { const f = [...state.followed].map((n) => findPlace(n)).filter(Boolean); if (!f.length) return; const b = f[Math.floor(Math.random() * f.length)]; NOTES.unshift({ text: `${3 + Math.floor(Math.random() * 12)} new messages in ${roomsFor(b)[0]?.[0] ?? b.name}`, where: b.name, when: 'now', unread: true, kind: 'world', ic: 'new' }); NOTES.length = Math.min(NOTES.length, 16); updateBell(); }, 50000);
  if (deepTarget) { setTimeout(() => goPlace(deepTarget.name, wantRoom ? `#${wantRoom}` : null), 300); return; }
  if (!G) return;
  countUp($('hOnline'));
  G.from('#hnav, #hero > *, #hRailList button, #hRailTabs', { y: 20, opacity: 0, duration: 0.9, stagger: 0.04, ease: 'power3.out', delay: 0.9 });
  // a slow arrival from deep space
  const end = camera.position.clone();
  camera.position.multiplyScalar(2.1).add(new THREE.Vector3(0, 60, 0));
  G.to(camera.position, { x: end.x, y: end.y, z: end.z, duration: 3.4, ease: 'expo.out', delay: 0.15 });
};
if (loaded) onLoaded();
if (innerWidth <= 760) $('places').dataset.collapsed = 'false';
renderList();
updateExplored();
renderTicker();
setRoom(null);
for (let i = 0; i < 3; i++) nextMessage();
SEED_MEDIA.Earth.forEach(([n, cc, t, url], i) => { chatLine('', msgParts(n, cc, t, { url, type: 'image/jpeg' })); if (i === 0) nextMessage(); });
sys('Type / for commands: /go, /rooms, /quiz, /poll, /dm, @jarvis.');
requestAnimationFrame(frame);
