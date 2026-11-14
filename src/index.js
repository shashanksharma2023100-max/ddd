require('dotenv').config();

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const http = require('node:http');
const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
} = require('@discordjs/voice');

const { DISCORD_TOKEN, GUILD_ID, VOICE_CHANNEL_ID } = process.env;

for (const [name, value] of Object.entries({ DISCORD_TOKEN, GUILD_ID, VOICE_CHANNEL_ID })) {
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Render Web Services require an HTTP listener on PORT, even though the bot
// itself communicates with Discord over its gateway and voice connections.
const port = Number(process.env.PORT || 3000);
const server = http.createServer((request, response) => {
  if (request.url === '/health' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      status: 'ok',
      discord: client.isReady() ? 'connected' : 'connecting',
      voice: getVoiceConnection(GUILD_ID)?.state.status ?? 'disconnected',
    }));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Discord voice bot is running. Health: /health\n');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`HTTP health server listening on port ${port}.`);
});
server.on('error', (error) => console.error('HTTP server error:', error));

let retryTimer;
let retryDelay = 5_000;
let stopping = false;

function scheduleReconnect() {
  if (stopping || retryTimer) return;

  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    maintainConnection().catch((error) => {
      console.error('Could not restore the voice connection:', error);
      retryDelay = Math.min(retryDelay * 2, 60_000);
      scheduleReconnect();
    });
  }, retryDelay);
}

async function maintainConnection() {
  const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error(`VOICE_CHANNEL_ID ${VOICE_CHANNEL_ID} is not a standard voice channel.`);
  }
  if (channel.guildId !== GUILD_ID) {
    throw new Error('The configured voice channel is not in the configured guild.');
  }

  let connection = getVoiceConnection(GUILD_ID);
  if (connection?.state.status === VoiceConnectionStatus.Ready) return;

  if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
    const rejoined = connection.rejoin({
      channelId: VOICE_CHANNEL_ID,
      selfDeaf: true,
      selfMute: true,
    });
    if (rejoined) {
      console.log('Rejoining the configured voice channel...');
      return;
    }
    connection.destroy();
  }

  connection = joinVoiceChannel({
    channelId: VOICE_CHANNEL_ID,
    guildId: GUILD_ID,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });

  connection.on('stateChange', (oldState, newState) => {
    console.log(`Voice connection: ${oldState.status} -> ${newState.status}`);
    if (newState.status === VoiceConnectionStatus.Ready) {
      retryDelay = 5_000;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
    } else if (newState.status === VoiceConnectionStatus.Disconnected) {
      scheduleReconnect();
    } else if (newState.status === VoiceConnectionStatus.Destroyed) {
      scheduleReconnect();
    }
  });

  console.log(`Joining ${channel.name} in ${channel.guild.name}...`);
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}.`);
  maintainConnection().catch((error) => {
    console.error('Could not join the configured voice channel:', error);
    scheduleReconnect();
  });
});

client.on('error', (error) => console.error('Discord client error:', error));

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`Received ${signal}; disconnecting.`);
  if (retryTimer) clearTimeout(retryTimer);
  getVoiceConnection(GUILD_ID)?.destroy();
  server.close();
  client.destroy();
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('Discord login failed. Check DISCORD_TOKEN.', error);
  process.exit(1);
});
