import { Constants } from './constants';
import { IChatLog, IPlayer } from './interfaces';
import OBR, { Metadata } from "@owlbear-rodeo/sdk";
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<section class="chatContainer">
    <ul id="chatLog">
    </ul>
</section>
<div class="inputContainer">
    <div id="targetSelect">
        <label for="players">Send Message To:</label>

        <select name="players" id="playerSelect">
            <option value="everyone">Everyone</option>
        </select>
    </div>
    <div>
    <input id="chat-input" type="text" name="message" placeholder="Type Message ..." class="form-control">
        <span>
            <button id="chat-button" type="button" class="button">Send</button>
        </span>
    </div>
</div>
`
let userName = "";
let userId = "";
let userColor = "";
let gamePlayers: IPlayer[] = [];
let lastRumbleMessage: IChatLog = { chatlog: "", sender: "", created: "", color: "" };
let lastClashmessage: IChatLog = { chatlog: "", sender: "", created: "", color: "" };

// TODO
// Time stamp the messages to avoid showing old/stale on refresh?

OBR.onReady(async () =>
{
    userName = await OBR.player.getName();
    userId = await OBR.player.getId();
    userColor = await OBR.player.getColor();
    gamePlayers = (await OBR.party.getPlayers()).map(x => { return { id: x.id, name: x.name } });
    SetupOnChangeEvents();
    SetupSendButtons();
    UpdatePlayerSelect();
});

function SetupSendButtons()
{
    const chatInput = document.querySelector<HTMLDivElement>('#chat-input')! as HTMLInputElement;
    chatInput.addEventListener("keypress", async function (event)
    {
        if (event.key === "Enter")
        {
            await SendtoChatLog(chatInput);
        }
    });

    const sendButton = document.querySelector<HTMLDivElement>('#chat-button')! as HTMLInputElement;
    sendButton.onclick = async function ()
    {
        if (chatInput.value)
        {
            await SendtoChatLog(chatInput);
        }
    };
}

function IsThisOld(created: string): boolean
{
    const FIVE_SECONDS = 5 * 1000; // Mins - seconds - milliseconds

    const currentTime: any = new Date();
    const messageTime: any = new Date(created);
    //Don't repeat messages older than 5 seconds (on refresh/reloads/dayslater)..
    const pastDue = (currentTime - messageTime) > FIVE_SECONDS;

    return pastDue;
}

function SetupOnChangeEvents()
{
    const chatLog = document.querySelector<HTMLDivElement>('#chatLog')!;
    OBR.scene.onMetadataChange((metadata) =>
    {
        const TIME_STAMP = new Date().toLocaleTimeString();

        // Checks for own logs passing through
        if (metadata[`${Constants.EXTENSIONID}/metadata_chatlog`] != undefined)
        {
            const messageContainer = metadata[`${Constants.EXTENSIONID}/metadata_chatlog`] as IChatLog;

            if ((lastRumbleMessage.chatlog != messageContainer.chatlog
                || lastRumbleMessage.sender != messageContainer.sender)
                && (!IsThisOld(messageContainer.created)))
            {
                lastRumbleMessage = messageContainer;
                const message = messageContainer.chatlog;
                lastRumbleMessage = messageContainer;

                // Flag to see if you're the sender
                const mine = messageContainer.senderId == userId;
                const author = document.createElement('li');
                const log = document.createElement('li');

                const itMe = mine ? " itsMe" : "";

                // If you're the sender, or it's being sent to everyone.
                if (messageContainer.senderId == userId
                    || messageContainer.targetId == "0000")
                {
                    // This is a whisper
                    const secret = mine && (messageContainer.targetId != "0000")
                        ? ` to [${messageContainer.target}]` : "";

                    author.className = "rumbleAuthor" + itMe;
                    author.style.color = messageContainer.color;
                    author.innerText = `[${TIME_STAMP}] - ${messageContainer.sender}` + secret;

                    log.className = "rumbleLog" + itMe;
                    log.innerText = `•    ` + message as string;
                    chatLog.append(author);
                    chatLog.append(log);
                }
                else if (messageContainer.targetId == userId)
                {
                    // Whisper to the User
                    author.className = "rumbleAuthor" + itMe;
                    author.style.color = messageContainer.color;
                    author.innerText = `[${TIME_STAMP}] - ${messageContainer.sender} to [You]`;

                    log.className = "rumbleLog outline" + itMe;
                    log.innerText = `•    ` + message as string;
                    chatLog.append(author);
                    chatLog.append(log);
                }

            }
        }

        // Checks for Clash logs passing through - just a string, no sender
        if (metadata[`${Constants.CLASHID}/metadata_chatlog`] != undefined)
        {
            const messageContainer = metadata[`${Constants.CLASHID}/metadata_chatlog`] as IChatLog;
            if ((lastClashmessage.chatlog != messageContainer.chatlog
                || lastClashmessage.sender != messageContainer.sender)
                && (!IsThisOld(messageContainer.created)))
            {
                lastClashmessage = messageContainer;
                const message = messageContainer.chatlog;

                const author = document.createElement('li');
                author.className = "rumbleAuthor clashLog";
                author.innerText = `[${TIME_STAMP}] - Clash!`;

                const log = document.createElement('li');
                log.className = "clashLog";
                log.innerText = `🡆    ` + message as string;

                chatLog.append(author);
                chatLog.append(log);
            }
        }
    });

    // Check for username updates
    OBR.player.onChange((user) =>
    {
        userName = user.name;
        userId = user.id;
        userColor = user.color;
    });

    // Update the select for player changes
    OBR.party.onChange((party) =>
    {
        gamePlayers = party.map(x => { return { id: x.id, name: x.name } });
        UpdatePlayerSelect();
    });
}

function UpdatePlayerSelect()
{
    const playerSelect = document.querySelector<HTMLDivElement>('#playerSelect')!;

    const everyoneOption = document.createElement("option");
    everyoneOption.setAttribute('value', "0000");
    const everyoneText = document.createTextNode("Everyone");
    everyoneOption.appendChild(everyoneText);

    //Clear and add Everyone option
    playerSelect.innerHTML = "";
    playerSelect.appendChild(everyoneOption);

    gamePlayers.forEach(player =>
    {
        let option = document.createElement("option");
        option.setAttribute('value', player.id);

        let optionText = document.createTextNode(player.name);
        option.appendChild(optionText);

        playerSelect.appendChild(option);
    });
}

async function SendtoChatLog(chatInput: HTMLInputElement): Promise<void>
{
    if (chatInput.value)
    {
        //playerSelect
        const pS = <HTMLSelectElement>document.getElementById("playerSelect");
        const targetId = pS.value;
        const targetText = pS.options[pS.selectedIndex].text;

        const metadata: Metadata = {};
        const now = new Date().toISOString();

        metadata[`${Constants.EXTENSIONID}/metadata_chatlog`]
            = {
            chatlog: chatInput.value,
            sender: userName,
            senderId: userId,
            target: targetText,
            targetId: targetId,
            created: now,
            color: userColor
        };

        chatInput.value = "";
        return await OBR.scene.setMetadata(metadata);
    }
}