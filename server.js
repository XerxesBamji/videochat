const express = require('express');
const { createServer } = require('http');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = createServer(app);

// No-cache headers so dev changes are always picked up
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// PeerJS signaling server mounted at /peerjs
const peerServer = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: false,
  // Trust Render.com / other reverse proxy headers
  proxied: process.env.NODE_ENV === 'production'
});

app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
  console.log('[PeerJS] Connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
  console.log('[PeerJS] Disconnected:', client.getId());
});

// Health check endpoint (keeps Render free tier awake)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ Video call server running at http://localhost:${PORT}`);
  console.log(`   PeerJS signaling at http://localhost:${PORT}/peerjs\n`);
});
