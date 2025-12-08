const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const logger = require('./../middleware/loggerMiddleware').logger;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure thumbnails directory exists
const thumbnailsDir = path.join(uploadsDir, 'thumbnails');
if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${uniqueId}${ext}`);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|bmp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (JPEG, JPG, PNG, GIF, WEBP, BMP)'), false);
    }
};

// Initialize multer upload
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5 // Maximum 5 files
    },
    fileFilter: fileFilter
});

// Image processing options
const imageOptions = {
    quality: 85,
    maxWidth: 1920,
    maxHeight: 1080,
    thumbnailWidth: 300,
    thumbnailHeight: 300,
    allowedFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp']
};

// Process and optimize image
const processImage = async (filePath, options = {}) => {
    try {
        const opts = { ...imageOptions, ...options };
        
        // Get image metadata
        const metadata = await sharp(filePath).metadata();
        
        // Calculate new dimensions while maintaining aspect ratio
        let width = metadata.width;
        let height = metadata.height;
        
        if (width > opts.maxWidth || height > opts.maxHeight) {
            const ratio = Math.min(opts.maxWidth / width, opts.maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }
        
        // Resize and optimize image
        const processedPath = filePath.replace(path.extname(filePath), `_processed${path.extname(filePath)}`);
        
        await sharp(filePath)
            .resize(width, height, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .toFormat(metadata.format === 'gif' ? 'gif' : 'jpeg', {
                quality: opts.quality,
                progressive: true,
                optimize: true
            })
            .toFile(processedPath);
        
        // Create thumbnail
        const thumbnailPath = path.join(
            thumbnailsDir,
            path.basename(filePath).replace(path.extname(filePath), `_thumb${path.extname(filePath)}`)
        );
        
        await sharp(filePath)
            .resize(opts.thumbnailWidth, opts.thumbnailHeight, {
                fit: 'cover',
                position: 'center'
            })
            .toFormat(metadata.format === 'gif' ? 'gif' : 'jpeg', {
                quality: 80
            })
            .toFile(thumbnailPath);
        
        // Get file sizes
        const originalSize = fs.statSync(filePath).size;
        const processedSize = fs.statSync(processedPath).size;
        const thumbnailSize = fs.statSync(thumbnailPath).size;
        
        // Delete original file if processing was successful
        fs.unlinkSync(filePath);
        
        // Rename processed file to original name
        fs.renameSync(processedPath, filePath);
        
        return {
            success: true,
            originalPath: filePath,
            thumbnailPath,
            metadata: {
                format: metadata.format,
                width: metadata.width,
                height: metadata.height,
                originalSize,
                processedSize,
                thumbnailSize,
                savedBytes: originalSize - processedSize,
                savedPercentage: ((originalSize - processedSize) / originalSize * 100).toFixed(2)
            }
        };
    } catch (error) {
        logger.error(`Image processing error: ${error.message}`);
        return {
            success: false,
            error: error.message,
            originalPath: filePath
        };
    }
};

// Upload single image
const uploadSingle = (fieldName = 'image') => {
    return upload.single(fieldName);
};

// Upload multiple images
const uploadMultiple = (fieldName = 'images', maxCount = 5) => {
    return upload.array(fieldName, maxCount);
};

// Upload multiple fields
const uploadFields = (fields) => {
    return upload.fields(fields);
};

// Validate image file
const validateImage = (file) => {
    if (!file) {
        return { valid: false, error: 'No file provided' };
    }
    
    const errors = [];
    
    // Check file size
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        errors.push(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum (10MB)`);
    }
    
    // Check file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
        errors.push(`File type ${file.mimetype} is not allowed`);
    }
    
    // Check extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
        errors.push(`File extension ${ext} is not allowed`);
    }
    
    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : null,
        file
    };
};

// Get image information
const getImageInfo = async (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
        }
        
        const metadata = await sharp(filePath).metadata();
        const stats = fs.statSync(filePath);
        
        return {
            success: true,
            info: {
                path: filePath,
                filename: path.basename(filePath),
                size: stats.size,
                format: metadata.format,
                width: metadata.width,
                height: metadata.height,
                hasAlpha: metadata.hasAlpha,
                space: metadata.space,
                channels: metadata.channels,
                density: metadata.density,
                isProgressive: metadata.isProgressive,
                created: stats.birthtime,
                modified: stats.mtime
            }
        };
    } catch (error) {
        logger.error(`Get image info error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Generate image URL
const generateImageUrl = (filename, type = 'original') => {
    if (!filename) return null;
    
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const uploadsBase = '/uploads';
    
    if (type === 'thumbnail') {
        return `${baseUrl}${uploadsBase}/thumbnails/${filename.replace(path.extname(filename), `_thumb${path.extname(filename)}`)}`;
    }
    
    return `${baseUrl}${uploadsBase}/${filename}`;
};

// Delete image file
const deleteImage = (filename) => {
    try {
        const filePath = path.join(uploadsDir, filename);
        const thumbnailPath = path.join(thumbnailsDir, filename.replace(path.extname(filename), `_thumb${path.extname(filename)}`));
        
        const results = [];
        
        // Delete original
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            results.push({ type: 'original', success: true, path: filePath });
        } else {
            results.push({ type: 'original', success: false, error: 'File not found' });
        }
        
        // Delete thumbnail
        if (fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
            results.push({ type: 'thumbnail', success: true, path: thumbnailPath });
        } else {
            results.push({ type: 'thumbnail', success: false, error: 'Thumbnail not found' });
        }
        
        return {
            success: results.every(r => r.success),
            results
        };
    } catch (error) {
        logger.error(`Delete image error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Clean up old images
const cleanupOldImages = async (days = 30) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const files = fs.readdirSync(uploadsDir);
        const thumbnails = fs.readdirSync(thumbnailsDir);
        
        const deleted = [];
        const errors = [];
        
        // Delete old original images
        for (const file of files) {
            if (file === 'thumbnails') continue;
            
            const filePath = path.join(uploadsDir, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtime < cutoffDate) {
                try {
                    fs.unlinkSync(filePath);
                    deleted.push({ type: 'original', file });
                    
                    // Delete corresponding thumbnail
                    const thumbFile = file.replace(path.extname(file), `_thumb${path.extname(file)}`);
                    const thumbPath = path.join(thumbnailsDir, thumbFile);
                    
                    if (fs.existsSync(thumbPath)) {
                        fs.unlinkSync(thumbPath);
                        deleted.push({ type: 'thumbnail', file: thumbFile });
                    }
                } catch (error) {
                    errors.push({ file, error: error.message });
                }
            }
        }
        
        logger.info(`Cleaned up ${deleted.length} old image files`);
        
        return {
            success: errors.length === 0,
            deletedCount: deleted.length,
            deleted,
            errors: errors.length > 0 ? errors : null
        };
    } catch (error) {
        logger.error(`Cleanup old images error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Compress image
const compressImage = async (filePath, quality = 80) => {
    try {
        const metadata = await sharp(filePath).metadata();
        const outputPath = filePath.replace(path.extname(filePath), `_compressed${path.extname(filePath)}`);
        
        await sharp(filePath)
            .toFormat(metadata.format, { quality })
            .toFile(outputPath);
        
        const originalSize = fs.statSync(filePath).size;
        const compressedSize = fs.statSync(outputPath).size;
        
        // Replace original with compressed version
        fs.unlinkSync(filePath);
        fs.renameSync(outputPath, filePath);
        
        return {
            success: true,
            originalSize,
            compressedSize,
            savedBytes: originalSize - compressedSize,
            savedPercentage: ((originalSize - compressedSize) / originalSize * 100).toFixed(2)
        };
    } catch (error) {
        logger.error(`Image compression error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Convert image format
const convertImageFormat = async (filePath, targetFormat = 'jpeg') => {
    try {
        if (!imageOptions.allowedFormats.includes(targetFormat.toLowerCase())) {
            return { success: false, error: `Unsupported target format: ${targetFormat}` };
        }
        
        const outputPath = filePath.replace(path.extname(filePath), `.${targetFormat}`);
        
        await sharp(filePath)
            .toFormat(targetFormat, { quality: 85 })
            .toFile(outputPath);
        
        // Delete original if conversion successful
        fs.unlinkSync(filePath);
        
        return {
            success: true,
            originalPath: filePath,
            convertedPath: outputPath,
            newFilename: path.basename(outputPath)
        };
    } catch (error) {
        logger.error(`Image format conversion error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Generate different image sizes
const generateImageSizes = async (filePath, sizes = []) => {
    try {
        const defaultSizes = [
            { name: 'small', width: 640, height: 480 },
            { name: 'medium', width: 1024, height: 768 },
            { name: 'large', width: 1920, height: 1080 }
        ];
        
        const sizeConfig = sizes.length > 0 ? sizes : defaultSizes;
        const results = [];
        
        for (const size of sizeConfig) {
            const outputPath = filePath.replace(
                path.extname(filePath),
                `_${size.name}${path.extname(filePath)}`
            );
            
            await sharp(filePath)
                .resize(size.width, size.height, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toFile(outputPath);
            
            results.push({
                name: size.name,
                path: outputPath,
                width: size.width,
                height: size.height,
                size: fs.statSync(outputPath).size
            });
        }
        
        return {
            success: true,
            sizes: results
        };
    } catch (error) {
        logger.error(`Generate image sizes error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = {
    upload,
    uploadSingle,
    uploadMultiple,
    uploadFields,
    processImage,
    validateImage,
    getImageInfo,
    generateImageUrl,
    deleteImage,
    cleanupOldImages,
    compressImage,
    convertImageFormat,
    generateImageSizes,
    imageOptions,
    uploadsDir,
    thumbnailsDir
};