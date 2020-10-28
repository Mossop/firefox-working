## nsBrowserApp.cpp main

1. -> DllBlocklist_Initialize
2. -> InitXPCOMGlue
3. -> do_main
4. -> DllBlocklist_Shutdown

## nsBrowserApp.cpp InitXPCOMGlue

Responsible for loading libXUL into memory.

## nsBrowserApp.cpp do_main

1. if "-xpcshell"
   1. -> XRE_XPCShellMain
2. else
   1. -> XREMain::XRE_main

## XREMain::XRE_main

1. Load XREAppData if "-app"
2. -> XREMain::XRE_mainInit
3. -> XREMain::XRE_mainStartup
4. -> NS_InitXPCOM
5. -> XREMain::XRE_mainRun
6. -> nsRemoteService::ShutdownServer
7. -> nsXREDirProvider::DoShutdown
8. -> NS_ShutdownXPCOM
9. Unlock profile directory.
10. If restarting re-launch Firefox.

## XREMain::XRE_mainInit

1. if "-override" load XREAppData overrides from the given file.
2. -> nsXREDirProvider::Initialize
3. Initialize crash reporter
4. -> SetupMacApplicationDelegate
5. Check for safe mode
6. Check whether remoting should be enabled
7. Check for offline requested
8. Handle --help, --full-version and --version command line arguments.
9. -> CommandLine::Init

## XREMain::XRE_mainStartup

1. If not headless:
   1. Init X11
   2. Init GDK
2. Initialize nsRemoteService
3. -> nsRemoteService::LockStartup
4. -> NS_CreateNativeAppSupport
5. -> nsINativeAppSupport::Start
6. -> SelectProfile
7. -> nsRemoteService::StartClient
8. If existing instance found:
   1. nsRemoteService::UnlockStartup
   2. Exit
9. -> ProcessUpdates
10. If needed:
   1. -> ShowProfileManager
11. -> LockProfile
12. If doing a profile reset:
   1. Unlock profile directory
   2. -> nsToolkitProfileService::CreateResetProfile
   3. -> LockProfile
13. -> CheckCompatibility
14. -> nsXREDirProvider::SetProfile
14. Purge startup caches as needed.

## XREMain::XRE_mainRun

1. If performing profile migration
   1. -> nsIProfileMigrator->Migrate
   2. If performing profile reset:
      1. ->  ProfileResetCleanup
2. -> nsXREDirProvider::InitializeUserPrefs
3. Initialize JS
4. -> nsXREDirProvider::FinishInitializingUserPrefs
5. Notify "app-startup" observers.
6. -> nsXREDirProvider::DoStartup
7. -> nsCommandLine::Init
8. Notify "command-line-startup" observers
9. Create hidden window if needed.
10. Notify "final-ui-startup" observers
11. -> nsCommandLine::Run
12. -> nsRemoteService::StartupServer
13. -> nsRemoteService::UnlockStartup
14. -> nsToolkitProfileService::CompleteStartup
15. -> nsAppStartup::Run

## NS_InitXPCOM

Initializes much of the XPCOM static values and singletons.

1. Notify "xpcom-startup" observers

## NS_ShutdownXPCOM

1. Notify "xpcom-will-shutdown" observers
2. Notify "xpcom-shutdown" observers
3. Notify "xpcom-shutdown-threads" observers

## nsXREDirProvider::DoStartup

1. Begin tracking for a startup crash
2. Notify "profile-do-change" observers
3. Initialize enterprise policies
4. Startup add-ons manager
5. Notify "profile-after-change" observers
6. Notify "profile-initial-state" observers

## nsXREDirProvider::DoShutdown

1. Notify "profile-change-net-teardown" observers
2. Notify "profile-change-teardown" observers
3. Notify "profile-before-change" observers
4. Notify "profile-before-change-qm" observers
5. Notify "profile-before-change-telemetry" observers
