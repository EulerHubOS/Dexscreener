const { Logger, loadJsonFile, saveJsonFile } = require('./helpers');
const path = require('path');

class PortfolioTracker {
    constructor(config) {
        this.config = config;
        this.portfolioFile = path.join(config.database.tokensFile.replace('tracked-tokens.json', 'portfolio.json'));
    }

    async loadWatchlist() {
        return await loadJsonFile(this.portfolioFile, { watchlist: [], holdings: [] });
    }

    async saveWatchlist(portfolio) {
        await saveJsonFile(this.portfolioFile, portfolio);
    }

    async addToWatchlist(tokenAddress, reason = '') {
        try {
            const portfolio = await this.loadWatchlist();
            
            const existing = portfolio.watchlist.find(item => item.address === tokenAddress);
            if (existing) {
                Logger.info(`Token ${tokenAddress} already in watchlist`);
                return false;
            }

            portfolio.watchlist.push({
                address: tokenAddress,
                addedAt: new Date().toISOString(),
                reason,
                alerts: {
                    priceTarget: null,
                    volumeSpike: true,
                    priceChange: 50
                }
            });

            await this.saveWatchlist(portfolio);
            Logger.info(`Added ${tokenAddress} to watchlist: ${reason}`);
            return true;
        } catch (error) {
            Logger.error(`Failed to add token to watchlist: ${error.message}`);
            return false;
        }
    }

    async removeFromWatchlist(tokenAddress) {
        try {
            const portfolio = await this.loadWatchlist();
            const initialLength = portfolio.watchlist.length;
            
            portfolio.watchlist = portfolio.watchlist.filter(item => item.address !== tokenAddress);
            
            if (portfolio.watchlist.length < initialLength) {
                await this.saveWatchlist(portfolio);
                Logger.info(`Removed ${tokenAddress} from watchlist`);
                return true;
            }
            
            return false;
        } catch (error) {
            Logger.error(`Failed to remove token from watchlist: ${error.message}`);
            return false;
        }
    }

    async checkWatchlistAlerts(currentTokens) {
        try {
            const portfolio = await this.loadWatchlist();
            const alerts = [];

            for (const watchItem of portfolio.watchlist) {
                const currentToken = currentTokens.find(token => 
                    token.address === watchItem.address || token.symbol === watchItem.address
                );

                if (!currentToken) continue;

                // Price change alert
                if (watchItem.alerts.priceChange && 
                    Math.abs(currentToken.priceChange24h || 0) >= watchItem.alerts.priceChange) {
                    alerts.push({
                        type: 'price_change',
                        token: currentToken.symbol,
                        message: `${currentToken.symbol} changed ${currentToken.priceChange24h}% (threshold: ${watchItem.alerts.priceChange}%)`,
                        severity: Math.abs(currentToken.priceChange24h) > 100 ? 'high' : 'medium'
                    });
                }

                // Volume spike alert
                if (watchItem.alerts.volumeSpike) {
                    const volumeRatio = currentToken.marketCap > 0 ? 
                        (currentToken.volume24h / currentToken.marketCap) * 100 : 0;
                    
                    if (volumeRatio > 30) {
                        alerts.push({
                            type: 'volume_spike',
                            token: currentToken.symbol,
                            message: `${currentToken.symbol} volume spike: ${volumeRatio.toFixed(1)}% of market cap`,
                            severity: 'medium'
                        });
                    }
                }

                // Price target alert
                if (watchItem.alerts.priceTarget && 
                    currentToken.price >= watchItem.alerts.priceTarget) {
                    alerts.push({
                        type: 'price_target',
                        token: currentToken.symbol,
                        message: `${currentToken.symbol} hit price target: $${currentToken.price}`,
                        severity: 'high'
                    });
                }
            }

            return alerts;
        } catch (error) {
            Logger.error(`Failed to check watchlist alerts: ${error.message}`);
            return [];
        }
    }

    async autoAddPromisingTokens(tokens) {
        const promising = tokens.filter(token => {
            // Auto-add criteria: high performance, good volume, reasonable market cap
            return (token.priceChange24h > 100 || 
                   (token.priceChange24h > 50 && token.volume24h > 100000)) &&
                   token.marketCap > 50000 && 
                   token.marketCap < 10000000 &&
                   token.liquidity > 10000;
        });

        for (const token of promising) {
            await this.addToWatchlist(
                token.address, 
                `Auto-added: ${token.priceChange24h.toFixed(1)}% gain, $${(token.volume24h/1000).toFixed(0)}K volume`
            );
        }

        return promising.length;
    }

    async getWatchlistSummary() {
        try {
            const portfolio = await this.loadWatchlist();
            
            return {
                totalWatched: portfolio.watchlist.length,
                totalHoldings: portfolio.holdings.length,
                recentlyAdded: portfolio.watchlist.filter(item => {
                    const addedDate = new Date(item.addedAt);
                    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return addedDate > dayAgo;
                }).length
            };
        } catch (error) {
            Logger.error(`Failed to get watchlist summary: ${error.message}`);
            return { totalWatched: 0, totalHoldings: 0, recentlyAdded: 0 };
        }
    }
}

module.exports = PortfolioTracker;