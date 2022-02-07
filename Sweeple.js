const { createCanvas } = require("canvas");
const Discord = require("discord.js");

const wordlist = require("./sweeple_data/wordlist.json")

// Currently just steals the entire design from worlde dark mode
const SWEEPLE_STYLE = {
    tileFont: "32px Helvetica Neue",

    correctColor: "#538d4e",
    presentColor: "#b59f3b",
    absentColor: "#3a3a3c",
    textColor: "#d7dadc",
    emptyColor: "#3a3a3c",

    squareSize: 62,
    squareGap: 5,
    borderWidth: 2,

    keyFont: "14px Helvetica Neue",

    keyColor: "#818384",

    keyWidth: 43,
    keyHeight: 58,
    keyGap: 6,

    correctEmoji: ":green_square:",
    presentEmoji: ":yellow_square:",
    absentEmoji: ":black_large_square:"
}

// 5x6 grid as we're all used to
const SWEEPLE_CONF = {
    wordLength: 5,
    maxGuesses: 6
}


// I wrote this with a German community in mind, so it's a qwertz layout
// feel free to modify this however you want
const KEYBOARD = ["qwertzuiop", "asdfghjkl", "yxcvbnm"];



// Handles the !sweeple Command
const Sweeple = function (client) {
    client.on('messageCreate', async (msg) => {
        if (msg.content.toLowerCase().startsWith("!sweeple")) {
            new SweepleGame(msg);
        }
    })
}


// Main class
const SweepleGame = function (msg) {
    this.init(msg);
}


// Starts the game
SweepleGame.prototype.init = async function (msg) {

    this.word = wordlist.words[Math.floor(Math.random() * wordlist.words.length)];

    this.guesses = [];
    this.correctLetters = [];
    this.presentLetters = [];
    this.absentLetters = [];

    this.originMessage = msg;
    this.originChannel = msg.channel;

    // create a new thread for the current game and attach the listener to it
    this.thread = await msg.channel.threads.create({ startMessage: msg, name: `Sweeple` });
    this.collector = this.thread.createMessageCollector({ filter: msg => msg.content.length == 5 });

    this.collector.on('collect', m => {
        this.handleGuess(m).catch(this.ailNicely);
    });

    // Draw initial tiles and keyboard
    this.updateTiles();
    this.updateKeyboard(); 


}


// Main game loop
SweepleGame.prototype.handleGuess = async function (message) {
    let guess = message.content.toLowerCase();

    if (!wordlist.guessable.concat(wordlist.words).includes(guess)) {
        message.reply("Not in word list.");
        return;
    }

    this.guesses.push(guess);

    // keep track of all letters that have been guessed for the keyboard
    for (let col = 0; col < guess.length; col++) {
        if (this.word[col] == guess[col]) {
            this.correctLetters.push(guess[col]);
        } else if (this.word.includes(guess[col])) {
            this.presentLetters.push(guess[col]);
        } else {
            this.absentLetters.push(guess[col]);
        }
    }

    // Draw the graphics
    await this.updateKeyboard();
    await this.updateTiles();


    // Check if game has been won
    if (this.guesses[this.guesses.length - 1] == this.word) {
        this.conclude(true);
        return;
    }

    // Check if game has been lost
    if (this.guesses.length >= SWEEPLE_CONF.maxGuesses) {
        this.conclude(false);
    }
}


const STATE_ABSENT = 0;
const STATE_PRESENT = 1;
const STATE_CORRECT = 2;

// Checks a word against the solution, returns an array of states as defined above
SweepleGame.prototype.checkWord = function (guess) {
    
    let result = Array(5).fill(STATE_ABSENT);
    let letterCounts = {};
        
    // So I know we can do it in one pass, but I think this is more readable
    // First mark the correct guesses
    for (let col = 0; col < guess.length; col++) {
        let letter = guess[col];
        let letterMaxCount = (this.word.match(new RegExp(letter, "g")) || []).length; 

        
        if (this.word[col] == letter) {
            result[col] = STATE_CORRECT;
            letterCounts[letter] = letterCounts[letter] ? letterCounts[letter] + 1 : 1;
        }
    }

    // Then mark the present but not correct letters
    for (let col = 0; col < guess.length; col++) {
        let letter = guess[col];
        let letterMaxCount = (this.word.match(new RegExp(letter, "g")) || []).length; 

        letterCounts[letter] = letterCounts[letter] ? letterCounts[letter] + 1 : 1;
        
        if (this.word[col] != letter &&
            this.word.includes(letter) &&
            letterCounts[letter] <= letterMaxCount) {
            
            result[col] = STATE_PRESENT;
        }
    }

    return result;
}


// If we encounter an exception for some reason, delete the game thread so we don't clutter the server
SweepleGame.prototype.failNicely = function () {
    this.thread.delete();
    this.collector.stop();
    this.originMessage.reply("An error occured.");
}

// End of the game, archive the thread, stop the event listener and post the emoji recap
SweepleGame.prototype.conclude = function (win) {
    let msg = this.buildEmojiRecap(win);

    this.originChannel.send({ content: msg, reply: { messageReference: this.originMessage } });
    this.thread.send({ content: msg, reply: this.originMessage });
    this.thread.setLocked(true);
    this.thread.setArchived(true);
    this.collector.stop();
}

// Builds the grid of emoji squares that you get from the Wordle share button
SweepleGame.prototype.buildEmojiRecap = function (win) {
    let recap = `Sweeple ("${this.word.toUpperCase()}") ${win ? this.guesses.length : "X"}/${SWEEPLE_CONF.maxGuesses}\n\n`;;
    for (let guess of this.guesses) {
        let result = this.checkWord(guess);
        
        for (let col = 0; col < guess.length; col++) {
            if (result[col] == STATE_CORRECT) {
                recap += SWEEPLE_STYLE.correctEmoji;
            } else if (result[col] == STATE_PRESENT) {
                recap += SWEEPLE_STYLE.presentEmoji;
            } else {
                recap += SWEEPLE_STYLE.absentEmoji;
            }
        }
        recap += "\n"
    }

    return recap;
}


// Creates or updates the keyboard graphic at the top of the screen
SweepleGame.prototype.updateKeyboard = async function () {
    const attachment = this.drawKeyboard();

    if (!this.keyboardMessage) {
        this.keyboardMessage = await this.thread.send({ files: [attachment] });
    } else {
        await this.keyboardMessage.edit({ files: [attachment] });
    }
}

// Draws Keyboard and returns it as discord attachment
SweepleGame.prototype.drawKeyboard = function (text) {

    // First find out how wide the canvas needs to be to fit all the keys
    let canvasWidth = 0;
    for (let row of KEYBOARD) {
        let rowWidth = row.length * (SWEEPLE_STYLE.keyWidth + SWEEPLE_STYLE.keyGap) - SWEEPLE_STYLE.keyGap;

        canvasWidth = Math.max(canvasWidth, rowWidth);
    }

    // Then find out how tall the canvas needs to be
    let canvasHeight = KEYBOARD.length * (SWEEPLE_STYLE.keyHeight + SWEEPLE_STYLE.keyGap) - SWEEPLE_STYLE.keyGap;
    
    // Create and initialize the canvas
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    
    // Draw the keys as defined in the style constants
    ctx.font = SWEEPLE_STYLE.keyFont;
    for (let rowNum = 0; rowNum < KEYBOARD.length; rowNum++) {
        let y = (SWEEPLE_STYLE.keyHeight + SWEEPLE_STYLE.keyGap) * rowNum;
        let row = KEYBOARD[rowNum];
        
        // Center the keyboard rows
        let rowWidth = row.length * (SWEEPLE_STYLE.keyWidth + SWEEPLE_STYLE.keyGap) - SWEEPLE_STYLE.keyGap;
        ctx.save();
        ctx.translate((canvasWidth - rowWidth) / 2, 0);

        for (let colNum = 0; colNum < row.length; colNum++) {
            // x coordinate of the top-left corner of the current key
            let x = (SWEEPLE_STYLE.keyWidth + SWEEPLE_STYLE.keyGap) * colNum;

            // Letter of the current key
            let letter = row[colNum];

            // Color key based on previous guesses
            if (this.correctLetters.includes(letter)) {
                ctx.fillStyle = SWEEPLE_STYLE.correctColor;
            } else if (this.presentLetters.includes(letter)) {
                ctx.fillStyle = SWEEPLE_STYLE.presentColor;
            } else if (this.absentLetters.includes(letter)) {
                ctx.fillStyle = SWEEPLE_STYLE.absentColor;
            } else {
                ctx.fillStyle = SWEEPLE_STYLE.keyColor;
            }

            ctx.fillRect(x, y, SWEEPLE_STYLE.keyWidth, SWEEPLE_STYLE.keyHeight);
            
            // Then write the letter on the key centered
            ctx.fillStyle = SWEEPLE_STYLE.textColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const textX = x + ((SWEEPLE_STYLE.keyWidth / 2));
            const textY = y + ((SWEEPLE_STYLE.keyHeight / 2));
            ctx.fillText(letter, textX, textY);
        }

        ctx.restore();
    }
    
    // Finally return the canvas as a discord attachment
    const attachment = new Discord.MessageAttachment(canvas.toBuffer(), 'keyboard.png');
    return attachment;
}


// Creates or updates the image of the tiles
SweepleGame.prototype.updateTiles = async function () {
    const attachment = this.drawTiles();

    if (!this.tilesMessage) {
        this.tilesMessage = await this.thread.send({ files: [attachment] });
    } else {
        await this.tilesMessage.edit({ files: [attachment] });
    }
}


// Draws the tile grid and returns it as a discord attachment
SweepleGame.prototype.drawTiles = function () {

    // Calculate the needed width/height of the canvas to fit all the tiles
    const canvasWidth = (SWEEPLE_STYLE.squareSize + SWEEPLE_STYLE.squareGap) * SWEEPLE_CONF.wordLength - SWEEPLE_STYLE.squareGap;
    const canvasHeight = (SWEEPLE_STYLE.squareSize + SWEEPLE_STYLE.squareGap) * SWEEPLE_CONF.maxGuesses - SWEEPLE_STYLE.squareGap;

    // Create and initialize the canvas
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");
    
    ctx.font = SWEEPLE_STYLE.tileFont;

    for (let line = 0; line < SWEEPLE_CONF.maxGuesses; line++) {
        // y-coordinate of the top-left corner of the current tile
        let y = (SWEEPLE_STYLE.squareSize + SWEEPLE_STYLE.squareGap) * line;

        if (this.guesses[line]) {
            // Get status for each letter
            let status = this.checkWord(this.guesses[line]);

            for (let column = 0; column < SWEEPLE_CONF.wordLength; column++) {
                // x-coordinate of the top-left corner of the current tile
                let x = (SWEEPLE_STYLE.squareSize + SWEEPLE_STYLE.squareGap) * column;


                if (this.guesses[line]) {

                    // color the tile based on state of the letter
                    if (status[column] == STATE_CORRECT) {
                        ctx.fillStyle = SWEEPLE_STYLE.correctColor;
                    } else if (status[column] == STATE_PRESENT) {
                        ctx.fillStyle = SWEEPLE_STYLE.presentColor;
                    } else {
                        ctx.fillStyle = SWEEPLE_STYLE.absentColor;
                    }

                    ctx.fillRect(x, y, SWEEPLE_STYLE.squareSize, SWEEPLE_STYLE.squareSize);
                    
                    // write the current letter into the colored tile
                    ctx.fillStyle = SWEEPLE_STYLE.textColor;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    const textX = x + ((SWEEPLE_STYLE.squareSize / 2));
                    const textY = y + ((SWEEPLE_STYLE.squareSize / 2));
                    ctx.fillText(this.guesses[line][column].toUpperCase(), textX, textY);
                }
            }

        } else { // Draw a line of empty squares for empty guess
            for (let column = 0; column < SWEEPLE_CONF.wordLength; column++) {
                // x-coordinate of the top-left corner of the current tile
                let x = (SWEEPLE_STYLE.squareSize + SWEEPLE_STYLE.squareGap) * column;

                ctx.strokeStyle = SWEEPLE_STYLE.emptyColor;
                ctx.lineWidth = SWEEPLE_STYLE.borderWidth;

                ctx.strokeRect(x, y, SWEEPLE_STYLE.squareSize, SWEEPLE_STYLE.squareSize);
            }
        }
    }

    const attachment = new Discord.MessageAttachment(canvas.toBuffer(), 'grid.png');
    return attachment;
}


module.exports = Sweeple;
