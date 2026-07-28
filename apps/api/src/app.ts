import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import path from 'node:path';

import { errorHandler } from './middleware/errorHandler.js';
import { HttpError } from './lib/httpError.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import contactRoutes from './routes/contact.js';
import deviceRoutes from './routes/devices.js';
import driverRoutes from './routes/drivers.js';
import galleryRoutes from './routes/gallery.js';
import paymentRoutes from './routes/payments.js';
import rideRoutes from './routes/rides.js';

export const app = express();

const corsOrigin = process.env.CORS_ORIGIN ?? '*';
const httpLogFormat = process.env.HTTP_LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'combined' : 'dev');

app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(','), credentials: true }));
app.use(morgan(httpLogFormat));
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'jo-transportation-api' });
});

app.use('/auth', authRoutes);
app.use('/contact', contactRoutes);
app.use('/devices', deviceRoutes);
app.use('/admin', adminRoutes);
app.use('/gallery', galleryRoutes);
app.use('/drivers', driverRoutes);
app.use('/payments', paymentRoutes);
app.use('/rides', rideRoutes);

app.use((_req, _res, next) => {
  next(new HttpError(404, 'Not found'));
});

app.use(errorHandler);
