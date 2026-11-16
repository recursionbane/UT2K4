class LocalAimInteraction extends Interaction config(LocalAim);

struct TargetFrame
{
    var Pawn Target;
    var vector Screen;
    var vector Center;
    var float HalfWidth, HalfHeight;
};
var config bool bAutoAim, bMarkTarget, bThirdPerson, bAutoWallrun, bTimeToggle;
var bool bSavedCrosshair, bComputingAim, bRenderedView, bTemporaryThirdPerson;
var Pawn RenderPawn;
var bool bStageRendered;
var string StageRenderLevelName;
var float StageRenderTime;
var vector RenderPawnLocation;
var rotator RenderControlRotation;
struct IncomingHit
{
    var vector Source;
    var float Expires;
    var bool Known;
};
var array<IncomingHit> IncomingHits;
var Pawn CurrentTarget, ManualTarget, LastPawn;
var bool bAimSnapshot, AimSnapshotBehind;
var Pawn AimSnapshotPawn, AimSnapshotTarget;
var vector AimSnapshotPoint, AimSnapshotEyeOffset, AimSnapshotPawnLocation, AimSnapshotCameraLocation;
var rotator AimSnapshotCameraRotation, AimSnapshotControlRotation;
var float AimSnapshotTime;
var HUD SavedHUD;
var bool OriginalCrosshair;
var float Width, Height, FrameTime;
var vector CameraLocation;
var rotator CameraRotation;
var array<TargetFrame> FrameTargets;
var string LastReason;
var int ShotCount;
var vector LastShotStart;
var rotator LastShotAim;
var string LastShotTargetLabel,CurrentTargetLabel;
var float LastShotTime;
var bool bObservedState, bReportedTimeActive, bReportedGUIActive;
var Pawn ReportedTarget;

static function LocalAimInteraction Find(PlayerController PC)
{
    local int i;
    if (PC == None || PC.Player == None) return None;
    for (i=0; i<PC.Player.LocalInteractions.Length; i++)
        if (LocalAimInteraction(PC.Player.LocalInteractions[i]) != None)
            return LocalAimInteraction(PC.Player.LocalInteractions[i]);
    return None;
}

function PlayerController OwnerPC()
{
    if (ViewportOwner == None) return None;
    return ViewportOwner.Actor;
}

function bool NativeGUIActive(PlayerController PC)
{
    if(PC==None || PC.Player==None)return false;
    return (PC.Player.GUIController!=None && PC.Player.GUIController.bActive)
        || (PC.Player.Console!=None && PC.Player.Console.bTyping);
}

function bool Allowed(PlayerController PC)
{
    if (PC == None || PC.bDeleteMe || PC.Level==None || PC.Level.NetMode != NM_Standalone || PC.Player == None
        || PC.Player.Actor!=PC || PC.Pawn == None || !PC.Pawn.IsA('Pawn') || PC.Pawn.bDeleteMe
        || PC.Pawn.Level!=PC.Level || PC.Pawn.Controller!=PC || PC.Pawn.Health <= 0) return false;
    if (PC.IsInState('GameEnded') || PC.IsInState('Spectating')) return false;
    if (PC.Player.GUIController != None && PC.Player.GUIController.bActive) return false;
    if (PC.Player.Console != None && PC.Player.Console.bTyping) return false;
    return true;
}

function bool Enemy(Pawn Candidate)
{
    local PlayerController PC;
    local Controller C;
    local Pawn P;
    local int Team;
    PC=OwnerPC();
    if(!Allowed(PC) || Candidate==None)return false;
    // Compare the held pointer against freshly owned pawns before reading its layout.
    for(C=PC.Level.ControllerList;C!=None;C=C.NextController)
    {
        if(!C.bDeleteMe && C.Level==PC.Level && C.Pawn==Candidate)
        {P=C.Pawn;break;}
    }
    if(P==None || !P.IsA('Pawn') || P==PC.Pawn || P.bDeleteMe || P.Level!=PC.Level
        || P.Health<=0 || P.bHidden || P.Controller!=C)return false;
    if(PC.Level.Game!=None && PC.Level.Game.bTeamGame)
    {
        Team=PC.Pawn.GetTeamNum();
        if(Team!=255 && Team==P.GetTeamNum())return false;
    }
    return true;
}

function vector BodyPoint(Pawn P)
{
    return P.Location + vect(0,0,1) * P.CollisionHeight * 0.35;
}

function bool ClearRay(vector Start, vector End, Pawn P)
{
    local vector HitLocation, HitNormal;
    local Actor Hit;
    local PlayerController PC;
    PC = OwnerPC();
    if (!Allowed(PC)) return false;
    Hit = PC.Pawn.Trace(HitLocation,HitNormal,End,Start,true);
    return Hit == None || Hit == P;
}

// Pure scalar view estimate: NEVER call native PlayerCalcView from firing/view
// overrides. Native projection/camera queries are confined to PostRender.
function ActualView(out vector Location,out rotator View)
{
    local PlayerController PC;
    PC=OwnerPC();
    if(PC==None || PC.Pawn==None)return;
    if(bRenderedView && RenderPawn==PC.Pawn)
    {
        Location=CameraLocation+(PC.Pawn.Location-RenderPawnLocation);
        View=Normalize(CameraRotation+(PC.Rotation-RenderControlRotation));
    }
    else
    {
        Location=PC.Pawn.Location+PC.Pawn.EyePosition();
        View=PC.Rotation;
    }
}

function bool InCone(vector Point)
{
    local PlayerController PC;
    local vector X,Y,Z,D,ViewLocation;
    local rotator ViewRotation;
    local float Depth,TanH,TanV;
    PC=OwnerPC();
    if (!Allowed(PC) || Width<1 || Height<1)return false;
    ActualView(ViewLocation,ViewRotation);
    D=Point-ViewLocation;GetAxes(ViewRotation,X,Y,Z);Depth=D Dot X;
    if(Depth<=1)return false;
    TanH=Tan(FClamp(PC.FOVAngle,5,175)*Pi/360);TanV=TanH*Height/Width;
    return Abs(D Dot Y)<=Depth*TanH && Abs(D Dot Z)<=Depth*TanV;
}

function bool Visible(Pawn P, out vector Point)
{
    local PlayerController PC;
    local vector Eye,ViewLocation;
    local rotator ViewRotation;
    PC = OwnerPC();
    if (!Enemy(P)) return false;
    Eye = PC.Pawn.Location + PC.Pawn.EyePosition();
    ActualView(ViewLocation,ViewRotation);
    Point = BodyPoint(P);
    if (InCone(Point) && ClearRay(ViewLocation,Point,P) && ClearRay(Eye,Point,P)) return true;
    Point = P.Location + vect(0,0,1)*P.CollisionHeight*0.8;
    return InCone(Point) && ClearRay(ViewLocation,Point,P) && ClearRay(Eye,Point,P);
}

// Only ordinary script Tick/PostRender code refreshes this snapshot.
function InvalidateAimSnapshot()
{
    bAimSnapshot=false;AimSnapshotPawn=None;AimSnapshotTarget=None;
}

function CacheValidatedAim(vector Point)
{
    local PlayerController PC;
    PC=OwnerPC();InvalidateAimSnapshot();
    if(!Allowed(PC) || !Enemy(CurrentTarget))return;
    AimSnapshotPawn=PC.Pawn;AimSnapshotTarget=CurrentTarget;AimSnapshotPoint=Point;
    AimSnapshotEyeOffset=PC.Pawn.EyePosition();AimSnapshotPawnLocation=PC.Pawn.Location;
    ActualView(AimSnapshotCameraLocation,AimSnapshotCameraRotation);
    AimSnapshotControlRotation=PC.Rotation;AimSnapshotTime=PC.Level.TimeSeconds;
    AimSnapshotBehind=PC.bBehindView;bAimSnapshot=true;
}

// Render/mesh accessors may call this while native collision/render code is active.
// Keep it to cached scalars, object identity/type checks and pure vector math.
function bool CachedViewAim(out rotator Aim)
{
    local PlayerController PC;
    local Pawn Target;
    local vector Location,D,X,Y,Z;
    local rotator View;
    local float Depth,TanH,TanV;
    PC=OwnerPC();Target=AimSnapshotTarget;
    if(!bAimSnapshot || PC==None || PC.bDeleteMe || PC.Level==None || PC.Player==None
        || PC.Level.NetMode!=NM_Standalone || PC.Player.Actor!=PC || PC.Pawn==None
        || !PC.Pawn.IsA('Pawn') || PC.Pawn.bDeleteMe || PC.Pawn!=AimSnapshotPawn
        || PC.Pawn.Level!=PC.Level || PC.Pawn.Controller!=PC || PC.Pawn.Health<=0
        || Target==None || Target!=CurrentTarget
        || PC.bBehindView!=AimSnapshotBehind || PC.Level.TimeSeconds<AimSnapshotTime
        || PC.Level.TimeSeconds-AimSnapshotTime>0.15 || Width<1 || Height<1)return false;
    if(PC.Player.GUIController!=None && PC.Player.GUIController.bActive)return false;
    if(PC.Player.Console!=None && PC.Player.Console.bTyping)return false;
    Location=AimSnapshotCameraLocation+(PC.Pawn.Location-AimSnapshotPawnLocation);
    View=Normalize(AimSnapshotCameraRotation+(PC.Rotation-AimSnapshotControlRotation));
    D=AimSnapshotPoint-Location;GetAxes(View,X,Y,Z);Depth=D Dot X;
    if(Depth<=1)return false;
    TanH=Tan(FClamp(PC.FOVAngle,5,175)*Pi/360);TanV=TanH*Height/Width;
    if(Abs(D Dot Y)>Depth*TanH || Abs(D Dot Z)>Depth*TanV)return false;
    Aim=rotator(AimSnapshotPoint-(PC.Pawn.Location+AimSnapshotEyeOffset));Aim.Roll=PC.Rotation.Roll;
    return true;
}

function Release(string Reason)
{
    local PlayerController PC;
    local string PreviousLabel;
    InvalidateAimSnapshot();PreviousLabel=CurrentTargetLabel;CurrentTarget=None;ManualTarget=None;CurrentTargetLabel="None";
    PC=OwnerPC();
    // Invalidate first: pose restoration can call view-related native code.
    if(PC!=None && PC.Pawn!=None && PC.Pawn.IsA('Pawn') && !PC.Pawn.bDeleteMe
        && PC.Pawn.Level==PC.Level && PC.Pawn.Controller==PC && PC.Pawn.Health>0
        && !PC.IsInState('MMRolling') && !PC.IsInState('MMWallrun'))
    {
        PC.Pawn.FaceRotation(PC.Rotation,0);
        PC.Pawn.SetViewPitch(PC.Rotation.Pitch);
    }
    if(PreviousLabel!="" && PreviousLabel!="None")Log("MMAIM_RELEASE target=" $ PreviousLabel $ " reason=" $ Reason);
    LastReason=Reason;RestoreCrosshair();
}

function RestoreCrosshair()
{
    local PlayerController PC;
    PC=OwnerPC();
    if(bSavedCrosshair && PC!=None && SavedHUD!=None && PC.MyHUD==SavedHUD
        && SavedHUD.IsA('HUD') && !SavedHUD.bDeleteMe && SavedHUD.Level==PC.Level)
        SavedHUD.bCrosshairShow=OriginalCrosshair;
    bSavedCrosshair=false;SavedHUD=None;
}

function Tick(float DeltaTime)
{
    local PlayerController PC;
    local vector Point;
    local rotator BodyRotation;
    local LocalAimMatrixPlayer MP;
    local bool TimeActive,GUIActive;
    PC = OwnerPC();
    MP=LocalAimMatrixPlayer(PC);
    GUIActive=NativeGUIActive(PC);
    if(MP!=None){MP.MaintainAdrenaline();TimeActive=MP.Activated;}
    if(PC!=None && PC.Level.NetMode==NM_Standalone
        && (!bObservedState || bReportedTimeActive!=TimeActive || bReportedGUIActive!=GUIActive || ReportedTarget!=CurrentTarget))
    {
        bObservedState=true;bReportedTimeActive=TimeActive;bReportedGUIActive=GUIActive;ReportedTarget=CurrentTarget;
        Status();
    }
    if (!Allowed(PC))
    {
        if (CurrentTarget != None) Release("owner-unavailable");
        else RestoreCrosshair();
        InvalidateAimSnapshot();FrameTargets.Length=0;
        return;
    }
    if (LastPawn != PC.Pawn)
    {
        Release("owner-replaced");
        LastPawn = PC.Pawn;
        PC.ClientSetBehindView(bThirdPerson);bRenderedView=false;IncomingHits.Length=0;
        FrameTargets.Length = 0;
    }
    UpdateCamera(PC);
    if(CurrentTarget!=None)
    {
        if(Visible(CurrentTarget,Point))CacheValidatedAim(Point);
        else Release("not-visible-in-viewport");
    }
    else InvalidateAimSnapshot();
    // In third person the world body/gun faces its firing point; camera Rotation
    // remains entirely user-controlled. Original acrobatic states own body roll.
    if(PC.bBehindView && CurrentTarget!=None && !PC.IsInState('MMRolling') && !PC.IsInState('MMWallrun')
        && Visible(CurrentTarget,Point))
    {
        BodyRotation=rotator(Point-(PC.Pawn.Location+PC.Pawn.EyePosition()));
        BodyRotation.Roll=PC.Pawn.Rotation.Roll;
        PC.Pawn.FaceRotation(BodyRotation,DeltaTime);
        PC.Pawn.SetViewPitch(BodyRotation.Pitch);
    }
}

function bool FireAim(vector Start,out rotator Aim)
{
    local PlayerController PC;
    local Pawn Target;
    local vector Point;
    local bool Result;
    if(bComputingAim)return false;
    bComputingAim=true;PC=OwnerPC();Target=CurrentTarget;
    if(Allowed(PC) && Target!=None && Visible(Target,Point) && ClearRay(Start,Point,Target))
    {
        // Native traces may invoke other engine work; prove the pair again afterward.
        if(Target==CurrentTarget && Enemy(Target))
        {Aim=rotator(Point-Start);Aim.Roll=PC.Rotation.Roll;Result=true;}
    }
    bComputingAim=false;return Result;
}

function bool CameraAim(vector Start,rotator BaseAim,out rotator Aim)
{
    local PlayerController PC;
    local vector ViewLocation,End,HitLocation,HitNormal;
    local rotator ViewRotation,Adjustment;
    local Actor Hit;
    if(bComputingAim)return false;
    bComputingAim=true;PC=OwnerPC();
    if(!Allowed(PC) || !PC.bBehindView){bComputingAim=false;return false;}
    ActualView(ViewLocation,ViewRotation);
    Adjustment=Normalize(BaseAim-PC.Rotation);
    End=ViewLocation+vector(ViewRotation+Adjustment)*20000;
    Hit=PC.Pawn.Trace(HitLocation,HitNormal,End,ViewLocation,true);
    if(Hit!=None)End=HitLocation;
    Aim=rotator(End-Start);Aim.Roll=PC.Rotation.Roll;
    bComputingAim=false;return true;
}

function NeutralReticle(Canvas C)
{
    local PlayerController PC;
    local color OldColor;
    local float OldX,OldY;
    PC=OwnerPC();
    if(!Allowed(PC) || !PC.bBehindView || !bMarkTarget || PC.MyHUD==None || !PC.MyHUD.IsA('HUD') || PC.MyHUD.bDeleteMe
        || PC.MyHUD.Level!=PC.Level || !PC.MyHUD.bCrosshairShow)return;
    OldColor=C.DrawColor;OldX=C.CurX;OldY=C.CurY;
    C.SetDrawColor(220,220,220,180);
    C.SetPos(Width*0.5-6,Height*0.5-1);C.DrawTile(Texture'Engine.WhiteSquareTexture',12,2,0,0,2,2);
    C.SetPos(Width*0.5-1,Height*0.5-6);C.DrawTile(Texture'Engine.WhiteSquareTexture',2,12,0,0,2,2);
    C.SetPos(OldX,OldY);C.DrawColor=OldColor;
}

function NoteShot(vector Start,rotator Aim)
{
    local PlayerController PC;
    PC=OwnerPC();
    ShotCount++;
    LastShotStart=Start;LastShotAim=Aim;LastShotTargetLabel=CurrentTargetLabel;
    if(PC!=None)LastShotTime=PC.Level.TimeSeconds;
}

function SelectNormalized(float NX, float NY)
{
    local PlayerController PC;
    local int i;
    local float X,Y,DX,DY,Distance,Best,Tolerance;
    local Pawn Pick;
    local vector Point;
    PC = OwnerPC();
    if (!Allowed(PC) || Width<1 || Height<1 || PC.Level.TimeSeconds-FrameTime>0.5)
    {
        LastReason="no-rendered-frame"; Status(); return;
    }
    X=NX*Width;Y=NY*Height;Best=1000000000;
    Tolerance=FMax(24,Width*0.035);
    // Resolve against the LAST rendered positions, not a future auto-aim frame.
    for(i=0;i<FrameTargets.Length;i++)
    {
        if (!Visible(FrameTargets[i].Target,Point)) continue;
        DX=FMax(0,Abs(X-FrameTargets[i].Center.X)-FrameTargets[i].HalfWidth);
        DY=FMax(0,Abs(Y-FrameTargets[i].Center.Y)-FrameTargets[i].HalfHeight);
        if (DX*DX+DY*DY>Tolerance*Tolerance) continue;
        Distance=Square(X-FrameTargets[i].Screen.X)+Square(Y-FrameTargets[i].Screen.Y);
        if (Distance<Best){Best=Distance;Pick=FrameTargets[i].Target;}
    }
    InvalidateAimSnapshot();ManualTarget=Pick;CurrentTarget=Pick;
    CurrentTargetLabel="None";
    if(Pick!=None && Enemy(Pick))CurrentTargetLabel=string(Pick);
    if(Pick==None) LastReason="no-target-at-tap";
    else LastReason="manual-selected";
    Status();
}

function SetCamera(bool Behind)
{
    local PlayerController PC;
    InvalidateAimSnapshot();PC=OwnerPC();bThirdPerson=Behind;
    if(PC!=None){PC.ClientSetBehindView(Behind);PC.LastPlayerCalcView=-1;}
    bRenderedView=false;FrameTargets.Length=0;LastReason="camera-setting";Status();
}

function SetAutomatic(bool Enabled)
{
    InvalidateAimSnapshot();bAutoAim=Enabled;
    if (!Enabled && ManualTarget==None) Release("auto-off");
    LastReason="auto-setting";Status();
}

function ClearSelected()
{
    Release("manual-cleared");Status();
}

function vector LastRenderedTargetScreen()
{
    local int i;
    for(i=0;i<FrameTargets.Length;i++)if(FrameTargets[i].Target==CurrentTarget)return FrameTargets[i].Screen;
    return vect(0,0,0);
}

function UpdateCamera(PlayerController PC)
{
    local MatrixPawn MP;
    local bool Temporary,Wanted;
    MP=MatrixPawn(PC.Pawn);
    Temporary=PC.IsInState('MMWallrun');
    if(PC.IsInState('MMRolling') && MP!=None)
        Temporary=Temporary || MP.CurrentDir==DCLICK_Left || MP.CurrentDir==DCLICK_Right
            || (LocalAimMatrixPlayer(PC)!=None && LocalAimMatrixPlayer(PC).bFlipOffWall);
    bTemporaryThirdPerson=Temporary;Wanted=bThirdPerson || Temporary;
    if(PC.bBehindView!=Wanted)
    {
        InvalidateAimSnapshot();PC.ClientSetBehindView(Wanted);PC.LastPlayerCalcView=-1;bRenderedView=false;
        Log("MMMATRIX_CAMERA thirdperson=" $ int(Wanted) $ " temporary=" $ int(Temporary) $ " preferredThird=" $ int(bThirdPerson));
    }
}

function RecordIncoming(Pawn Attacker,vector HitLocation,int Damage,vector Momentum)
{
    local PlayerController PC;
    local IncomingHit Hit;
    PC=OwnerPC();if(PC==None || PC.Pawn==None)return;
    if(Attacker!=None && Attacker!=PC.Pawn){Hit.Source=Attacker.Location;Hit.Known=true;}
    else if(VSize(Momentum)>1){Hit.Source=PC.Pawn.Location-Normal(Momentum)*500;Hit.Known=true;}
    Hit.Expires=PC.Level.TimeSeconds+1.5;
    if(IncomingHits.Length>=6)IncomingHits.Remove(0,1);
    IncomingHits[IncomingHits.Length]=Hit;
    Log("MMHUD_DAMAGE known=" $ int(Hit.Known) $ " source=" $ Hit.Source $ " damage=" $ Damage);
}

function DrawIncoming(Canvas C)
{
    local PlayerController PC;
    local vector Forward,Right,Up,D;
    local float DX,DY,A,Angle,Radius,Life;
    local int i,j;
    PC=OwnerPC();if(!Allowed(PC))return;
    GetAxes(CameraRotation,Forward,Right,Up);
    Radius=FMax(65,FMin(Width,Height)*0.18);
    for(i=IncomingHits.Length-1;i>=0;i--)
    {
        Life=IncomingHits[i].Expires-PC.Level.TimeSeconds;
        if(Life<=0){IncomingHits.Remove(i,1);continue;}
        D=Normal(IncomingHits[i].Source-PC.Pawn.Location);
        DX=D Dot Right;DY=-(D Dot Forward);
        Angle=Atan(DY,DX);
        C.SetDrawColor(255,75,25,byte(FClamp(Life/1.5*230,30,230)));
        for(j=-8;j<=8;j++)
        {
            if(IncomingHits[i].Known)A=Angle+j*0.035;
            else A=float(j+8)*2*Pi/17;
            C.SetPos(Width*0.5+Cos(A)*Radius-3,Height*0.5+Sin(A)*Radius-3);
            C.DrawTile(Texture'Engine.WhiteSquareTexture',6,6,0,0,2,2);
        }
    }
}

function Status()
{
    local PlayerController PC;
    local rotator Aim;
    local vector Point,Screen;
    local int Health,LOS,TimeActive,Physics,ViewPitch;
    local rotator BodyRotation;
    local LocalAimMatrixPlayer MP;
    PC=OwnerPC();
    if(PC==None || PC.Level.NetMode!=NM_Standalone) return;
    Aim=PC.Rotation;
    MP=LocalAimMatrixPlayer(PC);
    if(MP!=None)TimeActive=int(MP.Activated);
    if(PC.Pawn!=None && PC.Pawn.IsA('Pawn') && !PC.Pawn.bDeleteMe
        && PC.Pawn.Level==PC.Level && PC.Pawn.Controller==PC)
    {Physics=PC.Pawn.Physics;ViewPitch=PC.Pawn.ViewPitch;BodyRotation=PC.Pawn.Rotation;}
    if(CurrentTarget!=None && Enemy(CurrentTarget))
    {
        Health=CurrentTarget.Health;
        if(Visible(CurrentTarget,Point)) LOS=1;
        if(PC.Pawn!=None) FireAim(PC.Pawn.Location+PC.Pawn.EyePosition(),Aim);
        Screen=LastRenderedTargetScreen();
    }
    Log("MMAIM_STATUS standalone=1 guiActive=" $ int(NativeGUIActive(PC)) $ " auto=" $ int(bAutoAim)
        $ " manual=" $ int(ManualTarget!=None) $ " target=" $ CurrentTargetLabel
        $ " health=" $ Health $ " view=" $ PC.Rotation $ " aim=" $ Aim
        $ " pawn=" $ PC.Pawn $ " screen=" $ Screen.X/ FMax(1,Width) $ "," $ Screen.Y/FMax(1,Height)
        $ " preferredThird=" $ int(bThirdPerson) $ " temporaryThird=" $ int(bTemporaryThirdPerson) $ " unlimitedAdrenaline=" $ int(MP!=None)
        $ " thirdperson=" $ int(PC.bBehindView) $ " wallrun=" $ int(bAutoWallrun) $ " timeToggle=" $ int(bTimeToggle)
        $ " timeNative=" $ int(MP!=None) $ " timeActive=" $ TimeActive $ " adrenaline=" $ PC.Adrenaline $ " timeSpeed=" $ PC.Level.Game.GameSpeed
        $ " state=" $ PC.GetStateName() $ " physics=" $ Physics $ " body=" $ BodyRotation $ " viewPitch=" $ ViewPitch
        $ " viewport=" $ Width $ "," $ Height $ " los=" $ LOS $ " reason=" $ LastReason
        $ " shotCount=" $ ShotCount $ " shotAim=" $ LastShotAim $ " shotStart=" $ LastShotStart
        $ " shotTarget=" $ LastShotTargetLabel $ " shotTime=" $ LastShotTime);
}

function PostRender(Canvas C)
{
    local PlayerController PC;
    local Pawn P,Pick;
    local Controller Scan;
    local vector Point,Screen,Center,X,Y,Z,D;
    local float Score,Best,Depth,TanH;
    local int i,Index;
    local float Radius,Angle;
    local color OldColor;
    local float OldX,OldY;
    local string StageMap,StageLevelName;
    local int StageDot;
    PC=OwnerPC();
    // Rendering evidence also applies before a player owns a pawn (Fire to join).
    if(PC!=None && PC.Level!=None && C!=None && C.ClipX>0 && C.ClipY>0)
    {
        StageLevelName=string(PC.Level);
        if(StageRenderLevelName!=StageLevelName || PC.Level.TimeSeconds<StageRenderTime)
        {StageRenderLevelName=StageLevelName;bStageRendered=false;}
        StageRenderTime=PC.Level.TimeSeconds;
        if(!bStageRendered)
        {
            StageMap=StageLevelName;StageDot=InStr(StageMap,".");
            if(StageDot>=0)StageMap=Left(StageMap,StageDot);
            if(StageMap!="" && Caps(StageMap)!="ENTRY" && Caps(StageMap)!="NONE")
            {bStageRendered=true;Log("COLLECTION_STAGE_RENDERED map=" $ StageMap);}
        }
    }
    if(!Allowed(PC)){InvalidateAimSnapshot();RestoreCrosshair();return;}
    Width=C.ClipX;Height=C.ClipY;
    C.GetCameraLocation(CameraLocation,CameraRotation);
    RenderPawn=PC.Pawn;RenderPawnLocation=PC.Pawn.Location;RenderControlRotation=PC.Rotation;bRenderedView=true;
    FrameTime=PC.Level.TimeSeconds;
    FrameTargets.Length=0;
    OldColor=C.DrawColor;OldX=C.CurX;OldY=C.CurY;DrawIncoming(C);C.DrawColor=OldColor;C.SetPos(OldX,OldY);
    GetAxes(CameraRotation,X,Y,Z);
    TanH=Tan(FClamp(PC.FOVAngle,5,175)*Pi/360);
    Best=1000000000;
    for(Scan=PC.Level.ControllerList;Scan!=None;Scan=Scan.NextController)
    {
        P=Scan.Pawn;
        if(!Visible(P,Point)) continue;
        Screen=C.WorldToScreen(Point);
        if(Screen.X<0 || Screen.Y<0 || Screen.X>Width || Screen.Y>Height) continue;
        Center=C.WorldToScreen(P.Location);
        D=Point-CameraLocation;Depth=FMax(1,D Dot X);
        Index=FrameTargets.Length;FrameTargets.Length=Index+1;
        FrameTargets[Index].Target=P;FrameTargets[Index].Screen=Screen;FrameTargets[Index].Center=Center;
        FrameTargets[Index].HalfWidth=FMax(8,P.CollisionRadius*Width/(2*Depth*TanH));
        FrameTargets[Index].HalfHeight=FMax(12,P.CollisionHeight*Width/(2*Depth*TanH));
        Score=Square(Screen.X/Width-0.5)+Square(Screen.Y/Height-0.5);
        if(Score<Best){Best=Score;Pick=P;}
    }
    if(CurrentTarget!=None)
    {
        Index=-1;
        for(i=0;i<FrameTargets.Length;i++) if(FrameTargets[i].Target==CurrentTarget) Index=i;
        if(Index<0) Release("projected-outside-or-occluded");
    }
    if(CurrentTarget==None && bAutoAim && Pick!=None)
    {
        CurrentTarget=Pick;CurrentTargetLabel=string(Pick);LastReason="auto-acquired";
        Log("MMAIM_ACQUIRE target=" $ Pick $ " manual=0");
    }
    if(CurrentTarget==None){InvalidateAimSnapshot();RestoreCrosshair();NeutralReticle(C);return;}
    if(!Visible(CurrentTarget,Point)){Release("not-visible-in-render");return;}
    CacheValidatedAim(Point);
    if(bSavedCrosshair && SavedHUD!=PC.MyHUD)RestoreCrosshair();
    if(PC.MyHUD!=None && PC.MyHUD.IsA('HUD') && !PC.MyHUD.bDeleteMe
        && PC.MyHUD.Level==PC.Level && !bSavedCrosshair)
    {
        SavedHUD=PC.MyHUD;OriginalCrosshair=SavedHUD.bCrosshairShow;
        SavedHUD.bCrosshairShow=false;bSavedCrosshair=true;
    }
    if(!bMarkTarget)return;
    Screen=C.WorldToScreen(Point);
    OldColor=C.DrawColor;OldX=C.CurX;OldY=C.CurY;
    C.SetDrawColor(255,25,25,255);
    Radius=FClamp(FMin(Width,Height)*0.04,22,36);
    for(i=0;i<64;i++)
    {
        Angle=i*2*Pi/64;
        C.SetPos(Screen.X+Cos(Angle)*Radius-2,Screen.Y+Sin(Angle)*Radius-2);
        C.DrawTile(Texture'Engine.WhiteSquareTexture',4,4,0,0,2,2);
    }
    C.SetPos(Screen.X-2,Screen.Y-2);C.DrawTile(Texture'Engine.WhiteSquareTexture',4,4,0,0,2,2);
    C.SetPos(OldX,OldY);C.DrawColor=OldColor;
}

event NotifyLevelChange()
{
    InvalidateAimSnapshot();RestoreCrosshair();CurrentTarget=None;ManualTarget=None;
    LastPawn=None;RenderPawn=None;ReportedTarget=None;LastShotTargetLabel="None";CurrentTargetLabel="None";FrameTargets.Length=0;bRenderedView=false;
    if(Master!=None)Master.RemoveInteraction(Self);
}

defaultproperties
{
    CurrentTargetLabel="None"
    LastShotTargetLabel="None"
    bAutoAim=True
    bMarkTarget=True
    bThirdPerson=False
    bAutoWallrun=True
    bTimeToggle=True
    bActive=False
    bVisible=True
    bRequiresTick=True
    LastReason="ready"
}
