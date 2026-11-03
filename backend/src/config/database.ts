import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDatabase = async (): Promise<typeof mongoose> => {
  try {
    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB connection established');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    const conn = await mongoose.connect(env.MONGO_URI, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000
    });

    return conn;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error instanceof Error ? error.message : error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed cleanly');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error instanceof Error ? error.message : error);
  }
};
