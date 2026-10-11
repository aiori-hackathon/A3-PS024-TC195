import express from 'express';
import { CONFIG } from '../shared/config.js';
import path from 'node:path';

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve static dashboard
app.use(express.static(path.join(import.meta.dirname, '../public')));

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/protected', (req, res) => {
    res.json({ data: 'This is the secret article you wanted.' });
});

app.post('/protected', (req, res) => {
    res.json({ data: 'This is the secret article you wanted.' });
});

app.listen(CONFIG.ORIGIN_PORT, () => {
    console.log(`Origin server running on http://localhost:${CONFIG.ORIGIN_PORT}`);
    console.log(`Dashboard available at http://localhost:${CONFIG.ORIGIN_PORT}`);
});
