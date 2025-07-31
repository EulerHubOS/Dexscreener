#!/usr/bin/env node

const cron = require('node-cron');
const fs = require('fs-extra');
const chalk = require('chalk');
const Table = require('cli-table3');

const DexScreenerAPI = require('./src/data-collectors/dexscreener');
const LetsBonkAPI = require('./src/data-collectors/letsbonk');
const PerformanceAnalyzer = require('./src/analyzers/performance');
const DailyReportGenerator = require('./src/reporters/daily-report');
const WeeklyReportGenerator = require('./src/reporters/weekly-report');
const TokenDatabase = require('./src/utils/database');
const PortfolioTracker = require('./src/utils/portfolio');
const { Logger, formatNumber, formatPercentage } = require('./src/utils/helpers');

class SolanaMemecoinTracker {
    constructor() {
        this.config = require('./config/settings.json');
        this.dexScreener = new DexScreenerAPI(this.config.api.dexscreener);
        this.letsBonk = new LetsBonkAPI(this.config.api.letsbonk);
        this.analyzer = new PerformanceAnalyzer();
        this.database = new TokenDatabase(this.config);
        this.portfolio = new PortfolioTracker(this.config);
        this.dailyReporter = new DailyReportGenerator(this.config);
        this.weeklyReporter = new WeeklyReportGenerator(this.config);
        this.isRunning = false;
        this.cronJobs = [];
    }

    async initialize() {
        try {
            Logger.info('🚀 Initializing Solana Memecoin Tracker...');
            
            await this.database.initialize();
            
            Logger.info('✅ Tracker initialized successfully');
            return true;
        } catch (error) {
            Logger.error('❌ Failed to initialize tracker:', error.message);
            throw error;
        }
    }

    async collectTokenData() {
        try {
            Logger.info('📊 Starting token data collection...');
            
            const { minMarketCap, maxMarketCap, maxTokensToTrack } = this.config.tracking;
            
            Logger.info('🔍 Fetching tokens from DexScreener...');
            const dexTokens = await this.dexScreener.getTopTokens(
                maxTokensToTrack, 
                minMarketCap, 
                maxMarketCap
            );
            
            Logger.info('🆕 Fetching recent launches from LetsBonk...');
            const recentLaunches = await this.letsBonk.getRecentLaunches(24);
            
            Logger.info('🔥 Fetching trending tokens from LetsBonk...');
            const trendingTokens = await this.letsBonk.getTrendingTokens(20);
            
            Logger.info('🔗 Enriching tokens with launch data...');
            const enrichedTokens = [];
            
            for (const token of dexTokens) {
                const enriched = await this.letsBonk.enrichTokenWithLaunchData(token);
                enrichedTokens.push(enriched);
            }
            
            const uniqueTokens = this.deduplicateTokens([
                ...enrichedTokens,
                ...recentLaunches.map(launch => ({ ...launch, isFromLetsBonk: true })),
                ...trendingTokens.map(trending => ({ ...trending, isFromLetsBonk: true }))
            ]);
            
            Logger.info(`📈 Collected ${uniqueTokens.length} unique tokens`);
            
            await this.database.saveTokenData(uniqueTokens, {
                collectionTime: new Date().toISOString(),
                sources: ['DexScreener', 'LetsBonk'],
                filters: { minMarketCap, maxMarketCap }
            });
            
            return uniqueTokens;
        } catch (error) {
            Logger.error('❌ Failed to collect token data:', error.message);
            throw error;
        }
    }

    deduplicateTokens(tokens) {
        const seen = new Set();
        const unique = [];
        
        for (const token of tokens) {
            const key = token.address || token.symbol;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(token);
            }
        }
        
        return unique;
    }

    async analyzeTokens(tokens) {
        try {
            Logger.info('🧮 Analyzing token performance...');
            
            const analyses = [];
            
            for (const token of tokens) {
                const historical = await this.database.getTokenHistory(
                    token.address || token.symbol, 
                    7
                );
                
                const analysis = this.analyzer.analyzeTokenPerformance(token, historical);
                analyses.push(analysis);
            }
            
            const rankedAnalyses = this.analyzer.rankTokens(analyses);
            
            Logger.info(`📊 Analyzed ${rankedAnalyses.length} tokens`);
            return rankedAnalyses;
        } catch (error) {
            Logger.error('❌ Failed to analyze tokens:', error.message);
            throw error;
        }
    }

    async generateDailyReport() {
        try {
            Logger.info('📝 Generating daily report...');
            
            const tokens = await this.database.loadTokenData();
            if (tokens.length === 0) {
                Logger.warn('⚠️ No token data available for daily report');
                return null;
            }
            
            const report = await this.dailyReporter.generateDailyReport(tokens);
            
            Logger.info('✅ Daily report generated successfully');
            return report;
        } catch (error) {
            Logger.error('❌ Failed to generate daily report:', error.message);
            throw error;
        }
    }

    async generateWeeklyReport() {
        try {
            Logger.info('📊 Generating weekly report...');
            
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            
            const weeklyData = await this.database.loadHistoricalData(startDate, endDate);
            
            if (weeklyData.length === 0) {
                Logger.warn('⚠️ No historical data available for weekly report');
                return null;
            }
            
            const report = await this.weeklyReporter.generateWeeklyReport(
                weeklyData, 
                startDate, 
                endDate
            );
            
            Logger.info('✅ Weekly report generated successfully');
            return report;
        } catch (error) {
            Logger.error('❌ Failed to generate weekly report:', error.message);
            throw error;
        }
    }

    async runDailyAnalysis() {
        try {
            Logger.info('🔄 Starting daily analysis cycle...');
            
            const tokens = await this.collectTokenData();
            const analyses = await this.analyzeTokens(tokens);
            const report = await this.generateDailyReport();
            
            // Auto-add promising tokens to watchlist
            const autoAdded = await this.portfolio.autoAddPromisingTokens(tokens);
            if (autoAdded > 0) {
                Logger.info(`🎯 Auto-added ${autoAdded} promising tokens to watchlist`);
            }
            
            // Check watchlist alerts
            const alerts = await this.portfolio.checkWatchlistAlerts(tokens);
            if (alerts.length > 0) {
                Logger.info(`🚨 Generated ${alerts.length} watchlist alerts`);
                alerts.forEach(alert => {
                    const emoji = alert.severity === 'high' ? '🔥' : '⚠️';
                    Logger.info(`${emoji} ${alert.message}`);
                });
            }
            
            this.displayTopPerformers(analyses.slice(0, 10));
            
            await this.database.cleanOldData(this.config.tracking.dataRetentionDays);
            
            Logger.info('✅ Daily analysis completed successfully');
            return { tokens, analyses, report };
        } catch (error) {
            Logger.error('❌ Daily analysis failed:', error.message);
            throw error;
        }
    }

    displayTopPerformers(topPerformers) {
        if (topPerformers.length === 0) return;

        console.log(chalk.cyan('\n🏆 TOP 10 PERFORMERS (24H)\n'));
        
        const table = new Table({
            head: [
                chalk.white('Rank'),
                chalk.white('Token'),
                chalk.white('Price'),
                chalk.white('Change 24h'),
                chalk.white('Volume'),
                chalk.white('MCap'),
                chalk.white('Score'),
                chalk.white('Source')
            ],
            colWidths: [6, 12, 12, 12, 12, 12, 8, 10]
        });

        topPerformers.forEach((analysis, index) => {
            const token = analysis.current;
            const perf = analysis.performance.pricePerformance;
            
            const changeColor = perf.change24h >= 0 ? chalk.green : chalk.red;
            const scoreColor = analysis.score >= 70 ? chalk.green : 
                             analysis.score >= 50 ? chalk.yellow : chalk.red;

            table.push([
                chalk.white(`#${index + 1}`),
                `${chalk.bold(token.symbol)}\n${chalk.gray(token.name?.slice(0, 8) || '')}`,
                `$${token.price?.toFixed(6) || 'N/A'}`,
                changeColor(formatPercentage(perf.change24h || 0)),
                `$${formatNumber(token.volume24h || 0)}`,
                `$${formatNumber(token.marketCap || 0)}`,
                scoreColor(analysis.score.toFixed(0)),
                token.isFromLetsBonk ? chalk.green('LetsBonk') : chalk.yellow('Other')
            ]);
        });

        console.log(table.toString());
    }

    displayStatus() {
        console.log(chalk.cyan('\n📊 SOLANA MEMECOIN TRACKER STATUS\n'));
        
        const statusTable = new Table({
            head: [chalk.white('Metric'), chalk.white('Value')],
            colWidths: [30, 20]
        });

        statusTable.push(
            ['Running', this.isRunning ? chalk.green('Yes') : chalk.red('No')],
            ['Active Cron Jobs', chalk.white(this.cronJobs.length.toString())],
            ['Config File', chalk.white('settings.json')],
            ['Data Directory', chalk.white(this.config.database.tokensFile)]
        );

        console.log(statusTable.toString());
    }

    setupScheduledTasks() {
        try {
            Logger.info('⏰ Setting up scheduled tasks...');
            
            const dailyReportTime = this.config.reporting.dailyReportTime;
            const [hour, minute] = dailyReportTime.split(':').map(Number);
            
            const dailyJob = cron.schedule(`${minute} ${hour} * * *`, async () => {
                Logger.info('🔔 Daily scheduled analysis starting...');
                try {
                    await this.runDailyAnalysis();
                } catch (error) {
                    Logger.error('❌ Scheduled daily analysis failed:', error.message);
                }
            }, {
                scheduled: false,
                timezone: this.config.reporting.timezone
            });

            const weeklyJob = cron.schedule('0 9 * * 0', async () => {
                Logger.info('🔔 Weekly report generation starting...');
                try {
                    await this.generateWeeklyReport();
                } catch (error) {
                    Logger.error('❌ Scheduled weekly report failed:', error.message);
                }
            }, {
                scheduled: false,
                timezone: this.config.reporting.timezone
            });

            const monitoringJob = cron.schedule(`*/${this.config.monitoring.checkIntervalMinutes} * * * *`, async () => {
                try {
                    const stats = await this.database.getTokenStatistics();
                    if (stats) {
                        Logger.info(`💾 Database: ${stats.currentTokenCount} tokens, ${stats.historicalDays} days of data`);
                    }
                } catch (error) {
                    Logger.error('❌ Monitoring check failed:', error.message);
                }
            }, {
                scheduled: false
            });

            this.cronJobs = [dailyJob, weeklyJob, monitoringJob];
            
            Logger.info('✅ Scheduled tasks configured successfully');
        } catch (error) {
            Logger.error('❌ Failed to setup scheduled tasks:', error.message);
            throw error;
        }
    }

    startScheduledTasks() {
        Logger.info('▶️ Starting scheduled tasks...');
        this.cronJobs.forEach(job => job.start());
        this.isRunning = true;
        Logger.info('✅ All scheduled tasks are now running');
    }

    stopScheduledTasks() {
        Logger.info('⏹️ Stopping scheduled tasks...');
        this.cronJobs.forEach(job => job.stop());
        this.isRunning = false;
        Logger.info('✅ All scheduled tasks stopped');
    }

    async start() {
        try {
            await this.initialize();
            this.setupScheduledTasks();
            this.startScheduledTasks();
            
            console.log(chalk.green('\n🚀 Solana Memecoin Tracker Started Successfully!\n'));
            this.displayStatus();
            
            console.log(chalk.cyan('\nAvailable Commands:'));
            console.log(chalk.white('  npm run daily-report   - Generate daily report'));
            console.log(chalk.white('  npm run weekly-report  - Generate weekly report'));
            console.log(chalk.white('  Ctrl+C                 - Stop the tracker\n'));
            
            await this.runDailyAnalysis();
            
        } catch (error) {
            Logger.error('❌ Failed to start tracker:', error.message);
            process.exit(1);
        }
    }

    async stop() {
        Logger.info('🛑 Shutting down Solana Memecoin Tracker...');
        this.stopScheduledTasks();
        Logger.info('✅ Tracker shutdown completed');
        process.exit(0);
    }
}

if (require.main === module) {
    const tracker = new SolanaMemecoinTracker();
    
    process.on('SIGINT', async () => {
        await tracker.stop();
    });
    
    process.on('SIGTERM', async () => {
        await tracker.stop();
    });
    
    tracker.start().catch(error => {
        Logger.error('❌ Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = SolanaMemecoinTracker;