import type { ClientToServerMessage, RoomStatePayload } from '@lan-bomber/shared';
import type { DiscoveryRoomInfo, RendererElements } from './types';

export function renderRoomState(
  el: RendererElements,
  roomState: RoomStatePayload | null,
  myId: string | null,
  send: (msg: ClientToServerMessage) => void
) {
  if (!roomState) {
    el.roomState.textContent = '(Not in room)';
    el.hostControls.style.display = 'none';
    el.btnStart.disabled = true;
    el.readyToggle.checked = false;
    return;
  }

  const state = roomState;
  const isHost = myId && state.hostId === myId;

  el.hostControls.style.display = isHost ? 'block' : 'none';
  el.modeSelect.value = state.mode;
  el.mapSelect.value = state.mapId;

  const container = document.createElement('div');

  for (const p of state.players) {
    const ready = !!state.readyStates[p.id];
    const row = document.createElement('div');
    row.className = 'playerRow';

    const name = document.createElement('div');
    name.textContent = `${p.name}${p.id === state.hostId ? ' (Host)' : ''}${p.id === myId ? ' (You)' : ''}`;

    const badge = document.createElement('span');
    badge.className = `badge ${ready ? 'ready' : 'notReady'}`;
    badge.textContent = ready ? 'Ready' : 'Not Ready';

    const teamCell = document.createElement('div');

    if (state.mode === 'TEAM') {
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="0">Team 0</option><option value="1">Team 1</option>`;
      sel.value = String(p.team);
      sel.disabled = p.id !== myId;
      sel.onchange = () => {
        const team = Number(sel.value);
        send({ type: 'SetTeam', payload: { team } });
      };
      teamCell.appendChild(sel);
    } else {
      teamCell.textContent = '-';
    }

    row.appendChild(name);
    row.appendChild(badge);
    row.appendChild(teamCell);
    container.appendChild(row);
  }

  el.roomState.innerHTML = '';
  el.roomState.appendChild(container);

  if (myId) {
    el.readyToggle.checked = !!state.readyStates[myId];
  }

  const allReady = state.players.length > 0 && state.players.every((p) => state.readyStates[p.id]);
  const enoughPlayers = state.players.length >= 2;
  el.btnStart.disabled = !(isHost && allReady && enoughPlayers);
}

export function renderRooms(
  el: RendererElements,
  rooms: DiscoveryRoomInfo[],
  onJoin: (ip: string, port: number) => void
) {
  el.roomList.innerHTML = '';
  if (rooms.length === 0) {
    el.roomList.textContent = '(No rooms discovered yet)';
    return;
  }

  for (const r of rooms) {
    const card = document.createElement('div');
    card.className = 'roomCard';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = r.roomName;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const ageMs = Date.now() - r.lastSeen;
    meta.textContent = `${r.remoteAddress}:${r.wsPort} | players=${r.playerCount} | mode=${r.mode} map=${r.mapId} | seen ${(ageMs / 1000).toFixed(1)}s ago`;

    const btn = document.createElement('button');
    btn.textContent = 'Join';
    btn.onclick = () => onJoin(r.remoteAddress, r.wsPort);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(btn);
    el.roomList.appendChild(card);
  }
}
