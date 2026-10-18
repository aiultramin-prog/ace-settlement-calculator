import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handle } from '../../../lib/api.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handle(request,await getChatGPTUser(),env.DB); }
export async function POST(request: Request) { return handle(request,await getChatGPTUser(),env.DB); }
