const socket = io();

let currentRoomId = null;
let myCode = null;
let isLoadingMore = false;
let player = null;
let isRemoteAction = false;

// DOM Elemanları
const lobbyScreen = document.getElementById('lobby-screen');
const appScreen = document.getElementById('app-screen');
const myCodeEl = document.getElementById('my-code');
const requestsList = document.getElementById('requests-list');

const codeModal = document.getElementById('code-modal');
const btnStartModal = document.getElementById('btn-start-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnSendCode = document.getElementById('btn-send-code');
const targetCodeInput = document.getElementById('target-code-input');

const peerCursor = document.getElementById('peer-cursor');
const videoGrid = document.getElementById('video-grid');
const mainScrollLayout = document.getElementById('main-scroll-layout');
const playerPage = document.getElementById('player-page');
const videoGridPage = document.getElementById('video-grid-page');
const playingTitle = document.getElementById('playing-title');
const btnBackHome = document.getElementById('btn-back-home');
const gridTitle = document.getElementById('grid-title');
const customPlayPauseBtn = document.getElementById('custom-play-pause-btn');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

socket.on('init-user', (data) => {
  myCode = data.code;
  myCodeEl.textContent = myCode;
});

btnStartModal.onclick = () => codeModal.classList.remove('hidden');
btnCloseModal.onclick = () => codeModal.classList.add('hidden');

btnSendCode.onclick = () => {
  const code = targetCodeInput.value.trim();
  if (code.length === 6) {
    socket.emit('send-request', { targetCode: code });
    codeModal.classList.add('hidden');
    targetCodeInput.value = '';
    alert('İstek gönderildi!');
  } else {
    alert('6 haneli kod giriniz.');
  }
};

socket.on('incoming-request', ({ fromCode, fromId }) => {
  requestsList.innerHTML = `
    <li>
      <span>Kod: <strong>${fromCode}</strong></span>
      <button class="yt-btn-primary" style="padding:4px 10px;" onclick="acceptConnection('${fromId}')">Kabul Et</button>
    </li>
  `;
});

window.acceptConnection = (fromId) => {
  socket.emit('accept-request', { fromId });
};

socket.on('room-ready', ({ roomId, videos }) => {
  currentRoomId = roomId;
  lobbyScreen.classList.remove('active');
  lobbyScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  appScreen.classList.add('active');

  videoGrid.innerHTML = '';
  renderVideos(videos);
});

// Arama
function performSearch() {
  const query = searchInput.value.trim();
  if (query && currentRoomId) {
    socket.emit('search-query', { roomId: currentRoomId, query });
  }
}
searchBtn.onclick = performSearch;
searchInput.onkeyup = (e) => { if (e.key === 'Enter') performSearch(); };

socket.on('search-results', ({ query, videos }) => {
  gridTitle.textContent = `"${query}" Sonuçları`;
  videoGrid.innerHTML = '';
  playerPage.classList.add('hidden');
  videoGridPage.classList.remove('hidden');
  renderVideos(videos);
});

function renderVideos(videos) {
  videos.forEach(video => {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <img src="${video.thumbnail}" alt="${video.title}">
      <div class="video-info">
        <div class="video-title">${video.title}</div>
      </div>
    `;
    card.onclick = () => selectVideo(video, true);
    videoGrid.appendChild(card);
  });
  isLoadingMore = false;
}

// Sonsuz Kaydırma
mainScrollLayout.addEventListener('scroll', () => {
  if (videoGridPage.classList.contains('hidden')) return;
  const bottom = mainScrollLayout.scrollHeight - mainScrollLayout.scrollTop - mainScrollLayout.clientHeight;
  if (bottom < 300 && !isLoadingMore && currentRoomId) {
    isLoadingMore = true;
    socket.emit('load-more-videos', { roomId: currentRoomId });
  }
});

socket.on('append-more-videos', ({ videos }) => {
  renderVideos(videos);
});

// YouTube API
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '100%',
    width: '100%',
    playerVars: {
      'controls': 0,
      'modestbranding': 1,
      'rel': 0,
      'iv_load_policy': 3
    },
    events: {}
  });
}

// 📌 ÖZEL BUTON: 1 Saniye (1000ms) Ortak Saat Kilidi ile Play/Pause/Seek
if (customPlayPauseBtn) {
  customPlayPauseBtn.onclick = () => {
    if (isRemoteAction || !player || typeof player.getPlayerState !== 'function') return;

    const state = player.getPlayerState();
    const time = player.getCurrentTime();

    isRemoteAction = true;
    const newState = (state === YT.PlayerState.PLAYING) ? 'PAUSE' : 'PLAY';

    if (newState === 'PAUSE') {
      player.pauseVideo();
      customPlayPauseBtn.textContent = '▶ Oynat';
    } else {
      player.playVideo();
      customPlayPauseBtn.textContent = '⏸ Durdur';
    }

    // 1000ms (1 saniye) gelecekteki ortak zaman damgasıyla gönder
    socket.emit('player-state-change', { 
      roomId: currentRoomId, 
      state: newState, 
      time: time 
    });

    setTimeout(() => { isRemoteAction = false; }, 800);
  };
}

// Karşı Taraftan Gelen Aksiyonu Uygula (1 Saniye Bekleme Payı ile)
socket.on('peer-player-state-change', ({ state, time, executeAt }) => {
  if (!player || typeof player.seekTo !== 'function') return;

  isRemoteAction = true;

  const executeAction = () => {
    if (Math.abs(player.getCurrentTime() - time) > 0.4) {
      player.seekTo(time, true);
    }

    if (state === 'PLAY') {
      player.playVideo();
      customPlayPauseBtn.textContent = '⏸ Durdur';
    } else if (state === 'PAUSE') {
      player.pauseVideo();
      customPlayPauseBtn.textContent = '▶ Oynat';
    }

    setTimeout(() => { isRemoteAction = false; }, 800);
  };

  const now = Date.now();
  const delay = executeAt - now;

  if (delay <= 0) {
    executeAction();
  } else {
    setTimeout(executeAction, delay);
  }
});

// İlk Başlangıç (3 Saniye Ortak Saat Kilidi)
socket.on('execute-synchronized-start', ({ startTimestamp }) => {
  if (!player || typeof player.playVideo !== 'function') return;

  isRemoteAction = true;
  player.seekTo(0, true);
  player.pauseVideo();
  customPlayPauseBtn.textContent = '▶ Oynat';

  const checkTimeAndPlay = () => {
    const now = Date.now();
    const remainingTime = startTimestamp - now;

    if (remainingTime <= 0) {
      player.playVideo();
      customPlayPauseBtn.textContent = '⏸ Durdur';
      setTimeout(() => { isRemoteAction = false; }, 1000);
    } else {
      setTimeout(checkTimeAndPlay, Math.min(remainingTime, 10));
    }
  };

  checkTimeAndPlay();
});

function selectVideo(video, emitEvent = true) {
  videoGridPage.classList.add('hidden');
  playerPage.classList.remove('hidden');
  playingTitle.textContent = video.title;
  customPlayPauseBtn.textContent = '▶ Oynat';

  if (player && player.cueVideoById) {
    player.cueVideoById(video.id);
    setTimeout(() => {
      if (currentRoomId) {
        socket.emit('video-ready-to-play', { roomId: currentRoomId });
      }
    }, 1000);
  }

  if (emitEvent && currentRoomId) {
    socket.emit('video-control', { roomId: currentRoomId, action: 'SELECT', videoId: video.id, title: video.title });
  }
}

btnBackHome.onclick = () => goHome(true);

function goHome(emitEvent = true) {
  playerPage.classList.add('hidden');
  videoGridPage.classList.remove('hidden');
  if (player && typeof player.stopVideo === 'function') player.stopVideo();

  if (emitEvent && currentRoomId) {
    socket.emit('video-control', { roomId: currentRoomId, action: 'HOME' });
  }
}

socket.on('peer-video-control', (data) => {
  if (data.action === 'SELECT') {
    videoGridPage.classList.add('hidden');
    playerPage.classList.remove('hidden');
    playingTitle.textContent = data.title;
    customPlayPauseBtn.textContent = '▶ Oynat';
    if (player && player.cueVideoById) {
      player.cueVideoById(data.videoId);
      setTimeout(() => {
        if (currentRoomId) {
          socket.emit('video-ready-to-play', { roomId: currentRoomId });
        }
      }, 1000);
    }
  } else if (data.action === 'HOME') {
    goHome(false);
  }
});

// İmleç Takibi ve Pencere Dışı (Mouseleave) Kontrolü
window.addEventListener('mousemove', (e) => {
  if (!currentRoomId) return;
  const xRatio = e.clientX / window.innerWidth;
  const yRatio = e.clientY / window.innerHeight;
  const scrollY = mainScrollLayout.scrollTop;

  socket.emit('mouse-move', { roomId: currentRoomId, xRatio, yRatio, scrollY, visible: true });
});

document.addEventListener('mouseleave', () => {
  if (!currentRoomId) return;
  socket.emit('mouse-move', { roomId: currentRoomId, visible: false });
});

socket.on('peer-mouse-move', (data) => {
  if (!data.visible) {
    peerCursor.classList.add('hidden');
    return;
  }

  peerCursor.classList.remove('hidden');
  const targetX = data.xRatio * window.innerWidth;
  const targetY = (data.yRatio * window.innerHeight) + data.scrollY;
  peerCursor.style.transform = `translate(${targetX}px, ${targetY}px)`;
});

socket.on('error-msg', (msg) => alert(msg));