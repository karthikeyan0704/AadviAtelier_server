import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';


import authRoutes from './routes/authRoute.js';
import customerRoutes from './routes/customerRoute.js';
import orderRoutes from './routes/orderRoute.js';

dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true })); 

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.get('/', (req, res) => {
  res.send('Aadvi Atelier API is running...');
});

// Global error handler to catch Multer and other unhandled errors
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ message: err.message || 'Internal Server Error', error: err });
});

// Force restart


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in development mode on port ${PORT}`);
});

export default app;
// trigger restart
