const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files — no-cache so dev changes are always picked up
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});
app.use(express.static(path.join(__dirname)));

// Rooms: { roomId: { [peerId]: ws } }
const rooms = {};

function generatePeerId() {
  return Math.random().toString(36).substring(2, 10);
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let peerId = generatePeerId();
  let peerLang = 'en';

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'join': {
        const roomId = msg.roomId;
        peerLang = msg.lang || 'en';
        currentRoom = roomId;

        if (!rooms[roomId]) rooms[roomId] = {};

        const peers = Object.keys(rooms[roomId]);
        if (peers.length >= 2) {
          ws.send(JSON.stringify({ type: 'room-full' }));
          return;
        }

        rooms[roomId][peerId] = { ws, lang: peerLang };

        // Tell this peer their ID and who is already in the room
        ws.send(JSON.stringify({ type: 'joined', peerId, isInitiator: peers.length === 1 }));

        // Notify the other peer if there is one
        if (peers.length === 1) {
          const otherPeerId = peers[0];
          const other = rooms[roomId][otherPeerId];
          if (other && other.ws.readyState === WebSocket.OPEN) {
            other.ws.send(JSON.stringify({ type: 'peer-joined', peerId, lang: peerLang }));
          }
          // Also tell the new peer about the existing one
          ws.send(JSON.stringify({ type: 'peer-joined', peerId: otherPeerId, lang: other.lang }));
        }
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        if (!currentRoom || !rooms[currentRoom]) return;
        // Forward to all other peers in the room
        for (const [id, peer] of Object.entries(rooms[currentRoom])) {
          if (id !== peerId && peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({ ...msg, fromPeerId: peerId }));
          }
        }
        break;
      }

      case 'chat': {
        if (!currentRoom || !rooms[currentRoom]) return;
        // Broadcast to everyone in the room including sender
        for (const [id, peer] of Object.entries(rooms[currentRoom])) {
          if (peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({
              type: 'chat',
              text: msg.text,
              lang: peerLang,
              fromPeerId: peerId,
              isSelf: id === peerId
            }));
          }
        }
        break;
      }

      case 'leave': {
        handleLeave();
        break;
      }
    }
  });

  function handleLeave() {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom][peerId];
      // Notify remaining peers
      for (const [id, peer] of Object.entries(rooms[currentRoom])) {
        if (peer.ws.readyState === WebSocket.OPEN) {
          peer.ws.send(JSON.stringify({ type: 'peer-left' }));
        }
      }
      if (Object.keys(rooms[currentRoom]).length === 0) {
        delete rooms[currentRoom];
      }
    }
  }

  ws.on('close', handleLeave);
  ws.on('error', (err) => {
    console.error('WS error:', err.message);
    handleLeave();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ Video call server running at http://localhost:${PORT}`);
  console.log(`   Share this link or use ngrok to expose it remotely.\n`);
});
