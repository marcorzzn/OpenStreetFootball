import * as THREE from 'three';
import {
  BALL_PROFILES,
  BallProfileId,
  getEffectivePitchDimensions,
  PITCH_CONFIGS,
  PitchId,
  TeamSize,
} from '../types/game';

export function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

// Shared 3-step cel-shading gradient texture (NearestFilter for graphic-novel comic bands)
let sharedToonGradientMap: THREE.DataTexture | null = null;
export function getToonGradientMap(): THREE.DataTexture {
  if (sharedToonGradientMap) return sharedToonGradientMap;
  const data = new Uint8Array([
    165, 165, 165, 255,
    222, 222, 222, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sharedToonGradientMap = tex;
  return tex;
}

const sharedOutlineMat = new THREE.MeshBasicMaterial({
  color: 0x09090b,
  side: THREE.BackSide,
});

const sharedEdgeLineMat = new THREE.LineBasicMaterial({
  color: 0x09090b,
});

export function createToonMaterial(
  color: number | string,
  map?: THREE.Texture,
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    map: map || null,
    gradientMap: getToonGradientMap(),
  });
}

/**
 * Adds a bold black comic-book outline around curved/organic meshes using an Inverted Hull (BackSide).
 */
export function addComicOutline(mesh: THREE.Mesh, scaleFactor = 1.055): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, sharedOutlineMat);
  outline.scale.setScalar(scaleFactor);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}

/**
 * Adds both crisp black edge lines and an inverted-hull silhouette border to architectural comic meshes.
 */
export function addBoxOutline(mesh: THREE.Mesh, hullScale = 1.025): void {
  const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, 25);
  const lines = new THREE.LineSegments(edgesGeo, sharedEdgeLineMat);
  mesh.add(lines);

  const hull = new THREE.Mesh(mesh.geometry, sharedOutlineMat);
  hull.scale.setScalar(hullScale);
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
}

/**
 * Creates a flat comic-book sign texture with bold typography and thick black frame.
 */
function createComicSignTexture(
  text: string,
  subtitle: string | null,
  bgColor: string,
  textColor: string,
  stripeColor?: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 192);

  if (stripeColor) {
    ctx.fillStyle = stripeColor;
    ctx.fillRect(16, 24, 480, 144);
  }

  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, 496, 176);

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 64px "Barlow Condensed", "Impact", sans-serif';
  ctx.fillText(text, 256, subtitle ? 76 : 98);

  if (subtitle) {
    ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(subtitle, 256, 138);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a 2D/3D yellow comic-book Starburst ("BAM!" / "POW!" kick impact star with black outline).
 */
export function createComicStarburstMesh(): THREE.Group {
  const group = new THREE.Group();

  const createStarShape = (outerR: number, innerR: number, points = 10) => {
    const shape = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i / (points * 2)) * Math.PI * 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  };

  const blackGeo = new THREE.ShapeGeometry(createStarShape(1.18, 0.52, 9));
  const blackMat = new THREE.MeshBasicMaterial({
    color: 0x09090b,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const blackStar = new THREE.Mesh(blackGeo, blackMat);
  blackStar.renderOrder = 10;
  group.add(blackStar);

  const yellowGeo = new THREE.ShapeGeometry(createStarShape(0.95, 0.38, 9));
  const yellowMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const yellowStar = new THREE.Mesh(yellowGeo, yellowMat);
  yellowStar.position.z = 0.01;
  yellowStar.renderOrder = 11;
  group.add(yellowStar);

  const coreGeo = new THREE.ShapeGeometry(createStarShape(0.45, 0.18, 9));
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfef9c3,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const coreStar = new THREE.Mesh(coreGeo, coreMat);
  coreStar.position.z = 0.02;
  coreStar.renderOrder = 12;
  group.add(coreStar);

  group.visible = false;
  return group;
}

export function createBallTexture(profileId: BallProfileId, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const profile = BALL_PROFILES[profileId];

  ctx.fillStyle = profile.primaryColor;
  ctx.fillRect(0, 0, 256, 256);

  if (profileId === 'supersantos') {
    // Classic orange Super Santos with crisp black meridians & equator
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 12;
    for (let i = 0; i < 4; i++) {
      const x = 32 + i * 64;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(256, 128);
    ctx.stroke();
  } else if (profileId === 'classico') {
    // Realistic Telstar pentagons + hex seams in graphic-novel ink
    ctx.fillStyle = '#09090b';
    const spots = [
      [64, 64],
      [192, 64],
      [128, 128],
      [64, 192],
      [192, 192],
    ];
    for (const [cx, cy] of spots) {
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(128, 128);
    ctx.lineTo(192, 64);
    ctx.moveTo(64, 192);
    ctx.lineTo(128, 128);
    ctx.lineTo(192, 192);
    ctx.stroke();
  } else if (profileId === 'bagnato') {
    // Mud/water-soaked leather panels
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 224, 224);
    ctx.fillStyle = '#09090b';
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.arc((i * 53) % 240, (i * 89) % 240, 14 + (i % 3) * 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Bucato: slashed patch and seam gash
    ctx.fillStyle = '#09090b';
    ctx.fillRect(85, 108, 86, 20);
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(30, 40);
    ctx.lineTo(220, 210);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createPitchTexture(
  pitchId: PitchId,
  teamSize: TeamSize,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const cfg = PITCH_CONFIGS[pitchId];

  if (pitchId === 'spiaggia') {
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = cfg.groundColor;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle wind-rippled sand dunes in graphic-novel ink
    ctx.strokeStyle = 'rgba(120, 53, 15, 0.14)';
    ctx.lineWidth = 3;
    for (let y = 32; y < 256; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(128, y + 10, 256, y);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 4);
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  canvas.width = 1024;
  canvas.height = 680;
  const ctx = canvas.getContext('2d')!;
  const dims = getEffectivePitchDimensions(pitchId, teamSize);

  ctx.fillStyle = cfg.groundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (pitchId === 'stadio') {
    // Alternating mowed grass stripes for realistic stadium feel
    const stripes = 14;
    const stripeW = canvas.width / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#22c55e' : '#16a34a';
      ctx.fillRect(i * stripeW, 0, stripeW, canvas.height);
    }
  } else {
    // Realistic pavement / courtyard tile / clay joints in comic ink
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.11)';
    ctx.lineWidth = 3;
    for (let x = 64; x < canvas.width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 64; y < canvas.height; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  // Convert world meters to canvas pixels for exact penalty area & touchline alignment
  const marginX = 32;
  const marginZ = 32;
  const fieldPxW = canvas.width - marginX * 2;
  const fieldPxH = canvas.height - marginZ * 2;

  // Crisp graphic-novel pitch lines (white with dark comic border)
  const drawPitchLines = (strokeStyle: string, lineWidth: number) => {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;

    // Outer touchlines & goal lines
    ctx.strokeRect(marginX, marginZ, fieldPxW, fieldPxH);

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, marginZ);
    ctx.lineTo(canvas.width / 2, canvas.height - marginZ);
    ctx.stroke();

    // Center circle
    const centerR = Math.min(fieldPxW, fieldPxH) * 0.16;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, centerR, 0, Math.PI * 2);
    ctx.stroke();

    // Penalty boxes (scaled to match dims.boxDepth and dims.boxHalfW)
    const boxPxW = (dims.boxDepth / (dims.halfX * 2)) * fieldPxW;
    const boxPxH = ((dims.boxHalfW * 2) / (dims.halfZ * 2)) * fieldPxH;
    const boxTopY = (canvas.height - boxPxH) / 2;

    ctx.strokeRect(marginX, boxTopY, boxPxW, boxPxH);
    ctx.strokeRect(canvas.width - marginX - boxPxW, boxTopY, boxPxW, boxPxH);

    // 6-yard goal boxes
    const smallBoxW = boxPxW * 0.42;
    const smallBoxH = boxPxH * 0.54;
    const smallTopY = (canvas.height - smallBoxH) / 2;
    ctx.strokeRect(marginX, smallTopY, smallBoxW, smallBoxH);
    ctx.strokeRect(canvas.width - marginX - smallBoxW, smallTopY, smallBoxW, smallBoxH);

    // Penalty arcs ("D")
    ctx.beginPath();
    ctx.arc(marginX + boxPxW * 0.75, canvas.height / 2, boxPxH * 0.24, -0.65, 0.65);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(
      canvas.width - marginX - boxPxW * 0.75,
      canvas.height / 2,
      boxPxH * 0.24,
      Math.PI - 0.65,
      Math.PI + 0.65,
    );
    ctx.stroke();
  };

  // Draw black comic outline under white chalk lines
  drawPitchLines('#09090b', 14);
  drawPitchLines(cfg.lineColor, 8);

  // Penalty spots & center spot
  const boxPxW = (dims.boxDepth / (dims.halfX * 2)) * fieldPxW;
  const spots = [
    [canvas.width / 2, canvas.height / 2],
    [marginX + boxPxW * 0.72, canvas.height / 2],
    [canvas.width - marginX - boxPxW * 0.72, canvas.height / 2],
  ];
  spots.forEach(([sx, sy]) => {
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export interface PlayerRig {
  root: THREE.Group;
  upperBodyGroup: THREE.Group;
  legsGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  selectionRing: THREE.Mesh;
}

function createJerseyNumberTexture(
  jerseyHex: string,
  trimHex: string,
  number: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = jerseyHex;
  ctx.fillRect(0, 0, 256, 256);

  // Vertical graphic-novel sport stripe & collar trim
  ctx.fillStyle = trimHex;
  ctx.fillRect(0, 0, 256, 24);
  ctx.fillRect(0, 232, 256, 24);

  // Bold number on both back and chest of the cylinder UV
  ctx.font = '900 92px "Barlow Condensed", "Impact", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#09090b';
  ctx.fillStyle = '#ffffff';

  const numStr = String(number);
  ctx.strokeText(numStr, 64, 128);
  ctx.fillText(numStr, 64, 128);
  ctx.strokeText(numStr, 192, 128);
  ctx.fillText(numStr, 192, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a Realistic Proportioned Human Footballer in Graphic-Novel / Comic-Book Cel-Shaded style:
 * - Realistic athletic proportions, skin tone, hair style, facial features (eyes, eyebrows, nose, ears)
 * - Numbered football jersey with collar and sleeves, athletic shorts, team socks, football cleats
 * - Goalkeeper variant wears distinct GK kit + oversized padded Goalkeeper Gloves
 * - Every mesh has a crisp black comic-book outline
 */
export function createStreetPlayerModel(
  team: 'blue' | 'red',
  number: number,
  isControlled: boolean,
  isGoalkeeper = false,
): PlayerRig {
  const root = new THREE.Group();
  const upperBodyGroup = new THREE.Group();
  const legsGroup = new THREE.Group();

  // Skin & hair palette varied realistically by player number
  const skinPalette = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
  const hairPalette = [0x18181b, 0x451a03, 0x78350f, 0xd97706];
  const skinColor = skinPalette[Math.abs(number) % skinPalette.length];
  const hairColor = hairPalette[Math.abs(number * 3) % hairPalette.length];

  const jerseyHex = isGoalkeeper
    ? team === 'blue'
      ? '#84cc16' // Neon lime GK kit
      : '#f59e0b' // Amber gold GK kit
    : team === 'blue'
      ? '#0284c7' // Azzurri / Street Blue kit
      : '#e11d48'; // Crimson Red kit

  const trimHex = isControlled ? '#facc15' : '#ffffff';
  const shortsColor = isGoalkeeper
    ? 0x18181b
    : team === 'blue'
      ? 0x0f172a
      : 0x1e293b;
  const sockColor = isGoalkeeper
    ? team === 'blue'
      ? 0x84cc16
      : 0xf59e0b
    : team === 'blue'
      ? 0x38bdf8
      : 0xf43f5e;

  const skinMat = createToonMaterial(skinColor);
  const hairMat = createToonMaterial(hairColor);
  const jerseyTex = createJerseyNumberTexture(jerseyHex, trimHex, number);
  const jerseyMat = createToonMaterial(0xffffff, jerseyTex);
  const jerseyPlainMat = createToonMaterial(jerseyHex);
  const shortsMat = createToonMaterial(shortsColor);
  const sockMat = createToonMaterial(sockColor);
  const bootMat = createToonMaterial(isControlled ? 0xfacc15 : 0x18181b);
  const gloveMat = createToonMaterial(0xfef08a);
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x09090b });

  // 1. Tactical Selection Ring on Ground
  const ringGeo = new THREE.RingGeometry(0.46, 0.64, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isControlled ? 0xfacc15 : team === 'blue' ? 0x38bdf8 : 0xf43f5e,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const selectionRing = new THREE.Mesh(ringGeo, ringMat);
  selectionRing.position.y = 0.022;
  root.add(selectionRing);

  // Hard-Edge Graphic-Novel Ground Contact Shadow
  const shadowGeo = new THREE.CircleGeometry(0.48, 16);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x09090b,
    transparent: true,
    opacity: 0.45,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  // 2. Realistic Athletic Legs (Shorts thigh + Knee + Team Sock + Studded Football Boot)
  const makeLeg = (offsetX: number) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(offsetX, 0.82, 0);

    // Shorts leg cuff
    const thighShort = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.11, 0.28, 10), shortsMat);
    thighShort.position.y = -0.14;
    thighShort.castShadow = true;
    addComicOutline(thighShort, 1.09);
    legPivot.add(thighShort);

    // Exposed athletic knee/thigh skin
    const knee = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.088, 0.18, 10), skinMat);
    knee.position.y = -0.35;
    knee.castShadow = true;
    addComicOutline(knee, 1.1);
    legPivot.add(knee);

    // High football sock with shin-guard volume
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.075, 0.32, 10), sockMat);
    sock.position.y = -0.58;
    sock.castShadow = true;
    addComicOutline(sock, 1.1);
    legPivot.add(sock);

    // Realistic Football Cleat / Boot
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.34), bootMat);
    boot.position.set(0, -0.76, 0.06);
    boot.castShadow = true;
    addBoxOutline(boot, 1.06);
    legPivot.add(boot);

    return legPivot;
  };

  const leftLeg = makeLeg(-0.14);
  const rightLeg = makeLeg(0.14);
  legsGroup.add(leftLeg, rightLeg);
  root.add(legsGroup);

  // 3. Pelvis / Shorts Hip Block
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.22, 12), shortsMat);
  pelvis.scale.set(1.05, 1, 0.78);
  pelvis.position.y = 0.88;
  pelvis.castShadow = true;
  addComicOutline(pelvis, 1.07);
  upperBodyGroup.add(pelvis);

  // 4. Athletic V-Taper Torso with Numbered Jersey
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.21, 0.56, 12), jerseyMat);
  torso.scale.set(1.08, 1, 0.74);
  torso.position.y = 1.24;
  torso.castShadow = true;
  addComicOutline(torso, 1.07);
  upperBodyGroup.add(torso);

  // Collar + Neck
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.15, 0.08, 10),
    createToonMaterial(isControlled ? 0xfacc15 : 0xffffff),
  );
  collar.position.y = 1.53;
  addComicOutline(collar, 1.08);
  upperBodyGroup.add(collar);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.12, 10), skinMat);
  neck.position.y = 1.6;
  addComicOutline(neck, 1.1);
  upperBodyGroup.add(neck);

  // 5. Realistic Articulated Arms (Jersey Sleeve + Forearm + Hand / Goalkeeper Glove)
  const makeArm = (offsetX: number) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(offsetX, 1.46, 0);

    // Jersey short sleeve
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.24, 10), jerseyPlainMat);
    sleeve.position.y = -0.11;
    sleeve.castShadow = true;
    addComicOutline(sleeve, 1.1);
    armPivot.add(sleeve);

    // Forearm skin
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.28, 10), skinMat);
    forearm.position.y = -0.35;
    forearm.castShadow = true;
    addComicOutline(forearm, 1.12);
    armPivot.add(forearm);

    if (isGoalkeeper) {
      // Oversized Padded Goalkeeper Glove
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.16), gloveMat);
      glove.position.y = -0.54;
      addBoxOutline(glove, 1.08);
      armPivot.add(glove);
    } else {
      // Realistic closed/athletic hand
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.072, 8, 8), skinMat);
      hand.position.y = -0.52;
      addComicOutline(hand, 1.12);
      armPivot.add(hand);
    }

    return armPivot;
  };

  const leftArm = makeArm(-0.31);
  const rightArm = makeArm(0.31);
  upperBodyGroup.add(leftArm, rightArm);

  // 6. Realistic Human Head with Sculpted Hair, Nose, Ears, Brows & Eyes
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.77;

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), skinMat);
  cranium.scale.set(0.95, 1.08, 0.98);
  cranium.castShadow = true;
  addComicOutline(cranium, 1.08);
  headGroup.add(cranium);

  // Sculpted Hair Cap + Front Fringe
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat,
  );
  hairCap.position.y = 0.02;
  hairCap.rotation.x = -0.18;
  addComicOutline(hairCap, 1.07);
  headGroup.add(hairCap);

  // Athletic sweatband for controlled player or GK
  if (isControlled || isGoalkeeper) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.212, 0.212, 0.055, 14),
      createToonMaterial(isControlled ? 0xfacc15 : 0x84cc16),
    );
    band.position.y = 0.07;
    addComicOutline(band, 1.06);
    headGroup.add(band);
  }

  // Realistic Nose & Ears
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.08, 6), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.01, 0.21);
  headGroup.add(nose);

  [-0.2, 0.2].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), skinMat);
    ear.position.set(ex, -0.01, 0);
    headGroup.add(ear);
  });

  // Expressive Graphic-Novel Eyes, Pupils & Eyebrows on front (+Z)
  [-0.072, 0.072].forEach((ex, i) => {
    const sclera = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.032, 0.02), whiteMat);
    sclera.position.set(ex, 0.03, 0.195);
    headGroup.add(sclera);

    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.024), pupilMat);
    pupil.position.set(ex, 0.03, 0.2);
    headGroup.add(pupil);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.018, 0.024), hairMat);
    brow.position.set(ex, 0.062, 0.198);
    brow.rotation.z = i === 0 ? -0.12 : 0.12;
    headGroup.add(brow);
  });

  upperBodyGroup.add(headGroup);
  root.add(upperBodyGroup);

  return {
    root,
    upperBodyGroup,
    legsGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
    selectionRing,
  };
}

export interface DogRig {
  root: THREE.Group;
  legs: THREE.Mesh[];
  tail: THREE.Mesh;
  homeX: number;
  homeZ: number;
}

export interface SeagullRig {
  root: THREE.Group;
  leftWing: THREE.Mesh;
  rightWing: THREE.Mesh;
  homeX: number;
  homeY: number;
  homeZ: number;
}

export interface CourtyardEnvironmentRefs {
  group: THREE.Group;
  groundMat: THREE.MeshToonMaterial;
  windowGlassMesh: THREE.Mesh;
  shardsGroup: THREE.Group;
  carGroup: THREE.Group;
  carHeadlights: THREE.Mesh[];
  signoraBalconyGroup: THREE.Group;
  dogRig: DogRig;
  seagullRig: SeagullRig;
  goalPosts: THREE.Vector3[];
}

/**
 * Builds the Realistic Comic-Book / Graphic-Novel Environment scaled to the active pitch & teamSize:
 * - Distinct realistic dimensions (`dims.halfX`, `dims.halfZ`, `dims.goalHalfW`)
 * - 6 unique architectures: Cortile Condominiale, Asfalto di Strada, Gabbia Metallica, Campo Parrocchiale, Spiaggia Costiera, and Stadio Cittadino (11v11)
 */
export function buildCourtyardEnvironment(
  pitchId: PitchId,
  teamSize: TeamSize,
  maxAnisotropy: number,
): CourtyardEnvironmentRefs {
  const group = new THREE.Group();
  const pitchCfg = PITCH_CONFIGS[pitchId];
  const dims = getEffectivePitchDimensions(pitchId, teamSize);
  const isBeach = pitchId === 'spiaggia';
  const isStadium = pitchId === 'stadio';
  const isCage = pitchId === 'gabbia';

  const fieldLen = dims.halfX * 2 + 1.0;
  const fieldWid = dims.halfZ * 2 + 0.8;

  // 1. Field Surface scaled to exact effective dimensions
  const pitchTex = createPitchTexture(pitchId, teamSize, maxAnisotropy);
  const groundGeo = new THREE.PlaneGeometry(fieldLen, fieldWid);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = createToonMaterial(0xffffff, pitchTex);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  if (isBeach) {
    // Tape boundary lines on the sand
    const sandLineMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const addLine = (w: number, h: number, x: number, z: number) => {
      const g = new THREE.PlaneGeometry(w, h);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, sandLineMat);
      m.position.set(x, 0.015, z);
      group.add(m);
    };
    addLine(dims.halfX * 2, 0.16, 0, -dims.halfZ);
    addLine(dims.halfX * 2, 0.16, 0, dims.halfZ);
    addLine(0.16, dims.halfZ * 2, -dims.halfX, 0);
    addLine(0.16, dims.halfZ * 2, dims.halfX, 0);
    addLine(0.16, dims.halfZ * 2, 0, 0);
  }

  // 2. Outer Surrounding Apron
  const apronGeo = new THREE.PlaneGeometry(180, 150);
  apronGeo.rotateX(-Math.PI / 2);
  const apronMat = createToonMaterial(
    isBeach ? 0xf3d79b : isStadium ? 0x15803d : 0xd6d3d1,
  );
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.y = -0.03;
  apron.receiveShadow = true;
  group.add(apron);

  // 3. Distant Hills & Graphic-Novel Clouds on the Horizon
  const hillsData: Array<{ x: number; z: number; r: number; sy: number; color: number }> = [
    { x: -45, z: -dims.halfZ - 32, r: 22, sy: 0.65, color: 0x4ade80 },
    { x: -12, z: -dims.halfZ - 38, r: 26, sy: 0.62, color: 0x86efac },
    { x: 24, z: -dims.halfZ - 36, r: 24, sy: 0.6, color: 0x4ade80 },
    { x: 52, z: -dims.halfZ - 30, r: 28, sy: 0.66, color: 0xa78bfa },
  ];
  hillsData.forEach((h) => {
    const hillGeo = new THREE.SphereGeometry(h.r, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hillMesh = new THREE.Mesh(hillGeo, createToonMaterial(h.color));
    hillMesh.scale.set(1, h.sy, 0.75);
    hillMesh.position.set(h.x, -0.5, h.z);
    addComicOutline(hillMesh, 1.03);
    group.add(hillMesh);
  });

  const makeComicCloud = (cx: number, cy: number, cz: number, scale = 1.0) => {
    const cloudGroup = new THREE.Group();
    cloudGroup.position.set(cx, cy, cz);
    cloudGroup.scale.setScalar(scale);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const puffs: Array<[number, number, number, number, number]> = [
      [0, 0, 0, 2.8, 1.4],
      [-2.2, -0.15, 0.1, 1.9, 1.15],
      [2.2, -0.1, 0.1, 2.0, 1.2],
      [-0.9, 0.55, 0.05, 1.7, 1.2],
      [1.0, 0.45, 0.05, 1.6, 1.1],
    ];
    puffs.forEach(([px, py, pz, rx, ry]) => {
      const puffGeo = new THREE.SphereGeometry(1, 12, 10);
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.scale.set(rx, ry, 0.55);
      puff.position.set(px, py, pz);
      addComicOutline(puff, 1.1);
      cloudGroup.add(puff);
    });
    group.add(cloudGroup);
  };
  makeComicCloud(-16, 22, -dims.halfZ - 24, 1.2);
  makeComicCloud(18, 24, -dims.halfZ - 26, 1.0);
  makeComicCloud(-34, 20, -dims.halfZ - 14, 0.9);
  makeComicCloud(34, 21, -dims.halfZ - 12, 0.95);

  // 4. Perimeter Curbs & Trees
  const curbMat = createToonMaterial(isBeach ? 0xfbbf24 : isStadium ? 0xffffff : 0x78716c);
  const northCurb = new THREE.Mesh(
    new THREE.BoxGeometry(fieldLen + 0.8, isBeach ? 0.35 : 0.55, 0.5),
    curbMat,
  );
  northCurb.position.set(0, isBeach ? 0.175 : 0.275, -dims.halfZ - 0.45);
  addBoxOutline(northCurb, 1.02);
  group.add(northCurb);

  const southCurb = new THREE.Mesh(
    new THREE.BoxGeometry(fieldLen + 0.8, isBeach ? 0.35 : 0.55, 0.5),
    curbMat,
  );
  southCurb.position.set(0, isBeach ? 0.175 : 0.275, dims.halfZ + 0.45);
  addBoxOutline(southCurb, 1.02);
  group.add(southCurb);

  // If Gabbia Metallica: build tall graphic-novel steel wire cage enclosure around the pitch
  if (isCage) {
    const cageWireMat = new THREE.MeshBasicMaterial({
      color: 0x18181b,
      wireframe: true,
      transparent: true,
      opacity: 0.42,
    });
    const northFence = new THREE.Mesh(new THREE.PlaneGeometry(fieldLen, 4.8, 24, 6), cageWireMat);
    northFence.position.set(0, 2.4, -dims.halfZ - 0.45);
    const southFence = new THREE.Mesh(new THREE.PlaneGeometry(fieldLen, 4.8, 24, 6), cageWireMat);
    southFence.position.set(0, 2.4, dims.halfZ + 0.45);
    group.add(northFence, southFence);
  }

  // 5. Goalposts placed dynamically at ±dims.halfX, ±dims.goalHalfW
  const goalPosts: THREE.Vector3[] = [
    new THREE.Vector3(-dims.halfX, 0, -dims.goalHalfW),
    new THREE.Vector3(-dims.halfX, 0, dims.goalHalfW),
    new THREE.Vector3(dims.halfX, 0, -dims.goalHalfW),
    new THREE.Vector3(dims.halfX, 0, dims.goalHalfW),
  ];

  goalPosts.forEach((pos, idx) => {
    const postGroup = new THREE.Group();
    postGroup.position.copy(pos);

    if (pitchCfg.goalpostStyle === 'giubbotti') {
      const jacketColor = idx < 2 ? 0x38bdf8 : 0xf43f5e;
      const baseBag = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.55, 0.65),
        createToonMaterial(jacketColor),
      );
      baseBag.position.y = 0.275;
      baseBag.castShadow = true;
      addBoxOutline(baseBag, 1.06);
      postGroup.add(baseBag);

      const topJacket = new THREE.Mesh(
        new THREE.SphereGeometry(0.36, 10, 8),
        createToonMaterial(0xfacc15),
      );
      topJacket.scale.set(1, 0.72, 1);
      topJacket.position.y = 0.65;
      addComicOutline(topJacket, 1.1);
      postGroup.add(topJacket);

      const heightPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 2.4, 8),
        createToonMaterial(0xffffff),
      );
      heightPole.position.y = 1.2;
      addComicOutline(heightPole, 1.16);
      postGroup.add(heightPole);
    } else if (pitchCfg.goalpostStyle === 'pietre') {
      const barrelColor = idx < 2 ? 0x38bdf8 : 0xf43f5e;
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10),
        createToonMaterial(barrelColor),
      );
      barrel.position.y = 0.4;
      addComicOutline(barrel, 1.08);
      postGroup.add(barrel);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 2.4, 8),
        createToonMaterial(0xfacc15),
      );
      pole.position.y = 1.2;
      addComicOutline(pole, 1.16);
      postGroup.add(pole);
    } else if (pitchCfg.goalpostStyle === 'ciabatte') {
      const bucketColor = idx < 2 ? 0x38bdf8 : 0xf43f5e;
      const bucket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.35, 0.52, 8),
        createToonMaterial(bucketColor),
      );
      bucket.position.y = 0.26;
      addComicOutline(bucket, 1.09);
      postGroup.add(bucket);

      const bambooPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.065, 2.4, 6),
        createToonMaterial(0xf97316),
      );
      bambooPole.position.y = 1.2;
      addComicOutline(bambooPole, 1.16);
      postGroup.add(bambooPole);
    } else {
      // Regulation white/metallic goalposts for Stadio, Gabbia, and Terra
      const pipeMat = createToonMaterial(0xffffff);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.44, 12), pipeMat);
      pole.position.y = 1.22;
      addComicOutline(pole, 1.14);
      postGroup.add(pole);
    }

    group.add(postGroup);
  });

  // Goal Crossbars & Back Nets scaled to dims.goalHalfW * 2
  const goalWidth = dims.goalHalfW * 2;
  [-dims.halfX, dims.halfX].forEach((gx, idx) => {
    const frameMat = createToonMaterial(
      isStadium ? 0xffffff : idx === 0 ? 0x38bdf8 : 0xf43f5e,
    );
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, goalWidth + 0.16), frameMat);
    crossbar.position.set(gx, 2.4, 0);
    addBoxOutline(crossbar, 1.07);
    group.add(crossbar);

    const netMat = new THREE.MeshBasicMaterial({
      color: isStadium ? 0xf8fafc : 0x09090b,
      wireframe: true,
      transparent: true,
      opacity: 0.38,
    });
    const backNet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, goalWidth), netMat);
    backNet.position.set(gx + (gx < 0 ? -0.7 : 0.7), 1.2, 0);
    group.add(backNet);
  });

  // Shared interactive Gag refs
  const signoraBalconyGroup = new THREE.Group();
  const windowGlassMat = createToonMaterial(0x67e8f9);
  const windowGlassMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2), windowGlassMat);
  const shardsGroup = new THREE.Group();
  const carGroup = new THREE.Group();
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const hlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.34), headlightMat);
  const hlRight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.34), headlightMat);

  if (isBeach) {
    // SPIAGGIA COSTIERA
    const seaGeo = new THREE.PlaneGeometry(160, 48);
    seaGeo.rotateX(-Math.PI / 2);
    const seaPlane = new THREE.Mesh(seaGeo, createToonMaterial(0x0ea5e9));
    seaPlane.position.set(0, -0.015, -dims.halfZ - 24);
    group.add(seaPlane);

    const foamGeo = new THREE.PlaneGeometry(140, 1.1);
    foamGeo.rotateX(-Math.PI / 2);
    const foamMesh = new THREE.Mesh(foamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    foamMesh.position.set(0, 0.012, -dims.halfZ - 1.4);
    group.add(foamMesh);

    const cabinMats = [createToonMaterial(0xf472b6), createToonMaterial(0x2dd4bf)];
    [-7.5, 7.5].forEach((cx, idx) => {
      const beachCabin = new THREE.Group();
      beachCabin.position.set(cx, 0, -dims.halfZ - 2.6);
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.8, 2.2), cabinMats[idx]);
      box.position.y = 1.4;
      addBoxOutline(box, 1.04);
      beachCabin.add(box);
      const cabinRoof = new THREE.Mesh(
        new THREE.ConeGeometry(2.0, 1.0, 4),
        createToonMaterial(0x881337),
      );
      cabinRoof.rotation.y = Math.PI / 4;
      cabinRoof.position.y = 3.25;
      addComicOutline(cabinRoof, 1.06);
      beachCabin.add(cabinRoof);
      group.add(beachCabin);
    });

    const umbrellaColors = [0xfacc15, 0xf472b6, 0x4ade80, 0x38bdf8];
    [-14.0, -4.5, 4.5, 14.0].forEach((ux, i) => {
      const umbGroup = new THREE.Group();
      umbGroup.position.set(ux, 0, -dims.halfZ - 1.8);
      const uPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6),
        createToonMaterial(0xffffff),
      );
      uPole.position.y = 1.4;
      addComicOutline(uPole, 1.15);
      umbGroup.add(uPole);
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(2.0, 0.82, 8),
        createToonMaterial(umbrellaColors[i]),
      );
      canopy.position.y = 2.75;
      addComicOutline(canopy, 1.06);
      umbGroup.add(canopy);
      group.add(umbGroup);
    });
  } else if (isStadium) {
    // STADIO CITTADINO (Regulation Grass Arena for 7v7 / 11v11 with Grandstands, Floodlights & Dugouts)
    const standLen = fieldLen + 6;
    const standMat = createToonMaterial(0x334155);
    const seatRowBlue = createToonMaterial(0x0284c7);
    const seatRowRed = createToonMaterial(0xe11d48);

    // North & South Tiered Grandstands
    [-1, 1].forEach((dir) => {
      const standGroup = new THREE.Group();
      standGroup.position.set(0, 0, dir * (dims.halfZ + 4.8));
      for (let tier = 0; tier < 4; tier++) {
        const tierMesh = new THREE.Mesh(
          new THREE.BoxGeometry(standLen, 1.1, 1.6),
          tier % 2 === 0 ? standMat : dir < 0 ? seatRowBlue : seatRowRed,
        );
        tierMesh.position.set(0, 0.55 + tier * 1.05, dir * tier * 1.45);
        addBoxOutline(tierMesh, 1.02);
        standGroup.add(tierMesh);
      }
      // Stadium roof canopy
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(standLen + 1, 0.4, 7.5),
        createToonMaterial(0xf8fafc),
      );
      roof.position.set(0, 6.2, dir * 2.2);
      addBoxOutline(roof, 1.02);
      standGroup.add(roof);
      group.add(standGroup);
    });

    // Advertising LED-style Comic Boards along North touchline
    const banners = [
      { text: 'OPEN STREET FOOTBALL', bg: '#facc15', fg: '#09090b', x: -14 },
      { text: 'CALCIO VERO 11v11', bg: '#38bdf8', fg: '#09090b', x: 0 },
      { text: 'SUPER SANTOS CUP', bg: '#f43f5e', fg: '#ffffff', x: 14 },
    ];
    banners.forEach((b) => {
      const tex = createComicSignTexture(b.text, null, b.bg, b.fg);
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(10.5, 1.1, 0.25),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      board.position.set(b.x, 0.55, -dims.halfZ - 1.2);
      addBoxOutline(board, 1.04);
      group.add(board);
    });

    // 4 Towering Stadium Floodlight Pylons
    [
      [-dims.halfX - 4, -dims.halfZ - 4],
      [dims.halfX + 4, -dims.halfZ - 4],
      [-dims.halfX - 4, dims.halfZ + 4],
      [dims.halfX + 4, dims.halfZ + 4],
    ].forEach(([px, pz]) => {
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.42, 16, 8),
        createToonMaterial(0x475569),
      );
      pylon.position.set(px, 8, pz);
      addComicOutline(pylon, 1.06);
      const lightPanel = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.6, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xfef9c3 }),
      );
      lightPanel.position.set(px, 16.2, pz);
      lightPanel.lookAt(0, 0, 0);
      addBoxOutline(lightPanel, 1.05);
      group.add(pylon, lightPanel);
    });
  } else {
    // URBAN / COURTYARD / PARISH ARCHITECTURES (Cortile, Strada, Gabbia, Terra)
    const northZ = -dims.halfZ - 3.2;
    const southZ = dims.halfZ + 2.5;

    const yellowWallMat = createToonMaterial(0xfacc15);
    const pinkWallMat = createToonMaterial(0xf472b6);
    const maroonRoofMat = createToonMaterial(0x881337);
    const wheelMat = createToonMaterial(0x18181b);

    // West Apartment / Storefront Wing
    const yellowWing = new THREE.Mesh(new THREE.BoxGeometry(16.5, 6.8, 4.8), yellowWallMat);
    yellowWing.position.set(-8.2, 3.4, northZ);
    addBoxOutline(yellowWing, 1.02);
    group.add(yellowWing);

    const yellowRoof = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.6, 5.4), maroonRoofMat);
    yellowRoof.position.set(-8.2, 7.0, northZ);
    addBoxOutline(yellowRoof, 1.03);
    group.add(yellowRoof);

    const rooftopSignTex = createComicSignTexture(
      pitchId === 'strada' ? 'BAR SPORT' : pitchId === 'terra' ? 'ORATORIO SAN MARCO' : 'SUPER SANTOS',
      null,
      '#fde047',
      '#09090b',
    );
    const rooftopSign = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 1.55, 0.35),
      new THREE.MeshBasicMaterial({ map: rooftopSignTex }),
    );
    rooftopSign.position.set(-8.2, 8.0, northZ + 1.8);
    addBoxOutline(rooftopSign, 1.04);
    group.add(rooftopSign);

    // East Condominium Wing
    const pinkWing = new THREE.Mesh(new THREE.BoxGeometry(16.5, 7.2, 5.0), pinkWallMat);
    pinkWing.position.set(8.5, 3.6, northZ);
    addBoxOutline(pinkWing, 1.02);
    group.add(pinkWing);

    const pinkRoof = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.7, 5.6), maroonRoofMat);
    pinkRoof.position.set(8.5, 7.5, northZ);
    addBoxOutline(pinkRoof, 1.03);
    group.add(pinkRoof);

    const cortileSignTex = createComicSignTexture(
      pitchId === 'gabbia' ? 'GABBIA NORD' : 'CORTILE B',
      null,
      '#ffffff',
      '#09090b',
    );
    const cortileSign = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.0, 0.22),
      new THREE.MeshBasicMaterial({ map: cortileSignTex }),
    );
    cortileSign.position.set(3.0, 4.9, northZ + 2.55);
    addBoxOutline(cortileSign, 1.05);
    group.add(cortileSign);

    // GAG 1: Signora Maria's Balcony on the West Wing
    signoraBalconyGroup.position.set(-8.0, 3.0, northZ + 2.6);
    const balconySlab = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.35, 1.6),
      createToonMaterial(0xffffff),
    );
    addBoxOutline(balconySlab, 1.04);
    const balconyRail = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 1.0, 1.6),
      createToonMaterial(0xf97316),
    );
    balconyRail.position.y = 0.6;
    addBoxOutline(balconyRail, 1.04);
    signoraBalconyGroup.add(balconySlab, balconyRail);

    const mariaDress = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.35, 1.1, 10),
      createToonMaterial(0x7c2d12),
    );
    mariaDress.position.set(0, 0.7, 0);
    addComicOutline(mariaDress, 1.1);
    const mariaHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 10),
      createToonMaterial(0xf1c27d),
    );
    mariaHead.position.set(0, 1.42, 0);
    addComicOutline(mariaHead, 1.12);
    signoraBalconyGroup.add(mariaDress, mariaHead);
    group.add(signoraBalconyGroup);

    // GAG 2: Fragile Glass Window on the East Wing
    const windowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 2.6, 0.28),
      createToonMaterial(0x18181b),
    );
    windowFrame.position.set(7.5, 3.4, northZ + 2.55);
    group.add(windowFrame);

    windowGlassMesh.position.set(7.5, 3.4, northZ + 2.72);
    group.add(windowGlassMesh);

    shardsGroup.position.set(7.5, 3.4, northZ + 2.8);
    group.add(shardsGroup);

    // GAG 3: Parked Auto on South Sideline
    carGroup.position.set(-5.5, 0, southZ);
    const carBodyMat = createToonMaterial(0x2dd4bf);
    const carCabinMat = createToonMaterial(0xfef08a);

    const lowerChassis = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.85, 1.85), carBodyMat);
    lowerChassis.position.y = 0.65;
    lowerChassis.castShadow = true;
    addBoxOutline(lowerChassis, 1.04);
    carGroup.add(lowerChassis);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.76, 1.68), carCabinMat);
    cabin.position.set(-0.2, 1.42, 0);
    cabin.castShadow = true;
    addBoxOutline(cabin, 1.04);
    carGroup.add(cabin);

    [
      [-1.2, 0.36, 0.92],
      [1.2, 0.36, 0.92],
      [-1.2, 0.36, -0.92],
      [1.2, 0.36, -0.92],
    ].forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, wy, wz);
      addComicOutline(wheel, 1.1);
      carGroup.add(wheel);
    });

    hlLeft.position.set(1.96, 0.7, 0.6);
    hlRight.position.set(1.96, 0.7, -0.6);
    carGroup.add(hlLeft, hlRight);
    group.add(carGroup);

    // GAG 4: Storm Drain Grate ("Tombino")
    const drainGrate = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.05, 1.35),
      createToonMaterial(0x18181b),
    );
    drainGrate.position.set(dims.halfX * 0.6, 0.025, dims.halfZ - 1.0);
    group.add(drainGrate);

    // Streetlight Posts
    [-12, 0, 12].forEach((lx) => {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 7.4, 0.28),
        createToonMaterial(0x1e293b),
      );
      post.position.set(lx, 3.7, -dims.halfZ - 0.55);
      addBoxOutline(post, 1.06);

      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 0.42, 8),
        createToonMaterial(0xe2e8f0),
      );
      shade.position.set(lx, 7.4, -dims.halfZ - 0.05);
      addComicOutline(shade, 1.08);
      group.add(post, shade);
    });
  }

  // GAG 5: Cel-Shaded Street Dog (South Sideline)
  const dogHomeX = 3.5;
  const dogHomeZ = dims.halfZ - 0.4;
  const dogRoot = new THREE.Group();
  dogRoot.position.set(dogHomeX, 0, dogHomeZ);
  dogRoot.rotation.y = Math.PI;

  const dogMat = createToonMaterial(0xfb923c);
  const dogDarkMat = createToonMaterial(0x18181b);

  const dogBody = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.7), dogMat);
  dogBody.position.set(0, 0.36, 0);
  addBoxOutline(dogBody, 1.08);
  dogRoot.add(dogBody);

  const dogHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.32), dogMat);
  dogHead.position.set(0, 0.56, 0.34);
  addBoxOutline(dogHead, 1.08);
  dogRoot.add(dogHead);

  const dogSnout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), dogDarkMat);
  dogSnout.position.set(0, 0.5, 0.52);
  dogRoot.add(dogSnout);

  const dogTail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 6), dogDarkMat);
  dogTail.position.set(0, 0.52, -0.38);
  dogTail.rotation.x = -0.6;
  dogRoot.add(dogTail);

  const legGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.28, 6);
  const legOffsets: Array<[number, number]> = [
    [-0.12, 0.22],
    [0.12, 0.22],
    [-0.12, -0.22],
    [0.12, -0.22],
  ];
  const dogLegs: THREE.Mesh[] = legOffsets.map(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, dogDarkMat);
    leg.position.set(lx, 0.14, lz);
    addComicOutline(leg, 1.15);
    dogRoot.add(leg);
    return leg;
  });
  group.add(dogRoot);

  // GAG 6 (Spiaggia): Cel-Shaded Seagull
  const gullHomeX = -6.5;
  const gullHomeY = 3.6;
  const gullHomeZ = -dims.halfZ - 2.0;
  const gullRoot = new THREE.Group();
  gullRoot.position.set(gullHomeX, gullHomeY, gullHomeZ);
  gullRoot.visible = isBeach;

  const gullWhiteMat = createToonMaterial(0xffffff);
  const gullBeakMat = createToonMaterial(0xfacc15);

  const gullBody = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.48), gullWhiteMat);
  addBoxOutline(gullBody, 1.1);
  gullRoot.add(gullBody);

  const gullBeak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), gullBeakMat);
  gullBeak.rotation.x = Math.PI / 2;
  gullBeak.position.set(0, 0.04, 0.32);
  addComicOutline(gullBeak, 1.15);
  gullRoot.add(gullBeak);

  const wingGeo = new THREE.BoxGeometry(0.5, 0.045, 0.24);
  const leftWing = new THREE.Mesh(wingGeo, gullWhiteMat);
  leftWing.position.set(-0.28, 0.06, 0);
  addBoxOutline(leftWing, 1.1);
  const rightWing = new THREE.Mesh(wingGeo, gullWhiteMat);
  rightWing.position.set(0.28, 0.06, 0);
  addBoxOutline(rightWing, 1.1);
  gullRoot.add(leftWing, rightWing);
  group.add(gullRoot);

  return {
    group,
    groundMat,
    windowGlassMesh,
    shardsGroup,
    carGroup,
    carHeadlights: [hlLeft, hlRight],
    signoraBalconyGroup,
    dogRig: {
      root: dogRoot,
      legs: dogLegs,
      tail: dogTail,
      homeX: dogHomeX,
      homeZ: dogHomeZ,
    },
    seagullRig: {
      root: gullRoot,
      leftWing,
      rightWing,
      homeX: gullHomeX,
      homeY: gullHomeY,
      homeZ: gullHomeZ,
    },
    goalPosts,
  };
}
