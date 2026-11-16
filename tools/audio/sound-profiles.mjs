// Browser compact policy. This changes encoding bitrate, never native volume.
export const COMPACT_SOUND_PROFILE='opus-browser-compact-class-duration-v2';
export function compactSoundBitrate(logical,sound){
 const label=(logical+' '+sound.soundName).toLowerCase(),duration=sound.frames/sound.sampleRate;
 if(/music|soundtrack|intro[_-]?track/.test(label))return 48000;
 if(/menu|interface|pickup|confirm|deny|alarm|warning|targetacquir/.test(label)||duration<.15)return 48000;
 if(/voice|announc|taunt|dialog|speech|radio|talk/.test(label))return duration>3?16000:20000;
 if(/weapon|gun|shot|fire|bullet|rocket|reload|hit|impact|footstep|jump|land/.test(label))return 32000;
 if(duration>3||/ambien|wind|water|engine|motor|steam|hum|loop/.test(label))return 20000;
 return sound.sampleRate<=11025?16000:24000;
}
