import { api } from '../lib/services.js';
import { preflight } from '../lib/http.js';

export const POST = api.answer;
export const OPTIONS = preflight;
