export interface IChatLog
{
    chatlog: string;
    sender?: string;
    senderId?: string;
    target?: string;
    targetId?: string;
    created: string;
    color: string;
}

export interface IPlayer
{
    id: string;
    name: string;
}