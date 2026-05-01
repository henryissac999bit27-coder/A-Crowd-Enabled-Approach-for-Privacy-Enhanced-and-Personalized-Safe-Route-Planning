/**
 * server.js — with Federated Learning endpoints
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
const flRoutes     = require('./src/routes/flRoutes');
const rtreeRoutes  = require('./src/routes/rtreeRoutes');
const authRoutes   = require('./src/routes/authRoutes');

app.use('/api/safety', safetyRoutes);
app.use('/api/route',  routeRoutes);
app.use('/api/users',  userRoutes);
app.use('/api/fl',     flRoutes);
app.use('/api/rtree',  rtreeRoutes);
app.use('/api/auth',   authRoutes);        // ← Federated Learning endpoints

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
        console.error('❌ Error:', err.message);
    }
    console.log('Standard endpoints:');
    console.log(`  GET  /api/safety/scores`);
    console.log(`  GET  /api/route?startX=&startY=&endX=&endY=&algorithm=G_DirA`);
    console.log(`  GET  /api/users
  GET  /api/rtree/stats   (R-tree compression stats)
  POST /api/auth/register
  POST /api/auth/login
  GET  /api/auth/me       (protected)`);
    console.log('');
    console.log('Federated Learning endpoints (NOVELTY):');
    console.log(`  POST /api/fl/round       → run FL round (FedAvg)`);
    console.log(`  GET  /api/fl/status      → global model + history`);
    console.log(`  GET  /api/fl/beta?userId=&crimeCount=&hour= → personalized β`);
    console.log('');
    console.log('Setup order:');
    console.log('  1. node src/seeds/seedUsers.js');
    console.log('  2. POST /api/fl/round  (run 3-5 times)');
    console.log('  3. GET  /api/fl/status (verify convergence)');
    console.log('─────────────────────────────────────────\n');
});
