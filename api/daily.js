import { api } from '../lib/services.js';
import { preflight } from '../lib/http.js';

export const POST = api.daily;
export const OPTIONS = preflight;
