/**
 * server.js — updated with crowd system routes
 */

const express = require('express');
const cors    = require('cors');
const db      = require('./src/config/db');
const app     = express();

app.use(cors());
app.use(express.json());

const safetyRoutes = require('./src/routes/safetyRoutes');
const routeRoutes  = require('./src/routes/routeRoutes');
const userRoutes   = require('./src/routes/userRoutes');

app.use('/api/safety', safetyRoutes);
app.use('/api/route',  routeRoutes);
app.use('/api/users',  userRoutes);

app.get('/', (req, res) => res.send('Safe Route API Running ✅'));

app.get('/test-db', async (req, res) => {
    try { await db.query('SELECT 1'); res.send('DB Connected ✅'); }
    catch (err) { res.status(500).send(err.message); }
});

const { computeAndStoreSafetyScores } = require('./src/services/safetyService');
const PORT = 5000;

app.listen(PORT, async () => {
    console.log(`\n🚀 Server on port ${PORT}`);
    console.log('─────────────────────────────────────────');
    try {
        console.log('Computing safety scores...');
        await computeAndStoreSafetyScores();
        console.log('✅ Safety scores ready\n');
    } catch (err) {
        console.error('❌ Safety score error:', err.message);
    }
    console.log('Endpoints:');
    console.log(`  GET  /api/safety/scores`);
    console.log(`  GET  /api/safety/compute`);
    console.log(`  GET  /api/route?startX=&startY=&endX=&endY=&algorithm=G_DirA`);
    console.log(`  GET  /api/route?...&userId=<id>&algorithm=G_ItA   (crowd mode)`);
    console.log(`  GET  /api/users`);
    console.log(`  POST /api/users/register`);
    console.log(`  POST /api/users/checkin`);
    console.log(`\nTo seed crowd users: node src/seeds/seedUsers.js`);
    console.log('─────────────────────────────────────────\n');
});
