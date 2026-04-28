import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import { errorHandler } from './middleware/errorHandler.js';
import { HttpError } from './lib/httpError.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import driverRoutes from './routes/drivers.js';
import paymentRoutes from './routes/payments.js';
import rideRoutes from './routes/rides.js';

export const app = express();

const corsOrigin = process.env.CORS_ORIGIN ?? '*';
const httpLogFormat = process.env.HTTP_LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'combined' : 'dev');

app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(','), credentials: true }));
app.use(morgan(httpLogFormat));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'jo-transportation-api' });
});

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/drivers', driverRoutes);
app.use('/payments', paymentRoutes);
app.use('/rides', rideRoutes);

app.use((_req, _res, next) => {
  next(new HttpError(404, 'Not found'));
});

app.use(errorHandler);
