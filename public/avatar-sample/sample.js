/* Adapted minimal sample to reproduce Azure basic avatar flow with our TCP logic */
let peerConnection; let avatarSynthesizer; let useTcpForWebRTC = true; let previousAnimationFrameTimestamp=0;
const log = (m)=>{ const el=document.getElementById('logging'); el.innerHTML += `[${new Date().toISOString()}] ${m}<br>`; el.scrollTop=el.scrollHeight; };

function transformIceUrl(url){ if(!useTcpForWebRTC) return url; try { const has3478=url.includes(':3478'); let base=url; let query=''; const qi=url.indexOf('?'); if(qi>=0){ base=url.slice(0,qi); query=url.slice(qi+1); }
  if(has3478) base=base.replace(':3478',':443'); else if(!/:[0-9]+$/.test(base)) base += ':443';
  if(!/transport=tcp/i.test(query)){ query = query ? query + '&transport=tcp' : 'transport=tcp'; }
  return query? `${base}?${query}`: base; } catch{ return url; } }

function setupWebRTC(iceServer){ const urls=[ transformIceUrl(iceServer.urls) ]; peerConnection = new RTCPeerConnection({ iceServers:[{ urls, username: iceServer.username, credential: iceServer.credential }], iceTransportPolicy: useTcpForWebRTC? 'relay':'all' });
  peerConnection.ontrack = (event)=>{ const remoteDiv=document.getElementById('remoteVideo'); // remove old same-kind
    [...remoteDiv.childNodes].forEach(n=>{ if(n.localName===event.track.kind) remoteDiv.removeChild(n); });
    const mediaEl=document.createElement(event.track.kind); mediaEl.id=event.track.kind; mediaEl.srcObject=event.streams[0]; mediaEl.autoplay=false; if(event.track.kind==='video') mediaEl.playsInline=true; mediaEl.addEventListener('loadeddata',()=> mediaEl.play()); remoteDiv.appendChild(mediaEl);
  };
  peerConnection.addEventListener('datachannel', ev=>{ const dc=ev.channel; dc.onmessage = e => { try { const payload=JSON.parse(e.data); if(payload.event?.eventType==='EVENT_TYPE_TURN_START' && document.getElementById('showSubtitles').checked){ document.getElementById('subtitles').innerHTML=document.getElementById('spokenText').value; } if(payload.event?.eventType==='EVENT_TYPE_SESSION_END'){ document.getElementById('subtitles').innerHTML=''; } } catch{} }; });
  peerConnection.createDataChannel('eventChannel');
  peerConnection.oniceconnectionstatechange = ()=>{ log('WebRTC status: '+peerConnection.iceConnectionState); if(peerConnection.iceConnectionState==='connected'){ document.getElementById('stopSession').disabled=false; document.getElementById('speak').disabled=false; }
    if(['disconnected','failed'].includes(peerConnection.iceConnectionState)){ document.getElementById('speak').disabled=true; document.getElementById('stopSpeaking').disabled=true; document.getElementById('stopSession').disabled=true; document.getElementById('startSession').disabled=false; }
  };
}

function buildSpeechConfig(region,key,privateEndpoint){ if(privateEndpoint){ const endpoint = `wss://${privateEndpoint.replace(/^https?:\/\//,'').replace(/\/+$/,'')}/tts/cognitiveservices/websocket/v1?enableTalkingAvatar=true`; const cfg = SpeechSDK.SpeechConfig.fromEndpoint(new URL(endpoint), key); return cfg; } return SpeechSDK.SpeechConfig.fromSubscription(key, region); }

function startSession(){ const region=document.getElementById('region').value.trim(); const key=document.getElementById('APIKey').value.trim(); if(!key){ alert('Informe API Key'); return; }
  const privEnabled=document.getElementById('enablePrivateEndpoint').checked; const privVal=document.getElementById('privateEndpoint').value.trim(); if(privEnabled && !privVal){ alert('Informe endpoint private'); return; }
  const privHost = privEnabled? privVal.slice(8): null; const voice=document.getElementById('ttsVoice').value.trim(); const character=document.getElementById('talkingAvatarCharacter').value.trim(); const style=document.getElementById('talkingAvatarStyle').value.trim(); const bgColor=document.getElementById('backgroundColor').value.trim(); const bgImage=document.getElementById('backgroundImageUrl').value.trim(); useTcpForWebRTC = document.getElementById('tcpMode').checked;
  document.getElementById('startSession').disabled=true;
  // Relay token fetch replicating azure sample (requires direct key; debugging only!)
  const xhr = new XMLHttpRequest(); const relayUrl = privEnabled? `https://${privHost}/tts/cognitiveservices/avatar/relay/token/v1` : `https://${region}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1`;
  xhr.open('GET', relayUrl); xhr.setRequestHeader('Ocp-Apim-Subscription-Key', key); xhr.onreadystatechange = function(){ if(this.readyState===4){ try { const data=JSON.parse(this.responseText); const iceServer={ urls: data.Urls[0], username: data.Username, credential: data.Password }; log('Relay token ok');
        const speechCfg = buildSpeechConfig(region,key, privEnabled? privHost:null); speechCfg.speechSynthesisVoiceName = voice;
        const videoFormat = new SpeechSDK.AvatarVideoFormat(); const avatarCfg = new SpeechSDK.AvatarConfig(character, style, videoFormat); avatarCfg.backgroundColor=bgColor; avatarCfg.backgroundImage=bgImage; avatarCfg.remoteIceServers=[{ urls: iceServer.urls, username: iceServer.username, credential: iceServer.credential }];
        avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(speechCfg, avatarCfg); avatarSynthesizer.avatarEventReceived = (s,e)=>{ log('Event received: '+ e.description); };
        setupWebRTC(iceServer); avatarSynthesizer.startAvatarAsync(peerConnection).then(r=>{ if(r.reason===SpeechSDK.ResultReason.SynthesizingAudioCompleted){ log('Avatar started'); } else { log('Start avatar result: '+r.reason); } document.getElementById('speak').disabled=false; document.getElementById('stopSession').disabled=false; }).catch(err=>{ log('Avatar start error '+err); document.getElementById('startSession').disabled=false; });
      } catch(e){ log('Relay parse error '+e); document.getElementById('startSession').disabled=false; } } };
  xhr.onerror = () => { log('Relay network error'); document.getElementById('startSession').disabled=false; };
  xhr.send();
}

function speak(){ document.getElementById('speak').disabled=true; document.getElementById('stopSpeaking').disabled=false; document.getElementById('audio')?.remove(); const audio=document.createElement('audio'); audio.id='audio'; audio.autoplay=true; audio.muted=false; document.body.appendChild(audio); const text=document.getElementById('spokenText').value; const voice=document.getElementById('ttsVoice').value; const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='pt-BR'><voice name='${voice}'><mstts:leadingsilence-exact value='0'/>${text}</voice></speak>`; avatarSynthesizer.speakSsmlAsync(ssml).then(result=>{ document.getElementById('speak').disabled=false; document.getElementById('stopSpeaking').disabled=true; log('Speak completed '+result.reason); }).catch(e=>{ log('Speak error '+e); document.getElementById('speak').disabled=false; document.getElementById('stopSpeaking').disabled=true; }); }

function stopSpeaking(){ document.getElementById('stopSpeaking').disabled=true; try { avatarSynthesizer.stopSpeakingAsync(); } catch{} }
function stopSession(){ try { avatarSynthesizer.close(); } catch{} try { peerConnection.close(); } catch{} document.getElementById('startSession').disabled=false; document.getElementById('speak').disabled=true; document.getElementById('stopSpeaking').disabled=true; document.getElementById('stopSession').disabled=true; }

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('enablePrivateEndpoint').addEventListener('change',()=>{ document.getElementById('privateEndpointBox').hidden = !document.getElementById('enablePrivateEndpoint').checked; });
  document.getElementById('startSession').addEventListener('click', startSession);
  document.getElementById('speak').addEventListener('click', speak);
  document.getElementById('stopSpeaking').addEventListener('click', stopSpeaking);
  document.getElementById('stopSession').addEventListener('click', stopSession);
});
