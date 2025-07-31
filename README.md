# Solana Memecoin Analytics Tracker

A comprehensive Claude Code agent that tracks and analyzes the best performing Solana memecoins from LetsBonk.fun launchpad using DexScreener data.

## Features

### 🚀 Core Functionality
- **Real-time Data Collection**: Fetches token data from DexScreener API with rate limiting
- **LetsBonk Integration**: Tracks new launches and trending tokens from LetsBonk.fun
- **Performance Analysis**: Comprehensive metrics calculation and trend analysis
- **Historical Tracking**: Stores and analyzes historical price and volume data
- **Automated Reports**: Daily and weekly HTML/CSV reports with detailed insights
- **Smart Watchlist**: Auto-adds promising tokens, customizable alerts
- **Advanced CLI**: 15+ commands for analysis, search, and portfolio management
- **Portfolio Tracking**: Monitor specific tokens with custom alert thresholds

### 📊 Key Metrics Tracked
- Market Cap (current and historical trends)
- Price Performance (1h, 6h, 24h, 7d percentage changes)
- Volume Analysis (24h volume, volume trends, volume-to-market cap ratio)
- Liquidity Metrics (total liquidity, liquidity health assessment)
- Trading Activity (transaction counts, buy/sell ratios)
- Launch Performance (days since launch, survival rates)

### 📈 Analysis Features
- **Performance Scoring**: Proprietary scoring system for token ranking
- **Trend Analysis**: Momentum, strength, and sustainability indicators
- **Risk Assessment**: Liquidity warnings and unusual activity detection
- **Market Overview**: Daily market sentiment and top performers
- **Survival Analysis**: New launch success rates and token longevity

## Installation

1. **Clone or download the project**
```bash
cd solana-memecoin-tracker
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure settings** (optional)
Edit `config/settings.json` to customize:
- Market cap filters
- Report timing
- Data retention period
- API rate limits

## Usage

### Start the Tracker
```bash
npm start                    # Start full tracker with automation
npm run dev                  # Development mode with auto-restart
```

### Quick Commands
```bash
npm run status              # Show system status and statistics
npm run top                 # Show top 10 performers
npm run daily-report        # Generate daily HTML/CSV report
npm run weekly-report       # Generate weekly analysis report
npm run watchlist           # Show current watchlist
npm run cleanup             # Clean old data files
npm run help                # Show all available commands
```

### Advanced CLI Commands
```bash
# View top performers (default 10, specify number)
node cli-commands.js top 20

# Search for specific tokens
node cli-commands.js search BONK
node cli-commands.js search "Statue"

# Watchlist management
node cli-commands.js watch SOL_TOKEN_ADDRESS
node cli-commands.js unwatch SOL_TOKEN_ADDRESS
node cli-commands.js watchlist

# Token analysis
node cli-commands.js history TOKEN_ADDRESS 14    # 14 days of history
node cli-commands.js export 30                   # Export 30 days to CSV

# System management
node cli-commands.js status                       # Detailed system status
node cli-commands.js cleanup                      # Clean old data
```

## Configuration

### Settings File (`config/settings.json`)

```json
{
  "tracking": {
    "minMarketCap": 50000,        // Minimum market cap to track
    "maxMarketCap": 100000000,    // Maximum market cap to track
    "maxTokensToTrack": 100,      // Maximum number of tokens
    "dataRetentionDays": 30       // Days to keep historical data
  },
  "reporting": {
    "topPerformersCount": 10,     // Number of top performers in reports
    "dailyReportTime": "08:00",   // Daily report generation time
    "timezone": "Asia/Dubai"      // Timezone for scheduling
  },
  "api": {
    "dexscreener": {
      "rateLimitMs": 1000,        // Rate limit for API calls
      "maxRetries": 3             // Maximum retry attempts
    }
  }
}
```

## Output Files

### Reports Directory (`data/reports/`)
- `daily-report-YYYY-MM-DD.html` - Interactive HTML daily reports
- `daily-report-YYYY-MM-DD.csv` - CSV data for spreadsheet analysis
- `daily-report-YYYY-MM-DD.txt` - Text summary reports
- `weekly-report-YYYY-MM-DD_to_YYYY-MM-DD.html` - Weekly analysis reports

### Data Directory (`data/tokens/`)
- `tracked-tokens.json` - Current token data
- `portfolio.json` - Watchlist and portfolio data
- `historical/tokens-YYYY-MM-DD.json` - Daily historical snapshots

### Exports Directory (`data/exports/`)
- `export-YYYY-MM-DD_to_YYYY-MM-DD.csv` - Custom date range exports

## Scheduled Operations

The tracker runs automated tasks:

- **Daily Analysis**: Runs at configured time (default 8:00 AM Dubai time)
  - Collects fresh token data
  - Analyzes performance metrics
  - Generates daily reports
  - Cleans old data

- **Weekly Reports**: Runs every Sunday at 9:00 AM
  - Generates comprehensive weekly analysis
  - Calculates survival rates
  - Analyzes market trends

- **Monitoring**: Runs every 15 minutes
  - Checks database status
  - Logs system metrics

## Command Line Interface

When running, the tracker displays:

1. **Live Status Dashboard**: Real-time token performance table
2. **System Status**: Running jobs, data statistics
3. **Top Performers**: Current top 10 tokens with key metrics

### Sample Output
```
🏆 TOP 10 PERFORMERS (24H)

┌──────┬────────────┬──────────────┬──────────────┬──────────────┬──────────────┬────────┬──────────┐
│ Rank │ Token      │ Price        │ Change 24h   │ Volume       │ MCap         │ Score  │ Source   │
├──────┼────────────┼──────────────┼──────────────┼──────────────┼──────────────┼────────┼──────────┤
│ #1   │ BONK       │ $0.000034    │ +245.67%     │ $2.1M        │ $890K        │ 87     │ LetsBonk │
│      │ BonkCoin   │              │              │              │              │        │          │
├──────┼────────────┼──────────────┼──────────────┼──────────────┼──────────────┼────────┼──────────┤
│ #2   │ DOGE2      │ $0.001234    │ +189.45%     │ $1.8M        │ $1.2M        │ 82     │ Other    │
│      │ Doge2.0    │              │              │              │              │        │          │
└──────┴────────────┴──────────────┴──────────────┴──────────────┴──────────────┴────────┴──────────┘
```

## Data Analysis

### Performance Scoring
Tokens are scored (0-100) based on:
- Price performance (24h change)
- Volume activity (volume-to-market cap ratio)
- Liquidity health
- Buy/sell pressure
- Historical consistency

### Risk Indicators
- **High**: Price dumps >50%, low liquidity warnings
- **Medium**: Unusual volume spikes, new launch volatility
- **Low**: Stable metrics, consistent trading

### Market Sentiment
- **Bullish**: More gainers than losers, positive average change
- **Bearish**: More losers than gainers, negative average change
- **Neutral**: Balanced market conditions

## API Integration

### DexScreener API
- Fetches real-time Solana token data
- Implements rate limiting (1 request/second)
- Automatic retry on failures
- Filters for market cap and liquidity thresholds

### LetsBonk.fun Integration
- Tracks new token launches
- Identifies trending tokens
- Enriches data with launch information
- Mock data fallback when API unavailable

## Technical Architecture

```
src/
├── data-collectors/          # API integrations
│   ├── dexscreener.js       # DexScreener API client
│   └── letsbonk.js          # LetsBonk API client
├── analyzers/               # Analysis engines
│   └── performance.js       # Token performance analyzer
├── reporters/               # Report generators
│   ├── daily-report.js      # Daily report generator
│   └── weekly-report.js     # Weekly report generator
└── utils/                   # Utilities
    ├── database.js          # Data storage and retrieval
    └── helpers.js           # Common utilities
```

## Error Handling

- **API Failures**: Automatic retries with exponential backoff
- **Data Validation**: Input sanitization and type checking
- **Graceful Degradation**: Continues operation with partial data
- **Logging**: Comprehensive error and info logging
- **Recovery**: Automatic recovery from transient failures

## Performance Optimizations

- **Rate Limiting**: Respects API limits to avoid blocking
- **Caching**: In-memory caching for frequently accessed data
- **Parallel Processing**: Concurrent API calls where possible
- **Data Cleanup**: Automatic removal of old data files
- **Memory Management**: Efficient data structures and garbage collection

## Customization

### Adding New Metrics
1. Extend `PerformanceAnalyzer` class
2. Add new calculations in `calculatePerformanceMetrics()`
3. Update report templates to display new metrics

### Custom Filters
1. Modify `config/settings.json` tracking parameters
2. Add custom logic in data collection methods
3. Update database schema if needed

### Report Customization
1. Edit HTML templates in report generators
2. Modify CSS styles for visual changes
3. Add new report sections or charts

## Troubleshooting

### Common Issues

**No data showing**: Check API connectivity and rate limits
```bash
# Test DexScreener API
curl "https://api.dexscreener.com/latest/dex/tokens/solana"
```

**Reports not generating**: Verify write permissions to data/ directory
```bash
ls -la data/reports/
```

**Scheduled tasks not running**: Check timezone configuration
```javascript
// Verify timezone in settings.json
"timezone": "Asia/Dubai"
```

### Debug Mode
Set environment variable for verbose logging:
```bash
DEBUG=true npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Disclaimer

This tool is for educational and research purposes only. Cryptocurrency investments carry significant risk. Always do your own research before making investment decisions.

---

**Generated by Claude Code Agent** | Last Updated: $(date)#   D e x s c r e e n e r  
 #   D e x s c r e e n e r  
 