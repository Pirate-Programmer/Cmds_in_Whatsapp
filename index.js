
//obtain necessary modules
const qrcode = require('qrcode-terminal')
const { Client, LocalAuth, AuthStrategy, MessageMedia } = require('whatsapp-web.js');
const client = new Client({
     authStrategy : new LocalAuth()
});
const fs = require('fs');
const { error } = require('console');
const filepath = "./mapping.json";

//generate QR code for login
client.on('qr', (qr) => {
    // Generate and scan this code with your phone
    qrcode.generate(qr, { small : true })
});

client.on("authenticated", () => console.log("Authentication succesfull!!"));

client.on("auth_failure", () => console.log("auth failed D:"));


//when client logs in
client.on('ready', async () => {
    console.log('Client is ready!');
});



//when messages are created ie users'own or other users
client.on('message_create', async (msg) => {
    if (msg.fromMe && typeof msg.body === 'string') {
        console.log(msg.body);
        const firstWord = msg.body.split(' ')[0]
        switch (firstWord) {
            case "!remindme":
                remindme(msg);
                break;
            case "!rps":
                rps(msg);
                break;
            case "!meme":
                getMeme(msg);
                break;
            case "!ping":
                ping(msg);
                break;
            case "!tellmeajoke":
                tellmeajoke(msg);
                break;
        }
    }
});


client.initialize();


//end session on 'ctrl + c'
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await client.destroy();
    process.exit(0);
});


//--------------------------remindme function ---------------------------
async function remindme(msg){
    console.log('My message:', msg.body);

    const regex = /-t\s*(\d+)\s*-m\s*(.*)/;
    const match = msg.body.match(regex);

    if (match && match[1] && match[2]) {
        const time = parseInt(match[1], 10); 
        const message = match[2].trim();

        console.log(time); 
        console.log(`Reminder message: "${message}"`); 

        msg.reply("reminder set for " + time + "mins");

        await new Promise(resolve => setTimeout(resolve, time * 60 *  1000));
        
        msg.reply("Reminder for " + message);

    } else {
        msg.reply("Error: Please use the format `!remind -t <mins> -m <your message>`.");
        console.log("Reminder command format invalid. 'match' was null or missing groups.");
    }
}

//----------------------RPS function-----------------------------
//format !rps <move>(rock/paper/scissor)
const moves = {
    rock : 0,
    paper : 1,
    scissor : 2
};

const array = ['🪨', '📜', '✂️'];

function rps(msg) {
    str = msg.body.toLowerCase();
    const match = str.match(/^!rps\s+(rock|paper|scissor)$/i);
    if(match){
        const user = moves[match[1]];
        const loseTo = (user + 1) % 3;
        const computer = Math.floor((Math.random() * 3));
        const result = (computer !== loseTo)?((computer !== user)? 'Win' : 'Draw'):'Lose';
        message = `You ${result}, Computer Picked: ${array[computer]}.`;
        msg.reply(message);
    }
    else{
        msg.reply("Error: Please use the format: `!rps <move>(rock/paper/scissor)`.");
        console.log("format !rps <move>(rock/paper/scissor)");
    }
}

//----------------- meme function ----------------------------
async function getMeme(msg){
    let API = "https://meme-api.com/gimme"

    //concat subreddit if -s is passed
    const match = msg.body.match(/-s\s+([^\s]+)/);
    if (match) {
        API += `/${match[1]}`
    }

    try{
        //fetch and parse the json
        const res = await fetch(API);
        const meme = await res.json();

        if(meme.nsfw){
            msg.reply("not safe for your eyes bruh");
            return;
        }
        
        const media = await MessageMedia.fromUrl(meme.url);
        msg.getChat().then(chat => chat.sendMessage(media));

    } catch(err){
        console.log(err);
        msg.reply("⚠️meme fetch failed");
        return;
    }
}


//----------------- ping function ----------------------
//format !ping chatname message  //note this will be typed in test chat through this mmsg be routed to req chat
async function ping(msg){

    if(msg.body.split(' ') < 2){
        msg.reply("Error: Invalid Format: `!ping chatname [message]");
        console.log("invalid ping format");
        return;
    }

    //get chatId from the mentioned chatname
    const regex = /^!ping\s+-n\s+(.+?)\s+-m\s+([\s\S]+)$/i;
    const match = msg.body.match(regex);

    let chatName = null;
    let message = null;
    if(match){
        chatName = match[1].trim();
        message = match[2].trim();
    }else{
        msg.reply("Error: Invalid Format: `!ping chatname [message]");
        console.log("invalid ping format");
        return;
    }
    
    console.log(chatName)
    const chatId = await getChatId(chatName)
    const chat = await client.getChatById(chatId);
    

    let mentions = chat.participants.map(user => user.id._serialized);
    chat.sendMessage(message,{mentions});
}

//WORK IN PROGRESS
//------------------- tellmeajoke function ------------------
async function tellmeajoke(msg) {
    let API = "https://v2.jokeapi.dev/joke/Any";
    const str = msg.body;
    
    const regex = /-(\w+)(?:\s+([^\s]+))?/g;
    let match;
    const flag = {};
    const blacklist = "nsfw,religious,political,racist,sexist,explicit";

    while ((match = regex.exec(str)) !== null){
        flag[match[1]] = match[2];
    }

    if(flag.s){
        API = "https://v2.jokeapi.dev/joke/" + flag.s;
    }

    if(flag.t){
        API += `?type=${flag.t}&blacklistFlags=${blacklist}&lang=en`;
    }else{
        API += `?blacklistFlags=${blacklist}&lang=en`;
    }

    try{
        const req = await fetch(API);
        const res = await req.json();
        const chat = await msg.getChat();

        //incase its a twopart joke wait 3 seconds for the delivery
        if(res.type === "twopart"){
            chat.sendMessage(res.setup);
            await new Promise(resolve => setTimeout(resolve,2000));
            chat.sendMessage(res.delivery);
        }else{
            chat.sendMessage(res.joke);
        }
    }catch(err){
        console.log(err);
        msg.reply("⚠️joke fetch failed");
        return;
    } 
}


async function getChatId(chatName){
    let chatId = null;
    
    //when file not present or name not found 
    try{
        let data = fs.readFileSync(filepath,{encoding: 'utf-8'});
        data = JSON.parse(data);
        chatId = data[chatName];
        if(chatId == undefined)
            throw new Error("chatNmae not found");
    }catch(err){
        //incase of any error overwrite the mapping.txt file
        const chats = await client.getChats();
        const mapping = new Map(); //will contain mapping of name : chatId of all the chats
        chats.forEach((chat,idx,array) => mapping[chat.name] = chat.id._serialized); 
        fs.writeFileSync(filepath,JSON.stringify(mapping),{ encoding: 'utf8', flag: 'w' });
        
        chatId = mapping[chatName]
    }
    return chatId;   
}