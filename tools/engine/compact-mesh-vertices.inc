// This function is called after the native mesh header, before the vertex
// stream revision. The cooker retains the absolute start of the revision.
static UBOOL ReadCompactMeshVertices(FArchive& Ar,FStaticMeshVertexStream& Stream)
{
    if (!Ar.IsLoading() || !Ar.IsPersistent() || Ar.Ver()<112) return 0;
    INT Start=Ar.Tell(), Marker=0;
    Ar << AR_INDEX(Marker);
    if (Marker!=-202607) { Ar.Seek(Start);return 0; }
    INT End=0,Count=0;
    Ar << End << AR_INDEX(Count);
    if (Count<1 || Count>65536 || End<Ar.Tell() || End>Ar.TotalSize())
        appErrorf(TEXT("Invalid compact mesh extent"));
    Stream.Vertices.Empty(Count);
    Stream.Vertices.Add(Count);
    for (INT Axis=0;Axis<3;++Axis)
    {
        INT Unique=0;
        Ar << AR_INDEX(Unique);
        if (Unique<1 || Unique>Count) appErrorf(TEXT("Invalid mesh coordinate dictionary"));
        TArray<BYTE> Planes;
        Planes.Add(Unique*4);Ar.Serialize(&Planes(0),Unique*4);
        TArray<DWORD> Words;Words.Add(Unique);
        DWORD Previous=0;
        for (INT I=0;I<Unique;++I)
        {
            DWORD Delta=0;
            for(INT C=0;C<4;++C) Delta|=((DWORD)Planes(C*Unique+I))<<(C*8);
            Words(I)=Previous+Delta;Previous=Words(I);
        }
        INT Bits=0;while((1<<Bits)<Unique)++Bits;
        const DWORD Mask=(1u<<Bits)-1;
        const INT RefBytes=(Bits*Count+7)/8;
        TArray<BYTE> Refs;
        if(RefBytes){Refs.Add(RefBytes);Ar.Serialize(&Refs(0),RefBytes);}
        DWORD Acc=0;INT Have=0,At=0;
        for(INT I=0;I<Count;++I)
        {
            while(Have<Bits){Acc|=((DWORD)Refs(At++))<<Have;Have+=8;}
            const INT Index=Acc&Mask;Acc>>=Bits;Have-=Bits;
            if(Index>=Unique)appErrorf(TEXT("Invalid mesh position reference"));
            FLOAT Value;appMemcpy(&Value,&Words(Index),4);
            if(Axis==0)Stream.Vertices(I).Position.X=Value;
            if(Axis==1)Stream.Vertices(I).Position.Y=Value;
            if(Axis==2)Stream.Vertices(I).Position.Z=Value;
        }
    }
    TArray<BYTE> Normals;Normals.Add(Count*3);Ar.Serialize(&Normals(0),Count*3);
    for(INT I=0;I<Count;++I){
        const INT X=Normals(I),Y=Normals(Count+I),Z=Normals(2*Count+I);
        Stream.Vertices(I).Normal=FVector((X<128?X:X-256)/127.f,(Y<128?Y:Y-256)/127.f,(Z<128?Z:Z-256)/127.f);
    }
    if(Ar.Tell()>End)appErrorf(TEXT("Invalid compact mesh padding"));
    Ar.Seek(End);
    Ar << Stream.Revision;
    return 1;
}
