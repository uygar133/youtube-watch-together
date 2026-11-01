const socket = io();

let currentRoomId = null;
let player = null;
let isControlledByServer = false;
let activeVideoId = null;
let isPlayerReady = false;
let isPlayingState = false;
let uiTimeout = null;
let loadingTimeout = null;

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

function showLoading(msg = "Lütfen bekleyin...", timeoutMs = 10000) {
    document.getElementById('loading-text').textContent = msg;
    document.getElementById('loading-overlay').style.display = 'flex';

    if (loadingTimeout) clearTimeout(loadingTimeout);
    
    // Sonsuz yüklemede takılmayı önlemek için zaman aşımı
    loadingTimeout = setTimeout(() => {
        hideLoading();
    }, timeoutMs);
}

function hideLoading() {
    if (loadingTimeout) clearTimeout(loadingTimeout);
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
            },
            'onError': (event) => {
                hideLoading();
                alert("Bu video oynatılamıyor (Gömme izni yok veya engellenmiş). Lütfen başka bir video seçin.");
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
    showLoading("Bağlantı isteği gönderildi, karşı tarafın kabul etmesi bekleniyor...", 15000);
    socket.emit('send-request', { targetCode });
}

// XSS KORUMASI: innerHTML yerine güvenli DOM oluşturma (createElement, textContent)
socket.on('incoming-request', (data) => {
    hideLoading();
    const container = document.getElementById('incoming-requests');
    if (!container) return;
    
    container.innerHTML = ''; // Önceki istekleri temizle

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '10px';
    wrapper.style.marginTop = '10px';

    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = data.fromCode;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(' seninle video izlemek istiyor!'));

    const btn = document.createElement('button');
    btn.textContent = 'Kabul Et';
    btn.style.background = '#4CAF50';
    btn.onclick = () => acceptRequest(data.fromId);

    wrapper.appendChild(p);
    wrapper.appendChild(btn);
    container.appendChild(wrapper);
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

// XSS KORUMASI: Güvenli video liste oluşturucu
function renderVideoList(videos) {
    const container = document.getElementById('video-list');
    if (!container) return;

    container.innerHTML = '';

    if (!videos || videos.length === 0) {
        const p = document.createElement('p');
        p.style.color = '#888';
        p.style.textAlign = 'center';
        p.textContent = 'Video bulunamadı.';
        container.appendChild(p);
        return;
    }

    videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';

        const img = document.createElement('img');
        img.src = video.thumbnail;
        img.alt = video.title;

        const p = document.createElement('p');
        p.textContent = video.title;

        card.appendChild(img);
        card.appendChild(p);

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
        showUIControls();

        if (data.state === 'PLAY') {
            const localTime = player.getCurrentTime();
            
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

window.addEventListener('mousemove', (e) => {
    showUIControls();

    if (!currentRoomId) return;
    const xRatio = e.clientX / window.innerWidth;
    const yRatio = e.clientY / window.innerHeight;
    socket.emit('mouse-move', { roomId: currentRoomId, xRatio, yRatio });
});

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
    const maxScroll = listContainer.scrollHeight - listContainer.clientHeight;
    if (maxScroll <= 0) return; // Sıfıra bölme hatası (NaN) engellendi
    const scrollTopRatio = listContainer.scrollTop / maxScroll;
    socket.emit('sync-scroll', { roomId: currentRoomId, scrollTopRatio });
});

socket.on('remote-scroll', (data) => {
    if (!listContainer) return;
    const maxScroll = listContainer.scrollHeight - listContainer.clientHeight;
    if (maxScroll <= 0) return;
    isRemoteScrolling = true;
    listContainer.scrollTop = data.scrollTopRatio * maxScroll;
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