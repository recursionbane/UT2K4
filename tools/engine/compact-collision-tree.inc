// Reconstruct the original bounding boxes, retaining both the native triangles
// and child/leaf IDs. The cooker stores exact exceptions for float differences.
static UBOOL ReadCompactCollisionTree(FArchive& Ar,UStaticMesh* Mesh)
{
    if(!Ar.IsPersistent() || !Ar.IsLoading()) return 0;
    INT Start=Ar.Tell(),Marker=0;Ar << AR_INDEX(Marker);
    if(Marker!=-202608){Ar.Seek(Start);return 0;}
    INT End=0,Count=0;Ar << End << AR_INDEX(Count);
    if(Count<2 || Count>65535 || End<=Ar.Tell() || End>Ar.TotalSize())appErrorf(TEXT("Invalid packed collision tree"));
    FkDOPTree& Tree=Mesh->kDOPTree;Tree.Nodes.Empty(Count);Tree.Nodes.AddZeroed(Count);
    for(INT I=0;I<Count;++I){
        BYTE Leaf=0;FkDOPNode& N=Tree.Nodes(I);Ar << Leaf << N.n.LeftNode << N.n.RightNode;
        if(Leaf>1)appErrorf(TEXT("Invalid compact tree node"));N.bIsLeaf=Leaf;
    }
    Ar << Tree.Triangles;
    for(INT I=Count-1;I>=0;--I){
        FkDOPNode& N=Tree.Nodes(I);FLOAT Bounds[6]={1.0e30f,1.0e30f,1.0e30f,-1.0e30f,-1.0e30f,-1.0e30f};
        if(N.bIsLeaf){
            const INT Last=N.t.StartIndex+N.t.NumTriangles;
            if(!N.t.NumTriangles || Last>Tree.Triangles.Num())appErrorf(TEXT("Invalid compact leaf"));
            for(INT T=N.t.StartIndex;T<Last;++T){
                const FkDOPCollisionTriangle& Tri=Tree.Triangles(T);INT V[3]={Tri.v1,Tri.v2,Tri.v3};
                for(INT J=0;J<3;++J){if(V[J]>=Mesh->VertexStream.Vertices.Num())appErrorf(TEXT("Invalid compact triangle"));
                    const FVector& P=Mesh->VertexStream.Vertices(V[J]).Position;FLOAT X[3]={P.X,P.Y,P.Z};
                    for(INT K=0;K<3;++K){if(X[K]<Bounds[K])Bounds[K]=X[K];if(X[K]>Bounds[K+3])Bounds[K+3]=X[K];}
                }
            }
        }else{
            if(N.n.LeftNode<=I||N.n.RightNode<=I||N.n.LeftNode>=Count||N.n.RightNode>=Count)appErrorf(TEXT("Invalid compact child"));
            FkDOP& A=Tree.Nodes(N.n.LeftNode).BoundingVolume;FkDOP& B=Tree.Nodes(N.n.RightNode).BoundingVolume;
            for(INT K=0;K<3;++K){Bounds[K]=Min(A.Min[K],B.Min[K]);Bounds[K+3]=Max(A.Max[K],B.Max[K]);}
        }
        BYTE Mask=0;Ar << Mask;if(Mask>63)appErrorf(TEXT("Invalid compact bounds mask"));
        for(INT K=0;K<6;++K){if(Mask&(1<<K))Ar << Bounds[K];if(K<3)N.BoundingVolume.Min[K]=Bounds[K];else N.BoundingVolume.Max[K-3]=Bounds[K];}
    }
    if(Ar.Tell()>End)appErrorf(TEXT("Invalid compact collision extent"));
    Ar.Seek(End);return 1;
}
