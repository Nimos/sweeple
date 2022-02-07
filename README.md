# sweeple
wordle for discord

![Channel View](https://user-images.githubusercontent.com/1005315/152860548-dc0b797e-928a-4351-9755-520f701cdfdb.png)  
![Chat View](https://user-images.githubusercontent.com/1005315/152859549-d5200034-6723-44ad-82cd-7ed55ec8bcaf.png)

named after the bot's name on the discord I've written this for, sweep


# Usage

The code for this assumes that you already have a discord.js running. You need to create a Sweeple object and pass the discord.js client instance.

Minimal boilerplate code would be something like this:

```
const Discord = require("discord.js");
const Sweeple = require('./Sweeple.js');

const client = new Discord.Client({ intents: [
  Discord.Intents.FLAGS.GUILDS, 
  Discord.Intents.FLAGS.GUILD_MESSAGES, 
  Discord.Intents.FLAGS.GUILD_MEMBERS] });
  
client.login("YOUR TOKEN GOES HERE");

new Sweeple(client);
```

Afterwards you can start a game with !sweeple

# Contributing

Happy about literally anything tbh, just go wild
