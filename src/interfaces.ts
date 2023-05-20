export interface IChatLog
{
    chatlog: string; // Message
    sender?: string; // Sender Name
    senderId?: string; // Sender OBR Id
    target?: string; // Target Name
    targetId?: string; // Target OBR Id
    created: string; // new Date().toISOString();
    color: string;
}

export interface IPlayer
{
    id: string;
    name: string;
}

export interface ISafety
{
    safety: string;
    created: string;
}