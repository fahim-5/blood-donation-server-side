import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import dotenv from 'dotenv';

// Import routes
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Colors for console logs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

// Security Middleware
app.use(helmet());
app.use(mongoSanitize());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static('public/uploads'));

// Routes
app.use('/api', routes);

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: '🎉 Welcome to Express MVC Backend!',
    version: '1.0.0',
    status: '🟢 Running',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      posts: '/api/posts'
    }
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: '✅ Server is healthy and running!',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `❌ Route ${req.originalUrl} not found`
  });
});

// Error handling middleware
app.use(errorHandler);

// Database connection
const connectDB = async () => {
  try {
    console.log(`\n${colors.cyan}🔄 Attempting to connect to MongoDB...${colors.reset}`);
    
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/express-mvc');
    
    console.log(`\n${colors.green}✅ ${colors.bright}MongoDB Connected Successfully!${colors.reset}`);
    console.log(`   ${colors.cyan}📊 Database:${colors.reset} ${conn.connection.name}`);
    console.log(`   ${colors.cyan}🏠 Host:${colors.reset} ${conn.connection.host}`);
    console.log(`   ${colors.cyan}🔌 Port:${colors.reset} ${conn.connection.port}`);
    console.log(`   ${colors.green}🗂️  Collections ready for use!${colors.reset}\n`);
    
    return conn;
  } catch (error) {
    console.log(`\n${colors.red}❌ ${colors.bright}Database Connection Failed!${colors.reset}`);
    console.log(`   ${colors.red}Error:${colors.reset} ${error.message}`);
    console.log(`   ${colors.yellow}💡 Tip: Make sure MongoDB is running on your system${colors.reset}`);
    console.log(`   ${colors.yellow}   You can start MongoDB with: 'mongod' command${colors.reset}\n`);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log(`\n${colors.green}🚀 ${colors.bright}Server Started Successfully!${colors.reset}`);
      console.log(`   ${colors.cyan}📍 Port:${colors.reset} ${colors.yellow}${PORT}${colors.reset}`);
      console.log(`   ${colors.cyan}🌍 Environment:${colors.reset} ${colors.yellow}${process.env.NODE_ENV || 'development'}${colors.reset}`);
      console.log(`   ${colors.cyan}🔗 Local URL:${colors.reset} ${colors.blue}http://localhost:${PORT}${colors.reset}`);
      console.log(`   ${colors.cyan}📚 API Base:${colors.reset} ${colors.blue}http://localhost:${PORT}/api${colors.reset}`);
      console.log(`   ${colors.green}✅ Server is ready to accept requests!${colors.reset}`);
      
      // Display available routes
      console.log(`\n${colors.magenta}📋 Available Routes:${colors.reset}`);
      console.log(`   ${colors.cyan}GET  /${colors.reset}          - Welcome message`);
      console.log(`   ${colors.cyan}GET  /health${colors.reset}     - Health check`);
      console.log(`   ${colors.green}POST /api/auth/register${colors.reset} - User registration`);
      console.log(`   ${colors.green}POST /api/auth/login${colors.reset}    - User login`);
      console.log(`   ${colors.blue}GET  /api/auth/me${colors.reset}       - Get current user (Protected)`);
      console.log(`   ${colors.blue}GET  /api/posts${colors.reset}         - Get all posts`);
      console.log(`   ${colors.blue}POST /api/posts${colors.reset}         - Create post (Protected)`);
      console.log(`   ${colors.yellow}GET  /api/users${colors.reset}         - Get all users (Admin only)`);
      console.log(`\n${colors.green}🎯 Use Ctrl+C to stop the server${colors.reset}\n`);
    });
    
  } catch (error) {
    console.log(`\n${colors.red}💥 ${colors.bright}Failed to start server!${colors.reset}`);
    console.log(`   ${colors.red}Error:${colors.reset} ${error.message}\n`);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(`\n${colors.yellow}👋 ${colors.bright}Shutting down server gracefully...${colors.reset}`);
  
  try {
    await mongoose.connection.close();
    console.log(`   ${colors.green}✅ MongoDB connection closed.${colors.reset}`);
    console.log(`   ${colors.green}✅ Server stopped successfully.${colors.reset}\n`);
    process.exit(0);
  } catch (error) {
    console.log(`   ${colors.red}❌ Error during shutdown:${colors.reset} ${error.message}`);
    process.exit(1);
  }
});

// Start the application
startServer();