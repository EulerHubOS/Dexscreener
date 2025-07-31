const fs = require('fs-extra');
const path = require('path');
const { formatNumber, formatPercentage, Logger, getDateString } = require('../utils/helpers');

class DailyReportGenerator {
    constructor(config) {
        this.config = config;
        this.reportsDir = config.database.reportsDir;
    }

    async generateDailyReport(tokens, date = new Date()) {
        try {
            Logger.info('Generating daily report...');
            
            const reportData = this.prepareDailyData(tokens, date);
            const htmlReport = this.generateHTMLReport(reportData);
            const csvData = this.generateCSVReport(reportData);
            const textSummary = this.generateTextSummary(reportData);

            const dateStr = getDateString(date);
            const baseFileName = `daily-report-${dateStr}`;

            await fs.ensureDir(this.reportsDir);
            
            await Promise.all([
                fs.writeFile(path.join(this.reportsDir, `${baseFileName}.html`), htmlReport),
                fs.writeFile(path.join(this.reportsDir, `${baseFileName}.csv`), csvData),
                fs.writeFile(path.join(this.reportsDir, `${baseFileName}.txt`), textSummary)
            ]);

            Logger.info(`Daily report generated: ${baseFileName}`);
            return {
                html: htmlReport,
                csv: csvData,
                text: textSummary,
                data: reportData
            };
        } catch (error) {
            Logger.error('Failed to generate daily report:', error.message);
            throw error;
        }
    }

    prepareDailyData(tokens, date) {
        const topPerformers = this.getTopPerformers(tokens);
        const topByVolume = this.getTopByVolume(tokens);
        const biggestLosers = this.getBiggestLosers(tokens);
        const newLaunches = this.getNewLaunches(tokens);
        const marketOverview = this.getMarketOverview(tokens);

        return {
            date: getDateString(date),
            timestamp: date.toISOString(),
            totalTokens: tokens.length,
            topPerformers,
            topByVolume,
            biggestLosers,
            newLaunches,
            marketOverview,
            summary: this.generateSummary(tokens)
        };
    }

    getTopPerformers(tokens, limit = 10) {
        return tokens
            .filter(token => token.priceChange24h !== undefined)
            .sort((a, b) => (b.priceChange24h || 0) - (a.priceChange24h || 0))
            .slice(0, limit)
            .map(token => ({
                symbol: token.symbol,
                name: token.name,
                price: token.price,
                priceChange24h: token.priceChange24h,
                volume24h: token.volume24h,
                marketCap: token.marketCap,
                liquidity: token.liquidity,
                isFromLetsBonk: token.isFromLetsBonk || false,
                daysSinceLaunch: token.daysSinceLaunch
            }));
    }

    getTopByVolume(tokens, limit = 10) {
        return tokens
            .filter(token => token.volume24h > 0)
            .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
            .slice(0, limit)
            .map(token => ({
                symbol: token.symbol,
                name: token.name,
                volume24h: token.volume24h,
                priceChange24h: token.priceChange24h,
                marketCap: token.marketCap,
                volumeToMcapRatio: token.marketCap > 0 ? (token.volume24h / token.marketCap) * 100 : 0
            }));
    }

    getBiggestLosers(tokens, limit = 5) {
        return tokens
            .filter(token => token.priceChange24h !== undefined && token.priceChange24h < 0)
            .sort((a, b) => (a.priceChange24h || 0) - (b.priceChange24h || 0))
            .slice(0, limit)
            .map(token => ({
                symbol: token.symbol,
                name: token.name,
                price: token.price,
                priceChange24h: token.priceChange24h,
                volume24h: token.volume24h,
                marketCap: token.marketCap
            }));
    }

    getNewLaunches(tokens, maxDays = 1) {
        return tokens
            .filter(token => 
                token.isFromLetsBonk && 
                token.daysSinceLaunch !== null && 
                token.daysSinceLaunch <= maxDays
            )
            .sort((a, b) => (a.daysSinceLaunch || 0) - (b.daysSinceLaunch || 0))
            .map(token => ({
                symbol: token.symbol,
                name: token.name,
                price: token.price,
                marketCap: token.marketCap,
                volume24h: token.volume24h,
                daysSinceLaunch: token.daysSinceLaunch,
                launchTime: token.launchInfo?.launchTime
            }));
    }

    getMarketOverview(tokens) {
        const validTokens = tokens.filter(token => token.marketCap > 0);
        
        const totalMarketCap = validTokens.reduce((sum, token) => sum + (token.marketCap || 0), 0);
        const totalVolume = validTokens.reduce((sum, token) => sum + (token.volume24h || 0), 0);
        const avgPriceChange = validTokens.reduce((sum, token) => sum + (token.priceChange24h || 0), 0) / validTokens.length;
        
        const gainers = validTokens.filter(token => (token.priceChange24h || 0) > 0).length;
        const losers = validTokens.filter(token => (token.priceChange24h || 0) < 0).length;
        const neutral = validTokens.length - gainers - losers;

        return {
            totalTokens: validTokens.length,
            totalMarketCap,
            totalVolume,
            avgPriceChange,
            gainers,
            losers,
            neutral,
            letsBonkTokens: tokens.filter(token => token.isFromLetsBonk).length
        };
    }

    generateSummary(tokens) {
        const overview = this.getMarketOverview(tokens);
        const topGainer = this.getTopPerformers(tokens, 1)[0];
        const topVolume = this.getTopByVolume(tokens, 1)[0];

        return {
            marketSentiment: overview.gainers > overview.losers ? 'bullish' : 'bearish',
            topGainer: topGainer?.symbol,
            topGainerChange: topGainer?.priceChange24h,
            highestVolume: topVolume?.symbol,
            highestVolumeAmount: topVolume?.volume24h,
            newLaunchesCount: this.getNewLaunches(tokens).length
        };
    }

    generateHTMLReport(data) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Memecoin Report - ${data.date}</title>
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Daily Solana Memecoin Report</h1>
            <p>Date: ${data.date} | Generated: ${new Date(data.timestamp).toLocaleString()}</p>
        </div>

        <div class="section">
            <h2>📊 Market Overview</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${data.totalTokens}</div>
                    <div class="stat-label">Total Tokens Tracked</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">$${formatNumber(data.marketOverview.totalMarketCap)}</div>
                    <div class="stat-label">Total Market Cap</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">$${formatNumber(data.marketOverview.totalVolume)}</div>
                    <div class="stat-label">Total Volume 24h</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value ${data.marketOverview.avgPriceChange >= 0 ? 'positive' : 'negative'}">${formatPercentage(data.marketOverview.avgPriceChange)}</div>
                    <div class="stat-label">Avg Price Change</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value positive">${data.marketOverview.gainers}</div>
                    <div class="stat-label">Gainers</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value negative">${data.marketOverview.losers}</div>
                    <div class="stat-label">Losers</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>🏆 Top Performers (24h)</h2>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Token</th>
                        <th>Price</th>
                        <th>Change 24h</th>
                        <th>Volume 24h</th>
                        <th>Market Cap</th>
                        <th>Source</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.topPerformers.map((token, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td><strong>${token.symbol}</strong><br><small>${token.name}</small></td>
                            <td>$${token.price?.toFixed(8) || 'N/A'}</td>
                            <td class="${token.priceChange24h >= 0 ? 'positive' : 'negative'}">${formatPercentage(token.priceChange24h)}</td>
                            <td>$${formatNumber(token.volume24h)}</td>
                            <td>$${formatNumber(token.marketCap)}</td>
                            <td>${token.isFromLetsBonk ? '<span class="badge badge-success">LetsBonk</span>' : '<span class="badge badge-warning">Other</span>'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>💧 Top Volume Tokens</h2>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Token</th>
                        <th>Volume 24h</th>
                        <th>Price Change</th>
                        <th>Vol/MCap Ratio</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.topByVolume.map((token, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td><strong>${token.symbol}</strong><br><small>${token.name}</small></td>
                            <td>$${formatNumber(token.volume24h)}</td>
                            <td class="${token.priceChange24h >= 0 ? 'positive' : 'negative'}">${formatPercentage(token.priceChange24h)}</td>
                            <td>${formatPercentage(token.volumeToMcapRatio)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        ${data.newLaunches.length > 0 ? `
        <div class="section">
            <h2>🆕 New Launches (Last 24h)</h2>
            <table>
                <thead>
                    <tr>
                        <th>Token</th>
                        <th>Price</th>
                        <th>Market Cap</th>
                        <th>Volume 24h</th>
                        <th>Days Since Launch</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.newLaunches.map(token => `
                        <tr>
                            <td><strong>${token.symbol}</strong><br><small>${token.name}</small></td>
                            <td>$${token.price?.toFixed(8) || 'N/A'}</td>
                            <td>$${formatNumber(token.marketCap)}</td>
                            <td>$${formatNumber(token.volume24h)}</td>
                            <td>${token.daysSinceLaunch} days</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="section">
            <h2>📉 Biggest Losers</h2>
            <table>
                <thead>
                    <tr>
                        <th>Token</th>
                        <th>Price</th>
                        <th>Change 24h</th>
                        <th>Volume 24h</th>
                        <th>Market Cap</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.biggestLosers.map(token => `
                        <tr>
                            <td><strong>${token.symbol}</strong><br><small>${token.name}</small></td>
                            <td>$${token.price?.toFixed(8) || 'N/A'}</td>
                            <td class="negative">${formatPercentage(token.priceChange24h)}</td>
                            <td>$${formatNumber(token.volume24h)}</td>
                            <td>$${formatNumber(token.marketCap)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <footer style="text-align: center; margin-top: 40px; color: #666;">
            <p>Generated by Solana Memecoin Tracker | Data from DexScreener & LetsBonk.fun</p>
        </footer>
    </div>
</body>
</html>`;
    }

    generateCSVReport(data) {
        const headers = [
            'Rank', 'Symbol', 'Name', 'Price', 'Change_24h', 'Volume_24h', 
            'Market_Cap', 'Liquidity', 'Is_LetsBonk', 'Days_Since_Launch'
        ];

        const rows = data.topPerformers.map((token, index) => [
            index + 1,
            token.symbol,
            token.name,
            token.price || 0,
            token.priceChange24h || 0,
            token.volume24h || 0,
            token.marketCap || 0,
            token.liquidity || 0,
            token.isFromLetsBonk ? 'Yes' : 'No',
            token.daysSinceLaunch || 'N/A'
        ]);

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    generateTextSummary(data) {
        const summary = data.summary;
        const overview = data.marketOverview;

        return `
DAILY SOLANA MEMECOIN REPORT - ${data.date}
${'='.repeat(50)}

MARKET OVERVIEW:
• Total tokens tracked: ${data.totalTokens}
• Total market cap: $${formatNumber(overview.totalMarketCap)}
• Total volume (24h): $${formatNumber(overview.totalVolume)}
• Average price change: ${formatPercentage(overview.avgPriceChange)}
• Market sentiment: ${summary.marketSentiment.toUpperCase()}

PERFORMANCE HIGHLIGHTS:
• Gainers: ${overview.gainers} tokens
• Losers: ${overview.losers} tokens
• Top gainer: ${summary.topGainer} (${formatPercentage(summary.topGainerChange)})
• Highest volume: ${summary.highestVolume} ($${formatNumber(summary.highestVolumeAmount)})

NEW LAUNCHES:
• New tokens in last 24h: ${summary.newLaunchesCount}
• LetsBonk tokens tracked: ${overview.letsBonkTokens}

TOP 5 PERFORMERS:
${data.topPerformers.slice(0, 5).map((token, index) => 
    `${index + 1}. ${token.symbol} - ${formatPercentage(token.priceChange24h)} (Vol: $${formatNumber(token.volume24h)})`
).join('\n')}

Generated: ${new Date(data.timestamp).toLocaleString()}
`;
    }
}

// Standalone execution
if (require.main === module) {
    async function runDailyReport() {
        try {
            const config = require('../../config/settings.json');
            const TokenDatabase = require('../utils/database');
            
            const database = new TokenDatabase(config);
            await database.initialize();
            
            const tokens = await database.loadTokenData();
            
            if (tokens.length === 0) {
                console.log('No token data available. Run the main tracker first to collect data.');
                return;
            }
            
            const generator = new DailyReportGenerator(config);
            const report = await generator.generateDailyReport(tokens);
            
            console.log('✅ Daily report generated successfully');
            console.log(`📊 Report covers ${tokens.length} tokens`);
            console.log(`📁 Reports saved to: ${config.database.reportsDir}`);
            
        } catch (error) {
            console.error('❌ Failed to generate daily report:', error.message);
            process.exit(1);
        }
    }
    
    runDailyReport();
}

module.exports = DailyReportGenerator;