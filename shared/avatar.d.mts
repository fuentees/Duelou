export type Avatar = {species:"robot"|"cat"|"alien";color:"violet"|"ocean"|"sunset"|"forest";accessory:"none"|"visor"|"crown";frame:"round"|"square"|"gold"};
export const defaultAvatar: Avatar;
export const avatarOptions: Record<keyof Avatar,{id:string;name:string;hex?:string}[]>;
export function readAvatar(raw:unknown):Avatar;
export function validAvatar(value:unknown):boolean;
