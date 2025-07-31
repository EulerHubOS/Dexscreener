#!/usr/bin/env node

const SolanaMemecoinTracker = require('./main');
const PortfolioTracker = require('./src/utils/portfolio');
const TokenDatabase = require('./src/utils/database');
const chalk = require('chalk');
const Table = require('cli-table3');

const config = require('./config/settings.json');
const database = new TokenDatabase(config);
const portfolio = new PortfolioTracker(config);

async function showHelp() {
    console.log(chalk.cyan('\n🚀 Solana Memecoin Tracker - CLI Commands\n'));
    
    const commands = [
        ['npm start', 'Start full tracker with automation'],
        ['npm run daily-report', 'Generate daily HTML/CSV report'],
        ['npm run weekly-report', 'Generate weekly analysis report'],
        ['node cli-commands.js status', 'Show current system status'],
        ['node cli-commands.js top [N]', 'Show top N performers (default 10)'],
        ['node cli-commands.js search <query>', 'Search tokens by symbol/name'],
        ['node cli-commands.js watch <address>', 'Add token to watchlist'],
        ['node cli-commands.js unwatch <address>', 'Remove from watchlist'],
        ['node cli-commands.js watchlist', 'Show current watchlist'],
        ['node cli-commands.js history <address>', 'Show token price history'],
        ['node cli-commands.js export <days>', 'Export data to CSV'],
        ['node cli-commands.js cleanup', 'Clean old data files']
    ];
    
    const table = new Table({
        head: [chalk.white('Command'), chalk.white('Description')],
        colWidths: [35, 50]
    });
    
    commands.forEach(cmd => table.push(cmd));
    console.log(table.toString());
    console.log();
}

async function showStatus() {
    console.log(chalk.cyan('\n📊 SYSTEM STATUS\n'));
    
    await database.initialize();
    const stats = await database.getTokenStatistics();
    const portfolioSummary = await portfolio.getWatchlistSummary();
    
    const table = new Table({
        head: [chalk.white('Metric'), chalk.white('Value')],
        colWidths: [25, 25]
    });
    
    table.push(
        ['Current Tokens', stats?.currentTokenCount || 0],
        ['Historical Days', stats?.historicalDays || 0],
        ['Total Volume 24h', `$${((stats?.totalVolume24h || 0) / 1000000).toFixed(2)}M`],
        ['Total Market Cap', `$${((stats?.totalMarketCap || 0) / 1000000).toFixed(2)}M`],
        ['Watchlist Items', portfolioSummary.totalWatched],
        ['Recently Added', portfolioSummary.recentlyAdded],
        ['Last Updated', stats?.lastUpdated ? new Date(stats.lastUpdated).toLocaleString() : 'Never']
    );
    
    console.log(table.toString());
}

async function showTopPerformers(count = 10) {
    console.log(chalk.cyan(`\n🏆 TOP ${count} PERFORMERS (24H)\n`));
    
    await database.initialize();
    const tokens = await database.loadTokenData();
    
    if (tokens.length === 0) {
        console.log(chalk.yellow('No token data available. Run the tracker first.'));
        return;
    }
    
    const topTokens = tokens
        .filter(token => token.priceChange24h !== undefined)
        .sort((a, b) => (b.priceChange24h || 0) - (a.priceChange24h || 0))
        .slice(0, count);
    
    const table = new Table({
        head: [
            chalk.white('Rank'),
            chalk.white('Symbol'),
            chalk.white('Price'),
            chalk.white('Change 24h'),
            chalk.white('Volume'),
            chalk.white('Market Cap')
        ]
    });
    
    topTokens.forEach((token, index) => {
        const changeColor = (token.priceChange24h || 0) >= 0 ? chalk.green : chalk.red;
        table.push([
            `#${index + 1}`,
            chalk.bold(token.symbol),
            `$${token.price?.toFixed(6) || 'N/A'}`,
            changeColor(`${(token.priceChange24h || 0) >= 0 ? '+' : ''}${(token.priceChange24h || 0).toFixed(2)}%`),
            `$${((token.volume24h || 0) / 1000).toFixed(0)}K`,
            `$${((token.marketCap || 0) / 1000000).toFixed(2)}M`
        ]);
    });
    
    console.log(table.toString());
}

async function searchTokens(query) {
    console.log(chalk.cyan(`\n🔍 SEARCH RESULTS: "${query}"\n`));
    
    await database.initialize();
    const results = await database.searchTokens(query, 10);
    
    if (results.length === 0) {
        console.log(chalk.yellow('No tokens found matching your search.'));
        return;
    }
    
    const table = new Table({
        head: [
            chalk.white('Symbol'),
            chalk.white('Name'),
            chalk.white('Price'),
            chalk.white('Change 24h'),
            chalk.white('Market Cap')
        ]
    });
    
    results.forEach(token => {
        const changeColor = (token.priceChange24h || 0) >= 0 ? chalk.green : chalk.red;
        table.push([
            chalk.bold(token.symbol),
            token.name?.slice(0, 20) || 'N/A',
            `$${token.price?.toFixed(6) || 'N/A'}`,
            changeColor(`${(token.priceChange24h || 0).toFixed(2)}%`),
            `$${((token.marketCap || 0) / 1000000).toFixed(2)}M`
        ]);
    });
    
    console.log(table.toString());
}

async function addToWatchlist(address) {
    const success = await portfolio.addToWatchlist(address, 'Manual addition via CLI');
    if (success) {
        console.log(chalk.green(`✅ Added ${address} to watchlist`));
    } else {
        console.log(chalk.yellow(`⚠️ ${address} already in watchlist or failed to add`));
    }
}

async function removeFromWatchlist(address) {
    const success = await portfolio.removeFromWatchlist(address);
    if (success) {
        console.log(chalk.green(`✅ Removed ${address} from watchlist`));
    } else {
        console.log(chalk.yellow(`⚠️ ${address} not found in watchlist`));
    }
}

async function showWatchlist() {
    console.log(chalk.cyan('\n👀 WATCHLIST\n'));
    
    const portfolioData = await portfolio.loadWatchlist();
    
    if (portfolioData.watchlist.length === 0) {
        console.log(chalk.yellow('Watchlist is empty. Add tokens with: node cli-commands.js watch <address>'));
        return;
    }
    
    const table = new Table({
        head: [
            chalk.white('Token'),
            chalk.white('Added'),
            chalk.white('Reason'),
            chalk.white('Alerts')
        ]
    });
    
    portfolioData.watchlist.forEach(item => {
        const addedDate = new Date(item.addedAt).toLocaleDateString();
        const alerts = [];
        if (item.alerts.priceChange) alerts.push(`±${item.alerts.priceChange}%`);
        if (item.alerts.volumeSpike) alerts.push('Volume');
        if (item.alerts.priceTarget) alerts.push(`$${item.alerts.priceTarget}`);
        
        table.push([
            chalk.bold(item.address.slice(0, 10) + '...'),
            addedDate,
            item.reason.slice(0, 30) || 'N/A',
            alerts.join(', ') || 'None'
        ]);
    });
    
    console.log(table.toString());
    console.log(chalk.gray(`\nTotal watchlist items: ${portfolioData.watchlist.length}`));
}

async function showTokenHistory(address, days = 7) {
    console.log(chalk.cyan(`\n📈 PRICE HISTORY: ${address} (${days} days)\n`));
    
    await database.initialize();
    const history = await database.getTokenHistory(address, days);
    
    if (history.length === 0) {
        console.log(chalk.yellow('No historical data found for this token.'));
        return;
    }
    
    const table = new Table({
        head: [
            chalk.white('Date'),
            chalk.white('Price'),
            chalk.white('Change 24h'),
            chalk.white('Volume'),
            chalk.white('Market Cap')
        ]
    });
    
    history.reverse().forEach(day => {
        const changeColor = (day.priceChange24h || 0) >= 0 ? chalk.green : chalk.red;
        table.push([
            day.date,
            `$${day.price?.toFixed(6) || 'N/A'}`,
            changeColor(`${(day.priceChange24h || 0).toFixed(2)}%`),
            `$${((day.volume24h || 0) / 1000).toFixed(0)}K`,
            `$${((day.marketCap || 0) / 1000000).toFixed(2)}M`
        ]);
    });
    
    console.log(table.toString());
}

async function exportData(days = 7) {
    console.log(chalk.cyan(`\n📁 EXPORTING DATA (${days} days)\n`));
    
    await database.initialize();
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const outputPath = `data/exports/export-${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.csv`;
    
    try {
        const recordCount = await database.exportToCSV(outputPath, startDate, endDate);
        console.log(chalk.green(`✅ Exported ${recordCount} records to ${outputPath}`));
    } catch (error) {
        console.log(chalk.red(`❌ Export failed: ${error.message}`));
    }
}

async function cleanupData() {
    console.log(chalk.cyan('\n🧹 CLEANING OLD DATA\n'));
    
    await database.initialize();
    const deletedCount = await database.cleanOldData(config.tracking.dataRetentionDays);
    
    console.log(chalk.green(`✅ Cleaned ${deletedCount} old data files`));
    console.log(chalk.gray(`Retention period: ${config.tracking.dataRetentionDays} days`));
}

// Main CLI handler
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command || command === 'help') {
        await showHelp();
        return;
    }
    
    try {
        switch (command) {
            case 'status':
                await showStatus();
                break;
            case 'top':
                const count = parseInt(args[1]) || 10;
                await showTopPerformers(count);
                break;
            case 'search':
                const query = args[1];
                if (!query) {
                    console.log(chalk.red('Usage: node cli-commands.js search <query>'));
                    return;
                }
                await searchTokens(query);
                break;
            case 'watch':
                const addressToWatch = args[1];
                if (!addressToWatch) {
                    console.log(chalk.red('Usage: node cli-commands.js watch <address>'));
                    return;
                }
                await addToWatchlist(addressToWatch);
                break;
            case 'unwatch':
                const addressToUnwatch = args[1];
                if (!addressToUnwatch) {
                    console.log(chalk.red('Usage: node cli-commands.js unwatch <address>'));
                    return;
                }
                await removeFromWatchlist(addressToUnwatch);
                break;
            case 'watchlist':
                await showWatchlist();
                break;
            case 'history':
                const historyAddress = args[1];
                const historyDays = parseInt(args[2]) || 7;
                if (!historyAddress) {
                    console.log(chalk.red('Usage: node cli-commands.js history <address> [days]'));
                    return;
                }
                await showTokenHistory(historyAddress, historyDays);
                break;
            case 'export':
                const exportDays = parseInt(args[1]) || 7;
                await exportData(exportDays);
                break;
            case 'cleanup':
                await cleanupData();
                break;
            default:
                console.log(chalk.red(`Unknown command: ${command}`));
                await showHelp();
        }
    } catch (error) {
        console.log(chalk.red(`❌ Command failed: ${error.message}`));
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    showStatus,
    showTopPerformers,
    searchTokens,
    addToWatchlist,
    removeFromWatchlist,
    showWatchlist,
    showTokenHistory,
    exportData,
    cleanupData
};