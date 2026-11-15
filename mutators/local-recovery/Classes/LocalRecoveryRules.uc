class LocalRecoveryRules extends GameRules;
struct RecoveryState
{
 var Pawn Body;
 var float LastDamage;
 var float Fraction;
 var int LastHealth;
};
var array<RecoveryState> Players;
var bool bEnabled;
var float Delay,Rate,LastTick;
function PostBeginPlay(){Super.PostBeginPlay();LastTick=Level.TimeSeconds;SetTimer(0.1,true);}
function int Track(Pawn P)
{
 local int i;
 for(i=0;i<Players.Length;i++)if(Players[i].Body==P)return i;
 i=Players.Length;Players.Length=i+1;Players[i].Body=P;
 Players[i].LastDamage=Level.TimeSeconds;Players[i].LastHealth=P.Health;return i;
}
function bool Eligible(Pawn P)
{
 return P!=None && !P.bDeleteMe && P.Health>0 && PlayerController(P.Controller)!=None
   && PlayerController(P.Controller).Player!=None && Level.NetMode==NM_Standalone;
}
function int NetDamage(int OriginalDamage,int Damage,Pawn Injured,Pawn InstigatedBy,vector HitLocation,out vector Momentum,class<DamageType> DamageType)
{
 local int i;
 if(OriginalDamage>0 && Eligible(Injured))
 {
  i=Track(Injured);Players[i].LastDamage=Level.TimeSeconds;Players[i].Fraction=0;
  Log("MMRECOVERY_DAMAGE health=" $ Injured.Health $ " original=" $ OriginalDamage $ " time=" $ Level.TimeSeconds);
 }
 return Super.NetDamage(OriginalDamage,Damage,Injured,InstigatedBy,HitLocation,Momentum,DamageType);
}
function Timer()
{
 local Controller C;
 local Pawn P;
 local int i,Gain,Before;
 local float Now,Dt,Active;
 Now=Level.TimeSeconds;Dt=FClamp(Now-LastTick,0,0.5);
 for(C=Level.ControllerList;C!=None;C=C.NextController)if(Eligible(C.Pawn))Track(C.Pawn);
 for(i=Players.Length-1;i>=0;i--)
 {
  P=Players[i].Body;
  if(!Eligible(P)){Players.Remove(i,1);continue;}
  if(P.Health<Players[i].LastHealth && Players[i].LastDamage<LastTick)
  {Players[i].LastDamage=Now;Players[i].Fraction=0;}
  Active=FMin(Dt,FMax(0,Now-Players[i].LastDamage-Delay));
  if(bEnabled && P.Health<int(P.HealthMax) && Active>0)
  {
   Players[i].Fraction+=Active*Rate;Gain=int(Players[i].Fraction);
   Players[i].Fraction-=Gain;Before=P.Health;P.Health=Min(int(P.HealthMax),P.Health+Gain);
   if(P.Health!=Before)Log("MMRECOVERY_HEAL before=" $ Before $ " health=" $ P.Health $ " cap=" $ int(P.HealthMax) $ " time=" $ Now);
  }
  Players[i].LastHealth=P.Health;
 }
 LastTick=Now;
}
function Report(PlayerController PC)
{
 local int i;
 if(PC==None || !Eligible(PC.Pawn))return;
 i=Track(PC.Pawn);
 Log("MMRECOVERY_STATUS enabled=" $ int(bEnabled) $ " health=" $ PC.Pawn.Health $ " cap=" $ int(PC.Pawn.HealthMax)
  $ " delay=" $ Delay $ " rate=" $ Rate $ " sinceDamage=" $ Level.TimeSeconds-Players[i].LastDamage);
}
defaultproperties
{
 bEnabled=True
 Delay=5
 Rate=20
}
