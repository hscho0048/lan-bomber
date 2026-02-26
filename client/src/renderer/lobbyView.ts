import type { ClientToServerMessage, RoomStatePayload } from '@lan-bomber/shared';
import { CHAR_COLORS } from '@lan-bomber/shared';
import type { DiscoveryRoomInfo, RendererElements } from './types';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export function renderRoomState(
  el: RendererElements,
  roomState: RoomStatePayload | null,
  myId: string | null,
  send: (msg: ClientToServerMessage) => void,
  roomName: string
) {
  if (!roomState) {
    // Reset all slots to empty
    for (let i = 0; i < 6; i++) {
      renderSlotEmpty(el, i);
    }
    el.hostControls.classList.add('hidden');
    el.btnStart.disabled = true;
    el.readyToggle.checked = false;
    el.roomTitle.textContent = '방';
    return;
  }

  const state = roomState;
  const isHost = myId && state.hostId === myId;

  el.roomTitle.textContent = roomName || '방';

  // Render player slots (up to 6)
  for (let i = 0; i < 6; i++) {
    const player = state.players[i];
    if (player) {
      const ready = !!state.readyStates[player.id];
      const isMe = player.id === myId;
      const isHostPlayer = player.id === state.hostId;
      renderSlotOccupied(el, i, player.name, player.colorIndex, player.skin ?? '', isMe, isHostPlayer, ready);
    } else {
      renderSlotEmpty(el, i);
    }
  }

  // Host controls
  if (isHost) {
    el.hostControls.classList.remove('hidden');
    el.modeSelect.value = state.mode;
    el.mapSelect.value = state.mapId;
    el.timerSelect.value = String(state.gameDurationSeconds);
  } else {
    el.hostControls.classList.add('hidden');
  }

  // Ready toggle
  if (myId) {
    el.readyToggle.checked = !!state.readyStates[myId];
  }

  // Start button: host only, all ready, >= 2 players
  const allReady = state.players.length > 0 && state.players.every((p) => state.readyStates[p.id]);
  const enoughPlayers = state.players.length >= 2;
  el.btnStart.disabled = !(isHost && allReady && enoughPlayers);
}

function renderSlotEmpty(el: RendererElements, index: number) {
  const slot = el.playerSlots[index];
  slot.className = 'player-slot empty';

  el.slotImgs[index].innerHTML = `<div class="slot-char-placeholder">?</div>`;
  el.slotNames[index].textContent = '빈 슬롯';
  el.slotNames[index].className = 'slot-name';
  el.slotBadges[index].textContent = '';
  el.slotBadges[index].className = 'slot-badge';
}

function renderSlotOccupied(
  el: RendererElements,
  index: number,
  name: string,
  colorIndex: number,
  skin: string,
  isMe: boolean,
  isHost: boolean,
  isReady: boolean
) {
  const color = CHAR_COLORS[colorIndex] ?? 'blue';
  const slot = el.playerSlots[index];
  slot.className = `player-slot occupied color-${color}${isMe ? ' is-me' : ''}`;

  // Use server-provided skin (shared with all players)
  const charFolder = skin || color;
  el.slotImgs[index].innerHTML = `<img src="assests/images/characters/${charFolder}/idle.svg" alt="${charFolder}" />`;

  // Player name
  el.slotNames[index].textContent = isMe ? `${name} (나)` : name;
  el.slotNames[index].className = `slot-name${isMe ? ' is-me' : ''}`;

  // Badge: Host > Ready > Not Ready
  const badge = el.slotBadges[index];
  if (isHost) {
    badge.textContent = '방장';
    badge.className = 'slot-badge host-badge';
  } else if (isReady) {
    badge.textContent = 'Ready';
    badge.className = 'slot-badge ready-badge';
  } else {
    badge.textContent = 'Not Ready';
    badge.className = 'slot-badge notready-badge';
  }
}

export function renderRooms(
  el: RendererElements,
  rooms: DiscoveryRoomInfo[],
  onJoin: (ip: string, port: number) => void
) {
  el.roomList.innerHTML = '';
  if (rooms.length === 0) {
    el.roomList.innerHTML = '<div style="color:var(--text-hint);font-size:13px;padding:8px;">탐색된 방이 없습니다...</div>';
    return;
  }

  for (const r of rooms) {
    const card = document.createElement('div');
    card.className = 'room-card';

    const info = document.createElement('div');
    info.className = 'room-card-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'room-card-name';
    nameEl.textContent = r.roomName;

    const metaEl = document.createElement('div');
    metaEl.className = 'room-card-meta';
    const ageMs = Date.now() - r.lastSeen;
    metaEl.textContent = `${r.remoteAddress}:${r.wsPort} · ${r.mode} · ${r.mapId} · ${(ageMs / 1000).toFixed(1)}s ago`;

    info.appendChild(nameEl);
    info.appendChild(metaEl);

    const players = document.createElement('div');
    players.className = 'room-card-players';
    players.textContent = `👥 ${r.playerCount}/6`;

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = '입장';
    btn.onclick = () => onJoin(r.remoteAddress, r.wsPort);

    card.appendChild(info);
    card.appendChild(players);
    card.appendChild(btn);
    el.roomList.appendChild(card);
  }
}

export function addChatMessage(
  el: RendererElements,
  playerName: string,
  colorIndex: number,
  text: string
) {
  const color = CHAR_COLORS[colorIndex] ?? 'blue';
  const msg = document.createElement('div');
  msg.className = 'chat-msg';
  msg.innerHTML = `<span class="chat-msg-name chat-color-${color}">${escapeHtml(playerName)}</span><span class="chat-msg-text">${escapeHtml(text)}</span>`;
  el.chatMessages.appendChild(msg);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

export function addSystemMessage(el: RendererElements, text: string) {
  const msg = document.createElement('div');
  msg.className = 'chat-msg system';
  msg.textContent = text;
  el.chatMessages.appendChild(msg);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

const LAST_PLACE_TAUNTS = [
  'MVP (Most Vulnerable Player) 🥲',
  '누가 먼저 죽는지 대회였다면 1등 🏆',
  '다음 생엔 잘 할 수 있을 거야… 아마도',
  '오늘 하루도 수고했어요 (꼴찌)',
  '폭탄에도 개성이 있다고 했잖아요',
  '열심히 달렸는데 결과가… 😅',
  '연습이 필요해 보여요 (매우)',
  '꽃은 지고 나서 빛난다지만 너무 빨리 졌어',
  '이번 게임의 진정한 조연 🌟',
  '꼴찌도 완주한 거야, 아마',
];

export function renderResultScreen(
  el: RendererElements,
  ranking: Array<{ id: string; name: string; colorIndex: number }>,
  myId: string | null,
  isDraw: boolean = false
) {
  el.resultTitle.textContent = isDraw ? '🤝 무승부!' : '게임 결과';
  el.resultList.innerHTML = '';

  const isMultiPlayer = ranking.length > 1;
  const taunt = LAST_PLACE_TAUNTS[Math.floor(Math.random() * LAST_PLACE_TAUNTS.length)];

  for (let i = 0; i < ranking.length; i++) {
    const entry = ranking[i];
    const color = CHAR_COLORS[entry.colorIndex] ?? 'blue';
    const rank = i + 1;
    const isMe = entry.id === myId;
    const isLast = isMultiPlayer && i === ranking.length - 1;

    const div = document.createElement('div');
    div.className = `result-entry rank-${Math.min(rank, 4)}`;

    const rankEl = document.createElement('div');
    rankEl.className = 'result-rank';
    rankEl.textContent = rank <= 3 ? RANK_MEDALS[rank - 1] : String(rank);

    const charImg = document.createElement('div');
    charImg.className = 'result-char-img';
    charImg.innerHTML = `<img src="assests/images/characters/${color}/idle.svg" alt="${color}" />`;

    const nameEl = document.createElement('div');
    nameEl.className = 'result-name';
    nameEl.textContent = isMe ? `${entry.name} (나)` : entry.name;
    nameEl.style.color = `var(--color-${color})`;

    const labelEl = document.createElement('div');
    if (isLast) {
      labelEl.className = 'result-label last';
      labelEl.textContent = `💀 꼴찌 — ${taunt}`;
    } else if (rank === 1 && !isDraw) {
      labelEl.className = 'result-label winner';
      labelEl.textContent = '🏆 우승';
    } else if (rank === 1 && isDraw) {
      labelEl.className = 'result-label draw';
      labelEl.textContent = '🤝 무승부';
    } else {
      labelEl.className = 'result-label loser';
      labelEl.textContent = `${rank}등`;
    }

    div.appendChild(rankEl);
    div.appendChild(charImg);
    div.appendChild(nameEl);
    div.appendChild(labelEl);
    el.resultList.appendChild(div);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
