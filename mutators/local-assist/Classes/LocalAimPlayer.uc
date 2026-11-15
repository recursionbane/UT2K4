class LocalAimPlayer extends xPlayer;

function NotifyTakeHit(Pawn Attacker,vector HitLocation,int Damage,class<DamageType> DamageType,vector Momentum)
{
    local LocalAimInteraction Assist;
    Super.NotifyTakeHit(Attacker,HitLocation,Damage,DamageType,Momentum);
    Assist=class'LocalAimInteraction'.static.Find(Self);
    if(Assist!=None)Assist.RecordIncoming(Attacker,HitLocation,Damage,Momentum);
}

function rotator AdjustAim(FireProperties FiredAmmunition, vector ProjStart, int AimError)
{
    local LocalAimInteraction Assist;
    local rotator Aim;
    Assist=class'LocalAimInteraction'.static.Find(Self);
    if(Assist!=None && Assist.FireAim(ProjStart,Aim))
    {
        Assist.NoteShot(ProjStart,Aim);
        return Aim;
    }
    Aim=Super.AdjustAim(FiredAmmunition,ProjStart,AimError);
    if(Assist!=None && Assist.CameraAim(ProjStart,Aim,Aim))return Aim;
    return Aim;
}

simulated function rotator GetViewRotation()
{
    local LocalAimInteraction Assist;
    local rotator Aim;
    Assist=class'LocalAimInteraction'.static.Find(Self);
    if(Assist!=None && Pawn!=None && Assist.FireAim(Pawn.Location+Pawn.EyePosition(),Aim))return Aim;
    if(Assist!=None && Pawn!=None && Assist.CameraAim(Pawn.Location+Pawn.EyePosition(),Rotation,Aim))return Aim;
    return Super.GetViewRotation();
}
