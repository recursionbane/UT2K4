// Build a particle-emission surface from the material sections the player sees.
// A cooked mesh keeps its compiled collision tree and original vertex IDs.
static void BuildCompactEmitterTriangles(UStaticMesh* Mesh)
{
    if (!Mesh || Mesh->RawTriangles.Num() || Mesh->InternalVersion < 11)
        return;

    const INT VertexCount = Mesh->VertexStream.Vertices.Num();
    const INT IndexCount = Mesh->IndexBuffer.Indices.Num();
    for (INT SectionIndex = 0; SectionIndex < Mesh->Sections.Num(); ++SectionIndex)
    {
        const FStaticMeshSection& Section = Mesh->Sections(SectionIndex);
        const INT Count = Section.NumPrimitives;
        const INT NeededIndices = Section.IsStrip ? Count + 2 : Count * 3;
        if (Count == 0 || Section.FirstIndex + NeededIndices > IndexCount)
            continue;

        for (INT Face = 0; Face < Count; ++Face)
        {
            const INT Start = Section.FirstIndex + (Section.IsStrip ? Face : Face * 3);
            const INT A = Mesh->IndexBuffer.Indices(Start);
            const INT B = Mesh->IndexBuffer.Indices(Start + 1);
            const INT C = Mesh->IndexBuffer.Indices(Start + 2);
            if (A >= VertexCount || B >= VertexCount || C >= VertexCount ||
                A == B || A == C || B == C)
                continue;
            FStaticMeshTriangle& Triangle = Mesh->RawTriangles(Mesh->RawTriangles.AddZeroed());
            Triangle.Vertices[0] = Mesh->VertexStream.Vertices(A).Position;
            Triangle.Vertices[1] = Mesh->VertexStream.Vertices(B).Position;
            Triangle.Vertices[2] = Mesh->VertexStream.Vertices(C).Position;
            Triangle.MaterialIndex = SectionIndex;
        }
    }
}
