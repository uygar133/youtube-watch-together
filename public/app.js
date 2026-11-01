const socket = io();

let currentRoomId = null;
let player = null;
let isControlledByServer = false;
let activeVideoId = null;
let isPlayerReady = false;

function onYouTubeIframeAPIReady() {
    console.log("YouTube Iframe API Hazır.");
}

function createPlayer(videoId, callback) {
    const wrapper = document.getElementById('player-wrapper');
    if (wrapper) wrapper.style.display = 'block';

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
            'controls': 1,
            'enablejsapi': 1,
            'origin': window.location.origin
        },
        events: {
            'onReady': (event) => {
                isPlayerReady = true;
                if (callback) callback();
            },
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(event) {
    if (isControlledByServer) return;
    if (!activeVideoId || !isPlayerReady) return;

    if (event.data === YT.PlayerState.PLAYING) {
        player.pauseVideo(); 

        socket.emit('play-video', {
            roomId: currentRoomId,
            videoId: activeVideoId,
            state: 'PLAY',
            time: player.getCurrentTime()
        });
    } 
    else if (event.data === YT.PlayerState.PAUSED) {
        socket.emit('play-video', {
            roomId: currentRoomId,
            videoId: activeVideoId,
            state: 'PAUSE',
            time: player.getCurrentTime()
        });
    }
}

socket.on('init-user', (data) => {
    const codeEl = document.getElementById('myCode');
    if (codeEl) codeEl.textContent = data.code;
});

function sendConnectionRequest() {
    const targetCode = document.getElementById('targetCodeInput').value.trim();
    if (!targetCode) {
        alert("Lütfen bir kod girin!");
        return;
    }
    socket.emit('send-request', { targetCode });
    alert("Bağlantı isteği gönderildi...");
}

socket.on('incoming-request', (data) => {
    const requestsContainer = document.getElementById('incoming-requests');
    if (!requestsContainer) return;

    requestsContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px;">
            <p><strong>${data.fromCode}</strong> kodlu kullanıcıdan oda isteği!</p>
            <button onclick="acceptRequest('${data.fromId}')" style="background: #4CAF50;">Kabul Et</button>
        </div>
    `;
});

function acceptRequest(fromId) {
    socket.emit('accept-request', { fromId });
}

socket.on('room-ready', (data) => {
    currentRoomId = data.roomId;

    document.getElementById('connection-section').style.display = 'none';
    document.getElementById('requests-section').style.display = 'none';
    document.getElementById('room-section').style.display = 'block';

    renderVideoList(data.videos);
});

socket.on('search-results', (data) => {
    renderVideoList(data.videos);
});

function renderVideoList(videos) {
    const container = document.getElementById('video-list');
    if (!container) return;

    if (!videos || videos.length === 0) {
        container.innerHTML = '<p style="color: #888; grid-column: span 4; text-align: center;">Video bulunamadı.</p>';
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

function searchVideos() {
    const query = document.getElementById('searchInput').value.trim();
    if (query && currentRoomId) {
        socket.emit('search-query', { roomId: currentRoomId, query: query });
    }
}

// 30 Saniye Tolerans Eşiği ile Senkronizasyon
socket.on('sync-play-video', (data) => {
    activeVideoId = data.videoId;
    isControlledByServer = true;

    createPlayer(data.videoId, () => {
        if (data.state === 'PLAY') {
            const localTime = player.getCurrentTime();
            const timeDifference = Math.abs(localTime - data.time);

            // Fark 30 saniyeden büyükse zamanı eşitle (seek), küçükse akışa bırak
            if (timeDifference > 30.0) {
                player.seekTo(data.time, true);
            }
            
            player.playVideo();

            setTimeout(() => { 
                isControlledByServer = false; 
            }, 2000);
        } 
        else if (data.state === 'PAUSE') {
            player.pauseVideo();
            player.seekTo(data.time, true);

            setTimeout(() => { 
                isControlledByServer = false; 
            }, 2000);
        }
    });
});