import agent from '@convex-dev/agent/convex.config';
import migrations from '@convex-dev/migrations/convex.config.js';
import presence from '@convex-dev/presence/convex.config.js';
import { defineApp } from 'convex/server';
import betterAuth from './betterAuth/convex.config';

const app = defineApp();

app.use(agent);
app.use(betterAuth);
app.use(migrations);
app.use(presence);

export default app;
