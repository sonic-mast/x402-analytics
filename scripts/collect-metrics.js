#!/usr/bin/env node

/**
 * x402 Metrics Collection Script
 * Runs via GitHub Actions to collect AIBTC network data
 */

const fs = require('fs');
const path = require('path');

const AIBTC_API = 'https://aibtc.com/api';
const DATA_DIR = path.join(__dirname, '..', 'data');

async function fetchAllAgents() {
  console.log('Fetching agents...');
  const agents = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const url = `${AIBTC_API}/agents?limit=${limit}&offset=${offset}`;
    const response = await fetch(url);
    const data = await response.json();
    
    agents.push(...data.agents);
    console.log(`Fetched ${agents.length} / ${data.pagination.total} agents`);
    
    if (!data.pagination.hasMore) break;
    offset += limit;
  }
  
  return agents;
}

async function sampleInboxMetrics(agents, sampleSize = 20) {
  console.log(`Sampling ${sampleSize} agent inboxes...`);
  const sample = agents.slice(0, sampleSize);
  
  let totalMessages = 0;
  let totalSatsReceived = 0;
  let totalSatsSent = 0;
  
  for (const agent of sample) {
    try {
      const url = `${AIBTC_API}/inbox/${agent.btcAddress}?limit=1`;
      const response = await fetch(url);
      const data = await response.json();
      
      totalMessages += data.inbox.totalCount || 0;
      totalSatsReceived += data.inbox.economics?.satsReceived || 0;
      totalSatsSent += data.inbox.economics?.satsSent || 0;
    } catch (err) {
      console.error(`Failed to fetch inbox for ${agent.btcAddress}:`, err.message);
    }
  }
  
  // Extrapolate to full network
  const scaleFactor = agents.length / sample.length;
  return {
    totalMessages: Math.round(totalMessages * scaleFactor),
    totalSatsReceived: Math.round(totalSatsReceived * scaleFactor),
    totalSatsSent: Math.round(totalSatsSent * scaleFactor),
  };
}

async function main() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  try {
    // Fetch all agents
    const agents = await fetchAllAgents();
    
    // Count by level
    const genesisCount = agents.filter(a => a.level === 2).length;
    const registeredCount = agents.filter(a => a.level === 1).length;
    
    // Sample inbox metrics
    const inboxMetrics = await sampleInboxMetrics(agents);
    
    // Count new agents today
    const newAgentsCount = agents.filter(a => {
      const verifiedDate = a.verifiedAt.split('T')[0];
      return verifiedDate === today;
    }).length;
    
    // Load yesterday's metrics to calculate deltas
    const metricsFile = path.join(DATA_DIR, 'metrics.json');
    let historicalData = [];
    if (fs.existsSync(metricsFile)) {
      historicalData = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
    }
    
    const yesterday = historicalData[historicalData.length - 1];
    const newMessages = yesterday 
      ? inboxMetrics.totalMessages - yesterday.total_messages 
      : inboxMetrics.totalMessages;
    
    // Create today's metrics
    const todayMetrics = {
      date: today,
      total_agents: agents.length,
      new_agents: newAgentsCount,
      total_messages: inboxMetrics.totalMessages,
      new_messages: Math.max(0, newMessages),
      total_sats_received: inboxMetrics.totalSatsReceived,
      total_sats_sent: inboxMetrics.totalSatsSent,
      total_sats_net: inboxMetrics.totalSatsReceived - inboxMetrics.totalSatsSent,
      genesis_agents: genesisCount,
      registered_agents: registeredCount,
      collected_at: new Date().toISOString()
    };
    
    // Append to historical data (keep last 60 days)
    historicalData = historicalData.filter(d => d.date !== today); // Remove if exists
    historicalData.push(todayMetrics);
    historicalData = historicalData.slice(-60); // Keep last 60 days
    
    // Write metrics file
    fs.writeFileSync(metricsFile, JSON.stringify(historicalData, null, 2));
    console.log(`✅ Metrics saved: ${today}`);
    console.log(`   Agents: ${agents.length} (+${newAgentsCount} today)`);
    console.log(`   Messages: ${inboxMetrics.totalMessages} (+${newMessages} today)`);
    console.log(`   sBTC Net: ${todayMetrics.total_sats_net} sats`);
    
    // Write latest snapshot for quick access
    const latestFile = path.join(DATA_DIR, 'latest.json');
    fs.writeFileSync(latestFile, JSON.stringify(todayMetrics, null, 2));
    
    // Write agent list
    const agentsFile = path.join(DATA_DIR, 'agents.json');
    fs.writeFileSync(agentsFile, JSON.stringify({
      total: agents.length,
      genesis: genesisCount,
      registered: registeredCount,
      updated_at: new Date().toISOString(),
      agents: agents.map(a => ({
        btcAddress: a.btcAddress,
        stxAddress: a.stxAddress,
        displayName: a.displayName,
        level: a.level,
        levelName: a.levelName,
        verifiedAt: a.verifiedAt,
        checkInCount: a.checkInCount || 0
      }))
    }, null, 2));
    
    console.log('✅ All data files updated');
    
  } catch (error) {
    console.error('❌ Collection failed:', error);
    process.exit(1);
  }
}

main();
