const fs = require('fs-extra');
const path = require('path');

class RateLimiter {
    constructor(intervalMs) {
        this.intervalMs = intervalMs;
        this.lastCall = 0;
    }

    async wait() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCall;
        
        if (timeSinceLastCall < this.intervalMs) {
            const waitTime = this.intervalMs - timeSinceLastCall;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastCall = Date.now();
    }
}

class Logger {
    static log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        
        console.log(logMessage);
        if (data) {
            console.log(JSON.stringify(data, null, 2));
        }
    }

    static info(message, data) {
        this.log('info', message, data);
    }

    static error(message, data) {
        this.log('error', message, data);
    }

    static warn(message, data) {
        this.log('warn', message, data);
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function calculatePercentageChange(current, previous) {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous) * 100;
}

function formatNumber(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(2) + 'B';
    }
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
}

function formatPercentage(num) {
    return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

async function ensureDirectoryExists(dirPath) {
    await fs.ensureDir(dirPath);
}

async function loadJsonFile(filePath, defaultValue = {}) {
    try {
        const exists = await fs.pathExists(filePath);
        if (!exists) {
            return defaultValue;
        }
        return await fs.readJson(filePath);
    } catch (error) {
        Logger.error(`Error loading JSON file ${filePath}:`, error.message);
        return defaultValue;
    }
}

async function saveJsonFile(filePath, data) {
    try {
        await ensureDirectoryExists(path.dirname(filePath));
        await fs.writeJson(filePath, data, { spaces: 2 });
    } catch (error) {
        Logger.error(`Error saving JSON file ${filePath}:`, error.message);
        throw error;
    }
}

function isValidSolanaAddress(address) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function generateTimestamp() {
    return new Date().toISOString();
}

function getDateString(date = new Date()) {
    return date.toISOString().split('T')[0];
}

module.exports = {
    RateLimiter,
    Logger,
    sleep,
    calculatePercentageChange,
    formatNumber,
    formatPercentage,
    ensureDirectoryExists,
    loadJsonFile,
    saveJsonFile,
    isValidSolanaAddress,
    generateTimestamp,
    getDateString
};