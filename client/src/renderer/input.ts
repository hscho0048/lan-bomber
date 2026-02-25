import type { MoveDir } from '@lan-bomber/shared';
import type { InputState } from './types';

export function createInputController() {
  const keyDown = new Set<string>();
  const state: InputState = {
    preferredDir: 'None',
    placeQueued: false,
    needleSlotQueued: -1
  };

  const onKeyDown = (e: KeyboardEvent) => {
    keyDown.add(e.code);

    if (e.code === 'ArrowUp' || e.code === 'KeyW') state.preferredDir = 'Up';
    if (e.code === 'ArrowDown' || e.code === 'KeyS') state.preferredDir = 'Down';
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') state.preferredDir = 'Left';
    if (e.code === 'ArrowRight' || e.code === 'KeyD') state.preferredDir = 'Right';

    if (e.code === 'Space') {
      state.placeQueued = true;
      e.preventDefault();
    }

    if (e.code === 'KeyZ') {
      state.needleSlotQueued = 0;
      e.preventDefault();
    }
    if (e.code === 'KeyX') {
      state.needleSlotQueued = 1;
      e.preventDefault();
    }
    if (e.code === 'KeyC') {
      state.needleSlotQueued = 2;
      e.preventDefault();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    keyDown.delete(e.code);
  };

  const isDirDown = (dir: MoveDir, up: boolean, down: boolean, left: boolean, right: boolean): boolean => {
    switch (dir) {
      case 'Up':
        return up;
      case 'Down':
        return down;
      case 'Left':
        return left;
      case 'Right':
        return right;
      default:
        return false;
    }
  };

  const computeMoveDir = (): MoveDir => {
    const up = keyDown.has('ArrowUp') || keyDown.has('KeyW');
    const down = keyDown.has('ArrowDown') || keyDown.has('KeyS');
    const left = keyDown.has('ArrowLeft') || keyDown.has('KeyA');
    const right = keyDown.has('ArrowRight') || keyDown.has('KeyD');

    if (state.preferredDir !== 'None' && isDirDown(state.preferredDir, up, down, left, right)) {
      return state.preferredDir;
    }

    if (up) return 'Up';
    if (down) return 'Down';
    if (left) return 'Left';
    if (right) return 'Right';
    return 'None';
  };

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
