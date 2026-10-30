const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const yts = require('yt-search'); // YouTube'dan anlık arama için

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Public klasörünü statik olarak dışarı açıyoruz
app.use(express.static(path.join(__dirname, 'public')));

// Ana sayfa isteği geldiğinde public klasöründeki index.html dosyasını gönderir
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Kullanıcıları ve odaları takip etmek için sözlükler
const users = {}; // socket.id -> code
const rooms = {}; // roomId -> [socketId1, socketId2]

// 6 haneli rastgele kod üretici
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Socket.io bağlantı ve olayları
io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    // 1. Kullanıcıya özel 6 haneli kod üret ve gönder
    let code = generateCode();
    while (Object.values(users).includes(code)) {
        code = generateCode();
    }
    users[socket.id] = code;
    socket.emit('init-user', { code: code });

    // 2. Başka bir kullanıcıya bağlantı isteği gönderme
    socket.on('send-request', ({ targetCode }) => {
        const targetSocketId = Object.keys(users).find(id => users[id] === targetCode);
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming-request', {
                fromCode: users[socket.id],
                fromId: socket.id
            });
        }
    });

    // 3. Bağlantı isteğini kabul etme
    socket.on('accept-request', ({ fromId }) => {
        const roomId = 'room_' + socket.id + '_' + fromId;
        socket.join(roomId);
        
        const targetSocket = io.sockets.sockets.get(fromId);
        if (targetSocket) {
            targetSocket.join(roomId);
        }

        rooms[roomId] = [socket.id, fromId];

        // İki tarafa da odanın hazır olduğunu bildir
        io.to(roomId).emit('room-ready', { roomId, videos: [] });
    });

    // 4. YouTube'dan Anlık Arama Yapma
    socket.on('search-query', async ({ roomId, query }) => {
        try {
            const r = await yts(query);
            const videos = r.videos.slice(0, 15).map(v => ({
                id: v.videoId,
                title: v.title,
                thumbnail: v.thumbnail
            }));

            socket.emit('search-results', { query, videos });
        } catch (error) {
            console.error('Arama hatası:', error);
            socket.emit('error-msg', 'Arama yapılırken bir hata oluştu.');
        }
    });

    // 5. Oynat / Durdur / Senkronizasyon Olayları
    socket.on('player-state-change', (data) => {
        const executeAt = Date.now() + 1000; // 1 saniye gecikme payı
        socket.to(data.roomId).emit('peer-player-state-change', {
            state: data.state,
            time: data.time,
            executeAt: executeAt
        });
    });

    socket.on('video-control', (data) => {
        socket.to(data.roomId).emit('peer-video-control', data);
    });

    socket.on('mouse-move', (data) => {
        socket.to(data.roomId).emit('peer-mouse-move', data);
    });

    // 6. Bağlantı kopması
    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});