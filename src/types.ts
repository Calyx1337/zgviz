export type Coord = [number, number];
export interface Amenity { id:string; name:string; address:string; category:string; coordinates:Coord; district:string|null; source:string; detail:string; }
export interface Project {id:string;name:string;address:string;phase:string;rawStatus:string|null;status:string;value:number|null;updated:string|null;period:string|null;coordinates:Coord|null;district:string|null;source:string;year:number|null;locationPrecision:string;}
export interface Graph {nodes:Coord[];edges:[number,number,number][];bounds:number[];}
export interface WalkResult {id:number;distances:Record<string,number>;lines:Coord[][];hull:Coord[];connected:boolean;snapped:number;boundary:boolean;}
export interface District {id:string;name:string;areaKm2:number;center:Coord;amenities:number;categories:number;projects:number;activeProjects:number;plannedValue:number;sampleSize:number;connectedSamples:number;access:Record<string,Record<string,number|null>>;}
