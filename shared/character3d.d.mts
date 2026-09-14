export type Face3D = { points: number[][]; color: string };
export function characterMesh(avatar: unknown, detailed?: boolean): Face3D[];
export function projectCharacter(mesh: Face3D[], yaw?: number): { id: number; depth: number; color: string; points: string }[];
