const axios = require('axios');
const { RateLimiter, Logger, sleep } = require('../utils/helpers');

class DexScreenerAPI {
    constructor(config) {
        this.baseUrl = config.baseUrl;
        this.rateLimiter = new RateLimiter(config.rateLimitMs);
        this.maxRetries = config.maxRetries;
        this.client = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Solana-Memecoin-Tracker/1.0.0'
            }
        });
    }

    async makeRequest(url, retryCount = 0) {
        try {
            await this.rateLimiter.wait();
            
            const response = await this.client.get(url);
            return response.data;
        } catch (error) {
            Logger.error(`API request failed for ${url}:`, error.message);
            
            if (retryCount < this.maxRetries) {
                const waitTime = Math.pow(2, retryCount) * 1000;
                Logger.info(`Retrying in ${waitTime}ms... (attempt ${retryCount + 1}/${this.maxRetries})`);
                await sleep(waitTime);
                return this.makeRequest(url, retryCount + 1);
            }
            
            throw error;
        }
    }

    async getTokenPairs(tokenAddress) {
        const url = `${this.baseUrl}/tokens/${tokenAddress}`;
        try {
            const data = await this.makeRequest(url);
            return data.pairs || [];
        } catch (error) {
            Logger.error(`Failed to get token pairs for ${tokenAddress}:`, error.message);
            return [];
        }
    }

    async getSolanaTokens() {
        // Expanded search terms to capture more memecoin activity
        const searches = [
            'SOL', 'USDC', 'BONK', 'RAY', 'ORCA', 'WIF', 'POPCAT', 'MYRO', 'WEN', 'SMOLE',
            'MEME', 'PEPE', 'SHIB', 'DOGE', 'FLOKI', 'TRUMP', 'ELON', 'MOON', 'DEGEN'
        ];
        const allPairs = [];
        
        for (const search of searches) {
            try {
                const url = `${this.baseUrl}/search?q=${search}`;
                const data = await this.makeRequest(url);
                if (data.pairs) {
                    const solanaPairs = data.pairs.filter(pair => 
                        pair.chainId === 'solana' && 
                        pair.volume?.h24 > 1000 // Only include tokens with meaningful volume
                    );
                    allPairs.push(...solanaPairs);
                }
            } catch (error) {
                Logger.error(`Failed to search for ${search}:`, error.message);
            }
        }
        
        return allPairs;
    }

    async getTokensByChain(chainId = 'solana') {
        const url = `${this.baseUrl}/search/?q=${chainId}`;
        try {
            const data = await this.makeRequest(url);
            return data.pairs || [];
        } catch (error) {
            Logger.error(`Failed to get tokens for chain ${chainId}:`, error.message);
            return [];
        }
    }

    async getTokenData(tokenAddress) {
        try {
            const pairs = await this.getTokenPairs(tokenAddress);
            
            if (!pairs || pairs.length === 0) {
                return null;
            }

            const mainPair = pairs.find(pair => 
                pair.chainId === 'solana' && 
                pair.dexId === 'raydium'
            ) || pairs[0];

            return this.extractTokenMetrics(mainPair);
        } catch (error) {
            Logger.error(`Failed to get token data for ${tokenAddress}:`, error.message);
            return null;
        }
    }

    extractTokenMetrics(pair) {
        if (!pair) return null;

        const token = pair.baseToken;
        const quote = pair.quoteToken;

        return {
            address: token.address,
            name: token.name,
            symbol: token.symbol,
            price: parseFloat(pair.priceUsd) || 0,
            priceNative: parseFloat(pair.priceNative) || 0,
            marketCap: parseFloat(pair.fdv) || 0,
            liquidity: parseFloat(pair.liquidity?.usd) || 0,
            volume24h: parseFloat(pair.volume?.h24) || 0,
            volume6h: parseFloat(pair.volume?.h6) || 0,
            volume1h: parseFloat(pair.volume?.h1) || 0,
            priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
            priceChange6h: parseFloat(pair.priceChange?.h6) || 0,
            priceChange1h: parseFloat(pair.priceChange?.h1) || 0,
            transactions24h: pair.txns?.h24?.buys + pair.txns?.h24?.sells || 0,
            transactions6h: pair.txns?.h6?.buys + pair.txns?.h6?.sells || 0,
            transactions1h: pair.txns?.h1?.buys + pair.txns?.h1?.sells || 0,
            buys24h: pair.txns?.h24?.buys || 0,
            sells24h: pair.txns?.h24?.sells || 0,
            pairAddress: pair.pairAddress,
            dexId: pair.dexId,
            chainId: pair.chainId,
            quoteToken: {
                address: quote.address,
                symbol: quote.symbol,
                name: quote.name
            },
            liquidityToMcapRatio: parseFloat(pair.liquidity?.usd) && parseFloat(pair.fdv) 
                ? (parseFloat(pair.liquidity.usd) / parseFloat(pair.fdv)) * 100 
                : 0,
            timestamp: new Date().toISOString(),
            url: pair.url || `https://dexscreener.com/solana/${pair.pairAddress}`
        };
    }

    async getTopTokens(limit = 50, minMarketCap = 50000, maxMarketCap = 100000000) {
        try {
            Logger.info('Fetching top Solana tokens from DexScreener...');
            
            const pairs = await this.getSolanaTokens();
            
            const filteredTokens = pairs
                .map(pair => this.extractTokenMetrics(pair))
                .filter(token => 
                    token && 
                    token.marketCap >= minMarketCap && 
                    token.marketCap <= maxMarketCap &&
                    token.liquidity > 0
                )
                .sort((a, b) => b.volume24h - a.volume24h)
                .slice(0, limit);

            Logger.info(`Found ${filteredTokens.length} tokens matching criteria`);
            return filteredTokens;
        } catch (error) {
            Logger.error('Failed to get top tokens:', error.message);
            return [];
        }
    }

    async searchTokens(query) {
        const url = `${this.baseUrl}/search/?q=${encodeURIComponent(query)}`;
        try {
            const data = await this.makeRequest(url);
            return (data.pairs || [])
                .filter(pair => pair.chainId === 'solana')
                .map(pair => this.extractTokenMetrics(pair));
        } catch (error) {
            Logger.error(`Failed to search tokens with query "${query}":`, error.message);
            return [];
        }
    }

    async getMultipleTokensData(tokenAddresses) {
        const results = [];
        
        for (const address of tokenAddresses) {
            try {
                const tokenData = await this.getTokenData(address);
                if (tokenData) {
                    results.push(tokenData);
                }
            } catch (error) {
                Logger.error(`Failed to get data for token ${address}:`, error.message);
            }
        }
        
        return results;
    }
}

module.exports = DexScreenerAPI;