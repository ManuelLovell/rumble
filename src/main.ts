import { Constants } from './constants';
import { IChatLog, IPlayer, ISafety, IWebhook } from './interfaces';
import DiceUIPicker from './dice-ui';
import { DiceExpressionRoll, DiceRollResult, DiceRoller, DieRoll } from "dice-roller-parser";
import OBR, { Metadata } from "@owlbear-rodeo/sdk";
import DiceBox from "@3d-dice/dice-box";
import * as Utilities from "./utilities";
import './style.css';

const mobile = window.innerWidth < Constants.MOBILEWIDTH;
let currentTheme: "LIGHT" | "DARK";
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header id="headerContainer" class="headerContainer"></header>
<section id="chatContainer" class="chatContainer">
    <div id="diceContainer" class="diceCont"></div>
    <ul id="chatLog">
    </ul>
</section>
<div class="inputContainer">
    <div id="targetSelect">
        <label for="players">${mobile ? "Send:" : "Send To:"}</label>

        <select name="players" id="playerSelect">
        </select>
        <div id="safetyButtons">${mobile ? "" : "Safety:"}
            <button id="happyButton" type="button"><embed class="svg" src="/check.svg" /></button>
            <button id="waryButton" type="button"><embed class="svg" src="/circle.svg" /></button>
            <button id="badButton" type="button"><embed class="svg" src="/cross.svg" /></button>
        </div>
    </div>
    <div id="chatInputContainer">
    <button id="discordButton" type="button" title="Hook to Discord"><embed class="svg" src="/discord2.svg" /></button>
    <input id="chat-input" class="chatInput" type="text" name="message" placeholder="Type Message ..." class="form-control">
        <span id="chatButtonContainer">
            <button id="chat-button" type="button" class="button">Send</button>
        </span>
    </div>
</div>`

let userName = "";
let userId = "";
let userColor = "";
let discordHook = "";
let unread = 0;
let whispered = false;
let gamePlayers: IPlayer[] = [];
let lastRumbleMessage: IChatLog = { chatlog: "", sender: "", created: "", color: "" };
let lastClashmessage: IChatLog = { chatlog: "", sender: "", created: "", color: "" };
let lastFriendmessage: IChatLog = { chatlog: "", sender: "", created: "", color: "" };

const slashWhisperRegex = /^\/whisper (\w+) (.+)$/;
const slashWRegex = /^\/w (\w+) (.+)$/;
const rollCommand = "/roll ";

let diceBox;

await OBR.onReady(async () =>
{
    // Set theme accordingly
    const theme = await OBR.theme.getTheme();
    const roomData = await OBR.room.getMetadata();
    if (roomData[`${Constants.DISCORDID}/metadata_webhook`] != undefined)
    {
        const webhookContainer = roomData[`${Constants.DISCORDID}/metadata_webhook`] as IWebhook;
        discordHook = webhookContainer.url;
    }
    currentTheme = theme.mode;
    Utilities.SetThemeMode(theme, document);
    OBR.theme.onChange((theme) =>
    {
        currentTheme = theme.mode;
        Utilities.SetThemeMode(theme, document);
    })

    await SetupOnChangeEvents();
    userName = await OBR.player.getName();
    userId = await OBR.player.getId();
    userColor = await OBR.player.getColor();
    gamePlayers = (await OBR.party.getPlayers()).map(x => { return { id: x.id, name: x.name } });
    SetupSendButtons();
    SetupSafetyButtons();
    UpdatePlayerSelect();
    SetupDiceBox();
});

function SetupSafetyButtons()
{
    //Good
    const goodGM = document.querySelector<HTMLDivElement>('#happyButton')! as HTMLInputElement;
    goodGM.onclick = async function ()
    {
        const metadata: Metadata = {};
        const now = new Date().toISOString();

        metadata[`${Constants.EXTENSIONID}/metadata_chatSafety`] = { safety: "happy", created: now };

        return await OBR.player.setMetadata(metadata);
    };

    //Bad
    const badGM = document.querySelector<HTMLDivElement>('#badButton')! as HTMLInputElement;
    badGM.onclick = async function ()
    {
        const metadata: Metadata = {};
        const now = new Date().toISOString();

        metadata[`${Constants.EXTENSIONID}/metadata_chatSafety`] = { safety: "bad", created: now };

        return await OBR.player.setMetadata(metadata);
    };

    //Wary
    const maybeGM = document.querySelector<HTMLDivElement>('#waryButton')! as HTMLInputElement;
    maybeGM.onclick = async function ()
    {
        const metadata: Metadata = {};
        const now = new Date().toISOString();

        metadata[`${Constants.EXTENSIONID}/metadata_chatSafety`] = { safety: "wary", created: now };

        return await OBR.player.setMetadata(metadata);
    };
}

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

    const discordButton = document.querySelector<HTMLDivElement>('#discordButton')! as HTMLInputElement;
    discordButton.onclick = async function ()
    {
        OBR.popover.open({
            id: Constants.DISCORDID,
            url: `/subindex/discordhook.html`,
            height: 220,
            width: 400
        });
    }
}

function IsThisOld(created: string): boolean
{
    const FIVE_SECONDS = 3 * 1000; // Mins - seconds - milliseconds

    const currentTime: any = new Date();
    const messageTime: any = new Date(created);
    //Don't repeat messages older than 5 seconds (on refresh/reloads/dayslater)..
    const pastDue = (currentTime - messageTime) > FIVE_SECONDS;

    return pastDue;
}

async function SetupOnChangeEvents()
{
    // Check for webhook changes
    OBR.room.onMetadataChange((metadata: Metadata) =>
    {
        if (metadata[`${Constants.DISCORDID}/metadata_webhook`] != undefined)
        {
            const webhookContainer = metadata[`${Constants.DISCORDID}/metadata_webhook`] as IWebhook;
            discordHook = webhookContainer.url;
        }
    });

    // Check for username updates
    OBR.player.onChange(async (user) =>
    {
        userName = user.name;
        userId = user.id;
        userColor = user.color;
        await HandleMessage(user.metadata);
    });

    // Update the select for player changes
    OBR.party.onChange((party) =>
    {
        gamePlayers = party.map(x => { return { id: x.id, name: x.name } });
        UpdatePlayerSelect();

        // Check for messages on local player data, it has more space allowance
        party.forEach(async (player) =>
        {
            await HandleMessage(player.metadata);
        });
    });

    OBR.action.onOpenChange(async (open) =>
    {
        if (open)
        {
            whispered = false;
            unread = 0;
            await OBR.action.setBadgeText(undefined);
            await OBR.action.setBadgeBackgroundColor("#BB99FF");
            await OBR.action.setIcon("/icon.svg");
        }
    });
}

async function HandleMessage(metadata: Metadata)
{
    const chatLog = document.querySelector<HTMLDivElement>('#chatLog')!;
    const isOpen = await OBR.action.isOpen();
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
                unread = !mine ? unread + 1 : unread;
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
                unread = unread + 1;
                whispered = true;
            }

        }
    }

    // Checks for Clash(Or Rumble Rolls) logs passing through - just a string, no sender
    if (metadata[`${Constants.CLASHID}/metadata_chatlog`] != undefined)
    {
        const messageContainer = metadata[`${Constants.CLASHID}/metadata_chatlog`] as IChatLog;
        if ((lastClashmessage.chatlog != messageContainer.chatlog
            || lastClashmessage.sender != messageContainer.sender)
            && (!IsThisOld(messageContainer.created)))
        {
            if (messageContainer.targetId == userId)
            {
                lastClashmessage = messageContainer;
                const message = messageContainer.chatlog;

                const author = document.createElement('li');
                author.className = "rumbleAuthor clashLog";
                author.innerText = `[${TIME_STAMP}] - ${messageContainer.sender} to [You]`;

                const log = document.createElement('li');
                log.className = messageContainer.critical ? "clashLog glow" : "clashLog";
                log.innerText = `🡆    ` + message as string;

                chatLog.append(author);
                chatLog.append(log);
            }
            else if (messageContainer.targetId == "0000")
            {
                lastClashmessage = messageContainer;
                const message = messageContainer.chatlog;

                const author = document.createElement('li');
                author.className = "rumbleAuthor clashLog";
                author.innerText = `[${TIME_STAMP}] - ${messageContainer.sender}`;

                const log = document.createElement('li');
                log.className = messageContainer.critical ? "clashLog glow" : "clashLog";
                log.innerText = `🡆    ` + message as string;

                chatLog.append(author);
                chatLog.append(log);
                unread = unread + 1;
            }
        }
    }

    // Checks for Outside Extension logs passing through
    if (metadata[`${Constants.OUTSIDEID}/metadata_chatlog`] != undefined)
    {
        const messageContainer = metadata[`${Constants.OUTSIDEID}/metadata_chatlog`] as IChatLog;
        if ((lastFriendmessage.chatlog != messageContainer.chatlog
            || lastFriendmessage.sender != messageContainer.sender)
            && (!IsThisOld(messageContainer.created)))
        {
            if (messageContainer.targetId == userId)
            {
                lastFriendmessage = messageContainer;
                const message = messageContainer.chatlog;

                const author = document.createElement('li');
                author.className = "rumbleAuthor friendLog";
                author.innerText = `[${TIME_STAMP}] - ${messageContainer.sender} to [You]`;

                const log = document.createElement('li');
                log.className = "friendLog";
                log.innerText = `🢥    ` + message as string;

                chatLog.append(author);
                chatLog.append(log);
            }
            else if (messageContainer.targetId == "0000")
            {
                lastFriendmessage = messageContainer;
                const message = messageContainer.chatlog;

                const author = document.createElement('li');
                author.className = "rumbleAuthor friendLog";
                author.innerText = `[${TIME_STAMP}] - ${messageContainer.sender}`;

                const log = document.createElement('li');
                log.className = "friendLog";
                log.innerText = `🢥    ` + message as string;

                chatLog.append(author);
                chatLog.append(log);
                unread = unread + 1;
            }
        }
    }

    if (metadata[`${Constants.EXTENSIONID}/metadata_chatSafety`] != undefined)
    {
        const playerRole = await OBR.player.getRole();
        const safetyContainer = metadata[`${Constants.EXTENSIONID}/metadata_chatSafety`] as ISafety;
        if (!IsThisOld(safetyContainer.created))
        {
            if (safetyContainer.safety == "bad")
            {
                const author = document.createElement('li');
                const log = document.createElement('li');
                const TIME_STAMP = new Date().toLocaleTimeString();

                author.className = "rumbleAuthor clashLog";
                author.innerText = `[${TIME_STAMP}] - ❌ Full Stop ❌`;

                log.className = "clashLog";
                log.innerText = `🡆    Someone is concerned with the current situation. Talk it out.`;

                chatLog.append(author);
                chatLog.append(log);
                unread = unread + 1;
                whispered = true;
                OBR.popover.open({
                    id: "com.battle-system.rumble",
                    url: `/subindex/sub${safetyContainer.safety}.html`,
                    height: 400,
                    width: 400,
                });
            }
            if (safetyContainer.safety == "wary")
            {
                const author = document.createElement('li');
                const log = document.createElement('li');
                const TIME_STAMP = new Date().toLocaleTimeString();

                author.className = "rumbleAuthor clashLog";
                author.innerText = `[${TIME_STAMP}] - 🟡 Let's be careful 🟡`;

                log.className = "clashLog";
                log.innerText = `🡆    Someone is starting to feel wary about what's going on.`;

                chatLog.append(author);
                chatLog.append(log);
                unread = unread + 1;
                whispered = true;

                OBR.popover.open({
                    id: "com.battle-system.rumble",
                    url: `/subindex/sub${safetyContainer.safety}.html`,
                    height: 400,
                    width: 400,
                });
            }
            if (playerRole == "GM" && safetyContainer.safety == "happy")
            {
                const author = document.createElement('li');
                const log = document.createElement('li');
                const TIME_STAMP = new Date().toLocaleTimeString();

                author.className = "rumbleAuthor clashLog";
                author.innerText = `[${TIME_STAMP}] - ✅ Great Job! ✅`;

                log.className = "clashLog";
                log.innerText = `🡆    Someone has shown their approval!`;

                chatLog.append(author);
                chatLog.append(log);
                unread = unread + 1;

                OBR.popover.open({
                    id: "com.battle-system.rumble",
                    url: `/subindex/sub${safetyContainer.safety}.html`,
                    height: 200,
                    width: 200,
                });
            }
        }
    }

    if (isOpen)
    {
        whispered = false;
        unread = 0;
    }
    // Update Badge for unread if Action isn't open
    if (!isOpen && unread > 0)
    {
        await OBR.action.setIcon("/icon-filled.svg");
        await OBR.action.setBadgeText(unread.toString());
        if (whispered)
        {
            const badgeColor = currentTheme == "DARK" ? "yellow" : "#159cc5";
            await OBR.action.setBadgeBackgroundColor(badgeColor);
        }
    }
}

function UpdatePlayerSelect()
{
    const playerSelect = <HTMLSelectElement>document.getElementById("playerSelect");
    let lastTarget = playerSelect.value;

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

    const lastTargetConnected = gamePlayers.find(player => player.id === lastTarget);
    if (!lastTargetConnected && lastTarget && lastTarget !== "0000")
    {
        let option = document.createElement("option");
        option.setAttribute('value', lastTarget);

        let optionText = document.createTextNode("(Disconnected)");
        option.appendChild(optionText);

        playerSelect.appendChild(option);
        playerSelect.value = lastTarget;
    }
    else if (lastTarget)
    {
        playerSelect.value = lastTarget;
    }
}
async function SendSlashWhispertoChatLog(matches: RegExpMatchArray | null, chatInput: HTMLInputElement)
{
    if (matches)
    {
        const mPlayer = matches[1];
        const mMessage = matches[2];
        const foundPlayer = gamePlayers.find(player => player.name.toLowerCase() === mPlayer.toLowerCase());
        if (foundPlayer && mMessage)
        {
            const metadata: Metadata = {};
            const now = new Date().toISOString();

            metadata[`${Constants.EXTENSIONID}/metadata_chatlog`]
                = {
                chatlog: mMessage,
                sender: userName,
                senderId: userId,
                target: foundPlayer.name,
                targetId: foundPlayer.id,
                created: now,
                color: userColor
            };

            chatInput.value = "";
            return await OBR.player.setMetadata(metadata);
        }
    }
}

async function SendtoDiscord(message: string): Promise<void>
{
    // If the hook is empty, leave
    if (!discordHook) return;

    // Send the message to Discord
    const request = new XMLHttpRequest();
      request.open("POST", discordHook);

      request.setRequestHeader('Content-type', 'application/json');

      const params = {
        username: "Rumble! : " + userName,
        avatar_url: "https://battle-system.com/owlbear/rumble-docs/logo.png",
        content: message
      }

      request.send(JSON.stringify(params));
}

async function SendtoChatLog(chatInput: HTMLInputElement): Promise<void>
{
    // If no messages, Just leave.
    if (!chatInput.value) return;

    if (chatInput.value.startsWith("/whisper"))
    {
        // If this is a slash command whisper, send it
        const matches = chatInput.value.match(slashWhisperRegex);
        await SendSlashWhispertoChatLog(matches, chatInput);
    }
    else if (chatInput.value.startsWith("/w"))
    {
        // Short hand whisper
        const matches = chatInput.value.match(slashWRegex);
        await SendSlashWhispertoChatLog(matches, chatInput);
    }
    else if (chatInput.value.startsWith("/math"))
    {
        const answer = Utilities.evaluateMathExpression(chatInput.value).toString();
        await SendMathtoChatLog(answer);
        chatInput.value = "";
    }
    else if (chatInput.value.startsWith(rollCommand))
    {
        const rollInfo = chatInput.value.substring(rollCommand.length);
        const diceRoller = new DiceRoller();

        try
        {
            //Returns an object representing the dice roll, use to display the component parts of the roll
            const rollObject = diceRoller.roll(rollInfo) as any;

            let diceRolled: string[] = [];
            if (rollObject.type == "die")
            {
                const dieRoll = rollObject as DiceRollResult;
                dieRoll.rolls.forEach((rl) =>
                {
                    const roll = rl as DieRoll;
                    diceRolled.push(`[${roll.critical === "success" ? "💥" : ""}${roll.value}${roll.valid ? "" : "✕"}]`);
                });
            }
            else if (rollObject.type == "number")
            {
                // Do nothing
            }
            else
            {
                const expressionRoll = rollObject as DiceExpressionRoll;
                expressionRoll.dice.forEach(async (dice) =>
                {
                    const eDieRoll = dice as DiceRollResult;
                    if (eDieRoll.rolls?.length > 0)
                    {
                        eDieRoll.rolls.forEach((rl) => 
                        {
                            const roll = rl as DieRoll;
                            diceRolled.push(`[D${roll.die }⮞${roll.critical === "success" ? "💥" : ""}${roll.value}${roll.valid ? "" : "✕"}]`);
                        });
                    }
                });
            }

            // Starting roll mesage
            let message = " rolled ";
            let rollInput = rollInfo;
            // Remove the label from the string
            // Add label name
            if (rollObject.label)
            {
                rollInput = rollInfo.replace(rollObject.label, "");
                message += "⭐" + rollObject.label + "⭐";
            }
            // Append results
            message += `[${rollInput}] → ${diceRolled.join(", ")} for ${rollObject.value}!`;
            await SendRolltoChatLog(message);
            chatInput.value = "";
        }
        catch (error)
        {
            console.log("Rumble was unable to parse that roll notation.")
        }
    }
    else
    {
        // Check playerSelect
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

        if (targetId === "0000") await SendtoDiscord(chatInput.value);

        chatInput.value = "";
        return await OBR.player.setMetadata(metadata);
    }
}

async function SendRolltoChatLog(roll: string): Promise<void>
{
    if (roll)
    {
        const metadata: Metadata = {};
        const now = new Date().toISOString();

        metadata[`${Constants.CLASHID}/metadata_chatlog`]
            = {
            chatlog: userName + roll,
            sender: "Rumble!",
            senderId: userId,
            target: "",
            targetId: "0000",
            created: now,
            color: userColor
        };

        await SendtoDiscord(userName + roll);
        return await OBR.player.setMetadata(metadata);
    }
}

async function SendMathtoChatLog(answer: string): Promise<void>
{
    if (answer)
    {
        const metadata: Metadata = {};
        const now = new Date().toISOString();

        metadata[`${Constants.CLASHID}/metadata_chatlog`]
            = {
            chatlog: answer,
            sender: "Rumble!",
            senderId: userId,
            target: "",
            targetId: userId,
            created: now,
            color: userColor
        };

        return await OBR.player.setMetadata(metadata);
    }
}

function ParseResultsToString(results: []): string
{
    let diceRolled: string[] = [];
    let total = 0;
    results.forEach((roll: any) =>
    {
        let breakdown: string[] = [];
        if (roll.rolls.length > 0)
        {
            roll.rolls.forEach((dice: any) =>
            {
                breakdown.push(dice.value);
            });
        }

        diceRolled.push(`${roll.qty}${roll.sides} → [${breakdown.join("-")}]`);
        total += roll.value;
    });

    return ` rolled (${diceRolled.join(", ")}) for ${total}!`;
}

async function SetupDiceBox()
{
    //dice test
    diceBox = new DiceBox("#diceContainer", { id: "diceContainer", assetPath: "/assets/", scale: 15, gravity: 5, theme: 'default', themeColor: '#159cc5' });

    diceBox.init().then(() =>
    {
        const dicePicker = new DiceUIPicker({
            target: '#headerContainer',
            onSubmit: (notation) =>
            {
                const tB = document.querySelector<HTMLInputElement>('#throwButton')!;
                const rB = document.querySelector<HTMLInputElement>('#resetButton')!;
                tB.disabled = true;
                rB.disabled = true;

                diceBox.roll(notation);
            },
            onClear: () =>
            {
                diceBox.clear();
            },
            onReroll: (rolls) =>
            {
                // loop through parsed roll notations and send them to the Box
                rolls.forEach(roll => diceBox.add(roll));
            },
        });
        dicePicker.ready();

        // pass dice rolls to Advanced Roller to handle
        diceBox.onRollComplete = async (results) =>
        {
            const tB = document.querySelector<HTMLInputElement>('#throwButton')!;
            const rB = document.querySelector<HTMLInputElement>('#resetButton')!;
            let messageResult = ParseResultsToString(results);
            await SendRolltoChatLog(messageResult);
            await delay(2000);
            dicePicker.updateNotation(true);
            tB.disabled = false;
            rB.disabled = false;
        }
    });
}

function delay(ms: number)
{
    return new Promise(resolve => setTimeout(resolve, ms));
}