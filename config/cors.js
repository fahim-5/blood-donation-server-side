import cors from 'cors';

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
    ? process.env.CORS_ALLOWED_ORIGINS.split(',') 
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
        'https://blood-donation-app.vercel.app',
        'https://blood-donation-app.netlify.app',
    ];

// CORS configuration function
export const configureCors = () => {
    return cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) {
                return callback(null, true);
            }
            
            // Check against allowed origins
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            
            // Allow localhost in any port for development
            if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }
            
            // Allow 127.0.0.1 in any port for development
            if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }
            
            // Allow vercel and netlify preview deployments
            if (/^https:\/\/.+\.vercel\.app$/.test(origin) || 
                /^https:\/\/.+\.netlify\.app$/.test(origin)) {
                return callback(null, true);
            }
            
            // Origin not allowed
            console.warn(`CORS blocked request from origin: ${origin}`);
            return callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
        allowedHeaders: [
            'Origin',
            'X-Requested-With',
            'Content-Type',
            'Accept',
            'Authorization',
            'X-Access-Token',
            'X-Refresh-Token'
        ],
        exposedHeaders: [
            'Content-Length',
            'Authorization',
            'X-Access-Token',
            'X-Refresh-Token'
        ],
        maxAge: 86400, // 24 hours
        optionsSuccessStatus: 204
    });
};

export default configureCors;