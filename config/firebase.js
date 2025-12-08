const admin = require('firebase-admin');
const logger = require('../middleware/loggerMiddleware').logger;

// Firebase configuration
const firebaseConfig = {
    // Firebase project configuration
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    
    // Authentication
    auth: {
        type: process.env.FIREBASE_TYPE || 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY ? 
            process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : null,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || 
            'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
        universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || 'googleapis.com'
    },
    
    // Firebase services configuration
    services: {
        auth: process.env.FIREBASE_ENABLE_AUTH === 'true',
        storage: process.env.FIREBASE_ENABLE_STORAGE === 'true',
        database: process.env.FIREBASE_ENABLE_DATABASE === 'true',
        messaging: process.env.FIREBASE_ENABLE_MESSAGING === 'true',
        firestore: process.env.FIREBASE_ENABLE_FIRESTORE === 'true'
    },
    
    // Firebase app configuration
    appConfig: {
        credential: null,
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    },
    
    // Firebase initialization state
    initialized: false,
    apps: {},
    services: {}
};

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
    try {
        // Check if Firebase is already initialized
        if (firebaseConfig.initialized) {
            logger.info('Firebase is already initialized');
            return firebaseConfig.apps.default;
        }
        
        // Check if Firebase is configured
        if (!firebaseConfig.auth.private_key || !firebaseConfig.auth.client_email) {
            logger.warn('Firebase credentials not found. Firebase services will be disabled.');
            firebaseConfig.initialized = false;
            return null;
        }
        
        // Initialize Firebase app
        firebaseConfig.appConfig.credential = admin.credential.cert(firebaseConfig.auth);
        
        const app = admin.initializeApp(firebaseConfig.appConfig, 'default');
        firebaseConfig.apps.default = app;
        firebaseConfig.initialized = true;
        
        // Initialize services based on configuration
        if (firebaseConfig.services.auth) {
            firebaseConfig.services.auth = admin.auth(app);
            logger.info('Firebase Authentication initialized');
        }
        
        if (firebaseConfig.services.storage) {
            firebaseConfig.services.storage = admin.storage(app);
            logger.info('Firebase Storage initialized');
        }
        
        if (firebaseConfig.services.database) {
            firebaseConfig.services.database = admin.database(app);
            logger.info('Firebase Realtime Database initialized');
        }
        
        if (firebaseConfig.services.messaging) {
            firebaseConfig.services.messaging = admin.messaging(app);
            logger.info('Firebase Cloud Messaging initialized');
        }
        
        if (firebaseConfig.services.firestore) {
            firebaseConfig.services.firestore = admin.firestore(app);
            logger.info('Firebase Firestore initialized');
        }
        
        logger.info('Firebase Admin SDK initialized successfully');
        return app;
    } catch (error) {
        logger.error(`Failed to initialize Firebase: ${error.message}`);
        firebaseConfig.initialized = false;
        throw error;
    }
};

// Get Firebase app instance
const getFirebaseApp = (name = 'default') => {
    if (!firebaseConfig.initialized) {
        initializeFirebase();
    }
    
    return firebaseConfig.apps[name] || null;
};

// Get Firebase service
const getFirebaseService = (serviceName) => {
    if (!firebaseConfig.initialized) {
        initializeFirebase();
    }
    
    return firebaseConfig.services[serviceName] || null;
};

// Firebase Authentication utilities
const authUtils = {
    // Create custom token for user
    createCustomToken: async (userId, additionalClaims = {}) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            const token = await auth.createCustomToken(userId.toString(), additionalClaims);
            return { success: true, token };
        } catch (error) {
            logger.error(`Create custom token error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Verify ID token
    verifyIdToken: async (idToken) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            const decodedToken = await auth.verifyIdToken(idToken);
            return { success: true, decodedToken };
        } catch (error) {
            logger.error(`Verify ID token error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Create user in Firebase Auth
    createUser: async (userData) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            const userRecord = await auth.createUser({
                email: userData.email,
                emailVerified: false,
                phoneNumber: userData.phone,
                password: userData.password,
                displayName: userData.name,
                photoURL: userData.avatar,
                disabled: false
            });
            
            logger.info(`Firebase user created: ${userRecord.uid}`);
            return { success: true, userRecord };
        } catch (error) {
            logger.error(`Create Firebase user error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Update user in Firebase Auth
    updateUser: async (uid, userData) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            const updateData = {};
            if (userData.email) updateData.email = userData.email;
            if (userData.name) updateData.displayName = userData.name;
            if (userData.avatar) updateData.photoURL = userData.avatar;
            if (userData.phone) updateData.phoneNumber = userData.phone;
            if (userData.disabled !== undefined) updateData.disabled = userData.disabled;
            
            const userRecord = await auth.updateUser(uid, updateData);
            return { success: true, userRecord };
        } catch (error) {
            logger.error(`Update Firebase user error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Delete user from Firebase Auth
    deleteUser: async (uid) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            await auth.deleteUser(uid);
            logger.info(`Firebase user deleted: ${uid}`);
            return { success: true };
        } catch (error) {
            logger.error(`Delete Firebase user error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Get user by UID
    getUser: async (uid) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            const userRecord = await auth.getUser(uid);
            return { success: true, userRecord };
        } catch (error) {
            logger.error(`Get Firebase user error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Get user by email
    getUserByEmail: async (email) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            const userRecord = await auth.getUserByEmail(email);
            return { success: true, userRecord };
        } catch (error) {
            logger.error(`Get Firebase user by email error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Set custom user claims
    setCustomUserClaims: async (uid, claims) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            await auth.setCustomUserClaims(uid, claims);
            return { success: true };
        } catch (error) {
            logger.error(`Set custom user claims error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Generate password reset link
    generatePasswordResetLink: async (email) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            const link = await auth.generatePasswordResetLink(email, {
                url: `${process.env.APP_URL}/reset-password`,
                handleCodeInApp: false
            });
            
            return { success: true, link };
        } catch (error) {
            logger.error(`Generate password reset link error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Generate email verification link
    generateEmailVerificationLink: async (email) => {
        try {
            const auth = getFirebaseService('auth');
            if (!auth) {
                throw new Error('Firebase Authentication not initialized');
            }
            
            const link = await auth.generateEmailVerificationLink(email, {
                url: `${process.env.APP_URL}/verify-email`,
                handleCodeInApp: false
            });
            
            return { success: true, link };
        } catch (error) {
            logger.error(`Generate email verification link error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
};

// Firebase Storage utilities
const storageUtils = {
    // Upload file to Firebase Storage
    uploadFile: async (filePath, destinationPath, options = {}) => {
        try {
            const storage = getFirebaseService('storage');
            if (!storage) {
                throw new Error('Firebase Storage not initialized');
            }
            
            const bucket = storage.bucket(firebaseConfig.storageBucket);
            const file = bucket.file(destinationPath);
            
            const uploadOptions = {
                destination: destinationPath,
                metadata: {
                    contentType: options.contentType || 'application/octet-stream',
                    metadata: options.metadata || {}
                },
                public: options.public || false,
                validation: options.validation || 'md5'
            };
            
            await bucket.upload(filePath, uploadOptions);
            
            // Get public URL if file is public
            let publicUrl = null;
            if (uploadOptions.public) {
                publicUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
            } else {
                // Generate signed URL for private files
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
                });
                publicUrl = signedUrl;
            }
            
            return {
                success: true,
                bucket: bucket.name,
                file: destinationPath,
                publicUrl,
                size: (await file.getMetadata())[0].size
            };
        } catch (error) {
            logger.error(`Upload file to Firebase Storage error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Upload buffer to Firebase Storage
    uploadBuffer: async (buffer, destinationPath, options = {}) => {
        try {
            const storage = getFirebaseService('storage');
            if (!storage) {
                throw new Error('Firebase Storage not initialized');
            }
            
            const bucket = storage.bucket(firebaseConfig.storageBucket);
            const file = bucket.file(destinationPath);
            
            await file.save(buffer, {
                metadata: {
                    contentType: options.contentType || 'application/octet-stream',
                    metadata: options.metadata || {}
                },
                public: options.public || false
            });
            
            // Get URL
            let publicUrl = null;
            if (options.public) {
                publicUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
            } else {
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 7 * 24 * 60 * 60 * 1000
                });
                publicUrl = signedUrl;
            }
            
            return {
                success: true,
                bucket: bucket.name,
                file: destinationPath,
                publicUrl
            };
        } catch (error) {
            logger.error(`Upload buffer to Firebase Storage error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Get file metadata
    getFileMetadata: async (filePath) => {
        try {
            const storage = getFirebaseService('storage');
            if (!storage) {
                throw new Error('Firebase Storage not initialized');
            }
            
            const bucket = storage.bucket(firebaseConfig.storageBucket);
            const file = bucket.file(filePath);
            
            const [metadata] = await file.getMetadata();
            return { success: true, metadata };
        } catch (error) {
            logger.error(`Get file metadata error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Generate signed URL for file
    generateSignedUrl: async (filePath, expiresInDays = 7) => {
        try {
            const storage = getFirebaseService('storage');
            if (!storage) {
                throw new Error('Firebase Storage not initialized');
            }
            
            const bucket = storage.bucket(firebaseConfig.storageBucket);
            const file = bucket.file(filePath);
            
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + expiresInDays * 24 * 60 * 60 * 1000
            });
            
            return { success: true, url };
        } catch (error) {
            logger.error(`Generate signed URL error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Delete file from Storage
    deleteFile: async (filePath) => {
        try {
            const storage = getFirebaseService('storage');
            if (!storage) {
                throw new Error('Firebase Storage not initialized');
            }
            
            const bucket = storage.bucket(firebaseConfig.storageBucket);
            const file = bucket.file(filePath);
            
            await file.delete();
            return { success: true };
        } catch (error) {
            logger.error(`Delete file error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // List files in a directory
    listFiles: async (directoryPath = '', maxResults = 100) => {
        try {
            const storage = getFirebaseService('storage');
            if (!storage) {
                throw new Error('Firebase Storage not initialized');
            }
            
            const bucket = storage.bucket(firebaseConfig.storageBucket);
            const [files] = await bucket.getFiles({
                prefix: directoryPath,
                maxResults
            });
            
            const fileList = files.map(file => ({
                name: file.name,
                size: file.metadata.size,
                contentType: file.metadata.contentType,
                updated: file.metadata.updated,
                publicUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`
            }));
            
            return { success: true, files: fileList };
        } catch (error) {
            logger.error(`List files error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
};

// Firebase Cloud Messaging utilities
const messagingUtils = {
    // Send notification to device
    sendToDevice: async (token, notification, data = {}) => {
        try {
            const messaging = getFirebaseService('messaging');
            if (!messaging) {
                throw new Error('Firebase Cloud Messaging not initialized');
            }
            
            const message = {
                token,
                notification: {
                    title: notification.title,
                    body: notification.body,
                    imageUrl: notification.imageUrl
                },
                data,
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        color: '#e74c3c',
                        icon: 'ic_notification',
                        channelId: 'blood_donation_channel'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1
                        }
                    }
                },
                webpush: {
                    notification: {
                        icon: '/icons/icon-192x192.png',
                        badge: '/icons/badge-72x72.png'
                    }
                }
            };
            
            const response = await messaging.send(message);
            return { success: true, messageId: response };
        } catch (error) {
            logger.error(`Send to device error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Send notification to multiple devices
    sendToDevices: async (tokens, notification, data = {}) => {
        try {
            const messaging = getFirebaseService('messaging');
            if (!messaging) {
                throw new Error('Firebase Cloud Messaging not initialized');
            }
            
            const message = {
                tokens,
                notification: {
                    title: notification.title,
                    body: notification.body
                },
                data
            };
            
            const response = await messaging.sendEachForMulticast(message);
            return {
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount,
                responses: response.responses
            };
        } catch (error) {
            logger.error(`Send to devices error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Send notification to topic
    sendToTopic: async (topic, notification, data = {}) => {
        try {
            const messaging = getFirebaseService('messaging');
            if (!messaging) {
                throw new Error('Firebase Cloud Messaging not initialized');
            }
            
            const message = {
                topic,
                notification: {
                    title: notification.title,
                    body: notification.body
                },
                data
            };
            
            const response = await messaging.send(message);
            return { success: true, messageId: response };
        } catch (error) {
            logger.error(`Send to topic error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Subscribe device to topic
    subscribeToTopic: async (tokens, topic) => {
        try {
            const messaging = getFirebaseService('messaging');
            if (!messaging) {
                throw new Error('Firebase Cloud Messaging not initialized');
            }
            
            const response = await messaging.subscribeToTopic(tokens, topic);
            return {
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount
            };
        } catch (error) {
            logger.error(`Subscribe to topic error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Unsubscribe device from topic
    unsubscribeFromTopic: async (tokens, topic) => {
        try {
            const messaging = getFirebaseService('messaging');
            if (!messaging) {
                throw new Error('Firebase Cloud Messaging not initialized');
            }
            
            const response = await messaging.unsubscribeFromTopic(tokens, topic);
            return {
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount
            };
        } catch (error) {
            logger.error(`Unsubscribe from topic error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
};

// Firebase Firestore utilities
const firestoreUtils = {
    // Initialize Firestore
    getFirestore: () => {
        try {
            const firestore = getFirebaseService('firestore');
            if (!firestore) {
                throw new Error('Firebase Firestore not initialized');
            }
            
            return firestore;
        } catch (error) {
            logger.error(`Get Firestore error: ${error.message}`);
            return null;
        }
    },
    
    // Add document to Firestore
    addDocument: async (collectionPath, data, id = null) => {
        try {
            const firestore = getFirebaseService('firestore');
            if (!firestore) {
                throw new Error('Firebase Firestore not initialized');
            }
            
            const collectionRef = firestore.collection(collectionPath);
            let docRef;
            
            if (id) {
                docRef = collectionRef.doc(id);
                await docRef.set(data);
            } else {
                docRef = await collectionRef.add(data);
            }
            
            return { success: true, id: docRef.id, ref: docRef };
        } catch (error) {
            logger.error(`Add Firestore document error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Get document from Firestore
    getDocument: async (collectionPath, documentId) => {
        try {
            const firestore = getFirebaseService('firestore');
            if (!firestore) {
                throw new Error('Firebase Firestore not initialized');
            }
            
            const docRef = firestore.collection(collectionPath).doc(documentId);
            const doc = await docRef.get();
            
            if (!doc.exists) {
                return { success: false, error: 'Document not found' };
            }
            
            return { success: true, data: doc.data(), id: doc.id };
        } catch (error) {
            logger.error(`Get Firestore document error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Update document in Firestore
    updateDocument: async (collectionPath, documentId, data) => {
        try {
            const firestore = getFirebaseService('firestore');
            if (!firestore) {
                throw new Error('Firebase Firestore not initialized');
            }
            
            const docRef = firestore.collection(collectionPath).doc(documentId);
            await docRef.update(data);
            
            return { success: true, id: documentId };
        } catch (error) {
            logger.error(`Update Firestore document error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Delete document from Firestore
    deleteDocument: async (collectionPath, documentId) => {
        try {
            const firestore = getFirebaseService('firestore');
            if (!firestore) {
                throw new Error('Firebase Firestore not initialized');
            }
            
            const docRef = firestore.collection(collectionPath).doc(documentId);
            await docRef.delete();
            
            return { success: true };
        } catch (error) {
            logger.error(`Delete Firestore document error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Query documents in Firestore
    queryDocuments: async (collectionPath, queryConditions = [], limit = 100) => {
        try {
            const firestore = getFirebaseService('firestore');
            if (!firestore) {
                throw new Error('Firebase Firestore not initialized');
            }
            
            let query = firestore.collection(collectionPath);
            
            // Apply query conditions
            queryConditions.forEach(condition => {
                query = query.where(condition.field, condition.operator, condition.value);
            });
            
            // Apply limit
            query = query.limit(limit);
            
            const snapshot = await query.get();
            const documents = [];
            
            snapshot.forEach(doc => {
                documents.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return { success: true, documents };
        } catch (error) {
            logger.error(`Query Firestore documents error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
};

// Firebase Realtime Database utilities
const databaseUtils = {
    // Get database reference
    getDatabase: () => {
        try {
            const database = getFirebaseService('database');
            if (!database) {
                throw new Error('Firebase Realtime Database not initialized');
            }
            
            return database;
        } catch (error) {
            logger.error(`Get Realtime Database error: ${error.message}`);
            return null;
        }
    },
    
    // Set data at path
    setData: async (path, data) => {
        try {
            const database = getFirebaseService('database');
            if (!database) {
                throw new Error('Firebase Realtime Database not initialized');
            }
            
            const ref = database.ref(path);
            await ref.set(data);
            
            return { success: true, path };
        } catch (error) {
            logger.error(`Set Realtime Database data error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Get data from path
    getData: async (path) => {
        try {
            const database = getFirebaseService('database');
            if (!database) {
                throw new Error('Firebase Realtime Database not initialized');
            }
            
            const ref = database.ref(path);
            const snapshot = await ref.once('value');
            
            return { success: true, data: snapshot.val() };
        } catch (error) {
            logger.error(`Get Realtime Database data error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Update data at path
    updateData: async (path, updates) => {
        try {
            const database = getFirebaseService('database');
            if (!database) {
                throw new Error('Firebase Realtime Database not initialized');
            }
            
            const ref = database.ref(path);
            await ref.update(updates);
            
            return { success: true, path };
        } catch (error) {
            logger.error(`Update Realtime Database data error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Push data to list
    pushData: async (path, data) => {
        try {
            const database = getFirebaseService('database');
            if (!database) {
                throw new Error('Firebase Realtime Database not initialized');
            }
            
            const ref = database.ref(path);
            const newRef = await ref.push(data);
            
            return { success: true, key: newRef.key, path: newRef.toString() };
        } catch (error) {
            logger.error(`Push Realtime Database data error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Remove data at path
    removeData: async (path) => {
        try {
            const database = getFirebaseService('database');
            if (!database) {
                throw new Error('Firebase Realtime Database not initialized');
            }
            
            const ref = database.ref(path);
            await ref.remove();
            
            return { success: true, path };
        } catch (error) {
            logger.error(`Remove Realtime Database data error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
};

// Check Firebase service status
const checkFirebaseStatus = () => {
    return {
        initialized: firebaseConfig.initialized,
        services: {
            auth: !!firebaseConfig.services.auth,
            storage: !!firebaseConfig.services.storage,
            database: !!firebaseConfig.services.database,
            messaging: !!firebaseConfig.services.messaging,
            firestore: !!firebaseConfig.services.firestore
        },
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
        databaseURL: firebaseConfig.databaseURL
    };
};

// Clean up Firebase resources
const cleanupFirebase = async () => {
    try {
        for (const [name, app] of Object.entries(firebaseConfig.apps)) {
            await app.delete();
            logger.info(`Firebase app deleted: ${name}`);
        }
        
        firebaseConfig.apps = {};
        firebaseConfig.services = {};
        firebaseConfig.initialized = false;
        
        return { success: true };
    } catch (error) {
        logger.error(`Cleanup Firebase error: ${error.message}`);
        return { success: false, error: error.message };
    }
};

// Export configuration and utilities
module.exports = {
    firebaseConfig,
    initializeFirebase,
    getFirebaseApp,
    getFirebaseService,
    checkFirebaseStatus,
    cleanupFirebase,
    authUtils,
    storageUtils,
    messagingUtils,
    firestoreUtils,
    databaseUtils
};