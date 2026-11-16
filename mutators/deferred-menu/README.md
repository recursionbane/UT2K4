# Deferred player records

`DeferredMenu.DeferredPlayerRecordsController` inherits the stock UT2004 GUI controller and skips its eager `PrecachePlayerRecords` call. Character portraits and models load when the player settings screen needs them. Custom controllers supplied by total conversions are preserved.

The collection startup profile selects this controller only when the existing controller is `GUI2K4.UT2K4GUIController`. Two native cold-menu comparisons reduced transferred bytes from approximately 149.9 MB to 128.7 MB. Player settings, portrait/model selection, and a Rankin match were exercised separately. These measurements precede the modern asset codec profile and must not be added to its savings.

The package and its authored source are included. Rebuild with `tools/build-assist.py` using a matching user-supplied compiler and game dependencies.
