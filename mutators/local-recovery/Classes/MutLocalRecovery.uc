// Standalone health recovery; armor and damage calculation remain untouched.
class MutLocalRecovery extends Mutator;
var LocalRecoveryRules Recovery;
function PostBeginPlay()
{
    Super.PostBeginPlay();
    if(Level.NetMode!=NM_Standalone)return;
    Recovery=Spawn(class'LocalRecoveryRules');
    if(Level.Game.GameRulesModifiers==None)Level.Game.GameRulesModifiers=Recovery;
    else Level.Game.GameRulesModifiers.AddGameRules(Recovery);
    Log("MMRECOVERY_READY enabled=1 delay=5 rate=20 standalone=1");
}
function Mutate(string S,PlayerController Sender)
{
    if(Left(Caps(S),10)=="MMRECOVERY" && Recovery!=None)
    {
        S=Caps(Mid(S,11));
        if(S=="ON")Recovery.bEnabled=true;
        if(S=="OFF")Recovery.bEnabled=false;
        Recovery.Report(Sender);return;
    }
    Super.Mutate(S,Sender);
}
defaultproperties
{
 FriendlyName="Local Health Recovery"
 Description="Standalone surviving players recover normal health after five seconds without damage. Armor is unchanged."
 GroupName="LocalRecovery"
}
