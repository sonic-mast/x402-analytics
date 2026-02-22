/**
 * x402 Growth Analytics Dashboard
 * Tracks AIBTC network growth: agents, messages, sBTC flow
 */

export interface Env {
  DB: D1Database;
}

// AIBTC API base URL
const AIBTC_API = 'https://aibtc.com/api';

interface Agent {
  btcAddress: string;
  stxAddress: string;
  displayName: string | null;
  verifiedAt: string;
  level: number;
  levelName: string;
  checkInCount?: number;
}

interface InboxEconomics {
  satsReceived: number;
  satsSent: number;
  satsNet: number;
}

interface InboxResponse {
  inbox: {
    totalCount: number;
    economics: InboxEconomics;
  };
}

export default {
  /**
   * HTTP request handler - serves API and frontend
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers for API access
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API Routes
    if (url.pathname === '/api/metrics') {
      return handleMetrics(env, corsHeaders);
    }
    
    if (url.pathname === '/api/agents/growth') {
      return handleAgentGrowth(env, corsHeaders);
    }
    
    if (url.pathname === '/api/trigger-collection') {
      // Manual trigger for testing
      await collectDailyMetrics(env);
      return new Response('Collection triggered', { headers: corsHeaders });
    }

    // Serve frontend
    return new Response(getFrontendHTML(), {
      headers: { 'Content-Type': 'text/html' },
    });
  },

  /**
   * Scheduled cron handler - runs daily data collection
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Cron triggered at:', new Date().toISOString());
    await collectDailyMetrics(env);
  },
};

/**
 * Collect daily metrics from AIBTC API
 */
async function collectDailyMetrics(env: Env): Promise<void> {
  console.log('Starting daily metrics collection...');
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // Fetch all agents
    const agentsResp = await fetch(`${AIBTC_API}/agents?limit=100`);
    const agentsData = await agentsResp.json() as { agents: Agent[], pagination: { total: number } };
    const allAgents = agentsData.agents;
    
    // If there are more than 100, fetch all pages
    const total = agentsData.pagination.total;
    if (total > 100) {
      for (let offset = 100; offset < total; offset += 100) {
        const pageResp = await fetch(`${AIBTC_API}/agents?limit=100&offset=${offset}`);
        const pageData = await pageResp.json() as { agents: Agent[] };
        allAgents.push(...pageData.agents);
      }
    }

    console.log(`Fetched ${allAgents.length} agents`);

    // Count agents by level
    const genesisCount = allAgents.filter(a => a.level === 2).length;
    const registeredCount = allAgents.filter(a => a.level === 1).length;

    // Store new agents
    for (const agent of allAgents) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO agent_registrations 
        (btc_address, stx_address, display_name, verified_at, level, level_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        agent.btcAddress,
        agent.stxAddress,
        agent.displayName,
        agent.verifiedAt,
        agent.level,
        agent.levelName
      ).run();
    }

    // Aggregate inbox data (sample 20 most active agents to avoid timeout)
    const sampleAgents = allAgents.slice(0, 20);
    let totalMessages = 0;
    let totalSatsReceived = 0;
    let totalSatsSent = 0;

    for (const agent of sampleAgents) {
      try {
        const inboxResp = await fetch(`${AIBTC_API}/inbox/${agent.btcAddress}?limit=1`);
        const inboxData = await inboxResp.json() as InboxResponse;
        
        totalMessages += inboxData.inbox.totalCount || 0;
        totalSatsReceived += inboxData.inbox.economics?.satsReceived || 0;
        totalSatsSent += inboxData.inbox.economics?.satsSent || 0;
      } catch (err) {
        console.error(`Failed to fetch inbox for ${agent.btcAddress}:`, err);
      }
    }

    // Extrapolate to full network (rough estimate)
    const scaleFactor = allAgents.length / sampleAgents.length;
    totalMessages = Math.round(totalMessages * scaleFactor);
    totalSatsReceived = Math.round(totalSatsReceived * scaleFactor);
    totalSatsSent = Math.round(totalSatsSent * scaleFactor);

    // Calculate new agents today
    const newAgentsCount = allAgents.filter(a => {
      const verifiedDate = a.verifiedAt.split('T')[0];
      return verifiedDate === today;
    }).length;

    // Get yesterday's metrics for delta calculation
    const yesterday = await env.DB.prepare(`
      SELECT total_messages FROM daily_metrics 
      WHERE date < ? ORDER BY date DESC LIMIT 1
    `).bind(today).first() as { total_messages: number } | null;

    const newMessages = yesterday 
      ? totalMessages - yesterday.total_messages 
      : totalMessages;

    // Store daily metrics
    await env.DB.prepare(`
      INSERT OR REPLACE INTO daily_metrics 
      (date, total_agents, new_agents, total_messages, new_messages, 
       total_sats_received, total_sats_sent, total_sats_net, 
       genesis_agents, registered_agents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      today,
      allAgents.length,
      newAgentsCount,
      totalMessages,
      newMessages,
      totalSatsReceived,
      totalSatsSent,
      totalSatsReceived - totalSatsSent,
      genesisCount,
      registeredCount
    ).run();

    console.log('Daily metrics collected successfully:', {
      date: today,
      total_agents: allAgents.length,
      new_agents: newAgentsCount,
      total_messages: totalMessages,
    });
  } catch (error) {
    console.error('Error collecting daily metrics:', error);
    throw error;
  }
}

/**
 * API: Get all metrics (last 30 days)
 */
async function handleMetrics(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const metrics = await env.DB.prepare(`
    SELECT * FROM daily_metrics 
    ORDER BY date DESC 
    LIMIT 30
  `).all();

  return new Response(JSON.stringify({
    success: true,
    data: metrics.results
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * API: Get agent growth rate
 */
async function handleAgentGrowth(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const growth = await env.DB.prepare(`
    SELECT date, total_agents, new_agents, genesis_agents, registered_agents
    FROM daily_metrics 
    ORDER BY date DESC 
    LIMIT 30
  `).all();

  return new Response(JSON.stringify({
    success: true,
    data: growth.results
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Frontend HTML with Chart.js
 */
function getFrontendHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>x402 Growth Analytics | AIBTC Network</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #f7931a 0%, #ff6b00 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .subtitle {
      color: #888;
      margin-bottom: 2rem;
      font-size: 1.1rem;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .stat-card h3 {
      color: #888;
      font-size: 0.9rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat-card .value {
      font-size: 2rem;
      font-weight: 700;
      color: #f7931a;
    }
    .stat-card .delta {
      font-size: 0.9rem;
      margin-top: 0.5rem;
      color: #4ade80;
    }
    .delta.negative { color: #f87171; }
    .chart-container {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
    }
    .chart-container h2 {
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
      color: #e0e0e0;
    }
    canvas { max-height: 400px; }
    .footer {
      text-align: center;
      color: #666;
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #2a2a2a;
    }
    .footer a {
      color: #f7931a;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>x402 Growth Analytics</h1>
    <p class="subtitle">Real-time metrics from the AIBTC agent network</p>
    
    <div class="stats" id="stats">
      <!-- Stats will be loaded here -->
    </div>

    <div class="chart-container">
      <h2>Agent Growth</h2>
      <canvas id="agentChart"></canvas>
    </div>

    <div class="chart-container">
      <h2>Message Volume</h2>
      <canvas id="messageChart"></canvas>
    </div>

    <div class="chart-container">
      <h2>sBTC Flow</h2>
      <canvas id="satsChart"></canvas>
    </div>

    <div class="footer">
      <p>Data sourced from <a href="https://aibtc.com" target="_blank">aibtc.com</a> | 
         Built by <a href="https://github.com/yourusername/x402-analytics" target="_blank">Sonic Mast</a></p>
    </div>
  </div>

  <script>
    // Chart.js dark theme defaults
    Chart.defaults.color = '#888';
    Chart.defaults.borderColor = '#2a2a2a';

    async function loadData() {
      try {
        const metricsResp = await fetch('/api/metrics');
        const metricsData = await metricsResp.json();
        const metrics = metricsData.data.reverse(); // Oldest first for charts

        // Update stats cards
        const latest = metrics[metrics.length - 1] || {};
        const previous = metrics[metrics.length - 2] || {};
        
        document.getElementById('stats').innerHTML = \`
          <div class="stat-card">
            <h3>Total Agents</h3>
            <div class="value">\${latest.total_agents || 0}</div>
            <div class="delta">+\${latest.new_agents || 0} today</div>
          </div>
          <div class="stat-card">
            <h3>Total Messages</h3>
            <div class="value">\${(latest.total_messages || 0).toLocaleString()}</div>
            <div class="delta">+\${latest.new_messages || 0} today</div>
          </div>
          <div class="stat-card">
            <h3>sBTC Volume</h3>
            <div class="value">\${(latest.total_sats_net || 0).toLocaleString()} sats</div>
            <div class="delta">Net flow</div>
          </div>
          <div class="stat-card">
            <h3>Genesis Agents</h3>
            <div class="value">\${latest.genesis_agents || 0}</div>
            <div class="delta">\${Math.round((latest.genesis_agents / latest.total_agents) * 100)}% of network</div>
          </div>
        \`;

        // Agent Growth Chart
        new Chart(document.getElementById('agentChart'), {
          type: 'line',
          data: {
            labels: metrics.map(m => m.date),
            datasets: [{
              label: 'Total Agents',
              data: metrics.map(m => m.total_agents),
              borderColor: '#f7931a',
              backgroundColor: 'rgba(247, 147, 26, 0.1)',
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
          }
        });

        // Message Volume Chart
        new Chart(document.getElementById('messageChart'), {
          type: 'bar',
          data: {
            labels: metrics.map(m => m.date),
            datasets: [{
              label: 'Daily Messages',
              data: metrics.map(m => m.new_messages),
              backgroundColor: 'rgba(74, 222, 128, 0.5)',
              borderColor: '#4ade80',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
          }
        });

        // sBTC Flow Chart
        new Chart(document.getElementById('satsChart'), {
          type: 'line',
          data: {
            labels: metrics.map(m => m.date),
            datasets: [
              {
                label: 'Received',
                data: metrics.map(m => m.total_sats_received),
                borderColor: '#4ade80',
                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                tension: 0.4
              },
              {
                label: 'Sent',
                data: metrics.map(m => m.total_sats_sent),
                borderColor: '#f87171',
                backgroundColor: 'rgba(248, 113, 113, 0.1)',
                tension: 0.4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: true } },
            scales: { y: { beginAtZero: true } }
          }
        });

      } catch (error) {
        console.error('Failed to load data:', error);
        document.getElementById('stats').innerHTML = '<p>Error loading data. Please refresh.</p>';
      }
    }

    loadData();
  </script>
</body>
</html>`;
}
