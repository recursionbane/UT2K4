// Independent compatibility adapter for the original MonkeyMatrixMoves v130b.
// The original mutator must also be enabled. No original source is included.
class MutMatrixModern extends Mutator;

function ModifyLogin(out string Portal, out string Options)
{
    local class<PlayerController> MatrixController;

    MatrixController = class<PlayerController>(DynamicLoadObject(
        "Matrix2004_v130.MatrixPlayer", class'Class'));
    if (MatrixController != None)
    {
        // Modern GameInfo.Login uses a cached class before consulting its name.
        Level.Game.PlayerControllerClass = MatrixController;
        Level.Game.PlayerControllerClassName = "Matrix2004_v130.MatrixPlayer";
        Level.Game.DefaultPlayerClassName = "Matrix2004_v130.MatrixPawn";
        Log("MATRIX_COMPAT_LOGIN: controller=" $ MatrixController
            $ " pawn=" $ Level.Game.DefaultPlayerClassName);
    }
    else
        Warn("MatrixModern requires the original Matrix2004_v130 package");

    Super.ModifyLogin(Portal, Options);
}

function ModifyPlayer(Pawn Other)
{
    if (Other.Controller != None && PlayerController(Other.Controller) != None)
        Log("MATRIX_COMPAT_PLAYER: pawn=" $ Other.Class
            $ " controller=" $ Other.Controller.Class);
    Super.ModifyPlayer(Other);
}

defaultproperties
{
    FriendlyName="Monkey Matrix Moves modern controller compatibility"
    Description="Enable with original MonkeyMatrixMoves 2004 v130b to restore its controller and pawn on modern game data."
    GroupName="MatrixModernCompatibility"
}
