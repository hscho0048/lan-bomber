let audio: HTMLAudioElement | null = null;
let unlocked = false;
let pendingPlay = false;

// 첫 유저 클릭 시 오디오 언락 (브라우저 autoplay 정책 우회)
function unlock() {
  if (unlocked) return;
  unlocked = true;
  if (pendingPlay) {
    pendingPlay = false;
    startAudio();
  }
}

function startAudio() {
  if (audio) return;
  audio = new Audio('assets/music/bgm.ogg');
  audio.loop = true;
  audio.volume = 0.5;
  audio.play().catch(() => {});
}

document.addEventListener('click', unlock, { once: true });
document.addEventListener('keydown', unlock, { once: true });

export function bgmPlay(): void {
  if (unlocked) {
    startAudio();
  } else {
    pendingPlay = true;
  }
}

export function bgmStop(): void {
  pendingPlay = false;
  if (!audio) return;
  audio.pause();
  audio.src = '';
  audio = null;
}
