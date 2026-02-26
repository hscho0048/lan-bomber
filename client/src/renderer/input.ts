import type { MoveDir } from '@lan-bomber/shared';
import type { InputState } from './types';

export function createInputController() {
  // Direction press-order stack: most recently pressed is at the end.
  // Only currently-held directions are in the stack, so the last element
  // is always the "most recently pressed and still held" direction.
  const dirStack: MoveDir[] = [];

  const state: InputState = {
    preferredDir: 'None',
    placeQueued: false,
    needleSlotQueued: -1
  };

  function codeToDir(code: string): MoveDir | null {
    if (code === 'ArrowUp' || code === 'KeyW') return 'Up';
    if (code === 'ArrowDown' || code === 'KeyS') return 'Down';
    if (code === 'ArrowLeft' || code === 'KeyA') return 'Left';
    if (code === 'ArrowRight' || code === 'KeyD') return 'Right';
    return null;
  }

  function isTypingTarget(e: KeyboardEvent): boolean {
    const tag = (e.target as HTMLElement)?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  }

  const onKeyDown = (e: KeyboardEvent) => {
    // Don't steal keypresses while the user is typing in a text field
    if (isTypingTarget(e)) return;

    const dir = codeToDir(e.code);
    if (dir) {
      // Prevent arrow keys from scrolling the page during gameplay
      e.preventDefault();
      // Remove existing entry (handles browser auto-repeat keydown events)
      const idx = dirStack.indexOf(dir);
      if (idx >= 0) dirStack.splice(idx, 1);
      dirStack.push(dir);
      state.preferredDir = dir;
    }

    if (e.code === 'Space') {
      state.placeQueued = true;
      e.preventDefault();
    }

    if (e.code === 'KeyZ') { state.needleSlotQueued = 0; e.preventDefault(); }
    if (e.code === 'KeyX') { state.needleSlotQueued = 1; e.preventDefault(); }
    if (e.code === 'KeyC') { state.needleSlotQueued = 2; e.preventDefault(); }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (isTypingTarget(e)) return;

    const dir = codeToDir(e.code);
    if (dir) {
      const idx = dirStack.indexOf(dir);
      if (idx >= 0) dirStack.splice(idx, 1);
      // Fall back to the most recently pressed key still held, or stop
      state.preferredDir = dirStack.length > 0 ? dirStack[dirStack.length - 1] : 'None';
    }
  };

  // Direction is always up-to-date in state.preferredDir via the stack
  const computeMoveDir = (): MoveDir => state.preferredDir;

  const consumePlaceQueued = (): boolean => {
    const queued = state.placeQueued;
    state.placeQueued = false;
    return queued;
  };

  const consumeNeedleSlotQueued = (): -1 | 0 | 1 | 2 => {
    const slot = state.needleSlotQueued;
    state.needleSlotQueued = -1;
    return slot;
  };

  const bind = () => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  };

  const unbind = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };

  return {
    bind,
    unbind,
    computeMoveDir,
    consumePlaceQueued,
    consumeNeedleSlotQueued
  };
}
