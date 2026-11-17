// Compact level instances store an adaptive per-instance RGB palette and the
// native per-vertex alpha. Static illumination has already been baked by the
// editor. Dynamic hardware lights remain eligible in the renderer.
static const INT CompactLightMarker = -202604;
static const INT CompactLightRevision = -202605;
static UBOOL ReadCompactInstanceColors(FArchive& Ar, FRawColorStream& Stream)
{
    if (!Ar.IsLoading() || !Ar.IsPersistent() || Ar.Ver() < 112) return 0;
    const INT Start=Ar.Tell();
    INT Marker=0;
    Ar << AR_INDEX(Marker);
    if (Marker!=CompactLightMarker) { Ar.Seek(Start); return 0; }

    INT Count=0;
    BYTE PaletteCount=0, AlphaMode=0;
    Ar << AR_INDEX(Count) << PaletteCount << AlphaMode;
    if (Count<1 || Count>1000000 || PaletteCount<1 || PaletteCount>16 || AlphaMode>1)
        appErrorf(TEXT("Invalid compact instance color shape"));
    FColor Palette[16];
    for (INT I=0; I<PaletteCount; ++I) {
        Ar << Palette[I].B << Palette[I].G << Palette[I].R;
        Palette[I].A=255;
    }
    BYTE ConstantAlpha=255;
    if (AlphaMode==0) Ar << ConstantAlpha;
    const INT Bits=PaletteCount==1?0:PaletteCount<=2?1:PaletteCount<=4?2:4;
    const INT Mask=(1<<Bits)-1;
    Stream.Colors.Empty(Count);
    Stream.Colors.Add(Count);
    BYTE Packed=0;
    for (INT I=0; I<Count; ++I) {
        const INT Shift=(I*Bits)&7;
        if (Bits && Shift==0) Ar << Packed;
        const INT Index=(Packed>>Shift)&Mask;
        if (Index>=PaletteCount) appErrorf(TEXT("Invalid compact instance color index"));
        Stream.Colors(I)=Palette[Index];
        Stream.Colors(I).A=ConstantAlpha;
    }
    if (AlphaMode==1) {
        for (INT I=0; I<Count; ++I) Ar << Stream.Colors(I).A;
    }
    Stream.Revision=CompactLightRevision;
    return 1;
}
