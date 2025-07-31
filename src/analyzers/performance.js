const { calculatePercentageChange, Logger, formatNumber, formatPercentage } = require('../utils/helpers');

class PerformanceAnalyzer {
    constructor() {
        this.metrics = {};
    }

    analyzeTokenPerformance(currentData, historicalData = []) {
        const analysis = {
            current: currentData,
            performance: this.calculatePerformanceMetrics(currentData, historicalData),
            trends: this.analyzeTrends(currentData, historicalData),
            alerts: this.checkForAlerts(currentData, historicalData),
            score: 0,
            rank: 0
        };

        analysis.score = this.calculatePerformanceScore(analysis);
        return analysis;
    }

    calculatePerformanceMetrics(current, historical) {
        const metrics = {
            pricePerformance: {
                current: current.price,
                change1h: current.priceChange1h || 0,
                change6h: current.priceChange6h || 0,
                change24h: current.priceChange24h || 0
            },
            volumeMetrics: {
                current24h: current.volume24h || 0,
                current6h: current.volume6h || 0,
                current1h: current.volume1h || 0,
                volumeToMcapRatio: current.marketCap > 0 ? (current.volume24h / current.marketCap) * 100 : 0
            },
            liquidityMetrics: {
                currentLiquidity: current.liquidity || 0,
                liquidityToMcapRatio: current.liquidityToMcapRatio || 0,
                liquidityHealth: this.assessLiquidityHealth(current.liquidity, current.marketCap)
            },
            marketCapMetrics: {
                current: current.marketCap || 0,
                fullyDilutedValue: current.marketCap || 0
            },
            tradingMetrics: {
                transactions24h: current.transactions24h || 0,
                buys24h: current.buys24h || 0,
                sells24h: current.sells24h || 0,
                buyToSellRatio: this.calculateBuyToSellRatio(current.buys24h, current.sells24h),
                avgTransactionSize: current.volume24h && current.transactions24h 
                    ? current.volume24h / current.transactions24h 
                    : 0
            }
        };

        if (historical.length > 0) {
            metrics.historicalTrends = this.calculateHistoricalTrends(current, historical);
        }

        return metrics;
    }

    calculateHistoricalTrends(current, historical) {
        if (historical.length === 0) return null;

        const trends = {
            volumeTrend: this.calculateVolumeTrend(current, historical),
            priceTrend: this.calculatePriceTrend(current, historical),
            liquidityTrend: this.calculateLiquidityTrend(current, historical),
            marketCapTrend: this.calculateMarketCapTrend(current, historical)
        };

        return trends;
    }

    calculateVolumeTrend(current, historical) {
        const recentVolumes = historical.slice(-7).map(h => h.volume24h || 0);
        const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
        
        return {
            currentVolume: current.volume24h || 0,
            avgWeeklyVolume: avgVolume,
            volumeChangeFromAvg: calculatePercentageChange(current.volume24h || 0, avgVolume),
            isVolumeIncreasing: this.isIncreasingTrend(recentVolumes),
            volumeConsistency: this.calculateConsistency(recentVolumes)
        };
    }

    calculatePriceTrend(current, historical) {
        const recentPrices = historical.slice(-7).map(h => h.price || 0);
        const firstPrice = recentPrices[0] || current.price;
        
        return {
            currentPrice: current.price,
            weeklyChange: calculatePercentageChange(current.price, firstPrice),
            isPriceIncreasing: this.isIncreasingTrend(recentPrices),
            priceVolatility: this.calculateVolatility(recentPrices),
            supportLevel: Math.min(...recentPrices),
            resistanceLevel: Math.max(...recentPrices)
        };
    }

    calculateLiquidityTrend(current, historical) {
        const recentLiquidity = historical.slice(-7).map(h => h.liquidity || 0);
        const avgLiquidity = recentLiquidity.reduce((a, b) => a + b, 0) / recentLiquidity.length;
        
        return {
            currentLiquidity: current.liquidity || 0,
            avgWeeklyLiquidity: avgLiquidity,
            liquidityChange: calculatePercentageChange(current.liquidity || 0, avgLiquidity),
            isLiquidityStable: this.calculateConsistency(recentLiquidity) > 0.7
        };
    }

    calculateMarketCapTrend(current, historical) {
        const recentMarketCaps = historical.slice(-7).map(h => h.marketCap || 0);
        const firstMarketCap = recentMarketCaps[0] || current.marketCap;
        
        return {
            currentMarketCap: current.marketCap || 0,
            weeklyGrowth: calculatePercentageChange(current.marketCap || 0, firstMarketCap),
            isGrowing: this.isIncreasingTrend(recentMarketCaps),
            growthConsistency: this.calculateConsistency(recentMarketCaps)
        };
    }

    analyzeTrends(current, historical) {
        const trends = {
            momentum: this.calculateMomentum(current),
            strength: this.calculateStrength(current),
            sustainability: this.calculateSustainability(current, historical)
        };

        return trends;
    }

    calculateMomentum(current) {
        const momentum = {
            price: this.categorizeMomentum(current.priceChange24h || 0),
            volume: this.categorizeVolume(current.volume24h || 0, current.marketCap || 0),
            overall: 'neutral'
        };

        const priceScore = this.getMomentumScore(momentum.price);
        const volumeScore = this.getMomentumScore(momentum.volume);
        const avgScore = (priceScore + volumeScore) / 2;

        if (avgScore > 0.6) momentum.overall = 'bullish';
        else if (avgScore < -0.6) momentum.overall = 'bearish';

        return momentum;
    }

    calculateStrength(current) {
        const strength = {
            liquidity: this.assessLiquidityHealth(current.liquidity, current.marketCap),
            trading: this.assessTradingActivity(current.transactions24h, current.volume24h),
            buyPressure: this.assessBuyPressure(current.buys24h, current.sells24h),
            overall: 'moderate'
        };

        return strength;
    }

    calculateSustainability(current, historical) {
        if (historical.length < 3) {
            return {
                score: 0.5,
                factors: ['insufficient_data'],
                overall: 'unknown'
            };
        }

        const sustainability = {
            volumeConsistency: this.calculateVolumeConsistency(current, historical),
            liquidityStability: this.calculateLiquidityStability(current, historical),
            priceStability: this.calculatePriceStability(current, historical),
            overall: 'moderate'
        };

        const avgScore = (
            sustainability.volumeConsistency + 
            sustainability.liquidityStability + 
            sustainability.priceStability
        ) / 3;

        if (avgScore > 0.7) sustainability.overall = 'high';
        else if (avgScore < 0.3) sustainability.overall = 'low';

        return sustainability;
    }

    checkForAlerts(current, historical) {
        const alerts = [];

        if ((current.priceChange24h || 0) > 100) {
            alerts.push({
                type: 'price_breakout',
                severity: 'high',
                message: `Price increased by ${formatPercentage(current.priceChange24h)}`,
                value: current.priceChange24h
            });
        }

        if ((current.priceChange24h || 0) < -50) {
            alerts.push({
                type: 'price_dump',
                severity: 'high',
                message: `Price decreased by ${formatPercentage(current.priceChange24h)}`,
                value: current.priceChange24h
            });
        }

        const volumeToMcapRatio = current.marketCap > 0 ? (current.volume24h / current.marketCap) * 100 : 0;
        if (volumeToMcapRatio > 50) {
            alerts.push({
                type: 'volume_spike',
                severity: 'medium',
                message: `High volume activity: ${formatPercentage(volumeToMcapRatio)} of market cap`,
                value: volumeToMcapRatio
            });
        }

        if ((current.liquidity || 0) < 5000 && (current.marketCap || 0) > 100000) {
            alerts.push({
                type: 'low_liquidity',
                severity: 'high',
                message: `Low liquidity warning: $${formatNumber(current.liquidity)}`,
                value: current.liquidity
            });
        }

        return alerts;
    }

    calculatePerformanceScore(analysis) {
        let score = 50;

        const priceChange24h = analysis.performance.pricePerformance.change24h || 0;
        score += Math.min(Math.max(priceChange24h * 0.5, -25), 25);

        const volumeRatio = analysis.performance.volumeMetrics.volumeToMcapRatio || 0;
        score += Math.min(volumeRatio * 0.3, 15);

        const liquidityHealth = analysis.performance.liquidityMetrics.liquidityHealth;
        if (liquidityHealth === 'healthy') score += 10;
        else if (liquidityHealth === 'moderate') score += 5;
        else if (liquidityHealth === 'poor') score -= 10;

        const buyToSellRatio = analysis.performance.tradingMetrics.buyToSellRatio || 1;
        if (buyToSellRatio > 1.2) score += 5;
        else if (buyToSellRatio < 0.8) score -= 5;

        return Math.max(0, Math.min(100, score));
    }

    assessLiquidityHealth(liquidity, marketCap) {
        if (!liquidity || !marketCap) return 'unknown';
        
        const ratio = (liquidity / marketCap) * 100;
        
        if (ratio > 10) return 'healthy';
        if (ratio > 5) return 'moderate';
        if (ratio > 1) return 'low';
        return 'poor';
    }

    calculateBuyToSellRatio(buys, sells) {
        if (!sells || sells === 0) return buys > 0 ? 10 : 1;
        return buys / sells;
    }

    isIncreasingTrend(values) {
        if (values.length < 2) return false;
        
        let increases = 0;
        for (let i = 1; i < values.length; i++) {
            if (values[i] > values[i - 1]) increases++;
        }
        
        return increases / (values.length - 1) > 0.6;
    }

    calculateConsistency(values) {
        if (values.length < 2) return 0;
        
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        return mean > 0 ? 1 - (stdDev / mean) : 0;
    }

    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i - 1] > 0) {
                returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
            }
        }
        
        if (returns.length === 0) return 0;
        
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance) * 100;
    }

    categorizeMomentum(change) {
        if (change > 50) return 'very_bullish';
        if (change > 20) return 'bullish';
        if (change > 5) return 'slightly_bullish';
        if (change > -5) return 'neutral';
        if (change > -20) return 'slightly_bearish';
        if (change > -50) return 'bearish';
        return 'very_bearish';
    }

    categorizeVolume(volume, marketCap) {
        if (!marketCap || marketCap === 0) return 'unknown';
        
        const ratio = (volume / marketCap) * 100;
        if (ratio > 100) return 'extremely_high';
        if (ratio > 50) return 'very_high';
        if (ratio > 20) return 'high';
        if (ratio > 5) return 'moderate';
        if (ratio > 1) return 'low';
        return 'very_low';
    }

    getMomentumScore(momentum) {
        const scores = {
            'very_bullish': 1,
            'bullish': 0.7,
            'slightly_bullish': 0.3,
            'neutral': 0,
            'slightly_bearish': -0.3,
            'bearish': -0.7,
            'very_bearish': -1,
            'extremely_high': 1,
            'very_high': 0.8,
            'high': 0.6,
            'moderate': 0.3,
            'low': -0.2,
            'very_low': -0.5,
            'unknown': 0
        };
        
        return scores[momentum] || 0;
    }

    assessTradingActivity(transactions, volume) {
        if (!transactions || transactions === 0) return 'inactive';
        
        const avgTransactionSize = volume / transactions;
        
        if (transactions > 1000 && avgTransactionSize > 100) return 'very_active';
        if (transactions > 500 && avgTransactionSize > 50) return 'active';
        if (transactions > 100) return 'moderate';
        if (transactions > 20) return 'low';
        return 'very_low';
    }

    assessBuyPressure(buys, sells) {
        const ratio = this.calculateBuyToSellRatio(buys, sells);
        
        if (ratio > 2) return 'very_high';
        if (ratio > 1.5) return 'high';
        if (ratio > 1.2) return 'moderate';
        if (ratio > 0.8) return 'balanced';
        if (ratio > 0.5) return 'low';
        return 'very_low';
    }

    calculateVolumeConsistency(current, historical) {
        const volumes = historical.slice(-7).map(h => h.volume24h || 0);
        volumes.push(current.volume24h || 0);
        return this.calculateConsistency(volumes);
    }

    calculateLiquidityStability(current, historical) {
        const liquidities = historical.slice(-7).map(h => h.liquidity || 0);
        liquidities.push(current.liquidity || 0);
        return this.calculateConsistency(liquidities);
    }

    calculatePriceStability(current, historical) {
        const prices = historical.slice(-7).map(h => h.price || 0);
        prices.push(current.price || 0);
        const volatility = this.calculateVolatility(prices);
        return Math.max(0, 1 - (volatility / 100));
    }

    rankTokens(tokenAnalyses) {
        const sorted = tokenAnalyses.sort((a, b) => b.score - a.score);
        
        sorted.forEach((analysis, index) => {
            analysis.rank = index + 1;
        });
        
        return sorted;
    }

    generatePerformanceSummary(analysis) {
        const summary = {
            symbol: analysis.current.symbol,
            name: analysis.current.name,
            score: analysis.score,
            rank: analysis.rank,
            price: analysis.current.price,
            marketCap: analysis.current.marketCap,
            volume24h: analysis.current.volume24h,
            priceChange24h: analysis.performance.pricePerformance.change24h,
            momentum: analysis.trends.momentum.overall,
            strength: analysis.trends.strength.overall,
            alerts: analysis.alerts.length,
            recommendation: this.generateRecommendation(analysis)
        };
        
        return summary;
    }

    generateRecommendation(analysis) {
        const score = analysis.score;
        const alertCount = analysis.alerts.length;
        const momentum = analysis.trends.momentum.overall;
        
        if (score > 80 && momentum === 'bullish' && alertCount === 0) {
            return 'strong_buy';
        }
        
        if (score > 65 && momentum !== 'bearish') {
            return 'buy';
        }
        
        if (score > 50 && alertCount <= 1) {
            return 'hold';
        }
        
        if (score < 35 || momentum === 'bearish') {
            return 'sell';
        }
        
        return 'watch';
    }
}

module.exports = PerformanceAnalyzer;