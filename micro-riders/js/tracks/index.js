// Registry of all playable circuits — add a new track by creating its
// def file (see bedroom.js/kitchen.js for the shape) and listing it here.
import { bedroom } from './bedroom.js';
import { kitchen } from './kitchen.js';

export const TRACK_DEFS = { bedroom, kitchen };
export const TRACK_LIST = [bedroom, kitchen];
