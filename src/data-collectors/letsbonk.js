const axios = require('axios');
const { RateLimiter, Logger, sleep, isValidSolanaAddress } = require('../utils/helpers');

class LetsBonkAPI {
    constructor(config) {
        this.baseUrl = config.baseUrl;
        this.rateLimiter = new RateLimiter(config.rateLimitMs);
        this.maxRetries = config.maxRetries;
        this.client = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Solana-Memecoin-Tracker/1.0.0',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
    }

    async makeRequest(url, retryCount = 0) {
        try {
            await this.rateLimiter.wait();
            
            const response = await this.client.get(url);
            return response.data;
        } catch (error) {
            Logger.error(`LetsBonk API request failed for ${url}:`, error.message);
            
            if (retryCount < this.maxRetries) {
                const waitTime = Math.pow(2, retryCount) * 1000;
                Logger.info(`Retrying in ${waitTime}ms... (attempt ${retryCount + 1}/${this.maxRetries})`);
                await sleep(waitTime);
                return this.makeRequest(url, retryCount + 1);
            }
            
            throw error;
        }
    }

    async getRecentLaunches(hours = 24) {
        try {
            Logger.info(`Fetching recent launches from LetsBonk.fun (last ${hours} hours)...`);
            
            const url = `${this.baseUrl}/tokens/recent?hours=${hours}`;
            const data = await this.makeRequest(url);
            
            const launches = this.processLaunchData(data);
            Logger.info(`Found ${launches.length} recent launches`);
            
            return launches;
        } catch (error) {
            Logger.error('Failed to get recent launches from LetsBonk:', error.message);
            
            return this.getMockLaunchData();
        }
    }

    async getTokenLaunchInfo(tokenAddress) {
        try {
            if (!isValidSolanaAddress(tokenAddress)) {
                throw new Error('Invalid Solana token address');
            }

            const url = `${this.baseUrl}/tokens/${tokenAddress}`;
            const data = await this.makeRequest(url);
            
            return this.processTokenLaunchInfo(data);
        } catch (error) {
            Logger.error(`Failed to get launch info for token ${tokenAddress}:`, error.message);
            return null;
        }
    }

    async getTrendingTokens(limit = 20) {
        try {
            Logger.info('Fetching trending tokens from LetsBonk.fun...');
            
            const url = `${this.baseUrl}/tokens/trending?limit=${limit}`;
            const data = await this.makeRequest(url);
            
            const trending = this.processTrendingData(data);
            Logger.info(`Found ${trending.length} trending tokens`);
            
            return trending;
        } catch (error) {
            Logger.error('Failed to get trending tokens from LetsBonk:', error.message);
            return [];
        }
    }

    processLaunchData(data) {
        if (!data || !Array.isArray(data.tokens)) {
            return [];
        }

        return data.tokens.map(token => ({
            address: token.mint || token.address,
            name: token.name,
            symbol: token.symbol,
            description: token.description,
            launchTime: token.createdAt || token.launchTime,
            creator: token.creator || token.deployer,
            initialMarketCap: token.initialMarketCap || 0,
            initialLiquidity: token.initialLiquidity || 0,
            launchPrice: token.launchPrice || 0,
            website: token.website,
            twitter: token.twitter,
            telegram: token.telegram,
            image: token.image || token.logo,
            isVerified: token.verified || false,
            tags: token.tags || [],
            metadata: {
                totalSupply: token.totalSupply,
                decimals: token.decimals || 9,
                freezeAuthority: token.freezeAuthority,
                mintAuthority: token.mintAuthority,
                isMutable: token.isMutable
            },
            launchPlatform: 'LetsBonk.fun',
            daysSinceLaunch: this.calculateDaysSinceLaunch(token.createdAt || token.launchTime)
        }));
    }

    processTokenLaunchInfo(data) {
        if (!data || !data.token) {
            return null;
        }

        const token = data.token;
        return {
            address: token.mint || token.address,
            name: token.name,
            symbol: token.symbol,
            description: token.description,
            launchTime: token.createdAt || token.launchTime,
            creator: token.creator || token.deployer,
            launchMetrics: {
                initialMarketCap: token.initialMarketCap || 0,
                initialLiquidity: token.initialLiquidity || 0,
                launchPrice: token.launchPrice || 0,
                firstHourVolume: token.firstHourVolume || 0,
                firstDayVolume: token.firstDayVolume || 0
            },
            socialLinks: {
                website: token.website,
                twitter: token.twitter,
                telegram: token.telegram,
                discord: token.discord
            },
            launchPlatform: 'LetsBonk.fun',
            daysSinceLaunch: this.calculateDaysSinceLaunch(token.createdAt || token.launchTime),
            isFromLetsBonk: true
        };
    }

    processTrendingData(data) {
        if (!data || !Array.isArray(data.tokens)) {
            return [];
        }

        return data.tokens.map(token => ({
            address: token.mint || token.address,
            name: token.name,
            symbol: token.symbol,
            trendingScore: token.score || 0,
            trendingRank: token.rank || 0,
            recentVolume: token.volume24h || 0,
            priceChange24h: token.priceChange24h || 0,
            socialActivity: token.socialActivity || 0,
            launchTime: token.createdAt || token.launchTime,
            daysSinceLaunch: this.calculateDaysSinceLaunch(token.createdAt || token.launchTime),
            isFromLetsBonk: true
        }));
    }

    calculateDaysSinceLaunch(launchTime) {
        if (!launchTime) return null;
        
        const launch = new Date(launchTime);
        const now = new Date();
        const diffTime = Math.abs(now - launch);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    getMockLaunchData() {
        Logger.warn('Using mock data for LetsBonk launches (API might be unavailable)');
        
        return [
            {
                address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
                name: 'Bonk',
                symbol: 'BONK',
                description: 'The first Solana dog coin for the people, by the people.',
                launchTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                creator: 'LetsBonkTeam',
                initialMarketCap: 100000,
                initialLiquidity: 25000,
                launchPrice: 0.0000001,
                website: 'https://bonkcoin.com',
                twitter: 'https://twitter.com/bonk_inu',
                image: 'https://bonkcoin.com/logo.png',
                isVerified: true,
                tags: ['meme', 'dog', 'community'],
                launchPlatform: 'LetsBonk.fun',
                daysSinceLaunch: 1,
                metadata: {
                    totalSupply: 100000000000000,
                    decimals: 5,
                    freezeAuthority: null,
                    mintAuthority: null,
                    isMutable: false
                }
            }
        ];
    }

    async checkIfTokenFromLetsBonk(tokenAddress) {
        try {
            const launchInfo = await this.getTokenLaunchInfo(tokenAddress);
            return launchInfo !== null;
        } catch (error) {
            Logger.error(`Failed to check if token ${tokenAddress} is from LetsBonk:`, error.message);
            return false;
        }
    }

    async enrichTokenWithLaunchData(tokenData) {
        try {
            const launchInfo = await this.getTokenLaunchInfo(tokenData.address);
            
            if (launchInfo) {
                return {
                    ...tokenData,
                    launchInfo,
                    isFromLetsBonk: true,
                    daysSinceLaunch: launchInfo.daysSinceLaunch
                };
            }
            
            return {
                ...tokenData,
                isFromLetsBonk: false,
                daysSinceLaunch: null
            };
        } catch (error) {
            Logger.error(`Failed to enrich token ${tokenData.address} with launch data:`, error.message);
            return {
                ...tokenData,
                isFromLetsBonk: false,
                daysSinceLaunch: null
            };
        }
    }
}

module.exports = LetsBonkAPI;