// Standalone menu defaults only. No pawn, renderer, targeting or multiplayer changes.
class MenuProfileBootstrap extends Mutator;

var int Attempts;

function PostBeginPlay()
{
    local int I;
    local string GameClassName;
    Super.PostBeginPlay();
    if (Level.NetMode != NM_Standalone || Level.Game == None || !Level.Game.IsA('CinematicGame'))
    {
        return;
    }
    for (I = 0; I < class'GUI2K4.UT2K4Tab_GameTypeSP'.default.GamePos.Length; I++)
    {
        GameClassName = class'GUI2K4.UT2K4Tab_GameTypeSP'.default.GamePos[I].GameClass;
        if (GameClassName ~= "xGame.xDeathMatch")
            class'GUI2K4.UT2K4Tab_GameTypeSP'.default.GamePos[I].Weight = 0;
        else if (GameClassName ~= "UT2K4Assault.ASGameInfo")
            class'GUI2K4.UT2K4Tab_GameTypeSP'.default.GamePos[I].Weight = 1;
        else if (GameClassName ~= "Onslaught.ONSOnslaughtGame")
            class'GUI2K4.UT2K4Tab_GameTypeSP'.default.GamePos[I].Weight = 2;
    }
    Log("MENU_PROFILE_ORDER_READY standalone=1 game=xGame.xDeathMatch");
    SetTimer(0.05, True);
    Disable('Tick');
}

function Timer()
{
    local PlayerController PC;
    local GUIController Menu;
    Attempts++;
    foreach DynamicActors(class'PlayerController', PC)
    {
        if (PC.Player != None)
        {
            Menu = GUIController(PC.Player.GUIController);
            if (Menu != None)
            {
                Menu.LastGameType = "xGame.xDeathMatch";
                Log("MENU_PROFILE_READY standalone=1 game=xGame.xDeathMatch");
                SetTimer(0.0, False);
                return;
            }
        }
    }
    if (Attempts >= 200)
    {
        SetTimer(0.0, False);
        Log("MENU_PROFILE_UNAVAILABLE localGUI=0");
    }
}

defaultproperties
{
    bHidden=True
    RemoteRole=ROLE_None
}
