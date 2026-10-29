const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const users = {}; 
const codes = {}; 
const rooms = {}; 

const searchKeywords = [
  'gaming 2026', 'technology news', 'lofi hip hop radio', 'nature 4k documentary',
  'science secrets', 'coding tutorial', 'funny cats dogs', 'space exploration'
];

function generateCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (codes[code]);
  return code;
}

async function fetchYouTubeVideos(query = null) {
  const keyword = query || searchKeywords[Math.floor(Math.random() * searchKeywords.length)];

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = response.data;
    const ytInitialDataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/);
    if (!ytInitialDataMatch) return getFallbackVideos();

    const ytInitialData = JSON.parse(ytInitialDataMatch[1]);
    const contents = ytInitialData.contents
      ?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents?.[0]
      ?.itemSectionRenderer?.contents;

    if (!contents) return getFallbackVideos();

    let videos = [];
    for (let item of contents) {
      if (item.videoRenderer) {
        const v = item.videoRenderer;
        const videoId = v.videoId;
        const title = v.title?.runs?.[0]?.text;
        const thumbnail = v.thumbnail?.thumbnails?.[v.thumbnail.thumbnails.length - 1]?.url;

        if (videoId && title) {
          videos.push({ id: videoId, title, thumbnail: thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` });
        }
      }
    }

    return videos.length > 0 ? videos : getFallbackVideos();
  } catch (error) {
    return getFallbackVideos();
  }
}

function getFallbackVideos() {
  return [
    { id: 'jfKfPfyJRdk', title: 'Lofi Hip Hop Radio - Beats to Relax/Study', thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg' },
    { id: 'L_LUpnjgPso', title: '4K Relaxing Ocean Life Animation', thumbnail: 'https://img.youtube.com/vi/L_LUpnjgPso/hqdefault.jpg' }
  ];
}

io.on('connection', (socket) => {
  const userCode = generateCode();
  users[socket.id] = { id: socket.id, code: userCode };
  codes[userCode] = socket.id;

  socket.emit('init-user', { code: userCode });

  socket.on('send-request', ({ targetCode }) => {
    const targetSocketId = codes[targetCode];
    if (targetSocketId && targetSocketId !== socket.id) {
      io.to(targetSocketId).emit('incoming-request', { fromCode: userCode, fromId: socket.id });
    } else {
      socket.emit('error-msg', 'Geçersiz veya bulunamayan kod!');
    }
  });

  // Bağlantı Kabulü ve Oda Kurulumu
  socket.on('accept-request', async ({ fromId }) => {
    const roomId = `room_${socket.id}_${fromId}`;
    
    socket.join(roomId);
    const peerSocket = io.sockets.sockets.get(fromId);
    if (peerSocket) {
      peerSocket.join(roomId);
    }

    rooms[roomId] = { users: [socket.id, fromId], pageIndex: 0, readyCount: 0 };
    const initialVideos = await fetchYouTubeVideos();

    // İki tarafa da odanın kurulduğunu bildir
    io.to(roomId).emit('room-ready', { roomId, videos: initialVideos });
  });

  socket.on('search-query', async ({ roomId, query }) => {
    const searchResults = await fetchYouTubeVideos(query);
    io.to(roomId).emit('search-results', { query, videos: searchResults });
  });

  socket.on('load-more-videos', async ({ roomId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].pageIndex += 1;
    const moreVideos = await fetchYouTubeVideos(searchKeywords[rooms[roomId].pageIndex % searchKeywords.length]);
    io.to(roomId).emit('append-more-videos', { videos: moreVideos });
  });

  socket.on('video-control', ({ roomId, action, videoId, title }) => {
    if (action === 'SELECT') {
      if (rooms[roomId]) rooms[roomId].readyCount = 0;
    }
    io.to(roomId).emit('peer-video-control', { action, videoId, title });
  });

  socket.on('video-ready-to-play', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.readyCount = (room.readyCount || 0) + 1;
    if (room.readyCount >= 2) {
      room.readyCount = 0;
      const startTimestamp = Date.now() + 3000;
      io.to(roomId).emit('execute-synchronized-start', { startTimestamp });
    }
  });

  socket.on('player-state-change', ({ roomId, state, time }) => {
    const executeAt = Date.now() + 1000;
    io.to(roomId).emit('peer-player-state-change', { state, time, executeAt });
  });

  socket.on('mouse-move', ({ roomId, xRatio, yRatio, scrollY }) => {
    socket.to(roomId).emit('peer-mouse-move', { xRatio, yRatio, scrollY });
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      delete codes[user.code];
      delete users[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu aktif: http://localhost:${PORT}`);
});