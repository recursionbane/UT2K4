"""Add optional native streaming Ogg Opus support to a supplied UT2004 WASM tree."""
import argparse
import re
from pathlib import Path
from shutil import copyfile

p=argparse.ArgumentParser(description=__doc__)
for name in ('engine','opus','opusfile','ogg'):
    p.add_argument(name,type=Path)
a=p.parse_args()
root=(a.engine/'Source/ALAudio').resolve()
build=root/'CompactMusic'
build.mkdir(exist_ok=True)
def transform(file, marker, edits):
    s=file.read_text()
    if marker in s:return
    for old,new in edits:
        if s.count(old)!=1:raise ValueError('Unrecognized source in '+str(file)+': '+old[:60])
        s=s.replace(old,new)
    file.write_text(s)

copyfile(Path(__file__).with_name('compact-opus-stream.c'),build/'compact-opus-stream.c')
header=root/'Inc/ALAudioStream.h'
pattern='OggVorbis_File*\t\tVorbisFile;'
transform(header, 'void* CompactOpus;',[(pattern,pattern+'\n    void* CompactOpus;')])
cpp=root/'Src/ALAudioStream.cpp'
declarations='''
extern "C" {
int compact_is_opus(FILE*);
void* compact_open_opus(FILE*,int*,double*);
void compact_close_opus(void*);
int compact_read_opus(void*,char*,int);
int compact_seek_opus(void*,double);
}
'''
transform(cpp,'compact_is_opus(FILE*);',[
 ('FALAudioStreamOgg::FALAudioStreamOgg( FALAudioStream*',declarations+'\nFALAudioStreamOgg::FALAudioStreamOgg( FALAudioStream*'),
 ('\n\tVorbisFile = NULL;\n}', '\n    CompactOpus = NULL;\n\tVorbisFile = NULL;\n}'),
 ('FALAudioStreamOgg::~FALAudioStreamOgg()\n{','FALAudioStreamOgg::~FALAudioStreamOgg()\n{\n    compact_close_opus(CompactOpus);'),
 ('\tVorbisFile = new OggVorbis_File;', '''    if (compact_is_opus(FileHandle))
    {
        double seconds = 0;
        CompactOpus = compact_open_opus(FileHandle, &Rate, &seconds);
        if (!CompactOpus) return 0;
        Duration = seconds;
        Format = AL_FORMAT_MONO16;
        ChunkSize = MAX_STREAM_CHUNKSIZE;
        debugf(TEXT("Compact music: native Opus stream, %i Hz"), Rate);
        return 1;
    }
    VorbisFile = new OggVorbis_File;'''),
 ('long Read = ov_read(', 'long Read = CompactOpus ? compact_read_opus(CompactOpus, Data + Count, Bytes - Count) : ov_read('),
 ('ov_time_seek( VorbisFile, 0.0 );','if (CompactOpus) { if (compact_seek_opus(CompactOpus, 0.0) != 0) { memset(Data+Count,0,Bytes-Count); EndOfFile=1; return 0; } }\n                else ov_time_seek( VorbisFile, 0.0 );'),
 ('return ov_time_seek( VorbisFile, Seconds ) == 0;','return CompactOpus ? compact_seek_opus(CompactOpus, Seconds)==0 : ov_time_seek( VorbisFile, Seconds ) == 0;')
])

# Isolate contemporary libogg symbols from the native engine's older Vorbis ABI.
api=(a.ogg/'include/ogg/ogg.h').read_text()
names=sorted(set(re.findall(r'\b(ogg(?:packB?|_)[A-Za-z0-9_]+)\s*\(',api)))
if 'ogg_sync_init' not in names or 'ogg_stream_init' not in names:raise ValueError('Unrecognized Ogg header')
prefix='\n'.join('#define '+name+' compact_'+name for name in names)
(build/'compact-ogg-prefix.h').write_text(prefix+'\n')
(build/'ogg').mkdir(exist_ok=True)
(build/'ogg/config_types.h').write_text('#include <stdint.h>\ntypedef int16_t ogg_int16_t;typedef uint16_t ogg_uint16_t;typedef int32_t ogg_int32_t;typedef uint32_t ogg_uint32_t;typedef int64_t ogg_int64_t;typedef uint64_t ogg_uint64_t;\n')
for d in [a.opus,a.opusfile,a.ogg]:
    if not d.resolve().is_dir():raise ValueError('Dependency directory absent')
cmake=f'''
set(OPUS_BUILD_PROGRAMS OFF CACHE BOOL "" FORCE)
set(OPUS_BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(OPUS_INSTALL_PKG_CONFIG_MODULE OFF CACHE BOOL "" FORCE)
add_subdirectory("{a.opus.resolve()}" compact-opus-build EXCLUDE_FROM_ALL)
add_library(CompactOpusReader STATIC
    "{a.ogg.resolve()}/src/bitwise.c" "{a.ogg.resolve()}/src/framing.c"
    "{a.opusfile.resolve()}/src/info.c" "{a.opusfile.resolve()}/src/internal.c"
    "{a.opusfile.resolve()}/src/opusfile.c" "{a.opusfile.resolve()}/src/stream.c"
    compact-opus-stream.c)
target_include_directories(CompactOpusReader PRIVATE
    "{a.opusfile.resolve()}/include" "{a.opus.resolve()}/include"
    "{a.ogg.resolve()}/include" "${{CMAKE_CURRENT_SOURCE_DIR}}")
target_compile_options(CompactOpusReader PRIVATE -include "${{CMAKE_CURRENT_SOURCE_DIR}}/compact-ogg-prefix.h")
target_compile_definitions(CompactOpusReader PRIVATE OP_DISABLE_HTTP=1)
target_link_libraries(CompactOpusReader PUBLIC opus)
'''
(build/'CMakeLists.txt').write_text(cmake)
cm=root/'CMakeLists.txt'
text=cm.read_text()
if 'add_subdirectory(CompactMusic)' not in text:cm.write_text(text+'\nadd_subdirectory(CompactMusic)\ntarget_link_libraries(${PROJECT_NAME} PRIVATE CompactOpusReader)\n')
