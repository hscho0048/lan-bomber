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
    el.btnSwitchTeam.classList.add('hidden');
    el.btnShuffleTeams.classList.add('hidden');
    el.teamCountDisplay.classList.add('hidden');
    return;
  }

  const state = roomState;
  const isHost = myId && state.hostId === myId;
  const isTeamMode = state.mode === 'TEAM';
  const isBossMode = state.mode === 'BOSS';

  el.roomTitle.textContent = roomName || '방';

  // Count players per team for TEAM mode
  const teamACnt = state.players.filter(p => p.team === 0).length;
  const teamBCnt = state.players.filter(p => p.team === 1).length;

  // Render player slots — layout differs by mode
  const slotsGrid = el.playerSlots[0].parentElement as HTMLElement;

  if (isTeamMode) {
    // 2-column layout: A팀 (slots 0-2) | B팀 (slots 3-5)
    slotsGrid.className = 'player-slots-grid team-mode';

    // Upsert team column headers
    let headerA = slotsGrid.querySelector<HTMLDivElement>('.team-col-header.team-a');
    let headerB = slotsGrid.querySelector<HTMLDivElement>('.team-col-header.team-b');
    if (!headerA) { headerA = document.createElement('div'); headerA.className = 'team-col-header team-a'; }
    if (!headerB) { headerB = document.createElement('div'); headerB.className = 'team-col-header team-b'; }
    headerA.textContent = `🔵 A팀 ${teamACnt}/3`;
    headerB.textContent = `🔴 B팀 ${teamBCnt}/3`;

    // DOM order: [headerA headerB] [slot0 slot3] [slot1 slot4] [slot2 slot5]
    slotsGrid.innerHTML = '';
    slotsGrid.append(
      headerA, headerB,
      el.playerSlots[0], el.playerSlots[3],
      el.playerSlots[1], el.playerSlots[4],
      el.playerSlots[2], el.playerSlots[5],
    );

    // Fill A팀 players into slots 0-2
    const teamAPlayers = state.players.filter(p => p.team === 0);
    for (let i = 0; i < 3; i++) {
      const p = teamAPlayers[i];
      if (p) renderSlotOccupied(el, i, p.name, p.colorIndex, p.skin ?? '', p.id === myId, p.id === state.hostId, !!state.readyStates[p.id], true, 0);
      else renderSlotEmpty(el, i, 0);
    }

    // Fill B팀 players into slots 3-5
    const teamBPlayers = state.players.filter(p => p.team === 1);
    for (let i = 0; i < 3; i++) {
      const p = teamBPlayers[i];
      if (p) renderSlotOccupied(el, i + 3, p.name, p.colorIndex, p.skin ?? '', p.id === myId, p.id === state.hostId, !!state.readyStates[p.id], true, 1);
      else renderSlotEmpty(el, i + 3, 1);
    }
  } else {
    // FFA mode: 3-column grid, players in join order
    slotsGrid.className = 'player-slots-grid';
    slotsGrid.querySelectorAll('.team-col-header').forEach(h => h.remove());
    // Restore natural slot order
    for (const slot of el.playerSlots) slotsGrid.appendChild(slot);

    for (let i = 0; i < 6; i++) {
      const player = state.players[i];
      if (player) {
        const ready = !!state.readyStates[player.id];
        renderSlotOccupied(el, i, player.name, player.colorIndex, player.skin ?? '', player.id === myId, player.id === state.hostId, ready, false, 0);
      } else {
        renderSlotEmpty(el, i);
      }
    }
  }

  // Host controls
  if (isHost) {
    el.hostControls.classList.remove('hidden');
    el.modeSelect.value = state.mode;
    el.mapSelect.value = state.mapId;
    el.timerSelect.value = String(state.gameDurationSeconds);
    el.bossSelect.value = state.bossType ?? 'random';
    if (isBossMode) {
      el.bossSelectGroup.classList.remove('hidden');
    } else {
      el.bossSelectGroup.classList.add('hidden');
    }
  } else {
    el.hostControls.classList.add('hidden');
  }

  // Ready toggle
  if (myId) {
    el.readyToggle.checked = !!state.readyStates[myId];
  }

  // Team controls
  if (isTeamMode) {
    el.btnSwitchTeam.classList.remove('hidden');
    el.teamCountDisplay.classList.add('hidden'); // counts shown in column headers

    // 팀 섞기: 방장만 보임
    if (isHost) {
      el.btnShuffleTeams.classList.remove('hidden');
    } else {
      el.btnShuffleTeams.classList.add('hidden');
    }

    // Disable switch if target team is full (3 players max per team)
    const myPlayer = myId ? state.players.find(p => p.id === myId) : null;
    if (myPlayer) {
      const targetTeam = myPlayer.team === 0 ? 1 : 0;
      const targetCount = targetTeam === 0 ? teamACnt : teamBCnt;
      el.btnSwitchTeam.disabled = targetCount >= 3;
    } else {
      el.btnSwitchTeam.disabled = true;
    }
  } else {
    el.btnSwitchTeam.classList.add('hidden');
    el.btnShuffleTeams.classList.add('hidden');
    el.teamCountDisplay.classList.add('hidden');
  }

  // Start button: host only, all ready; BOSS mode allows 1 player
  const allReady = state.players.length > 0 && state.players.every((p) => state.readyStates[p.id]);
  const enoughPlayers = isBossMode ? state.players.length >= 1 : state.players.length >= 2;
  el.btnStart.disabled = !(isHost && allReady && enoughPlayers);
}

function renderSlotEmpty(el: RendererElements, index: number, team?: number) {
  const slot = el.playerSlots[index];
  const teamClass = team === 0 ? ' team-a-slot' : team === 1 ? ' team-b-slot' : '';
  slot.className = `player-slot empty${teamClass}`;

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
  isReady: boolean,
  isTeamMode: boolean = false,
  team: number = 0
) {
  const color = CHAR_COLORS[colorIndex] ?? 'blue';
  const slot = el.playerSlots[index];
  // In team mode: team color handles the border; no per-player color class needed
  const teamClass = isTeamMode ? (team === 0 ? ' team-a-slot' : ' team-b-slot') : ` color-${color}`;
  slot.className = `player-slot occupied${teamClass}${isMe ? ' is-me' : ''}`;

  // Use server-provided skin (shared with all players)
  const charFolder = skin || color;
  el.slotImgs[index].innerHTML = `<img src="assests/images/characters/${charFolder}/idle.svg" alt="${charFolder}" />`;

  // Player name
  el.slotNames[index].textContent = isMe ? `${name} (나)` : name;
  el.slotNames[index].className = `slot-name${isMe ? ' is-me' : ''}`;

  // Badge: show host crown or ready state (team column already shows team affiliation)
  const badge = el.slotBadges[index];
  if (isHost) {
    badge.innerHTML = '👑 방장';
    badge.className = 'slot-badge host-badge';
  } else if (isReady) {
    badge.innerHTML = '✓ Ready';
    badge.className = 'slot-badge ready-badge';
  } else {
    badge.textContent = '준비 중...';
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
  ranking: Array<{ id: string; name: string; colorIndex: number; team?: number; skin?: string }>,
  myId: string | null,
  isDraw: boolean = false,
  winnerTeam?: number,
  bossVictory?: boolean
) {
  const isTeamMode = winnerTeam !== undefined;
  const isBossMode = bossVictory !== undefined;

  if (isBossMode) {
    el.resultTitle.textContent = bossVictory ? '🏆 보스 격파!' : '💀 게임 오버...';
  } else if (isTeamMode) {
    el.resultTitle.textContent = `🏆 ${winnerTeam === 0 ? 'A팀' : 'B팀'} 승리!`;
  } else {
    el.resultTitle.textContent = isDraw ? '🤝 무승부!' : '게임 결과';
  }
  el.resultList.innerHTML = '';

  const isMultiPlayer = ranking.length > 1;
  const taunt = LAST_PLACE_TAUNTS[Math.floor(Math.random() * LAST_PLACE_TAUNTS.length)];

  if (isBossMode) {
    // BOSS mode: show all players (survivors = heroes, dead = casualties)
    const header = document.createElement('div');
    header.className = 'result-team-header';
    header.style.color = bossVictory ? '#ffd700' : '#cc4444';
    header.textContent = bossVictory ? '— 영웅들 —' : '— 희생자들 —';
    el.resultList.appendChild(header);

    for (const entry of ranking) {
      const color = CHAR_COLORS[entry.colorIndex] ?? 'blue';
      const charFolder = entry.skin || color;
      const isMe = entry.id === myId;

      const div = document.createElement('div');
      div.className = `result-entry rank-1${bossVictory ? ' result-entry-winner' : ''}`;

      const charImg = document.createElement('div');
      charImg.className = 'result-char-img';
      charImg.innerHTML = `<img src="assests/images/characters/${charFolder}/idle.svg" alt="${charFolder}" />`;

      const nameEl = document.createElement('div');
      nameEl.className = 'result-name';
      nameEl.textContent = isMe ? `${entry.name} (나)` : entry.name;
      nameEl.style.color = `var(--color-${color})`;

      const labelEl = document.createElement('div');
      labelEl.className = `result-label ${bossVictory ? 'winner' : 'loser'}`;
      labelEl.textContent = bossVictory ? '🏆 격파' : '💀 전사';

      div.appendChild(charImg);
      div.appendChild(nameEl);
      div.appendChild(labelEl);
      el.resultList.appendChild(div);
    }
    return;
  }

  if (isTeamMode) {
    // Winner team first, then loser team
    const teamOrder = winnerTeam !== undefined ? [winnerTeam, 1 - winnerTeam] : [0, 1];
    for (const teamIdx of teamOrder) {
      const teamPlayers = ranking.filter(p => p.team === teamIdx);
      if (teamPlayers.length === 0) continue;

      const isWinner = teamIdx === winnerTeam;
      const header = document.createElement('div');
      header.className = `result-team-header ${teamIdx === 0 ? 'team-a-header' : 'team-b-header'}`;
      header.textContent = (teamIdx === 0 ? '— A팀 —' : '— B팀 —') + (isWinner ? ' 🏆' : '');
      el.resultList.appendChild(header);

      for (const entry of teamPlayers) {
        const color = CHAR_COLORS[entry.colorIndex] ?? 'blue';
        const charFolder = entry.skin || color;
        const isMe = entry.id === myId;

        const div = document.createElement('div');
        div.className = `result-entry result-entry-team${isWinner ? ' result-entry-winner' : ''}`;

        const charImg = document.createElement('div');
        charImg.className = 'result-char-img';
        charImg.innerHTML = `<img src="assests/images/characters/${charFolder}/idle.svg" alt="${charFolder}" />`;

        const nameEl = document.createElement('div');
        nameEl.className = `result-name ${teamIdx === 0 ? 'team-a-name' : 'team-b-name'}`;
        nameEl.textContent = isMe ? `${entry.name} (나)` : entry.name;

        div.appendChild(charImg);
        div.appendChild(nameEl);
        el.resultList.appendChild(div);
      }
    }
  } else {
    for (let i = 0; i < ranking.length; i++) {
      const entry = ranking[i];
      const color = CHAR_COLORS[entry.colorIndex] ?? 'blue';
      const charFolder = entry.skin || color;
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
      charImg.innerHTML = `<img src="assests/images/characters/${charFolder}/idle.svg" alt="${charFolder}" />`;

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
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
