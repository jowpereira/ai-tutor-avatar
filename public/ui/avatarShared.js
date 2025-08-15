// Utilidades compartilhadas entre estratégias Avatar (TTS e WebRTC)
export function segmentText(txt){
  const out=[]; let buf='';
  const sentences = txt.split(/(?<=[.!?])\s+/);
  for(const s of sentences){
    if((buf + ' ' + s).trim().length > 400){ if(buf) out.push(buf.trim()); buf = s; } else { buf = (buf? buf+' ':'') + s; }
  }
  if(buf) out.push(buf.trim());
  return out;
}

export function buildSSML(text, voice){
  return `<?xml version='1.0'?><speak version='1.0' xml:lang='pt-BR'><voice name='${voice||'pt-BR-AntonioNeural'}'>${escapeXml(text)}</voice></speak>`;
}

export function escapeXml(t){ return t.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
