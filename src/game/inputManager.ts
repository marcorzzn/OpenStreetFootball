import { PlayerInputState } from '../types/game';

export class InputManager {
  private heldKeys = new Set<string>();
  private justPressedKeys = new Set<string>();
  private justReleasedKeys = new Set<string>();

  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  private p1ShootCharge = 0;
  private p2ShootCharge = 0;
  private prevGamepadButtons: boolean[][] = [[], []];

  // Android / Mobile Touch Virtual Overlay state
  public touchMoveX = 0;
  public touchMoveZ = 0;
  public touchSprint = false;
  public touchShootHeld = false;
  public touchShootJustReleased = false;
  public touchPassJustPressed = false;
  public touchLobJustPressed = false;
  public touchTackleJustPressed = false;
  public touchCameraJustPressed = false;

  public connectedGamepads: string[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.onBlur);
      window.addEventListener('mousemove', this.onMouseMove);
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
      window.removeEventListener('gamepadconnected', this.updateGamepadList);
      window.removeEventListener('gamepaddisconnected', this.updateGamepadList);
    }
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
    this.p1ShootCharge = 0;
    this.p2ShootCharge = 0;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement) {
      this.mouseDeltaX += e.movementX * 0.0024;
      this.mouseDeltaY += e.movementY * 0.002;
    }
  };

  private applyDeadzone(val: number, dz = 0.16): number {
    if (Math.abs(val) < dz) return 0;
    return (val - Math.sign(val) * dz) / (1 - dz);
  }

  public samplePlayer1(dt: number, allowArrowsForP1: boolean): PlayerInputState {
    this.updateGamepadList();

    // 1. KEYBOARD PRIORITY (WASD + Space/J/K/L/E/C/B + optional Arrow keys when not in 2P local mode)
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

    // Keyboard Q / E turn in FPS mode
    if (this.heldKeys.has('KeyQ')) lookDeltaX -= 2.3 * dt;
    if (this.heldKeys.has('KeyR')) lookDeltaX += 2.3 * dt;

    let sprint = this.heldKeys.has('ShiftLeft') || this.touchSprint;
    let shootHeld =
      this.heldKeys.has('Space') ||
      this.heldKeys.has('KeyJ') ||
      this.touchShootHeld;
    let shootJustReleased =
      this.justReleasedKeys.has('Space') ||
      this.justReleasedKeys.has('KeyJ') ||
      this.touchShootJustReleased;

    let passJustPressed =
      this.justPressedKeys.has('KeyK') ||
      this.justPressedKeys.has('KeyX') ||
      this.touchPassJustPressed;
    let lobJustPressed =
      this.justPressedKeys.has('KeyL') ||
      this.justPressedKeys.has('KeyZ') ||
      this.touchLobJustPressed;
    let tackleJustPressed =
      this.justPressedKeys.has('KeyE') ||
      this.justPressedKeys.has('KeyF') ||
      this.touchTackleJustPressed;
    let cameraToggleJustPressed =
      this.justPressedKeys.has('KeyC') ||
      this.justPressedKeys.has('KeyV') ||
      this.touchCameraJustPressed;
    let ballCycleJustPressed = this.justPressedKeys.has('KeyB');

    // Merge Touch Virtual Joystick
    if (Math.abs(this.touchMoveX) > 0.01 || Math.abs(this.touchMoveZ) > 0.01) {
      moveX = this.touchMoveX;
      moveZ = this.touchMoveZ;
    }

    // 2. EXTERNAL CONTROLLER (Gamepad 0 merges seamlessly with Keyboard Priority)
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[0];
    if (gp && gp.connected) {
      const gx = this.applyDeadzone(gp.axes[0] || 0);
      const gz = this.applyDeadzone(gp.axes[1] || 0);
      const rx = this.applyDeadzone(gp.axes[2] || 0);
      const ry = this.applyDeadzone(gp.axes[3] || 0);

      // D-pad support
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

      const gpShootHeld = Boolean(btns[2] || btns[5]); // X/Square or RB
      const gpShootReleased = Boolean((!btns[2] && prev[2]) || (!btns[5] && prev[5]));
      const gpPassJust = Boolean(btns[0] && !prev[0]); // A/Cross
      const gpTackleJust = Boolean(btns[1] && !prev[1]); // B/Circle
      const gpLobJust = Boolean(btns[3] && !prev[3]); // Y/Triangle
      const gpCamJust = Boolean((btns[8] && !prev[8]) || (btns[11] && !prev[11])); // Select or R3
      const gpBallJust = Boolean(btns[4] && !prev[4]); // LB

      sprint = sprint || Boolean(btns[7] || gp.buttons[7]?.value > 0.35);
      shootHeld = shootHeld || gpShootHeld;
      shootJustReleased = shootJustReleased || gpShootReleased;
      passJustPressed = passJustPressed || gpPassJust;
      lobJustPressed = lobJustPressed || gpLobJust;
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
      this.p1ShootCharge = Math.min(1, this.p1ShootCharge + dt * 1.45);
    }
    const finalCharge = shootJustReleased ? Math.max(0.28, this.p1ShootCharge) : this.p1ShootCharge;
    if (!shootHeld) {
      this.p1ShootCharge = 0;
    }

    // Clear one-shot touch triggers
    this.touchShootJustReleased = false;
    this.touchPassJustPressed = false;
    this.touchLobJustPressed = false;
    this.touchTackleJustPressed = false;
    this.touchCameraJustPressed = false;

    return {
      moveX,
      moveZ,
      lookDeltaX,
      lookDeltaY,
      sprint,
      shootHeld,
      shootJustReleased,
      shootCharge: finalCharge,
      passJustPressed,
      lobJustPressed,
      tackleJustPressed,
      cameraToggleJustPressed,
      ballCycleJustPressed,
    };
  }

  public samplePlayer2(dt: number): PlayerInputState {
    // Player 2 Local Keyboard (Arrow keys + Enter / RightShift / Backslash) OR Gamepad 1
    let moveX = 0;
    let moveZ = 0;
    if (this.heldKeys.has('ArrowLeft')) moveX -= 1;
    if (this.heldKeys.has('ArrowRight')) moveX += 1;
    if (this.heldKeys.has('ArrowUp')) moveZ -= 1;
    if (this.heldKeys.has('ArrowDown')) moveZ += 1;

    let sprint = this.heldKeys.has('ControlRight') || this.heldKeys.has('Numpad0');
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
      shootHeld = shootHeld || Boolean(btns[2] || btns[5]);
      shootJustReleased = shootJustReleased || Boolean((!btns[2] && prev[2]) || (!btns[5] && prev[5]));
      passJustPressed = passJustPressed || Boolean(btns[0] && !prev[0]);
      tackleJustPressed = tackleJustPressed || Boolean(btns[1] && !prev[1]);
      lobJustPressed = lobJustPressed || Boolean(btns[3] && !prev[3]);

      this.prevGamepadButtons[1] = btns;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) {
      moveX /= len;
      moveZ /= len;
    }

    if (shootHeld) {
      this.p2ShootCharge = Math.min(1, this.p2ShootCharge + dt * 1.45);
    }
    const finalCharge = shootJustReleased ? Math.max(0.28, this.p2ShootCharge) : this.p2ShootCharge;
    if (!shootHeld) {
      this.p2ShootCharge = 0;
    }

    return {
      moveX,
      moveZ,
      lookDeltaX: 0,
      lookDeltaY: 0,
      sprint,
      shootHeld,
      shootJustReleased,
      shootCharge: finalCharge,
      passJustPressed,
      lobJustPressed,
      tackleJustPressed,
      cameraToggleJustPressed: false,
      ballCycleJustPressed: false,
    };
  }

  public endFrame() {
    this.justPressedKeys.clear();
    this.justReleasedKeys.clear();
  }
}
