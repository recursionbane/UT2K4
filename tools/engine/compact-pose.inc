// Decode compact rotations only for the explicit compact track marker. Position
// keys and times go through the shipping native serializers.
static FArchive& ReadCompactPose(FArchive& Ar, AnalogTrack& Track)
{
    INT End=0,Count=0;
    Ar << End << Track.Flags << AR_INDEX(Count);
    if(Count<1 || Count>65535 || End<=Ar.Tell() || End>Ar.TotalSize())
        appErrorf(TEXT("Invalid compact pose extent"));
    TArray<DWORD> Codes;Codes.Add(Count);Ar.Serialize(&Codes(0),4*Count);
    TArray<BYTE> Signs;const INT N=(Count+7)/8;Signs.Add(N);Ar.Serialize(&Signs(0),N);
    Track.KeyQuat.Empty(Count);Track.KeyQuat.Add(Count);
    for(INT I=0;I<Count;++I)
    {
        DWORD Word=Codes(I);INT Large=Word&3;Word>>=2;FLOAT Q[4],Sum=0.f;
        for(INT C=0;C<4;++C)if(C!=Large){
            INT Value=Word&1023;Word>>=10;if(Value>=512) Value-=1024;
            Q[C]=Value*(1.f/(511.f*1.4142135623730951f));Sum+=Q[C]*Q[C];
        }
        Q[Large]=appSqrt(Max(0.f,1.f-Sum));
        FLOAT Sign=(Signs(I>>3)&(1<<(I&7)))?-1.f:1.f;
        Track.KeyQuat(I)=FQuat(Sign*Q[0],Sign*Q[1],Sign*Q[2],Sign*Q[3]);
    }
    Ar << Track.KeyPos << Track.KeyTime;
    if(Ar.Tell()>End || Track.KeyTime.Num()!=Count ||
        (Track.KeyPos.Num()!=1 && Track.KeyPos.Num()!=Count))
        appErrorf(TEXT("Invalid compact pose timeline"));
    Ar.Seek(End);return Ar;
}
