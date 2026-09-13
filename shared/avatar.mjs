export const avatarOptions = {
  species: [{id:"robot",name:"Robô"},{id:"cat",name:"Gato"},{id:"alien",name:"Alien"}],
  color: [{id:"violet",name:"Violeta",hex:"#7856DB"},{id:"ocean",name:"Oceano",hex:"#147F99"},{id:"sunset",name:"Coral",hex:"#CA5262"},{id:"forest",name:"Floresta",hex:"#287B57"}],
  accessory: [{id:"none",name:"Sem acessório"},{id:"visor",name:"Visor"},{id:"crown",name:"Coroa"}],
  frame: [{id:"round",name:"Circular"},{id:"square",name:"Quadrada"},{id:"gold",name:"Dourada"}],
};
export const defaultAvatar={species:"robot",color:"violet",accessory:"none",frame:"round"};
export function validAvatar(value){
  return !!value && typeof value==="object" && !Array.isArray(value) && Object.keys(value).length===4 && Object.entries(avatarOptions).every(([key,options])=>options.some(option=>option.id===value[key]));
}
export function readAvatar(raw){
  try {const value=typeof raw==="string"?JSON.parse(raw):raw;return validAvatar(value)?{...value}:{...defaultAvatar};}
  catch{return {...defaultAvatar};}
}
