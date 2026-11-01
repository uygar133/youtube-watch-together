const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const yts = require('yt-search');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const users = {}; 
const rooms = {}; 

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function searchYouTube(query) {
    try {
        console.log(`---> YouTube'dan canlı çekiliyor: "${query}"`);
        const r = await yts(query);
        
        const videos = (r.videos || []).slice(0, 20).map(v => ({
            id: v.videoId || '',
            title: v.title || 'İsimsiz Video',
            thumbnail: v.thumbnail || ''
        })).filter(v => v.id);

        return videos;
    } catch (error) {
        console.error('*** YouTube arama hatası:', error.message);
        return [];
    }
}

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    let code = generateCode();
    while (Object.values(users).includes(code)) {
        code = generateCode();
    }
    users[socket.id] = code;
    socket.emit('init-user', { code: code });

    socket.on('send-request', ({ targetCode }) => {
        const targetSocketId = Object.keys(users).find(id => users[id] === targetCode);
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming-request', {
                fromCode: users[socket.id],
                fromId: socket.id
            });
        }
    });

    socket.on('accept-request', async ({ fromId }) => {
        const roomId = 'room_' + socket.id + '_' + fromId;
        socket.join(roomId);
        
        const targetSocket = io.sockets.sockets.get(fromId);
        if (targetSocket) {
            targetSocket.join(roomId);
        }

        rooms[roomId] = [socket.id, fromId];

        const liveHomepageVideos = await searchYouTube('trending music');
        io.to(roomId).emit('room-ready', { roomId, videos: liveHomepageVideos });
    });

    socket.on('search-query', async ({ roomId, query }) => {
        const videos = await searchYouTube(query);
        io.to(roomId).emit('search-results', { query, videos });
    });

    // Zaman bilgisine (time) 2.5 saniye ofset ekleyerek paketleyen kısım
    socket.on('play-video', (data) => {
        const targetTime = (parseFloat(data.time) || 0) + 2.5; 

        io.to(data.roomId).emit('sync-play-video', {
            videoId: data.videoId,
            time: targetTime, 
            state: data.state
        });
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});