import * as THREE from "three";
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

// -------------------- BASIC SCENE --------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(1.0, 1.0, 1.0, 1.0);
const GEO_SIZE = 200;
// const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
const camera = new THREE.OrthographicCamera(-GEO_SIZE / 2, GEO_SIZE / 2, GEO_SIZE / 2, -GEO_SIZE / 2, 0.1, 1000);
camera.position.set(0.0, 20, 0.0);
camera.lookAt(0.0, 0.0, 0.0);

const renderer = new THREE.WebGLRenderer({ antialias:true });
const container = document.getElementById("ocean-bg");
container.appendChild(renderer.domElement);

// function resize() {
//   const w = window.innerWidth;
//   const h = window.innerHeight;
//   renderer.setSize(w, h, false);
// }
// window.addEventListener("resize", resize);
// resize();

// function resizeCamera() {
//   const aspect = window.innerWidth / window.innerHeight;
//   const frustumHeight = GEO_SIZE;
//   const frustumWidth = frustumHeight * aspect;

//   camera.left   = -frustumWidth / 2;
//   camera.right  =  frustumWidth / 2;
//   camera.top    =  frustumHeight / 2;
//   camera.bottom = -frustumHeight / 2;
//   camera.updateProjectionMatrix();
// }
// window.addEventListener("resize", resizeCamera);
// resizeCamera();

// -------------------- FFT SETTINGS --------------------
const N = 512;
const SIZE = N;

// -------------------- GPU COMPUTE --------------------
const gpuCompute = new GPUComputationRenderer(SIZE, SIZE, renderer);
const loader = new THREE.TextureLoader();
const texture = loader.load( 'imgs/floor_tiles_bumpmap.png' );
texture.colorSpace = THREE.SRGBColorSpace;

const height0 = gpuCompute.createTexture();
const laplace0 = gpuCompute.createTexture();

// Fill spectrum (simple Phillips noise)
function fillSpectrum(tex) {
  const data = tex.image.data;
  for (let i=0;i<data.length;i+=4) {
    data[i]   = (Math.random()*2-1);
    data[i+1] = (Math.random()*2-1);
  }
}
fillSpectrum(height0);

// -------------------- TIME EVOLUTION SHADER --------------------
const spectrumShader = `
precision highp float;

uniform sampler2D tex;
uniform float time;
uniform vec2 res;

float hash(float n) { return fract(sin(n)*43758.5453); }

vec2 randDir(float i){
    const float pi_2 = 3.141592 / 2.0;
    float a = (hash(i)* 3.0 * pi_2) - pi_2;
    return vec2(cos(a), sin(a));
}

vec3 ProceduralWave(int i, vec2 pos){
    float fi = float(i);
    vec2 D = normalize(randDir(fi));
    float wavelength = mix(10.0, 200.0, hash(fi+10.0));
    float steepness  = mix(0.00001, 1.0 / 64.0, hash(fi+10.0));

    float k = 6.28318 / wavelength;
    float c = sqrt(9.8 / k);

    float phase = k * (dot(pos, D) - c * time * 0.0005 + hash(fi)*100.0);
    float a = steepness / k;

    return vec3(
        D.x * a * cos(phase),
        D.y * a * cos(phase),
        a * sin(phase)
    );
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 pos = (uv - 0.5) * 300.0;

  vec3 H = vec3(0.0);
  for(int i=0;i<64;i++){
      H += ProceduralWave(i, pos) / 16.0;
  }
  gl_FragColor = vec4(H / 1.0, 1.0);
}
`

const laplaceShader = `
precision highp float;

uniform sampler2D heightMap;
uniform vec2 res;

void main() {
    vec2 uv = gl_FragCoord.xy / res;
    float eps = 1.0 / res.x;

    float h  = texture2D(heightTex, uv).r;
    float hx = texture2D(heightTex, uv + vec2(eps,0)).r;
    float hy = texture2D(heightTex, uv + vec2(0,eps)).r;
    float hxm = texture2D(heightTex, uv - vec2(eps,0)).r;
    float hym = texture2D(heightTex, uv - vec2(0,eps)).r;

    float laplacian = hx + hxm + hy + hym - 4.0*h;

    // Optional: contour field baked here
    float contour = abs(fract(h*1.5) - 0.51);
    contour = smoothstep(0.4, 0.5, contour);

    // Pack both
    gl_FragColor = vec4(laplacian, contour, h, 1.0);
}
`;


const heightVar = gpuCompute.addVariable("heightTex", spectrumShader, height0);

gpuCompute.setVariableDependencies(heightVar, [heightVar]);

heightVar.material.uniforms.time = { value: 0.0 };
heightVar.material.uniforms.res = { value: new THREE.Vector2(SIZE, SIZE) };

const laplaceVar = gpuCompute.addVariable("laplaceTex", laplaceShader, laplace0);

gpuCompute.setVariableDependencies(laplaceVar, [heightVar]);
laplaceVar.material.uniforms.heightTex = { value: null };
laplaceVar.material.uniforms.res = { value: new THREE.Vector2(SIZE, SIZE) };

gpuCompute.init();

// -------------------- OCEAN MESH --------------------
let geo = new THREE.PlaneGeometry(GEO_SIZE + GEO_SIZE / 20,GEO_SIZE + GEO_SIZE / 20,N,N);

// function resizeOceanPlane() {
//   const aspect = window.innerWidth / window.innerHeight;
//   const size = GEO_SIZE;

//   const width = size * aspect;
//   const height = size;

//   geo = new THREE.PlaneGeometry(width, height, SIZE-1, SIZE-1);
// }

// window.addEventListener("resize", resizeOceanPlane);
// resizeOceanPlane();

const mat = new THREE.ShaderMaterial({
  uniforms:{
    heightTex:{value:null},
    laplaceTex:{value:null},
    lightDir:{value:new THREE.Vector3(-10,-30,60)},
    viewPos:{value:camera.position}
  },
  vertexShader:`
  uniform sampler2D heightTex;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vec3 h = texture2D(heightTex, uv).rgb * 1.0;
    vec3 pos = position;
    pos.y += h.z;
    vPos = (modelViewMatrix * vec4(pos,1)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1);
  }`,
  fragmentShader:`
  uniform vec3 lightDir;
  uniform vec3 viewPos;
  uniform vec2 res;
  uniform sampler2D laplaceTex;
  varying vec2 vUv;

  void main() {
    vec4 data = texture2D(laplaceTex, vUv);
    float laplacian = data.r;
    float contour   = data.g;

    float caustic = smoothstep(0.0, 0.0003, laplacian);

    vec3 base = vec3(1.0);
    vec3 highlight = vec3(0.2, 0.1, 0.0);

    vec3 col = base - caustic * highlight;
    col -= contour * 0.1;

    gl_FragColor = vec4(col,1.0);
}
`
});

const ocean = new THREE.Mesh(geo, mat);
ocean.rotation.x = -Math.PI/2;
scene.add(ocean);

mat.uniforms.res = { value: new THREE.Vector2(SIZE, SIZE) };
mat.uniforms.time = { value: 0.0 };

// -------------------- LOOP --------------------
function animate(t){
  requestAnimationFrame(animate);
  const time = t;

  heightVar.material.uniforms.time.value = time;

  gpuCompute.compute();
  
  const heightTex = gpuCompute.getCurrentRenderTarget(heightVar).texture;
  laplaceVar.material.uniforms.heightMap = heightTex
  const laplaceTex = gpuCompute.getCurrentRenderTarget(laplaceVar).texture;
  
  mat.uniforms.heightTex.value = heightTex;
  mat.uniforms.laplaceTex.value = laplaceTex;

  renderer.render(scene, camera);
}

animate();
