import { PlayerInputState, VoiceShoutId } from '../types/game';

export class InputManager {
  private heldKeys = new Set<string>();
  private justPressedKeys = new Set<string>();
  private justReleasedKeys = new Set<string>();

  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private mouseNormX = 0; // -1 (left) to +1 (right)
  private mouseNormY = 0; // -1 (bottom/low shot) to +1 (top/high lob)
  private hasMovedMouse = false;

  // Mouse Left (0) & Right (2) state
  private lmbHeld = false;
  private lmbJustPressed = false;
  private lmbJustReleased = false;
  private lmbHoldDuration = 0;

  private rmbHeld = false;
  private rmbJustPressed = false;
  private rmbJustReleased = false;
  private rmbHoldDuration = 0;

  private p1ShootCharge = 0;
  private p1RightCharge = 0;
  private p2ShootCharge = 0;
  private prevGamepadButtons: boolean[][] = [[], []];

  // Android / Mobile Touch Virtual Overlay state
  public touchMoveX = 0;
  public touchMoveZ = 0;
  public touchSprint = false;
  public touchJumpJustPressed = false;
  public touchShootHeld = false;
  public touchShootJustReleased = false;
  public touchPassJustPressed = false;
  public touchLobJustPressed = false;
  public touchTackleJustPressed = false;
  public touchCameraJustPressed = false;
  public touchShoutJustPressed: VoiceShoutId | null = null;

  public connectedGamepads: string[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.onBlur);
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mousedown', this.onMouseDown);
      window.addEventListener('mouseup', this.onMouseUp);
      window.addEventListener('contextmenu', this.onContextMenu);
      window.addEventListener('gamepadconnected', this.updateGamepadList);
      window.addEventListener('gamepaddisconnected', this.updateGamepadList);
    }
  }

  public dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mousedown', this.onMouseDown);
      window.removeEventListener('mouseup', this.onMouseUp);
      window.removeEventListener('contextmenu', this.onContextMenu);
      window.removeEventListener('gamepadconnected', this.updateGamepadList);
      window.removeEventListener('gamepaddisconnected', this.updateGamepadList);
    }
  }

  private isInteractiveUiTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest('button, select, input, textarea, a, label, [data-ui-interactive="true"]'),
    );
  }

  private onContextMenu = (e: MouseEvent) => {
    if (!this.isInteractiveUiTarget(e.target)) {
      e.preventDefault();
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.isInteractiveUiTarget(e.target)) return;
    this.updateNormalizedMouse(e);
    if (e.button === 0) {
      if (!this.lmbHeld) {
        this.lmbJustPressed = true;
        this.lmbHoldDuration = 0;
      }
      this.lmbHeld = true;
    } else if (e.button === 2) {
      e.preventDefault();
      if (!this.rmbHeld) {
        this.rmbJustPressed = true;
        this.rmbHoldDuration = 0;
      }
      this.rmbHeld = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0 && this.lmbHeld) {
      this.lmbHeld = false;
      this.lmbJustReleased = true;
    } else if (e.button === 2 && this.rmbHeld) {
      this.rmbHeld = false;
      this.rmbJustReleased = true;
    }
  };

  private updateNormalizedMouse(e: MouseEvent) {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.mouseNormX = ((e.clientX / w) - 0.5) * 2; // -1..1
    this.mouseNormY = (0.5 - (e.clientY / h)) * 2; // -1 (bottom) .. +1 (top)
    this.hasMovedMouse = true;
  }

  private updateGamepadList = () => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const names: string[] = [];
    for (const p of pads) {
      if (p && p.connected) {
        names.push(p.id.split('(')[0].trim() || `Controller ${p.index + 1}`);
      }
    }
    this.connectedGamepads = names;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }
    const code = e.code;
    if (!this.heldKeys.has(code)) {
      this.justPressedKeys.add(code);
    }
    this.heldKeys.add(code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const code = e.code;
    this.heldKeys.delete(code);
    this.justReleasedKeys.add(code);
  };

  private onBlur = () => {
    this.heldKeys.clear();
    this.justPressedKeys.clear();
    this.justReleasedKeys.clear();
    this.lmbHeld = false;
    this.rmbHeld = false;
    this.p1ShootCharge = 0;
    this.p1RightCharge = 0;
    this.p2ShootCharge = 0;
  };

  private onMouseMove = (e: MouseEvent) => {
    this.updateNormalizedMouse(e);
    if (document.pointerLockElement) {
      this.mouseDeltaX += e.movementX * 0.0024;
      this.mouseDeltaY += e.movementY * 0.002;
    } else if (this.lmbHeld || this.rmbHeld) {
      this.mouseDeltaX += e.movementX * 0.0018;
      this.mouseDeltaY += e.movementY * 0.0015;
    }
  };

  private applyDeadzone(val: number, dz = 0.16): number {
    if (Math.abs(val) < dz) return 0;
    return (val - Math.sign(val) * dz) / (1 - dz);
  }

  public samplePlayer1(dt: number, allowArrowsForP1: boolean): PlayerInputState {
    this.updateGamepadList();

    // 1. KEYBOARD MOVEMENT (WASD + optional Arrow keys when not in 2P local mode)
    let moveX = 0;
    let moveZ = 0;

    if (this.heldKeys.has('KeyA') || (allowArrowsForP1 && this.heldKeys.has('ArrowLeft'))) moveX -= 1;
    if (this.heldKeys.has('KeyD') || (allowArrowsForP1 && this.heldKeys.has('ArrowRight'))) moveX += 1;
    if (this.heldKeys.has('KeyW') || (allowArrowsForP1 && this.heldKeys.has('ArrowUp'))) moveZ -= 1;
    if (this.heldKeys.has('KeyS') || (allowArrowsForP1 && this.heldKeys.has('ArrowDown'))) moveZ += 1;

    let lookDeltaX = this.mouseDeltaX;
    let lookDeltaY = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    if (this.heldKeys.has('KeyQ')) lookDeltaX -= 2.3 * dt;
    if (this.heldKeys.has('KeyR')) lookDeltaX += 2.3 * dt;

    // Shift = Corri (Sprint), Spazio = Salta (Jump)!
    let sprint = this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight') || this.touchSprint;
    let jumpJustPressed = this.justPressedKeys.has('Space') || this.touchJumpJustPressed;

    // Mouse Left (LMB) + Keyboard fallback (KeyJ)
    if (this.lmbHeld) {
      this.lmbHoldDuration += dt;
    }
    if (this.rmbHeld) {
      this.rmbHoldDuration += dt;
    }

    let shootHeld = this.lmbHeld || this.heldKeys.has('KeyJ') || this.touchShootHeld;
    let shootJustReleased =
      this.lmbJustReleased || this.justReleasedKeys.has('KeyJ') || this.touchShootJustReleased;
    const leftClickSingle =
      (this.lmbJustReleased && this.lmbHoldDuration < 0.22) || this.justPressedKeys.has('KeyK');

    // Mouse Right (RMB) + Keyboard fallback (KeyE / KeyF)
    const rightClickHeld = this.rmbHeld || this.heldKeys.has('KeyE');
    const rightClickJustReleased = this.rmbJustReleased || this.justReleasedKeys.has('KeyE');
    const rightClickSingle =
      (this.rmbJustReleased && this.rmbHoldDuration < 0.22) || this.justPressedKeys.has('KeyF');

    let passJustPressed =
      this.justPressedKeys.has('KeyK') ||
      this.justPressedKeys.has('KeyX') ||
      this.touchPassJustPressed;
    let lobJustPressed =
      this.justPressedKeys.has('KeyL') ||
      this.justPressedKeys.has('KeyZ') ||
      this.touchLobJustPressed;
    let tackleJustPressed =
      rightClickSingle ||
      this.justPressedKeys.has('KeyF') ||
      this.touchTackleJustPressed;
    let cameraToggleJustPressed =
      this.justPressedKeys.has('KeyC') ||
      this.justPressedKeys.has('KeyV') ||
      this.touchCameraJustPressed;
    let ballCycleJustPressed = this.justPressedKeys.has('KeyB');

    // Voice Shouts (1, 2, 3, 4)
    let shoutJustPressed: VoiceShoutId | null = this.touchShoutJustPressed;
    if (this.justPressedKeys.has('Digit1')) shoutJustPressed = 'passala';
    else if (this.justPressedKeys.has('Digit2')) shoutJustPressed = 'tiro_io';
    else if (this.justPressedKeys.has('Digit3')) shoutJustPressed = 'uomo';
    else if (this.justPressedKeys.has('Digit4')) shoutJustPressed = 'arbitro';

    // Merge Touch Virtual Joystick
    if (Math.abs(this.touchMoveX) > 0.01 || Math.abs(this.touchMoveZ) > 0.01) {
      moveX = this.touchMoveX;
      moveZ = this.touchMoveZ;
    }

    // 2. EXTERNAL CONTROLLER (Gamepad 0)
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[0];
    if (gp && gp.connected) {
      const gx = this.applyDeadzone(gp.axes[0] || 0);
      const gz = this.applyDeadzone(gp.axes[1] || 0);
      const rx = this.applyDeadzone(gp.axes[2] || 0);
      const ry = this.applyDeadzone(gp.axes[3] || 0);

      const dpadX = (gp.buttons[15]?.pressed ? 1 : 0) - (gp.buttons[14]?.pressed ? 1 : 0);
      const dpadZ = (gp.buttons[13]?.pressed ? 1 : 0) - (gp.buttons[12]?.pressed ? 1 : 0);

      if (Math.abs(moveX) < 0.05 && Math.abs(moveZ) < 0.05) {
        moveX = gx !== 0 ? gx : dpadX;
        moveZ = gz !== 0 ? gz : dpadZ;
      }

      if (Math.abs(rx) > 0.05) lookDeltaX += rx * 2.8 * dt;
      if (Math.abs(ry) > 0.05) lookDeltaY += ry * 2.0 * dt;

      const btns = gp.buttons.map((b) => Boolean(b?.pressed));
      const prev = this.prevGamepadButtons[0] || [];

      const gpShootHeld = Boolean(btns[2] || btns[5]);
      const gpShootReleased = Boolean((!btns[2] && prev[2]) || (!btns[5] && prev[5]));
      const gpPassJust = Boolean(btns[0] && !prev[0]);
      const gpTackleJust = Boolean(btns[1] && !prev[1]);
      const gpJumpJust = Boolean(btns[3] && !prev[3]);
      const gpCamJust = Boolean((btns[8] && !prev[8]) || (btns[11] && !prev[11]));
      const gpBallJust = Boolean(btns[4] && !prev[4]);

      sprint = sprint || Boolean(btns[7] || gp.buttons[7]?.value > 0.35);
      jumpJustPressed = jumpJustPressed || gpJumpJust;
      shootHeld = shootHeld || gpShootHeld;
      shootJustReleased = shootJustReleased || gpShootReleased;
      passJustPressed = passJustPressed || gpPassJust;
      tackleJustPressed = tackleJustPressed || gpTackleJust;
      cameraToggleJustPressed = cameraToggleJustPressed || gpCamJust;
      ballCycleJustPressed = ballCycleJustPressed || gpBallJust;

      this.prevGamepadButtons[0] = btns;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) {
      moveX /= len;
      moveZ /= len;
    }

    if (shootHeld) {
      this.p1ShootCharge = Math.min(1, this.p1ShootCharge + dt * 1.35);
    }
    const finalShootCharge = shootJustReleased ? Math.max(0.18, this.p1ShootCharge) : this.p1ShootCharge;
    if (!shootHeld) {
      this.p1ShootCharge = 0;
      this.lmbHoldDuration = 0;
    }

    if (rightClickHeld) {
      this.p1RightCharge = Math.min(1, this.p1RightCharge + dt * 1.15);
    }
    const finalRightCharge = rightClickJustReleased ? Math.max(0.2, this.p1RightCharge) : this.p1RightCharge;
    if (!rightClickHeld) {
      this.p1RightCharge = 0;
      this.rmbHoldDuration = 0;
    }

    // Compute world aim yaw & pitch from mouse screen position (for walking & aiming simultaneously!)
    // On screen: +X is East (+X world), -Y (up on screen) is North (-Z world)
    const mouseAimYaw = Math.atan2(this.mouseNormX, -this.mouseNormY);
    const mouseAimPitch = Math.max(-1, Math.min(1, this.mouseNormY));

    // Clear one-shot triggers
    this.lmbJustPressed = false;
    this.lmbJustReleased = false;
    this.rmbJustPressed = false;
    this.rmbJustReleased = false;
    this.touchJumpJustPressed = false;
    this.touchShootJustReleased = false;
    this.touchPassJustPressed = false;
    this.touchLobJustPressed = false;
    this.touchTackleJustPressed = false;
    this.touchCameraJustPressed = false;
    this.touchShoutJustPressed = null;

    return {
      moveX,
      moveZ,
      lookDeltaX,
      lookDeltaY,
      mouseAimYaw,
      mouseAimPitch,
      hasMouseAim: this.hasMovedMouse,
      sprint,
      jumpJustPressed,
      shootHeld,
      shootJustReleased,
      shootCharge: finalShootCharge,
      leftClickSingle,
      rightClickSingle,
      rightClickHeld,
      rightClickJustReleased,
      rightHoldCharge: finalRightCharge,
      passJustPressed,
      lobJustPressed,
      tackleJustPressed,
      cameraToggleJustPressed,
      ballCycleJustPressed,
      shoutJustPressed,
    };
  }

  public samplePlayer2(dt: number): PlayerInputState {
    let moveX = 0;
    let moveZ = 0;
    if (this.heldKeys.has('ArrowLeft')) moveX -= 1;
    if (this.heldKeys.has('ArrowRight')) moveX += 1;
    if (this.heldKeys.has('ArrowUp')) moveZ -= 1;
    if (this.heldKeys.has('ArrowDown')) moveZ += 1;

    let sprint = this.heldKeys.has('ControlRight') || this.heldKeys.has('Numpad0');
    let jumpJustPressed = this.justPressedKeys.has('Numpad4');
    let shootHeld = this.heldKeys.has('Enter') || this.heldKeys.has('Numpad1');
    let shootJustReleased = this.justReleasedKeys.has('Enter') || this.justReleasedKeys.has('Numpad1');
    let passJustPressed = this.justPressedKeys.has('ShiftRight') || this.justPressedKeys.has('Numpad2');
    let lobJustPressed = this.justPressedKeys.has('Backslash') || this.justPressedKeys.has('KeyM');
    let tackleJustPressed = this.justPressedKeys.has('Period') || this.justPressedKeys.has('Numpad3');

    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[1];
    if (gp && gp.connected) {
      const gx = this.applyDeadzone(gp.axes[0] || 0);
      const gz = this.applyDeadzone(gp.axes[1] || 0);
      if (Math.abs(moveX) < 0.05 && Math.abs(moveZ) < 0.05) {
        moveX = gx;
        moveZ = gz;
      }
      const btns = gp.buttons.map((b) => Boolean(b?.pressed));
      const prev = this.prevGamepadButtons[1] || [];

      sprint = sprint || Boolean(btns[7]);
      jumpJustPressed = jumpJustPressed || Boolean(btns[3] && !prev[3]);
      shootHeld = shootHeld || Boolean(btns[2] || btns[5]);
      shootJustReleased = shootJustReleased || Boolean((!btns[2] && prev[2]) || (!btns[5] && prev[5]));
      passJustPressed = passJustPressed || Boolean(btns[0] && !prev[0]);
      tackleJustPressed = tackleJustPressed || Boolean(btns[1] && !prev[1]);

      this.prevGamepadButtons[1] = btns;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) {
      moveX /= len;
      moveZ /= len;
    }

    if (shootHeld) {
      this.p2ShootCharge = Math.min(1, this.p2ShootCharge + dt * 1.35);
    }
    const finalCharge = shootJustReleased ? Math.max(0.25, this.p2ShootCharge) : this.p2ShootCharge;
    if (!shootHeld) {
      this.p2ShootCharge = 0;
    }

    return {
      moveX,
      moveZ,
      lookDeltaX: 0,
      lookDeltaY: 0,
      mouseAimYaw: 0,
      mouseAimPitch: 0,
      hasMouseAim: false,
      sprint,
      jumpJustPressed,
      shootHeld,
      shootJustReleased,
      shootCharge: finalCharge,
      leftClickSingle: passJustPressed,
      rightClickSingle: tackleJustPressed,
      rightClickHeld: false,
      rightClickJustReleased: false,
      rightHoldCharge: 0,
      passJustPressed,
      lobJustPressed,
      tackleJustPressed,
      cameraToggleJustPressed: false,
      ballCycleJustPressed: false,
      shoutJustPressed: null,
    };
  }

  public endFrame() {
    this.justPressedKeys.clear();
    this.justReleasedKeys.clear();
  }
}
