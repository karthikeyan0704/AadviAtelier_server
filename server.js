import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';


import authRoutes from './routes/authRoute.js';
import customerRoutes from './routes/customerRoute.js';
import orderRoutes from './routes/orderRoute.js';
import notificationRoutes from './routes/notificationRoute.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

app.use(helmet());
app.use(compression());

app.use(cors({
  origin: [
    'https://aadvi-atelier-server.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true })); 

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 200,                  
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,                   
  message: { message: 'Too many login attempts, please try again later' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/refresh', authLimiter);
app.use('/api', generalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.get('/', (req, res) => {
  res.send('Aadvi Atelier API is running...');
});

// Global error handler to catch Multer and other unhandled errors
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err);
  const isDev = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).json({ 
    message: isDev ? err.message : 'Internal Server Error'
  });
});

// Force restart


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in development mode on port ${PORT}`);
});

export default app;
// trigger restart
