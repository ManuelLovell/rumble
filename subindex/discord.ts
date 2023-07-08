import OBR, { Metadata } from '@owlbear-rodeo/sdk';
import { IWebhook } from '../src/interfaces';
import { Constants } from '../src/constants';

let webhookInput: HTMLInputElement;
let webhookButton: HTMLButtonElement;


OBR.onReady(async () =>
{
    webhookInput = document.querySelector<HTMLInputElement>('#webHookInput')!;
    webhookButton = document.querySelector<HTMLButtonElement>('#webHookSend')!;
    const metadata = await OBR.room.getMetadata();
    if (metadata[`${Constants.DISCORDID}/metadata_webhook`] != undefined)
    {
        const webhookContainer = metadata[`${Constants.DISCORDID}/metadata_webhook`] as IWebhook;
        webhookInput.value = webhookContainer?.url;
    }
    webhookInput.onfocus = function ()
    {
        webhookButton.innerHTML = "Save to Rumble";
        webhookButton.style.color = "";
        webhookButton.style.fontWeight = "";
    };
    webhookButton.onclick = async function ()
    {
        if (webhookInput.value && webhookInput.value.startsWith('https://discord.com/api/webhook'))
        {
            const metadata: Metadata = {};
    
            metadata[`${Constants.DISCORDID}/metadata_webhook`] = { url: webhookInput.value };
            await OBR.room.setMetadata(metadata);

            webhookButton.innerHTML = "You're good to go!";
            webhookButton.style.color = "#66FF00";
            webhookButton.style.fontWeight = "900";

            await OBR.popover.close(Constants.DISCORDID);
        }
        else
        {   
            webhookButton.innerHTML = "Invalid Discord Webhook";
            webhookButton.style.color = "red";
            webhookButton.style.fontWeight = "900";
        }
    };
});