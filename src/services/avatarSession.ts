import https from 'node:https';
import { logger } from '../utils/observability.js';

export interface RelayTokenResponse {
  Urls: string[];
  Username: string;
  Password: string;
}

export interface AvatarSessionInit {
  iceServer: { urls: string; username: string; credential: string };
  mode: 'stub' | 'relay';
}

/**
 * Fetch relay token (ICE server credentials) from Azure Speech Avatar relay endpoint.
 * If SPEECH_KEY/REGION ausentes retorna null (caller decide 503).
 * If network error -> lança exceção.
 */
export async function fetchRelayToken(): Promise<RelayTokenResponse> {
  const key = process.env.SPEECH_KEY; const region = process.env.SPEECH_REGION;
  if(!key || !region) throw new Error('speech_credentials_missing');
  const hostname = `${region}.tts.speech.microsoft.com`;
  const path = '/cognitiveservices/avatar/relay/token/v1';
  logger.debug({ event: 'avatar.relay_fetch_start', hostname });
  return await new Promise((resolve, reject)=>{
    const req = https.request({ hostname, path, method: 'GET', headers: { 'Ocp-Apim-Subscription-Key': key }}, res => {
      const chunks: Buffer[] = [];
      res.on('data', d => chunks.push(d));
      res.on('end', ()=>{
        if(!res.statusCode || res.statusCode<200 || res.statusCode>=300){
          const msg = 'relay_http_'+res.statusCode;
          logger.error({ event: 'avatar.relay_fetch_http_error', status: res.statusCode });
          return reject(new Error(msg));
        }
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as RelayTokenResponse;
          logger.info({ event: 'avatar.relay_fetch_ok', urls: json.Urls?.length || 0 });
          resolve(json);
        } catch(e){
          logger.error({ event: 'avatar.relay_fetch_parse_error', error: (e as Error).message });
          reject(new Error('relay_parse_error'));
        }
      });
    });
    req.on('error', err => { logger.error({ event: 'avatar.relay_fetch_net_error', error: err.message }); reject(err); });
    req.end();
  });
}

/**
 * Initialize avatar session returning a single ICE server (simplificado) ou stub se falha.
 */
export async function initAvatarSession(): Promise<AvatarSessionInit> {
  try {
    const relay = await fetchRelayToken();
    const url = relay.Urls?.[0];
    if(!url) throw new Error('relay_no_urls');
    return { iceServer: { urls: url, username: relay.Username, credential: relay.Password }, mode: 'relay' };
  } catch(e){
    if((e as Error).message === 'speech_credentials_missing') throw e;
    logger.warn({ event: 'avatar.relay_fallback_stub', error: (e as Error).message });
    // Retorna stub para permitir teste do fluxo no front sem travar
    return { iceServer: { urls: 'stun:stub.invalid:3478', username: 'stub', credential: 'stub' }, mode: 'stub' };
  }
}
