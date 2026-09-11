const express = require('express');
const { createServer } = require('http');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = createServer(app);

// CORS and No-cache headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Online peers presence set
const onlinePeers = new Set();

// PeerJS signaling server mounted at /peerjs
const peerServer = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: false,
  proxied: process.env.NODE_ENV === 'production',
  alive_timeout: 2000,    // free dead peer slots within 2s of disconnect
  expire_timeout: 5000    // clean up peers that never opened a connection
});

app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
  const id = client.getId();
  onlinePeers.add(id);
  console.log('[PeerJS] Connected:', id, '| Online total:', onlinePeers.size);
});

peerServer.on('disconnect', (client) => {
  const id = client.getId();
  onlinePeers.delete(id);
  console.log('[PeerJS] Disconnected:', id, '| Online total:', onlinePeers.size);
});

// Presence endpoint
app.get('/api/presence', (req, res) => {
  res.json({ online: Array.from(onlinePeers) });
});

// Health check endpoint (keeps Render free tier awake)
app.get('/health', (req, res) => res.json({ status: 'ok', onlineCount: onlinePeers.size }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ Video call server running at http://localhost:${PORT}`);
  console.log(`   PeerJS signaling at http://localhost:${PORT}/peerjs\n`);
});
