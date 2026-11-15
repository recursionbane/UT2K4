class MutLocalAim extends Mutator;
var LocalAimInteraction LocalAssist;

function PostBeginPlay()
{
    Super.PostBeginPlay();
    if(Level.NetMode==NM_Standalone)SetTimer(0.2,true);
}

function ModifyLogin(out string Portal,out string Options)
{
    Super.ModifyLogin(Portal,Options);
    if(Level.NetMode!=NM_Standalone)return;
    if(InStr(Caps(string(Level.Game.PlayerControllerClass)),"MATRIX")>=0
        || InStr(Caps(Level.Game.PlayerControllerClassName),"MATRIX")>=0)
    {
        Level.Game.PlayerControllerClass=class'LocalAimMatrixPlayer';
        Level.Game.PlayerControllerClassName="LocalAim.LocalAimMatrixPlayer";
    }
    else
    {
        Level.Game.PlayerControllerClass=class'LocalAimPlayer';
        Level.Game.PlayerControllerClassName="LocalAim.LocalAimPlayer";
    }
    Log("MMAIM_CONTROLLER class=" $ Level.Game.PlayerControllerClass);
}

function LocalAimInteraction Ensure(PlayerController PC)
{
    local LocalAimInteraction Found;
    if(Level.NetMode!=NM_Standalone || PC==None || PC.Player==None || PC.Player.InteractionMaster==None)return None;
    Found=class'LocalAimInteraction'.static.Find(PC);
    if(Found!=None)return Found;
    Found=LocalAimInteraction(PC.Player.InteractionMaster.AddInteraction("LocalAim.LocalAimInteraction",PC.Player));
    if(Found!=None)
    {
        LocalAssist=Found;
        if(LocalAimMatrixPlayer(PC)!=None)
        {
            PC.ConsoleCommand("set input Y LocalBulletPress|OnRelease LocalBulletRelease");
        }
        else
        {
            Found.bThirdPerson=false;
            Found.bAutoWallrun=false;
        }
        Log("MMAIM_READY standalone=1 auto=" $ int(Found.bAutoAim) $ " manual=0 guiActive=" $ int(Found.NativeGUIActive(PC)) $ " thirdperson=" $ int(Found.bThirdPerson)
            $ " wallrun=" $ int(Found.bAutoWallrun) $ " timeToggle=" $ int(Found.bTimeToggle) $ " timeNative=" $ int(LocalAimMatrixPlayer(PC)!=None));
    }
    return Found;
}

function Timer()
{
    local Controller C;
    if(Level.NetMode!=NM_Standalone)return;
    for(C=Level.ControllerList;C!=None;C=C.NextController)
        if(PlayerController(C)!=None)Ensure(PlayerController(C));
}

function ModifyPlayer(Pawn Other)
{
    Super.ModifyPlayer(Other);
    if(PlayerController(Other.Controller)!=None)Ensure(PlayerController(Other.Controller));
}

function Mutate(string Text,PlayerController Sender)
{
    local string Prefix,Rest,Command,Args,XText,YText;
    local LocalAimInteraction Assist;
    local float X,Y;
    local LocalAimMatrixPlayer MP;
    if(!Divide(Text," ",Prefix,Rest)){Prefix=Text;Rest="";}
    if(Caps(Prefix)!="MMAIM" && Caps(Prefix)!="MMMATRIX"){Super.Mutate(Text,Sender);return;}
    if(Level.NetMode!=NM_Standalone){Log("MMAIM_DISABLED reason=network-game");return;}
    Assist=Ensure(Sender);
    if(Assist==None){Log("MMAIM_WAIT reason=no-local-interaction");return;}
    if(!Divide(Rest," ",Command,Args)){Command=Rest;Args="";}
    if(Caps(Prefix)=="MMMATRIX")
    {
        MP=LocalAimMatrixPlayer(Sender);
        if(Caps(Command)=="CAMERA")
        {
            if(Caps(Args)=="ON")Assist.SetCamera(true);
            else if(Caps(Args)=="OFF")Assist.SetCamera(false);
            else if(Caps(Args)=="TOGGLE")Assist.SetCamera(!Assist.bThirdPerson);
        }
        else if(Caps(Command)=="WALLRUN")
        {
            if(Caps(Args)=="ON")Assist.bAutoWallrun=true;
            else if(Caps(Args)=="OFF")Assist.bAutoWallrun=false;
            Assist.Status();
        }
        else if(Caps(Command)=="TIME" && MP!=None)
        {
            if(Caps(Args)=="TOGGLE")MP.LocalTimeToggle();
            else if(Caps(Args)=="PRESS")MP.LocalBulletPress();
            else if(Caps(Args)=="RELEASE")MP.LocalBulletRelease();
            else if(Caps(Args)=="MODE TOGGLE")Assist.bTimeToggle=true;
            else if(Caps(Args)=="MODE HOLD")Assist.bTimeToggle=false;
            Assist.Status();
        }
        else Assist.Status();
        return;
    }
    if(Caps(Command)=="AUTO")
    {
        if(Caps(Args)=="ON")Assist.SetAutomatic(true);
        else if(Caps(Args)=="OFF")Assist.SetAutomatic(false);
        else {Assist.LastReason="invalid-auto";Assist.Status();}
    }
    else if(Caps(Command)=="CLEAR")Assist.ClearSelected();
    else if(Caps(Command)=="SELECT")
    {
        if(!Divide(Args," ",XText,YText)){Assist.LastReason="invalid-coordinates";Assist.Status();return;}
        X=float(XText);Y=float(YText);
        if(X<0 || X>1 || Y<0 || Y>1){Assist.LastReason="invalid-coordinates";Assist.Status();return;}
        Assist.SelectNormalized(X,Y);
    }
    else Assist.Status();
}

defaultproperties
{
    FriendlyName="Local single-player aim assist"
    Description="Offline aim assistance with independent gun direction and visible-target selection."
    GroupName="LocalAimAssist"
}
