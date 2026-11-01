const socket = io();

let currentRoomId = null;
let player = null;
let isControlledByServer = false;
let activeVideoId = null;
let isPlayerReady = false;
let isPlayingState = false;
let uiTimeout = null;

// Fare hareketine göre özel UI'ı gösteren ve 3s sonra gizleyen mekanizma
function showUIControls() {
    const overlay = document.getElementById('custom-controls-overlay');
    if (!overlay) return;

    overlay.classList.add('active');

    if (uiTimeout) clearTimeout(uiTimeout);

    uiTimeout = setTimeout(() => {
        overlay.classList.remove('active');
    }, 3000);
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        togglePlayPause();
    }
});

function showLoading(msg = "Lütfen bekleyin...") {
    document.getElementById('loading-text').textContent = msg;
    document.getElementById('loading-overlay').style.display = 'flex';
}
function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function onYouTubeIframeAPIReady() {
    console.log("YouTube API Hazır.");
}

function createPlayer(videoId, callback) {
    document.getElementById('player-container').style.display = 'block';
    
    const setupCard = document.getElementById('setup-card');
    if (setupCard) setupCard.style.display = 'none';

    if (player && typeof player.loadVideoById === 'function') {
        isPlayerReady = false;
        player.loadVideoById(videoId);
        setTimeout(() => {
            isPlayerReady = true;
            if (callback) callback();
        }, 1000);
        return;
    }

    player = new YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'iv_load_policy': 3,
            'rel': 0,
            'modestbranding': 1,
            'enablejsapi': 1,
            'origin': window.location.origin
        },
        events: {
            'onReady': (event) => {
                isPlayerReady = true;
                if (callback) callback();
            }
        }
    });
}

function togglePlayPause() {
    if (!player || !isPlayerReady || !currentRoomId) return;

    if (isPlayingState) {
        socket.emit('play-video', {
            roomId: currentRoomId,
            videoId: activeVideoId,
            state: 'PAUSE',
            time: player.getCurrentTime()
        });
    } else {
        socket.emit('play-video', {
            roomId: currentRoomId,
            videoId: activeVideoId,
            state: 'PLAY',
            time: player.getCurrentTime()
        });
    }
}

function toggleCustomFullscreen() {
    const playerWrapper = document.getElementById('player-wrapper');
    if (!document.fullscreenElement) {
        playerWrapper.requestFullscreen().catch(err => console.log(err));
    } else {
        document.exitFullscreen().catch(err => console.log(err));
    }
}

socket.on('init-user', (data) => {
    document.getElementById('myCode').textContent = data.code;
});

function sendConnectionRequest() {
    const targetCode = document.getElementById('targetCodeInput').value.trim();
    if (!targetCode) {
        alert("Lütfen bir kod girin!");
        return;
    }
    showLoading("İstek gönderiliyor...");
    socket.emit('send-request', { targetCode });
}

socket.on('incoming-request', (data) => {
    hideLoading();
    const container = document.getElementById('incoming-requests');
    if (!container) return;
    container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
            <p><strong>${data.fromCode}</strong> seninle video izlemek istiyor!</p>
            <button onclick="acceptRequest('${data.fromId}')" style="background: #4CAF50;">Kabul Et</button>
        </div>
    `;
});

function acceptRequest(fromId) {
    showLoading("Oda kuruluyor...");
    socket.emit('accept-request', { fromId });
}

socket.on('room-ready', (data) => {
    hideLoading();
    currentRoomId = data.roomId;

    document.getElementById('setup-card').style.display = 'none';
    document.getElementById('connection-section').style.display = 'none';
    document.getElementById('requests-section').style.display = 'none';
    document.getElementById('room-section').style.display = 'block';

    document.getElementById('list-title').textContent = "Önerilen Videolar";
    renderVideoList(data.videos);
});

function searchVideos() {
    const query = document.getElementById('searchInput').value.trim();
    if (query && currentRoomId) {
        showLoading("YouTube'da aranıyor...");
        document.getElementById('player-container').style.display = 'none';
        document.getElementById('list-title').textContent = `"${query}" Arama Sonuçları`;
        socket.emit('search-query', { roomId: currentRoomId, query });
    }
}

socket.on('search-results', (data) => {
    hideLoading();
    renderVideoList(data.videos);
});

function renderVideoList(videos) {
    const container = document.getElementById('video-list');
    if (!container) return;

    if (!videos || videos.length === 0) {
        container.innerHTML = '<p style="color: #888; text-align: center;">Video bulunamadı.</p>';
        return;
    }

    container.innerHTML = '';
    videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}">
            <p>${video.title}</p>
        `;
        card.onclick = () => {
            showLoading("Video açılıyor...");
            activeVideoId = video.id;
            socket.emit('play-video', {
                roomId: currentRoomId,
                videoId: video.id,
                state: 'PLAY',
                time: 0
            });
        };
        container.appendChild(card);
    });
}

socket.on('sync-play-video', (data) => {
    activeVideoId = data.videoId;
    isControlledByServer = true;
    const btnIcon = document.getElementById('play-btn-icon');

    createPlayer(data.videoId, () => {
        hideLoading();
        showUIControls(); // Video açıldığında UI'ı göster

        if (data.state === 'PLAY') {
            const localTime = player.getCurrentTime();
            
            // Tolerans süresi 15 saniyeye düşürüldü
            if (Math.abs(localTime - data.time) > 15.0) {
                player.seekTo(data.time, true);
            }
            player.playVideo();
            isPlayingState = true;
            if (btnIcon) btnIcon.textContent = "❚❚";
            
            setTimeout(() => { isControlledByServer = false; }, 2000);
        } else if (data.state === 'PAUSE') {
            player.pauseVideo();
            player.seekTo(data.time, true);
            isPlayingState = false;
            if (btnIcon) btnIcon.textContent = "▶";
            
            setTimeout(() => { isControlledByServer = false; }, 2000);
        }
    });
});

// Kendi fare hareketin
window.addEventListener('mousemove', (e) => {
    showUIControls();

    if (!currentRoomId) return;
    const xRatio = e.clientX / window.innerWidth;
    const yRatio = e.clientY / window.innerHeight;
    socket.emit('mouse-move', { roomId: currentRoomId, xRatio, yRatio });
});

// Arkadaşının fare hareketi
socket.on('remote-mouse-move', (data) => {
    showUIControls();

    const cursor = document.getElementById('remote-cursor');
    const label = document.getElementById('remote-cursor-label');
    
    cursor.style.display = 'block';
    cursor.style.left = `${data.xRatio * window.innerWidth}px`;
    cursor.style.top = `${data.yRatio * window.innerHeight}px`;
    label.textContent = `Kod: ${data.userCode}`;
});

const listContainer = document.getElementById('video-list-container');
let isRemoteScrolling = false;

listContainer.addEventListener('scroll', () => {
    if (!currentRoomId || isRemoteScrolling) return;
    const scrollTopRatio = listContainer.scrollTop / (listContainer.scrollHeight - listContainer.clientHeight);
    socket.emit('sync-scroll', { roomId: currentRoomId, scrollTopRatio });
});

socket.on('remote-scroll', (data) => {
    if (!listContainer) return;
    isRemoteScrolling = true;
    listContainer.scrollTop = data.scrollTopRatio * (listContainer.scrollHeight - listContainer.clientHeight);
    setTimeout(() => { isRemoteScrolling = false; }, 100);
});

document.addEventListener('fullscreenchange', () => {
    if (!currentRoomId) return;
    const isFullscreen = !!document.fullscreenElement;
    socket.emit('sync-fullscreen', { roomId: currentRoomId, isFullscreen });
});

socket.on('remote-fullscreen', (data) => {
    if (data.isFullscreen) {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.log(err));
        }
    } else {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(err => console.log(err));
        }
    }
});