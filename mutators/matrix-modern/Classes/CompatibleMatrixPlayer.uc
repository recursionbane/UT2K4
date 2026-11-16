// Authored lifecycle repair; original Matrix movement/tick implementations remain inherited.
class CompatibleMatrixPlayer extends Matrix2004_v130.MatrixPlayer;

simulated event PreBeginPlay()
{
    local OnionSkinManager Manager;
    Super.PreBeginPlay();

    // AllActors is scoped to this level; never retain a manager from a retired world.
    myOSM=None;
    foreach AllActors(class'Matrix2004_v130.OnionSkinManager',Manager)
    {
        if(Manager.Level==Level && !Manager.bDeleteMe)
        {
            myOSM=Manager;
            break;
        }
    }
    if(myOSM==None)
        myOSM=Spawn(class'Matrix2004_v130.OnionSkinManager',Self);

    if(myOSM!=None)
        Log("MATRIX_COMPAT_OSM level=" $ Level $ " manager=" $ myOSM);
    else
        Warn("Matrix compatibility could not create the current-level onion manager");
}
