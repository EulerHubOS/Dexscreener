const fs = require('fs-extra');
const path = require('path');
const { formatNumber, formatPercentage, Logger, getDateString } = require('../utils/helpers');

class WeeklyReportGenerator {
    constructor(config) {
        this.config = config;
        this.reportsDir = config.database.reportsDir;
    }

    async generateWeeklyReport(weeklyData, startDate, endDate) {
        try {
            Logger.info('Generating weekly report...');
            
            const reportData = this.prepareWeeklyData(weeklyData, startDate, endDate);
            const htmlReport = this.generateHTMLReport(reportData);
            const csvData = this.generateCSVReport(reportData);
            const textSummary = this.generateTextSummary(reportData);

            const weekStr = `${getDateString(startDate)}_to_${getDateString(endDate)}`;
            const baseFileName = `weekly-report-${weekStr}`;

            await fs.ensureDir(this.reportsDir);
            
            await Promise.all([
                fs.writeFile(path.join(this.reportsDir, `${baseFileName}.html`), htmlReport),
                fs.writeFile(path.join(this.reportsDir, `${baseFileName}.csv`), csvData),
                fs.writeFile(path.join(this.reportsDir, `${baseFileName}.txt`), textSummary)
            ]);

            Logger.info(`Weekly report generated: ${baseFileName}`);
            return {
                html: htmlReport,
                csv: csvData,
                text: textSummary,
                data: reportData
            };
        } catch (error) {
            Logger.error('Failed to generate weekly report:', error.message);
            throw error;
        }
    }

    prepareWeeklyData(weeklyData, startDate, endDate) {
        const aggregatedTokens = this.aggregateWeeklyTokenData(weeklyData);
        
        return {
            startDate: getDateString(startDate),
            endDate: getDateString(endDate),
            timestamp: new Date().toISOString(),
            daysAnalyzed: weeklyData.length,
            totalUniqueTokens: aggregatedTokens.length,
            topWeeklyPerformers: this.getTopWeeklyPerformers(aggregatedTokens),
            marketCapGrowthLeaders: this.getMarketCapGrowthLeaders(aggregatedTokens),
            volumeConsistencyLeaders: this.getVolumeConsistencyLeaders(aggregatedTokens),
            newLaunchAnalysis: this.analyzeNewLaunches(aggregatedTokens),
            survivalAnalysis: this.analyzeSurvivalRates(weeklyData),
            weeklyTrends: this.analyzeWeeklyTrends(weeklyData),
            summary: this.generateWeeklySummary(aggregatedTokens, weeklyData)
        };
    }

    aggregateWeeklyTokenData(weeklyData) {
        const tokenMap = new Map();

        weeklyData.forEach(dayData => {
            if (dayData && dayData.tokens) {
                dayData.tokens.forEach(token => {
                    const key = token.address || token.symbol;
                    
                    if (!tokenMap.has(key)) {
                        tokenMap.set(key, {
                            ...token,
                            dailyData: [],
                            firstSeen: dayData.date,
                            lastSeen: dayData.date,
                            daysActive: 0,
                            avgVolume: 0,
                            avgMarketCap: 0,
                            maxMarketCap: token.marketCap || 0,
                            minMarketCap: token.marketCap || 0,
                            totalVolumeWeek: 0,
                            weeklyGrowth: 0
                        });
                    }

                    const existing = tokenMap.get(key);
                    existing.dailyData.push({
                        date: dayData.date,
                        price: token.price,
                        volume24h: token.volume24h,
                        marketCap: token.marketCap,
                        priceChange24h: token.priceChange24h
                    });

                    existing.lastSeen = dayData.date;
                    existing.daysActive++;
                    existing.maxMarketCap = Math.max(existing.maxMarketCap, token.marketCap || 0);
                    existing.minMarketCap = Math.min(existing.minMarketCap, token.marketCap || Infinity);
                    existing.totalVolumeWeek += token.volume24h || 0;

                    if (existing.dailyData.length > 1) {
                        const firstPrice = existing.dailyData[0].price;
                        const currentPrice = token.price;
                        existing.weeklyGrowth = firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0;
                    }
                });
            }
        });

        return Array.from(tokenMap.values()).map(token => {
            token.avgVolume = token.totalVolumeWeek / token.daysActive;
            token.avgMarketCap = token.dailyData.reduce((sum, day) => sum + (day.marketCap || 0), 0) / token.dailyData.length;
            token.volumeConsistency = this.calculateVolumeConsistency(token.dailyData);
            token.priceVolatility = this.calculatePriceVolatility(token.dailyData);
            return token;
        });
    }

    getTopWeeklyPerformers(tokens, limit = 15) {
        return tokens
            .filter(token => token.weeklyGrowth !== undefined && token.daysActive >= 3)
            .sort((a, b) => b.weeklyGrowth - a.weeklyGrowth)
            .slice(0, limit)
            .map(token => ({
                symbol: token.symbol,
                name: token.name,
                weeklyGrowth: token.weeklyGrowth,
                avgVolume: token.avgVolume,
                maxMarketCap: token.maxMarketCap,
                daysActive: token.daysActive,
                isFromLetsBonk: token.isFromLetsBonk,
                volumeConsistency: token.volumeConsistency,
                priceVolatility: token.priceVolatility
            }));
    }

    getMarketCapGrowthLeaders(tokens, limit = 10) {
        return tokens
            .filter(token => token.maxMarketCap > token.minMarketCap && token.daysActive >= 3)
            .map(token => ({
                ...token,
                marketCapGrowth: ((token.maxMarketCap - token.minMarketCap) / token.minMarketCap) * 100
            }))
            .sort((a, b) => b.marketCapGrowth - a.marketCapGrowth)
            .slice(0, limit)
            .map(token => ({
                symbol: token.symbol,
                name: token.name,
                marketCapGrowth: token.marketCapGrowth,
                startMarketCap: token.minMarketCap,
                peakMarketCap: token.maxMarketCap,
                currentMarketCap: token.marketCap,
                daysActive: token.daysActive,
                isFromLetsBonk: token.isFromLetsBonk
            }));
    }

    getVolumeConsistencyLeaders(tokens, limit = 10) {
        return tokens
            .filter(token => token.daysActive >= 5 && token.avgVolume > 10000)
            .sort((a, b) => b.volumeConsistency - a.volumeConsistency)
            .slice(0, limit)
            .map(token => ({
                symbol: token.symbol,
                name: token.name,
                volumeConsistency: token.volumeConsistency,
                avgVolume: token.avgVolume,
                totalVolumeWeek: token.totalVolumeWeek,
                daysActive: token.daysActive,
                avgMarketCap: token.avgMarketCap
            }));
    }

    analyzeNewLaunches(tokens) {
        const newLaunches = tokens.filter(token => 
            token.isFromLetsBonk && 
            token.daysSinceLaunch !== null && 
            token.daysSinceLaunch <= 7
        );

        const successful = newLaunches.filter(token => token.weeklyGrowth > 50);
        const moderate = newLaunches.filter(token => token.weeklyGrowth > 0 && token.weeklyGrowth <= 50);
        const unsuccessful = newLaunches.filter(token => token.weeklyGrowth <= 0);

        return {
            total: newLaunches.length,
            successful: successful.length,
            moderate: moderate.length,
            unsuccessful: unsuccessful.length,
            successRate: newLaunches.length > 0 ? (successful.length / newLaunches.length) * 100 : 0,
            avgGrowthSuccessful: successful.length > 0 ? successful.reduce((sum, t) => sum + t.weeklyGrowth, 0) / successful.length : 0,
            topNewPerformers: successful.slice(0, 5)
        };
    }

    analyzeSurvivalRates(weeklyData) {
        if (weeklyData.length < 2) return null;

        const firstDay = weeklyData[0];
        const lastDay = weeklyData[weeklyData.length - 1];
        
        if (!firstDay?.tokens || !lastDay?.tokens) return null;

        const firstDayTokens = new Set(firstDay.tokens.map(t => t.address || t.symbol));
        const lastDayTokens = new Set(lastDay.tokens.map(t => t.address || t.symbol));
        
        const survived = Array.from(firstDayTokens).filter(token => lastDayTokens.has(token));
        const newEntrants = Array.from(lastDayTokens).filter(token => !firstDayTokens.has(token));

        return {
            startingTokens: firstDayTokens.size,
            endingTokens: lastDayTokens.size,
            survived: survived.length,
            dropped: firstDayTokens.size - survived.length,
            newEntrants: newEntrants.length,
            survivalRate: firstDayTokens.size > 0 ? (survived.length / firstDayTokens.size) * 100 : 0
        };
    }

    analyzeWeeklyTrends(weeklyData) {
        if (weeklyData.length < 2) return null;

        const dailyMetrics = weeklyData.map(day => ({
            date: day.date,
            totalVolume: day.tokens?.reduce((sum, t) => sum + (t.volume24h || 0), 0) || 0,
            totalMarketCap: day.tokens?.reduce((sum, t) => sum + (t.marketCap || 0), 0) || 0,
            avgPriceChange: day.tokens?.length > 0 ? 
                day.tokens.reduce((sum, t) => sum + (t.priceChange24h || 0), 0) / day.tokens.length : 0,
            activeTokens: day.tokens?.length || 0
        }));

        const volumeTrend = this.calculateTrend(dailyMetrics.map(d => d.totalVolume));
        const marketCapTrend = this.calculateTrend(dailyMetrics.map(d => d.totalMarketCap));
        const activityTrend = this.calculateTrend(dailyMetrics.map(d => d.activeTokens));

        return {
            dailyMetrics,
            volumeTrend,
            marketCapTrend,
            activityTrend,
            weeklyVolumeGrowth: this.calculateGrowthRate(dailyMetrics[0].totalVolume, dailyMetrics[dailyMetrics.length - 1].totalVolume),
            weeklyMarketCapGrowth: this.calculateGrowthRate(dailyMetrics[0].totalMarketCap, dailyMetrics[dailyMetrics.length - 1].totalMarketCap)
        };
    }

    generateWeeklySummary(tokens, weeklyData) {
        const topPerformer = this.getTopWeeklyPerformers(tokens, 1)[0];
        const newLaunches = this.analyzeNewLaunches(tokens);
        const survival = this.analyzeSurvivalRates(weeklyData);
        const trends = this.analyzeWeeklyTrends(weeklyData);

        return {
            totalTokensAnalyzed: tokens.length,
            topPerformer: topPerformer?.symbol,
            topPerformerGrowth: topPerformer?.weeklyGrowth,
            newLaunchesCount: newLaunches.total,
            newLaunchSuccessRate: newLaunches.successRate,
            survivalRate: survival?.survivalRate,
            marketTrend: trends?.volumeTrend > 0 ? 'growing' : trends?.volumeTrend < 0 ? 'declining' : 'stable',
            avgDailyVolume: trends?.dailyMetrics ? 
                trends.dailyMetrics.reduce((sum, d) => sum + d.totalVolume, 0) / trends.dailyMetrics.length : 0
        };
    }

    calculateVolumeConsistency(dailyData) {
        if (dailyData.length < 2) return 0;

        const volumes = dailyData.map(d => d.volume24h || 0).filter(v => v > 0);
        if (volumes.length === 0) return 0;

        const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const variance = volumes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / volumes.length;
        const stdDev = Math.sqrt(variance);

        return mean > 0 ? Math.max(0, 1 - (stdDev / mean)) : 0;
    }

    calculatePriceVolatility(dailyData) {
        if (dailyData.length < 2) return 0;

        const prices = dailyData.map(d => d.price || 0).filter(p => p > 0);
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

    calculateTrend(values) {
        if (values.length < 2) return 0;

        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        const n = values.length;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += values[i];
            sumXY += i * values[i];
            sumXX += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return slope;
    }

    calculateGrowthRate(start, end) {
        if (!start || start === 0) return 0;
        return ((end - start) / start) * 100;
    }

    generateHTMLReport(data) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weekly Memecoin Report - ${data.startDate} to ${data.endDate}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .section { background: white; padding: 20px; margin-bottom: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: #333; }
        .stat-label { color: #666; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .positive { color: #28a745; }
        .negative { color: #dc3545; }
        .neutral { color: #6c757d; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .badge-success { background-color: #d4edda; color: #155724; }
        .badge-warning { background-color: #fff3cd; color: #856404; }
        .badge-info { background-color: #d1ecf1; color: #0c5460; }
        .progress-bar { width: 100%; height: 20px; background-color: #e9ecef; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background-color: #28a745; transition: width 0.3s; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📈 Weekly Solana Memecoin Analysis Report</h1>
            <p>Period: ${data.startDate} to ${data.endDate} | Generated: ${new Date(data.timestamp).toLocaleString()}</p>
        </div>

        <div class="section">
            <h2>📊 Weekly Overview</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${data.totalUniqueTokens}</div>
                    <div class="stat-label">Unique Tokens Analyzed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.daysAnalyzed}</div>
                    <div class="stat-label">Days Analyzed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.summary.topPerformer || 'N/A'}</div>
                    <div class="stat-label">Top Weekly Performer</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value ${data.summary.topPerformerGrowth >= 0 ? 'positive' : 'negative'}">${formatPercentage(data.summary.topPerformerGrowth || 0)}</div>
                    <div class="stat-label">Top Performer Growth</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.summary.newLaunchesCount}</div>
                    <div class="stat-label">New Launches Tracked</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatPercentage(data.summary.newLaunchSuccessRate || 0)}</div>
                    <div class="stat-label">New Launch Success Rate</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>🏆 Top Weekly Performers</h2>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Token</th>
                        <th>Weekly Growth</th>
                        <th>Avg Daily Volume</th>
                        <th>Peak Market Cap</th>
                        <th>Days Active</th>
                        <th>Volume Consistency</th>
                        <th>Source</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.topWeeklyPerformers.map((token, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td><strong>${token.symbol}</strong><br><small>${token.name}</small></td>
                            <td class="${token.weeklyGrowth >= 0 ? 'positive' : 'negative'}">${formatPercentage(token.weeklyGrowth)}</td>
                            <td>$${formatNumber(token.avgVolume)}</td>
                            <td>$${formatNumber(token.maxMarketCap)}</td>
                            <td>${token.daysActive}</td>
                            <td>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${Math.min(token.volumeConsistency * 100, 100)}%"></div>
                                </div>
                                ${(token.volumeConsistency * 100).toFixed(1)}%
                            </td>
                            <td>${token.isFromLetsBonk ? '<span class="badge badge-success">LetsBonk</span>' : '<span class="badge badge-warning">Other</span>'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>💰 Market Cap Growth Leaders</h2>
            <table>
                <thead>
                    <tr>
                        <th>Token</th>
                        <th>Market Cap Growth</th>
                        <th>Starting MCap</th>
                        <th>Peak MCap</th>
                        <th>Current MCap</th>
                        <th>Days Active</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.marketCapGrowthLeaders.map(token => `
                        <tr>
                            <td><strong>${token.symbol}</strong><br><small>${token.name}</small></td>
                            <td class="positive">${formatPercentage(token.marketCapGrowth)}</td>
                            <td>$${formatNumber(token.startMarketCap)}</td>
                            <td>$${formatNumber(token.peakMarketCap)}</td>
                            <td>$${formatNumber(token.currentMarketCap)}</td>
                            <td>${token.daysActive}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>🔄 Volume Consistency Leaders</h2>
            <table>
                <thead>
                    <tr>
                        <th>Token</th>
                        <th>Consistency Score</th>
                        <th>Avg Daily Volume</th>
                        <th>Total Weekly Volume</th>
                        <th>Days Active</th>
                        <th>Avg Market Cap</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.volumeConsistencyLeaders.map(token => `
                        <tr>
                            <td><strong>${token.symbol}</strong><br><small>${token.name}</small></td>
                            <td>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${Math.min(token.volumeConsistency * 100, 100)}%"></div>
                                </div>
                                ${(token.volumeConsistency * 100).toFixed(1)}%
                            </td>
                            <td>$${formatNumber(token.avgVolume)}</td>
                            <td>$${formatNumber(token.totalVolumeWeek)}</td>
                            <td>${token.daysActive}</td>
                            <td>$${formatNumber(token.avgMarketCap)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>🆕 New Launch Analysis</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${data.newLaunchAnalysis.total}</div>
                    <div class="stat-label">Total New Launches</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value positive">${data.newLaunchAnalysis.successful}</div>
                    <div class="stat-label">Successful (>50% growth)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value neutral">${data.newLaunchAnalysis.moderate}</div>
                    <div class="stat-label">Moderate (0-50% growth)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value negative">${data.newLaunchAnalysis.unsuccessful}</div>
                    <div class="stat-label">Unsuccessful (<0% growth)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatPercentage(data.newLaunchAnalysis.successRate)}</div>
                    <div class="stat-label">Success Rate</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value positive">${formatPercentage(data.newLaunchAnalysis.avgGrowthSuccessful)}</div>
                    <div class="stat-label">Avg Growth (Successful)</div>
                </div>
            </div>
        </div>

        ${data.survivalAnalysis ? `
        <div class="section">
            <h2>📈 Token Survival Analysis</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${data.survivalAnalysis.startingTokens}</div>
                    <div class="stat-label">Starting Tokens</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.survivalAnalysis.endingTokens}</div>
                    <div class="stat-label">Ending Tokens</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value positive">${data.survivalAnalysis.survived}</div>
                    <div class="stat-label">Survived Full Week</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value negative">${data.survivalAnalysis.dropped}</div>
                    <div class="stat-label">Dropped Out</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value neutral">${data.survivalAnalysis.newEntrants}</div>
                    <div class="stat-label">New Entrants</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatPercentage(data.survivalAnalysis.survivalRate)}</div>
                    <div class="stat-label">Survival Rate</div>
                </div>
            </div>
        </div>
        ` : ''}

        <footer style="text-align: center; margin-top: 40px; color: #666;">
            <p>Generated by Solana Memecoin Tracker | Data from DexScreener & LetsBonk.fun</p>
        </footer>
    </div>
</body>
</html>`;
    }

    generateCSVReport(data) {
        const headers = [
            'Symbol', 'Name', 'Weekly_Growth', 'Avg_Volume', 'Max_Market_Cap', 
            'Days_Active', 'Volume_Consistency', 'Price_Volatility', 'Is_LetsBonk'
        ];

        const rows = data.topWeeklyPerformers.map(token => [
            token.symbol,
            token.name,
            token.weeklyGrowth || 0,
            token.avgVolume || 0,
            token.maxMarketCap || 0,
            token.daysActive || 0,
            token.volumeConsistency || 0,
            token.priceVolatility || 0,
            token.isFromLetsBonk ? 'Yes' : 'No'
        ]);

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    generateTextSummary(data) {
        const summary = data.summary;

        return `
WEEKLY SOLANA MEMECOIN ANALYSIS REPORT
Period: ${data.startDate} to ${data.endDate}
${'='.repeat(60)}

WEEKLY OVERVIEW:
• Total unique tokens analyzed: ${data.totalUniqueTokens}
• Days of data analyzed: ${data.daysAnalyzed}
• Top weekly performer: ${summary.topPerformer} (${formatPercentage(summary.topPerformerGrowth)})
• Market trend: ${summary.marketTrend.toUpperCase()}

NEW LAUNCH PERFORMANCE:
• Total new launches: ${data.newLaunchAnalysis.total}
• Successful launches (>50% growth): ${data.newLaunchAnalysis.successful}
• Success rate: ${formatPercentage(data.newLaunchAnalysis.successRate)}
• Average growth of successful launches: ${formatPercentage(data.newLaunchAnalysis.avgGrowthSuccessful)}

${data.survivalAnalysis ? `
TOKEN SURVIVAL:
• Starting tokens: ${data.survivalAnalysis.startingTokens}
• Survived full week: ${data.survivalAnalysis.survived}
• Survival rate: ${formatPercentage(data.survivalAnalysis.survivalRate)}
• New entrants: ${data.survivalAnalysis.newEntrants}
` : ''}

TOP 5 WEEKLY PERFORMERS:
${data.topWeeklyPerformers.slice(0, 5).map((token, index) => 
    `${index + 1}. ${token.symbol} - ${formatPercentage(token.weeklyGrowth)} (${token.daysActive} days active)`
).join('\n')}

Generated: ${new Date(data.timestamp).toLocaleString()}
`;
    }
}

module.exports = WeeklyReportGenerator;