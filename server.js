const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Public klasörünü statik olarak dışarı açıyoruz
app.use(express.static(path.join(__dirname, 'public')));

// Ana sayfa isteği geldiğinde public klasöründeki index.html dosyasını gönderir
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io bağlantı ve olayları
io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    // YouTube video senkronizasyon olayları (kendi projene göre buraları düzenlemişsindir)
    socket.on('play-video', (data) => {
        socket.broadcast.emit('play-video', data);
    });

    socket.on('pause-video', (data) => {
        socket.broadcast.emit('pause-video', data);
    });

    socket.on('seek-video', (data) => {
        socket.broadcast.emit('seek-video', data);
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

// Vercel, portu kendi otomatik ayarlar, yerelde ise 3000 portunu kullanır
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});