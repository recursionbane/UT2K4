import {createRegionCache} from './region-cache.mjs';
import {createPhaseBundleReader} from './phase-bundles.mjs';
/** Load each codec only when the engine actually touches its encoded payload. */
export function createCodecReconstructor({baseURL,fetcher=fetch,onEvent=()=>{},maxBytes=32*1024*1024,decodeZstd}={}) {
  let audio,basis,nativeMip,terrainPrediction;
  const opus=async(encoded,params,region)=>{
    audio??=import('./audio-opus.mjs');const m=await audio;
    if(!await m.opusSupported()){const e=Error('Opus is unavailable in this worker');e.code='UNSUPPORTED_REGION_CODEC';throw e;}
    return m.decodeAudioRegion(region,encoded);
  };
  const getBasis=async()=>{
    basis??=(async()=>{const [{createBasisTextureDecoder},{default:factory}]=await Promise.all([import('./basis-texture.mjs'),import('./codecs/basis/basis-transcoder.mjs')]);return createBasisTextureDecoder({moduleFactory:factory,wasmURL:new URL('./codecs/basis/basis_transcoder.wasm',import.meta.url).href});})();
    return basis;
  };
  const texture=async(encoded,params,region)=>(await getBasis())(region,encoded);
  texture.decodeRange=async(encoded,params,region,offset,length)=>(await getBasis()).decodeRange(region,encoded,offset,length);
  const getNativeMip=()=>nativeMip??=import('./native-mip.mjs').then(m=>m.createNativeMipDecoder({decodeZstd}));
  const native=async(encoded,params,region)=>(await getNativeMip())(region,encoded);
  native.decodeRange=async(encoded,params,region,offset,length)=>(await getNativeMip()).decodeRange(region,encoded,offset,length);
  const getTerrainPrediction=()=>terrainPrediction??=import('./terrain-predict.mjs').then(m=>m.createTerrainPredictionDecoder({decodeZstd}));
  const terrain=async(encoded,params,region)=>(await getTerrainPrediction())(region,encoded);
  terrain.decodeRange=async(encoded,params,region,offset,length)=>(await getTerrainPrediction()).decodeRange(region,encoded,offset,length);
  const readEncoded=createPhaseBundleReader({baseURL,fetcher});
  const cache=createRegionCache({baseURL,fetcher,readEncoded,onEvent,maxBytes,decoders:{'opus-pcm-v1':opus,'basis-bc1':texture,'basis-bc2':texture,'basis-bc3':texture,'basis-bgra8':texture,'native-mip-zstd':native,'terrain-grid-residual-zstd':terrain}});
  const reconstruct=args=>cache.overlay(args);reconstruct.cache=cache;return reconstruct;
}
