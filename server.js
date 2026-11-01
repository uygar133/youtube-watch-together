const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const yts = require('yt-search');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Güvenli dosya yolu
app.use(express.static(path.join(__dirname, 'public')));

const users = {}; 

async function getRandomSuggestedVideos() {
    const randomKeywords = ['trending music', 'popular gameplay', 'lofi hip hop', 'tech review', 'nature 4k'];
    const query = randomKeywords[Math.floor(Math.random() * randomKeywords.length)];
    try {
        const r = await yts(query);
        return r.videos.slice(0, 10).map(v => ({
            id: v.videoId,
            title: v.title,
            thumbnail: v.thumbnail
        }));
    } catch (e) {
        console.error("Rastgele video hatası:", e);
        return [];
    }
}

io.on('connection', (socket) => {
    const userCode = Math.floor(100000 + Math.random() * 900000).toString();
    users[socket.id] = { code: userCode, roomId: null };
    
    socket.emit('init-user', { code: userCode });

    socket.on('send-request', ({ targetCode }) => {
        const targetSocketId = Object.keys(users).find(id => users[id].code === targetCode);
        if (targetSocketId && targetSocketId !== socket.id) {
            io.to(targetSocketId).emit('incoming-request', {
                fromId: socket.id,
                fromCode: userCode
            });
        }
    });

    socket.on('accept-request', async ({ fromId }) => {
        const roomId = `room_${fromId}_${socket.id}`;
        users[socket.id].roomId = roomId;
        if (users[fromId]) users[fromId].roomId = roomId;

        socket.join(roomId);
        const fromSocket = io.sockets.sockets.get(fromId);
        if (fromSocket) fromSocket.join(roomId);

        const defaultVideos = await getRandomSuggestedVideos();
        io.to(roomId).emit('room-ready', { roomId, videos: defaultVideos });
    });

    socket.on('search-query', async ({ roomId, query }) => {
        try {
            const r = await yts(query);
            const videos = r.videos.slice(0, 10).map(v => ({
                id: v.videoId,
                title: v.title,
                thumbnail: v.thumbnail
            }));
            io.to(roomId).emit('search-results', { videos });
        } catch (err) {
            console.error("Arama hatası:", err);
            io.to(roomId).emit('search-results', { videos: [] });
        }
    });

    socket.on('play-video', ({ roomId, videoId, state, time }) => {
        io.to(roomId).emit('sync-play-video', { videoId, state, time });
    });

    socket.on('mouse-move', ({ roomId, xRatio, yRatio }) => {
        socket.to(roomId).emit('remote-mouse-move', {
            senderId: socket.id,
            userCode: users[socket.id]?.code || 'Partner',
            xRatio,
            yRatio
        });
    });

    socket.on('sync-scroll', ({ roomId, scrollTopRatio }) => {
        socket.to(roomId).emit('remote-scroll', { scrollTopRatio });
    });

    socket.on('sync-fullscreen', ({ roomId, isFullscreen }) => {
        socket.to(roomId).emit('remote-fullscreen', { isFullscreen });
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
// YEREL GÜVENLİK: Sadece localhost (127.0.0.1) üzerinden dinler, dış ağlara kapalıdır.
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Sunucu http://127.0.0.1:${PORT} üzerinde çalışıyor.`);
});