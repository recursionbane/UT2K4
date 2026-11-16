// Experimental menu-only warmup deferral. All inherited controller behavior remains.
class DeferredPlayerRecordsController extends GUI2K4.UT2K4GUIController;
function PrecachePlayerRecords()
{
    Log("DEFERRED_PLAYER_RECORDS warmup=skipped");
}
