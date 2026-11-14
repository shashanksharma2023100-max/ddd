# Discord voice channel stayer

A quiet Discord bot that joins one configured voice channel, stays self-muted and self-deafened, and tries to reconnect if the voice connection drops.

## Setup

1. Create an application and bot in the [Discord Developer Portal](https://discord.com/developers/applications), then copy its bot token.
2. Invite it to your server with the `bot` scope and permission to **View Channel** and **Connect** in the chosen voice channel. It does not need message permissions or privileged intents.
3. Copy `.env.example` to `.env` and fill in the bot token, server ID, and voice channel ID. Enable Developer Mode in Discord to copy the IDs.
4. Install Node.js 22.12 or newer, then run:

   ```sh
   npm install
   npm start
   ```

Keep the process running on a computer or server to keep the bot online. Restart it with a process manager if you want it to come back after a machine reboot. The bot can only stay connected while Discord and the host are reachable and it has permission to join.

Never share the bot token or commit `.env`.
