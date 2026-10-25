import * as THREE from 'three';
import { BALL_PROFILES, BallProfileId, PITCH_CONFIGS, PitchId } from '../types/game';

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

export function createBallTexture(profileId: BallProfileId, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const profile = BALL_PROFILES[profileId];

  ctx.fillStyle = profile.primaryColor;
  ctx.fillRect(0, 0, 256, 256);

  if (profileId === 'supersantos') {
    // Classic Super Santos black meridian bands & pentagon panels
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 10;
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

    // Subtle specular cel highlight
    const grad = ctx.createRadialGradient(90, 90, 10, 128, 128, 120);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  } else if (profileId === 'classico') {
    // 32-panel black pentagons on warm white leather
    ctx.fillStyle = '#18181b';
    const spots = [
      [64, 64],
      [192, 64],
      [128, 128],
      [64, 192],
      [192, 192],
    ];
    for (const [cx, cy] of spots) {
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 240, 240);
  } else if (profileId === 'bagnato') {
    // Muddy waterlogged leather patches
    ctx.fillStyle = '#292524';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.arc((i * 53) % 240, (i * 89) % 240, 18 + (i % 3) * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Bucato: scuffed, wrinkled appearance with dark gash
    ctx.fillStyle = '#27272a';
    ctx.fillRect(90, 110, 75, 16);
    ctx.strokeStyle = '#713f12';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(20, 40);
    ctx.lineTo(220, 210);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createPitchTexture(pitchId: PitchId, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cfg = PITCH_CONFIGS[pitchId];

  // Base surface
  ctx.fillStyle = cfg.groundColor;
  ctx.fillRect(0, 0, 512, 512);

  // Painterly Celestini texture grain & cobblestone/asphalt wear
  for (let i = 0; i < 600; i++) {
    const x = (i * 97) % 512;
    const y = (i * 151) % 512;
    const w = 6 + (i % 14);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, y, w, w);
  }

  // Hand-drawn chalk pitch lines ("gessetto da cortile")
  ctx.strokeStyle = cfg.lineColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(26, 26, 460, 460);

  // Midfield chalk line
  ctx.beginPath();
  ctx.moveTo(256, 26);
  ctx.lineTo(256, 486);
  ctx.stroke();

  // Center circle
  ctx.beginPath();
  ctx.arc(256, 256, 58, 0, Math.PI * 2);
  ctx.stroke();

  // Penalty boxes
  ctx.strokeRect(26, 156, 72, 200);
  ctx.strokeRect(414, 156, 72, 200);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export interface PlayerRig {
  root: THREE.Group;
  upperBodyGroup: THREE.Group; // Hidden in FPS mode for the active player!
  legsGroup: THREE.Group; // Kept visible in FPS mode so you see your own boots kick!
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  selectionRing: THREE.Mesh;
}

/**
 * Builds a 10-part articulated procedural Street Footballer in "Compagnia dei Celestini" stylized aesthetic.
 * Pivoted at bottom-center (y = 0 sits flush on the ground).
 */
export function createStreetPlayerModel(
  team: 'blue' | 'red',
  number: number,
  isControlled: boolean,
): PlayerRig {
  const root = new THREE.Group();
  const upperBodyGroup = new THREE.Group();
  const legsGroup = new THREE.Group();

  const jerseyColor = team === 'blue' ? 0x0284c7 : 0xe11d48;
  const trimColor = team === 'blue' ? 0xfbbf24 : 0xfef08a;
  const shortsColor = team === 'blue' ? 0x0f172a : 0x18181b;
  const skinColor = number % 2 === 0 ? 0xf1c27d : 0xd2996c;
  const shoeColor = team === 'blue' ? 0xf59e0b : 0x38bdf8;

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.65, metalness: 0.05 });
  const jerseyMat = new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: 0.8, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.5, metalness: 0.25 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: shortsColor, roughness: 0.85, metalness: 0.05 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.35, metalness: 0.2 });

  // 1. Contact shadow + Active player indicator ring at y = 0.02
  const ringGeo = new THREE.RingGeometry(0.45, 0.62, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isControlled ? 0xfacc15 : team === 'blue' ? 0x38bdf8 : 0xf43f5e,
    transparent: true,
    opacity: isControlled ? 0.9 : 0.35,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const selectionRing = new THREE.Mesh(ringGeo, ringMat);
  selectionRing.position.y = 0.02;
  root.add(selectionRing);

  // Soft Ground Contact Shadow
  const shadowGeo = new THREE.CircleGeometry(0.48, 16);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  // 2. Left & Right Articulated Legs (Hip pivot at y = 0.78)
  const makeLeg = (offsetX: number) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(offsetX, 0.78, 0);

    const shortThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.34, 10), shortsMat);
    shortThigh.position.y = -0.15;
    shortThigh.castShadow = true;
    legPivot.add(shortThigh);

    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.36, 10), skinMat);
    calf.position.y = -0.45;
    calf.castShadow = true;
    legPivot.add(calf);

    // Street Sneaker with stripe
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.34), shoeMat);
    boot.position.set(0, -0.71, -0.06);
    boot.castShadow = true;
    legPivot.add(boot);

    return legPivot;
  };

  const leftLeg = makeLeg(-0.17);
  const rightLeg = makeLeg(0.17);
  legsGroup.add(leftLeg, rightLeg);
  root.add(legsGroup);

  // 3. Torso / Street Jersey (Primary Silhouette)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.32), jerseyMat);
  torso.position.y = 1.14;
  torso.castShadow = true;
  upperBodyGroup.add(torso);

  // Collar / Chest Stripe Accent
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.34), trimMat);
  stripe.position.y = 1.24;
  upperBodyGroup.add(stripe);

  // 4. Left & Right Articulated Arms (Shoulder pivot at y = 1.42)
  const makeArm = (offsetX: number) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(offsetX, 1.42, 0);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.24, 8), jerseyMat);
    sleeve.position.y = -0.1;
    armPivot.add(sleeve);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.36, 8), skinMat);
    forearm.position.y = -0.36;
    armPivot.add(forearm);

    return armPivot;
  };

  const leftArm = makeArm(-0.36);
  const rightArm = makeArm(0.36);
  upperBodyGroup.add(leftArm, rightArm);

  // 5. Stylized Celestini Head + Hair + Street Headband
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.68;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), skinMat);
  head.castShadow = true;
  headGroup.add(head);

  const hairMat = new THREE.MeshStandardMaterial({
    color: number % 3 === 0 ? 0x1c1917 : number % 3 === 1 ? 0x451a03 : 0x92400e,
    roughness: 0.9,
  });
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  hair.position.y = 0.03;
  headGroup.add(hair);

  const headband = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.06, 14), trimMat);
  headband.position.y = 0.07;
  headGroup.add(headband);

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

export interface CourtyardEnvironmentRefs {
  group: THREE.Group;
  windowGlassMesh: THREE.Mesh;
  shardsGroup: THREE.Group;
  carGroup: THREE.Group;
  carHeadlights: THREE.Mesh[];
  signoraBalconyGroup: THREE.Group;
  goalPosts: THREE.Vector3[];
}

/**
 * Builds the nostalgic Italian Courtyard ("Cortile dei Celestini") with:
 * - Jacket / Stone / Pipe Goalposts
 * - Signora Maria's Floral Balcony (Left flank trigger)
 * - Breakable Condo Window with Glass Shards (Back-Right flank)
 * - Parked Vintage Hatchback with Hazard Lights (Left Corner gate)
 * - Sloped Terracotta Roof Overhang
 * - Storm Drain Grate ("Tombino")
 */
export function buildCourtyardEnvironment(
  pitchId: PitchId,
  maxAnisotropy: number,
): CourtyardEnvironmentRefs {
  const group = new THREE.Group();
  const pitchCfg = PITCH_CONFIGS[pitchId];

  // Field Dimensions: 32m long (X: -16 to +16), 20m wide (Z: -10 to +10)
  const pitchTex = createPitchTexture(pitchId, maxAnisotropy);
  const groundGeo = new THREE.PlaneGeometry(32, 20);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    map: pitchTex,
    roughness: 0.88,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // Outer Surrounding Sidewalk / Street Apron (No floating box in void)
  const apronGeo = new THREE.PlaneGeometry(80, 60);
  apronGeo.rotateX(-Math.PI / 2);
  const apronMat = new THREE.MeshStandardMaterial({
    color: pitchId === 'terra' ? 0x57534e : 0x27272a,
    roughness: 0.95,
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.y = -0.03;
  apron.receiveShadow = true;
  group.add(apron);

  // Low Perimeter Courtyard Bounce Curbs
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.85 });
  const northCurb = new THREE.Mesh(new THREE.BoxGeometry(32.8, 0.7, 0.5), curbMat);
  northCurb.position.set(0, 0.35, -10.25);
  northCurb.receiveShadow = true;
  group.add(northCurb);

  const southCurb = new THREE.Mesh(new THREE.BoxGeometry(32.8, 0.7, 0.5), curbMat);
  southCurb.position.set(0, 0.35, 10.25);
  southCurb.receiveShadow = true;
  group.add(southCurb);

  // Goalposts at X = -15.5 and X = +15.5, Z = -2.7 and Z = +2.7 (Goal width = 5.4m, height = 2.4m)
  const goalPosts: THREE.Vector3[] = [
    new THREE.Vector3(-15.5, 0, -2.7),
    new THREE.Vector3(-15.5, 0, 2.7),
    new THREE.Vector3(15.5, 0, -2.7),
    new THREE.Vector3(15.5, 0, 2.7),
  ];

  goalPosts.forEach((pos, idx) => {
    const postGroup = new THREE.Group();
    postGroup.position.copy(pos);

    if (pitchCfg.goalpostStyle === 'giubbotti') {
      // Nostalgic Pile of School Backpacks & Folded Puffer Jackets as Goalposts!
      const jacketColor = idx < 2 ? 0x0284c7 : 0xe11d48;
      const bagMat = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.75 });
      const sleeveMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 });

      const baseBag = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.65), bagMat);
      baseBag.position.y = 0.275;
      baseBag.castShadow = true;
      postGroup.add(baseBag);

      const topJacket = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), sleeveMat);
      topJacket.scale.set(1, 0.7, 1);
      topJacket.position.y = 0.65;
      topJacket.castShadow = true;
      postGroup.add(topJacket);

      // Subtle vertical laser/chalk pole indicator so FPS players can spot the goal height clearly
      const markerMat = new THREE.MeshBasicMaterial({
        color: idx < 2 ? 0x38bdf8 : 0xf43f5e,
        transparent: true,
        opacity: 0.28,
      });
      const heightPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 8), markerMat);
      heightPole.position.y = 1.15;
      postGroup.add(heightPole);
    } else if (pitchCfg.goalpostStyle === 'pietre') {
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.92 });
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), stoneMat);
      rock.position.y = 0.35;
      rock.castShadow = true;
      postGroup.add(rock);
    } else {
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.45, metalness: 0.6 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 10), pipeMat);
      pole.position.y = 1.2;
      pole.castShadow = true;
      postGroup.add(pole);
    }

    group.add(postGroup);
  });

  // Crossbars for pipe goals or visual net backstop
  [-15.5, 15.5].forEach((gx, idx) => {
    const netMat = new THREE.MeshBasicMaterial({
      color: idx === 0 ? 0x38bdf8 : 0xf43f5e,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    const backNet = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.3, 5.4), netMat);
    backNet.position.set(gx + (gx < 0 ? -0.55 : 0.55), 1.15, 0);
    group.add(backNet);
  });

  // Italian Condo Building Backdrop (North Side Z = -12.5)
  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xe09f67, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x9c4127, roughness: 0.8 });

  const mainPalazzo = new THREE.Mesh(new THREE.BoxGeometry(28, 9.5, 4), plasterMat);
  mainPalazzo.position.set(0, 4.75, -12.8);
  mainPalazzo.receiveShadow = true;
  group.add(mainPalazzo);

  // Sloped Terracotta Roof Overhang (Gag Trigger: Pallone sul Tetto when Y > 5.8, Z < -9.5)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(28.6, 0.6, 5.2), roofMat);
  roof.position.set(0, 9.6, -12.5);
  roof.rotation.x = 0.18;
  group.add(roof);

  // GAG 1: Signora Maria's Balcony (North-West Building Face X = -8, Y = 3.2, Z = -10.5)
  const signoraBalconyGroup = new THREE.Group();
  signoraBalconyGroup.position.set(-8, 2.8, -10.4);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.6, roughness: 0.4 });
  const balconySlab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 1.6), curbMat);
  const balconyRail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 1.6), railMat);
  balconyRail.position.y = 0.6;
  signoraBalconyGroup.add(balconySlab, balconyRail);

  // Signora Maria Silhouette figure on the balcony
  const mariaDress = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.35, 1.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x7e22ce, roughness: 0.8 }),
  );
  mariaDress.position.set(0, 0.7, 0);
  const mariaHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.7 }),
  );
  mariaHead.position.set(0, 1.4, 0);
  signoraBalconyGroup.add(mariaDress, mariaHead);
  group.add(signoraBalconyGroup);

  // GAG 2: Fragile Glass Window (North-East Building Face X = +7.5, Y = 3.2, Z = -10.7)
  const windowFrame = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 2.6, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 }),
  );
  windowFrame.position.set(7.5, 3.2, -10.75);
  group.add(windowFrame);

  const windowGlassMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    roughness: 0.15,
    metalness: 0.4,
    transparent: true,
    opacity: 0.75,
  });
  const windowGlassMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2), windowGlassMat);
  windowGlassMesh.position.set(7.5, 3.2, -10.6);
  group.add(windowGlassMesh);

  const shardsGroup = new THREE.Group();
  shardsGroup.position.set(7.5, 3.2, -10.5);
  group.add(shardsGroup);

  // GAG 3: Parked Vintage Panda/Hatchback Car (South-West Corner X = -12, Z = 12.2)
  const carGroup = new THREE.Group();
  carGroup.position.set(-11.5, 0, 12.2);
  const carBodyMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.4, metalness: 0.3 });
  const carCabinMat = new THREE.MeshStandardMaterial({ color: 0x134e4a, roughness: 0.3, metalness: 0.4 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });

  const lowerChassis = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.8, 1.8), carBodyMat);
  lowerChassis.position.y = 0.65;
  lowerChassis.castShadow = true;
  carGroup.add(lowerChassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.72, 1.65), carCabinMat);
  cabin.position.set(-0.2, 1.38, 0);
  cabin.castShadow = true;
  carGroup.add(cabin);

  [
    [-1.2, 0.35, 0.9],
    [1.2, 0.35, 0.9],
    [-1.2, 0.35, -0.9],
    [1.2, 0.35, -0.9],
  ].forEach(([wx, wy, wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12), wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    carGroup.add(wheel);
  });

  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const hlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.32), headlightMat);
  hlLeft.position.set(1.92, 0.7, 0.6);
  const hlRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.32), headlightMat);
  hlRight.position.set(1.92, 0.7, -0.6);
  carGroup.add(hlLeft, hlRight);
  group.add(carGroup);

  // GAG 4: Storm Drain Grate ("Tombino" at X = 9.5, Z = 8.8)
  const drainGrate = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.04, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.8, roughness: 0.4 }),
  );
  drainGrate.position.set(9.5, 0.02, 8.8);
  group.add(drainGrate);

  // Streetlamps for Night / Sunset atmosphere
  [-12, 0, 12].forEach((lx) => {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 6.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.7, roughness: 0.4 }),
    );
    pole.position.set(lx, 3.25, -10.5);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfde047 }),
    );
    bulb.position.set(lx, 6.5, -10.1);
    group.add(pole, bulb);
  });

  return {
    group,
    windowGlassMesh,
    shardsGroup,
    carGroup,
    carHeadlights: [hlLeft, hlRight],
    signoraBalconyGroup,
    goalPosts,
  };
}
