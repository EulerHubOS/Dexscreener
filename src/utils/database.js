const fs = require('fs-extra');
const path = require('path');
const { Logger, loadJsonFile, saveJsonFile, generateTimestamp, getDateString } = require('./helpers');

class TokenDatabase {
    constructor(config) {
        this.config = config;
        this.tokensFile = config.database.tokensFile;
        this.historicalDataDir = config.database.historicalDataDir;
        this.cache = new Map();
        this.maxCacheSize = 1000;
    }

    async initialize() {
        try {
            await fs.ensureDir(path.dirname(this.tokensFile));
            await fs.ensureDir(this.historicalDataDir);
            Logger.info('Database initialized successfully');
        } catch (error) {
            Logger.error('Failed to initialize database:', error.message);
            throw error;
        }
    }

    async saveTokenData(tokens, metadata = {}) {
        try {
            const timestamp = generateTimestamp();
            const dateStr = getDateString();
            
            const dataToSave = {
                timestamp,
                date: dateStr,
                totalTokens: tokens.length,
                metadata,
                tokens: tokens.map(token => ({
                    ...token,
                    lastUpdated: timestamp
                }))
            };

            await saveJsonFile(this.tokensFile, dataToSave);

            const historicalFile = path.join(this.historicalDataDir, `tokens-${dateStr}.json`);
            await saveJsonFile(historicalFile, dataToSave);

            Logger.info(`Saved ${tokens.length} tokens to database`);
            return true;
        } catch (error) {
            Logger.error('Failed to save token data:', error.message);
            throw error;
        }
    }

    async loadTokenData() {
        try {
            const data = await loadJsonFile(this.tokensFile, { tokens: [] });
            return data.tokens || [];
        } catch (error) {
            Logger.error('Failed to load token data:', error.message);
            return [];
        }
    }

    async loadHistoricalData(startDate, endDate) {
        try {
            const historicalData = [];
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateStr = getDateString(date);
                const filePath = path.join(this.historicalDataDir, `tokens-${dateStr}.json`);
                
                const dayData = await loadJsonFile(filePath, null);
                if (dayData) {
                    historicalData.push(dayData);
                }
            }
            
            Logger.info(`Loaded historical data for ${historicalData.length} days`);
            return historicalData;
        } catch (error) {
            Logger.error('Failed to load historical data:', error.message);
            return [];
        }
    }

    async getTokenHistory(tokenAddress, days = 30) {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            
            const historicalData = await this.loadHistoricalData(startDate, endDate);
            
            const tokenHistory = [];
            for (const dayData of historicalData) {
                const tokenData = dayData.tokens?.find(token => 
                    token.address === tokenAddress || token.symbol === tokenAddress
                );
                
                if (tokenData) {
                    tokenHistory.push({
                        date: dayData.date,
                        timestamp: dayData.timestamp,
                        ...tokenData
                    });
                }
            }
            
            return tokenHistory;
        } catch (error) {
            Logger.error(`Failed to get token history for ${tokenAddress}:`, error.message);
            return [];
        }
    }

    async updateTokenWithHistoricalData(token) {
        try {
            const history = await this.getTokenHistory(token.address || token.symbol, 7);
            
            if (history.length > 0) {
                token.historicalData = history;
                token.weeklyData = this.calculateWeeklyMetrics(history);
            }
            
            return token;
        } catch (error) {
            Logger.error(`Failed to update token ${token.symbol} with historical data:`, error.message);
            return token;
        }
    }

    calculateWeeklyMetrics(history) {
        if (history.length < 2) return null;

        const latest = history[history.length - 1];
        const oldest = history[0];

        const weeklyChange = oldest.price > 0 ? 
            ((latest.price - oldest.price) / oldest.price) * 100 : 0;

        const avgVolume = history.reduce((sum, day) => sum + (day.volume24h || 0), 0) / history.length;
        const maxVolume = Math.max(...history.map(day => day.volume24h || 0));
        const minVolume = Math.min(...history.map(day => day.volume24h || 0));

        const avgMarketCap = history.reduce((sum, day) => sum + (day.marketCap || 0), 0) / history.length;
        const maxMarketCap = Math.max(...history.map(day => day.marketCap || 0));
        const minMarketCap = Math.min(...history.map(day => day.marketCap || 0));

        return {
            weeklyPriceChange: weeklyChange,
            avgDailyVolume: avgVolume,
            maxDailyVolume: maxVolume,
            minDailyVolume: minVolume,
            avgMarketCap,
            maxMarketCap,
            minMarketCap,
            daysTracked: history.length,
            volumeGrowth: minVolume > 0 ? ((maxVolume - minVolume) / minVolume) * 100 : 0,
            marketCapGrowth: minMarketCap > 0 ? ((maxMarketCap - minMarketCap) / minMarketCap) * 100 : 0
        };
    }

    async getTopPerformers(days = 7, limit = 20) {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            
            const historicalData = await this.loadHistoricalData(startDate, endDate);
            if (historicalData.length === 0) return [];

            const tokenPerformance = new Map();

            for (const dayData of historicalData) {
                for (const token of dayData.tokens || []) {
                    const key = token.address || token.symbol;
                    
                    if (!tokenPerformance.has(key)) {
                        tokenPerformance.set(key, {
                            token: { ...token },
                            firstPrice: token.price,
                            lastPrice: token.price,
                            totalVolume: 0,
                            daysActive: 0,
                            maxMarketCap: token.marketCap || 0
                        });
                    }

                    const perf = tokenPerformance.get(key);
                    perf.lastPrice = token.price;
                    perf.totalVolume += token.volume24h || 0;
                    perf.daysActive++;
                    perf.maxMarketCap = Math.max(perf.maxMarketCap, token.marketCap || 0);
                    perf.token = { ...token };
                }
            }

            const performers = Array.from(tokenPerformance.values())
                .filter(perf => perf.daysActive >= Math.min(days * 0.5, 3))
                .map(perf => ({
                    ...perf.token,
                    periodGrowth: perf.firstPrice > 0 ? 
                        ((perf.lastPrice - perf.firstPrice) / perf.firstPrice) * 100 : 0,
                    avgDailyVolume: perf.totalVolume / perf.daysActive,
                    daysActive: perf.daysActive,
                    maxMarketCap: perf.maxMarketCap
                }))
                .sort((a, b) => b.periodGrowth - a.periodGrowth)
                .slice(0, limit);

            return performers;
        } catch (error) {
            Logger.error('Failed to get top performers:', error.message);
            return [];
        }
    }

    async cleanOldData(retentionDays = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            
            const files = await fs.readdir(this.historicalDataDir);
            let deletedCount = 0;
            
            for (const file of files) {
                if (file.startsWith('tokens-') && file.endsWith('.json')) {
                    const dateMatch = file.match(/tokens-(\d{4}-\d{2}-\d{2})\.json/);
                    if (dateMatch) {
                        const fileDate = new Date(dateMatch[1]);
                        if (fileDate < cutoffDate) {
                            await fs.unlink(path.join(this.historicalDataDir, file));
                            deletedCount++;
                        }
                    }
                }
            }
            
            Logger.info(`Cleaned ${deletedCount} old data files`);
            return deletedCount;
        } catch (error) {
            Logger.error('Failed to clean old data:', error.message);
            return 0;
        }
    }

    async getTokenStatistics() {
        try {
            const currentData = await loadJsonFile(this.tokensFile, { tokens: [] });
            const files = await fs.readdir(this.historicalDataDir);
            
            const stats = {
                currentTokenCount: currentData.tokens?.length || 0,
                lastUpdated: currentData.timestamp,
                historicalDays: files.filter(f => f.startsWith('tokens-') && f.endsWith('.json')).length,
                letsBonkTokens: currentData.tokens?.filter(t => t.isFromLetsBonk).length || 0,
                totalVolume24h: currentData.tokens?.reduce((sum, t) => sum + (t.volume24h || 0), 0) || 0,
                totalMarketCap: currentData.tokens?.reduce((sum, t) => sum + (t.marketCap || 0), 0) || 0
            };
            
            return stats;
        } catch (error) {
            Logger.error('Failed to get token statistics:', error.message);
            return null;
        }
    }

    async searchTokens(query, limit = 10) {
        try {
            const tokens = await this.loadTokenData();
            const lowercaseQuery = query.toLowerCase();
            
            const matches = tokens.filter(token => 
                token.symbol?.toLowerCase().includes(lowercaseQuery) ||
                token.name?.toLowerCase().includes(lowercaseQuery) ||
                token.address?.toLowerCase().includes(lowercaseQuery)
            ).slice(0, limit);
            
            return matches;
        } catch (error) {
            Logger.error(`Failed to search tokens with query "${query}":`, error.message);
            return [];
        }
    }

    async backupData(backupDir) {
        try {
            await fs.ensureDir(backupDir);
            const timestamp = generateTimestamp().replace(/[:.]/g, '-');
            const backupPath = path.join(backupDir, `backup-${timestamp}`);
            
            await fs.copy(path.dirname(this.tokensFile), backupPath);
            
            Logger.info(`Data backed up to ${backupPath}`);
            return backupPath;
        } catch (error) {
            Logger.error('Failed to backup data:', error.message);
            throw error;
        }
    }

    async exportToCSV(outputPath, startDate, endDate) {
        try {
            const historicalData = await this.loadHistoricalData(startDate, endDate);
            
            const headers = [
                'Date', 'Symbol', 'Name', 'Address', 'Price', 'MarketCap', 'Volume24h', 
                'PriceChange24h', 'Liquidity', 'IsFromLetsBonk', 'DaysSinceLaunch'
            ];
            
            const rows = [headers];
            
            for (const dayData of historicalData) {
                for (const token of dayData.tokens || []) {
                    rows.push([
                        dayData.date,
                        token.symbol || '',
                        token.name || '',
                        token.address || '',
                        token.price || 0,
                        token.marketCap || 0,
                        token.volume24h || 0,
                        token.priceChange24h || 0,
                        token.liquidity || 0,
                        token.isFromLetsBonk ? 'Yes' : 'No',
                        token.daysSinceLaunch || ''
                    ]);
                }
            }
            
            const csvContent = rows.map(row => row.join(',')).join('\n');
            await fs.writeFile(outputPath, csvContent);
            
            Logger.info(`Exported ${rows.length - 1} records to ${outputPath}`);
            return rows.length - 1;
        } catch (error) {
            Logger.error('Failed to export to CSV:', error.message);
            throw error;
        }
    }

    clearCache() {
        this.cache.clear();
        Logger.info('Database cache cleared');
    }

    getCacheSize() {
        return this.cache.size;
    }

    async getMetrics() {
        const stats = await this.getTokenStatistics();
        return {
            ...stats,
            cacheSize: this.getCacheSize(),
            maxCacheSize: this.maxCacheSize
        };
    }
}

module.exports = TokenDatabase;