class LocalAimMatrixPlayer extends MatrixPlayer;
var bool bLocalBulletDown, bAutoWallArmed;
var float AutoWallArmUntil;

function MaintainAdrenaline()
{
    if(Level.NetMode==NM_Standalone && Pawn!=None && Pawn.Health>0)
    {
        AdrenalineMax=FMax(100,AdrenalineMax);Adrenaline=AdrenalineMax;
    }
}

function PlayerTick(float DeltaTime)
{
    MaintainAdrenaline();Super.PlayerTick(DeltaTime);MaintainAdrenaline();
}

function LocalTimeToggle()
{
    if(Level.NetMode!=NM_Standalone || Pawn==None)return;
    MaintainAdrenaline();
    if(Activated && xPawn(Pawn).CurrentCombo!=None && xPawn(Pawn).CurrentCombo.IsA('Bullettimecombo'))
        EndCombo(class'Matrix2004_v130.Bullettimecombo');
    else if(!Activated)
        slowtimedown();
}

exec function LocalBulletPress()
{
    local LocalAimInteraction Assist;
    if(bLocalBulletDown)return;
    bLocalBulletDown=true;
    Assist=class'LocalAimInteraction'.static.Find(Self);
    if(Assist==None || Assist.bTimeToggle || !Activated)LocalTimeToggle();
}

exec function LocalBulletRelease()
{
    local LocalAimInteraction Assist;
    if(!bLocalBulletDown)return;
    bLocalBulletDown=false;
    Assist=class'LocalAimInteraction'.static.Find(Self);
    if(Assist!=None && !Assist.bTimeToggle && Activated)LocalTimeToggle();
}

function bool TryWallDirection(MatrixPawn MP,eDoubleClickDir Direction,vector Accel)
{
    local vector X,Y,Z,Dir,Start,HitLocation,HitNormal,Horizontal;
    local rotator YawOnly;
    local Actor Hit;
    YawOnly.Yaw=MP.Rotation.Yaw;GetAxes(YawOnly,X,Y,Z);
    if(Direction==DCLICK_Forward)Dir=X;
    else if(Direction==DCLICK_Back)Dir=-X;
    else if(Direction==DCLICK_Left)Dir=-Y;
    else Dir=Y;
    Start=MP.Location-vect(0,0,1)*MP.CollisionHeight*0.1;
    Hit=MP.Trace(HitLocation,HitNormal,Start+Dir*(MP.CollisionRadius+50),Start,false,vect(1,1,2));
    if(Hit==None || !Hit.bWorldGeometry || Abs(HitNormal.Z)>=0.35)return false;
    Horizontal=Normal(Accel*vect(1,1,0));
    if((Horizontal Dot Normal(HitNormal*vect(1,1,0)))>0.2)return false;
    return MP.DoWallrunStuff(Direction);
}

function bool TryAutoWallrun(vector Accel)
{
    local LocalAimInteraction Assist;
    local MatrixPawn MP;
    local vector X,Y,Z;
    local bool OldEnabled,Result;
    local eDoubleClickDir Direction;
    Assist=class'LocalAimInteraction'.static.Find(Self);MP=MatrixPawn(Pawn);
    if(Assist==None || !Assist.bAutoWallrun || MP==None || bDuck!=0
        || (MP.Physics!=PHYS_Walking && MP.Physics!=PHYS_Falling)
        || VSize(Accel*vect(1,1,0))<1)return false;
    GetAxes(MP.Rotation,X,Y,Z);
    if(Abs(Accel Dot X)>=Abs(Accel Dot Y))
    {if(Accel Dot X>=0)Direction=DCLICK_Forward;else Direction=DCLICK_Back;}
    else
    {if(Accel Dot Y>=0)Direction=DCLICK_Right;else Direction=DCLICK_Left;}
    MP.Acceleration=Accel;
    OldEnabled=MP.bWallrunEnabled;MP.bWallrunEnabled=true;
    Result=TryWallDirection(MP,Direction,Accel);
    if(!Result)Result=TryWallDirection(MP,DCLICK_Left,Accel);
    if(!Result)Result=TryWallDirection(MP,DCLICK_Right,Accel);
    if(!Result)Result=TryWallDirection(MP,DCLICK_Forward,Accel);
    if(!Result)Result=TryWallDirection(MP,DCLICK_Back,Accel);
    MP.bWallrunEnabled=OldEnabled;
    if(Result)Log("MMMATRIX_WALLRUN state=" $ GetStateName() $ " physics=" $ MP.Physics $ " outsideBulletTime=" $ int(!Activated));
    return Result;
}

state PlayerWalking
{
    function bool NotifyLanded(vector HitNormal)
    {
        bAutoWallArmed=false;
        return Super.NotifyLanded(HitNormal);
    }

    function EndState()
    {
        bAutoWallArmed=false;
        Super.EndState();
    }

    function ProcessMove(float DeltaTime,vector NewAccel,eDoubleClickDir DoubleClickMove,rotator DeltaRot)
    {
        local LocalAimInteraction Assist;
        Assist=class'LocalAimInteraction'.static.Find(Self);
        if(Assist==None || !Assist.bAutoWallrun)bAutoWallArmed=false;
        else if(bPressedJump && !bUpdating && Pawn!=None && bDuck==0
            && (Pawn.Physics==PHYS_Walking || Pawn.Physics==PHYS_Falling))
        {
            bAutoWallArmed=true;
            AutoWallArmUntil=Level.TimeSeconds+0.6;
        }
        if(bAutoWallArmed && Level.TimeSeconds>AutoWallArmUntil)bAutoWallArmed=false;
        if(bAutoWallArmed && TryAutoWallrun(NewAccel))
        {bAutoWallArmed=false;bPressedJump=false;return;}
        Super.ProcessMove(DeltaTime,NewAccel,DoubleClickMove,DeltaRot);
    }
}

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
