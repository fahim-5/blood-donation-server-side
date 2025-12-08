const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const logger = require('./../middleware/loggerMiddleware').logger;

// ImageBB API configuration
const IMAGEBB_CONFIG = {
    BASE_URL: 'https://api.imgbb.com/1',
    API_KEY: process.env.IMAGEBB_API_KEY,
    UPLOAD_ENDPOINT: '/upload',
    EXPIRATION: 600 // Image expiration in seconds (10 minutes)
};

// Check if ImageBB is configured
const isImageBBConfigured = () => {
    return !!IMAGEBB_CONFIG.API_KEY;
};

// Upload image to ImageBB
const uploadToImageBB = async (imagePath, options = {}) => {
    try {
        if (!isImageBBConfigured()) {
            throw new Error('ImageBB API key is not configured');
        }

        if (!fs.existsSync(imagePath)) {
            throw new Error('Image file does not exist');
        }

        // Prepare form data
        const formData = new FormData();
        const imageFile = fs.createReadStream(imagePath);
        
        formData.append('image', imageFile);
        formData.append('key', IMAGEBB_CONFIG.API_KEY);
        
        // Add optional parameters
        if (options.name) {
            formData.append('name', options.name);
        }
        
        if (options.expiration) {
            formData.append('expiration', options.expiration);
        }
        
        // Make API request
        const response = await axios.post(
            `${IMAGEBB_CONFIG.BASE_URL}${IMAGEBB_CONFIG.UPLOAD_ENDPOINT}`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Content-Type': 'multipart/form-data'
                }
            }
        );

        if (response.data.success) {
            const imageData = response.data.data;
            
            logger.info(`Image uploaded to ImageBB: ${imageData.url}`);
            
            return {
                success: true,
                data: {
                    id: imageData.id,
                    url: imageData.url,
                    displayUrl: imageData.display_url,
                    thumbUrl: imageData.thumb.url,
                    mediumUrl: imageData.medium?.url || imageData.url,
                    deleteUrl: imageData.delete_url,
                    filename: imageData.image.filename,
                    name: imageData.image.name,
                    mime: imageData.image.mime,
                    extension: imageData.image.extension,
                    size: imageData.size,
                    width: imageData.width,
                    height: imageData.height,
                    expiration: imageData.expiration
                }
            };
        } else {
            throw new Error(response.data.error?.message || 'ImageBB upload failed');
        }
    } catch (error) {
        logger.error(`ImageBB upload error: ${error.message}`);
        
        // Extract error message from response if available
        let errorMessage = error.message;
        if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        }
        
        return {
            success: false,
            error: errorMessage
        };
    }
};

// Upload multiple images to ImageBB
const uploadMultipleToImageBB = async (imagePaths, options = {}) => {
    const results = [];
    
    for (const imagePath of imagePaths) {
        try {
            const result = await uploadToImageBB(imagePath, options);
            results.push({
                path: imagePath,
                success: result.success,
                data: result.data,
                error: result.error
            });
        } catch (error) {
            results.push({
                path: imagePath,
                success: false,
                error: error.message
            });
        }
    }
    
    return {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
    };
};

// Upload base64 image to ImageBB
const uploadBase64ToImageBB = async (base64Image, options = {}) => {
    try {
        if (!isImageBBConfigured()) {
            throw new Error('ImageBB API key is not configured');
        }

        // Remove data URL prefix if present
        let base64Data = base64Image;
        if (base64Image.startsWith('data:')) {
            base64Data = base64Image.split(',')[1];
        }

        // Prepare form data
        const formData = new FormData();
        formData.append('image', base64Data);
        formData.append('key', IMAGEBB_CONFIG.API_KEY);
        
        // Add optional parameters
        if (options.name) {
            formData.append('name', options.name);
        }
        
        if (options.expiration) {
            formData.append('expiration', options.expiration);
        }

        // Make API request
        const response = await axios.post(
            `${IMAGEBB_CONFIG.BASE_URL}${IMAGEBB_CONFIG.UPLOAD_ENDPOINT}`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Content-Type': 'multipart/form-data'
                }
            }
        );

        if (response.data.success) {
            const imageData = response.data.data;
            
            logger.info(`Base64 image uploaded to ImageBB: ${imageData.url}`);
            
            return {
                success: true,
                data: {
                    id: imageData.id,
                    url: imageData.url,
                    displayUrl: imageData.display_url,
                    thumbUrl: imageData.thumb.url,
                    mediumUrl: imageData.medium?.url || imageData.url,
                    deleteUrl: imageData.delete_url
                }
            };
        } else {
            throw new Error(response.data.error?.message || 'ImageBB upload failed');
        }
    } catch (error) {
        logger.error(`ImageBB base64 upload error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Delete image from ImageBB
const deleteFromImageBB = async (deleteUrl) => {
    try {
        if (!deleteUrl) {
            throw new Error('Delete URL is required');
        }

        const response = await axios.delete(deleteUrl);
        
        if (response.data.success) {
            logger.info(`Image deleted from ImageBB: ${deleteUrl}`);
            return { success: true };
        } else {
            throw new Error(response.data.error?.message || 'Image deletion failed');
        }
    } catch (error) {
        logger.error(`ImageBB delete error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Get image info from ImageBB
const getImageInfoFromImageBB = async (imageId) => {
    try {
        if (!isImageBBConfigured()) {
            throw new Error('ImageBB API key is not configured');
        }

        // Note: ImageBB doesn't have a direct endpoint to get image info by ID
        // This would require storing the image data when uploading
        logger.warn('ImageBB does not provide an endpoint to get image info by ID');
        
        return {
            success: false,
            error: 'Not implemented - ImageBB does not provide image info endpoint'
        };
    } catch (error) {
        logger.error(`Get ImageBB image info error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Generate ImageBB URL
const generateImageBBUrl = (imageId, size = 'original') => {
    if (!imageId) return null;
    
    const sizes = {
        original: '',
        thumb: 'thumbs/',
        medium: 'medium/',
        small: 'small/'
    };
    
    const sizePrefix = sizes[size] || '';
    return `https://i.ibb.co/${sizePrefix}${imageId}`;
};

// Upload user avatar to ImageBB
const uploadUserAvatar = async (avatarFile, userId) => {
    try {
        const options = {
            name: `avatar_${userId}_${Date.now()}`,
            expiration: null // Don't expire avatars
        };
        
        const result = await uploadToImageBB(avatarFile, options);
        
        if (result.success) {
            return {
                success: true,
                avatarUrl: result.data.url,
                thumbnailUrl: result.data.thumbUrl,
                imageData: result.data
            };
        }
        
        return result;
    } catch (error) {
        logger.error(`User avatar upload error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Upload donation request images
const uploadDonationImages = async (imageFiles, donationRequestId) => {
    try {
        const options = {
            name: `donation_${donationRequestId}_${Date.now()}`,
            expiration: 2592000 // 30 days expiration for donation images
        };
        
        const results = await uploadMultipleToImageBB(imageFiles, options);
        
        return {
            success: results.failed === 0,
            total: results.total,
            uploaded: results.successful,
            failed: results.failed,
            images: results.results.filter(r => r.success).map(r => ({
                url: r.data.url,
                thumbnailUrl: r.data.thumbUrl,
                mediumUrl: r.data.mediumUrl,
                originalName: path.basename(r.path)
            }))
        };
    } catch (error) {
        logger.error(`Donation images upload error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Validate ImageBB URL
const isValidImageBBUrl = (url) => {
    if (!url) return false;
    
    const imageBBPatterns = [
        /^https?:\/\/i\.ibb\.co\/[a-zA-Z0-9]+/,
        /^https?:\/\/i\.ibb\.co\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+/,
        /^https?:\/\/image\.ibb\.co\/[a-zA-Z0-9]+/,
        /^https?:\/\/image\.ibb\.co\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+/
    ];
    
    return imageBBPatterns.some(pattern => pattern.test(url));
};

// Extract ImageBB ID from URL
const extractImageBBId = (url) => {
    if (!isValidImageBBUrl(url)) return null;
    
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        
        // Get the last non-empty part of the path
        for (let i = pathParts.length - 1; i >= 0; i--) {
            if (pathParts[i] && pathParts[i].trim() !== '') {
                // Remove file extension if present
                return pathParts[i].split('.')[0];
            }
        }
        
        return null;
    } catch {
        return null;
    }
};

// Get optimized ImageBB URL
const getOptimizedImageUrl = (imageBBUrl, width = 800, height = 600, quality = 85) => {
    if (!isValidImageBBUrl(imageBBUrl)) return imageBBUrl;
    
    try {
        // ImageBB doesn't support dynamic resizing via URL parameters
        // We can only use the predefined sizes: original, thumb, medium, small
        // Return the original URL as fallback
        return imageBBUrl;
    } catch {
        return imageBBUrl;
    }
};

// Clean up expired images (cron job helper)
const cleanupExpiredImages = async () => {
    // Note: ImageBB automatically deletes expired images
    // This function is just for logging/notification purposes
    logger.info('ImageBB expired images cleanup check');
    
    return {
        success: true,
        message: 'ImageBB automatically handles expired image cleanup',
        timestamp: new Date().toISOString()
    };
};

// Test ImageBB connection
const testImageBBConnection = async () => {
    try {
        if (!isImageBBConfigured()) {
            return {
                connected: false,
                message: 'ImageBB API key not configured'
            };
        }

        // Try to upload a small test image
        const testImage = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64'
        );

        const result = await uploadBase64ToImageBB(testImage.toString('base64'), {
            name: 'test_connection',
            expiration: 60 // 1 minute expiration for test
        });

        return {
            connected: result.success,
            message: result.success ? 'ImageBB connection successful' : result.error,
            testUpload: result
        };
    } catch (error) {
        return {
            connected: false,
            message: error.message
        };
    }
};

module.exports = {
    IMAGEBB_CONFIG,
    isImageBBConfigured,
    uploadToImageBB,
    uploadMultipleToImageBB,
    uploadBase64ToImageBB,
    deleteFromImageBB,
    getImageInfoFromImageBB,
    generateImageBBUrl,
    uploadUserAvatar,
    uploadDonationImages,
    isValidImageBBUrl,
    extractImageBBId,
    getOptimizedImageUrl,
    cleanupExpiredImages,
    testImageBBConnection
};