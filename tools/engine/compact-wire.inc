// Normal gameplay uses the solid draw index buffer. Build diagnostic wire edges
// from its actual material sections only if a wireframe viewport requests them.
static const INT CompactWireRevision=-202609;
static UBOOL ReadCompactWireMarker(FArchive& Ar,FRawIndexBuffer& Wire)
{
    if (!Ar.IsLoading() || !Ar.IsPersistent()) return 0;
    INT Start=Ar.Tell(),Marker=0;Ar << AR_INDEX(Marker);
    if(Marker!=CompactWireRevision){Ar.Seek(Start);return 0;}
    INT End=0;Ar << End;
    if(End<Ar.Tell() || End>Ar.TotalSize())appErrorf(TEXT("Invalid compact wire extent"));
    Wire.Indices.Empty();Wire.Revision=CompactWireRevision;Ar.Seek(End);return 1;
}
void EnsureBrowserWireIndices(UStaticMesh* Mesh)
{
    if(Mesh->WireframeIndexBuffer.Revision!=CompactWireRevision)return;
    TMap<DWORD,BYTE> Seen;
    for(INT I=0;I<Mesh->Sections.Num();I++){
        const FStaticMeshSection& S=Mesh->Sections(I);
        if(!S.NumPrimitives)continue;
        const INT Needed=S.IsStrip?S.NumPrimitives+2:S.NumPrimitives*3;
        if(S.FirstIndex+Needed>Mesh->IndexBuffer.Indices.Num())continue;
        for(INT F=0;F<S.NumPrimitives;F++){
            INT At=S.FirstIndex+(S.IsStrip?F:3*F);
            _WORD V[3]={Mesh->IndexBuffer.Indices(At),Mesh->IndexBuffer.Indices(At+1),Mesh->IndexBuffer.Indices(At+2)};
            if(V[0]==V[1]||V[1]==V[2]||V[2]==V[0])continue;
            for(INT E=0;E<3;E++){
                _WORD A=V[E],B=V[(E+1)%3];
                DWORD Key=((DWORD)Min(A,B)<<16)|Max(A,B);
                if(!Seen.Find(Key)){Seen.Set(Key,1);Mesh->WireframeIndexBuffer.Indices.AddItem(A);Mesh->WireframeIndexBuffer.Indices.AddItem(B);}
            }
        }
    }
    Mesh->WireframeIndexBuffer.Revision=1;
}
